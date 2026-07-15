import json
import io
import pandas as pd
from typing import List
from sqlalchemy.orm import Session
from fastapi import HTTPException, UploadFile
from ..models.models import Dataset, ColumnMetadata, DataRow
from ..schemas.schemas import DataPreview


def _infer_dtype(series: pd.Series) -> str:
    if pd.api.types.is_integer_dtype(series):
        return "integer"
    if pd.api.types.is_float_dtype(series):
        return "float"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"
    return "string"


async def upload_dataset(
    db: Session,
    project_id: int,
    dataset_type: str,
    file: UploadFile,
) -> Dataset:
    content = await file.read()
    filename = file.filename or "upload"

    try:
        if filename.lower().endswith(".xlsx") or filename.lower().endswith(".xls"):
            df = pd.read_excel(io.BytesIO(content))
        else:
            df = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse file: {e}")

    df = df.where(pd.notnull(df), None)
    df.columns = [str(c).strip() for c in df.columns]

    # Remove existing dataset of same type for this project
    existing = (
        db.query(Dataset)
        .filter(Dataset.project_id == project_id, Dataset.dataset_type == dataset_type)
        .first()
    )
    if existing:
        db.delete(existing)
        db.commit()

    dataset = Dataset(
        project_id=project_id,
        name=filename,
        dataset_type=dataset_type,
        file_name=filename,
        row_count=len(df),
    )
    db.add(dataset)
    db.flush()

    # Column metadata
    for idx, col in enumerate(df.columns):
        sample = df[col].dropna().head(5).tolist()
        col_meta = ColumnMetadata(
            dataset_id=dataset.id,
            column_name=col,
            data_type=_infer_dtype(df[col]),
            sample_values=json.dumps([str(v) for v in sample]),
            column_index=idx,
        )
        db.add(col_meta)

    # Data rows (bulk insert)
    rows_to_add = []
    for row_idx, row in df.iterrows():
        rows_to_add.append(
            DataRow(
                dataset_id=dataset.id,
                row_index=int(row_idx),
                data=json.dumps(
                    {k: (None if v is None else str(v)) for k, v in row.to_dict().items()}
                ),
            )
        )
        if len(rows_to_add) >= 500:
            db.add_all(rows_to_add)
            db.flush()
            rows_to_add = []

    if rows_to_add:
        db.add_all(rows_to_add)

    db.commit()
    db.refresh(dataset)
    return dataset


def get_dataset_preview(db: Session, dataset_id: int, limit: int = 20) -> DataPreview:
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    columns = [c.column_name for c in sorted(dataset.columns, key=lambda x: x.column_index)]
    rows = (
        db.query(DataRow)
        .filter(DataRow.dataset_id == dataset_id)
        .order_by(DataRow.row_index)
        .limit(limit)
        .all()
    )
    row_data = [json.loads(r.data) for r in rows]

    return DataPreview(columns=columns, rows=row_data, total_rows=dataset.row_count)


def get_datasets_for_project(db: Session, project_id: int) -> List[Dataset]:
    return (
        db.query(Dataset)
        .filter(Dataset.project_id == project_id)
        .all()
    )
