import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import ReactECharts from 'echarts-for-react'
import { executionsAPI, projectsAPI } from '../api'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, LoadingState } from '../components/ui/PageState'
import { useProjectStore } from '../store/projectStore'

function fmtCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(amount || 0))
}

function fmtPct(value) {
  return `${Math.round(Number(value || 0))}%`
}

function decodeParam(value = '') {
  if (!value) return ''
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function isMatchedStatus(status) {
  return ['MATCHED', 'RECONCILED', 'FINALIZED', 'APPROVED'].includes(String(status || '').toUpperCase())
}

function rankedBarColors(length, palette) {
  if (!length) return []
  return Array.from({ length }, (_, idx) => {
    const p = length === 1 ? 0 : idx / (length - 1)
    const colorIdx = Math.round(p * (palette.length - 1))
    return palette[colorIdx]
  })
}

function flattenExecutionResults(executionResults) {
  const rows = []

  ;(executionResults?.units || []).forEach((unit, unitIndex) => {
    ;(unit.transactions || []).forEach((transaction) => {
      const status = String(transaction.match_status || '').toLowerCase()
      const mismatch = status !== 'matched'
      const discrepancyList = (() => {
        if (!transaction.discrepancies) return []
        try {
          const parsed = typeof transaction.discrepancies === 'string' ? JSON.parse(transaction.discrepancies) : transaction.discrepancies
          return Array.isArray(parsed) ? parsed : []
        } catch {
          return []
        }
      })()
      const reference = transaction.selected_source_data?.reference
        || transaction.selected_target_data?.reference
        || `TXN-${String(transaction.id || 0).padStart(5, '0')}`
      rows.push({
        record_id: transaction.id || `${unit.entity || 'NA'}-${unit.account || 'NA'}-${unitIndex}`,
        profile_id: unitIndex + 1,
        entity: unit.entity || 'Unassigned',
        account: unit.account || 'Unassigned',
        period: 'Current',
        owner: 'Project Workbench',
        status: transaction.match_status || 'OPEN',
        currency: 'USD',
        risk: status === 'unmatched' ? 'HIGH' : status === 'partial' ? 'MEDIUM' : 'LOW',
        evidence_count: 0,
        reference,
        exception_id: mismatch ? `EX-${transaction.id}` : null,
        exception_classification: discrepancyList.length ? discrepancyList[0]?.source_column || 'Rule Mismatch' : (mismatch ? 'Unmatched Record' : 'No Exception'),
        match_variance: mismatch ? Math.round((1 - Number(transaction.match_score || 0)) * 100) : 0,
        amount: Number(transaction.selected_source_data?.amount || transaction.selected_target_data?.amount || 0),
        profile: {},
        selected_source_data: transaction.selected_source_data || {},
        selected_target_data: transaction.selected_target_data || {},
        discrepancies: discrepancyList,
        execution_transaction_id: transaction.id,
        unit_status: unit.status,
        tx_date: transaction.selected_source_data?.date || transaction.selected_target_data?.date || null,
      })
    })
  })

  return rows
}

function toMonthName(rawDate) {
  if (!rawDate) return 'Unknown'
  const d = new Date(rawDate)
  if (Number.isNaN(d.getTime())) return 'Unknown'
  return d.toLocaleString('en-US', { month: 'long' })
}

function buildGlobalFilter(rows, filters) {
  return rows.filter((row) => {
    if (filters.period && row.period !== filters.period) return false
    if (filters.entity && row.entity !== filters.entity) return false
    if (filters.account && row.account !== filters.account) return false
    if (filters.owner && row.owner !== filters.owner) return false
    if (filters.status && String(row.status || '').toUpperCase() !== filters.status) return false
    if (filters.currency && row.currency !== filters.currency) return false
    if (filters.risk && String(row.risk || '').toUpperCase() !== filters.risk) return false
    return true
  })
}

function parseMatrixPath(key = '') {
  const parts = String(key).split('|')
  const out = {}
  parts.forEach((part) => {
    if (part.startsWith('E:')) out.entity = part.slice(2)
    if (part.startsWith('A:')) out.account = part.slice(2)
    if (part.startsWith('S:')) out.status = part.slice(2)
    if (part.startsWith('R:')) out.risk = part.slice(2)
  })
  return out
}

export default function ReconciliationAnalyticsExplorer() {
  const navigate = useNavigate()
  const { entity: routeEntity = '', account: routeAccount = '' } = useParams()
  const selectedEntity = decodeParam(routeEntity)
  const selectedAccount = decodeParam(routeAccount)

  const [filters, setFilters] = useState({
    period: '',
    entity: '',
    account: '',
    owner: '',
    status: '',
    currency: '',
    risk: '',
  })
  const [selectedExceptionSlice, setSelectedExceptionSlice] = useState('')
  const [selectedTransactionId, setSelectedTransactionId] = useState(null)
  const [matrixEntity, setMatrixEntity] = useState('ALL')
  const [matrixStatus, setMatrixStatus] = useState('ALL')
  const [matrixRisk, setMatrixRisk] = useState('ALL')
  const [expandedRows, setExpandedRows] = useState({})
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 12

  const { selectedProjectId, setSelectedProjectId } = useProjectStore()
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: projectsAPI.list })

  useEffect(() => {
    if (!selectedProjectId && projects.length) {
      setSelectedProjectId(String(projects[0].id))
    }
  }, [projects, selectedProjectId, setSelectedProjectId])

  const { data: executions = [] } = useQuery({
    queryKey: ['analytics-executions', selectedProjectId],
    queryFn: () => executionsAPI.list(Number(selectedProjectId)),
    enabled: !!selectedProjectId,
  })

  const latestExecution = useMemo(() =>
    executions.find((row) => String(row.status || '').toLowerCase() === 'completed') || executions[0],
    [executions],
  )

  const { data: executionResults } = useQuery({
    queryKey: ['analytics-execution-results', selectedProjectId, latestExecution?.id],
    queryFn: () => executionsAPI.results(Number(selectedProjectId), latestExecution.id, { page: 1, page_size: 1000 }),
    enabled: !!selectedProjectId && !!latestExecution?.id,
  })

  const rawTransactions = useMemo(() => flattenExecutionResults(executionResults), [executionResults])
  const filteredTransactions = useMemo(() => buildGlobalFilter(rawTransactions, filters), [filters, rawTransactions])

  const scopedTransactions = useMemo(() => filteredTransactions.filter((row) => {
    if (selectedEntity && row.entity !== selectedEntity) return false
    if (selectedAccount && row.account !== selectedAccount) return false
    if (selectedExceptionSlice && row.exception_classification !== selectedExceptionSlice) return false
    return true
  }), [filteredTransactions, selectedEntity, selectedAccount, selectedExceptionSlice])

  const selectedTransaction = useMemo(
    () => scopedTransactions.find((row) => String(row.record_id) === String(selectedTransactionId)) || null,
    [scopedTransactions, selectedTransactionId],
  )

  const matrixScopeTransactions = useMemo(() => {
    return scopedTransactions.filter((row) => {
      if (matrixEntity !== 'ALL' && row.entity !== matrixEntity) return false
      if (matrixStatus !== 'ALL' && String(row.status || '').toUpperCase() !== matrixStatus) return false
      if (matrixRisk !== 'ALL' && String(row.risk || '').toUpperCase() !== matrixRisk) return false
      return true
    })
  }, [scopedTransactions, matrixEntity, matrixStatus, matrixRisk])

  const matrixMonths = useMemo(() => {
    const months = Array.from(new Set(matrixScopeTransactions.map((row) => toMonthName(row.tx_date))))
    return months.length ? months : ['Unknown']
  }, [matrixScopeTransactions])

  const matrixRows = useMemo(() => {
    const byEntity = new Map()

    matrixScopeTransactions.forEach((row) => {
      const entity = row.entity || 'Unassigned'
      const account = row.account || 'Unassigned'
      const status = String(row.status || 'OPEN').toUpperCase()
      const risk = String(row.risk || 'LOW').toUpperCase()
      const month = toMonthName(row.tx_date)
      const value = Number(row.amount || 0)

      if (!byEntity.has(entity)) byEntity.set(entity, { values: {}, children: new Map(), count: 0 })
      const e = byEntity.get(entity)
      e.values[month] = (e.values[month] || 0) + value
      e.count += 1

      if (!e.children.has(account)) e.children.set(account, { values: {}, children: new Map(), count: 0 })
      const a = e.children.get(account)
      a.values[month] = (a.values[month] || 0) + value
      a.count += 1

      if (!a.children.has(status)) a.children.set(status, { values: {}, children: new Map(), count: 0 })
      const s = a.children.get(status)
      s.values[month] = (s.values[month] || 0) + value
      s.count += 1

      if (!s.children.has(risk)) s.children.set(risk, { values: {}, count: 0 })
      const r = s.children.get(risk)
      r.values[month] = (r.values[month] || 0) + value
      r.count += 1
    })

    const out = []
    const push = (label, level, key, node, hasChildren) => {
      out.push({ label, level, key, values: node.values || {}, count: node.count || 0, hasChildren })
    }

    Array.from(byEntity.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([entity, eNode]) => {
      const eKey = `E:${entity}`
      push(entity, 0, eKey, eNode, eNode.children.size > 0)
      if (!expandedRows[eKey]) return
      Array.from(eNode.children.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([account, aNode]) => {
        const aKey = `${eKey}|A:${account}`
        push(account, 1, aKey, aNode, aNode.children.size > 0)
        if (!expandedRows[aKey]) return
        Array.from(aNode.children.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([status, sNode]) => {
          const sKey = `${aKey}|S:${status}`
          push(status, 2, sKey, sNode, sNode.children.size > 0)
          if (!expandedRows[sKey]) return
          Array.from(sNode.children.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([risk, rNode]) => {
            push(risk, 3, `${sKey}|R:${risk}`, rNode, false)
          })
        })
      })
    })

    return out
  }, [matrixScopeTransactions, expandedRows])

  const matrixEntityOptions = useMemo(() => Array.from(new Set(scopedTransactions.map((row) => row.entity))).sort(), [scopedTransactions])
  const matrixStatusOptions = useMemo(() => Array.from(new Set(scopedTransactions.map((row) => String(row.status || '').toUpperCase()))).sort(), [scopedTransactions])
  const matrixRiskOptions = useMemo(() => Array.from(new Set(scopedTransactions.map((row) => String(row.risk || '').toUpperCase()))).sort(), [scopedTransactions])

  const entityRows = useMemo(() => {
    const groups = new Map()

    scopedTransactions.forEach((row) => {
      const group = groups.get(row.entity) || { entity: row.entity, total: 0, matched: 0, exceptions: new Set(), variance: 0 }
      group.total += 1
      if (isMatchedStatus(row.status)) group.matched += 1
      if (row.exception_id) group.exceptions.add(row.exception_id)
      group.variance += Math.abs(Number(row.match_variance || 0))
      groups.set(row.entity, group)
    })

    return Array.from(groups.values())
      .map((row) => ({
        entity: row.entity,
        total: row.total,
        matched: row.matched,
        exceptions: row.exceptions.size,
        variance: row.variance,
        matchRate: row.total ? (row.matched / row.total) * 100 : 0,
      }))
      .sort((a, b) => (b.exceptions - a.exceptions) || (b.variance - a.variance) || a.entity.localeCompare(b.entity))
  }, [scopedTransactions])

  const accountRows = useMemo(() => {
    if (!selectedEntity) return []

    const groups = new Map()

    scopedTransactions.forEach((row) => {
      const group = groups.get(row.account) || { account: row.account, total: 0, matched: 0, exceptions: new Set(), variance: 0 }
      group.total += 1
      if (isMatchedStatus(row.status)) group.matched += 1
      if (row.exception_id) group.exceptions.add(row.exception_id)
      group.variance += Math.abs(Number(row.match_variance || 0))
      groups.set(row.account, group)
    })

    return Array.from(groups.values())
      .map((row) => ({
        account: row.account,
        total: row.total,
        matched: row.matched,
        exceptions: row.exceptions.size,
        variance: row.variance,
        matchRate: row.total ? (row.matched / row.total) * 100 : 0,
      }))
      .sort((a, b) => (b.exceptions - a.exceptions) || (b.variance - a.variance) || a.account.localeCompare(b.account))
  }, [scopedTransactions, selectedEntity])

  const exceptionBreakdown = useMemo(() => {
    const groups = new Map()

    scopedTransactions
      .filter((row) => row.exception_id)
      .forEach((row) => {
        const item = groups.get(row.exception_classification) || { label: row.exception_classification, count: 0 }
        item.count += 1
        groups.set(row.exception_classification, item)
      })

    return Array.from(groups.values()).sort((a, b) => b.count - a.count)
  }, [scopedTransactions])

  const totals = useMemo(() => {
    const recons = new Set(scopedTransactions.map((row) => row.profile_id))
    const matched = new Set(scopedTransactions.filter((row) => isMatchedStatus(row.status)).map((row) => row.profile_id))
    const exceptions = new Set(scopedTransactions.map((row) => row.exception_id).filter(Boolean))

    return {
      totalRecons: recons.size,
      matched: matched.size,
      exceptions: exceptions.size,
      evidence: scopedTransactions.reduce((sum, row) => sum + Number(row.evidence_count || 0), 0),
      matchRate: recons.size ? (matched.size / recons.size) * 100 : 0,
    }
  }, [scopedTransactions])

  const goOverview = () => {
    setFilters((state) => ({ ...state, entity: '', account: '' }))
    setSelectedExceptionSlice('')
    setSelectedTransactionId(null)
    navigate('/analytics-explorer')
  }

  const goEntity = (entity) => {
    setFilters((state) => ({ ...state, entity, account: '' }))
    setSelectedExceptionSlice('')
    setSelectedTransactionId(null)
    navigate(`/analytics-explorer/${encodeURIComponent(entity)}`)
  }

  const goAccount = (entity, account) => {
    setFilters((state) => ({ ...state, entity, account }))
    setSelectedExceptionSlice('')
    setSelectedTransactionId(null)
    navigate(`/analytics-explorer/${encodeURIComponent(entity)}/${encodeURIComponent(account)}`)
  }

  const currentDepth = selectedAccount ? 'account' : selectedEntity ? 'entity' : 'overview'

  const handleMatrixDrill = (row) => {
    const path = parseMatrixPath(row?.key)
    if (row.level === 0 && path.entity) {
      goEntity(path.entity)
      return
    }
    if (row.level === 1 && path.entity && path.account) {
      goAccount(path.entity, path.account)
      return
    }
    if (row.level === 2) {
      if (path.entity && path.account) goAccount(path.entity, path.account)
      setFilters((state) => ({ ...state, status: path.status || '' }))
      return
    }
    if (row.level === 3) {
      if (path.entity && path.account) goAccount(path.entity, path.account)
      setFilters((state) => ({ ...state, risk: path.risk || '' }))
    }
  }

  useEffect(() => {
    setPage(1)
  }, [currentDepth, selectedEntity, selectedAccount, selectedExceptionSlice, filters, selectedProjectId])

  const pagedRows = useMemo(() => {
    const rows = currentDepth === 'overview' ? entityRows : currentDepth === 'entity' ? accountRows : scopedTransactions
    const total = rows.length
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const safePage = Math.min(page, totalPages)
    const start = (safePage - 1) * PAGE_SIZE
    return {
      rows: rows.slice(start, start + PAGE_SIZE),
      total,
      totalPages,
      safePage,
      start,
    }
  }, [currentDepth, entityRows, accountRows, scopedTransactions, page])

  const breadcrumbItems = [
    { label: 'Overview', active: currentDepth === 'overview', onClick: goOverview },
    ...(selectedEntity ? [{ label: selectedEntity, active: currentDepth === 'entity', onClick: () => goEntity(selectedEntity) }] : []),
    ...(selectedAccount ? [{ label: selectedAccount, active: currentDepth === 'account', onClick: () => goAccount(selectedEntity, selectedAccount) }] : []),
    ...(selectedExceptionSlice ? [{ label: selectedExceptionSlice, active: true, onClick: () => setSelectedExceptionSlice('') }] : []),
  ]

  const entityChartOption = useMemo(() => ({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { top: 20, right: 12, bottom: 40, left: 92 },
    xAxis: { type: 'value', axisLabel: { color: '#94a3b8' } },
    yAxis: { type: 'category', data: entityRows.map((row) => row.entity), axisLabel: { color: '#94a3b8' } },
    series: [{
      type: 'bar',
      data: entityRows.map((row) => row.exceptions),
      itemStyle: {
        color: (params) =>
          rankedBarColors(entityRows.length, ['#1e3a8a', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd'])[params.dataIndex],
      },
      label: { show: true, color: '#e2e8f0' },
      emphasis: { itemStyle: { opacity: 0.9 } },
    }],
  }), [entityRows])

  const accountChartOption = useMemo(() => ({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { top: 20, right: 12, bottom: 40, left: 92 },
    xAxis: { type: 'value', axisLabel: { color: '#94a3b8' } },
    yAxis: { type: 'category', data: accountRows.map((row) => row.account), axisLabel: { color: '#94a3b8' } },
    series: [{
      type: 'bar',
      data: accountRows.map((row) => row.exceptions),
      itemStyle: {
        color: (params) =>
          rankedBarColors(accountRows.length, ['#0f766e', '#0d9488', '#14b8a6', '#2dd4bf', '#5eead4', '#99f6e4'])[params.dataIndex],
      },
      label: { show: true, color: '#e2e8f0' },
      emphasis: { itemStyle: { opacity: 0.9 } },
    }],
  }), [accountRows])

  const exceptionChartOption = useMemo(() => ({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { top: 20, right: 12, bottom: 40, left: 140 },
    xAxis: { type: 'value', axisLabel: { color: '#94a3b8' } },
    yAxis: { type: 'category', data: exceptionBreakdown.map((row) => row.label), axisLabel: { color: '#94a3b8' } },
    series: [{
      type: 'bar',
      data: exceptionBreakdown.map((row) => row.count),
      itemStyle: {
        color: (params) =>
          rankedBarColors(exceptionBreakdown.length, ['#9a3412', '#c2410c', '#ea580c', '#f97316', '#fb923c', '#fdba74'])[params.dataIndex],
      },
      label: { show: true, color: '#e2e8f0' },
      emphasis: { itemStyle: { opacity: 0.9 } },
    }],
  }), [exceptionBreakdown])

  const chartOption = currentDepth === 'account' ? exceptionChartOption : currentDepth === 'entity' ? accountChartOption : entityChartOption

  const chartEvents = currentDepth === 'account'
    ? {
        click: (params) => {
          if (!params?.name) return
          setSelectedExceptionSlice((state) => (state === params.name ? '' : params.name))
        },
      }
    : currentDepth === 'entity'
      ? {
          click: (params) => {
            if (!params?.name) return
            goAccount(selectedEntity, params.name)
          },
        }
      : {
          click: (params) => {
            if (!params?.name) return
            goEntity(params.name)
          },
        }

  const isLoading = !!selectedProjectId && !executionResults

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title={currentDepth === 'overview' ? 'Reconciliation Compliance' : `Analytics Drilldown - ${selectedEntity}`}
        subtitle="Click graph bars to drill down and slice data by level (Entity -> Account -> Exception Type -> Transactions)."
        badge={`${totals.totalRecons} reconciliations`}
        actions={
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={() => navigate('/executive-dashboard')}>Executive KPIs</button>
            <button className="btn-secondary" onClick={() => navigate('/risk-dashboard')}>Risk View</button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        <div className="card p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">Project Source</span>
          <select className="input max-w-xs" value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
            {projects.map((project) => (
              <option key={project.id} value={String(project.id)}>{project.name}</option>
            ))}
          </select>
          <span className="text-xs text-slate-500">Graph clicks drive drilldown and replace the current view.</span>
        </div>

        {breadcrumbItems.length ? (
          <div className="card p-3 flex flex-wrap items-center gap-2 text-sm">
            {breadcrumbItems.map((item, index) => (
              <div key={item.label} className="flex items-center gap-2">
                <button
                  className={`px-2 py-1 rounded-lg ${item.active ? 'bg-brand-900/30 text-brand-200 border border-brand-700/40' : 'bg-surface-900/40 text-slate-300 border border-surface-700'}`}
                  onClick={item.onClick}
                >
                  {item.label}
                </button>
                {index < breadcrumbItems.length - 1 ? <span className="text-slate-500">/</span> : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className="card p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-2">
          <select className="input" value={filters.period} onChange={(e) => setFilters((state) => ({ ...state, period: e.target.value }))}>
            <option value="">Period: All</option>
            {[...new Set(rawTransactions.map((row) => row.period).filter(Boolean))].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select className="input" value={filters.entity} onChange={(e) => setFilters((state) => ({ ...state, entity: e.target.value }))}>
            <option value="">Entity: All</option>
            {[...new Set(rawTransactions.map((row) => row.entity).filter(Boolean))].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select className="input" value={filters.account} onChange={(e) => setFilters((state) => ({ ...state, account: e.target.value }))}>
            <option value="">Account: All</option>
            {[...new Set(rawTransactions.map((row) => row.account).filter(Boolean))].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select className="input" value={filters.owner} onChange={(e) => setFilters((state) => ({ ...state, owner: e.target.value }))}>
            <option value="">Owner: All</option>
            {[...new Set(rawTransactions.map((row) => row.owner).filter(Boolean))].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select className="input" value={filters.status} onChange={(e) => setFilters((state) => ({ ...state, status: e.target.value }))}>
            <option value="">Status: All</option>
            {[...new Set(rawTransactions.map((row) => String(row.status || '').toUpperCase()).filter(Boolean))].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select className="input" value={filters.currency} onChange={(e) => setFilters((state) => ({ ...state, currency: e.target.value }))}>
            <option value="">Currency: All</option>
            {[...new Set(rawTransactions.map((row) => row.currency).filter(Boolean))].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select className="input" value={filters.risk} onChange={(e) => setFilters((state) => ({ ...state, risk: e.target.value }))}>
            <option value="">Risk: All</option>
            {[...new Set(rawTransactions.map((row) => String(row.risk || '').toUpperCase()).filter(Boolean))].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>

        <div className="card focus-surface pulse-update p-4 overflow-auto">
          <p className="text-sm font-semibold text-slate-100 mb-2">Oracle-style Compliance Matrix</p>
          <p className="hint-text mb-2">Tip: click hierarchy labels to drill instantly; use + / - to expand or collapse groups.</p>
          <div className="space-y-1 text-xs mb-3">
            <div className="rounded border border-surface-700 bg-surface-900/40 px-2 py-1">Entity [ {matrixEntity === 'ALL' ? matrixEntityOptions.join(', ') || 'All' : matrixEntity} ]</div>
            <div className="rounded border border-surface-700 bg-surface-900/40 px-2 py-1">Status [ {matrixStatus === 'ALL' ? matrixStatusOptions.join(', ') || 'All' : matrixStatus} ]</div>
            <div className="rounded border border-surface-700 bg-surface-900/40 px-2 py-1">Risk [ {matrixRisk === 'ALL' ? matrixRiskOptions.join(', ') || 'All' : matrixRisk} ]</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
            <select className="input" value={matrixEntity} onChange={(e) => setMatrixEntity(e.target.value)}>
              <option value="ALL">All Entities</option>
              {matrixEntityOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <select className="input" value={matrixStatus} onChange={(e) => setMatrixStatus(e.target.value)}>
              <option value="ALL">All Statuses</option>
              {matrixStatusOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <select className="input" value={matrixRisk} onChange={(e) => setMatrixRisk(e.target.value)}>
              <option value="ALL">All Risks</option>
              {matrixRiskOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <button className="btn-secondary" onClick={() => { setMatrixEntity('ALL'); setMatrixStatus('ALL'); setMatrixRisk('ALL') }}>
              Clear Slicers
            </button>
          </div>
          <table className="enterprise-table text-sm">
            <thead>
              <tr>
                <th>Hierarchy</th>
                <th>Records</th>
                {matrixMonths.map((m) => <th key={m}>{m}</th>)}
              </tr>
            </thead>
            <tbody>
              {matrixRows.map((row) => (
                <tr key={row.key} className="cursor-pointer drill-row" onClick={() => handleMatrixDrill(row)}>
                  <td className="text-slate-100">
                    <div style={{ paddingLeft: `${row.level * 16}px` }} className="flex items-center gap-2">
                      {row.hasChildren ? (
                        <button
                          className="text-xs border border-surface-600 rounded px-1"
                          onClick={(e) => {
                            e.stopPropagation()
                            setExpandedRows((prev) => ({ ...prev, [row.key]: !prev[row.key] }))
                          }}
                        >
                          {expandedRows[row.key] ? '-' : '+'}
                        </button>
                      ) : <span className="w-4 inline-block" />}
                      <span>{row.label}</span>
                    </div>
                  </td>
                  <td>{row.count}</td>
                  {matrixMonths.map((m) => <td key={`${row.key}-${m}`}>{fmtCurrency(row.values[m] || 0, 'USD')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isLoading ? <LoadingState label="Loading analytics..." /> : null}
        {!isLoading && !scopedTransactions.length ? <EmptyState title="No analytics data" description="Adjust filters or select another project to view metrics." /> : null}

        {!isLoading && scopedTransactions.length ? (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
              <div className="oracle-kpi p-3 text-left">
                <p className="text-xs text-slate-400">Total Reconciliations</p>
                <p className="text-lg font-semibold text-slate-100">{totals.totalRecons}</p>
              </div>
              <div className="oracle-kpi p-3 text-left">
                <p className="text-xs text-slate-400">Matched</p>
                <p className="text-lg font-semibold text-slate-100">{totals.matched}</p>
              </div>
              <div className="oracle-kpi p-3 text-left">
                <p className="text-xs text-slate-400">Exceptions</p>
                <p className="text-lg font-semibold text-slate-100">{totals.exceptions}</p>
              </div>
              <div className="oracle-kpi p-3 text-left">
                <p className="text-xs text-slate-400">Evidence Count</p>
                <p className="text-lg font-semibold text-slate-100">{totals.evidence}</p>
              </div>
              <div className="oracle-kpi p-3 text-left">
                <p className="text-xs text-slate-400">Match Rate</p>
                <p className="text-lg font-semibold text-slate-100">{fmtPct(totals.matchRate)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="card p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{currentDepth === 'overview' ? 'Exceptions by Entity' : currentDepth === 'entity' ? 'Accounts for Selected Entity' : 'Exception Type Slice for Selected Account'}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {currentDepth === 'overview' ? 'Click any entity bar to drill into that entity.' : currentDepth === 'entity' ? 'Click any account bar to open the next level.' : 'Click an exception bar to slice transactions below. Click again to clear.'}
                    </p>
                  </div>
                  {currentDepth === 'account' && selectedExceptionSlice ? <button className="btn-secondary" onClick={() => setSelectedExceptionSlice('')}>Clear Slice</button> : null}
                  {currentDepth === 'entity' ? <button className="btn-secondary" onClick={goOverview}>Back to overview</button> : null}
                  {currentDepth === 'account' ? <button className="btn-secondary" onClick={() => goEntity(selectedEntity)}>Back to entity</button> : null}
                </div>
                <ReactECharts
                  style={{ height: 300 }}
                  option={chartOption}
                  onEvents={chartEvents}
                />
              </div>

              <div className="card p-4">
                <p className="text-sm font-semibold text-slate-100 mb-3">Summary</p>
                <div className="space-y-3">
                  <div className="oracle-kpi p-3">
                    <p className="text-xs text-slate-400">Current View</p>
                    <p className="text-sm font-semibold text-slate-100 capitalize">{currentDepth}</p>
                  </div>
                  <div className="oracle-kpi p-3">
                    <p className="text-xs text-slate-400">Selected Entity</p>
                    <p className="text-sm font-semibold text-slate-100">{selectedEntity || 'All entities'}</p>
                  </div>
                  <div className="oracle-kpi p-3">
                    <p className="text-xs text-slate-400">Selected Account</p>
                    <p className="text-sm font-semibold text-slate-100">{selectedAccount || 'All accounts'}</p>
                  </div>
                  <div className="oracle-kpi p-3">
                    <p className="text-xs text-slate-400">Exception Slice</p>
                    <p className="text-sm font-semibold text-slate-100">{selectedExceptionSlice || 'All exception types'}</p>
                  </div>
                  <div className="oracle-kpi p-3">
                    <p className="text-xs text-slate-400">Selected Transaction</p>
                    <p className="text-sm font-semibold text-slate-100">{selectedTransaction?.reference || 'None selected'}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="card focus-surface p-4 overflow-auto">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <p className="text-sm font-semibold text-slate-100">
                    {currentDepth === 'overview' ? 'Entity Summary' : currentDepth === 'entity' ? `Accounts for ${selectedEntity}` : `Transactions for ${selectedEntity} / ${selectedAccount}${selectedExceptionSlice ? ` / ${selectedExceptionSlice}` : ''}`}
                  </p>
                  <p className="hint-text mt-1">Real-time drilldown: entity to account to exception to transaction evidence.</p>
                </div>
                {selectedEntity ? <button className="btn-secondary" onClick={goOverview}>Reset</button> : null}
              </div>

              {currentDepth === 'overview' ? (
                <div className="max-h-[520px] overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-surface-700">
                      <th className="p-2">Entity</th>
                      <th className="p-2">Reconciliations</th>
                      <th className="p-2">Match Rate</th>
                      <th className="p-2">Exceptions</th>
                      <th className="p-2">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.rows.map((row) => (
                      <tr key={row.entity} className="border-b border-surface-800 hover:bg-surface-800/40 cursor-pointer drill-row" onClick={() => goEntity(row.entity)}>
                        <td className="p-2 text-slate-100">{row.entity}</td>
                        <td className="p-2 text-slate-300">{row.total}</td>
                        <td className="p-2 text-slate-300">{fmtPct(row.matchRate)}</td>
                        <td className="p-2 text-slate-300">{row.exceptions}</td>
                        <td className="p-2 text-slate-300">{fmtCurrency(row.variance, 'USD')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              ) : currentDepth === 'entity' ? (
                <div className="max-h-[520px] overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-surface-700">
                      <th className="p-2">Account</th>
                      <th className="p-2">Transactions</th>
                      <th className="p-2">Match Rate</th>
                      <th className="p-2">Exceptions</th>
                      <th className="p-2">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.rows.map((row) => (
                      <tr key={row.account} className="border-b border-surface-800 hover:bg-surface-800/40 cursor-pointer drill-row" onClick={() => goAccount(selectedEntity, row.account)}>
                        <td className="p-2 text-slate-100">{row.account}</td>
                        <td className="p-2 text-slate-300">{row.total}</td>
                        <td className="p-2 text-slate-300">{fmtPct(row.matchRate)}</td>
                        <td className="p-2 text-slate-300">{row.exceptions}</td>
                        <td className="p-2 text-slate-300">{fmtCurrency(row.variance, 'USD')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              ) : (
                <div className="max-h-[520px] overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-surface-700">
                      <th className="p-2">Reference</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Risk</th>
                      <th className="p-2">Exception</th>
                      <th className="p-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.rows.map((row) => (
                      <tr
                        key={row.record_id}
                        className={`border-b border-surface-800 cursor-pointer drill-row ${String(selectedTransactionId) === String(row.record_id) ? 'bg-brand-900/20' : ''}`}
                        onClick={() => setSelectedTransactionId(row.record_id)}
                      >
                        <td className="p-2 text-slate-100">{row.reference}</td>
                        <td className="p-2 text-slate-300">{row.status}</td>
                        <td className="p-2 text-slate-300">{row.risk}</td>
                        <td className="p-2 text-slate-300">{row.exception_classification}</td>
                        <td className="p-2 text-slate-300">{fmtCurrency(row.amount, 'USD')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
              <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-400">
                <span>
                  Showing {pagedRows.total ? pagedRows.start + 1 : 0}-{Math.min(pagedRows.start + PAGE_SIZE, pagedRows.total)} of {pagedRows.total}
                </span>
                <div className="flex items-center gap-2">
                  <button className="btn-secondary px-3 py-1.5" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pagedRows.safePage <= 1}>Prev</button>
                  <span>Page {pagedRows.safePage} / {pagedRows.totalPages}</span>
                  <button className="btn-secondary px-3 py-1.5" onClick={() => setPage((p) => Math.min(pagedRows.totalPages, p + 1))} disabled={pagedRows.safePage >= pagedRows.totalPages}>Next</button>
                </div>
              </div>
            </div>
            {currentDepth === 'account' && selectedTransaction ? (
              <div className="card p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">Transaction Root Cause</p>
                    <p className="text-xs text-slate-400 mt-1">Trace summary metrics to field-level differences and action points.</p>
                  </div>
                  <button className="btn-secondary" onClick={() => navigate(`/projects/${selectedProjectId}/results`)}>Open Workbench</button>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-surface-700 p-3">
                    <p className="text-xs text-slate-400 mb-2">Source Data</p>
                    <pre className="text-xs text-slate-200 whitespace-pre-wrap">{JSON.stringify(selectedTransaction.selected_source_data || {}, null, 2)}</pre>
                  </div>
                  <div className="rounded-xl border border-surface-700 p-3">
                    <p className="text-xs text-slate-400 mb-2">Target Data</p>
                    <pre className="text-xs text-slate-200 whitespace-pre-wrap">{JSON.stringify(selectedTransaction.selected_target_data || {}, null, 2)}</pre>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-xs text-slate-400 mb-2">Discrepancies</p>
                  {!selectedTransaction.discrepancies?.length ? (
                    <p className="text-sm text-slate-300">No explicit field discrepancies captured for this row.</p>
                  ) : (
                    <div className="overflow-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-slate-400 border-b border-surface-700">
                            <th className="p-2">Field</th>
                            <th className="p-2">Source</th>
                            <th className="p-2">Target</th>
                            <th className="p-2">Rule</th>
                            <th className="p-2">Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedTransaction.discrepancies.map((d, idx) => (
                            <tr key={`${d.source_column || 'field'}-${idx}`} className="border-b border-surface-800">
                              <td className="p-2 text-slate-200">{d.source_column || '-'}</td>
                              <td className="p-2 text-slate-300">{String(d.source_value ?? '-')}</td>
                              <td className="p-2 text-slate-300">{String(d.target_value ?? '-')}</td>
                              <td className="p-2 text-slate-300">{d.rule_type || '-'}</td>
                              <td className="p-2 text-slate-300">{typeof d.score === 'number' ? d.score.toFixed(3) : '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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
