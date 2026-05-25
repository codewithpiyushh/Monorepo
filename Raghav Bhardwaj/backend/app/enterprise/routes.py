from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..core.dependencies import get_current_user
from ..rbac.dependencies import role_required
from ..rbac.roles import ADMIN, REVIEWER, PREPARER, APPROVER, CERTIFIER
from ..models.models import ReconciliationAttachment, AuditPackage
from .schemas import (
    IngestionBatchCreate,
    ProfileCreate,
    ProfileUpdate,
    MatchRequest,
    MatchSuggestionRequest,
    WorkflowActionRequest,
    FinancialCloseCalendarCreate,
    FinancialCloseCalendarAction,
    CertificationCreateRequest,
    CertificationActionRequest,
    RuleDefinitionCreate,
    RuleDefinitionUpdate,
    DataImportRequest,
    ValidationRunRequest,
    ExceptionCommentRequest,
    ExceptionStatusRequest,
    ExceptionClassifyRequest,
    EvidenceVersionRequest,
    OCRExtractRequest,
    DocumentPreviewRequest,
    AuditPackageRequest,
    SnapshotCreateRequest,
    SnapshotRestoreRequest,
    SnapshotCompareRequest,
    ExchangeRateCreate,
    CurrencyConvertRequest,
    JournalAdjustmentCreate,
    JournalAdjustmentAction,
    AutoJournalRequest,
    BulkActionRequest,
    AdvancedSearchRequest,
    CommentCreateRequest,
    ScheduleReportRequest,
    RetentionPolicyRequest,
    EnterpriseSettingRequest,
    DependencyRequest,
    ArchiveRequest,
)
from . import service, repository

router = APIRouter(prefix="/api/enterprise", tags=["enterprise-reconciliation"])


@router.post("/ingestion/batches")
def create_batch(payload: IngestionBatchCreate, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, PREPARER]))):
    try:
        b = service.create_ingestion_batch(db, payload.source_system, payload.metadata, payload.records, current_user.id)
        return {"batch_id": b.batch_id, "status": b.ingestion_status}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/ingestion/{batch_id}/transform")
def transform_batch(batch_id: str, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, PREPARER]))):
    try:
        return service.transform_batch(db, batch_id, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/ingestion/{batch_id}/validate")
def validate_batch(batch_id: str, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, PREPARER]))):
    try:
        return service.validate_batch(db, batch_id, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/ingestion/{batch_id}/load/{profile_id}")
def load_batch(batch_id: str, profile_id: int, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, PREPARER]))):
    try:
        return service.load_validated_to_reconciliation(db, batch_id, profile_id, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/ingestion/summary")
def ingestion_summary(db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    return service.get_ingestion_summary(db)


@router.post("/profiles")
def create_profile(payload: ProfileCreate, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    return repository.create_profile(db, payload)


@router.get("/profiles")
def list_profiles(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return repository.list_profiles(db, role=current_user.role, user_id=current_user.id)


@router.get("/profiles/{profile_id}/transactions")
def list_profile_transactions(profile_id: int, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER]))):
    try:
        return service.profile_transactions_analytics(db, profile_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.patch("/profiles/{profile_id}")
def update_profile(profile_id: int, payload: ProfileUpdate, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    try:
        raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
        update_payload = {k: v for k, v in raw.items() if v is not None}
        return service.update_profile(db, profile_id, update_payload, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/profiles/{profile_id}")
def delete_profile(profile_id: int, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    try:
        return service.delete_profile(db, profile_id, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/matching/run")
def run_matching(payload: MatchRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, PREPARER]))):
    try:
        return service.run_matching(db, payload.profile_id, payload.strategy, payload.auto_match_threshold, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/matching/suggestions")
def matching_suggestions(payload: MatchSuggestionRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, PREPARER, REVIEWER]))):
    try:
        return service.match_suggestions(
            db,
            profile_id=payload.profile_id,
            top_k=payload.top_k,
            min_confidence=payload.min_confidence,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/exceptions")
def list_exceptions(queue_type: str | None = None, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER]))):
    return service.list_exceptions(db, queue_type, current_user.role, current_user.id)


@router.get("/notifications")
def list_notifications(limit: int = 12, unread_only: bool = False, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER]))):
    """Get paginated list of notifications for current user"""
    return service.list_notifications(db, current_user.id, unread_only, limit, offset)


