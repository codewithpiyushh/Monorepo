ADMIN     = "admin"
PREPARER  = "preparer"
REVIEWER  = "reviewer"
APPROVER  = "approver"
CERTIFIER = "certifier"
AUDITOR   = "auditor"   # read-only compliance / internal-audit role

ALL_ROLES = {ADMIN, PREPARER, REVIEWER, APPROVER, CERTIFIER, AUDITOR}

# ---------------------------------------------------------------------------
# Role hierarchy (higher index = more authority).
# Used by SoD checks to ensure approvals always move UP the chain.
# ---------------------------------------------------------------------------
ROLE_RANK: dict[str, int] = {
    PREPARER:  1,
    REVIEWER:  2,
    APPROVER:  3,
    CERTIFIER: 4,
    AUDITOR:   0,   # read-only — no workflow rank
    ADMIN:     99,
}

# Roles that are permitted to make write / state-change calls
WRITE_ROLES = {ADMIN, PREPARER, REVIEWER, APPROVER, CERTIFIER}

# Roles that are strictly read-only on data endpoints
READ_ONLY_ROLES = {AUDITOR}
