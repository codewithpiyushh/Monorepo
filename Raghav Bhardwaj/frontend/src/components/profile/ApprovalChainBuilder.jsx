// frontend/src/components/profile/ApprovalChainBuilder.jsx
//
// Visual approval chain builder for the ProfileFormModal.
// Renders steps as cards with type toggle (SEQUENTIAL / PARALLEL)
// and user multi-select. Validates via lifecycleAPI.validateChain()
// before the parent saves.
//
// USAGE in ProfileFormModal:
//   import ApprovalChainBuilder from '../components/profile/ApprovalChainBuilder'
//
//   // Add to form state:
//   const [chain, setChain] = useState(
//     profile?.approval_chain_json
//       ? JSON.parse(profile.approval_chain_json)
//       : []
//   )
//   const [chainValid, setChainValid] = useState(true)
//
//   // Add inside the form JSX (below workflow assignments section):
//   <ApprovalChainBuilder
//     chain={chain}
//     onChange={setChain}
//     onValidation={(valid) => setChainValid(valid)}
//     users={users}
//   />
//
//   // In handleSave, add chain to payload:
//   approval_chain_json: chain.length ? JSON.stringify(chain) : null,
//
//   // Gate save if chain is invalid:
//   if (!chainValid) { toast.error('Fix approval chain errors first.'); return }

