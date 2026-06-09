import json
from datetime import datetime
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from fastapi import HTTPException
from rapidfuzz import fuzz
from ..models.models import Dataset, DataRow, Mapping, Rule, Execution, Result, Workflow, WorkflowHistory
from . import rule_service


# ─── Rule Evaluation ─────────────────────────────────────────────────────────

def _apply_rule_config(
    src_val: Any, tgt_val: Any, rule_type: str, config: dict
) -> Dict[str, Any]:
    """Evaluate a single rule against source and target values."""
    s, t = str(src_val) if src_val is not None else "", str(tgt_val) if tgt_val is not None else ""

    if rule_type == "exact":
        match = s == t
        return {"match": match, "score": 1.0 if match else 0.0, "rule_type": "exact"}

    if rule_type == "tolerance":
        try:
            sv, tv = float(src_val), float(tgt_val)
            threshold = float(config.get("threshold", 0))
            tol_type = config.get("tolerance_type", "absolute")
            if tol_type == "percentage":
                diff_pct = abs(sv - tv) / abs(sv) * 100 if sv != 0 else abs(tv) * 100
                match = diff_pct <= threshold
                score = max(0.0, 1.0 - diff_pct / max(threshold, 0.001))
            else:
                diff_abs = abs(sv - tv)
                match = diff_abs <= threshold
                score = max(0.0, 1.0 - diff_abs / max(threshold, 0.001))
            return {"match": match, "score": min(score, 1.0), "rule_type": "tolerance"}
        except (TypeError, ValueError):
            match = s == t
            return {"match": match, "score": 1.0 if match else 0.0, "rule_type": "exact_fallback"}

    if rule_type == "fuzzy":
        threshold = float(config.get("threshold", 0.8))
        ratio = fuzz.token_sort_ratio(s, t) / 100.0
        return {"match": ratio >= threshold, "score": ratio, "rule_type": "fuzzy"}

    if rule_type == "date_diff":
        try:
            date_format = config.get("date_format", "%Y-%m-%d")
            d1 = datetime.strptime(s, date_format)
            d2 = datetime.strptime(t, date_format)
            diff_days = abs((d1 - d2).days)
            threshold = int(config.get("threshold", 0))
            match = diff_days <= threshold
            score = max(0.0, 1.0 - diff_days / max(threshold + 1, 1))
            return {"match": match, "score": score, "rule_type": "date_diff"}
        except (ValueError, TypeError):
            match = s == t
            return {"match": match, "score": 1.0 if match else 0.0, "rule_type": "exact_fallback"}

    # Default fallback
    match = s == t
    return {"match": match, "score": 1.0 if match else 0.0, "rule_type": "exact"}


def _find_rule_for_column(rules_parsed: List[dict], source_column: str) -> Optional[dict]:
    for r in rules_parsed:
        cfg = r.get("config", {})
        if cfg.get("source_column") == source_column:
            return r
    return None


# ─── Main Reconciliation ─────────────────────────────────────────────────────

