"""
Create a richer demo environment with multiple projects, varied datasets,
workflow states, and workflow proof attachments.

Run from the backend folder:
    .\.venv\Scripts\python.exe scripts\create_rich_demo_environment.py
"""

from __future__ import annotations

import csv
import io
import json
import random
import sys
import time
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.main import app


@dataclass
class DemoScenario:
    name: str
    description: str
    total_rows: int
    mismatch_ratio: float
    drop_ratio: float
    extra_target_rows: int
    workflow_mode: str  # auto_approved | approved | under_review | rejected | reject_then_approve | pending
    seed: int
    entities: list[str]
    accounts: list[str]
    currencies: list[str]
    regions: list[str]


def _login(client: TestClient, username: str, password: str) -> dict:
    resp = client.post("/api/auth/login", json={"username": username, "password": password})
    resp.raise_for_status()
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _csv_bytes(rows: list[dict], fieldnames: list[str]) -> io.BytesIO:
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    return io.BytesIO(output.getvalue().encode("utf-8"))


def _poll_execution(client: TestClient, project_id: int, execution_id: int, headers: dict, max_wait_seconds: int = 120) -> dict:
    start = time.time()
    while (time.time() - start) < max_wait_seconds:
        current = client.get(f"/api/projects/{project_id}/executions/{execution_id}", headers=headers)
        current.raise_for_status()
        payload = current.json()
        if payload.get("status") in {"completed", "failed"}:
            return payload
        time.sleep(0.5)
    raise TimeoutError(f"Execution {execution_id} did not complete in time")


def _build_rows(scenario: DemoScenario) -> tuple[list[dict], list[dict]]:
    rng = random.Random(scenario.seed)
    source_rows: list[dict] = []
    target_rows: list[dict] = []

    for index in range(1, scenario.total_rows + 1):
        entity = rng.choice(scenario.entities)
        account = rng.choice(scenario.accounts)
        currency = rng.choice(scenario.currencies)
        region = rng.choice(scenario.regions)
        batch_id = f"BATCH-{scenario.seed}-{(index - 1) // 20 + 1:03d}"
        amount = rng.randint(125, 27500)
        month = 3 + (index % 3)
        day = (index % 27) + 1
        reference = f"{entity}-{account.split('-')[0]}-{scenario.seed % 1000:03d}-{index:05d}"
        source_row = {
            "entity": entity,
            "account": account,
            "reference": reference,
            "amount": amount,
            "date": f"2026-0{month}-{day:02d}",
            "currency": currency,
            "region": region,
            "cost_center": f"CC-{(index % 9) + 1:02d}",
            "source_system": "ERP",
            "target_system": "GL",
            "batch_id": batch_id,
            "narrative": f"{scenario.name} source row {index}",
        }
        source_rows.append(source_row)

        if rng.random() < scenario.drop_ratio:
            continue

        target_row = dict(source_row)
        tweak = rng.random()
        if tweak < scenario.mismatch_ratio:
            mode = rng.choice(["amount", "reference", "date", "region"])
            if mode == "amount":
                target_row["amount"] = int(target_row["amount"]) + rng.choice([-75, -25, 25, 85])
            elif mode == "reference":
                target_row["reference"] = f"{target_row['reference']}-REV"
            elif mode == "date":
                target_row["date"] = f"2026-0{month}-{min(day + 1, 28):02d}"
            else:
                target_row["region"] = rng.choice([r for r in scenario.regions if r != target_row["region"]] or scenario.regions)
        elif tweak < scenario.mismatch_ratio + 0.10:
            target_row["narrative"] = f"{scenario.name} reviewed row {index}"
        target_rows.append(target_row)

    for extra_idx in range(1, scenario.extra_target_rows + 1):
      target_rows.append(
          {
              "entity": rng.choice(scenario.entities),
              "account": rng.choice(scenario.accounts),
              "reference": f"EXTRA-{scenario.seed}-{extra_idx:04d}",
              "amount": rng.randint(200, 5000),
              "date": "2026-05-31",
              "currency": rng.choice(scenario.currencies),
              "region": rng.choice(scenario.regions),
              "cost_center": f"CC-X{extra_idx:02d}",
              "source_system": "BANK",
              "target_system": "GL",
              "batch_id": f"EXTRA-{scenario.seed}",
              "narrative": f"Target-only record {extra_idx}",
          }
      )

    return source_rows, target_rows


