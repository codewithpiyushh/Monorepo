import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import ReactECharts from 'echarts-for-react'
import { AlertTriangle, ShieldAlert, Siren, Radar } from 'lucide-react'
import { executionsAPI, projectsAPI } from '../api'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, LoadingState } from '../components/ui/PageState'
import { useProjectStore } from '../store/projectStore'

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

function flattenExecution(executionResults) {
  const rows = []
  ;(executionResults?.units || []).forEach((unit, unitIndex) => {
    ;(unit.transactions || []).forEach((transaction) => {
      const status = String(transaction.match_status || '').toLowerCase()
      const mismatch = status !== 'matched'
      const discrepancies = (() => {
        if (!transaction.discrepancies) return []
        try {
          const parsed = typeof transaction.discrepancies === 'string' ? JSON.parse(transaction.discrepancies) : transaction.discrepancies
          return Array.isArray(parsed) ? parsed : []
        } catch {
          return []
        }
      })()
      rows.push({
        record_id: transaction.id || `${unit.entity || 'NA'}-${unit.account || 'NA'}-${unitIndex}`,
        entity: unit.entity || 'Unassigned',
        account: unit.account || 'Unassigned',
        status: transaction.match_status || 'OPEN',
        exception_id: mismatch ? `EX-${transaction.id}` : null,
        exception_classification: discrepancies[0]?.source_column || (mismatch ? 'Rule Mismatch' : 'No Exception'),
        reference:
          transaction.selected_source_data?.reference ||
          transaction.selected_target_data?.reference ||
          `TXN-${String(transaction.id || 0).padStart(5, '0')}`,
        match_variance: mismatch ? Math.round((1 - Number(transaction.match_score || 0)) * 100) : 0,
      })
    })
  })
  return rows
}

