#!/usr/bin/env python3
"""
Create a few live project scenarios through the real project flow.

This script:
1. Ensures the local access users exist.
2. Creates a rich set of projects with different data shapes.
3. Uploads source and target datasets.
4. Saves mappings and rules.
5. Runs execution, waits for completion, and promotes the run.

Run from backend folder:
    python scripts/seed_sample_projects.py
"""

from __future__ import annotations

import csv
import io
import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal, init_db
from app.main import app
from app.models.models import User
from app.schemas.schemas import UserCreate
from app.services.auth_service import create_user


@dataclass
class ProjectScenario:
    name: str
    description: str
    recon_type: str
    source_rows: list[dict]
    target_rows: list[dict]
    mappings: list[dict]
    rule_payloads: list[dict]
    promote_payload: dict


def _ensure_user(db, username: str, email: str, password: str, role: str) -> None:
    if db.query(User).filter(User.username == username).first():
        return
    create_user(db, UserCreate(username=username, email=email, password=password, role=role))


def _csv_bytes(rows: list[dict]) -> io.BytesIO:
    buffer = io.StringIO()
    if not rows:
        raise ValueError("Rows are required")
    writer = csv.DictWriter(buffer, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)
    out = io.BytesIO(buffer.getvalue().encode("utf-8"))
    out.seek(0)
    return out


def _poll_execution(client: TestClient, project_id: int, execution_id: int, headers: dict, max_wait_seconds: int = 120) -> dict:
    deadline = time.time() + max_wait_seconds
    while time.time() < deadline:
        response = client.get(f"/api/projects/{project_id}/executions/{execution_id}", headers=headers)
        response.raise_for_status()
        execution = response.json()
        if (execution.get("status") or "").lower() in {"completed", "failed"}:
            return execution
        time.sleep(1.5)
    raise TimeoutError(f"Execution {execution_id} did not finish in time")


def _create_rows(prefix: str, entity: str, account: str, month: str, currency: str, values: list[tuple[float, float]], mismatch_every: int = 0) -> tuple[list[dict], list[dict]]:
    source_rows: list[dict] = []
    target_rows: list[dict] = []
    for idx, (source_amt, target_amt) in enumerate(values, start=1):
        reference = f"{prefix}-{idx:04d}"
        base = {
            "entity": entity,
            "account": account,
            "period": month,
            "currency": currency,
            "reference": reference,
            "tx_date": f"{month}-{((idx % 27) + 1):02d}",
        }
        source_rows.append({
            **base,
            "amount": round(source_amt, 2),
            "source_system": f"{entity}-GL",
            "description": f"{entity} source line {idx}",
        })
        target_rows.append({
            **base,
            "amount": round(target_amt, 2),
            "source_system": f"{entity}-BANK",
            "description": f"{entity} target line {idx}",
        })
    if mismatch_every:
        for i in range(0, len(target_rows), mismatch_every):
            target_rows[i]["reference"] = f"{target_rows[i]['reference']}-ALT"
    return source_rows, target_rows


def _cycle_tag(rows: list[dict], field: str, values: list[str]) -> None:
    for index, row in enumerate(rows):
        row[field] = values[index % len(values)]


def _scenario_bank_cash() -> ProjectScenario:
    source_rows, target_rows = [], []
    for entity, account, currency, base in [
        ("AE", "1000-CASH", "AED", 1250),
        ("DE", "1000-CASH", "EUR", 980),
        ("IN", "1000-CASH", "INR", 1525),
        ("SG", "1000-CASH", "SGD", 860),
        ("UK", "1000-CASH", "GBP", 1110),
        ("US", "1000-CASH", "USD", 1320),
    ]:
        src, tgt = _create_rows(f"{entity}-CASH", entity, account, "2026-04", currency, [(base + i * 17, base + i * 17) for i in range(1, 11)])
        source_rows.extend(src)
        target_rows.extend(tgt)
    return ProjectScenario(
        name="Multi-Entity Cash Reconciliation",
        description="Cash and bank balances across a multi-entity treasury view.",
        recon_type="BANK_RECONCILIATION",
        source_rows=source_rows,
        target_rows=target_rows,
        mappings=[
            {"source_column": "entity", "target_column": "entity", "is_key_field": True},
            {"source_column": "account", "target_column": "account", "is_key_field": True},
            {"source_column": "period", "target_column": "period", "is_key_field": False},
            {"source_column": "currency", "target_column": "currency", "is_key_field": False},
            {"source_column": "reference", "target_column": "reference", "is_key_field": False},
            {"source_column": "amount", "target_column": "amount", "is_key_field": False},
            {"source_column": "tx_date", "target_column": "tx_date", "is_key_field": False},
        ],
        rule_payloads=[
            {"name": "Exact reference and amount", "rule_type": "exact", "config": {"source_column": "reference", "target_column": "reference"}},
            {"name": "Amount tolerance", "rule_type": "tolerance", "config": {"source_column": "amount", "threshold": 5, "tolerance_type": "absolute"}},
        ],
        promote_payload={"recon_type": "BANK_RECONCILIATION", "risk_classification": "MEDIUM"},
    )


