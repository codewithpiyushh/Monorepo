# -*- coding: utf-8 -*-
"""
backend/scripts/patch_rules.py
Retroactively adds matching rules to the 5 demo projects (IDs 163-167)
that were created without rules due to the JSON string vs dict bug.

Usage: python backend/scripts/patch_rules.py
"""
import sys
import requests

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

BASE = "http://localhost:8000"

# Project IDs -> rules to add
PATCHES = [
    {
        "project_id": 163,
        "name": "Bank Reconciliation -- US Corporate",
        "rules": [
            {"name": "Reference Exact Match",     "rule_type": "exact",     "config": {"fields": ["reference"]}},
            {"name": "Amount Tolerance 5 USD",    "rule_type": "tolerance", "config": {"fields": ["amount"], "tolerance": 5.0}},
            {"name": "Date Window 2 Days",        "rule_type": "date_diff", "config": {"fields": ["value_date"], "max_days": 2}},
        ],
    },
    {
        "project_id": 164,
        "name": "Accounts Receivable -- EMEA Region",
        "rules": [
            {"name": "Invoice ID Key Match",      "rule_type": "exact",     "config": {"fields": ["invoice_id"]}},
            {"name": "Amount FX Tolerance 50",    "rule_type": "tolerance", "config": {"fields": ["invoice_amount"], "tolerance": 50.0}},
            {"name": "Payment Date Window 5 Days","rule_type": "date_diff", "config": {"fields": ["due_date"], "max_days": 5}},
        ],
    },
    {
        "project_id": 165,
        "name": "Accounts Payable -- Global Vendor Payments",
        "rules": [
            {"name": "Invoice Number Exact Match","rule_type": "exact",     "config": {"fields": ["invoice_no"]}},
            {"name": "Amount Exact Match AP",     "rule_type": "exact",     "config": {"fields": ["paid_amount"]}},
            {"name": "Payment Date Window 3 Days","rule_type": "date_diff", "config": {"fields": ["payment_date"], "max_days": 3}},
        ],
    },
    {
        "project_id": 166,
        "name": "Intercompany Reconciliation -- APAC Entities",
        "rules": [
            {"name": "IC Reference Exact Match",  "rule_type": "exact",     "config": {"fields": ["ic_ref"]}},
            {"name": "USD Equivalent Tol 300",    "rule_type": "tolerance", "config": {"fields": ["usd_equivalent"], "tolerance": 300.0}},
            {"name": "Posting Date Window 2 Days","rule_type": "date_diff", "config": {"fields": ["posting_date"], "max_days": 2}},
        ],
    },
    {
        "project_id": 167,
        "name": "Payroll Reconciliation -- North America",
        "rules": [
            {"name": "Employee ID Exact Match",   "rule_type": "exact",     "config": {"fields": ["emp_id"]}},
            {"name": "Net Pay Exact Match",       "rule_type": "exact",     "config": {"fields": ["net_pay"]}},
        ],
    },
]

def main():
    print("\nLogging in as admin...")
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"username": "admin", "password": "admin123"},
                      timeout=60)
    if r.status_code != 200:
        print(f"  Login failed: {r.status_code} {r.text[:200]}")
        sys.exit(1)
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    print("  Admin login OK\n")

    total_ok = 0
    total_fail = 0
    for patch in PATCHES:
        pid = patch["project_id"]
        print(f"Project [{pid}] {patch['name']}")
        for rule in patch["rules"]:
            r = requests.post(f"{BASE}/api/projects/{pid}/rules",
                              headers=headers, json=rule, timeout=30)
            if r.status_code in (200, 201):
                print(f"  OK  {rule['name']}")
                total_ok += 1
            else:
                print(f"  FAIL {rule['name']}: {r.status_code} {r.text[:120]}")
                total_fail += 1
        print()

    print(f"Done: {total_ok} rules created, {total_fail} failed.\n")

if __name__ == "__main__":
    main()
