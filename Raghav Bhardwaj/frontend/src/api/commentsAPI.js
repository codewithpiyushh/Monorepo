// frontend/src/api/commentsAPI.js
// In-context Comment Threads API — Phase 2 Chunk 2
// CommentThreadPanel uses { commentsAPI } named import from this file.

import client from './client'

// NOTE: client.js baseURL is '/api' so paths here start with '/v1/...'
const BASE = '/v1/comments'

export const commentsAPI = {
  // List comments for a balance record, optionally filtered by type
  list: (balanceId, commentType = null) => {
    const params = { balance_id: balanceId }
    if (commentType && commentType !== 'ALL') params.comment_type = commentType
    return client.get(BASE, { params }).then(r => r.data)
  },

  // Post a new comment
  post: (balanceId, payload) =>
    client.post(BASE, { balance_id: balanceId, ...payload }).then(r => r.data),

  // Mark comments as read for a balance record
  markRead: (balanceId) =>
    client.post(`${BASE}/mark-read`, { balance_id: balanceId }).then(r => r.data),

  // Get unread count for a balance record
  unreadCount: (balanceId) =>
    client.get(`${BASE}/unread-count`, { params: { balance_id: balanceId } }).then(r => r.data),
}

export default commentsAPI
