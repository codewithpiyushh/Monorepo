from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class WorkflowAssignRequest(BaseModel):
    reconciliation_id: int
    assigned_to: Optional[int] = None
    comments: Optional[str] = None


class WorkflowActionRequest(BaseModel):
    reconciliation_id: int
    comments: Optional[str] = None


class WorkflowHistoryOut(BaseModel):
    id: int
    actor_id: Optional[int]
    action: str
    from_status: Optional[str]
    to_status: Optional[str]
    comments: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class WorkflowOut(BaseModel):
    id: int
    reconciliation_id: int
    assigned_to: Optional[int]
    status: str
    comments: Optional[str]
    created_at: datetime
    updated_at: datetime
    history: List[WorkflowHistoryOut] = []

    class Config:
        from_attributes = True

