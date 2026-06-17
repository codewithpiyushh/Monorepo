ADMIN     = "admin"
PREPARER  = "preparer"
APPROVER  = "approver"
CERTIFIER = "certifier"

ALL_ROLES = {ADMIN, PREPARER, APPROVER, CERTIFIER}

# ---------------------------------------------------------------------------
# Role hierarchy (higher index = more authority).
# Used by SoD checks to ensure approvals always move UP the chain.
# APPROVER combines review + approval in a single role that can:
#   • Review submissions and check evidence
#   • Approve / return / escalate after reviewing the preparer's work
# ---------------------------------------------------------------------------
ROLE_RANK: dict[str, int] = {
    PREPARER:  1,
    APPROVER:  2,   # merged reviewer & approver — handles both review and approval
    CERTIFIER: 3,
    ADMIN:     99,
}

# Roles that are permitted to make write / state-change calls
WRITE_ROLES = {ADMIN, PREPARER, APPROVER, CERTIFIER}

# Roles that are strictly read-only on data endpoints (none — auditor role removed)
READ_ONLY_ROLES = set()
