import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..core.dependencies import get_current_user
from ..database import get_db
from ..models.models import (
    AuditLog,
    Execution as Reconciliation,
    Result as Transaction,
    Mapping,
    Sequence,
    SequenceStepResult,
)
from ..services import export_service

router = APIRouter(prefix="/api", tags=["exports"])


def _parse_columns(columns: Optional[str]) -> Optional[List[str]]:
    if not columns:
        return None
    parsed = [item.strip() for item in columns.split(",") if item.strip()]
    return parsed or None


def _build_metadata(reconciliation: Reconciliation, generated_by: str) -> dict:
    return {
        "generated_by": generated_by,
        "generated_at": reconciliation.completed_at.isoformat() if reconciliation.completed_at else None,
        "project_id": reconciliation.project_id,
        "reconciliation_type": "execution_run",
    }


def _fetch_reconciliation_or_404(db: Session, reconciliation_id: int) -> Reconciliation:
    reconciliation = db.query(Reconciliation).filter(Reconciliation.id == reconciliation_id).first()
    if not reconciliation:
        raise HTTPException(status_code=404, detail="Reconciliation not found")
    return reconciliation


def _fetch_transactions(
    db: Session, reconciliation_id: int, status: str = "all", exceptions_only: bool = False
) -> List[Transaction]:
    query = db.query(Transaction).filter(Transaction.execution_id == reconciliation_id)
    if status in {"matched", "unmatched", "partial"}:
        query = query.filter(Transaction.match_status == status)
    if exceptions_only:
        query = query.filter(Transaction.match_status.in_(["unmatched", "partial"]))
    return query.order_by(Transaction.id.asc()).all()


def _fetch_sequence_or_404(db: Session, sequence_id: int) -> Sequence:
    sequence = db.query(Sequence).filter(Sequence.id == sequence_id).first()
    if not sequence:
        raise HTTPException(status_code=404, detail="Sequence not found")
    return sequence


def _build_unit_export_rows(records: List[Transaction], mappings: List[Mapping]) -> tuple[list, list]:
    units = {}
    tx_rows = []
    for record in records:
        source_data = json.loads(record.source_data) if record.source_data else {}
        target_data = json.loads(record.target_data) if record.target_data else {}

        entity = "Unassigned"
        account = "General"
        for m in mappings:
            s = m.source_column.lower()
            t = m.target_column.lower()
            if entity == "Unassigned" and (("entity" in s) or ("entity" in t) or ("company" in s) or ("company" in t)):
                entity = str(source_data.get(m.source_column) or target_data.get(m.target_column) or "Unassigned")
            if account == "General" and (("account" in s) or ("account" in t) or ("ledger" in s) or ("ledger" in t) or ("gl" in s) or ("gl" in t)):
                account = str(source_data.get(m.source_column) or target_data.get(m.target_column) or "General")

        key = f"{entity}::{account}"
        if key not in units:
            units[key] = {
                "entity": entity, "account": account, "matched_count": 0, "partial_count": 0, "unmatched_count": 0
            }

        if record.match_status == "matched":
            units[key]["matched_count"] += 1
        elif record.match_status == "partial":
            units[key]["partial_count"] += 1
        else:
            units[key]["unmatched_count"] += 1

        tx_rows.append({
            "entity": entity,
            "account": account,
            "transaction_id": record.id,
            "status": record.match_status,
            "score": record.match_score,
            "source_row_index": record.source_row_index,
            "target_row_index": record.target_row_index,
            "source_data": json.dumps(source_data),
            "target_data": json.dumps(target_data),
        })

    unit_rows = []
    for unit in units.values():
        total = unit["matched_count"] + unit["partial_count"] + unit["unmatched_count"]
        status = "matched"
        if unit["unmatched_count"] > 0:
            status = "unmatched"
        elif unit["partial_count"] > 0:
            status = "partial"
        unit_rows.append({
            "entity": unit["entity"],
            "account": unit["account"],
            "status": status,
            "total_transactions": total,
            "matched_count": unit["matched_count"],
            "partial_count": unit["partial_count"],
            "unmatched_count": unit["unmatched_count"],
        })
    return unit_rows, tx_rows


