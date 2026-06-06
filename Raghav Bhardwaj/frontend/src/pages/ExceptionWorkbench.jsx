/**
 * ExceptionWorkbench — unified, enterprise-driven exception management
 * Replaces both the old ExceptionWorkbench and ExceptionOpsPage.
 * Single source of truth: /enterprise/exceptions/with-profile
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  AlertTriangle, CheckCircle2, Clock, Zap,
  ChevronDown, ChevronUp, X, RefreshCw, User,
} from 'lucide-react'
import { enterpriseAPI, authAPI } from '../api'
import { advancedAPI } from '../api'
import { useAuthStore } from '../store/authStore'
import { normalizeRole } from '../utils/roles'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, LoadingState } from '../components/ui/PageState'

// ── Constants ─────────────────────────────────────────────────
const STATUS_META = {
  OPEN:        { color: 'var(--bad)',           label: 'Open' },
  IN_PROGRESS: { color: 'var(--warn)',          label: 'In Progress' },
  ESCALATED:   { color: '#c026d3',              label: 'Escalated' },
  RESOLVED:    { color: 'var(--ok)',            label: 'Resolved' },
  CLOSED:      { color: 'var(--text-disabled)', label: 'Closed' },
}
const CLASS_META = {
  DATA_ISSUE:    { color: 'var(--bad)',    label: 'Data Issue' },
  PROCESS_ISSUE: { color: 'var(--warn)',   label: 'Process Issue' },
  POLICY_RISK:   { color: '#c026d3',       label: 'Policy Risk' },
  OTHER:         { color: 'var(--accent)', label: 'Other' },
}
const QUEUE_TYPES = ['exception', 'unresolved', 'assigned', 'escalated']
const STATUS_FILTERS = ['', 'OPEN', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'CLOSED']

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { color: 'var(--text-tertiary)', label: status || '—' }
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 9999,
      border: `1px solid ${m.color}33`, color: m.color, background: `${m.color}14`,
    }}>{m.label}</span>
  )
}

function ClassBadge({ cls }) {
  const m = CLASS_META[cls] || { color: 'var(--text-tertiary)', label: cls || '—' }
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 9999,
      border: `1px solid ${m.color}22`, color: m.color, background: `${m.color}10`,
    }}>{m.label}</span>
  )
}

// ── Exception Detail Panel ────────────────────────────────────
function ExceptionDetail({ exc, users, role, onClose, onUpdate }) {
  const [comment,     setComment]     = useState('')
  const [assignTo,    setAssignTo]    = useState(String(exc.assigned_to || ''))
  const [resolution,  setResolution]  = useState(exc.resolution_notes || '')
  const [classification, setClassification] = useState(exc.classification || '')
  const [saving, setSaving] = useState(false)

  const canAssign   = ['admin'].includes(role)
  const canResolve  = ['admin', 'reviewer', 'approver'].includes(role)
  const canEscalate = ['admin', 'reviewer'].includes(role)

  const handleAction = async (action) => {
    setSaving(true)
    try {
      const payload = { exception_id: exc.id, comments: comment }
      if (action === 'assign')   { await enterpriseAPI.assignException({ ...payload, assigned_to: Number(assignTo) }); toast.success('Assigned') }
      if (action === 'submit')   { await enterpriseAPI.submitException(payload);  toast.success('Submitted') }
      if (action === 'approve')  { await enterpriseAPI.approveException({ ...payload, resolution_notes: resolution }); toast.success('Approved') }
      if (action === 'reject')   { await enterpriseAPI.rejectException(payload);  toast.success('Rejected') }
      if (action === 'escalate') { await enterpriseAPI.escalateException(payload); toast.success('Escalated') }
      if (action === 'classify') { await enterpriseAPI.classifyException({ exception_id: exc.id, classification, comments: comment }); toast.success('Classified') }
      onUpdate()
    } catch (e) {
      toast.error(e?.response?.data?.detail || `${action} failed`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: 'var(--surface-1)', border: '1px solid var(--border-1)',
        borderRadius: 14, width: '100%', maxWidth: 520,
        maxHeight: '90vh', overflow: 'auto', padding: 24,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'var(--text-tertiary)' }}>
              Exception #{exc.id}
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
              <StatusBadge status={exc.status} />
              {exc.classification && <ClassBadge cls={exc.classification} />}
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{exc.queue_type}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Profile link */}
        {exc.profile_name && (
          <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: 'var(--text-secondary)' }}>
            Profile: <strong style={{ color: 'var(--text-primary)' }}>{exc.profile_name}</strong>
            {exc.mg_variance > 0 && <span style={{ color: 'var(--warn)', marginLeft: 12 }}>Variance: ${Number(exc.mg_variance).toFixed(2)}</span>}
          </div>
        )}

        {/* Comments history */}
        {exc.comments && (
          <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: 'var(--text-secondary)', borderLeft: '3px solid var(--accent)' }}>
            <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4 }}>Existing comments</p>
            {exc.comments}
          </div>
        )}

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label className="label">Comment / Note</label>
            <textarea className="input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment for this action…" style={{ resize: 'vertical' }} />
          </div>

          {canAssign && (
            <div>
              <label className="label">Assign To</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select className="input text-xs flex-1" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
                  <option value="">Select user…</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.username} ({u.role})</option>)}
                </select>
                <button className="btn-secondary text-xs h-[38px]" disabled={saving || !assignTo}
                  onClick={() => handleAction('assign')}>
                  <User style={{ width: 11, height: 11 }} /> Assign
                </button>
              </div>
            </div>
          )}

          {canResolve && (
            <div>
              <label className="label">Resolution Notes</label>
              <textarea className="input" rows={2} value={resolution} onChange={(e) => setResolution(e.target.value)}
                placeholder="Describe how this exception was resolved…" style={{ resize: 'vertical' }} />
            </div>
          )}

          <div>
            <label className="label">Classification</label>
            <select className="input text-xs" value={classification} onChange={(e) => setClassification(e.target.value)}>
              <option value="">Unclassified</option>
              <option value="DATA_ISSUE">Data Issue</option>
              <option value="PROCESS_ISSUE">Process Issue</option>
              <option value="POLICY_RISK">Policy Risk</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          {['preparer', 'admin'].includes(role) && (
            <button className="btn-secondary text-xs" disabled={saving} onClick={() => handleAction('submit')}>Submit</button>
          )}
          {canResolve && (
            <button className="btn-primary text-xs" disabled={saving} onClick={() => handleAction('approve')}>
              <CheckCircle2 style={{ width: 11, height: 11 }} /> Resolve
            </button>
          )}
          {canResolve && (
            <button className="btn-secondary text-xs" disabled={saving} onClick={() => handleAction('reject')}>Reject</button>
          )}
          {canEscalate && (
            <button className="btn-secondary text-xs" disabled={saving}
              style={{ color: '#c026d3', borderColor: '#c026d333' }}
              onClick={() => handleAction('escalate')}>Escalate</button>
          )}
          {classification && (
            <button className="btn-ghost text-xs" disabled={saving} onClick={() => handleAction('classify')}>Save Classification</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Exception Row ─────────────────────────────────────────────
function ExcRow({ exc, onOpen }) {
  const statusMeta = STATUS_META[exc.status] || { color: 'var(--text-tertiary)' }
  const daysOpen = exc.created_at
    ? Math.floor((Date.now() - new Date(exc.created_at).getTime()) / 86400000)
    : null

  return (
    <tr style={{ cursor: 'pointer' }} onClick={() => onOpen(exc)}>
      <td style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, fontWeight: 600 }}>#{exc.id}</td>
      <td><StatusBadge status={exc.status} /></td>
      <td>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', background: 'var(--surface-3)',
          padding: '2px 6px', borderRadius: 4 }}>{exc.queue_type}</span>
      </td>
      <td style={{ fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: 'var(--text-secondary)' }}>
        {exc.profile_name || '—'}
      </td>
      <td>{exc.classification && <ClassBadge cls={exc.classification} />}</td>
      <td style={{ fontSize: 11, color: exc.mg_variance > 0 ? 'var(--warn)' : 'var(--text-tertiary)', fontWeight: exc.mg_variance > 0 ? 600 : 400 }}>
        {exc.mg_variance > 0 ? `$${Number(exc.mg_variance).toFixed(2)}` : '—'}
      </td>
      <td style={{ fontSize: 11, color: daysOpen > 7 ? 'var(--bad)' : daysOpen > 3 ? 'var(--warn)' : 'var(--text-tertiary)' }}>
        {daysOpen !== null ? `${daysOpen}d` : '—'}
      </td>
      <td style={{ fontSize: 11, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: 'var(--text-tertiary)' }}>
        {exc.comments || '—'}
      </td>
    </tr>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function ExceptionWorkbench() {
  const navigate    = useNavigate()
  const qc          = useQueryClient()
  const user        = useAuthStore((s) => s.user)
  const role        = normalizeRole(user?.role)

  const [queueFilter,  setQueueFilter]  = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search,       setSearch]       = useState('')
  const [selectedExc,  setSelectedExc]  = useState(null)

  const { data: exceptions = [], isLoading, refetch } = useQuery({
    queryKey: ['exceptions-with-profile', queueFilter, statusFilter],
    queryFn: () => advancedAPI.exceptionsWithProfile({
      ...(queueFilter  ? { queue_type: queueFilter }  : {}),
      ...(statusFilter ? { status: statusFilter }       : {}),
    }),
    refetchInterval: 15000,
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users-list'],
    queryFn: authAPI.listUsers,
  })

  const filtered = useMemo(() => {
    if (!search.trim()) return exceptions
    const q = search.toLowerCase()
    return exceptions.filter((e) =>
      String(e.id).includes(q) ||
      (e.profile_name || '').toLowerCase().includes(q) ||
      (e.comments || '').toLowerCase().includes(q) ||
      (e.classification || '').toLowerCase().includes(q)
    )
  }, [exceptions, search])

  // KPIs
  const kpis = useMemo(() => {
    const open      = exceptions.filter((e) => e.status === 'OPEN').length
    const inProg    = exceptions.filter((e) => e.status === 'IN_PROGRESS').length
    const escalated = exceptions.filter((e) => e.status === 'ESCALATED').length
    const resolved  = exceptions.filter((e) => e.status === 'RESOLVED').length
    const highVar   = exceptions.filter((e) => (e.mg_variance || 0) > 10000).length
    return { total: exceptions.length, open, inProg, escalated, resolved, highVar }
  }, [exceptions])

  const handleUpdate = () => {
    qc.invalidateQueries({ queryKey: ['exceptions-with-profile'] })
    setSelectedExc(null)
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Exception Workbench"
        subtitle="Investigate, assign, escalate and resolve reconciliation exceptions."
        badge={`${kpis.open} open`}
        actions={
          <button className="btn-secondary text-xs h-8" onClick={() => refetch()}>
            <RefreshCw style={{ width: 12, height: 12 }} /> Refresh
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-5 space-y-4" style={{ background: 'var(--surface-0)' }}>

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10 }}>
          {[
            ['Total',     kpis.total,     'var(--accent)'],
            ['Open',      kpis.open,      'var(--bad)'],
            ['In Progress', kpis.inProg,  'var(--warn)'],
            ['Escalated', kpis.escalated, '#c026d3'],
            ['Resolved',  kpis.resolved,  'var(--ok)'],
            ['High Variance', kpis.highVar, 'var(--warn)'],
          ].map(([label, val, color]) => (
            <div key={label} style={{
              background: 'var(--surface-2)', border: '1px solid var(--border-1)',
              borderRadius: 10, padding: '10px 14px',
            }}>
              <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{label}</p>
              <p style={{ fontSize: 22, fontWeight: 700, color }}>{val}</p>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="input h-8 text-xs w-48" placeholder="Search exceptions…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input h-8 text-xs" value={queueFilter} onChange={(e) => setQueueFilter(e.target.value)}>
            <option value="">All Queues</option>
            {QUEUE_TYPES.map((q) => <option key={q} value={q}>{q}</option>)}
          </select>
          <select className="input h-8 text-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {STATUS_FILTERS.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {(queueFilter || statusFilter || search) && (
            <button className="btn-ghost text-xs h-8"
              onClick={() => { setQueueFilter(''); setStatusFilter(''); setSearch('') }}>
              Clear
            </button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-tertiary)' }}>
            {filtered.length} of {exceptions.length}
          </span>
        </div>

        {/* Table */}
        {isLoading ? <LoadingState /> : filtered.length === 0 ? (
          <EmptyState title="No exceptions" description="Adjust filters or run matching to generate exceptions." />
        ) : (
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden' }}>
            <table className="data-table" style={{ borderRadius: 0 }}>
              <thead>
                <tr>
                  <th>ID</th><th>Status</th><th>Queue</th><th>Profile</th>
                  <th>Classification</th><th>Variance</th><th>Age</th><th>Comments</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((exc) => (
                  <ExcRow key={exc.id} exc={exc} onOpen={setSelectedExc} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedExc && (
        <ExceptionDetail
          exc={selectedExc}
          users={users}
          role={role}
          onClose={() => setSelectedExc(null)}
          onUpdate={handleUpdate}
        />
      )}
    </div>
  )
}
