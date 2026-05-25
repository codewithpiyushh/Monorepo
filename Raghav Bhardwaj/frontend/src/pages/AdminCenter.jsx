import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { auditAPI, enterpriseAPI } from '../api'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, LoadingState } from '../components/ui/PageState'

const TABS = [
  { id: 'audit', label: 'Audit Logs' },
  { id: 'enterprise', label: 'Enterprise Queue' },
  { id: 'certification', label: 'Certification Workflow' },
]

export default function AdminCenter() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('audit')

  const { data: auditPage, isLoading: auditLoading } = useQuery({
    queryKey: ['admin-audit-preview'],
    queryFn: () => auditAPI.list({ page: 1, page_size: 15 }),
  })
  const { data: profiles = [], isLoading: profilesLoading } = useQuery({
    queryKey: ['admin-profiles'],
    queryFn: enterpriseAPI.listProfiles,
  })
  const { data: workflows = [], isLoading: workflowsLoading } = useQuery({
    queryKey: ['admin-cert-workflows'],
    queryFn: () => enterpriseAPI.listCertificationWorkflows(),
  })

  const loading = auditLoading || profilesLoading || workflowsLoading
  const auditItems = auditPage?.items || []
  const auditTotal = auditPage?.total || auditItems.length

  const summary = useMemo(
    () => ({
      auditTotal,
      profiles: profiles.length,
      workflows: workflows.length,
    }),
    [auditTotal, profiles.length, workflows.length],
  )

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Admin Operations"
        subtitle="Unified control plane for audit monitoring, enterprise profile queue, and certification workflows."
        badge={`${summary.auditTotal} audit events`}
      />
      <div className="flex-1 overflow-auto p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="oracle-kpi p-3"><p className="text-xs text-slate-400">Audit Events</p><p className="text-lg font-semibold text-slate-100">{summary.auditTotal}</p></div>
          <div className="oracle-kpi p-3"><p className="text-xs text-slate-400">Profiles</p><p className="text-lg font-semibold text-slate-100">{summary.profiles}</p></div>
          <div className="oracle-kpi p-3"><p className="text-xs text-slate-400">Certification Workflows</p><p className="text-lg font-semibold text-slate-100">{summary.workflows}</p></div>
        </div>

        <div className="card p-2 flex items-center gap-2 flex-wrap">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`px-3 py-2 text-sm rounded-lg border ${activeTab === tab.id ? 'bg-brand-900/30 border-brand-700/40 text-slate-100' : 'bg-surface-900/40 border-surface-700 text-slate-300'}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? <LoadingState label="Loading admin operations..." /> : null}

        {!loading && activeTab === 'audit' ? (
          <div className="card p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-sm font-semibold text-slate-100">Audit Log Preview</p>
              <button className="btn-secondary" onClick={() => navigate('/audit')}>Open Full Audit Logs</button>
            </div>
            {!auditItems.length ? <EmptyState title="No audit logs" description="No events available yet." /> : null}
            {auditItems.length ? (
              <div className="max-h-[520px] overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-surface-700">
                      <th className="p-2">Timestamp</th>
                      <th className="p-2">User</th>
                      <th className="p-2">Action</th>
                      <th className="p-2">Entity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditItems.map((item) => (
                      <tr key={item.id} className="border-b border-surface-800">
                        <td className="p-2 text-slate-300">{item.created_at ? new Date(item.created_at).toLocaleString() : '-'}</td>
                        <td className="p-2 text-slate-300">{item.username || '-'}</td>
                        <td className="p-2 text-slate-200">{item.action || '-'}</td>
                        <td className="p-2 text-slate-300">{item.entity_type || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}

        {!loading && activeTab === 'enterprise' ? (
          <div className="card p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-sm font-semibold text-slate-100">Enterprise Profile Queue</p>
              <button className="btn-secondary" onClick={() => navigate('/enterprise-center')}>Open Full Enterprise Center</button>
            </div>
            {!profiles.length ? <EmptyState title="No profiles" description="No enterprise profiles found." /> : null}
            {profiles.length ? (
              <div className="max-h-[520px] overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-surface-700">
                      <th className="p-2">Profile</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Risk</th>
                      <th className="p-2">Type</th>
                      <th className="p-2">Frequency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map((row) => (
                      <tr key={row.id} className="border-b border-surface-800">
                        <td className="p-2 text-slate-100">{row.name}</td>
                        <td className="p-2 text-slate-300">{row.lifecycle_state || '-'}</td>
                        <td className="p-2 text-slate-300">{row.risk_classification || '-'}</td>
                        <td className="p-2 text-slate-300">{row.reconciliation_type || '-'}</td>
                        <td className="p-2 text-slate-300">{row.frequency || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}

        {!loading && activeTab === 'certification' ? (
          <div className="card p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-sm font-semibold text-slate-100">Certification Workflow Queue</p>
              <button className="btn-secondary" onClick={() => navigate('/certification-workflow')}>Open Full Certification Workflow</button>
            </div>
            {!workflows.length ? <EmptyState title="No workflows" description="No certification workflows exist yet." /> : null}
            {workflows.length ? (
              <div className="max-h-[520px] overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-surface-700">
                      <th className="p-2">Workflow ID</th>
                      <th className="p-2">Profile ID</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Stage</th>
                      <th className="p-2">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workflows.map((row) => (
                      <tr key={row.id} className="border-b border-surface-800">
                        <td className="p-2 text-slate-100">#{row.id}</td>
                        <td className="p-2 text-slate-300">{row.profile_id || '-'}</td>
                        <td className="p-2 text-slate-300">{row.status || '-'}</td>
                        <td className="p-2 text-slate-300">{row.current_stage || '-'}</td>
                        <td className="p-2 text-slate-300">{row.updated_at ? new Date(row.updated_at).toLocaleString() : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
