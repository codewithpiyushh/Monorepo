import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { enterpriseAPI } from '../api'
import toast from 'react-hot-toast'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/PageState'

const lifecycleStates = ['OPEN', 'PREPARED', 'SUBMITTED', 'REVIEWED', 'APPROVED', 'CERTIFIED', 'CLOSED', 'REOPENED', 'FORCE_CLOSED']
const frequencyOptions = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']
const riskOptions = ['LOW', 'MEDIUM', 'HIGH']

const defaultForm = {
  name: '',
  reconciliation_type: 'TRANSACTION',
  frequency: 'MONTHLY',
  tolerance_threshold: 0,
  date_window_days: 0,
  workflow_config: JSON.stringify({ requires_reviewer: true }, null, 2),
  matching_rules: JSON.stringify({ strategies: ['exact', 'tolerance', 'fuzzy'] }, null, 2),
  assigned_preparer: '',
  assigned_reviewer: '',
  assigned_approver: '',
  assigned_certifier: '',
  risk_classification: 'MEDIUM',
  due_days: 5,
}

const parseJson = (value) => {
  if (!value) return {}
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

export default function ReconciliationProfiles() {
  const qc = useQueryClient()
  const [form, setForm] = useState({ ...defaultForm })
  const [selectedProfile, setSelectedProfile] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [selectedTemplateType, setSelectedTemplateType] = useState('')

  const { data: profiles = [] } = useQuery({ queryKey: ['enterprise-profiles'], queryFn: enterpriseAPI.listProfiles })
  const { data: templates = [] } = useQuery({ queryKey: ['reconciliation-templates'], queryFn: enterpriseAPI.listReconciliationTemplates })

  const selectedProfileData = useMemo(
    () => profiles.find((profile) => String(profile.id) === String(selectedProfile)) || null,
    [profiles, selectedProfile]
  )

  useEffect(() => {
    if (!selectedProfile) {
      setForm({ ...defaultForm })
      return
    }

    if (selectedProfileData) {
      setForm({
        name: selectedProfileData.name || '',
        reconciliation_type: selectedProfileData.reconciliation_type || 'TRANSACTION',
        frequency: selectedProfileData.frequency || 'MONTHLY',
        tolerance_threshold: selectedProfileData.tolerance_threshold ?? 0,
        date_window_days: selectedProfileData.date_window_days ?? 0,
        workflow_config: JSON.stringify(
          parseJson(selectedProfileData.workflow_config || selectedProfileData.workflow_config_json || {}),
          null,
          2
        ),
        matching_rules: JSON.stringify(
          parseJson(selectedProfileData.matching_rules || selectedProfileData.matching_rules_json || {}),
          null,
          2
        ),
        assigned_preparer: selectedProfileData.assigned_preparer ? String(selectedProfileData.assigned_preparer) : '',
        assigned_reviewer: selectedProfileData.assigned_reviewer ? String(selectedProfileData.assigned_reviewer) : '',
        assigned_approver: selectedProfileData.assigned_approver ? String(selectedProfileData.assigned_approver) : '',
        assigned_certifier: selectedProfileData.assigned_certifier ? String(selectedProfileData.assigned_certifier) : '',
        risk_classification: selectedProfileData.risk_classification || 'MEDIUM',
        due_days: selectedProfileData.due_days ?? 5,
      })
    }
  }, [selectedProfile, selectedProfileData])

  useEffect(() => {
    if (selectedProfile && !selectedProfileData) {
      setSelectedProfile('')
    }
  }, [profiles, selectedProfile, selectedProfileData])

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.template_type === selectedTemplateType) || null,
    [templates, selectedTemplateType]
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
      setSelectedProfile('')
      qc.invalidateQueries({ queryKey: ['enterprise-profiles'] })
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed to delete profile'),
  })

  const resetForm = () => {
    setSelectedProfile('')
    setSelectedTemplateType('')
    setForm({ ...defaultForm })
  }

  const submit = () => {
    try {
      const payload = {
        ...form,
        tolerance_threshold: Number(form.tolerance_threshold) || 0,
        date_window_days: Number(form.date_window_days) || 0,
        workflow_config: parseJson(form.workflow_config),
        matching_rules: parseJson(form.matching_rules),
        assigned_preparer: form.assigned_preparer ? Number(form.assigned_preparer) : null,
        assigned_reviewer: form.assigned_reviewer ? Number(form.assigned_reviewer) : null,
        assigned_approver: form.assigned_approver ? Number(form.assigned_approver) : null,
        assigned_certifier: form.assigned_certifier ? Number(form.assigned_certifier) : null,
        due_days: Number(form.due_days) || 5,
      }

      if (selectedProfileData) {
        updateMutation.mutate({ id: selectedProfileData.id, payload })
      } else {
        createMutation.mutate(payload)
      }
    } catch {
      toast.error('Invalid JSON in workflow or matching config')
    }
  }

  const applyTemplate = () => {
    if (!selectedTemplate) return
    const thresholds = selectedTemplate.thresholds || {}
    setForm((state) => ({
      ...state,
      reconciliation_type: selectedTemplate.template_type,
      tolerance_threshold: Number(thresholds.tolerance ?? state.tolerance_threshold) || 0,
      date_window_days: Number(thresholds.date_window_days ?? state.date_window_days) || 0,
      matching_rules: JSON.stringify({ template: selectedTemplate.name, conditions: selectedTemplate.conditions || {}, thresholds }, null, 2),
      workflow_config: JSON.stringify({ requires_reviewer: true, template_type: selectedTemplate.template_type }, null, 2),
    }))
    toast.success(`Template applied: ${selectedTemplate.name}`)
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Reconciliation Profile Management"
        subtitle="Create and manage reconciliation profiles using templates, lifecycle controls and close workflows."
        badge={`${profiles.length} profiles`}
      />
      <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm text-slate-200 font-semibold">Profile Builder</h2>
              <p className="text-xs text-slate-400">Use a template or populate profile settings directly.</p>
            </div>
            <button className="btn-secondary text-xs" onClick={resetForm}>Start new</button>
          </div>

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
            <select className="input" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
              {frequencyOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select className="input" value={selectedTemplateType} onChange={(e) => setSelectedTemplateType(e.target.value)}>
              <option value="">Select reconciliation template</option>
              {templates.map((t) => (
                <option key={t.template_type} value={t.template_type}>
                  {t.template_type} - {t.name}
                </option>
              ))}
            </select>
            <button className="btn-secondary" onClick={applyTemplate} disabled={!selectedTemplateType}>Apply Template</button>
          </div>

          {selectedTemplate && (
            <div className="border border-surface-700 rounded-md p-3 bg-surface-900 text-xs space-y-2">
              <div className="text-slate-200 font-semibold">Template details</div>
              <div className="text-slate-400">{selectedTemplate.name}</div>
              <div className="text-slate-300">Conditions: {JSON.stringify(selectedTemplate.conditions)}</div>
              <div className="text-slate-300">Thresholds: {JSON.stringify(selectedTemplate.thresholds)}</div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="Tolerance" value={form.tolerance_threshold} onChange={(e) => setForm({ ...form, tolerance_threshold: e.target.value })} />
            <input className="input" placeholder="Date window days" value={form.date_window_days} onChange={(e) => setForm({ ...form, date_window_days: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select className="input" value={form.risk_classification} onChange={(e) => setForm({ ...form, risk_classification: e.target.value })}>
              {riskOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <input className="input" placeholder="Due days" value={form.due_days} onChange={(e) => setForm({ ...form, due_days: e.target.value })} />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-slate-400">Advanced settings are hidden by default for a cleaner layout.</div>
            <button className="btn-secondary text-xs" onClick={() => setShowAdvanced((prev) => !prev)}>
              {showAdvanced ? 'Hide advanced' : 'Show advanced'}
            </button>
          </div>

          {showAdvanced && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <input className="input" placeholder="Preparer user id" value={form.assigned_preparer} onChange={(e) => setForm({ ...form, assigned_preparer: e.target.value })} />
                <input className="input" placeholder="Reviewer user id" value={form.assigned_reviewer} onChange={(e) => setForm({ ...form, assigned_reviewer: e.target.value })} />
                <input className="input" placeholder="Approver user id" value={form.assigned_approver} onChange={(e) => setForm({ ...form, assigned_approver: e.target.value })} />
                <input className="input" placeholder="Certifier user id" value={form.assigned_certifier} onChange={(e) => setForm({ ...form, assigned_certifier: e.target.value })} />
              </div>
              <textarea className="input min-h-[88px]" placeholder="Workflow config JSON" value={form.workflow_config} onChange={(e) => setForm({ ...form, workflow_config: e.target.value })} />
              <textarea className="input min-h-[88px]" placeholder="Matching rules JSON" value={form.matching_rules} onChange={(e) => setForm({ ...form, matching_rules: e.target.value })} />
            </div>
          )}

          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={submit}>
              {selectedProfileData ? 'Update Profile' : 'Create Profile'}
            </button>
            {selectedProfileData && (
            <button className="btn-secondary flex-1" onClick={resetForm}>New Profile</button>
          )}
          </div>
        </div>

        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm text-slate-200 font-semibold">Profiles & Lifecycle</h2>
              <p className="text-xs text-slate-400">Select a profile to view details, edit settings or manage workflow.</p>
            </div>
          </div>
          <div className="space-y-2">
            {profiles.length > 0 ? (
              profiles.map((p) => (
                <div key={p.id} className={`border rounded-md p-3 ${String(p.id) === String(selectedProfile) ? 'border-brand-500 bg-surface-800' : 'border-surface-700'}`}>
                  <div className="text-sm text-slate-200 font-semibold">{p.name}</div>
                  <div className="text-xs text-slate-400">{p.reconciliation_type} · {p.frequency} · {p.risk_classification}</div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button className="btn-secondary py-1 px-2 text-xs" onClick={() => setSelectedProfile(String(p.id))}>Edit</button>
                    <button className="btn-secondary py-1 px-2 text-xs" onClick={() => deleteMutation.mutate(p.id)}>Delete</button>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                title="No profiles yet"
                description="Create a reconciliation profile using the form on the left."
              />
            )}
          </div>
        </div>

        <div className="card p-4 space-y-3">
          <h2 className="text-sm text-slate-200 font-semibold">Selected Profile</h2>
          {selectedProfileData ? (
            <div className="space-y-2 text-xs text-slate-300">
              <div><span className="text-slate-400">Name:</span> {selectedProfileData.name}</div>
              <div><span className="text-slate-400">Type:</span> {selectedProfileData.reconciliation_type}</div>
              <div><span className="text-slate-400">Frequency:</span> {selectedProfileData.frequency}</div>
              <div><span className="text-slate-400">Risk:</span> {selectedProfileData.risk_classification}</div>
              <div><span className="text-slate-400">Due days:</span> {selectedProfileData.due_days ?? '-'}</div>
              <div className="text-slate-300">Assigned P:{selectedProfileData.assigned_preparer || '-'} R:{selectedProfileData.assigned_reviewer || '-'} A:{selectedProfileData.assigned_approver || '-'} C:{selectedProfileData.assigned_certifier || '-'}</div>
            </div>
          ) : (
            <EmptyState title="No profile selected" description="Pick a profile to review or edit it." />
          )}
        </div>
      </div>
    </div>
  )
}
