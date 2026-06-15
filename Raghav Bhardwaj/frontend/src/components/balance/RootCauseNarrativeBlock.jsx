import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, BookOpen, CheckCircle2, Clock, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import varianceAPI from '../../api/varianceAPI'

const ROOT_CAUSE_OPTIONS = [
  { value: 'TIMING_DIFFERENCE', label: 'Timing Difference' },
  { value: 'DATA_MAPPING_ISSUE', label: 'Data Mapping Issue' },
  { value: 'MISSING_TRANSACTION', label: 'Missing Transaction' },
  { value: 'FX_ADJUSTMENT', label: 'FX Adjustment' },
  { value: 'MANUAL_JOURNAL', label: 'Manual Journal Entry' },
  { value: 'INTERCOMPANY_DIFFERENCE', label: 'Intercompany Difference' },
  { value: 'SYSTEM_ERROR', label: 'System Error' },
  { value: 'OTHER', label: 'Other' },
]

const RESOLUTION_OPTIONS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'RESOLVED', label: 'Resolved' },
]

const CLASS_META = {
  MATERIAL_VARIANCE: { color: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.28)', label: 'Material Variance', icon: AlertTriangle },
  CRITICAL_VARIANCE: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.28)', label: 'Critical Variance', icon: AlertTriangle },
  WITHIN_THRESHOLD: { color: '#3b82f6', bg: 'rgba(59,130,246,0.06)', border: 'rgba(59,130,246,0.2)', label: 'Within Threshold', icon: CheckCircle2 },
  BALANCED: { color: '#22c55e', bg: 'rgba(34,197,94,0.06)', border: 'rgba(34,197,94,0.2)', label: 'Balanced', icon: CheckCircle2 },
}

const REQUIRES_NARRATIVE = new Set(['MATERIAL_VARIANCE', 'CRITICAL_VARIANCE'])

export default function RootCauseNarrativeBlock({ balance, onSaved }) {
  const cls = balance?.variance_severity_classification
  if (!cls) return null
  return <NarrativeContent balance={balance} meta={CLASS_META[cls]} isRequired={REQUIRES_NARRATIVE.has(cls)} onSaved={onSaved} />
}

