import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { enterpriseAPI } from '../api'
import toast from 'react-hot-toast'
import PageHeader from '../components/ui/PageHeader'
import { LoadingState, EmptyState } from '../components/ui/PageState'
import {
  Plus, Trash2, Play, Code2, Settings2, BookOpen, ChevronRight,
  Shield, Zap, GitBranch, SlidersHorizontal, Check,
} from 'lucide-react'

const TEMPLATE_ICONS = {
  BANK: Shield,
  GL: Zap,
  INTERCO: GitBranch,
  DEFAULT: SlidersHorizontal,
}

const RULE_TABS = [
  { id: 'conditions', label: 'Match Conditions' },
  { id: 'thresholds', label: 'Tolerances' },
  { id: 'filters',    label: 'Filters' },
]

function JsonEditor({ label, value, onChange, rows = 5 }) {
  const [error, setError] = useState(null)

  const handleChange = (v) => {
    onChange(v)
    try { JSON.parse(v); setError(null) } catch { setError('Invalid JSON') }
  }

  return (
    <div className="field-group">
      <label className="label">{label}</label>
      <textarea
        className={`input ${error ? 'input-error' : ''}`}
        rows={rows}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11.5, minHeight: rows * 22 }}
      />
      {error ? (
        <p className="field-error">{error}</p>
      ) : (
        <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 2 }}>Valid JSON</p>
      )}
    </div>
  )
}

