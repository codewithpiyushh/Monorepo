/**
 * RiskDashboard.jsx — Live Risk Scoring Engine UI
 *
 * Wired to:
 *   GET  /enterprise/dashboard/risk-real   → full dashboard payload
 *   GET  /enterprise/risk/scores?profile_id={id} → per-profile factor breakdown
 *   POST /enterprise/risk/calculate        → trigger batch re-score
 */
import { useMemo, useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useOutletContext } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import {
  ShieldAlert, ShieldCheck, AlertTriangle, Clock,
  RefreshCw, ChevronRight, CheckCircle2, Info, Zap,
} from 'lucide-react'
import { advancedAPI } from '../api'
import PageHeader from '../components/ui/PageHeader'
import { LoadingState, EmptyState } from '../components/ui/PageState'

// ── Palette ───────────────────────────────────────────────────────────────
const C = {
  accent:   '#6366f1',
  ok:       '#22c55e',
  warn:     '#f59e0b',
  bad:      '#ef4444',
  orange:   '#f97316',
  purple:   '#a855f7',
  muted:    '#64748b',
  surface:  'var(--surface-2)',
  border:   'var(--border-1)',
  text:     'var(--text-primary)',
  sub:      'var(--text-tertiary)',
}

const RISK_COLOR = { LOW: C.ok, MEDIUM: C.warn, HIGH: C.orange, CRITICAL: C.bad }
const ECHART_BASE = {
  backgroundColor: 'transparent',
  textStyle: { color: '#94a3b8', fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 11 },
}

// Factor labels shown in the breakdown panel
const FACTOR_META = {
  unmatched_rate:       { icon: '⚠', color: C.orange },
  open_exceptions:      { icon: '🔴', color: C.bad },
  variance_magnitude:   { icon: '💰', color: C.warn },
  exception_age:        { icon: '⏱', color: C.purple },
  manual_overrides:     { icon: '✋', color: C.accent },
  sod_violation:        { icon: '🛡', color: C.bad },
}

