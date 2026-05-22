import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { enterpriseAPI, workflowAPI } from '../api'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'

export default function PreparerWorkbench() {
  const user = useAuthStore((s) => s.user)
  const [queueFilter, setQueueFilter] = useState('actionable')
  const [workflowId, setWorkflowId] = useState('')
  const [comments, setComments] = useState('')
  const [recordId, setRecordId] = useState('')
  const [docType, setDocType] = useState('invoice')
  const [docName, setDocName] = useState('')
  const [docPath, setDocPath] = useState('/docs/evidence.pdf')
  const [selectedFile, setSelectedFile] = useState(null)

  const { data: workflows = [], refetch } = useQuery({
    queryKey: ['preparer-workflows'],
    queryFn: () => workflowAPI.list(),
    refetchInterval: 5000,
  })
  const { data: dashboard } = useQuery({
    queryKey: ['preparer-dashboard'],
    queryFn: enterpriseAPI.preparerDashboard,
    refetchInterval: 15000,
  })

  const submitMutation = useMutation({
    mutationFn: workflowAPI.submit,
    onSuccess: () => { toast.success('Submitted to reviewer'); refetch() },
    onError: (e) => toast.error(e.response?.data?.detail || 'Submit failed'),
  })
  const uploadMutation = useMutation({
    mutationFn: ({ rid, payload }) => enterpriseAPI.uploadAttachment(rid, payload),
    onSuccess: () => toast.success('Evidence uploaded'),
    onError: (e) => toast.error(e.response?.data?.detail || 'Upload failed'),
  })
  const deleteMutation = useMutation({
    mutationFn: workflowAPI.delete,
    onSuccess: () => { toast.success('Reconciliation deleted'); refetch() },
    onError: (e) => toast.error(e.response?.data?.detail || 'Delete failed'),
  })

  const visibleWorkflows = useMemo(() => {
    if (queueFilter === 'all') return workflows
    if (queueFilter === 'actionable') {
      return workflows.filter((w) => ['pending', 'in_progress', 'rejected'].includes((w.status || '').toLowerCase()))
    }
    return workflows.filter((w) => (w.status || '').toLowerCase() === queueFilter)
  }, [workflows, queueFilter])

  const canSubmit = Boolean(workflowId && comments.trim())

  return (
    <div className="h-full flex flex-col">
      <div className="section-header"><h1 className="text-base font-semibold text-white">Preparer Workbench</h1></div>
      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {dashboard && (
          <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="card p-3 text-xs text-slate-300">Assigned Reconciliations<br /><span className="text-white font-semibold">{dashboard.assigned_tasks}</span></div>
            <div className="card p-3 text-xs text-slate-300">Pending Submissions<br /><span className="text-white font-semibold">{dashboard.pending_submissions}</span></div>
            <div className="card p-3 text-xs text-slate-300">Rejected Reconciliations<br /><span className="text-white font-semibold">{dashboard.rejected_items}</span></div>
            <div className="card p-3 text-xs text-slate-300">Due-Date Warnings<br /><span className="text-white font-semibold">{dashboard.overdue_reconciliations}</span></div>
          </div>
        )}
        <div className="card p-4 space-y-3">
          <p className="oracle-panel-title text-sm">Assigned Reconciliation Queue</p>
          <div className="flex items-center gap-2">
            <select className="input max-w-xs" value={queueFilter} onChange={(e) => setQueueFilter(e.target.value)}>
              <option value="actionable">actionable (pending/in-progress/rejected)</option>
              <option value="all">all</option>
              <option value="pending">pending</option>
              <option value="in_progress">in_progress</option>
              <option value="under_review">under_review</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
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
                    setWorkflowId(String(w.reconciliation_id))
                    if (!comments.trim()) {
                      setComments('Prepared and validated. proof: <evidence-file-or-ticket>')
                    }
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
                      deleteMutation.mutate({ reconciliation_id: Number(w.reconciliation_id), comments: 'Deleted from preparer workspace' })
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
          <h2 className="oracle-panel-title text-sm">Submit Reconciliation</h2>
          <input className="input" value={workflowId} onChange={(e) => setWorkflowId(e.target.value)} placeholder="Reconciliation ID (execution id)" />
          <textarea className="input min-h-[90px]" value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Investigation notes / justification (required, include proof: ...)" />
          <button
            className="btn-secondary"
            onClick={() => {
              const c = comments.trim()
              const lc = c.toLowerCase()
              if (!lc.includes('proof:') && !lc.includes('evidence:')) {
                toast.error("Please include 'proof:' or 'evidence:' in comments")
                return
              }
              submitMutation.mutate({ reconciliation_id: Number(workflowId), comments: c })
            }}
            disabled={!canSubmit}
          >
            Submit for Review
          </button>
          {(user?.role === 'admin' || user?.role === 'preparer') && (
            <button
              className="btn-secondary"
              disabled={!workflowId}
              onClick={() => {
                const ok = window.confirm(`Delete reconciliation ${workflowId}? This removes workflow and results.`)
                if (!ok) return
                deleteMutation.mutate({ reconciliation_id: Number(workflowId), comments: 'Deleted from preparer action panel' })
              }}
            >
              Delete Reconciliation
            </button>
          )}

          <h2 className="oracle-panel-title text-sm pt-2">Evidence Upload</h2>
          <input className="input" value={recordId} onChange={(e) => setRecordId(e.target.value)} placeholder="Reconciliation Record ID" />
          <div className="grid grid-cols-3 gap-2">
            <input className="input" value={docType} onChange={(e) => setDocType(e.target.value)} placeholder="Document type" />
            <input className="input" value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="Document name" />
            <input className="input" value={docPath} onChange={(e) => setDocPath(e.target.value)} placeholder="Document path" />
          </div>
          <input className="input" type="file" onChange={(e) => {
            const file = e.target.files?.[0] || null
            setSelectedFile(file)
            if (file) setDocName(file.name)
          }} />
          <button
            className="btn-primary"
            onClick={() => uploadMutation.mutate({ rid: Number(recordId), payload: { document_type: docType, document_name: docName, document_path: docPath, file: selectedFile } })}
            disabled={!recordId || !docName}
          >
            Upload Evidence
          </button>
        </div>
      </div>
    </div>
  )
}