import { useState, useEffect, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Plus, Trash2, AlertTriangle, CheckCircle2,
  GitMerge, ArrowRight, Users, User, ChevronUp, ChevronDown,
  Loader2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import lifecycleAPI from '../../api/lifecycleAPI'

// ── Constants ──────────────────────────────────────────────────────────────

const STEP_TYPES = [
  {
    value: 'SEQUENTIAL',
    label: 'Sequential',
    description: 'One approver at a time — next step starts only after this one completes',
    icon: ArrowRight,
    color: '#3b82f6',
  },
  {
    value: 'PARALLEL',
    label: 'Parallel',
    description: 'All assigned approvers must approve simultaneously',
    icon: GitMerge,
    color: '#8b5cf6',
  },
]

const ELIGIBLE_ROLES = ['reviewer', 'approver', 'certifier', 'admin']

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStep(type = 'SEQUENTIAL') {
  return { approval_type: type, users: [], _id: Math.random().toString(36).slice(2) }
}

function stepLabel(index) {
  return `Step ${index + 1}`
}

// ── Step Card ──────────────────────────────────────────────────────────────

function StepCard({ step, index, total, users, onChange, onRemove, onMoveUp, onMoveDown, errors }) {
  const eligibleUsers = users.filter(u => ELIGIBLE_ROLES.includes(u.role?.toLowerCase()))
  const selectedUsers = eligibleUsers.filter(u => step.users.includes(u.id))
  const typeMeta = STEP_TYPES.find(t => t.value === step.approval_type) || STEP_TYPES[0]
  const TypeIcon = typeMeta.icon
  const hasErrors = errors?.length > 0

  const toggleUser = (userId) => {
    const next = step.users.includes(userId)
      ? step.users.filter(id => id !== userId)
      : [...step.users, userId]
    onChange({ ...step, users: next })
  }

  const setType = (type) => onChange({ ...step, approval_type: type })

  return (
    <div style={{
      border: `1px solid ${hasErrors ? 'rgba(239,68,68,0.4)' : 'var(--border-1)'}`,
      borderRadius: 10,
      background: 'var(--surface-0)',
      overflow: 'hidden',
    }}>
      {/* Step header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px',
        background: `${typeMeta.color}0e`,
        borderBottom: '1px solid var(--border-0)',
      }}>
        {/* Step number */}
        <div style={{
          width: 24, height: 24, borderRadius: 6, flexShrink: 0,
          background: typeMeta.color,
          color: '#fff', fontSize: 11, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {index + 1}
        </div>

        <TypeIcon size={13} color={typeMeta.color} />

        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
          {stepLabel(index)} — {typeMeta.label}
        </span>

        {/* User count badge */}
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 9999,
          color: typeMeta.color, background: `${typeMeta.color}18`,
          border: `1px solid ${typeMeta.color}33`,
        }}>
          {step.users.length} user{step.users.length !== 1 ? 's' : ''}
        </span>

        {/* Reorder buttons */}
        <div style={{ display: 'flex', gap: 2 }}>
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            style={{
              width: 24, height: 24, borderRadius: 5, border: '1px solid var(--border-1)',
              background: 'transparent', cursor: index === 0 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: index === 0 ? 0.3 : 1,
            }}
          >
            <ChevronUp size={11} color="var(--text-secondary)" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            style={{
              width: 24, height: 24, borderRadius: 5, border: '1px solid var(--border-1)',
              background: 'transparent', cursor: index === total - 1 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: index === total - 1 ? 0.3 : 1,
            }}
          >
            <ChevronDown size={11} color="var(--text-secondary)" />
          </button>
          <button
            onClick={onRemove}
            style={{
              width: 24, height: 24, borderRadius: 5, border: '1px solid rgba(239,68,68,0.3)',
              background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Trash2 size={11} color="#ef4444" />
          </button>
        </div>
      </div>

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Type toggle */}
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Approval Type
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {STEP_TYPES.map(t => {
              const TIcon = t.icon
              const active = step.approval_type === t.value
              return (
                <button
                  key={t.value}
                  onClick={() => setType(t.value)}
                  style={{
                    flex: 1, padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                    border: `2px solid ${active ? t.color : 'var(--border-1)'}`,
                    background: active ? `${t.color}12` : 'transparent',
                    textAlign: 'left', transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                    <TIcon size={12} color={active ? t.color : 'var(--text-tertiary)'} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: active ? t.color : 'var(--text-secondary)' }}>
                      {t.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.3 }}>
                    {t.description}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* User selection */}
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {step.approval_type === 'PARALLEL' ? 'Approvers (all must approve)' : 'Approver'}
            {step.users.length === 0 && (
              <span style={{ color: '#ef4444', marginLeft: 6 }}>— Required</span>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {eligibleUsers.map(u => {
              const selected = step.users.includes(u.id)
              return (
                <button
                  key={u.id}
                  onClick={() => toggleUser(u.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 10px', borderRadius: 20, cursor: 'pointer',
                    border: `1px solid ${selected ? '#22c55e' : 'var(--border-1)'}`,
                    background: selected ? 'rgba(34,197,94,0.1)' : 'var(--surface-1)',
                    color: selected ? '#22c55e' : 'var(--text-secondary)',
                    fontSize: 11, fontWeight: selected ? 700 : 400,
                    transition: 'all 0.12s',
                  }}
                >
                  {selected
                    ? <CheckCircle2 size={11} />
                    : <User size={11} />
                  }
                  {u.username}
                  <span style={{
                    fontSize: 9, padding: '1px 5px', borderRadius: 4,
                    background: selected ? 'rgba(34,197,94,0.15)' : 'var(--surface-2)',
                    color: selected ? '#22c55e' : 'var(--text-tertiary)',
                    fontWeight: 600,
                  }}>
                    {u.role}
                  </span>
                </button>
              )
            })}
            {eligibleUsers.length === 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                No eligible users (reviewer / approver / certifier roles needed)
              </span>
            )}
          </div>
        </div>

        {/* Selected users preview */}
        {selectedUsers.length > 0 && (
          <div style={{
            padding: '8px 10px', borderRadius: 7,
            background: 'var(--surface-2)', border: '1px solid var(--border-0)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Users size={12} color="var(--text-tertiary)" />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {selectedUsers.map(u => u.username).join(step.approval_type === 'PARALLEL' ? ' + ' : ' → ')}
            </span>
          </div>
        )}

        {/* Errors */}
        {hasErrors && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {errors.map((err, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 11, color: '#ef4444',
                padding: '5px 8px', borderRadius: 6,
                background: 'rgba(239,68,68,0.08)',
              }}>
                <AlertTriangle size={11} />
                {err}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Chain Preview (read-only flow diagram) ─────────────────────────────────

function ChainPreview({ chain, users }) {
  if (!chain.length) return null

  return (
    <div style={{
      padding: '10px 14px', borderRadius: 8,
      background: 'var(--surface-2)', border: '1px solid var(--border-0)',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        Approval Flow Preview
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {/* Preparer is always first */}
        <div style={{
          padding: '4px 10px', borderRadius: 20, fontSize: 10, fontWeight: 600,
          background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)',
          color: '#6366f1',
        }}>
          Preparer
        </div>

        {chain.map((step, i) => {
          const stepUsers = users.filter(u => step.users.includes(u.id))
          const typeMeta  = STEP_TYPES.find(t => t.value === step.approval_type)
          return (
            <div key={step._id || i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ArrowRight size={12} color="var(--text-tertiary)" />
              <div style={{
                padding: '4px 10px', borderRadius: 20, fontSize: 10, fontWeight: 600,
                background: `${typeMeta?.color || '#3b82f6'}18`,
                border: `1px solid ${typeMeta?.color || '#3b82f6'}44`,
                color: typeMeta?.color || '#3b82f6',
              }}>
                {stepUsers.length === 0
                  ? `Step ${i + 1} (empty)`
                  : step.approval_type === 'PARALLEL'
                    ? `[${stepUsers.map(u => u.username).join(' + ')}]`
                    : stepUsers.map(u => u.username).join(' → ')
                }
              </div>
            </div>
          )
        })}

        <ArrowRight size={12} color="var(--text-tertiary)" />
        <div style={{
          padding: '4px 10px', borderRadius: 20, fontSize: 10, fontWeight: 600,
          background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)',
          color: '#8b5cf6',
        }}>
          Certified
        </div>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function ApprovalChainBuilder({ chain, onChange, onValidation, users }) {
  const [validationResult, setValidationResult] = useState(null)
  const [validating, setValidating]             = useState(false)

  // Validate on chain change (debounced)
  useEffect(() => {
    if (!chain.length) {
      setValidationResult(null)
      if (onValidation) onValidation(true)
      return
    }

    const timer = setTimeout(async () => {
      setValidating(true)
      try {
        const result = await lifecycleAPI.validateChain(chain)
        setValidationResult(result)
        if (onValidation) onValidation(result.valid)
      } catch (err) {
        // If endpoint not available, don't block save
        setValidationResult({ valid: true, errors: [], warnings: [] })
        if (onValidation) onValidation(true)
      } finally {
        setValidating(false)
      }
    }, 600)

    return () => clearTimeout(timer)
  }, [chain])

  const addStep = () => onChange([...chain, makeStep()])

  const updateStep = (index, updated) => {
    const next = [...chain]
    next[index] = updated
    onChange(next)
  }

  const removeStep = (index) => {
    onChange(chain.filter((_, i) => i !== index))
  }

  const moveStep = (index, direction) => {
    const next  = [...chain]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  // Get per-step errors from validation result
  const getStepErrors = (index) => {
    if (!validationResult?.step_errors) return []
    return validationResult.step_errors[index] || []
  }

  const isValid  = !chain.length || (validationResult?.valid ?? true)
  const warnings = validationResult?.warnings || []
  const errors   = validationResult?.errors   || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Section header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderRadius: 8,
        background: 'var(--surface-2)', border: '1px solid var(--border-0)',
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <GitMerge size={13} color="var(--text-tertiary)" />
            Approval Chain
            {chain.length > 0 && (
              <span style={{
                fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 4,
                background: 'var(--surface-1)', color: 'var(--text-tertiary)',
                border: '1px solid var(--border-0)',
              }}>
                {chain.length} step{chain.length !== 1 ? 's' : ''}
              </span>
            )}
            {validating && <Loader2 size={11} color="var(--text-tertiary)" style={{ animation: 'spin 1s linear infinite' }} />}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Define who approves this profile and in what order.
            Leave empty to use the default single-approver flow above.
          </div>
        </div>

        {/* Validation status */}
        {chain.length > 0 && !validating && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 11, fontWeight: 600,
            color: isValid ? '#22c55e' : '#ef4444',
          }}>
            {isValid
              ? <><CheckCircle2 size={13} /> Valid</>
              : <><AlertTriangle size={13} /> Invalid</>
            }
          </div>
        )}
      </div>

      {/* Global errors */}
      {errors.length > 0 && (
        <div style={{
          padding: '10px 12px', borderRadius: 8,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {errors.map((err, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#ef4444' }}>
              <AlertTriangle size={11} />
              {err}
            </div>
          ))}
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div style={{
          padding: '10px 12px', borderRadius: 8,
          background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {warnings.map((w, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#eab308' }}>
              <AlertTriangle size={11} />
              {w}
            </div>
          ))}
        </div>
      )}

      {/* Step cards */}
      {chain.map((step, index) => (
        <StepCard
          key={step._id || index}
          step={step}
          index={index}
          total={chain.length}
          users={users}
          onChange={(updated) => updateStep(index, updated)}
          onRemove={() => removeStep(index)}
          onMoveUp={() => moveStep(index, -1)}
          onMoveDown={() => moveStep(index, 1)}
          errors={getStepErrors(index)}
        />
      ))}

      {/* Add step button */}
      <button
        onClick={addStep}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          padding: '10px', borderRadius: 8, cursor: 'pointer',
          border: '2px dashed var(--border-1)', background: 'transparent',
          color: 'var(--text-tertiary)', fontSize: 12, fontWeight: 600,
          transition: 'all 0.15s',
        }}
        onMouseOver={e => {
          e.currentTarget.style.borderColor = '#FFE600'
          e.currentTarget.style.color = '#FFE600'
        }}
        onMouseOut={e => {
          e.currentTarget.style.borderColor = 'var(--border-1)'
          e.currentTarget.style.color = 'var(--text-tertiary)'
        }}
      >
        <Plus size={13} />
        Add Approval Step
      </button>

      {/* Flow preview */}
      {chain.length > 0 && (
        <ChainPreview chain={chain} users={users} />
      )}
    </div>
  )
}
