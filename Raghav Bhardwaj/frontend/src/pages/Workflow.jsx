import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { workflowAPI } from '../api'
import toast from 'react-hot-toast'

export default function WorkflowPage() {
  const [reconciliationId, setReconciliationId] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [comments, setComments] = useState('')
  const [workflowId, setWorkflowId] = useState('')

  const { data: workflow } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => workflowAPI.get(workflowId),
    enabled: !!workflowId,
    refetchInterval: 5000,
  })

  const assignMutation = useMutation({
    mutationFn: workflowAPI.assign,
    onSuccess: (data) => {
      toast.success('Workflow assigned')
      setWorkflowId(String(data.id))
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Assign failed'),
  })

  const submitMutation = useMutation({
    mutationFn: workflowAPI.submit,
    onSuccess: () => toast.success('Submitted for review'),
    onError: (err) => toast.error(err.response?.data?.detail || 'Submit failed'),
  })

  const approveMutation = useMutation({
    mutationFn: workflowAPI.approve,
    onSuccess: () => toast.success('Approved'),
    onError: (err) => toast.error(err.response?.data?.detail || 'Approve failed'),
  })

  const rejectMutation = useMutation({
    mutationFn: workflowAPI.reject,
    onSuccess: () => toast.success('Rejected'),
    onError: (err) => toast.error(err.response?.data?.detail || 'Reject failed'),
  })

  const reconciliationNum = Number(reconciliationId)

  return (
    <div className="h-full flex flex-col">
      <div className="section-header">
        <h1 className="text-base font-semibold text-white">Workflow</h1>
      </div>
      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">Assign</h2>
          <input className="input" placeholder="Reconciliation ID" value={reconciliationId} onChange={(e) => setReconciliationId(e.target.value)} />
          <input className="input" placeholder="Assigned To User ID (optional)" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} />
          <textarea className="input" placeholder="Comments" value={comments} onChange={(e) => setComments(e.target.value)} />
          <button
            className="btn-primary"
            onClick={() => {
              if (!Number.isFinite(reconciliationNum)) return toast.error('Provide reconciliation ID')
              assignMutation.mutate({
                reconciliation_id: reconciliationNum,
                assigned_to: assignedTo ? Number(assignedTo) : null,
                comments,
              })
            }}
          >
            Assign Workflow
          </button>
        </div>

        <div className="card p-4 space-y-3 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-200">Actions</h2>
          <div className="flex gap-2 flex-wrap">
            <button className="btn-secondary" onClick={() => submitMutation.mutate({ reconciliation_id: reconciliationNum, comments })}>Submit</button>
            <button className="btn-secondary" onClick={() => approveMutation.mutate({ reconciliation_id: reconciliationNum, comments })}>Approve</button>
            <button className="btn-secondary" onClick={() => rejectMutation.mutate({ reconciliation_id: reconciliationNum, comments })}>Reject</button>
          </div>
          <div className="pt-2">
            <label className="label">View Workflow by ID</label>
            <input className="input max-w-xs" value={workflowId} onChange={(e) => setWorkflowId(e.target.value)} placeholder="Workflow ID" />
          </div>

          {workflow && (
            <div className="mt-2 border border-surface-700 rounded-md p-3">
              <p className="text-xs text-slate-400">Status: <span className="text-slate-200">{workflow.status}</span></p>
              <p className="text-xs text-slate-400">Reconciliation: <span className="text-slate-200">#{workflow.reconciliation_id}</span></p>
              <p className="text-xs text-slate-400">Assigned to: <span className="text-slate-200">{workflow.assigned_to ?? '-'}</span></p>
              <p className="text-xs text-slate-400 mt-2 mb-1">History</p>
              <div className="space-y-1 max-h-44 overflow-auto">
                {workflow.history?.map((h) => (
                  <div key={h.id} className="text-xs text-slate-300">
                    {h.action}: {h.from_status || '-'} → {h.to_status || '-'} {h.comments ? `| ${h.comments}` : ''}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

