from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from ..database import get_db
from ..core.dependencies import get_current_user
from ..rbac.dependencies import role_required
from ..rbac.roles import ADMIN, PREPARER, APPROVER, CERTIFIER
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
def ingestion_summary(db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
    return service.get_ingestion_summary(db)


@router.post("/profiles")
def create_profile(payload: ProfileCreate, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    return repository.create_profile(db, payload)


@router.get("/profiles")
def list_profiles(project_id: int | None = None, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
    return repository.list_profiles(db, role=current_user.role, user_id=current_user.id, project_id=project_id)


@router.get("/profiles/{profile_id}/transactions")
def list_profile_transactions(profile_id: int, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
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
def matching_suggestions(payload: MatchSuggestionRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, PREPARER, APPROVER]))):
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
def list_exceptions(queue_type: str | None = None, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
    return service.list_exceptions(db, queue_type, current_user.role, current_user.id)


@router.get("/notifications")
def list_notifications(limit: int = 12, unread_only: bool = False, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
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
def approve_exception(payload: WorkflowActionRequest, db: Session = Depends(get_db), current_user=Depends(role_required([APPROVER, ADMIN]))):
    try:
        return service.review_exception(db, payload.exception_id, True, payload.comments, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/exceptions/reject")
def reject_exception(payload: WorkflowActionRequest, db: Session = Depends(get_db), current_user=Depends(role_required([APPROVER, ADMIN]))):
    try:
        return service.review_exception(db, payload.exception_id, False, payload.comments, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/records/{record_id}/finalize")
def finalize_record(record_id: int, db: Session = Depends(get_db), current_user=Depends(role_required([APPROVER, ADMIN]))):
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
def list_attachments(record_id: int, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
    return db.query(ReconciliationAttachment).filter(ReconciliationAttachment.reconciliation_record_id == record_id).all()


@router.post("/close-calendar")
def create_close_calendar(payload: FinancialCloseCalendarCreate, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    try:
        raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
        return service.create_close_calendar(db, raw, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/close-calendar")
def list_close_calendar(profile_id: int | None = None, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
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
def list_certification_workflows(profile_id: int | None = None, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
    return repository.list_certification_workflows(db, profile_id=profile_id)


@router.post("/certification/workflows/action")
def action_certification_workflow(payload: CertificationActionRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
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
def certification_workflow_history(workflow_id: int, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
    return service.get_certification_history(db, workflow_id)


@router.get("/templates/reconciliation")
def reconciliation_templates(current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
    return service.build_reconciliation_templates()


@router.post("/rule-definitions")
def create_rule_definition(payload: RuleDefinitionCreate, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    try:
        raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
        return service.create_rule_definition(db, raw, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/rule-definitions")
def list_rule_definitions(profile_id: int | None = None, template_type: str | None = None, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
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
def executive_dashboard(db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, CERTIFIER, PREPARER]))):
    return service.get_dashboard_metrics(db, "admin", current_user.id)


@router.get("/dashboard/reviewer")
def reviewer_dashboard(db: Session = Depends(get_db), current_user=Depends(role_required([APPROVER, ADMIN]))):
    return service.get_dashboard_metrics(db, "reviewer", current_user.id)


@router.get("/dashboard/preparer")
def preparer_dashboard(db: Session = Depends(get_db), current_user=Depends(role_required([PREPARER, ADMIN]))):
    return service.get_dashboard_metrics(db, "preparer", current_user.id)


@router.get("/analytics/explorer")
def analytics_explorer(db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
    try:
        return service.reconciliation_analytics_explorer(db, current_user.role, current_user.id)
    except Exception:
        # Keep analytics UI functional on partially-migrated environments.
        return {"profiles": [], "transactions": [], "exceptions": []}


@router.post("/aging/reminders/generate")
def generate_reminders(db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    return service.generate_aging_and_reminders(db)


@router.get("/risk-score/{profile_id}")
def risk_score(profile_id: int, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
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
def classify_exception(payload: ExceptionClassifyRequest, db: Session = Depends(get_db), current_user=Depends(role_required([PREPARER, APPROVER, ADMIN]))):
    try:
        return service.classify_exception(db, payload.exception_id, payload.classification, payload.root_cause, payload.severity, payload.comments, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/exceptions/comment")
def add_exception_comment(payload: ExceptionCommentRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
    try:
        return service.add_exception_comment(db, payload.exception_id, payload.comment, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/exceptions/{exception_id}/comments")
def list_exception_comments(exception_id: int, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
    return service.list_exception_comments(db, exception_id)


@router.post("/exceptions/resolve")
def resolve_exception(payload: ExceptionStatusRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER]))):
    try:
        return service.resolve_exception(db, payload.exception_id, payload.comments, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/exceptions/escalate")
def escalate_exception(payload: ExceptionStatusRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER]))):
    try:
        return service.escalate_exception(db, payload.exception_id, payload.comments, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/exceptions/reopen")
def reopen_exception(payload: ExceptionStatusRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
    try:
        return service.reopen_exception(db, payload.exception_id, payload.comments, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/evidence/ocr")
def ocr_extract(payload: OCRExtractRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
    try:
        return service.ocr_extract_evidence(db, payload.attachment_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/evidence/preview")
def preview_evidence(payload: DocumentPreviewRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
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
def evidence_history(attachment_id: int, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
    return service.list_evidence_history(db, attachment_id)


@router.post("/audit/package")
def create_audit_package(payload: AuditPackageRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER]))):
    try:
        return service.build_audit_package(db, payload.reconciliation_id, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/snapshots")
def create_snapshot(payload: SnapshotCreateRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER]))):
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
def compare_snapshots(payload: SnapshotCompareRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
    try:
        return service.compare_snapshots(db, payload.base_snapshot_id, payload.compare_snapshot_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/audit/package/{package_id}/download")
def download_audit_package(package_id: int, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER]))):
    row = db.query(AuditPackage).filter(AuditPackage.id == package_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Audit package not found")
    return FileResponse(path=row.package_path, filename=row.package_path.split("\\")[-1], media_type="application/zip")


@router.post("/fx/rates")
def create_fx_rate(payload: ExchangeRateCreate, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    return service.create_exchange_rate(db, raw)


@router.post("/fx/convert")
def convert_fx(payload: CurrencyConvertRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
    return service.convert_currency(db, payload.amount, payload.from_currency, payload.to_currency, payload.conversion_date)


@router.get("/fx/reconciliation/{profile_id}")
def fx_reconciliation(profile_id: int, reporting_currency: str, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
    return service.fx_reconciliation(db, profile_id, reporting_currency)


@router.get("/journals")
def list_journals(
    profile_id: int | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, PREPARER, APPROVER, CERTIFIER])),
):
    """List journal adjustments, optionally filtered by profile."""
    from ..models.models import JournalAdjustment, User
    q = db.query(JournalAdjustment)
    if profile_id:
        q = q.filter(JournalAdjustment.profile_id == profile_id)
    adjustments = q.order_by(JournalAdjustment.id.desc()).limit(200).all()
    result = []
    for adj in adjustments:
        creator = db.query(User).filter(User.id == adj.created_by).first() if adj.created_by else None
        result.append({
            "id": adj.id, "profile_id": adj.profile_id,
            "account": adj.account, "period_key": adj.period_key,
            "amount": adj.amount, "currency": adj.currency,
            "reason": adj.reason, "status": adj.status,
            "created_by": adj.created_by,
            "created_by_username": creator.username if creator else None,
            "created_at": adj.created_at.isoformat() if adj.created_at else None,
            "erp_posting_reference": adj.erp_posting_reference,
        })
    return result


@router.post("/journals")
def create_journal(payload: JournalAdjustmentCreate, db: Session = Depends(get_db), current_user=Depends(role_required([PREPARER]))):
    raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    return service.create_journal_adjustment(db, raw, current_user.id)


@router.post("/journals/{adjustment_id}/{action}")
def journal_action(adjustment_id: int, action: str, payload: JournalAdjustmentAction, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER]))):
    return service.journal_action(db, adjustment_id, action, current_user.id, payload.comments)


@router.post("/journals/auto")
def auto_journal(payload: AutoJournalRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, PREPARER]))):
    raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    return service.auto_generate_journal_adjustments(db, raw, current_user.id)


@router.get("/variance/{profile_id}")
def variance(profile_id: int, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
    return service.variance_analysis(db, profile_id)


@router.post("/search")
def advanced_search(payload: AdvancedSearchRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
    raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    return service.advanced_search(db, raw)


@router.post("/bulk-actions")
def bulk_actions(payload: BulkActionRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER]))):
    raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    return service.bulk_action(db, raw, current_user.id)


@router.post("/comments")
def add_comment(payload: CommentCreateRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
    raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    return service.add_comment(db, raw, current_user.id)


@router.get("/comments/{profile_id}")
def list_comments(profile_id: int, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
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
def list_retention_policies(db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER]))):
    return service.list_retention_policies(db)


@router.post("/retention/run")
def run_retention_cycle(db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    return service.run_retention_cycle(db)


@router.post("/settings")
def upsert_setting(payload: EnterpriseSettingRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    return service.upsert_enterprise_setting(db, raw, current_user.id)


@router.get("/settings")
def list_settings(category: str | None = None, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
    return service.list_enterprise_settings(db, category)


@router.post("/dependencies")
def create_dependency(payload: DependencyRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER]))):
    raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    return service.create_dependency(db, raw, current_user.id)


@router.get("/dependencies")
def list_dependencies(profile_id: int | None = None, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
    return service.list_dependencies(db, profile_id)


@router.post("/archive")
def archive_period(payload: ArchiveRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER]))):
    return service.archive_period(db, payload.profile_id, payload.period_key, current_user.id)


@router.post("/archive/{archive_id}/restore")
def restore_archive(archive_id: int, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    return service.restore_archive(db, archive_id, current_user.id)


@router.post("/backup")
def create_backup(db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    return service.create_backup(db, current_user.id, "full")


@router.get("/metrics/jobs")
def job_metrics(db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, CERTIFIER, PREPARER]))):
    return service.get_job_metrics(db, 100)


# --- Analytics & Risk endpoints (scaffold) ---
@router.get("/analytics/summary")
def analytics_summary(period: str | None = None, entity: str | None = None, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
    """Executive summary KPIs for analytics explorer"""
    return service.analytics_dashboard_summary(db, period=period, entity=entity, user_id=current_user.id)


@router.get("/analytics/drilldown")
def analytics_drilldown(level: str = 'entity', key: str | None = None, limit: int = 50, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
    """Drilldown data for a specific level (entity/account/recon/exception)"""
    return service.analytics_drilldown(db, level=level, key=key, limit=limit, user_id=current_user.id)

from ..services.risk_scoring_engine import score_all_profiles

@router.post("/risk/calculate")
def calculate_risk(
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, APPROVER, CERTIFIER, PREPARER])),
):
    """
    Trigger a live risk scoring run across all active profiles.
    Scores are persisted back to reconciliation_profiles.risk_score.
    """
    results, errors = score_all_profiles(db, active_only=True, persist=True)
    return {
        "scored":  len(results),
        "errors":  len(errors),
        "results": results[:50],   # cap response size
        "error_details": errors,
    }


@router.get("/risk/heatmap")
def risk_heatmap(entity: str | None = None, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
    """Return a heatmap summary for risk dashboard"""
    return service.list_risk_heatmap(db, entity)


@router.get("/governance/policies")
def get_governance_policies(db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER]))):
    return service.get_governance_policies(db)


@router.post("/governance/policies")
def upsert_governance_policy(payload: dict, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    raw = payload
    return service.upsert_governance_policy(db, raw, actor_id=current_user.id)


@router.post("/governance/enforce-approval")
def enforce_approval_policy(action: dict, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER]))):
    """Enforce approval policy for high/critical risk items"""
    return service.enforce_approval_policy(db, action, actor_id=current_user.id)


# ═══════════════════════════════════════════════════════════════
#  PHASE 1 — Profile self-service: clone, rollover
#  PHASE 2 — Close task management
#  PHASE 3 — Enhanced analytics
# ═══════════════════════════════════════════════════════════════

from ..models.models import CloseTask as CloseTaskModel, User as UserModel

# ── Profile Clone ─────────────────────────────────────────────
@router.post("/profiles/{profile_id}/clone")
def clone_profile(
    profile_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, PREPARER])),
):
    """Duplicate an existing profile with a new name and optionally a new period."""
    from ..models.models import ReconciliationProfile, ReconciliationOwnership
    src = db.query(ReconciliationProfile).filter(ReconciliationProfile.id == profile_id).first()
    if not src:
        raise HTTPException(status_code=404, detail="Profile not found")

    new_name = payload.get("name") or f"{src.name} (Copy)"
    new_profile = ReconciliationProfile(
        project_id=src.project_id,
        name=new_name,
        reconciliation_type=src.reconciliation_type,
        frequency=src.frequency,
        tolerance_threshold=src.tolerance_threshold,
        date_window_days=src.date_window_days,
        workflow_config_json=src.workflow_config_json,
        matching_rules_json=src.matching_rules_json,
        assigned_preparer=payload.get("assigned_preparer") or src.assigned_preparer,
        assigned_reviewer=payload.get("assigned_reviewer") or src.assigned_reviewer,
        assigned_approver=payload.get("assigned_approver") or src.assigned_approver,
        assigned_certifier=payload.get("assigned_certifier") or src.assigned_certifier,
        risk_classification=src.risk_classification,
        due_days=src.due_days,
        auto_approve_threshold=src.auto_approve_threshold,
        materiality_limit=src.materiality_limit,
        lifecycle_state="OPEN",
        active=True,
    )
    db.add(new_profile)
    db.flush()

    for uid, orole in [
        (new_profile.assigned_preparer, "PREPARER"),
        (new_profile.assigned_reviewer, "REVIEWER"),
        (new_profile.assigned_approver, "APPROVER"),
        (new_profile.assigned_certifier, "CERTIFIER"),
    ]:
        if uid:
            db.add(ReconciliationOwnership(profile_id=new_profile.id, owner_user_id=uid, owner_role=orole))

    db.commit()
    audit_service.log_action(db, "PROFILE_CLONED", user_id=current_user.id,
        entity_type="reconciliation_profile", entity_id=new_profile.id,
        metadata={"cloned_from": profile_id, "new_name": new_name})
    return {"id": new_profile.id, "name": new_profile.name, "cloned_from": profile_id}


