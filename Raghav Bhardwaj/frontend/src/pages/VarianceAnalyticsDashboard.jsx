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

function KpiCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div style={{ flex: 1, minWidth: 0, background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={14} color={color} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 9.5, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
        {sub ? <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div> : null}
      </div>
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
        <header className="bl-header" style={{ padding: '0 24px' }}>
          <div className="flex flex-col min-w-0 flex-shrink-0">
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-tertiary)', lineHeight: 1, fontFamily: 'Inter, sans-serif' }}>
              ANALYTICS
            </p>
            <div className="flex items-center gap-3 mt-[2px]">
              <h1 className="bl-header-title">Variance Analytics</h1>
            </div>
          </div>
        </header>
      )
    }
    return () => setHeaderOverride?.(null)
  }, [setHeaderOverride])

  if (fluxQuery.isLoading || trendQuery.isLoading) {
    return <LoadingState message="Loading variance analytics" />
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, alignItems: 'stretch' }}>
        
        {/* Controls block styled like a KPI card */}
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 16 }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Filter size={14} color="var(--text-tertiary)" />
            <input
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              placeholder="Profile ID..."
              style={{ width: 100, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-1)', background: 'var(--surface-1)', color: 'var(--text-primary)', fontSize: 12 }}
            />
          </div>

          <div style={{ width: 1, height: 24, background: 'var(--border-2)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9.5, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>Trend</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {[6, 9, 12].map((n) => (
                <button
                  key={n}
                  onClick={() => setMonths(n)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 6,
                    border: `1px solid ${months === n ? COLORS.within : 'var(--border-1)'}`,
                    background: months === n ? `${COLORS.within}18` : 'transparent',
                    color: 'var(--text-primary)',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  {n}m
                </button>
              ))}
            </div>
          </div>

          <div style={{ width: 1, height: 24, background: 'var(--border-2)' }} />

          <button
            onClick={() => {
              fluxQuery.refetch()
              trendQuery.refetch()
            }}
            style={{ padding: '6px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        <KpiCard label="Total Unexplained" value={`$${fmt(flux?.total_unexplained || 0)}`} icon={TrendingUp} color={COLORS.critical} />
        <KpiCard label="Profiles in Scope" value={flux?.total_profiles || 0} icon={BarChart3} color={COLORS.within} />
        <KpiCard label="Missing Narratives" value={missingNarratives} icon={AlertTriangle} color={COLORS.material} sub="No saved explanation" />
        <KpiCard label="Top Flux Shifts" value={topFlux.length} icon={TrendingDown} color={COLORS.balanced} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 16, marginBottom: 16 }}>
        <ChartCard title="Corporate Waterfall" subtitle="Top unexplained balances by profile">
          {flux?.waterfall?.length ? <ReactECharts option={waterfallOption} style={{ height: '100%' }} notMerge /> : <EmptyState title="No waterfall data" description="Run balances with unexplained variance to populate this chart." />}
        </ChartCard>
        <ChartCard title="Variance Trend" subtitle={`Last ${months} months`}>
          {trends.length ? <ReactECharts option={trendOption} style={{ height: '100%' }} notMerge /> : <EmptyState title="No trend data" description="Snapshots will appear after balances are refreshed." />}
        </ChartCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <ChartCard title="Top Offenders - Unexplained" subtitle="Largest unexplained variances">
          {topUnexplained.length ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: 'var(--text-tertiary)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 0' }}>Profile</th>
                  <th>Period</th>
                  <th style={{ textAlign: 'right' }}>Unexplained</th>
                  <th style={{ textAlign: 'right' }}>Class</th>
                </tr>
              </thead>
              <tbody>
                {topUnexplained.slice(0, 8).map((row) => (
                  <tr 
                    key={`${row.balance_id}-${row.period_key}`} 
                    style={{ borderTop: '1px solid var(--border-0)', cursor: 'pointer' }}
                    className="hover:bg-surface-700/30 transition-colors"
                    onClick={() => navigate(`/balance-reconciliation/${row.balance_id}`)}
                  >
                    <td style={{ padding: '8px 0' }}>{row.profile_name}</td>
                    <td>{row.period_key}</td>
                    <td style={{ textAlign: 'right', color: Math.abs(row.unexplained_variance) > 0 ? COLORS.critical : COLORS.balanced }}>
                      {fmt(row.unexplained_variance)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 999, background: `${CLASS_META[row.classification]?.color || COLORS.within}18`, color: CLASS_META[row.classification]?.color || COLORS.within }}>
                        {CLASS_META[row.classification]?.label || row.classification}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title="No offenders" description="No unexplained variances were returned." />
          )}
        </ChartCard>

        <ChartCard title="Top Offenders - Flux" subtitle="Largest month-over-month swings">
          {topFlux.length ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: 'var(--text-tertiary)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 0' }}>Profile</th>
                  <th>Period</th>
                  <th style={{ textAlign: 'right' }}>Flux %</th>
                  <th style={{ textAlign: 'right' }}>Narrative</th>
                </tr>
              </thead>
              <tbody>
                {topFlux.slice(0, 8).map((row) => (
                  <tr 
                    key={`${row.balance_id}-${row.period_key}`} 
                    style={{ borderTop: '1px solid var(--border-0)', cursor: 'pointer' }}
                    className="hover:bg-surface-700/30 transition-colors"
                    onClick={() => navigate(`/balance-reconciliation/${row.balance_id}`)}
                  >
                    <td style={{ padding: '8px 0' }}>{row.profile_name}</td>
                    <td>{row.period_key}</td>
                    <td style={{ textAlign: 'right', color: Math.abs(row.flux_percentage || 0) > 25 ? COLORS.critical : COLORS.material }}>
                      {row.flux_percentage == null ? '—' : `${row.flux_percentage >= 0 ? '+' : ''}${Number(row.flux_percentage).toFixed(1)}%`}
                    </td>
                    <td style={{ textAlign: 'right', color: row.explanation_provided ? COLORS.balanced : COLORS.material }}>
                      {row.explanation_provided ? 'Saved' : 'Missing'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title="No flux shifts" description="No month-over-month changes were returned." />
          )}
        </ChartCard>
      </div>
    </div>
  )
}
