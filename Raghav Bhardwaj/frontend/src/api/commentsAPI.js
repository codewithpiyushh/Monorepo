/**
 * commentsAPI
 * ────────────
 * Add to frontend/src/api/index.js:
 *   export { commentsAPI } from './commentsAPI'
 *
 * Or import directly:
 *   import { commentsAPI } from '../api/commentsAPI'
 */
import api from './client'

export const commentsAPI = {
  /**
   * Fetch the full comment thread for a balance.
   * Automatically marks all comments as read for the current user.
   * @param {number} balanceId
   * @param {string|null} commentType  — optional filter: DISCUSSION | QUESTION | AUDITOR_NOTE | SYSTEM_EVENT
   */
  list: (balanceId, commentType = null) => {
    const params = new URLSearchParams()
    if (commentType) params.set('comment_type', commentType)
    const qs = params.toString()
    return api.get(`/v1/balances/${balanceId}/comments${qs ? `?${qs}` : ''}`).then(r => r.data)
  },

  /**
   * Post an immutable comment.
   * @param {number} balanceId
   * @param {object} payload — { content, comment_type, parent_comment_id?, attachment_id? }
   */
  post: (balanceId, payload) =>
    api.post(`/v1/balances/${balanceId}/comments`, payload).then(r => r.data),

  /**
   * Mark a specific comment as read.
   */
  markRead: (balanceId, commentId) =>
    api.post(`/v1/balances/${balanceId}/comments/${commentId}/read`).then(r => r.data),
}
