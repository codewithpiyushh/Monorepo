from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class SequenceCreate(BaseModel):
    name: str
    steps: List[int] = Field(default_factory=list, description="Ordered list of project IDs (reconciliations)")
    stop_on_failure: bool = True


class SequenceStepOut(BaseModel):
    id: int
    project_id: int
    step_order: int

    class Config:
        from_attributes = True


class SequenceOut(BaseModel):
    id: int
    name: str
    status: str
    stop_on_failure: bool
    created_at: datetime
    steps: List[SequenceStepOut] = []

    class Config:
        from_attributes = True


class SequenceStepResultOut(BaseModel):
    id: int
    step_id: int
    execution_id: Optional[int]
    status: str
    error_message: Optional[str]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    stats: Optional[str]

    class Config:
        from_attributes = True


class SequenceLogOut(BaseModel):
    id: int
    level: str
    message: str
    context_json: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class SequenceStatusOut(BaseModel):
    id: int
    name: str
    status: str
    stop_on_failure: bool
    steps: List[SequenceStepOut] = []
    step_results: List[SequenceStepResultOut] = []
    logs: List[SequenceLogOut] = []
    updated_at: Optional[datetime]

