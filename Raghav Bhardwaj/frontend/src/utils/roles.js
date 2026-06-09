/**
 * Role constants — must match backend app/rbac/roles.py
 *
 * REMOVED: the previous normalizeRole() aliased 'approver' → 'reviewer',
 * making both roles identical everywhere in the UI. This broke SOX SoD
 * because the two roles need distinct nav, distinct pages, and distinct
 * permissions. Each role now has its own identity.
 */

export const ROLES = {
  ADMIN:     'admin',
  PREPARER:  'preparer',
  REVIEWER:  'reviewer',
  APPROVER:  'approver',
  CERTIFIER: 'certifier',
  AUDITOR:   'auditor',
}

/** Normalise raw role string to lowercase — NO cross-role aliasing. */
export const normalizeRole = (role) => (role || '').toLowerCase().trim()

/** True if the role can perform write / state-change operations. */
export const isWriteRole = (role) =>
  [ROLES.ADMIN, ROLES.PREPARER, ROLES.REVIEWER, ROLES.APPROVER, ROLES.CERTIFIER].includes(
    normalizeRole(role)
  )

/** True if the role is strictly read-only (auditor). */
export const isReadOnlyRole = (role) => normalizeRole(role) === ROLES.AUDITOR

/** True if the role has reviewer-or-above authority (reviewer, approver, certifier, admin). */
export const isReviewerOrAbove = (role) =>
  [ROLES.REVIEWER, ROLES.APPROVER, ROLES.CERTIFIER, ROLES.ADMIN].includes(normalizeRole(role))
