import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { enterpriseAPI, compliancePolicyAPI } from '../api'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/PageState'
import { useAuthStore } from '../store/authStore'
import { normalizeRole } from '../utils/roles'

export default function ControlsGovernancePage() {
  const [riskLevel, setRiskLevel] = useState('HIGH')
  const [currentApprovals, setCurrentApprovals] = useState('1')
  const { user } = useAuthStore()
  const role = normalizeRole(user?.role)
  const canRunApprovalCheck = ['admin', 'approver'].includes(role)

  const pageBg = 'linear-gradient(180deg, #fafbff 0%, #f5f7fb 50%, #eef2f7 100%)'
  const panelStyle = {
    background: 'rgba(255,255,255,0.9)',
    border: '1px solid rgba(148,163,184,0.22)',
    boxShadow: '0 16px 40px rgba(15,23,42,0.06)',
    backdropFilter: 'blur(10px)',
    borderRadius: 18,
  }

  const { data: policies, isLoading: policyLoading, isError: policyError, error: policyErr, refetch: refetchPolicies } = useQuery({
    queryKey: ['governance-policies'],
    queryFn: enterpriseAPI.getGovernancePolicies,
  })
  const { data: rules = [], isLoading: rulesLoading, isError: rulesError, error: rulesErr, refetch: refetchRules } = useQuery({
    queryKey: ['rule-definitions-governance'],
    queryFn: () => enterpriseAPI.listRuleDefinitions(),
  })
  const { data: dependencies = [], isLoading: depLoading, isError: depError, error: depErr, refetch: refetchDependencies } = useQuery({
    queryKey: ['dependencies-governance'],
    queryFn: () => enterpriseAPI.listDependencies(),
  })
  const { data: compliancePolicies = [], isLoading: cpLoading } = useQuery({
    queryKey: ['compliance-policies-governance'],
    queryFn: compliancePolicyAPI.list,
  })

  const approvalCheckMutation = useMutation({
    mutationFn: (payload) => enterpriseAPI.enforceApprovalPolicy(payload),
    onError: (err) => toast.error(err.response?.data?.detail || 'Unable to evaluate approval policy'),
  })

  const loading = policyLoading || rulesLoading || depLoading || cpLoading
  const hasError = policyError || rulesError || depError

  const approvalMatrix = policies?.approval_policies || []
  const sodRules = policies?.segregation_of_duties || []
  const workflowPopulation = policies?.workflow_population || {}
  const complianceControls = policies?.compliance_controls || []
  const approvalRulesFromBackend = policies?.approval_rules || []

  const reusableRuleCount = useMemo(() => rules.filter((row) => row.is_reusable).length, [rules])

  const runApprovalCheck = () => {
    approvalCheckMutation.mutate({
      item_type: 'reconciliation',
      risk_level: riskLevel,
      current_approvals: Number(currentApprovals || 0),
    })
  }

  return (
    <div className="h-full flex flex-col" style={{ background: pageBg, color: '#0f172a' }}>

      {/* Flush KPI Banner */}
      {!loading && !hasError && (sodRules.length || approvalMatrix.length) ? (
        <div style={{ background: 'var(--surface-0)', borderBottom: '1px solid var(--border-1)' }}>
          <div style={{ display: 'flex', overflowX: 'auto' }} className="slim-scroll">
            {[
              ['SOD Rules', sodRules.length],
              ['Approval Tiers', approvalMatrix.length],
              ['Reusable Rules', reusableRuleCount],
              ['Dependencies', dependencies.length],
              ['Compliance Controls', complianceControls.length + compliancePolicies.length]
            ].map(([label, val], index, arr) => (
              <div key={label} style={{ flex: 1, minWidth: 160, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 24px', borderRight: index === arr.length - 1 ? 'none' : '1px solid var(--border-1)' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{val}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {loading ? <LoadingState message="Loading governance controls..." /> : null}

        {!loading && hasError ? (
          <ErrorState
            message={
              policyErr?.response?.data?.detail ||
              rulesErr?.response?.data?.detail ||
              depErr?.response?.data?.detail ||
              'Unable to load governance controls.'
            }
            onRetry={() => {
              refetchPolicies()
              refetchRules()
              refetchDependencies()
            }}
          />
        ) : null}

        {!loading && !hasError && !sodRules.length && !approvalMatrix.length ? (
          <EmptyState
            title="No governance policies"
            description="Create workflow activity and rules to activate governance monitoring."
          />
        ) : null}

        {!loading && !hasError && (sodRules.length || approvalMatrix.length) ? (
          <>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <section className="p-4" style={panelStyle}>
                <SectionTitle>Segregation of Duties</SectionTitle>
                <div className="space-y-2">
                  {sodRules.map((rule) => (
                    <RuleRow
                      key={rule.rule}
                      title={rule.rule}
                      subtitle={`${rule.field_a} cannot equal ${rule.field_b}`}
                      active={rule.enabled}
                    />
                  ))}
                </div>

                <div className="mt-4 rounded-xl border p-3" style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}>
                  <p className="text-xs uppercase tracking-[0.14em] mb-2" style={{ color: '#64748b' }}>
                    Observed Workflow Population
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: '#334155' }}>
                    <div>Preparers: {(workflowPopulation.preparer_ids || []).join(', ') || '-'}</div>
                    <div>Reviewers: {(workflowPopulation.reviewer_ids || []).join(', ') || '-'}</div>
                    <div>Approvers: {(workflowPopulation.approver_ids || []).join(', ') || '-'}</div>
                    <div>Certifiers: {(workflowPopulation.certifier_ids || []).join(', ') || '-'}</div>
                  </div>
                </div>
              </section>

              <section className="p-4" style={panelStyle}>
                <SectionTitle>Approval Policies</SectionTitle>
                <div className="space-y-2">
                  {approvalMatrix.map((policy) => (
                    <div
                      key={policy.risk_level}
                      className="rounded-xl border p-3 flex items-center justify-between gap-3"
                      style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}
                    >
                      <div>
                        <p className="text-sm font-medium" style={{ color: '#0f172a' }}>
                          {policy.risk_level} Risk
                        </p>
                        <p className="mt-1 text-xs" style={{ color: '#64748b' }}>
                          Required approvals for certification actions
                        </p>
                      </div>
                      <span className="text-lg font-semibold" style={{ color: '#0f172a' }}>
                        {policy.required_approvals}
                      </span>
                    </div>
                  ))}

                  {approvalRulesFromBackend.length > 0 && (
                    <>
                      <p className="text-xs uppercase tracking-[0.14em] mt-3 mb-1" style={{ color: '#64748b' }}>
                        Backend Approval Rules
                      </p>
                      {approvalRulesFromBackend.map((rule, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border p-3 flex items-center justify-between gap-3"
                          style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}
                        >
                          <div>
                            <p className="text-sm font-medium" style={{ color: '#0f172a' }}>
                              {rule.name || rule.rule_name || `Rule ${idx + 1}`}
                            </p>
                            <p className="mt-1 text-xs" style={{ color: '#64748b' }}>
                              {rule.description || 'Approval rule from backend'}
                            </p>
                          </div>
                          <span className={`text-xs font-semibold ${rule.is_active || rule.enabled ? 'text-emerald-600' : 'text-slate-500'}`}>
                            {rule.is_active || rule.enabled ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                </div>

                <div className="mt-4 rounded-xl border p-3 space-y-3" style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}>
                  <p className="text-xs uppercase tracking-[0.14em]" style={{ color: '#64748b' }}>
                    Policy Simulator
                  </p>
                  {canRunApprovalCheck ? (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <select className="input" value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)}>
                          <option value="LOW">LOW</option>
                          <option value="MEDIUM">MEDIUM</option>
                          <option value="HIGH">HIGH</option>
                          <option value="CRITICAL">CRITICAL</option>
                        </select>
                        <input className="input" value={currentApprovals} onChange={(e) => setCurrentApprovals(e.target.value)} />
                        <button className="btn-secondary" onClick={runApprovalCheck} disabled={approvalCheckMutation.isPending}>
                          {approvalCheckMutation.isPending ? 'Checking...' : 'Check Policy'}
                        </button>
                      </div>
                      {approvalCheckMutation.data ? (
                        <div className="text-sm" style={{ color: '#334155' }}>
                          Requires {approvalCheckMutation.data.required_approvals} approvals. Current state: {approvalCheckMutation.data.current_approvals}. {approvalCheckMutation.data.is_satisfied ? 'Policy satisfied.' : 'More approvals needed.'}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-sm" style={{ color: '#64748b' }}>
                      Approval simulator is read-only for certifier users.
                    </p>
                  )}
                </div>
              </section>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <section className="p-4 overflow-auto" style={panelStyle}>
                <SectionTitle>Reusable Rule Governance</SectionTitle>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b" style={{ color: '#64748b', borderColor: '#e2e8f0' }}>
                      <th className="p-2">Rule</th>
                      <th className="p-2">Type</th>
                      <th className="p-2">Reusable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.slice(0, 12).map((rule) => (
                      <tr key={rule.id} className="border-b" style={{ borderColor: '#eef2f7' }}>
                        <td className="p-2" style={{ color: '#0f172a' }}>{rule.name}</td>
                        <td className="p-2" style={{ color: '#334155' }}>{rule.template_type}</td>
                        <td className="p-2" style={{ color: '#334155' }}>{rule.is_reusable ? 'Yes' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="p-4 overflow-auto" style={panelStyle}>
                <SectionTitle>Dependency Controls</SectionTitle>
                {dependencies.length ? (
                  <div className="space-y-2">
                    {dependencies.slice(0, 12).map((dependency) => (
                      <div
                        key={dependency.id}
                        className="rounded-xl border p-3"
                        style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}
                      >
                        <p className="text-sm font-medium" style={{ color: '#0f172a' }}>
                          Parent #{dependency.parent_profile_id} to Child #{dependency.child_profile_id}
                        </p>
                        <p className="mt-1 text-xs" style={{ color: '#64748b' }}>
                          {dependency.dependency_type || 'Dependency'} dependency
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: '#64748b' }}>No reconciliation dependencies configured.</p>
                )}
              </section>
            </div>

            <section className="p-4 overflow-auto" style={panelStyle}>
              <SectionTitle>Compliance Controls</SectionTitle>
              {compliancePolicies.length ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b" style={{ color: '#64748b', borderColor: '#e2e8f0' }}>
                      <th className="p-2">Control Name</th>
                      <th className="p-2">Category</th>
                      <th className="p-2">Threshold</th>
                      <th className="p-2">Violations</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compliancePolicies.map((cp) => (
                      <tr key={cp.id} className="border-b" style={{ borderColor: '#eef2f7' }}>
                        <td className="p-2" style={{ color: '#0f172a' }}>{cp.control_name || 'Unnamed'}</td>
                        <td className="p-2" style={{ color: '#334155' }}>{cp.category || '-'}</td>
                        <td className="p-2" style={{ color: '#334155' }}>{cp.violation_threshold ?? '-'}</td>
                        <td className="p-2" style={{ color: '#334155' }}>{cp.current_violations ?? 0}</td>
                        <td className="p-2">
                          <span className={`text-xs font-semibold ${cp.is_active ? 'text-emerald-600' : 'text-slate-500'}`}>
                            {cp.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm" style={{ color: '#64748b' }}>No compliance controls configured.</p>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  )
}

function MetricCard({ label, value, style }) {
  return (
    <div className="p-3" style={style}>
      <p className="text-xs font-medium" style={{ color: '#64748b' }}>{label}</p>
      <p className="text-xl font-semibold mt-1" style={{ color: '#0f172a' }}>{value}</p>
    </div>
  )
}

function RuleRow({ title, subtitle, active }) {
  return (
    <div className="rounded-xl border p-3" style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium" style={{ color: '#0f172a' }}>{title}</p>
          <p className="mt-1 text-xs" style={{ color: '#64748b' }}>{subtitle}</p>
        </div>
        <span className={`text-xs font-semibold ${active ? 'text-emerald-600' : 'text-slate-500'}`}>
          {active ? 'Enabled' : 'Disabled'}
        </span>
      </div>
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <p className="text-sm font-semibold mb-3" style={{ color: '#0f172a' }}>{children}</p>
  )
}