def _scenario_intercompany() -> ProjectScenario:
    source_rows, target_rows = [], []
    for entity in ["HQ", "EMEA", "APAC", "AMER"]:
        src, tgt = _create_rows(
            f"{entity}-IC",
            entity,
            "2000-INTERCO",
            "2026-03",
            "USD",
            [(2000 + i * 111, 2000 + i * 111) for i in range(1, 9)],
            mismatch_every=5,
        )
        source_rows.extend(src)
        target_rows.extend(tgt)
    # add deliberate partials
    target_rows[3]["amount"] = target_rows[3]["amount"] - 7.5
    target_rows[11]["amount"] = target_rows[11]["amount"] + 9.0
    return ProjectScenario(
        name="Intercompany AP/AR Clearing",
        description="Intercompany receivables and payables with partial and unmatched items.",
        recon_type="INTERCOMPANY",
        source_rows=source_rows,
        target_rows=target_rows,
        mappings=[
            {"source_column": "entity", "target_column": "entity", "is_key_field": True},
            {"source_column": "account", "target_column": "account", "is_key_field": True},
            {"source_column": "period", "target_column": "period", "is_key_field": False},
            {"source_column": "currency", "target_column": "currency", "is_key_field": False},
            {"source_column": "reference", "target_column": "reference", "is_key_field": False},
            {"source_column": "amount", "target_column": "amount", "is_key_field": False},
        ],
        rule_payloads=[
            {"name": "Exact intercompany pairing", "rule_type": "exact", "config": {"source_column": "reference", "target_column": "reference"}},
            {"name": "Date difference tolerance", "rule_type": "date_diff", "config": {"source_column": "tx_date", "threshold": 2}},
        ],
        promote_payload={"recon_type": "INTERCOMPANY", "risk_classification": "HIGH"},
    )


def _scenario_payroll() -> ProjectScenario:
    source_rows, target_rows = [], []
    for dept in ["HR", "FIN", "OPS", "SALES", "SUPPLY"]:
        src, tgt = _create_rows(
            f"{dept}-PAY",
            dept,
            "3000-PAYROLL",
            "2026-05",
            "USD",
            [(5000 + i * 72, 5000 + i * 72) for i in range(1, 7)],
        )
        source_rows.extend(src)
        target_rows.extend(tgt)
    target_rows[2]["amount"] = target_rows[2]["amount"] + 18
    target_rows[15]["amount"] = target_rows[15]["amount"] - 22
    return ProjectScenario(
        name="Payroll Clearing and Benefits",
        description="Payroll accruals, clearing entries, and benefits reconciliation.",
        recon_type="PAYROLL",
        source_rows=source_rows,
        target_rows=target_rows,
        mappings=[
            {"source_column": "entity", "target_column": "entity", "is_key_field": True},
            {"source_column": "account", "target_column": "account", "is_key_field": True},
            {"source_column": "period", "target_column": "period", "is_key_field": False},
            {"source_column": "currency", "target_column": "currency", "is_key_field": False},
            {"source_column": "reference", "target_column": "reference", "is_key_field": False},
            {"source_column": "amount", "target_column": "amount", "is_key_field": False},
        ],
        rule_payloads=[
            {"name": "Exact payroll reference", "rule_type": "exact", "config": {"source_column": "reference", "target_column": "reference"}},
            {"name": "Tolerance payroll amount", "rule_type": "tolerance", "config": {"source_column": "amount", "threshold": 25, "tolerance_type": "absolute"}},
        ],
        promote_payload={"recon_type": "PAYROLL", "risk_classification": "MEDIUM"},
    )