@router.put("/notifications/{notification_id}/read")
def mark_notification_read(notification_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Mark single notification as read"""
    try:
        return service.mark_notification_read(db, notification_id, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/notifications/mark-all-read")
def mark_all_read(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Mark all notifications as read for current user"""
    try:
        return service.mark_all_notifications_read(db, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/notifications/{notification_id}")
def delete_notification(notification_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Delete a single notification"""
    try:
        return service.delete_notification(db, notification_id, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/exceptions/assign")
def assign_exception(payload: WorkflowActionRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    if payload.assigned_to is None:
        raise HTTPException(status_code=400, detail="assigned_to is required")
    try:
        return service.assign_exception(db, payload.exception_id, payload.assigned_to, payload.comments, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/exceptions/submit")
def submit_exception(payload: WorkflowActionRequest, db: Session = Depends(get_db), current_user=Depends(role_required([PREPARER, ADMIN]))):
    try:
        return service.submit_exception(db, payload.exception_id, payload.comments, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/exceptions/approve")
def approve_exception(payload: WorkflowActionRequest, db: Session = Depends(get_db), current_user=Depends(role_required([REVIEWER, ADMIN]))):
    try:
        return service.review_exception(db, payload.exception_id, True, payload.comments, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/exceptions/reject")
def reject_exception(payload: WorkflowActionRequest, db: Session = Depends(get_db), current_user=Depends(role_required([REVIEWER, ADMIN]))):
    try:
        return service.review_exception(db, payload.exception_id, False, payload.comments, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/records/{record_id}/finalize")
def finalize_record(record_id: int, db: Session = Depends(get_db), current_user=Depends(role_required([REVIEWER, ADMIN]))):
    try:
        return service.finalize_reconciliation_record(db, record_id, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/records/{record_id}/attachments")
def upload_attachment(
    record_id: int,
    document_type: str = Form(...),
    document_name: str = Form(...),
    document_path: str | None = Form(None),
    file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    current_user=Depends(role_required([PREPARER, ADMIN])),
):
    try:
        return service.upload_attachment(db, record_id, document_type, document_name, document_path, current_user.id, file)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/records/{record_id}/attachments")
def list_attachments(record_id: int, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER]))):
    return db.query(ReconciliationAttachment).filter(ReconciliationAttachment.reconciliation_record_id == record_id).all()


@router.post("/close-calendar")
def create_close_calendar(payload: FinancialCloseCalendarCreate, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    try:
        raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
        return service.create_close_calendar(db, raw, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/close-calendar")
def list_close_calendar(profile_id: int | None = None, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER]))):
    return repository.list_close_calendars(db, profile_id=profile_id)


@router.post("/close-calendar/lock")
def lock_period(payload: FinancialCloseCalendarAction, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    try:
        return service.lock_period(db, payload.calendar_id, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/close-calendar/unlock")
def unlock_period(payload: FinancialCloseCalendarAction, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    try:
        return service.unlock_period(db, payload.calendar_id, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/certification/workflows")
def create_certification_workflow(payload: CertificationCreateRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    try:
        raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
        return service.create_certification_workflow(db, raw, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/certification/workflows")
def list_certification_workflows(profile_id: int | None = None, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER]))):
    return repository.list_certification_workflows(db, profile_id=profile_id)


@router.post("/certification/workflows/action")
def action_certification_workflow(payload: CertificationActionRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER, APPROVER, CERTIFIER]))):
    try:
        return service.action_certification_workflow(
            db,
            workflow_id=payload.workflow_id,
            action=payload.action,
            actor_id=current_user.id,
            actor_role=current_user.role,
            comments=payload.comments,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/certification/workflows/{workflow_id}/history")
def certification_workflow_history(workflow_id: int, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER, APPROVER, CERTIFIER]))):
    return service.get_certification_history(db, workflow_id)


@router.get("/templates/reconciliation")
def reconciliation_templates(current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER, APPROVER, CERTIFIER]))):
    return service.build_reconciliation_templates()


@router.post("/rule-definitions")
def create_rule_definition(payload: RuleDefinitionCreate, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    try:
        raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
        return service.create_rule_definition(db, raw, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/rule-definitions")
def list_rule_definitions(profile_id: int | None = None, template_type: str | None = None, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER, APPROVER, CERTIFIER]))):
    return service.list_rule_definitions(db, profile_id, template_type)


@router.patch("/rule-definitions/{rule_id}")
def update_rule_definition(rule_id: int, payload: RuleDefinitionUpdate, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    try:
        raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
        clean = {k: v for k, v in raw.items() if v is not None}
        return service.update_rule_definition(db, rule_id, clean)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/rule-definitions/{rule_id}")
def delete_rule_definition(rule_id: int, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    try:
        return service.delete_rule_definition(db, rule_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/dashboard/executive")
def executive_dashboard(db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    return service.get_dashboard_metrics(db, "admin", current_user.id)


@router.get("/dashboard/reviewer")
def reviewer_dashboard(db: Session = Depends(get_db), current_user=Depends(role_required([REVIEWER, APPROVER, ADMIN]))):
    return service.get_dashboard_metrics(db, "reviewer", current_user.id)


@router.get("/dashboard/preparer")
def preparer_dashboard(db: Session = Depends(get_db), current_user=Depends(role_required([PREPARER, ADMIN]))):
    return service.get_dashboard_metrics(db, "preparer", current_user.id)


@router.get("/analytics/explorer")
def analytics_explorer(db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER]))):
    try:
        return service.reconciliation_analytics_explorer(db, current_user.role, current_user.id)
    except Exception:
        # Keep analytics UI functional on partially-migrated environments.
        return {"profiles": [], "transactions": [], "exceptions": []}


@router.post("/aging/reminders/generate")
def generate_reminders(db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    return service.generate_aging_and_reminders(db)


@router.get("/risk-score/{profile_id}")
def risk_score(profile_id: int, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, APPROVER]))):
    try:
        return service.calculate_risk_score(db, profile_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/ingestion/import")
def import_data(payload: DataImportRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, PREPARER]))):
    try:
        raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
        return service.import_transactions(
            db,
            source_type=raw["source_type"],
            project_id=raw["project_id"],
            dataset_type=raw["dataset_type"],
            payload=raw["payload"],
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/validation/run")
def run_enterprise_validation(payload: ValidationRunRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, PREPARER]))):
    try:
        return service.run_enterprise_validations(db, payload.batch_id, payload.profile_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/exceptions/classify")
def classify_exception(payload: ExceptionClassifyRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER]))):
    try:
        return service.classify_exception(db, payload.exception_id, payload.classification, payload.comments, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/exceptions/comment")
def add_exception_comment(payload: ExceptionCommentRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER]))):
    try:
        return service.add_exception_comment(db, payload.exception_id, payload.comment, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/exceptions/{exception_id}/comments")
def list_exception_comments(exception_id: int, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER]))):
    return service.list_exception_comments(db, exception_id)


@router.post("/exceptions/resolve")
def resolve_exception(payload: ExceptionStatusRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER]))):
    try:
        return service.resolve_exception(db, payload.exception_id, payload.comments, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/exceptions/escalate")
def escalate_exception(payload: ExceptionStatusRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER]))):
    try:
        return service.escalate_exception(db, payload.exception_id, payload.comments, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/exceptions/reopen")
def reopen_exception(payload: ExceptionStatusRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER]))):
    try:
        return service.reopen_exception(db, payload.exception_id, payload.comments, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/evidence/ocr")
def ocr_extract(payload: OCRExtractRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER]))):
    try:
        return service.ocr_extract_evidence(db, payload.attachment_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/evidence/preview")
def preview_evidence(payload: DocumentPreviewRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER]))):
    try:
        return service.preview_evidence(db, payload.attachment_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/evidence/version")
def create_evidence_version(payload: EvidenceVersionRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, PREPARER]))):
    try:
        raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
        return service.create_evidence_version(db, raw["attachment_id"], raw, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/evidence/{attachment_id}/history")
def evidence_history(attachment_id: int, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER]))):
    return service.list_evidence_history(db, attachment_id)


@router.post("/audit/package")
def create_audit_package(payload: AuditPackageRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER]))):
    try:
        return service.build_audit_package(db, payload.reconciliation_id, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/snapshots")
def create_snapshot(payload: SnapshotCreateRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER]))):
    try:
        return service.create_snapshot(db, payload.profile_id, payload.period_key, payload.snapshot_name, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/snapshots/restore")
def restore_snapshot(payload: SnapshotRestoreRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    try:
        return service.restore_snapshot(db, payload.snapshot_id, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/snapshots/compare")
def compare_snapshots(payload: SnapshotCompareRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER]))):
    try:
        return service.compare_snapshots(db, payload.base_snapshot_id, payload.compare_snapshot_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/audit/package/{package_id}/download")
def download_audit_package(package_id: int, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER]))):
    row = db.query(AuditPackage).filter(AuditPackage.id == package_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Audit package not found")
    return FileResponse(path=row.package_path, filename=row.package_path.split("\\")[-1], media_type="application/zip")


@router.post("/fx/rates")
def create_fx_rate(payload: ExchangeRateCreate, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    return service.create_exchange_rate(db, raw)


@router.post("/fx/convert")
def convert_fx(payload: CurrencyConvertRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER]))):
    return service.convert_currency(db, payload.amount, payload.from_currency, payload.to_currency, payload.conversion_date)


@router.get("/fx/reconciliation/{profile_id}")
def fx_reconciliation(profile_id: int, reporting_currency: str, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER]))):
    return service.fx_reconciliation(db, profile_id, reporting_currency)


@router.post("/journals")
def create_journal(payload: JournalAdjustmentCreate, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, PREPARER]))):
    raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    return service.create_journal_adjustment(db, raw, current_user.id)


@router.post("/journals/{adjustment_id}/{action}")
def journal_action(adjustment_id: int, action: str, payload: JournalAdjustmentAction, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, APPROVER]))):
    return service.journal_action(db, adjustment_id, action, current_user.id, payload.comments)


@router.post("/journals/auto")
def auto_journal(payload: AutoJournalRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, PREPARER]))):
    raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    return service.auto_generate_journal_adjustments(db, raw, current_user.id)


@router.get("/variance/{profile_id}")
def variance(profile_id: int, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER]))):
    return service.variance_analysis(db, profile_id)


@router.post("/search")
def advanced_search(payload: AdvancedSearchRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER]))):
    raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    return service.advanced_search(db, raw)


@router.post("/bulk-actions")
def bulk_actions(payload: BulkActionRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER]))):
    raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    return service.bulk_action(db, raw, current_user.id)


@router.post("/comments")
def add_comment(payload: CommentCreateRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER]))):
    raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    return service.add_comment(db, raw, current_user.id)


@router.get("/comments/{profile_id}")
def list_comments(profile_id: int, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER]))):
    return service.list_comments(db, profile_id)


@router.post("/reports/schedule")
def schedule_report(payload: ScheduleReportRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    row = service.create_scheduled_report(db, raw, current_user.id)
    return {"schedule_id": row.id, "report_type": row.report_type, "recipients": payload.recipients}


@router.get("/reports/schedule")
def list_report_schedules(db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    return service.list_scheduled_reports(db)


@router.post("/retention/policies")
def create_retention_policy(payload: RetentionPolicyRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    return service.create_retention_policy(db, raw, current_user.id)


@router.get("/retention/policies")
def list_retention_policies(db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER]))):
    return service.list_retention_policies(db)


@router.post("/retention/run")
def run_retention_cycle(db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    return service.run_retention_cycle(db)


@router.post("/settings")
def upsert_setting(payload: EnterpriseSettingRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    return service.upsert_enterprise_setting(db, raw, current_user.id)


@router.get("/settings")
def list_settings(category: str | None = None, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER]))):
    return service.list_enterprise_settings(db, category)


@router.post("/dependencies")
def create_dependency(payload: DependencyRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER]))):
    raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    return service.create_dependency(db, raw, current_user.id)


@router.get("/dependencies")
def list_dependencies(profile_id: int | None = None, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER]))):
    return service.list_dependencies(db, profile_id)


@router.post("/archive")
def archive_period(payload: ArchiveRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER]))):
    return service.archive_period(db, payload.profile_id, payload.period_key, current_user.id)


@router.post("/archive/{archive_id}/restore")
def restore_archive(archive_id: int, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    return service.restore_archive(db, archive_id, current_user.id)


@router.post("/backup")
def create_backup(db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    return service.create_backup(db, current_user.id, "full")


@router.get("/metrics/jobs")
def job_metrics(db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER]))):
    return service.get_job_metrics(db, 100)


# --- Analytics & Risk endpoints (scaffold) ---
@router.get("/analytics/summary")
def analytics_summary(period: str | None = None, entity: str | None = None, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER]))):
    """Executive summary KPIs for analytics explorer"""
    return service.analytics_dashboard_summary(db, period=period, entity=entity, user_id=current_user.id)


@router.get("/analytics/drilldown")
def analytics_drilldown(level: str = 'entity', key: str | None = None, limit: int = 50, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER]))):
    """Drilldown data for a specific level (entity/account/recon/exception)"""
    return service.analytics_drilldown(db, level=level, key=key, limit=limit, user_id=current_user.id)


@router.post("/risk/calculate")
def calculate_risk(db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER]))):
    """Trigger risk scoring batch run (async/cron in prod)"""
    return service.calculate_risk_scores(db, actor_id=current_user.id)


@router.get("/risk/heatmap")
def risk_heatmap(entity: str | None = None, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER]))):
    """Return a heatmap summary for risk dashboard"""
    return service.list_risk_heatmap(db, entity)


@router.get("/governance/policies")
def get_governance_policies(db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    return service.get_governance_policies(db)


@router.post("/governance/policies")
def upsert_governance_policy(payload: dict, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    raw = payload
    return service.upsert_governance_policy(db, raw, actor_id=current_user.id)


@router.post("/governance/enforce-approval")
def enforce_approval_policy(action: dict, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER]))):
    """Enforce approval policy for high/critical risk items"""
    return service.enforce_approval_policy(db, action, actor_id=current_user.id)
