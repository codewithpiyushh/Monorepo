from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from ..database import get_db
from ..models.models import User
from ..rbac.dependencies import role_required
from ..services.close_task_service import CloseTaskService

router = APIRouter(prefix="/api/v1/close-tasks", tags=["Close Tasks"])

class CloseTaskUpdate(BaseModel):
    status: str

class CloseTaskOut(BaseModel):
    id: int
    calendar_id: int
    profile_id: Optional[int] = None
    task_name: str
    task_type: str
    description: Optional[str] = None
    assigned_to: Optional[int] = None
    due_date: Optional[str] = None
    status: str
    completion_pct: float
    completed_at: Optional[datetime] = None
    completed_by: Optional[int] = None
    
    class Config:
        from_attributes = True

@router.get("/", response_model=List[CloseTaskOut])
def get_close_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(["preparer", "admin"]))
):
    tasks = CloseTaskService.get_tasks_for_preparer(db, preparer_id=current_user.id)
    return tasks

@router.patch("/{task_id}", response_model=CloseTaskOut)
def update_close_task_status(
    task_id: int,
    payload: CloseTaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(["preparer", "admin"]))
):
    valid_statuses = {"NOT_STARTED", "IN_PROGRESS", "COMPLETE"}
    if payload.status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    updated_task = CloseTaskService.update_task_status(
        db=db,
        task_id=task_id,
        new_status=payload.status,
        user_id=current_user.id
    )
    if not updated_task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    return updated_task
