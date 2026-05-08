import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { enterpriseAPI } from '../api'
import toast from 'react-hot-toast'

export default function ReconciliationProfiles() {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: '',
    reconciliation_type: 'TRANSACTION',
    frequency: 'MONTHLY',
    tolerance_threshold: 0,
    date_window_days: 0,
    workflow_config: '{"requires_reviewer":true}',
    matching_rules: '{"strategies":["exact","tolerance","fuzzy"]}',
    assigned_preparer: '',
    assigned_reviewer: '',
  })

  const { data: profiles = [] } = useQuery({ queryKey: ['enterprise-profiles'], queryFn: enterpriseAPI.listProfiles })
  const createMutation = useMutation({
    mutationFn: enterpriseAPI.createProfile,
    onSuccess: () => {
      toast.success('Profile created')
      qc.invalidateQueries(['enterprise-profiles'])
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed to create profile'),
  })

  const submit = () => {
    try {
      createMutation.mutate({
        ...form,
        tolerance_threshold: Number(form.tolerance_threshold) || 0,
        date_window_days: Number(form.date_window_days) || 0,
        workflow_config: JSON.parse(form.workflow_config || '{}'),
        matching_rules: JSON.parse(form.matching_rules || '{}'),
        assigned_preparer: form.assigned_preparer ? Number(form.assigned_preparer) : null,
        assigned_reviewer: form.assigned_reviewer ? Number(form.assigned_reviewer) : null,
      })
    } catch {
      toast.error('Invalid JSON in workflow/matching config')
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="section-header"><h1 className="text-base font-semibold text-white">Reconciliation Profile Management</h1></div>
      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4 space-y-2">
          <input className="input" placeholder="Profile Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="Type" value={form.reconciliation_type} onChange={(e) => setForm({ ...form, reconciliation_type: e.target.value })} />
            <input className="input" placeholder="Frequency" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="Tolerance" value={form.tolerance_threshold} onChange={(e) => setForm({ ...form, tolerance_threshold: e.target.value })} />
            <input className="input" placeholder="Date window days" value={form.date_window_days} onChange={(e) => setForm({ ...form, date_window_days: e.target.value })} />
          </div>
          <textarea className="input min-h-[72px]" placeholder="Workflow config JSON" value={form.workflow_config} onChange={(e) => setForm({ ...form, workflow_config: e.target.value })} />
          <textarea className="input min-h-[72px]" placeholder="Matching rules JSON" value={form.matching_rules} onChange={(e) => setForm({ ...form, matching_rules: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="Preparer user id" value={form.assigned_preparer} onChange={(e) => setForm({ ...form, assigned_preparer: e.target.value })} />
            <input className="input" placeholder="Reviewer user id" value={form.assigned_reviewer} onChange={(e) => setForm({ ...form, assigned_reviewer: e.target.value })} />
          </div>
          <button className="btn-primary" onClick={submit}>Create Profile</button>
        </div>
        <div className="card p-4">
          <h2 className="text-sm text-slate-200 font-semibold mb-2">Profiles</h2>
          <div className="space-y-2 max-h-[520px] overflow-auto">
            {profiles.map((p) => (
              <div key={p.id} className="border border-surface-700 rounded-md p-3">
                <div className="text-sm text-slate-200">{p.name}</div>
                <div className="text-xs text-slate-400 mt-1">{p.reconciliation_type} | {p.frequency} | tol {p.tolerance_threshold}</div>
              </div>
            ))}
            {profiles.length === 0 && <p className="text-xs text-slate-500">No profiles created yet.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

