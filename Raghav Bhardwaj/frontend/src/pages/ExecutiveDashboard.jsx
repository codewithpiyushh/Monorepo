import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import ReactECharts from 'echarts-for-react'
import { enterpriseAPI } from '../api'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/PageState'

function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount || 0))
}

function buildTrendBuckets(transactions = []) {
  const buckets = new Map()
  transactions.forEach((row) => {
    const txDate = row.tx_date ? new Date(row.tx_date) : null
    const label = row.period || (txDate && !Number.isNaN(txDate.getTime()) ? txDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : 'Current')
    if (!buckets.has(label)) {
      buckets.set(label, {
        label,
        total: 0,
        matched: 0,
        exceptions: 0,
        variance: 0,
        certified: 0,
      })
    }
    const bucket = buckets.get(label)
    bucket.total += 1
    if (['MATCHED', 'RECONCILED', 'FINALIZED', 'APPROVED'].includes(String(row.status || '').toUpperCase())) bucket.matched += 1
    if (row.exception_id) bucket.exceptions += 1
    if (row.profile?.lifecycle_state && ['CLOSED', 'CERTIFIED', 'FORCE_CLOSED'].includes(String(row.profile.lifecycle_state).toUpperCase())) bucket.certified += 1
    bucket.variance += Math.abs(Number(row.match_variance || 0))
  })
  return Array.from(buckets.values()).slice(-6)
}

function KpiButton({ title, value, subtext, tone = 'default', onClick }) {
  const toneClass = tone === 'danger'
    ? 'border-red-800/50 bg-red-950/20'
    : tone === 'warning'
      ? 'border-amber-800/50 bg-amber-950/20'
      : 'border-surface-700 bg-surface-900/40'

  return (
    <button className={`card p-4 text-left transition hover:-translate-y-0.5 ${toneClass}`} onClick={onClick}>
      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-100">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{subtext}</p>
    </button>
  )
}