def _scenario_suspense() -> ProjectScenario:
    source_rows, target_rows = [], []
    for entity in ["US", "UK", "DE", "IN", "SG", "AE", "BR", "CA"]:
        src, tgt = _create_rows(
            f"{entity}-SUSP",
            entity,
            "4999-SUSP",
            "2026-04",
            "USD",
            [(300 + i * 41, 300 + i * 41) for i in range(1, 5)],
        )
        source_rows.extend(src)
        target_rows.extend(tgt)
    for idx in (1, 5, 9, 13, 17, 21, 25):
        target_rows[idx]["amount"] = target_rows[idx]["amount"] + 13.5
        target_rows[idx]["reference"] = f"{target_rows[idx]['reference']}-VAR"
    return ProjectScenario(
        name="Suspense Account Cleanup",
        description="High exception pressure in a suspense account across many entities.",
        recon_type="SUSPENSE",
        source_rows=source_rows,
        target_rows=target_rows,
        mappings=[
            {"source_column": "entity", "target_column": "entity", "is_key_field": True},
            {"source_column": "account", "target_column": "account", "is_key_field": True},
            {"source_column": "period", "target_column": "period", "is_key_field": False},
            {"source_column": "currency", "target_column": "currency", "is_key_field": False},
            {"source_column": "reference", "target_column": "reference", "is_key_field": False},
            {"source_column": "amount", "target_column": "amount", "is_key_field": False},
        ],
        rule_payloads=[
            {"name": "Suspense exact reference", "rule_type": "exact", "config": {"source_column": "reference", "target_column": "reference"}},
            {"name": "Suspense amount tolerance", "rule_type": "tolerance", "config": {"source_column": "amount", "threshold": 15, "tolerance_type": "absolute"}},
        ],
        promote_payload={"recon_type": "SUSPENSE", "risk_classification": "CRITICAL"},
    )


def _scenario_fee_recon() -> ProjectScenario:
    source_rows, target_rows = [], []
    for entity in ["NA", "EMEA", "APAC"]:
        src, tgt = _create_rows(
            f"{entity}-FEE",
            entity,
            "7000-FEES",
            "2026-02",
            "EUR" if entity == "EMEA" else "USD",
            [(75 + i * 4.5, 75 + i * 4.5) for i in range(1, 12)],
            mismatch_every=4,
        )
        source_rows.extend(src)
        target_rows.extend(tgt)
    target_rows[0]["amount"] = target_rows[0]["amount"] + 1.75
    return ProjectScenario(
        name="Fee and Revenue Leakage",
        description="Operational fees and revenue leakage checks by region.",
        recon_type="FEE",
        source_rows=source_rows,
        target_rows=target_rows,
        mappings=[
            {"source_column": "entity", "target_column": "entity", "is_key_field": True},
            {"source_column": "account", "target_column": "account", "is_key_field": True},
            {"source_column": "period", "target_column": "period", "is_key_field": False},
            {"source_column": "currency", "target_column": "currency", "is_key_field": False},
            {"source_column": "reference", "target_column": "reference", "is_key_field": False},
            {"source_column": "amount", "target_column": "amount", "is_key_field": False},
        ],
        rule_payloads=[
            {"name": "Fee exact reference", "rule_type": "exact", "config": {"source_column": "reference", "target_column": "reference"}},
            {"name": "Fee tolerance", "rule_type": "tolerance", "config": {"source_column": "amount", "threshold": 3, "tolerance_type": "absolute"}},
        ],
        promote_payload={"recon_type": "FEE", "risk_classification": "MEDIUM"},
    )


def _scenario_ar_aging() -> ProjectScenario:
    source_rows, target_rows = [], []
    for entity, currency, base in [
        ("NA", "USD", 820),
        ("EMEA", "EUR", 910),
        ("APAC", "SGD", 760),
        ("LATAM", "BRL", 640),
        ("ANZ", "AUD", 705),
    ]:
        src, tgt = _create_rows(
            f"{entity}-AR",
            entity,
            "1100-AR",
            "2026-06",
            currency,
            [(base + i * 61, base + i * 61) for i in range(1, 9)],
            mismatch_every=3,
        )
        source_rows.extend(src)
        target_rows.extend(tgt)

    _cycle_tag(source_rows, "customer_segment", ["Strategic", "Mid-market", "SMB"])
    _cycle_tag(target_rows, "customer_segment", ["Strategic", "Mid-market", "SMB"])
    _cycle_tag(source_rows, "aging_bucket", ["0-30", "31-60", "61-90", "90+"])
    _cycle_tag(target_rows, "aging_bucket", ["0-30", "31-60", "61-90", "90+"])
    target_rows[6]["amount"] = target_rows[6]["amount"] - 14
    target_rows[18]["reference"] = f"{target_rows[18]['reference']}-MANUAL"

    return ProjectScenario(
        name="Accounts Receivable Aging",
        description="Customer receivables by aging bucket across global regions and credit tiers.",
        recon_type="AR_AGING",
        source_rows=source_rows,
        target_rows=target_rows,
        mappings=[
            {"source_column": "entity", "target_column": "entity", "is_key_field": True},
            {"source_column": "account", "target_column": "account", "is_key_field": True},
            {"source_column": "period", "target_column": "period", "is_key_field": False},
            {"source_column": "currency", "target_column": "currency", "is_key_field": False},
            {"source_column": "reference", "target_column": "reference", "is_key_field": False},
            {"source_column": "amount", "target_column": "amount", "is_key_field": False},
            {"source_column": "customer_segment", "target_column": "customer_segment", "is_key_field": False},
        ],
        rule_payloads=[
            {"name": "AR exact reference", "rule_type": "exact", "config": {"source_column": "reference", "target_column": "reference"}},
            {"name": "AR amount tolerance", "rule_type": "tolerance", "config": {"source_column": "amount", "threshold": 10, "tolerance_type": "absolute"}},
        ],
        promote_payload={"recon_type": "AR_AGING", "risk_classification": "MEDIUM"},
    )


