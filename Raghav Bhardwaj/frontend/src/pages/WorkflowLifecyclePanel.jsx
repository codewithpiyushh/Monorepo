/**
 * WorkflowLifecyclePanel — Phase 2
 * ──────────────────────────────────
 * Full replacement of the Phase 1 component.
 *
 * New in Phase 2:
 *  - Dynamic stepper maps over approval_chain_json (N tiers, not hardcoded 5 steps)
 *  - PARALLEL tier grouping — shows all parallel approvers in a cluster node
 *  - ⚡ Auto-Certified badge when auto_certified = true
 *  - Delegation indicators on approver nodes
 *  - Active tier highlight with pulsing ring
 *  - Parallel quorum progress bar inside tier nodes
 *  - History entries unchanged (still fetched from /workflow-history)
 *  - Action buttons remain role + ownership + status gated (same as Phase 1)
 *
 * Usage (unchanged from Phase 1):
 *   import WorkflowLifecyclePanel, { isBalanceLocked } from './WorkflowLifecyclePanel'
 *   <WorkflowLifecyclePanel balance={selectedBalance} profile={selectedProfile} />
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  CheckCircle2, Clock, XCircle, Lock, Zap,
  Send, ThumbsUp, ThumbsDown, Award,
  AlertTriangle, User, Users, ChevronRight,
  ArrowRight,
} from 'lucide-react'
import { lifecycleAPI } from '../api/lifecycleAPI'
import { useAuthStore }  from '../store/authStore'
import { normalizeRole } from '../utils/roles'

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const fmtDate = (ts) => {
  if (!ts) return '—'
  try { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return ts }
}

const LOCKED_STATES = ['UNDER_REVIEW', 'APPROVED', 'CERTIFIED', 'CLOSED']

const STATUS_COLOR = {
  DRAFT:        'var(--text-secondary)',
  UNDER_REVIEW: 'var(--warn)',
  APPROVED:     '#3B82F6',
  CERTIFIED:    'var(--ok)',
  CLOSED:       'var(--text-disabled)',
  REJECTED:     'var(--bad)',
}

// ─────────────────────────────────────────────────────────────
// Auto-certification banner
// ─────────────────────────────────────────────────────────────

function AutoCertBanner() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 16px', borderRadius: 8, marginBottom: 16,
      background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
      boxShadow: '0 2px 12px #05966930',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: 'rgba(255,255,255,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Zap size={14} color="#fff" />
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
          ⚡ Auto-Certified by System Engine
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 1 }}>
          Variance was within the configured threshold — all approval stages completed automatically with full audit trail.
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Single tier node (handles both SEQ and PARALLEL)
// ─────────────────────────────────────────────────────────────

function TierNode({ tier, isFirst, isLast, isAuto }) {
  const { tier_index, approval_type, users, completed, active, parallel_done, parallel_total } = tier
  const isParallel = approval_type === 'PARALLEL' && users.length > 1

  const nodeColor = completed
    ? 'var(--ok)'
    : active
    ? 'var(--accent)'
    : 'var(--border-1)'

  const nodeBg = completed
    ? 'var(--ok)'
    : active
    ? 'var(--accent)18'
    : 'var(--surface-2)'

  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: isLast ? 0 : 1 }}>
      {/* Node */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>

        {/* Active pulsing ring */}
        {active && !isAuto && (
          <div style={{
            position: 'absolute',
            width: 44, height: 44, borderRadius: '50%',
            border: `2px solid var(--accent)`,
            animation: 'none',
            opacity: 0.4,
            top: -6,
          }} />
        )}

        {/* Main node circle — cluster for parallel */}
        {isParallel ? (
          <div style={{ position: 'relative', width: 44, height: 32, marginBottom: 6 }}>
            {/* User avatars stacked */}
            {users.slice(0, 3).map((u, i) => (
              <div
                key={u.id}
                title={`${u.username}${u.delegate_username ? ` → delegate: ${u.delegate_username}` : ''}`}
                style={{
                  position: 'absolute',
                  left: i * 10,
                  top: 0,
                  width: 28, height: 28,
                  borderRadius: '50%',
                  background: u.has_approved ? 'var(--ok)' : active ? 'var(--accent)18' : 'var(--surface-2)',
                  border: `2px solid ${u.has_approved ? 'var(--ok)' : nodeColor}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 3 - i,
                }}
              >
                {u.has_approved
                  ? <CheckCircle2 size={12} color="#fff" />
                  : <User size={10} color={active ? 'var(--accent)' : 'var(--text-disabled)'} />
                }
              </div>
            ))}
            {users.length > 3 && (
              <div style={{
                position: 'absolute', left: 30, top: 0,
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--surface-3)', border: `2px solid ${nodeColor}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', zIndex: 0,
              }}>
                +{users.length - 3}
              </div>
            )}
          </div>
        ) : (
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: completed ? nodeColor : nodeBg,
            border: `2px solid ${nodeColor}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 6,
          }}>
            {completed
              ? <CheckCircle2 size={14} color="#fff" />
              : active
              ? <Clock size={12} color="var(--accent)" />
              : <User size={12} color="var(--text-disabled)" />
            }
          </div>
        )}

        {/* Tier label */}
        <div style={{ textAlign: 'center', maxWidth: 80 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: nodeColor, whiteSpace: 'nowrap' }}>
            Tier {tier_index + 1}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
            {isParallel ? `PARALLEL (${parallel_done}/${parallel_total})` : 'SEQUENTIAL'}
          </div>
          {/* User names */}
          <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 2, maxWidth: 80 }}>
            {users.slice(0, 2).map(u => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 68 }}>
                  {u.delegate_username ? `${u.delegate_username}*` : u.username}
                </span>
              </div>
            ))}
            {users.length > 2 && (
              <div style={{ color: 'var(--text-tertiary)' }}>+{users.length - 2} more</div>
            )}
          </div>
          {/* Parallel quorum bar */}
          {isParallel && active && (
            <div style={{ marginTop: 4, width: 60, marginLeft: 'auto', marginRight: 'auto' }}>
              <div style={{ background: 'var(--border-1)', borderRadius: 99, height: 3, overflow: 'hidden' }}>
                <div style={{
                  height: 3, borderRadius: 99,
                  background: 'var(--accent)',
                  width: `${(parallel_done / Math.max(parallel_total, 1)) * 100}%`,
                  transition: 'width 0.3s',
                }} />
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 2 }}>
                {parallel_done}/{parallel_total} approved
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Connector line */}
      {!isLast && (
        <div style={{
          flex: 1, height: 2, margin: '0 4px',
          background: completed ? 'var(--ok)' : 'var(--border-1)',
          position: 'relative', top: -20,
        }}>
          <ArrowRight
            size={12}
            color={completed ? 'var(--ok)' : 'var(--border-1)'}
            style={{ position: 'absolute', right: -6, top: -5 }}
          />
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Dynamic chain stepper
// ─────────────────────────────────────────────────────────────

function ChainStepper({ chainStatus }) {
  if (!chainStatus) return null
  const { chain, status, auto_certified } = chainStatus

  // Fallback: no chain defined yet
  if (!chain || chain.length === 0) {
    return (
      <div style={{
        padding: '10px 14px', borderRadius: 8, marginBottom: 16,
        background: 'var(--surface-1)', border: '1px solid var(--border-0)',
        fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center',
      }}>
        No approval chain configured — using default single-approver flow.
      </div>
    )
  }

  // Fixed pipeline bookends: DRAFT + CERTIFIED
  const bookendStyle = (active) => ({
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  })

  const BookendNode = ({ label, done, icon: Icon, color }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%', marginBottom: 6,
        background: done ? color : 'var(--surface-2)',
        border: `2px solid ${done ? color : 'var(--border-1)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={14} color={done ? '#fff' : 'var(--text-disabled)'} />
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: done ? color : 'var(--text-disabled)' }}>
        {label}
      </div>
    </div>
  )

  const isDraft     = status === 'DRAFT' || status === 'REJECTED'
  const isCertified = ['CERTIFIED', 'CLOSED'].includes(status)

  return (
    <div style={{ marginBottom: 28 }}>
      {auto_certified && <AutoCertBanner />}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, overflowX: 'auto', paddingBottom: 8 }}>
        {/* DRAFT bookend */}
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <BookendNode label="Draft" done={!isDraft} icon={Send} color="var(--text-secondary)" />
          <div style={{ width: 20, height: 2, background: !isDraft ? 'var(--ok)' : 'var(--border-1)', position: 'relative', top: -10 }}>
            <ArrowRight size={10} color={!isDraft ? 'var(--ok)' : 'var(--border-1)'}
              style={{ position: 'absolute', right: -5, top: -4 }} />
          </div>
        </div>

        {/* Dynamic approval tiers */}
        {chain.map((tier, i) => (
          <TierNode
            key={i}
            tier={tier}
            isFirst={i === 0}
            isLast={i === chain.length - 1}
            isAuto={auto_certified}
          />
        ))}

        {/* CERTIFIED bookend */}
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ width: 20, height: 2, background: isCertified ? 'var(--ok)' : 'var(--border-1)', position: 'relative', top: -10 }}>
            <ArrowRight size={10} color={isCertified ? 'var(--ok)' : 'var(--border-1)'}
              style={{ position: 'absolute', right: -5, top: -4 }} />
          </div>
          <BookendNode label="Certified" done={isCertified} icon={Award} color="var(--ok)" />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// History timeline (unchanged from Phase 1)
