// frontend/src/pages/FinancialCloseCalendarPage.jsx
//
// Financial Close Calendar — Phase 2, Chunk 3.
// Period Overview Grid + KPI cards + Progress Tracker + 3 charts
// (Close Burndown, Certification Progress, Variance Density Heatmap) +
// drilldown task table linking out to Balance Reconciliation, Aging
// Dashboard, Workflow Lifecycle (embedded in the balance page) and
// Variance Analytics.
//
// Styling mirrors AgingDashboard.jsx / RiskDashboard.jsx exactly.

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import ReactECharts from 'echarts-for-react'
import {
  Calendar, CheckCircle2, AlertTriangle, AlertOctagon, Clock,
  TrendingDown, Lock, Unlock, Plus, ChevronRight, ChevronDown, ChevronUp,
  Users, ShieldAlert, ListChecks, X, ExternalLink, RefreshCw,
} from 'lucide-react'
import closeCalendarAPI from '../api/closeCalendarAPI'
import { useAuthStore } from '../store/authStore'
import { normalizeRole } from '../utils/roles'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, LoadingState, ErrorState } from '../components/ui/PageState'

// ── Palette (matches RiskDashboard.jsx) ─────────────────────────────────────
const C = {
  accent: '#6366f1', ok: '#22c55e', warn: '#f59e0b', bad: '#ef4444',
  orange: '#f97316', muted: '#64748b',
}
const ECHART_BASE = {
  backgroundColor: 'transparent',
  textStyle: { color: '#94a3b8', fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 11 },
}

const STATUS_META = {
  OPEN:             { label: 'Open',             color: C.muted,  bg: 'rgba(100,116,139,0.12)' },
  IN_PROGRESS:      { label: 'In Progress',       color: C.accent, bg: 'rgba(99,102,241,0.12)'  },
  READY_FOR_CLOSE:  { label: 'Ready for Close',   color: C.warn,   bg: 'rgba(245,158,11,0.12)'  },
  CLOSED:           { label: 'Closed',            color: C.ok,     bg: 'rgba(34,197,94,0.12)'   },
}

const TASK_META = {
  NOT_STARTED:  { label: 'Not Started', color: C.muted },
  IN_PROGRESS:  { label: 'In Progress', color: C.accent },
  UNDER_REVIEW: { label: 'Under Review', color: C.warn },
  CERTIFIED:    { label: 'Certified',    color: C.ok },
  OVERDUE:      { label: 'Overdue',      color: C.bad },
}

function fmtDate(s) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return s }
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  try {
    const diff = (new Date(dateStr) - new Date())
    return Math.ceil(diff / 86400000)
  } catch { return null }
}

// ── KPI Card ─────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, color, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface-1)', border: '1px solid var(--border-0)',
        borderRadius: 12, padding: '16px 18px', flex: 1, minWidth: 150,
        cursor: onClick ? 'pointer' : 'default', transition: 'border-color 120ms',
      }}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.borderColor = 'var(--border-2)' }}
      onMouseLeave={(e) => { if (onClick) e.currentTarget.style.borderColor = 'var(--border-0)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: `${color}18`, border: `1px solid ${color}33`,
        }}>
          <Icon size={14} color={color} />
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
        {value}
      </div>
    </div>
  )
}

// ── Progress Tracker (lifecycle stepper) ────────────────────────────────────

