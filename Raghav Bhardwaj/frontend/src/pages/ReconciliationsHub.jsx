import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { enterpriseAPI, schedulesAPI } from '../api'
import PageHeader from '../components/ui/PageHeader'
import { Workflow, CalendarDays, SlidersHorizontal, ArrowRight, BarChart3 } from 'lucide-react'
import { LoadingState } from '../components/ui/PageState'

export default function ReconciliationsHub() {
  const { data: profiles = [], isLoading: profilesLoading } = useQuery({
    queryKey: ['enterprise-profiles'],
    queryFn: enterpriseAPI.listProfiles,
  })
  const { data: schedules = [], isLoading: schedulesLoading } = useQuery({
    queryKey: ['schedules'],
    queryFn: schedulesAPI.list,
  })
  const { data: ruleDefs = [], isLoading: rulesLoading } = useQuery({
    queryKey: ['rule-definitions'],
    queryFn: () => enterpriseAPI.listRuleDefinitions(),
  })
  const loading = profilesLoading || schedulesLoading || rulesLoading

  const modules = [
    { title: 'Reconciliation Profiles', to: '/reconciliation-profiles', icon: Workflow, count: profiles.length, unit: 'profiles' },
    { title: 'Close Calendar', to: '/close-calendar', icon: CalendarDays, count: schedules.length, unit: 'schedules' },
    { title: 'Rule Builder', to: '/rule-builder', icon: SlidersHorizontal, count: ruleDefs.length, unit: 'rules' },
    { title: 'Analytics Explorer', to: '/reconciliation-analytics', icon: BarChart3, count: profiles.length, unit: 'drill-ready views' },
  ]

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Reconciliations"
        subtitle="Manage profile setup, close schedules, and matching rules from one place."
      />
      <div className="flex-1 overflow-auto p-6 md:p-8">
        {loading ? <LoadingState label="Loading reconciliation modules..." /> : null}
        {!loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((m) => {
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