// ── Helpers ───────────────────────────────────────────────────────────────
function fmtScore(v) { return typeof v === 'number' ? v.toFixed(1) : '—' }
function fmtAge(iso) {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

// ── Risk Gauge (progressive fill) ────────────────────────────────────────
function RiskGauge({ score }) {
  const radius = 100
  const strokeWidth = 14
  const circumference = Math.PI * radius
  
  // Constrain score
  const s = Math.max(0, Math.min(100, score || 0))
  const dashoffset = circumference * (1 - s / 100)

  // Status mapping
  const status = s < 25 ? { label: 'LOW', color: '#10b981' }
    : s < 50 ? { label: 'MEDIUM', color: '#f59e0b' }
    : s < 75 ? { label: 'HIGH', color: '#f97316' }
    : { label: 'CRITICAL', color: '#ef4444' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', width: '100%' }}>
      
      {/* SVG Gauge Container */}
      <div style={{ position: 'relative', width: 240, height: 140, marginTop: 16 }}>
        <svg viewBox="0 0 240 140" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
          <defs>
            <linearGradient id="riskGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="35%" stopColor="#f59e0b" />
              <stop offset="70%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Background Arc */}
          <path
            d="M 20 120 A 100 100 0 0 1 220 120"
            fill="none"
            stroke="var(--surface-3)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Active Gradient Arc */}
          <path
            d="M 20 120 A 100 100 0 0 1 220 120"
            fill="none"
            stroke="url(#riskGrad)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashoffset}
            filter="url(#glow)"
            style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)' }}
          />
        </svg>

        {/* Center Labels */}
        <div style={{ position: 'absolute', top: 75, left: 0, width: '100%', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ fontSize: 42, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1, textShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>
            {score.toFixed(1)}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: status.color, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4, textShadow: `0 0 10px ${status.color}40` }}>
            {status.label}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 10, padding: '8px 16px', background: 'var(--surface-1)', borderRadius: 9999, border: '1px solid var(--border-0)' }}>
        {[['Low','#10b981'],['Medium','#f59e0b'],['High','#f97316'],['Critical','#ef4444']].map(([l,c]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, boxShadow: `0 0 8px ${c}` }} />
            <span style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 600 }}>{l}</span>
          </div>
        ))}
      </div>

      <div style={{ width: '100%', height: 1, background: 'var(--border-0)', margin: '24px 0 16px 0' }} />

      {/* Stats Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '0 24px' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>Current Score</p>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'IBM Plex Mono, monospace' }}>{fmtScore(score)}</p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>Risk Level</p>
          <p style={{ fontSize: 15, fontWeight: 600, color: status.color }}>{status.label.charAt(0) + status.label.slice(1).toLowerCase()}</p>
        </div>
      </div>
    </div>
  )
}

// ── Risk breakdown bar chart ──────────────────────────────────────────────
function RiskBreakdownChart({ data }) {
  const entries = Object.entries(data || {})
  if (!entries.length) return null
  const option = {
    ...ECHART_BASE,
    grid: { left: 70, right: 40, top: 8, bottom: 16 },
    xAxis: { type: 'value', axisLabel: { color: '#64748b', fontSize: 10 }, splitLine: { lineStyle: { color: '#1e293b' } } },
    yAxis: { type: 'category', data: entries.map(([k]) => k), axisLabel: { color: '#94a3b8', fontSize: 10 } },
    series: [{
      type: 'bar',
      data: entries.map(([k, v]) => ({ value: v, itemStyle: { color: RISK_COLOR[k] || C.accent, borderRadius: [0, 4, 4, 0] } })),
      label: { show: true, position: 'right', color: '#94a3b8', fontSize: 10 },
    }],
  }
  return <ReactECharts option={option} style={{ height: 140 }} notMerge />
}

// ── Factor breakdown panel (shown on profile row click) ───────────────────
function FactorBreakdown({ factors, totalScore }) {
  if (!factors || !Object.keys(factors).length) {
    return <p style={{ fontSize: 12, color: C.sub, padding: '8px 0' }}>No factor data — click Recalculate to generate scores.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {Object.entries(factors).map(([key, f]) => {
        const meta    = FACTOR_META[key] || { icon: '•', color: C.accent }
        const pct     = totalScore > 0 ? (f.contribution / totalScore) * 100 : 0
        const rawStr  = f.unit === '$'
          ? `$${Number(f.raw_value).toLocaleString()}`
          : f.unit === '%'
          ? `${f.raw_value}%`
          : f.unit === 'bool'
          ? (f.raw_value ? 'Yes' : 'No')
          : f.raw_value
        return (
          <div key={key} style={{ display: 'grid', gridTemplateColumns: '20px 1fr auto 52px', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13 }}>{meta.icon}</span>
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: C.text, marginBottom: 2 }}>{f.label}</p>
              <div style={{ height: 5, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: meta.color, borderRadius: 99, transition: 'width 400ms' }} />
              </div>
            </div>
            <span style={{ fontSize: 11, color: C.sub, whiteSpace: 'nowrap' }}>{rawStr}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: f.contribution > 0 ? meta.color : C.sub, textAlign: 'right' }}>
              +{f.contribution}
            </span>
          </div>
        )
      })}
      <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: `1px solid var(--border-1)`, paddingTop: 6, marginTop: 2 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Total: {fmtScore(totalScore)} / 100</span>
      </div>
    </div>
  )
}

// ── Profile risk row (expandable) ─────────────────────────────────────────
function ProfileRiskRow({ p, isExpanded, onToggle }) {
  const color = RISK_COLOR[p.risk_classification] || C.accent
  const pct   = Math.min(p.risk_score, 100)

  return (
    <>
      <tr
        onClick={onToggle}
        style={{ cursor: 'pointer', background: isExpanded ? 'var(--surface-3)' : undefined }}
      >
        <td style={{ fontSize: 12, fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ChevronRight style={{ width: 12, height: 12, color: C.muted, transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 200ms' }} />
            {p.name}
          </div>
        </td>
        <td>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 9999, background: `${color}14`, border: `1px solid ${color}33`, color }}>
            {p.risk_classification}
          </span>
        </td>
        <td>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 80, height: 6, background: 'var(--surface-3)', borderRadius: 9999, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 400ms' }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 28 }}>{fmtScore(p.risk_score)}</span>
          </div>
        </td>
        <td style={{ fontSize: 11 }}>{p.total_records}</td>
        <td style={{ fontSize: 11, color: p.unmatched > 0 ? C.bad : C.ok }}>{p.unmatched}</td>
        <td style={{ fontSize: 11, color: p.open_exceptions > 0 ? C.warn : C.ok }}>{p.open_exceptions}</td>
        <td style={{ fontSize: 11, color: p.variance_amount > 0 ? C.warn : C.sub, fontWeight: p.variance_amount > 1000 ? 600 : 400 }}>
          {p.variance_amount > 0 ? `$${Number(p.variance_amount).toLocaleString()}` : '—'}
        </td>
        <td style={{ fontSize: 11, color: C.sub }}>{(p.reconciliation_type || '').replace(/_/g, ' ')}</td>
        <td style={{ fontSize: 10, color: C.sub }}>{fmtAge(p.scored_at) || '—'}</td>
      </tr>
      {isExpanded && p.factors && Object.keys(p.factors).length > 0 && (
        <tr style={{ background: 'var(--surface-1)' }}>
          <td colSpan={9} style={{ padding: '12px 24px 16px 32px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              Risk Factor Breakdown
            </p>
            <FactorBreakdown factors={p.factors} totalScore={p.risk_score} />
          </td>
        </tr>
      )}
    </>
  )
}

// ── Exception aging table ─────────────────────────────────────────────────
function AgingByRiskTable({ data }) {
  return (
    <table className="data-table" style={{ borderRadius: 0 }}>
      <thead>
        <tr><th>Risk Level</th><th>Open Exceptions</th><th>Avg Age (days)</th><th>Max Age (days)</th></tr>
      </thead>
      <tbody>
        {Object.entries(data || {}).map(([risk, stats]) => {
          const color = RISK_COLOR[risk] || C.accent
          return (
            <tr key={risk}>
              <td>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 9999, background: `${color}14`, border: `1px solid ${color}33`, color }}>
                  {risk}
                </span>
              </td>
              <td style={{ fontSize: 12, fontWeight: 600, color: stats.count > 0 ? color : C.ok }}>{stats.count}</td>
              <td style={{ fontSize: 12, color: stats.avg_days > 7 ? C.warn : C.text }}>{stats.avg_days}</td>
              <td style={{ fontSize: 12, color: stats.max_days > 14 ? C.bad : C.text, fontWeight: stats.max_days > 14 ? 700 : 400 }}>{stats.max_days}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── SoD violation row ─────────────────────────────────────────────────────
function SodRow({ v }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', background: 'var(--surface-2)', borderRadius: 8, border: '1px solid rgba(239,68,68,.2)' }}>
      <ShieldAlert style={{ width: 14, height: 14, color: C.bad, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{v.profile_name}</p>
        <p style={{ fontSize: 11, color: C.bad }}>{v.violation}</p>
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 9999, background: `${C.bad}14`, border: `1px solid ${C.bad}33`, color: C.bad }}>
        {v.severity}
      </span>
    </div>
  )
}

// ── Overdue row ───────────────────────────────────────────────────────────
function OverdueRow({ item }) {
  const color = RISK_COLOR[item.risk] || C.warn
  return (
    <tr>
      <td style={{ fontSize: 12, fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.profile_name}</td>
      <td>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 9999, background: `${color}14`, border: `1px solid ${color}33`, color }}>
          {item.risk}
        </span>
      </td>
      <td style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}>{item.due_date}</td>
      <td style={{ fontSize: 12, fontWeight: 700, color: item.days_overdue > 7 ? C.bad : C.warn }}>+{item.days_overdue}d</td>
    </tr>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview',    label: 'Risk Overview' },
  { id: 'profiles',   label: 'Profile Scores' },
  { id: 'exceptions', label: 'Exception Aging' },
  { id: 'sod',        label: 'SoD Violations' },
  { id: 'overdue',    label: 'Overdue High Risk' },
]

// ── Main ──────────────────────────────────────────────────────────────────
export default function RiskDashboard() {
  const qc = useQueryClient()
  const { setHeaderOverride } = useOutletContext() || {}
  const [tab, setTab]               = useState('overview')
  const [search, setSearch]         = useState('')
  const [riskFilter, setRiskFilter] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  // Primary dashboard query — refetches every 60s
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['risk-dashboard-real'],
    queryFn: advancedAPI.riskDashboard,
    refetchInterval: 60_000,
  })

  // Batch recalculate mutation
  const recalcMutation = useMutation({
    mutationFn: advancedAPI.calculateRisk,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risk-dashboard-real'] }),
  })

  const profileScores = useMemo(() => {
    let list = data?.profile_risk_scores || []
    if (riskFilter) list = list.filter(p => p.risk_classification === riskFilter)
    if (search)     list = list.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    return list
  }, [data, riskFilter, search])

  const breakdown  = data?.risk_breakdown || {}
  const totalScore = data?.total_risk_score ?? 0
  const scoredAt   = data?.scored_at ? fmtAge(data.scored_at) : null

  const toggleRow = useCallback(id => setExpandedId(prev => prev === id ? null : id), [])

  // Override Layout Header
  useEffect(() => {
    if (setHeaderOverride) {
      setHeaderOverride(
        <header className="bl-header" style={{ padding: '0 24px' }}>
          <div className="flex flex-col min-w-0 flex-shrink-0">
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-tertiary)', lineHeight: 1, fontFamily: 'Inter, sans-serif' }}>
              ANALYTICS
            </p>
            <div className="flex items-center gap-3 mt-[2px]">
              <h1 className="bl-header-title">Risk Analytics</h1>
              <span style={{ 
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, 
                border: '1px solid var(--border-2)', background: 'rgba(255, 255, 255, 0.03)', color: '#f59e0b',
                whiteSpace: 'nowrap'
              }}>
                OVERALL: {fmtScore(totalScore)} / 100
              </span>
            </div>
          </div>
          
          <div className="flex-1" />
          
          <div className="flex items-center gap-4">
            {scoredAt && (
              <span style={{ fontSize: 11, color: C.sub, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock style={{ width: 12, height: 12 }} />
                Scored {scoredAt}
              </span>
            )}
            <button
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px', height: 32 }}
              onClick={() => recalcMutation.mutate()}
              disabled={recalcMutation.isPending}
            >
              <RefreshCw style={{ width: 13, height: 13, animation: recalcMutation.isPending ? 'spin 1s linear infinite' : 'none' }} />
              {recalcMutation.isPending ? 'Scoring…' : 'Recalculate'}
            </button>
          </div>
        </header>
      )
    }
    return () => setHeaderOverride?.(null)
  }, [setHeaderOverride, totalScore, scoredAt, recalcMutation.isPending, recalcMutation.mutate])

  if (isLoading) return (
    <div className="h-full flex flex-col">
      <LoadingState />
    </div>
  )

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 flex flex-col min-h-0 p-5 space-y-4" style={{ background: 'var(--surface-0)' }}>

        {/* Recalculate result toast */}
        {recalcMutation.isSuccess && (
          <div style={{ background: '#052e16', border: '1px solid #166534', borderRadius: 8, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 style={{ width: 14, height: 14, color: C.ok }} />
            <span style={{ fontSize: 12, color: C.ok, fontWeight: 600 }}>
              Scored {recalcMutation.data?.scored ?? '—'} profiles.
              {recalcMutation.data?.errors > 0 && ` ${recalcMutation.data.errors} errors.`}
            </span>
          </div>
        )}

        {/* ── KPI strip ──────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
          {[
            ['LOW Risk',       breakdown.LOW      ?? 0, C.ok],
            ['MEDIUM Risk',    breakdown.MEDIUM   ?? 0, C.warn],
            ['HIGH Risk',      breakdown.HIGH     ?? 0, C.orange],
            ['CRITICAL Risk',  breakdown.CRITICAL ?? 0, C.bad],
            ['SoD Violations', (data?.sod_violations || []).length, C.purple],
          ].map(([label, val, color]) => (
            <div key={label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: C.sub }}>{label}</p>
              <p style={{ fontSize: 16, fontWeight: 700, color }}>{val}</p>
            </div>
          ))}
        </div>

        {/* ── Tab bar ────────────────────────────────────────────────── */}
        <div className="tab-bar" style={{ background: 'var(--surface-1)', borderRadius: 8 }}>
          {TABS.map(t => (
            <button key={t.id} className={`tab-item ${tab === t.id ? 'tab-active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab Content Area ───────────────────────────────────────── */}
        <div className="flex-1 min-h-0 flex flex-col">
          {/* ── Overview ───────────────────────────────────────────────── */}
          {tab === 'overview' && (
            <div className="flex-1 min-h-0 overflow-y-auto pr-1" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>Overall Risk Score</p>
              <p style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>
                Weighted average across {data?.profile_count ?? 0} active profiles
              </p>
              <RiskGauge score={totalScore} />
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>Risk Distribution</p>
              <p style={{ fontSize: 11, color: C.sub, marginBottom: 8 }}>Profiles by computed risk classification</p>
              <RiskBreakdownChart data={breakdown} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 12 }}>
                {Object.entries(breakdown).map(([risk, count]) => {
                  const color = RISK_COLOR[risk] || C.accent
                  return (
                    <div key={risk} style={{ textAlign: 'center', padding: 8, background: 'var(--surface-1)', borderRadius: 8, border: `1px solid ${color}22` }}>
                      <p style={{ fontSize: 10, color: C.sub }}>{risk}</p>
                      <p style={{ fontSize: 20, fontWeight: 700, color }}>{count}</p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Factor weight legend */}
            <div style={{ gridColumn: '1 / -1', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <Info style={{ width: 14, height: 14, color: C.accent }} />
                <p style={{ fontSize: 12, fontWeight: 700, color: C.text }}>How Scores Are Computed</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8 }}>
                {[
                  ['Unmatched rate',     30, C.orange],
                  ['Open exceptions',    25, C.bad],
                  ['Variance amount',    20, C.warn],
                  ['Exception age',      10, C.purple],
                  ['Manual overrides',   10, C.accent],
                  ['SoD violation',       5, C.bad],
                ].map(([label, weight, color]) => (
                  <div key={label} style={{ background: 'var(--surface-1)', borderRadius: 8, padding: '8px 10px', border: `1px solid ${color}22` }}>
                    <p style={{ fontSize: 10, color: C.sub, marginBottom: 4 }}>{label}</p>
                    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                      <div style={{ width: `${weight}%`, height: 4, background: color, borderRadius: 99, minWidth: 4 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color }}>{weight}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Profile Scores (with expandable factor breakdown) ───────── */}
        {tab === 'profiles' && (
          <div className="flex-1 min-h-0 flex flex-col gap-4">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
              <input
                className="input h-8 text-xs w-48"
                placeholder="Search profiles…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <select className="input h-8 text-xs" value={riskFilter} onChange={e => setRiskFilter(e.target.value)}>
                <option value="">All Risk Levels</option>
                {['LOW','MEDIUM','HIGH','CRITICAL'].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              {(riskFilter || search) && (
                <button className="btn-ghost text-xs h-8" onClick={() => { setRiskFilter(''); setSearch('') }}>Clear</button>
              )}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: C.sub }}>
                {profileScores.length} profiles · click a row to see factor breakdown
              </span>
            </div>

            {profileScores.length === 0 ? (
              <EmptyState title="No profiles match" description="Adjust filters or click Recalculate." />
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10 }}>
                <table className="data-table" style={{ borderRadius: 0 }}>
                  <thead>
                    <tr>
                      <th>Profile</th>
                      <th>Risk Level</th>
                      <th>Risk Score</th>
                      <th>Groups</th>
                      <th>Unmatched</th>
                      <th>Open Exc.</th>
                      <th>Variance</th>
                      <th>Type</th>
                      <th>Scored</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profileScores.map(p => (
                      <ProfileRiskRow
                        key={p.id}
                        p={p}
                        isExpanded={expandedId === p.id}
                        onToggle={() => toggleRow(p.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Exception Aging ─────────────────────────────────────────── */}
        {tab === 'exceptions' && (
          <div className="flex-1 min-h-0 overflow-y-auto pr-1" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10 }}>
            <AgingByRiskTable data={data?.exception_aging_by_risk} />
          </div>
        )}

        {/* ── SoD Violations ──────────────────────────────────────────── */}
        {tab === 'sod' && (
          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            {(data?.sod_violations || []).length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <ShieldCheck style={{ width: 40, height: 40, color: C.ok, margin: '0 auto 12px' }} />
                <p style={{ fontSize: 14, fontWeight: 700, color: C.ok }}>No SoD Violations Detected</p>
                <p style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>All profiles have proper segregation of duties.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.sod_violations.map((v, i) => <SodRow key={i} v={v} />)}
              </div>
            )}
          </div>
        )}

        {/* ── Overdue High Risk ────────────────────────────────────────── */}
        {tab === 'overdue' && (
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col">
            {(data?.overdue_high_risk || []).length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <CheckCircle2 style={{ width: 40, height: 40, color: C.ok, margin: '0 auto 12px' }} />
                <p style={{ fontSize: 14, fontWeight: 700, color: C.ok }}>No Overdue High-Risk Items</p>
                <p style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>All high-risk certifications are within SLA.</p>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10 }}>
                <table className="data-table" style={{ borderRadius: 0 }}>
                  <thead>
                    <tr><th>Profile</th><th>Risk</th><th>Due Date</th><th>Days Overdue</th></tr>
                  </thead>
                  <tbody>
                    {data.overdue_high_risk.map((item, i) => <OverdueRow key={i} item={item} />)}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        </div>

      </div>
    </div>
  )
}