def run_reconciliation(execution_id: int, project_id: int, db: Session) -> None:
    execution = db.query(Execution).filter(Execution.id == execution_id).first()
    if not execution:
        return

    execution.status = "running"
    db.commit()

    try:
        # Load datasets
        source_ds = db.query(Dataset).filter(
            Dataset.project_id == project_id, Dataset.dataset_type == "source"
        ).first()
        target_ds = db.query(Dataset).filter(
            Dataset.project_id == project_id, Dataset.dataset_type == "target"
        ).first()

        if not source_ds or not target_ds:
            raise ValueError("Source and target datasets are required")

        source_rows = [
            json.loads(r.data)
            for r in db.query(DataRow)
            .filter(DataRow.dataset_id == source_ds.id)
            .order_by(DataRow.row_index)
            .all()
        ]
        target_rows = [
            json.loads(r.data)
            for r in db.query(DataRow)
            .filter(DataRow.dataset_id == target_ds.id)
            .order_by(DataRow.row_index)
            .all()
        ]

        # Load mappings & rules
        mappings = db.query(Mapping).filter(Mapping.project_id == project_id).all()
        # Auto-provision baseline rules when none are configured.
        rule_service.seed_predefined_rules_if_missing(db, project_id)
        rules_raw = (
            db.query(Rule)
            .filter(Rule.project_id == project_id, Rule.is_active == True)
            .all()
        )
        rules_parsed = [
            {"rule_type": r.rule_type, "config": json.loads(r.config)} for r in rules_raw
        ]

        key_mappings = [m for m in mappings if m.is_key_field]
        non_key_mappings = [m for m in mappings if not m.is_key_field]

        if not key_mappings:
            # Fallback: use all mappings as potential keys (first mapping as key)
            key_mappings = mappings[:1]
            non_key_mappings = mappings[1:]

        # Build target index keyed by tuple of key field values
        target_index: Dict[tuple, List] = {}
        for tgt_idx, tgt_row in enumerate(target_rows):
            key = tuple(str(tgt_row.get(m.target_column, "")).strip() for m in key_mappings)
            if key not in target_index:
                target_index[key] = []
            target_index[key].append((tgt_idx, tgt_row))

        matched_count = unmatched_count = partial_count = 0
        results_to_insert: List[Result] = []
        matched_target_indices: set = set()

        for src_idx, src_row in enumerate(source_rows):
            src_key = tuple(
                str(src_row.get(m.source_column, "")).strip() for m in key_mappings
            )

            if src_key in target_index:
                # Take first matching target row (could enhance with scoring)
                tgt_idx, tgt_row = target_index[src_key][0]
                matched_target_indices.add(tgt_idx)

                discrepancies = []
                scores = []

                for mapping in non_key_mappings:
                    src_val = src_row.get(mapping.source_column)
                    tgt_val = tgt_row.get(mapping.target_column)

                    rule_def = _find_rule_for_column(rules_parsed, mapping.source_column)
                    if rule_def:
                        eval_result = _apply_rule_config(
                            src_val, tgt_val, rule_def["rule_type"], rule_def["config"]
                        )
                    else:
                        eval_result = _apply_rule_config(src_val, tgt_val, "exact", {})

                    scores.append(eval_result["score"])

                    if not eval_result["match"]:
                        discrepancies.append({
                            "source_column": mapping.source_column,
                            "target_column": mapping.target_column,
                            "source_value": str(src_val) if src_val is not None else "",
                            "target_value": str(tgt_val) if tgt_val is not None else "",
                            "rule_type": eval_result["rule_type"],
                            "score": round(eval_result["score"], 4),
                        })

                avg_score = sum(scores) / len(scores) if scores else 1.0
                total_non_key = len(non_key_mappings)

                if not discrepancies:
                    status = "matched"
                    matched_count += 1
                elif len(discrepancies) < total_non_key:
                    status = "partial"
                    partial_count += 1
                else:
                    status = "unmatched"
                    unmatched_count += 1

                results_to_insert.append(
                    Result(
                        execution_id=execution_id,
                        source_row_index=src_idx,
                        target_row_index=tgt_idx,
                        source_data=json.dumps(src_row),
                        target_data=json.dumps(tgt_row),
                        match_status=status,
                        match_score=round(avg_score, 4),
                        discrepancies=json.dumps(discrepancies),
                    )
                )
            else:
                unmatched_count += 1
                results_to_insert.append(
                    Result(
                        execution_id=execution_id,
                        source_row_index=src_idx,
                        target_row_index=None,
                        source_data=json.dumps(src_row),
                        target_data=None,
                        match_status="unmatched",
                        match_score=0.0,
                        discrepancies=json.dumps([]),
                    )
                )

        # Unmatched target rows (no corresponding source)
        for tgt_idx, tgt_row in enumerate(target_rows):
            if tgt_idx not in matched_target_indices:
                unmatched_count += 1
                results_to_insert.append(
                    Result(
                        execution_id=execution_id,
                        source_row_index=None,
                        target_row_index=tgt_idx,
                        source_data=None,
                        target_data=json.dumps(tgt_row),
                        match_status="unmatched",
                        match_score=0.0,
                        discrepancies=json.dumps([]),
                    )
                )

        # Bulk insert results
        CHUNK = 500
        for i in range(0, len(results_to_insert), CHUNK):
            db.add_all(results_to_insert[i : i + CHUNK])
            db.flush()

        execution.status = "completed"
        execution.completed_at = datetime.utcnow()
        execution.stats = json.dumps({
            "matched": matched_count,
            "unmatched": unmatched_count,
            "partial": partial_count,
            "total_source": len(source_rows),
            "total_target": len(target_rows),
            "match_rate": round(
                matched_count / max(len(source_rows), 1) * 100, 2
            ),
            "auto_reconciled": unmatched_count == 0 and partial_count == 0,
            "requires_preparer_justification": unmatched_count > 0 or partial_count > 0,
        })

        workflow = db.query(Workflow).filter(Workflow.reconciliation_id == execution_id).first()
        if workflow:
            previous = workflow.status
            if unmatched_count == 0 and partial_count == 0:
                workflow.status = "approved"
                workflow.comments = (workflow.comments or "") + (
                    "\n[AUTO] Fully matched execution auto-reconciled."
                )
                db.add(
                    WorkflowHistory(
                        workflow_id=workflow.id,
                        actor_id=None,
                        action="auto_reconcile",
                        from_status=previous,
                        to_status="approved",
                        comments="All records matched; auto-reconciled by system.",
                    )
                )
            else:
                if workflow.status == "pending":
                    workflow.status = "in_progress"
                workflow.comments = (workflow.comments or "") + (
                    "\n[ACTION REQUIRED] Partial/unmatched records require preparer justification and proof."
                )
            workflow.updated_at = datetime.utcnow()
        db.commit()

    except Exception as exc:
        db.rollback()
        execution = db.query(Execution).filter(Execution.id == execution_id).first()
        if execution:
            execution.status = "failed"
            execution.error_message = str(exc)
            execution.completed_at = datetime.utcnow()
            db.commit()
        raise