# ── Profile Rollover ──────────────────────────────────────────
@router.post("/profiles/{profile_id}/rollover")
def rollover_profile(
    profile_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, PREPARER])),
):
    """Clone a profile for the next period and create its close calendar + close tasks."""
    import calendar as cal_mod
    from datetime import datetime as _dt, date as _date
    from ..models.models import ReconciliationProfile, ReconciliationOwnership, FinancialCloseCalendar

    src = db.query(ReconciliationProfile).filter(ReconciliationProfile.id == profile_id).first()
    if not src:
        raise HTTPException(status_code=404, detail="Profile not found")

    # Determine next period
    next_period = payload.get("next_period")
    if not next_period:
        last_cal = (db.query(FinancialCloseCalendar)
            .filter(FinancialCloseCalendar.profile_id == profile_id)
            .order_by(FinancialCloseCalendar.period_key.desc()).first())
        if last_cal and last_cal.period_key:
            try:
                y, m = [int(x) for x in last_cal.period_key.split("-")]
                m += 1
                if m > 12:
                    m = 1; y += 1
                next_period = f"{y}-{m:02d}"
            except Exception:
                next_period = _dt.utcnow().strftime("%Y-%m")
        else:
            next_period = _dt.utcnow().strftime("%Y-%m")

    # Clone name for new period
    base_name = src.name.split(" – ")[0] if " – " in src.name else src.name
    new_name = f"{base_name} – {next_period}"

    new_profile = ReconciliationProfile(
        project_id=src.project_id,
        name=new_name,
        reconciliation_type=src.reconciliation_type,
        frequency=src.frequency,
        tolerance_threshold=src.tolerance_threshold,
        date_window_days=src.date_window_days,
        workflow_config_json=src.workflow_config_json,
        matching_rules_json=src.matching_rules_json,
        assigned_preparer=src.assigned_preparer,
        assigned_reviewer=src.assigned_reviewer,
        assigned_approver=src.assigned_approver,
        assigned_certifier=src.assigned_certifier,
        risk_classification=src.risk_classification,
        due_days=src.due_days,
        auto_approve_threshold=src.auto_approve_threshold,
        materiality_limit=src.materiality_limit,
        lifecycle_state="OPEN",
        active=True,
    )
    db.add(new_profile)
    db.flush()

    for uid, orole in [
        (new_profile.assigned_preparer, "PREPARER"),
        (new_profile.assigned_reviewer, "REVIEWER"),
        (new_profile.assigned_approver, "APPROVER"),
        (new_profile.assigned_certifier, "CERTIFIER"),
    ]:
        if uid:
            db.add(ReconciliationOwnership(profile_id=new_profile.id, owner_user_id=uid, owner_role=orole))

    # Create close calendar entry
    try:
        y, m = [int(x) for x in next_period.split("-")]
        last_day = cal_mod.monthrange(y, m)[1]
        start_d = _date(y, m, 1)
        end_d = _date(y, m, last_day)
        due_m, due_y = (m + 1, y) if m < 12 else (1, y + 1)
        due_d = _date(due_y, due_m, src.due_days or 5)
    except Exception:
        today = _date.today()
        start_d = today.replace(day=1); end_d = today; due_d = today

    new_cal = FinancialCloseCalendar(
        profile_id=new_profile.id,
        cycle_type="MONTHLY",
        period_key=next_period,
        start_date=start_d.isoformat(),
        end_date=end_d.isoformat(),
        due_date=due_d.isoformat(),
        status="OPEN",
        is_locked=False,
    )
    db.add(new_cal)
    db.flush()

    # Seed default close tasks from previous period's tasks (or defaults)
    prev_tasks = db.query(CloseTaskModel).join(
        FinancialCloseCalendar, CloseTaskModel.calendar_id == FinancialCloseCalendar.id
    ).filter(FinancialCloseCalendar.profile_id == profile_id).all()

    TASK_DEFAULTS = [("Upload Source Data", "DATA_UPLOAD", 0), ("Upload Target Data", 1), ("Run Matching Engine", "MATCHING", 2), ("Investigate Exceptions", "EXCEPTION_REVIEW", 3), ("Prepare Reconciliation", "BANK_RECON", 4), ("Submit for Review", "SUBMIT", 5), ("Reviewer Sign-off", "REVIEW", 6), ("Approver Sign-off", "APPROVAL", 7), ("Certify Period", "CERTIFICATION", 8), ("Lock Period", "PERIOD_LOCK", 9)]

    if prev_tasks:
        for t in prev_tasks:
            db.add(CloseTaskModel(
                calendar_id=new_cal.id,
                profile_id=new_profile.id,
                task_name=t.task_name,
                task_type=t.task_type,
                description=t.description,
                assigned_to=t.assigned_to,
                due_date=due_d.isoformat(),
                status="NOT_STARTED",
                completion_pct=0.0,
                sort_order=t.sort_order,
            ))
    else:
        for task_name, task_type, order in TASK_DEFAULTS:
            db.add(CloseTaskModel(
                calendar_id=new_cal.id,
                profile_id=new_profile.id,
                task_name=task_name,
                task_type=task_type,
                assigned_to=new_profile.assigned_preparer,
                due_date=due_d.isoformat(),
                status="NOT_STARTED",
                completion_pct=0.0,
                sort_order=order,
            ))

    db.commit()
    audit_service.log_action(db, "PROFILE_ROLLED_OVER", user_id=current_user.id,
        entity_type="reconciliation_profile", entity_id=new_profile.id,
        metadata={"rolled_from": profile_id, "next_period": next_period})
    return {"id": new_profile.id, "name": new_name, "period": next_period,
            "calendar_id": new_cal.id, "tasks_created": len(prev_tasks) or len(TASK_DEFAULTS)}


