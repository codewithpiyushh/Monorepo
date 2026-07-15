# -*- coding: utf-8 -*-
"""
backend/scripts/seed_demo_projects.py
──────────────────────────────────────────────────────────────────────────────
Demo Project Creator  — Full Flow Coverage across ALL Roles & Sections

Creates 5 showcase projects via the DRMS REST API, each with:
  • Realistic source + target CSV datasets
  • Field mappings  (source_column → target_column)
  • Matching rules  (exact / tolerance / date_diff)
  • Execution triggered and promoted to Enterprise Profile
  • Profile assigned to every role: preparer / reviewer / approver / certifier

Projects
─────────────────────────────────────────────────────────────────────────────
  1. Bank Reconciliation – US Corporate (GL vs Bank Statement)
  2. Accounts Receivable – EMEA Region (Invoices vs Receipts)
  3. Accounts Payable – Global Vendor Payments (AP Ledger vs Vendor Invoices)
  4. Intercompany – APAC Entity Elimination (Entity A vs Entity B)
  5. Payroll Reconciliation – North America (HR Extract vs Bank Transfer)

Usage (from repo root, backend venv active):
  python backend/scripts/seed_demo_projects.py

Requirements: backend running at http://localhost:8000  |  requests installed
──────────────────────────────────────────────────────────────────────────────
"""

import io
import json
import sys
import time

# Force UTF-8 output on Windows
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import textwrap
import requests

BASE = "http://localhost:8000"

# ── Demo user credentials (seeded by main.py _seed_demo_user) ────────────────
USERS = {
    "admin":     {"username": "admin",     "password": "admin123"},
    "preparer":  {"username": "preparer",  "password": "preparer123"},
    "reviewer":  {"username": "approver",  "password": "approver123"},
    "approver":  {"username": "approver",  "password": "approver123"},
    "certifier": {"username": "certifier", "password": "certifier123"},
    "auditor":   {"username": "admin",     "password": "admin123"},
}

# ── Colour helpers ────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"
RESET  = "\033[0m"
BOLD   = "\033[1m"

def ok(msg):  print(f"{GREEN}  ✔  {msg}{RESET}")
def info(msg):print(f"{CYAN}  ℹ  {msg}{RESET}")
def warn(msg):print(f"{YELLOW}  ⚠  {msg}{RESET}")
def err(msg): print(f"{RED}  ✘  {msg}{RESET}"); sys.exit(1)
def step(msg):print(f"\n{BOLD}{CYAN}▶  {msg}{RESET}")

# ── Auth helpers ──────────────────────────────────────────────────────────────

def login(role: str) -> dict:
    creds = USERS[role]
    r = requests.post(
        f"{BASE}/api/auth/login",
        json={"username": creds["username"], "password": creds["password"]},
        headers={"Content-Type": "application/json"},
        timeout=60,   # bcrypt hashing can be slow on first call
    )
    if r.status_code != 200:
        err(f"Login failed for {role}: {r.status_code} {r.text[:200]}")
    token = r.json().get("access_token")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def get_user_id(headers: dict, role: str) -> int:
    # /api/auth/me returns the current user's profile
    r = requests.get(f"{BASE}/api/auth/me", headers=headers, timeout=30)
    if r.status_code == 200:
        return r.json()["id"]
    # fallback — list all users via admin endpoint
    r2 = requests.get(f"{BASE}/api/auth/users", headers=headers, timeout=30)
    if r2.status_code == 200:
        users = r2.json() if isinstance(r2.json(), list) else r2.json().get("users", [])
        for u in users:
            if u.get("role") == role or u.get("username") == role:
                return u["id"]
    return None

# ── Generic API helpers ───────────────────────────────────────────────────────

def api(method, path, headers, **kwargs):
    url = f"{BASE}{path}"
    hdrs = {k: v for k, v in headers.items() if k != "Content-Type"}  # let requests set content-type for files
    r = getattr(requests, method)(url, headers=hdrs, timeout=30, **kwargs)
    return r


def post_json(path, headers, payload):
    r = requests.post(f"{BASE}{path}", headers=headers, json=payload, timeout=30)
    return r


def upload_csv(path, headers, csv_text: str, dataset_type: str):
    """Upload a CSV string as a multipart file upload."""
    upload_headers = {"Authorization": headers["Authorization"]}
    files = {"file": (f"{dataset_type}_data.csv", io.BytesIO(csv_text.encode()), "text/csv")}
    data  = {"dataset_type": dataset_type}
    r = requests.post(f"{BASE}{path}", headers=upload_headers, files=files, data=data, timeout=30)
    return r

