import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { schedulesAPI, sequencesAPI } from '../api'
import toast from 'react-hot-toast'

export default function SchedulerMonitoring() {
  const qc = useQueryClient()
  const [scheduleId, setScheduleId] = useState('')
  const [sequenceId, setSequenceId] = useState('')

  const { data: schedules = [] } = useQuery({ queryKey: ['schedules'], queryFn: schedulesAPI.list, refetchInterval: 5000 })
  const { data: sequenceStatus } = useQuery({
    queryKey: ['sequence-status-monitor', sequenceId],
    queryFn: () => sequencesAPI.status(sequenceId),
    enabled: !!sequenceId,
    refetchInterval: 5000,
  })

  const toggleMutation = useMutation({
    mutationFn: schedulesAPI.toggle,
    onSuccess: () => {
      toast.success('Schedule toggled')
      qc.invalidateQueries(['schedules'])
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Toggle failed'),
  })

  return (
    <div className="h-full flex flex-col">
      <div className="section-header"><h1 className="text-base font-semibold text-white">Scheduler Monitoring</h1></div>
      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">Schedules</h2>
          <div className="max-h-[540px] overflow-auto space-y-2">
            {schedules.map((s) => (
              <div key={s.id} className="border border-surface-700 rounded-md p-3 text-xs text-slate-300">
                <div>#{s.id} | {s.type} | ref:{s.reference_id}</div>
                <div className="text-slate-400 mt-1">cron: {s.cron_expression}</div>
                <div className="mt-1">{s.active ? 'Active' : 'Inactive'}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input className="input max-w-xs" value={scheduleId} onChange={(e) => setScheduleId(e.target.value)} placeholder="Schedule ID" />
            <button className="btn-secondary" onClick={() => toggleMutation.mutate(Number(scheduleId))}>Toggle</button>
          </div>
        </div>
        <div className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">Job History / Failure Diagnostics</h2>
          <p className="text-xs text-slate-500">Select a sequence ID to inspect step-level execution logs and failure details.</p>
          <input className="input max-w-xs" value={sequenceId} onChange={(e) => setSequenceId(e.target.value)} placeholder="Sequence ID" />
          {sequenceStatus && (
            <div className="space-y-2">
              <p className="text-xs text-slate-300">Status: {sequenceStatus.status}</p>
              <div className="border border-surface-700 rounded-md p-2 max-h-56 overflow-auto">
                {sequenceStatus.step_results?.map((r) => (
                  <div key={r.id} className="text-xs text-slate-300 py-1 border-b border-surface-700/40 last:border-b-0">
                    step:{r.step_id} | {r.status} | exec:{r.execution_id ?? '-'} {r.error_message ? `| error:${r.error_message}` : ''}
                  </div>
                ))}
              </div>
              <div className="border border-surface-700 rounded-md p-2 max-h-56 overflow-auto">
                {sequenceStatus.logs?.map((l) => (
                  <div key={l.id} className="text-xs text-slate-300 py-1 border-b border-surface-700/40 last:border-b-0">
                    [{l.level}] {l.message}
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

