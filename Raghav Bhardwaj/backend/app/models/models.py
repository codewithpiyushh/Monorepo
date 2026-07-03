from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Boolean, Float, ForeignKey, Index, Date, true
)
from sqlalchemy.orm import relationship
from ..database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(200), nullable=False)
    role = Column(String(20), default="preparer")
    manager_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    projects = relationship("Project", back_populates="owner")
    audit_logs = relationship("AuditLog", back_populates="user")
    
    # Self-referential relationship for escalation hierarchy
    manager = relationship("User", remote_side=[id], backref="direct_reports")


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    status = Column(String(20), default="active")
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_demo_data = Column(Boolean, default=False, nullable=False, index=True)
    owner = relationship("User", back_populates="projects")
    datasets = relationship("Dataset", back_populates="project", cascade="all, delete-orphan")
    mappings = relationship("Mapping", back_populates="project", cascade="all, delete-orphan")
    rules = relationship("Rule", back_populates="project", cascade="all, delete-orphan")
    executions = relationship("Execution", back_populates="project", cascade="all, delete-orphan")
    sequence_steps = relationship("SequenceStep", back_populates="project", cascade="all, delete-orphan")


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    name = Column(String(100), nullable=False)
    dataset_type = Column(String(10), nullable=False)  # 'source' | 'target'
    file_name = Column(String(200))
    row_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="datasets")
    columns = relationship(
        "ColumnMetadata", back_populates="dataset", cascade="all, delete-orphan"
    )
    rows = relationship("DataRow", back_populates="dataset", cascade="all, delete-orphan")


