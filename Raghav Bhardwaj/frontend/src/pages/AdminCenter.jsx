import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { auditAPI, enterpriseAPI } from '../api'
import { useProjectStore } from '../store/projectStore'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, LoadingState } from '../components/ui/PageState'
import { ArrowRight } from 'lucide-react'

const TABS = [
  { id: 'audit',         label: 'Audit Logs' },
  { id: 'enterprise',    label: 'Enterprise Queue' },
  { id: 'certification', label: 'Certification Workflow' },
]

function StatusBadge({ value }) {
  if (!value) return <span style={{ color: 'var(--text-disabled)' }}>—</span>
  const v = String(value).toUpperCase()
  const tone = v.includes('OPEN') || v.includes('ACTIVE') ? 'warning'
    : v.includes('CLOSED') || v.includes('DONE') || v.includes('CERTIFIED') ? 'success'
    : v.includes('FAIL') || v.includes('ERROR') ? 'danger' : 'neutral'
  return <span className={`badge badge-${tone}`}>{value}</span>
}

function RiskBadge({ value }) {
  if (!value) return <span style={{ color: 'var(--text-disabled)' }}>—</span>
  const v = String(value).toUpperCase()
  const tone = v === 'HIGH' ? 'danger' : v === 'MEDIUM' ? 'warning' : 'success'
  return <span className={`badge badge-${tone}`}>{value}</span>
}

export default function AdminCenter() {
  const navigate   = useNavigate()
  const [activeTab, setActiveTab] = useState('audit')
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId)

  const { data: auditPage,   isLoading: auditLoading }    = useQuery({ queryKey: ['admin-audit-preview'],  queryFn: () => auditAPI.list({ page: 1, page_size: 15 }) })
  const { data: profiles = [],isLoading: profilesLoading } = useQuery({ queryKey: ['admin-profiles', selectedProjectId || 'all'], queryFn: () => enterpriseAPI.listProfiles(selectedProjectId ? Number(selectedProjectId) : undefined) })
  const { data: workflows = [],isLoading: workflowsLoading}= useQuery({ queryKey: ['admin-cert-workflows'], queryFn: () => enterpriseAPI.listCertificationWorkflows() })

  const loading    = auditLoading || profilesLoading || workflowsLoading
  const auditItems = auditPage?.items || []
  const auditTotal = auditPage?.total || auditItems.length

  const summary = useMemo(() => ({
    auditTotal,
    profiles: profiles.length,
    workflows: workflows.length,
  }), [auditTotal, profiles.length, workflows.length])

  const tabsWithCount = [
    { id: 'audit',         label: 'Audit Logs',             count: summary.auditTotal },
    { id: 'enterprise',    label: 'Enterprise Queue',        count: summary.profiles },
    { id: 'certification', label: 'Certification Workflow',  count: summary.workflows },
  ]

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Admin Operations"
        subtitle="Audit monitoring, enterprise profile queue, and certification workflows."
        badge={`${summary.auditTotal} audit events`}
        tabs={tabsWithCount}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <div className="flex-1 overflow-auto p-5 space-y-4" style={{ background: 'var(--surface-0)' }}>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            { label: 'Audit Events',            value: summary.auditTotal,  tone: '' },
            { label: 'Enterprise Profiles',     value: summary.profiles,    tone: '' },
            { label: 'Certification Workflows', value: summary.workflows,   tone: '' },
          ].map((k) => (
            <div key={k.label} className="kpi-card kpi-accent">
              <p className="kpi-label">{k.label}</p>
              <p className="kpi-value">{k.value}</p>
            </div>
          ))}
        </div>

        {loading ? <LoadingState /> : null}

        {/* Audit tab */}
        {!loading && activeTab === 'audit' && (
          <div className="bl-section">
            <div className="bl-section-header">
              <p className="bl-section-title">Audit Log — Recent Events</p>
              <button className="btn-secondary btn-sm" onClick={() => navigate('/audit')}>
                View All <ArrowRight style={{ width: 11, height: 11 }} />
              </button>
            </div>
            {!auditItems.length ? (
              <div style={{ padding: 20 }}><EmptyState title="No audit logs" description="No events available yet." /></div>
            ) : (
              <div style={{ overflow: 'auto' }} className="slim-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>User</th>
                      <th>Action</th>
                      <th>Entity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditItems.map((item) => (
                      <tr key={item.id}>
                        <td style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}>
                          {item.created_at ? new Date(item.created_at).toLocaleString() : '—'}
                        </td>
                        <td>{item.username || '—'}</td>
                        <td>
                          <span className="badge badge-accent" style={{ fontSize: 9.5 }}>
                            {item.action || '—'}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>{item.entity_type || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Enterprise tab */}
        {!loading && activeTab === 'enterprise' && (
          <div className="bl-section">
            <div className="bl-section-header">
              <p className="bl-section-title">Enterprise Profile Queue</p>
              <button className="btn-secondary btn-sm" onClick={() => navigate('/enterprise-center')}>
                Open Full Center <ArrowRight style={{ width: 11, height: 11 }} />
              </button>
            </div>
            {!profiles.length ? (
              <div style={{ padding: 20 }}><EmptyState title="No profiles" description="No enterprise profiles found." /></div>
            ) : (
              <div style={{ overflow: 'auto' }} className="slim-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Profile Name</th>
                      <th>Status</th>
                      <th>Risk</th>
                      <th>Type</th>
                      <th>Frequency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map((row) => (
                      <tr key={row.id}>
                        <td style={{ fontWeight: 600 }}>{row.name}</td>
                        <td><StatusBadge value={row.lifecycle_state} /></td>
                        <td><RiskBadge value={row.risk_classification} /></td>
                        <td style={{ color: 'var(--text-secondary)' }}>{row.reconciliation_type || '—'}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{row.frequency || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Certification tab */}
        {!loading && activeTab === 'certification' && (
          <div className="bl-section">
            <div className="bl-section-header">
              <p className="bl-section-title">Certification Workflow Queue</p>
              <button className="btn-secondary btn-sm" onClick={() => navigate('/certification-workflow')}>
                Open Full Workflow <ArrowRight style={{ width: 11, height: 11 }} />
              </button>
            </div>
            {!workflows.length ? (
              <div style={{ padding: 20 }}><EmptyState title="No workflows" description="No certification workflows exist yet." /></div>
            ) : (
              <div style={{ overflow: 'auto' }} className="slim-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Workflow ID</th>
                      <th>Profile ID</th>
                      <th>Status</th>
                      <th>Stage</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workflows.map((row) => (
                      <tr key={row.id}>
                        <td style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 600 }}>#{row.id}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{row.profile_id || '—'}</td>
                        <td><StatusBadge value={row.status} /></td>
                        <td style={{ color: 'var(--text-secondary)' }}>{row.current_stage || '—'}</td>
                        <td style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}>
                          {row.updated_at ? new Date(row.updated_at).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