# ═══════════════════════════════════════════════════════════════════════════════
#  PROJECT DEFINITIONS
# ═══════════════════════════════════════════════════════════════════════════════

PROJECTS = [

    # ── 1. Bank Reconciliation ─────────────────────────────────────────────────
    {
        "meta": {
            "name":        "Bank Reconciliation — US Corporate",
            "description": "Monthly GL cash vs bank statement reconciliation for the US Corporate entity. "
                           "Source: General Ledger extract. Target: Bank Statement feed.",
        },
        "source_csv": textwrap.dedent("""\
            txn_id,value_date,reference,description,amount,account,currency
            TXN-001,2026-05-01,CHK-10021,Office Supply Payment,-1250.00,10200,USD
            TXN-002,2026-05-01,ACH-50301,Payroll Disbursement,-85420.00,10200,USD
            TXN-003,2026-05-02,WIR-20011,Wire Transfer - Vendor A,-15000.00,10200,USD
            TXN-004,2026-05-03,DEP-60001,Customer Deposit,42000.00,10200,USD
            TXN-005,2026-05-04,CHK-10022,Rent Payment,-8500.00,10200,USD
            TXN-006,2026-05-05,ACH-50302,Utilities Direct Debit,-3200.00,10200,USD
            TXN-007,2026-05-06,WIR-20012,Wire Transfer - Vendor B,-9750.00,10200,USD
            TXN-008,2026-05-07,DEP-60002,Customer Deposit - Invoice 1084,18500.00,10200,USD
            TXN-009,2026-05-08,CHK-10023,Insurance Premium,-2100.00,10200,USD
            TXN-010,2026-05-09,FEE-00001,Bank Service Fee,-45.00,10200,USD
            TXN-011,2026-05-10,DEP-60003,Customer Deposit - Invoice 1085,33000.00,10200,USD
            TXN-012,2026-05-11,ACH-50303,Subscription Payment,-1800.00,10200,USD
            TXN-013,2026-05-12,WIR-20013,Wire Transfer - Vendor C,-22000.00,10200,USD
            TXN-014,2026-05-13,CHK-10024,Travel & Entertainment,-5600.00,10200,USD
            TXN-015,2026-05-14,DEP-60004,Customer Receipt - Invoice 1086,28750.00,10200,USD
        """),
        "target_csv": textwrap.dedent("""\
            bank_txn_id,post_date,ref_number,memo,debit,credit,account_no,curr
            BNK-10021,2026-05-01,CHK-10021,Office Supply Payment,1250.00,,10200,USD
            BNK-50301,2026-05-01,ACH-50301,Payroll Disbursement,85420.00,,10200,USD
            BNK-20011,2026-05-02,WIR-20011,Wire Transfer - Vendor A,15000.00,,10200,USD
            BNK-60001,2026-05-03,DEP-60001,Customer Deposit,,42000.00,10200,USD
            BNK-10022,2026-05-04,CHK-10022,Rent Payment,8500.00,,10200,USD
            BNK-50302,2026-05-05,ACH-50302,Utilities Direct Debit,3200.00,,10200,USD
            BNK-20012,2026-05-06,WIR-20012,Wire Transfer - Vendor B,9750.00,,10200,USD
            BNK-60002,2026-05-07,DEP-60002,Customer Deposit - Invoice 1084,,18500.00,10200,USD
            BNK-10023,2026-05-08,CHK-10023,Insurance Premium,2100.00,,10200,USD
            BNK-00001,2026-05-10,FEE-00001,Bank Service Fee,45.00,,10200,USD
            BNK-60003,2026-05-10,DEP-60003,Customer Deposit - Invoice 1085,,33000.00,10200,USD
            BNK-50303,2026-05-11,ACH-50303,Subscription Payment,1800.00,,10200,USD
            BNK-20013,2026-05-13,WIR-20013,Wire Transfer - Vendor C,22000.00,,10200,USD
            BNK-10024,2026-05-13,CHK-10024,Travel & Entertainment,5600.00,,10200,USD
            BNK-60004,2026-05-14,DEP-60004,Customer Receipt - Invoice 1086,,28750.00,10200,USD
            BNK-99001,2026-05-15,INT-99001,Interest Income,,123.50,10200,USD
        """),
        "mappings": [
            {"source_column": "reference",   "target_column": "ref_number",  "is_key_field": True},
            {"source_column": "value_date",  "target_column": "post_date",   "is_key_field": False},
            {"source_column": "amount",      "target_column": "debit",       "is_key_field": False},
            {"source_column": "account",     "target_column": "account_no",  "is_key_field": False},
            {"source_column": "currency",    "target_column": "curr",        "is_key_field": False},
        ],
        "rules": [
            {
                "name":      "Reference Exact Match",
                "rule_type": "exact",
                "config":    {"fields": ["reference"]},
            },
            {
                "name":      "Amount Tolerance +/-$5",
                "rule_type": "tolerance",
                "config":    {"fields": ["amount"], "tolerance": 5.0},
            },
            {
                "name":      "Date Window +/-2 Days",
                "rule_type": "date_diff",
                "config":    {"fields": ["value_date"], "max_days": 2},
            },
        ],
    },

    # ── 2. Accounts Receivable ─────────────────────────────────────────────────
    {
        "meta": {
            "name":        "Accounts Receivable — EMEA Region",
            "description": "Customer invoice vs receipt matching for the EMEA region. "
                           "Covers EUR, GBP, and CHF transactions with FX tolerances. "
                           "Source: AR Subledger. Target: Bank Receipts Feed.",
        },
        "source_csv": textwrap.dedent("""\
            invoice_id,invoice_date,due_date,customer_id,customer_name,invoice_amount,currency,status
            INV-2026-001,2026-04-01,2026-05-01,CUST-DE-001,Müller GmbH,25000.00,EUR,PAID
            INV-2026-002,2026-04-05,2026-05-05,CUST-FR-001,Société Générale SA,48500.00,EUR,PAID
            INV-2026-003,2026-04-08,2026-05-08,CUST-UK-001,Barclays Merchant Ltd,18750.00,GBP,PAID
            INV-2026-004,2026-04-10,2026-05-10,CUST-CH-001,Swiss Pharma AG,62000.00,CHF,PAID
            INV-2026-005,2026-04-12,2026-05-12,CUST-DE-002,Volkswagen AG,135000.00,EUR,PAID
            INV-2026-006,2026-04-15,2026-05-15,CUST-NL-001,Philips BV,41200.00,EUR,OUTSTANDING
            INV-2026-007,2026-04-18,2026-05-18,CUST-IT-001,Ferrari SpA,29800.00,EUR,PAID
            INV-2026-008,2026-04-20,2026-05-20,CUST-UK-002,HSBC Corporate,55000.00,GBP,PAID
            INV-2026-009,2026-04-22,2026-05-22,CUST-ES-001,Telefonica SA,18900.00,EUR,DISPUTED
            INV-2026-010,2026-04-25,2026-05-25,CUST-SE-001,Volvo AB,33400.00,EUR,PAID
            INV-2026-011,2026-04-28,2026-05-28,CUST-DE-003,Siemens AG,88000.00,EUR,OUTSTANDING
            INV-2026-012,2026-04-30,2026-05-30,CUST-FR-002,Airbus SE,210000.00,EUR,PAID
        """),
        "target_csv": textwrap.dedent("""\
            receipt_id,receipt_date,invoice_ref,payer_id,payer_name,amount_received,currency,bank_ref
            REC-001,2026-05-02,INV-2026-001,CUST-DE-001,Müller GmbH,25000.00,EUR,SWIFT-DE-0421
            REC-002,2026-05-06,INV-2026-002,CUST-FR-001,Société Générale SA,48500.00,EUR,SWIFT-FR-0422
            REC-003,2026-05-09,INV-2026-003,CUST-UK-001,Barclays Merchant Ltd,18750.00,GBP,SWIFT-UK-0423
            REC-004,2026-05-10,INV-2026-004,CUST-CH-001,Swiss Pharma AG,61950.00,CHF,SWIFT-CH-0424
            REC-005,2026-05-13,INV-2026-005,CUST-DE-002,Volkswagen AG,135000.00,EUR,SWIFT-DE-0425
            REC-006,2026-05-19,INV-2026-007,CUST-IT-001,Ferrari SpA,29800.00,EUR,SWIFT-IT-0426
            REC-007,2026-05-21,INV-2026-008,CUST-UK-002,HSBC Corporate,55000.00,GBP,SWIFT-UK-0427
            REC-008,2026-05-26,INV-2026-010,CUST-SE-001,Volvo AB,33400.00,EUR,SWIFT-SE-0428
            REC-009,2026-05-01,INV-2026-012,CUST-FR-002,Airbus SE,210000.00,EUR,SWIFT-FR-0429
            REC-010,2026-05-31,UNKNOWN-001,CUST-XX-001,Unknown Payer,5000.00,EUR,SWIFT-XX-9999
        """),
        "mappings": [
            {"source_column": "invoice_id",     "target_column": "invoice_ref",     "is_key_field": True},
            {"source_column": "customer_id",    "target_column": "payer_id",        "is_key_field": False},
            {"source_column": "invoice_amount", "target_column": "amount_received", "is_key_field": False},
            {"source_column": "currency",       "target_column": "currency",        "is_key_field": False},
            {"source_column": "due_date",       "target_column": "receipt_date",    "is_key_field": False},
        ],
        "rules": [
            {
                "name":      "Invoice ID Key Match",
                "rule_type": "exact",
                "config":    {"fields": ["invoice_id"]},
            },
            {
                "name":      "Amount FX Tolerance CHF50",
                "rule_type": "tolerance",
                "config":    {"fields": ["invoice_amount"], "tolerance": 50.0},
            },
            {
                "name":      "Payment Date Window 5 Days",
                "rule_type": "date_diff",
                "config":    {"fields": ["due_date"], "max_days": 5},
            },
        ],
    },

    # ── 3. Accounts Payable ────────────────────────────────────────────────────
    {
        "meta": {
            "name":        "Accounts Payable — Global Vendor Payments",
            "description": "3-way AP reconciliation: internal payment ledger vs vendor invoices. "
                           "Highlights duplicate payment risk, missing invoices, and timing differences. "
                           "Covers USD, EUR, GBP across multiple vendors.",
        },
        "source_csv": textwrap.dedent("""\
            payment_id,payment_date,vendor_id,vendor_name,invoice_no,po_number,paid_amount,currency,payment_method
            PAY-001,2026-05-02,VEN-001,Microsoft Corporation,MS-INV-90011,PO-2026-441,8500.00,USD,ACH
            PAY-002,2026-05-02,VEN-002,AWS Cloud Services,AWS-INV-22201,PO-2026-442,24300.00,USD,ACH
            PAY-003,2026-05-03,VEN-003,Oracle License,ORC-INV-33801,PO-2026-443,45000.00,USD,WIRE
            PAY-004,2026-05-04,VEN-004,Salesforce Inc,SFD-INV-44201,PO-2026-444,12800.00,USD,ACH
            PAY-005,2026-05-05,VEN-005,SAP SE,SAP-INV-55001,PO-2026-445,38000.00,EUR,WIRE
            PAY-006,2026-05-06,VEN-006,Deloitte UK,DEL-INV-66001,PO-2026-446,95000.00,GBP,WIRE
            PAY-007,2026-05-07,VEN-001,Microsoft Corporation,MS-INV-90012,PO-2026-447,3200.00,USD,ACH
            PAY-008,2026-05-08,VEN-007,IBM Global Services,IBM-INV-77001,PO-2026-448,67000.00,USD,WIRE
            PAY-009,2026-05-09,VEN-008,Accenture Ltd,ACC-INV-88001,PO-2026-449,120000.00,USD,WIRE
            PAY-010,2026-05-10,VEN-002,AWS Cloud Services,AWS-INV-22201,PO-2026-442,24300.00,USD,ACH
            PAY-011,2026-05-11,VEN-009,KPMG Advisory,KPM-INV-99001,PO-2026-450,55000.00,GBP,WIRE
            PAY-012,2026-05-12,VEN-010,Cisco Systems,CIS-INV-10001,PO-2026-451,18500.00,USD,ACH
        """),
        "target_csv": textwrap.dedent("""\
            vendor_invoice_id,invoice_date,vendor_id,vendor_name,internal_ref,po_ref,invoice_amount,currency
            MS-INV-90011,2026-04-28,VEN-001,Microsoft Corporation,PAY-001,PO-2026-441,8500.00,USD
            AWS-INV-22201,2026-04-29,VEN-002,AWS Cloud Services,PAY-002,PO-2026-442,24300.00,USD
            ORC-INV-33801,2026-04-30,VEN-003,Oracle License,PAY-003,PO-2026-443,45000.00,USD
            SFD-INV-44201,2026-05-01,VEN-004,Salesforce Inc,PAY-004,PO-2026-444,12800.00,USD
            SAP-INV-55001,2026-05-02,VEN-005,SAP SE,PAY-005,PO-2026-445,38000.00,EUR
            DEL-INV-66001,2026-05-03,VEN-006,Deloitte UK,PAY-006,PO-2026-446,95000.00,GBP
            MS-INV-90012,2026-05-04,VEN-001,Microsoft Corporation,PAY-007,PO-2026-447,3200.00,USD
            IBM-INV-77001,2026-05-05,VEN-007,IBM Global Services,PAY-008,PO-2026-448,67000.00,USD
            ACC-INV-88001,2026-05-06,VEN-008,Accenture Ltd,PAY-009,PO-2026-449,120000.00,USD
            KPM-INV-99001,2026-05-08,VEN-009,KPMG Advisory,PAY-011,PO-2026-450,55000.00,GBP
            CIS-INV-10001,2026-05-09,VEN-010,Cisco Systems,PAY-012,PO-2026-451,18500.00,USD
            NEW-INV-00099,2026-05-10,VEN-011,New Vendor Ltd,UNMATCHED,PO-2026-999,7500.00,USD
        """),
        "mappings": [
            {"source_column": "invoice_no",    "target_column": "vendor_invoice_id", "is_key_field": True},
            {"source_column": "vendor_id",     "target_column": "vendor_id",         "is_key_field": False},
            {"source_column": "po_number",     "target_column": "po_ref",            "is_key_field": False},
            {"source_column": "paid_amount",   "target_column": "invoice_amount",    "is_key_field": False},
            {"source_column": "currency",      "target_column": "currency",          "is_key_field": False},
            {"source_column": "payment_date",  "target_column": "invoice_date",      "is_key_field": False},
        ],
        "rules": [
            {
                "name":      "Invoice Number Exact Match",
                "rule_type": "exact",
                "config":    {"fields": ["invoice_no"]},
            },
            {
                "name":      "Amount Exact Match AP",
                "rule_type": "exact",
                "config":    {"fields": ["paid_amount"]},
            },
            {
                "name":      "Payment Date Window 3 Days",
                "rule_type": "date_diff",
                "config":    {"fields": ["payment_date"], "max_days": 3},
            },
        ],
    },

    # ── 4. Intercompany Reconciliation ─────────────────────────────────────────
    {
        "meta": {
            "name":        "Intercompany Reconciliation — APAC Entities",
            "description": "Elimination reconciliation between APAC Entity A (Singapore) and "
                           "Entity B (Hong Kong) for intercompany loans, services, and dividends. "
                           "Covers SGD/HKD/USD multi-currency with FX timing differences.",
        },
        "source_csv": textwrap.dedent("""\
            ic_txn_id,posting_date,entity_from,entity_to,ic_ref,description,amount_sgd,usd_equivalent,category
            IC-SG-001,2026-05-01,SG-ENTITY-A,HK-ENTITY-B,IC-REF-001,Management Fee Q2 2026,250000.00,185000.00,MANAGEMENT_FEE
            IC-SG-002,2026-05-01,SG-ENTITY-A,HK-ENTITY-B,IC-REF-002,Shared IT Services April,45000.00,33300.00,IT_SERVICES
            IC-SG-003,2026-05-05,SG-ENTITY-A,HK-ENTITY-B,IC-REF-003,Intercompany Loan Repayment,1000000.00,740000.00,LOAN_REPAYMENT
            IC-SG-004,2026-05-08,SG-ENTITY-A,HK-ENTITY-B,IC-REF-004,Brand Royalty Fee Q2,120000.00,88800.00,ROYALTY
            IC-SG-005,2026-05-10,SG-ENTITY-A,HK-ENTITY-B,IC-REF-005,Marketing Services Recharge,28000.00,20720.00,MARKETING
            IC-SG-006,2026-05-15,SG-ENTITY-A,HK-ENTITY-B,IC-REF-006,Dividend Upstream Payment,500000.00,370000.00,DIVIDEND
            IC-SG-007,2026-05-18,SG-ENTITY-A,HK-ENTITY-B,IC-REF-007,HR Shared Services Recharge,62000.00,45880.00,HR_SERVICES
            IC-SG-008,2026-05-20,SG-ENTITY-A,HK-ENTITY-B,IC-REF-008,Legal & Compliance Services,35000.00,25900.00,LEGAL
            IC-SG-009,2026-05-22,SG-ENTITY-A,HK-ENTITY-B,IC-REF-009,Supply Chain Coordination,18500.00,13690.00,SUPPLY_CHAIN
            IC-SG-010,2026-05-28,SG-ENTITY-A,HK-ENTITY-B,IC-REF-010,FX Settlement Adjustment,5200.00,3848.00,FX_ADJUSTMENT
        """),
        "target_csv": textwrap.dedent("""\
            hk_ic_id,receipt_date,entity_from,entity_to,ic_reference,description,amount_hkd,usd_equivalent,category
            IC-HK-001,2026-05-02,SG-ENTITY-A,HK-ENTITY-B,IC-REF-001,Management Fee Q2 2026,1443250.00,185000.00,MANAGEMENT_FEE
            IC-HK-002,2026-05-02,SG-ENTITY-A,HK-ENTITY-B,IC-REF-002,Shared IT Services April,259770.00,33300.00,IT_SERVICES
            IC-HK-003,2026-05-06,SG-ENTITY-A,HK-ENTITY-B,IC-REF-003,Intercompany Loan Repayment,5772000.00,740000.00,LOAN_REPAYMENT
            IC-HK-004,2026-05-09,SG-ENTITY-A,HK-ENTITY-B,IC-REF-004,Brand Royalty Fee Q2,690480.00,88500.00,ROYALTY
            IC-HK-005,2026-05-11,SG-ENTITY-A,HK-ENTITY-B,IC-REF-005,Marketing Services Recharge,161616.00,20720.00,MARKETING
            IC-HK-006,2026-05-16,SG-ENTITY-A,HK-ENTITY-B,IC-REF-006,Dividend Upstream Payment,2886000.00,370000.00,DIVIDEND
            IC-HK-007,2026-05-19,SG-ENTITY-A,HK-ENTITY-B,IC-REF-007,HR Shared Services Recharge,357434.00,45880.00,HR_SERVICES
            IC-HK-008,2026-05-21,SG-ENTITY-A,HK-ENTITY-B,IC-REF-008,Legal & Compliance Services,202202.00,25900.00,LEGAL
            IC-HK-009,2026-05-30,SG-ENTITY-A,HK-ENTITY-B,IC-REF-009,Supply Chain Coordination,107030.00,13690.00,SUPPLY_CHAIN
            IC-HK-010,2026-05-29,SG-ENTITY-A,HK-ENTITY-B,IC-REF-010,FX Settlement Adjustment,30004.00,3848.00,FX_ADJUSTMENT
            IC-HK-011,2026-05-31,SG-ENTITY-A,HK-ENTITY-B,IC-REF-011,Unbooked Accrual,62140.00,8000.00,ACCRUAL
        """),
        "mappings": [
            {"source_column": "ic_ref",         "target_column": "ic_reference",  "is_key_field": True},
            {"source_column": "entity_from",    "target_column": "entity_from",   "is_key_field": False},
            {"source_column": "entity_to",      "target_column": "entity_to",     "is_key_field": False},
            {"source_column": "usd_equivalent", "target_column": "usd_equivalent","is_key_field": False},
            {"source_column": "category",       "target_column": "category",      "is_key_field": False},
            {"source_column": "posting_date",   "target_column": "receipt_date",  "is_key_field": False},
        ],
        "rules": [
            {
                "name":      "IC Reference Exact Match",
                "rule_type": "exact",
                "config":    {"fields": ["ic_ref"]},
            },
            {
                "name":      "USD Equivalent Tolerance 300",
                "rule_type": "tolerance",
                "config":    {"fields": ["usd_equivalent"], "tolerance": 300.0},
            },
            {
                "name":      "Posting Date Window 2 Days",
                "rule_type": "date_diff",
                "config":    {"fields": ["posting_date"], "max_days": 2},
            },
        ],
    },

    # ── 5. Payroll Reconciliation ──────────────────────────────────────────────
    {
        "meta": {
            "name":        "Payroll Reconciliation — North America",
            "description": "3-way payroll reconciliation: HR system extract vs bank transfer confirmation "
                           "vs GL payroll posting. Covers US and Canada employees with deductions, "
                           "benefits, and tax withholding verification.",
        },
        "source_csv": textwrap.dedent("""\
            emp_id,employee_name,department,payroll_period,gross_pay,tax_withholding,benefits_deduction,net_pay,currency,bank_account_last4
            EMP-001,Sarah Johnson,Engineering,2026-05,12500.00,2812.50,450.00,9237.50,USD,4521
            EMP-002,Michael Chen,Engineering,2026-05,11800.00,2655.00,450.00,8695.00,USD,7832
            EMP-003,Priya Patel,Product,2026-05,13200.00,2970.00,450.00,9780.00,USD,2198
            EMP-004,David Williams,Finance,2026-05,10500.00,2362.50,450.00,7687.50,USD,6641
            EMP-005,Emily Rodriguez,HR,2026-05,9800.00,2205.00,450.00,7145.00,USD,9013
            EMP-006,James Thompson,Sales,2026-05,15000.00,3375.00,450.00,11175.00,USD,3344
            EMP-007,Alice Brown,Legal,2026-05,14200.00,3195.00,450.00,10555.00,USD,8876
            EMP-008,Robert Kim,IT,2026-05,11000.00,2475.00,450.00,8075.00,USD,5521
            EMP-009,Jennifer Davis,Marketing,2026-05,10200.00,2295.00,450.00,7455.00,USD,1122
            EMP-010,Carlos Martinez,Operations,2026-05,9600.00,2160.00,450.00,6990.00,USD,4433
            EMP-011,Sophie Tremblay,Engineering,2026-05,13500.00,2565.00,380.00,10555.00,CAD,7701
            EMP-012,Marc Beaumont,Finance,2026-05,11200.00,2128.00,380.00,8692.00,CAD,8812
            EMP-013,Isabelle Gagnon,HR,2026-05,10800.00,2052.00,380.00,8368.00,CAD,2293
        """),
        "target_csv": textwrap.dedent("""\
            transfer_id,transfer_date,emp_ref,beneficiary_name,amount_transferred,currency,bank_ref,status
            TRF-001,2026-05-28,EMP-001,Sarah Johnson,9237.50,USD,ACH-PAY-001,SETTLED
            TRF-002,2026-05-28,EMP-002,Michael Chen,8695.00,USD,ACH-PAY-002,SETTLED
            TRF-003,2026-05-28,EMP-003,Priya Patel,9780.00,USD,ACH-PAY-003,SETTLED
            TRF-004,2026-05-28,EMP-004,David Williams,7687.50,USD,ACH-PAY-004,SETTLED
            TRF-005,2026-05-28,EMP-005,Emily Rodriguez,7145.00,USD,ACH-PAY-005,SETTLED
            TRF-006,2026-05-28,EMP-006,James Thompson,11175.00,USD,ACH-PAY-006,SETTLED
            TRF-007,2026-05-28,EMP-007,Alice Brown,10555.00,USD,ACH-PAY-007,SETTLED
            TRF-008,2026-05-28,EMP-008,Robert Kim,8075.00,USD,ACH-PAY-008,SETTLED
            TRF-009,2026-05-28,EMP-009,Jennifer Davis,7455.00,USD,ACH-PAY-009,SETTLED
            TRF-010,2026-05-28,EMP-010,Carlos Martinez,6990.00,USD,ACH-PAY-010,SETTLED
            TRF-011,2026-05-29,EMP-011,Sophie Tremblay,10555.00,CAD,EFT-PAY-011,SETTLED
            TRF-012,2026-05-29,EMP-012,Marc Beaumont,8692.00,CAD,EFT-PAY-012,SETTLED
            TRF-013,2026-05-29,EMP-013,Isabelle Gagnon,8368.00,CAD,EFT-PAY-013,SETTLED
            TRF-014,2026-05-28,EMP-099,Unknown Employee,3500.00,USD,ACH-PAY-099,SETTLED
        """),
        "mappings": [
            {"source_column": "emp_id",    "target_column": "emp_ref",             "is_key_field": True},
            {"source_column": "net_pay",   "target_column": "amount_transferred",  "is_key_field": False},
            {"source_column": "currency",  "target_column": "currency",            "is_key_field": False},
        ],
        "rules": [
            {
                "name":      "Employee ID Exact Match",
                "rule_type": "exact",
                "config":    {"fields": ["emp_id"]},
            },
            {
                "name":      "Net Pay Exact Match",
                "rule_type": "exact",
                "config":    {"fields": ["net_pay"]},
            },
        ],
    },
]

# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN SEEDING FLOW
# ═══════════════════════════════════════════════════════════════════════════════

def seed_project(admin_headers, proj_def, idx, user_ids):
    """Create one complete project with datasets, mappings, rules, and execution."""

    step(f"[{idx+1}/5] Creating project: {proj_def['meta']['name']}")

    # 1. Create project
    r = post_json("/api/projects", admin_headers, proj_def["meta"])
    if r.status_code not in (200, 201):
        warn(f"  Project creation failed: {r.status_code} {r.text[:300]}")
        return None
    project = r.json()
    pid = project.get("id") or project.get("project_id")
    ok(f"Project created → id={pid}")

    # 2. Upload source dataset
    r = upload_csv(f"/api/projects/{pid}/datasets",
                   admin_headers, proj_def["source_csv"], "source")
    if r.status_code in (200, 201):
        ok("Source dataset uploaded")
    else:
        warn(f"Source upload: {r.status_code} {r.text[:200]}")

    # 3. Upload target dataset
    r = upload_csv(f"/api/projects/{pid}/datasets",
                   admin_headers, proj_def["target_csv"], "target")
    if r.status_code in (200, 201):
        ok("Target dataset uploaded")
    else:
        warn(f"Target upload: {r.status_code} {r.text[:200]}")

    # 4. Create mappings
    r = post_json(f"/api/projects/{pid}/mappings", admin_headers,
                  {"mappings": proj_def["mappings"]})
    if r.status_code in (200, 201):
        ok(f"{len(proj_def['mappings'])} mappings created")
    else:
        warn(f"Mappings: {r.status_code} {r.text[:200]}")

    # 5. Create rules
    for rule in proj_def["rules"]:
        r = post_json(f"/api/projects/{pid}/rules", admin_headers, rule)
        if r.status_code in (200, 201):
            ok(f"Rule created: {rule['name']}")
        else:
            warn(f"Rule '{rule['name']}': {r.status_code} {r.text[:150]}")

    # 6. Trigger execution
    info("Triggering execution…")
    r = post_json(f"/api/projects/{pid}/executions", admin_headers, {})
    exec_id = None
    if r.status_code in (200, 201, 202):
        exec_data = r.json()
        exec_id = exec_data.get("id") or exec_data.get("execution_id")
        ok(f"Execution started → id={exec_id}")
    else:
        warn(f"Execution trigger: {r.status_code} {r.text[:200]}")

    # 7. Poll execution status (up to 30s)
    if exec_id:
        info("Waiting for execution to complete…")
        for attempt in range(10):
            time.sleep(3)
            r = requests.get(f"{BASE}/api/projects/{pid}/executions/{exec_id}",
                             headers=admin_headers, timeout=10)
            if r.status_code == 200:
                status = r.json().get("status", "")
                if status == "completed":
                    ok(f"Execution completed (attempt {attempt+1})")
                    break
                elif status == "failed":
                    warn(f"Execution failed after {attempt+1} attempts")
                    break
                else:
                    info(f"  Status: {status} (attempt {attempt+1})")
            else:
                warn(f"  Status check failed: {r.status_code}")
                break

    # 8. Promote execution → Enterprise Profile
    if exec_id:
        info("Promoting execution to Enterprise Profile…")
        promote_payload = {
            "preparer_id":  user_ids.get("preparer"),
            "reviewer_id":  user_ids.get("reviewer"),
            "approver_id":  user_ids.get("approver"),
            "certifier_id": user_ids.get("certifier"),
        }
        r = post_json(f"/api/projects/{pid}/executions/{exec_id}/promote",
                      admin_headers, promote_payload)
        if r.status_code in (200, 201, 202):
            ok("Execution promoted to Enterprise Profile ✓")
            profile_data = r.json()
            profile_id = (profile_data.get("profile_id") or
                          profile_data.get("id") or
                          (profile_data.get("profile", {}) or {}).get("id"))
            if profile_id:
                ok(f"  Enterprise Profile id={profile_id}")
        else:
            warn(f"Promote: {r.status_code} {r.text[:300]}")

    return pid


