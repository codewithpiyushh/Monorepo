from typing import List, Tuple
from sqlalchemy.orm import Session
from fastapi import HTTPException
from rapidfuzz import fuzz
from ..models.models import Dataset, Mapping
from ..schemas.schemas import MappingCreate


def auto_map_columns(
    db: Session, project_id: int
) -> List[Tuple[str, str, float]]:
    """Return suggested (source_col, target_col, similarity_score) pairs."""
    source_ds = (
        db.query(Dataset)
        .filter(Dataset.project_id == project_id, Dataset.dataset_type == "source")
        .first()
    )
    target_ds = (
        db.query(Dataset)
        .filter(Dataset.project_id == project_id, Dataset.dataset_type == "target")
        .first()
    )
    if not source_ds or not target_ds:
        raise HTTPException(
            status_code=400,
            detail="Both source and target datasets must be uploaded first",
        )

    src_cols = [c.column_name for c in source_ds.columns]
    tgt_cols = [c.column_name for c in target_ds.columns]

    suggestions = []
    used_targets = set()

    for src in src_cols:
        best_score = 0
        best_tgt = None
        for tgt in tgt_cols:
            if tgt in used_targets:
                continue
            score = fuzz.token_sort_ratio(src.lower(), tgt.lower()) / 100.0
            if score > best_score:
                best_score = score
                best_tgt = tgt
        if best_tgt and best_score >= 0.3:
            suggestions.append((src, best_tgt, round(best_score, 3)))
            used_targets.add(best_tgt)

    return suggestions


def save_mappings(db: Session, project_id: int, mappings: List[MappingCreate]) -> List[Mapping]:
    # Delete existing
    db.query(Mapping).filter(Mapping.project_id == project_id).delete()
    db.commit()

    new_mappings = []
    for m in mappings:
        mapping = Mapping(
            project_id=project_id,
            source_column=m.source_column,
            target_column=m.target_column,
            is_key_field=m.is_key_field,
        )
        db.add(mapping)
        new_mappings.append(mapping)

    db.commit()
    for m in new_mappings:
        db.refresh(m)
    return new_mappings


def get_mappings(db: Session, project_id: int) -> List[Mapping]:
    return db.query(Mapping).filter(Mapping.project_id == project_id).all()
