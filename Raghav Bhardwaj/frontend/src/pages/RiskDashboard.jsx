/**
 * RiskDashboard — wired to /enterprise/dashboard/risk-real
 * Profile risk scores, SoD violations, overdue high-risk, exception aging by risk.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import { advancedAPI } from '../api'
import PageHeader from '../components/ui/PageHeader'
import { LoadingState, EmptyState } from '../components/ui/PageState'
import { ShieldAlert, ShieldCheck, AlertTriangle, Clock, Users, ChevronDown, ChevronUp } from 'lucide-react'

// ── Theme ─────────────────────────────────────────────────────
const ACCENT = '#6366f1'
const OK     = '#22c55e'
const WARN   = '#f59e0b'
const BAD    = '#ef4444'
const PURPLE = '#a855f7'
const ORANGE = '#f97316'

const RISK_COLOR = { LOW: OK, MEDIUM: WARN, HIGH: ORANGE, CRITICAL: BAD }
const ECHART_BASE = {
  backgroundColor: 'transparent',
  textStyle: { color: '#94a3b8', fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 11 },
}

// ── Risk score gauge ──────────────────────────────────────────
function RiskGauge({ score }) {
  const color = score >= 80 ? BAD : score >= 60 ? ORANGE : score >= 40 ? WARN : OK
  const option = {
    ...ECHART_BASE,
    series: [{
      type: 'gauge',
      startAngle: 200, endAngle: -20,
      min: 0, max: 100,
      radius: '90%',
      axisLine: { lineStyle: { width: 12, color: [[score / 100, color], [1, '#1e293b']] } },
      pointer: { itemStyle: { color } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      detail: { valueAnimation: true, formatter: '{value}', color, fontSize: 22, fontWeight: 700, offsetCenter: [0, '10%'] },
      data: [{ value: score, name: 'Risk Score' }],
      title: { fontSize: 11, color: '#64748b', offsetCenter: [0, '35%'] },
    }],
  }
  return <ReactECharts option={option} style={{ height: 160 }} notMerge />
}

// ── Risk breakdown bar ────────────────────────────────────────
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
      data: entries.map(([k, v]) => ({ value: v, itemStyle: { color: RISK_COLOR[k] || ACCENT, borderRadius: [0, 4, 4, 0] } })),
      label: { show: true, position: 'right', color: '#94a3b8', fontSize: 10 },
    }],
  }
  return <ReactECharts option={option} style={{ height: 140 }} notMerge />
}

// ── Profile risk score row ────────────────────────────────────
function ProfileRiskRow({ p }) {
  const color = RISK_COLOR[p.risk_classification] || ACCENT
  const pct   = Math.min(p.risk_score, 100)
  return (
    <tr>
      <td style={{ fontSize: 12, fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {p.name}
      </td>
      <td>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 9999,
          background: `${color}14`, border: `1px solid ${color}33`, color }}>
          {p.risk_classification}
        </span>
      </td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 80, height: 6, background: 'var(--surface-3)', borderRadius: 9999, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 400ms' }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 24 }}>{p.risk_score}</span>
        </div>
      </td>
      <td style={{ fontSize: 11 }}>{p.total_records.toLocaleString()}</td>
      <td style={{ fontSize: 11, color: p.unmatched > 0 ? BAD : OK }}>{p.unmatched}</td>
      <td style={{ fontSize: 11, color: p.open_exceptions > 0 ? WARN : OK }}>{p.open_exceptions}</td>
      <td style={{ fontSize: 11, color: p.variance_amount > 0 ? WARN : 'var(--text-tertiary)', fontWeight: p.variance_amount > 1000 ? 600 : 400 }}>
        {p.variance_amount > 0 ? `$${Number(p.variance_amount).toLocaleString()}` : '—'}
      </td>
      <td style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{(p.reconciliation_type || '').replace(/_/g, ' ')}</td>
    </tr>
  )
}

// ── Exception aging by risk table ────────────────────────────
function AgingByRiskTable({ data }) {
  return (
    <table className="data-table" style={{ borderRadius: 0 }}>
      <thead>
        <tr><th>Risk Level</th><th>Open Exceptions</th><th>Avg Age (days)</th><th>Max Age (days)</th></tr>
      </thead>
      <tbody>
        {Object.entries(data || {}).map(([risk, stats]) => {
          const color = RISK_COLOR[risk] || ACCENT
          return (
            <tr key={risk}>
              <td>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 9999,
                  background: `${color}14`, border: `1px solid ${color}33`, color }}>
                  {risk}
                </span>
              </td>
              <td style={{ fontSize: 12, fontWeight: 600, color: stats.count > 0 ? color : OK }}>{stats.count}</td>
              <td style={{ fontSize: 12, color: stats.avg_days > 7 ? WARN : 'var(--text-primary)' }}>{stats.avg_days}</td>
              <td style={{ fontSize: 12, color: stats.max_days > 14 ? BAD : 'var(--text-primary)', fontWeight: stats.max_days > 14 ? 700 : 400 }}>{stats.max_days}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── SoD violation row ─────────────────────────────────────────
function SodRow({ v }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px',
      background: 'var(--surface-2)', borderRadius: 8,
      border: '1px solid rgba(239,68,68,.2)',
    }}>
      <ShieldAlert style={{ width: 14, height: 14, color: BAD, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{v.profile_name}</p>
        <p style={{ fontSize: 11, color: BAD }}>{v.violation}</p>
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 9999,
        background: `${BAD}14`, border: `1px solid ${BAD}33`, color: BAD }}>
        {v.severity}
      </span>
    </div>
  )
}

// ── Overdue high risk row ─────────────────────────────────────
function OverdueRow({ item }) {
  const color = RISK_COLOR[item.risk] || WARN
  return (
    <tr>
      <td style={{ fontSize: 12, fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.profile_name}</td>
      <td>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 9999,
          background: `${color}14`, border: `1px solid ${color}33`, color }}>
          {item.risk}
        </span>
      </td>
      <td style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}>{item.due_date}</td>
      <td style={{ fontSize: 12, fontWeight: 700, color: item.days_overdue > 7 ? BAD : WARN }}>
        +{item.days_overdue}d
      </td>
    </tr>
  )
}

// ── Tabs ──────────────────────────────────────────────────────
const TABS = [
  { id: 'overview',  label: 'Risk Overview' },
  { id: 'profiles',  label: 'Profile Scores' },
  { id: 'exceptions', label: 'Exception Aging' },
  { id: 'sod',       label: 'SoD Violations' },
  { id: 'overdue',   label: 'Overdue High Risk' },
]

// ── Main ──────────────────────────────────────────────────────
export default function RiskDashboard() {
  const navigate   = useNavigate()
  const [tab, setTab] = useState('overview')
  const [search, setSearch] = useState('')
  const [riskFilter, setRiskFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['risk-dashboard-real'],
    queryFn: advancedAPI.riskDashboard,
    refetchInterval: 60000,
  })

  const profileScores = useMemo(() => {
    let list = data?.profile_risk_scores || []
    if (riskFilter) list = list.filter((p) => p.risk_classification === riskFilter)
    if (search) list = list.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    return list
  }, [data, riskFilter, search])

  const breakdown = data?.risk_breakdown || {}
  const totalScore = data?.total_risk_score ?? 0

  if (isLoading) return (
    <div className="h-full flex flex-col">
      <PageHeader title="Risk Dashboard" subtitle="Enterprise-wide risk scoring and compliance." />
      <LoadingState />
    </div>
  )

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Risk Dashboard"
        subtitle="Live risk scores, SoD violations, aging analysis and overdue high-risk profiles."
        badge={`Overall: ${totalScore}/100`}
      />

      <div className="flex-1 overflow-auto p-5 space-y-4" style={{ background: 'var(--surface-0)' }}>

        {/* ── KPI strip ────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
          {[
            ['LOW Risk',      breakdown.LOW      ?? 0, OK],
            ['MEDIUM Risk',   breakdown.MEDIUM   ?? 0, WARN],
            ['HIGH Risk',     breakdown.HIGH     ?? 0, ORANGE],
            ['CRITICAL Risk', breakdown.CRITICAL ?? 0, BAD],
            ['SoD Violations', (data?.sod_violations || []).length, PURPLE],
          ].map(([label, val, color]) => (
            <div key={label} style={{
              background: 'var(--surface-2)', border: '1px solid var(--border-1)',
              borderRadius: 10, padding: '12px 16px',
            }}>
              <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{label}</p>
              <p style={{ fontSize: 24, fontWeight: 700, color }}>{val}</p>
            </div>
          ))}
        </div>

        {/* ── Tab bar ──────────────────────────────────── */}
        <div className="tab-bar" style={{ background: 'var(--surface-1)', borderRadius: 8 }}>
          {TABS.map((t) => (
            <button key={t.id} className={`tab-item ${tab === t.id ? 'tab-active' : ''}`}
              onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {/* ── Overview ────────────────────────────────── */}
        {tab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 12, padding: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Overall Risk Score</p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>Average across all profiles</p>
              <RiskGauge score={totalScore} />
            </div>
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 12, padding: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Risk Distribution</p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>Profiles by risk classification</p>
              <RiskBreakdownChart data={breakdown} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 12 }}>
                {Object.entries(breakdown).map(([risk, count]) => {
                  const color = RISK_COLOR[risk] || ACCENT
                  return (
                    <div key={risk} style={{ textAlign: 'center', padding: '8px', background: 'var(--surface-1)', borderRadius: 8, border: `1px solid ${color}22` }}>
                      <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{risk}</p>
                      <p style={{ fontSize: 20, fontWeight: 700, color }}>{count}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Profile Scores ───────────────────────────── */}
        {tab === 'profiles' && (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input className="input h-8 text-xs w-48" placeholder="Search profiles…"
                value={search} onChange={(e) => setSearch(e.target.value)} />
              <select className="input h-8 text-xs" value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
                <option value="">All Risk Levels</option>
                {['LOW','MEDIUM','HIGH','CRITICAL'].map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              {(riskFilter || search) && (
                <button className="btn-ghost text-xs h-8" onClick={() => { setRiskFilter(''); setSearch('') }}>Clear</button>
              )}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-tertiary)' }}>
                {profileScores.length} profiles
              </span>
            </div>
            {profileScores.length === 0 ? (
              <EmptyState title="No profiles match" description="Adjust filters." />
            ) : (
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden' }}>
                <table className="data-table" style={{ borderRadius: 0 }}>
                  <thead>
                    <tr>
                      <th>Profile</th><th>Risk Level</th><th>Risk Score</th>
                      <th>Records</th><th>Unmatched</th><th>Open Exc.</th>
                      <th>Variance</th><th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profileScores.map((p) => <ProfileRiskRow key={p.id} p={p} />)}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Exception Aging ──────────────────────────── */}
        {tab === 'exceptions' && (
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden' }}>
            <AgingByRiskTable data={data?.exception_aging_by_risk} />
          </div>
        )}

        {/* ── SoD Violations ───────────────────────────── */}
        {tab === 'sod' && (
          (data?.sod_violations || []).length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <ShieldCheck style={{ width: 40, height: 40, color: OK, margin: '0 auto 12px' }} />
              <p style={{ fontSize: 14, fontWeight: 700, color: OK }}>No SoD Violations Detected</p>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>All profiles have proper segregation of duties.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(data.sod_violations || []).map((v, i) => <SodRow key={i} v={v} />)}
            </div>
          )
        )}

        {/* ── Overdue High Risk ────────────────────────── */}
        {tab === 'overdue' && (
          (data?.overdue_high_risk || []).length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <CheckCircle2 style={{ width: 40, height: 40, color: OK, margin: '0 auto 12px' }} />
              <p style={{ fontSize: 14, fontWeight: 700, color: OK }}>No Overdue High-Risk Items</p>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>All high-risk certifications are within SLA.</p>
            </div>
          ) : (
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden' }}>
              <table className="data-table" style={{ borderRadius: 0 }}>
                <thead>
                  <tr><th>Profile</th><th>Risk</th><th>Due Date</th><th>Days Overdue</th></tr>
                </thead>
                <tbody>
                  {(data.overdue_high_risk || []).map((item, i) => <OverdueRow key={i} item={item} />)}
                </tbody>
              </table>
            </div>
          )
        )}

      </div>
    </div>
  )
}
