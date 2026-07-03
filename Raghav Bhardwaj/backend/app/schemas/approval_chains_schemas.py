from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ApprovalRuleBase(BaseModel):
    condition_field: str
    condition_operator: str
    condition_value: str
    action: str
    target_role: Optional[str] = None
    is_active: bool = True

class ApprovalRuleCreate(ApprovalRuleBase):
    project_id: int

class ApprovalRuleUpdate(BaseModel):
    condition_field: Optional[str] = None
    condition_operator: Optional[str] = None
    condition_value: Optional[str] = None
    action: Optional[str] = None
    target_role: Optional[str] = None
    is_active: Optional[bool] = None

class ApprovalRuleOut(ApprovalRuleBase):
    id: int
    project_id: int
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