function NarrativeContent({ balance, meta, isRequired, onSaved }) {
  const qc = useQueryClient()
  const { data: explanation, isLoading } = useQuery({
    queryKey: ['balance-explanation', balance.id],
    queryFn: () => varianceAPI.getExplanation(balance.id),
    staleTime: 30_000,
  })

  const [form, setForm] = useState({
    root_cause_category: '',
    variance_explanation: '',
    resolution_target_date: '',
    resolution_status: 'OPEN',
  })

  useEffect(() => {
    if (!explanation) return
    setForm({
      root_cause_category: explanation.root_cause_category || '',
      variance_explanation: explanation.variance_explanation || '',
      resolution_target_date: explanation.resolution_target_date || '',
      resolution_status: explanation.resolution_status || 'OPEN',
    })
  }, [explanation])

  const saveMut = useMutation({
    mutationFn: (data) => varianceAPI.saveExplanation(balance.id, data),
    onSuccess: () => {
      toast.success('Root cause narrative saved.')
      qc.invalidateQueries({ queryKey: ['balance-explanation', balance.id] })
      qc.invalidateQueries({ queryKey: ['balance-list'] })
      qc.invalidateQueries({ queryKey: ['balance-dashboard'] })
      if (onSaved) onSaved()
    },
    onError: (err) => {
      toast.error(err?.response?.data?.detail || 'Failed to save narrative.')
    },
  })

  const handleSave = () => {
    if (isRequired && (!form.root_cause_category || !form.variance_explanation.trim())) {
      toast.error('Category and explanation are required for this variance classification.')
      return
    }
    saveMut.mutate({
      root_cause_category: form.root_cause_category || undefined,
      variance_explanation: form.variance_explanation || undefined,
      resolution_target_date: form.resolution_target_date || undefined,
      resolution_status: form.resolution_status || undefined,
    })
  }

  if (!meta) return null
  const Icon = meta.icon || BookOpen
  const inputStyle = {
    width: '100%',
    padding: '8px 11px',
    borderRadius: 7,
    border: '1px solid var(--border-1)',
    background: 'var(--surface-1)',
    color: 'var(--text-primary)',
    fontSize: 12,
    outline: 'none',
    boxSizing: 'border-box',
  }

  const explanationComplete = Boolean(explanation?.root_cause_category && explanation?.variance_explanation)

  return (
    <div style={{ marginTop: 14, border: `1px solid ${meta.border}`, borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', background: meta.bg, borderBottom: `1px solid ${meta.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <Icon size={14} color={meta.color} />
          <span style={{ fontSize: 12, fontWeight: 700, color: meta.color }}>
            {meta.label} - Root Cause Narrative
          </span>
          {isRequired && (
            <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: meta.color, color: '#fff' }}>
              REQUIRED FOR SUBMISSION
            </span>
          )}
        </div>
        {explanationComplete && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#22c55e', fontWeight: 600 }}>
            <CheckCircle2 size={13} />
            Narrative Complete
          </div>
        )}
      </div>

      {isRequired && !explanationComplete && (
        <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: 12, borderBottom: '1px solid rgba(239,68,68,0.18)' }}>
          Submission is blocked until a root cause category and explanation are saved.
        </div>
      )}

      {explanation && (
        <div style={{ display: 'flex', gap: 16, padding: '10px 14px', background: 'var(--surface-0)', borderBottom: '1px solid var(--border-0)', flexWrap: 'wrap' }}>
          {[
            { label: 'Raw Variance', value: (balance.source_balance - balance.target_balance).toLocaleString(undefined, { minimumFractionDigits: 2 }) },
            { label: 'Explained', value: (explanation.explained_variance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) },
            { label: 'Unexplained', value: (explanation.unexplained_variance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }), color: meta.color },
            explanation.flux_percentage != null ? { label: 'Flux', value: `${explanation.flux_percentage >= 0 ? '+' : ''}${Number(explanation.flux_percentage || 0).toFixed(1)}%` } : null,
          ].filter(Boolean).map(({ label, value, color }) => (
            <div key={label}>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: color || 'var(--text-primary)' }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: '14px', background: 'var(--surface-0)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 5, fontWeight: 600 }}>
              Root Cause Category {isRequired && <span style={{ color: '#ef4444' }}>*</span>}
            </label>
            <select value={form.root_cause_category} onChange={(e) => setForm((f) => ({ ...f, root_cause_category: e.target.value }))} style={inputStyle}>
              <option value="">Select category...</option>
              {ROOT_CAUSE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 5, fontWeight: 600 }}>
              Resolution Status
            </label>
            <select value={form.resolution_status} onChange={(e) => setForm((f) => ({ ...f, resolution_status: e.target.value }))} style={inputStyle}>
              {RESOLUTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 5, fontWeight: 600 }}>
              <Clock size={11} style={{ marginRight: 4 }} />
              Resolution Target Date
            </label>
            <input
              type="date"
              value={form.resolution_target_date}
              onChange={(e) => setForm((f) => ({ ...f, resolution_target_date: e.target.value }))}
              style={inputStyle}
            />
          </div>
        </div>

        <div>
          <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 5, fontWeight: 600 }}>
            Variance Explanation {isRequired && <span style={{ color: '#ef4444' }}>*</span>}
          </label>
          <textarea
            rows={4}
            value={form.variance_explanation}
            onChange={(e) => setForm((f) => ({ ...f, variance_explanation: e.target.value }))}
            placeholder="Explain the variance, what caused it, and how it will be resolved..."
            style={{ ...inputStyle, resize: 'vertical', minHeight: 120 }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {isLoading ? 'Loading current narrative...' : 'Saved narratives are enforced by the backend on submit.'}
          </div>
          <button
            onClick={handleSave}
            disabled={saveMut.isPending}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: meta.color,
              color: '#fff',
              fontWeight: 700,
              cursor: saveMut.isPending ? 'not-allowed' : 'pointer',
              opacity: saveMut.isPending ? 0.7 : 1,
            }}
          >
            <Save size={13} />
            {saveMut.isPending ? 'Saving...' : 'Save Narrative'}
          </button>
        </div>
      </div>
    </div>
  )
}
