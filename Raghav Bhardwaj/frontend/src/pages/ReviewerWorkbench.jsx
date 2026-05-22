import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { enterpriseAPI, workflowAPI } from '../api'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'

export default function ReviewerWorkbench() {
  const user = useAuthStore((s) => s.user)
  const [queueFilter, setQueueFilter] = useState('actionable')
  const [reconciliationId, setReconciliationId] = useState('')
  const [comments, setComments] = useState('')

  const { data: workflows = [], refetch } = useQuery({
    queryKey: ['reviewer-workflows'],
    queryFn: () => workflowAPI.list(),
    refetchInterval: 5000,
  })
  const { data: dashboard } = useQuery({
    queryKey: ['reviewer-dashboard'],
    queryFn: enterpriseAPI.reviewerDashboard,
    refetchInterval: 15000,
  })

  const approveMutation = useMutation({
    mutationFn: workflowAPI.approve,
    onSuccess: () => { toast.success('Approved'); refetch() },
    onError: (e) => toast.error(e.response?.data?.detail || 'Approve failed'),
  })
  const rejectMutation = useMutation({
    mutationFn: workflowAPI.reject,
    onSuccess: () => { toast.success('Rejected and sent back'); refetch() },
    onError: (e) => toast.error(e.response?.data?.detail || 'Reject failed'),
  })
  const deleteMutation = useMutation({
    mutationFn: workflowAPI.delete,
    onSuccess: () => { toast.success('Reconciliation deleted'); refetch() },
    onError: (e) => toast.error(e.response?.data?.detail || 'Delete failed'),
  })

  const visibleWorkflows = useMemo(() => {
    if (queueFilter === 'all') return workflows
    if (queueFilter === 'actionable') {
      return workflows.filter((w) => ['under_review', 'in_progress'].includes((w.status || '').toLowerCase()))
    }
    return workflows.filter((w) => (w.status || '').toLowerCase() === queueFilter)
  }, [workflows, queueFilter])

  const canAct = Boolean(reconciliationId)

  return (
    <div className="h-full flex flex-col">
      <div className="section-header"><h1 className="text-base font-semibold text-white">Reviewer / Approver Workbench</h1></div>
      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {dashboard && (
          <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-5 gap-2">
            <div className="card p-3 text-xs text-slate-300">Pending Approvals<br /><span className="text-white font-semibold">{dashboard.pending_approvals}</span></div>
            <div className="card p-3 text-xs text-slate-300">Overdue<br /><span className="text-white font-semibold">{dashboard.overdue_reconciliations}</span></div>
            <div className="card p-3 text-xs text-slate-300">Rejected Items<br /><span className="text-white font-semibold">{dashboard.rejected_items}</span></div>
            <div className="card p-3 text-xs text-slate-300">Assigned Tasks<br /><span className="text-white font-semibold">{dashboard.assigned_tasks}</span></div>
            <div className="card p-3 text-xs text-slate-300">Escalations<br /><span className="text-white font-semibold">{dashboard.escalation_alerts}</span></div>
          </div>
        )}
        <div className="card p-4 space-y-3">
          <p className="oracle-panel-title text-sm">Review Queue</p>
          <div className="flex items-center gap-2">
            <select className="input max-w-xs" value={queueFilter} onChange={(e) => setQueueFilter(e.target.value)}>
              <option value="actionable">actionable (under_review/in_progress)</option>
              <option value="all">all</option>
              <option value="under_review">under_review</option>
              <option value="in_progress">in_progress</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
              <option value="pending">pending</option>
            </select>
            <button className="btn-secondary" onClick={() => refetch()}>Refresh</button>
          </div>
          <div className="max-h-[520px] overflow-auto border border-surface-700 rounded-md p-2">
            {visibleWorkflows.map((w) => (
              <div key={w.id} className="text-xs text-slate-300 border-b border-surface-700/40 py-2 last:border-b-0 flex items-center justify-between gap-2">
                <div>
                  #{w.id} | recon:{w.reconciliation_id} | {w.status} | assigned:{w.assigned_to ?? '-'}
                </div>
                <button
                  className="btn-secondary !py-1 !px-2"
                  onClick={() => {
                    setReconciliationId(String(w.reconciliation_id))
                    if (!comments.trim()) setComments('Reviewed and verified.')
                  }}
                >
                  Select
                </button>
                {(user?.role === 'admin' || user?.role === 'preparer') && (
                  <button
                    className="btn-secondary !py-1 !px-2"
                    onClick={() => {
                      const ok = window.confirm(`Delete reconciliation ${w.reconciliation_id}? This removes workflow and results.`)
                      if (!ok) return
                      deleteMutation.mutate({ reconciliation_id: Number(w.reconciliation_id), comments: 'Deleted from reviewer workspace' })
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}
            {visibleWorkflows.length === 0 && (
              <div className="text-xs text-slate-500 py-2">No workflow items found for this filter.</div>
            )}
          </div>
        </div>

        <div className="card p-4 space-y-3">
          <p className="oracle-panel-title text-sm">Review Decision</p>
          <input className="input" value={reconciliationId} onChange={(e) => setReconciliationId(e.target.value)} placeholder="Reconciliation ID (execution id)" />
          <textarea className="input min-h-[100px]" value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Reviewer notes / comments" />
          <div className="flex gap-2">
            <button className="btn-secondary" disabled={!canAct} onClick={() => approveMutation.mutate({ reconciliation_id: Number(reconciliationId), comments: comments.trim() })}>Approve</button>
            <button className="btn-secondary" disabled={!canAct} onClick={() => rejectMutation.mutate({ reconciliation_id: Number(reconciliationId), comments: comments.trim() })}>Reject</button>
            {(user?.role === 'admin' || user?.role === 'preparer') && (
              <button
                className="btn-secondary"
                disabled={!canAct}
                onClick={() => {
                  const ok = window.confirm(`Delete reconciliation ${reconciliationId}? This removes workflow and results.`)
                  if (!ok) return
                  deleteMutation.mutate({ reconciliation_id: Number(reconciliationId), comments: 'Deleted from reviewer action panel' })
                }}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
