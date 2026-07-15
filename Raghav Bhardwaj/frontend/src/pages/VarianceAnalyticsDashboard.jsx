import { useMemo, useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useOutletContext, useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import { AlertTriangle, BarChart3, Filter, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'
import varianceAPI from '../api/varianceAPI'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, LoadingState } from '../components/ui/PageState'

const COLORS = {
  balanced: '#22c55e',
  within: '#3b82f6',
  material: '#f97316',
  critical: '#ef4444',
  slate: '#94a3b8',
}

const CLASS_META = {
  BALANCED: { label: 'Balanced', color: COLORS.balanced },
  WITHIN_THRESHOLD: { label: 'Within Threshold', color: COLORS.within },
  MATERIAL_VARIANCE: { label: 'Material', color: COLORS.material },
  CRITICAL_VARIANCE: { label: 'Critical', color: COLORS.critical },
}

function fmt(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function HeaderKpiCard({ label, value, color, icon: Icon }) {
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 8, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1, whiteSpace: 'nowrap' }}>{value}</div>
      </div>
      {Icon && <Icon size={14} color={color} style={{ opacity: 0.8 }} />}
    </div>
  )
}

function ChartCard({ title, subtitle, children, height = 320 }) {
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 12, padding: 16 }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
        {subtitle ? <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{subtitle}</div> : null}
      </div>
      <div style={{ height }}>{children}</div>
    </div>
  )
}

function sortByAbs(data, key) {
  return [...(data || [])].sort((a, b) => Math.abs(Number(b?.[key] || 0)) - Math.abs(Number(a?.[key] || 0)))
}

