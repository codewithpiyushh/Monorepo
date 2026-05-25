from datetime import datetime
from typing import Optional, Any, Dict, List
from pydantic import BaseModel, Field, field_validator


class IngestionBatchCreate(BaseModel):
    source_system: str
    metadata: Dict[str, Any] = {}
    records: List[Dict[str, Any]]


class IngestionBatchOut(BaseModel):
    batch_id: str
    source_system: str
    ingestion_timestamp: datetime
    ingestion_status: str


class ProfileCreate(BaseModel):
    name: str
    reconciliation_type: str
    frequency: str
    tolerance_threshold: float = 0.0
    date_window_days: int = 0
    workflow_config: Dict[str, Any] = {}
    matching_rules: Dict[str, Any] = {}
    assigned_preparer: Optional[int] = None
    assigned_reviewer: Optional[int] = None
    assigned_approver: Optional[int] = None
    assigned_certifier: Optional[int] = None
    risk_classification: str = "MEDIUM"
    due_days: int = 5
    auto_approve_threshold: float = 1.0
    materiality_limit: float = 0.0


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    reconciliation_type: Optional[str] = None
    frequency: Optional[str] = None
    tolerance_threshold: Optional[float] = None
    date_window_days: Optional[int] = None
    workflow_config: Optional[Dict[str, Any]] = None
    matching_rules: Optional[Dict[str, Any]] = None
    assigned_preparer: Optional[int] = None
    assigned_reviewer: Optional[int] = None
    assigned_approver: Optional[int] = None
    assigned_certifier: Optional[int] = None
    risk_classification: Optional[str] = None
    due_days: Optional[int] = None
    auto_approve_threshold: Optional[float] = None
    materiality_limit: Optional[float] = None
    lifecycle_state: Optional[str] = None
    active: Optional[bool] = None


class MatchRequest(BaseModel):
    profile_id: int
    strategy: str = "rule_based"
    auto_match_threshold: float = Field(default=1.0, ge=0.0, le=1.0)
    max_group_size: int = Field(default=3, ge=2, le=10)


class MatchSuggestionRequest(BaseModel):
    profile_id: int
    top_k: int = Field(default=20, ge=1, le=200)
    min_confidence: float = Field(default=0.6, ge=0.0, le=1.0)


class WorkflowActionRequest(BaseModel):
    exception_id: int
    comments: Optional[str] = None
    assigned_to: Optional[int] = None


class FinancialCloseCalendarCreate(BaseModel):
    profile_id: int
    cycle_type: str
    period_key: str
    start_date: str
    end_date: str
    due_date: str


class FinancialCloseCalendarAction(BaseModel):
    calendar_id: int


class CertificationCreateRequest(BaseModel):
    profile_id: int
    calendar_id: Optional[int] = None
    due_date: Optional[str] = None


class CertificationActionRequest(BaseModel):
    workflow_id: int
    action: str
    comments: Optional[str] = None

    @field_validator("action")
    @classmethod
    def validate_action(cls, value: str):
        normalized = (value or "").strip().upper()
        allowed = {"PREPARE", "SUBMIT", "REVIEW", "APPROVE", "CERTIFY", "CLOSE", "REOPEN", "FORCE_CLOSE"}
        if normalized not in allowed:
            raise ValueError("Unsupported certification action")
        return normalized


class RuleDefinitionCreate(BaseModel):
    name: str
    template_type: str
    profile_id: Optional[int] = None
    is_reusable: bool = True
    conditions: Dict[str, Any] = {}
    filters: Dict[str, Any] = {}
    thresholds: Dict[str, Any] = {}


class RuleDefinitionUpdate(BaseModel):
    name: Optional[str] = None
    template_type: Optional[str] = None
    profile_id: Optional[int] = None
    is_reusable: Optional[bool] = None
    conditions: Optional[Dict[str, Any]] = None
    filters: Optional[Dict[str, Any]] = None
    thresholds: Optional[Dict[str, Any]] = None


class DataImportRequest(BaseModel):
    source_type: str  # csv/xlsx/json/xml/database/api
    project_id: int
    dataset_type: str  # source/target
    payload: Dict[str, Any]


class ValidationRunRequest(BaseModel):
    batch_id: str
    profile_id: Optional[int] = None


class ExceptionCommentRequest(BaseModel):
    exception_id: int
    comment: str


class ExceptionStatusRequest(BaseModel):
    exception_id: int
    comments: Optional[str] = None


class ExceptionClassifyRequest(BaseModel):
    exception_id: int
    classification: str
    comments: Optional[str] = None


class EvidenceVersionRequest(BaseModel):
    attachment_id: int
    document_type: Optional[str] = None
    document_name: Optional[str] = None
    document_path: Optional[str] = None
    change_note: Optional[str] = None


class OCRExtractRequest(BaseModel):
    attachment_id: int


class DocumentPreviewRequest(BaseModel):
    attachment_id: int


class AuditPackageRequest(BaseModel):
    reconciliation_id: int


class SnapshotCreateRequest(BaseModel):
    profile_id: int
    period_key: str
    snapshot_name: str


class SnapshotRestoreRequest(BaseModel):
    snapshot_id: int


class SnapshotCompareRequest(BaseModel):
    base_snapshot_id: int
    compare_snapshot_id: int


class ExchangeRateCreate(BaseModel):
    from_currency: str
    to_currency: str
    rate: float = Field(gt=0.0)
    rate_date: str
    source: Optional[str] = None


class CurrencyConvertRequest(BaseModel):
    amount: float = Field(ge=0.0)
    from_currency: str
    to_currency: str
    conversion_date: Optional[str] = None


class JournalAdjustmentCreate(BaseModel):
    profile_id: int
    period_key: str
    account: str
    currency: str
    amount: float
    functional_currency: Optional[str] = None
    reporting_currency: Optional[str] = None
    reason: Optional[str] = None


class JournalAdjustmentAction(BaseModel):
    adjustment_id: int
    comments: Optional[str] = None


class AutoJournalRequest(BaseModel):
    profile_id: int
    period_key: Optional[str] = None
    reporting_currency: Optional[str] = None
    min_amount: float = Field(default=0.0, ge=0.0)


class BulkActionRequest(BaseModel):
    action: str
    profile_ids: List[int] = []
    target_user_id: Optional[int] = None
    comments: Optional[str] = None


class AdvancedSearchRequest(BaseModel):
    account_number: Optional[str] = None
    min_balance: Optional[float] = None
    max_balance: Optional[float] = None
    risk_level: Optional[str] = None
    status: Optional[str] = None
    preparer_id: Optional[int] = None
    reviewer_id: Optional[int] = None
    period: Optional[str] = None
    reconciliation_type: Optional[str] = None


class CommentCreateRequest(BaseModel):
    profile_id: int
    message: str
    parent_id: Optional[int] = None
    mentions: List[str] = []


class ScheduleReportRequest(BaseModel):
    report_type: str
    cron_expression: str
    recipients: List[str]


class RetentionPolicyRequest(BaseModel):
    name: str
    retention_days: int = 365
    purge_after_days: int = 730
    preserve_for_compliance: bool = True


class EnterpriseSettingRequest(BaseModel):
    category: str
    key: str
    value: Dict[str, Any]
    description: Optional[str] = None


class DependencyRequest(BaseModel):
    parent_profile_id: int
    child_profile_id: int
    dependency_type: str = "close_process"
    is_blocking: bool = True


class ArchiveRequest(BaseModel):
    profile_id: int
    period_key: str

