import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { enterpriseAPI } from '../api'
import toast from 'react-hot-toast'

export default function Schedules() {
  const qc = useQueryClient()
  const [profileId, setProfileId] = useState('')
  const [form, setForm] = useState({
    cycle_type: 'MONTHLY',
    period_key: '',
    start_date: '',
    end_date: '',
    due_date: '',
  })

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['close-calendar', profileId],
    queryFn: () => enterpriseAPI.listCloseCalendar(profileId || undefined),
  })

  const createMutation = useMutation({
    mutationFn: enterpriseAPI.createCloseCalendar,
    onSuccess: () => {
      toast.success('Close period created')
      qc.invalidateQueries({ queryKey: ['close-calendar'] })
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed to create close period'),
  })

  const lockMutation = useMutation({
    mutationFn: enterpriseAPI.lockClosePeriod,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['close-calendar'] }),
  })
  const unlockMutation = useMutation({
    mutationFn: enterpriseAPI.unlockClosePeriod,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['close-calendar'] }),
  })

  return (
    <div className="h-full flex flex-col">
      <div className="section-header">
        <h1 className="text-base font-semibold text-white">Financial Period Close Calendar</h1>
      </div>
      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">Create Close Cycle</h2>
          <input className="input" value={profileId} onChange={(e) => setProfileId(e.target.value)} placeholder="Profile ID" />
          <select className="input" value={form.cycle_type} onChange={(e) => setForm({ ...form, cycle_type: e.target.value })}>
            <option value="MONTHLY">MONTHLY</option>
            <option value="QUARTERLY">QUARTERLY</option>
            <option value="YEARLY">YEARLY</option>
          </select>
          <input className="input" value={form.period_key} onChange={(e) => setForm({ ...form, period_key: e.target.value })} placeholder="Period key" />
          <input className="input" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          <input className="input" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          <input className="input" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          <button
            className="btn-primary"
            onClick={() => createMutation.mutate({ ...form, profile_id: Number(profileId) })}
            disabled={!profileId}
          >
            Create Period
          </button>
        </div>
        <div className="card p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-200 mb-3">Close Calendar Periods</h2>
          {isLoading ? <p className="text-xs text-slate-500">Loading...</p> : (
            <div className="space-y-2 max-h-[500px] overflow-auto">
              {rows.map((r) => (
                <div key={r.id} className="border border-surface-700 rounded-md p-3 text-xs text-slate-300">
                  #{r.id} | profile:{r.profile_id} | {r.cycle_type} | {r.period_key} | due:{r.due_date}
                  <div className="text-slate-400 mt-1">status:{r.status} | locked:{r.is_locked ? 'yes' : 'no'}</div>
                  <div className="flex gap-2 mt-2">
                    <button className="btn-secondary py-1 px-2 text-xs" onClick={() => lockMutation.mutate(r.id)}>Lock</button>
                    <button className="btn-secondary py-1 px-2 text-xs" onClick={() => unlockMutation.mutate(r.id)}>Unlock</button>
                  </div>
                </div>
              ))}
              {rows.length === 0 && <p className="text-xs text-slate-500">No close periods yet.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
