import { useEffect, useMemo, useRef, useState } from 'react'
import { executionsAPI, exportsAPI, mappingsAPI, workflowAPI } from '../api'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import { Download } from 'lucide-react'
import SummaryTable from './results/SummaryTable'
import TransactionTable from './results/TransactionTable'
import DetailDrawer from './results/DetailDrawer'

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
  const role = (user?.role || '').toLowerCase()
  const [activeExec, setActiveExec] = useState(null)
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
  const [exporting, setExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState('all')
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
        setSelectedTransaction(null)
      } else {
        const existing = nextUnits.find((u, idx) => getUnitKey(u, idx) === selectedReconciliationKey)
        if (existing) {
          setSelectedReconciliation(existing)
          setSelectedTransaction(null)
        } else {
          setSelectedReconciliation(nextUnits[0])
          setSelectedReconciliationKey(getUnitKey(nextUnits[0], 0))
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

  const activeTransactions = useMemo(() => selectedReconciliation?.transactions || [], [selectedReconciliation])
  const kpi = useMemo(() => ({
    total: stats?.total_records ?? total ?? 0,
    matched: stats?.matched ?? 0,
    partial: stats?.partial ?? 0,
    unmatched: stats?.unmatched ?? 0,
    rate: stats?.match_rate ?? 0,
  }), [stats, total])
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

  return (
    <div className="px-4 lg:px-6 py-3 space-y-3 w-full min-w-0">
      <div className="card px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="text-slate-500">Entity: <span className="text-slate-200 font-medium">{pov.entity}</span></span>
          <span className="text-slate-500">Account: <span className="text-slate-200 font-medium">{pov.account}</span></span>
          <span className="text-slate-500">Matched: <span className="text-emerald-300 font-semibold">{kpi.matched}</span></span>
          <span className="text-slate-500">Unmatched: <span className="text-red-300 font-semibold">{kpi.unmatched}</span></span>
          <span className="text-slate-500">Rate: <span className="text-slate-200 font-semibold">{kpi.rate}%</span></span>
          <span className="text-slate-500">Workflow: <span className="text-brand-300 font-semibold capitalize">{workflowStatus.replace('_', ' ')}</span></span>
          <span className="text-slate-500">Queue: <span className="text-slate-300">{laneCounts[workflowStatus] || 0}</span></span>
          <span className="text-slate-500">Profile: <span className="text-slate-300">{pov.profile}</span></span>
        </div>
      </div>

      <div className="card p-3 space-y-2">
        <p className="oracle-panel-title text-sm">Role Queue and Workflow Actions</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          <div className="border border-surface-700 rounded-md p-2">
            <p className="text-slate-300 mb-1">My Queue ({role})</p>
            <p className="text-slate-500">Assigned/In Progress: {laneCounts.in_progress + laneCounts.pending}</p>
            <p className="text-slate-500">Under Review: {laneCounts.under_review}</p>
            <p className="text-slate-500">Rejected Back: {laneCounts.rejected}</p>
          </div>
          <div className="border border-surface-700 rounded-md p-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input className="input h-8 text-xs" placeholder="Assign to User ID" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} />
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
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="oracle-panel-title text-sm">Case Workspace</div>
          <div className="ml-auto flex items-center gap-2">
          <select className="input py-1 h-8 w-28 text-xs" value={exportStatus} onChange={(e) => setExportStatus(e.target.value)}>
            <option value="all">All</option><option value="matched">Matched</option><option value="unmatched">Unmatched</option><option value="exceptions">Exceptions</option>
          </select>
          <button className="btn-secondary py-1 h-8 text-xs" onClick={handleExport} disabled={exporting}>{exporting ? 'Exporting...' : <><Download className="w-3.5 h-3.5" />Export</>}</button>
          </div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.75fr)_minmax(320px,1fr)] gap-3">
          <div className="space-y-3 min-w-0">
            <SummaryTable
              units={units}
              selectedKey={selectedReconciliationKey}
              getUnitKey={getUnitKey}
              loading={loading}
              onSelect={(unit, key) => {
                setSelectedReconciliation(unit)
                setSelectedReconciliationKey(key)
                setSelectedTransaction(null)
              }}
            />
            <TransactionTable
              transactions={activeTransactions}
              mappedColumns={mappedColumns}
              filter={filter}
              onFilterChange={setFilter}
              selectedTransactionId={selectedTransaction?.id}
              onSelectTransaction={setSelectedTransaction}
            />
          </div>

          <div className="space-y-3">
            <div className="card p-4">
              <p className="oracle-panel-title text-sm mb-2">Case Context</p>
              <p className="text-xs text-slate-400">
                Evidence uploads are enforced in enterprise exception workflow for preparer/reviewer.
                Use this panel as evidence review context for the selected reconciliation unit.
              </p>
            </div>

            <div className="card p-4">
              <p className="oracle-panel-title text-sm mb-2">Case Notes</p>
              <textarea className="input min-h-[120px]" placeholder="Case comments / justification" value={comments} onChange={(e) => setComments(e.target.value)} />
            </div>

            <div className="card p-4 text-xs text-slate-400">
              Decisions are captured via Assign/Submit/Approve/Reject actions above and logged in workflow history + audit logs.
            </div>
          </div>
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