def _scenario_fixed_assets() -> ProjectScenario:
    source_rows, target_rows = [], []
    for entity, asset_class, base in [
        ("NORTH", "BUILDINGS", 12500),
        ("SOUTH", "EQUIPMENT", 9400),
        ("EAST", "IT-ASSETS", 7200),
        ("WEST", "VEHICLES", 8600),
    ]:
        src, tgt = _create_rows(
            f"{entity}-FA",
            entity,
            "1500-ASSETS",
            "2025-12",
            "USD",
            [(base + i * 180, base + i * 180) for i in range(1, 7)],
            mismatch_every=4,
        )
        source_rows.extend(src)
        target_rows.extend(tgt)

    _cycle_tag(source_rows, "asset_class", ["BUILDINGS", "EQUIPMENT", "IT-ASSETS", "VEHICLES"])
    _cycle_tag(target_rows, "asset_class", ["BUILDINGS", "EQUIPMENT", "IT-ASSETS", "VEHICLES"])
    target_rows[9]["amount"] = target_rows[9]["amount"] + 125
    target_rows[14]["reference"] = f"{target_rows[14]['reference']}-REV"

    return ProjectScenario(
        name="Fixed Asset Depreciation",
        description="Asset ledger rollforward with depreciation, retirements, and capital additions.",
        recon_type="FIXED_ASSET",
        source_rows=source_rows,
        target_rows=target_rows,
        mappings=[
            {"source_column": "entity", "target_column": "entity", "is_key_field": True},
            {"source_column": "account", "target_column": "account", "is_key_field": True},
            {"source_column": "period", "target_column": "period", "is_key_field": False},
            {"source_column": "currency", "target_column": "currency", "is_key_field": False},
            {"source_column": "reference", "target_column": "reference", "is_key_field": False},
            {"source_column": "amount", "target_column": "amount", "is_key_field": False},
            {"source_column": "asset_class", "target_column": "asset_class", "is_key_field": False},
        ],
        rule_payloads=[
            {"name": "Asset exact reference", "rule_type": "exact", "config": {"source_column": "reference", "target_column": "reference"}},
            {"name": "Asset amount tolerance", "rule_type": "tolerance", "config": {"source_column": "amount", "threshold": 75, "tolerance_type": "absolute"}},
        ],
        promote_payload={"recon_type": "FIXED_ASSET", "risk_classification": "LOW"},
    )


def _scenario_tax_provision() -> ProjectScenario:
    source_rows, target_rows = [], []
    for entity, currency, base in [
        ("US-FED", "USD", 3150),
        ("US-STATE", "USD", 1825),
        ("UK-VAT", "GBP", 2440),
        ("DE-MWST", "EUR", 2680),
        ("IN-GST", "INR", 3520),
    ]:
        src, tgt = _create_rows(
            f"{entity}-TAX",
            entity,
            "2100-TAX",
            "2026-04",
            currency,
            [(base + i * 92, base + i * 92) for i in range(1, 8)],
            mismatch_every=4,
        )
        source_rows.extend(src)
        target_rows.extend(tgt)

    _cycle_tag(source_rows, "jurisdiction", ["Federal", "State", "VAT", "Indirect Tax"])
    _cycle_tag(target_rows, "jurisdiction", ["Federal", "State", "VAT", "Indirect Tax"])
    target_rows[2]["amount"] = target_rows[2]["amount"] - 27
    target_rows[17]["amount"] = target_rows[17]["amount"] + 31

    return ProjectScenario(
        name="Tax Provision and VAT",
        description="Multi-jurisdiction tax provisioning with statutory and indirect tax adjustments.",
        recon_type="TAX",
        source_rows=source_rows,
        target_rows=target_rows,
        mappings=[
            {"source_column": "entity", "target_column": "entity", "is_key_field": True},
            {"source_column": "account", "target_column": "account", "is_key_field": True},
            {"source_column": "period", "target_column": "period", "is_key_field": False},
            {"source_column": "currency", "target_column": "currency", "is_key_field": False},
            {"source_column": "reference", "target_column": "reference", "is_key_field": False},
            {"source_column": "amount", "target_column": "amount", "is_key_field": False},
            {"source_column": "jurisdiction", "target_column": "jurisdiction", "is_key_field": False},
        ],
        rule_payloads=[
            {"name": "Tax exact reference", "rule_type": "exact", "config": {"source_column": "reference", "target_column": "reference"}},
            {"name": "Tax amount tolerance", "rule_type": "tolerance", "config": {"source_column": "amount", "threshold": 20, "tolerance_type": "absolute"}},
        ],
        promote_payload={"recon_type": "TAX", "risk_classification": "HIGH"},
    )


