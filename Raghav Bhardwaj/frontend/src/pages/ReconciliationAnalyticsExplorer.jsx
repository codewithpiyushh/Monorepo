import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import ReactECharts from 'echarts-for-react'
import { enterpriseAPI, executionsAPI, projectsAPI } from '../api'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, LoadingState } from '../components/ui/PageState'

function fmtCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(amount || 0))
}

function fmtPct(value) {
  return `${Math.round(Number(value || 0))}%`
}

function isMatchedStatus(status) {
  return ['MATCHED', 'RECONCILED', 'FINALIZED', 'APPROVED'].includes(String(status || '').toUpperCase())
}

function summarizeOwner(profile = {}) {
  return [
    profile.assigned_preparer ? `P:${profile.assigned_preparer}` : null,
    profile.assigned_reviewer ? `R:${profile.assigned_reviewer}` : null,
    profile.assigned_approver ? `A:${profile.assigned_approver}` : null,
    profile.assigned_certifier ? `C:${profile.assigned_certifier}` : null,
  ].filter(Boolean).join(' / ') || 'Unassigned'
}

function globalFilter(rows, filters) {
  return rows.filter((row) => {
    if (filters.period && String(row.period || '') !== filters.period) return false
    if (filters.entity && row.entity !== filters.entity) return false
    if (filters.account && row.account !== filters.account) return false
    if (filters.owner && row.owner !== filters.owner) return false
    if (filters.status && String(row.status || '').toUpperCase() !== filters.status) return false
    if (filters.currency && row.currency !== filters.currency) return false
    if (filters.risk && String(row.risk || '').toUpperCase() !== filters.risk) return false
    return true
  })
}

