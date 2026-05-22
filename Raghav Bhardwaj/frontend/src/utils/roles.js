export const normalizeRole = (role) => {
  const normalized = (role || '').toLowerCase()
  return normalized === 'approver' ? 'reviewer' : normalized
}

