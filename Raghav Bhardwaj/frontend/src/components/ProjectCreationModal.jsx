import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Plus, ArrowRight, ArrowLeft, Layers, Settings2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { projectsAPI } from '../api'
import { useProjectStore } from '../store/projectStore'

const TEMPLATES = [
  { id: 'bank_reconciliation',    name: 'Bank Reconciliation',   description: 'Match bank statements with GL transactions',      icon: '🏦' },
  { id: 'vendor_reconciliation',  name: 'Vendor Reconciliation', description: 'Reconcile vendor invoices and payments',           icon: '🤝' },
  { id: 'intercompany',           name: 'Intercompany AP/AR',    description: 'Match intercompany transactions between entities', icon: '🔗' },
  { id: 'payroll_clearing',       name: 'Payroll Clearing',      description: 'Reconcile payroll clearing accounts',             icon: '👥' },
]

// ── Step indicator ────────────────────────────────────────────
function StepDot({ active, done, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700,
        background: done ? '#FFE600' : active ? 'rgba(255,230,0,0.15)' : 'var(--surface-3)',
        border: `2px solid ${done ? '#E6CF00' : active ? '#FFE600' : 'var(--border-2)'}`,
        color: done ? '#1A1A24' : active ? '#FFE600' : 'var(--text-disabled)',
        transition: 'all 200ms',
      }}>
        {done ? '✓' : label}
      </div>
    </div>
  )
}

