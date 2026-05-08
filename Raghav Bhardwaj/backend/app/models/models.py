from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Boolean, Float, ForeignKey
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
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    projects = relationship("Project", back_populates="owner")
    audit_logs = relationship("AuditLog", back_populates="user")


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    status = Column(String(20), default="active")
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

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
    history = relationship("WorkflowHistory", back_populates="workflow", cascade="all, delete-orphan")


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
    name = Column(String(120), unique=True, nullable=False)
    reconciliation_type = Column(String(50), nullable=False)
    frequency = Column(String(30), nullable=False)
    tolerance_threshold = Column(Float, default=0.0)
    date_window_days = Column(Integer, default=0)
    workflow_config_json = Column(Text, nullable=True)
    matching_rules_json = Column(Text, nullable=True)
    assigned_preparer = Column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_reviewer = Column(Integer, ForeignKey("users.id"), nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


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


class MatchGroup(Base):
    __tablename__ = "match_groups"

    id = Column(Integer, primary_key=True, index=True)
    profile_id = Column(Integer, ForeignKey("reconciliation_profiles.id"), nullable=False)
    strategy = Column(String(40), nullable=False)  # exact/tolerance/fuzzy/date_window/rule_based
    classification = Column(String(30), nullable=False)  # FULL_MATCH/PARTIAL_MATCH/UNMATCHED/VARIANCE_FLAGGED
    confidence = Column(Float, default=0.0)
    variance_amount = Column(Float, default=0.0)
    reconciled = Column(Boolean, default=False)
    finalized = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class MatchGroupItem(Base):
    __tablename__ = "match_group_items"

    id = Column(Integer, primary_key=True, index=True)
    match_group_id = Column(Integer, ForeignKey("match_groups.id"), nullable=False)
    reconciliation_record_id = Column(Integer, ForeignKey("reconciliation_records.id"), nullable=False)


class ExceptionQueueRecord(Base):
    __tablename__ = "exception_queue_records"

    id = Column(Integer, primary_key=True, index=True)
    match_group_id = Column(Integer, ForeignKey("match_groups.id"), nullable=False)
    queue_type = Column(String(30), nullable=False)  # exception/unresolved/assigned/escalated
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String(30), default="OPEN")
    comments = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


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