export default function ReconciliationAnalyticsExplorer() {
  const navigate = useNavigate()
  const [selectedEntity, setSelectedEntity] = useState('')
  const [selectedAccount, setSelectedAccount] = useState('')
  const [selectedRecon, setSelectedRecon] = useState(null)
  const [selectedExceptionType, setSelectedExceptionType] = useState('')
  const [selectedTransaction, setSelectedTransaction] = useState(null)
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [filters, setFilters] = useState({
    period: '',
    entity: '',
    account: '',
    owner: '',
    status: '',
    currency: '',
    risk: '',
  })

  const { data: enterpriseData, isLoading: enterpriseLoading } = useQuery({ queryKey: ['enterprise-analytics-explorer'], queryFn: enterpriseAPI.analyticsExplorer })
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: projectsAPI.list })

  useEffect(() => {
    if (!selectedProjectId && projects.length) {
      const preferred = projects.find((project) => String(project.name || '').toLowerCase() === 'test1') || projects[0]
      setSelectedProjectId(String(preferred.id))
    }
  }, [projects, selectedProjectId])

  const { data: executions = [] } = useQuery({
    queryKey: ['analytics-executions', selectedProjectId],
    queryFn: () => executionsAPI.list(Number(selectedProjectId)),
    enabled: !!selectedProjectId,
  })

  const latestExecution = useMemo(() => executions.find((row) => String(row.status || '').toLowerCase() === 'completed') || executions[0], [executions])

  const { data: executionResults } = useQuery({
    queryKey: ['analytics-execution-results', selectedProjectId, latestExecution?.id],
    queryFn: () => executionsAPI.results(Number(selectedProjectId), latestExecution.id, { page: 1, page_size: 1000 }),
    enabled: !!selectedProjectId && !!latestExecution?.id,
  })

  const enterpriseTx = enterpriseData?.transactions || []
  const mode = enterpriseTx.length ? 'enterprise' : 'project'

  const baseTx = useMemo(() => {
    if (enterpriseTx.length) {
      return enterpriseTx.map((row) => ({
        record_id: row.record_id,
        profile_id: row.profile_id,
        entity: row.entity || 'Unassigned',
        account: row.account || 'Unassigned',
        period: row.period || 'Current',
        owner: summarizeOwner(row.profile || {}),
        status: row.status || 'OPEN',
        currency: row.currency || 'USD',
        risk: row.profile?.risk_classification || 'LOW',
        evidence_count: Number(row.evidence_count || 0),
        reference: row.reference || `TXN-${row.record_id}`,
        exception_id: row.exception_id,
        exception_status: row.exception_status,
        exception_classification: row.exception_classification || 'No Exception',
        match_variance: Number(row.match_variance || 0),
        amount: Number(row.amount || 0),
        profile: row.profile || {},
      }))
    }

    const rows = []
    let seq = 1
    ;(executionResults?.units || []).forEach((unit, unitIndex) => {
      ;(unit.transactions || []).forEach((transaction) => {
        const mismatch = String(transaction.match_status || '').toLowerCase() !== 'matched'
        rows.push({
          record_id: seq,
          profile_id: unitIndex + 1,
          entity: unit.entity || 'Unassigned',
          account: unit.account || 'Unassigned',
          period: 'Current',
          owner: 'Project Workspace',
          status: transaction.match_status || 'OPEN',
          currency: 'USD',
          risk: mismatch ? 'HIGH' : 'LOW',
          evidence_count: 0,
          reference: `TXN-${String(seq).padStart(3, '0')}`,
          exception_id: mismatch ? `EX-${unitIndex + 1}-${seq}` : null,
          exception_status: mismatch ? 'OPEN' : null,
          exception_classification: mismatch ? 'Amount Mismatch' : 'No Exception',
          match_variance: mismatch ? 100 : 0,
          amount: Number(transaction.amount || 0),
          profile: {},
        })
        seq += 1
      })
    })
    return rows
  }, [enterpriseTx, executionResults])

  const periodOptions = useMemo(() => [...new Set(baseTx.map((row) => row.period).filter(Boolean))], [baseTx])
  const entityOptions = useMemo(() => [...new Set(baseTx.map((row) => row.entity).filter(Boolean))], [baseTx])
  const accountOptions = useMemo(() => [...new Set(baseTx.map((row) => row.account).filter(Boolean))], [baseTx])
  const ownerOptions = useMemo(() => [...new Set(baseTx.map((row) => row.owner).filter(Boolean))], [baseTx])
  const statusOptions = useMemo(() => [...new Set(baseTx.map((row) => String(row.status || '').toUpperCase()).filter(Boolean))], [baseTx])
  const currencyOptions = useMemo(() => [...new Set(baseTx.map((row) => row.currency).filter(Boolean))], [baseTx])
  const riskOptions = useMemo(() => [...new Set(baseTx.map((row) => String(row.risk || '').toUpperCase()).filter(Boolean))], [baseTx])

  const filteredTx = useMemo(() => globalFilter(baseTx, filters), [baseTx, filters])

  useEffect(() => {
    if (selectedEntity && !filteredTx.some((row) => row.entity === selectedEntity)) {
      setSelectedEntity('')
      setSelectedAccount('')
      setSelectedRecon(null)
      setSelectedExceptionType('')
      setSelectedTransaction(null)
      return
    }
    if (selectedAccount && !filteredTx.some((row) => row.entity === selectedEntity && row.account === selectedAccount)) {
      setSelectedAccount('')
      setSelectedRecon(null)
      setSelectedExceptionType('')
      setSelectedTransaction(null)
      return
    }
    if (selectedRecon && !filteredTx.some((row) => row.profile_id === selectedRecon.profileId)) {
      setSelectedRecon(null)
      setSelectedExceptionType('')
      setSelectedTransaction(null)
      return
    }
    if (selectedExceptionType && !filteredTx.some((row) => row.profile_id === selectedRecon?.profileId && row.exception_classification === selectedExceptionType)) {
      setSelectedExceptionType('')
      setSelectedTransaction(null)
      return
    }
    if (selectedTransaction && !filteredTx.some((row) => row.record_id === selectedTransaction.record_id)) {
      setSelectedTransaction(null)
    }
  }, [filteredTx, selectedAccount, selectedEntity, selectedExceptionType, selectedRecon, selectedTransaction])

  const totals = useMemo(() => {
    const reconIds = new Set(filteredTx.map((row) => row.profile_id))
    const matchedRecon = new Set(filteredTx.filter((row) => isMatchedStatus(row.status)).map((row) => row.profile_id))
    const exceptions = new Set(filteredTx.map((row) => row.exception_id).filter(Boolean))
    return {
      totalRecons: reconIds.size,
      matched: matchedRecon.size,
      exceptions: exceptions.size,
      evidence: filteredTx.reduce((sum, row) => sum + Number(row.evidence_count || 0), 0),
      matchRate: reconIds.size ? (matchedRecon.size / reconIds.size) * 100 : 0,
    }
  }, [filteredTx])

  const entityRows = useMemo(() => {
    const groups = new Map()
    filteredTx.forEach((row) => {
      const group = groups.get(row.entity) || { entity: row.entity, recons: new Set(), matched: new Set(), exceptions: new Set(), variance: 0, evidence: 0 }
      group.recons.add(row.profile_id)
      if (isMatchedStatus(row.status)) group.matched.add(row.profile_id)
      if (row.exception_id) group.exceptions.add(row.exception_id)
      group.variance += Math.abs(Number(row.match_variance || 0))
      group.evidence += Number(row.evidence_count || 0)
      groups.set(row.entity, group)
    })
    return Array.from(groups.values()).map((row) => ({
      entity: row.entity,
      totalRecons: row.recons.size,
      matchRate: row.recons.size ? (row.matched.size / row.recons.size) * 100 : 0,
      exceptions: row.exceptions.size,
      variance: row.variance,
      evidence: row.evidence,
    })).sort((a, b) => (b.exceptions - a.exceptions) || (b.variance - a.variance) || a.entity.localeCompare(b.entity))
  }, [filteredTx])

  const accountRows = useMemo(() => {
    if (!selectedEntity) return []
    const groups = new Map()
    filteredTx.filter((row) => row.entity === selectedEntity).forEach((row) => {
      const group = groups.get(row.account) || { account: row.account, total: 0, matched: 0, exceptions: new Set(), variance: 0 }
      group.total += 1
      if (isMatchedStatus(row.status)) group.matched += 1
      if (row.exception_id) group.exceptions.add(row.exception_id)
      group.variance += Math.abs(Number(row.match_variance || 0))
      groups.set(row.account, group)
    })
    return Array.from(groups.values()).map((row) => ({
      account: row.account,
      matchRate: row.total ? (row.matched / row.total) * 100 : 0,
      exceptions: row.exceptions.size,
      variance: row.variance,
    })).sort((a, b) => (b.exceptions - a.exceptions) || (b.variance - a.variance) || a.account.localeCompare(b.account))
  }, [filteredTx, selectedEntity])

  const reconRows = useMemo(() => {
    if (!selectedEntity || !selectedAccount) return []
    const groups = new Map()
    filteredTx.filter((row) => row.entity === selectedEntity && row.account === selectedAccount).forEach((row) => {
      const group = groups.get(row.profile_id) || { profileId: row.profile_id, total: 0, matched: 0, exceptions: new Set(), status: row.profile?.lifecycle_state || row.status }
      group.total += 1
      if (isMatchedStatus(row.status)) group.matched += 1
      if (row.exception_id) group.exceptions.add(row.exception_id)
      groups.set(row.profile_id, group)
    })
    return Array.from(groups.values()).map((row) => ({
      profileId: row.profileId,
      reconId: `Recon-${String(row.profileId).padStart(3, '0')}`,
      matchRate: row.total ? (row.matched / row.total) * 100 : 0,
      exceptions: row.exceptions.size,
      status: row.status,
    })).sort((a, b) => (b.exceptions - a.exceptions) || a.reconId.localeCompare(b.reconId))
  }, [filteredTx, selectedAccount, selectedEntity])

  const exceptionRows = useMemo(() => {
    if (!selectedRecon?.profileId) return []
    const groups = new Map()
    filteredTx.filter((row) => row.profile_id === selectedRecon.profileId && row.exception_id).forEach((row) => {
      const key = row.exception_classification || 'Exception'
      const group = groups.get(key) || { exceptionType: key, count: 0, variance: 0 }
      group.count += 1
      group.variance += Math.abs(Number(row.match_variance || 0))
      groups.set(key, group)
    })
    return Array.from(groups.values()).sort((a, b) => (b.count - a.count) || (b.variance - a.variance))
  }, [filteredTx, selectedRecon])

  const transactionRows = useMemo(() => {
    if (!selectedRecon?.profileId || !selectedExceptionType) return []
    return filteredTx.filter((row) => row.profile_id === selectedRecon.profileId && row.exception_classification === selectedExceptionType)
  }, [filteredTx, selectedExceptionType, selectedRecon])

  const { data: evidenceRows = [], isLoading: evidenceLoading } = useQuery({
    queryKey: ['analytics-evidence', selectedTransaction?.record_id],
    queryFn: () => enterpriseAPI.listAttachments(selectedTransaction.record_id),
    enabled: !!selectedTransaction?.record_id && mode === 'enterprise',
  })

  const breadcrumbItems = [
    { label: 'Executive Summary', active: !selectedEntity, onClick: () => { setSelectedEntity(''); setSelectedAccount(''); setSelectedRecon(null); setSelectedExceptionType(''); setSelectedTransaction(null) } },
    selectedEntity ? { label: selectedEntity, active: !selectedAccount, onClick: () => { setSelectedAccount(''); setSelectedRecon(null); setSelectedExceptionType(''); setSelectedTransaction(null) } } : null,
    selectedAccount ? { label: selectedAccount, active: !selectedRecon, onClick: () => { setSelectedRecon(null); setSelectedExceptionType(''); setSelectedTransaction(null) } } : null,
    selectedRecon ? { label: selectedRecon.reconId, active: !selectedExceptionType, onClick: () => { setSelectedExceptionType(''); setSelectedTransaction(null) } } : null,
    selectedExceptionType ? { label: selectedExceptionType, active: !selectedTransaction, onClick: () => { setSelectedTransaction(null) } } : null,
    selectedTransaction ? { label: selectedTransaction.reference || `TXN-${selectedTransaction.record_id}`, active: true, onClick: () => {} } : null,
  ].filter(Boolean)

  const exceptionByEntityOption = useMemo(() => ({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: entityRows.map((row) => row.entity), axisLabel: { color: '#94a3b8' } },
    yAxis: { type: 'value', axisLabel: { color: '#94a3b8' } },
    series: [{ type: 'bar', data: entityRows.map((row) => row.exceptions), itemStyle: { color: '#4f9cf9' }, barMaxWidth: 30 }],
  }), [entityRows])

  const varianceByEntityOption = useMemo(() => ({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: entityRows.map((row) => row.entity), axisLabel: { color: '#94a3b8' } },
    yAxis: { type: 'value', axisLabel: { color: '#94a3b8' } },
    series: [{ type: 'line', smooth: true, data: entityRows.map((row) => Number(row.variance.toFixed(0))), lineStyle: { color: '#ef4444', width: 3 }, itemStyle: { color: '#ef4444' } }],
  }), [entityRows])

  const isLoading = enterpriseLoading || (mode === 'project' && !!selectedProjectId && !executionResults)

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Reconciliation Analytics Explorer"
        subtitle={`Executive summary to evidence drilldown in ${mode} mode with filterable slicing.`}
        badge={`${totals.totalRecons} reconciliations`}
        actions={
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={() => navigate('/executive-dashboard')}>Executive KPIs</button>
            <button className="btn-secondary" onClick={() => navigate('/risk-dashboard')}>Risk View</button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {mode === 'project' ? (
          <div className="card p-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">Project Source</span>
            <select className="input max-w-xs" value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
              {projects.map((project) => <option key={project.id} value={String(project.id)}>{project.name}</option>)}
            </select>
            <span className="text-xs text-slate-500">Using latest execution results for drilldown</span>
          </div>
        ) : null}

        <div className="card p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-2">
          <select className="input" value={filters.period} onChange={(e) => setFilters((state) => ({ ...state, period: e.target.value }))}>
            <option value="">Period: All</option>
            {periodOptions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select className="input" value={filters.entity} onChange={(e) => setFilters((state) => ({ ...state, entity: e.target.value }))}>
            <option value="">Entity: All</option>
            {entityOptions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select className="input" value={filters.account} onChange={(e) => setFilters((state) => ({ ...state, account: e.target.value }))}>
            <option value="">Account: All</option>
            {accountOptions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select className="input" value={filters.owner} onChange={(e) => setFilters((state) => ({ ...state, owner: e.target.value }))}>
            <option value="">Owner: All</option>
            {ownerOptions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select className="input" value={filters.status} onChange={(e) => setFilters((state) => ({ ...state, status: e.target.value }))}>
            <option value="">Status: All</option>
            {statusOptions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select className="input" value={filters.currency} onChange={(e) => setFilters((state) => ({ ...state, currency: e.target.value }))}>
            <option value="">Currency: All</option>
            {currencyOptions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select className="input" value={filters.risk} onChange={(e) => setFilters((state) => ({ ...state, risk: e.target.value }))}>
            <option value="">Risk: All</option>
            {riskOptions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
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

        {isLoading ? <LoadingState label="Loading analytics..." /> : null}
        {!isLoading && !filteredTx.length ? <EmptyState title="No analytics data" description="No records match the current slice. Reset filters or load transactions." /> : null}

        {!isLoading && filteredTx.length ? (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
              <button className="oracle-kpi p-3 text-left" onClick={() => { setSelectedEntity(''); setSelectedAccount(''); setSelectedRecon(null); setSelectedExceptionType(''); setSelectedTransaction(null) }}><p className="text-xs text-slate-400">Total Reconciliations</p><p className="text-lg font-semibold text-slate-100">{totals.totalRecons}</p></button>
              <button className="oracle-kpi p-3 text-left"><p className="text-xs text-slate-400">Matched</p><p className="text-lg font-semibold text-slate-100">{totals.matched}</p></button>
              <button className="oracle-kpi p-3 text-left" onClick={() => navigate('/exception-ops')}><p className="text-xs text-slate-400">Exceptions</p><p className="text-lg font-semibold text-slate-100">{totals.exceptions}</p></button>
              <button className="oracle-kpi p-3 text-left"><p className="text-xs text-slate-400">Evidence Count</p><p className="text-lg font-semibold text-slate-100">{totals.evidence}</p></button>
              <button className="oracle-kpi p-3 text-left"><p className="text-xs text-slate-400">Match Rate</p><p className="text-lg font-semibold text-slate-100">{fmtPct(totals.matchRate)}</p></button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="card p-4"><p className="text-sm font-semibold text-slate-100 mb-3">Exceptions by Entity</p><ReactECharts style={{ height: 280 }} option={exceptionByEntityOption} /></div>
              <div className="card p-4"><p className="text-sm font-semibold text-slate-100 mb-3">Variance by Entity</p><ReactECharts style={{ height: 280 }} option={varianceByEntityOption} /></div>
            </div>

            <div className="card p-4 overflow-auto">
              <p className="text-sm font-semibold text-slate-100 mb-3">Level 1-2: Executive Summary to Entity</p>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-400 border-b border-surface-700"><th className="p-2">Entity</th><th className="p-2">Reconciliations</th><th className="p-2">Match Rate</th><th className="p-2">Exceptions</th><th className="p-2">Variance</th><th className="p-2">Evidence</th></tr></thead>
                <tbody>
                  {entityRows.map((row) => (
                    <tr key={row.entity} className="border-b border-surface-800 hover:bg-surface-800/40 cursor-pointer" onClick={() => { setSelectedEntity(row.entity); setSelectedAccount(''); setSelectedRecon(null); setSelectedExceptionType(''); setSelectedTransaction(null) }}>
                      <td className="p-2 text-slate-100">{row.entity}</td>
                      <td className="p-2 text-slate-300">{row.totalRecons}</td>
                      <td className="p-2 text-slate-300">{fmtPct(row.matchRate)}</td>
                      <td className="p-2 text-slate-300">{row.exceptions}</td>
                      <td className="p-2 text-slate-300">{fmtCurrency(row.variance, 'INR')}</td>
                      <td className="p-2 text-slate-300">{row.evidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedEntity ? (
              <div className="card p-4 overflow-auto">
                <p className="text-sm font-semibold text-slate-100 mb-3">Level 3: Account Type ({selectedEntity})</p>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-400 border-b border-surface-700"><th className="p-2">Account</th><th className="p-2">Match Rate</th><th className="p-2">Exceptions</th><th className="p-2">Variance</th></tr></thead>
                  <tbody>
                    {accountRows.map((row) => (
                      <tr key={row.account} className="border-b border-surface-800 hover:bg-surface-800/40 cursor-pointer" onClick={() => { setSelectedAccount(row.account); setSelectedRecon(null); setSelectedExceptionType(''); setSelectedTransaction(null) }}>
                        <td className="p-2 text-slate-100">{row.account}</td>
                        <td className="p-2 text-slate-300">{fmtPct(row.matchRate)}</td>
                        <td className="p-2 text-slate-300">{row.exceptions}</td>
                        <td className="p-2 text-slate-300">{fmtCurrency(row.variance, 'INR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {selectedAccount ? (
              <div className="card p-4 overflow-auto">
                <p className="text-sm font-semibold text-slate-100 mb-3">Level 4: Reconciliation ({selectedAccount})</p>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-400 border-b border-surface-700"><th className="p-2">Reconciliation</th><th className="p-2">Status</th><th className="p-2">Match Rate</th><th className="p-2">Exceptions</th></tr></thead>
                  <tbody>
                    {reconRows.map((row) => (
                      <tr key={row.reconId} className="border-b border-surface-800 hover:bg-surface-800/40 cursor-pointer" onClick={() => { setSelectedRecon(row); setSelectedExceptionType(''); setSelectedTransaction(null) }}>
                        <td className="p-2 text-slate-100">{row.reconId}</td>
                        <td className="p-2 text-slate-300">{row.status}</td>
                        <td className="p-2 text-slate-300">{fmtPct(row.matchRate)}</td>
                        <td className="p-2 text-slate-300">{row.exceptions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {selectedRecon ? (
              <div className="card p-4 overflow-auto">
                <p className="text-sm font-semibold text-slate-100 mb-3">Level 5: Exception ({selectedRecon.reconId})</p>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-400 border-b border-surface-700"><th className="p-2">Exception Type</th><th className="p-2">Count</th><th className="p-2">Variance</th></tr></thead>
                  <tbody>
                    {exceptionRows.map((row) => (
                      <tr key={row.exceptionType} className="border-b border-surface-800 hover:bg-surface-800/40 cursor-pointer" onClick={() => { setSelectedExceptionType(row.exceptionType); setSelectedTransaction(null) }}>
                        <td className="p-2 text-slate-100">{row.exceptionType}</td>
                        <td className="p-2 text-slate-300">{row.count}</td>
                        <td className="p-2 text-slate-300">{fmtCurrency(row.variance, 'INR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {selectedExceptionType ? (
              <div className="card p-4 overflow-auto">
                <p className="text-sm font-semibold text-slate-100 mb-3">Level 6: Transaction ({selectedExceptionType})</p>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-400 border-b border-surface-700"><th className="p-2">Reference</th><th className="p-2">Owner</th><th className="p-2">Currency</th><th className="p-2">Variance</th><th className="p-2">Evidence</th><th className="p-2">Action</th></tr></thead>
                  <tbody>
                    {transactionRows.map((row) => (
                      <tr key={row.record_id} className="border-b border-surface-800 hover:bg-surface-800/40 cursor-pointer" onClick={() => setSelectedTransaction(row)}>
                        <td className="p-2 text-slate-100">{row.reference}</td>
                        <td className="p-2 text-slate-300">{row.owner}</td>
                        <td className="p-2 text-slate-300">{row.currency}</td>
                        <td className="p-2 text-slate-300">{fmtCurrency(row.match_variance, 'INR')}</td>
                        <td className="p-2 text-slate-300">{row.evidence_count}</td>
                        <td className="p-2"><button className="btn-secondary text-xs" onClick={(event) => { event.stopPropagation(); navigate(`/exception-investigation/${row.exception_id}`) }}>Investigate</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {selectedTransaction ? (
              <div className="card p-4 overflow-auto">
                <p className="text-sm font-semibold text-slate-100 mb-3">Level 7: Evidence ({selectedTransaction.reference})</p>
                {mode !== 'enterprise' ? <p className="text-sm text-slate-400">Evidence drilldown is available in enterprise mode once attachments are uploaded.</p> : null}
                {mode === 'enterprise' && evidenceLoading ? <p className="text-sm text-slate-400">Loading evidence...</p> : null}
                {mode === 'enterprise' && !evidenceLoading && !evidenceRows.length ? <p className="text-sm text-slate-400">No evidence uploaded for this transaction yet.</p> : null}
                {mode === 'enterprise' && !evidenceLoading && evidenceRows.length ? (
                  <div className="space-y-2">
                    {evidenceRows.map((row) => (
                      <div key={row.id} className="rounded-xl border border-surface-700 bg-surface-900/40 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-slate-100">{row.document_name}</p>
                            <p className="mt-1 text-xs text-slate-400">{row.document_type} · {row.document_status} · Version {row.version}</p>
                          </div>
                          <span className="text-xs text-slate-500">{row.document_path || 'Uploaded file'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}
