import { useState, useMemo, useCallback, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import toast from 'react-hot-toast'
import {
  Zap, Play, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Link2, Unlink, Search, ChevronDown, ChevronUp, ChevronRight,
  FileText, Users, BarChart2, Clock, CheckCheck, Layers,
  GitMerge, Eye, MessageSquare, ArrowLeftRight, Filter,
  Download, Info, X, Check,
} from 'lucide-react'
import { enterpriseAPI, advancedAPI, matchingAPI } from '../api'
import { useProjectStore } from '../store/projectStore'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CLS_COLOR = {
  FULL_MATCH:       '#00C891',
  PARTIAL_MATCH:    '#FFE600',
  UNMATCHED:        '#FF4D4D',
  VARIANCE_FLAGGED: '#c026d3',
}
const REVIEW_COLOR = {
  CONFIRMED: '#00C891',
  REJECTED:  '#FF4D4D',
  PENDING:   '#94A3B8',
}
const STRATEGY_LABEL = {
  exact:        'Exact',
  tolerance:    'Tolerance',
  fuzzy:        'Fuzzy',
  date_window:  'Date Window',
  many_to_one:  'Many→One',
  one_to_many:  'One→Many',
  cross_period: 'Cross-Period',
  rule_based:   'Rule-Based',
  manual:       'Manual',
  unmatched:    'Unmatched',
  ai_suggestion:'AI Suggest',
}

function fmt(n) {
  if (n === null || n === undefined) return '—'
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function pct(n) { return `${Math.round((n || 0) * 100)}%` }
function relTime(iso) {
  if (!iso) return '—'
  const d = (Date.now() - new Date(iso).getTime()) / 1000
  if (d < 60) return 'just now'
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return new Date(iso).toLocaleDateString()
}

// ─────────────────────────────────────────────────────────────────────────────
// Badge component
// ─────────────────────────────────────────────────────────────────────────────
function Badge({ label, color = '#94A3B8', size = 10 }) {
  return (
    <span style={{
      fontSize: size, fontWeight: 700, padding: '2px 7px',
      borderRadius: 9999,
      background: `${color}18`, border: `1px solid ${color}33`, color,
      display: 'inline-block',
    }}>
      {label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Confidence bar
// ─────────────────────────────────────────────────────────────────────────────
function ConfBar({ value }) {
  const pctNum = Math.round((value || 0) * 100)
  const color  = pctNum >= 92 ? '#00C891' : pctNum >= 70 ? '#FFE600' : '#FF4D4D'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 56, height: 6, borderRadius: 3, background: '#2D2D4A', position: 'relative', overflow: 'hidden' }}>
        <div style={{ width: `${pctNum}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 300ms' }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color }}>{pctNum}%</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Card
// ─────────────────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = '#FFE600', icon: Icon }) {
  return (
    <div style={{
      background: 'var(--surface-2)', border: '1px solid var(--border-2)',
      borderRadius: 10, padding: '14px 18px',
      borderTop: `2px solid ${color}`,
      display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 140,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
          {label}
        </span>
        {Icon && <Icon style={{ width: 13, height: 13, color }} />}
      </div>
      <p style={{ margin: 0, fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>{value ?? '—'}</p>
      {sub && <p style={{ margin: 0, fontSize: 10, color: 'var(--text-tertiary)' }}>{sub}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Record Row (used in split pane)
// ─────────────────────────────────────────────────────────────────────────────
function RecordRow({ record, selected, onToggle, side }) {
  const isSelected = selected.has(record.id)
  const statusColors = { RECONCILED: '#00C891', PARTIAL_MATCH: '#FFE600', UNMATCHED: '#FF4D4D', VALIDATED: '#94A3B8' }
  const sc = statusColors[record.status] || '#94A3B8'
  return (
    <div
      onClick={() => onToggle(record.id)}
      style={{
        padding: '8px 12px', borderBottom: '1px solid var(--border-0)',
        cursor: 'pointer', userSelect: 'none',
        background: isSelected
          ? (side === 'SOURCE' ? '#4D94FF18' : '#00C89118')
          : 'transparent',
        borderLeft: isSelected ? `3px solid ${side === 'SOURCE' ? '#4D94FF' : '#00C891'}` : '3px solid transparent',
        transition: 'background 80ms',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-tertiary)' }}>#{record.id}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: sc, background: `${sc}18`, padding: '1px 5px', borderRadius: 4 }}>
              {record.status}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {record.reference || record.description || `Record ${record.id}`}
          </p>
          <p style={{ margin: 0, fontSize: 10, color: 'var(--text-tertiary)' }}>
            {record.entity || record.account || '—'} · {record.tx_date || '—'} · {record.source_system}
          </p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: record.amount < 0 ? '#FF4D4D' : 'var(--text-primary)' }}>
            {record.currency && `${record.currency} `}{fmt(record.amount)}
          </p>
          {isSelected && (
            <span style={{ fontSize: 9, color: side === 'SOURCE' ? '#4D94FF' : '#00C891', fontWeight: 700 }}>
              SELECTED
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Match Group Row with expandable detail
// ─────────────────────────────────────────────────────────────────────────────
function GroupRow({ group, onConfirm, onReject, onSelect, bulkSelected, onBulkToggle, qc }) {
  const [expanded, setExpanded] = useState(false)
  const [showNoteBox, setShowNoteBox] = useState(false)
  const [noteText, setNoteText] = useState(group.notes || '')
  const [showRejectBox, setShowRejectBox] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const clsColor     = CLS_COLOR[group.classification] || '#94A3B8'
  const reviewColor  = REVIEW_COLOR[group.review_status] || '#94A3B8'
  const isBulkChecked = bulkSelected.has(group.id)
  const canAct = group.review_status !== 'CONFIRMED' && group.review_status !== 'REJECTED'

  const noteMutation = useMutation({
    mutationFn: () => matchingAPI.updateNotes(group.id, noteText),
    onSuccess: () => { toast.success('Note saved'); setShowNoteBox(false); qc.invalidateQueries(['mg-groups']) },
  })

  return (
    <div style={{
      border: '1px solid var(--border-1)', borderRadius: 10, marginBottom: 8,
      background: 'var(--surface-2)', overflow: 'hidden',
      borderLeft: `3px solid ${clsColor}`,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}>
        {/* Bulk checkbox */}
        <input
          type="checkbox" checked={isBulkChecked}
          onClick={e => e.stopPropagation()}
          onChange={() => onBulkToggle(group.id)}
          style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#FFE600' }}
          disabled={!canAct}
        />

        <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-tertiary)', minWidth: 40 }}>#{group.id}</span>

        <Badge label={group.classification} color={clsColor} />
        <Badge label={group.review_status || 'PENDING'} color={reviewColor} />
        {group.is_manual && <Badge label="MANUAL" color="#A78BFA" />}
        {group.strategy && (
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
            {STRATEGY_LABEL[group.strategy] || group.strategy}
          </span>
        )}

        <div style={{ flex: 1 }} />

        <ConfBar value={group.confidence} />

        <span style={{ fontSize: 11, color: group.variance_amount > 0.01 ? '#FFE600' : 'var(--text-tertiary)', fontFamily: 'monospace', minWidth: 70, textAlign: 'right' }}>
          {group.variance_amount > 0.01 ? `Δ${fmt(group.variance_amount)}` : 'Exact'}
        </span>

        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', minWidth: 40 }}>
          {group.item_count} rec
        </span>

        {/* Actions */}
        {canAct && (
          <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => onConfirm(group.id)}
              title="Confirm match"
              style={{ padding: '3px 8px', borderRadius: 6, background: '#00C89118', border: '1px solid #00C89133', color: '#00C891', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
            >
              <Check style={{ width: 11, height: 11 }} />
            </button>
            <button
              onClick={() => setShowRejectBox(r => !r)}
              title="Reject match"
              style={{ padding: '3px 8px', borderRadius: 6, background: '#FF4D4D18', border: '1px solid #FF4D4D33', color: '#FF4D4D', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
            >
              <X style={{ width: 11, height: 11 }} />
            </button>
          </div>
        )}
        <button onClick={e => { e.stopPropagation(); setShowNoteBox(n => !n) }}
          title="Add note"
          style={{ padding: '3px 6px', borderRadius: 6, background: 'var(--surface-3)', border: '1px solid var(--border-1)', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
          <MessageSquare style={{ width: 11, height: 11 }} />
        </button>

        {expanded ? <ChevronUp style={{ width: 13, height: 13, color: 'var(--text-tertiary)' }} /> : <ChevronDown style={{ width: 13, height: 13, color: 'var(--text-tertiary)' }} />}
      </div>

      {/* Reject reason box */}
      {showRejectBox && (
        <div style={{ padding: '8px 14px 12px', borderTop: '1px solid var(--border-0)', background: '#FF4D4D08' }} onClick={e => e.stopPropagation()}>
          <p style={{ margin: '0 0 6px', fontSize: 11, color: '#FF4D4D', fontWeight: 600 }}>Rejection reason (optional)</p>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Describe why this match is incorrect…"
              style={{ flex: 1, padding: '6px 10px', borderRadius: 6, background: 'var(--surface-3)', border: '1px solid var(--border-2)', color: 'var(--text-primary)', fontSize: 12 }}
            />
            <button onClick={() => { onReject(group.id, rejectReason); setShowRejectBox(false) }}
              style={{ padding: '6px 12px', borderRadius: 6, background: '#FF4D4D', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Confirm Reject
            </button>
          </div>
        </div>
      )}

      {/* Note box */}
      {showNoteBox && (
        <div style={{ padding: '8px 14px 12px', borderTop: '1px solid var(--border-0)', background: '#4D94FF08' }} onClick={e => e.stopPropagation()}>
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Add a note about this match…"
            rows={2}
            style={{ width: '100%', padding: '6px 10px', borderRadius: 6, background: 'var(--surface-3)', border: '1px solid var(--border-2)', color: 'var(--text-primary)', fontSize: 12, resize: 'none', boxSizing: 'border-box' }}
          />
          <button onClick={() => noteMutation.mutate()}
            style={{ marginTop: 4, padding: '4px 12px', borderRadius: 6, background: '#4D94FF', color: '#fff', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            {noteMutation.isPending ? 'Saving…' : 'Save Note'}
          </button>
          {group.notes && <p style={{ margin: '6px 0 0', fontSize: 10, color: 'var(--text-tertiary)' }}>Current: {group.notes}</p>}
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border-0)', padding: '12px 14px', background: 'var(--surface-1)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* Source side */}
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, color: '#4D94FF', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Source Side ({group.source_records?.length || 0})
                {group.source_total !== undefined && (
                  <span style={{ marginLeft: 8, color: 'var(--text-tertiary)', fontWeight: 400 }}>
                    Total: {fmt(group.source_total)}
                  </span>
                )}
              </p>
              {(group.source_records || []).map(r => (
                <div key={r.id} style={{ padding: '6px 8px', borderRadius: 6, background: '#4D94FF08', border: '1px solid #4D94FF22', marginBottom: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{r.reference || `Rec #${r.id}`}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{fmt(r.amount)}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                    {r.tx_date} · {r.entity || r.account || r.source_system}
                    {r.description && ` · ${r.description.substring(0, 40)}`}
                  </div>
                </div>
              ))}
            </div>
            {/* Target side */}
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, color: '#00C891', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Target Side ({group.target_records?.length || 0})
                {group.target_total !== undefined && (
                  <span style={{ marginLeft: 8, color: 'var(--text-tertiary)', fontWeight: 400 }}>
                    Total: {fmt(group.target_total)}
                  </span>
                )}
              </p>
              {(group.target_records || []).map(r => (
                <div key={r.id} style={{ padding: '6px 8px', borderRadius: 6, background: '#00C89108', border: '1px solid #00C89122', marginBottom: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{r.reference || `Rec #${r.id}`}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{fmt(r.amount)}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                    {r.tx_date} · {r.entity || r.account || r.source_system}
                    {r.description && ` · ${r.description.substring(0, 40)}`}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Net variance line */}
          {group.net_variance !== undefined && (
            <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, background: Math.abs(group.net_variance) < 0.01 ? '#00C89112' : '#FFE60012', border: `1px solid ${Math.abs(group.net_variance) < 0.01 ? '#00C89133' : '#FFE60033'}` }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: Math.abs(group.net_variance) < 0.01 ? '#00C891' : '#FFE600' }}>
                Net Variance: {fmt(group.net_variance)} &nbsp;
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                Source total {fmt(group.source_total)} − Target total {fmt(group.target_total)}
              </span>
            </div>
          )}

          {/* Exception detail */}
          {group.exception && (
            <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, background: 'var(--surface-3)', border: '1px solid var(--border-1)' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)' }}>
                Exception #{group.exception.id} · {group.exception.status} · {group.exception.queue_type}
              </span>
              {group.exception.comments && (
                <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-secondary)' }}>{group.exception.comments}</p>
              )}
            </div>
          )}

          {/* Confirmed/rejected by */}
          {(group.confirmed_by_name || group.rejected_by_name) && (
            <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-tertiary)' }}>
              {group.confirmed_by_name && `Confirmed by ${group.confirmed_by_name} · ${relTime(group.confirmed_at)}`}
              {group.rejected_by_name && `Rejected by ${group.rejected_by_name} · ${relTime(group.rejected_at)}: ${group.rejected_reason || '—'}`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function TransactionMatchingWorkspace() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const selectedProjectId = useProjectStore(s => s.selectedProjectId)

  // Profile selection
  const [profileId, setProfileId] = useState(searchParams.get('profileId') || '')
  const [activeTab, setActiveTab] = useState('workspace')

  // Matching config
  const [threshold, setThreshold] = useState('0.92')
  const [crossPeriodDays, setCrossPeriodDays] = useState('90')
  const [showConfig, setShowConfig] = useState(false)

  // Filter state for groups tab
  const [clsFilter, setClsFilter] = useState('all')
  const [reviewFilter, setReviewFilter] = useState('all')
  const [groupSearch, setGroupSearch] = useState('')
  const [groupPage, setGroupPage] = useState(0)
  const PAGE_SIZE = 15

  // Manual match selection state
  const [selectedSource, setSelectedSource] = useState(new Set())
  const [selectedTarget, setSelectedTarget] = useState(new Set())
  const [manualNote, setManualNote] = useState('')
  const [recordSearch, setRecordSearch] = useState('')

  // Bulk selection
  const [bulkSelected, setBulkSelected] = useState(new Set())

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: profiles = [] } = useQuery({
    queryKey: ['enterprise-profiles', selectedProjectId || 'all'],
    queryFn: () => enterpriseAPI.listProfiles(selectedProjectId ? Number(selectedProjectId) : undefined),
  })

  const selectedProfile = useMemo(() => profiles.find(p => String(p.id) === String(profileId)) || null, [profiles, profileId])

  const { data: summary, refetch: refetchSummary } = useQuery({
    queryKey: ['mg-summary', profileId],
    queryFn: () => matchingAPI.summary(Number(profileId)),
    enabled: Boolean(profileId),
    staleTime: 15_000,
  })

  const { data: groupsData, isLoading: groupsLoading, refetch: refetchGroups } = useQuery({
    queryKey: ['mg-groups', profileId, clsFilter, reviewFilter],
    queryFn: () => matchingAPI.profileGroups(Number(profileId), {
      classification: clsFilter !== 'all' ? clsFilter : undefined,
      review_status:  reviewFilter !== 'all' ? reviewFilter : undefined,
      limit: 300,
    }),
    enabled: Boolean(profileId) && (activeTab === 'groups' || activeTab === 'workspace'),
    staleTime: 10_000,
  })

  const { data: unmatchedData, refetch: refetchUnmatched } = useQuery({
    queryKey: ['mg-unmatched', profileId],
    queryFn: () => matchingAPI.unmatchedRecords(Number(profileId)),
    enabled: Boolean(profileId) && activeTab === 'workspace',
    staleTime: 10_000,
  })

  const { data: auditData } = useQuery({
    queryKey: ['mg-audit', profileId],
    queryFn: () => matchingAPI.auditTrail(Number(profileId), { limit: 100 }),
    enabled: Boolean(profileId) && activeTab === 'audit',
    staleTime: 30_000,
  })

  const { data: suggestionsData, mutate: runSuggestions, isPending: suggestPending } = useMutation({
    mutationFn: () => matchingAPI.suggestions(Number(profileId), { top_k: 25, min_confidence: 0.5 }),
  })

  // ── Groups: filter + search + paginate ────────────────────────────────────
  const allGroups = groupsData?.groups || []
  const filteredGroups = useMemo(() => {
    const term = groupSearch.toLowerCase()
    return allGroups.filter(g => {
      if (!term) return true
      return (
        String(g.id).includes(term) ||
        (g.strategy || '').toLowerCase().includes(term) ||
        (g.classification || '').toLowerCase().includes(term)
      )
    })
  }, [allGroups, groupSearch])

  const pageCount   = Math.ceil(filteredGroups.length / PAGE_SIZE)
  const pagedGroups = filteredGroups.slice(groupPage * PAGE_SIZE, (groupPage + 1) * PAGE_SIZE)

  // ── Record filtering ───────────────────────────────────────────────────────
  const sourceRecords = useMemo(() => {
    const term = recordSearch.toLowerCase()
    const recs = unmatchedData?.source_side || []
    return term ? recs.filter(r =>
      (r.reference || '').toLowerCase().includes(term) ||
      (r.entity || '').toLowerCase().includes(term) ||
      String(r.amount).includes(term)
    ) : recs
  }, [unmatchedData?.source_side, recordSearch])

  const targetRecords = useMemo(() => {
    const term = recordSearch.toLowerCase()
    const recs = unmatchedData?.target_side || []
    return term ? recs.filter(r =>
      (r.reference || '').toLowerCase().includes(term) ||
      (r.entity || '').toLowerCase().includes(term) ||
      String(r.amount).includes(term)
    ) : recs
  }, [unmatchedData?.target_side, recordSearch])

  // Selected totals for manual match preview
  const srcTotal = useMemo(() => {
    if (!unmatchedData) return 0
    return unmatchedData.source_side?.filter(r => selectedSource.has(r.id)).reduce((s, r) => s + r.amount, 0) || 0
  }, [unmatchedData, selectedSource])

  const tgtTotal = useMemo(() => {
    if (!unmatchedData) return 0
    return unmatchedData.target_side?.filter(r => selectedTarget.has(r.id)).reduce((s, r) => s + r.amount, 0) || 0
  }, [unmatchedData, selectedTarget])

  // ── Mutations ──────────────────────────────────────────────────────────────
  const advancedMutation = useMutation({
    mutationFn: () => matchingAPI.runAdvanced({
      profile_id: Number(profileId),
      auto_match_threshold: Number(threshold) || 0.92,
      cross_period_days: Number(crossPeriodDays) || 90,
    }),
    onSuccess: d => {
      toast.success(`${d.match_groups} groups created · ${d.auto_match_rate}% auto-matched`)
      qc.invalidateQueries(['mg-groups', 'mg-summary', 'mg-unmatched'])
      refetchSummary(); refetchGroups(); refetchUnmatched()
    },
    onError: e => toast.error(e?.response?.data?.detail || 'Matching failed'),
  })

  const manualMatchMutation = useMutation({
    mutationFn: () => matchingAPI.createManualMatch({
      profile_id: Number(profileId),
      source_ids: [...selectedSource],
      target_ids: [...selectedTarget],
      notes: manualNote || undefined,
    }),
    onSuccess: () => {
      toast.success('Manual match created and confirmed')
      setSelectedSource(new Set()); setSelectedTarget(new Set()); setManualNote('')
      qc.invalidateQueries(['mg-groups', 'mg-summary', 'mg-unmatched'])
      refetchGroups(); refetchSummary(); refetchUnmatched()
    },
    onError: e => toast.error(e?.response?.data?.detail || 'Manual match failed'),
  })

  const confirmMutation = useMutation({
    mutationFn: (gid) => matchingAPI.confirmMatch(gid),
    onSuccess: () => {
      toast.success('Match confirmed')
      qc.invalidateQueries(['mg-groups', 'mg-summary'])
      refetchGroups(); refetchSummary()
    },
    onError: e => toast.error(e?.response?.data?.detail || 'Confirm failed'),
  })

  const rejectMutation = useMutation({
    mutationFn: ({ gid, reason }) => matchingAPI.rejectMatch(gid, reason),
    onSuccess: () => {
      toast.success('Match rejected — records returned to unmatched pool')
      qc.invalidateQueries(['mg-groups', 'mg-summary', 'mg-unmatched'])
      refetchGroups(); refetchSummary(); refetchUnmatched()
    },
    onError: e => toast.error(e?.response?.data?.detail || 'Reject failed'),
  })

  const bulkConfirmMutation = useMutation({
    mutationFn: () => matchingAPI.bulkConfirm([...bulkSelected]),
    onSuccess: d => {
      toast.success(`${d.confirmed} matches confirmed`)
      setBulkSelected(new Set())
      qc.invalidateQueries(['mg-groups', 'mg-summary'])
      refetchGroups(); refetchSummary()
    },
    onError: e => toast.error(e?.response?.data?.detail || 'Bulk confirm failed'),
  })

  // Promote to Balance
  const promoteMutation = useMutation({
    mutationFn: () => matchingAPI.promoteToBalance(Number(profileId)),
    onSuccess: (data) => {
      toast.success('Balance Reconciliation generated successfully!')
      navigate(`/balance-reconciliation/${data.balance_id}`)
    },
    onError: (err) => {
      toast.error('Failed to promote to balance: ' + (err.response?.data?.detail || err.message))
    }
  })

  // ── Toggle handlers ────────────────────────────────────────────────────────
  const toggleSource = useCallback((id) => {
    setSelectedSource(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }, [])
  const toggleTarget = useCallback((id) => {
    setSelectedTarget(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }, [])
  const toggleBulk = useCallback((id) => {
    setBulkSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }, [])

  // ── Chart config ───────────────────────────────────────────────────────────
  const summaryChartOption = useMemo(() => {
    if (!summary) return {}
    const g = summary.groups
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', backgroundColor: '#1A1A2E', borderColor: '#2D2D4A', textStyle: { color: '#E2E8F0', fontSize: 12 } },
      legend: { show: false },
      series: [{
        type: 'pie', radius: ['55%', '80%'], avoidLabelOverlap: true,
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 12, fontWeight: 700, color: '#E2E8F0' } },
        data: [
          { value: g?.full_match || 0,    name: 'Full Match',    itemStyle: { color: '#00C891' } },
          { value: g?.partial_match || 0, name: 'Partial',       itemStyle: { color: '#FFE600' } },
          { value: g?.unmatched || 0,     name: 'Unmatched',     itemStyle: { color: '#FF4D4D' } },
          { value: g?.variance_flagged || 0, name: 'Var Flagged', itemStyle: { color: '#c026d3' } },
        ],
      }],
    }
  }, [summary])

  const TABS = [
    { id: 'workspace',  label: 'Matching Workspace',  icon: Layers },
    { id: 'groups',     label: `Match Groups (${summary?.groups?.total || 0})`, icon: GitMerge },
    { id: 'suggestions',label: 'AI Suggestions', icon: Zap },
    { id: 'audit',      label: 'Audit Trail', icon: Clock },
  ]

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, -apple-system, sans-serif', color: 'var(--text-primary)' }}>

      {/* ── Top header ─────────────────────────────────────────────────────── */}
      <div style={{ padding: '16px 24px 0', background: 'var(--surface-1)', borderBottom: '1px solid var(--border-1)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#FFE60018', border: '1px solid #FFE60033', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ArrowLeftRight style={{ width: 16, height: 16, color: '#FFE600' }} />
              </div>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Transaction Matching</h1>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>
              4-phase engine · manual pairing · confirm/reject workflow · audit trail
            </p>
          </div>

          {/* Profile selector + run button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <select
              value={profileId}
              onChange={e => { setProfileId(e.target.value); setBulkSelected(new Set()) }}
              style={{ padding: '7px 12px', borderRadius: 8, background: 'var(--surface-3)', border: '1px solid var(--border-2)', color: 'var(--text-primary)', fontSize: 12, outline: 'none', minWidth: 240 }}
            >
              <option value="">— Select reconciliation profile —</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({(p.reconciliation_type || '').replace(/_/g, ' ')})</option>
              ))}
            </select>

            <button
              onClick={() => setShowConfig(c => !c)}
              style={{ padding: '7px 10px', borderRadius: 8, background: 'var(--surface-3)', border: '1px solid var(--border-2)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
            >
              <Filter style={{ width: 13, height: 13 }} />
              Config
            </button>

            <button
              onClick={() => advancedMutation.mutate()}
              disabled={!profileId || advancedMutation.isPending}
              style={{
                padding: '7px 16px', borderRadius: 8,
                background: advancedMutation.isPending ? '#FFE60088' : '#FFE600',
                color: '#0F0F17', border: 'none', fontWeight: 700, fontSize: 13,
                cursor: !profileId || advancedMutation.isPending ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {advancedMutation.isPending
                ? <><RefreshCw style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} /> Running…</>
                : <><Zap style={{ width: 13, height: 13 }} /> Run Auto-Match</>
              }
            </button>

            <button
              onClick={() => promoteMutation.mutate()}
              disabled={!profileId || promoteMutation.isPending}
              style={{
                padding: '7px 16px', borderRadius: 8,
                background: promoteMutation.isPending ? 'var(--surface-3)' : 'var(--surface-2)',
                color: 'var(--text-primary)', border: '1px solid var(--border-2)', fontWeight: 700, fontSize: 13,
                cursor: !profileId || promoteMutation.isPending ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                marginLeft: 10
              }}
            >
              {promoteMutation.isPending
                ? <><RefreshCw style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} /> Promoting…</>
                : <><FileText style={{ width: 13, height: 13 }} /> Promote to Balance</>
              }
            </button>
          </div>
        </div>

        {/* Config row */}
        {showConfig && (
          <div style={{ display: 'flex', gap: 12, padding: '10px 0 12px', alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>AUTO-MATCH THRESHOLD</label>
              <input value={threshold} onChange={e => setThreshold(e.target.value)}
                style={{ width: 80, padding: '6px 8px', borderRadius: 6, background: 'var(--surface-3)', border: '1px solid var(--border-2)', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>CROSS-PERIOD DAYS</label>
              <input value={crossPeriodDays} onChange={e => setCrossPeriodDays(e.target.value)}
                style={{ width: 80, padding: '6px 8px', borderRadius: 6, background: 'var(--surface-3)', border: '1px solid var(--border-2)', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }} />
            </div>
            {selectedProfile && (
              <p style={{ margin: 0, fontSize: 10, color: 'var(--text-tertiary)' }}>
                Profile defaults: tol={selectedProfile.tolerance_threshold}% · window={selectedProfile.date_window_days}d · risk={selectedProfile.risk_classification}
              </p>
            )}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: '8px 14px', border: 'none', background: 'none',
                borderBottom: activeTab === t.id ? '2px solid #FFE600' : '2px solid transparent',
                color: activeTab === t.id ? '#FFE600' : 'var(--text-tertiary)',
                fontWeight: activeTab === t.id ? 700 : 400,
                fontSize: 12, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
                transition: 'color 150ms',
              }}
            >
              <t.icon style={{ width: 12, height: 12 }} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', background: 'var(--surface-0)' }}>

        {!profileId ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-tertiary)' }}>
            <ArrowLeftRight style={{ width: 48, height: 48, marginBottom: 16, opacity: 0.3 }} />
            <p style={{ fontSize: 16, fontWeight: 600 }}>Select a reconciliation profile to begin</p>
            <p style={{ fontSize: 13 }}>Use the dropdown above to choose a profile and run matching</p>
          </div>
        ) : (
          <>
            {/* ── KPI Strip ─────────────────────────────────────────────────── */}
            {summary && (
              <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <KpiCard label="Match Rate" value={`${summary.records.match_rate}%`} color="#00C891" icon={CheckCircle2}
                  sub={`${summary.records.reconciled} of ${summary.records.total} records`} />
                <KpiCard label="Auto Rate" value={`${summary.groups.auto_rate}%`} color="#FFE600" icon={Zap}
                  sub={`${summary.groups.full_match} full of ${summary.groups.total} groups`} />
                <KpiCard label="Pending Review" value={summary.workflow.pending} color="#94A3B8" icon={Clock}
                  sub={`${summary.workflow.confirmed} confirmed · ${summary.workflow.rejected} rejected`} />
                <KpiCard label="Manual Matches" value={summary.workflow.manual} color="#A78BFA" icon={Link2}
                  sub="Manually created pairs" />
                <KpiCard label="Variance Exposure" value={`$${fmt(summary.total_variance_exposure)}`} color="#c026d3" icon={AlertTriangle}
                  sub="Total across all groups" />
                {/* Mini donut */}
                <div style={{ flex: 1, minWidth: 140, background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 10, padding: '8px', borderTop: '2px solid #4D94FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ReactECharts option={summaryChartOption} style={{ height: 80, width: 80 }} opts={{ renderer: 'canvas' }} />
                  <div style={{ marginLeft: 8 }}>
                    {[['Full', '#00C891', summary.groups.full_match], ['Partial', '#FFE600', summary.groups.partial_match], ['Unmatch', '#FF4D4D', summary.groups.unmatched]].map(([label, color, val]) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                        <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{label}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color }}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB: Workspace (Manual Matching) ────────────────────────── */}
            {activeTab === 'workspace' && (
              <div>
                {/* Manual match preview bar */}
                {(selectedSource.size > 0 || selectedTarget.size > 0) && (
                  <div style={{
                    marginBottom: 16, padding: '12px 16px', borderRadius: 10,
                    background: 'var(--surface-2)', border: '1px solid var(--border-2)',
                    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                    borderTop: '2px solid #A78BFA',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#4D94FF' }}>
                        Source: {selectedSource.size} recs · {fmt(srcTotal)}
                      </span>
                      <ArrowLeftRight style={{ width: 14, height: 14, color: 'var(--text-tertiary)' }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#00C891' }}>
                        Target: {selectedTarget.size} recs · {fmt(tgtTotal)}
                      </span>
                      <span style={{ fontSize: 12, color: Math.abs(srcTotal - tgtTotal) < 0.01 ? '#00C891' : '#FFE600', fontWeight: 700 }}>
                        · Δ {fmt(srcTotal - tgtTotal)}
                      </span>
                    </div>
                    <input
                      value={manualNote} onChange={e => setManualNote(e.target.value)}
                      placeholder="Optional note…"
                      style={{ flex: 1, minWidth: 160, padding: '5px 8px', borderRadius: 6, background: 'var(--surface-3)', border: '1px solid var(--border-2)', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
                    />
                    <button
                      onClick={() => manualMatchMutation.mutate()}
                      disabled={manualMatchMutation.isPending || selectedSource.size === 0 || selectedTarget.size === 0}
                      style={{ padding: '6px 14px', borderRadius: 8, background: '#A78BFA', color: '#fff', border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <Link2 style={{ width: 13, height: 13 }} />
                      {manualMatchMutation.isPending ? 'Matching…' : 'Create Manual Match'}
                    </button>
                    <button onClick={() => { setSelectedSource(new Set()); setSelectedTarget(new Set()) }}
                      style={{ padding: '5px 10px', borderRadius: 6, background: 'var(--surface-3)', border: '1px solid var(--border-1)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}>
                      Clear
                    </button>
                  </div>
                )}

                {/* Search filter */}
                <div style={{ position: 'relative', marginBottom: 12, maxWidth: 300 }}>
                  <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: 'var(--text-disabled)' }} />
                  <input
                    value={recordSearch} onChange={e => setRecordSearch(e.target.value)}
                    placeholder="Filter records by reference, entity, amount…"
                    style={{ width: '100%', padding: '7px 10px 7px 28px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border-2)', color: 'var(--text-primary)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                {/* Split pane */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {/* Source */}
                  <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 10, overflow: 'hidden', borderTop: '2px solid #4D94FF' }}>
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#4D94FF' }}>Source Side (GL / ERP)</span>
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 8 }}>{sourceRecords.length} unmatched records</span>
                      </div>
                      {selectedSource.size > 0 && (
                        <span style={{ fontSize: 10, color: '#4D94FF', fontWeight: 700 }}>{selectedSource.size} selected</span>
                      )}
                    </div>
                    <div style={{ maxHeight: 480, overflowY: 'auto' }}>
                      {sourceRecords.length === 0
                        ? <p style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>No unmatched source records{recordSearch ? ` matching "${recordSearch}"` : ''}</p>
                        : sourceRecords.map(r => (
                            <RecordRow key={r.id} record={r} selected={selectedSource} onToggle={toggleSource} side="SOURCE" />
                          ))
                      }
                    </div>
                  </div>

                  {/* Target */}
                  <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 10, overflow: 'hidden', borderTop: '2px solid #00C891' }}>
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#00C891' }}>Target Side (Bank / Clearing)</span>
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 8 }}>{targetRecords.length} unmatched records</span>
                      </div>
                      {selectedTarget.size > 0 && (
                        <span style={{ fontSize: 10, color: '#00C891', fontWeight: 700 }}>{selectedTarget.size} selected</span>
                      )}
                    </div>
                    <div style={{ maxHeight: 480, overflowY: 'auto' }}>
                      {targetRecords.length === 0
                        ? <p style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>No unmatched target records{recordSearch ? ` matching "${recordSearch}"` : ''}</p>
                        : targetRecords.map(r => (
                            <RecordRow key={r.id} record={r} selected={selectedTarget} onToggle={toggleTarget} side="TARGET" />
                          ))
                      }
                    </div>
                  </div>
                </div>

                <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center' }}>
                  Click records on both sides to select them, then click "Create Manual Match" to pair them.
                  Supports many-to-one and one-to-many pairing.
                </p>
              </div>
            )}

            {/* ── TAB: Match Groups ─────────────────────────────────────────── */}
            {activeTab === 'groups' && (
              <div>
                {/* Filters + bulk actions */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative' }}>
                    <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: 'var(--text-disabled)' }} />
                    <input value={groupSearch} onChange={e => { setGroupSearch(e.target.value); setGroupPage(0) }}
                      placeholder="Search groups…"
                      style={{ padding: '7px 10px 7px 28px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border-2)', color: 'var(--text-primary)', fontSize: 12, outline: 'none', width: 180 }} />
                  </div>

                  <select value={clsFilter} onChange={e => { setClsFilter(e.target.value); setGroupPage(0) }}
                    style={{ padding: '7px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border-2)', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}>
                    <option value="all">All Classifications</option>
                    {['FULL_MATCH', 'PARTIAL_MATCH', 'UNMATCHED', 'VARIANCE_FLAGGED'].map(c => (
                      <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                    ))}
                  </select>

                  <select value={reviewFilter} onChange={e => { setReviewFilter(e.target.value); setGroupPage(0) }}
                    style={{ padding: '7px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border-2)', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}>
                    <option value="all">All Review States</option>
                    {['PENDING', 'CONFIRMED', 'REJECTED'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>

                  <div style={{ flex: 1 }} />

                  {bulkSelected.size > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#FFE600', fontWeight: 700 }}>{bulkSelected.size} selected</span>
                      <button
                        onClick={() => bulkConfirmMutation.mutate()}
                        disabled={bulkConfirmMutation.isPending}
                        style={{ padding: '6px 12px', borderRadius: 7, background: '#00C891', color: '#fff', border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <CheckCheck style={{ width: 13, height: 13 }} />
                        {bulkConfirmMutation.isPending ? 'Confirming…' : `Bulk Confirm ${bulkSelected.size}`}
                      </button>
                      <button onClick={() => setBulkSelected(new Set())}
                        style={{ padding: '5px 10px', borderRadius: 7, background: 'var(--surface-3)', border: '1px solid var(--border-1)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}>
                        Clear
                      </button>
                    </div>
                  )}

                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {filteredGroups.length} groups
                  </span>
                </div>

                {/* Group list */}
                {groupsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} style={{ height: 50, borderRadius: 10, background: 'var(--surface-2)', marginBottom: 8, animation: 'pulse 1.5s infinite' }} />
                  ))
                ) : pagedGroups.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-tertiary)' }}>
                    <GitMerge style={{ width: 40, height: 40, marginBottom: 12, opacity: 0.3 }} />
                    <p>No match groups found. Run Auto-Match to populate.</p>
                  </div>
                ) : (
                  pagedGroups.map(g => (
                    <GroupRow
                      key={g.id} group={g}
                      onConfirm={(gid) => confirmMutation.mutate(gid)}
                      onReject={(gid, reason) => rejectMutation.mutate({ gid, reason })}
                      bulkSelected={bulkSelected}
                      onBulkToggle={toggleBulk}
                      qc={qc}
                    />
                  ))
                )}

                {/* Pagination */}
                {pageCount > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      Page {groupPage + 1} of {pageCount} · {filteredGroups.length} groups
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setGroupPage(p => Math.max(0, p - 1))} disabled={groupPage === 0}
                        style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border-1)', color: 'var(--text-secondary)', fontSize: 11, cursor: groupPage === 0 ? 'not-allowed' : 'pointer', opacity: groupPage === 0 ? 0.5 : 1 }}>
                        ← Prev
                      </button>
                      <button onClick={() => setGroupPage(p => Math.min(pageCount - 1, p + 1))} disabled={groupPage >= pageCount - 1}
                        style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border-1)', color: 'var(--text-secondary)', fontSize: 11, cursor: groupPage >= pageCount - 1 ? 'not-allowed' : 'pointer', opacity: groupPage >= pageCount - 1 ? 0.5 : 1 }}>
                        Next →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── TAB: AI Suggestions ────────────────────────────────────────── */}
            {activeTab === 'suggestions' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>AI Match Suggestions</h3>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-tertiary)' }}>
                      Surface likely pairs from unmatched records using holistic scoring. Accept to create a confirmed manual match.
                    </p>
                  </div>
                  <button
                    onClick={() => runSuggestions()}
                    disabled={suggestPending}
                    style={{ padding: '8px 16px', borderRadius: 8, background: '#FFE600', color: '#0F0F17', border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Zap style={{ width: 13, height: 13 }} />
                    {suggestPending ? 'Generating…' : 'Get AI Suggestions'}
                  </button>
                </div>

                {!suggestionsData ? (
                  <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-tertiary)' }}>
                    <Zap style={{ width: 40, height: 40, marginBottom: 12, opacity: 0.3 }} />
                    <p>Click "Get AI Suggestions" to surface high-confidence candidate pairs</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(suggestionsData.items || suggestionsData || []).map((s, i) => {
                      const conf = s.confidence || 0
                      const color = conf >= 0.85 ? '#00C891' : conf >= 0.65 ? '#FFE600' : '#FF4D4D'
                      return (
                        <div key={i} style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, borderLeft: `3px solid ${color}` }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#4D94FF', fontFamily: 'monospace' }}>
                                {s.left_reference || `Rec #${s.left_record_id}`}
                              </span>
                              <ArrowLeftRight style={{ width: 12, height: 12, color: 'var(--text-tertiary)' }} />
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#00C891', fontFamily: 'monospace' }}>
                                {s.right_reference || `Rec #${s.right_record_id}`}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--text-tertiary)' }}>
                              <span>Confidence: <strong style={{ color }}>{Math.round(conf * 100)}%</strong></span>
                              <span>Amount Delta: <strong style={{ color: Math.abs(s.amount_delta) > 0 ? '#FFE600' : '#00C891' }}>{fmt(s.amount_delta)}</strong></span>
                            </div>
                          </div>
                          <ConfBar value={conf} />
                          <button
                            onClick={() => {
                              manualMatchMutation.mutate.call(null)
                              matchingAPI.createManualMatch({
                                profile_id: Number(profileId),
                                source_ids: [s.left_record_id],
                                target_ids: [s.right_record_id],
                                notes: `AI suggestion (confidence: ${Math.round(conf * 100)}%)`,
                              }).then(() => {
                                toast.success('Suggestion accepted as confirmed match')
                                refetchGroups(); refetchSummary(); refetchUnmatched()
                              }).catch(e => toast.error(e?.response?.data?.detail || 'Accept failed'))
                            }}
                            style={{ padding: '5px 12px', borderRadius: 7, background: '#00C89118', border: '1px solid #00C89133', color: '#00C891', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                          >
                            Accept Match
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── TAB: Audit Trail ──────────────────────────────────────────── */}
            {activeTab === 'audit' && (
              <div>
                <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700 }}>Match Audit Trail</h3>
                {!auditData || auditData.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-tertiary)' }}>
                    <Clock style={{ width: 40, height: 40, marginBottom: 12, opacity: 0.3 }} />
                    <p>No confirmed or rejected matches yet. Audit events appear here as matches are reviewed.</p>
                  </div>
                ) : (
                  <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 10, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: 'var(--surface-3)' }}>
                          {['Group', 'Classification', 'Strategy', 'Review', 'By', 'Variance', 'Time', 'Notes'].map(h => (
                            <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.3px', borderBottom: '1px solid var(--border-1)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {auditData.map((a, i) => {
                          const rc = REVIEW_COLOR[a.review_status] || '#94A3B8'
                          const cc = CLS_COLOR[a.classification] || '#94A3B8'
                          return (
                            <tr key={a.group_id} style={{ borderBottom: '1px solid var(--border-0)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-1)' }}>
                              <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 11 }}>#{a.group_id}</td>
                              <td style={{ padding: '9px 14px' }}><Badge label={a.classification} color={cc} /></td>
                              <td style={{ padding: '9px 14px', fontSize: 11 }}>{STRATEGY_LABEL[a.strategy] || a.strategy}</td>
                              <td style={{ padding: '9px 14px' }}><Badge label={a.review_status} color={rc} /></td>
                              <td style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text-secondary)' }}>
                                {a.confirmed_by || a.rejected_by || '—'}
                              </td>
                              <td style={{ padding: '9px 14px', fontSize: 11, fontFamily: 'monospace', color: a.variance > 0 ? '#FFE600' : 'var(--text-tertiary)' }}>
                                {a.variance > 0.01 ? fmt(a.variance) : 'Exact'}
                              </td>
                              <td style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text-tertiary)' }}>
                                {relTime(a.confirmed_at || a.rejected_at || a.created_at)}
                              </td>
                              <td style={{ padding: '9px 14px', fontSize: 10, color: 'var(--text-tertiary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {a.notes || a.rejected_reason || '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      `}</style>
    </div>
  )
}
