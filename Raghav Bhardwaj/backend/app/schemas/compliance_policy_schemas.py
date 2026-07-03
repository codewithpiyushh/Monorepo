from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class CompliancePolicyBase(BaseModel):
    control_name: str
    category: str
    violation_threshold: int = 0
    is_active: bool = True

class CompliancePolicyCreate(CompliancePolicyBase):
    project_id: int

class CompliancePolicyUpdate(BaseModel):
    control_name: Optional[str] = None
    category: Optional[str] = None
    violation_threshold: Optional[int] = None
    is_active: Optional[bool] = None

class CompliancePolicyOut(CompliancePolicyBase):
    id: int
    project_id: int
    current_violations: int
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