def _scenario_proofs(scenario: DemoScenario, project_id: int, execution_id: int) -> list[tuple[str, bytes]]:
    base = f"{scenario.name} / project {project_id} / execution {execution_id}"
    proofs = [
        ("preparer_justification.txt", f"{base}\nPrepared reconciliation notes.\n".encode("utf-8")),
        ("invoice_support.txt", f"{base}\nInvoice evidence and reference support.\n".encode("utf-8")),
    ]
    if scenario.workflow_mode in {"reject_then_approve", "rejected"}:
        proofs.append(("review_response.txt", f"{base}\nReviewer query pack and clarifications.\n".encode("utf-8")))
    return proofs


def _fieldnames() -> list[str]:
    return [
        "entity",
        "account",
        "reference",
        "amount",
        "date",
        "currency",
        "region",
        "cost_center",
        "source_system",
        "target_system",
        "batch_id",
        "narrative",
    ]


def _build_scenarios() -> list[DemoScenario]:
    return [
        DemoScenario(
            name="ARCS Demo - Exact Close",
            description="A fully matched close that auto-approves and shows a clean completion path.",
            total_rows=45,
            mismatch_ratio=0.00,
            drop_ratio=0.00,
            extra_target_rows=0,
            workflow_mode="auto_approved",
            seed=101,
            entities=["US", "IN", "UK"],
            accounts=["1000-CASH", "1100-BANK"],
            currencies=["USD", "INR", "GBP"],
            regions=["NA", "APAC", "EMEA"],
        ),
        DemoScenario(
            name="ARCS Demo - Retail Variance Watch",
            description="Retail settlement with a few partials and unmatched items left for review.",
            total_rows=80,
            mismatch_ratio=0.15,
            drop_ratio=0.08,
            extra_target_rows=3,
            workflow_mode="under_review",
            seed=202,
            entities=["US", "CA", "MX"],
            accounts=["1200-BANK", "4100-REV", "4999-SUSP"],
            currencies=["USD", "CAD", "MXN"],
            regions=["NA", "LATAM"],
        ),
        DemoScenario(
            name="ARCS Demo - Intercompany Exception",
            description="Intercompany close deliberately rejected back to the preparer for rework.",
            total_rows=72,
            mismatch_ratio=0.18,
            drop_ratio=0.12,
            extra_target_rows=4,
            workflow_mode="rejected",
            seed=303,
            entities=["DE", "FR", "ES"],
            accounts=["2100-IC", "2200-IC"],
            currencies=["EUR"],
            regions=["EMEA"],
        ),
        DemoScenario(
            name="ARCS Demo - Payroll Resubmission",
            description="Payroll clearing with a reject-then-resubmit cycle to show full history.",
            total_rows=68,
            mismatch_ratio=0.10,
            drop_ratio=0.07,
            extra_target_rows=2,
            workflow_mode="reject_then_approve",
            seed=404,
            entities=["UK", "IE", "SG"],
            accounts=["3100-PAY", "3150-BONUS"],
            currencies=["GBP", "EUR", "SGD"],
            regions=["EMEA", "APAC"],
        ),
        DemoScenario(
            name="ARCS Demo - Suspense Pending Review",
            description="An assigned task left pending so the preparer inbox shows actionable work.",
            total_rows=56,
            mismatch_ratio=0.12,
            drop_ratio=0.10,
            extra_target_rows=3,
            workflow_mode="pending",
            seed=505,
            entities=["AE", "SA", "QA"],
            accounts=["4999-SUSP", "4300-ACCRUAL"],
            currencies=["AED", "SAR", "QAR"],
            regions=["GCC"],
        ),
        DemoScenario(
            name="ARCS Demo - Global Volume Trend",
            description="Large multi-entity dataset to stress dashboards, drilldowns, and queue filters.",
            total_rows=650,
            mismatch_ratio=0.11,
            drop_ratio=0.06,
            extra_target_rows=25,
            workflow_mode="approved",
            seed=606,
            entities=["US", "IN", "DE", "UK", "SG", "AE"],
            accounts=["1000-CASH", "1200-BANK", "2100-IC", "3100-PAY", "4100-REV", "4999-SUSP"],
            currencies=["USD", "INR", "EUR", "GBP", "SGD", "AED"],
            regions=["NA", "APAC", "EMEA", "LATAM"],
        ),
    ]


