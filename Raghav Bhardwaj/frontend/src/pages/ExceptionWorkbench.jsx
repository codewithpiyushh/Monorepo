import { useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { enterpriseAPI } from '../api'
import toast from 'react-hot-toast'

export default function ExceptionWorkbench() {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const role = (user?.role || '').toLowerCase()
  const [queueType, setQueueType] = useState('')
  const [exceptionId, setExceptionId] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [comments, setComments] = useState('')

  const { data: exceptions = [] } = useQuery({
    queryKey: ['enterprise-exceptions', queueType],
    queryFn: () => enterpriseAPI.listExceptions(queueType),
    refetchInterval: 5000,
  })

  const refresh = () => qc.invalidateQueries(['enterprise-exceptions', queueType])
  const assignMutation = useMutation({ mutationFn: enterpriseAPI.assignException, onSuccess: () => { toast.success('Assigned'); refresh() }, onError: (e) => toast.error(e.response?.data?.detail || 'Assign failed') })
  const submitMutation = useMutation({ mutationFn: enterpriseAPI.submitException, onSuccess: () => { toast.success('Submitted'); refresh() }, onError: (e) => toast.error(e.response?.data?.detail || 'Submit failed') })
  const approveMutation = useMutation({ mutationFn: enterpriseAPI.approveException, onSuccess: () => { toast.success('Approved'); refresh() }, onError: (e) => toast.error(e.response?.data?.detail || 'Approve failed') })
  const rejectMutation = useMutation({ mutationFn: enterpriseAPI.rejectException, onSuccess: () => { toast.success('Rejected'); refresh() }, onError: (e) => toast.error(e.response?.data?.detail || 'Reject failed') })

  return (
    <div className="h-full flex flex-col">
      <div className="section-header"><h1 className="text-base font-semibold text-white">Exception Workbench</h1></div>
      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4 space-y-2">
          <div className="flex gap-2">
            <select className="input max-w-xs" value={queueType} onChange={(e) => setQueueType(e.target.value)}>
              <option value="">All queues</option>
              <option value="exception">exception</option>
              <option value="unresolved">unresolved</option>
              <option value="assigned">assigned</option>
              <option value="escalated">escalated</option>
            </select>
          </div>
          <div className="max-h-[520px] overflow-auto border border-surface-700 rounded-md p-2">
            {exceptions.map((e) => (
              <div key={e.id} className="text-xs text-slate-300 border-b border-surface-700/40 py-2 last:border-b-0">
                <div>#{e.id} | queue:{e.queue_type} | status:{e.status} | assigned:{e.assigned_to ?? '-'}</div>
                <div className="text-slate-500">updated: {e.updated_at}</div>
              </div>
            ))}
            {exceptions.length === 0 && <div className="text-xs text-slate-500">No exceptions.</div>}
          </div>
        </div>

        <div className="card p-4 space-y-2">
          <input className="input" value={exceptionId} onChange={(e) => setExceptionId(e.target.value)} placeholder="Exception ID" />
          <input className="input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder="Assign to user ID" />
          <textarea className="input min-h-[100px]" value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Comments / notes" />
          <div className="flex flex-wrap gap-2">
            {(role === 'admin') && (
              <button className="btn-secondary" onClick={() => assignMutation.mutate({ exception_id: Number(exceptionId), assigned_to: Number(assignedTo), comments })}>Assign</button>
            )}
            {(role === 'preparer' || role === 'admin') && (
              <button className="btn-secondary" onClick={() => submitMutation.mutate({ exception_id: Number(exceptionId), comments })}>Submit</button>
            )}
            {(role === 'reviewer' || role === 'admin') && (
              <>
                <button className="btn-secondary" onClick={() => approveMutation.mutate({ exception_id: Number(exceptionId), comments })}>Approve</button>
                <button className="btn-secondary" onClick={() => rejectMutation.mutate({ exception_id: Number(exceptionId), comments })}>Reject</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
