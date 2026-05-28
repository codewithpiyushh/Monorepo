import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { projectsAPI } from '../api'
import { useThemeStore } from '../store/themeStore'

const TEMPLATES = [
  {
    id: 'bank_reconciliation',
    name: 'Bank Reconciliation',
    description: 'Match bank statements with ledger transactions',
    icon: '🏦',
  },
  {
    id: 'vendor_reconciliation',
    name: 'Vendor Reconciliation',
    description: 'Reconcile vendor invoices and payments',
    icon: '🤝',
  },
  {
    id: 'intercompany',
    name: 'Intercompany AP/AR',
    description: 'Match intercompany transactions between entities',
    icon: '🔗',
  },
  {
    id: 'payroll_clearing',
    name: 'Payroll Clearing',
    description: 'Reconcile payroll clearing accounts',
    icon: '👥',
  },
]

export default function ProjectCreationModal({ isOpen, onClose }) {
  const qc = useQueryClient()
  const { theme } = useThemeStore()
  const isLightTheme = theme === 'light'
  const [step, setStep] = useState('choice') // 'choice', 'template', 'custom'
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [projectName, setProjectName] = useState('')

  const createMutation = useMutation({
    mutationFn: (payload) => projectsAPI.create(payload),
    onSuccess: (data) => {
      toast.success(`Project "${data.name}" created`)
      qc.invalidateQueries({ queryKey: ['projects'] })
      handleClose()
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed to create project'),
  })

  const handleClose = () => {
    setStep('choice')
    setSelectedTemplate(null)
    setProjectName('')
    onClose()
  }

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      toast.error('Project name is required')
      return
    }

    const payload = {
      name: projectName,
      description: selectedTemplate ? `Based on ${selectedTemplate.name} template` : 'Custom project',
      template_type: selectedTemplate?.id || 'custom',
    }

    createMutation.mutate(payload)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="card border-surface-700 rounded-2xl max-w-xl w-full max-h-[85vh] overflow-y-auto shadow-2xl bg-white dark:bg-slate-950">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-blue-300 dark:border-blue-500 sticky top-0 bg-blue-500 dark:bg-blue-600">
          <div>
            <h2 className="text-base font-semibold text-black dark:text-white">Create New Project</h2>
            <p className="text-xs text-black/70 dark:text-slate-300 mt-1">Choose a template or start custom</p>
          </div>
          <button onClick={handleClose} className="text-black/70 dark:text-slate-200 hover:text-black dark:hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {step === 'choice' && (
            <div className="space-y-3">
              <button
                onClick={() => setStep('template')}
                className={`group w-full border rounded-2xl p-4 text-left transition hover:bg-sky-100 ${isLightTheme ? 'border-slate-300 bg-white text-black' : 'border-slate-700 bg-slate-950 text-white'} ${!isLightTheme ? 'dark:hover:bg-sky-600' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className={`font-semibold ${isLightTheme ? 'text-black group-hover:text-black' : 'text-white group-hover:text-white'}`}>Use Predefined Template</h3>
                    <p className={`text-sm ${isLightTheme ? 'text-black/70 group-hover:text-black/90' : 'text-slate-300 group-hover:text-white/90'} mt-2`}>Start with a pre-configured reconciliation template to speed up setup.</p>
                  </div>
                  <Plus className={`w-4 h-4 ${isLightTheme ? 'text-black group-hover:text-black' : 'text-white group-hover:text-white'} flex-shrink-0 mt-1`} />
                </div>
              </button>

              <button
                onClick={() => setStep('custom')}
                className={`group w-full border rounded-2xl p-4 text-left transition hover:bg-sky-100 ${isLightTheme ? 'border-slate-300 bg-white text-black' : 'border-slate-700 bg-slate-950 text-white'} ${!isLightTheme ? 'dark:hover:bg-sky-600' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className={`font-semibold ${isLightTheme ? 'text-black group-hover:text-black' : 'text-white group-hover:text-white'}`}>Start Custom Project</h3>
                    <p className={`text-sm ${isLightTheme ? 'text-black/70 group-hover:text-black/90' : 'text-slate-300 group-hover:text-white/90'} mt-2`}>Create a blank project and configure from scratch for maximum flexibility.</p>
                  </div>
                  <Plus className={`w-4 h-4 ${isLightTheme ? 'text-black group-hover:text-black' : 'text-white group-hover:text-white'} flex-shrink-0 mt-1`} />
                </div>
              </button>
            </div>
          )}

          {step === 'template' && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-black block mb-3">Select Template</label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTemplate(t)}
                      className={`border rounded-2xl p-3 text-left transition text-black dark:text-white ${
                        selectedTemplate?.id === t.id
                          ? 'border-blue-500 bg-blue-100 dark:bg-blue-600/20'
                          : 'border-slate-300 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-700'
                      }`}
                    >
                      <div className="text-xl mb-2">{t.icon}</div>
                      <h4 className="font-semibold text-black text-sm">{t.name}</h4>
                      <p className="text-xs text-black/70 mt-1">{t.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {selectedTemplate && (
                <div>
                  <label className="text-sm font-semibold text-black block mb-2">Project Name</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g., Monthly Bank Reconciliation"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                  />
                </div>
              )}

              <div className="flex flex-col gap-2 pt-4 sm:flex-row">
                <button className="btn-secondary w-full sm:flex-1" onClick={() => setStep('choice')}>Back</button>
                <button
                  className="btn-primary w-full sm:flex-1"
                  onClick={handleCreateProject}
                  disabled={!selectedTemplate || !projectName.trim() || createMutation.isPending}
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </div>
          )}

          {step === 'custom' && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-black dark:text-white block mb-2">Project Name</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Enter project name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-xs text-black dark:text-slate-300">
                <p className="font-semibold text-black dark:text-white mb-2">Custom Project</p>
                <p>You will configure reconciliation rules, matching logic, and workflows during setup. Start with uploading your source and target datasets.</p>
              </div>

              <div className="flex flex-col gap-2 pt-4 sm:flex-row">
                <button className="btn-secondary w-full sm:flex-1" onClick={() => setStep('choice')}>Back</button>
                <button
                  className="btn-primary w-full sm:flex-1"
                  onClick={handleCreateProject}
                  disabled={!projectName.trim() || createMutation.isPending}
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Custom Project'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
