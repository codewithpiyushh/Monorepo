from typing import List, Optional
from sqlalchemy.orm import Session
from ..models.models import CloseTask
from datetime import datetime

class CloseTaskService:
    @staticmethod
    def get_tasks_for_preparer(db: Session, preparer_id: int) -> List[CloseTask]:
        return db.query(CloseTask).filter(CloseTask.assigned_to == preparer_id).all()

    @staticmethod
    def update_task_status(db: Session, task_id: int, new_status: str, user_id: int) -> Optional[CloseTask]:
        task = db.query(CloseTask).filter(CloseTask.id == task_id).first()
        if not task:
            return None
        
        task.status = new_status
        task.updated_at = datetime.utcnow()
        if new_status == "COMPLETE":
            task.completed_at = datetime.utcnow()
            task.completed_by = user_id
        
        db.commit()
        db.refresh(task)
        return task