// ─────────────────────────────────────────────────────────────

function HistoryTimeline({ history }) {
  if (!history || history.length === 0) return null

  return (
    <div style={{ border: '1px solid var(--border-0)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
      {history.map((entry, idx) => (
        <div
          key={entry.id || idx}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '9px 14px',
            borderBottom: idx < history.length - 1 ? '1px solid var(--border-0)' : 'none',
            background: entry.is_auto ? 'linear-gradient(90deg, #05966908 0%, transparent 100%)' : 'transparent',
          }}
        >
          {/* Icon */}
          <div style={{
            width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: entry.is_auto ? '#05966920'
              : entry.action === 'REJECT'   ? 'var(--bad)20'
              : entry.action === 'APPROVE' || entry.action === 'TIER_APPROVED' ? '#05996920'
              : entry.action === 'CERTIFY'  ? '#7C3AED20'
              : 'var(--accent)20',
            marginTop: 1,
          }}>
            {entry.is_auto                         && <Zap         size={11} color="#059669" />}
            {!entry.is_auto && entry.action === 'SUBMIT'          && <Send        size={11} color="var(--accent)" />}
            {!entry.is_auto && (entry.action === 'APPROVE' || entry.action === 'TIER_APPROVED') && <ThumbsUp size={11} color="#059669" />}
            {!entry.is_auto && entry.action === 'PARALLEL_APPROVE'&& <Users       size={11} color="#059669" />}
            {!entry.is_auto && entry.action === 'REJECT'          && <XCircle     size={11} color="var(--bad)" />}
            {!entry.is_auto && entry.action === 'CERTIFY'         && <Award       size={11} color="#7C3AED" />}
            {!entry.is_auto && entry.action === 'CLOSE'           && <Lock        size={11} color="var(--text-disabled)" />}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Title */}
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600 }}>
                {entry.is_auto ? `⚡ ${entry.action.replace('AUTO_', 'Auto-')}` : entry.action.replace(/_/g, ' ')}
              </span>
              <span style={{ color: 'var(--text-tertiary)' }}>·</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--text-secondary)' }}>
                <User size={10} />{entry.actor_name}
              </span>
              {entry.role && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99,
                  background: entry.role === 'SYSTEM' ? '#05996920' : 'var(--surface-3)',
                  color: entry.role === 'SYSTEM' ? '#059669' : 'var(--text-tertiary)',
                }}>{entry.role.toUpperCase()}</span>
              )}
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDate(entry.timestamp)}</span>
            </div>
            {/* Comment */}
            {entry.comment && (
              <p style={{
                margin: '3px 0 0', fontSize: 11, color: 'var(--text-secondary)',
                fontStyle: 'italic', lineHeight: 1.4,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                "{entry.comment}"
              </p>
            )}
          </div>

          {/* Status badge */}
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
            color: STATUS_COLOR[entry.to_status] || 'var(--text-tertiary)',
            background: `${STATUS_COLOR[entry.to_status] || '#888'}18`,
            border: `1px solid ${STATUS_COLOR[entry.to_status] || '#888'}33`,
            flexShrink: 0,
          }}>
            → {entry.to_status}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Action modal
