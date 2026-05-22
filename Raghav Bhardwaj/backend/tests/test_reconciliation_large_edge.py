import io
import json
import random
import time
from datetime import date, timedelta


def _csv_bytes(rows):
    header = "entity,account,reference,amount,date,description,currency\n"
    lines = [header]
    for row in rows:
        lines.append(
            f"{row['entity']},{row['account']},{row['reference']},{row['amount']},{row['date']},{row['description']},{row['currency']}\n"
        )
    return io.BytesIO("".join(lines).encode("utf-8"))


def _build_large_edge_scenario(total_pairs=2200, seed=2026):
    random.seed(seed)
    base_date = date(2026, 4, 1)
    source = []
    target = []

    for i in range(total_pairs):
        entity = "US" if i % 2 == 0 else "IN"
        account = "1000" if i % 3 else "2000"
        ref = f"INV-{100000 + i}"
        amount = round(random.uniform(10, 5000), 2)
        tx_date = base_date + timedelta(days=i % 25)

        scenario = i % 10
        source_row = {
            "entity": entity,
            "account": account,
            "reference": ref,
            "amount": amount,
            "date": tx_date.isoformat(),
            "description": f"Invoice {ref}",
            "currency": "USD",
        }
        target_row = dict(source_row)

        if scenario == 1:
            # tolerance-pass style change
            target_row["amount"] = round(amount + 0.35, 2)
        elif scenario == 2:
            # tolerance-fail style change
            target_row["amount"] = round(amount + 42.0, 2)
        elif scenario == 3:
            # date drift
            target_row["date"] = (tx_date + timedelta(days=3)).isoformat()
        elif scenario == 4:
            # text variance
            target_row["description"] = f"INVOICE  {ref}"
        elif scenario == 5:
            # blank reference on source -> key mismatch expected
            source_row["reference"] = ""
        elif scenario == 6:
            # blank reference on target -> key mismatch expected
            target_row["reference"] = ""
        elif scenario == 7:
            # currency mismatch
            target_row["currency"] = "EUR"
        elif scenario == 8:
            # source duplicate key pattern
            source.append(dict(source_row))
        elif scenario == 9:
            # target-only row, source-only row split by mutating references
            target_row["reference"] = f"TGT-ONLY-{i}"
            source_row["reference"] = f"SRC-ONLY-{i}"

        source.append(source_row)
        target.append(target_row)

    # add explicit source-only and target-only tails
    for j in range(60):
        source.append(
            {
                "entity": "US",
                "account": "3000",
                "reference": f"SRC-TAIL-{j}",
                "amount": round(100 + j * 1.1, 2),
                "date": base_date.isoformat(),
                "description": "source only tail",
                "currency": "USD",
            }
        )
        target.append(
            {
                "entity": "US",
                "account": "3000",
                "reference": f"TGT-TAIL-{j}",
                "amount": round(100 + j * 1.1, 2),
                "date": base_date.isoformat(),
                "description": "target only tail",
                "currency": "USD",
            }
        )

    return _csv_bytes(source), _csv_bytes(target)


def test_reconciliation_high_volume_edge_mismatch(client, auth_headers):
    admin_h = auth_headers["admin"]
    preparer_h = auth_headers["preparer"]
    reviewer_h = auth_headers["reviewer"]

    source_csv, target_csv = _build_large_edge_scenario()

    create_project = client.post(
        "/api/projects",
        json={"name": "pytest large edge scenario", "description": "high volume mismatch simulation"},
        headers=admin_h,
    )
    assert create_project.status_code == 201, create_project.text
    project_id = create_project.json()["id"]

    upload_source = client.post(
        f"/api/projects/{project_id}/datasets",
        headers=admin_h,
        files={"file": ("source_large.csv", source_csv, "text/csv")},
        data={"dataset_type": "source"},
    )
    assert upload_source.status_code == 201, upload_source.text

    upload_target = client.post(
        f"/api/projects/{project_id}/datasets",
        headers=admin_h,
        files={"file": ("target_large.csv", target_csv, "text/csv")},
        data={"dataset_type": "target"},
    )
    assert upload_target.status_code == 201, upload_target.text

    mapping = client.post(
        f"/api/projects/{project_id}/mappings",
        headers=admin_h,
        json={
            "mappings": [
                {"source_column": "reference", "target_column": "reference", "is_key_field": True},
                {"source_column": "amount", "target_column": "amount", "is_key_field": False},
                {"source_column": "date", "target_column": "date", "is_key_field": False},
                {"source_column": "description", "target_column": "description", "is_key_field": False},
                {"source_column": "currency", "target_column": "currency", "is_key_field": False},
            ]
        },
    )
    assert mapping.status_code == 200, mapping.text

    rules = [
        {"name": "Amount tolerance", "rule_type": "tolerance", "config": {"source_column": "amount", "threshold": 1.0, "tolerance_type": "absolute"}, "is_active": True},
        {"name": "Date drift", "rule_type": "date_diff", "config": {"source_column": "date", "threshold": 1, "date_format": "%Y-%m-%d"}, "is_active": True},
        {"name": "Description fuzzy", "rule_type": "fuzzy", "config": {"source_column": "description", "threshold": 0.85}, "is_active": True},
        {"name": "Currency exact", "rule_type": "exact", "config": {"source_column": "currency"}, "is_active": True},
    ]
    for rule in rules:
        resp = client.post(f"/api/projects/{project_id}/rules", headers=admin_h, json=rule)
        assert resp.status_code in (200, 201), resp.text

    start_execution = client.post(f"/api/projects/{project_id}/executions", headers=admin_h)
    assert start_execution.status_code == 202, start_execution.text
    execution_id = start_execution.json()["id"]

    status = None
    payload = {}
    for _ in range(120):
        current = client.get(f"/api/projects/{project_id}/executions/{execution_id}", headers=admin_h)
        assert current.status_code == 200, current.text
        payload = current.json()
        status = payload["status"]
        if status in ("completed", "failed"):
            break
        time.sleep(0.25)
    assert status == "completed", payload

    stats = json.loads(payload.get("stats") or "{}")
    assert stats.get("matched", 0) > 0
    assert stats.get("unmatched", 0) > 0
    # this scenario is intentionally mixed; partials should occur.
    assert stats.get("partial", 0) > 0

    submit = client.post(
        "/api/workflow/submit",
        headers=preparer_h,
        json={"reconciliation_id": execution_id, "comments": "Large mixed scenario submitted; proof: EVT-2026-05"},
    )
    assert submit.status_code == 200, submit.text

    approve = client.post(
        "/api/workflow/approve",
        headers=reviewer_h,
        json={"reconciliation_id": execution_id, "comments": "Large mixed scenario approved"},
    )
    assert approve.status_code == 200, approve.text