class ColumnMetadata(Base):
    __tablename__ = "columns_metadata"

    id = Column(Integer, primary_key=True, index=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id"), nullable=False)
    column_name = Column(String(100), nullable=False)
    data_type = Column(String(50))
    sample_values = Column(Text)  # JSON array string
    column_index = Column(Integer)

    dataset = relationship("Dataset", back_populates="columns")


class DataRow(Base):
    __tablename__ = "data_rows"

    id = Column(Integer, primary_key=True, index=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id"), nullable=False)
    row_index = Column(Integer, nullable=False)
    data = Column(Text, nullable=False)  # JSON dict string

    dataset = relationship("Dataset", back_populates="rows")


class Mapping(Base):
    __tablename__ = "mappings"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    source_column = Column(String(100), nullable=False)
    target_column = Column(String(100), nullable=False)
    is_key_field = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project", back_populates="mappings")


class Rule(Base):
    __tablename__ = "rules"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    name = Column(String(100), nullable=False)
    rule_type = Column(String(30), nullable=False)  # exact | tolerance | fuzzy | date_diff
    config = Column(Text, nullable=False)  # JSON
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project", back_populates="rules")


class Execution(Base):
    __tablename__ = "executions"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    status = Column(String(20), default="pending")  # pending | running | completed | failed
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    stats = Column(Text, nullable=True)  # JSON
    error_message = Column(Text, nullable=True)

    project = relationship("Project", back_populates="executions")
    results = relationship("Result", back_populates="execution", cascade="all, delete-orphan")
    workflow = relationship("Workflow", back_populates="execution", uselist=False, cascade="all, delete-orphan")


class Sequence(Base):
    __tablename__ = "sequences"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    status = Column(String(20), default="pending")  # pending | running | failed | completed
    stop_on_failure = Column(Boolean, default=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    steps = relationship("SequenceStep", back_populates="sequence", cascade="all, delete-orphan", order_by="SequenceStep.step_order")
    step_results = relationship("SequenceStepResult", back_populates="sequence", cascade="all, delete-orphan")
    logs = relationship("SequenceExecutionLog", back_populates="sequence", cascade="all, delete-orphan")


class SequenceStep(Base):
    __tablename__ = "sequence_steps"

    id = Column(Integer, primary_key=True, index=True)
    sequence_id = Column(Integer, ForeignKey("sequences.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    step_order = Column(Integer, nullable=False)

    sequence = relationship("Sequence", back_populates="steps")
    project = relationship("Project", back_populates="sequence_steps")


class SequenceStepResult(Base):
    __tablename__ = "sequence_step_results"

    id = Column(Integer, primary_key=True, index=True)
    sequence_id = Column(Integer, ForeignKey("sequences.id"), nullable=False)
    step_id = Column(Integer, ForeignKey("sequence_steps.id"), nullable=False)
    execution_id = Column(Integer, ForeignKey("executions.id"), nullable=True)
    status = Column(String(20), default="pending")  # pending | running | failed | completed | skipped
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    stats = Column(Text, nullable=True)

    sequence = relationship("Sequence", back_populates="step_results")


class SequenceExecutionLog(Base):
    __tablename__ = "sequence_execution_logs"

    id = Column(Integer, primary_key=True, index=True)
    sequence_id = Column(Integer, ForeignKey("sequences.id"), nullable=False)
    level = Column(String(20), default="info")
    message = Column(Text, nullable=False)
    context_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    sequence = relationship("Sequence", back_populates="logs")


class Schedule(Base):
    __tablename__ = "schedules"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String(30), nullable=False)  # reconciliation | sequence
    reference_id = Column(Integer, nullable=False)  # project_id (reconciliation) | sequence_id (sequence)
    cron_expression = Column(String(100), nullable=False)
    active = Column(Boolean, default=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Workflow(Base):
    __tablename__ = "workflows"

    id = Column(Integer, primary_key=True, index=True)
    reconciliation_id = Column(Integer, ForeignKey("executions.id"), nullable=False, unique=True)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String(30), default="pending")  # pending | in_progress | under_review | approved | rejected
    comments = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    execution = relationship("Execution", back_populates="workflow")
    history = relationship(
        "WorkflowHistory",
        back_populates="workflow",
        cascade="all, delete-orphan",
        order_by="WorkflowHistory.created_at.asc()",
    )
    attachments = relationship(
        "WorkflowAttachment",
        back_populates="workflow",
        cascade="all, delete-orphan",
        order_by="WorkflowAttachment.created_at.desc()",
    )


class WorkflowHistory(Base):
    __tablename__ = "workflow_history"

    id = Column(Integer, primary_key=True, index=True)
    workflow_id = Column(Integer, ForeignKey("workflows.id"), nullable=False)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String(30), nullable=False)  # assign | submit | approve | reject
    from_status = Column(String(30), nullable=True)
    to_status = Column(String(30), nullable=True)
    comments = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    workflow = relationship("Workflow", back_populates="history")


class WorkflowAttachment(Base):
    __tablename__ = "workflow_attachments"

    id = Column(Integer, primary_key=True, index=True)
    workflow_id = Column(Integer, ForeignKey("workflows.id"), nullable=False)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    file_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    content_type = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    workflow = relationship("Workflow", back_populates="attachments")


class Result(Base):
    __tablename__ = "results"

    id = Column(Integer, primary_key=True, index=True)
    execution_id = Column(Integer, ForeignKey("executions.id"), nullable=False)
    source_row_index = Column(Integer, nullable=True)
    target_row_index = Column(Integer, nullable=True)
    source_data = Column(Text, nullable=True)   # JSON
    target_data = Column(Text, nullable=True)   # JSON
    match_status = Column(String(20), nullable=False)  # matched | unmatched | partial
    match_score = Column(Float, default=0.0)
    discrepancies = Column(Text, nullable=True)  # JSON array

    execution = relationship("Execution", back_populates="results")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action_type = Column(String(50), nullable=False)
    entity_type = Column(String(50), nullable=True)
    entity_id = Column(Integer, nullable=True)
    metadata_json = Column(Text, nullable=True)  # JSON
    ip_address = Column(String(50), nullable=True)
    previous_hash = Column(String(128), nullable=True)
    entry_hash = Column(String(128), nullable=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="audit_logs")


class IngestionBatch(Base):
    __tablename__ = "ingestion_batches"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(String(80), unique=True, nullable=False, index=True)
    source_system = Column(String(80), nullable=False)
    ingestion_timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    metadata_json = Column(Text, nullable=True)
    ingestion_status = Column(String(30), default="NEW", nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)


class RawStagingRecord(Base):
    __tablename__ = "raw_staging_records"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(String(80), index=True, nullable=False)
    source_system = Column(String(80), nullable=False)
    payload_json = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class TransformedStagingRecord(Base):
    __tablename__ = "transformed_staging_records"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(String(80), index=True, nullable=False)
    source_system = Column(String(80), nullable=False)
    payload_json = Column(Text, nullable=False)
    transform_status = Column(String(30), default="TRANSFORMED", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class ValidationErrorRecord(Base):
    __tablename__ = "validation_error_records"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(String(80), index=True, nullable=False)
    source_system = Column(String(80), nullable=False)
    record_payload_json = Column(Text, nullable=False)
    rejection_reason = Column(Text, nullable=False)
    validation_stage = Column(String(80), nullable=False)
    error_timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)


class ReconciliationProfile(Base):
    __tablename__ = "reconciliation_profiles"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    name = Column(String(120), unique=True, nullable=False)
    reconciliation_type = Column(String(50), nullable=False)
    frequency = Column(String(30), nullable=False)
    tolerance_threshold = Column(Float, default=0.0)
    date_window_days = Column(Integer, default=0)
    workflow_config_json = Column(Text, nullable=True)
    matching_rules_json = Column(Text, nullable=True)
    assigned_preparer = Column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_reviewer = Column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_approver = Column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_certifier = Column(Integer, ForeignKey("users.id"), nullable=True)
    risk_classification = Column(String(20), default="MEDIUM")
    due_days = Column(Integer, default=5)
    risk_score          = Column(Float, nullable=True)
    risk_scored_at      = Column(DateTime, nullable=True)
    auto_approve_threshold = Column(Float, default=1.0)
    materiality_limit = Column(Float, default=0.0)
    lifecycle_state = Column(String(30), default="OPEN")
    active = Column(Boolean, default=True)
    is_demo_data = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ReconciliationBalance(Base):
    """
    Balance Reconciliation Engine — core record.

    One row per profile per period.  Tracks GL balance vs supporting balance,
    calculates variance, and drives the DRAFT → UNDER_REVIEW → APPROVED →
    CERTIFIED state machine without introducing a new workflow framework —
    it reuses CertificationWorkflow for history and ownership.
    """
    __tablename__ = "reconciliation_balances"

    id                  = Column(Integer, primary_key=True, index=True)
    profile_id          = Column(Integer, ForeignKey("reconciliation_profiles.id"), nullable=False)
    period_key          = Column(String(30), nullable=False)          # e.g. 2026-05

    # ── Balances ──────────────────────────────────────────────────────────
    source_balance      = Column(Float, nullable=False, default=0.0)  # GL / source
    target_balance      = Column(Float, nullable=False, default=0.0)  # Bank / supporting
    variance_amount     = Column(Float, nullable=True)                # ABS(source - target)
    variance_percentage = Column(Float, nullable=True)                # safe division
    variance_severity_classification = Column(String(30), nullable=True)
    root_cause_category = Column(String(40), nullable=True)
    variance_explanation = Column(Text, nullable=True)
    resolution_target_date = Column(Date, nullable=True)
    resolution_status = Column(String(20), nullable=True, default="OPEN")
    explained_variance = Column(Float, nullable=True)
    unexplained_variance = Column(Float, nullable=True)
    flux_amount = Column(Float, nullable=True)
    flux_percentage = Column(Float, nullable=True)

    # ── Thresholds inherited from profile on creation ─────────────────────
    threshold_amount    = Column(Float, nullable=False, default=0.0)
    materiality_limit   = Column(Float, nullable=False, default=0.0)

    # ── Status machine ────────────────────────────────────────────────────
    # DRAFT | BALANCED | WITHIN_THRESHOLD | OUT_OF_BALANCE |
    # UNDER_REVIEW | APPROVED | CERTIFIED | REJECTED
    status              = Column(String(30), nullable=False, default="DRAFT")
    comments            = Column(Text, nullable=True)

    # ── Workflow timestamps ───────────────────────────────────────────────
    submitted_at        = Column(DateTime, nullable=True)
    reviewed_at         = Column(DateTime, nullable=True)
    approved_at         = Column(DateTime, nullable=True)
    certified_at        = Column(DateTime, nullable=True)

    # ── Ownership — copied from profile at creation time ──────────────────
    preparer_id         = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewer_id         = Column(Integer, ForeignKey("users.id"), nullable=True)
    approver_id         = Column(Integer, ForeignKey("users.id"), nullable=True)
    certifier_id        = Column(Integer, ForeignKey("users.id"), nullable=True)

    # ── Audit ─────────────────────────────────────────────────────────────
    created_by          = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_by          = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at          = Column(DateTime, default=datetime.utcnow)
    updated_at          = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_demo_data        = Column(Boolean, default=False, nullable=False, index=True)
    close_period_id     = Column(Integer, ForeignKey("close_periods.id"), nullable=True, index=True)

    __table_args__ = (
        Index("ix_recon_balances_profile_period",  "profile_id", "period_key"),
        Index("ix_recon_balances_status",          "status"),
        Index("ix_recon_balances_created_at",      "created_at"),
        # One balance record per profile per period
        Index("uq_recon_balances_profile_period",  "profile_id", "period_key", unique=True),
    )


class ReconciliationBalanceHistory(Base):
    """
    Immutable audit trail for every state transition on a balance record.
    Participates in the existing hash-chain audit structure via audit_service.
    """
    __tablename__ = "reconciliation_balance_history"

    id              = Column(Integer, primary_key=True, index=True)
    balance_id      = Column(Integer, ForeignKey("reconciliation_balances.id"), nullable=False, index=True)
    actor_id        = Column(Integer, ForeignKey("users.id"), nullable=True)
    actor_role      = Column(String(30), nullable=True)
    action          = Column(String(40), nullable=False)   # CREATE/UPDATE/SUBMIT/APPROVE/REJECT/CERTIFY
    from_status     = Column(String(30), nullable=True)
    to_status       = Column(String(30), nullable=True)
    source_balance  = Column(Float, nullable=True)         # snapshot at time of action
    target_balance  = Column(Float, nullable=True)
    variance_amount = Column(Float, nullable=True)
    comments        = Column(Text, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)


class VarianceSnapshot(Base):
    __tablename__ = "variance_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    profile_id = Column(Integer, ForeignKey("reconciliation_profiles.id"), nullable=False)
    period_key = Column(String(30), nullable=False)
    raw_variance = Column(Float, nullable=True)
    explained_variance = Column(Float, nullable=True)
    unexplained_variance = Column(Float, nullable=True)
    flux_amount = Column(Float, nullable=True)
    flux_percentage = Column(Float, nullable=True)
    risk_score_at_snapshot = Column(Float, nullable=True)
    variance_classification = Column(String(30), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_demo_data = Column(Boolean, default=False, nullable=False)

    __table_args__ = (
        Index("ix_variance_snapshot_profile", "profile_id"),
        Index("ix_variance_snapshot_period", "period_key"),
        Index("ix_variance_snapshot_profile_period", "profile_id", "period_key"),
    )


class ReconciliationRecord(Base):
    __tablename__ = "reconciliation_records"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(String(80), index=True, nullable=False)
    profile_id = Column(Integer, ForeignKey("reconciliation_profiles.id"), nullable=False)
    source_system = Column(String(80), nullable=False)
    entity = Column(String(80), nullable=True)
    account = Column(String(80), nullable=True)
    period = Column(String(30), nullable=True)
    currency = Column(String(10), nullable=True)
    amount = Column(Float, nullable=True)
    reference = Column(String(120), nullable=True)
    tx_date = Column(String(30), nullable=True)
    normalized_sign = Column(String(10), nullable=True)
    status = Column(String(30), default="VALIDATED")
    payload_json = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (
        Index("ix_reconciliation_records_profile_status", "profile_id", "status"),
        Index("ix_reconciliation_records_profile_period", "profile_id", "period"),
        Index("ix_reconciliation_records_entity_account", "entity", "account"),
    )


class MatchGroup(Base):
    __tablename__ = "match_groups"

    id = Column(Integer, primary_key=True, index=True)
    execution_id = Column(Integer, ForeignKey("executions.id"), nullable=True)
    execution = relationship("Execution", backref="match_groups")
    profile_id = Column(Integer, ForeignKey("reconciliation_profiles.id"), nullable=False)
    strategy = Column(String(50), nullable=true)
    classification = Column(String(30), nullable=False)
    confidence = Column(Float, default=0.0)
    variance_amount = Column(Float, default=0.0)
    reconciled = Column(Boolean, default=False)
    finalized = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (
        Index("ix_match_groups_profile_classification", "profile_id", "classification"),
    )


class MatchGroupItem(Base):
    __tablename__ = "match_group_items"

    id = Column(Integer, primary_key=True, index=True)
    match_group_id = Column(Integer, ForeignKey("match_groups.id"), nullable=False)
    reconciliation_record_id = Column(Integer, ForeignKey("reconciliation_records.id"), nullable=False)
    __table_args__ = (
        Index("ix_mgi_group_record", "match_group_id", "reconciliation_record_id"),
    )


class ExceptionQueueRecord(Base):
    __tablename__ = "exception_queue_records"

    id = Column(Integer, primary_key=True, index=True)
    match_group_id = Column(Integer, ForeignKey("match_groups.id"), nullable=False)
    queue_type = Column(String(30), nullable=False)  # exception/unresolved/assigned/escalated
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_at = Column(DateTime, nullable=True)
    status = Column(String(30), default="OPEN")
    comments = Column(Text, nullable=True)

    # Legacy coarse classification (kept for backwards compat)
    classification = Column(String(40), nullable=True)  # DATA_ISSUE/PROCESS_ISSUE/POLICY_RISK/OTHER

    # ── Root Cause Taxonomy (Phase 3) ─────────────────────────────────────────
    root_cause        = Column(String(60), nullable=True, index=True)
    root_cause_detail = Column(Text, nullable=True)          # free-text explanation
    severity          = Column(String(20), nullable=True, default="MEDIUM", index=True)
    carry_forward_period = Column(String(10), nullable=True) # e.g. '2026-05'
    reopened_count    = Column(Integer, nullable=False, default=0)
    resolved_by       = Column(Integer, ForeignKey("users.id"), nullable=True)
    # ──────────────────────────────────────────────────────────────────────────

    resolution_notes = Column(Text, nullable=True)
    escalated_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_demo_data = Column(Boolean, default=False, nullable=False)

    __table_args__ = (
        Index("ix_exception_queue_status", "status"),
        Index("ix_exception_queue_assigned", "assigned_to"),
        Index("ix_exception_queue_demo", "is_demo_data"),
    )


class ExceptionAgingSnapshot(Base):
    """
    Periodic snapshot of exception aging state per exception.
    Enables month-over-month trend comparisons without recomputing history.
    Written by the aging engine on each run; one row per exception per period.
    """
    __tablename__ = "exception_aging_snapshots"

    id                      = Column(Integer, primary_key=True, index=True)
    exception_id            = Column(Integer, ForeignKey("exception_queue_records.id"), nullable=False)
    profile_id              = Column(Integer, nullable=True)          # denormalised for fast filter
    snapshot_period         = Column(String(8), nullable=False)       # e.g. "2026-05"
    age_days                = Column(Integer, nullable=False)
    bucket                  = Column(String(10), nullable=False)      # CURRENT/WARNING/BREACH/CRITICAL
    exception_amount        = Column(Float, nullable=True)
    status                  = Column(String(30), nullable=True)       # status at snapshot time
    risk_classification     = Column(String(20), nullable=True)
    created_at              = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_aging_snapshot_exception",  "exception_id"),
        Index("ix_aging_snapshot_period",     "snapshot_period"),
        Index("ix_aging_snapshot_bucket",     "bucket"),
        Index("ix_aging_snapshot_profile",    "profile_id"),
    )


class ExceptionEscalationLog(Base):
    """
    Immutable log of every automated aging escalation.
    Participates in the hash-chain audit via audit_service.
    Prevents duplicate escalation notifications within the same day.
    """
    __tablename__ = "exception_escalation_logs"

    id                  = Column(Integer, primary_key=True, index=True)
    exception_id        = Column(Integer, ForeignKey("exception_queue_records.id"), nullable=False)
    escalation_level    = Column(String(20), nullable=False)    # BREACH / CRITICAL / SEVERE
    age_days            = Column(Integer, nullable=False)
    notified_user_id    = Column(Integer, ForeignKey("users.id"), nullable=True)
    notified_role       = Column(String(30), nullable=True)
    escalated_at        = Column(DateTime, default=datetime.utcnow)
    notification_sent   = Column(Boolean, default=False)

    __table_args__ = (
        Index("ix_escalation_log_exception",    "exception_id"),
        Index("ix_escalation_log_level",        "escalation_level"),
        Index("ix_escalation_log_escalated_at", "escalated_at"),
    )


class ReconciliationAttachment(Base):
    __tablename__ = "reconciliation_attachments"

    id = Column(Integer, primary_key=True, index=True)
    reconciliation_record_id = Column(Integer, ForeignKey("reconciliation_records.id"), nullable=False)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    upload_time = Column(DateTime, default=datetime.utcnow)
    document_type = Column(String(40), nullable=False)
    document_name = Column(String(255), nullable=False)
    document_path = Column(String(500), nullable=True)
    document_status = Column(String(30), default="ACTIVE")
    version = Column(Integer, default=1)
    replaced_by_id = Column(Integer, ForeignKey("reconciliation_attachments.id"), nullable=True)


class FinancialCloseCalendar(Base):
    __tablename__ = "financial_close_calendar"

    id = Column(Integer, primary_key=True, index=True)
    profile_id = Column(Integer, ForeignKey("reconciliation_profiles.id"), nullable=False)
    cycle_type = Column(String(20), nullable=False)  # MONTHLY | QUARTERLY | YEARLY
    period_key = Column(String(30), nullable=False)  # 2026-05, 2026-Q2, 2026
    start_date = Column(String(30), nullable=False)
    end_date = Column(String(30), nullable=False)
    due_date = Column(String(30), nullable=False)
    status = Column(String(30), default="OPEN")  # OPEN | IN_PROGRESS | CLOSED
    is_locked = Column(Boolean, default=False)
    locked_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    locked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CertificationWorkflow(Base):
    __tablename__ = "certification_workflows"

    id = Column(Integer, primary_key=True, index=True)
    profile_id = Column(Integer, ForeignKey("reconciliation_profiles.id"), nullable=False)
    calendar_id = Column(Integer, ForeignKey("financial_close_calendar.id"), nullable=True)
    status = Column(String(30), default="OPEN")
    current_stage = Column(String(30), default="PREPARER")
    preparer_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewer_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    approver_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    certifier_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    due_date = Column(String(30), nullable=True)
    last_comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_demo_data = Column(Boolean, default=False, nullable=False, index=True)


class CertificationWorkflowHistory(Base):
    __tablename__ = "certification_workflow_history"

    id = Column(Integer, primary_key=True, index=True)
    workflow_id = Column(Integer, ForeignKey("certification_workflows.id"), nullable=False)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    actor_role = Column(String(30), nullable=True)
    action = Column(String(30), nullable=False)
    from_status = Column(String(30), nullable=True)
    to_status = Column(String(30), nullable=True)
    comments = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_demo_data = Column(Boolean, default=False, nullable=False)


class ReconciliationRuleDefinition(Base):
    __tablename__ = "reconciliation_rule_definitions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    template_type = Column(String(40), nullable=False)  # BANK/PAYROLL/VENDOR/...
    profile_id = Column(Integer, ForeignKey("reconciliation_profiles.id"), nullable=True)
    is_reusable = Column(Boolean, default=True)
    conditions_json = Column(Text, nullable=False)  # dynamic rule conditions
    filters_json = Column(Text, nullable=True)
    thresholds_json = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ReminderLog(Base):
    __tablename__ = "reminder_logs"

    id = Column(Integer, primary_key=True, index=True)
    workflow_id = Column(Integer, ForeignKey("certification_workflows.id"), nullable=False)
    reminder_type = Column(String(30), nullable=False)  # DUE_SOON/OVERDUE/ESCALATION
    severity = Column(String(20), nullable=False)  # LOW/MEDIUM/HIGH
    message = Column(Text, nullable=False)
    sent_to_role = Column(String(30), nullable=True)
    sent_at = Column(DateTime, default=datetime.utcnow)


class NotificationEvent(Base):
    __tablename__ = "notification_events"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(40), nullable=False)  # APPROVAL/ESCALATION/REMINDER/REJECT/CERT_COMPLETE
    workflow_id = Column(Integer, ForeignKey("certification_workflows.id"), nullable=True)
    recipient_email = Column(String(180), nullable=True)
    subject = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    status = Column(String(20), default="QUEUED")  # QUEUED/SENT/FAILED
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    sent_at = Column(DateTime, nullable=True)


class ValidationRuleResult(Base):
    __tablename__ = "validation_rule_results"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(String(80), index=True, nullable=False)
    profile_id = Column(Integer, ForeignKey("reconciliation_profiles.id"), nullable=True)
    rule_name = Column(String(80), nullable=False)
    severity = Column(String(20), default="MEDIUM")
    passed = Column(Boolean, default=True)
    message = Column(Text, nullable=False)
    payload_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ExceptionComment(Base):
    __tablename__ = "exception_comments"

    id = Column(Integer, primary_key=True, index=True)
    exception_id = Column(Integer, ForeignKey("exception_queue_records.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    comment = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class EvidenceVersionHistory(Base):
    __tablename__ = "evidence_version_history"

    id = Column(Integer, primary_key=True, index=True)
    attachment_id = Column(Integer, ForeignKey("reconciliation_attachments.id"), nullable=False)
    previous_version = Column(Integer, nullable=False)
    new_version = Column(Integer, nullable=False)
    changed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    change_note = Column(Text, nullable=True)
    changed_at = Column(DateTime, default=datetime.utcnow)


class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token_id = Column(String(120), unique=True, nullable=False, index=True)
    ip_address = Column(String(80), nullable=True)
    user_agent = Column(String(255), nullable=True)
    login_at = Column(DateTime, default=datetime.utcnow)
    logout_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)


class UserActivityLog(Base):
    __tablename__ = "user_activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    session_id = Column(Integer, ForeignKey("user_sessions.id"), nullable=True)
    action = Column(String(120), nullable=False)
    entity_type = Column(String(60), nullable=True)
    entity_id = Column(Integer, nullable=True)
    ip_address = Column(String(80), nullable=True)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class AuditPackage(Base):
    __tablename__ = "audit_packages"

    id = Column(Integer, primary_key=True, index=True)
    reconciliation_id = Column(Integer, ForeignKey("executions.id"), nullable=True)
    generated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    package_path = Column(String(500), nullable=False)
    checksum = Column(String(128), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ReconciliationSnapshot(Base):
    __tablename__ = "reconciliation_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    profile_id = Column(Integer, ForeignKey("reconciliation_profiles.id"), nullable=False)
    period_key = Column(String(40), nullable=False)
    snapshot_name = Column(String(120), nullable=False)
    snapshot_json = Column(Text, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ExchangeRate(Base):
    __tablename__ = "exchange_rates"

    id = Column(Integer, primary_key=True, index=True)
    from_currency = Column(String(10), nullable=False, index=True)
    to_currency = Column(String(10), nullable=False, index=True)
    rate = Column(Float, nullable=False)
    rate_date = Column(String(20), nullable=False, index=True)
    source = Column(String(80), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class JournalAdjustment(Base):
    __tablename__ = "journal_adjustments"

    id = Column(Integer, primary_key=True, index=True)
    profile_id = Column(Integer, ForeignKey("reconciliation_profiles.id"), nullable=False)
    period_key = Column(String(30), nullable=False)
    account = Column(String(80), nullable=False)
    currency = Column(String(10), nullable=False)
    amount = Column(Float, nullable=False)
    functional_currency = Column(String(10), nullable=True)
    reporting_currency = Column(String(10), nullable=True)
    converted_amount = Column(Float, nullable=True)
    reason = Column(Text, nullable=True)
    status = Column(String(30), default="DRAFT")  # DRAFT/SUBMITTED/APPROVED/POSTED/REJECTED
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    erp_posting_reference = Column(String(120), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class JournalAdjustmentHistory(Base):
    __tablename__ = "journal_adjustment_history"

    id = Column(Integer, primary_key=True, index=True)
    adjustment_id = Column(Integer, ForeignKey("journal_adjustments.id"), nullable=False)
    action = Column(String(40), nullable=False)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    comments = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ModulePermission(Base):
    __tablename__ = "module_permissions"

    id = Column(Integer, primary_key=True, index=True)
    role = Column(String(30), nullable=False, index=True)
    module_name = Column(String(80), nullable=False, index=True)
    can_view = Column(Boolean, default=True)
    can_edit = Column(Boolean, default=False)
    can_approve = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class ReconciliationOwnership(Base):
    __tablename__ = "reconciliation_ownership"

    id = Column(Integer, primary_key=True, index=True)
    profile_id = Column(Integer, ForeignKey("reconciliation_profiles.id"), nullable=False, index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    owner_role = Column(String(30), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String(128), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False)
    revoked = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class MFAChallenge(Base):
    __tablename__ = "mfa_challenges"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    channel = Column(String(20), nullable=False)  # email/app
    otp_code = Column(String(10), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    verified = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class ReconciliationComment(Base):
    __tablename__ = "reconciliation_comments"

    id = Column(Integer, primary_key=True, index=True)
    profile_id = Column(Integer, ForeignKey("reconciliation_profiles.id"), nullable=False, index=True)
    parent_id = Column(Integer, ForeignKey("reconciliation_comments.id"), nullable=True)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    message = Column(Text, nullable=False)
    mentions_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ScheduledReport(Base):
    __tablename__ = "scheduled_reports"

    id = Column(Integer, primary_key=True, index=True)
    report_type = Column(String(40), nullable=False)  # executive/audit/reconciliation
    cron_expression = Column(String(100), nullable=False)
    recipients_json = Column(Text, nullable=False)
    active = Column(Boolean, default=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    last_run_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ScheduledReportRun(Base):
    __tablename__ = "scheduled_report_runs"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("scheduled_reports.id"), nullable=False)
    output_path = Column(String(500), nullable=True)
    status = Column(String(20), default="RUNNING")
    error_message = Column(Text, nullable=True)
    executed_at = Column(DateTime, default=datetime.utcnow)


class EnterpriseSetting(Base):
    __tablename__ = "enterprise_settings"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(50), nullable=False, index=True)
    key = Column(String(120), nullable=False, index=True)
    value_json = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    __table_args__ = (
        Index("ix_enterprise_settings_category_key", "category", "key", unique=True),
    )


class ReconciliationRetentionPolicy(Base):
    __tablename__ = "reconciliation_retention_policies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False, unique=True)
    retention_days = Column(Integer, nullable=False, default=365)
    purge_after_days = Column(Integer, nullable=False, default=730)
    preserve_for_compliance = Column(Boolean, default=True)
    active = Column(Boolean, default=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ReconciliationDependency(Base):
    __tablename__ = "reconciliation_dependencies"

    id = Column(Integer, primary_key=True, index=True)
    parent_profile_id = Column(Integer, ForeignKey("reconciliation_profiles.id"), nullable=False, index=True)
    child_profile_id = Column(Integer, ForeignKey("reconciliation_profiles.id"), nullable=False, index=True)
    dependency_type = Column(String(30), default="close_process")
    is_blocking = Column(Boolean, default=True)
    status = Column(String(30), default="OPEN")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    __table_args__ = (
        Index("ix_reconciliation_dependencies_pair", "parent_profile_id", "child_profile_id", unique=True),
    )


class ReconciliationArchive(Base):
    __tablename__ = "reconciliation_archives"

    id = Column(Integer, primary_key=True, index=True)
    profile_id = Column(Integer, ForeignKey("reconciliation_profiles.id"), nullable=False, index=True)
    period_key = Column(String(40), nullable=False, index=True)
    archive_payload_json = Column(Text, nullable=False)
    archived_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    archived_at = Column(DateTime, default=datetime.utcnow)
    restored_at = Column(DateTime, nullable=True)
    restore_count = Column(Integer, default=0)


class BackupRecord(Base):
    __tablename__ = "backup_records"

    id = Column(Integer, primary_key=True, index=True)
    backup_type = Column(String(40), nullable=False)
    target_path = Column(String(500), nullable=False)
    checksum = Column(String(128), nullable=True)
    status = Column(String(20), default="COMPLETED")
    error_message = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class JobMetric(Base):
    __tablename__ = "job_metrics"

    id = Column(Integer, primary_key=True, index=True)
    job_name = Column(String(100), nullable=False, index=True)
    status = Column(String(20), nullable=False)
    duration_ms = Column(Integer, nullable=True)
    message = Column(Text, nullable=True)
    executed_at = Column(DateTime, default=datetime.utcnow, index=True)


class UINotification(Base):
    __tablename__ = "ui_notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    notification_type = Column(String(40), nullable=False)  # exception/workflow/system/alert
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    icon_type = Column(String(20), default="info")  # info/warning/error/success
    is_read = Column(Boolean, default=False, index=True)
    action_url = Column(String(500), nullable=True)
    action_label = Column(String(100), nullable=True)
    metadata_json = Column(Text, nullable=True)  # JSON for additional data
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    read_at = Column(DateTime, nullable=True)
    is_demo_data = Column(Boolean, default=False, nullable=False)

    __table_args__ = (
        Index("ix_ui_notifications_user_unread", "user_id", "is_read"),
        Index("ix_ui_notifications_created", "created_at"),
        Index("ix_ui_notifications_demo", "is_demo_data"),
    )


class APIErrorLog(Base):
    __tablename__ = "api_error_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    endpoint = Column(String(255), nullable=False)
    method = Column(String(10), nullable=False)  # GET, POST, etc.
    status_code = Column(Integer, nullable=False)
    error_message = Column(Text, nullable=False)
    error_stack = Column(Text, nullable=True)
    request_params_json = Column(Text, nullable=True)
    ip_address = Column(String(80), nullable=True)
    user_agent = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    __table_args__ = (
        Index("ix_api_error_logs_endpoint_status", "endpoint", "status_code"),
        Index("ix_api_error_logs_created", "created_at"),
    )


class CloseTask(Base):
    """Individual task within a financial close period."""
    __tablename__ = "close_tasks"

    id = Column(Integer, primary_key=True, index=True)
    calendar_id = Column(Integer, ForeignKey("financial_close_calendar.id"), nullable=False, index=True)
    profile_id = Column(Integer, ForeignKey("reconciliation_profiles.id"), nullable=True, index=True)
    task_name = Column(String(200), nullable=False)
    task_type = Column(String(60), nullable=False)  # BANK_RECON, AR_RECON, AP_RECON, JOURNAL_REVIEW, FX_REVIEW, PAYROLL, INTERCOMPANY, CUSTOM
    description = Column(Text, nullable=True)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    due_date = Column(String(20), nullable=True)
    status = Column(String(30), default="NOT_STARTED", index=True)  # NOT_STARTED, IN_PROGRESS, COMPLETE, BLOCKED, OVERDUE
    completion_pct = Column(Float, default=0.0)
    depends_on_task_id = Column(Integer, ForeignKey("close_tasks.id"), nullable=True)
    sort_order = Column(Integer, default=0)
    completed_at = Column(DateTime, nullable=True)
    completed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_close_tasks_calendar_status", "calendar_id", "status"),
    )


class ClosePeriod(Base):
    __tablename__ = "close_periods"

    id                  = Column(Integer, primary_key=True, index=True)
    period_name         = Column(String(100), nullable=False)
    period_key          = Column(String(30),  nullable=False, unique=True, index=True)
    start_date          = Column(String(30),  nullable=False)
    due_date            = Column(String(30),  nullable=False)
    close_status        = Column(String(30),  nullable=False, default="OPEN", index=True)
    total_profiles      = Column(Integer, nullable=False, default=0)
    completed_profiles  = Column(Integer, nullable=False, default=0)
    certified_profiles  = Column(Integer, nullable=False, default=0)
    closed_by           = Column(Integer, ForeignKey("users.id"), nullable=True)
    closed_at           = Column(DateTime, nullable=True)
    is_demo_data        = Column(Boolean, nullable=False, default=False, index=True)
    created_by          = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at          = Column(DateTime, default=datetime.utcnow)
    updated_at          = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ClosePeriodTask(Base):
    __tablename__ = "close_period_tasks"

    id                    = Column(Integer, primary_key=True, index=True)
    close_period_id       = Column(Integer, ForeignKey("close_periods.id"), nullable=False, index=True)
    profile_id            = Column(Integer, ForeignKey("reconciliation_profiles.id"), nullable=False, index=True)
    balance_id            = Column(Integer, ForeignKey("reconciliation_balances.id"), nullable=True)
    assigned_owner_id     = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    target_due_date       = Column(String(30), nullable=True)
    task_status           = Column(String(30), nullable=False, default="NOT_STARTED", index=True)
    completion_percentage = Column(Float, nullable=False, default=0.0)
    is_demo_data          = Column(Boolean, nullable=False, default=False, index=True)
    created_at            = Column(DateTime, default=datetime.utcnow)
    updated_at            = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_close_period_tasks_period_status", "close_period_id", "task_status"),
    )


# ── Phase 2 Chunk 4 — SLA Monitoring & Escalation Engine ──────────────────────

class SLAPolicy(Base):
    """
    SLA policy — how many days a balance may remain in a given lifecycle
    state before it's considered breaching, and who owns it at that point.

    profile_id IS NULL  -> global default policy for that priority_level
    profile_id set      -> profile-specific override, takes precedence
    """
    __tablename__ = "sla_policies"

    id                     = Column(Integer, primary_key=True, index=True)
    profile_id             = Column(Integer, ForeignKey("reconciliation_profiles.id"), nullable=True, index=True)
    priority_level         = Column(String(20), nullable=False, index=True)   # LOW | MEDIUM | HIGH | CRITICAL
    max_days_open          = Column(Integer, nullable=False)
    escalation_role        = Column(String(20), nullable=False)               # PREPARER | APPROVER | CERTIFIER | ADMIN
    reminder_interval_days = Column(Integer, nullable=False, default=3)
    created_at             = Column(DateTime, default=datetime.utcnow)
    updated_at             = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_sla_policies_profile_priority", "profile_id", "priority_level"),
    )


class SLAViolation(Base):
    """
    A live record of a balance currently breaching (or having breached) its
    applicable SLA policy. `status` tracks the violation record's own
    open/closed lifecycle; `escalation_status` tracks how far the 3-level
    escalation ladder has progressed.
    """
    __tablename__ = "sla_violations"

    id                = Column(Integer, primary_key=True, index=True)
    balance_id        = Column(Integer, ForeignKey("reconciliation_balances.id"), nullable=False, index=True)
    profile_id        = Column(Integer, ForeignKey("reconciliation_profiles.id"), nullable=False, index=True)
    policy_id         = Column(Integer, ForeignKey("sla_policies.id"), nullable=True)

    violation_type    = Column(String(30), nullable=False)
    # SLA_BREACH | CERTIFICATION_OVERDUE | APPROVAL_BOTTLENECK

    assigned_user_id  = Column(Integer, ForeignKey("users.id"), nullable=True)   # owner at creation time
    current_owner_id  = Column(Integer, ForeignKey("users.id"), nullable=True)   # mutated by escalation

    days_overdue      = Column(Integer, nullable=False, default=0)
    escalation_level  = Column(Integer, nullable=False, default=1)               # 1, 2, or 3
    escalation_status = Column(String(30), nullable=False, default="NONE", index=True)
    # NONE | LEVEL_1_NOTIFIED | LEVEL_2_NOTIFIED | LEVEL_3_REASSIGNED | RESOLVED

    status            = Column(String(20), nullable=False, default="OPEN", index=True)
    # OPEN | ACKNOWLEDGED | RESOLVED

    created_at        = Column(DateTime, default=datetime.utcnow)
    resolved_at       = Column(DateTime, nullable=True)
    last_escalated_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_sla_violations_balance_status",   "balance_id",        "status"),
        Index("ix_sla_violations_owner_status",     "current_owner_id",  "status"),
        Index("ix_sla_violations_profile_status",   "profile_id",        "status"),
        Index("ix_sla_violations_escalation",       "escalation_status", "status"),
    )

class IngestionJob(Base):
    __tablename__ = "ingestion_jobs"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    dataset_type = Column(String(20), nullable=False)
    status = Column(String(20), nullable=False, default="PENDING", index=True)
    records_received = Column(Integer, nullable=False, default=0)
    records_inserted = Column(Integer, nullable=False, default=0)
    records_failed = Column(Integer, nullable=False, default=0)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class AutoCertRule(Base):
    __tablename__ = "auto_cert_rules"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    max_variance = Column(Float, nullable=False, default=0.0)
    allow_exceptions = Column(Boolean, nullable=False, default=False)
    allowed_risk_levels = Column(String(100), nullable=False, default="LOW,MEDIUM")
    is_active = Column(Boolean, nullable=False, default=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RiskConfig(Base):
    __tablename__ = "risk_configs"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    aging_weight = Column(Float, nullable=False, default=0.33)
    materiality_weight = Column(Float, nullable=False, default=0.33)
    account_type_weight = Column(Float, nullable=False, default=0.34)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ApprovalRule(Base):
    __tablename__ = "approval_rules"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    condition_field = Column(String(50), nullable=False)
    condition_operator = Column(String(20), nullable=False)
    condition_value = Column(String(255), nullable=False)
    action = Column(String(50), nullable=False)
    target_role = Column(String(50), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CompliancePolicy(Base):
    __tablename__ = "compliance_policies"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    control_name = Column(String(100), nullable=False)
    category = Column(String(50), nullable=False)
    violation_threshold = Column(Integer, nullable=False, default=0)
    current_violations = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RetentionPolicy(Base):
    __tablename__ = "retention_policies"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    doc_type = Column(String(50), nullable=False)
    retention_period_days = Column(Integer, nullable=False)
    cold_storage_days = Column(Integer, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ArchivalJob(Base):
    __tablename__ = "archival_jobs"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    status = Column(String(20), nullable=False, default="PENDING")
    docs_archived = Column(Integer, nullable=False, default=0)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class EntitySignoff(Base):
    __tablename__ = "entity_signoffs"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    entity_name = Column(String(100), nullable=False)
    region = Column(String(50), nullable=True)
    period_key = Column(String(30), nullable=False)
    signoff_status = Column(String(30), nullable=False, default="PENDING")
    signed_off_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    signed_off_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)