# ── Close Tasks CRUD ──────────────────────────────────────────
@router.get("/close-tasks")
def list_close_tasks(
    calendar_id: int | None = None,
    profile_id: int | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER])),
):
    q = db.query(CloseTaskModel)
    if calendar_id:
        q = q.filter(CloseTaskModel.calendar_id == calendar_id)
    if profile_id:
        q = q.filter(CloseTaskModel.profile_id == profile_id)
    tasks = q.order_by(CloseTaskModel.sort_order).all()
    result = []
    for t in tasks:
        assignee = db.query(UserModel).filter(UserModel.id == t.assigned_to).first() if t.assigned_to else None
        result.append({
            "id": t.id, "calendar_id": t.calendar_id, "profile_id": t.profile_id,
            "task_name": t.task_name, "task_type": t.task_type,
            "description": t.description,
            "assigned_to": t.assigned_to,
            "assigned_username": assignee.username if assignee else None,
            "due_date": t.due_date, "status": t.status,
            "completion_pct": t.completion_pct,
            "depends_on_task_id": t.depends_on_task_id,
            "sort_order": t.sort_order, "notes": t.notes,
            "completed_at": t.completed_at.isoformat() if t.completed_at else None,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        })
    return result


@router.post("/close-tasks", status_code=201)
def create_close_task(
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, PREPARER])),
):
    task = CloseTaskModel(
        calendar_id=payload["calendar_id"],
        profile_id=payload.get("profile_id"),
        task_name=payload["task_name"],
        task_type=payload.get("task_type", "CUSTOM"),
        description=payload.get("description"),
        assigned_to=payload.get("assigned_to"),
        due_date=payload.get("due_date"),
        status="NOT_STARTED",
        completion_pct=0.0,
        sort_order=payload.get("sort_order", 99),
        notes=payload.get("notes"),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return {"id": task.id, "task_name": task.task_name, "status": task.status}


@router.patch("/close-tasks/{task_id}")
def update_close_task(
    task_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, PREPARER, APPROVER])),
):
    from datetime import datetime as _dt
    task = db.query(CloseTaskModel).filter(CloseTaskModel.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    for field in ["task_name", "task_type", "description", "assigned_to", "due_date",
                  "status", "completion_pct", "notes", "sort_order"]:
        if field in payload:
            setattr(task, field, payload[field])
    if payload.get("status") == "COMPLETE" and not task.completed_at:
        task.completed_at = _dt.utcnow()
        task.completed_by = current_user.id
        task.completion_pct = 100.0
    task.updated_at = _dt.utcnow()
    db.commit()
    audit_service.log_action(db, "CLOSE_TASK_UPDATED", user_id=current_user.id,
        entity_type="close_task", entity_id=task_id, metadata=payload)
    return {"id": task.id, "status": task.status, "completion_pct": task.completion_pct}


# ── Enhanced Analytics ────────────────────────────────────────
@router.get("/analytics/enhanced")
def enhanced_analytics(
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER])),
):
    """
    Real analytics from enterprise profile data:
    - Completion % trend by period
    - Exception aging buckets
    - Entity performance
    - User throughput
    - Variance trends
    """
    from datetime import datetime as _dt, date as _date
    from ..models.models import (
        ReconciliationProfile, MatchGroup, ExceptionQueueRecord,
        CertificationWorkflowHistory, FinancialCloseCalendar,
        ReconciliationRecord,
    )

    today = _date.today()

    # ── 1. Profile completion by period ──────────────────────
    profiles = db.query(ReconciliationProfile).filter(ReconciliationProfile.active == True).all()
    period_stats: dict = {}
    for p in profiles:
        cal = db.query(FinancialCloseCalendar).filter(
            FinancialCloseCalendar.profile_id == p.id
        ).order_by(FinancialCloseCalendar.period_key.desc()).first()
        period = cal.period_key if cal else _dt.utcnow().strftime("%Y-%m")
        ps = period_stats.setdefault(period, {"period": period, "total": 0, "complete": 0, "open": 0, "overdue": 0})
        ps["total"] += 1
        state = (p.lifecycle_state or "").upper()
        if state in ("CLOSED", "CERTIFIED", "FORCE_CLOSED"):
            ps["complete"] += 1
        else:
            ps["open"] += 1
            if cal:
                due = None
                try:
                    from datetime import date as _ddate
                    due = _ddate.fromisoformat(cal.due_date)
                except Exception:
                    pass
                if due and today > due and not cal.is_locked:
                    ps["overdue"] += 1

    completion_trend = sorted(period_stats.values(), key=lambda x: x["period"])
    for row in completion_trend:
        row["completion_pct"] = round(row["complete"] / row["total"] * 100, 1) if row["total"] else 0.0

    # ── 2. Exception aging ────────────────────────────────────
    exceptions = db.query(ExceptionQueueRecord).filter(
        ExceptionQueueRecord.status.notin_(["RESOLVED", "CLOSED"])
    ).all()
    aging = {"0-3d": 0, "4-7d": 0, "8-14d": 0, "15-30d": 0, "30+d": 0}
    for exc in exceptions:
        created = exc.created_at
        if not created:
            aging["0-3d"] += 1
            continue
        days = (today - created.date()).days
        if days <= 3:   aging["0-3d"] += 1
        elif days <= 7:  aging["4-7d"] += 1
        elif days <= 14: aging["8-14d"] += 1
        elif days <= 30: aging["15-30d"] += 1
        else:            aging["30+d"] += 1

    # ── 3. Match rate by entity ───────────────────────────────
    records = db.query(ReconciliationRecord).all()
    entity_stats: dict = {}
    for r in records:
        entity = r.entity or "Unknown"
        es = entity_stats.setdefault(entity, {"entity": entity, "total": 0, "matched": 0, "variance": 0.0})
        es["total"] += 1
        if (r.status or "").upper() in ("MATCHED", "RECONCILED", "FINALIZED"):
            es["matched"] += 1
    entity_perf = []
    for es in entity_stats.values():
        es["match_rate"] = round(es["matched"] / es["total"] * 100, 1) if es["total"] else 0.0
        entity_perf.append(es)
    entity_perf.sort(key=lambda x: -x["total"])

    # ── 4. User throughput ────────────────────────────────────
    hist = db.query(CertificationWorkflowHistory).all()
    user_stats: dict = {}
    for h in hist:
        if not h.actor_id:
            continue
        us = user_stats.setdefault(h.actor_id, {"user_id": h.actor_id, "prepared": 0, "reviewed": 0, "approved": 0, "certified": 0})
        action = (h.action or "").upper()
        if action == "PREPARE":   us["prepared"] += 1
        elif action in ("SUBMIT", "REVIEW"): us["reviewed"] += 1
        elif action == "APPROVE": us["approved"] += 1
        elif action == "CERTIFY": us["certified"] += 1

    user_throughput = []
    for uid, us in user_stats.items():
        user = db.query(UserModel).filter(UserModel.id == uid).first()
        us["username"] = user.username if user else f"User {uid}"
        us["total_actions"] = us["prepared"] + us["reviewed"] + us["approved"] + us["certified"]
        user_throughput.append(us)
    user_throughput.sort(key=lambda x: -x["total_actions"])

    # ── 5. Variance trends by period ─────────────────────────
    match_groups = db.query(MatchGroup).all()
    variance_by_period: dict = {}
    for mg in match_groups:
        cal = db.query(FinancialCloseCalendar).filter(
            FinancialCloseCalendar.profile_id == mg.profile_id
        ).order_by(FinancialCloseCalendar.period_key.desc()).first()
        period = cal.period_key if cal else "Unknown"
        vp = variance_by_period.setdefault(period, {"period": period, "total_variance": 0.0, "exception_count": 0, "match_groups": 0})
        vp["total_variance"] += float(mg.variance_amount or 0)
        vp["match_groups"] += 1
        if (mg.classification or "") == "UNMATCHED":
            vp["exception_count"] += 1
    variance_trend = sorted(variance_by_period.values(), key=lambda x: x["period"])

    # ── 6. Summary KPIs ──────────────────────────────────────
    total_profiles = len(profiles)
    certified_count = len([p for p in profiles if (p.lifecycle_state or "").upper() in ("CERTIFIED", "CLOSED")])
    total_exceptions = db.query(ExceptionQueueRecord).count()
    open_exceptions = db.query(ExceptionQueueRecord).filter(
        ExceptionQueueRecord.status.notin_(["RESOLVED", "CLOSED"])
    ).count()
    total_mg = db.query(MatchGroup).count()
    full_matches = db.query(MatchGroup).filter(MatchGroup.classification == "FULL_MATCH").count()
    auto_match_rate = round(full_matches / total_mg * 100, 1) if total_mg else 0.0

    return {
        "summary": {
            "total_profiles": total_profiles,
            "certified_profiles": certified_count,
            "certification_pct": round(certified_count / total_profiles * 100, 1) if total_profiles else 0.0,
            "total_exceptions": total_exceptions,
            "open_exceptions": open_exceptions,
            "auto_match_rate": auto_match_rate,
            "overdue_periods": sum(r.get("overdue", 0) for r in period_stats.values()),
        },
        "completion_trend": completion_trend[-12:],
        "exception_aging": [{"bucket": k, "count": v} for k, v in aging.items()],
        "entity_performance": entity_perf[:20],
        "user_throughput": user_throughput[:15],
        "variance_trend": variance_trend[-12:],
    }


