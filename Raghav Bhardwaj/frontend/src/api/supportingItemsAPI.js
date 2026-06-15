/**
 * supportingItemsAPI
 * ───────────────────
 * Add to frontend/src/api/index.js:
 *   export { supportingItemsAPI } from './supportingItemsAPI'
 *
 * Or import directly:
 *   import { supportingItemsAPI } from '../api/supportingItemsAPI'
 */
import api from './client'

export const supportingItemsAPI = {
  /**
   * List all supporting items for a balance.
   * Returns { items, unexplained_variance, certification_blocked, ... }
   */
  list: (balanceId, includeResolved = true) =>
    api.get(`/v1/supporting-items?balance_id=${balanceId}&include_resolved=${includeResolved}`)
      .then(r => r.data),

  /**
   * Create a new supporting item on a DRAFT balance.
   */
  create: (payload) =>
    api.post('/v1/supporting-items', payload).then(r => r.data),

  /**
   * Convert an active exception into a supporting item.
   * Marks the exception as EXPLAINED automatically.
   */
  createFromException: (payload) =>
    api.post('/v1/supporting-items/from-exception', payload).then(r => r.data),

  /**
   * Mark a supporting item as resolved with a mandatory comment.
   */
  resolve: (itemId, resolutionComment) =>
    api.post(`/v1/supporting-items/${itemId}/resolve`, {
      resolution_comment: resolutionComment,
    }).then(r => r.data),

  /**
   * Delete a supporting item (balance must be DRAFT).
   */
  delete: (itemId) =>
    api.delete(`/v1/supporting-items/${itemId}`).then(r => r.data),

  /**
   * Carry-forward unresolved items from one period to the next.
   * Admin/certifier only.
   */
  carryForward: (sourceBalanceId, targetBalanceId) =>
    api.post('/v1/supporting-items/carry-forward', {
      source_balance_id: sourceBalanceId,
      target_balance_id: targetBalanceId,
    }).then(r => r.data),

  /**
   * Pre-flight check: returns { certification_blocked: false } or raises 409.
   * Call before showing the Certify button.
   */
  certifyBlockCheck: (balanceId) =>
    api.post('/v1/supporting-items/certify-block-check', {
      balance_id: balanceId,
    }).then(r => r.data),
}
