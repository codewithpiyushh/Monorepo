import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings2, Zap, CheckCircle2, ShieldCheck, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '../components/ui/PageHeader'
import { LoadingState } from '../components/ui/PageState'
import { useAuthStore } from '../store/authStore'
import { autoCertAPI } from '../api'

export default function AutoCertSettings() {
  const qc = useQueryClient()
  const project = useAuthStore((s) => s.project)
  
  const [maxVariance, setMaxVariance] = useState(0.0)
  const [allowExceptions, setAllowExceptions] = useState(false)
  const [allowedRiskLevels, setAllowedRiskLevels] = useState([])

  const { data: rule, isLoading } = useQuery({
    queryKey: ['auto-cert-rule', project?.id],
    queryFn: () => autoCertAPI.getRule(project?.id),
    enabled: !!project?.id,
  })

  useEffect(() => {
    if (rule) {
      setMaxVariance(rule.max_variance)
      setAllowExceptions(rule.allow_exceptions)
      setAllowedRiskLevels((rule.allowed_risk_levels || '').split(',').map(s => s.trim()))
    }
  }, [rule])

  const updateMutation = useMutation({
    mutationFn: (payload) => autoCertAPI.updateRule(project?.id, payload),
    onSuccess: () => {
      toast.success('Auto-Cert rules updated')
      qc.invalidateQueries({ queryKey: ['auto-cert-rule'] })
    },
    onError: (e) => toast.error('Update failed: ' + e.message)
  })

  const runMutation = useMutation({
    mutationFn: () => autoCertAPI.runEngine(project?.id),
    onSuccess: (data) => {
      toast.success(`Engine complete! ${data.certified} certified, ${data.skipped} skipped out of ${data.processed}.`)
    },
    onError: (e) => toast.error('Run failed: ' + e.message)
  })

  const handleSave = () => {
    updateMutation.mutate({
      max_variance: maxVariance,
      allow_exceptions: allowExceptions,
      allowed_risk_levels: allowedRiskLevels.join(',')
    })
  }

  const toggleRisk = (level) => {
    if (allowedRiskLevels.includes(level)) {
      setAllowedRiskLevels(allowedRiskLevels.filter(r => r !== level))
    } else {
      setAllowedRiskLevels([...allowedRiskLevels, level])
    }
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Auto-Certification Engine"
        subtitle="Configure zero-touch certification rules to automate the financial close."
        badge={rule?.is_active ? 'Active' : 'Disabled'}
      />

      <div className="flex-1 overflow-auto p-5" style={{ background: 'var(--surface-0)' }}>
        {isLoading ? <LoadingState /> : (
          <div className="max-w-3xl space-y-6">
            
            {/* Rules Panel */}
            <div className="card p-6">
              <div className="flex items-center gap-3 mb-6 border-b border-[var(--border-1)] pb-4">
                <Settings2 style={{ width: 20, height: 20, color: 'var(--accent)' }} />
                <h3 className="text-base font-semibold text-[var(--text-primary)]">Global Certification Rules</h3>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="label">Maximum Allowed Variance ($)</label>
                  <p className="text-xs text-[var(--text-secondary)] mb-2">Profiles with a variance strictly less than or equal to this value are eligible.</p>
                  <input type="number" className="input max-w-[200px]" value={maxVariance} onChange={e => setMaxVariance(parseFloat(e.target.value) || 0)} step="0.01" />
                </div>

                <div>
                  <label className="label">Exception Policy</label>
                  <label className="flex items-center gap-3 cursor-pointer mt-2">
                    <input type="checkbox" checked={allowExceptions} onChange={e => setAllowExceptions(e.target.checked)} />
                    <span className="text-sm text-[var(--text-primary)]">Allow Auto-Certification even if open exceptions exist (Not Recommended)</span>
                  </label>
                </div>

                <div>
                  <label className="label">Eligible Risk Classifications</label>
                  <p className="text-xs text-[var(--text-secondary)] mb-2">Only profiles with these risk levels will be automatically certified.</p>
                  <div className="flex gap-3 mt-2">
                    {['LOW', 'MEDIUM', 'HIGH'].map(level => (
                      <label key={level} className="flex items-center gap-2 cursor-pointer bg-[var(--surface-2)] px-3 py-2 rounded-lg border border-[var(--border-1)]">
                        <input type="checkbox" checked={allowedRiskLevels.includes(level)} onChange={() => toggleRisk(level)} />
                        <span className="text-xs font-medium text-[var(--text-primary)]">{level}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-[var(--border-1)]">
                  <button className="btn-primary" onClick={handleSave} disabled={updateMutation.isPending}>
                    Save Rules
                  </button>
                </div>
              </div>
            </div>

            {/* Run Panel */}
            <div className="card p-6 bg-[var(--surface-2)] border-[var(--accent)] border-opacity-30">
              <div className="flex items-center gap-3 mb-2">
                <Zap style={{ width: 20, height: 20, color: 'var(--accent)' }} />
                <h3 className="text-base font-semibold text-[var(--text-primary)]">Run Engine</h3>
              </div>
              <p className="text-sm text-[var(--text-secondary)] mb-6">
                Trigger the Auto-Certification engine immediately. It will scan all OPEN or SUBMITTED profiles and certify those matching the criteria above.
              </p>
              
              <button 
                className="btn-primary w-full justify-center h-12 text-sm" 
                onClick={() => runMutation.mutate()} 
                disabled={runMutation.isPending}
                style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
              >
                <ShieldCheck style={{ width: 16, height: 16 }} /> Execute Zero-Touch Certification
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
