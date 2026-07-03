import { useState, useMemo, useCallback, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  CheckCheck, XCircle, RotateCcw, Lock, UserCheck, Download,
  Search, Filter, RefreshCw, ChevronDown, ChevronUp, AlertTriangle,
  CheckCircle2, Clock, Archive, Layers, X, Users, FileSpreadsheet,
  TrendingUp, ShieldAlert, Eye,
} from 'lucide-react'
import { bulkAPI } from '../api'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STATE_META = {
  OPEN:         { color: '#94A3B8', bg: '#94A3B814' },
  PREPARED:     { color: '#60A5FA', bg: '#60A5FA14' },
  SUBMITTED:    { color: '#FBBF24', bg: '#FBBF2414' },
  UNDER_REVIEW: { color: '#F97316', bg: '#F9731614' },
  REVIEWED:     { color: '#A78BFA', bg: '#A78BFA14' },
  APPROVED:     { color: '#34D399', bg: '#34D39914' },
  CERTIFIED:    { color: '#00C891', bg: '#00C89118' },
  CLOSED:       { color: '#6B7280', bg: '#6B728014' },
  FORCE_CLOSED: { color: '#EF4444', bg: '#EF444414' },
}
const RISK_META = {
  HIGH:     { color: '#EF4444', bg: '#EF444414' },
  MEDIUM:   { color: '#FBBF24', bg: '#FBBF2414' },
  LOW:      { color: '#34D399', bg: '#34D39914' },
  CRITICAL: { color: '#c026d3', bg: '#c026d314' },
}

const PROFILE_ACTIONS = [
  { id: 'APPROVE',  label: 'Approve',  icon: CheckCircle2, color: '#34D399', roles: ['admin','approver'], help: 'Move selected to APPROVED state' },
  { id: 'CERTIFY',  label: 'Certify',  icon: Lock,         color: '#00C891', roles: ['admin','certifier'], help: 'Certify selected profiles' },
  { id: 'RETURN',   label: 'Return',   icon: RotateCcw,    color: '#FBBF24', roles: ['admin','approver'], help: 'Return to preparer for rework' },
  { id: 'CLOSE',    label: 'Close',    icon: Archive,       color: '#6B7280', roles: ['admin'], help: 'Close certified profiles' },
  { id: 'REOPEN',   label: 'Reopen',  icon: RefreshCw,    color: '#A78BFA', roles: ['admin'], help: 'Force-reopen to OPEN state' },
  { id: 'ASSIGN',   label: 'Reassign', icon: UserCheck,    color: '#60A5FA', roles: ['admin','approver','preparer'], help: 'Assign to a different user' },
]

const ROOT_CAUSES = [
  'TIMING_DIFFERENCE','DUPLICATE','SYSTEM_ERROR',
  'MANUAL_ERROR','FX_ROUNDING','POLICY_GAP',
  'DATA_QUALITY','AWAITING_CONFIRMATION','OTHER',
]

const TABS = [
  { id: 'profiles',   label: 'Profile Actions',   icon: Layers },
  { id: 'exceptions', label: 'Exception Actions',  icon: AlertTriangle },
]

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function Badge({ label, color = '#94A3B8', bg }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 9999,
      background: bg || `${color}18`, border: `1px solid ${color}33`, color,
      display: 'inline-block', whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

function KpiBar({ summary }) {
  if (!summary) return null
  const s = summary.by_state || {}
  const total = summary.total || 0
  const segments = [
    { key: 'CERTIFIED', label: 'Certified', color: '#00C891' },
    { key: 'APPROVED',  label: 'Approved',  color: '#34D399' },
    { key: 'SUBMITTED', label: 'Submitted', color: '#FBBF24' },
    { key: 'PREPARED',  label: 'Prepared',  color: '#60A5FA' },
    { key: 'OPEN',      label: 'Open',      color: '#94A3B8' },
  ]
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'stretch' }}>
      {segments.map(({ key, label, color }) => {
        const count = s[key] || 0
        const pct   = total ? Math.round(count / total * 100) : 0
        return (
          <div key={key} style={{
            flex: 1, minWidth: 110, background: 'var(--surface-2)', border: '1px solid var(--border-2)',
            borderRadius: 10, padding: '12px 14px', borderTop: `3px solid ${color}`,
          }}>
            <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</p>
            <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{count}</p>
            <p style={{ margin: '2px 0 0', fontSize: 9, color: 'var(--text-tertiary)' }}>{pct}% of total</p>
          </div>
        )
      })}
      <div style={{ flex: 1, minWidth: 110, background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 10, padding: '12px 14px', borderTop: '3px solid #EF4444' }}>
        <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Open Exceptions</p>
        <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: summary.open_exceptions > 0 ? '#EF4444' : '#00C891', lineHeight: 1 }}>{summary.open_exceptions}</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile row checkbox table
