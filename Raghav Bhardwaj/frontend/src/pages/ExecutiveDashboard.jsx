import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import ReactECharts from 'echarts-for-react'
import { executionsAPI, projectsAPI } from '../api'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, LoadingState } from '../components/ui/PageState'
import { useProjectStore } from '../store/projectStore'

function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount || 0))
}

function flattenExecution(executionResults) {
  const rows = []
  let i = 1
  ;(executionResults?.units || []).forEach((unit) => {
    ;(unit.transactions || []).forEach((transaction) => {
      const mismatch = String(transaction.match_status || '').toLowerCase() !== 'matched'
      rows.push({
        id: i,
        entity: unit.entity || 'Unassigned',
        account: unit.account || 'Unassigned',
        status: transaction.match_status || 'OPEN',
        exception: mismatch,
        variance: mismatch ? 100 : 0,
      })
      i += 1
    })
  })
  return rows
}

function parseStats(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
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
  const { selectedProjectId, setSelectedProjectId } = useProjectStore()

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: projectsAPI.list })
  useEffect(() => {
    if (!selectedProjectId && projects.length) setSelectedProjectId(String(projects[0].id))
  }, [projects, selectedProjectId, setSelectedProjectId])

  const { data: executions = [] } = useQuery({
    queryKey: ['executive-executions', selectedProjectId],
    queryFn: () => executionsAPI.list(Number(selectedProjectId)),
    enabled: !!selectedProjectId,
  })

  const latestExecution = useMemo(() => executions.find((row) => String(row.status || '').toLowerCase() === 'completed') || executions[0], [executions])
  const completedExecutions = useMemo(
    () => executions.filter((row) => String(row.status || '').toLowerCase() === 'completed'),
    [executions]
  )

  const { data: executionResults } = useQuery({
    queryKey: ['executive-results', selectedProjectId, latestExecution?.id],
    queryFn: () => executionsAPI.results(Number(selectedProjectId), latestExecution.id, { page: 1, page_size: 1000 }),
    enabled: !!selectedProjectId && !!latestExecution?.id,
  })

  const transactions = useMemo(() => flattenExecution(executionResults), [executionResults])
  const summary = useMemo(() => {
    const total = transactions.length
    const matched = transactions.filter((row) => String(row.status || '').toLowerCase() === 'matched').length
    const openExceptions = transactions.filter((row) => row.exception).length
    const varianceAmount = transactions.reduce((sum, row) => sum + Math.abs(Number(row.variance || 0)), 0)

    const accountMap = new Map()
    transactions.forEach((row) => {
      const data = accountMap.get(row.account) || { account: row.account, exception_count: 0, variance_amount: 0, risk_level: 'LOW' }
      if (row.exception) data.exception_count += 1
      data.variance_amount += Math.abs(Number(row.variance || 0))
      if (data.exception_count >= 5) data.risk_level = 'HIGH'
      else if (data.exception_count >= 2) data.risk_level = 'MEDIUM'
      accountMap.set(row.account, data)
    })

    return {
      match_rate: total ? Number(((matched / total) * 100).toFixed(2)) : 0,
      open_exceptions: openExceptions,
      pending_approvals: openExceptions,
      certification_pct: total ? Number((((total - openExceptions) / total) * 100).toFixed(2)) : 0,
      variance_amount: varianceAmount,
      high_risk_accounts: Array.from(accountMap.values()).sort((a, b) => b.exception_count - a.exception_count).slice(0, 6),
      total_reconciliations: executionResults?.units?.length || 0,
    }
  }, [transactions, executionResults])

  const trendRows = useMemo(() => {
    const rows = completedExecutions
      .slice(0, 6)
      .reverse()
      .map((run, index) => {
        const stats = parseStats(run.stats)
        const matched = Number(stats.matched || 0)
        const unmatched = Number(stats.unmatched || 0)
        const partial = Number(stats.partial || 0)
        const total = Math.max(1, Number(stats.total_source || (matched + unmatched + partial)))
        return {
          label: `Run ${index + 1}`,
          matchRate: Number(stats.match_rate || ((matched / total) * 100).toFixed(2)),
          exceptions: unmatched + partial,
          variance: unmatched * 100 + partial * 50,
          certification: Number((((matched) / total) * 100).toFixed(2)),
        }
      })
    if (!rows.length) {
      return [{
        label: 'Latest Run',
        matchRate: Number(summary.match_rate || 0),
        exceptions: Number(summary.open_exceptions || 0),
        variance: Number(summary.variance_amount || 0),
        certification: Number(summary.certification_pct || 0),
      }]
    }
    return rows
  }, [completedExecutions, summary])

  const trendLabels = trendRows.map((row) => row.label)
  const matchRateOption = { xAxis: { type: 'category', data: trendLabels, axisLabel: { color: '#94a3b8' } }, yAxis: { type: 'value', axisLabel: { color: '#94a3b8', formatter: '{value}%' } }, series: [{ data: trendRows.map((row) => row.matchRate), type: 'line', smooth: true, lineStyle: { color: '#4f9cf9', width: 3 }, itemStyle: { color: '#4f9cf9' }, areaStyle: { color: 'rgba(79,156,249,0.16)' } }] }
  const exceptionTrendOption = { xAxis: { type: 'category', data: trendLabels, axisLabel: { color: '#94a3b8' } }, yAxis: { type: 'value', axisLabel: { color: '#94a3b8' } }, series: [{ data: trendRows.map((row) => row.exceptions), type: 'bar', itemStyle: { color: '#f59e0b' }, barMaxWidth: 28 }] }
  const varianceTrendOption = { xAxis: { type: 'category', data: trendLabels, axisLabel: { color: '#94a3b8' } }, yAxis: { type: 'value', axisLabel: { color: '#94a3b8' } }, series: [{ data: trendRows.map((row) => row.variance), type: 'line', smooth: true, lineStyle: { color: '#ef4444', width: 3 }, itemStyle: { color: '#ef4444' } }] }
  const certificationTrendOption = { xAxis: { type: 'category', data: trendLabels, axisLabel: { color: '#94a3b8' } }, yAxis: { type: 'value', axisLabel: { color: '#94a3b8', formatter: '{value}%' } }, series: [{ data: trendRows.map((row) => row.certification), type: 'line', smooth: true, lineStyle: { color: '#22c55e', width: 3 }, itemStyle: { color: '#22c55e' } }] }

  const loading = !!selectedProjectId && !executionResults

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Executive Overview" subtitle="Business KPIs from the selected project's latest reconciliation run." badge={`${summary.total_reconciliations || 0} reconciliations`} />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        <div className="card p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">Project Source</span>
          <select className="input max-w-xs" value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
            {projects.map((project) => <option key={project.id} value={String(project.id)}>{project.name}</option>)}
          </select>
          <span className="text-xs text-slate-500">KPIs are scoped to this project only</span>
        </div>

        {loading ? <LoadingState label="Loading executive dashboard..." /> : null}
        {!loading && !transactions.length ? <EmptyState title="No executive data" description="Run reconciliation for this project to populate KPI and trend views." /> : null}

        {!loading && transactions.length ? (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
              <KpiButton title="Match Rate" value={`${Math.round(summary.match_rate || 0)}%`} subtext="Click into reconciliation analytics" onClick={() => navigate('/analytics-explorer')} />
              <KpiButton title="Open Exceptions" value={summary.open_exceptions || 0} subtext="Investigate unresolved breaks" tone="danger" onClick={() => navigate('/exception-ops')} />
              <KpiButton title="Pending Approvals" value={summary.pending_approvals || 0} subtext="Certification workflow bottlenecks" tone="warning" onClick={() => navigate('/close-certification')} />
              <KpiButton title="Certification %" value={`${Math.round(summary.certification_pct || 0)}%`} subtext="Close-cycle completion health" onClick={() => navigate('/close-certification')} />
              <KpiButton title="Variance Amount" value={formatCurrency(summary.variance_amount, 'INR')} subtext="Net unresolved variance in scope" tone="danger" onClick={() => navigate('/analytics-explorer')} />
              <KpiButton title="High Risk Accounts" value={summary.high_risk_accounts?.length || 0} subtext="Open risk dashboard" tone="warning" onClick={() => navigate('/risk-dashboard')} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="card p-4"><p className="text-sm font-semibold text-slate-100 mb-3">Match Rate Trend</p><ReactECharts style={{ height: 260 }} option={matchRateOption} /></div>
              <div className="card p-4"><p className="text-sm font-semibold text-slate-100 mb-3">Exception Trend</p><ReactECharts style={{ height: 260 }} option={exceptionTrendOption} /></div>
              <div className="card p-4"><p className="text-sm font-semibold text-slate-100 mb-3">Variance Trend</p><ReactECharts style={{ height: 260 }} option={varianceTrendOption} /></div>
              <div className="card p-4"><p className="text-sm font-semibold text-slate-100 mb-3">Certification Trend</p><ReactECharts style={{ height: 260 }} option={certificationTrendOption} /></div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
