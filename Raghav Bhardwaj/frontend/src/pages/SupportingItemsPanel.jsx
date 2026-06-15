/**
 * SupportingItemsPanel
 * ─────────────────────
 * Drop inside BalanceReconciliationPage.jsx below WorkflowLifecyclePanel.
 *
 * Usage:
 *   import SupportingItemsPanel from './SupportingItemsPanel'
 *   <SupportingItemsPanel balance={selectedBalance} profile={selectedProfile} />
 *
 * Enforces lifecycle RBAC:
 *   - All mutations disabled when status is UNDER_REVIEW / APPROVED / CERTIFIED / CLOSED
 *   - Only preparer (or admin) can add/delete items
 *   - Any role with access to the balance can resolve carry-forward items
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Plus, Trash2, CheckCircle2, AlertTriangle,
  Upload, Link2, X, ChevronDown, TrendingUp, TrendingDown,
  ShieldAlert, Clock,
} from 'lucide-react'
import { supportingItemsAPI } from '../api/supportingItemsAPI'
import { enterpriseAPI }       from '../api'
import { useAuthStore }        from '../store/authStore'
import { normalizeRole }       from '../utils/roles'

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const ITEM_TYPES = [
  'TIMING_DIFFERENCE', 'ACCRUAL',
  'OUTSTANDING_CHECK', 'DEPOSIT_IN_TRANSIT', 'OTHER',
]

const LOCKED_STATES = ['UNDER_REVIEW', 'APPROVED', 'CERTIFIED', 'CLOSED']

const MAT_META = {
  IMMATERIAL: { color: 'var(--ok)',   bg: 'var(--ok)15'   },
  MATERIAL:   { color: 'var(--warn)', bg: 'var(--warn)15' },
  CRITICAL:   { color: 'var(--bad)',  bg: 'var(--bad)15'  },
}

const fmtDate = (ts) => {
  if (!ts) return '—'
  try { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return ts }
}

const fmtAmt = (n) =>
  n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 2 }).format(n)

// ─────────────────────────────────────────────────────────────
// Materiality badge
// ─────────────────────────────────────────────────────────────

function MatBadge({ level }) {
  const m = MAT_META[level] || { color: 'var(--text-tertiary)', bg: 'var(--surface-2)' }
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
      color: m.color, background: m.bg, border: `1px solid ${m.color}33`,
      whiteSpace: 'nowrap',
    }}>{level}</span>
  )
}

// ─────────────────────────────────────────────────────────────
// Variance summary card
// ─────────────────────────────────────────────────────────────

function VarianceCard({ data, blocked }) {
  const variance = data?.unexplained_variance ?? 0
  const positive = data?.total_positive_impact ?? 0
  const negative = data?.total_negative_impact ?? 0
  const critical = data?.critical_unresolved ?? 0

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16,
    }}>
      {/* Unexplained variance */}
      <div style={{
        padding: '12px 14px', borderRadius: 8,
        background: variance > 0 ? 'var(--bad)11' : 'var(--ok)11',
        border: `1px solid ${variance > 0 ? 'var(--bad)33' : 'var(--ok)33'}`,
        gridColumn: '1/2',
      }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 4 }}>
          UNEXPLAINED VARIANCE
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: variance > 0 ? 'var(--bad)' : 'var(--ok)' }}>
          {fmtAmt(variance)}
        </div>
        {variance === 0 && (
          <div style={{ fontSize: 10, color: 'var(--ok)', marginTop: 2 }}>✓ Fully explained</div>
        )}
      </div>

      {/* Positive impact */}
      <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--surface-1)', border: '1px solid var(--border-0)' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 4 }}>
          POSITIVE ITEMS
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <TrendingUp size={14} /> {fmtAmt(positive)}
        </div>
      </div>

      {/* Negative impact */}
      <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--surface-1)', border: '1px solid var(--border-0)' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 4 }}>
          NEGATIVE ITEMS
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--bad)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <TrendingDown size={14} /> {fmtAmt(negative)}
        </div>
      </div>

      {/* Certification block */}
      <div style={{
        padding: '12px 14px', borderRadius: 8,
        background: critical > 0 ? 'var(--bad)11' : 'var(--surface-1)',
        border: `1px solid ${critical > 0 ? 'var(--bad)33' : 'var(--border-0)'}`,
      }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 4 }}>
          CRITICAL UNRESOLVED
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, color: critical > 0 ? 'var(--bad)' : 'var(--text-secondary)' }}>
          {critical}
        </div>
        {critical > 0 && (
          <div style={{ fontSize: 9, color: 'var(--bad)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
            <ShieldAlert size={9} /> Certification blocked
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Add Item modal
// ─────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  item_type: 'TIMING_DIFFERENCE', impact_direction: 'NEGATIVE',
  amount: '', description: '', attachment_id: '',
}

function AddItemModal({ balanceId, profile, onClose, onSaved }) {
  const [form, setForm]   = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [err, setErr]     = useState({})

  const matLimit = profile?.materiality_limit ?? 0
  const needsEvidence = matLimit > 0 && Number(form.amount) >= matLimit

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const validate = () => {
    const e = {}
    if (!form.amount || Number(form.amount) <= 0) e.amount = 'Enter a positive amount'
    if (!form.description.trim()) e.description = 'Description is required'
    if (needsEvidence && !form.attachment_id) e.attachment_id = `Evidence required for amounts ≥ ${matLimit}`
    setErr(e)
    return Object.keys(e).length === 0
  }

  const submit = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      await supportingItemsAPI.create({
        balance_id:       balanceId,
        item_type:        form.item_type,
        impact_direction: form.impact_direction,
        amount:           Number(form.amount),
        description:      form.description,
        attachment_id:    form.attachment_id ? Number(form.attachment_id) : null,
      })
      toast.success('Supporting item added')
      onSaved()
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to add item')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = (hasErr) => ({
    width: '100%', boxSizing: 'border-box',
    height: 32, padding: '0 10px', fontSize: 12,
    background: 'var(--surface-2)',
    border: `1px solid ${hasErr ? 'var(--bad)' : 'var(--border-1)'}`,
    borderRadius: 6, color: 'var(--text-primary)', outline: 'none',
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--surface-0)', border: '1px solid var(--border-1)',
        borderRadius: 12, width: 480, maxWidth: '94vw', padding: 24,
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            Add Supporting Item
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Type + Direction row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                Item Type <span style={{ color: 'var(--bad)' }}>*</span>
              </label>
              <select value={form.item_type} onChange={e => set('item_type', e.target.value)} style={{ ...inputStyle(false), height: 32 }}>
                {ITEM_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                Impact
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                {['POSITIVE','NEGATIVE'].map(d => (
                  <button
                    key={d}
                    onClick={() => set('impact_direction', d)}
                    style={{
                      flex: 1, height: 32, fontSize: 11, fontWeight: 600,
                      borderRadius: 6, cursor: 'pointer',
                      background: form.impact_direction === d
                        ? (d === 'POSITIVE' ? 'var(--ok)' : 'var(--bad)')
                        : 'var(--surface-2)',
                      color: form.impact_direction === d ? '#fff' : 'var(--text-secondary)',
                      border: `1px solid ${form.impact_direction === d
                        ? (d === 'POSITIVE' ? 'var(--ok)' : 'var(--bad)')
                        : 'var(--border-1)'}`,
                    }}
                  >
                    {d === 'POSITIVE' ? '+ Positive' : '− Negative'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
              Amount <span style={{ color: 'var(--bad)' }}>*</span>
              {matLimit > 0 && (
                <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 6 }}>
                  (evidence required if ≥ {fmtAmt(matLimit)})
                </span>
              )}
            </label>
            <input
              type="number" min="0.01" step="0.01"
              value={form.amount}
              onChange={e => set('amount', e.target.value)}
              style={inputStyle(!!err.amount)}
            />
            {err.amount && <span style={{ fontSize: 10, color: 'var(--bad)' }}>{err.amount}</span>}
          </div>

          {/* Description */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
              Description <span style={{ color: 'var(--bad)' }}>*</span>
            </label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={2}
              placeholder="Explain this item…"
              style={{
                ...inputStyle(!!err.description),
                height: 'auto', padding: '8px 10px', resize: 'vertical',
              }}
            />
            {err.description && <span style={{ fontSize: 10, color: 'var(--bad)' }}>{err.description}</span>}
          </div>

          {/* Evidence attachment */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
              Evidence Attachment ID {needsEvidence && <span style={{ color: 'var(--bad)' }}>* Required</span>}
            </label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="number"
                value={form.attachment_id}
                onChange={e => set('attachment_id', e.target.value)}
                placeholder="Evidence Manager ID"
                style={{ ...inputStyle(!!err.attachment_id), flex: 1 }}
              />
              <div style={{
                height: 32, padding: '0 10px', display: 'flex', alignItems: 'center',
                gap: 5, fontSize: 11, color: 'var(--text-tertiary)',
                border: '1px dashed var(--border-1)', borderRadius: 6,
                cursor: 'pointer',
              }}>
                <Upload size={12} /> Upload
              </div>
            </div>
            {needsEvidence && (
              <div style={{ fontSize: 10, color: 'var(--warn)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
                <AlertTriangle size={9} />
                Amount exceeds materiality limit — supporting evidence is mandatory
              </div>
            )}
            {err.attachment_id && <span style={{ fontSize: 10, color: 'var(--bad)' }}>{err.attachment_id}</span>}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button onClick={onClose} style={{
            height: 32, padding: '0 14px', fontSize: 12,
            background: 'none', border: '1px solid var(--border-1)',
            borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={submit} disabled={saving} style={{
            height: 32, padding: '0 18px', fontSize: 12, fontWeight: 600,
            background: 'var(--accent)', border: 'none', borderRadius: 6,
            color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
          }}>{saving ? 'Adding…' : 'Add Item'}</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Add from Exception side-panel
// ─────────────────────────────────────────────────────────────

function ExceptionSidePanel({ balanceId, profileId, onClose, onSaved }) {
  const [selected,  setSelected]  = useState(null)
  const [amount,    setAmount]    = useState('')
  const [saving,    setSaving]    = useState(false)

  const { data: exceptions = [] } = useQuery({
    queryKey: ['exceptions-for-si', profileId],
    queryFn:  () => enterpriseAPI.listExceptions('exception'),
  })

  const activeExceptions = exceptions.filter(e => ['OPEN','IN_PROGRESS','ASSIGNED'].includes(e.status))

  const submit = async () => {
    if (!selected || !amount) return
    setSaving(true)
    try {
      await supportingItemsAPI.createFromException({
        exception_id:     selected.id,
        balance_id:       balanceId,
        amount:           Number(amount),
        item_type:        'OTHER',
        impact_direction: 'NEGATIVE',
        description:      `Explained by Exception #${selected.id}`,
      })
      toast.success('Exception converted to supporting item')
      onSaved()
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Conversion failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 380,
      background: 'var(--surface-0)', border: '1px solid var(--border-1)',
      boxShadow: '-4px 0 24px rgba(0,0,0,0.15)', zIndex: 900,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid var(--border-0)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          Add from Exception
        </h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
          <X size={15} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {activeExceptions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)', fontSize: 12 }}>
            No active exceptions to convert
          </div>
        ) : activeExceptions.map(exc => (
          <div
            key={exc.id}
            onClick={() => setSelected(exc)}
            style={{
              padding: '10px 12px', borderRadius: 8, marginBottom: 6, cursor: 'pointer',
              border: `1px solid ${selected?.id === exc.id ? 'var(--accent)' : 'var(--border-0)'}`,
              background: selected?.id === exc.id ? 'var(--accent)11' : 'var(--surface-1)',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>
              Exception #{exc.id}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {exc.comments || exc.classification || 'No description'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 3 }}>
              Status: {exc.status} · {fmtDate(exc.created_at)}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-0)' }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
            Amount for this supporting item <span style={{ color: 'var(--bad)' }}>*</span>
          </label>
          <input
            type="number" min="0.01" step="0.01"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            style={{
              width: '100%', boxSizing: 'border-box', height: 32,
              padding: '0 10px', fontSize: 12, marginBottom: 10,
              background: 'var(--surface-2)', border: '1px solid var(--border-1)',
              borderRadius: 6, color: 'var(--text-primary)',
            }}
          />
          <button
            onClick={submit}
            disabled={saving || !amount}
            style={{
              width: '100%', height: 32, fontSize: 12, fontWeight: 600,
              background: 'var(--accent)', border: 'none', borderRadius: 6,
              color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Converting…' : `Convert Exception #${selected.id}`}
          </button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Resolve modal
// ─────────────────────────────────────────────────────────────

function ResolveModal({ item, onClose, onSaved }) {
  const [comment, setComment] = useState('')
  const [saving,  setSaving]  = useState(false)

  const submit = async () => {
    if (!comment.trim()) { toast.error('Resolution comment is required'); return }
    setSaving(true)
    try {
      await supportingItemsAPI.resolve(item.id, comment)
      toast.success('Item marked as resolved')
      onSaved()
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to resolve')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001,
    }}>
      <div style={{
        background: 'var(--surface-0)', border: '1px solid var(--border-1)',
        borderRadius: 12, width: 420, padding: 22,
      }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
          Mark as Resolved
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 14px' }}>
          {item.description}
          {item.source_item_id && (
            <span style={{ display: 'block', fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Carried forward from item #{item.source_item_id}
            </span>
          )}
        </p>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
          Resolution Comment <span style={{ color: 'var(--bad)' }}>*</span>
        </label>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          rows={3}
          placeholder="Explain how this item was resolved…"
          style={{
            width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 12,
            borderRadius: 8, resize: 'vertical',
            border: '1px solid var(--border-1)', background: 'var(--surface-2)',
            color: 'var(--text-primary)', fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={{
            height: 32, padding: '0 14px', fontSize: 12,
            background: 'none', border: '1px solid var(--border-1)',
            borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={submit} disabled={saving || !comment.trim()} style={{
            height: 32, padding: '0 16px', fontSize: 12, fontWeight: 600,
            background: 'var(--ok)', border: 'none', borderRadius: 6,
            color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
          }}>{saving ? 'Saving…' : 'Resolve'}</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Main panel
// ─────────────────────────────────────────────────────────────

export default function SupportingItemsPanel({ balance, profile }) {
  const user    = useAuthStore(s => s.user)
  const role    = normalizeRole(user?.role)
  const qc      = useQueryClient()

  const [showAdd,       setShowAdd]       = useState(false)
  const [showExcPanel,  setShowExcPanel]  = useState(false)
  const [resolveItem,   setResolveItem]   = useState(null)

  const balanceId = balance?.id
  const status    = balance?.status || 'DRAFT'
  const isLocked  = LOCKED_STATES.includes(status)
  const isAdmin   = role === 'admin'
  const canWrite  = (role === 'preparer' || isAdmin) && !isLocked

  const refresh = () => qc.invalidateQueries({ queryKey: ['supporting-items', balanceId] })

  // Fetch items
  const { data, isLoading } = useQuery({
    queryKey: ['supporting-items', balanceId],
    queryFn:  () => supportingItemsAPI.list(balanceId),
    enabled:  Boolean(balanceId),
    refetchInterval: 30_000,
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (itemId) => supportingItemsAPI.delete(itemId),
    onSuccess:  () => { toast.success('Item deleted'); refresh() },
    onError:    (e) => toast.error(e?.response?.data?.detail || 'Delete failed'),
  })

  const items = data?.items || []

  const th = { padding: '7px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--surface-1)', borderBottom: '1px solid var(--border-1)', textAlign: 'left', whiteSpace: 'nowrap' }
  const td = { padding: '8px 12px', fontSize: 12, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-0)', verticalAlign: 'middle' }

  if (!balanceId) return null

  return (
    <div style={{ marginTop: 24 }}>
      {/* Panel header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14,
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            Adjustments & Supporting Items
          </h3>
          {isLocked && (
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-tertiary)' }}>
              Read-only — balance is {status}
            </p>
          )}
        </div>
        {canWrite && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setShowExcPanel(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                height: 30, padding: '0 12px', fontSize: 11, fontWeight: 600,
                background: 'none', border: '1px solid var(--border-1)',
                borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer',
              }}
            >
              <Link2 size={11} /> Add from Exception
            </button>
            <button
              onClick={() => setShowAdd(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                height: 30, padding: '0 12px', fontSize: 11, fontWeight: 600,
                background: 'var(--accent)', border: 'none',
                borderRadius: 6, color: '#fff', cursor: 'pointer',
              }}
            >
              <Plus size={11} /> Add Item
            </button>
          </div>
        )}
      </div>

      {/* Variance summary */}
      <VarianceCard data={data} />

      {/* Items table */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)', fontSize: 12 }}>
          Loading items…
        </div>
      ) : items.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 32,
          border: '1px dashed var(--border-1)', borderRadius: 8,
          color: 'var(--text-tertiary)', fontSize: 12,
        }}>
          No supporting items yet
          {canWrite && ' — click "Add Item" to explain a variance'}
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border-1)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
              <thead>
                <tr>
                  <th style={th}>Type</th>
                  <th style={th}>Description</th>
                  <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                  <th style={th}>Materiality</th>
                  <th style={th}>Created By</th>
                  <th style={th}>Created</th>
                  <th style={th}>Resolved By</th>
                  <th style={th}>Resolved</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr
                    key={item.id}
                    style={{
                      background: item.is_resolved ? 'var(--surface-1)' : 'var(--surface-0)',
                      opacity: item.is_resolved ? 0.7 : 1,
                    }}
                  >
                    <td style={td}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 11, fontWeight: 500 }}>
                          {item.item_type.replace(/_/g,' ')}
                        </span>
                        <span style={{
                          fontSize: 9, fontWeight: 700,
                          color: item.impact_direction === 'POSITIVE' ? 'var(--ok)' : 'var(--bad)',
                        }}>
                          {item.impact_direction === 'POSITIVE' ? '▲ Positive' : '▼ Negative'}
                        </span>
                      </div>
                    </td>
                    <td style={{ ...td, maxWidth: 200 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.description}
                      </div>
                      {item.source_item_id && (
                        <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 2 }}>
                          <Clock size={8} style={{ display: 'inline', marginRight: 3 }} />
                          Carried from #{item.source_item_id}
                        </div>
                      )}
                      {item.exception_id && (
                        <div style={{ fontSize: 9, color: 'var(--accent)', marginTop: 2 }}>
                          <Link2 size={8} style={{ display: 'inline', marginRight: 3 }} />
                          Exception #{item.exception_id}
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', fontWeight: 500 }}>
                      <span style={{ color: item.impact_direction === 'POSITIVE' ? 'var(--ok)' : 'var(--bad)' }}>
                        {item.impact_direction === 'POSITIVE' ? '+' : '−'}{fmtAmt(item.amount)}
                      </span>
                    </td>
                    <td style={td}><MatBadge level={item.materiality_classification} /></td>
                    <td style={{ ...td, fontSize: 11, color: 'var(--text-secondary)' }}>
                      {item.created_by_name || '—'}
                    </td>
                    <td style={{ ...td, fontSize: 11, color: 'var(--text-secondary)' }}>
                      {fmtDate(item.created_at)}
                    </td>
                    <td style={{ ...td, fontSize: 11, color: 'var(--text-secondary)' }}>
                      {item.resolved_by_name || '—'}
                    </td>
                    <td style={{ ...td, fontSize: 11, color: 'var(--text-secondary)' }}>
                      {fmtDate(item.resolved_at)}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {canWrite && !item.is_resolved && (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            onClick={() => setResolveItem(item)}
                            title="Mark as Resolved"
                            style={{
                              display: 'flex', alignItems: 'center', gap: 3,
                              height: 26, padding: '0 8px', fontSize: 10, fontWeight: 600,
                              background: 'var(--ok)11', border: '1px solid var(--ok)33',
                              borderRadius: 5, color: 'var(--ok)', cursor: 'pointer',
                            }}
                          >
                            <CheckCircle2 size={10} /> Resolve
                          </button>
                          <button
                            onClick={() => deleteMutation.mutate(item.id)}
                            title="Delete"
                            style={{
                              display: 'flex', alignItems: 'center',
                              height: 26, width: 26, justifyContent: 'center',
                              background: 'none', border: '1px solid var(--border-1)',
                              borderRadius: 5, color: 'var(--bad)', cursor: 'pointer',
                            }}
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      )}
                      {item.is_resolved && (
                        <span style={{ fontSize: 10, color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <CheckCircle2 size={10} /> Resolved
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {showAdd && (
        <AddItemModal
          balanceId={balanceId}
          profile={profile}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); refresh() }}
        />
      )}
      {resolveItem && (
        <ResolveModal
          item={resolveItem}
          onClose={() => setResolveItem(null)}
          onSaved={() => { setResolveItem(null); refresh() }}
        />
      )}
      {showExcPanel && (
        <ExceptionSidePanel
          balanceId={balanceId}
          profileId={profile?.id}
          onClose={() => setShowExcPanel(false)}
          onSaved={() => { setShowExcPanel(false); refresh() }}
        />
      )}
    </div>
  )
}
