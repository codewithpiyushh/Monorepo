"""
Bootstrap a full demo environment with five fresh projects and datasets.

What this script does:
1. Logs in with built-in users.
2. Deletes all existing projects.
3. Creates 5 new projects with distinct reconciliation scenarios.
4. Uploads source/target datasets for each project.
5. Applies baseline mappings and rules.
6. Triggers execution and advances workflow (submit + approve).

Run from backend folder:
    python scripts/bootstrap_demo_projects.py
"""

from __future__ import annotations

import csv
import io
import sys
import time
from dataclasses import dataclass
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.database import SessionLocal
from app.main import app


@dataclass
class Scenario:
    name: str
    description: str
    source_rows: list[dict]
    target_rows: list[dict]


def _to_csv_bytes(rows: list[dict]) -> io.BytesIO:
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["entity", "account", "reference", "amount", "date"])
    writer.writeheader()
    writer.writerows(rows)
    return io.BytesIO(output.getvalue().encode("utf-8"))


def _login(client: TestClient, username: str, password: str) -> dict:
    resp = client.post("/api/auth/login", json={"username": username, "password": password})
    resp.raise_for_status()
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _poll_execution(client: TestClient, project_id: int, execution_id: int, headers: dict, max_wait_seconds: int = 60) -> dict:
    start = time.time()
    while (time.time() - start) < max_wait_seconds:
        current = client.get(f"/api/projects/{project_id}/executions/{execution_id}", headers=headers)
        current.raise_for_status()
        payload = current.json()
        if payload.get("status") in {"completed", "failed"}:
            return payload
        time.sleep(0.5)
    raise TimeoutError(f"Execution {execution_id} did not complete in time")


def _write_dataset_exports(base_dir: Path, project_name: str, source_rows: list[dict], target_rows: list[dict]) -> None:
    folder = base_dir / project_name.lower().replace(" ", "_")
    folder.mkdir(parents=True, exist_ok=True)
    for label, rows in (("source.csv", source_rows), ("target.csv", target_rows)):
        with (folder / label).open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=["entity", "account", "reference", "amount", "date"])
            writer.writeheader()
            writer.writerows(rows)


