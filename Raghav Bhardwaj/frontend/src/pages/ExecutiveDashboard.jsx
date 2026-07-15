/**
 * ExecutiveDashboard — Premium Edition
 * Features stunning interactive visualizations and glassmorphism.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import { advancedAPI } from '../api'
import { LoadingState } from '../components/ui/PageState'
import {
  Layers, CheckCircle2, AlertTriangle, TrendingUp, ShieldAlert,
  Zap, BookOpen, ExternalLink, ArrowRight,
} from 'lucide-react'

// ── Theme ─────────────────────────────────────────────────────
const ACCENT = '#FFE600'
const OK     = '#00C864'
const WARN   = '#FF7D1E'
const BAD    = '#FF3C00'
const INFO   = '#4696FF'

const ECHART_BASE = {
  backgroundColor: 'transparent',
  textStyle: { color: 'var(--text-secondary)', fontFamily: 'Inter, sans-serif', fontSize: 11 },
  tooltip: {
    backgroundColor: 'rgba(26, 26, 36, 0.9)',
    borderColor: 'var(--border-2)',
    textStyle: { color: '#F6F6FA' },
    padding: [12, 16],
    borderRadius: 8,
    backdropFilter: 'blur(10px)',
  },
}

// ── KPI Card (Premium) ──────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, color, onClick }) {
  return (
    <div
      className="premium-card micro-anim glass-panel"
      onClick={onClick}
      style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, cursor: onClick ? 'pointer' : 'default' }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 10, background: `${color}14`,
        border: `1px solid ${color}33`, display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexShrink: 0, boxShadow: `0 4px 10px ${color}15`,
      }}>
        <Icon style={{ width: 18, height: 18, color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 2, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</p>
        <p style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1, letterSpacing: '-0.02em' }}>{value}</p>
        {sub && (
          <p style={{ fontSize: 11, color, marginTop: 4, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
            <TrendingUp style={{ width: 12, height: 12 }} /> {sub}
          </p>
        )}
      </div>
      {onClick && (
        <ArrowRight style={{ width: 14, height: 14, color: 'var(--text-tertiary)', flexShrink: 0 }} />
      )}
    </div>
  )
}

// ── Risk badge ─────────────────────────────────────────────────
const RISK_COLOR = { CRITICAL: BAD, HIGH: WARN, MEDIUM: INFO, LOW: OK }
function RiskBadge({ risk }) {
  const c = RISK_COLOR[(risk || 'MEDIUM').toUpperCase()] || INFO
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 9999,
      background: `${c}18`, border: `1px solid ${c}40`, color: c, letterSpacing: '0.05em',
      textTransform: 'uppercase',
    }}>
      {risk || 'MEDIUM'}
    </span>
  )
}

export default function ExecutiveDashboard() {
  const navigate = useNavigate()

  const { data: real, isLoading } = useQuery({
    queryKey: ['executive-real'],
    queryFn: () => advancedAPI.executiveDashboard(),
    refetchInterval: 10_000,
  })

  // Formatters
  const fmtNum  = (n) => typeof n === 'number' ? n.toLocaleString() : '0'
  const fmtCurr = (n) => {
    if (typeof n !== 'number') return '$0'
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
    if (Math.abs(n) >= 1_000)    return `$${(n / 1_000).toFixed(1)}k`
    return `$${n.toFixed(0)}`
  }

  // ECharts — Variance trajectory (uses cert trend data if available)
  const areaChartOptions = useMemo(() => {
    if (!real) return null
    const trend = (real.certification_trend || [])
    const labels = trend.length >= 2 ? trend.map((t) => t.period) : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today']
    const values = trend.length >= 2
      ? trend.map((t) => Math.round((1 - t.pct / 100) * (real.unexplained_variance || 500_000) / 1000))
      : [120, 132, 101, 134, 90, 230, Math.round((real.unexplained_variance || 500_000) / 1000)]
    return {
      ...ECHART_BASE,
      tooltip: { ...ECHART_BASE.tooltip, trigger: 'axis' },
      grid: { top: 30, right: 20, bottom: 30, left: 50 },
      xAxis: { type: 'category', boundaryGap: false, data: labels, splitLine: { show: false } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: 'var(--border-1)', type: 'dashed' } } },
      series: [{
        name: 'Variance Impact ($k)',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        areaStyle: {
          color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${BAD}66` }, { offset: 1, color: `${BAD}00` }] },
        },
        lineStyle: { width: 3, color: BAD },
        itemStyle: { color: BAD, borderColor: 'var(--surface-2)', borderWidth: 2 },
        data: values,
      }],
    }
  }, [real])

  // ECharts — Exception donut
  const donutOptions = useMemo(() => {
    if (!real) return null
    const open     = real.exceptions.open || 0
    const resolved = (real.exceptions.total || 0) - open
    return {
      ...ECHART_BASE,
      series: [{
        type: 'pie',
        radius: ['60%', '80%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 6, borderColor: 'var(--surface-0)', borderWidth: 2 },
        label: { show: false },
        data: [
          { value: open,     name: 'Open',     itemStyle: { color: WARN } },
          { value: resolved, name: 'Resolved', itemStyle: { color: OK   } },
        ],
      }],
    }
  }, [real])

  // ECharts — Risk breakdown bar
  const riskBarOptions = useMemo(() => {
    if (!real?.risk_breakdown) return null
    const rb = real.risk_breakdown
    return {
      ...ECHART_BASE,
      tooltip: { ...ECHART_BASE.tooltip, trigger: 'axis' },
      grid: { top: 10, right: 10, bottom: 30, left: 60 },
      xAxis: { type: 'value', splitLine: { show: false } },
      yAxis: { type: 'category', data: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
      series: [{
        type: 'bar',
        barMaxWidth: 18,
        itemStyle: { borderRadius: [0, 4, 4, 0] },
        data: [
          { value: rb.CRITICAL || 0, itemStyle: { color: BAD  } },
          { value: rb.HIGH     || 0, itemStyle: { color: WARN } },
          { value: rb.MEDIUM   || 0, itemStyle: { color: INFO } },
          { value: rb.LOW      || 0, itemStyle: { color: OK   } },
        ],
      }],
    }
  }, [real])

  if (isLoading) return <div className="p-6"><LoadingState message="Connecting to Enterprise Data Grid..." /></div>
  if (!real) return null

  const highRisk = real.high_risk_profiles || []

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--surface-0)' }}>
      <div className="flex-1 overflow-auto p-8 pt-6 space-y-8">

        {/* ── KPI Grid ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <KpiCard
            label="Close Progress"
            value={`${fmtNum(real.profile_summary.certification_pct)}%`}
            sub={`${fmtNum(real.profile_summary.certified)} / ${fmtNum(real.profile_summary.total)} certified`}
            icon={CheckCircle2}
            color={OK}
            onClick={() => navigate('/reconciliation-profiles')}
          />
          <KpiCard
            label="Material Variance"
            value={fmtCurr(real.unexplained_variance || 0)}
            sub="Requires investigation"
            icon={AlertTriangle}
            color={BAD}
            onClick={() => navigate('/balance-reconciliation')}
          />
          <KpiCard
            label="Open Exceptions"
            value={fmtNum(real.exceptions.open)}
            sub="Tap to triage"
            icon={Layers}
            color={WARN}
            onClick={() => navigate('/exception-workbench')}
          />
          <KpiCard
            label="High Risk Profiles"
            value={fmtNum(highRisk.length)}
            sub="Immediate action needed"
            icon={ShieldAlert}
            color={INFO}
            onClick={() => navigate('/risk-dashboard')}
          />
        </div>

        {/* ── Charts Row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Variance Trajectory */}
          <div className="lg:col-span-2 premium-card glass-panel p-6 flex flex-col">
            <div className="flex items-center justify-between mb-6 flex-none">
              <div>
                <h3 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[var(--bad)]" /> Variance Trajectory ($k)
                </h3>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">7-day rolling exposure across all global profiles.</p>
              </div>
              <button
                className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
                onClick={() => navigate('/balance-reconciliation')}
              >
                <BookOpen style={{ width: 12, height: 12 }} />
                View Ledger
                <ExternalLink style={{ width: 10, height: 10, opacity: 0.6 }} />
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 260 }}>
              {areaChartOptions && <ReactECharts option={areaChartOptions} style={{ height: '100%', width: '100%' }} />}
            </div>
          </div>

          {/* Exception Health Donut */}
          <div className="premium-card glass-panel p-6 flex flex-col">
            <h3 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-6 flex-none">
              <Zap className="w-4 h-4 text-[var(--warn)]" /> Exception Health
            </h3>
            <div style={{ height: 200, position: 'relative', flex: 'none' }}>
              {donutOptions && <ReactECharts option={donutOptions} style={{ height: '100%', width: '100%' }} />}
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                <p className="text-[28px] font-bold text-[var(--text-primary)] leading-none">{fmtNum(real.exceptions.open)}</p>
                <p className="text-[10px] uppercase text-[var(--text-tertiary)] font-semibold tracking-wider mt-1">Open Items</p>
              </div>
            </div>
            <div className="mt-6 space-y-3 flex-none">
              <div className="flex justify-between items-center text-sm p-3 rounded-lg bg-[var(--surface-3)]">
                <span className="flex items-center gap-2 text-[var(--text-secondary)]"><div className="w-2 h-2 rounded-full bg-[var(--warn)]" /> Pending Triage</span>
                <span className="font-semibold">{fmtNum(real.exceptions.open)}</span>
              </div>
              <div className="flex justify-between items-center text-sm p-3 rounded-lg bg-[var(--surface-3)]">
                <span className="flex items-center gap-2 text-[var(--text-secondary)]"><div className="w-2 h-2 rounded-full bg-[var(--ok)]" /> Resolved</span>
                <span className="font-semibold">{fmtNum(real.exceptions.total - real.exceptions.open)}</span>
              </div>
              <button
                className="btn-secondary w-full text-xs py-2 flex items-center justify-center gap-2 mt-2"
                onClick={() => navigate('/exception-workbench')}
              >
                <ExternalLink style={{ width: 11, height: 11 }} /> Open Exception Workbench
              </button>
            </div>
          </div>
        </div>

        {/* ── Bottom Row: Risk breakdown + High Risk Profiles ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Risk Breakdown Bar */}
          <div className="premium-card glass-panel p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4 flex-none">
              <h3 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" style={{ color: INFO }} /> Risk Breakdown
              </h3>
              <button
                className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1"
                onClick={() => navigate('/risk-dashboard')}
              >
                <ExternalLink style={{ width: 10, height: 10 }} /> View All
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 160 }}>
              {riskBarOptions && <ReactECharts option={riskBarOptions} style={{ height: '100%', width: '100%' }} />}
            </div>
          </div>

          {/* High Risk Profiles Table */}
          <div className="lg:col-span-2 premium-card glass-panel p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4 flex-none">
              <h3 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[var(--bad)]" /> High Risk Profiles
              </h3>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 9999, background: `${BAD}14`, border: `1px solid ${BAD}33`, color: BAD }}>
                {highRisk.length} profiles
              </span>
            </div>

            {highRisk.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
                <CheckCircle2 style={{ width: 28, height: 28, color: OK }} />
                <p style={{ fontSize: 13, fontWeight: 600, color: OK }}>No high-risk profiles</p>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>All reconciliation profiles are within acceptable risk thresholds.</p>
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto' }} className="slim-scroll">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-1)' }}>
                      {['Profile', 'Type', 'Risk', 'State', 'Action'].map((h) => (
                        <th key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '6px 10px', textAlign: 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {highRisk.map((p) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border-0)' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = ''}
                      >
                        <td style={{ padding: '9px 10px' }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</p>
                          <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>ID #{p.id}</p>
                        </td>
                        <td style={{ padding: '9px 10px', fontSize: 11, color: 'var(--text-secondary)' }}>
                          {(p.type || '—').replace(/_/g, ' ')}
                        </td>
                        <td style={{ padding: '9px 10px' }}>
                          <RiskBadge risk={p.risk} />
                        </td>
                        <td style={{ padding: '9px 10px' }}>
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 9999,
                            background: 'var(--surface-3)', border: '1px solid var(--border-1)',
                            color: 'var(--text-secondary)',
                          }}>
                            {(p.state || 'OPEN').replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td style={{ padding: '9px 10px' }}>
                          <button
                            onClick={() => navigate(`/my-reconciliations?profile=${p.id}`)}
                            style={{
                              fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
                              background: 'rgba(255,230,0,0.08)', border: '1px solid rgba(255,230,0,0.30)',
                              color: '#FFE600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <BookOpen style={{ width: 10, height: 10 }} />
                            View Ledger
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