export default function RuleBuilder() {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState('conditions')
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [form, setForm] = useState({
    name: '',
    template_type: 'BANK',
    profile_id: '',
    is_reusable: true,
    conditions: JSON.stringify({ keys: ['account', 'reference'], match_mode: 'one_to_one' }, null, 2),
    filters: JSON.stringify({}, null, 2),
    thresholds: JSON.stringify({ tolerance: 0, date_window_days: 2, fuzzy_score: 0.85 }, null, 2),
  })

  const { data: templates = [], isLoading: tplLoading } = useQuery({
    queryKey: ['reconciliation-templates'],
    queryFn: enterpriseAPI.listReconciliationTemplates,
  })
  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ['rule-definitions'],
    queryFn: () => enterpriseAPI.listRuleDefinitions(),
  })

  const createMutation = useMutation({
    mutationFn: enterpriseAPI.createRuleDefinition,
    onSuccess: () => {
      toast.success('Rule definition saved')
      qc.invalidateQueries({ queryKey: ['rule-definitions'] })
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed to save rule'),
  })

  const deleteMutation = useMutation({
    mutationFn: enterpriseAPI.deleteRuleDefinition,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rule-definitions'] }),
  })

  const applyTemplate = (t) => {
    setSelectedTemplate(t.template_type)
    setForm((prev) => ({
      ...prev,
      template_type: t.template_type,
      name: t.name || prev.name,
      conditions: JSON.stringify(t.conditions || {}, null, 2),
      thresholds: JSON.stringify(t.thresholds || {}, null, 2),
    }))
    toast.success(`Template "${t.template_type}" applied`)
  }

  const saveRule = () => {
    if (!form.name.trim()) { toast.error('Rule name is required'); return }
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
    } catch { toast.error('Invalid JSON in one of the fields') }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title="Rule Builder"
        subtitle="Define match conditions, tolerances, and filters for reconciliation workflows."
        actions={
          <button className="btn-primary" onClick={saveRule} disabled={createMutation.isPending}>
            <Plus style={{ width: 13, height: 13 }} />
            {createMutation.isPending ? 'Saving…' : 'Save Rule'}
          </button>
        }
      />

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '220px 1fr 260px', overflow: 'hidden' }}>

        {/* ── Left: Templates ──────────────────────── */}
        <div className="three-pane-nav" style={{ padding: 12 }}>
          <p className="nav-section-label" style={{ paddingLeft: 4, marginBottom: 8 }}>Templates</p>
          {tplLoading ? <LoadingState message="Loading…" /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {templates.map((t) => {
                const Icon = TEMPLATE_ICONS[t.template_type] || TEMPLATE_ICONS.DEFAULT
                const isActive = selectedTemplate === t.template_type
                return (
                  <button
                    key={t.template_type}
                    className={`rule-template-card ${isActive ? 'active' : ''}`}
                    onClick={() => applyTemplate(t)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: 'var(--r-sm)',
                        background: isActive ? 'var(--accent-subtle)' : 'var(--surface-4)',
                        border: `1px solid ${isActive ? 'var(--accent-border)' : 'var(--border-1)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <Icon style={{ width: 12, height: 12, color: isActive ? 'var(--accent-hover)' : 'var(--text-secondary)' }} />
                      </div>
                      <div style={{ minWidth: 0, textAlign: 'left' }}>
                        <p style={{ fontSize: 11.5, fontWeight: 700, color: isActive ? 'var(--accent-hover)' : 'var(--text-primary)', marginBottom: 1 }}>
                          {t.template_type}
                        </p>
                        <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.name}
                        </p>
                      </div>
                      {isActive && <Check style={{ width: 11, height: 11, color: 'var(--accent-hover)', marginLeft: 'auto', flexShrink: 0 }} />}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Center: Rule Editor ───────────────────── */}
        <div className="three-pane-work" style={{ background: 'var(--surface-0)' }}>
          {/* Sub-tabs */}
          <div className="tab-bar" style={{ background: 'var(--surface-1)', paddingLeft: 16 }}>
            {RULE_TABS.map((tab) => (
              <button
                key={tab.id}
                className={`tab-item ${activeTab === tab.id ? 'tab-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
                style={{ background: activeTab === tab.id ? 'var(--surface-0)' : 'transparent',
                  borderBottomColor: activeTab === tab.id ? 'var(--surface-0)' : 'transparent' }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
            {/* Rule basics */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div className="field-group">
                <label className="label">Rule Name *</label>
                <input className="input" placeholder="e.g. Bank GL Match — Exact"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field-group">
                <label className="label">Template Type</label>
                <input className="input" value={form.template_type}
                  onChange={(e) => setForm({ ...form, template_type: e.target.value })} />
              </div>
              <div className="field-group">
                <label className="label">Profile ID <span style={{ color: 'var(--text-disabled)', fontWeight: 400 }}>(optional)</span></label>
                <input className="input" placeholder="Leave blank for global"
                  value={form.profile_id}
                  onChange={(e) => setForm({ ...form, profile_id: e.target.value })} />
              </div>
              <div className="field-group" style={{ justifyContent: 'flex-end' }}>
                <label className="label" style={{ marginBottom: 0 }}>Options</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 8 }}>
                  <input type="checkbox" checked={form.is_reusable}
                    onChange={(e) => setForm({ ...form, is_reusable: e.target.checked })}
                    style={{ width: 14, height: 14, accentColor: 'var(--accent)' }} />
                  <span style={{ fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 500 }}>Reusable across profiles</span>
                </label>
              </div>
            </div>

            {/* Tab content */}
            {activeTab === 'conditions' && (
              <JsonEditor label="Match Conditions (JSON)" value={form.conditions} rows={10}
                onChange={(v) => setForm({ ...form, conditions: v })} />
            )}
            {activeTab === 'thresholds' && (
              <JsonEditor label="Tolerance Thresholds (JSON)" value={form.thresholds} rows={10}
                onChange={(v) => setForm({ ...form, thresholds: v })} />
            )}
            {activeTab === 'filters' && (
              <JsonEditor label="Pre-Match Filters (JSON)" value={form.filters} rows={10}
                onChange={(v) => setForm({ ...form, filters: v })} />
            )}

            {/* Condition chips preview */}
            {activeTab === 'conditions' && (() => {
              try {
                const cond = JSON.parse(form.conditions)
                const keys = cond?.keys || []
                if (!keys.length) return null
                return (
                  <div style={{ marginTop: 16 }}>
                    <p className="label" style={{ marginBottom: 8 }}>Preview — Match Keys</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {keys.map((k) => (
                        <span key={k} className="rule-condition-chip">
                          <Code2 style={{ width: 10, height: 10, color: 'var(--accent-hover)' }} />
                          {k}
                        </span>
                      ))}
                      {cond.match_mode && (
                        <span className="rule-condition-chip" style={{ background: 'var(--accent-subtle)', borderColor: 'var(--accent-border)', color: 'var(--accent-hover)' }}>
                          {cond.match_mode}
                        </span>
                      )}
                    </div>
                  </div>
                )
              } catch { return null }
            })()}
          </div>
        </div>

        {/* ── Right: Saved Rules ────────────────────── */}
        <div className="three-pane-context" style={{ padding: '12px 0' }}>
          <p className="nav-section-label" style={{ paddingLeft: 14, paddingRight: 14 }}>Saved Definitions</p>
          {rulesLoading ? <LoadingState message="Loading…" /> : rules.length === 0 ? (
            <EmptyState title="No rules yet" description="Create your first rule definition." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'auto' }} className="slim-scroll">
              {rules.map((r) => (
                <div key={r.id} style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--border-0)',
                  display: 'flex', flexDirection: 'column', gap: 4,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                        {r.name}
                      </p>
                      <span className="badge badge-accent" style={{ fontSize: 9 }}>{r.template_type}</span>
                    </div>
                    <button
                      className="btn-icon btn-sm"
                      style={{ width: 22, height: 22, flexShrink: 0, borderColor: 'transparent' }}
                      onClick={() => {
                        if (confirm(`Delete rule "${r.name}"?`)) deleteMutation.mutate(r.id)
                      }}
                      title="Delete rule"
                    >
                      <Trash2 style={{ width: 11, height: 11, color: 'var(--bad)' }} />
                    </button>
                  </div>
                  {r.is_reusable && (
                    <span style={{ fontSize: 10.5, color: 'var(--ok)' }}>✓ Reusable</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
