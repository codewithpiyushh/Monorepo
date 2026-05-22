import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Clock3,
  ShieldAlert,
} from 'lucide-react'
import { enterpriseAPI, projectsAPI } from '../api'
import PageHeader from '../components/ui/PageHeader'
import { LoadingState } from '../components/ui/PageState'
import { useAuthStore } from '../store/authStore'
import { normalizeRole } from '../utils/roles'

function KpiCard({ label, value, tone = 'default', onClick }) {
  const toneClass = tone === 'warning'
    ? 'border-amber-600/40 bg-amber-900/10'
    : tone === 'danger'
      ? 'border-red-600/40 bg-red-900/10'
      : 'border-surface-700 bg-surface-900/40'

  return (
    <button className={`card p-4 text-left transition hover:-translate-y-0.5 ${toneClass}`} onClick={onClick}>
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-100">{value}</p>
    </button>
  )
}

export default function CommandCenter() {
  const navigate = useNavigate()
  const role = normalizeRole(useAuthStore((s) => s.user?.role))

  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['command-center-metrics', role],
    queryFn: () => role === 'preparer' ? enterpriseAPI.preparerDashboard() : role === 'reviewer' ? enterpriseAPI.reviewerDashboard() : enterpriseAPI.executiveDashboard(),
    refetchInterval: 15000,
  })

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsAPI.list,
  })

  const priorities = useMemo(() => {
    if (!metrics) return []
    const items = []
    if ((metrics.overdue_reconciliations || 0) > 0) {
      items.push({
        title: `${metrics.overdue_reconciliations} overdue reconciliations`,
        description: 'Close owner assignments and due-date slippages first.',
        icon: Clock3,
        to: '/exception-ops',
      })
    }
    if ((metrics.escalation_alerts || 0) > 0) {
      items.push({
        title: `${metrics.escalation_alerts} escalations pending review`,
        description: 'Escalated exception queue requires reviewer attention.',
        icon: ShieldAlert,
        to: '/exception-ops',
      })
    }
    if ((metrics.pending_approvals || 0) > 0) {
      items.push({
        title: `${metrics.pending_approvals} approvals pending`,
        description: 'Clear approvals to keep close-cycle throughput healthy.',
        icon: CheckCircle2,
        to: '/close-certification',
      })
    }
    return items
  }, [metrics])

  const loading = metricsLoading || projectsLoading

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Command Center"
        subtitle="Operate, analyze, and govern reconciliation operations from one role-aware control plane."
        badge={`${projects.length} active project${projects.length !== 1 ? 's' : ''}`}
      />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {loading ? <LoadingState label="Preparing command center..." /> : null}

        {!loading ? (
          <>
            <div className="card oracle-hero p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">Today’s Focus</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-100">{role === 'admin' ? 'Executive Oversight' : role === 'reviewer' ? 'Reviewer Control' : 'Preparer Execution'}</h2>
              <p className="mt-1 text-sm text-slate-400">Prioritize risks first, then stabilize throughput and certification timelines.</p>
            </div>

            <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
              <KpiCard label="Total Reconciliations" value={projects.length} onClick={() => navigate('/reconciliation-runs')} />
              <KpiCard label="Completion" value={`${metrics?.completion_pct ?? 0}%`} onClick={() => navigate('/analytics-explorer')} />
              <KpiCard label="Pending Approvals" value={metrics?.pending_approvals ?? 0} tone="warning" onClick={() => navigate('/close-certification')} />
              <KpiCard label="Overdue" value={metrics?.overdue_reconciliations ?? 0} tone="danger" onClick={() => navigate('/exception-ops')} />
              <KpiCard label="Escalations" value={metrics?.escalation_alerts ?? 0} tone="danger" onClick={() => navigate('/exception-ops')} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
              <div className="card p-4 xl:col-span-2">
                <p className="text-sm font-semibold text-slate-200 mb-3">Priority Queue</p>
                <div className="space-y-2">
                  {priorities.length === 0 ? (
                    <div className="border border-surface-700 p-3 text-sm text-slate-400">No critical blockers right now. Continue routine queue processing.</div>
                  ) : priorities.map((item) => {
                    const Icon = item.icon
                    return (
                      <button key={item.title} className="w-full text-left border border-surface-700 p-3 hover:bg-surface-800/40" onClick={() => navigate(item.to)}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2">
                            <Icon className="w-4 h-4 text-brand-400 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-slate-100">{item.title}</p>
                              <p className="text-xs text-slate-400 mt-1">{item.description}</p>
                            </div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-slate-500" />
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="card p-4">
                <p className="text-sm font-semibold text-slate-200 mb-3">Quick Actions</p>
                <div className="space-y-2">
                  <button className="btn-secondary w-full justify-between" onClick={() => navigate('/reconciliation-runs')}>
                    Reconciliation Runs <Briefcase className="w-4 h-4" />
                  </button>
                  <button className="btn-secondary w-full justify-between" onClick={() => navigate('/exception-ops')}>
                    Exception Ops <AlertTriangle className="w-4 h-4" />
                  </button>
                  <button className="btn-secondary w-full justify-between" onClick={() => navigate('/analytics-explorer')}>
                    Analytics Explorer <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
