"""
backend/app/services/aging_schemas.py

Pydantic schemas for the Aging Analysis Engine.
"""

from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel


class AgingBucketSummary(BaseModel):
    bucket:                  str
    color:                   str
    exception_count:         int
    total_exception_amount:  float
    average_age_days:        float
    oldest_exception_days:   int


class AgingSummaryResponse(BaseModel):
    buckets:                 List[AgingBucketSummary]
    total_count:             int
    total_amount:            float
    overall_average_age:     float
    oldest_exception_days:   int
    generated_at:            str


class AgingExceptionItem(BaseModel):
    id:                     int
    match_group_id:         Optional[int]
    queue_type:             Optional[str]
    assigned_to:            Optional[int]
    status:                 Optional[str]
    comments:               Optional[str]
    classification:         Optional[str]
    resolution_notes:       Optional[str]
    escalated_at:           Optional[datetime]
    resolved_at:            Optional[datetime]
    created_at:             Optional[datetime]
    age_days:               int
    bucket:                 str
    bucket_color:           str
    variance_amount:        Optional[float]
    profile_id:             Optional[int]
    profile_name:           Optional[str]
    risk_classification:    Optional[str]
    assigned_reviewer:      Optional[int]
    assigned_certifier:     Optional[int]


class AgingDetailsResponse(BaseModel):
    items:      List[AgingExceptionItem]
    total:      int
    page:       int
    page_size:  int


class AgingTrendRow(BaseModel):
    period:   str
    CURRENT:  int
    WARNING:  int
    BREACH:   int
    CRITICAL: int


class EscalationResult(BaseModel):
    BREACH_escalations:   int
    CRITICAL_escalations: int
    SEVERE_escalations:   int
    total:                int
    run_at:               str


class SnapshotResult(BaseModel):
    written:  Optional[int]  = None
    period:   Optional[str]  = None
    skipped:  Optional[bool] = None
    reason:   Optional[str]  = None