def main():
    print(f"\n{BOLD}{'='*65}")
    print("  DRMS Demo Project Seeder -- 5-Project Full Flow")
    print(f"{'='*65}{RESET}\n")

    # Check connectivity
    try:
        r = requests.get(f"{BASE}/api/health", timeout=5)
        if r.status_code == 200:
            ok(f"Backend reachable at {BASE}")
        else:
            err(f"Backend unhealthy: {r.status_code}")
    except Exception as e:
        err(f"Cannot reach backend at {BASE}: {e}")

    # Login as admin
    step("Authenticating as admin")
    admin_h = login("admin")
    ok("Admin token acquired")

    # Collect user IDs for role assignments
    step("Resolving user IDs")
    user_ids = {}
    for role in ("preparer", "reviewer", "approver", "certifier", "auditor"):
        role_h = login(role)
        uid = get_user_id(role_h, role)
        if uid:
            user_ids[role] = uid
            ok(f"  {role} → id={uid}")
        else:
            warn(f"  Could not resolve user id for role: {role}")

    # Seed all 5 projects
    created = []
    for idx, proj_def in enumerate(PROJECTS):
        pid = seed_project(admin_h, proj_def, idx, user_ids)
        if pid:
            created.append((proj_def["meta"]["name"], pid))

    # Summary
    print(f"\n{BOLD}{'='*65}")
    print(f"  Seeding Complete -- {len(created)}/{len(PROJECTS)} projects created")
    print(f"{'='*65}{RESET}")
    for name, pid in created:
        print(f"  {GREEN}✔{RESET}  [{pid:>3}] {name}")
    print()
    print(f"  {CYAN}Frontend:{RESET}  http://localhost:5173")
    print(f"  {CYAN}API Docs:{RESET}  http://localhost:8000/api/docs")
    print()
    print(f"  Demo credentials:")
    for role, creds in USERS.items():
        print(f"    {role:<10}  {creds['username']} / {creds['password']}")
    print()


if __name__ == "__main__":
    main()