@router.get("/reconciliation/{id}/export")
def export_reconciliation_report(
    id: int,
    status: str = Query("all", pattern="^(all|matched|unmatched|partial)$"),
    format: str = Query("xlsx", pattern="^(xlsx|csv)$"),
    columns: Optional[str] = Query(None, description="Comma-separated column list"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    reconciliation = _fetch_reconciliation_or_404(db, id)
    if reconciliation.status != "completed":
        raise HTTPException(status_code=400, detail="Reconciliation is not completed yet")

    records = _fetch_transactions(db, id, status=status)
    if not records:
        raise HTTPException(status_code=404, detail="No records found for export")

    normalized_rows = export_service.format_reconciliation_data(records)
    matched = [row for row in normalized_rows if row.get("status") == "matched"]
    unmatched = [row for row in normalized_rows if row.get("status") != "matched"]
    summary = export_service.calculate_summary(matched, unmatched)
    metadata = _build_metadata(reconciliation, generated_by=current_user.username)
    mappings = db.query(Mapping).filter(Mapping.project_id == reconciliation.project_id).all()
    unit_summary, transactions_detail = _build_unit_export_rows(records, mappings)
    selected_columns = _parse_columns(columns)

    if format == "csv":
        file_data = export_service.generate_csv_report(normalized_rows, selected_columns)
        filename = export_service.build_filename("recon", id, "csv")
        media_type = "text/csv"
    else:
        file_data = export_service.generate_excel_report(
            {
                "matched": matched,
                "unmatched": unmatched,
                "summary": summary,
                "metadata": metadata,
                "columns": selected_columns,
                "unit_summary": unit_summary,
                "transactions": transactions_detail,
            }
        )
        filename = export_service.build_filename("recon", id, "xlsx")
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    return StreamingResponse(
        file_data,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/reconciliation/{id}/export/exceptions")
def export_reconciliation_exceptions(
    id: int,
    format: str = Query("xlsx", pattern="^(xlsx|csv)$"),
    columns: Optional[str] = Query(None, description="Comma-separated column list"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    reconciliation = _fetch_reconciliation_or_404(db, id)
    if reconciliation.status != "completed":
        raise HTTPException(status_code=400, detail="Reconciliation is not completed yet")

    records = _fetch_transactions(db, id, exceptions_only=True)
    if not records:
        raise HTTPException(status_code=404, detail="No exception records found")

    normalized_rows = export_service.format_reconciliation_data(records)
    summary = export_service.calculate_summary([], normalized_rows)
    metadata = _build_metadata(reconciliation, generated_by=current_user.username)
    mappings = db.query(Mapping).filter(Mapping.project_id == reconciliation.project_id).all()
    unit_summary, transactions_detail = _build_unit_export_rows(records, mappings)
    selected_columns = _parse_columns(columns)

    if format == "csv":
        file_data = export_service.generate_csv_report(normalized_rows, selected_columns)
        filename = export_service.build_filename("recon_exceptions", id, "csv")
        media_type = "text/csv"
    else:
        file_data = export_service.generate_excel_report(
            {
                "matched": [],
                "unmatched": normalized_rows,
                "summary": summary,
                "metadata": metadata,
                "columns": selected_columns,
                "unit_summary": unit_summary,
                "transactions": transactions_detail,
            }
        )
        filename = export_service.build_filename("recon_exceptions", id, "xlsx")
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    return StreamingResponse(
        file_data,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/audit/export")
def export_audit_report(
    format: str = Query("xlsx", pattern="^(xlsx|csv)$"),
    columns: Optional[str] = Query(None, description="Comma-separated column list"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    audit_rows = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).all()
    if not audit_rows:
        raise HTTPException(status_code=404, detail="No audit data found")

    normalized = []
    for row in audit_rows:
        metadata = json.loads(row.metadata_json) if row.metadata_json else {}
        normalized.append(
            {
                "transaction_id": row.id,
                "source_amount": None,
                "target_amount": None,
                "difference": None,
                "status": row.action_type,
                "entity_type": row.entity_type,
                "entity_id": row.entity_id,
                "username": row.user.username if row.user else "system",
                "ip_address": row.ip_address,
                "timestamp": row.timestamp.isoformat() if row.timestamp else None,
                "metadata": json.dumps(metadata) if metadata else "",
            }
        )

    selected_columns = _parse_columns(columns) or [
        "transaction_id",
        "status",
        "entity_type",
        "entity_id",
        "username",
        "ip_address",
        "timestamp",
        "metadata",
    ]

    if format == "csv":
        file_data = export_service.generate_csv_report(normalized, selected_columns)
        filename = export_service.build_filename("audit", 0, "csv")
        media_type = "text/csv"
    else:
        file_data = export_service.generate_excel_report(
            {
                "matched": normalized,
                "unmatched": [],
                "summary": {
                    "total_records": len(normalized),
                    "matched_count": len(normalized),
                    "unmatched_count": 0,
                    "match_percentage": 100.0,
                },
                "metadata": {
                    "generated_by": current_user.username,
                    "generated_at": None,
                    "project_id": None,
                    "reconciliation_type": "audit_export",
                },
                "columns": selected_columns,
            }
        )
        filename = export_service.build_filename("audit", 0, "xlsx")
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    return StreamingResponse(
        file_data,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/sequences/{id}/export")
def export_sequence_report(
    id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    sequence = _fetch_sequence_or_404(db, id)
    step_results = (
        db.query(SequenceStepResult)
        .filter(SequenceStepResult.sequence_id == id)
        .order_by(SequenceStepResult.id.asc())
        .all()
    )
    execution_ids = [r.execution_id for r in step_results if r.execution_id]
    if not execution_ids:
        raise HTTPException(status_code=404, detail="No execution results found for sequence")

    import pandas as pd
    from io import BytesIO

    summary_rows = []
    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        for idx, step_result in enumerate(step_results, start=1):
            if not step_result.execution_id:
                summary_rows.append(
                    {
                        "step": idx,
                        "execution_id": None,
                        "status": step_result.status,
                        "error_message": step_result.error_message,
                    }
                )
                continue

            execution = db.query(Reconciliation).filter(Reconciliation.id == step_result.execution_id).first()
            if not execution:
                continue
            transactions = (
                db.query(Transaction)
                .filter(Transaction.execution_id == execution.id)
                .order_by(Transaction.id.asc())
                .all()
            )
            normalized = export_service.format_reconciliation_data(transactions)
            df = pd.DataFrame(normalized)
            if df.empty:
                df = pd.DataFrame(columns=export_service.DEFAULT_EXPORT_COLUMNS)
            df.to_excel(writer, index=False, sheet_name=f"Recon_{execution.id}"[:31])

            stats = json.loads(execution.stats) if execution.stats else {}
            summary_rows.append(
                {
                    "step": idx,
                    "execution_id": execution.id,
                    "project_id": execution.project_id,
                    "status": execution.status,
                    "matched": stats.get("matched"),
                    "unmatched": stats.get("unmatched"),
                    "partial": stats.get("partial"),
                    "match_rate": stats.get("match_rate"),
                }
            )

        summary_df = pd.DataFrame(summary_rows)
        if summary_df.empty:
            summary_df = pd.DataFrame(columns=["step", "execution_id", "status", "error_message"])
        summary_df.to_excel(writer, index=False, sheet_name="Summary")

    output.seek(0)
    filename = export_service.build_filename(f"sequence_{sequence.id}", sequence.id, "xlsx")
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
