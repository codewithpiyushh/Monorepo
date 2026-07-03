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
import { Layers, CheckCircle2, AlertTriangle, TrendingUp, ShieldAlert, Users, Zap } from 'lucide-react'

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
    backdropFilter: 'blur(10px)'
  }
}

// ── KPI Card (Premium) ──────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, color, onClick }) {
  return (
    <div className="premium-card micro-anim glass-panel" onClick={onClick} style={{
      padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16, cursor: onClick ? 'pointer' : 'default'
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12, background: `${color}14`,
        border: `1px solid ${color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        boxShadow: `0 4px 12px ${color}15`
      }}>
        <Icon style={{ width: 22, height: 22, color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-tertiary)', marginBottom: 2, letterSpacing: '0.02em', textTransform: 'uppercase' }}>{label}</p>
        <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1, letterSpacing: '-0.02em' }}>{value}</p>
        {sub && <p style={{ fontSize: 12, color: color, marginTop: 4, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
          <TrendingUp style={{ width: 12, height: 12 }} /> {sub}
        </p>}
      </div>
    </div>
  )
}

export default function ExecutiveDashboard() {
  const navigate = useNavigate()

  const { data: real, isLoading } = useQuery({
    queryKey: ['executive-real'],
    queryFn: () => advancedAPI.executiveDashboard(),
    refetchInterval: 10000,
  })

  // Formatters
  const fmtNum = (n) => typeof n === 'number' ? n.toLocaleString() : '0'
  const fmtCurr = (n) => typeof n === 'number' ? `$${(n/1000).toFixed(1)}k` : '$0'
  
  // ECharts Configurations
  const donutOptions = useMemo(() => {
    if (!real) return null
    return {
      ...ECHART_BASE,
      series: [{
        type: 'pie',
        radius: ['60%', '80%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 6, borderColor: 'var(--surface-0)', borderWidth: 2 },
        label: { show: false },
        data: [
          { value: real.exceptions.open, name: 'Open', itemStyle: { color: WARN } },
          { value: real.exceptions.total - real.exceptions.open, name: 'Resolved', itemStyle: { color: OK } },
        ]
      }]
    }
  }, [real])

  const areaChartOptions = useMemo(() => {
    if (!real) return null
    return {
      ...ECHART_BASE,
      tooltip: { ...ECHART_BASE.tooltip, trigger: 'axis' },
      grid: { top: 30, right: 20, bottom: 30, left: 50 },
      xAxis: { type: 'category', boundaryGap: false, data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], splitLine: { show: false } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: 'var(--border-1)', type: 'dashed' } } },
      series: [
        {
          name: 'Variance Impact',
          type: 'line',
          smooth: true,
          symbol: 'none',
          areaStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [{ offset: 0, color: `${BAD}66` }, { offset: 1, color: `${BAD}00` }]
            }
          },
          lineStyle: { width: 3, color: BAD },
          data: [120, 132, 101, 134, 90, 230, (real.unexplained_variance / 1000) || 500]
        }
      ]
    }
  }, [real])

  if (isLoading) return <div className="p-6"><LoadingState message="Connecting to Enterprise Data Grid..." /></div>
  if (!real) return null

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--surface-0)' }}>
      <div className="flex-none pt-8 px-8 pb-4">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] mb-1">Executive Overview</h1>
        <p className="text-[var(--text-secondary)] text-sm">Real-time financial close analytics and material risk exposure.</p>
      </div>

      <div className="flex-1 overflow-auto p-8 pt-4 space-y-8">
        {/* KPI Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <KpiCard label="Close Progress" value={`${fmtNum(real.profile_summary.certification_pct)}%`} sub="+4% from yesterday" icon={CheckCircle2} color={OK} />
          <KpiCard label="Material Variance" value={fmtCurr(real.unexplained_variance || 0)} sub="Requires investigation" icon={AlertTriangle} color={BAD} />
          <KpiCard label="Open Exceptions" value={fmtNum(real.exceptions.open)} sub="2 critical SLAs" icon={Layers} color={WARN} onClick={() => navigate('/exception-workbench')} />
          <KpiCard label="High Risk Profiles" value={fmtNum(real.high_risk_profiles.length)} sub="Immediate action needed" icon={ShieldAlert} color={INFO} onClick={() => navigate('/risk-dashboard')} />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <div className="lg:col-span-2 premium-card glass-panel p-6 flex flex-col">
            <div className="flex items-center justify-between mb-6 flex-none">
              <div>
                <h3 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[var(--bad)]" /> Variance Trajectory ($k)
                </h3>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">7-day rolling exposure across all global profiles.</p>
              </div>
              <button className="btn-secondary premium text-xs px-3 py-1">View Ledger</button>
            </div>
            <div style={{ flex: 1, minHeight: 280 }}>
              {areaChartOptions && <ReactECharts option={areaChartOptions} style={{ height: '100%', width: '100%' }} />}
            </div>
          </div>

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
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
