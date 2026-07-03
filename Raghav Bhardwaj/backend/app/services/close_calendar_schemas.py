"""
backend/app/services/close_calendar_schemas.py

Pydantic schemas for the Financial Close Calendar Engine (Phase 2, Chunk 3).
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


# ── Period list / overview grid ─────────────────────────────────────────────

class ClosePeriodSummary(BaseModel):
    id:                  int
    period_name:         str
    period_key:          str
    start_date:          str
    due_date:            str
    close_status:        str
    total_profiles:      int
    completed_profiles:  int
    certified_profiles:  int
    completion_pct:      float
    certification_pct:   float
    open_issues:         int
    is_demo_data:         bool
    overdue_certification_threshold: int = 5
    created_at:          Optional[datetime]


class ClosePeriodListResponse(BaseModel):
    periods: List[ClosePeriodSummary]
    kpis:    "CloseCalendarKPIs"


class CloseCalendarKPIs(BaseModel):
    open_periods:           int
    near_deadline:          int     # due within 5 days, not CLOSED
    overdue_tasks:          int
    material_variances:     int
    pending_certifications: int


ClosePeriodListResponse.model_rebuild()


# ── Create period ────────────────────────────────────────────────────────

class ClosePeriodCreateRequest(BaseModel):
    period_name: str
    period_key:  str
    start_date:  str
    due_date:    str
    project_id:  Optional[int] = None   # if set, scope auto-task-generation to this project only
    overdue_certification_threshold: int = 5  # SLA integration — see Part 5


class ClosePeriodCreateResponse(BaseModel):
    id:               int
    period_name:      str
    period_key:        str
    tasks_created:    int
    total_profiles:   int


# ── Task drilldown ───────────────────────────────────────────────────────

class ClosePeriodTaskItem(BaseModel):
    id:                    int
    close_period_id:       int
    profile_id:            int
    profile_name:          Optional[str]
    risk_classification:   Optional[str]
    balance_id:            Optional[int]
    assigned_owner_id:     Optional[int]
    assigned_owner_name:   Optional[str]
    target_due_date:       Optional[str]
    task_status:           str
    completion_percentage: float
    is_overdue:            bool
    created_at:            Optional[datetime]


class ClosePeriodTaskListResponse(BaseModel):
    tasks: List[ClosePeriodTaskItem]
    total: int


class TaskStatusUpdateRequest(BaseModel):
    task_status:           Optional[str] = None
    completion_percentage: Optional[float] = None


# ── Dashboard ─────────────────────────────────────────────────────────────

class BlockerRecord(BaseModel):
    category:        str          # e.g. "DRAFT_BALANCE", "MATERIAL_VARIANCE", "AGING_EXCEPTION"
    profile_id:       int
    profile_name:    str
    reference_id:    Optional[int]      # balance_id / exception_id / supporting_item_id
    reference_label: str               # account / period_key / human label
    detail:          str
    age_days:        Optional[int] = None


class BurndownPoint(BaseModel):
    day_label:       str           # "Day 1", "Day 2" ... or actual date
    remaining_tasks: int
    completed_tasks: int


class VarianceDensityCell(BaseModel):
    profile_name:    str
    risk:            str
    variance_pct:    float
    classification:  str


class ApprovalBottleneck(BaseModel):
    profile_id:    int
    profile_name:  str
    stuck_stage:   str
    stuck_role:    str
    days_stuck:    int


# ── SLA Monitoring integration (Phase 2, Chunk 4) ──────────────────────────
# Reuses sla_violations directly — this is not a parallel readiness system,
# just additional fields/sections surfaced on the existing dashboard.

class SLABottleneckApprover(BaseModel):
    user_id:               int
    user_name:             str
    open_violation_count:  int


class SLACalendarSection(BaseModel):
    open_sla_violations_count:        int
    open_sla_violations_by_priority:  dict          # {"LOW":0,"MEDIUM":2,"HIGH":1,"CRITICAL":0}
    overdue_reconciliations_count:    int            # balances past SLA, regardless of violation record status
    escalated_accounts_count:         int            # escalation_level == 3, status == OPEN
    overdue_certifications_count:     int            # CERTIFICATION_OVERDUE violations, status == OPEN
    bottleneck_approvers:             List[SLABottleneckApprover]


class ClosePeriodDashboardResponse(BaseModel):
    period:                 ClosePeriodSummary
    completion_pct:         float
    certification_pct:      float
    open_variances:         int
    material_breaches:      int
    aging_exceptions:       int
    overdue_tasks:          int
    approval_bottlenecks:   List[ApprovalBottleneck]
    burndown:               List[BurndownPoint]
    variance_density:       List[VarianceDensityCell]
    blockers_preview:       List[BlockerRecord]   # first 5, full list via /validate-close
    sla:                    Optional[SLACalendarSection] = None  # None if SLA module not installed


# ── Close readiness validation ───────────────────────────────────────────

class CloseReadinessResponse(BaseModel):
    ready:          bool
    period_id:      int
    blockers:       List[BlockerRecord]
    blocker_count:  int
    checked_at:     datetime


class ClosePeriodActionResponse(BaseModel):
    id:           int
    close_status: str
    closed_at:    Optional[datetime]
    closed_by:    Optional[int]
    message:      str
