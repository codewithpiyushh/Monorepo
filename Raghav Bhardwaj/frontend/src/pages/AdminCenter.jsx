import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { auditAPI, enterpriseAPI } from '../api'
import PageHeader from '../components/ui/PageHeader'
import { ScrollText, Building2, BadgeCheck, ArrowRight } from 'lucide-react'
import { LoadingState } from '../components/ui/PageState'

export default function AdminCenter() {
  const { data: auditPage, isLoading: auditLoading } = useQuery({
    queryKey: ['audit-logs-preview'],
    queryFn: () => auditAPI.list({ page: 1, page_size: 1 }),
  })
  const { data: profiles = [], isLoading: profilesLoading } = useQuery({
    queryKey: ['enterprise-profiles'],
    queryFn: enterpriseAPI.listProfiles,
  })
  const { data: certWorkflows = [], isLoading: workflowsLoading } = useQuery({
    queryKey: ['enterprise-cert-workflows-admin'],
    queryFn: () => enterpriseAPI.listCertificationWorkflows(),
  })
  const loading = auditLoading || profilesLoading || workflowsLoading
  const auditTotal = auditPage?.total || auditPage?.items?.length || 0

  const adminModules = [
    { title: 'Audit Logs', to: '/audit', icon: ScrollText, count: auditTotal, unit: 'events' },
    { title: 'Enterprise Center', to: '/enterprise-center', icon: Building2, count: profiles.length, unit: 'profiles' },
    { title: 'Certification Workflow', to: '/certification-workflow', icon: BadgeCheck, count: certWorkflows.length, unit: 'workflows' },
  ]

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Admin"
        subtitle="Monitor controls, auditability, and enterprise-wide reconciliation operations."
      />
      <div className="flex-1 overflow-auto p-6 md:p-8">
        {loading ? <LoadingState label="Loading admin modules..." /> : null}
        {!loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {adminModules.map((m) => {
            const Icon = m.icon
            return (
              <Link key={m.title} to={m.to} className="card p-5 transition hover:-translate-y-0.5 hover:border-brand-600/40">
                <div className="mb-3 inline-flex rounded-xl border border-surface-600 bg-surface-800 p-2.5">
                  <Icon className="h-4 w-4 text-brand-400" />
                </div>
                <h3 className="text-sm font-semibold text-slate-100">{m.title}</h3>
                <p className="mt-2 text-xs text-slate-400">{m.count} {m.unit}</p>
                <span className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-brand-400">
                  Continue
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            )
          })}
        </div>
        ) : null}
      </div>
    </div>
  )
}
