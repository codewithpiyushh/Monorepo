/**
 * ApproverWorkbench — Final sign-off queue for the Approver role.
 *
 * This page is the Approver's primary workspace. It shows only reconciliation
 * workflows that have already been reviewed (status = "reviewed") and are
 * awaiting final approval. This is the second independent control in the
 * SOX two-step approval chain.
 *
 * Distinct from ReviewerWorkbench:
 *  • Reviewer validates completeness of the preparer's work
 *  • Approver gives final accountability sign-off before certification
 *  • SoD: the approver must not be the same person who reviewed
 *
 * Actions available:
 *  • APPROVE    → status: reviewed → approved
 *  • RETURN     → status: reviewed → returned_for_rework (with mandatory reason)
 *  • REJECT     → status: reviewed → rejected (with mandatory reason)
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  CheckCircle2, XCircle, RotateCcw, Clock,
  User, ChevronRight, AlertTriangle, Shield,
} from 'lucide-react'
import { workflowAPI, enterpriseAPI } from '../api'
import { useAuthStore } from '../store/authStore'

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const fmtDate = (s) => {
  try { return new Date(s).toLocaleString() } catch { return s || '—' }
}

function StatusBadge({ status }) {
  const map = {
    reviewed:            { label: 'Awaiting Approval', bg: '#FEF3C7', color: '#92400E' },
    approved:            { label: 'Approved',           bg: '#D1FAE5', color: '#065F46' },
    rejected:            { label: 'Rejected',           bg: '#FEE2E2', color: '#991B1B' },
    returned_for_rework: { label: 'Returned',           bg: '#FEF9C3', color: '#713F12' },
  }
  const m = map[status] || { label: status, bg: '#F3F4F6', color: '#374151' }
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 9999,
      background: m.bg, color: m.color,
    }}>
      {m.label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────
// Action modal
// ─────────────────────────────────────────────────────────────
function ActionModal({ workflow, action, onClose, onConfirm, loading }) {
  const [comments, setComments] = useState('')
  const requiresComment = action !== 'approve'

  const labels = {
    approve: { title: 'Approve Reconciliation', btn: 'Approve', color: '#059669' },
    return_for_rework: { title: 'Return for Rework', btn: 'Return to Preparer', color: '#D97706' },
    reject: { title: 'Reject Reconciliation', btn: 'Reject', color: '#DC2626' },
  }
  const meta = labels[action] || labels.approve

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--surface-1)', borderRadius: 12, padding: 24,
        width: 480, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
          {meta.title}
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 16px' }}>
          Workflow #{workflow.id} — Reconciliation #{workflow.reconciliation_id}
        </p>

        {action === 'approve' && (
          <div style={{
            background: '#F0FDF4', border: '1px solid #BBF7D0',
            borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#166534',
          }}>
            <Shield size={13} style={{ display: 'inline', marginRight: 6 }} />
            By approving, you confirm this reconciliation is complete and accurate.
            Your sign-off is recorded in the immutable audit trail.
          </div>
        )}

        {action === 'return_for_rework' && (
          <div style={{
            background: '#FFFBEB', border: '1px solid #FDE68A',
            borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#92400E',
          }}>
            <RotateCcw size={13} style={{ display: 'inline', marginRight: 6 }} />
            The reconciliation will be returned to the preparer with your comments.
            They can correct the issues and re-submit.
          </div>
        )}

        {action === 'reject' && (
          <div style={{
            background: '#FEF2F2', border: '1px solid #FECACA',
            borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#991B1B',
          }}>
            <XCircle size={13} style={{ display: 'inline', marginRight: 6 }} />
            This is a hard rejection. Document the reason clearly — this is a permanent
            audit record and cannot be undone without an admin reopen.
          </div>
        )}

        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 6 }}>
          {requiresComment ? 'Reason (required)' : 'Comments (optional)'}
        </label>
        <textarea
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          placeholder={
            action === 'approve'
              ? 'Optional approval notes…'
              : action === 'return_for_rework'
              ? 'Describe what needs to be corrected before re-submission…'
              : 'State the reason for rejection clearly…'
          }
          rows={4}
          style={{
            width: '100%', boxSizing: 'border-box', resize: 'vertical',
            padding: '8px 10px', borderRadius: 8, fontSize: 12,
            border: '1px solid var(--border-primary)', background: 'var(--surface-2)',
            color: 'var(--text-primary)', fontFamily: 'inherit',
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13,
              border: '1px solid var(--border-primary)', background: 'transparent',
              color: 'var(--text-secondary)', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(comments)}
            disabled={loading || (requiresComment && !comments.trim())}
            style={{
              padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: meta.color, color: '#fff', border: 'none',
              cursor: loading || (requiresComment && !comments.trim()) ? 'not-allowed' : 'pointer',
              opacity: loading || (requiresComment && !comments.trim()) ? 0.5 : 1,
            }}
          >
            {loading ? 'Processing…' : meta.btn}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Workflow row card
// ─────────────────────────────────────────────────────────────
function WorkflowCard({ workflow, onAction, selected, onSelect }) {
  return (
    <div
      onClick={() => onSelect(workflow.id)}
      style={{
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-primary)'}`,
        borderRadius: 10, padding: '14px 16px', cursor: 'pointer',
        background: selected ? 'var(--surface-2)' : 'var(--surface-1)',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              Workflow #{workflow.id}
            </span>
            <StatusBadge status={workflow.status} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 11, color: 'var(--text-secondary)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <ChevronRight size={10} /> Recon #{workflow.reconciliation_id}
            </span>
            {workflow.assigned_to && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <User size={10} /> Assigned to #{workflow.assigned_to}
              </span>
            )}
            {workflow.updated_at && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={10} /> {fmtDate(workflow.updated_at)}
              </span>
            )}
          </div>
          {workflow.comments && (
            <p style={{
              margin: '6px 0 0', fontSize: 11, color: 'var(--text-secondary)',
              fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              "{workflow.comments}"
            </p>
          )}
        </div>

        {workflow.status === 'reviewed' && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              onClick={(e) => { e.stopPropagation(); onAction(workflow, 'approve') }}
              title="Approve"
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: '#059669', color: '#fff', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              <CheckCircle2 size={11} /> Approve
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onAction(workflow, 'return_for_rework') }}
              title="Return for Rework"
              style={{
                padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: '#D97706', color: '#fff', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              <RotateCcw size={11} /> Return
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onAction(workflow, 'reject') }}
              title="Reject"
              style={{
                padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: '#DC2626', color: '#fff', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              <XCircle size={11} /> Reject
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────
export default function ApproverWorkbench() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const [activeModal, setActiveModal] = useState(null) // { workflow, action }
  const [selectedId, setSelectedId] = useState(null)

  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ['approver-queue', user?.id],
    queryFn: () => workflowAPI.list({ role: 'approver', user_id: user?.id }),
    refetchInterval: 30_000,
  })

  const actionMutation = useMutation({
    mutationFn: ({ action, reconciliation_id, comments }) => {
      if (action === 'approve')           return workflowAPI.approve({ reconciliation_id, comments })
      if (action === 'return_for_rework') return workflowAPI.returnForRework({ reconciliation_id, comments })
      if (action === 'reject')            return workflowAPI.reject({ reconciliation_id, comments })
      throw new Error(`Unknown action: ${action}`)
    },
    onSuccess: (_, vars) => {
      const labels = { approve: 'approved', return_for_rework: 'returned for rework', reject: 'rejected' }
      toast.success(`Workflow ${labels[vars.action] || vars.action} successfully`)
      setActiveModal(null)
      qc.invalidateQueries({ queryKey: ['approver-queue'] })
    },
    onError: (err) => {
      toast.error(err?.response?.data?.detail || err.message || 'Action failed')
    },
  })

  const reviewed  = workflows.filter((w) => w.status === 'reviewed')
  const processed = workflows.filter((w) => w.status !== 'reviewed')

  return (
    <div style={{ padding: '24px 28px', maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Shield size={20} color="var(--accent)" />
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
            Approver Queue
          </h1>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
          Reconciliations reviewed by a reviewer and awaiting your final sign-off.
          As approver, your decision is the last step before period certification.
        </p>
      </div>

      {/* SoD notice */}
      <div style={{
        background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8,
        padding: '10px 14px', marginBottom: 20, fontSize: 12, color: '#1E40AF',
        display: 'flex', alignItems: 'flex-start', gap: 8,
      }}>
        <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          <strong>Segregation of Duties:</strong> You cannot approve a reconciliation
          that you submitted or reviewed. Such workflows are automatically excluded from this queue.
        </span>
      </div>

      {/* Stats bar */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24,
      }}>
        {[
          { label: 'Awaiting Approval', count: reviewed.length, color: '#D97706' },
          { label: 'Processed Today', count: processed.length, color: '#059669' },
          { label: 'Total in Queue', count: workflows.length, color: 'var(--text-secondary)' },
        ].map((s) => (
          <div key={s.label} style={{
            background: 'var(--surface-2)', borderRadius: 8, padding: '12px 16px',
            border: '1px solid var(--border-primary)',
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.count}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Queue */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)', fontSize: 13 }}>
          Loading approval queue…
        </div>
      ) : reviewed.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 48, border: '1px dashed var(--border-primary)',
          borderRadius: 10, color: 'var(--text-secondary)',
        }}>
          <CheckCircle2 size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
          <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>Queue is clear</p>
          <p style={{ margin: '6px 0 0', fontSize: 12 }}>No reconciliations are awaiting your approval right now.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
            {reviewed.length} reconciliation{reviewed.length !== 1 ? 's' : ''} awaiting approval
          </p>
          {reviewed.map((wf) => (
            <WorkflowCard
              key={wf.id}
              workflow={wf}
              selected={selectedId === wf.id}
              onSelect={setSelectedId}
              onAction={(workflow, action) => setActiveModal({ workflow, action })}
            />
          ))}
        </div>
      )}

      {/* Action modal */}
      {activeModal && (
        <ActionModal
          workflow={activeModal.workflow}
          action={activeModal.action}
          onClose={() => setActiveModal(null)}
          loading={actionMutation.isPending}
          onConfirm={(comments) =>
            actionMutation.mutate({
              action: activeModal.action,
              reconciliation_id: activeModal.workflow.reconciliation_id,
              comments,
            })
          }
        />
      )}
    </div>
  )
}
