"""
backend/app/routes/fx_router.py
Phase 3, Chunk 5 — FX Management router

Complements existing /api/enterprise/fx/* endpoints.
Adds: live rate refresh, full rate listing, FX exposure dashboard.

Base rate URL: https://open.er-api.com/v6/latest/{BASE}
Free tier — no API key required, 1 500 requests/month.
"""
import logging
from datetime import date
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from ..database import get_db
from ..rbac.roles import ADMIN, PREPARER, APPROVER, CERTIFIER
from ..rbac.dependencies import role_required
from ..core.config import settings

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/fx", tags=["fx-management"])

_ALL_ROLES   = [ADMIN, PREPARER, APPROVER, CERTIFIER]
_ADMIN_ONLY  = [ADMIN]

# Currencies to track — major pairs only to keep the table lean
_MAJOR = {
    "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD",
    "CNY", "INR", "SGD", "HKD", "NOK", "SEK", "DKK", "NZD",
}


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/v1/fx/rates
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/rates")
def list_rates(
    from_currency: Optional[str] = Query(None, description="Filter by base currency (e.g. USD)"),
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user=Depends(role_required(_ALL_ROLES)),
):
    """List stored exchange rates, newest first."""
    where  = "1=1"
    params = {"limit": limit}
    if from_currency:
        where += " AND from_currency = :fc"
        params["fc"] = from_currency.upper()

    rows = db.execute(
        text(f"""
            SELECT id, from_currency, to_currency, rate, rate_date, source, created_at
            FROM exchange_rates
            WHERE {where}
            ORDER BY rate_date DESC, from_currency ASC
            LIMIT :limit
        """),
        params,
    ).fetchall()

    return {
        "rates": [
            {
                "id":            r.id,
                "from_currency": r.from_currency,
                "to_currency":   r.to_currency,
                "rate":          float(r.rate),
                "rate_date":     str(r.rate_date) if r.rate_date else None,
                "source":        r.source,
            }
            for r in rows
        ],
        "total": len(rows),
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/v1/fx/rates/{from}/{to}
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/rates/{from_currency}/{to_currency}")
def get_rate(
    from_currency: str,
    to_currency:   str,
    db: Session = Depends(get_db),
    current_user=Depends(role_required(_ALL_ROLES)),
):
    """Get the latest stored rate for a currency pair."""
    row = db.execute(
        text("""
            SELECT rate, rate_date, source
            FROM exchange_rates
            WHERE from_currency = :fc AND to_currency = :tc
            ORDER BY rate_date DESC
            LIMIT 1
        """),
        {"fc": from_currency.upper(), "tc": to_currency.upper()},
    ).fetchone()

    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"No rate found for {from_currency.upper()}/{to_currency.upper()}. "
                   "Use POST /api/v1/fx/rates/refresh to fetch live rates.",
        )
    return {
        "from_currency": from_currency.upper(),
        "to_currency":   to_currency.upper(),
        "rate":          float(row.rate),
        "rate_date":     str(row.rate_date),
        "source":        row.source,
    }


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/v1/fx/rates/refresh  (admin only)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/rates/refresh")
def refresh_rates(
    base: str = Query("USD", description="Base currency to fetch (USD / EUR / GBP)"),
    db:   Session = Depends(get_db),
    current_user=Depends(role_required(_ADMIN_ONLY)),
):
    """
    Admin: fetch live rates from open.er-api.com and upsert into exchange_rates.
    Restricted to major currency pairs to keep the table manageable.
    """
    base_upper = base.upper()
    url = f"https://open.er-api.com/v6/latest/{base_upper}"
    try:
        resp = httpx.get(url, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Live rate fetch failed: {exc}")

    raw_rates = data.get("rates", {})
    today     = date.today().isoformat()
    upserted  = 0
    skipped   = 0

    for to_curr, rate_val in raw_rates.items():
        # Only keep major-currency pairs
        if to_curr not in _MAJOR and base_upper not in _MAJOR:
            skipped += 1
            continue
        try:
            existing = db.execute(
                text("""
                    SELECT id FROM exchange_rates
                    WHERE from_currency = :fc AND to_currency = :tc AND rate_date = :rd
                """),
                {"fc": base_upper, "tc": to_curr, "rd": today},
            ).fetchone()

            if existing:
                db.execute(
                    text("UPDATE exchange_rates SET rate = :r, source = :s WHERE id = :id"),
                    {"r": rate_val, "s": "open.er-api.com", "id": existing.id},
                )
            else:
                db.execute(
                    text("""
                        INSERT INTO exchange_rates
                            (from_currency, to_currency, rate, rate_date, source)
                        VALUES (:fc, :tc, :r, :rd, :s)
                    """),
                    {"fc": base_upper, "tc": to_curr, "r": rate_val, "rd": today, "s": "open.er-api.com"},
                )
            upserted += 1
        except Exception as exc:
            log.warning(f"[fx_refresh] Skipping {base_upper}/{to_curr}: {exc}")

    db.commit()
    log.info(f"[fx_refresh] {base_upper}: {upserted} pairs upserted, {skipped} non-major skipped")
    return {
        "success":  True,
        "base":     base_upper,
        "date":     today,
        "upserted": upserted,
        "source":   "open.er-api.com",
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/v1/fx/dashboard
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/dashboard")
def fx_dashboard(
    db: Session = Depends(get_db),
    current_user=Depends(role_required(_ALL_ROLES)),
):
    """
    FX exposure dashboard.
    Returns: currencies in use across all reconciliation records,
    latest rate pairs, last live refresh date.
    """
    # Currencies present in reconciliation records
    exposure_rows = db.execute(
        text("""
            SELECT currency,
                   COUNT(*)            AS record_count,
                   SUM(ABS(COALESCE(amount, 0))) AS total_volume
            FROM reconciliation_records
            WHERE currency IS NOT NULL AND currency != ''
            GROUP BY currency
            ORDER BY total_volume DESC
            LIMIT 20
        """)
    ).fetchall()

    # Latest rate for each pair (sub-query approach for MySQL compatibility)
    rate_rows = db.execute(
        text("""
            SELECT er.from_currency, er.to_currency, er.rate, er.rate_date, er.source
            FROM exchange_rates er
            INNER JOIN (
                SELECT from_currency, to_currency, MAX(rate_date) AS max_date
                FROM exchange_rates
                GROUP BY from_currency, to_currency
            ) latest
              ON er.from_currency = latest.from_currency
             AND er.to_currency   = latest.to_currency
             AND er.rate_date     = latest.max_date
            ORDER BY er.from_currency, er.to_currency
            LIMIT 300
        """)
    ).fetchall()

    # Last live refresh
    last_refresh = db.execute(
        text("SELECT MAX(rate_date) FROM exchange_rates WHERE source = 'open.er-api.com'")
    ).scalar()

    # Currencies covered by stored rates
    covered = {r.to_currency for r in rate_rows} | {r.from_currency for r in rate_rows}

    return {
        "reporting_currency": getattr(settings, "FX_REPORTING_CURRENCY", "USD"),
        "last_refresh":       str(last_refresh) if last_refresh else None,
        "total_rate_pairs":   len(rate_rows),
        "currencies_covered": sorted(covered),
        "currency_exposure": [
            {
                "currency":     r.currency,
                "record_count": int(r.record_count),
                "total_volume": float(r.total_volume or 0),
            }
            for r in exposure_rows
        ],
        "rates": [
            {
                "from":      r.from_currency,
                "to":        r.to_currency,
                "rate":      float(r.rate),
                "date":      str(r.rate_date),
                "source":    r.source,
            }
            for r in rate_rows
        ],
    }
