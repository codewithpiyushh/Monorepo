/**
 * ExecutiveDashboard — wired to /enterprise/dashboard/executive-real
 * All KPIs, charts and tables come from live enterprise data.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import { advancedAPI } from '../api'
import PageHeader from '../components/ui/PageHeader'
import { LoadingState } from '../components/ui/PageState'
import {
  Layers, CheckCircle2, AlertTriangle, TrendingUp,
  Clock, ShieldAlert, BarChart3, Users,
} from 'lucide-react'

// ── Theme ─────────────────────────────────────────────────────
const ACCENT = '#6366f1'
const OK     = '#22c55e'
const WARN   = '#f59e0b'
const BAD    = '#ef4444'
const INFO   = '#38bdf8'
const PURPLE = '#a855f7'

const ECHART_BASE = {
  backgroundColor: 'transparent',
  textStyle: { color: '#94a3b8', fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 11 },
}

// ── KPI Card ──────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, color, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: 'var(--surface-2)', border: '1px solid var(--border-1)',
      borderRadius: 12, padding: '16px 18px',
      display: 'flex', alignItems: 'center', gap: 14,
      cursor: onClick ? 'pointer' : 'default',
      transition: 'border-color 200ms',
    }}
    onMouseEnter={(e) => { if (onClick) e.currentTarget.style.borderColor = color }}
    onMouseLeave={(e) => { if (onClick) e.currentTarget.style.borderColor = 'var(--border-1)' }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: `${color}18`, border: `1px solid ${color}33`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon style={{ width: 17, height: 17, color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 1 }}>{label}</p>
        <p style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.0 }}>{value}</p>
        {sub && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{sub}</p>}
      </div>
    </div>
  )
}

// ── Section card wrapper ──────────────────────────────────────
function Card({ title, subtitle, children, style = {} }) {
  return (
    <div style={{
      background: 'var(--surface-2)', border: '1px solid var(--border-1)',
      borderRadius: 12, padding: '16px 18px', ...style,
    }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: subtitle ? 2 : 12 }}>{title}</p>
      {subtitle && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 12 }}>{subtitle}</p>}
      {children}
    </div>
  )
}

// ── Certification trend chart ─────────────────────────────────
function CertTrendChart({ data }) {
  if (!data?.length) return <p style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', padding: 20 }}>No period data yet</p>
  const option = {
    ...ECHART_BASE,
    grid: { left: 44, right: 16, top: 12, bottom: 36 },
    tooltip: { trigger: 'axis', backgroundColor: '#1e293b', borderColor: '#334155' },
    xAxis: { type: 'category', data: data.map((d) => d.period), axisLabel: { color: '#64748b', fontSize: 10 }, axisLine: { lineStyle: { color: '#334155' } } },
    yAxis: { type: 'value', max: 100, axisLabel: { color: '#64748b', fontSize: 10, formatter: '{value}%' }, splitLine: { lineStyle: { color: '#1e293b' } } },
    series: [{
      type: 'line', smooth: true, data: data.map((d) => d.pct),
      lineStyle: { color: OK, width: 2 },
      areaStyle: { color: `${OK}22` },
      itemStyle: { color: OK }, symbol: 'circle', symbolSize: 5,
    }],
  }
  return <ReactECharts option={option} style={{ height: 180 }} notMerge />
}

// ── Risk donut chart ──────────────────────────────────────────
function RiskDonut({ data }) {
  const total = Object.values(data || {}).reduce((s, v) => s + v, 0)
  if (!total) return <p style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', padding: 20 }}>No profiles</p>
  const colors = { LOW: OK, MEDIUM: WARN, HIGH: '#f97316', CRITICAL: BAD }
  const option = {
    ...ECHART_BASE,
    tooltip: { trigger: 'item', backgroundColor: '#1e293b', borderColor: '#334155' },
    series: [{
      type: 'pie', radius: ['45%', '70%'], center: ['50%', '50%'],
      data: Object.entries(data).map(([k, v]) => ({ name: k, value: v, itemStyle: { color: colors[k] || ACCENT } })),
      label: { color: '#94a3b8', fontSize: 10 },
    }],
  }
  return <ReactECharts option={option} style={{ height: 180 }} notMerge />
}

// ── Pending by stage bar ──────────────────────────────────────
function PendingStageChart({ data }) {
  const entries = Object.entries(data || {})
  if (!entries.length) return <p style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', padding: 20 }}>No pending items</p>
  const stageColors = { PREPARER: ACCENT, REVIEWER: INFO, APPROVER: WARN, CERTIFIER: OK, UNKNOWN: 'var(--text-tertiary)' }
  const option = {
    ...ECHART_BASE,
    grid: { left: 90, right: 40, top: 8, bottom: 16 },
    xAxis: { type: 'value', axisLabel: { color: '#64748b', fontSize: 10 }, splitLine: { lineStyle: { color: '#1e293b' } } },
    yAxis: { type: 'category', data: entries.map(([k]) => k), axisLabel: { color: '#94a3b8', fontSize: 10 } },
    series: [{
      type: 'bar',
      data: entries.map(([k, v]) => ({ value: v, itemStyle: { color: stageColors[k] || ACCENT, borderRadius: [0, 4, 4, 0] } })),
      label: { show: true, position: 'right', color: '#94a3b8', fontSize: 10 },
    }],
  }
  return <ReactECharts option={option} style={{ height: Math.max(entries.length * 36, 100) }} notMerge />
}

// ── Main ──────────────────────────────────────────────────────
export default function ExecutiveDashboard() {
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['executive-dashboard-real'],
    queryFn: advancedAPI.executiveDashboard,
    refetchInterval: 60000,
  })

  if (isLoading) return (
    <div className="h-full flex flex-col">
      <PageHeader title="Executive Dashboard" subtitle="Real-time enterprise reconciliation overview." />
      <LoadingState />
    </div>
  )

  const ps  = data?.profile_summary      || {}
  const mt  = data?.matching             || {}
  const exc = data?.exceptions           || {}
  const cm  = data?.close_management     || {}
  const rb  = data?.risk_breakdown       || {}
  const ct  = data?.certification_trend  || []
  const hr  = data?.high_risk_profiles   || []
  const pbs = cm.pending_by_stage        || {}

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Executive Dashboard"
        subtitle="Live reconciliation status across all profiles, periods and entities."
        badge="Live"
      />

      <div className="flex-1 overflow-auto p-5 space-y-4" style={{ background: 'var(--surface-0)' }}>

        {/* ── Primary KPIs ────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <KpiCard label="Total Profiles"       value={ps.total          ?? '—'} sub={`${ps.in_progress ?? 0} in progress`}     icon={Layers}       color={ACCENT}  onClick={() => navigate('/reconciliation-profiles')} />
          <KpiCard label="Certification Rate"   value={`${ps.certification_pct ?? 0}%`} sub={`${ps.certified ?? 0} certified`}   icon={CheckCircle2} color={OK}      onClick={() => navigate('/close-certification')} />
          <KpiCard label="Open Exceptions"      value={exc.open          ?? '—'} sub={`${exc.escalated ?? 0} escalated`}         icon={AlertTriangle} color={BAD}    onClick={() => navigate('/exception-workbench')} />
          <KpiCard label="Auto-Match Rate"      value={`${mt.auto_match_rate ?? 0}%`} sub={`${mt.full_matches ?? 0} full matches`} icon={TrendingUp}  color={INFO}   onClick={() => navigate('/transaction-matching')} />
        </div>

        {/* ── Secondary KPIs ──────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <KpiCard label="Overdue Periods"      value={cm.overdue_periods  ?? '—'} sub="past due date"           icon={Clock}       color={WARN}   onClick={() => navigate('/close-certification')} />
          <KpiCard label="Certs Overdue SLA"    value={cm.certs_overdue    ?? '—'} sub="past due date"           icon={Clock}       color={WARN}   />
          <KpiCard label="Total Match Groups"   value={mt.total_groups     ?? '—'} sub={`${mt.full_matches ?? 0} full matches`} icon={BarChart3} color={ACCENT} onClick={() => navigate('/transaction-matching')} />
          <KpiCard label="High / Critical Risk" value={(rb.HIGH ?? 0) + (rb.CRITICAL ?? 0)} sub="profiles"       icon={ShieldAlert} color={PURPLE} onClick={() => navigate('/risk-dashboard')} />
        </div>

        {/* ── Charts row ──────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Card title="Certification Trend" subtitle="Period completion %">
            <CertTrendChart data={ct} />
          </Card>
          <Card title="Risk Distribution" subtitle="Profiles by risk level">
            <RiskDonut data={rb} />
          </Card>
          <Card title="Pending Certification by Stage" subtitle="Workflows awaiting action">
            <PendingStageChart data={pbs} />
          </Card>
        </div>

        {/* ── Exception + matching summary ────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Card title="Exception Summary">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {[
                ['Total', exc.total ?? 0, 'var(--text-primary)'],
                ['Open',  exc.open  ?? 0, BAD],
                ['Escalated', exc.escalated ?? 0, PURPLE],
              ].map(([label, val, color]) => (
                <div key={label} style={{ textAlign: 'center', padding: '10px 6px', background: 'var(--surface-1)', borderRadius: 8 }}>
                  <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4 }}>{label}</p>
                  <p style={{ fontSize: 24, fontWeight: 700, color }}>{val}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Matching Summary">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {[
                ['Total Groups',  mt.total_groups  ?? 0, 'var(--text-primary)'],
                ['Full Matches',  mt.full_matches  ?? 0, OK],
                ['Auto-Match %',  `${mt.auto_match_rate ?? 0}%`, mt.auto_match_rate >= 85 ? OK : mt.auto_match_rate >= 60 ? WARN : BAD],
              ].map(([label, val, color]) => (
                <div key={label} style={{ textAlign: 'center', padding: '10px 6px', background: 'var(--surface-1)', borderRadius: 8 }}>
                  <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4 }}>{label}</p>
                  <p style={{ fontSize: 24, fontWeight: 700, color }}>{val}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ── High risk profiles ───────────────────────── */}
        {hr.length > 0 && (
          <Card title="High & Critical Risk Profiles" subtitle="Profiles requiring immediate attention">
            <table className="data-table" style={{ borderRadius: 0 }}>
              <thead>
                <tr><th>Profile</th><th>Type</th><th>Risk</th><th>State</th><th></th></tr>
              </thead>
              <tbody>
                {hr.map((p) => {
                  const rcolor = { HIGH: WARN, CRITICAL: BAD }[p.risk] || ACCENT
                  const scolor = { CERTIFIED: OK, CLOSED: 'var(--text-disabled)', IN_PROGRESS: ACCENT }[p.state] || 'var(--text-tertiary)'
                  return (
                    <tr key={p.id}>
                      <td style={{ fontSize: 12, fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{(p.type || '').replace(/_/g, ' ')}</td>
                      <td>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 9999,
                          background: `${rcolor}14`, border: `1px solid ${rcolor}33`, color: rcolor }}>
                          {p.risk}
                        </span>
                      </td>
                      <td style={{ fontSize: 11, color: scolor, fontWeight: 600 }}>{p.state}</td>
                      <td>
                        <button className="btn-ghost text-xs py-0.5 h-6"
                          onClick={() => navigate('/reconciliation-profiles')}>
                          View →
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        )}

      </div>
    </div>
  )
}