def _upload_proofs(client: TestClient, workflow_id: int, headers: dict, proofs: list[tuple[str, bytes]]) -> list[dict]:
    uploaded = []
    for file_name, file_bytes in proofs:
        response = client.post(
            f"/api/workflow/{workflow_id}/attachments",
            headers=headers,
            files={"file": (file_name, io.BytesIO(file_bytes), "text/plain")},
        )
        response.raise_for_status()
        uploaded.append(response.json())
    return uploaded


def _write_project_assets(run_dir: Path, scenario: DemoScenario, source_rows: list[dict], target_rows: list[dict]) -> None:
    project_dir = run_dir / scenario.name.lower().replace(" ", "_").replace("-", "_")
    project_dir.mkdir(parents=True, exist_ok=True)
    fieldnames = _fieldnames()
    for label, rows in (("source.csv", source_rows), ("target.csv", target_rows)):
        with (project_dir / label).open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)


def main() -> None:
    scenarios = _build_scenarios()
    stamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    run_dir = Path(__file__).resolve().parents[1] / "generated_rich_demo_data" / stamp
    run_dir.mkdir(parents=True, exist_ok=True)

    manifest: list[dict] = []
    fieldnames = _fieldnames()

    with TestClient(app) as client:
        admin_h = _login(client, "admin", "admin123")
        preparer_h = _login(client, "preparer", "preparer123")
        reviewer_h = _login(client, "reviewer", "reviewer123")

        users_resp = client.get("/api/auth/users", headers=admin_h)
        users_resp.raise_for_status()
        users_by_role = {row.get("role", "").lower(): row for row in users_resp.json()}
        preparer_id = users_by_role.get("preparer", {}).get("id")

        for index, scenario in enumerate(scenarios, start=1):
            source_rows, target_rows = _build_rows(scenario)
            _write_project_assets(run_dir, scenario, source_rows, target_rows)

            project_name = f"{scenario.name} [{stamp[:8]}-{index}]"
            project_resp = client.post(
                "/api/projects",
                headers=admin_h,
                json={"name": project_name, "description": scenario.description},
            )
            project_resp.raise_for_status()
            project = project_resp.json()
            project_id = project["id"]

            for dataset_type, rows in (("source", source_rows), ("target", target_rows)):
                csv_payload = _csv_bytes(rows, fieldnames)
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
                {"source_column": "date", "target_column": "date", "is_key_field": False},
                {"source_column": "currency", "target_column": "currency", "is_key_field": False},
                {"source_column": "region", "target_column": "region", "is_key_field": False},
            ]
            client.post(f"/api/projects/{project_id}/mappings", headers=admin_h, json={"mappings": mappings}).raise_for_status()

            rules = [
                {"name": "Exact Reference", "rule_type": "exact", "config": {"source_column": "reference"}, "is_active": True},
                {"name": "Amount Tolerance", "rule_type": "tolerance", "config": {"source_column": "amount", "threshold": 25}, "is_active": True},
                {"name": "Date Drift", "rule_type": "date_diff", "config": {"source_column": "date", "threshold": 1, "date_format": "%Y-%m-%d"}, "is_active": True},
            ]
            for rule in rules:
                client.post(f"/api/projects/{project_id}/rules", headers=admin_h, json=rule).raise_for_status()

            start_execution = client.post(f"/api/projects/{project_id}/executions", headers=admin_h)
            start_execution.raise_for_status()
            execution_id = start_execution.json()["id"]

            if scenario.workflow_mode == "pending":
                if preparer_id:
                    client.post(
                        "/api/workflow/assign",
                        headers=admin_h,
                        json={"reconciliation_id": execution_id, "assigned_to": preparer_id, "comments": f"Assigned pending task for {scenario.name}"},
                    ).raise_for_status()
                workflow_list = client.get("/api/workflow", headers=admin_h, params={"reconciliation_id": execution_id})
                workflow_list.raise_for_status()
                workflow_id = workflow_list.json()[0]["id"]
                proofs = _scenario_proofs(scenario, project_id, execution_id)
                uploaded = _upload_proofs(client, workflow_id, admin_h, proofs[:1])
                state = {"workflow_status": "pending", "proof_count": len(uploaded)}
            elif scenario.workflow_mode == "auto_approved":
                final_execution = _poll_execution(client, project_id, execution_id, admin_h)
                workflow_list = client.get("/api/workflow", headers=admin_h, params={"reconciliation_id": execution_id})
                workflow_list.raise_for_status()
                workflow_id = workflow_list.json()[0]["id"]
                proofs = _scenario_proofs(scenario, project_id, execution_id)
                uploaded = _upload_proofs(client, workflow_id, admin_h, proofs[:1])
                state = {
                    "workflow_status": "approved",
                    "proof_count": len(uploaded),
                    "execution_status": final_execution.get("status"),
                }
            else:
                final_execution = _poll_execution(client, project_id, execution_id, admin_h)
                workflow_list = client.get("/api/workflow", headers=admin_h, params={"reconciliation_id": execution_id})
                workflow_list.raise_for_status()
                workflow_id = workflow_list.json()[0]["id"]
                proofs = _scenario_proofs(scenario, project_id, execution_id)
                uploaded = _upload_proofs(client, workflow_id, admin_h, proofs[:2])

                client.post(
                    "/api/workflow/assign",
                    headers=admin_h,
                    json={"reconciliation_id": execution_id, "assigned_to": preparer_id, "comments": f"Assigned for {scenario.name}"},
                ).raise_for_status()

                submit_comment = f"Prepared for {scenario.name}; proof: {scenario.name[:12].upper()}-{project_id}-{execution_id}"
                client.post(
                    "/api/workflow/submit",
                    headers=preparer_h,
                    json={"reconciliation_id": execution_id, "comments": submit_comment},
                ).raise_for_status()

                review_state = "submitted"
                if scenario.workflow_mode == "under_review":
                    review_state = "under_review"
                elif scenario.workflow_mode == "approved":
                    client.post(
                        "/api/workflow/approve",
                        headers=reviewer_h,
                        json={"reconciliation_id": execution_id, "comments": f"Approved for {scenario.name}"},
                    ).raise_for_status()
                    review_state = "approved"
                elif scenario.workflow_mode == "rejected":
                    client.post(
                        "/api/workflow/reject",
                        headers=reviewer_h,
                        json={"reconciliation_id": execution_id, "comments": f"Rejection for {scenario.name}: amount and reference mismatch"},
                    ).raise_for_status()
                    review_state = "rejected"
                elif scenario.workflow_mode == "reject_then_approve":
                    client.post(
                        "/api/workflow/reject",
                        headers=reviewer_h,
                        json={"reconciliation_id": execution_id, "comments": f"First review rejected for {scenario.name}; additional support required"},
                    ).raise_for_status()
                    client.post(
                        f"/api/workflow/{workflow_id}/attachments",
                        headers=admin_h,
                        files={"file": ("resubmission_note.txt", io.BytesIO(f"Resubmission note for {scenario.name}".encode("utf-8")), "text/plain")},
                    ).raise_for_status()
                    client.post(
                        "/api/workflow/submit",
                        headers=preparer_h,
                        json={"reconciliation_id": execution_id, "comments": f"Resubmitted for {scenario.name}; proof: RESUB-{project_id}-{execution_id}"},
                    ).raise_for_status()
                    client.post(
                        "/api/workflow/approve",
                        headers=reviewer_h,
                        json={"reconciliation_id": execution_id, "comments": f"Approved after rework for {scenario.name}"},
                    ).raise_for_status()
                    review_state = "approved_after_reject"

                state = {
                    "workflow_status": review_state,
                    "proof_count": len(uploaded),
                    "execution_status": final_execution.get("status"),
                }

            manifest.append(
                {
                    "scenario": scenario.name,
                    "project_id": project_id,
                    "project_name": project_name,
                    "execution_id": execution_id,
                    **state,
                }
            )

    manifest_path = run_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print("Rich demo environment created.")
    print(f"Assets: {run_dir}")
    print("Projects:")
    for row in manifest:
        print(f"- {row['project_id']}: {row['project_name']} | workflow={row['workflow_status']} | execution={row['execution_id']}")


if __name__ == "__main__":
    main()
