from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, Form, Request, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas.schemas import DatasetOut, DataPreview
from ..services import dataset_service, audit_service
from ..core.dependencies import get_current_user

router = APIRouter(prefix="/api/projects/{project_id}/datasets", tags=["datasets"])


@router.post("", response_model=DatasetOut, status_code=201)
async def upload_dataset(
    project_id: int,
    dataset_type: str = Form(...),
    file: UploadFile = File(...),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if dataset_type not in ("source", "target"):
        raise HTTPException(status_code=422, detail="dataset_type must be 'source' or 'target'")

    dataset = await dataset_service.upload_dataset(db, project_id, dataset_type, file)
    audit_service.log_action(
        db, "DATASET_UPLOADED", user_id=current_user.id,
        entity_type="dataset", entity_id=dataset.id,
        metadata={
            "project_id": project_id,
            "dataset_type": dataset_type,
            "file_name": dataset.file_name,
            "row_count": dataset.row_count,
        },
        ip_address=request.client.host if request and request.client else None,
    )
    return dataset


@router.get("", response_model=List[DatasetOut])
def list_datasets(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return dataset_service.get_datasets_for_project(db, project_id)


@router.get("/{dataset_id}/preview", response_model=DataPreview)
def preview_dataset(
    project_id: int,
    dataset_id: int,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return dataset_service.get_dataset_preview(db, dataset_id, limit=limit)