# ─── Query Helpers ───────────────────────────────────────────────────────────

def create_execution(db: Session, project_id: int, assigned_to: int | None = None) -> Execution:
    execution = Execution(project_id=project_id, status="pending")
    db.add(execution)
    db.flush()
    db.add(
        Workflow(
            reconciliation_id=execution.id,
            assigned_to=assigned_to,
            status="in_progress" if assigned_to else "pending",
        )
    )
    db.commit()
    db.refresh(execution)
    return execution


def get_executions(db: Session, project_id: int) -> List[Execution]:
    return (
        db.query(Execution)
        .filter(Execution.project_id == project_id)
        .order_by(Execution.started_at.desc())
        .all()
    )


def get_execution(db: Session, execution_id: int, project_id: int) -> Execution:
    ex = db.query(Execution).filter(
        Execution.id == execution_id, Execution.project_id == project_id
    ).first()
    if not ex:
        raise HTTPException(status_code=404, detail="Execution not found")
    return ex


def get_results(
    db: Session,
    execution_id: int,
    match_status: Optional[str] = None,
    page: int = 1,
    page_size: int = 100,
):
    query = db.query(Result).filter(Result.execution_id == execution_id)
    if match_status:
        query = query.filter(Result.match_status == match_status)

    total = query.count()
    results = (
        query.order_by(Result.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return results, total


def _pick_first_value(payload: Dict[str, Any], candidates: List[str]) -> str:
    for key in candidates:
        value = payload.get(key)
        if value is not None and str(value).strip() != "":
            return str(value)
    return ""


def _derive_unit_labels(
    source_data: Optional[Dict[str, Any]],
    target_data: Optional[Dict[str, Any]],
    mappings: List[Mapping],
) -> Dict[str, str]:
    src = source_data or {}
    tgt = target_data or {}

    entity_candidates_src = []
    entity_candidates_tgt = []
    account_candidates_src = []
    account_candidates_tgt = []

    for m in mappings:
        src_name = m.source_column.lower()
        tgt_name = m.target_column.lower()
        if any(token in src_name for token in ("entity", "company", "business_unit", "bu")):
            entity_candidates_src.append(m.source_column)
        if any(token in tgt_name for token in ("entity", "company", "business_unit", "bu")):
            entity_candidates_tgt.append(m.target_column)
        if any(token in src_name for token in ("account", "gl", "ledger", "acct")):
            account_candidates_src.append(m.source_column)
        if any(token in tgt_name for token in ("account", "gl", "ledger", "acct")):
            account_candidates_tgt.append(m.target_column)

    entity = _pick_first_value(src, entity_candidates_src) or _pick_first_value(tgt, entity_candidates_tgt)
    account = _pick_first_value(src, account_candidates_src) or _pick_first_value(tgt, account_candidates_tgt)

    key_mappings = [m for m in mappings if m.is_key_field]
    if not entity and key_mappings:
        entity = str(src.get(key_mappings[0].source_column) or tgt.get(key_mappings[0].target_column) or "Unassigned")
    if not account:
        if len(key_mappings) > 1:
            account = str(src.get(key_mappings[1].source_column) or tgt.get(key_mappings[1].target_column) or "General")
        else:
            account = "General"

    return {"entity": entity or "Unassigned", "account": account or "General"}


def get_results_grouped(
    db: Session,
    execution_id: int,
    project_id: int,
    match_status: Optional[str] = None,
    page: int = 1,
    page_size: int = 25,
):
    mappings = db.query(Mapping).filter(Mapping.project_id == project_id).all()
    query = db.query(Result).filter(Result.execution_id == execution_id)
    if match_status:
        query = query.filter(Result.match_status == match_status)

    all_results = query.order_by(Result.id.asc()).all()
    units: Dict[str, Dict[str, Any]] = {}

    for r in all_results:
        source_data = json.loads(r.source_data) if r.source_data else {}
        target_data = json.loads(r.target_data) if r.target_data else {}
        labels = _derive_unit_labels(source_data, target_data, mappings)
        unit_key = f"{labels['entity']}::{labels['account']}"

        if unit_key not in units:
            units[unit_key] = {
                "entity": labels["entity"],
                "account": labels["account"],
                "matched_count": 0,
                "unmatched_count": 0,
                "partial_count": 0,
                "transactions": [],
            }

        unit = units[unit_key]
        if r.match_status == "matched":
            unit["matched_count"] += 1
        elif r.match_status == "partial":
            unit["partial_count"] += 1
        else:
            unit["unmatched_count"] += 1

        selected_source = {}
        selected_target = {}
        for m in mappings:
            if m.source_column in source_data:
                selected_source[m.source_column] = source_data.get(m.source_column)
            if m.target_column in target_data:
                selected_target[m.target_column] = target_data.get(m.target_column)

        unit["transactions"].append({
            "id": r.id,
            "source_row_index": r.source_row_index,
            "target_row_index": r.target_row_index,
            "match_status": r.match_status,
            "match_score": r.match_score,
            "source_data": r.source_data,
            "target_data": r.target_data,
            "discrepancies": r.discrepancies,
            "selected_source_data": selected_source,
            "selected_target_data": selected_target,
        })

    unit_list = []
    for _, unit in units.items():
        total_transactions = unit["matched_count"] + unit["unmatched_count"] + unit["partial_count"]
        status = "matched"
        if unit["unmatched_count"] > 0:
            status = "unmatched"
        elif unit["partial_count"] > 0:
            status = "partial"
        unit_list.append({
            "entity": unit["entity"],
            "account": unit["account"],
            "status": status,
            "total_transactions": total_transactions,
            "matched_count": unit["matched_count"],
            "unmatched_count": unit["unmatched_count"],
            "partial_count": unit["partial_count"],
            "transactions": unit["transactions"],
        })

    unit_list.sort(key=lambda item: (item["entity"], item["account"]))
    total_units = len(unit_list)
    start = max(0, (page - 1) * page_size)
    end = start + page_size
    paged_units = unit_list[start:end]
    return paged_units, total_units


# ─── Promote Execution → Enterprise Profile ──────────────────────────────────

def promote_execution_to_profile(
    db: Session,
    execution_id: int,
    project_id: int,
    actor_id: int | None,
    recon_type: str = "BANK_RECONCILIATION",
    risk_classification: str = "MEDIUM",
    reviewer_id: int | None = None,
    approver_id: int | None = None,
    certifier_id: int | None = None,
) -> dict:
    """
    Convert a completed Project Execution into a full enterprise
    ReconciliationProfile + ReconciliationRecords + MatchGroups +
    ExceptionQueueRecords + CertificationWorkflow + FinancialCloseCalendar.

    Returns {"profile_id": int, "profile_name": str, "loaded_count": int,
             "match_groups": int, "exceptions": int, "workflow_id": int}
    """
    from ..models.models import (
        Execution, Result, Project, Dataset, DataRow, Mapping,
        ReconciliationProfile, ReconciliationRecord, MatchGroup,
        MatchGroupItem, ExceptionQueueRecord, CertificationWorkflow,
        CertificationWorkflowHistory, FinancialCloseCalendar,
        ReconciliationOwnership, User,
    )
    from datetime import datetime, date
    import json, uuid, calendar as cal_mod

    # ── Validate execution ────────────────────────────────────────────────────
    execution = (
        db.query(Execution)
        .filter(Execution.id == execution_id, Execution.project_id == project_id)
        .first()
    )
    if not execution:
        raise ValueError("Execution not found")
    if execution.status != "completed":
        raise ValueError("Only completed executions can be promoted")

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise ValueError("Project not found")

    stats = json.loads(execution.stats) if execution.stats else {}

    # ── Resolve users ─────────────────────────────────────────────────────────
    preparer = db.query(User).filter(User.id == actor_id).first() if actor_id else None
    if not reviewer_id:
        rev = db.query(User).filter(User.role == "reviewer", User.is_active == True).first()
        reviewer_id = rev.id if rev else actor_id
    if not approver_id:
        appr = db.query(User).filter(User.role == "approver", User.is_active == True).first()
        approver_id = appr.id if appr else actor_id
    if not certifier_id:
        cert = db.query(User).filter(User.role == "certifier", User.is_active == True).first()
        certifier_id = cert.id if cert else actor_id

    # ── Derive entity/account/period from source dataset ─────────────────────
    source_ds = (
        db.query(Dataset)
        .filter(Dataset.project_id == project_id, Dataset.dataset_type == "source")
        .first()
    )
    sample_entity, sample_account, sample_period, sample_currency = "ENTITY-1", "10000", None, "USD"
    if source_ds:
        first_row = (
            db.query(DataRow)
            .filter(DataRow.dataset_id == source_ds.id)
            .order_by(DataRow.row_index)
            .first()
        )
        if first_row:
            row_data = json.loads(first_row.data)
            sample_entity  = row_data.get("entity") or row_data.get("Entity") or "ENTITY-1"
            sample_account = row_data.get("account") or row_data.get("Account") or "10000"
            sample_period  = row_data.get("period") or row_data.get("Period") or None
            sample_currency = row_data.get("currency") or row_data.get("Currency") or "USD"

    if not sample_period:
        sample_period = datetime.utcnow().strftime("%Y-%m")

    # ── Create ReconciliationProfile ──────────────────────────────────────────
    profile_name = f"{project.name} – {sample_entity} ({sample_period})"
    # Make name unique if already exists
    existing = db.query(ReconciliationProfile).filter(
        ReconciliationProfile.name == profile_name
    ).first()
    if existing:
        profile_name = f"{profile_name} [run#{execution_id}]"

    profile = ReconciliationProfile(
        project_id=project_id,
        name=profile_name,
        reconciliation_type=recon_type,
        frequency="MONTHLY",
        tolerance_threshold=0.5,
        date_window_days=2,
        workflow_config_json=json.dumps({
            "require_preparer": True,
            "require_reviewer": True,
            "require_approver": risk_classification in ("HIGH", "CRITICAL"),
            "require_certifier": risk_classification == "CRITICAL",
            "sod_enforced": True,
            "promoted_from_execution": execution_id,
            "promoted_from_project": project_id,
        }),
        matching_rules_json=json.dumps({
            "primary": "EXACT",
            "fallback": ["TOLERANCE", "DATE_WINDOW", "FUZZY"],
            "key_fields": ["reference", "amount", "currency"],
        }),
        assigned_preparer=actor_id,
        assigned_reviewer=reviewer_id,
        assigned_approver=approver_id,
        assigned_certifier=certifier_id,
        risk_classification=risk_classification,
        due_days=5,
        auto_approve_threshold=0.98,
        materiality_limit=0.0,
        lifecycle_state="IN_PROGRESS",
        active=True,
        created_at=datetime.utcnow(),
    )
    db.add(profile)
    db.flush()

    # Ownership records
    for uid, orole in [
        (actor_id, "PREPARER"), (reviewer_id, "REVIEWER"),
        (approver_id, "APPROVER"), (certifier_id, "CERTIFIER"),
    ]:
        if uid:
            db.add(ReconciliationOwnership(
                profile_id=profile.id, owner_user_id=uid, owner_role=orole
            ))

    # ── Load Results → ReconciliationRecords + MatchGroups ───────────────────
    results = (
        db.query(Result)
        .filter(Result.execution_id == execution_id)
        .all()
    )

    # Load mappings to understand key fields
    mappings = db.query(Mapping).filter(Mapping.project_id == project_id).all()
    key_mapping = next((m for m in mappings if m.is_key_field), mappings[0] if mappings else None)

    loaded_count = 0
    match_groups_created = 0
    exceptions_created = 0
    batch_id = f"BATCH-PROMOTE-{uuid.uuid4().hex[:8].upper()}"

    for result in results:
        src_data = json.loads(result.source_data) if result.source_data else {}
        tgt_data = json.loads(result.target_data) if result.target_data else {}

        # Source record
        src_ref = src_data.get("reference") or src_data.get(key_mapping.source_column if key_mapping else "id") or f"SRC-{result.id}"
        src_rec = None
        if result.source_data:
            src_rec = ReconciliationRecord(
                batch_id=batch_id,
                profile_id=profile.id,
                source_system=f"{sample_entity}-GL",
                entity=src_data.get("entity") or sample_entity,
                account=src_data.get("account") or sample_account,
                period=src_data.get("period") or sample_period,
                currency=src_data.get("currency") or sample_currency,
                amount=float(src_data.get("amount") or 0),
                reference=str(src_ref),
                tx_date=str(src_data.get("date") or src_data.get("tx_date") or datetime.utcnow().strftime("%Y-%m-%d")),
                normalized_sign="DEBIT",
                status="VALIDATED",
                payload_json=result.source_data,
                created_at=datetime.utcnow(),
            )
            db.add(src_rec)
            db.flush()
            loaded_count += 1

        # Target record
        tgt_ref = tgt_data.get("reference") or tgt_data.get(key_mapping.target_column if key_mapping else "id") or f"TGT-{result.id}"
        tgt_rec = None
        if result.target_data:
            tgt_rec = ReconciliationRecord(
                batch_id=batch_id,
                profile_id=profile.id,
                source_system=f"{sample_entity}-BANK",
                entity=tgt_data.get("entity") or sample_entity,
                account=tgt_data.get("account") or sample_account,
                period=tgt_data.get("period") or sample_period,
                currency=tgt_data.get("currency") or sample_currency,
                amount=float(tgt_data.get("amount") or 0),
                reference=str(tgt_ref),
                tx_date=str(tgt_data.get("date") or tgt_data.get("tx_date") or datetime.utcnow().strftime("%Y-%m-%d")),
                normalized_sign="CREDIT",
                status="VALIDATED",
                payload_json=result.target_data,
                created_at=datetime.utcnow(),
            )
            db.add(tgt_rec)
            db.flush()
            loaded_count += 1

        # MatchGroup
        status_map = {"matched": "FULL_MATCH", "partial": "PARTIAL_MATCH", "unmatched": "UNMATCHED"}
        strategy_map = {"matched": "exact", "partial": "tolerance", "unmatched": "exact"}
        classification = status_map.get(result.match_status, "UNMATCHED")
        strategy = strategy_map.get(result.match_status, "exact")

        mg = MatchGroup(
            profile_id=profile.id,
            strategy=strategy,
            classification=classification,
            confidence=float(result.match_score or 0),
            variance_amount=abs(float(src_data.get("amount") or 0) - float(tgt_data.get("amount") or 0)),
            reconciled=(result.match_status == "matched"),
            finalized=False,
            created_at=datetime.utcnow(),
        )
        db.add(mg)
        db.flush()
        match_groups_created += 1

        if src_rec:
            db.add(MatchGroupItem(match_group_id=mg.id, reconciliation_record_id=src_rec.id))
        if tgt_rec:
            db.add(MatchGroupItem(match_group_id=mg.id, reconciliation_record_id=tgt_rec.id))

        # Exception queue for non-full matches
        if result.match_status in ("partial", "unmatched"):
            exc = ExceptionQueueRecord(
                match_group_id=mg.id,
                queue_type="exception" if result.match_status == "unmatched" else "assigned",
                assigned_to=actor_id,
                status="OPEN",
                comments=f"Promoted from execution #{execution_id}. Match status: {result.match_status}. Score: {result.match_score:.2f}",
                classification="DATA_ISSUE" if result.match_status == "unmatched" else "PROCESS_ISSUE",
                created_at=datetime.utcnow(),
            )
            db.add(exc)
            exceptions_created += 1

    # ── Financial Close Calendar ──────────────────────────────────────────────
    try:
        period_dt = datetime.strptime(sample_period, "%Y-%m")
        month = period_dt.month
        year = period_dt.year
        last_day = cal_mod.monthrange(year, month)[1]
        start_d = date(year, month, 1)
        end_d = date(year, month, last_day)
        due_m = month + 1 if month < 12 else 1
        due_y = year if month < 12 else year + 1
        due_d = date(due_y, due_m, 5)
    except Exception:
        today = date.today()
        start_d = today.replace(day=1)
        end_d = today
        due_d = today.replace(day=min(28, today.day + 5))

    close_cal = FinancialCloseCalendar(
        profile_id=profile.id,
        cycle_type="MONTHLY",
        period_key=sample_period,
        start_date=start_d.isoformat(),
        end_date=end_d.isoformat(),
        due_date=due_d.isoformat(),
        status="IN_PROGRESS",
        is_locked=False,
        created_at=datetime.utcnow(),
    )
    db.add(close_cal)
    db.flush()

    # ── Certification Workflow ────────────────────────────────────────────────
    cert = CertificationWorkflow(
        profile_id=profile.id,
        calendar_id=close_cal.id,
        status="PREPARED",
        current_stage="PREPARER",
        preparer_id=actor_id,
        reviewer_id=reviewer_id,
        approver_id=approver_id,
        certifier_id=certifier_id,
        due_date=due_d.isoformat(),
        last_comment=f"Promoted from project '{project.name}' run #{execution_id}. "
                     f"{stats.get('matched', 0)} matched, {stats.get('unmatched', 0)} unmatched.",
        created_at=datetime.utcnow(),
    )
    db.add(cert)
    db.flush()

    db.add(CertificationWorkflowHistory(
        workflow_id=cert.id,
        actor_id=actor_id,
        actor_role="PREPARER",
        action="PREPARE",
        from_status="OPEN",
        to_status="PREPARED",
        comments=f"Auto-created from project execution #{execution_id}.",
        created_at=datetime.utcnow(),
    ))

    db.commit()

    from ..services import audit_service
    audit_service.log_action(
        db, "EXECUTION_PROMOTED",
        user_id=actor_id,
        entity_type="reconciliation_profile",
        entity_id=profile.id,
        metadata={
            "execution_id": execution_id,
            "project_id": project_id,
            "profile_name": profile_name,
            "loaded_count": loaded_count,
        },
    )

    return {
        "profile_id": profile.id,
        "profile_name": profile_name,
        "loaded_count": loaded_count,
        "match_groups": match_groups_created,
        "exceptions": exceptions_created,
        "workflow_id": cert.id,
        "calendar_id": close_cal.id,
    }