// ─────────────────────────────────────────────────────────────

function ActionModal({ action, onClose, onConfirm, loading }) {
  const [comment, setComment] = useState('')
  const requiresComment = ['SUBMIT', 'REJECT'].includes(action)

  const meta = {
    SUBMIT:  { label: 'Submit for Review',  color: 'var(--accent)', icon: Send },
    APPROVE: { label: 'Approve',            color: '#059669',       icon: ThumbsUp },
    REJECT:  { label: 'Reject',             color: 'var(--bad)',    icon: ThumbsDown },
    CERTIFY: { label: 'Certify Balance',    color: '#7C3AED',       icon: Award },
  }[action] || { label: action, color: 'var(--accent)' }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--surface-0)', border: '1px solid var(--border-1)',
        borderRadius: 12, width: 460, maxWidth: '92vw', padding: 24,
      }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
          {meta.label}
        </h3>

        {action === 'CERTIFY' && (
          <div style={{
            background: '#7C3AED11', border: '1px solid #7C3AED33',
            borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 11, color: '#7C3AED',
            display: 'flex', gap: 6,
          }}>
            <Lock size={12} style={{ flexShrink: 0, marginTop: 1 }} />
            This balance will be immutably locked after certification.
          </div>
        )}

        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
          Comment{requiresComment ? <span style={{ color: 'var(--bad)' }}> *</span> : ' (optional)'}
        </label>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          rows={3}
          placeholder={
            action === 'SUBMIT'  ? 'Describe what was prepared. Reference supporting evidence…'
            : action === 'REJECT' ? 'Explain what needs to be corrected…'
            : 'Optional notes…'
          }
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '8px 10px', fontSize: 12, borderRadius: 8, resize: 'vertical',
            border: '1px solid var(--border-1)', background: 'var(--surface-2)',
            color: 'var(--text-primary)', fontFamily: 'inherit',
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button
            onClick={onClose}
            style={{
              height: 32, padding: '0 14px', fontSize: 12, cursor: 'pointer',
              background: 'none', border: '1px solid var(--border-1)',
              borderRadius: 6, color: 'var(--text-secondary)',
            }}
          >Cancel</button>
          <button
            onClick={() => onConfirm(comment)}
            disabled={loading || (requiresComment && !comment.trim())}
            style={{
              height: 32, padding: '0 18px', fontSize: 12, fontWeight: 600,
              background: meta.color, border: 'none', borderRadius: 6, color: '#fff',
              cursor: loading || (requiresComment && !comment.trim()) ? 'not-allowed' : 'pointer',
              opacity: loading || (requiresComment && !comment.trim()) ? 0.5 : 1,
            }}
          >{loading ? 'Processing…' : meta.label}</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Immutability banner
