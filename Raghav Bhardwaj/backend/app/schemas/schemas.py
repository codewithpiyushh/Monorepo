from datetime import datetime
from typing import Optional, List, Any, Dict
from pydantic import BaseModel, EmailStr


# ─── Auth ────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: str = "preparer"


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str
    user: UserOut


class LoginRequest(BaseModel):
    username: str
    password: str
    mfa_channel: Optional[str] = None  # email/app
    otp_code: Optional[str] = None


class RefreshTokenRequest(BaseModel):
    refresh_token: str


# ─── Project ─────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None


class ProjectOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    status: str
    created_by: int
    created_at: datetime
    updated_at: datetime
    owner_username: Optional[str] = None
    created_by_username: Optional[str] = None
    updated_by_username: Optional[str] = None
    source_dataset_name: Optional[str] = None
    target_dataset_name: Optional[str] = None

    class Config:
        from_attributes = True


# ─── Dataset ─────────────────────────────────────────────────────────────────

class ColumnMetadataOut(BaseModel):
    id: int
    column_name: str
    data_type: str
    sample_values: Optional[str]
    column_index: int

    class Config:
        from_attributes = True


class DatasetOut(BaseModel):
    id: int
    project_id: int
    name: str
    dataset_type: str
    file_name: Optional[str]
    row_count: int
    created_at: datetime
    columns: List[ColumnMetadataOut] = []

    class Config:
        from_attributes = True


class DataPreview(BaseModel):
    columns: List[str]
    rows: List[Dict[str, Any]]
    total_rows: int


# ─── Mapping ─────────────────────────────────────────────────────────────────

class MappingCreate(BaseModel):
    source_column: str
    target_column: str
    is_key_field: bool = False


class MappingOut(BaseModel):
    id: int
    project_id: int
    source_column: str
    target_column: str
    is_key_field: bool
    created_at: datetime

    class Config:
        from_attributes = True


class MappingBulkSave(BaseModel):
    mappings: List[MappingCreate]


# ─── Rule ────────────────────────────────────────────────────────────────────

class RuleCreate(BaseModel):
    name: str
    rule_type: str  # exact | tolerance | fuzzy | date_diff
    config: Dict[str, Any]  # {"source_column": "amount", "threshold": 5, "tolerance_type": "percentage"}
    is_active: bool = True


class RuleUpdate(BaseModel):
    name: Optional[str] = None
    rule_type: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


class RuleOut(BaseModel):
    id: int
    project_id: int
    name: str
    rule_type: str
    config: str  # raw JSON string stored in DB
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Execution ───────────────────────────────────────────────────────────────

class ExecutionOut(BaseModel):
    id: int
    project_id: int
    status: str
    started_at: datetime
    completed_at: Optional[datetime]
    stats: Optional[str]
    error_message: Optional[str]

    class Config:
        from_attributes = True


class ResultOut(BaseModel):
    id: int
    execution_id: int
    source_row_index: Optional[int]
    target_row_index: Optional[int]
    source_data: Optional[str]
    target_data: Optional[str]
    match_status: str
    match_score: float
    discrepancies: Optional[str]

    class Config:
        from_attributes = True


# ─── Notifications ───────────────────────────────────────────────────────────

class UINotificationCreate(BaseModel):
    user_id: int
    notification_type: str
    title: str
    message: str
    icon_type: str = "info"
    action_url: Optional[str] = None
    action_label: Optional[str] = None
    metadata_json: Optional[str] = None


class UINotificationOut(BaseModel):
    id: int
    user_id: int
    notification_type: str
    title: str
    message: str
    icon_type: str
    is_read: bool
    action_url: Optional[str]
    action_label: Optional[str]
    created_at: datetime
    read_at: Optional[datetime]

    class Config:
        from_attributes = True


class UINotificationsPage(BaseModel):
    notifications: List[UINotificationOut]
    total: int
    unread_count: int
    read_count: int


class MarkNotificationRequest(BaseModel):
    notification_id: int
    is_read: bool


class MarkAllNotificationsRequest(BaseModel):
    is_read: bool


# ─── Error Tracking ──────────────────────────────────────────────────────────

class APIErrorLogOut(BaseModel):
    id: int
    user_id: Optional[int]
    endpoint: str
    method: str
    status_code: int
    error_message: str
    created_at: datetime

    class Config:
        from_attributes = True


class TransactionPreviewOut(BaseModel):
    id: int
    source_row_index: Optional[int]
    target_row_index: Optional[int]
    match_status: str
    match_score: float
    source_data: Optional[str]
    target_data: Optional[str]
    discrepancies: Optional[str]
    selected_source_data: Dict[str, Any] = {}
    selected_target_data: Dict[str, Any] = {}


class ReconciliationUnitOut(BaseModel):
    entity: str
    account: str
    status: str
    total_transactions: int
    matched_count: int
    unmatched_count: int
    partial_count: int
    transactions: List[TransactionPreviewOut] = []


class ResultsPage(BaseModel):
    results: List[ResultOut]
    units: List[ReconciliationUnitOut] = []
    total: int
    page: int
    page_size: int
    stats: Optional[Dict[str, Any]]


# ─── Audit ───────────────────────────────────────────────────────────────────

class AuditLogOut(BaseModel):
    id: int
    user_id: Optional[int]
    action_type: str
    entity_type: Optional[str]
    entity_id: Optional[int]
    metadata_json: Optional[str]
    ip_address: Optional[str]
    timestamp: datetime
    username: Optional[str] = None

    class Config:
        from_attributes = True


class AuditLogsPage(BaseModel):
    logs: List[AuditLogOut]
    total: int
    page: int
    page_size: int