# ═══════════════════════════════════════════════════════════════
#  ADVANCED MATCHING + PERIOD LOCK + REAL DASHBOARDS
# ═══════════════════════════════════════════════════════════════

# ── Advanced matching ─────────────────────────────────────────
@router.post("/matching/run-advanced")
def run_advanced_matching(
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, PREPARER])),
):
    """4-phase advanced matching: holistic scoring + many-to-one + one-to-many + cross-period."""
    try:
        result = service.run_advanced_matching(
            db,
            profile_id=int(payload["profile_id"]),
            auto_match_threshold=float(payload.get("auto_match_threshold", 0.92)),
            cross_period_days=int(payload.get("cross_period_days", 90)),
            user_id=current_user.id,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/matching/suggestions-advanced/{profile_id}")
def get_match_suggestions_advanced(
    profile_id: int,
    top_k: int = 25,
    min_confidence: float = 0.50,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, APPROVER, PREPARER, CERTIFIER])),
):
    try:
        return service.get_match_suggestions_advanced(db, profile_id, top_k, min_confidence)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Period lock / unlock ──────────────────────────────────────
@router.post("/close-calendar/{calendar_id}/lock")
def lock_period(
    calendar_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, CERTIFIER, APPROVER])),
):
    try:
        result = service.lock_period(db, calendar_id, current_user.id)
        audit_service.log_action(db, "PERIOD_LOCKED", user_id=current_user.id,
            entity_type="close_calendar", entity_id=calendar_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/close-calendar/{calendar_id}/unlock")
def unlock_period(
    calendar_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN])),
):
    try:
        reason = payload.get("reason") or "No reason provided"
        result = service.unlock_period(db, calendar_id, current_user.id, reason)
        audit_service.log_action(db, "PERIOD_UNLOCKED", user_id=current_user.id,
            entity_type="close_calendar", entity_id=calendar_id,
            metadata={"reason": reason})
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Real executive dashboard ──────────────────────────────────
@router.get("/dashboard/executive-real")
def executive_dashboard_real(
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, CERTIFIER, APPROVER, PREPARER])),
):
    return service.get_executive_dashboard_real(db)