def _scenario_inventory_tieout() -> ProjectScenario:
    source_rows, target_rows = [], []
    for entity, base in [
        ("PLANT-A", 5400),
        ("PLANT-B", 6200),
        ("PLANT-C", 5900),
        ("PLANT-D", 6650),
    ]:
        src, tgt = _create_rows(
            f"{entity}-INV",
            entity,
            "1300-INVENTORY",
            "2026-05",
            "USD",
            [(base + i * 145, base + i * 145) for i in range(1, 7)],
            mismatch_every=5,
        )
        source_rows.extend(src)
        target_rows.extend(tgt)

    _cycle_tag(source_rows, "warehouse", ["RAW", "WIP", "FG", "TRANSIT"])
    _cycle_tag(target_rows, "warehouse", ["RAW", "WIP", "FG", "TRANSIT"])
    target_rows[4]["amount"] = target_rows[4]["amount"] + 9.5
    target_rows[13]["reference"] = f"{target_rows[13]['reference']}-COUNT"

    return ProjectScenario(
        name="Inventory Subledger Tie-out",
        description="Warehouse and plant inventory alignment between subledger and GL balances.",
        recon_type="INVENTORY",
        source_rows=source_rows,
        target_rows=target_rows,
        mappings=[
            {"source_column": "entity", "target_column": "entity", "is_key_field": True},
            {"source_column": "account", "target_column": "account", "is_key_field": True},
            {"source_column": "period", "target_column": "period", "is_key_field": False},
            {"source_column": "currency", "target_column": "currency", "is_key_field": False},
            {"source_column": "reference", "target_column": "reference", "is_key_field": False},
            {"source_column": "amount", "target_column": "amount", "is_key_field": False},
            {"source_column": "warehouse", "target_column": "warehouse", "is_key_field": False},
        ],
        rule_payloads=[
            {"name": "Inventory exact reference", "rule_type": "exact", "config": {"source_column": "reference", "target_column": "reference"}},
            {"name": "Inventory amount tolerance", "rule_type": "tolerance", "config": {"source_column": "amount", "threshold": 12, "tolerance_type": "absolute"}},
        ],
        promote_payload={"recon_type": "INVENTORY", "risk_classification": "MEDIUM"},
    )


def _scenario_prepaid_expenses() -> ProjectScenario:
    source_rows, target_rows = [], []
    for entity, method, base in [
        ("CORP", "LINEAR", 2200),
        ("REGION-1", "LINEAR", 1800),
        ("REGION-2", "STEP", 2050),
        ("REGION-3", "LINEAR", 1910),
    ]:
        src, tgt = _create_rows(
            f"{entity}-PREPAID",
            entity,
            "1700-PREPAID",
            "2026-03",
            "USD",
            [(base + i * 88, base + i * 88) for i in range(1, 7)],
            mismatch_every=4,
        )
        source_rows.extend(src)
        target_rows.extend(tgt)

    _cycle_tag(source_rows, "amortization_method", ["LINEAR", "STEP", "DECLINING"])
    _cycle_tag(target_rows, "amortization_method", ["LINEAR", "STEP", "DECLINING"])
    target_rows[7]["amount"] = target_rows[7]["amount"] - 11
    target_rows[16]["reference"] = f"{target_rows[16]['reference']}-ADJ"

    return ProjectScenario(
        name="Prepaid Expense Amortization",
        description="Prepaid balances and monthly amortization schedules across business units.",
        recon_type="PREPAID",
        source_rows=source_rows,
        target_rows=target_rows,
        mappings=[
            {"source_column": "entity", "target_column": "entity", "is_key_field": True},
            {"source_column": "account", "target_column": "account", "is_key_field": True},
            {"source_column": "period", "target_column": "period", "is_key_field": False},
            {"source_column": "currency", "target_column": "currency", "is_key_field": False},
            {"source_column": "reference", "target_column": "reference", "is_key_field": False},
            {"source_column": "amount", "target_column": "amount", "is_key_field": False},
            {"source_column": "amortization_method", "target_column": "amortization_method", "is_key_field": False},
        ],
        rule_payloads=[
            {"name": "Prepaid exact reference", "rule_type": "exact", "config": {"source_column": "reference", "target_column": "reference"}},
            {"name": "Prepaid amount tolerance", "rule_type": "tolerance", "config": {"source_column": "amount", "threshold": 8, "tolerance_type": "absolute"}},
        ],
        promote_payload={"recon_type": "PREPAID", "risk_classification": "LOW"},
    )