export default function ProjectCreationModal({ isOpen, onClose }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const setSelectedProjectId = useProjectStore((s) => s.setSelectedProjectId)

  const [step,             setStep]             = useState('choice')   // 'choice' | 'template' | 'custom'
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [projectName,      setProjectName]      = useState('')
  const [description,      setDescription]      = useState('')

  const createMutation = useMutation({
    mutationFn: (payload) => projectsAPI.create(payload),
    onSuccess: (data) => {
      toast.success(`Project "${data.name}" created`)
      qc.invalidateQueries({ queryKey: ['projects'] })
      setSelectedProjectId(String(data.id))
      handleClose()
      navigate(`/projects/${data.id}/ingestion`)
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed to create project'),
  })

  const handleClose = () => {
    setStep('choice')
    setSelectedTemplate(null)
    setProjectName('')
    setDescription('')
    onClose()
  }

  const handleCreate = () => {
    if (!projectName.trim()) { toast.error('Project name is required'); return }
    createMutation.mutate({
      name: projectName.trim(),
      description: description.trim() || (selectedTemplate ? `Based on ${selectedTemplate.name} template` : 'Custom project'),
      template_type: selectedTemplate?.id || 'custom',
    })
  }

  if (!isOpen) return null

  // Step numbers for indicator
  const stepNum = step === 'choice' ? 1 : 2

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        width: '100%', maxWidth: 480,
        background: 'var(--surface-1)',
        border: '1px solid var(--border-1)',
        borderTop: '3px solid #FFE600',
        borderRadius: 14,
        boxShadow: '0 32px 80px rgba(0,0,0,0.50)',
        overflow: 'hidden',
        fontFamily: 'Inter, sans-serif',
        display: 'flex', flexDirection: 'column',
        maxHeight: '90vh',
      }}>

        {/* ── Header ─────────────────────────────────── */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-0)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
              New Project
            </p>
            <h2 style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 700,
              color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              {step === 'choice'   ? 'How would you like to start?'  :
               step === 'template' ? 'Use a predefined template'      :
                                     'Start a custom project'}
            </h2>
          </div>
          <button onClick={handleClose} style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            border: '1px solid var(--border-2)', background: 'var(--surface-3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--text-tertiary)',
            transition: 'color 120ms, border-color 120ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--border-2)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.borderColor = 'var(--border-2)' }}
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {/* ── Step indicator ──────────────────────────── */}
        <div style={{
          padding: '12px 20px',
          borderBottom: '1px solid var(--border-0)',
          display: 'flex', alignItems: 'center', gap: 8,
          flexShrink: 0,
        }}>
          <StepDot active={stepNum === 1} done={stepNum > 1} label="1" />
          <div style={{ flex: 1, height: 2, background: stepNum > 1 ? '#FFE600' : 'var(--border-1)', borderRadius: 9999, transition: 'background 300ms' }} />
          <StepDot active={stepNum === 2} done={false} label="2" />
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 4 }}>
            {step === 'choice' ? 'Choose type' : 'Configure & create'}
          </span>
        </div>

        {/* ── Body ────────────────────────────────────── */}
        <div style={{ padding: '20px', overflow: 'auto', flex: 1 }}>

          {/* ── Step 1: Choice ────────────────────────── */}
          {step === 'choice' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                {
                  key: 'template',
                  icon: Layers,
                  title: 'Use Predefined Template',
                  desc: 'Start with a pre-configured reconciliation template — Bank, Vendor, Intercompany, or Payroll.',
                },
                {
                  key: 'custom',
                  icon: Settings2,
                  title: 'Start Custom Project',
                  desc: 'Create a blank project and configure rules, matching logic, and workflows from scratch.',
                },
              ].map(({ key, icon: Icon, title, desc }) => (
                <button key={key} onClick={() => setStep(key)} style={{
                  width: '100%', textAlign: 'left', padding: '16px 18px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border-1)',
                  borderRadius: 12, cursor: 'pointer',
                  display: 'flex', alignItems: 'flex-start', gap: 14,
                  transition: 'border-color 140ms, background 140ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#FFE600'; e.currentTarget.style.background = 'var(--surface-3)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-1)'; e.currentTarget.style.background = 'var(--surface-2)' }}
                >
                  <div style={{
                    width: 38, height: 38, borderRadius: 9, flexShrink: 0,
                    background: 'rgba(255,230,0,0.10)', border: '1px solid rgba(255,230,0,0.20)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon style={{ width: 16, height: 16, color: '#FFE600' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</p>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.55 }}>{desc}</p>
                  </div>
                  <ArrowRight style={{ width: 14, height: 14, color: 'var(--text-disabled)', flexShrink: 0, marginTop: 2 }} />
                </button>
              ))}
            </div>
          )}

          {/* ── Step 2a: Template picker ───────────────── */}
          {step === 'template' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Template grid */}
              <div>
                <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.10em', color: 'var(--text-tertiary)' }}>
                  Select Template
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {TEMPLATES.map((t) => {
                    const isSelected = selectedTemplate?.id === t.id
                    return (
                      <button key={t.id} onClick={() => setSelectedTemplate(t)} style={{
                        textAlign: 'left', padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                        background: isSelected ? 'rgba(255,230,0,0.08)' : 'var(--surface-2)',
                        border: `1px solid ${isSelected ? '#FFE600' : 'var(--border-1)'}`,
                        transition: 'border-color 140ms, background 140ms',
                        boxShadow: isSelected ? '0 0 0 1px #FFE60033' : 'none',
                      }}
                      onMouseEnter={(e) => { if (!isSelected) { e.currentTarget.style.borderColor = 'rgba(255,230,0,0.35)'; e.currentTarget.style.background = 'var(--surface-3)' } }}
                      onMouseLeave={(e) => { if (!isSelected) { e.currentTarget.style.borderColor = 'var(--border-1)'; e.currentTarget.style.background = 'var(--surface-2)' } }}
                      >
                        <div style={{ fontSize: 20, marginBottom: 6 }}>{t.icon}</div>
                        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: isSelected ? '#FFE600' : 'var(--text-primary)' }}>{t.name}</p>
                        <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>{t.description}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Name + description — only when template selected */}
              {selectedTemplate && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{
                    padding: '10px 14px', borderRadius: 8,
                    background: 'rgba(255,230,0,0.06)', border: '1px solid rgba(255,230,0,0.18)',
                    fontSize: 12, color: 'var(--text-secondary)',
                  }}>
                    Template selected: <strong style={{ color: '#FFE600' }}>{selectedTemplate.name}</strong>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.10em', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                      Project Name *
                    </label>
                    <input className="input" autoFocus
                      placeholder={`e.g., Monthly ${selectedTemplate.name}`}
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.10em', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                      Description (optional)
                    </label>
                    <input className="input"
                      placeholder="Brief description of this reconciliation project"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2b: Custom ───────────────────────── */}
          {step === 'custom' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Info banner */}
              <div style={{
                padding: '12px 14px', borderRadius: 10,
                background: 'var(--surface-2)', border: '1px solid var(--border-1)',
                display: 'flex', gap: 12, alignItems: 'flex-start',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: 'rgba(255,230,0,0.10)', border: '1px solid rgba(255,230,0,0.20)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Settings2 style={{ width: 14, height: 14, color: '#FFE600' }} />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>Custom Project</p>
                  <p style={{ margin: '3px 0 0', fontSize: 11.5, color: 'var(--text-tertiary)', lineHeight: 1.55 }}>
                    Configure reconciliation rules, matching logic, and workflows during setup.
                    Start by uploading your source and target datasets.
                  </p>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.10em', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                  Project Name *
                </label>
                <input className="input" autoFocus
                  placeholder="Enter project name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.10em', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                  Description (optional)
                </label>
                <input className="input"
                  placeholder="Brief description of this reconciliation project"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Footer actions ──────────────────────────── */}
        {step !== 'choice' && (
          <div style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--border-0)',
            display: 'flex', gap: 8, justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <button onClick={() => { setStep('choice'); setSelectedTemplate(null); setProjectName(''); setDescription('') }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 36, padding: '0 16px', borderRadius: 8,
                border: '1px solid var(--border-2)', background: 'var(--surface-3)',
                color: 'var(--text-secondary)', fontSize: 12.5, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                transition: 'border-color 100ms',
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--border-1)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-2)'}
            >
              <ArrowLeft style={{ width: 12, height: 12 }} /> Back
            </button>

            <button
              onClick={handleCreate}
              disabled={
                createMutation.isPending ||
                !projectName.trim() ||
                (step === 'template' && !selectedTemplate)
              }
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 36, padding: '0 20px', borderRadius: 8,
                border: '1px solid #E6CF00',
                background: createMutation.isPending || !projectName.trim() || (step === 'template' && !selectedTemplate)
                  ? 'rgba(255,230,0,0.25)' : '#FFE600',
                color: createMutation.isPending || !projectName.trim() || (step === 'template' && !selectedTemplate)
                  ? 'rgba(26,26,36,0.5)' : '#1A1A24',
                fontSize: 12.5, fontWeight: 700,
                cursor: createMutation.isPending || !projectName.trim() || (step === 'template' && !selectedTemplate)
                  ? 'not-allowed' : 'pointer',
                fontFamily: 'Inter, sans-serif',
                transition: 'background 100ms, box-shadow 100ms',
              }}
              onMouseEnter={(e) => {
                if (!e.currentTarget.disabled) { e.currentTarget.style.background = '#FFED4A'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(255,230,0,0.30)' }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#FFE600'; e.currentTarget.style.boxShadow = 'none'
              }}
            >
              {createMutation.isPending
                ? <><span style={{ width: 12, height: 12, border: '2px solid #1A1A2480', borderTopColor: '#1A1A24', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} /> Creating…</>
                : <><Plus style={{ width: 12, height: 12 }} /> {step === 'template' ? 'Create from Template' : 'Create Project'}</>
              }
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
