#!/usr/bin/env python3
"""
Bootstrap a MySQL database with the core data this app expects.

This script seeds:
- local users
- the sample reconciliation projects
- one sample sequence
- representative enterprise/profile data

Run from backend folder:
    python scripts/bootstrap_demo_database.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal, init_db
from app.database import Base
from app.main import app
from app.models.models import (
    AuditPackage,
    BackupRecord,
    CertificationWorkflow,
    CertificationWorkflowHistory,
    CloseTask,
    EnterpriseSetting,
    ExceptionQueueRecord,
    ExchangeRate,
    FinancialCloseCalendar,
    JobMetric,
    JournalAdjustment,
    JournalAdjustmentHistory,
    MatchGroup,
    MatchGroupItem,
    ModulePermission,
    NotificationEvent,
    ReconciliationArchive,
    ReconciliationDependency,
    ReconciliationOwnership,
    ReconciliationProfile,
    ReconciliationRecord,
    ReconciliationRetentionPolicy,
    ReconciliationRuleDefinition,
    ReconciliationSnapshot,
    ReminderLog,
    ScheduledReport,
    ScheduledReportRun,
    UINotification,
    User,
    ValidationRuleResult,
)
from app.rbac.roles import ADMIN, APPROVER, CERTIFIER, PREPARER, REVIEWER
from app.schemas.schemas import UserCreate
from app.services.auth_service import create_user

import seed_sample_projects


def _ensure_user(db, username: str, email: str, password: str, role: str) -> User:
    user = db.query(User).filter(User.username == username).first()
    if user:
        return user
    return create_user(db, UserCreate(username=username, email=email, password=password, role=role))


def _reset_demo_database(db) -> None:
    """
    Clear existing demo data so the bootstrap can be rerun safely.

    This prevents duplicate sample projects, duplicate sequences, and duplicate
    enterprise rows when the seed script is executed more than once.
    """
    db.execute(text("SET FOREIGN_KEY_CHECKS=0"))
    try:
        for table in reversed(Base.metadata.sorted_tables):
            db.execute(table.delete())
        db.commit()
    finally:
        db.execute(text("SET FOREIGN_KEY_CHECKS=1"))
        db.commit()


def _poll_sequence_status(client: TestClient, sequence_id: int, headers: dict, max_wait_seconds: int = 120) -> dict:
    import time

    deadline = time.time() + max_wait_seconds
    while time.time() < deadline:
        response = client.get(f"/api/sequences/{sequence_id}/status", headers=headers)
        response.raise_for_status()
        payload = response.json()
        if (payload.get("status") or "").lower() in {"completed", "failed"}:
            return payload
        time.sleep(1.5)
    raise TimeoutError(f"Sequence {sequence_id} did not finish in time")


def _seed_project_flow(client: TestClient, headers: dict) -> list[dict]:
    created: list[dict] = []

    for scenario in seed_sample_projects.SCENARIOS:
        project = client.post(
            "/api/projects",
            headers=headers,
            json={"name": scenario.name, "description": scenario.description},
        )
        project.raise_for_status()
        project_id = project.json()["id"]

        for dataset_type, rows in {"source": scenario.source_rows, "target": scenario.target_rows}.items():
            upload = client.post(
                f"/api/projects/{project_id}/datasets",
                headers=headers,
                files={
                    "file": (
                        f"{scenario.name.lower().replace(' ', '_')}_{dataset_type}.csv",
                        seed_sample_projects._csv_bytes(rows),
                        "text/csv",
                    )
                },
                data={"dataset_type": dataset_type},
            )
            upload.raise_for_status()

        for mapping in scenario.mappings:
            resp = client.post(
                f"/api/projects/{project_id}/mappings",
                headers=headers,
                json={"mappings": [mapping]},
            )
            resp.raise_for_status()

        for rule in scenario.rule_payloads:
            resp = client.post(f"/api/projects/{project_id}/rules", headers=headers, json=rule)
            resp.raise_for_status()

        run = client.post(f"/api/projects/{project_id}/executions", headers=headers)
        run.raise_for_status()
        execution_id = run.json()["id"]
        final = seed_sample_projects._poll_execution(client, project_id, execution_id, headers)

        promote = client.post(
            f"/api/projects/{project_id}/executions/{execution_id}/promote",
            headers=headers,
            json=scenario.promote_payload,
        )
        promote.raise_for_status()

        created.append(
            {
                "scenario": scenario,
                "project_id": project_id,
                "execution_id": execution_id,
                "status": final["status"],
            }
        )

    return created


def _seed_sequence(client: TestClient, headers: dict, project_ids: list[int]) -> dict | None:
    if len(project_ids) < 2:
        return None

    payload = {
        "name": "Month-End Close Sequence",
        "steps": project_ids[:3],
        "stop_on_failure": True,
    }
    response = client.post("/api/sequences", headers=headers, json=payload)
    response.raise_for_status()
    sequence = response.json()

    run = client.post(f"/api/sequences/{sequence['id']}/run", headers=headers)
    run.raise_for_status()
    status = _poll_sequence_status(client, sequence["id"], headers)
    sequence["final_status"] = status
    return sequence


def _add_global_baseline_rows(db, admin_id: int, user_ids: dict[str, int], created_projects: list[dict]) -> None:
    db.query(ModulePermission).delete()
    db.query(EnterpriseSetting).delete()
    db.query(ReconciliationRetentionPolicy).delete()
    db.query(ScheduledReportRun).delete()
    db.query(ScheduledReport).delete()
    db.query(JobMetric).delete()

    db.add_all(
        [
            ModulePermission(role=ADMIN, module_name="projects", can_view=True, can_edit=True, can_approve=True),
            ModulePermission(role=PREPARER, module_name="projects", can_view=True, can_edit=True, can_approve=False),
            ModulePermission(role=REVIEWER, module_name="projects", can_view=True, can_edit=False, can_approve=True),
            ModulePermission(role=APPROVER, module_name="projects", can_view=True, can_edit=False, can_approve=True),
            ModulePermission(role=CERTIFIER, module_name="projects", can_view=True, can_edit=False, can_approve=True),
            EnterpriseSetting(
                category="ui",
                key="default_dashboard",
                value_json=json.dumps({"home": "command_center", "accent": "teal"}),
                description="Default seed dashboard configuration",
                updated_by=admin_id,
            ),
            ReconciliationRetentionPolicy(
                name="Default 24 Month Retention",
                retention_days=730,
                purge_after_days=1095,
                preserve_for_compliance=True,
                active=True,
                created_by=admin_id,
            ),
            ExchangeRate(
                from_currency="USD",
                to_currency="INR",
                rate=83.12,
                rate_date="2026-06-01",
                source="seed",
            ),
            JobMetric(
                job_name="bootstrap_demo_database",
                status="COMPLETED",
                duration_ms=1500,
                message="Seeded baseline demo database content",
            ),
            BackupRecord(
                backup_type="bootstrap",
                target_path="seed://bootstrap_demo_database",
                checksum=None,
                status="COMPLETED",
                created_by=admin_id,
            ),
        ]
    )

    if created_projects:
        first_project = created_projects[0]["project_id"]
        db.add(
            AuditPackage(
                reconciliation_id=created_projects[0]["execution_id"],
                generated_by=admin_id,
                package_path=f"seed://audit-package/project-{first_project}.zip",
                checksum=None,
            )
        )

    db.commit()


def _seed_enterprise_rows(db, admin_id: int, user_ids: dict[str, int], created_projects: list[dict]) -> None:
    profiles: list[ReconciliationProfile] = []

    for entry in created_projects:
        scenario = entry["scenario"]
        sample_row = scenario.source_rows[0]
        profile_name = f"{scenario.name} Enterprise Profile"

        profile = db.query(ReconciliationProfile).filter(ReconciliationProfile.name == profile_name).first()
        if profile is None:
            profile = ReconciliationProfile(
                name=profile_name,
                reconciliation_type=scenario.recon_type,
                frequency="MONTHLY",
                tolerance_threshold=5.0,
                date_window_days=2,
                workflow_config_json=json.dumps({"source": "project_seed", "project_id": entry["project_id"]}),
                matching_rules_json=json.dumps({"primary_rule": scenario.rule_payloads[0]["name"]}),
                assigned_preparer=user_ids["preparer"],
                assigned_reviewer=user_ids["reviewer"],
                assigned_approver=user_ids["approver"],
                assigned_certifier=user_ids["certifier"],
                risk_classification=scenario.promote_payload["risk_classification"],
                due_days=5,
                lifecycle_state="OPEN",
                active=True,
            )
            db.add(profile)
            db.flush()
        profiles.append(profile)

        db.add(
            ReconciliationOwnership(
                profile_id=profile.id,
                owner_user_id=user_ids["preparer"],
                owner_role=PREPARER,
            )
        )

        period_key = sample_row["period"]
        calendar = FinancialCloseCalendar(
            profile_id=profile.id,
            cycle_type="MONTHLY",
            period_key=period_key,
            start_date=f"{period_key}-01",
            end_date=f"{period_key}-28",
            due_date=f"{period_key}-15",
            status="OPEN",
            is_locked=False,
            locked_by=None,
        )
        db.add(calendar)
        db.flush()

        workflow = CertificationWorkflow(
            profile_id=profile.id,
            calendar_id=calendar.id,
            status="OPEN",
            current_stage="PREPARER",
            preparer_id=user_ids["preparer"],
            reviewer_id=user_ids["reviewer"],
            approver_id=user_ids["approver"],
            certifier_id=user_ids["certifier"],
            due_date=calendar.due_date,
            last_comment="Seeded enterprise workflow",
        )
        db.add(workflow)
        db.flush()

        db.add(
            CertificationWorkflowHistory(
                workflow_id=workflow.id,
                actor_id=user_ids["preparer"],
                actor_role=PREPARER,
                action="PREPARE",
                from_status=None,
                to_status="OPEN",
                comments="Seeded workflow created",
            )
        )
        db.add(
            ReminderLog(
                workflow_id=workflow.id,
                reminder_type="DUE_SOON",
                severity="LOW",
                message=f"{profile.name} is ready for preparer action.",
                sent_to_role=PREPARER,
            )
        )
        db.add(
            NotificationEvent(
                event_type="REMINDER",
                workflow_id=workflow.id,
                recipient_email="preparer@drms.com",
                subject=f"Action needed: {profile.name}",
                body=f"Enterprise workflow for {profile.name} was seeded.",
                status="QUEUED",
            )
        )
        db.add(
            UINotification(
                user_id=user_ids["preparer"],
                notification_type="workflow",
                title=f"Workflow ready: {profile.name}",
                message=f"{profile.name} is waiting for preparer review.",
                icon_type="info",
                action_url=f"/projects/{entry['project_id']}/preparer",
                action_label="Open",
            )
        )

        rule_def = db.query(ReconciliationRuleDefinition).filter(
            ReconciliationRuleDefinition.name == f"{profile.name} Rule"
        ).first()
        if rule_def is None:
            db.add(
                ReconciliationRuleDefinition(
                    name=f"{profile.name} Rule",
                    template_type=scenario.recon_type,
                    profile_id=profile.id,
                    is_reusable=True,
                    conditions_json=json.dumps(scenario.rule_payloads[0]["config"]),
                    filters_json=json.dumps({"currency": sample_row["currency"]}),
                    thresholds_json=json.dumps({"tolerance": 5.0}),
                    created_by=admin_id,
                )
            )

        records: list[ReconciliationRecord] = []
        for row in scenario.source_rows[:4]:
            records.append(
                ReconciliationRecord(
                    batch_id=f"SEED-{entry['project_id']}",
                    profile_id=profile.id,
                    source_system=row["source_system"],
                    entity=row["entity"],
                    account=row["account"],
                    period=row["period"],
                    currency=row["currency"],
                    amount=row["amount"],
                    reference=row["reference"],
                    tx_date=row["tx_date"],
                    normalized_sign="POSITIVE",
                    status="VALIDATED",
                    payload_json=json.dumps(row),
                )
            )
        db.add_all(records)
        db.flush()

        match_group = MatchGroup(
            profile_id=profile.id,
            strategy="rule_based",
            classification="FULL_MATCH" if len(records) >= 2 else "UNMATCHED",
            confidence=0.98,
            variance_amount=0.0,
            reconciled=True,
            finalized=False,
        )
        db.add(match_group)
        db.flush()
        db.add_all(
            [
                MatchGroupItem(match_group_id=match_group.id, reconciliation_record_id=records[0].id),
                MatchGroupItem(match_group_id=match_group.id, reconciliation_record_id=records[1].id),
            ]
        )
        db.add(
            ExceptionQueueRecord(
                match_group_id=match_group.id,
                queue_type="exception",
                assigned_to=user_ids["reviewer"],
                status="OPEN",
                comments="Seeded exception for review queue visibility",
                classification="DATA_ISSUE",
            )
        )
        db.add(
            ValidationRuleResult(
                batch_id=f"SEED-{entry['project_id']}",
                profile_id=profile.id,
                rule_name="Seed validation rule",
                severity="MEDIUM",
                passed=True,
                message="Seed validation passed",
                payload_json=json.dumps({"project_id": entry["project_id"]}),
            )
        )
        db.add(
            ReconciliationSnapshot(
                profile_id=profile.id,
                period_key=period_key,
                snapshot_name=f"{profile.name} Snapshot",
                snapshot_json=json.dumps({"project_id": entry["project_id"], "records": len(records)}),
                created_by=admin_id,
            )
        )
        db.add(
            ReconciliationArchive(
                profile_id=profile.id,
                period_key=period_key,
                archive_payload_json=json.dumps(
                    [{"id": r.id, "status": r.status, "amount": r.amount} for r in records]
                ),
                archived_by=admin_id,
                restore_count=0,
            )
        )
        adjustment = JournalAdjustment(
            profile_id=profile.id,
            period_key=period_key,
            account=sample_row["account"],
            currency=sample_row["currency"],
            amount=12.5,
            functional_currency=sample_row["currency"],
            reporting_currency="USD",
            converted_amount=12.5,
            reason="Seed adjustment",
            status="DRAFT",
            created_by=admin_id,
        )
        db.add(adjustment)
        db.flush()

        db.add(
            JournalAdjustmentHistory(
                adjustment_id=adjustment.id,
                action="CREATE",
                actor_id=admin_id,
                comments="Seeded adjustment record",
            )
        )
        db.add(
            CloseTask(
                calendar_id=calendar.id,
                profile_id=profile.id,
                task_name=f"Prepare {profile.name}",
                task_type="CUSTOM",
                description="Seeded preparer task",
                assigned_to=user_ids["preparer"],
                due_date=calendar.due_date,
                status="NOT_STARTED",
                completion_pct=0.0,
                sort_order=1,
            )
        )
        db.add(
            CloseTask(
                calendar_id=calendar.id,
                profile_id=profile.id,
                task_name=f"Review {profile.name}",
                task_type="CUSTOM",
                description="Seeded review task",
                assigned_to=user_ids["reviewer"],
                due_date=calendar.due_date,
                status="NOT_STARTED",
                completion_pct=0.0,
                sort_order=2,
            )
        )

    if len(profiles) >= 2:
        db.add(
            ReconciliationDependency(
                parent_profile_id=profiles[0].id,
                child_profile_id=profiles[1].id,
                dependency_type="close_process",
                is_blocking=True,
                status="OPEN",
                created_by=admin_id,
            )
        )

    db.commit()


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        _reset_demo_database(db)
        admin = _ensure_user(db, "admin", "admin@drms.com", "admin123", ADMIN)
        preparer = _ensure_user(db, "preparer", "preparer@drms.com", "preparer123", PREPARER)
        reviewer = _ensure_user(db, "reviewer", "reviewer@drms.com", "reviewer123", REVIEWER)
        approver = _ensure_user(db, "approver", "approver@drms.com", "approver123", APPROVER)
        certifier = _ensure_user(db, "certifier", "certifier@drms.com", "certifier123", CERTIFIER)
        user_ids = {
            "admin": admin.id,
            "preparer": preparer.id,
            "reviewer": reviewer.id,
            "approver": approver.id,
            "certifier": certifier.id,
        }
    finally:
        db.close()

    client = TestClient(app)
    login = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    login.raise_for_status()
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    created_projects = _seed_project_flow(client, headers)
    sequence = _seed_sequence(client, headers, [item["project_id"] for item in created_projects])

    db = SessionLocal()
    try:
        _add_global_baseline_rows(db, user_ids["admin"], user_ids, created_projects)
        _seed_enterprise_rows(db, user_ids["admin"], user_ids, created_projects)
    finally:
        db.close()

    print("Seeded database successfully.")
    print(f"Projects: {len(created_projects)}")
    if sequence:
        print(f"Sequence: {sequence['id']} ({sequence['status']})")


if __name__ == "__main__":
    main()