def build_scenarios() -> list[Scenario]:
    return [
        Scenario(
            name="Retail Cash Reconciliation",
            description="High-volume retail settlement with mild reference drift.",
            source_rows=[
                {"entity": "IN", "account": "1100-CASH", "reference": "POS-1001", "amount": 1000, "date": "2026-04-01"},
                {"entity": "IN", "account": "1100-CASH", "reference": "POS-1002", "amount": 1450, "date": "2026-04-01"},
                {"entity": "IN", "account": "1100-CASH", "reference": "POS-1003", "amount": 980, "date": "2026-04-02"},
                {"entity": "IN", "account": "1100-CASH", "reference": "POS-1004", "amount": 2100, "date": "2026-04-02"},
            ],
            target_rows=[
                {"entity": "IN", "account": "1100-CASH", "reference": "POS-1001", "amount": 1000, "date": "2026-04-01"},
                {"entity": "IN", "account": "1100-CASH", "reference": "POS-1002", "amount": 1450, "date": "2026-04-01"},
                {"entity": "IN", "account": "1100-CASH", "reference": "POS-1003A", "amount": 980, "date": "2026-04-02"},
                {"entity": "IN", "account": "1100-CASH", "reference": "POS-1005", "amount": 1900, "date": "2026-04-02"},
            ],
        ),
        Scenario(
            name="Bank vs GL Month End",
            description="Month-end bank ledger matching with unmatched bank fees.",
            source_rows=[
                {"entity": "US", "account": "1200-BANK", "reference": "BNK-APR-01", "amount": 5000, "date": "2026-04-28"},
                {"entity": "US", "account": "1200-BANK", "reference": "BNK-APR-02", "amount": 3200, "date": "2026-04-29"},
                {"entity": "US", "account": "1200-BANK", "reference": "BNK-APR-03", "amount": 210, "date": "2026-04-30"},
                {"entity": "US", "account": "1200-BANK", "reference": "BNK-APR-04", "amount": 8700, "date": "2026-04-30"},
            ],
            target_rows=[
                {"entity": "US", "account": "1200-BANK", "reference": "BNK-APR-01", "amount": 5000, "date": "2026-04-28"},
                {"entity": "US", "account": "1200-BANK", "reference": "BNK-APR-02", "amount": 3200, "date": "2026-04-29"},
                {"entity": "US", "account": "1200-BANK", "reference": "BANK-FEE-APR", "amount": 180, "date": "2026-04-30"},
                {"entity": "US", "account": "1200-BANK", "reference": "BNK-APR-04", "amount": 8700, "date": "2026-04-30"},
            ],
        ),
        Scenario(
            name="Intercompany AP-AR",
            description="Cross-entity AP/AR clearing with deliberate timing differences.",
            source_rows=[
                {"entity": "DE", "account": "2100-IC", "reference": "IC-7781", "amount": 9200, "date": "2026-03-30"},
                {"entity": "DE", "account": "2100-IC", "reference": "IC-7782", "amount": 6600, "date": "2026-03-31"},
                {"entity": "DE", "account": "2100-IC", "reference": "IC-7783", "amount": 4350, "date": "2026-03-31"},
                {"entity": "DE", "account": "2100-IC", "reference": "IC-7784", "amount": 9999, "date": "2026-03-31"},
            ],
            target_rows=[
                {"entity": "DE", "account": "2100-IC", "reference": "IC-7781", "amount": 9200, "date": "2026-03-31"},
                {"entity": "DE", "account": "2100-IC", "reference": "IC-7782", "amount": 6600, "date": "2026-04-01"},
                {"entity": "DE", "account": "2100-IC", "reference": "IC-7783", "amount": 4300, "date": "2026-03-31"},
                {"entity": "DE", "account": "2100-IC", "reference": "IC-7785", "amount": 10000, "date": "2026-03-31"},
            ],
        ),
        Scenario(
            name="Payroll Clearing",
            description="Payroll register to cash clearing with minor variance and duplicates.",
            source_rows=[
                {"entity": "UK", "account": "3100-PAY", "reference": "PAY-APR-001", "amount": 15000, "date": "2026-04-25"},
                {"entity": "UK", "account": "3100-PAY", "reference": "PAY-APR-002", "amount": 16200, "date": "2026-04-25"},
                {"entity": "UK", "account": "3100-PAY", "reference": "PAY-APR-003", "amount": 15890, "date": "2026-04-25"},
                {"entity": "UK", "account": "3100-PAY", "reference": "PAY-APR-004", "amount": 1200, "date": "2026-04-25"},
            ],
            target_rows=[
                {"entity": "UK", "account": "3100-PAY", "reference": "PAY-APR-001", "amount": 15000, "date": "2026-04-25"},
                {"entity": "UK", "account": "3100-PAY", "reference": "PAY-APR-002", "amount": 16200, "date": "2026-04-25"},
                {"entity": "UK", "account": "3100-PAY", "reference": "PAY-APR-003", "amount": 15800, "date": "2026-04-25"},
                {"entity": "UK", "account": "3100-PAY", "reference": "PAY-APR-003", "amount": 15800, "date": "2026-04-25"},
            ],
        ),
        Scenario(
            name="Suspense Account Cleanup",
            description="Aging suspense account with old unresolved references.",
            source_rows=[
                {"entity": "SG", "account": "4999-SUSP", "reference": "SUS-100", "amount": 700, "date": "2026-01-15"},
                {"entity": "SG", "account": "4999-SUSP", "reference": "SUS-101", "amount": 450, "date": "2026-01-20"},
                {"entity": "SG", "account": "4999-SUSP", "reference": "SUS-102", "amount": 910, "date": "2026-02-05"},
                {"entity": "SG", "account": "4999-SUSP", "reference": "SUS-103", "amount": 300, "date": "2026-02-10"},
            ],
            target_rows=[
                {"entity": "SG", "account": "4999-SUSP", "reference": "SUS-100", "amount": 700, "date": "2026-01-16"},
                {"entity": "SG", "account": "4999-SUSP", "reference": "SUS-101", "amount": 455, "date": "2026-01-20"},
                {"entity": "SG", "account": "4999-SUSP", "reference": "SUS-104", "amount": 910, "date": "2026-02-05"},
                {"entity": "SG", "account": "4999-SUSP", "reference": "SUS-105", "amount": 280, "date": "2026-02-10"},
            ],
        ),
    ]


