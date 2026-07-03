import { useState, useEffect } from 'react'
import { rulesAPI, datasetsAPI } from '../api'
import toast from 'react-hot-toast'
import { Plus, Trash2, ToggleLeft, ToggleRight, Settings2, AlertCircle } from 'lucide-react'
import clsx from 'clsx'

const ARCS_MATCH_TYPES = [
  { value: '1-to-1', label: '1 to 1' },
  { value: '1-to-M', label: '1 to Many' },
  { value: 'M-to-1', label: 'Many to 1' },
  { value: 'M-to-M', label: 'Many to Many' },
]

const CONDITION_TYPES = [
  { value: 'exact', label: 'Exact Match' },
  { value: 'tolerance', label: 'Tolerance' },
  { value: 'fuzzy', label: 'Fuzzy / String' },
  { value: 'date_diff', label: 'Date Difference' },
]

function RuleForm({ rule, srcCols, onSave, onCancel }) {
  const [form, setForm] = useState(
    rule || {
      name: '',
      rule_type: 'exact',
      is_active: true,
      config: {
        arcs_match_type: '1-to-1',
        source_column: srcCols[0] || '',
        threshold: 0,
        tolerance_type: 'absolute',
        date_format: '%Y-%m-%d',
      },
    }
  )
  const [saving, setSaving] = useState(false)

  const setConfig = (key, value) =>
    setForm((current) => ({
      ...current,
      config: { ...current.config, [key]: value },
    }))

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('Rule name is required')
      return
    }

    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-surface-900 border border-surface-600 rounded-xl p-4 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Rule Name</label>
          <input
            className="input"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="e.g. Amount Tolerance 5%"
          />
        </div>
        <div>
          <label className="label">Match Type</label>
          <select
            className="input"
            value={form.config.arcs_match_type || '1-to-1'}
            onChange={(event) => setConfig('arcs_match_type', event.target.value)}
          >
            {ARCS_MATCH_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="pt-2 pb-1 border-b border-surface-600">
        <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Primary Condition</h4>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Condition Type</label>
          <select
            className="input"
            value={form.rule_type}
            onChange={(event) => setForm({ ...form, rule_type: event.target.value })}
          >
            {CONDITION_TYPES.map((ruleType) => (
              <option key={ruleType.value} value={ruleType.value}>
                {ruleType.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Source Column</label>
          <select
            className="input"
            value={form.config.source_column || ''}
            onChange={(event) => setConfig('source_column', event.target.value)}
          >
            {srcCols.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
        </div>

        {form.rule_type === 'tolerance' && (
          <>
            <div>
              <label className="label">Tolerance Type</label>
              <select
                className="input"
                value={form.config.tolerance_type || 'absolute'}
                onChange={(event) => setConfig('tolerance_type', event.target.value)}
              >
                <option value="absolute">Absolute Value</option>
                <option value="percentage">Percentage (%)</option>
              </select>
            </div>
            <div>
              <label className="label">
                Threshold{form.config.tolerance_type === 'percentage' ? ' (%)' : ''}
              </label>
              <input
                className="input"
                type="number"
                step="0.01"
                min="0"
                value={form.config.threshold ?? 0}
                onChange={(event) => setConfig('threshold', parseFloat(event.target.value))}
              />
            </div>
          </>
        )}

        {form.rule_type === 'fuzzy' && (
          <div>
            <label className="label">Min Similarity (0-1)</label>
            <input
              className="input"
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={form.config.threshold ?? 0.8}
              onChange={(event) => setConfig('threshold', parseFloat(event.target.value))}
            />
          </div>
        )}

        {form.rule_type === 'date_diff' && (
          <>
            <div>
              <label className="label">Max Days Diff</label>
              <input
                className="input"
                type="number"
                min="0"
                value={form.config.threshold ?? 0}
                onChange={(event) => setConfig('threshold', parseInt(event.target.value, 10))}
              />
            </div>
            <div>
              <label className="label">Date Format</label>
              <input
                className="input"
                value={form.config.date_format || '%Y-%m-%d'}
                onChange={(event) => setConfig('date_format', event.target.value)}
                placeholder="%Y-%m-%d"
              />
            </div>
          </>
        )}
      </div>

      <div className="pt-2 flex justify-start">
        <button
          type="button"
          className="btn-secondary text-xs py-1 h-7 border-dashed border-surface-500"
          onClick={() => toast('Multi-condition rules (AND/OR logic) will be supported in v2')}
        >
          <Plus className="w-3 h-3" /> Add Additional Condition
        </button>
      </div>

      <div className="flex items-center justify-between pt-1">
        <label className="flex items-center gap-2 cursor-pointer">
          <button type="button" onClick={() => setForm({ ...form, is_active: !form.is_active })}>
            {form.is_active ? (
              <ToggleRight className="w-5 h-5 text-slate-300" />
            ) : (
              <ToggleLeft className="w-5 h-5 text-slate-500" />
            )}
          </button>
          <span className="text-xs text-slate-400">{form.is_active ? 'Active' : 'Inactive'}</span>
        </label>
        <div className="flex gap-2">
          <button className="btn-secondary text-xs py-1.5" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn-primary text-xs py-1.5" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : 'Save Rule'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function RulesStep({ project, datasets, onNext }) {
  const [rules, setRules] = useState([])
  const [srcCols, setSrcCols] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editRule, setEditRule] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [project.id, datasets.source?.id])

  const loadData = async () => {
    setLoading(true)
    try {
      const [existingRules, srcPreview] = await Promise.all([
        rulesAPI.list(project.id),
        datasetsAPI.preview(project.id, datasets.source.id, 1),
      ])
      setRules(existingRules)
      setSrcCols(srcPreview.columns)
    } catch {
      toast.error('Failed to load rules')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (form) => {
    try {
      if (editRule) {
        const updated = await rulesAPI.update(project.id, editRule.id, {
          name: form.name,
          rule_type: form.rule_type,
          config: form.config,
          is_active: form.is_active,
        })
        setRules(rules.map((rule) => (rule.id === editRule.id ? updated : rule)))
        toast.success('Rule updated')
      } else {
        const created = await rulesAPI.create(project.id, form)
        setRules([...rules, created])
        toast.success('Rule created')
      }
      setShowForm(false)
      setEditRule(null)
    } catch {
      toast.error('Failed to save rule')
    }
  }

  const handleDelete = async (ruleId) => {
    try {
      await rulesAPI.delete(project.id, ruleId)
      setRules(rules.filter((rule) => rule.id !== ruleId))
      toast.success('Rule deleted')
    } catch {
      toast.error('Failed to delete rule')
    }
  }

  const toggleActive = async (rule) => {
    try {
      const updated = await rulesAPI.update(project.id, rule.id, {
        is_active: !rule.is_active,
      })
      setRules(rules.map((existingRule) => (existingRule.id === rule.id ? updated : existingRule)))
    } catch {
      toast.error('Failed to toggle rule')
    }
  }

  const getMatchTypeBadge = (type) => {
    const colors = {
      '1-to-1': 'bg-emerald-500 text-white shadow-sm',
      '1-to-M': 'bg-indigo-500 text-white shadow-sm',
      'M-to-1': 'bg-indigo-500 text-white shadow-sm',
      'M-to-M': 'bg-amber-500 text-white shadow-sm',
    }
    return colors[type] || 'bg-slate-500 text-white shadow-sm'
  }

  const parseConfig = (configStr) => {
    try {
      return JSON.parse(configStr)
    } catch {
      return {}
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-5 flex flex-col flex-1 min-h-0 gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">
          Define matching rules per column. Rules determine how source and target values are compared.
        </p>
        <button
          className="btn-primary text-xs"
          onClick={() => {
            setShowForm(true)
            setEditRule(null)
          }}
        >
          <Plus className="w-3.5 h-3.5" />
          Add Rule
        </button>
      </div>

      {showForm && !editRule && (
        <RuleForm
          srcCols={srcCols}
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
        />
      )}

      {rules.length === 0 && !showForm && (
        <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
          <Settings2 className="w-10 h-10 text-slate-600" />
          <p className="text-sm text-slate-400">No rules defined yet.</p>
          <p className="text-xs text-slate-500">
            Rules are optional - without rules, all mapped columns use exact matching.
          </p>
        </div>
      )}

      <div className="space-y-2 flex-1 overflow-y-auto pr-1 min-h-0">
        {rules.map((rule) => {
          const config = parseConfig(rule.config)
          return editRule?.id === rule.id ? (
            <RuleForm
              key={rule.id}
              rule={{ ...rule, config }}
              srcCols={srcCols}
              onSave={handleSave}
              onCancel={() => setEditRule(null)}
            />
          ) : (
            <div
              key={rule.id}
              className={clsx(
                'flex items-center gap-3 p-2.5 rounded-lg border transition-colors',
                rule.is_active
                  ? 'border-surface-700 bg-surface-900/30'
                  : 'border-surface-700/50 bg-surface-900/10 opacity-60'
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-200">{rule.name}</span>
                  <span
                    className={clsx(
                      'text-[10px] font-bold px-1.5 py-0.5 rounded uppercase',
                      getMatchTypeBadge(config.arcs_match_type)
                    )}
                  >
                    {config.arcs_match_type || '1-to-1'}
                  </span>
                  <span className="text-[10px] text-slate-400 px-1 bg-surface-800 rounded">
                    {rule.rule_type}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Primary Condition: <span className="text-slate-400">{config.source_column}</span>
                  {config.threshold !== undefined && (
                    <>
                      {' '}
                      | Threshold:{' '}
                      <span className="text-slate-400">
                        {config.threshold}
                        {config.tolerance_type === 'percentage' ? '%' : ''}
                      </span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => toggleActive(rule)} className="btn-ghost p-1.5">
                  {rule.is_active ? (
                    <ToggleRight className="w-4 h-4 text-slate-300" />
                  ) : (
                    <ToggleLeft className="w-4 h-4 text-slate-500" />
                  )}
                </button>
                <button
                  onClick={() => {
                    setEditRule(rule)
                    setShowForm(false)
                  }}
                  className="btn-ghost p-1.5"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(rule.id)}
                  className="btn-ghost p-1.5 hover:text-red-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {rules.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-slate-400 bg-surface-700/30 border border-surface-700/50 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
          Proceeding without rules - all columns will use exact matching.
        </div>
      )}

      <div className="flex justify-end pt-2 mt-auto">
        <button className="btn-primary" onClick={onNext}>
          Continue to Execute
        </button>
      </div>
    </div>
  )
}
