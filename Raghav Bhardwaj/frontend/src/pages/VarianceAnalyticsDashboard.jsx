import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
    <div style={{ flex: 1, minWidth: 180, background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '14px 16px', display: 'flex', gap: 12 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={16} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{value}</div>
        {sub ? <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>{sub}</div> : null}
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

  if (fluxQuery.isLoading || trendQuery.isLoading) {
    return <LoadingState message="Loading variance analytics" />
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <PageHeader
        title="Variance Analytics"
        subtitle="Corporate unexplained variance, flux shifts, and narrative coverage."
        icon={<BarChart3 size={22} />}
      />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18, alignItems: 'end' }}>
        <div style={{ minWidth: 220 }}>
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 5 }}>
            <Filter size={12} style={{ marginRight: 5 }} />
            Profile ID
          </label>
          <input
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            placeholder="Filter by profile id"
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-1)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 5 }}>Trend Window</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[6, 9, 12].map((n) => (
              <button
                key={n}
                onClick={() => setMonths(n)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: `1px solid ${months === n ? COLORS.within : 'var(--border-1)'}`,
                  background: months === n ? `${COLORS.within}18` : 'transparent',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                {n} mo
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => {
            fluxQuery.refetch()
            trendQuery.refetch()
          }}
          style={{ marginLeft: 'auto', padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border-1)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <KpiCard label="Total Unexplained" value={`$${fmt(flux?.total_unexplained || 0)}`} icon={TrendingUp} color={COLORS.critical} />
        <KpiCard label="Profiles in Scope" value={flux?.total_profiles || 0} icon={BarChart3} color={COLORS.within} />
        <KpiCard label="Missing Narratives" value={missingNarratives} icon={AlertTriangle} color={COLORS.material} sub="Material/Critical without a saved explanation" />
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
                  <tr key={`${row.balance_id}-${row.period_key}`} style={{ borderTop: '1px solid var(--border-0)' }}>
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
                  <tr key={`${row.balance_id}-${row.period_key}`} style={{ borderTop: '1px solid var(--border-0)' }}>
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
