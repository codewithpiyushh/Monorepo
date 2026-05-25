import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { enterpriseAPI } from '../api'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/PageState'

export default function ControlsGovernancePage() {
  const [riskLevel, setRiskLevel] = useState('HIGH')
  const [currentApprovals, setCurrentApprovals] = useState('1')

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

  const approvalCheckMutation = useMutation({
    mutationFn: (payload) => enterpriseAPI.enforceApprovalPolicy(payload),
    onError: (err) => toast.error(err.response?.data?.detail || 'Unable to evaluate approval policy'),
  })

  const loading = policyLoading || rulesLoading || depLoading
  const hasError = policyError || rulesError || depError
  const approvalMatrix = policies?.approval_policies || []
  const sodRules = policies?.segregation_of_duties || []
  const workflowPopulation = policies?.workflow_population || {}

  const reusableRuleCount = useMemo(() => rules.filter((row) => row.is_reusable).length, [rules])

  const runApprovalCheck = () => {
    approvalCheckMutation.mutate({
      item_type: 'reconciliation',
      risk_level: riskLevel,
      current_approvals: Number(currentApprovals || 0),
    })
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Policy & Controls Studio"
        subtitle="Segregation-of-duties enforcement, approval policy testing, and reusable control coverage."
        badge={`${sodRules.length} SOD rules`}
      />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {loading ? <LoadingState label="Loading governance controls..." /> : null}

        {!loading && hasError ? (
          <ErrorState
            title="Unable to load governance controls"
            description={policyErr?.response?.data?.detail || rulesErr?.response?.data?.detail || depErr?.response?.data?.detail || 'Please retry in a moment.'}
            action={<button className="btn-secondary" onClick={() => { refetchPolicies(); refetchRules(); refetchDependencies() }}>Retry</button>}
          />
        ) : null}

        {!loading && !hasError && !sodRules.length && !approvalMatrix.length ? (
          <EmptyState title="No governance policies" description="Create workflow activity and rules to activate governance monitoring." />
        ) : null}

        {!loading && !hasError && (sodRules.length || approvalMatrix.length) ? (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="oracle-kpi p-3">
                <p className="text-xs text-slate-400">SOD Rules</p>
                <p className="text-xl font-semibold text-slate-100">{sodRules.length}</p>
              </div>
              <div className="oracle-kpi p-3">
                <p className="text-xs text-slate-400">Approval Tiers</p>
                <p className="text-xl font-semibold text-slate-100">{approvalMatrix.length}</p>
              </div>
              <div className="oracle-kpi p-3">
                <p className="text-xs text-slate-400">Reusable Rules</p>
                <p className="text-xl font-semibold text-slate-100">{reusableRuleCount}</p>
              </div>
              <div className="oracle-kpi p-3">
                <p className="text-xs text-slate-400">Dependencies</p>
                <p className="text-xl font-semibold text-slate-100">{dependencies.length}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="card p-4">
                <p className="text-sm font-semibold text-slate-100 mb-3">Segregation of Duties</p>
                <div className="space-y-2">
                  {sodRules.map((rule) => (
                    <div key={rule.rule} className="rounded-xl border border-surface-700 bg-surface-900/40 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-100">{rule.rule}</p>
                          <p className="mt-1 text-xs text-slate-400">{rule.field_a} cannot equal {rule.field_b}</p>
                        </div>
                        <span className={`text-xs font-semibold ${rule.enabled ? 'text-emerald-300' : 'text-slate-500'}`}>{rule.enabled ? 'Enabled' : 'Disabled'}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-surface-700 p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500 mb-2">Observed Workflow Population</p>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                    <div>Preparers: {(workflowPopulation.preparer_ids || []).join(', ') || '-'}</div>
                    <div>Reviewers: {(workflowPopulation.reviewer_ids || []).join(', ') || '-'}</div>
                    <div>Approvers: {(workflowPopulation.approver_ids || []).join(', ') || '-'}</div>
                    <div>Certifiers: {(workflowPopulation.certifier_ids || []).join(', ') || '-'}</div>
                  </div>
                </div>
              </div>

              <div className="card p-4">
                <p className="text-sm font-semibold text-slate-100 mb-3">Approval Policies</p>
                <div className="space-y-2">
                  {approvalMatrix.map((policy) => (
                    <div key={policy.risk_level} className="rounded-xl border border-surface-700 bg-surface-900/40 p-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-100">{policy.risk_level} Risk</p>
                        <p className="mt-1 text-xs text-slate-400">Required approvals for certification actions</p>
                      </div>
                      <span className="text-lg font-semibold text-slate-100">{policy.required_approvals}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-surface-700 p-3 space-y-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Policy Simulator</p>
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
                    <div className="text-sm text-slate-300">
                      Requires {approvalCheckMutation.data.required_approvals} approvals. Current state: {approvalCheckMutation.data.current_approvals}. {approvalCheckMutation.data.is_satisfied ? 'Policy satisfied.' : 'More approvals needed.'}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="card p-4 overflow-auto">
                <p className="text-sm font-semibold text-slate-100 mb-3">Reusable Rule Governance</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-surface-700">
                      <th className="p-2">Rule</th>
                      <th className="p-2">Type</th>
                      <th className="p-2">Reusable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.slice(0, 12).map((rule) => (
                      <tr key={rule.id} className="border-b border-surface-800">
                        <td className="p-2 text-slate-100">{rule.name}</td>
                        <td className="p-2 text-slate-300">{rule.template_type}</td>
                        <td className="p-2 text-slate-300">{rule.is_reusable ? 'Yes' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card p-4 overflow-auto">
                <p className="text-sm font-semibold text-slate-100 mb-3">Dependency Controls</p>
                {dependencies.length ? (
                  <div className="space-y-2">
                    {dependencies.slice(0, 12).map((dependency) => (
                      <div key={dependency.id} className="rounded-xl border border-surface-700 bg-surface-900/40 p-3">
                        <p className="text-sm font-medium text-slate-100">Parent #{dependency.parent_profile_id} to Child #{dependency.child_profile_id}</p>
                        <p className="mt-1 text-xs text-slate-400">{dependency.dependency_type || 'Dependency'} dependency</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">No reconciliation dependencies configured.</p>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
