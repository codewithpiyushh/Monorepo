import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { schedulesAPI } from '../api'
import toast from 'react-hot-toast'

export default function Schedules() {
  const qc = useQueryClient()
  const [type, setType] = useState('sequence')
  const [referenceId, setReferenceId] = useState('')
  const [cronExpression, setCronExpression] = useState('0 2 * * *')
  const [active, setActive] = useState(true)

  const { data: schedules = [], isLoading } = useQuery({ queryKey: ['schedules'], queryFn: schedulesAPI.list })

  const createMutation = useMutation({
    mutationFn: schedulesAPI.create,
    onSuccess: () => {
      toast.success('Schedule created')
      qc.invalidateQueries(['schedules'])
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Failed to create schedule'),
  })

  const toggleMutation = useMutation({
    mutationFn: schedulesAPI.toggle,
    onSuccess: () => qc.invalidateQueries(['schedules']),
    onError: (err) => toast.error(err.response?.data?.detail || 'Toggle failed'),
  })

  const handleCreate = (e) => {
    e.preventDefault()
    const idNum = Number(referenceId)
    if (!Number.isFinite(idNum)) {
      toast.error('Reference ID must be a number')
      return
    }
    createMutation.mutate({ type, reference_id: idNum, cron_expression: cronExpression, active })
  }

  return (
    <div className="h-full flex flex-col">
      <div className="section-header">
        <h1 className="text-base font-semibold text-white">Schedules</h1>
      </div>
      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <form onSubmit={handleCreate} className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">Create Schedule</h2>
          <div>
            <label className="label">Type</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="sequence">Sequence</option>
              <option value="reconciliation">Reconciliation</option>
            </select>
          </div>
          <div>
            <label className="label">Reference ID</label>
            <input className="input" value={referenceId} onChange={(e) => setReferenceId(e.target.value)} placeholder="e.g. 1" />
          </div>
          <div>
            <label className="label">Cron Expression</label>
            <input className="input" value={cronExpression} onChange={(e) => setCronExpression(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active
          </label>
          <button className="btn-primary" disabled={createMutation.isPending}>{createMutation.isPending ? 'Creating...' : 'Create'}</button>
        </form>

        <div className="card p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-200 mb-3">Schedules</h2>
          {isLoading ? <p className="text-xs text-slate-500">Loading...</p> : (
            <div className="space-y-2 max-h-[420px] overflow-auto">
              {schedules.map((s) => (
                <div key={s.id} className="border border-surface-700 rounded-md p-3 flex items-center gap-2">
                  <span className="chip-neutral">{s.type}</span>
                  <span className="text-xs text-slate-300">ref #{s.reference_id}</span>
                  <span className="text-xs text-slate-400">{s.cron_expression}</span>
                  <span className="text-xs ml-auto">{s.active ? 'Active' : 'Inactive'}</span>
                  <button className="btn-secondary py-1 px-3 text-xs" onClick={() => toggleMutation.mutate(s.id)}>
                    {s.active ? 'Disable' : 'Enable'}
                  </button>
                </div>
              ))}
              {schedules.length === 0 && <p className="text-xs text-slate-500">No schedules yet.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

