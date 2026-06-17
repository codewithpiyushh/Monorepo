/**
 * Role constants — must match backend app/rbac/roles.py
 *
 * CHANGES: Removed AUDITOR role. Merged REVIEWER and APPROVER into single APPROVER role.
 * The APPROVER role can now:
 *   • Review submissions and check evidence (validates completeness)
 *   • Approve / Return / Escalate after reviewing
 * Only 4 roles remain: ADMIN, PREPARER, APPROVER, CERTIFIER
 */

export const ROLES = {
  ADMIN:     'admin',
  PREPARER:  'preparer',
  APPROVER:  'approver',
  CERTIFIER: 'certifier',
}

/** Normalise raw role string to lowercase — NO cross-role aliasing. */
export const normalizeRole = (role) => (role || '').toLowerCase().trim()

/** True if the role can perform write / state-change operations. */
export const isWriteRole = (role) =>
  [ROLES.ADMIN, ROLES.PREPARER, ROLES.APPROVER, ROLES.CERTIFIER].includes(
    normalizeRole(role)
  )

/** True if the role is strictly read-only (none — auditor role removed). */
export const isReadOnlyRole = (role) => false

/** True if the role has approver-or-above authority (approver, certifier, admin). */
export const isApproverOrAbove = (role) =>
  [ROLES.APPROVER, ROLES.CERTIFIER, ROLES.ADMIN].includes(normalizeRole(role))

