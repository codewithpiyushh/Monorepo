// frontend/src/pages/EscalationWorkbench.jsx
//
// Escalation Workbench — Phase 2, Chunk 4, Part 6.
// Admin dedicated page (also usable by other roles, scoped automatically
// by the backend RBAC rules in sla_router.py). Violations grid + per-
// violation escalation history timeline + current owner + level +
// acknowledge / resolve / override actions, RBAC-gated to match the
// router rules exactly.

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  GitBranch, CheckCircle2, ShieldCheck, ChevronRight, Sliders, User as User2,
} from 'lucide-react'
import slaAPI from '../api/slaAPI'
import { useAuthStore } from '../store/authStore'
import { normalizeRole } from '../utils/roles'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, LoadingState, ErrorState } from '../components/ui/PageState'

const C = { accent: '#6366f1', ok: '#22c55e', warn: '#f59e0b', bad: '#ef4444', orange: '#f97316', muted: '#64748b' }

const LEVEL_META = {
  1: { label: 'Level 1 — Notified',   color: C.warn },
  2: { label: 'Level 2 — Reminder',   color: C.orange },
  3: { label: 'Level 3 — Reassigned', color: C.bad },
}
const STATUS_COLOR = { OPEN: C.bad, ACKNOWLEDGED: C.warn, RESOLVED: C.ok }

function fmtDateTime(s) {
  if (!s) return '—'
  try { return new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }
  catch { return s }
}

// ── Endpoint picker by role — mirrors sla_router.py RBAC scoping exactly ──
function endpointForRole(role) {
  if (role === 'admin') return slaAPI.listAllViolations
  if (role === 'certifier') return slaAPI.listEnterpriseViolations
  if (role === 'approver') return slaAPI.listTeamViolations
  return slaAPI.listMyViolations
}