# ── Real risk dashboard ───────────────────────────────────────
@router.get("/dashboard/risk-real")
def risk_dashboard_real(
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, APPROVER, CERTIFIER, PREPARER])),
):
    """
    Live risk dashboard. Uses cached risk_score when < 10 min old,
    re-scores live otherwise.
    """
    from ..services.risk_scoring_engine import get_risk_dashboard
    return get_risk_dashboard(db, current_user=current_user)


# ── Profile transactions (match groups + items) ───────────────
@router.get("/profiles/{profile_id}/transactions")
def list_profile_transactions(
    profile_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, PREPARER, APPROVER, CERTIFIER])),
):
    """Return match groups with items for a profile — used by Preparer/Reviewer Workbench."""
    from ..models.models import MatchGroup as MG, MatchGroupItem as MGI
    mgs = db.query(MG).filter(MG.profile_id == profile_id).order_by(MG.id.desc()).limit(500).all()
    result = []
    for mg in mgs:
        items = db.query(MGI).filter(MGI.match_group_id == mg.id).all()
        rec_ids = [i.reconciliation_record_id for i in items]
        result.append({
            "id": mg.id, "strategy": mg.strategy, "classification": mg.classification,
            "confidence": mg.confidence, "variance_amount": mg.variance_amount,
            "reconciled": mg.reconciled, "finalized": mg.finalized,
            "record_ids": rec_ids, "item_count": len(rec_ids),
            "created_at": mg.created_at.isoformat() if mg.created_at else None,
        })
    return result


