import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import ReactECharts from 'echarts-for-react'
import toast from 'react-hot-toast'
import { enterpriseAPI } from '../api'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/PageState'

function toCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount || 0))
}

function statusTone(level) {
  const normalized = String(level || '').toUpperCase()
  if (normalized === 'CRITICAL') return 'text-red-300'
  if (normalized === 'HIGH') return 'text-amber-300'
  if (normalized === 'MEDIUM') return 'text-sky-300'
  return 'text-emerald-300'
}

export default function RiskDashboard() {
  const navigate = useNavigate()
  const [selectedEntity, setSelectedEntity] = useState('')
  const [selectedAccount, setSelectedAccount] = useState('')

  const { data: riskData, isLoading: riskLoading, isError: riskError, error: riskErr, refetch: refetchRisk } = useQuery({
    queryKey: ['risk-heatmap', selectedEntity],
    queryFn: () => enterpriseAPI.riskHeatmap(selectedEntity),
  })
  const { data: explorer, isLoading: explorerLoading, isError: explorerError, error: explorerErr, refetch: refetchExplorer } = useQuery({
    queryKey: ['analytics-explorer-risk'],
    queryFn: enterpriseAPI.analyticsExplorer,
  })

  const recalcMutation = useMutation({
    mutationFn: enterpriseAPI.calculateRisk,
    onSuccess: (res) => {
      toast.success(`Risk scoring refreshed for ${res.processed || 0} profiles`)
      refetchRisk()
      refetchExplorer()
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Risk scoring failed'),
  })

  const loading = riskLoading || explorerLoading
  const hasError = riskError || explorerError
  const drilldown = riskData?.drilldown || []
  const entities = riskData?.entities || []
  const accounts = riskData?.accounts || []
  const transactions = explorer?.transactions || []

  const entityOptions = useMemo(() => [''].concat(entities), [entities])
  const accountRows = useMemo(() => drilldown.filter((row) => !selectedEntity || row.entity === selectedEntity), [drilldown, selectedEntity])
  const selectedAccountRow = useMemo(() => accountRows.find((row) => row.account === selectedAccount) || null, [accountRows, selectedAccount])
  const selectedExceptions = useMemo(() => {
    return transactions.filter((row) => {
      if (!row.exception_id) return false
      if (selectedEntity && row.entity !== selectedEntity) return false
      if (selectedAccount && row.account !== selectedAccount) return false
      return true
    })
  }, [transactions, selectedAccount, selectedEntity])

  const heatmapOption = useMemo(() => ({
    tooltip: {
      formatter: (params) => {
        const [x, y, value] = params.data
        return `${riskData?.entities?.[x] || 'Entity'}<br/>${riskData?.accounts?.[y] || 'Account'}<br/>Risk Score: ${value}`
      },
    },
    grid: { top: 24, right: 12, bottom: 52, left: 100 },
    xAxis: {
      type: 'category',
      data: riskData?.entities || [],
      axisLabel: { color: '#94a3b8', rotate: 20 },
    },
    yAxis: {
      type: 'category',
      data: riskData?.accounts || [],
      axisLabel: { color: '#94a3b8' },
    },
    visualMap: {
      min: 0,
      max: 100,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      inRange: { color: ['#14532d', '#1d4ed8', '#f59e0b', '#dc2626'] },
      textStyle: { color: '#94a3b8' },
    },
    series: [{
      type: 'heatmap',
      data: riskData?.heatmap || [],
      label: { show: true, color: '#e2e8f0', formatter: ({ data }) => data?.[2] ?? '' },
      itemStyle: { borderColor: 'rgba(15,23,42,0.4)', borderWidth: 1 },
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(15,23,42,0.45)' } },
    }],
  }), [riskData])

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Risk Dashboard"
        subtitle="Entity-to-account heatmaps with drilldown into live exceptions and transactions."
        badge={`${drilldown.length} risk cells`}
        actions={<button className="btn-secondary" onClick={() => recalcMutation.mutate()} disabled={recalcMutation.isPending}>{recalcMutation.isPending ? 'Refreshing...' : 'Recalculate Risk'}</button>}
      />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        <div className="card p-3 grid grid-cols-1 md:grid-cols-3 gap-2">
          <select className="input" value={selectedEntity} onChange={(e) => { setSelectedEntity(e.target.value); setSelectedAccount('') }}>
            {entityOptions.map((entity) => <option key={entity || 'all'} value={entity}>{entity || 'All Entities'}</option>)}
          </select>
          <select className="input" value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}>
            <option value="">All Accounts</option>
            {accountRows.map((row) => <option key={`${row.entity}-${row.account}`} value={row.account}>{row.account}</option>)}
          </select>
          <button className="btn-secondary" onClick={() => { setSelectedEntity(''); setSelectedAccount('') }}>Reset Filters</button>
        </div>

        {loading ? <LoadingState label="Loading risk dashboard..." /> : null}

        {!loading && hasError ? (
          <ErrorState
            title="Unable to load risk dashboard"
            description={riskErr?.response?.data?.detail || explorerErr?.response?.data?.detail || 'Please retry in a moment.'}
            action={<button className="btn-secondary" onClick={() => { refetchRisk(); refetchExplorer() }}>Retry</button>}
          />
        ) : null}

        {!loading && !hasError && !drilldown.length ? (
          <EmptyState title="No risk data" description="Generate reconciliation activity first to populate risk scoring." />
        ) : null}

        {!loading && !hasError && drilldown.length ? (
          <>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="card p-4 xl:col-span-2">
                <p className="text-sm font-semibold text-slate-100 mb-3">Entity Risk Heatmap</p>
                <ReactECharts style={{ height: 420 }} option={heatmapOption} />
              </div>

              <div className="card p-4">
                <p className="text-sm font-semibold text-slate-100 mb-3">Risk Summary</p>
                <div className="space-y-3">
                  <div className="oracle-kpi p-3">
                    <p className="text-xs text-slate-400">Critical / High</p>
                    <p className="text-xl font-semibold text-slate-100">{drilldown.filter((row) => ['CRITICAL', 'HIGH'].includes(row.risk_level)).length}</p>
                  </div>
                  <div className="oracle-kpi p-3">
                    <p className="text-xs text-slate-400">Open Exceptions</p>
                    <p className="text-xl font-semibold text-slate-100">{transactions.filter((row) => row.exception_id).length}</p>
                  </div>
                  <div className="oracle-kpi p-3">
                    <p className="text-xs text-slate-400">Selected Scope</p>
                    <p className="text-sm font-semibold text-slate-100">{selectedEntity || 'All Entities'} / {selectedAccount || 'All Accounts'}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="card p-4 overflow-auto">
                <p className="text-sm font-semibold text-slate-100 mb-3">Account Risk</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-surface-700">
                      <th className="p-2">Entity</th>
                      <th className="p-2">Account</th>
                      <th className="p-2">Risk</th>
                      <th className="p-2">Exceptions</th>
                      <th className="p-2">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accountRows.map((row) => (
                      <tr key={`${row.entity}-${row.account}`} className="border-b border-surface-800 hover:bg-surface-800/40 cursor-pointer" onClick={() => setSelectedAccount(row.account)}>
                        <td className="p-2 text-slate-300">{row.entity}</td>
                        <td className="p-2 text-slate-100">{row.account}</td>
                        <td className={`p-2 font-medium ${statusTone(row.risk_level)}`}>{row.risk_level} ({row.risk_score})</td>
                        <td className="p-2 text-slate-300">{row.exception_count}</td>
                        <td className="p-2 text-slate-300">{toCurrency(row.variance_amount, 'INR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card p-4 overflow-auto">
                <p className="text-sm font-semibold text-slate-100 mb-3">Risk Drilldown</p>
                {!selectedAccountRow ? (
                  <p className="text-sm text-slate-400">Select an account row to see the risk to exception to transaction path.</p>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="oracle-kpi p-3">
                        <p className="text-xs text-slate-400">Selected Account</p>
                        <p className="text-sm font-semibold text-slate-100">{selectedAccountRow.account}</p>
                      </div>
                      <div className="oracle-kpi p-3">
                        <p className="text-xs text-slate-400">Risk Level</p>
                        <p className={`text-sm font-semibold ${statusTone(selectedAccountRow.risk_level)}`}>{selectedAccountRow.risk_level}</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500 mb-2">Exception</p>
                      <div className="space-y-2">
                        {selectedExceptions.slice(0, 8).map((row) => (
                          <button key={`${row.exception_id}-${row.record_id}`} className="w-full text-left border border-surface-700 rounded-xl p-3 hover:bg-surface-800/40" onClick={() => navigate(`/exception-investigation/${row.exception_id}`)}>
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium text-slate-100">{row.exception_classification || 'Exception'} #{row.exception_id}</p>
                                <p className="mt-1 text-xs text-slate-400">Transaction {row.reference || row.record_id} · {toCurrency(row.match_variance_amount || row.match_variance, 'INR')} variance</p>
                              </div>
                              <span className="text-xs text-brand-300">Investigate</span>
                            </div>
                          </button>
                        ))}
                        {!selectedExceptions.length ? <p className="text-xs text-slate-500">No open exceptions in the selected slice.</p> : null}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