def _scenario_intercompany_loans() -> ProjectScenario:
    source_rows, target_rows = [], []
    for entity, currency, base in [
        ("HQ", "USD", 15000),
        ("EMEA-HOLDCO", "EUR", 11800),
        ("APAC-HOLDCO", "SGD", 13250),
        ("LATAM-HOLDCO", "BRL", 10100),
    ]:
        src, tgt = _create_rows(
            f"{entity}-LOAN",
            entity,
            "2400-IC-LOAN",
            "2026-02",
            currency,
            [(base + i * 210, base + i * 210) for i in range(1, 6)],
            mismatch_every=3,
        )
        source_rows.extend(src)
        target_rows.extend(tgt)

    _cycle_tag(source_rows, "tranche", ["T1", "T2", "T3"])
    _cycle_tag(target_rows, "tranche", ["T1", "T2", "T3"])
    target_rows[3]["amount"] = target_rows[3]["amount"] + 55
    target_rows[11]["reference"] = f"{target_rows[11]['reference']}-REBOOK"

    return ProjectScenario(
        name="Intercompany Loans",
        description="Intercompany funding and loan balances with inter-entity settlement differences.",
        recon_type="INTERCOMPANY_LOAN",
        source_rows=source_rows,
        target_rows=target_rows,
        mappings=[
            {"source_column": "entity", "target_column": "entity", "is_key_field": True},
            {"source_column": "account", "target_column": "account", "is_key_field": True},
            {"source_column": "period", "target_column": "period", "is_key_field": False},
            {"source_column": "currency", "target_column": "currency", "is_key_field": False},
            {"source_column": "reference", "target_column": "reference", "is_key_field": False},
            {"source_column": "amount", "target_column": "amount", "is_key_field": False},
            {"source_column": "tranche", "target_column": "tranche", "is_key_field": False},
        ],
        rule_payloads=[
            {"name": "Loan exact reference", "rule_type": "exact", "config": {"source_column": "reference", "target_column": "reference"}},
            {"name": "Loan amount tolerance", "rule_type": "tolerance", "config": {"source_column": "amount", "threshold": 50, "tolerance_type": "absolute"}},
        ],
        promote_payload={"recon_type": "INTERCOMPANY_LOAN", "risk_classification": "HIGH"},
    )


def _scenario_travel_expenses() -> ProjectScenario:
    source_rows, target_rows = [], []
    for entity, base in [
        ("NORTH-AMER", 420),
        ("EUROPE", 380),
        ("APAC", 460),
        ("MIDDLE-EAST", 340),
        ("LATAM", 410),
    ]:
        src, tgt = _create_rows(
            f"{entity}-T&E",
            entity,
            "6100-TRAVEL",
            "2026-04",
            "USD",
            [(base + i * 26, base + i * 26) for i in range(1, 9)],
            mismatch_every=4,
        )
        source_rows.extend(src)
        target_rows.extend(tgt)

    _cycle_tag(source_rows, "expense_category", ["Air", "Hotel", "Meals", "Ground", "Misc"])
    _cycle_tag(target_rows, "expense_category", ["Air", "Hotel", "Meals", "Ground", "Misc"])
    target_rows[1]["amount"] = target_rows[1]["amount"] - 6
    target_rows[22]["reference"] = f"{target_rows[22]['reference']}-CORR"

    return ProjectScenario(
        name="Travel and Expense Audit",
        description="Employee travel and expense claims with policy exceptions and duplicate receipts.",
        recon_type="T_E",
        source_rows=source_rows,
        target_rows=target_rows,
        mappings=[
            {"source_column": "entity", "target_column": "entity", "is_key_field": True},
            {"source_column": "account", "target_column": "account", "is_key_field": True},
            {"source_column": "period", "target_column": "period", "is_key_field": False},
            {"source_column": "currency", "target_column": "currency", "is_key_field": False},
            {"source_column": "reference", "target_column": "reference", "is_key_field": False},
            {"source_column": "amount", "target_column": "amount", "is_key_field": False},
            {"source_column": "expense_category", "target_column": "expense_category", "is_key_field": False},
        ],
        rule_payloads=[
            {"name": "Expense exact reference", "rule_type": "exact", "config": {"source_column": "reference", "target_column": "reference"}},
            {"name": "Expense amount tolerance", "rule_type": "tolerance", "config": {"source_column": "amount", "threshold": 5, "tolerance_type": "absolute"}},
        ],
        promote_payload={"recon_type": "T_E", "risk_classification": "MEDIUM"},
    )