# ── Exceptions list with profile context ─────────────────────
@router.get("/exceptions/with-profile")
def list_exceptions_with_profile(
    profile_id: int | None = None,
    status: str | None = None,
    queue_type: str | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, PREPARER, APPROVER, CERTIFIER])),
):
    """Return exceptions enriched with profile name and match group classification."""
    from ..models.models import ExceptionQueueRecord as EQR, MatchGroup as MG, ReconciliationProfile as RP
    q = db.query(EQR)
    if status:
        q = q.filter(EQR.status == status.upper())
    if queue_type:
        q = q.filter(EQR.queue_type == queue_type)
    excs = q.order_by(EQR.id.desc()).limit(500).all()

    result = []
    for exc in excs:
        mg = db.query(MG).filter(MG.id == exc.match_group_id).first() if exc.match_group_id else None
        prof = db.query(RP).filter(RP.id == mg.profile_id).first() if mg else None
        if profile_id and (not prof or prof.id != profile_id):
            continue
        result.append({
            "id": exc.id,
            "match_group_id": exc.match_group_id,
            "profile_id": prof.id if prof else None,
            "profile_name": prof.name if prof else None,
            "queue_type": exc.queue_type,
            "assigned_to": exc.assigned_to,
            "status": exc.status,
            "comments": exc.comments,
            "classification": exc.classification,
            "resolution_notes": exc.resolution_notes,
            "escalated_at": exc.escalated_at.isoformat() if exc.escalated_at else None,
            "created_at": exc.created_at.isoformat() if exc.created_at else None,
            "mg_classification": mg.classification if mg else None,
            "mg_variance": mg.variance_amount if mg else None,
        })
    return result