def main() -> None:
    scenarios = build_scenarios()
    export_dir = Path(__file__).resolve().parents[1] / "generated_projects"
    export_dir.mkdir(parents=True, exist_ok=True)

    with TestClient(app) as client:
        admin_h = _login(client, "admin", "admin123")
        preparer_h = _login(client, "preparer", "preparer123")
        reviewer_h = _login(client, "reviewer", "reviewer123")
        users = client.get("/api/auth/users", headers=admin_h)
        users.raise_for_status()
        users_by_role = {row.get("role", "").lower(): row for row in users.json()}
        preparer_id = users_by_role.get("preparer", {}).get("id")

        # Clear dependent sequence/workflow artifacts first so project delete does not violate FKs.
        db = SessionLocal()
        try:
            for statement in [
                "DELETE FROM sequence_step_results",
                "DELETE FROM sequence_execution_logs",
                "DELETE FROM sequence_steps",
                "DELETE FROM sequences",
                "DELETE FROM schedules",
                "DELETE FROM workflow_history",
                "DELETE FROM workflows",
            ]:
                db.execute(text(statement))
            db.commit()
        finally:
            db.close()

        # Remove all existing projects first.
        existing = client.get("/api/projects", headers=admin_h)
        existing.raise_for_status()
        for project in existing.json():
            client.delete(f"/api/projects/{project['id']}", headers=admin_h).raise_for_status()

        created = []
        for scenario in scenarios:
            project_resp = client.post(
                "/api/projects",
                headers=admin_h,
                json={"name": scenario.name, "description": scenario.description},
            )
            project_resp.raise_for_status()
            project = project_resp.json()
            project_id = project["id"]

            # Persist CSV assets for demo handoff.
            _write_dataset_exports(export_dir, scenario.name, scenario.source_rows, scenario.target_rows)

            for dataset_type, rows in (("source", scenario.source_rows), ("target", scenario.target_rows)):
                csv_payload = _to_csv_bytes(rows)
                upload = client.post(
                    f"/api/projects/{project_id}/datasets",
                    headers=admin_h,
                    files={"file": (f"{dataset_type}.csv", csv_payload, "text/csv")},
                    data={"dataset_type": dataset_type},
                )
                upload.raise_for_status()

            mappings = [
                {"source_column": "reference", "target_column": "reference", "is_key_field": True},
                {"source_column": "amount", "target_column": "amount", "is_key_field": False},
                {"source_column": "entity", "target_column": "entity", "is_key_field": False},
                {"source_column": "account", "target_column": "account", "is_key_field": False},
            ]
            map_resp = client.post(f"/api/projects/{project_id}/mappings", headers=admin_h, json={"mappings": mappings})
            map_resp.raise_for_status()

            rule_resp = client.post(
                f"/api/projects/{project_id}/rules",
                headers=admin_h,
                json={"name": "Exact Amount Match", "rule_type": "exact", "config": {"source_column": "amount"}, "is_active": True},
            )
            rule_resp.raise_for_status()

            start_execution = client.post(f"/api/projects/{project_id}/executions", headers=admin_h)
            start_execution.raise_for_status()
            execution_id = start_execution.json()["id"]
            final_execution = _poll_execution(client, project_id, execution_id, admin_h)

            if final_execution.get("status") == "completed":
                if preparer_id:
                    client.post(
                        "/api/workflow/assign",
                        headers=admin_h,
                        json={"reconciliation_id": execution_id, "assigned_to": preparer_id, "comments": f"Assigned for {scenario.name}"},
                    ).raise_for_status()
                client.post(
                    "/api/workflow/submit",
                    headers=preparer_h,
                    json={"reconciliation_id": execution_id, "comments": f"Prepared for {scenario.name}; proof: DEMO-{project_id}-{execution_id}"},
                ).raise_for_status()
                client.post(
                    "/api/workflow/approve",
                    headers=reviewer_h,
                    json={"reconciliation_id": execution_id, "comments": f"Approved for {scenario.name}"},
                ).raise_for_status()

            created.append(
                {
                    "project_id": project_id,
                    "project_name": scenario.name,
                    "execution_id": execution_id,
                    "execution_status": final_execution.get("status"),
                }
            )

    print("\nDemo bootstrap complete.")
    print(f"Generated dataset files: {export_dir}")
    for row in created:
        print(f"- {row['project_id']}: {row['project_name']} | execution {row['execution_id']} -> {row['execution_status']}")


if __name__ == "__main__":
    main()
