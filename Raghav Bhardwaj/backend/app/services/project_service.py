import json
from datetime import datetime
from typing import List
from sqlalchemy.orm import Session
from fastapi import HTTPException
from ..models.models import (
    Project,
    AuditLog,
    Dataset,
    ColumnMetadata,
    DataRow,
    Mapping,
    Rule,
    ReconciliationProfile,
    FinancialCloseCalendar,
    CertificationWorkflow,
    User,
)
from ..schemas.schemas import ProjectCreate, ProjectUpdate
from ..rbac.roles import ADMIN
from ..rbac.rls import apply_profile_rls


def create_project(db: Session, payload: ProjectCreate, user_id: int) -> Project:
    project = Project(
        name=payload.name,
        description=payload.description,
        created_by=user_id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(project)
    db.flush()
    _seed_project_defaults(db, project, user_id)
    db.commit()
    db.refresh(project)
    return project


def _seed_project_defaults(db: Session, project: Project, user_id: int) -> None:
    source_rows = [
        {
            "account": "1000",
            "amount": "1000",
            "reference": "INV-001",
            "date": "2026-05-31",
            "currency": "USD",
        },
        {
            "account": "2000",
            "amount": "2500",
            "reference": "INV-002",
            "date": "2026-05-31",
            "currency": "USD",
        },
        {
            "account": "3000",
            "amount": "750",
            "reference": "INV-003",
            "date": "2026-05-31",
            "currency": "USD",
        },
    ]
    target_rows = [
        {
            "account": "1000",
            "amount": "1001",
            "reference": "INV-001",
            "date": "2026-05-31",
            "currency": "USD",
        },
        {
            "account": "2000",
            "amount": "2498",
            "reference": "INV-002",
            "date": "2026-05-31",
            "currency": "USD",
        },
        {
            "account": "3000",
            "amount": "750",
            "reference": "INV-003",
            "date": "2026-05-31",
            "currency": "USD",
        },
    ]

    source_dataset = _create_dataset(db, project.id, "Source Sample Data", "source", source_rows)
    target_dataset = _create_dataset(db, project.id, "Target Sample Data", "target", target_rows)

    _create_mappings(db, project.id)
    _create_rules(db, project.id)
    profile = _create_reconciliation_profile(db, project.id, project.name, user_id)
    calendar = _create_close_calendar(db, profile.id)
    _create_certification_workflow(db, profile.id, calendar.id, user_id)


def _create_dataset(db: Session, project_id: int, name: str, dataset_type: str, rows: List[dict]) -> Dataset:
    dataset = Dataset(
        project_id=project_id,
        name=name,
        dataset_type=dataset_type,
        file_name=f"{name.replace(' ', '_').lower()}.csv",
        row_count=len(rows),
    )
    db.add(dataset)
    db.flush()

    columns = list(rows[0].keys()) if rows else []
    for index, column_name in enumerate(columns):
        sample_values = [str(row[column_name]) for row in rows[:5] if column_name in row]
        db.add(
            ColumnMetadata(
                dataset_id=dataset.id,
                column_name=column_name,
                data_type="string",
                sample_values=json.dumps(sample_values),
                column_index=index,
            )
        )

    for row_index, row in enumerate(rows):
        db.add(
            DataRow(
                dataset_id=dataset.id,
                row_index=row_index,
                data=json.dumps({k: str(v) for k, v in row.items()}),
            )
        )

    return dataset


def _create_mappings(db: Session, project_id: int) -> None:
    mappings = [
        Mapping(project_id=project_id, source_column="account", target_column="account", is_key_field=True),
        Mapping(project_id=project_id, source_column="reference", target_column="reference"),
        Mapping(project_id=project_id, source_column="amount", target_column="amount"),
        Mapping(project_id=project_id, source_column="date", target_column="date"),
        Mapping(project_id=project_id, source_column="currency", target_column="currency"),
    ]
    db.add_all(mappings)


def _create_rules(db: Session, project_id: int) -> None:
    predefined = [
        {
            "name": "Amount Tolerance",
            "rule_type": "tolerance",
            "config": {"source_column": "amount", "threshold": 1.0, "tolerance_type": "absolute"},
            "is_active": True,
        },
        {
            "name": "Reference Fuzzy",
            "rule_type": "fuzzy",
            "config": {"source_column": "reference", "threshold": 0.9},
            "is_active": True,
        },
        {
            "name": "Date Difference",
            "rule_type": "date_diff",
            "config": {"source_column": "date", "threshold": 1, "date_format": "%Y-%m-%d"},
            "is_active": True,
        },
        {
            "name": "Currency Exact",
            "rule_type": "exact",
            "config": {"source_column": "currency"},
            "is_active": True,
        },
    ]
    for rule in predefined:
        db.add(
            Rule(
                project_id=project_id,
                name=rule["name"],
                rule_type=rule["rule_type"],
                config=json.dumps(rule["config"]),
                is_active=rule["is_active"],
            )
        )


def _get_project_role_assignments(db: Session, user_id: int) -> dict:
    users = (
        db.query(User)
        .filter(User.role.in_(["preparer", "reviewer", "approver", "certifier"]))
        .all()
    )
    role_map = {user.role: user.id for user in users}
    if "preparer" not in role_map:
        role_map["preparer"] = user_id
    if "reviewer" not in role_map:
        role_map["reviewer"] = user_id
    if "approver" not in role_map:
        role_map["approver"] = user_id
    if "certifier" not in role_map:
        role_map["certifier"] = user_id
    return role_map


def _create_reconciliation_profile(db: Session, project_id: int, project_name: str, user_id: int) -> ReconciliationProfile:
    role_map = _get_project_role_assignments(db, user_id)
    profile = ReconciliationProfile(
        project_id=project_id,
        name=f"{project_name} Reconciliation Profile",
        reconciliation_type="balance_sheet",
        frequency="monthly",
        tolerance_threshold=1.0,
        date_window_days=1,
        workflow_config_json=json.dumps({"stages": ["PREPARER", "REVIEWER", "APPROVER", "CERTIFIER"]}),
        matching_rules_json=json.dumps({"key_fields": ["account"], "match_fields": ["reference", "amount", "date", "currency"]}),
        assigned_preparer=role_map["preparer"],
        assigned_reviewer=role_map["reviewer"],
        assigned_approver=role_map["approver"],
        assigned_certifier=role_map["certifier"],
        risk_classification="MEDIUM",
        due_days=7,
        auto_approve_threshold=1.0,
        materiality_limit=0.0,
        lifecycle_state="OPEN",
        active=True,
    )
    db.add(profile)
    db.flush()
    return profile


def _create_close_calendar(db: Session, profile_id: int) -> FinancialCloseCalendar:
    calendar = FinancialCloseCalendar(
        profile_id=profile_id,
        cycle_type="MONTHLY",
        period_key="2026-05",
        start_date="2026-05-01",
        end_date="2026-05-31",
        due_date="2026-06-07",
        status="OPEN",
        is_locked=False,
    )
    db.add(calendar)
    db.flush()
    return calendar


def _create_certification_workflow(db: Session, profile_id: int, calendar_id: int, user_id: int) -> CertificationWorkflow:
    role_map = _get_project_role_assignments(db, user_id)
    workflow = CertificationWorkflow(
        profile_id=profile_id,
        calendar_id=calendar_id,
        status="OPEN",
        current_stage="PREPARER",
        preparer_id=role_map["preparer"],
        reviewer_id=role_map["reviewer"],
        approver_id=role_map["approver"],
        certifier_id=role_map["certifier"],
        due_date="2026-06-07",
    )
    db.add(workflow)
    db.flush()
    return workflow


def get_projects(db: Session, current_user: Optional[User] = None, skip: int = 0, limit: int = 100) -> List[Project]:
    query = db.query(Project)
    
    if current_user and (current_user.role or "").lower() != "admin":
        profile_query = db.query(ReconciliationProfile.project_id)
        profile_query = apply_profile_rls(profile_query, current_user, profile_model=ReconciliationProfile)
        valid_project_ids = [row[0] for row in profile_query.distinct().all() if row[0] is not None]
        
        if valid_project_ids:
            query = query.filter(Project.id.in_(valid_project_ids))
        else:
            query = query.filter(False)
            
    return (
        query
        .order_by(Project.updated_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_project(db: Session, project_id: int) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def update_project(
    db: Session, project_id: int, payload: ProjectUpdate, user_id: int, user_role: str
) -> Project:
    project = get_project(db, project_id)
    if project.created_by != user_id and (user_role or "").lower() != ADMIN:
        raise HTTPException(status_code=403, detail="You can only update your own projects")
    if payload.name is not None:
        project.name = payload.name
    if payload.description is not None:
        project.description = payload.description
    if payload.status is not None:
        project.status = payload.status
    project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(project)
    return project


def delete_project(db: Session, project_id: int, user_id: int, user_role: str) -> None:
    project = get_project(db, project_id)
    if project.created_by != user_id and (user_role or "").lower() != ADMIN:
        raise HTTPException(status_code=403, detail="You can only delete your own projects")
    db.delete(project)
    db.commit()


def enrich_project(project: Project) -> dict:
    created_by_user = project.owner.username if project.owner else None
    audit_username = None
    if project.id:
        # Use the most recent project update audit entry to infer the updater.
        from ..database import SessionLocal

        db = SessionLocal()
        try:
            log = (
                db.query(AuditLog)
                .filter(AuditLog.entity_type == "project", AuditLog.entity_id == project.id, AuditLog.action_type == "PROJECT_UPDATED")
                .order_by(AuditLog.timestamp.desc())
                .first()
            )
            if log and log.user:
                audit_username = log.user.username
        finally:
            db.close()

    source_dataset = next((d for d in project.datasets if d.dataset_type == "source"), None) if hasattr(project, "datasets") else None
    target_dataset = next((d for d in project.datasets if d.dataset_type == "target"), None) if hasattr(project, "datasets") else None

    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "status": project.status,
        "created_by": project.created_by,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
        "owner_username": project.owner.username if project.owner else None,
        "created_by_username": created_by_user,
        "updated_by_username": audit_username or created_by_user,
        "source_dataset_name": source_dataset.name if source_dataset else None,
        "target_dataset_name": target_dataset.name if target_dataset else None,
    }
