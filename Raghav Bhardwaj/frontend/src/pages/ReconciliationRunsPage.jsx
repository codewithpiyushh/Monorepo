import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { datasetsAPI, executionsAPI, mappingsAPI, projectsAPI, rulesAPI } from '../api'
import { ArrowRight, Database, PlayCircle, ShieldCheck } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/PageState'

function parseStats(statsRaw) {
  if (!statsRaw) return null
  if (typeof statsRaw === 'object') return statsRaw
  try {
    return JSON.parse(statsRaw)
  } catch {
    return null
  }
}

export default function ReconciliationRunsPage() {
  const navigate = useNavigate()
  const [details, setDetails] = useState({})

  const { data: projects = [], isLoading, isError, error, refetch } = useQuery({ queryKey: ['projects'], queryFn: projectsAPI.list })

  useEffect(() => {
    if (!projects.length) {
      setDetails({})
      return
    }
    let cancelled = false
    ;(async () => {
      const entries = await Promise.all(projects.map(async (p) => {
        const [datasetsRes, mappingsRes, rulesRes, execRes] = await Promise.allSettled([
          datasetsAPI.list(p.id),
          mappingsAPI.list(p.id),
          rulesAPI.list(p.id),
          executionsAPI.list(p.id),
        ])
        const datasets = datasetsRes.status === 'fulfilled' ? datasetsRes.value : []
        const mappings = mappingsRes.status === 'fulfilled' ? mappingsRes.value : []
        const rules = rulesRes.status === 'fulfilled' ? rulesRes.value : []
        const executions = execRes.status === 'fulfilled' ? execRes.value : []
        const latest = executions[0] || null
        const stats = parseStats(latest?.stats)
        return [p.id, {
          sourceReady: datasets.some((d) => d.dataset_type === 'source'),
          targetReady: datasets.some((d) => d.dataset_type === 'target'),
          mappings: mappings.length,
          rules: rules.filter((r) => r.is_active).length,
          latestStatus: latest?.status || 'not run',
          matchRate: stats?.match_rate ?? null,
        }]
      }))
      if (!cancelled) setDetails(Object.fromEntries(entries))
    })()
    return () => { cancelled = true }
  }, [projects])

  const runHealth = useMemo(() => {
    const total = projects.length
    const ready = projects.filter((p) => {
      const d = details[p.id]
      return d?.sourceReady && d?.targetReady && d?.mappings > 0 && d?.rules > 0
    }).length
    return { total, ready, blocked: Math.max(total - ready, 0) }
  }, [projects, details])

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Auto Reconciliation"
        subtitle="Pipeline-first execution workspace for ingestion readiness, controls coverage, and run progression."
        badge={`${runHealth.ready}/${runHealth.total} ready`}
      />
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {isLoading ? <LoadingState label="Loading reconciliation runs..." /> : null}
        {!isLoading && isError ? (
          <ErrorState
            title="Unable to load projects"
            description={error?.response?.data?.detail || 'Project service is unavailable right now.'}
            action={<button className="btn-secondary" onClick={() => refetch()}>Retry</button>}
          />
        ) : null}
        {!isLoading && !isError && projects.length === 0 ? (
          <EmptyState title="No projects" description="Create a project to start reconciliation runs." />
        ) : null}

        {!isLoading && !isError && projects.length > 0 ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="oracle-kpi p-3"><p className="text-xs text-slate-400">Projects</p><p className="text-lg font-semibold text-slate-100">{runHealth.total}</p></div>
              <div className="oracle-kpi kpi-success p-3"><p className="text-xs text-slate-400">Ready to Run</p><p className="text-lg font-semibold text-slate-100">{runHealth.ready}</p></div>
              <div className="oracle-kpi kpi-danger p-3"><p className="text-xs text-slate-400">Blocked</p><p className="text-lg font-semibold text-slate-100">{runHealth.blocked}</p></div>
              <button className="oracle-kpi p-3 text-left" onClick={() => navigate('/command-center')}><p className="text-xs text-slate-400">Reconciliation Command Center</p><p className="text-sm font-semibold text-slate-100 mt-2">Back to priorities</p></button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
              {projects.map((p) => {
                const d = details[p.id] || {}
                return (
                  <div key={p.id} className="card p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-slate-100 truncate">{p.name}</h3>
                      <span className="text-[10px] uppercase px-2 py-0.5 border border-surface-600 text-slate-400">#{p.id}</span>
                    </div>
                    <div className="space-y-1 text-xs text-slate-400">
                      <p>Data: {d.sourceReady ? 'source' : 'source missing'} / {d.targetReady ? 'target' : 'target missing'}</p>
                      <p>Mappings: {d.mappings || 0}</p>
                      <p>Active Rules: {d.rules || 0}</p>
                      <p>Latest Run: <span className={`status-chip status-chip-${String(d.latestStatus || '').toLowerCase()}`}>{d.latestStatus}</span>{d.matchRate !== null && d.matchRate !== undefined ? ` (${d.matchRate}%)` : ''}</p>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button className="btn-secondary text-xs" onClick={() => navigate(`/projects/${p.id}/ingestion`)}><Database className="w-3.5 h-3.5" /> Ingestion</button>
                      <button className="btn-secondary text-xs" onClick={() => navigate(`/projects/${p.id}/rules`)}><ShieldCheck className="w-3.5 h-3.5" /> Rules</button>
                      <button className="btn-primary text-xs" onClick={() => navigate(`/projects/${p.id}/results`)}><PlayCircle className="w-3.5 h-3.5" /> Run</button>
                    </div>
                    <button className="mt-3 text-xs text-brand-400 inline-flex items-center gap-1" onClick={() => navigate(`/projects/${p.id}/results`)}>
                      Open workspace <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
