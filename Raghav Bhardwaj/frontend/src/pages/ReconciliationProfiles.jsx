import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { enterpriseAPI } from '../api'
import toast from 'react-hot-toast'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/PageState'

const lifecycleStates = ['OPEN', 'PREPARED', 'SUBMITTED', 'REVIEWED', 'APPROVED', 'CERTIFIED', 'CLOSED', 'REOPENED', 'FORCE_CLOSED']

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
    assigned_approver: '',
    assigned_certifier: '',
    risk_classification: 'MEDIUM',
    due_days: 5,
  })
  const [selectedProfile, setSelectedProfile] = useState('')
  const [calendarForm, setCalendarForm] = useState({
    cycle_type: 'MONTHLY',
    period_key: '',
    start_date: '',
    end_date: '',
    due_date: '',
  })
  const [certForm, setCertForm] = useState({ workflow_id: '', action: 'PREPARE', comments: '' })
  const [selectedTemplateType, setSelectedTemplateType] = useState('')

  const { data: profiles = [] } = useQuery({ queryKey: ['enterprise-profiles'], queryFn: enterpriseAPI.listProfiles })
  const { data: templates = [] } = useQuery({ queryKey: ['reconciliation-templates'], queryFn: enterpriseAPI.listReconciliationTemplates })
  const { data: calendars = [] } = useQuery({
    queryKey: ['enterprise-close-calendar', selectedProfile],
    queryFn: () => enterpriseAPI.listCloseCalendar(selectedProfile || undefined),
  })
  const { data: workflows = [] } = useQuery({
    queryKey: ['enterprise-cert-workflows', selectedProfile],
    queryFn: () => enterpriseAPI.listCertificationWorkflows(selectedProfile || undefined),
  })

  const selectedWorkflow = useMemo(
    () => workflows.find((w) => String(w.id) === String(certForm.workflow_id)),
    [workflows, certForm.workflow_id]
  )

  const createMutation = useMutation({
    mutationFn: enterpriseAPI.createProfile,
    onSuccess: () => {
      toast.success('Profile created')
      qc.invalidateQueries({ queryKey: ['enterprise-profiles'] })
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed to create profile'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => enterpriseAPI.updateProfile(id, payload),
    onSuccess: () => {
      toast.success('Profile updated')
      qc.invalidateQueries({ queryKey: ['enterprise-profiles'] })
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed to update profile'),
  })

  const deleteMutation = useMutation({
    mutationFn: enterpriseAPI.deleteProfile,
    onSuccess: () => {
      toast.success('Profile deleted')
      qc.invalidateQueries({ queryKey: ['enterprise-profiles'] })
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed to delete profile'),
  })

  const createCalendarMutation = useMutation({
    mutationFn: enterpriseAPI.createCloseCalendar,
    onSuccess: () => {
      toast.success('Close calendar period created')
      qc.invalidateQueries({ queryKey: ['enterprise-close-calendar'] })
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed to create close period'),
  })

  const lockMutation = useMutation({
    mutationFn: enterpriseAPI.lockClosePeriod,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['enterprise-close-calendar'] }),
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed to lock period'),
  })
  const unlockMutation = useMutation({
    mutationFn: enterpriseAPI.unlockClosePeriod,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['enterprise-close-calendar'] }),
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed to unlock period'),
  })

  const createCertWorkflowMutation = useMutation({
    mutationFn: enterpriseAPI.createCertificationWorkflow,
    onSuccess: () => {
      toast.success('Certification workflow created')
      qc.invalidateQueries({ queryKey: ['enterprise-cert-workflows'] })
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed to create workflow'),
  })

  const actionCertMutation = useMutation({
    mutationFn: enterpriseAPI.actionCertificationWorkflow,
    onSuccess: () => {
      toast.success('Workflow action applied')
      qc.invalidateQueries({ queryKey: ['enterprise-cert-workflows'] })
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Action failed'),
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
        assigned_approver: form.assigned_approver ? Number(form.assigned_approver) : null,
        assigned_certifier: form.assigned_certifier ? Number(form.assigned_certifier) : null,
        due_days: Number(form.due_days) || 5,
      })
    } catch {
      toast.error('Invalid JSON in workflow/matching config')
    }
  }

  const applyTemplate = () => {
    const t = templates.find((row) => row.template_type === selectedTemplateType)
    if (!t) return
    const templateThresholds = t.thresholds || {}
    const inferredTolerance = Number(templateThresholds.tolerance ?? form.tolerance_threshold ?? 0) || 0
    const inferredDateWindow = Number(templateThresholds.date_window_days ?? form.date_window_days ?? 0) || 0
    setForm((state) => ({
      ...state,
      reconciliation_type: t.template_type,
      tolerance_threshold: inferredTolerance,
      date_window_days: inferredDateWindow,
      matching_rules: JSON.stringify({ template: t.name, conditions: t.conditions || {}, thresholds: t.thresholds || {} }, null, 2),
      workflow_config: JSON.stringify({ requires_reviewer: true, template_type: t.template_type }, null, 2),
    }))
    toast.success(`Template applied: ${t.name}`)
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Reconciliation Profile Management"
        subtitle="Manage lifecycle profiles, close calendars, and certification workflow transitions."
        badge={`${profiles.length} profiles`}
      />
      <div className="p-6 grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="card p-4 space-y-2">
          <input className="input" placeholder="Profile Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <select className="input" value={form.reconciliation_type} onChange={(e) => setForm({ ...form, reconciliation_type: e.target.value })}>
              <option value="TRANSACTION">TRANSACTION</option>
              <option value="BALANCE_SHEET">BALANCE_SHEET</option>
              <option value="INTERCOMPANY">INTERCOMPANY</option>
              <option value="BANK">BANK</option>
              <option value="PAYROLL">PAYROLL</option>
              <option value="VENDOR">VENDOR</option>
              <option value="SUSPENSE">SUSPENSE</option>
              <option value="CLEARING">CLEARING</option>
              <option value="ACCRUAL">ACCRUAL</option>
            </select>
            <input className="input" placeholder="Frequency" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select className="input" value={selectedTemplateType} onChange={(e) => setSelectedTemplateType(e.target.value)}>
              <option value="">Select template</option>
              {templates.map((t) => <option key={t.template_type} value={t.template_type}>{t.template_type} - {t.name}</option>)}
            </select>
            <button className="btn-secondary" onClick={applyTemplate} disabled={!selectedTemplateType}>Apply Template</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="Tolerance" value={form.tolerance_threshold} onChange={(e) => setForm({ ...form, tolerance_threshold: e.target.value })} />
            <input className="input" placeholder="Date window days" value={form.date_window_days} onChange={(e) => setForm({ ...form, date_window_days: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="Risk LOW/MEDIUM/HIGH" value={form.risk_classification} onChange={(e) => setForm({ ...form, risk_classification: e.target.value })} />
            <input className="input" placeholder="Due days" value={form.due_days} onChange={(e) => setForm({ ...form, due_days: e.target.value })} />
          </div>
          <textarea className="input min-h-[68px]" placeholder="Workflow config JSON" value={form.workflow_config} onChange={(e) => setForm({ ...form, workflow_config: e.target.value })} />
          <textarea className="input min-h-[68px]" placeholder="Matching rules JSON" value={form.matching_rules} onChange={(e) => setForm({ ...form, matching_rules: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="Preparer user id" value={form.assigned_preparer} onChange={(e) => setForm({ ...form, assigned_preparer: e.target.value })} />
            <input className="input" placeholder="Reviewer user id" value={form.assigned_reviewer} onChange={(e) => setForm({ ...form, assigned_reviewer: e.target.value })} />
            <input className="input" placeholder="Approver user id" value={form.assigned_approver} onChange={(e) => setForm({ ...form, assigned_approver: e.target.value })} />
            <input className="input" placeholder="Certifier user id" value={form.assigned_certifier} onChange={(e) => setForm({ ...form, assigned_certifier: e.target.value })} />
          </div>
          <button className="btn-primary" onClick={submit}>Create Profile</button>
        </div>

        <div className="card p-4 space-y-2">
          <h2 className="text-sm text-slate-200 font-semibold">Profiles & Lifecycle</h2>
          <div className="space-y-2 max-h-[520px] overflow-auto">
            {profiles.map((p) => (
              <div key={p.id} className="border border-surface-700 rounded-md p-3 space-y-2">
                <div className="text-sm text-slate-200">{p.name}</div>
                <div className="text-xs text-slate-400">{p.reconciliation_type} | {p.frequency} | risk {p.risk_classification}</div>
                <div className="flex gap-2">
                  <button className="btn-secondary py-1 px-2 text-xs" onClick={() => setSelectedProfile(String(p.id))}>Select</button>
                  <select
                    className="input py-1 text-xs"
                    value={p.lifecycle_state || 'OPEN'}
                    onChange={(e) => updateMutation.mutate({ id: p.id, payload: { lifecycle_state: e.target.value } })}
                  >
                    {lifecycleStates.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button className="btn-secondary py-1 px-2 text-xs" onClick={() => deleteMutation.mutate(p.id)}>Delete</button>
                </div>
              </div>
            ))}
            {profiles.length === 0 && (
              <EmptyState
                title="No profiles created yet"
                description="Create a profile to define lifecycle controls, risk class, and ownership."
              />
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-4 space-y-2">
            <h2 className="text-sm text-slate-200 font-semibold">Financial Close Calendar</h2>
            <input className="input" placeholder="Selected Profile ID" value={selectedProfile} onChange={(e) => setSelectedProfile(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <select className="input" value={calendarForm.cycle_type} onChange={(e) => setCalendarForm({ ...calendarForm, cycle_type: e.target.value })}>
                <option value="MONTHLY">MONTHLY</option>
                <option value="QUARTERLY">QUARTERLY</option>
                <option value="YEARLY">YEARLY</option>
              </select>
              <input className="input" placeholder="Period key (2026-05)" value={calendarForm.period_key} onChange={(e) => setCalendarForm({ ...calendarForm, period_key: e.target.value })} />
              <input className="input" type="date" value={calendarForm.start_date} onChange={(e) => setCalendarForm({ ...calendarForm, start_date: e.target.value })} />
              <input className="input" type="date" value={calendarForm.end_date} onChange={(e) => setCalendarForm({ ...calendarForm, end_date: e.target.value })} />
            </div>
            <input className="input" type="date" value={calendarForm.due_date} onChange={(e) => setCalendarForm({ ...calendarForm, due_date: e.target.value })} />
            <button
              className="btn-primary"
              onClick={() => createCalendarMutation.mutate({ ...calendarForm, profile_id: Number(selectedProfile) })}
              disabled={!selectedProfile}
            >
              Create Close Period
            </button>
            <div className="space-y-2 max-h-40 overflow-auto">
              {calendars.map((c) => (
                <div key={c.id} className="border border-surface-700 rounded-md p-2 text-xs text-slate-300">
                  #{c.id} {c.period_key} | {c.cycle_type} | {c.status} | {c.is_locked ? 'LOCKED' : 'UNLOCKED'}
                  <div className="flex gap-2 mt-1">
                    <button className="btn-secondary py-1 px-2 text-xs" onClick={() => lockMutation.mutate(c.id)}>Lock</button>
                    <button className="btn-secondary py-1 px-2 text-xs" onClick={() => unlockMutation.mutate(c.id)}>Unlock</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-4 space-y-2">
            <h2 className="text-sm text-slate-200 font-semibold">Certification Workflow</h2>
            <button
              className="btn-primary"
              disabled={!selectedProfile}
              onClick={() => createCertWorkflowMutation.mutate({ profile_id: Number(selectedProfile) })}
            >
              Create Workflow
            </button>
            <select className="input" value={certForm.workflow_id} onChange={(e) => setCertForm({ ...certForm, workflow_id: e.target.value })}>
              <option value="">Select Workflow</option>
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>#{w.id} | {w.status} | {w.current_stage}</option>
              ))}
            </select>
            <select className="input" value={certForm.action} onChange={(e) => setCertForm({ ...certForm, action: e.target.value })}>
              <option value="PREPARE">PREPARE</option>
              <option value="SUBMIT">SUBMIT</option>
              <option value="REVIEW">REVIEW</option>
              <option value="APPROVE">APPROVE</option>
              <option value="CERTIFY">CERTIFY</option>
              <option value="CLOSE">CLOSE</option>
              <option value="REOPEN">REOPEN</option>
              <option value="FORCE_CLOSE">FORCE_CLOSE</option>
            </select>
            <textarea className="input min-h-[60px]" placeholder="Comments" value={certForm.comments} onChange={(e) => setCertForm({ ...certForm, comments: e.target.value })} />
            <button
              className="btn-secondary"
              disabled={!certForm.workflow_id}
              onClick={() => actionCertMutation.mutate({ workflow_id: Number(certForm.workflow_id), action: certForm.action, comments: certForm.comments })}
            >
              Apply Action
            </button>
            {selectedWorkflow && <p className="text-xs text-slate-300">Current Status: {selectedWorkflow.status} | Stage: {selectedWorkflow.current_stage}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