function EscalationTimeline({ violation }) {
  const steps = [1, 2, 3]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {steps.map((lvl) => {
        const reached = violation.escalation_level >= lvl
        const isCurrent = violation.escalation_level === lvl
        const meta = LEVEL_META[lvl]
        return (
          <div key={lvl} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: reached ? meta.color : 'var(--surface-3)',
              border: `1px solid ${reached ? meta.color : 'var(--border-1)'}`,
              color: reached ? '#fff' : 'var(--text-tertiary)', fontSize: 10, fontWeight: 700,
            }}>
              {reached && violation.escalation_level > lvl ? <CheckCircle2 size={11} /> : lvl}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: isCurrent ? 700 : 500, color: reached ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                {meta.label}
              </div>
              {isCurrent && violation.last_escalated_at && (
                <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
                  {fmtDateTime(violation.last_escalated_at)}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function OverrideForm({ violation, onClose, onSaved }) {
  const [level, setLevel] = useState(violation.escalation_level)
  const [status, setStatus] = useState(violation.escalation_status)
  const [note, setNote] = useState('')

  const mut = useMutation({
    mutationFn: () => slaAPI.override(violation.id, { escalation_level: level, escalation_status: status, note }),
    onSuccess: () => { toast.success('Violation overridden.'); onSaved() },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Override failed.'),
  })

  return (
    <div style={{ marginTop: 12, padding: 12, background: 'var(--surface-0)', border: '1px solid var(--border-1)', borderRadius: 8 }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <label style={{ flex: 1, fontSize: 10.5, color: 'var(--text-tertiary)' }}>
          Escalation Level
          <select value={level} onChange={e => setLevel(Number(e.target.value))}
            style={{ width: '100%', marginTop: 4, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-1)', background: 'var(--surface-1)', color: 'var(--text-primary)', fontSize: 11.5 }}>
            {[1, 2, 3].map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <label style={{ flex: 1, fontSize: 10.5, color: 'var(--text-tertiary)' }}>
          Escalation Status
          <select value={status} onChange={e => setStatus(e.target.value)}
            style={{ width: '100%', marginTop: 4, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-1)', background: 'var(--surface-1)', color: 'var(--text-primary)', fontSize: 11.5 }}>
            {['NONE', 'LEVEL_1_NOTIFIED', 'LEVEL_2_NOTIFIED', 'LEVEL_3_REASSIGNED', 'RESOLVED'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <textarea
        value={note} onChange={e => setNote(e.target.value)} placeholder="Override reason (audit note)…"
        style={{ width: '100%', minHeight: 50, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-1)', background: 'var(--surface-1)', color: 'var(--text-primary)', fontSize: 11.5, marginBottom: 8 }}
      />
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button className="btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn-primary btn-sm" disabled={mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? 'Saving…' : 'Apply Override'}
        </button>
      </div>
    </div>
  )
}

function ViolationDetail({ violation, role, currentUserId, onChanged }) {
  const [showOverride, setShowOverride] = useState(false)

  const ackMut = useMutation({
    mutationFn: () => slaAPI.acknowledge(violation.id, null),
    onSuccess: () => { toast.success('Acknowledged.'); onChanged() },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Failed to acknowledge.'),
  })
  const resolveMut = useMutation({
    mutationFn: () => slaAPI.resolve(violation.id, null),
    onSuccess: () => { toast.success('Violation resolved.'); onChanged() },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Failed to resolve.'),
  })

  const canAcknowledge = violation.status === 'OPEN' && (role === 'admin' || violation.current_owner_id === currentUserId)
  const canResolve = role === 'admin'
  const canOverride = role === 'admin'

  return (
    <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border-0)', borderRadius: 12, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{violation.profile_name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Balance #{violation.balance_id} · {violation.violation_type.replace(/_/g, ' ')}
          </div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
          color: STATUS_COLOR[violation.status], background: `${STATUS_COLOR[violation.status]}18`,
        }}>
          {violation.status}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div style={{ padding: '10px 12px', background: 'var(--surface-0)', borderRadius: 8 }}>
          <div style={{ fontSize: 9.5, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Current Owner</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
            <User2 size={13} /> {violation.current_owner_name || `User #${violation.current_owner_id || '—'}`}
          </div>
        </div>
        <div style={{ padding: '10px 12px', background: 'var(--surface-0)', borderRadius: 8 }}>
          <div style={{ fontSize: 9.5, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Days Overdue</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.bad, marginTop: 2 }}>{violation.days_overdue} days</div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
          <GitBranch size={12} style={{ marginRight: 6, verticalAlign: -2 }} /> Escalation History
        </div>
        <EscalationTimeline violation={violation} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {canAcknowledge && (
          <button className="btn-secondary btn-sm" disabled={ackMut.isPending} onClick={() => ackMut.mutate()}>
            <CheckCircle2 size={12} /> Acknowledge
          </button>
        )}
        {canResolve && (
          <button className="btn-secondary btn-sm" disabled={resolveMut.isPending} onClick={() => resolveMut.mutate()}>
            <ShieldCheck size={12} /> Force Resolve
          </button>
        )}
        {canOverride && (
          <button className="btn-secondary btn-sm" onClick={() => setShowOverride(s => !s)}>
            <Sliders size={12} /> Override
          </button>
        )}
        {!canAcknowledge && !canResolve && !canOverride && (
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>No actions available for your role on this violation.</span>
        )}
      </div>

      {showOverride && (
        <OverrideForm violation={violation} onClose={() => setShowOverride(false)} onSaved={() => { setShowOverride(false); onChanged() }} />
      )}
    </div>
  )
}

export default function EscalationWorkbench() {
  const { user } = useAuthStore()
  const role = normalizeRole(user?.role)
  const [selectedId, setSelectedId] = useState(null)

  const violationsQ = useQuery({
    queryKey: ['escalation-workbench', role],
    queryFn: endpointForRole(role),
  })

  const violations = violationsQ.data?.violations || []
  const selected = violations.find(v => v.id === selectedId) || violations[0] || null

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1300, margin: '0 auto' }}>
      <PageHeader
        title="Escalation Workbench"
        subtitle="Per-violation escalation history, current ownership, and resolution actions"
        icon={<GitBranch size={22} />}
      />

      <div style={{ marginTop: 20 }}>
        {violationsQ.isLoading && <LoadingState message="Loading violations…" />}
        {violationsQ.isError && <ErrorState message="Failed to load violations" onRetry={violationsQ.refetch} />}

        {!violationsQ.isLoading && !violations.length && (
          <EmptyState title="No violations to display" description="Nothing currently breaching SLA within your scope." />
        )}

        {violations.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 18 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 640, overflowY: 'auto' }}>
              {violations.map(v => (
                <div
                  key={v.id}
                  onClick={() => setSelectedId(v.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', cursor: 'pointer',
                    background: (selected?.id === v.id) ? 'var(--surface-2)' : 'var(--surface-1)',
                    border: `1px solid ${(selected?.id === v.id) ? 'var(--border-2)' : 'var(--border-0)'}`,
                    borderRadius: 9,
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: LEVEL_META[v.escalation_level]?.color || C.muted }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {v.profile_name}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{v.days_overdue}d overdue · L{v.escalation_level}</div>
                  </div>
                  <ChevronRight size={13} color="var(--text-tertiary)" />
                </div>
              ))}
            </div>

            <div>
              {selected ? (
                <ViolationDetail
                  violation={selected} role={role} currentUserId={user?.id}
                  onChanged={() => violationsQ.refetch()}
                />
              ) : (
                <EmptyState title="Select a violation" description="Choose a violation from the list to see its escalation history." />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