def _scenario_accrued_liabilities() -> ProjectScenario:
    source_rows, target_rows = [], []
    for entity, cost_center, base in [
        ("FINANCE", "CC-100", 2250),
        ("OPS", "CC-200", 2675),
        ("SALES", "CC-300", 1980),
        ("SUPPLY", "CC-400", 2340),
    ]:
        src, tgt = _create_rows(
            f"{entity}-ACCRUAL",
            entity,
            "2200-ACCRUAL",
            "2026-05",
            "USD",
            [(base + i * 74, base + i * 74) for i in range(1, 7)],
            mismatch_every=5,
        )
        source_rows.extend(src)
        target_rows.extend(tgt)

    _cycle_tag(source_rows, "cost_center", ["CC-100", "CC-200", "CC-300", "CC-400"])
    _cycle_tag(target_rows, "cost_center", ["CC-100", "CC-200", "CC-300", "CC-400"])
    target_rows[8]["amount"] = target_rows[8]["amount"] + 19
    target_rows[20]["reference"] = f"{target_rows[20]['reference']}-POST"

    return ProjectScenario(
        name="Accrued Liabilities Rollforward",
        description="Outstanding accruals and reversals with cost-center level movement tracking.",
        recon_type="ACCRUAL",
        source_rows=source_rows,
        target_rows=target_rows,
        mappings=[
            {"source_column": "entity", "target_column": "entity", "is_key_field": True},
            {"source_column": "account", "target_column": "account", "is_key_field": True},
            {"source_column": "period", "target_column": "period", "is_key_field": False},
            {"source_column": "currency", "target_column": "currency", "is_key_field": False},
            {"source_column": "reference", "target_column": "reference", "is_key_field": False},
            {"source_column": "amount", "target_column": "amount", "is_key_field": False},
            {"source_column": "cost_center", "target_column": "cost_center", "is_key_field": False},
        ],
        rule_payloads=[
            {"name": "Accrual exact reference", "rule_type": "exact", "config": {"source_column": "reference", "target_column": "reference"}},
            {"name": "Accrual amount tolerance", "rule_type": "tolerance", "config": {"source_column": "amount", "threshold": 15, "tolerance_type": "absolute"}},
        ],
        promote_payload={"recon_type": "ACCRUAL", "risk_classification": "MEDIUM"},
    )


def _scenario_lease_liability() -> ProjectScenario:
    source_rows, target_rows = [], []
    for entity, portfolio, base in [
        ("CORP", "OFFICE", 5600),
        ("RETAIL", "STORE", 4300),
        ("WAREHOUSE", "INDUSTRIAL", 7100),
    ]:
        src, tgt = _create_rows(
            f"{entity}-LEASE",
            entity,
            "1800-LEASE",
            "2026-01",
            "USD",
            [(base + i * 132, base + i * 132) for i in range(1, 9)],
            mismatch_every=6,
        )
        source_rows.extend(src)
        target_rows.extend(tgt)

    _cycle_tag(source_rows, "lease_portfolio", ["Office", "Retail", "Industrial"])
    _cycle_tag(target_rows, "lease_portfolio", ["Office", "Retail", "Industrial"])
    target_rows[5]["amount"] = target_rows[5]["amount"] - 24
    target_rows[12]["reference"] = f"{target_rows[12]['reference']}-INDEX"

    return ProjectScenario(
        name="Lease Liability Reconciliation",
        description="Right-of-use assets and lease liabilities with portfolio-level rollforward checks.",
        recon_type="LEASE",
        source_rows=source_rows,
        target_rows=target_rows,
        mappings=[
            {"source_column": "entity", "target_column": "entity", "is_key_field": True},
            {"source_column": "account", "target_column": "account", "is_key_field": True},
            {"source_column": "period", "target_column": "period", "is_key_field": False},
            {"source_column": "currency", "target_column": "currency", "is_key_field": False},
            {"source_column": "reference", "target_column": "reference", "is_key_field": False},
            {"source_column": "amount", "target_column": "amount", "is_key_field": False},
            {"source_column": "lease_portfolio", "target_column": "lease_portfolio", "is_key_field": False},
        ],
        rule_payloads=[
            {"name": "Lease exact reference", "rule_type": "exact", "config": {"source_column": "reference", "target_column": "reference"}},
            {"name": "Lease amount tolerance", "rule_type": "tolerance", "config": {"source_column": "amount", "threshold": 20, "tolerance_type": "absolute"}},
        ],
        promote_payload={"recon_type": "LEASE", "risk_classification": "LOW"},
    )


