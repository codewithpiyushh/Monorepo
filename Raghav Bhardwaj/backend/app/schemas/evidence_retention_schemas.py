from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class RetentionPolicyBase(BaseModel):
    project_id: int
    doc_type: str
    retention_period_days: int
    cold_storage_days: Optional[int] = None
    is_active: bool = True

class RetentionPolicyCreate(RetentionPolicyBase):
    pass

class RetentionPolicyUpdate(BaseModel):
    doc_type: Optional[str] = None
    retention_period_days: Optional[int] = None
    cold_storage_days: Optional[int] = None
    is_active: Optional[bool] = None

class RetentionPolicyOut(RetentionPolicyBase):
    id: int
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class ArchivalJobBase(BaseModel):
    project_id: int
    status: str = "PENDING"
    docs_archived: int = 0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

class ArchivalJobCreate(ArchivalJobBase):
    pass

class ArchivalJobUpdate(BaseModel):
    status: Optional[str] = None
    docs_archived: Optional[int] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

class ArchivalJobOut(ArchivalJobBase):
    id: int
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
