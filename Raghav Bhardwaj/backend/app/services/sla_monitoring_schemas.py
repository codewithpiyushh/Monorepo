"""
backend/app/services/sla_monitoring_schemas.py

Pydantic schemas for the SLA Monitoring & Escalation Engine (Phase 2, Chunk 4).
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


# ── Policies ────────────────────────────────────────────────────────────

class SLAPolicyCreateRequest(BaseModel):
    profile_id:              Optional[int] = None
    priority_level:          str            # LOW | MEDIUM | HIGH | CRITICAL
    max_days_open:           int
    escalation_role:         str            # PREPARER | APPROVER | CERTIFIER | ADMIN
    reminder_interval_days:  int = 3


class SLAPolicyUpdateRequest(BaseModel):
    max_days_open:           Optional[int] = None
    escalation_role:         Optional[str] = None
    reminder_interval_days:  Optional[int] = None


class SLAPolicyItem(BaseModel):
    id:                      int
    profile_id:              Optional[int]
    profile_name:            Optional[str] = None
    priority_level:          str
    max_days_open:           int
    escalation_role:         str
    reminder_interval_days:  int
    created_at:              Optional[datetime]
    updated_at:              Optional[datetime]


# ── Violations ──────────────────────────────────────────────────────────

class SLAViolationItem(BaseModel):
    id:                  int
    balance_id:          int
    profile_id:          int
    profile_name:        Optional[str] = None
    policy_id:           Optional[int]
    violation_type:      str
    assigned_user_id:    Optional[int]
    current_owner_id:    Optional[int]
    current_owner_name:  Optional[str] = None
    days_overdue:        int
    escalation_level:    int
    escalation_status:   str
    status:              str
    priority_level:      Optional[str] = None
    created_at:          Optional[datetime]
    resolved_at:         Optional[datetime]
    last_escalated_at:   Optional[datetime]


class SLAViolationListResponse(BaseModel):
    violations: List[SLAViolationItem]
    total:      int


class SLAOverrideRequest(BaseModel):
    escalation_level:    Optional[int] = None
    escalation_status:   Optional[str] = None
    current_owner_id:    Optional[int] = None
    note:                Optional[str] = None


class SLAResolveRequest(BaseModel):
    note: Optional[str] = None


class SLAAcknowledgeRequest(BaseModel):
    note: Optional[str] = None


# ── Dashboard / KPIs ────────────────────────────────────────────────────

class SLADashboardKPIs(BaseModel):
    total_violations:      int
    open_violations:       int
    escalated_accounts:    int      # escalation_level == 3
    sla_compliance_pct:    float    # 100 - (open_violations / total active balances * 100)


class BottleneckApprover(BaseModel):
    user_id:            int
    user_name:          str
    open_violation_count: int


# ── Scan / escalation run results ──────────────────────────────────────

class SLAScanResult(BaseModel):
    scanned_balances:     int
    new_violations:       int
    updated_violations:   int
    auto_resolved:        int
    escalations_triggered: dict
    run_at:               datetime


# ── Close Calendar integration payload ──────────────────────────────────
# (consumed by close_calendar_service / close_calendar_schemas — mirrored
#  here for SLA-side reuse / testing)

class SLACloseCalendarSection(BaseModel):
    open_sla_violations_count:        int
    open_sla_violations_by_priority:  dict
    overdue_reconciliations_count:    int
    escalated_accounts_count:         int
    overdue_certifications_count:     int
    bottleneck_approvers:             List[BottleneckApprover]
