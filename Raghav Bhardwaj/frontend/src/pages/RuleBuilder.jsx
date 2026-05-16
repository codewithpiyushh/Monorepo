import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { enterpriseAPI } from '../api'
import toast from 'react-hot-toast'

export default function RuleBuilder() {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: '',
    template_type: 'BANK',
    profile_id: '',
    is_reusable: true,
    conditions: '{"keys":["account","reference"],"match_mode":"one_to_one"}',
    filters: '{}',
    thresholds: '{"tolerance":0,"date_window_days":2,"fuzzy_score":0.85}',
  })

  const { data: templates = [] } = useQuery({ queryKey: ['reconciliation-templates'], queryFn: enterpriseAPI.listReconciliationTemplates })
  const { data: rules = [] } = useQuery({ queryKey: ['rule-definitions'], queryFn: () => enterpriseAPI.listRuleDefinitions() })

  const createMutation = useMutation({
    mutationFn: enterpriseAPI.createRuleDefinition,
    onSuccess: () => {
      toast.success('Rule definition created')
      qc.invalidateQueries({ queryKey: ['rule-definitions'] })
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed to create rule definition'),
  })

  const deleteMutation = useMutation({
    mutationFn: enterpriseAPI.deleteRuleDefinition,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rule-definitions'] }),
  })

  const applyTemplate = (template) => {
    setForm((prev) => ({
      ...prev,
      template_type: template.template_type,
      name: template.name,
      conditions: JSON.stringify(template.conditions || {}, null, 2),
      thresholds: JSON.stringify(template.thresholds || {}, null, 2),
    }))
  }

  const createRule = () => {
    try {
      createMutation.mutate({
        name: form.name,
        template_type: form.template_type,
        profile_id: form.profile_id ? Number(form.profile_id) : null,
        is_reusable: Boolean(form.is_reusable),
        conditions: JSON.parse(form.conditions || '{}'),
        filters: JSON.parse(form.filters || '{}'),
        thresholds: JSON.parse(form.thresholds || '{}'),
      })
    } catch {
      toast.error('Invalid JSON in conditions/filters/thresholds')
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="section-header"><h1 className="text-base font-semibold text-white">Reconciliation Rule Builder</h1></div>
      <div className="p-6 grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="card p-4 space-y-2">
          <h2 className="text-sm text-slate-200 font-semibold">Templates</h2>
          <div className="space-y-2 max-h-[500px] overflow-auto">
            {templates.map((t) => (
              <button key={t.template_type} className="w-full text-left border border-surface-700 rounded-md p-2 text-xs text-slate-300 hover:border-brand-500" onClick={() => applyTemplate(t)}>
                <div className="font-semibold">{t.template_type}</div>
                <div>{t.name}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="card p-4 space-y-2">
          <h2 className="text-sm text-slate-200 font-semibold">Create Rule Definition</h2>
          <input className="input" placeholder="Rule Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input" placeholder="Template Type" value={form.template_type} onChange={(e) => setForm({ ...form, template_type: e.target.value })} />
          <input className="input" placeholder="Profile ID (optional)" value={form.profile_id} onChange={(e) => setForm({ ...form, profile_id: e.target.value })} />
          <textarea className="input min-h-[100px]" placeholder="Conditions JSON" value={form.conditions} onChange={(e) => setForm({ ...form, conditions: e.target.value })} />
          <textarea className="input min-h-[80px]" placeholder="Filters JSON" value={form.filters} onChange={(e) => setForm({ ...form, filters: e.target.value })} />
          <textarea className="input min-h-[80px]" placeholder="Thresholds JSON" value={form.thresholds} onChange={(e) => setForm({ ...form, thresholds: e.target.value })} />
          <button className="btn-primary" onClick={createRule}>Save Rule Definition</button>
        </div>

        <div className="card p-4 space-y-2">
          <h2 className="text-sm text-slate-200 font-semibold">Reusable Definitions</h2>
          <div className="space-y-2 max-h-[500px] overflow-auto">
            {rules.map((r) => (
              <div key={r.id} className="border border-surface-700 rounded-md p-2 text-xs text-slate-300">
                <div className="font-semibold">{r.name}</div>
                <div>{r.template_type}</div>
                <button className="btn-secondary py-1 px-2 text-xs mt-2" onClick={() => deleteMutation.mutate(r.id)}>Delete</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
