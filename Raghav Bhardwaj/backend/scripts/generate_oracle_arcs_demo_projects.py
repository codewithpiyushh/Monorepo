"""
Generate additional Oracle ARCS-style demo projects without deleting existing data.

What this script does:
1. Logs in with admin/preparer/reviewer users.
2. Creates multiple reconciliation projects with varied risk patterns.
3. Uploads source/target datasets.
4. Applies mappings and baseline rule.
5. Triggers execution and completes assign -> submit -> approve flow.

Run from backend folder:
    .\\.venv\\Scripts\\python.exe scripts\\generate_oracle_arcs_demo_projects.py
"""

from __future__ import annotations

import csv
import io
import sys
import time
from dataclasses import dataclass
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
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


def _poll_execution(client: TestClient, project_id: int, execution_id: int, headers: dict, max_wait_seconds: int = 90) -> dict:
    start = time.time()
    while (time.time() - start) < max_wait_seconds:
        current = client.get(f"/api/projects/{project_id}/executions/{execution_id}", headers=headers)
        current.raise_for_status()
        payload = current.json()
        if payload.get("status") in {"completed", "failed"}:
            return payload
        time.sleep(0.5)
    raise TimeoutError(f"Execution {execution_id} did not complete in time")


def _build_scenarios() -> list[Scenario]:
    return [
        Scenario(
            name="ARCS Demo - FX Clearing LATAM",
            description="FX clearing reconciliation with tolerance and date-window variances.",
            source_rows=[
                {"entity": "MX", "account": "4200-FX", "reference": "FX-1001", "amount": 10250, "date": "2026-05-01"},
                {"entity": "MX", "account": "4200-FX", "reference": "FX-1002", "amount": 9870, "date": "2026-05-01"},
                {"entity": "BR", "account": "4200-FX", "reference": "FX-2001", "amount": 14120, "date": "2026-05-02"},
                {"entity": "BR", "account": "4200-FX", "reference": "FX-2002", "amount": 7500, "date": "2026-05-02"},
            ],
            target_rows=[
                {"entity": "MX", "account": "4200-FX", "reference": "FX-1001", "amount": 10250, "date": "2026-05-01"},
                {"entity": "MX", "account": "4200-FX", "reference": "FX-1002-A", "amount": 9860, "date": "2026-05-02"},
                {"entity": "BR", "account": "4200-FX", "reference": "FX-2001", "amount": 14120, "date": "2026-05-02"},
                {"entity": "BR", "account": "4200-FX", "reference": "FX-2009", "amount": 7600, "date": "2026-05-03"},
            ],
        ),
        Scenario(
            name="ARCS Demo - High Risk Intercompany",
            description="Intercompany close with intentional reference drift and unmatched tails.",
            source_rows=[
                {"entity": "US", "account": "2100-IC", "reference": "IC-US-001", "amount": 25000, "date": "2026-05-03"},
                {"entity": "US", "account": "2100-IC", "reference": "IC-US-002", "amount": 12990, "date": "2026-05-03"},
                {"entity": "DE", "account": "2100-IC", "reference": "IC-DE-010", "amount": 24880, "date": "2026-05-03"},
                {"entity": "DE", "account": "2100-IC", "reference": "IC-DE-011", "amount": 13210, "date": "2026-05-03"},
            ],
            target_rows=[
                {"entity": "US", "account": "2100-IC", "reference": "IC-US-001", "amount": 25000, "date": "2026-05-03"},
                {"entity": "US", "account": "2100-IC", "reference": "IC-US-002-X", "amount": 13010, "date": "2026-05-04"},
                {"entity": "DE", "account": "2100-IC", "reference": "IC-DE-010", "amount": 24880, "date": "2026-05-03"},
                {"entity": "DE", "account": "2100-IC", "reference": "IC-DE-999", "amount": 9000, "date": "2026-05-04"},
            ],
        ),
        Scenario(
            name="ARCS Demo - Suspense Aging Watch",
            description="Aging suspense queue with mix of matched and open items.",
            source_rows=[
                {"entity": "AE", "account": "4999-SUSP", "reference": "SUS-5001", "amount": 750, "date": "2026-03-15"},
                {"entity": "AE", "account": "4999-SUSP", "reference": "SUS-5002", "amount": 920, "date": "2026-03-20"},
                {"entity": "AE", "account": "4999-SUSP", "reference": "SUS-5003", "amount": 1640, "date": "2026-03-21"},
                {"entity": "AE", "account": "4999-SUSP", "reference": "SUS-5004", "amount": 430, "date": "2026-03-22"},
            ],
            target_rows=[
                {"entity": "AE", "account": "4999-SUSP", "reference": "SUS-5001", "amount": 750, "date": "2026-03-15"},
                {"entity": "AE", "account": "4999-SUSP", "reference": "SUS-5002", "amount": 930, "date": "2026-03-21"},
                {"entity": "AE", "account": "4999-SUSP", "reference": "SUS-5003", "amount": 1640, "date": "2026-03-21"},
                {"entity": "AE", "account": "4999-SUSP", "reference": "SUS-5111", "amount": 430, "date": "2026-03-24"},
            ],
        ),
    ]


def main() -> None:
    scenarios = _build_scenarios()
    stamp = int(time.time())

    with TestClient(app) as client:
        admin_h = _login(client, "admin", "admin123")
        preparer_h = _login(client, "preparer", "preparer123")
        reviewer_h = _login(client, "reviewer", "reviewer123")

        users = client.get("/api/auth/users", headers=admin_h)
        users.raise_for_status()
        users_by_role = {row.get("role", "").lower(): row for row in users.json()}
        preparer_id = users_by_role.get("preparer", {}).get("id", 2)

        created = []
        for index, scenario in enumerate(scenarios, start=1):
            project_name = f"{scenario.name} #{stamp}-{index}"
            project_resp = client.post(
                "/api/projects",
                headers=admin_h,
                json={"name": project_name, "description": scenario.description},
            )
            project_resp.raise_for_status()
            project = project_resp.json()
            project_id = project["id"]

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
                json={"name": "ARCS Exact Amount", "rule_type": "exact", "config": {"source_column": "amount"}, "is_active": True},
            )
            rule_resp.raise_for_status()

            start_execution = client.post(f"/api/projects/{project_id}/executions", headers=admin_h)
            start_execution.raise_for_status()
            execution_id = start_execution.json()["id"]
            final_execution = _poll_execution(client, project_id, execution_id, admin_h)

            if final_execution.get("status") == "completed":
                client.post(
                    "/api/workflow/assign",
                    headers=admin_h,
                    json={"reconciliation_id": execution_id, "assigned_to": preparer_id, "comments": f"ARCS demo assignment for {project_name}"},
                ).raise_for_status()
                client.post(
                    "/api/workflow/submit",
                    headers=preparer_h,
                    json={"reconciliation_id": execution_id, "comments": f"Prepared for {project_name}; proof: ARCS-{project_id}-{execution_id}"},
                ).raise_for_status()
                client.post(
                    "/api/workflow/approve",
                    headers=reviewer_h,
                    json={"reconciliation_id": execution_id, "comments": f"Approved for {project_name}"},
                ).raise_for_status()

            created.append({
                "project_id": project_id,
                "project_name": project_name,
                "execution_id": execution_id,
                "execution_status": final_execution.get("status"),
            })

    print("\nOracle ARCS-style demo generation complete.")
    for row in created:
        print(f"- {row['project_id']}: {row['project_name']} | execution {row['execution_id']} -> {row['execution_status']}")


if __name__ == "__main__":
    main()