export default function VarianceAnalyticsDashboard() {
  const { setHeaderOverride } = useOutletContext() || {}
  const navigate = useNavigate()
  const [profileId, setProfileId] = useState('')
  const [months, setMonths] = useState(6)

  const fluxQuery = useQuery({
    queryKey: ['variance-flux', profileId],
    queryFn: () => varianceAPI.getVarianceFlux({ profile_id: profileId ? Number(profileId) : undefined, top_n: 12 }),
  })

  const trendQuery = useQuery({
    queryKey: ['variance-trends', profileId, months],
    queryFn: () => varianceAPI.getVarianceTrends({ profile_id: profileId ? Number(profileId) : undefined, months }),
  })

  const flux = fluxQuery.data
  const trends = trendQuery.data || []

  const topUnexplained = useMemo(() => sortByAbs(flux?.top_unexplained, 'unexplained_variance'), [flux])
  const topFlux = useMemo(() => sortByAbs(flux?.top_flux_shifts, 'flux_percentage'), [flux])
  const missingNarratives = flux?.missing_narratives ?? 0

  const waterfallOption = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 44, right: 18, top: 18, bottom: 28, containLabel: true },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: (flux?.waterfall || []).slice(0, 10).map((d) => d.profile_name), axisLabel: { color: COLORS.slate, rotate: 30 } },
    yAxis: { type: 'value', axisLabel: { color: COLORS.slate } },
    series: [{
      type: 'bar',
      data: (flux?.waterfall || []).slice(0, 10).map((d) => ({
        value: d.contribution,
        itemStyle: { color: CLASS_META[d.classification]?.color || COLORS.within },
      })),
      barMaxWidth: 24,
      label: { show: true, position: 'top', color: COLORS.slate, formatter: (p) => fmt(p.value) },
    }],
  }), [flux])

  const trendOption = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 46, right: 18, top: 18, bottom: 32, containLabel: true },
    tooltip: { trigger: 'axis' },
    legend: { data: ['Raw', 'Explained', 'Unexplained', 'Risk'], top: 0, textStyle: { color: COLORS.slate } },
    xAxis: { type: 'category', data: trends.map((d) => d.period_key), axisLabel: { color: COLORS.slate } },
    yAxis: [
      { type: 'value', axisLabel: { color: COLORS.slate } },
      { type: 'value', min: 0, max: 100, axisLabel: { color: COLORS.slate, formatter: '{value}' } },
    ],
    series: [
      { name: 'Raw', type: 'line', smooth: true, showSymbol: false, data: trends.map((d) => d.raw_variance), lineStyle: { color: COLORS.within, width: 2 } },
      { name: 'Explained', type: 'line', smooth: true, showSymbol: false, data: trends.map((d) => d.explained_variance), lineStyle: { color: COLORS.balanced, width: 2 } },
      { name: 'Unexplained', type: 'line', smooth: true, showSymbol: false, data: trends.map((d) => d.unexplained_variance), lineStyle: { color: COLORS.critical, width: 2 } },
      { name: 'Risk', type: 'line', yAxisIndex: 1, smooth: true, showSymbol: false, data: trends.map((d) => d.risk_score), lineStyle: { color: '#eab308', width: 2 } },
    ],
  }), [trends])

  // Override Layout Header
  useEffect(() => {
    if (setHeaderOverride) {
      setHeaderOverride(
        <header className="bl-header" style={{ padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div className="flex flex-col min-w-0 flex-shrink-0">
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-tertiary)', lineHeight: 1, fontFamily: 'Inter, sans-serif' }}>
              ANALYTICS
            </p>
            <div className="flex items-center gap-3 mt-[2px]">
              <h1 className="bl-header-title">Variance Analytics</h1>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {/* Controls */}
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 8, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Filter size={12} color="var(--text-tertiary)" />
                <input
                  value={profileId}
                  onChange={(e) => setProfileId(e.target.value)}
                  placeholder="Profile ID..."
                  style={{ width: 80, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border-1)', background: 'var(--surface-1)', color: 'var(--text-primary)', fontSize: 11 }}
                />
              </div>
              <div style={{ width: 1, height: 16, background: 'var(--border-2)' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>Trend</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  {[6, 9, 12].map((n) => (
                    <button
                      key={n}
                      onClick={() => setMonths(n)}
                      style={{
                        padding: '2px 6px',
                        borderRadius: 4,
                        border: `1px solid ${months === n ? COLORS.within : 'var(--border-1)'}`,
                        background: months === n ? `${COLORS.within}18` : 'transparent',
                        color: 'var(--text-primary)',
                        fontSize: 10,
                        cursor: 'pointer',
                      }}
                    >
                      {n}m
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ width: 1, height: 16, background: 'var(--border-2)' }} />
              <button
                onClick={() => {
                  fluxQuery.refetch()
                  trendQuery.refetch()
                }}
                style={{ padding: '2px', borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Refresh"
              >
                <RefreshCw size={12} />
              </button>
            </div>

            {/* KPIs */}
            <div style={{ display: 'flex', gap: 6 }}>
              <HeaderKpiCard label="Total Unexplained" value={`$${fmt(flux?.total_unexplained || 0)}`} color={COLORS.critical} icon={TrendingUp} />
              <HeaderKpiCard label="Profiles" value={flux?.total_profiles || 0} color={COLORS.within} icon={BarChart3} />
              <HeaderKpiCard label="Missing Explanations" value={missingNarratives} color={COLORS.material} icon={AlertTriangle} />
              <HeaderKpiCard label="Top Flux Shifts" value={topFlux.length} color={COLORS.balanced} icon={TrendingDown} />
            </div>
          </div>
        </header>
      )
    }
    return () => setHeaderOverride?.(null)
  }, [setHeaderOverride, profileId, months, flux, missingNarratives, topFlux.length])

  if (fluxQuery.isLoading || trendQuery.isLoading) {
    return <LoadingState message="Loading variance analytics" />
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 16, marginBottom: 16 }}>
        <ChartCard title="Corporate Waterfall" subtitle="Top unexplained balances by profile">
          {flux?.waterfall?.length ? <ReactECharts option={waterfallOption} style={{ height: '100%' }} notMerge /> : <EmptyState title="No waterfall data" description="Run balances with unexplained variance to populate this chart." />}
        </ChartCard>
        <ChartCard title="Variance Trend" subtitle={`Last ${months} months`}>
          {trends.length ? <ReactECharts option={trendOption} style={{ height: '100%' }} notMerge /> : <EmptyState title="No trend data" description="Snapshots will appear after balances are refreshed." />}
        </ChartCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <ChartCard title="Top Offenders - Unexplained" subtitle="Largest unexplained variances" height="auto">
          {topUnexplained.length ? (
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: 'var(--text-tertiary)', textAlign: 'left', borderBottom: '1px solid var(--border-1)' }}>
                    <th style={{ padding: '10px 12px' }}>Profile</th>
                    <th style={{ padding: '10px 12px' }}>Period</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Unexplained</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Class</th>
                  </tr>
                </thead>
                <tbody>
                  {topUnexplained.slice(0, 8).map((row) => (
                    <tr 
                      key={`${row.balance_id}-${row.period_key}`} 
                      style={{ borderBottom: '1px solid var(--border-0)', cursor: 'pointer' }}
                      className="hover:bg-surface-700/30 transition-colors"
                      onClick={() => navigate(`/balance-reconciliation/${row.balance_id}`)}
                    >
                      <td style={{ padding: '12px', maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)', fontWeight: 500 }} title={row.profile_name}>{row.profile_name}</td>
                      <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{row.period_key}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600, color: Math.abs(row.unexplained_variance) > 0 ? COLORS.critical : COLORS.balanced }}>
                        {fmt(row.unexplained_variance)}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <span style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: `${CLASS_META[row.classification]?.color || COLORS.within}15`, color: CLASS_META[row.classification]?.color || COLORS.within }}>
                          {CLASS_META[row.classification]?.label || row.classification}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No offenders" description="No unexplained variances were returned." />
          )}
        </ChartCard>

        <ChartCard title="Top Offenders - Flux" subtitle="Largest month-over-month swings" height="auto">
          {topFlux.length ? (
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: 'var(--text-tertiary)', textAlign: 'left', borderBottom: '1px solid var(--border-1)' }}>
                    <th style={{ padding: '10px 12px' }}>Profile</th>
                    <th style={{ padding: '10px 12px' }}>Period</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Flux %</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Narrative</th>
                  </tr>
                </thead>
                <tbody>
                  {topFlux.slice(0, 8).map((row) => (
                    <tr 
                      key={`${row.balance_id}-${row.period_key}`} 
                      style={{ borderBottom: '1px solid var(--border-0)', cursor: 'pointer' }}
                      className="hover:bg-surface-700/30 transition-colors"
                      onClick={() => navigate(`/balance-reconciliation/${row.balance_id}`)}
                    >
                      <td style={{ padding: '12px', maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)', fontWeight: 500 }} title={row.profile_name}>{row.profile_name}</td>
                      <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{row.period_key}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600, color: Math.abs(row.flux_percentage || 0) > 25 ? COLORS.critical : COLORS.material }}>
                        {row.flux_percentage == null ? '—' : `${row.flux_percentage >= 0 ? '+' : ''}${Number(row.flux_percentage).toFixed(1)}%`}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', color: row.explanation_provided ? COLORS.balanced : COLORS.material, fontWeight: 500 }}>
                        {row.explanation_provided ? 'Saved' : 'Missing'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No flux shifts" description="No month-over-month changes were returned." />
          )}
        </ChartCard>
      </div>
    </div>
  )
}
