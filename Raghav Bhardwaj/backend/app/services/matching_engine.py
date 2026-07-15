"""
Advanced Reconciliation Matching Engine
========================================
Replaces the single-pass key-lookup with a 4-phase pipeline:

Phase 1 – Candidate Generation
    For every source record, collect ALL target records within
    configurable amount tolerance + date window.

Phase 2 – Holistic Scoring
    Score each candidate pair across ALL fields simultaneously:
    amount proximity, date proximity, reference fuzzy similarity,
    description similarity, entity/account exact match.

Phase 3 – Group Resolution
    After 1:1 matching, detect:
      • many-to-one  : one source = sum of multiple targets
      • one-to-many  : one target = sum of multiple sources
      • split        : detected by amount-sum equality within tolerance
      • cross-period : unmatched records from prior periods that settle current ones

Phase 4 – AI-Style Ranking
    For still-unmatched items, rank remaining candidates by a
    composite score and surface top suggestions without forcing a match.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, date, timedelta
from typing import List, Optional, Dict, Tuple, Set

from rapidfuzz import fuzz
from sqlalchemy.orm import Session

from ..models.models import (
    ReconciliationProfile,
    ReconciliationRecord,
)
from ..enterprise import repository
from ..services import audit_service


# ── Weights for holistic score ────────────────────────────────
W_AMOUNT    = 0.40
W_DATE      = 0.20
W_REFERENCE = 0.25
W_DESC      = 0.10
W_ENTITY    = 0.05

STATUS_RECONCILED   = "RECONCILED"
STATUS_PARTIAL      = "PARTIAL_MATCH"
STATUS_UNMATCHED    = "UNMATCHED"
STATUS_VALIDATED    = "VALIDATED"


# ── Helpers ───────────────────────────────────────────────────

def _parse_date(s) -> Optional[date]:
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y%m%d"):
        try:
            return datetime.strptime(str(s).strip(), fmt).date()
        except ValueError:
            continue
    return None


def _amount_score(a: float, b: float, tolerance: float) -> float:
    """1.0 for exact, decays linearly to 0 at 2× tolerance."""
    diff = abs(a - b)
    if diff == 0:
        return 1.0
    if tolerance <= 0:
        return 0.0
    return max(0.0, 1.0 - diff / (2.0 * tolerance))


def _date_score(d1: Optional[date], d2: Optional[date], window: int) -> float:
    """1.0 for same date, decays to 0 at window+1 days."""
    if d1 is None or d2 is None:
        return 0.5          # unknown → neutral
    diff = abs((d1 - d2).days)
    if diff == 0:
        return 1.0
    if window <= 0:
        return 0.0
    return max(0.0, 1.0 - diff / (window + 1))


def _ref_score(r1: str, r2: str) -> float:
    if not r1 or not r2:
        return 0.0
    return fuzz.token_sort_ratio(r1, r2) / 100.0


def _desc_score(d1: str, d2: str) -> float:
    if not d1 or not d2:
        return 0.5
    return fuzz.partial_ratio(d1, d2) / 100.0


def _entity_score(e1: str, e2: str) -> float:
    if not e1 or not e2:
        return 0.5
    return 1.0 if e1.strip().upper() == e2.strip().upper() else 0.0


def holistic_score(
    src: "RecordView",
    tgt: "RecordView",
    tolerance: float,
    date_window: int,
) -> float:
    """Composite score across all dimensions, 0.0 – 1.0."""
    s_amt  = _amount_score(src.amount, tgt.amount, tolerance)
    s_date = _date_score(src.tx_date, tgt.tx_date, date_window)
    s_ref  = _ref_score(src.reference, tgt.reference)
    s_desc = _desc_score(src.description, tgt.description)
    s_ent  = _entity_score(src.entity, tgt.entity)
    return (
        W_AMOUNT    * s_amt  +
        W_DATE      * s_date +
        W_REFERENCE * s_ref  +
        W_DESC      * s_desc +
        W_ENTITY    * s_ent
    )


# ── Lightweight view of a ReconciliationRecord ───────────────

@dataclass
class RecordView:
    id:          int
    amount:      float
    tx_date:     Optional[date]
    reference:   str
    description: str
    entity:      str
    account:     str
    period:      str
    source_system: str
    currency:    str

    @staticmethod
    def from_orm(r: ReconciliationRecord) -> "RecordView":
        payload: dict = {}
        if r.payload_json:
            try:
                payload = json.loads(r.payload_json)
            except Exception:
                pass
        return RecordView(
            id           = r.id,
            amount       = float(r.amount or 0),
            tx_date      = _parse_date(r.tx_date),
            reference    = str(r.reference or ""),
            description  = str(payload.get("description") or payload.get("desc") or ""),
            entity       = str(r.entity or ""),
            account      = str(r.account or ""),
            period       = str(r.period or ""),
            source_system = str(r.source_system or ""),
            currency     = str(getattr(r, "currency", "USD") or "USD"),
        )


# ── Candidate pool with amount-bucketing for speed ──────────

class CandidateIndex:
    """
    Partitions records into amount buckets so candidate lookup is O(k)
    instead of O(n).  Bucket size = max(tolerance*2, 1).
    """
    def __init__(self, records: List[RecordView], tolerance: float):
        self.tolerance = max(abs(tolerance), 0.01)
        self.bucket_size = self.tolerance * 2 or 1.0
        self._buckets: Dict[int, List[RecordView]] = {}
        for r in records:
            for b in self._buckets_for(r.amount):
                self._buckets.setdefault(b, []).append(r)

    def _bucket_key(self, amount: float) -> int:
        return int(amount // self.bucket_size)

    def _buckets_for(self, amount: float) -> List[int]:
        k = self._bucket_key(amount)
        return [k - 1, k, k + 1]

    def candidates(self, amount: float) -> List[RecordView]:
        seen: Set[int] = set()
        result = []
        for b in self._buckets_for(amount):
            for r in self._buckets.get(b, []):
                if r.id not in seen:
                    seen.add(r.id)
                    result.append(r)
        return result


# ── Match result ──────────────────────────────────────────────

@dataclass
class MatchResult:
    source_ids:     List[int]
    target_ids:     List[int]
    score:          float
    classification: str          # FULL_MATCH / PARTIAL_MATCH / UNMATCHED
    strategy:       str          # exact / tolerance / fuzzy / many_to_one / one_to_many / cross_period
    variance:       float


# ── Main engine ───────────────────────────────────────────────

class AdvancedMatchingEngine:

    def __init__(
        self,
        profile: ReconciliationProfile,
        auto_match_threshold: float = 0.92,
        cross_period_days: int = 90,
    ):
        self.profile             = profile
        self.tolerance           = abs(float(profile.tolerance_threshold or 0))
        self.date_window         = max(int(profile.date_window_days or 0), 0)
        self.auto_threshold      = float(profile.auto_approve_threshold or auto_match_threshold)
        self.materiality_limit   = abs(float(profile.materiality_limit or 0))
        self.cross_period_days   = cross_period_days

    def _classify(self, score: float, variance: float) -> str:
        if self.materiality_limit and abs(variance) > self.materiality_limit:
            return "VARIANCE_FLAGGED"
        if score >= self.auto_threshold:
            return "FULL_MATCH"
        if score >= 0.5:
            return "PARTIAL_MATCH"
        return "UNMATCHED"

    # ── Phase 1: candidate generation ────────────────────────
    def _candidates(
        self,
        src: RecordView,
        tgt_index: CandidateIndex,
        consumed: Set[int],
    ) -> List[Tuple[RecordView, float]]:
        """Return (target_record, score) pairs above minimum threshold."""
        results = []
        for tgt in tgt_index.candidates(src.amount):
            if tgt.id in consumed:
                continue
            score = holistic_score(src, tgt, self.tolerance, self.date_window)
            if score >= 0.30:   # broad first pass
                results.append((tgt, score))
        results.sort(key=lambda x: -x[1])
        return results

    # ── Phase 2: 1:1 exact/holistic pass ─────────────────────
    def _one_to_one(
        self,
        sources: List[RecordView],
        targets: List[RecordView],
        consumed_src: Set[int],
        consumed_tgt: Set[int],
    ) -> List[MatchResult]:
        tgt_index = CandidateIndex(
            [t for t in targets if t.id not in consumed_tgt],
            self.tolerance,
        )
        results = []
        for src in sources:
            if src.id in consumed_src:
                continue
            cands = self._candidates(src, tgt_index, consumed_tgt)
            if not cands:
                continue
            best_tgt, best_score = cands[0]
            variance = src.amount - best_tgt.amount
            classification = self._classify(best_score, variance)
            if classification == "UNMATCHED":
                continue
            results.append(MatchResult(
                source_ids     = [src.id],
                target_ids     = [best_tgt.id],
                score          = best_score,
                classification = classification,
                strategy       = "exact" if abs(variance) < 0.001 else "tolerance",
                variance       = variance,
            ))
            consumed_src.add(src.id)
            consumed_tgt.add(best_tgt.id)
        return results

    # ── Phase 3a: many-to-one (multiple sources → one target) ─
    def _many_to_one(
        self,
        sources: List[RecordView],
        targets: List[RecordView],
        consumed_src: Set[int],
        consumed_tgt: Set[int],
        max_group: int = 4,
    ) -> List[MatchResult]:
        """Detect: source[$600] + source[$400] = target[$1000]"""
        results = []
        free_src = [s for s in sources if s.id not in consumed_src]
        free_tgt = [t for t in targets if t.id not in consumed_tgt]

        for tgt in free_tgt:
            if tgt.id in consumed_tgt:
                continue
            # Try combinations of 2..max_group sources that sum to target
            for combo_size in range(2, min(max_group + 1, len(free_src) + 1)):
                found = self._find_sum_combination(
                    [s for s in free_src if s.id not in consumed_src],
                    tgt.amount,
                    combo_size,
                )
                if found:
                    variance = sum(s.amount for s in found) - tgt.amount
                    # Holistic score: average of individual scores
                    avg_score = sum(
                        holistic_score(s, tgt, self.tolerance, self.date_window)
                        for s in found
                    ) / len(found)
                    classification = self._classify(avg_score, variance)
                    if classification == "UNMATCHED":
                        continue
                    results.append(MatchResult(
                        source_ids     = [s.id for s in found],
                        target_ids     = [tgt.id],
                        score          = avg_score,
                        classification = classification,
                        strategy       = "many_to_one",
                        variance       = variance,
                    ))
                    for s in found:
                        consumed_src.add(s.id)
                    consumed_tgt.add(tgt.id)
                    break
        return results

    # ── Phase 3b: one-to-many (one source → multiple targets) ─
    def _one_to_many(
        self,
        sources: List[RecordView],
        targets: List[RecordView],
        consumed_src: Set[int],
        consumed_tgt: Set[int],
        max_group: int = 4,
    ) -> List[MatchResult]:
        """Detect: source[$1000] = target[$600] + target[$400]"""
        results = []
        free_tgt = [t for t in targets if t.id not in consumed_tgt]

        for src in sources:
            if src.id in consumed_src:
                continue
            for combo_size in range(2, min(max_group + 1, len(free_tgt) + 1)):
                found = self._find_sum_combination(
                    [t for t in free_tgt if t.id not in consumed_tgt],
                    src.amount,
                    combo_size,
                )
                if found:
                    variance = src.amount - sum(t.amount for t in found)
                    avg_score = sum(
                        holistic_score(src, t, self.tolerance, self.date_window)
                        for t in found
                    ) / len(found)
                    classification = self._classify(avg_score, variance)
                    if classification == "UNMATCHED":
                        continue
                    results.append(MatchResult(
                        source_ids     = [src.id],
                        target_ids     = [t.id for t in found],
                        score          = avg_score,
                        classification = classification,
                        strategy       = "one_to_many",
                        variance       = variance,
                    ))
                    consumed_src.add(src.id)
                    for t in found:
                        consumed_tgt.add(t.id)
                    break
        return results

    # ── Phase 3c: cross-period matching ──────────────────────
    def _cross_period(
        self,
        unmatched_sources: List[RecordView],
        db: Session,
        consumed_src: Set[int],
        consumed_tgt: Set[int],
        profile_id: int,
    ) -> List[MatchResult]:
        """
        Look for prior-period unmatched targets that settle a current source.
        Queries ReconciliationRecord rows from other periods on the same profile.
        """
        from ..models.models import ReconciliationRecord as RR
        today = date.today()
        cutoff = today - timedelta(days=self.cross_period_days)

        prior_unmatched = (
            db.query(RR)
            .filter(
                RR.profile_id == profile_id,
                RR.status == STATUS_UNMATCHED,
                RR.id.notin_(list(consumed_tgt) or [0]),
            )
            .all()
        )
        prior_views = [RecordView.from_orm(r) for r in prior_unmatched]
        if not prior_views:
            return []

        tgt_index = CandidateIndex(prior_views, self.tolerance)
        results   = []
        for src in unmatched_sources:
            if src.id in consumed_src:
                continue
            cands = self._candidates(src, tgt_index, consumed_tgt)
            if not cands:
                continue
            best_tgt, best_score = cands[0]
            if best_score < 0.50:
                continue
            variance = src.amount - best_tgt.amount
            classification = self._classify(best_score, variance)
            if classification == "UNMATCHED":
                continue
            results.append(MatchResult(
                source_ids     = [src.id],
                target_ids     = [best_tgt.id],
                score          = best_score,
                classification = classification,
                strategy       = "cross_period",
                variance       = variance,
            ))
            consumed_src.add(src.id)
            consumed_tgt.add(best_tgt.id)
        return results

    # ── Helper: find N records that sum to target_amount ─────
    def _find_sum_combination(
        self,
        records: List[RecordView],
        target_amount: float,
        size: int,
    ) -> Optional[List[RecordView]]:
        """
        Greedy search for exactly `size` records whose amounts sum to
        target_amount within self.tolerance. Returns None if not found.
        """
        if len(records) < size:
            return None
        # Sort by descending amount to greedy-prune early
        sorted_recs = sorted(records, key=lambda r: -abs(r.amount))
        return self._combo_search(sorted_recs, target_amount, size, [], 0)

    def _combo_search(
        self,
        records: List[RecordView],
        target: float,
        remaining: int,
        current: List[RecordView],
        start_idx: int,
    ) -> Optional[List[RecordView]]:
        if remaining == 0:
            total = sum(r.amount for r in current)
            return current if abs(total - target) <= max(self.tolerance, 0.01) else None
        for i in range(start_idx, len(records) - remaining + 1):
            result = self._combo_search(
                records, target, remaining - 1,
                current + [records[i]], i + 1,
            )
            if result:
                return result
        return None

    # ── Phase 4: suggestion ranking for unmatched ────────────
    def suggestions(
        self,
        unmatched_sources: List[RecordView],
        all_targets: List[RecordView],
        consumed_tgt: Set[int],
        top_k: int = 10,
    ) -> List[Dict]:
        """Surface best candidate pairs without committing a match."""
        suggestions_out = []
        free_tgt = [t for t in all_targets if t.id not in consumed_tgt]
        if not free_tgt:
            return []
        tgt_index = CandidateIndex(free_tgt, self.tolerance * 3)
        for src in unmatched_sources[:50]:   # cap to avoid timeout
            cands = self._candidates(src, tgt_index, consumed_tgt)
            for tgt, score in cands[:3]:
                suggestions_out.append({
                    "left_record_id":  src.id,
                    "right_record_id": tgt.id,
                    "left_reference":  src.reference,
                    "right_reference": tgt.reference,
                    "confidence":      round(score, 4),
                    "amount_delta":    round(src.amount - tgt.amount, 2),
                    "strategy":        "ai_suggestion",
                })
        suggestions_out.sort(key=lambda x: -x["confidence"])
        return suggestions_out[:top_k]

    # ── Master run ────────────────────────────────────────────
    def run(
        self,
        db: Session,
        profile_id: int,
        user_id: Optional[int] = None,
    ) -> Dict:
        """
        Full 4-phase matching pipeline.
        Returns summary dict: {match_groups, exceptions, auto_match_rate, ...}
        """
        from ..models.models import ReconciliationRecord as RR

        # Load all validated records for this profile
        all_records = (
            db.query(RR)
            .filter(RR.profile_id == profile_id)
            .all()
        )

        if not all_records:
            return {"profile_id": profile_id, "match_groups": 0,
                    "exceptions": 0, "auto_match_rate": 0.0, "message": "No records found"}

        # Split by source_system signature
        # GL-type = sources, BANK-type = targets
        # Heuristic: records with more "GL" in source_system are sources
        def is_source(r: RR) -> bool:
            ss = (r.source_system or "").upper()
            return "GL" in ss or "ERP" in ss or "SOURCE" in ss

        source_recs = [RecordView.from_orm(r) for r in all_records if is_source(r)]
        target_recs = [RecordView.from_orm(r) for r in all_records if not is_source(r)]

        # If split heuristic fails, fall back to alternating halves
        if not source_recs or not target_recs:
            mid = len(all_records) // 2
            source_recs = [RecordView.from_orm(r) for r in all_records[:mid]]
            target_recs = [RecordView.from_orm(r) for r in all_records[mid:]]

        # ── FX Conversion Engine ────────────────────────────────
        from ..models.models import ExchangeRate
        fx_rates = db.query(ExchangeRate).all()
        fx_map = {(fx.from_currency, fx.to_currency): fx.rate for fx in fx_rates}
        
        # Base currency is USD. Convert amounts to USD for matching.
        for r in source_recs + target_recs:
            curr = (r.currency or "USD").upper()
            if curr != "USD":
                rate = fx_map.get((curr, "USD"))
                if not rate:
                    rate = 1.0 / fx_map.get(("USD", curr), 1.0)
                r.amount = round(r.amount * rate, 2)
                r.currency = "USD"
        # ────────────────────────────────────────────────────────

        consumed_src: Set[int] = set()
        consumed_tgt: Set[int] = set()
        all_results: List[MatchResult] = []

        # Phase 2 — 1:1 holistic
        p2 = self._one_to_one(source_recs, target_recs, consumed_src, consumed_tgt)
        all_results.extend(p2)

        # Phase 3a — many-to-one
        p3a = self._many_to_one(source_recs, target_recs, consumed_src, consumed_tgt)
        all_results.extend(p3a)

        # Phase 3b — one-to-many
        p3b = self._one_to_many(source_recs, target_recs, consumed_src, consumed_tgt)
        all_results.extend(p3b)

        # Phase 3c — cross-period
        unmatched_src = [s for s in source_recs if s.id not in consumed_src]
        p3c = self._cross_period(unmatched_src, db, consumed_src, consumed_tgt, profile_id)
        all_results.extend(p3c)

        # ── Persist match groups ──────────────────────────────
        matched_groups = 0
        exception_count = 0

        for mr in all_results:
            mg = repository.create_match_group(
                db,
                profile_id   = profile_id,
                strategy     = mr.strategy,
                classification = mr.classification,
                confidence   = mr.score,
                variance     = mr.variance,
            )
            all_ids = mr.source_ids + mr.target_ids
            repository.add_match_items(db, mg.id, all_ids)
            # Update record statuses
            status = STATUS_RECONCILED if mr.classification == "FULL_MATCH" else STATUS_PARTIAL
            for rid in all_ids:
                db.query(type(all_records[0])).filter_by(id=rid).update({"status": status})
            if mr.classification != "FULL_MATCH":
                repository.add_exception(db, mg.id, "exception")
                exception_count += 1
            matched_groups += 1

        # ── Unmatched remainders → exception queue ────────────
        remaining_src = [s for s in source_recs if s.id not in consumed_src]
        remaining_tgt = [t for t in target_recs if t.id not in consumed_tgt]

        for r in remaining_src + remaining_tgt:
            mg = repository.create_match_group(
                db, profile_id, "unmatched", "UNMATCHED", 0.0, 0.0
            )
            repository.add_match_items(db, mg.id, [r.id])
            repository.add_exception(db, mg.id, "unresolved")
            db.query(type(all_records[0])).filter_by(id=r.id).update({"status": STATUS_UNMATCHED})
            exception_count += 1

        repository.commit(db)

        total   = len(source_recs) + len(target_recs)
        matched = sum(
            len(mr.source_ids) + len(mr.target_ids)
            for mr in all_results if mr.classification == "FULL_MATCH"
        )
        auto_match_rate = round(matched / total * 100, 1) if total else 0.0

        audit_service.log_action(
            db, "ADVANCED_MATCHING_COMPLETED",
            user_id=user_id, entity_type="profile", entity_id=profile_id,
            metadata={
                "strategy": "advanced_4phase",
                "match_groups": matched_groups,
                "exceptions": exception_count,
                "auto_match_rate": auto_match_rate,
                "phase_results": {
                    "p2_one_to_one": len(p2),
                    "p3a_many_to_one": len(p3a),
                    "p3b_one_to_many": len(p3b),
                    "p3c_cross_period": len(p3c),
                    "unmatched_src": len(remaining_src),
                    "unmatched_tgt": len(remaining_tgt),
                },
            },
        )

        return {
            "profile_id":      profile_id,
            "match_groups":    matched_groups,
            "exceptions":      exception_count,
            "auto_match_rate": auto_match_rate,
            "total_records":   total,
            "phase_breakdown": {
                "one_to_one":    len(p2),
                "many_to_one":   len(p3a),
                "one_to_many":   len(p3b),
                "cross_period":  len(p3c),
                "unmatched":     len(remaining_src) + len(remaining_tgt),
            },
        }
