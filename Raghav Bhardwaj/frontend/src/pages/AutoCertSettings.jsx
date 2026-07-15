import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings2, Zap, CheckCircle2, ShieldCheck, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '../components/ui/PageHeader'
import { LoadingState } from '../components/ui/PageState'
import { useAuthStore } from '../store/authStore'
import { useProjectStore } from '../store/projectStore'
import { autoCertAPI } from '../api'

export default function AutoCertSettings() {
  const qc = useQueryClient()
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId)
  const activeProjectId = selectedProjectId || '1'
  
  const [maxVariance, setMaxVariance] = useState(0.0)
  const [allowExceptions, setAllowExceptions] = useState(false)
  const [allowedRiskLevels, setAllowedRiskLevels] = useState([])

  const { data: rule, isLoading } = useQuery({
    queryKey: ['auto-cert-rule', activeProjectId],
    queryFn: () => autoCertAPI.getRule(activeProjectId),
    enabled: !!activeProjectId,
  })

  useEffect(() => {
    if (rule) {
      setMaxVariance(rule.max_variance)
      setAllowExceptions(rule.allow_exceptions)
      setAllowedRiskLevels((rule.allowed_risk_levels || '').split(',').map(s => s.trim()))
    }
  }, [rule])

  const updateMutation = useMutation({
    mutationFn: (payload) => autoCertAPI.updateRule(activeProjectId, payload),
    onSuccess: () => {
      toast.success('Auto-Cert rules updated')
      qc.invalidateQueries({ queryKey: ['auto-cert-rule'] })
    },
    onError: (e) => toast.error('Update failed: ' + e.message)
  })

  const runMutation = useMutation({
    mutationFn: () => autoCertAPI.runEngine(activeProjectId),
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
      <div className="flex-1 overflow-auto p-8" style={{ background: 'var(--surface-0)' }}>
        {isLoading ? <LoadingState /> : (
          <div className="max-w-5xl w-full mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Rules Panel */}
            <div className="card p-6 flex flex-col">
              <div className="flex items-center gap-3 mb-5 border-b border-[var(--border-1)] pb-4 flex-shrink-0">
                <Settings2 style={{ width: 20, height: 20, color: 'var(--accent)' }} />
                <h3 className="text-base font-semibold text-[var(--text-primary)]">Global Certification Rules</h3>
              </div>

              <div className="space-y-5 flex-1">
                <div>
                  <label className="label">Maximum Allowed Variance ($)</label>
                  <p className="text-xs text-[var(--text-secondary)] mb-2">Profiles with a variance strictly less than or equal to this value are eligible.</p>
                  <input type="number" className="input max-w-[200px]" value={maxVariance} onChange={e => setMaxVariance(parseFloat(e.target.value) || 0)} step="0.01" />
                </div>

                <div>
                  <label className="label">Exception Policy</label>
                  <label className="flex items-start gap-3 cursor-pointer mt-2">
                    <input type="checkbox" className="mt-1" checked={allowExceptions} onChange={e => setAllowExceptions(e.target.checked)} />
                    <span className="text-sm text-[var(--text-primary)] leading-tight">Allow Auto-Certification even if open exceptions exist (Not Recommended)</span>
                  </label>
                </div>

                <div>
                  <label className="label">Eligible Risk Classifications</label>
                  <p className="text-xs text-[var(--text-secondary)] mb-2">Only profiles with these risk levels will be automatically certified.</p>
                  <div className="flex gap-2 mt-2">
                    {['LOW', 'MEDIUM', 'HIGH'].map(level => (
                      <label key={level} className="flex items-center gap-2 cursor-pointer bg-[var(--surface-2)] px-3 py-1.5 rounded-lg border border-[var(--border-1)] hover:bg-[var(--surface-3)] transition-colors">
                        <input type="checkbox" checked={allowedRiskLevels.includes(level)} onChange={() => toggleRisk(level)} />
                        <span className="text-xs font-semibold text-[var(--text-primary)]">{level}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-4 mt-5 border-t border-[var(--border-1)] flex-shrink-0">
                <button className="btn-primary w-full justify-center" onClick={handleSave} disabled={updateMutation.isPending}>
                  Save Rules
                </button>
              </div>
            </div>

            {/* Run Panel */}
            <div className="card p-6 bg-[var(--surface-2)] border-[var(--accent)] border-opacity-30 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <Zap style={{ width: 20, height: 20, color: 'var(--accent)' }} />
                  <h3 className="text-base font-semibold text-[var(--text-primary)]">Run Engine</h3>
                </div>
                <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
                  Trigger the Auto-Certification engine immediately. It will scan all OPEN or SUBMITTED profiles and certify those matching the criteria configured in the Global Certification Rules.
                </p>
              </div>
              
              <button 
                className="btn-primary w-full justify-center h-12 text-sm mt-auto shadow-lg" 
                onClick={() => runMutation.mutate()} 
                disabled={runMutation.isPending}
                style={{ background: 'var(--accent)', color: '#000', border: 'none', fontWeight: 700 }}
              >
                <ShieldCheck style={{ width: 18, height: 18 }} /> Execute Zero-Touch Certification
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
