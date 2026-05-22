import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { enterpriseAPI } from '../api'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/PageState'
import { useAuthStore } from '../store/authStore'
import { normalizeRole } from '../utils/roles'

export default function ExceptionOpsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [queueType, setQueueType] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const role = normalizeRole(useAuthStore((s) => s.user?.role))
  const canAssign = role === 'admin'

  const { data: rows = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['exception-ops', queueType],
    queryFn: () => enterpriseAPI.listExceptions(queueType),
  })

  const filtered = useMemo(() => rows.filter((r) => statusFilter === 'ALL' || (r.status || '').toUpperCase() === statusFilter), [rows, statusFilter])

  const assignMutation = useMutation({
    mutationFn: (id) => enterpriseAPI.assignException({ exception_id: id, assigned_to: 1, comments: 'Assigned from Exception Ops' }),
    onSuccess: () => { toast.success('Assigned'); qc.invalidateQueries({ queryKey: ['exception-ops'] }) },
    onError: (e) => toast.error(e.response?.data?.detail || 'Assign failed'),
  })

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Exception Ops" subtitle="Queue-first exception triage with role-aware handling and fast actions." badge={`${filtered.length} visible`} />
      <div className="flex-1 overflow-auto p-6 space-y-4">
        <div className="card p-3 grid grid-cols-1 md:grid-cols-3 gap-2">
          <select className="input" value={queueType} onChange={(e) => setQueueType(e.target.value)}>
            <option value="">Queue: All</option>
            <option value="actionable_preparer">Actionable Preparer</option>
            <option value="actionable_reviewer">Actionable Reviewer</option>
            <option value="exception">Exception</option>
            <option value="unresolved">Unresolved</option>
            <option value="assigned">Assigned</option>
            <option value="escalated">Escalated</option>
          </select>
          <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">Status: All</option>
            <option value="OPEN">OPEN</option>
            <option value="ASSIGNED">ASSIGNED</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="UNDER_REVIEW">UNDER_REVIEW</option>
            <option value="REJECTED">REJECTED</option>
            <option value="APPROVED">APPROVED</option>
          </select>
          <button className="btn-secondary" onClick={() => { setQueueType(''); setStatusFilter('ALL') }}>Reset</button>
        </div>

        {isLoading ? <LoadingState label="Loading exception queue..." /> : null}
        {!isLoading && isError ? (
          <ErrorState
            title="Unable to load exception queue"
            description={error?.response?.data?.detail || 'Queue service is unavailable right now.'}
            action={<button className="btn-secondary" onClick={() => refetch()}>Retry</button>}
          />
        ) : null}
        {!isLoading && !isError && filtered.length === 0 ? <EmptyState title="No exceptions in view" description="Try a broader queue/status filter." /> : null}

        {!isLoading && !isError && filtered.length > 0 ? (
          <div className="card p-3 overflow-auto">
            <table className="enterprise-table text-sm">
              <thead>
                <tr className="text-left">
                  <th className="p-2">ID</th><th className="p-2">Queue</th><th className="p-2">Status</th><th className="p-2">Assigned To</th><th className="p-2">Updated</th><th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="p-2 text-slate-200">{r.id}</td>
                    <td className="p-2 text-slate-400">{r.queue_type}</td>
                    <td className="p-2 text-slate-400"><span className={`status-chip status-chip-${String(r.status || '').toLowerCase()}`}>{r.status}</span></td>
                    <td className="p-2 text-slate-400">{r.assigned_to ?? '-'}</td>
                    <td className="p-2 text-slate-400">{r.updated_at ? new Date(r.updated_at).toLocaleString() : '-'}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <button className="btn-secondary text-xs" onClick={() => navigate(`/exception-investigation/${r.id}`)}>
                          Open
                        </button>
                        <button
                          className="btn-secondary text-xs"
                          onClick={() => assignMutation.mutate(r.id)}
                          disabled={!canAssign || assignMutation.isPending}
                          title={canAssign ? 'Assign exception' : 'Only admin can assign from this view'}
                        >
                          Assign
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  )
}
