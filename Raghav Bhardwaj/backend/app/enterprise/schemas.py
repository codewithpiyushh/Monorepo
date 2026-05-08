from datetime import datetime
from typing import Optional, Any, Dict, List
from pydantic import BaseModel


class IngestionBatchCreate(BaseModel):
    source_system: str
    metadata: Dict[str, Any] = {}
    records: List[Dict[str, Any]]


class IngestionBatchOut(BaseModel):
    batch_id: str
    source_system: str
    ingestion_timestamp: datetime
    ingestion_status: str


class ProfileCreate(BaseModel):
    name: str
    reconciliation_type: str
    frequency: str
    tolerance_threshold: float = 0.0
    date_window_days: int = 0
    workflow_config: Dict[str, Any] = {}
    matching_rules: Dict[str, Any] = {}
    assigned_preparer: Optional[int] = None
    assigned_reviewer: Optional[int] = None


class MatchRequest(BaseModel):
    profile_id: int
    strategy: str = "rule_based"
    auto_match_threshold: float = 1.0


class WorkflowActionRequest(BaseModel):
    exception_id: int
    comments: Optional[str] = None
    assigned_to: Optional[int] = None

