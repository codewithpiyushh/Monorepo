import { useEffect, useMemo, useRef, useState } from 'react'
import { authAPI, executionsAPI, exportsAPI, mappingsAPI, workflowAPI } from '../api'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import { Download, ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import TransactionTable from './results/TransactionTable'
import DetailDrawer from './results/DetailDrawer'
import { normalizeRole } from '../utils/roles'

const STATUS_POLL_MS = 1500

const safeParse = (value) => {
  if (!value) return {}
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

export default function ExecuteStep({ project, onTopbarStateChange }) {
  const user = useAuthStore((s) => s.user)
  const role = normalizeRole(user?.role)
  const [activeExec, setActiveExec] = useState(null)
  const [executionRuns, setExecutionRuns] = useState([])
  const [units, setUnits] = useState([])
  const [mappedColumns, setMappedColumns] = useState([])
  const [selectedReconciliation, setSelectedReconciliation] = useState(null)
  const [selectedReconciliationKey, setSelectedReconciliationKey] = useState('')
  const [selectedTransaction, setSelectedTransaction] = useState(null)
  const [workflowItems, setWorkflowItems] = useState([])
  const [activeWorkflow, setActiveWorkflow] = useState(null)
  const [filter, setFilter] = useState('all')
  const [comments, setComments] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [deletingRunId, setDeletingRunId] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState('all')
  const [resultView, setResultView] = useState('overview')
  const [expandedGroupKey, setExpandedGroupKey] = useState('')
  const [groupDrilled, setGroupDrilled] = useState(false)
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [users, setUsers] = useState([])
  const pollRef = useRef(null)

  const getUnitKey = (unit, idx = 0) => `${unit.entity}::${unit.account}::${idx}`
  const totalPages = Math.ceil(total / pageSize) || 1

  useEffect(() => {
    loadInitial()
    return () => clearInterval(pollRef.current)
  }, [project.id])

  const loadInitial = async () => {
    try {
      const [executionList, mappingList] = await Promise.all([
        executionsAPI.list(project.id),
        mappingsAPI.list(project.id),
      ])
      authAPI.listUsers().then((rows) => setUsers(rows || [])).catch(() => setUsers([]))
      setExecutionRuns(executionList || [])
      setMappedColumns((mappingList || []).filter((item) => item?.source_column && item?.target_column))
      const latest = executionList[0]
      if (!latest) return
      setActiveExec(latest)
      await loadWorkflow(latest.id)
      if (latest.status === 'completed') {
        loadResults(latest.id, 1, pageSize)
      } else if (latest.status === 'running') {
        startPolling(latest.id)
      }
    } catch {
      toast.error('Failed to load executions')
    }
  }

  const loadWorkflow = async (executionId) => {
    try {
      const items = await workflowAPI.list({ reconciliation_id: executionId })
      setWorkflowItems(items || [])
      setActiveWorkflow(items?.[0] || null)
    } catch {
      setWorkflowItems([])
      setActiveWorkflow(null)
    }
  }

  const startPolling = (executionId) => {
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const execution = await executionsAPI.get(project.id, executionId)
        setActiveExec(execution)
        setExecutionRuns((prev) => prev.map((item) => (item.id === execution.id ? execution : item)))
        if (execution.status === 'completed') {
          clearInterval(pollRef.current)
          setRunning(false)
          loadResults(executionId, 1, pageSize)
          toast.success('Reconciliation complete!')
        } else if (execution.status === 'failed') {
          clearInterval(pollRef.current)
          setRunning(false)
          toast.error(`Execution failed: ${execution.error_message}`)
        }
      } catch {}
    }, STATUS_POLL_MS)
  }

  const handleRun = async () => {
    setRunning(true)
    setUnits([])
    setStats(null)
    setPage(1)
    setSelectedReconciliation(null)
    setSelectedReconciliationKey('')
    setSelectedTransaction(null)
    try {
      const execution = await executionsAPI.trigger(project.id)
      setActiveExec(execution)
      setExecutionRuns((prev) => [execution, ...prev])
      setActiveWorkflow(null)
      setWorkflowItems([])
      startPolling(execution.id)
      toast.success('Reconciliation started...')
    } catch (err) {
      setRunning(false)
      toast.error(err.response?.data?.detail || 'Failed to start execution')
    }
  }

  useEffect(() => {
    onTopbarStateChange?.({
      status: activeExec?.status || null,
      running,
      runAction: handleRun,
    })
  }, [activeExec?.status, running, onTopbarStateChange])

  const loadResults = async (executionId, nextPage, perPage = pageSize) => {
    setLoading(true)
    setGroupDrilled(false)
    try {
      const data = await executionsAPI.results(project.id, executionId, { page: nextPage, page_size: perPage })
      const nextUnits = data.units || []
      setUnits(nextUnits)
      setTotal(data.total || 0)
      setStats(data.stats)
      setPage(nextPage)
      if (nextUnits.length === 0) {
        setSelectedReconciliation(null)
        setSelectedReconciliationKey('')
        setExpandedGroupKey('')
        setSelectedTransaction(null)
      } else {
        const existing = nextUnits.find((u, idx) => getUnitKey(u, idx) === selectedReconciliationKey)
        if (existing) {
          setSelectedReconciliation(existing)
          setSelectedTransaction(null)
        } else {
          setSelectedReconciliation(null)
          setSelectedReconciliationKey('')
          setExpandedGroupKey('')
          setSelectedTransaction(null)
        }
      }
      await loadWorkflow(executionId)
    } catch {
      toast.error('Failed to load results')
    } finally {
      setLoading(false)
    }
  }

  const doWorkflowAction = async (action) => {
    if (!activeExec) return
    setActionBusy(true)
    try {
      let wf = null
      const payload = { reconciliation_id: activeExec.id, comments: comments || undefined }
      if (action === 'assign') {
        wf = await workflowAPI.assign({ ...payload, assigned_to: assignedTo ? Number(assignedTo) : null })
      } else if (action === 'submit') {
        wf = await workflowAPI.submit(payload)
      } else if (action === 'approve') {
        wf = await workflowAPI.approve(payload)
      } else if (action === 'reject') {
        wf = await workflowAPI.reject(payload)
      }
      setActiveWorkflow(wf)
      setComments('')
      toast.success(`Workflow ${action} successful`)
      await loadWorkflow(activeExec.id)
    } catch (err) {
      toast.error(err?.response?.data?.detail || `Failed to ${action}`)
    } finally {
      setActionBusy(false)
    }
  }

  const handleExport = async () => {
    try {
      setExporting(true)
      await exportsAPI.downloadReport(project.id, exportStatus)
      toast.success('Report downloaded')
    } catch (err) {
      toast.error(err?.message || err?.response?.data?.detail || 'Failed to export report')
    } finally {
      setExporting(false)
    }
  }

  const canDeleteRun = role === 'admin' || role === 'preparer'

  const handleDeleteRun = async (runId) => {
    if (!canDeleteRun) return
    const confirmed = window.confirm(`Delete reconciliation run #${runId}? This cannot be undone.`)
    if (!confirmed) return

    setDeletingRunId(runId)
    try {
      await workflowAPI.delete({ reconciliation_id: runId })
      let remainingRuns = []
      setExecutionRuns((prev) => {
        remainingRuns = prev.filter((run) => run.id !== runId)
        return remainingRuns
      })
      if (activeExec?.id === runId) {
        const nextActive = remainingRuns[0] || null
        setActiveExec(nextActive)
        if (!nextActive) {
          setUnits([])
          setStats(null)
          setTotal(0)
          setPage(1)
          setSelectedReconciliation(null)
          setSelectedReconciliationKey('')
          setSelectedTransaction(null)
          setWorkflowItems([])
          setActiveWorkflow(null)
        } else if (nextActive.status === 'completed') {
          await loadResults(nextActive.id, 1, pageSize)
        } else {
          setUnits([])
          setStats(null)
          setTotal(0)
          setPage(1)
          setSelectedReconciliation(null)
          setSelectedReconciliationKey('')
          setSelectedTransaction(null)
          await loadWorkflow(nextActive.id)
        }
      }
      toast.success(`Deleted reconciliation run #${runId}`)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to delete reconciliation run')
    } finally {
      setDeletingRunId(null)
    }
  }

  const handleSelectRun = async (runIdValue) => {
    const runId = Number(runIdValue)
    const run = executionRuns.find((item) => item.id === runId)
    if (!run) return
    setActiveExec(run)
    setSelectedReconciliation(null)
    setSelectedReconciliationKey('')
    setExpandedGroupKey('')
    setSelectedTransaction(null)
    if (run.status === 'completed') {
      await loadResults(run.id, 1, pageSize)
    } else {
      setUnits([])
      setStats(null)
      setTotal(0)
      setPage(1)
      await loadWorkflow(run.id)
    }
  }

  const activeTransactions = useMemo(() => selectedReconciliation?.transactions || [], [selectedReconciliation])
  const kpi = useMemo(() => ({
    total: stats?.total_records ?? total ?? 0,
    matched: stats?.matched ?? 0,
    partial: stats?.partial ?? 0,
    unmatched: stats?.unmatched ?? 0,
    rate: stats?.match_rate ?? 0,
  }), [stats, total])
  const latestSummary = useMemo(() => ({
    total: kpi.total,
    matchedPct: kpi.total ? Math.round((kpi.matched / kpi.total) * 100) : 0,
    exceptions: kpi.unmatched + kpi.partial,
    variance: kpi.unmatched,
  }), [kpi])
  const runTrend = useMemo(() => {
    if (!activeExec) return null
    const idx = executionRuns.findIndex((r) => r.id === activeExec.id)
    if (idx < 0 || idx === executionRuns.length - 1) return null
    const previous = executionRuns[idx + 1]
    const currentStats = safeParse(activeExec.stats)
    const previousStats = safeParse(previous?.stats)
    const currentRate = Number(currentStats.match_rate || 0)
    const prevRate = Number(previousStats.match_rate || 0)
    const diff = currentRate - prevRate
    return { diff, label: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)} vs previous run` }
  }, [activeExec, executionRuns])
  const workflowStatus = activeWorkflow?.status || 'pending'
  const laneCounts = useMemo(() => {
    const out = { pending: 0, in_progress: 0, under_review: 0, approved: 0, rejected: 0 }
    workflowItems.forEach((w) => { if (out[w.status] !== undefined) out[w.status] += 1 })
    if (workflowItems.length === 0 && activeExec) out[workflowStatus] += 1
    return out
  }, [workflowItems, workflowStatus, activeExec])
  const pov = useMemo(() => {
    const tx = activeTransactions[0]
    const source = safeParse(tx?.source_data)
    return {
      period: source?.period || '-',
      entity: selectedReconciliation?.entity || '-',
      account: selectedReconciliation?.account || '-',
      profile: project?.name || '-',
      system: source?.source_system || '-',
    }
  }, [activeTransactions, selectedReconciliation, project?.name])

  const canAssign = role === 'admin'
  const canSubmit = role === 'preparer' || role === 'admin'
  const canReview = role === 'reviewer' || role === 'admin'
  const assignableUsers = useMemo(
    () =>
      users.filter((u) => {
        const username = (u?.username || '').toLowerCase()
        const userRole = normalizeRole(u?.role)
        // Hide legacy seed user kept for backward compatibility.
        if (username === 'analyst' && userRole === 'preparer') return false
        return true
      }),
    [users]
  )
  const exceptions = useMemo(
    () => activeTransactions.filter((tx) => tx.match_status !== 'matched'),
    [activeTransactions]
  )
  const nextAction = useMemo(() => {
    if (!activeExec) return 'Run reconciliation to generate reconciliation units.'
    if (activeExec.status === 'running') return 'Wait for run completion, then review exceptions.'
    if (workflowStatus === 'pending' || workflowStatus === 'in_progress') return 'Assign owner and submit for review.'
    if (workflowStatus === 'under_review') return 'Reviewer should approve or reject with notes.'
    if (workflowStatus === 'rejected') return 'Preparer should update case and resubmit.'
    if (workflowStatus === 'approved') return 'Complete certification and close tasks.'
    return 'Continue workflow actions based on role queue.'
  }, [activeExec, workflowStatus])

  const sla = useMemo(() => {
    if (!activeExec?.started_at) return { label: '-', risk: 'normal' }
    const started = new Date(activeExec.started_at).getTime()
    const due = started + 48 * 60 * 60 * 1000
    const diffHours = Math.floor((due - Date.now()) / (60 * 60 * 1000))
    if (diffHours < 0) return { label: `Overdue by ${Math.abs(diffHours)}h`, risk: 'high' }
    if (diffHours <= 8) return { label: `${diffHours}h left`, risk: 'med' }
    return { label: `${diffHours}h left`, risk: 'normal' }
  }, [activeExec?.started_at])

  return (
    <div className="px-4 lg:px-6 py-3 space-y-3 w-full min-w-0">
      <div className="card px-3 py-3">
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 text-xs">
          <div className="rounded-lg border border-surface-700 bg-surface-800/40 p-2"><p className="text-slate-500">Entity</p><p className="text-slate-100 font-medium">{pov.entity}</p></div>
          <div className="rounded-lg border border-surface-700 bg-surface-800/40 p-2"><p className="text-slate-500">Account</p><p className="text-slate-100 font-medium">{pov.account}</p></div>
          <div className="rounded-lg border border-surface-700 bg-surface-800/40 p-2"><p className="text-slate-500">Matched</p><p className="text-emerald-300 font-semibold">{kpi.matched}</p></div>
          <div className="rounded-lg border border-surface-700 bg-surface-800/40 p-2"><p className="text-slate-500">Unmatched</p><p className="text-red-300 font-semibold">{kpi.unmatched}</p></div>
          <div className="rounded-lg border border-surface-700 bg-surface-800/40 p-2">
            <p className="text-slate-500">Match Rate</p>
            <p className="text-slate-100 font-semibold">{kpi.rate}%</p>
            {runTrend && <p className={`text-[10px] mt-0.5 ${runTrend.diff >= 0 ? 'text-emerald-300' : 'text-amber-300'}`}>{runTrend.label}</p>}
          </div>
          <div className="rounded-lg border border-surface-700 bg-surface-800/40 p-2"><p className="text-slate-500">Workflow</p><p className="text-brand-300 font-semibold capitalize">{workflowStatus.replace('_', ' ')}</p></div>
          <div className="rounded-lg border border-surface-700 bg-surface-800/40 p-2"><p className="text-slate-500">Queue</p><p className="text-slate-200">{laneCounts[workflowStatus] || 0}</p></div>
          <div className="rounded-lg border border-surface-700 bg-surface-800/40 p-2"><p className="text-slate-500">Profile</p><p className="text-slate-200 truncate">{pov.profile}</p></div>
        </div>
      </div>

      <div className="card p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="oracle-panel-title text-sm">Role Queue and Workflow Actions</p>
          <div className="flex items-center gap-2">
            <select
              className="input h-8 py-1 text-xs min-w-[210px]"
              value={activeExec?.id || ''}
              onChange={(e) => handleSelectRun(e.target.value)}
              disabled={executionRuns.length === 0}
            >
              {executionRuns.length === 0 && <option value="">No runs</option>}
              {executionRuns.map((run) => (
                <option key={run.id} value={run.id}>
                  {`Run #${run.id} - ${new Date(run.created_at || Date.now()).toLocaleString()}`}
                </option>
              ))}
            </select>
            {canDeleteRun && activeExec && (
              <button
                className="btn-ghost py-1 px-2 h-8 text-xs text-red-300 hover:text-red-200 disabled:opacity-60"
                disabled={deletingRunId === activeExec.id || activeExec.status === 'running'}
                onClick={() => handleDeleteRun(activeExec.id)}
                title={activeExec.status === 'running' ? 'Cannot delete a running reconciliation' : 'Delete selected run'}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deletingRunId === activeExec.id ? 'Deleting...' : 'Delete'}
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          <div className="border border-surface-700 rounded-md p-2">
            <p className="text-slate-300 mb-1">My Queue ({role})</p>
            <p className="text-slate-500">Assigned/In Progress: {laneCounts.in_progress + laneCounts.pending}</p>
            <p className="text-slate-500">Under Review: {laneCounts.under_review}</p>
            <p className="text-slate-500">Rejected Back: {laneCounts.rejected}</p>
          </div>
          <div className="border border-surface-700 rounded-md p-2 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select className="input h-8 text-xs" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="">Assign to user</option>
                {assignableUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.username} ({u.role})</option>
                ))}
              </select>
              <input className="input h-8 text-xs" placeholder="Comments" value={comments} onChange={(e) => setComments(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary py-1 h-8 text-xs" disabled={!canAssign || actionBusy || !activeExec} onClick={() => doWorkflowAction('assign')}>Assign</button>
              <button className="btn-secondary py-1 h-8 text-xs" disabled={!canSubmit || actionBusy || !activeExec} onClick={() => doWorkflowAction('submit')}>Submit</button>
              <button className="btn-secondary py-1 h-8 text-xs" disabled={!canReview || actionBusy || !activeExec} onClick={() => doWorkflowAction('approve')}>Approve</button>
              <button className="btn-secondary py-1 h-8 text-xs" disabled={!canReview || actionBusy || !activeExec} onClick={() => doWorkflowAction('reject')}>Reject</button>
            </div>
            {!canAssign && role !== 'admin' && <p className="text-[11px] text-slate-500">Assign is Admin-only.</p>}
            {!canReview && <p className="text-[11px] text-slate-500">Approve/Reject is Reviewer-only.</p>}
          </div>
        </div>
      </div>

      <div className="card p-4">
          <div className="sticky top-0 z-20 bg-surface-900/95 backdrop-blur pb-3 mb-3 border-b border-surface-700/50">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-lg font-semibold text-slate-100">Results</div>
            <div className="flex items-center gap-1 rounded-lg border border-surface-700 p-1 bg-surface-800/40">
              <button className={`px-2 py-1 text-xs rounded ${resultView === 'overview' ? 'bg-brand-900/30 text-slate-100' : 'text-slate-400'}`} onClick={() => setResultView('overview')}>Overview</button>
              <button className={`px-2 py-1 text-xs rounded ${resultView === 'transactions' ? 'bg-brand-900/30 text-slate-100' : 'text-slate-400'}`} onClick={() => setResultView('transactions')}>Transactions</button>
              <button className={`px-2 py-1 text-xs rounded ${resultView === 'exceptions' ? 'bg-brand-900/30 text-slate-100' : 'text-slate-400'}`} onClick={() => setResultView('exceptions')}>Exceptions</button>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button className="btn-secondary py-1 h-8 text-xs" onClick={() => setShowAdvancedFilters((v) => !v)}>{showAdvancedFilters ? 'Hide Filters' : 'More Filters'}</button>
              <select className="input py-1 h-8 w-28 text-xs" value={exportStatus} onChange={(e) => setExportStatus(e.target.value)}>
                <option value="all">All</option><option value="matched">Matched</option><option value="unmatched">Unmatched</option><option value="exceptions">Exceptions</option>
              </select>
              <button className="btn-secondary py-1 h-8 text-xs" onClick={handleExport} disabled={exporting}>{exporting ? 'Exporting...' : <><Download className="w-3.5 h-3.5" />Export</>}</button>
            </div>
          </div>
          </div>

          <div className="text-xs text-slate-500 mb-3">Run {activeExec ? `#${activeExec.id}` : '-'} {selectedReconciliation ? `> ${selectedReconciliation.entity}/${selectedReconciliation.account}` : ''} {selectedTransaction ? `> Tx #${selectedTransaction.id}` : ''}</div>
          {executionRuns.length === 0 && (
            <div className="card p-4 mb-3">
              <p className="text-sm text-slate-300">No reconciliation runs yet.</p>
              <p className="text-xs text-slate-500 mt-1">Start with your first run to populate groups, transactions, and workflow actions.</p>
              <button className="btn-primary mt-3 h-8 py-1 text-xs" onClick={handleRun} disabled={running}>
                {running ? 'Running...' : 'Run First Reconciliation'}
              </button>
            </div>
          )}

          <div className="space-y-3 min-w-0">
            {(resultView === 'overview' || resultView === 'transactions') && (
              <div className="surface-panel p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500 mb-2">Reconciliation Groups</p>
                {loading && <div className="animate-pulse h-16 rounded bg-surface-700/30" />}
                {!loading && units.map((unit, idx) => {
                  const key = getUnitKey(unit, idx)
                  const isOpen = expandedGroupKey === key
                  const isSelected = selectedReconciliationKey === key
                  return (
                    <div key={key} className="border border-surface-700 rounded-lg mb-2">
                      <button className={`w-full p-3 flex items-center gap-2 text-left ${isSelected ? 'bg-brand-900/10' : ''}`} onClick={() => { setSelectedReconciliation(unit); setSelectedReconciliationKey(key); setExpandedGroupKey(isOpen ? '' : key); setSelectedTransaction(null); setGroupDrilled(!isOpen) }}>
                        {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                        <div className="flex-1">
                          <p className="text-sm text-slate-100">{unit.entity} / {unit.account}</p>
                          <div className="mt-1 flex gap-2 text-[11px]">
                            <span className="px-2 py-0.5 rounded bg-surface-700/40 text-slate-300">Total {unit.total_transactions}</span>
                            <span className="px-2 py-0.5 rounded bg-emerald-900/20 text-emerald-300">Matched {unit.matched_count}</span>
                            <span className="px-2 py-0.5 rounded bg-amber-900/20 text-amber-300">Exceptions {unit.unmatched_count}</span>
                          </div>
                        </div>
                      </button>
                      {isOpen && isSelected && groupDrilled && (
                        <div className="p-3 border-t border-surface-700">
                          <TransactionTable
                            transactions={unit.transactions || []}
                            mappedColumns={mappedColumns}
                            filter={filter}
                            onFilterChange={setFilter}
                            selectedTransactionId={selectedTransaction?.id}
                            onSelectTransaction={setSelectedTransaction}
                            showAdvancedFilters={showAdvancedFilters}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {resultView === 'exceptions' && (
              <div className="card p-3">
                <p className="oracle-panel-title text-sm mb-2">Exception Queue</p>
                <div className="space-y-2 max-h-[52vh] overflow-auto">
                  {exceptions.length === 0 && <p className="text-xs text-emerald-300">No exceptions in selected unit.</p>}
                  {exceptions.map((tx) => (
                    <button key={tx.id} className="w-full text-left border border-surface-700 rounded-lg p-2 hover:bg-surface-700/20" onClick={() => setSelectedTransaction(tx)}>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-200 font-medium">Transaction #{tx.id}</p>
                        <span className={tx.match_status === 'partial' ? 'badge-partial' : 'badge-unmatched'}>{tx.match_status}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">Match score: {((tx.match_score || 0) * 100).toFixed(0)}%</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>Page {page} of {totalPages}</span>
        <div className="flex gap-2">
          <button className="btn-ghost py-1 px-2 text-xs" disabled={page <= 1 || !activeExec} onClick={() => loadResults(activeExec.id, page - 1)}>Prev</button>
          <button className="btn-ghost py-1 px-2 text-xs" disabled={page >= totalPages || !activeExec} onClick={() => loadResults(activeExec.id, page + 1)}>Next</button>
        </div>
      </div>

      <DetailDrawer
        transaction={selectedTransaction}
        open={!!selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
      />
    </div>
  )
}