function ProgressTracker({ completionPct, certificationPct }) {
  const stage = certificationPct >= 100 ? 3 : completionPct >= 100 ? 2 : completionPct > 0 ? 1 : 0
  const labels = ['Not Started', 'In Progress', 'Under Review', 'Certified']

  return (
    <div style={{
      background: 'var(--surface-1)', border: '1px solid var(--border-0)',
      borderRadius: 12, padding: '18px 22px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        {labels.map((label, i) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', flex: i < labels.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: i <= stage ? C.accent : 'var(--surface-3)',
                border: `1px solid ${i <= stage ? C.accent : 'var(--border-1)'}`,
                color: i <= stage ? '#fff' : 'var(--text-tertiary)',
                fontSize: 11, fontWeight: 700,
              }}>
                {i < stage ? <CheckCircle2 size={13} /> : i + 1}
              </div>
              <span style={{
                fontSize: 10, fontWeight: i === stage ? 700 : 500,
                color: i <= stage ? 'var(--text-primary)' : 'var(--text-tertiary)',
                whiteSpace: 'nowrap',
              }}>{label}</span>
            </div>
            {i < labels.length - 1 && (
              <div style={{ flex: 1, height: 2, margin: '0 8px', marginBottom: 18, background: i < stage ? C.accent : 'var(--border-1)' }} />
            )}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 24 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
            <span style={{ color: 'var(--text-tertiary)' }}>Completion</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{completionPct.toFixed(0)}%</span>
          </div>
          <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${completionPct}%`, background: C.accent, borderRadius: 4, transition: 'width 0.3s' }} />
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
            <span style={{ color: 'var(--text-tertiary)' }}>Certification</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{certificationPct.toFixed(0)}%</span>
          </div>
          <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${certificationPct}%`, background: C.ok, borderRadius: 4, transition: 'width 0.3s' }} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Close Burndown Chart ────────────────────────────────────────────────────

function BurndownChart({ points }) {
  if (!points?.length) return null
  const option = {
    ...ECHART_BASE,
    grid: { left: 36, right: 16, top: 24, bottom: 28 },
    legend: { data: ['Remaining', 'Completed'], top: 0, textStyle: { color: '#94a3b8', fontSize: 10 } },
    xAxis: {
      type: 'category', data: points.map(p => p.day_label),
      axisLabel: { color: '#64748b', fontSize: 10 }, axisLine: { lineStyle: { color: '#1e293b' } },
    },
    yAxis: { type: 'value', axisLabel: { color: '#64748b', fontSize: 10 }, splitLine: { lineStyle: { color: '#1e293b' } } },
    series: [
      { name: 'Remaining', type: 'line', smooth: true, data: points.map(p => p.remaining_tasks),
        lineStyle: { color: C.bad, width: 2 }, itemStyle: { color: C.bad },
        areaStyle: { color: 'rgba(239,68,68,0.08)' } },
      { name: 'Completed', type: 'line', smooth: true, data: points.map(p => p.completed_tasks),
        lineStyle: { color: C.ok, width: 2 }, itemStyle: { color: C.ok } },
    ],
  }
  return <ReactECharts option={option} style={{ height: 220 }} notMerge />
}

// ── Certification Progress Chart ────────────────────────────────────────────

function CertificationProgressChart({ completed, certified, total }) {
  const inProgress = Math.max(completed - certified, 0)
  const notStarted = Math.max(total - completed, 0)

  const option = {
    ...ECHART_BASE,
    series: [{
      type: 'pie', radius: ['55%', '80%'], center: ['50%', '50%'],
      label: { show: false },
      data: [
        { value: certified, name: 'Certified', itemStyle: { color: C.ok } },
        { value: inProgress, name: 'Completed (not certified)', itemStyle: { color: C.accent } },
        { value: notStarted, name: 'Remaining', itemStyle: { color: '#334155' } },
      ],
    }],
    legend: { bottom: 0, textStyle: { color: '#94a3b8', fontSize: 10 } },
    graphic: {
      type: 'text', left: 'center', top: '38%',
      style: {
        text: `${total ? Math.round((certified / total) * 100) : 0}%`,
        fill: '#e2e8f0', fontSize: 26, fontWeight: 800,
      },
    },
  }
  return <ReactECharts option={option} style={{ height: 220 }} notMerge />
}

// ── Variance Density Heatmap ─────────────────────────────────────────────────

const CLASS_SCORE = { BALANCED: 0, WITHIN_THRESHOLD: 1, MATERIAL_VARIANCE: 2, CRITICAL_VARIANCE: 3 }