def _scenario_revenue_deferrals() -> ProjectScenario:
    source_rows, target_rows = [], []
    for entity, contract_type, base in [
        ("SaaS", "SUBSCRIPTION", 3200),
        ("SERVICES", "IMPLEMENTATION", 2750),
        ("CHANNEL", "RESELLER", 2410),
        ("PUBLIC-SECTOR", "ANNUAL", 3640),
    ]:
        src, tgt = _create_rows(
            f"{entity}-DEF",
            entity,
            "4000-DEFERRED",
            "2026-02",
            "USD",
            [(base + i * 96, base + i * 96) for i in range(1, 7)],
            mismatch_every=4,
        )
        source_rows.extend(src)
        target_rows.extend(tgt)

    _cycle_tag(source_rows, "contract_type", ["Subscription", "Implementation", "Reseller", "Annual"])
    _cycle_tag(target_rows, "contract_type", ["Subscription", "Implementation", "Reseller", "Annual"])
    target_rows[3]["amount"] = target_rows[3]["amount"] + 33
    target_rows[10]["reference"] = f"{target_rows[10]['reference']}-EXT"

    return ProjectScenario(
        name="Revenue Recognition Deferrals",
        description="Deferred revenue schedules with contract type and timing differences by business line.",
        recon_type="REVENUE_DEFERRAL",
        source_rows=source_rows,
        target_rows=target_rows,
        mappings=[
            {"source_column": "entity", "target_column": "entity", "is_key_field": True},
            {"source_column": "account", "target_column": "account", "is_key_field": True},
            {"source_column": "period", "target_column": "period", "is_key_field": False},
            {"source_column": "currency", "target_column": "currency", "is_key_field": False},
            {"source_column": "reference", "target_column": "reference", "is_key_field": False},
            {"source_column": "amount", "target_column": "amount", "is_key_field": False},
            {"source_column": "contract_type", "target_column": "contract_type", "is_key_field": False},
        ],
        rule_payloads=[
            {"name": "Revenue exact reference", "rule_type": "exact", "config": {"source_column": "reference", "target_column": "reference"}},
            {"name": "Revenue amount tolerance", "rule_type": "tolerance", "config": {"source_column": "amount", "threshold": 18, "tolerance_type": "absolute"}},
        ],
        promote_payload={"recon_type": "REVENUE_DEFERRAL", "risk_classification": "MEDIUM"},
    )


SCENARIOS = [
    _scenario_bank_cash(),
    _scenario_intercompany(),
    _scenario_payroll(),
    _scenario_suspense(),
    _scenario_fee_recon(),
    _scenario_ar_aging(),
    _scenario_fixed_assets(),
    _scenario_tax_provision(),
    _scenario_inventory_tieout(),
    _scenario_prepaid_expenses(),
    _scenario_intercompany_loans(),
    _scenario_travel_expenses(),
    _scenario_accrued_liabilities(),
    _scenario_lease_liability(),
    _scenario_revenue_deferrals(),
]


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        _ensure_user(db, "admin", "admin@drms.com", "admin123", "admin")
        _ensure_user(db, "preparer", "preparer@drms.com", "preparer123", "preparer")
        _ensure_user(db, "reviewer", "reviewer@drms.com", "reviewer123", "reviewer")
    finally:
        db.close()

    client = TestClient(app)
    login = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    login.raise_for_status()
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    created = []
    for scenario in SCENARIOS:
        project = client.post("/api/projects", headers=headers, json={
            "name": scenario.name,
            "description": scenario.description,
        })
        project.raise_for_status()
        project_id = project.json()["id"]

        files = {
            "source": _csv_bytes(scenario.source_rows),
            "target": _csv_bytes(scenario.target_rows),
        }
        for dataset_type, file_obj in files.items():
            upload = client.post(
                f"/api/projects/{project_id}/datasets",
                headers=headers,
                files={"file": (f"{scenario.name.lower().replace(' ', '_')}_{dataset_type}.csv", file_obj, "text/csv")},
                data={"dataset_type": dataset_type},
            )
            upload.raise_for_status()

        for mapping in scenario.mappings:
            resp = client.post(f"/api/projects/{project_id}/mappings", headers=headers, json={"mappings": [mapping]})
            resp.raise_for_status()

        for rule in scenario.rule_payloads:
            resp = client.post(f"/api/projects/{project_id}/rules", headers=headers, json=rule)
            resp.raise_for_status()

        run = client.post(f"/api/projects/{project_id}/executions", headers=headers)
        run.raise_for_status()
        execution_id = run.json()["id"]
        final = _poll_execution(client, project_id, execution_id, headers)

        promote = client.post(
            f"/api/projects/{project_id}/executions/{execution_id}/promote",
            headers=headers,
            json=scenario.promote_payload,
        )
        promote.raise_for_status()

        created.append({
            "project_id": project_id,
            "project_name": scenario.name,
            "execution_id": execution_id,
            "status": final["status"],
            "promoted_profile_id": promote.json().get("profile_id"),
        })

    print("Created live project scenarios:")
    for row in created:
        print(json.dumps(row, indent=2))


if __name__ == "__main__":
    main()
