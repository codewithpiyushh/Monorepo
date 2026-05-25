"""
Create one large multi-entity project and run multiple executions for trend charts.

Run:
    .\.venv\Scripts\python.exe scripts\create_large_trend_project.py
"""

from __future__ import annotations

import csv
import io
import random
import sys
import time
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.main import app


def _login(client: TestClient, username: str, password: str) -> dict:
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _csv_bytes(rows: list[dict]) -> io.BytesIO:
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=["entity", "account", "reference", "amount", "date"])
    writer.writeheader()
    writer.writerows(rows)
    return io.BytesIO(out.getvalue().encode("utf-8"))


def _poll_execution(client: TestClient, project_id: int, execution_id: int, headers: dict) -> dict:
    for _ in range(180):
        row = client.get(f"/api/projects/{project_id}/executions/{execution_id}", headers=headers)
        row.raise_for_status()
        payload = row.json()
        if payload.get("status") in {"completed", "failed"}:
            return payload
        time.sleep(0.5)
    raise TimeoutError("Execution timeout")


def _make_source_rows(total: int = 2500) -> list[dict]:
    random.seed(20260524)
    entities = ["US", "IN", "DE", "UK", "SG", "AE"]
    accounts = ["1000-CASH", "1200-BANK", "2100-IC", "3100-PAY", "4100-REV", "4999-SUSP"]
    rows = []
    for i in range(1, total + 1):
        entity = entities[i % len(entities)]
        account = accounts[i % len(accounts)]
        amount = random.randint(200, 15000)
        day = (i % 28) + 1
        rows.append(
            {
                "entity": entity,
                "account": account,
                "reference": f"{entity}-{account.split('-')[0]}-{i:05d}",
                "amount": amount,
                "date": f"2026-04-{day:02d}",
            }
        )
    return rows


def _make_target_rows(source_rows: list[dict], miss_ratio: float, tweak_ratio: float) -> list[dict]:
    total = len(source_rows)
    miss_n = int(total * miss_ratio)
    tweak_n = int(total * tweak_ratio)

    target = [dict(row) for row in source_rows]

    # Remove some rows to force unmatched.
    if miss_n > 0:
        drop_indices = set(range(0, min(miss_n, len(target))))
        target = [row for idx, row in enumerate(target) if idx not in drop_indices]

    # Tweak some amounts/references to generate partial/unmatched.
    for i in range(min(tweak_n, len(target))):
        if i % 2 == 0:
            target[i]["amount"] = int(target[i]["amount"]) + 75
        else:
            target[i]["reference"] = f"{target[i]['reference']}-X"

    # Add extra target-only records.
    for i in range(max(5, miss_n // 3)):
        target.append(
            {
                "entity": "US" if i % 2 == 0 else "IN",
                "account": "4999-SUSP",
                "reference": f"EXTRA-{i:04d}",
                "amount": 999 + i,
                "date": "2026-04-30",
            }
        )

    return target


def main() -> None:
    source_rows = _make_source_rows(total=2600)
    trend_profiles = [
        {"miss_ratio": 0.18, "tweak_ratio": 0.16},
        {"miss_ratio": 0.14, "tweak_ratio": 0.12},
        {"miss_ratio": 0.10, "tweak_ratio": 0.09},
        {"miss_ratio": 0.07, "tweak_ratio": 0.06},
        {"miss_ratio": 0.05, "tweak_ratio": 0.04},
        {"miss_ratio": 0.03, "tweak_ratio": 0.02},
    ]

    with TestClient(app) as client:
        admin_h = _login(client, "admin", "admin123")
        preparer_h = _login(client, "preparer", "preparer123")
        reviewer_h = _login(client, "reviewer", "reviewer123")

        create = client.post(
            "/api/projects",
            headers=admin_h,
            json={
                "name": "Global Mega Trend Reconciliation",
                "description": "Large multi-entity project for dashboard and analytics trend demos.",
            },
        )
        create.raise_for_status()
        project_id = create.json()["id"]

        map_payload = {
            "mappings": [
                {"source_column": "reference", "target_column": "reference", "is_key_field": True},
                {"source_column": "amount", "target_column": "amount", "is_key_field": False},
                {"source_column": "entity", "target_column": "entity", "is_key_field": False},
                {"source_column": "account", "target_column": "account", "is_key_field": False},
                {"source_column": "date", "target_column": "date", "is_key_field": False},
            ]
        }

        for idx, profile in enumerate(trend_profiles, start=1):
            target_rows = _make_target_rows(source_rows, profile["miss_ratio"], profile["tweak_ratio"])
            src_bytes = _csv_bytes(source_rows)
            tgt_bytes = _csv_bytes(target_rows)

            for dataset_type, payload in (("source", src_bytes), ("target", tgt_bytes)):
                upload = client.post(
                    f"/api/projects/{project_id}/datasets",
                    headers=admin_h,
                    files={"file": (f"{dataset_type}_run_{idx}.csv", payload, "text/csv")},
                    data={"dataset_type": dataset_type},
                )
                upload.raise_for_status()

            m = client.post(f"/api/projects/{project_id}/mappings", headers=admin_h, json=map_payload)
            m.raise_for_status()

            r = client.post(
                f"/api/projects/{project_id}/rules",
                headers=admin_h,
                json={"name": f"Exact Amount Run {idx}", "rule_type": "exact", "config": {"source_column": "amount"}, "is_active": True},
            )
            if r.status_code not in {200, 201}:
                r.raise_for_status()

            run = client.post(f"/api/projects/{project_id}/executions", headers=admin_h)
            run.raise_for_status()
            execution_id = run.json()["id"]
            final = _poll_execution(client, project_id, execution_id, admin_h)

            client.post(
                "/api/workflow/assign",
                headers=admin_h,
                json={"reconciliation_id": execution_id, "assigned_to": 2, "comments": f"Assigned run {idx}"},
            )
            if final.get("status") == "completed":
                client.post(
                    "/api/workflow/submit",
                    headers=preparer_h,
                    json={"reconciliation_id": execution_id, "comments": f"Prepared run {idx}; proof: MEGA-{project_id}-{execution_id}"},
                )
                client.post(
                    "/api/workflow/approve",
                    headers=reviewer_h,
                    json={"reconciliation_id": execution_id, "comments": f"Approved run {idx}"},
                )

            print(f"Run {idx}: execution {execution_id} -> {final.get('status')}")

    print(f"Created project id {project_id}: Global Mega Trend Reconciliation")


if __name__ == "__main__":
    main()
