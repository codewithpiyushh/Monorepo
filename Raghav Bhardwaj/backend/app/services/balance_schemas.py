"""
backend/app/services/balance_schemas.py

Pydantic schemas for the Balance Reconciliation Engine.
Follows the same patterns as enterprise/schemas.py.
"""

from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, Field


# ── Request schemas ───────────────────────────────────────────────────────────

class BalanceCreate(BaseModel):
    profile_id:     int
    period_key:     str                         = Field(..., example="2026-05")
    source_balance: float                       = Field(..., description="GL / source system balance")
    target_balance: float                       = Field(..., description="Bank / supporting balance")
    comments:       Optional[str]               = None


class BalanceUpdate(BaseModel):
    source_balance: Optional[float]             = None
    target_balance: Optional[float]             = None
    comments:       Optional[str]               = None


class BalanceActionRequest(BaseModel):
    comments:       Optional[str]               = None


# ── Response schemas ──────────────────────────────────────────────────────────

class BalanceHistoryOut(BaseModel):
    id:              int
    balance_id:      int
    actor_id:        Optional[int]
    actor_role:      Optional[str]
    action:          str
    from_status:     Optional[str]
    to_status:       Optional[str]
    source_balance:  Optional[float]
    target_balance:  Optional[float]
    variance_amount: Optional[float]
    comments:        Optional[str]
    created_at:      datetime

    class Config:
        from_attributes = True


class BalanceOut(BaseModel):
    id:                  int
    profile_id:          int
    profile_name:        Optional[str] = None
    project_name:        Optional[str] = None
    period_key:          str
    source_balance:      float
    target_balance:      float
    variance_amount:     Optional[float]
    variance_percentage: Optional[float]
    variance_severity_classification: Optional[str]
    root_cause_category: Optional[str]
    variance_explanation: Optional[str]
    resolution_target_date: Optional[date]
    resolution_status: Optional[str]
    explained_variance: Optional[float]
    unexplained_variance: Optional[float]
    flux_amount: Optional[float]
    flux_percentage: Optional[float]
    threshold_amount:    float
    materiality_limit:   float
    status:              str
    comments:            Optional[str]
    submitted_at:        Optional[datetime]
    reviewed_at:         Optional[datetime]
    approved_at:         Optional[datetime]
    certified_at:        Optional[datetime]
    preparer_id:         Optional[int]
    reviewer_id:         Optional[int]
    approver_id:         Optional[int]
    certifier_id:        Optional[int]
    created_by:          Optional[int]
    updated_by:          Optional[int]
    created_at:          datetime
    updated_at:          datetime

    class Config:
        from_attributes = True


class BalanceListPage(BaseModel):
    items:      List[BalanceOut]
    total:      int
    page:       int
    page_size:  int


class BalanceDashboard(BaseModel):
    total:                  int
    balanced:               int
    out_of_balance:         int
    pending_review:         int
    pending_approval:       int
    pending_certification:  int
    certified:              int
    rejected:               int
    high_risk:              int
    total_variance:         float