function VarianceHeatmap({ cells }) {
  if (!cells?.length) return null
  const risks = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
  const profiles = [...new Set(cells.map(c => c.profile_name))]

  const data = cells.map(c => [
    profiles.indexOf(c.profile_name),
    risks.indexOf(c.risk),
    CLASS_SCORE[c.classification] ?? 0,
    c.variance_pct,
    c.classification,
  ])

  const option = {
    ...ECHART_BASE,
    tooltip: {
      formatter: (p) => `${profiles[p.value[0]]}<br/>Risk: ${risks[p.value[1]]}<br/>Variance: ${p.value[3]}%<br/>${p.value[4]}`,
    },
    grid: { left: 110, right: 16, top: 10, bottom: 60 },
    xAxis: { type: 'category', data: profiles, axisLabel: { color: '#64748b', fontSize: 9, rotate: 35, interval: 0 }, splitArea: { show: true } },
    yAxis: { type: 'category', data: risks, axisLabel: { color: '#64748b', fontSize: 10 }, splitArea: { show: true } },
    visualMap: {
      min: 0, max: 3, calculable: false, orient: 'horizontal', left: 'center', bottom: 0,
      textStyle: { color: '#94a3b8', fontSize: 9 },
      inRange: { color: [C.ok, C.warn, C.orange, C.bad] },
    },
    series: [{
      type: 'heatmap', data,
      itemStyle: { borderRadius: 3, borderColor: 'var(--surface-0)', borderWidth: 2 },
    }],
  }
  return <ReactECharts option={option} style={{ height: 260 }} notMerge />
}

// ── Blocker list (close readiness validation result) ────────────────────────