// ─────────────────────────────────────────────────────────────

function ImmutabilityBanner({ status }) {
  if (!['CERTIFIED', 'CLOSED'].includes(status)) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 14px', borderRadius: 8, marginBottom: 16,
      background: status === 'CERTIFIED' ? '#7C3AED11' : 'var(--surface-2)',
      border: `1px solid ${status === 'CERTIFIED' ? '#7C3AED33' : 'var(--border-0)'}`,
    }}>
      <Lock size={13} color={status === 'CERTIFIED' ? '#7C3AED' : 'var(--text-disabled)'} />
      <span style={{ fontSize: 12, color: status === 'CERTIFIED' ? '#7C3AED' : 'var(--text-disabled)' }}>
        {status === 'CERTIFIED'
          ? 'Certified and immutably locked — all fields are read-only.'
          : 'Closed — no further modifications permitted.'}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Main panel
// ─────────────────────────────────────────────────────────────

export default function WorkflowLifecyclePanel({ balance, profile }) {
  const user   = useAuthStore(s => s.user)
  const role   = normalizeRole(user?.role)
  const qc     = useQueryClient()
  const [modal, setModal] = useState(null)

  const balanceId = balance?.id
  const status    = balance?.status || 'DRAFT'
  const isLocked  = LOCKED_STATES.includes(status)
  const isAdmin   = role === 'admin'

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['lifecycle-history', balanceId] })
    qc.invalidateQueries({ queryKey: ['chain-status',      balanceId] })
    qc.invalidateQueries({ queryKey: ['balances'] })
  }

  // Fetch history
  const historyQuery = useQuery({
    queryKey: ['lifecycle-history', balanceId],
    queryFn:  () => lifecycleAPI.history(balanceId),
    enabled:  Boolean(balanceId),
  })

  // Fetch chain status (Phase 2)
  const chainQuery = useQuery({
    queryKey: ['chain-status', balanceId],
    queryFn:  () => lifecycleAPI.chainStatus(balanceId),
    enabled:  Boolean(balanceId),
  })

  // Transition mutation
  const transitionMutation = useMutation({
    mutationFn: ({ action, comment }) => ({
      SUBMIT:  () => lifecycleAPI.submit(balanceId,  comment),
      APPROVE: () => lifecycleAPI.approve(balanceId, comment),
      REJECT:  () => lifecycleAPI.reject(balanceId,  comment),
      CERTIFY: () => lifecycleAPI.certify(balanceId, comment),
    }[action]()),
    onSuccess: (data, vars) => {
      const isAutoResult = data?.auto_certified
      const labels = {
        SUBMIT:  isAutoResult ? '⚡ Auto-certified successfully' : 'Submitted for review',
        APPROVE: data?.action === 'TIER_APPROVED' ? `Tier ${(data.completed_tier ?? 0) + 1} approved — next tier notified` : 'Approved',
        REJECT:  'Rejected — returned to preparer',
        CERTIFY: 'Balance certified',
      }
      toast.success(labels[vars.action] || 'Done')
      setModal(null)
      refresh()
    },
    onError: (err) => toast.error(err?.response?.data?.detail || 'Transition failed'),
  })

  // ── Conditional button logic ──
  const chainStatus  = chainQuery.data
  const autoCertified = chainStatus?.auto_certified || balance?.auto_certified

  // Determine if current user is in the ACTIVE tier of the chain
  const isInActiveTier = (() => {
    if (!chainStatus?.chain) return false
    const activeTier = chainStatus.chain.find(t => t.active)
    if (!activeTier) return false
    return activeTier.users.some(u => u.id === user?.id || u.delegate_id === user?.id)
  })()

  const isAssignedPreparer  = profile?.assigned_preparer  === user?.id
  const isAssignedCertifier = profile?.assigned_certifier === user?.id

  const showSubmit  = (isAssignedPreparer || isAdmin) && ['DRAFT', 'REJECTED'].includes(status)
  const showApprove = (isInActiveTier || isAdmin) && status === 'UNDER_REVIEW'
  const showReject  = (['reviewer','approver','certifier'].includes(role) || isAdmin)
                      && ['UNDER_REVIEW','APPROVED'].includes(status)
  const showCertify = (isAssignedCertifier || isAdmin) && status === 'APPROVED'

  if (!balanceId) return null

  return (
    <div style={{ marginBottom: 24 }}>
      <ImmutabilityBanner status={status} />

      {/* Dynamic chain stepper */}
      <ChainStepper chainStatus={chainStatus} />

      {/* History timeline */}
      <HistoryTimeline history={historyQuery.data || []} />

      {/* Action buttons */}
      {!isLocked && (showSubmit || showApprove || showReject || showCertify) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 12, borderTop: '1px solid var(--border-0)' }}>
          {showSubmit  && (
            <button onClick={() => setModal('SUBMIT')} style={btnStyle('var(--accent)')}>
              <Send size={12} /> Submit for Review
            </button>
          )}
          {showApprove && (
            <button onClick={() => setModal('APPROVE')} style={btnStyle('#059669')}>
              <ThumbsUp size={12} />
              {chainStatus?.chain?.find(t => t.active)?.approval_type === 'PARALLEL'
                ? 'Approve (Parallel)' : 'Approve'}
            </button>
          )}
          {showReject  && (
            <button onClick={() => setModal('REJECT')} style={btnStyleOutline('var(--bad)')}>
              <ThumbsDown size={12} /> Reject
            </button>
          )}
          {showCertify && (
            <button onClick={() => setModal('CERTIFY')} style={btnStyle('#7C3AED')}>
              <Award size={12} /> Certify Balance
            </button>
          )}
        </div>
      )}

      {/* Rejection notice */}
      {status === 'REJECTED' && balance?.rejection_comment && (
        <div style={{ display: 'flex', gap: 8, padding: '10px 14px', background: 'var(--bad)11', border: '1px solid var(--bad)33', borderRadius: 8, marginTop: 8 }}>
          <AlertTriangle size={14} color="var(--bad)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--bad)', marginBottom: 2 }}>
              Rejected — revision required. Approval chain reset to Tier 1.
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{balance.rejection_comment}</div>
          </div>
        </div>
      )}

      {modal && (
        <ActionModal
          action={modal}
          loading={transitionMutation.isPending}
          onClose={() => setModal(null)}
          onConfirm={(comment) => transitionMutation.mutate({ action: modal, comment })}
        />
      )}
    </div>
  )
}

// Button style helpers
const btnStyle = (color) => ({
  display: 'flex', alignItems: 'center', gap: 6,
  height: 32, padding: '0 14px', fontSize: 12, fontWeight: 600,
  background: color, border: 'none', borderRadius: 6,
  color: '#fff', cursor: 'pointer',
})
const btnStyleOutline = (color) => ({
  display: 'flex', alignItems: 'center', gap: 6,
  height: 32, padding: '0 14px', fontSize: 12, fontWeight: 600,
  background: 'none', border: `1px solid ${color}`,
  borderRadius: 6, color: color, cursor: 'pointer',
})

// Export lock helper (unchanged API)
export function isBalanceLocked(status) {
  return ['UNDER_REVIEW', 'APPROVED', 'CERTIFIED', 'CLOSED'].includes(status)
}