function decodeParam(value = '') {
  if (!value) return ''
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export default function RiskDashboard() {
  const navigate = useNavigate()
  const { entity: routeEntity = '', account: routeAccount = '' } = useParams()
  const selectedEntityRoute = decodeParam(routeEntity)
  const selectedAccountRoute = decodeParam(routeAccount)

  const [selectedEntity, setSelectedEntity] = useState(selectedEntityRoute)
  const [selectedAccount, setSelectedAccount] = useState(selectedAccountRoute)
  const [entityPage, setEntityPage] = useState(1)
  const [accountPage, setAccountPage] = useState(1)
  const [txnPage, setTxnPage] = useState(1)
  const PAGE_SIZE_ENTITY = 8
  const PAGE_SIZE_ACCOUNT = 10
  const PAGE_SIZE_TXN = 10
  const { selectedProjectId, setSelectedProjectId } = useProjectStore()

  useEffect(() => {
    setSelectedEntity(selectedEntityRoute)
    setSelectedAccount(selectedAccountRoute)
  }, [selectedEntityRoute, selectedAccountRoute])

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: projectsAPI.list })
  useEffect(() => {
    if (!selectedProjectId && projects.length) setSelectedProjectId(String(projects[0].id))
  }, [projects, selectedProjectId, setSelectedProjectId])

  const { data: executions = [] } = useQuery({
    queryKey: ['risk-executions', selectedProjectId],
    queryFn: () => executionsAPI.list(Number(selectedProjectId)),
    enabled: !!selectedProjectId,
  })

  const latestExecution = useMemo(() => executions.find((row) => String(row.status || '').toLowerCase() === 'completed') || executions[0], [executions])

  const { data: executionResults } = useQuery({
    queryKey: ['risk-results', selectedProjectId, latestExecution?.id],
    queryFn: () => executionsAPI.results(Number(selectedProjectId), latestExecution.id, { page: 1, page_size: 1000 }),
    enabled: !!selectedProjectId && !!latestExecution?.id,
  })

  const transactions = useMemo(() => flattenExecution(executionResults), [executionResults])

  const allDrilldown = useMemo(() => {
    const grouped = new Map()
    transactions.forEach((row) => {
      const key = `${row.entity}::${row.account}`
      const item = grouped.get(key) || {
        entity: row.entity,
        account: row.account,
        exception_count: 0,
        variance_amount: 0,
        total_transactions: 0,
        unmatched_count: 0,
        partial_count: 0,
      }
      item.total_transactions += 1
      if (row.exception_id) item.exception_count += 1
      item.variance_amount += Math.abs(Number(row.match_variance || 0))
      const normalized = String(row.status || '').toLowerCase()
      if (normalized === 'unmatched') item.unmatched_count += 1
      if (normalized === 'partial') item.partial_count += 1
      grouped.set(key, item)
    })

    return Array.from(grouped.values())
      .map((row) => {
        const exceptionRate = row.total_transactions ? (row.exception_count / row.total_transactions) * 100 : 0
        const severityWeight = (row.unmatched_count * 1.4) + (row.partial_count * 0.8)
        const riskScore = Math.min(100, (exceptionRate * 0.6) + (severityWeight * 6) + Math.min(25, row.variance_amount / 10))
        const riskLevel = riskScore >= 80 ? 'CRITICAL' : riskScore >= 60 ? 'HIGH' : riskScore >= 30 ? 'MEDIUM' : 'LOW'
        return { ...row, risk_score: Math.round(riskScore), risk_level: riskLevel, exception_rate: Number(exceptionRate.toFixed(1)) }
      })
      .sort((a, b) => b.risk_score - a.risk_score)
  }, [transactions])

  const entitySummary = useMemo(() => {
    const grouped = new Map()
    allDrilldown.forEach((row) => {
      const item = grouped.get(row.entity) || { entity: row.entity, risk_score: 0, exception_count: 0, variance_amount: 0, account_count: 0 }
      item.risk_score += row.risk_score
      item.exception_count += row.exception_count
      item.variance_amount += row.variance_amount
      item.account_count += 1
      grouped.set(row.entity, item)
    })

    return Array.from(grouped.values()).sort((a, b) => b.risk_score - a.risk_score)
  }, [allDrilldown])

  const visibleAccounts = useMemo(() => {
    if (!selectedEntity) return allDrilldown
    return allDrilldown.filter((row) => row.entity === selectedEntity)
  }, [allDrilldown, selectedEntity])

  const selectedTransactions = useMemo(
    () =>
      transactions.filter((row) => {
        if (selectedEntity && row.entity !== selectedEntity) return false
        if (selectedAccount && row.account !== selectedAccount) return false
        return true
      }),
    [transactions, selectedEntity, selectedAccount],
  )

  const exceptionBreakdown = useMemo(() => {
    const grouped = new Map()
    selectedTransactions
      .filter((row) => row.exception_id)
      .forEach((row) => {
        const item = grouped.get(row.exception_classification) || { label: row.exception_classification, count: 0 }
        item.count += 1
        grouped.set(row.exception_classification, item)
      })

    return Array.from(grouped.values()).sort((a, b) => b.count - a.count)
  }, [selectedTransactions])

  const riskSignals = useMemo(() => {
    const openExceptions = selectedTransactions.filter((row) => row.exception_id)
    const riskScore = Math.round(
      visibleAccounts.length
        ? visibleAccounts.reduce((sum, row) => sum + Number(row.risk_score || 0), 0) / visibleAccounts.length
        : 0,
    )
    const criticalMismatches = selectedTransactions.filter((row) => {
      const status = String(row.status || '').toLowerCase()
      return status === 'unmatched' || Number(row.match_variance || 0) >= 80
    }).length
    const complianceAlerts = visibleAccounts.filter((row) => ['HIGH', 'CRITICAL'].includes(String(row.risk_level || '').toUpperCase())).length
    const sodViolations = selectedTransactions.filter((row) => {
      const label = String(row.exception_classification || '').toLowerCase()
      return label.includes('sod') || label.includes('segregation') || label.includes('duty')
    }).length
    const suspiciousRefs = new Map()
    selectedTransactions.forEach((row) => {
      if (!row.exception_id) return
      const key = `${row.entity}::${row.account}::${row.reference}`
      suspiciousRefs.set(key, (suspiciousRefs.get(key) || 0) + 1)
    })
    const fraudIndicators = Array.from(suspiciousRefs.values()).filter((count) => count > 1).length
    const hottestNode = visibleAccounts[0]
      ? `${visibleAccounts[0].entity} / ${visibleAccounts[0].account}`
      : 'No hotspots'
    return {
      riskScore,
      exceptionHeatmap: hottestNode,
      criticalMismatches,
      sodViolations,
      complianceAlerts,
      fraudIndicators,
      openExceptions: openExceptions.length,
    }
  }, [selectedTransactions, visibleAccounts])

  const currentDepth = selectedEntity ? 'entity' : 'overview'

  const goOverview = () => {
    setSelectedAccount('')
    setEntityPage(1)
    setAccountPage(1)
    setTxnPage(1)
    navigate('/risk-dashboard')
  }
  const goEntity = (entity) => {
    setSelectedAccount('')
    setAccountPage(1)
    setTxnPage(1)
    navigate(`/risk-dashboard/${encodeURIComponent(entity)}`)
  }
  const selectAccount = (account) => {
    setSelectedAccount(account)
    setTxnPage(1)
  }

  const paginatedEntities = useMemo(() => {
    const start = (entityPage - 1) * PAGE_SIZE_ENTITY
    return entitySummary.slice(start, start + PAGE_SIZE_ENTITY)
  }, [entitySummary, entityPage])

  const paginatedAccounts = useMemo(() => {
    const start = (accountPage - 1) * PAGE_SIZE_ACCOUNT
    return visibleAccounts.slice(start, start + PAGE_SIZE_ACCOUNT)
  }, [visibleAccounts, accountPage])

  const paginatedTransactions = useMemo(() => {
    const start = (txnPage - 1) * PAGE_SIZE_TXN
    return selectedTransactions.slice(start, start + PAGE_SIZE_TXN)
  }, [selectedTransactions, txnPage])

  const breadcrumbItems = [
    { label: 'Overview', active: currentDepth === 'overview', onClick: goOverview },
    ...(selectedEntity ? [{ label: selectedEntity, active: true, onClick: () => goEntity(selectedEntity) }] : []),
  ]

  const entityChartOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { top: 20, right: 12, bottom: 40, left: 80 },
      xAxis: { type: 'value', axisLabel: { color: '#94a3b8' } },
      yAxis: { type: 'category', data: entitySummary.map((row) => row.entity), axisLabel: { color: '#94a3b8' } },
      series: [{
        type: 'bar',
        data: entitySummary.map((row) => row.risk_score),
        itemStyle: { color: '#4f9cf9' },
        label: { show: true, color: '#e2e8f0' },
      }],
    }),
    [entitySummary],
  )

  const accountChartOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { top: 20, right: 12, bottom: 40, left: 80 },
      xAxis: { type: 'value', axisLabel: { color: '#94a3b8' } },
      yAxis: { type: 'category', data: visibleAccounts.map((row) => row.account), axisLabel: { color: '#94a3b8' } },
      series: [{
        type: 'bar',
        data: visibleAccounts.map((row) => row.risk_score),
        itemStyle: { color: '#38bdf8' },
        label: { show: true, color: '#e2e8f0' },
      }],
    }),
    [visibleAccounts],
  )

  const chartOption = currentDepth === 'entity' ? accountChartOption : entityChartOption
  const chartEvents =
    currentDepth === 'entity'
      ? {
          click: (params) => {
            if (!params?.name) return
            selectAccount(params.name)
          },
        }
      : {
          click: (params) => {
            if (!params?.name) return
            goEntity(params.name)
          },
        }

  const loading = !!selectedProjectId && !executionResults

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title={currentDepth === 'overview' ? 'Risk & Compliance Dashboard' : `Risk Drilldown - ${selectedEntity}`}
        subtitle="Audit-focused risk monitoring with risk score, heatmap hotspots, critical mismatches, SOD checks, compliance alerts, and fraud indicators."
        badge={currentDepth === 'overview' ? `${entitySummary.length} entities` : `${visibleAccounts.length} accounts`}
        actions={
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={goOverview}>Reset</button>
            {selectedEntity ? <button className="btn-secondary" onClick={() => goEntity(selectedEntity)}>Refresh Entity View</button> : null}
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        <div className="card oracle-hero p-4 md:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">Oracle ARCS Style Monitor</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-100">Risk Intelligence Control Tower</h2>
              <p className="mt-1 text-sm text-slate-400">Entity-first risk posture with account-level diagnostics and transaction evidence panel.</p>
            </div>
            <div className="hidden md:grid grid-cols-2 gap-2 text-xs text-slate-300">
              <div className="rounded-lg border border-surface-600 bg-surface-900/40 px-3 py-2"><ShieldAlert className="inline w-3.5 h-3.5 mr-1" /> Compliance Lens</div>
              <div className="rounded-lg border border-surface-600 bg-surface-900/40 px-3 py-2"><AlertTriangle className="inline w-3.5 h-3.5 mr-1" /> Exception Focus</div>
              <div className="rounded-lg border border-surface-600 bg-surface-900/40 px-3 py-2"><Siren className="inline w-3.5 h-3.5 mr-1" /> Critical Alerts</div>
              <div className="rounded-lg border border-surface-600 bg-surface-900/40 px-3 py-2"><Radar className="inline w-3.5 h-3.5 mr-1" /> Fraud Signals</div>
            </div>
          </div>
        </div>

        <div className="card p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">Project Source</span>
          <select className="input max-w-xs" value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
            {projects.map((project) => <option key={project.id} value={String(project.id)}>{project.name}</option>)}
          </select>
          <span className="text-xs text-slate-500">Risk view is scoped to this project only</span>
        </div>

        {breadcrumbItems.length ? (
          <div className="card p-3 flex flex-wrap items-center gap-2 text-sm">
            {breadcrumbItems.map((item, index) => (
              <div key={item.label} className="flex items-center gap-2">
                <button className={`px-2 py-1 rounded-lg ${item.active ? 'bg-brand-900/30 text-brand-200 border border-brand-700/40' : 'bg-surface-900/40 text-slate-300 border border-surface-700'}`} onClick={item.onClick}>{item.label}</button>
                {index < breadcrumbItems.length - 1 ? <span className="text-slate-500">/</span> : null}
              </div>
            ))}
          </div>
        ) : null}

        {loading ? <LoadingState label="Loading risk dashboard..." /> : null}
        {!loading && !transactions.length ? <EmptyState title="No risk data" description="Run reconciliation for this project to populate risk scoring." /> : null}

        {!loading && transactions.length ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <div className="oracle-kpi p-3"><p className="text-xs text-slate-400">Risk Score</p><p className="text-xl font-semibold text-slate-100">{riskSignals.riskScore}</p></div>
              <div className="oracle-kpi p-3"><p className="text-xs text-slate-400">Exception Heatmap</p><p className="text-sm font-semibold text-slate-100">{riskSignals.exceptionHeatmap}</p></div>
              <div className="oracle-kpi p-3"><p className="text-xs text-slate-400">Critical Mismatches</p><p className="text-xl font-semibold text-red-300">{riskSignals.criticalMismatches}</p></div>
              <div className="oracle-kpi p-3"><p className="text-xs text-slate-400">SOD Violations</p><p className="text-xl font-semibold text-amber-300">{riskSignals.sodViolations}</p></div>
              <div className="oracle-kpi p-3"><p className="text-xs text-slate-400">Compliance Alerts</p><p className="text-xl font-semibold text-sky-300">{riskSignals.complianceAlerts}</p></div>
              <div className="oracle-kpi p-3"><p className="text-xs text-slate-400">Fraud Indicators</p><p className="text-xl font-semibold text-fuchsia-300">{riskSignals.fraudIndicators}</p></div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="card p-4 xl:col-span-2">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{currentDepth === 'overview' ? 'Entity risk overview' : 'Account risk view'}</p>
                    <p className="text-xs text-slate-400 mt-1">{currentDepth === 'overview' ? 'Click any entity bar to open account-level risk details.' : 'Click any account bar to open transaction details in the panel below.'}</p>
                  </div>
                  {selectedEntity ? <span className="text-xs text-slate-400">{selectedEntity}{selectedAccount ? ` / ${selectedAccount}` : ''}</span> : null}
                </div>
                <ReactECharts style={{ height: 340 }} option={chartOption} onEvents={chartEvents} />
              </div>

              <div className="card p-4">
                <p className="text-sm font-semibold text-slate-100 mb-3">Audit Signal Summary</p>
                <div className="space-y-3">
                  <div className="oracle-kpi p-3">
                    <p className="text-xs text-slate-400">Current Level</p>
                    <p className="text-sm font-semibold text-slate-100 capitalize">{currentDepth}</p>
                  </div>
                  <div className="oracle-kpi p-3">
                    <p className="text-xs text-slate-400">Open Exceptions</p>
                    <p className="text-xl font-semibold text-slate-100">{riskSignals.openExceptions}</p>
                  </div>
                  <div className="oracle-kpi p-3">
                    <p className="text-xs text-slate-400">Risk Scope</p>
                    <p className="text-sm font-semibold text-slate-100">{selectedEntity || 'All Entities'} / {selectedAccount || 'All Accounts'}</p>
                  </div>
                  <div className="oracle-kpi p-3">
                    <p className="text-xs text-slate-400">Exception Rate</p>
                    <p className="text-sm font-semibold text-slate-100">{selectedTransactions.length ? `${Math.round((selectedTransactions.filter((row) => row.exception_id).length / selectedTransactions.length) * 100)}%` : '0%'}</p>
                  </div>
                </div>
              </div>
            </div>

            {currentDepth === 'overview' ? (
              <div className="card p-4 overflow-auto">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <p className="text-sm font-semibold text-slate-100">Entity impact</p>
                  <span className="text-xs text-slate-400">Click any row to drill into the selected entity.</span>
                </div>
                <table className="enterprise-table text-sm">
                  <thead><tr><th>Entity</th><th>Accounts</th><th>Risk</th><th>Exceptions</th><th>Variance</th></tr></thead>
                  <tbody>
                    {paginatedEntities.map((row) => (
                      <tr key={row.entity} className="cursor-pointer" onClick={() => goEntity(row.entity)}>
                        <td className="text-slate-100">{row.entity}</td>
                        <td className="text-slate-300">{row.account_count}</td>
                        <td className="text-slate-300">{row.risk_score}</td>
                        <td className="text-slate-300">{row.exception_count}</td>
                        <td className="text-slate-300">{toCurrency(row.variance_amount, 'INR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    Showing {(entityPage - 1) * PAGE_SIZE_ENTITY + (paginatedEntities.length ? 1 : 0)}-
                    {(entityPage - 1) * PAGE_SIZE_ENTITY + paginatedEntities.length} of {entitySummary.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <button className="btn-secondary py-1 px-2 text-xs" disabled={entityPage <= 1} onClick={() => setEntityPage((p) => Math.max(1, p - 1))}>Prev</button>
                    <span>Page {entityPage} / {Math.max(1, Math.ceil(entitySummary.length / PAGE_SIZE_ENTITY))}</span>
                    <button className="btn-secondary py-1 px-2 text-xs" disabled={entityPage >= Math.ceil(entitySummary.length / PAGE_SIZE_ENTITY)} onClick={() => setEntityPage((p) => p + 1)}>Next</button>
                  </div>
                </div>
              </div>
            ) : null}

            {currentDepth === 'entity' ? (
              <div className="card p-4 overflow-auto space-y-4">
                <div>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="text-sm font-semibold text-slate-100">Account drilldown for {selectedEntity}</p>
                    <span className="text-xs text-slate-400">Click any account row to load the transaction panel.</span>
                  </div>
                  <table className="enterprise-table text-sm">
                    <thead><tr><th>Account</th><th>Risk</th><th>Exceptions</th><th>Exception Rate</th><th>Variance</th></tr></thead>
                    <tbody>
                      {paginatedAccounts.map((row) => (
                        <tr key={`${row.entity}-${row.account}`} className={`cursor-pointer ${selectedAccount === row.account ? 'bg-brand-900/10' : ''}`} onClick={() => selectAccount(row.account)}>
                          <td className="text-slate-100">{row.account}</td>
                          <td className={`font-medium ${statusTone(row.risk_level)}`}><span className={`status-chip status-chip-${String(row.risk_level || '').toLowerCase()}`}>{row.risk_level}</span> <span className="ml-2">({row.risk_score})</span></td>
                          <td className="text-slate-300">{row.exception_count}</td>
                          <td className="text-slate-300">{row.exception_rate}%</td>
                          <td className="text-slate-300">{toCurrency(row.variance_amount, 'INR')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      Showing {(accountPage - 1) * PAGE_SIZE_ACCOUNT + (paginatedAccounts.length ? 1 : 0)}-
                      {(accountPage - 1) * PAGE_SIZE_ACCOUNT + paginatedAccounts.length} of {visibleAccounts.length}
                    </span>
                    <div className="flex items-center gap-2">
                      <button className="btn-secondary py-1 px-2 text-xs" disabled={accountPage <= 1} onClick={() => setAccountPage((p) => Math.max(1, p - 1))}>Prev</button>
                      <span>Page {accountPage} / {Math.max(1, Math.ceil(visibleAccounts.length / PAGE_SIZE_ACCOUNT))}</span>
                      <button className="btn-secondary py-1 px-2 text-xs" disabled={accountPage >= Math.ceil(visibleAccounts.length / PAGE_SIZE_ACCOUNT)} onClick={() => setAccountPage((p) => p + 1)}>Next</button>
                    </div>
                  </div>
                </div>
                <div className="border-t border-surface-700 pt-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-100">{selectedAccount ? `Transactions for ${selectedAccount}` : 'Select an account'}</p>
                    {selectedAccount ? <button className="btn-secondary" onClick={() => setSelectedAccount('')}>Clear</button> : null}
                  </div>
                  {selectedAccount ? (
                    <>
                      <div className="mb-3 rounded-lg border border-surface-700 p-3">
                        <p className="text-xs text-slate-400 mb-2">Exception mix</p>
                        {!exceptionBreakdown.length ? <p className="text-xs text-slate-500">No exceptions in selected account.</p> : null}
                        <div className="space-y-1">
                          {exceptionBreakdown.slice(0, 5).map((row) => (
                            <div key={row.label} className="flex items-center justify-between text-xs text-slate-300">
                              <span>{row.label}</span>
                              <span className="font-semibold">{row.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {selectedTransactions.length ? (
                        <div className="space-y-2">
                          {paginatedTransactions.map((row) => (
                            <div key={`${row.record_id}-${row.reference}`} className="rounded-xl border border-surface-700 bg-surface-900/40 p-3">
                              <p className="text-sm font-medium text-slate-100">{row.reference}</p>
                              <p className="mt-1 text-xs text-slate-400">{row.exception_classification} | {toCurrency(row.match_variance, 'INR')} variance | {String(row.status || '').toUpperCase()}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400">No transactions available for this account.</p>
                      )}
                      {selectedTransactions.length ? (
                        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                          <span>
                            Showing {(txnPage - 1) * PAGE_SIZE_TXN + (paginatedTransactions.length ? 1 : 0)}-
                            {(txnPage - 1) * PAGE_SIZE_TXN + paginatedTransactions.length} of {selectedTransactions.length}
                          </span>
                          <div className="flex items-center gap-2">
                            <button className="btn-secondary py-1 px-2 text-xs" disabled={txnPage <= 1} onClick={() => setTxnPage((p) => Math.max(1, p - 1))}>Prev</button>
                            <span>Page {txnPage} / {Math.max(1, Math.ceil(selectedTransactions.length / PAGE_SIZE_TXN))}</span>
                            <button className="btn-secondary py-1 px-2 text-xs" disabled={txnPage >= Math.ceil(selectedTransactions.length / PAGE_SIZE_TXN)} onClick={() => setTxnPage((p) => p + 1)}>Next</button>
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-sm text-slate-400">Pick an account from the table or chart to inspect transaction-level risk.</p>
                  )}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}