export default function ExecutiveDashboard() {
  const navigate = useNavigate()
  const { data: summary, isLoading: summaryLoading, isError: summaryError, error: summaryErr, refetch: refetchSummary } = useQuery({
    queryKey: ['analytics-summary'],
    queryFn: () => enterpriseAPI.analyticsSummary(),
  })
  const { data: explorer, isLoading: explorerLoading, isError: explorerError, error: explorerErr, refetch: refetchExplorer } = useQuery({
    queryKey: ['analytics-explorer-executive'],
    queryFn: enterpriseAPI.analyticsExplorer,
  })

  const loading = summaryLoading || explorerLoading
  const hasError = summaryError || explorerError
  const transactions = explorer?.transactions || []

  const trendBuckets = useMemo(() => buildTrendBuckets(transactions), [transactions])
  const labels = trendBuckets.map((bucket) => bucket.label)

  const matchRateOption = useMemo(() => ({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: labels, axisLabel: { color: '#94a3b8' } },
    yAxis: { type: 'value', axisLabel: { color: '#94a3b8', formatter: '{value}%' } },
    series: [{
      data: trendBuckets.map((bucket) => (bucket.total ? Number(((bucket.matched / bucket.total) * 100).toFixed(1)) : 0)),
      type: 'line',
      smooth: true,
      lineStyle: { color: '#4f9cf9', width: 3 },
      itemStyle: { color: '#4f9cf9' },
      areaStyle: { color: 'rgba(79,156,249,0.16)' },
    }],
  }), [labels, trendBuckets])

  const exceptionTrendOption = useMemo(() => ({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: labels, axisLabel: { color: '#94a3b8' } },
    yAxis: { type: 'value', axisLabel: { color: '#94a3b8' } },
    series: [{
      data: trendBuckets.map((bucket) => bucket.exceptions),
      type: 'bar',
      itemStyle: { color: '#f59e0b' },
      barMaxWidth: 28,
    }],
  }), [labels, trendBuckets])

  const varianceTrendOption = useMemo(() => ({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: labels, axisLabel: { color: '#94a3b8' } },
    yAxis: { type: 'value', axisLabel: { color: '#94a3b8' } },
    series: [{
      data: trendBuckets.map((bucket) => Number(bucket.variance.toFixed(0))),
      type: 'line',
      smooth: true,
      lineStyle: { color: '#ef4444', width: 3 },
      itemStyle: { color: '#ef4444' },
    }],
  }), [labels, trendBuckets])

  const certificationTrendOption = useMemo(() => ({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: labels, axisLabel: { color: '#94a3b8' } },
    yAxis: { type: 'value', axisLabel: { color: '#94a3b8', formatter: '{value}%' } },
    series: [{
      data: trendBuckets.map((bucket) => (bucket.total ? Number(((bucket.certified / bucket.total) * 100).toFixed(1)) : 0)),
      type: 'line',
      smooth: true,
      lineStyle: { color: '#22c55e', width: 3 },
      itemStyle: { color: '#22c55e' },
      areaStyle: { color: 'rgba(34,197,94,0.14)' },
    }],
  }), [labels, trendBuckets])

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Executive Dashboard"
        subtitle="Business KPIs for close progress, exception pressure, certification health, and exposure."
        badge={`${summary?.total_reconciliations || 0} reconciliations`}
      />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {loading ? <LoadingState label="Loading executive dashboard..." /> : null}

        {!loading && hasError ? (
          <ErrorState
            title="Unable to load executive dashboard"
            description={summaryErr?.response?.data?.detail || explorerErr?.response?.data?.detail || 'Please retry in a moment.'}
            action={<button className="btn-secondary" onClick={() => { refetchSummary(); refetchExplorer() }}>Retry</button>}
          />
        ) : null}

        {!loading && !hasError && !transactions.length ? (
          <EmptyState title="No executive data" description="Load reconciliation activity first to populate KPI and trend views." />
        ) : null}

        {!loading && !hasError && transactions.length ? (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
              <KpiButton title="Match Rate" value={`${Math.round(summary?.match_rate || 0)}%`} subtext="Click into reconciliation analytics" onClick={() => navigate('/analytics-explorer')} />
              <KpiButton title="Open Exceptions" value={summary?.open_exceptions || 0} subtext="Investigate unresolved breaks" tone="danger" onClick={() => navigate('/exception-ops')} />
              <KpiButton title="Pending Approvals" value={summary?.pending_approvals || 0} subtext="Certification workflow bottlenecks" tone="warning" onClick={() => navigate('/close-certification')} />
              <KpiButton title="Certification %" value={`${Math.round(summary?.certification_pct || 0)}%`} subtext="Close-cycle completion health" onClick={() => navigate('/close-certification')} />
              <KpiButton title="Variance Amount" value={formatCurrency(summary?.variance_amount, 'INR')} subtext="Net unresolved variance in scope" tone="danger" onClick={() => navigate('/analytics-explorer')} />
              <KpiButton title="High Risk Accounts" value={summary?.high_risk_accounts?.length || 0} subtext="Open risk dashboard" tone="warning" onClick={() => navigate('/risk-dashboard')} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="card p-4">
                <p className="text-sm font-semibold text-slate-100 mb-3">Match Rate Trend</p>
                <ReactECharts style={{ height: 260 }} option={matchRateOption} />
              </div>
              <div className="card p-4">
                <p className="text-sm font-semibold text-slate-100 mb-3">Exception Trend</p>
                <ReactECharts style={{ height: 260 }} option={exceptionTrendOption} />
              </div>
              <div className="card p-4">
                <p className="text-sm font-semibold text-slate-100 mb-3">Variance Trend</p>
                <ReactECharts style={{ height: 260 }} option={varianceTrendOption} />
              </div>
              <div className="card p-4">
                <p className="text-sm font-semibold text-slate-100 mb-3">Certification Trend</p>
                <ReactECharts style={{ height: 260 }} option={certificationTrendOption} />
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="card p-4 overflow-auto">
                <p className="text-sm font-semibold text-slate-100 mb-3">High Risk Accounts</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-surface-700">
                      <th className="p-2">Account</th>
                      <th className="p-2">Risk</th>
                      <th className="p-2">Exceptions</th>
                      <th className="p-2">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary?.high_risk_accounts || []).map((row) => (
                      <tr key={row.account} className="border-b border-surface-800 hover:bg-surface-800/40 cursor-pointer" onClick={() => navigate('/risk-dashboard')}>
                        <td className="p-2 text-slate-100">{row.account}</td>
                        <td className="p-2 text-amber-300">{row.risk_level || row.risk_score}</td>
                        <td className="p-2 text-slate-300">{row.exception_count || 0}</td>
                        <td className="p-2 text-slate-300">{formatCurrency(row.variance_amount, 'INR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card p-4">
                <p className="text-sm font-semibold text-slate-100 mb-3">Executive Actions</p>
                <div className="space-y-3">
                  <button className="btn-secondary w-full justify-between" onClick={() => navigate('/analytics-explorer')}>
                    Open Analytics Explorer
                    <span className="text-xs text-slate-400">Entity to evidence drilldown</span>
                  </button>
                  <button className="btn-secondary w-full justify-between" onClick={() => navigate('/risk-dashboard')}>
                    Open Risk Dashboard
                    <span className="text-xs text-slate-400">Heatmaps and account exposure</span>
                  </button>
                  <button className="btn-secondary w-full justify-between" onClick={() => navigate('/controls-governance')}>
                    Review Governance Controls
                    <span className="text-xs text-slate-400">SOD and approval policies</span>
                  </button>
                  <button className="btn-secondary w-full justify-between" onClick={() => navigate('/exception-ops')}>
                    Investigate Exceptions
                    <span className="text-xs text-slate-400">Jump to queue and workspace</span>
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