function BlockerList({ blockers }) {
  if (!blockers?.length) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px',
        background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
        borderRadius: 8, color: C.ok, fontSize: 13, fontWeight: 600,
      }}>
        <CheckCircle2 size={16} /> All close readiness checks passed.
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {blockers.map((b, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7,
        }}>
          <AlertOctagon size={14} color={C.bad} style={{ marginTop: 1, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
              {b.profile_name} — {b.reference_label}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
              {b.detail}{b.age_days != null ? ` (${b.age_days} days old)` : ''}
            </div>
          </div>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
            color: C.bad, background: 'rgba(239,68,68,0.12)', whiteSpace: 'nowrap',
          }}>
            {b.category.replace(/_/g, ' ')}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Period detail panel (dashboard + tasks + close action) ──────────────────

function PeriodDetailPanel({ periodId, onClose, isAdmin }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showValidation, setShowValidation] = useState(false)
  const [myTasksOnly, setMyTasksOnly] = useState(false)

  const dashboardQ = useQuery({
    queryKey: ['close-calendar-dashboard', periodId],
    queryFn: () => closeCalendarAPI.getDashboard(periodId),
  })

  const tasksQ = useQuery({
    queryKey: ['close-calendar-tasks', periodId, myTasksOnly],
    queryFn: () => closeCalendarAPI.getTasks(periodId, myTasksOnly),
  })

  const validateQ = useQuery({
    queryKey: ['close-calendar-validate', periodId],
    queryFn: () => closeCalendarAPI.validateClose(periodId),
    enabled: showValidation,
  })

  const closeMut = useMutation({
    mutationFn: () => closeCalendarAPI.closePeriod(periodId),
    onSuccess: (data) => {
      toast.success(data.message || 'Period closed successfully.')
      qc.invalidateQueries({ queryKey: ['close-calendar-periods'] })
      qc.invalidateQueries({ queryKey: ['close-calendar-dashboard', periodId] })
    },
    onError: (err) => {
      const detail = err?.response?.data?.detail
      if (detail?.blockers) {
        setShowValidation(true)
        toast.error(`Cannot close — ${detail.blockers.length} blocking issue(s) found.`)
      } else {
        toast.error(detail?.message || detail || 'Close attempt failed.')
      }
    },
  })

  const d = dashboardQ.data
  const tasks = tasksQ.data?.tasks || []

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50,
      display: 'flex', justifyContent: 'flex-end',
    }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(820px, 96vw)', height: '100%', background: 'var(--surface-0)',
          borderLeft: '1px solid var(--border-1)', overflowY: 'auto', padding: '24px 28px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              {d?.period?.period_name || 'Loading…'}
            </h2>
            {d?.period && (
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                Due {fmtDate(d.period.due_date)} · {d.period.total_profiles} profiles
              </div>
            )}
          </div>
          <button onClick={onClose} className="btn-secondary btn-sm" style={{ padding: 6 }}>
            <X size={16} />
          </button>
        </div>

        {dashboardQ.isLoading && <LoadingState message="Loading close period dashboard…" />}
        {dashboardQ.isError && <ErrorState message="Failed to load dashboard" onRetry={dashboardQ.refetch} />}

        {d && (
          <>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <KpiCard icon={TrendingDown} label="Open Variances" value={d.open_variances} color={C.warn} />
              <KpiCard icon={ShieldAlert} label="Material Breaches" value={d.material_breaches} color={C.bad} />
              <KpiCard icon={Clock} label="Aging Exceptions" value={d.aging_exceptions} color={C.orange} />
              <KpiCard icon={AlertOctagon} label="Overdue Tasks" value={d.overdue_tasks} color={C.bad} />
            </div>

            {/* SLA Panel removed */}

            <div style={{ marginBottom: 20 }}>
              <ProgressTracker completionPct={d.completion_pct} certificationPct={d.certification_pct} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border-0)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Close Burndown</div>
                <BurndownChart points={d.burndown} />
              </div>
              <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border-0)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Certification Progress</div>
                <CertificationProgressChart
                  completed={d.period.completed_profiles} certified={d.period.certified_profiles} total={d.period.total_profiles}
                />
              </div>
            </div>

            {d.variance_density?.length > 0 && (
              <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border-0)', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Variance Density by Profile / Risk</div>
                <VarianceHeatmap cells={d.variance_density} />
              </div>
            )}

            {d.approval_bottlenecks?.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                  Approval Bottlenecks
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {d.approval_bottlenecks.map((b, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                      background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 7,
                    }}>
                      <Clock size={13} color={C.warn} />
                      <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>{b.profile_name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        stuck at {b.stuck_stage} ({b.stuck_role}) — {b.days_stuck}d
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Task drilldown table ───────────────────────────────────── */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                  <ListChecks size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
                  Profile Tasks ({tasks.length})
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-tertiary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={myTasksOnly} onChange={(e) => setMyTasksOnly(e.target.checked)} />
                  My tasks only
                </label>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {tasks.map((t) => {
                  const meta = TASK_META[t.is_overdue ? 'OVERDUE' : t.task_status] || TASK_META.NOT_STARTED
                  return (
                    <div key={t.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      background: 'var(--surface-1)', border: '1px solid var(--border-0)', borderRadius: 8,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>{t.profile_name}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
                          {t.risk_classification || 'MEDIUM'} risk · Due {fmtDate(t.target_due_date)}
                        </div>
                      </div>
                      <div style={{ width: 80 }}>
                        <div style={{ height: 5, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${t.completion_percentage}%`, background: meta.color, borderRadius: 3 }} />
                        </div>
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                        color: meta.color, background: `${meta.color}18`, whiteSpace: 'nowrap',
                      }}>
                        {meta.label}
                      </span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {t.balance_id && (
                          <button
                            title="Open Balance Reconciliation"
                            onClick={() => navigate(`/balance-reconciliation/${t.balance_id}`)}
                            className="btn-secondary btn-sm" style={{ padding: '4px 6px' }}
                          >
                            <ExternalLink size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
                {!tasks.length && <EmptyState title="No tasks" description="No profile tasks match the current filter." />}
              </div>
            </div>

            {/* ── Drilldown shortcuts ─────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
              <button className="btn-secondary btn-sm" onClick={() => navigate('/aging-dashboard')}>
                <Clock size={12} /> Aging Dashboard
              </button>
              <button className="btn-secondary btn-sm" onClick={() => navigate('/variance-analytics')}>
                <TrendingDown size={12} /> Variance Analytics
              </button>
              <button className="btn-secondary btn-sm" onClick={() => navigate('/reconciliation-profiles')}>
                <Users size={12} /> Profiles & Workflow
              </button>
            </div>

            {/* ── Close readiness validation ──────────────────────────────── */}
            {isAdmin && d.period.close_status !== 'CLOSED' && (
              <div style={{ borderTop: '1px solid var(--border-1)', paddingTop: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Close Readiness Validation</span>
                  <button className="btn-secondary btn-sm" onClick={() => setShowValidation(s => !s)}>
                    {showValidation ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    {showValidation ? 'Hide' : 'Preview'} Blockers
                  </button>
                </div>

                {showValidation && (
                  <div style={{ marginBottom: 14 }}>
                    {validateQ.isLoading
                      ? <LoadingState message="Running readiness checks…" />
                      : <BlockerList blockers={validateQ.data?.blockers} />}
                  </div>
                )}

                <button
                  className="btn-primary"
                  disabled={closeMut.isPending}
                  onClick={() => closeMut.mutate()}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <Lock size={13} />
                  {closeMut.isPending ? 'Validating & Closing…' : `Close ${d.period.period_name}`}
                </button>
              </div>
            )}

            {d.period.close_status === 'CLOSED' && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px',
                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
                borderRadius: 8, color: C.ok, fontSize: 12.5, fontWeight: 600,
              }}>
                <Lock size={14} /> This period is closed and locked.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Create Period Modal ──────────────────────────────────────────────────

function CreatePeriodModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ period_name: '', period_key: '', start_date: '', due_date: '' })

  const createMut = useMutation({
    mutationFn: () => closeCalendarAPI.createPeriod(form),
    onSuccess: (data) => {
      toast.success(`'${data.period_name}' created — ${data.tasks_created} tasks generated.`)
      onCreated()
    },
    onError: (err) => toast.error(err?.response?.data?.detail || 'Failed to create period.'),
  })

  const valid = form.period_name && form.period_key && form.start_date && form.due_date

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 440, background: 'var(--surface-1)', border: '1px solid var(--border-1)',
        borderRadius: 14, padding: 24,
      }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 16 }}>
          New Close Period
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Period Name" value={form.period_name} onChange={v => setForm(f => ({ ...f, period_name: v }))} placeholder="June 2026 Month-End Close" />
          <Field label="Period Key" value={form.period_key} onChange={v => setForm(f => ({ ...f, period_key: v }))} placeholder="2026-06" />
          <Field label="Start Date" type="date" value={form.start_date} onChange={v => setForm(f => ({ ...f, start_date: v }))} />
          <Field label="Due Date" type="date" value={form.due_date} onChange={v => setForm(f => ({ ...f, due_date: v }))} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button className="btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn-primary btn-sm" disabled={!valid || createMut.isPending} onClick={() => createMut.mutate()}>
            {createMut.isPending ? 'Creating…' : 'Create Period'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4, fontWeight: 600 }}>{label}</label>
      <input
        type={type} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%', padding: '8px 10px', borderRadius: 7,
          border: '1px solid var(--border-1)', background: 'var(--surface-0)',
          color: 'var(--text-primary)', fontSize: 12.5,
        }}
      />
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────

export default function FinancialCloseCalendarPage() {
  const { user } = useAuthStore()
  const role = normalizeRole(user?.role)
  const isAdmin = role === 'admin'

  const [selectedPeriodId, setSelectedPeriodId] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const periodsQ = useQuery({
    queryKey: ['close-calendar-periods'],
    queryFn: () => closeCalendarAPI.listPeriods(),
    staleTime: 30_000,
  })

  const periods = periodsQ.data?.periods || []
  const kpis = periodsQ.data?.kpis

  return (
    <div style={{
      padding: '24px 32px', maxWidth: 1200, margin: '0 auto',
      height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0,
      boxSizing: 'border-box',
    }}>
      <PageHeader
        title="Financial Close Calendar"
        subtitle="Enterprise orchestration layer for monthly and quarterly close management"
        icon={<Calendar size={22} />}
        actions={
          isAdmin ? (
            <button className="btn-primary btn-sm" onClick={() => setShowCreateModal(true)}>
              <Plus size={13} /> New Close Period
            </button>
          ) : null
        }
      />

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', marginTop: 16, paddingRight: 4 }} className="slim-scroll">
        {periodsQ.isLoading && <LoadingState message="Loading close periods…" />}
        {periodsQ.isError && <ErrorState message="Failed to load close calendar" onRetry={periodsQ.refetch} />}

        {kpis && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <KpiCard icon={Calendar} label="Open Periods" value={kpis.open_periods} color={C.accent} />
            <KpiCard icon={Clock} label="Near Deadline" value={kpis.near_deadline} color={C.warn} />
            <KpiCard icon={AlertOctagon} label="Overdue Tasks" value={kpis.overdue_tasks} color={C.bad} />
            <KpiCard icon={TrendingDown} label="Material Variances" value={kpis.material_variances} color={C.orange} />
            <KpiCard icon={ListChecks} label="Pending Certifications" value={kpis.pending_certifications} color={C.muted} />
          </div>
        )}

        {!periodsQ.isLoading && !periods.length && (
          <EmptyState
            title="No close periods yet"
            description={isAdmin ? "Create your first close period to start tracking month-end progress." : "No close periods have been created yet."}
            action={isAdmin && (
              <button className="btn-primary btn-sm" onClick={() => setShowCreateModal(true)}>
                <Plus size={13} /> New Close Period
              </button>
            )}
          />
        )}

        {periods.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {periods.map((p) => {
              const meta = STATUS_META[p.close_status] || STATUS_META.OPEN
              const dleft = daysUntil(p.due_date)
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPeriodId(p.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px',
                    background: 'var(--surface-1)', border: '1px solid var(--border-0)',
                    borderRadius: 10, cursor: 'pointer', transition: 'border-color 120ms',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--border-2)'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-0)'}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                    background: meta.bg, border: `1px solid ${meta.color}33`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {p.close_status === 'CLOSED' ? <Lock size={16} color={meta.color} /> : <Calendar size={16} color={meta.color} />}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>{p.period_name}</span>
                      <span style={{
                        fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                        color: meta.color, background: meta.bg,
                      }}>{meta.label}</span>
                      {p.is_demo_data && (
                        <span style={{ fontSize: 9, color: 'var(--text-tertiary)', border: '1px solid var(--border-1)', borderRadius: 99, padding: '1px 6px' }}>DEMO</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      Due {fmtDate(p.due_date)}
                      {dleft != null && p.close_status !== 'CLOSED' && (
                        <span style={{ color: dleft < 0 ? C.bad : dleft <= 5 ? C.warn : 'var(--text-tertiary)', fontWeight: 600 }}>
                          {' '}· {dleft < 0 ? `${Math.abs(dleft)}d overdue` : `${dleft}d remaining`}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', width: 90 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Completion</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{p.completion_pct.toFixed(0)}%</div>
                  </div>
                  <div style={{ textAlign: 'right', width: 90 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Certified</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{p.certification_pct.toFixed(0)}%</div>
                  </div>
                  <div style={{ textAlign: 'right', width: 80 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Open Issues</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: p.open_issues > 0 ? C.bad : C.ok }}>{p.open_issues}</div>
                  </div>

                  <ChevronRight size={16} color="var(--text-tertiary)" />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {selectedPeriodId && (
        <PeriodDetailPanel
          periodId={selectedPeriodId}
          onClose={() => setSelectedPeriodId(null)}
          isAdmin={isAdmin}
        />
      )}

      {showCreateModal && (
        <CreatePeriodModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); periodsQ.refetch() }}
        />
      )}
    </div>
  )
}