// ─────────────────────────────────────────────────────────────────────────────

function ProfileRow({ profile, selected, onToggle }) {
  const isSelected = selected.has(profile.id)
  const sm = STATE_META[profile.lifecycle_state] || STATE_META.OPEN
  const rm = RISK_META[profile.risk_classification] || {}
  return (
    <tr
      onClick={() => onToggle(profile.id)}
      style={{
        cursor: 'pointer',
        background: isSelected ? '#FFE60008' : 'transparent',
        borderBottom: '1px solid var(--border-0)',
        transition: 'background 80ms',
      }}
    >
      <td style={{ padding: '8px 12px', width: 36 }}>
        <input
          type="checkbox" checked={isSelected}
          onChange={() => onToggle(profile.id)}
          onClick={e => e.stopPropagation()}
          style={{ width: 14, height: 14, accentColor: '#FFE600', cursor: 'pointer' }}
        />
      </td>
      <td style={{ padding: '8px 12px', fontSize: 11, fontFamily: 'monospace', color: 'var(--text-tertiary)' }}>#{profile.id}</td>
      <td style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {profile.name}
      </td>
      <td style={{ padding: '8px 12px' }}>
        <Badge label={profile.lifecycle_state || 'OPEN'} color={sm.color} bg={sm.bg} />
      </td>
      <td style={{ padding: '8px 12px' }}>
        {profile.risk_classification && <Badge label={profile.risk_classification} color={rm.color} bg={rm.bg} />}
      </td>
      <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-secondary)' }}>
        {profile.reconciliation_type?.replace(/_/g, ' ') || '—'}
      </td>
      <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-secondary)' }}>{profile.period || '—'}</td>
      <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-secondary)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {profile.assigned_preparer || '—'}
      </td>
      <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-secondary)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {profile.assigned_reviewer || '—'}
      </td>
      <td style={{ padding: '8px 12px', fontSize: 11, color: profile.open_exceptions > 0 ? '#EF4444' : 'var(--text-tertiary)', fontWeight: profile.open_exceptions > 0 ? 700 : 400 }}>
        {profile.open_exceptions > 0 ? profile.open_exceptions : '—'}
      </td>
      <td style={{ padding: '8px 12px', fontSize: 11, fontFamily: 'monospace', color: profile.variance != null && Math.abs(profile.variance) > 0 ? '#FBBF24' : 'var(--text-tertiary)' }}>
        {profile.variance != null ? Number(profile.variance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
      </td>
    </tr>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Panel (bottom sticky bar)
// ─────────────────────────────────────────────────────────────────────────────

function ActionBar({ selectedIds, users, onAction, onClearAll, onExport, actionPending }) {
  const [activeAction, setActiveAction] = useState(null)
  const [comments, setComments]         = useState('')
  const [assignUser, setAssignUser]     = useState('')
  const count = selectedIds.size

  if (count === 0) return null

  const handleApply = () => {
    if (!activeAction) return
    if (activeAction === 'ASSIGN' && !assignUser) {
      toast.error('Select a user to assign to')
      return
    }
    onAction({ action: activeAction, comments: comments || undefined, assign_user_id: assignUser ? Number(assignUser) : undefined })
    setActiveAction(null); setComments(''); setAssignUser('')
  }

  return (
    <div style={{
      position: 'sticky', bottom: 0, zIndex: 20,
      background: '#0F0F2A', border: '1px solid #FFE60033',
      borderRadius: '12px 12px 0 0', padding: '12px 20px',
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      boxShadow: '0 -4px 24px rgba(0,0,0,0.4)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 4 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#FFE600', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#0F0F17' }}>{count}</span>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#FFE600' }}>profiles selected</span>
      </div>

      <div style={{ width: 1, height: 28, background: '#FFE60030' }} />

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {PROFILE_ACTIONS.map(act => (
          <button
            key={act.id}
            onClick={() => setActiveAction(activeAction === act.id ? null : act.id)}
            title={act.help}
            style={{
              padding: '5px 12px', borderRadius: 7, fontWeight: 700, fontSize: 11,
              display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
              background: activeAction === act.id ? act.color : `${act.color}18`,
              color: activeAction === act.id ? '#0F0F17' : act.color,
              border: `1px solid ${act.color}44`,
              transition: 'all 150ms',
            }}
          >
            <act.icon style={{ width: 12, height: 12 }} />
            {act.label}
          </button>
        ))}
      </div>

      {/* Context inputs for active action */}
      {activeAction && (
        <>
          <div style={{ width: 1, height: 28, background: '#FFE60030' }} />
          {activeAction === 'ASSIGN' && (
            <select
              value={assignUser}
              onChange={e => setAssignUser(e.target.value)}
              style={{ padding: '5px 10px', borderRadius: 6, background: '#1A1A2E', border: '1px solid #FFE60033', color: '#E2E8F0', fontSize: 12, outline: 'none' }}
            >
              <option value="">— Select user —</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.email} ({u.role})</option>
              ))}
            </select>
          )}
          <input
            value={comments}
            onChange={e => setComments(e.target.value)}
            placeholder="Comment (optional)…"
            style={{ padding: '5px 10px', borderRadius: 6, background: '#1A1A2E', border: '1px solid #FFE60033', color: '#E2E8F0', fontSize: 12, outline: 'none', width: 200 }}
          />
          <button
            onClick={handleApply}
            disabled={actionPending}
            style={{ padding: '6px 16px', borderRadius: 7, background: '#FFE600', color: '#0F0F17', border: 'none', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}
          >
            {actionPending ? 'Applying…' : `Apply ${PROFILE_ACTIONS.find(a => a.id === activeAction)?.label}`}
          </button>
        </>
      )}

      <div style={{ flex: 1 }} />

      {/* Export */}
      <button
        onClick={() => onExport('xlsx')}
        style={{ padding: '5px 12px', borderRadius: 7, background: '#10B98118', border: '1px solid #10B98133', color: '#10B981', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
      >
        <FileSpreadsheet style={{ width: 12, height: 12 }} /> Export Excel
      </button>
      <button
        onClick={() => onExport('csv')}
        style={{ padding: '5px 12px', borderRadius: 7, background: '#6B728018', border: '1px solid #6B728033', color: '#9CA3AF', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
      >
        <Download style={{ width: 12, height: 12 }} /> CSV
      </button>
      <button
        onClick={onClearAll}
        style={{ padding: '5px 10px', borderRadius: 7, background: 'transparent', border: '1px solid #EF444433', color: '#EF4444', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
      >
        <X style={{ width: 11, height: 11 }} /> Clear
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Exception tab
// ─────────────────────────────────────────────────────────────────────────────

function ExceptionActions({ users }) {
  const [ids, setIds]               = useState('')
  const [rootCause, setRootCause]   = useState('TIMING_DIFFERENCE')
  const [notes, setNotes]           = useState('')
  const [status, setStatus]         = useState('RESOLVED')
  const [assignUser, setAssignUser] = useState('')
  const [activeTab, setActiveTab]   = useState('resolve')

  const resolveMutation = useMutation({
    mutationFn: () => bulkAPI.resolveExceptions({
      exception_ids: ids.split(',').map(s => parseInt(s.trim())).filter(Boolean),
      root_cause: rootCause,
      resolution_notes: notes || undefined,
      status,
    }),
    onSuccess: d => toast.success(`${d.resolved} exceptions ${status.toLowerCase()}`),
    onError: e => toast.error(e?.response?.data?.detail || 'Failed'),
  })

  const assignMutation = useMutation({
    mutationFn: () => bulkAPI.assignExceptions({
      exception_ids: ids.split(',').map(s => parseInt(s.trim())).filter(Boolean),
      assign_user_id: Number(assignUser),
      notes: notes || undefined,
    }),
    onSuccess: d => toast.success(`${d.assigned} exceptions assigned`),
    onError: e => toast.error(e?.response?.data?.detail || 'Failed'),
  })

  return (
    <div style={{ padding: '24px', maxWidth: 720 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {[{id:'resolve',label:'Bulk Resolve'},{id:'assign',label:'Bulk Assign'}].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{
              padding: '6px 14px', borderRadius: '6px 6px 0 0', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
              background: activeTab === t.id ? 'var(--surface-2)' : 'transparent',
              borderBottom: activeTab === t.id ? '2px solid #FFE600' : '2px solid transparent',
              color: activeTab === t.id ? '#FFE600' : 'var(--text-tertiary)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 10, padding: '20px 24px' }}>
        {/* Exception IDs input */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            Exception IDs (comma-separated)
          </label>
          <input
            value={ids} onChange={e => setIds(e.target.value)}
            placeholder="e.g. 12, 14, 18, 23"
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'var(--surface-3)', border: '1px solid var(--border-2)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
          <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--text-tertiary)' }}>
            {ids.split(',').map(s => parseInt(s.trim())).filter(Boolean).length} IDs entered
          </p>
        </div>

        {activeTab === 'resolve' ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Root Cause
                </label>
                <select value={rootCause} onChange={e => setRootCause(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'var(--surface-3)', border: '1px solid var(--border-2)', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}>
                  {ROOT_CAUSES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Set Status
                </label>
                <select value={status} onChange={e => setStatus(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'var(--surface-3)', border: '1px solid var(--border-2)', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}>
                  <option value="RESOLVED">RESOLVED</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="ESCALATED">ESCALATED</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Resolution Notes
              </label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                rows={3} placeholder="Describe the resolution…"
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'var(--surface-3)', border: '1px solid var(--border-2)', color: 'var(--text-primary)', fontSize: 12, outline: 'none', resize: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <button onClick={() => resolveMutation.mutate()} disabled={resolveMutation.isPending || !ids.trim()}
              style={{ padding: '9px 22px', borderRadius: 8, background: '#00C891', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCheck style={{ width: 14, height: 14 }} />
              {resolveMutation.isPending ? 'Resolving…' : 'Bulk Resolve Exceptions'}
            </button>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Assign To User
              </label>
              <select value={assignUser} onChange={e => setAssignUser(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'var(--surface-3)', border: '1px solid var(--border-2)', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}>
                <option value="">— Select user —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.email} ({u.role})</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Comment (optional)
              </label>
              <input value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Assignment reason…"
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'var(--surface-3)', border: '1px solid var(--border-2)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <button onClick={() => assignMutation.mutate()} disabled={assignMutation.isPending || !ids.trim() || !assignUser}
              style={{ padding: '9px 22px', borderRadius: 8, background: '#60A5FA', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users style={{ width: 14, height: 14 }} />
              {assignMutation.isPending ? 'Assigning…' : 'Bulk Assign Exceptions'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function BulkOperationsCenter() {
  const qc = useQueryClient()

  // Selection
  const [selected, setSelected] = useState(new Set())

  // Active tab
  const [activeTab, setActiveTab] = useState('profiles')

  // Filters
  const [search, setSearch]       = useState('')
  const [stateFilter, setStateFilter] = useState('')
  const [riskFilter, setRiskFilter]   = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  // Results panel
  const [lastResult, setLastResult] = useState(null)

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: summary, refetch: refetchSummary } = useQuery({
    queryKey: ['bulk-summary'],
    queryFn: bulkAPI.summary,
    staleTime: 15_000,
  })

  const { data: usersData = [] } = useQuery({
    queryKey: ['bulk-users'],
    queryFn: bulkAPI.users,
    staleTime: 60_000,
  })

  const { data: profilesData, isLoading: profilesLoading, refetch: refetchProfiles } = useQuery({
    queryKey: ['bulk-profiles', search, stateFilter, riskFilter, page],
    queryFn: () => bulkAPI.listProfiles({
      search: search || undefined,
      lifecycle_state: stateFilter || undefined,
      risk: riskFilter || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    staleTime: 10_000,
    enabled: activeTab === 'profiles',
  })

  const profiles = profilesData?.profiles || []
  const totalProfiles = profilesData?.total || 0
  const pageCount = Math.ceil(totalProfiles / PAGE_SIZE)

  // ── Mutations ────────────────────────────────────────────────────────────────
  const actionMutation = useMutation({
    mutationFn: (payload) => bulkAPI.profileAction({
      profile_ids: [...selected],
      ...payload,
    }),
    onSuccess: (d) => {
      setLastResult(d)
      toast.success(`${d.success} profiles updated · ${d.skipped} skipped · ${d.errors} errors`)
      setSelected(new Set())
      refetchProfiles(); refetchSummary()
      qc.invalidateQueries(['bulk-profiles', 'bulk-summary'])
    },
    onError: e => toast.error(e?.response?.data?.detail || 'Action failed'),
  })

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const toggleProfile = useCallback((id) => {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }, [])

  const selectAll = useCallback(() => {
    if (selected.size === profiles.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(profiles.map(p => p.id)))
    }
  }, [profiles, selected.size])

  const handleExport = useCallback((fmt) => {
    const ids = selected.size > 0 ? [...selected] : profiles.map(p => p.id)
    bulkAPI.exportProfiles(ids, fmt).then(() => toast.success(`Exported ${ids.length} profiles`))
  }, [selected, profiles])

  const allSelected = profiles.length > 0 && selected.size === profiles.length
  const someSelected = selected.size > 0 && !allSelected

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, -apple-system, sans-serif', color: 'var(--text-primary)' }}>

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <div style={{ padding: '16px 24px 0', background: 'var(--surface-1)', borderBottom: '1px solid var(--border-1)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#FFE60018', border: '1px solid #FFE60033', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCheck style={{ width: 16, height: 16, color: '#FFE600' }} />
              </div>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Bulk Operations Center</h1>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>
              Select profiles → apply actions at scale · approve · certify · return · assign · export
            </p>
          </div>
          <button onClick={() => { refetchProfiles(); refetchSummary() }}
            style={{ padding: '7px 12px', borderRadius: 8, background: 'var(--surface-3)', border: '1px solid var(--border-2)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <RefreshCw style={{ width: 12, height: 12 }} /> Refresh
          </button>
        </div>

        {/* KPI Bar */}
        <div style={{ marginBottom: 16 }}>
          <KpiBar summary={summary} />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{
                padding: '8px 14px', border: 'none', background: 'none',
                borderBottom: activeTab === t.id ? '2px solid #FFE600' : '2px solid transparent',
                color: activeTab === t.id ? '#FFE600' : 'var(--text-tertiary)',
                fontWeight: activeTab === t.id ? 700 : 400,
                fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
              }}>
              <t.icon style={{ width: 12, height: 12 }} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--surface-0)' }}>

        {/* ── Profile Actions Tab ─────────────────────────────────────────────────── */}
        {activeTab === 'profiles' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

            {/* Toolbar */}
            <div style={{ padding: '12px 24px', background: 'var(--surface-1)', borderBottom: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
              {/* Search */}
              <div style={{ position: 'relative' }}>
                <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: 'var(--text-disabled)' }} />
                <input value={search} onChange={e => { setSearch(e.target.value); setPage(0) }}
                  placeholder="Search name or account…"
                  style={{ padding: '7px 10px 7px 28px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border-2)', color: 'var(--text-primary)', fontSize: 12, outline: 'none', width: 220 }} />
              </div>

              {/* State filter */}
              <select value={stateFilter} onChange={e => { setStateFilter(e.target.value); setPage(0) }}
                style={{ padding: '7px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border-2)', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}>
                <option value="">All States</option>
                {Object.keys(STATE_META).map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>

              {/* Risk filter */}
              <select value={riskFilter} onChange={e => { setRiskFilter(e.target.value); setPage(0) }}
                style={{ padding: '7px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border-2)', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}>
                <option value="">All Risk Levels</option>
                {Object.keys(RISK_META).map(r => <option key={r} value={r}>{r}</option>)}
              </select>

              {(search || stateFilter || riskFilter) && (
                <button onClick={() => { setSearch(''); setStateFilter(''); setRiskFilter(''); setPage(0) }}
                  style={{ padding: '5px 10px', borderRadius: 6, background: 'var(--surface-3)', border: '1px solid var(--border-1)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <X style={{ width: 10, height: 10 }} /> Clear filters
                </button>
              )}

              <div style={{ flex: 1 }} />

              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                {selected.size > 0 ? <span style={{ color: '#FFE600', fontWeight: 700 }}>{selected.size} selected · </span> : null}
                {totalProfiles} profiles
              </span>

              <button onClick={() => handleExport('xlsx')}
                style={{ padding: '6px 12px', borderRadius: 7, background: '#10B98118', border: '1px solid #10B98133', color: '#10B981', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <FileSpreadsheet style={{ width: 12, height: 12 }} /> Export All
              </button>
            </div>

            {/* Last result banner */}
            {lastResult && (
              <div style={{ padding: '8px 24px', background: '#00C89110', borderBottom: '1px solid #00C89130', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <CheckCircle2 style={{ width: 14, height: 14, color: '#00C891' }} />
                <span style={{ fontSize: 12, color: '#00C891', fontWeight: 600 }}>
                  Last action: {lastResult.action} · {lastResult.success} succeeded · {lastResult.skipped} skipped · {lastResult.errors} errors
                </span>
                {lastResult.detail?.skipped?.length > 0 && (
                  <span style={{ fontSize: 11, color: '#FBBF24' }}>
                    Skipped: {lastResult.detail.skipped.map(s => `#${s.id} (${s.reason})`).join(' | ')}
                  </span>
                )}
                <button onClick={() => setLastResult(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#00C891', cursor: 'pointer' }}>
                  <X style={{ width: 12, height: 12 }} />
                </button>
              </div>
            )}

            {/* Table */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              {profilesLoading ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
                  <RefreshCw style={{ width: 24, height: 24, marginBottom: 8, animation: 'spin 1s linear infinite' }} />
                  <p style={{ fontSize: 13 }}>Loading profiles…</p>
                </div>
              ) : profiles.length === 0 ? (
                <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-tertiary)' }}>
                  <Layers style={{ width: 40, height: 40, marginBottom: 12, opacity: 0.3 }} />
                  <p style={{ fontSize: 14, fontWeight: 600 }}>No profiles found</p>
                  <p style={{ fontSize: 12 }}>Try adjusting filters or create reconciliation profiles</p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                    <tr style={{ background: 'var(--surface-3)' }}>
                      <th style={{ padding: '10px 12px', width: 36, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={el => { if (el) el.indeterminate = someSelected }}
                          onChange={selectAll}
                          style={{ width: 14, height: 14, accentColor: '#FFE600', cursor: 'pointer' }}
                        />
                      </th>
                      {['ID', 'Name', 'State', 'Risk', 'Type', 'Period', 'Preparer', 'Reviewer', 'Exceptions', 'Variance'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.3px', borderBottom: '1px solid var(--border-1)', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map(p => (
                      <ProfileRow key={p.id} profile={p} selected={selected} onToggle={toggleProfile} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            {pageCount > 1 && (
              <div style={{ padding: '10px 24px', background: 'var(--surface-1)', borderTop: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  Page {page + 1} of {pageCount} · {totalProfiles} total profiles
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                    style={{ padding: '4px 12px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border-1)', color: 'var(--text-secondary)', fontSize: 11, cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.5 : 1 }}>
                    ← Prev
                  </button>
                  <button onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}
                    style={{ padding: '4px 12px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border-1)', color: 'var(--text-secondary)', fontSize: 11, cursor: page >= pageCount - 1 ? 'not-allowed' : 'pointer', opacity: page >= pageCount - 1 ? 0.5 : 1 }}>
                    Next →
                  </button>
                </div>
              </div>
            )}

            {/* Sticky action bar */}
            <ActionBar
              selectedIds={selected}
              users={usersData}
              onAction={(p) => actionMutation.mutate(p)}
              onClearAll={() => setSelected(new Set())}
              onExport={handleExport}
              actionPending={actionMutation.isPending}
            />
          </div>
        )}

        {/* ── Exception Actions Tab ───────────────────────────────────────────────── */}
        {activeTab === 'exceptions' && (
          <ExceptionActions users={usersData} />
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        tr:hover td { background: var(--surface-2) !important; }
      `}</style>
    </div>
  )
}
