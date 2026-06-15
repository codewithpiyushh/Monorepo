// frontend/src/pages/AgingDashboard.jsx
// Exception Aging Analysis Dashboard
// Styling mirrors ExceptionWorkbench.jsx and BalanceReconciliationPage.jsx exactly.

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Clock, AlertTriangle, AlertOctagon, ShieldAlert,
  CheckCircle2, Filter, RefreshCw, TrendingUp,
  ChevronDown, ChevronUp, Zap, Calendar, User,
  BarChart2, Activity,
} from 'lucide-react'
import agingAPI from '../api/agingAPI'
import { useAuthStore } from '../store/authStore'
import { normalizeRole } from '../utils/roles'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, LoadingState } from '../components/ui/PageState'

// ── Constants ──────────────────────────────────────────────────────────────

const BUCKET_META = {
  CURRENT:  { label: '0–30 Days',  color: '#22c55e', bg: 'rgba(34,197,94,0.10)',   border: 'rgba(34,197,94,0.25)',   icon: CheckCircle2,  severity: 'Current'  },
  WARNING:  { label: '31–60 Days', color: '#eab308', bg: 'rgba(234,179,8,0.10)',   border: 'rgba(234,179,8,0.25)',   icon: Clock,         severity: 'Warning'  },
  BREACH:   { label: '61–90 Days', color: '#f97316', bg: 'rgba(249,115,22,0.10)',  border: 'rgba(249,115,22,0.25)',  icon: AlertTriangle, severity: 'Breach'   },
  CRITICAL: { label: '90+ Days',   color: '#ef4444', bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.25)',   icon: AlertOctagon,  severity: 'Critical' },
}

const BUCKET_ORDER = ['CURRENT', 'WARNING', 'BREACH', 'CRITICAL']

const STATUS_META = {
  OPEN:        { color: '#ef4444', label: 'Open' },
  IN_PROGRESS: { color: '#eab308', label: 'In Progress' },
  ESCALATED:   { color: '#c026d3', label: 'Escalated' },
  RESOLVED:    { color: '#22c55e', label: 'Resolved' },
  CLOSED:      { color: '#6b7280', label: 'Closed' },
}

const RISK_META = {
  LOW:      { color: '#22c55e' },
  MEDIUM:   { color: '#eab308' },
  HIGH:     { color: '#f97316' },
  CRITICAL: { color: '#ef4444' },
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { color: 'var(--text-tertiary)', label: status || '—' }
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 9999,
      border: `1px solid ${m.color}33`, color: m.color, background: `${m.color}14`,
    }}>{m.label}</span>
  )
}

function RiskBadge({ risk }) {
  const m = RISK_META[risk] || { color: 'var(--text-tertiary)' }
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 9999,
      border: `1px solid ${m.color}33`, color: m.color, background: `${m.color}14`,
    }}>{risk || '—'}</span>
  )
}

// ── Aging KPI Card ────────────────────────────────────────────────────────────

