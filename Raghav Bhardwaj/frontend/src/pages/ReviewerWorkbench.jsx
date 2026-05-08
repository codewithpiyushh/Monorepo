import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { enterpriseAPI } from '../api'
import toast from 'react-hot-toast'

export default function ReviewerWorkbench() {
  const [queueType, setQueueType] = useState('actionable_reviewer')
  const [exceptionId, setExceptionId] = useState('')
  const [comments, setComments] = useState('')

  const { data: exceptions = [], refetch } = useQuery({
    queryKey: ['reviewer-exceptions', queueType],
    queryFn: () => enterpriseAPI.listExceptions(queueType),
    refetchInterval: 5000,
  })

  const approveMutation = useMutation({
    mutationFn: enterpriseAPI.approveException,
    onSuccess: () => { toast.success('Approved'); refetch() },
    onError: (e) => toast.error(e.response?.data?.detail || 'Approve failed'),
  })
  const rejectMutation = useMutation({
    mutationFn: enterpriseAPI.rejectException,
    onSuccess: () => { toast.success('Rejected and sent back'); refetch() },
    onError: (e) => toast.error(e.response?.data?.detail || 'Reject failed'),
  })

  return (
    <div className="h-full flex flex-col">
      <div className="section-header"><h1 className="text-base font-semibold text-white">Reviewer / Approver Workbench</h1></div>
      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4 space-y-3">
          <p className="oracle-panel-title text-sm">Review Queue</p>
          <select className="input max-w-xs" value={queueType} onChange={(e) => setQueueType(e.target.value)}>
            <option value="actionable_reviewer">actionable (exception + escalated + assigned)</option>
            <option value="assigned">assigned</option>
            <option value="escalated">escalated</option>
            <option value="exception">exception</option>
          </select>
          <div className="max-h-[520px] overflow-auto border border-surface-700 rounded-md p-2">
            {exceptions.map((e) => (
              <div key={e.id} className="text-xs text-slate-300 border-b border-surface-700/40 py-2 last:border-b-0">
                #{e.id} | {e.queue_type} | {e.status} | assigned:{e.assigned_to ?? '-'}
              </div>
            ))}
          </div>
        </div>

        <div className="card p-4 space-y-3">
          <p className="oracle-panel-title text-sm">Review Decision</p>
          <input className="input" value={exceptionId} onChange={(e) => setExceptionId(e.target.value)} placeholder="Exception ID" />
          <textarea className="input min-h-[100px]" value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Reviewer notes / comments" />
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => approveMutation.mutate({ exception_id: Number(exceptionId), comments })}>Approve</button>
            <button className="btn-secondary" onClick={() => rejectMutation.mutate({ exception_id: Number(exceptionId), comments })}>Reject</button>
          </div>
        </div>
      </div>
    </div>
  )
}