function AgingKpiCard({ bucket, data, isSelected, onClick }) {
  const meta = BUCKET_META[bucket]
  const Icon = meta.icon
  const count = data?.exception_count ?? 0
  const amount = data?.total_exception_amount ?? 0
  const avgAge = data?.average_age_days ?? 0

  return (
    <div
      onClick={() => onClick(isSelected ? null : bucket)}
      style={{
        flex: 1, minWidth: 160, cursor: 'pointer',
        padding: '18px 20px', borderRadius: 12,
        background: isSelected ? meta.bg : 'var(--surface-1)',
        border: `2px solid ${isSelected ? meta.color : 'var(--border-0)'}`,
        transition: 'all 0.18s ease',
        boxShadow: isSelected ? `0 0 0 3px ${meta.color}22` : 'none',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: meta.bg, border: `1px solid ${meta.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={15} color={meta.color} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: meta.color, letterSpacing: 0.3 }}>
              {meta.severity.toUpperCase()}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{meta.label}</div>
          </div>
        </div>
        {isSelected && (
          <div style={{
            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 6,
            background: meta.color, color: '#fff',
          }}>ACTIVE</div>
        )}
      </div>

      {/* Count */}
      <div style={{ fontSize: 32, fontWeight: 800, color: count > 0 ? meta.color : 'var(--text-tertiary)', lineHeight: 1, marginBottom: 10 }}>
        {count}
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
          <span style={{ color: 'var(--text-tertiary)' }}>Total Amount</span>
          <span style={{ fontWeight: 600, color: amount > 0 ? meta.color : 'var(--text-secondary)' }}>
            ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
          <span style={{ color: 'var(--text-tertiary)' }}>Avg Age</span>
          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
            {avgAge} days
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ marginTop: 10, height: 3, background: 'var(--border-0)', borderRadius: 2 }}>
        <div style={{
          height: '100%', borderRadius: 2,
          background: count > 0 ? meta.color : 'var(--border-0)',
          width: '100%', opacity: count > 0 ? 1 : 0.2,
        }} />
      </div>
    </div>
  )
}

// ── Trend Chart ───────────────────────────────────────────────────────────────

function TrendWidget({ trend = [] }) {
  if (!trend.length) return null

  const maxVal = Math.max(...trend.flatMap(r => BUCKET_ORDER.map(b => r[b] || 0)), 1)

  return (
    <div style={{
      background: 'var(--surface-1)', border: '1px solid var(--border-0)',
      borderRadius: 12, padding: '20px 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <Activity size={15} color="var(--text-tertiary)" />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          Aging Trend — Month over Month
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
          {BUCKET_ORDER.map(b => (
            <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: BUCKET_META[b].color }} />
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{BUCKET_META[b].severity}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }}>
        {trend.map((row, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            {/* Stacked bars */}
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column-reverse', gap: 1, height: 100 }}>
              {BUCKET_ORDER.map(b => {
                const val = row[b] || 0
                const heightPct = val > 0 ? Math.max((val / maxVal) * 100, 4) : 0
                return (
                  <div
                    key={b}
                    title={`${BUCKET_META[b].severity}: ${val}`}
                    style={{
                      width: '100%',
                      height: `${heightPct}%`,
                      background: BUCKET_META[b].color,
                      borderRadius: 2,
                      opacity: val > 0 ? 0.85 : 0,
                      transition: 'height 0.3s ease',
                    }}
                  />
                )
              })}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
              {row.period?.slice(5)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Exception Row ─────────────────────────────────────────────────────────────

function ExceptionRow({ exc }) {
  const [expanded, setExpanded] = useState(false)
  const meta = BUCKET_META[exc.bucket] || BUCKET_META.CURRENT
  const Icon = meta.icon

  return (
    <div style={{
      background: 'var(--surface-1)',
      border: `1px solid ${exc.bucket === 'CRITICAL' || exc.bucket === 'BREACH'
        ? meta.border : 'var(--border-0)'}`,
      borderRadius: 10, overflow: 'hidden', marginBottom: 8,
    }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px', cursor: 'pointer',
        }}
      >
        {/* Age badge */}
        <div style={{
          width: 52, height: 52, borderRadius: 10, flexShrink: 0,
          background: meta.bg, border: `1px solid ${meta.border}`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={14} color={meta.color} />
          <span style={{ fontSize: 11, fontWeight: 800, color: meta.color, lineHeight: 1, marginTop: 2 }}>
            {exc.age_days}d
          </span>
        </div>

        {/* Main info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              Exception #{exc.id}
            </span>
            <StatusBadge status={exc.status} />
            {exc.risk_classification && <RiskBadge risk={exc.risk_classification} />}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {exc.profile_name ? `Profile: ${exc.profile_name}` : `Match Group #${exc.match_group_id}`}
            {exc.classification ? ` · ${exc.classification.replace('_', ' ')}` : ''}
          </div>
        </div>

        {/* Variance */}
        {exc.variance_amount !== null && exc.variance_amount !== undefined && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 2 }}>Variance</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: meta.color }}>
              ${exc.variance_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
        )}

        {/* Bucket pill */}
        <div style={{
          padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
          color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`,
          flexShrink: 0,
        }}>
          {meta.severity}
        </div>

        {expanded
          ? <ChevronUp size={14} color="var(--text-tertiary)" />
          : <ChevronDown size={14} color="var(--text-tertiary)" />
        }
      </div>

      {expanded && (
        <div style={{
          borderTop: '1px solid var(--border-0)',
          padding: '14px 16px',
          background: 'var(--surface-0)',
        }}>
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 12 }}>
            {[
              { label: 'Created',      value: exc.created_at ? new Date(exc.created_at).toLocaleDateString() : '—' },
              { label: 'Age',          value: `${exc.age_days} days` },
              { label: 'Assigned To',  value: exc.assigned_to ? `User #${exc.assigned_to}` : 'Unassigned' },
              { label: 'Queue Type',   value: exc.queue_type || '—' },
              { label: 'Escalated',    value: exc.escalated_at ? new Date(exc.escalated_at).toLocaleDateString() : 'No' },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{value}</div>
              </div>
            ))}
          </div>

          {exc.comments && (
            <div style={{
              padding: '8px 12px', borderRadius: 7,
              background: 'var(--surface-2)',
              fontSize: 12, color: 'var(--text-secondary)',
              borderLeft: `3px solid ${meta.color}`,
            }}>
              {exc.comments}
            </div>
          )}

          {/* Aging escalation indicator */}
          {exc.age_days >= 61 && (
            <div style={{
              marginTop: 10, padding: '8px 12px', borderRadius: 7,
              background: meta.bg, border: `1px solid ${meta.border}`,
              fontSize: 11, color: meta.color, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Zap size={12} />
              {exc.age_days >= 120
                ? 'SEVERE — Admin notified. Immediate action required.'
                : exc.age_days >= 90
                  ? 'CRITICAL — Certifier notified. Escalation active.'
                  : 'BREACH — Reviewer notified. Review required.'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AgingDashboard() {
  const { user } = useAuthStore()
  const role = normalizeRole(user?.role)
  const qc = useQueryClient()
  const isAdmin = role === 'admin'

  const [selectedBucket, setSelectedBucket] = useState(null)
  const [filterProfile, setFilterProfile]   = useState('')
  const [filterRisk, setFilterRisk]         = useState('')
  const [filterStatus, setFilterStatus]     = useState('')
  const [page, setPage]                     = useState(1)

  // Shared filter params
  const filterParams = useMemo(() => ({
    ...(filterProfile ? { profile_id: parseInt(filterProfile) } : {}),
    ...(filterRisk    ? { risk_classification: filterRisk }      : {}),
    ...(filterStatus  ? { status: filterStatus }                  : {}),
  }), [filterProfile, filterRisk, filterStatus])

  // ── Queries ────────────────────────────────────────────────────────────
  const summaryQ = useQuery({
    queryKey: ['aging-summary', filterParams],
    queryFn:  () => agingAPI.getSummary(filterParams),
    staleTime: 30_000,
  })

  const detailsQ = useQuery({
    queryKey: ['aging-details', selectedBucket, filterParams, page],
    queryFn:  () => agingAPI.getDetails({
      ...filterParams,
      ...(selectedBucket ? { bucket: selectedBucket } : {}),
      page,
      page_size: 20,
      sort_by: 'age_days',
      sort_desc: true,
    }),
    keepPreviousData: true,
    staleTime: 15_000,
  })

  const trendQ = useQuery({
    queryKey: ['aging-trend', filterProfile],
    queryFn:  () => agingAPI.getTrend({
      months: 6,
      ...(filterProfile ? { profile_id: parseInt(filterProfile) } : {}),
    }),
    staleTime: 60_000,
  })

  // ── Mutations (admin only) ─────────────────────────────────────────────
  const escalateMut = useMutation({
    mutationFn: agingAPI.runEscalations,
    onSuccess: (data) => {
      toast.success(`Escalation run complete — ${data.total} triggered.`)
      qc.invalidateQueries({ queryKey: ['aging-summary'] })
    },
    onError: () => toast.error('Escalation run failed.'),
  })

  const snapshotMut = useMutation({
    mutationFn: agingAPI.writeSnapshot,
    onSuccess: (data) => {
      if (data.skipped) toast(`Snapshot skipped: ${data.reason}`, { icon: 'ℹ️' })
      else toast.success(`Snapshot written — ${data.written} records for ${data.period}.`)
      qc.invalidateQueries({ queryKey: ['aging-trend'] })
    },
    onError: () => toast.error('Snapshot write failed.'),
  })

  // ── Derived ────────────────────────────────────────────────────────────
  const summary       = summaryQ.data
  const bucketMap     = useMemo(() => {
    if (!summary?.buckets) return {}
    return Object.fromEntries(summary.buckets.map(b => [b.bucket, b]))
  }, [summary])

  const details       = detailsQ.data
  const items         = details?.items || []
  const totalItems    = details?.total || 0
  const totalPages    = Math.ceil(totalItems / 20)
  const trend         = trendQ.data || []

  const resetFilters = () => {
    setSelectedBucket(null)
    setFilterProfile('')
    setFilterRisk('')
    setFilterStatus('')
    setPage(1)
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        title="Exception Aging Analysis"
        subtitle="Track exception age, escalations, and aging trends across reconciliation profiles"
        icon={<Clock size={22} />}
        actions={
          isAdmin ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => snapshotMut.mutate()}
                disabled={snapshotMut.isPending}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', borderRadius: 8,
                  border: '1px solid var(--border-1)', background: 'transparent',
                  color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12,
                }}
              >
                <BarChart2 size={13} />
                {snapshotMut.isPending ? 'Snapshotting…' : 'Write Snapshot'}
              </button>
              <button
                onClick={() => escalateMut.mutate()}
                disabled={escalateMut.isPending}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', borderRadius: 8, border: 'none',
                  background: '#ef4444', color: '#fff', fontWeight: 700,
                  cursor: 'pointer', fontSize: 12,
                }}
              >
                <Zap size={13} />
                {escalateMut.isPending ? 'Running…' : 'Run Escalations'}
              </button>
            </div>
          ) : null
        }
      />

      {/* Summary totals bar */}
      {summary && (
        <div style={{
          display: 'flex', gap: 20, marginBottom: 24, padding: '14px 20px',
          background: 'var(--surface-1)', border: '1px solid var(--border-0)',
          borderRadius: 10, flexWrap: 'wrap',
        }}>
          {[
            { label: 'Total Exceptions',  value: summary.total_count },
            { label: 'Total Variance',    value: `$${(summary.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
            { label: 'Avg Age',           value: `${summary.overall_average_age} days` },
            { label: 'Oldest',            value: `${summary.oldest_exception_days} days` },
          ].map(({ label, value }) => (
            <div key={label} style={{ flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {label}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Four Aging KPI Cards */}
      {summaryQ.isLoading ? (
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          {BUCKET_ORDER.map(b => (
            <div key={b} style={{ flex: 1, height: 160, background: 'var(--surface-1)', borderRadius: 12, border: '1px solid var(--border-0)' }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          {BUCKET_ORDER.map(bucket => (
            <AgingKpiCard
              key={bucket}
              bucket={bucket}
              data={bucketMap[bucket]}
              isSelected={selectedBucket === bucket}
              onClick={(b) => { setSelectedBucket(b); setPage(1) }}
            />
          ))}
        </div>
      )}

      {/* Trend widget */}
      {trend.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <TrendWidget trend={trend} />
        </div>
      )}

      {/* Filters row */}
      <div style={{
        display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16,
        padding: '12px 16px', background: 'var(--surface-1)',
        border: '1px solid var(--border-0)', borderRadius: 10, flexWrap: 'wrap',
      }}>
        <Filter size={13} color="var(--text-tertiary)" />

        {selectedBucket && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
            color: BUCKET_META[selectedBucket].color,
            background: BUCKET_META[selectedBucket].bg,
            border: `1px solid ${BUCKET_META[selectedBucket].border}`,
          }}>
            {BUCKET_META[selectedBucket].severity}
            <button
              onClick={() => setSelectedBucket(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, fontSize: 14, lineHeight: 1 }}
            >×</button>
          </div>
        )}

        <select
          value={filterRisk}
          onChange={e => { setFilterRisk(e.target.value); setPage(1) }}
          style={{
            padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border-1)',
            background: 'var(--surface-0)', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer',
          }}
        >
          <option value="">All Risk Levels</option>
          {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
          style={{
            padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border-1)',
            background: 'var(--surface-0)', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer',
          }}
        >
          <option value="">All Statuses</option>
          {Object.keys(STATUS_META).map(s => (
            <option key={s} value={s}>{STATUS_META[s].label}</option>
          ))}
        </select>

        <input
          type="number"
          placeholder="Profile ID"
          value={filterProfile}
          onChange={e => { setFilterProfile(e.target.value); setPage(1) }}
          style={{
            padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border-1)',
            background: 'var(--surface-0)', color: 'var(--text-primary)', fontSize: 12,
            width: 110, outline: 'none',
          }}
        />

        <button
          onClick={resetFilters}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border-1)',
            background: 'transparent', color: 'var(--text-secondary)',
            cursor: 'pointer', fontSize: 12,
          }}
        >
          <RefreshCw size={12} /> Reset
        </button>

        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)' }}>
          {totalItems} exception{totalItems !== 1 ? 's' : ''}
          {selectedBucket ? ` in ${BUCKET_META[selectedBucket].severity}` : ''}
        </span>
      </div>

      {/* Exception list */}
      {detailsQ.isLoading ? (
        <LoadingState message="Loading exceptions…" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={40} color="#22c55e" />}
          title={selectedBucket ? `No ${BUCKET_META[selectedBucket].severity} exceptions` : 'No exceptions found'}
          message={selectedBucket
            ? `No exceptions in the ${BUCKET_META[selectedBucket].label} range match your filters.`
            : 'All exceptions are current or your filters returned no results.'}
        />
      ) : (
        <>
          {items.map(exc => (
            <ExceptionRow key={exc.id} exc={exc} />
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 20 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  padding: '6px 14px', borderRadius: 7, border: '1px solid var(--border-1)',
                  background: 'transparent',
                  color: page === 1 ? 'var(--text-tertiary)' : 'var(--text-primary)',
                  cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 12,
                }}
              >← Prev</button>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{
                  padding: '6px 14px', borderRadius: 7, border: '1px solid var(--border-1)',
                  background: 'transparent',
                  color: page === totalPages ? 'var(--text-tertiary)' : 'var(--text-primary)',
                  cursor: page === totalPages ? 'not-allowed' : 'pointer', fontSize: 12,
                }}
              >Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
