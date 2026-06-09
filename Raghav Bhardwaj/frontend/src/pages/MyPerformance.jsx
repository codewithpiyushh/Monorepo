import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../store/authStore'
import { useProjectStore } from '../store/projectStore'
import { enterpriseAPI } from '../api'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, LoadingState } from '../components/ui/PageState'
import { CheckCircle2, Clock, BarChart2, TrendingUp } from 'lucide-react'
import { normalizeRole } from '../utils/roles'

function toHours(start, end) {
  const s = new Date(start || 0).getTime()
  const e = new Date(end || 0).getTime()
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null
  return Math.round(((e - s) / 36e5) * 10) / 10
}

export default function MyPerformance() {
  const user = useAuthStore((s) => s.user)
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId)
  const role = normalizeRole(user?.role || 'user')

  const subtitle = useMemo(() => {
    if (role === 'preparer') return 'Live task metrics, completion status, and assigned reconciliation workload.'
    if (role === 'reviewer') return 'Live review throughput, approvals, escalations, and assigned cases.'
    return 'Live personal reconciliation performance and activity.'
  }, [role])

  const { data: profiles = [], isLoading: profilesLoading } = useQuery({
    queryKey: ['enterprise-profiles', selectedProjectId || 'all'],
    queryFn: () => enterpriseAPI.listProfiles(selectedProjectId ? Number(selectedProjectId) : undefined),
  })

  const { data: workflows = [], isLoading: workflowsLoading } = useQuery({
    queryKey: ['enterprise-cert-workflows'],
    queryFn: () => enterpriseAPI.listCertificationWorkflows(),
    refetchInterval: 30000,
  })

  const { data: exceptions = [], isLoading: exceptionsLoading } = useQuery({
    queryKey: ['enterprise-exceptions'],
    queryFn: () => enterpriseAPI.listExceptions(),
    refetchInterval: 30000,
  })

  const { data: dashboard } = useQuery({
    queryKey: ['personal-dashboard', role],
    queryFn: async () => {
      if (role === 'reviewer') return enterpriseAPI.reviewerDashboard()
      if (role === 'preparer') return enterpriseAPI.preparerDashboard()
      return null
    },
    enabled: role === 'preparer' || role === 'reviewer',
    refetchInterval: 30000,
  })

  const myProfiles = useMemo(() => {
    if (!user) return []
    if (role === 'preparer') return profiles.filter((p) => p.assigned_preparer === user.id)
    if (role === 'reviewer') return profiles.filter((p) => p.assigned_reviewer === user.id)
    return profiles
  }, [profiles, role, user])

  const myProfileIds = useMemo(() => new Set(myProfiles.map((p) => p.id)), [myProfiles])

  const myWorkflows = useMemo(() => {
    return workflows.filter((w) => myProfileIds.has(w.profile_id))
  }, [workflows, myProfileIds])

  const myExceptions = useMemo(() => {
    return exceptions.filter((e) => myProfileIds.has(e.profile_id))
  }, [exceptions, myProfileIds])

  const completedWorkflows = useMemo(() => {
    return myWorkflows.filter((w) => ['APPROVED', 'CERTIFIED', 'CLOSED'].includes(String(w.status || '').toUpperCase()))
  }, [myWorkflows])

  const pendingWorkflows = useMemo(() => {
    return myWorkflows.filter((w) => !['APPROVED', 'CERTIFIED', 'CLOSED'].includes(String(w.status || '').toUpperCase()))
  }, [myWorkflows])

  const avgCycleHours = useMemo(() => {
    const samples = completedWorkflows
      .map((w) => toHours(w.created_at, w.updated_at || w.resolved_at))
      .filter((v) => typeof v === 'number' && Number.isFinite(v))
    if (!samples.length) return null
    return Math.round((samples.reduce((sum, v) => sum + v, 0) / samples.length) * 10) / 10
  }, [completedWorkflows])

  const completionRate = useMemo(() => {
    const total = myWorkflows.length
    if (!total) return 0
    return Math.round((completedWorkflows.length / total) * 100)
  }, [myWorkflows.length, completedWorkflows.length])

  const cards = useMemo(() => {
    if (role === 'preparer') {
      return [
        { label: 'Tasks Completed', value: completedWorkflows.length, sub: `${myWorkflows.length} assigned workflows`, icon: CheckCircle2, tone: 'success' },
        { label: 'Pending Work', value: pendingWorkflows.length, sub: `${myExceptions.filter((e) => ['OPEN', 'IN_PROGRESS'].includes(String(e.status || '').toUpperCase())).length} active exceptions`, icon: Clock, tone: 'warning' },
        { label: 'Average Cycle', value: avgCycleHours != null ? `${avgCycleHours}h` : '—', sub: 'Based on completed workflows', icon: BarChart2, tone: 'info' },
        { label: 'Completion Rate', value: `${completionRate}%`, sub: dashboard?.auto_match_pct != null ? `Auto-match ${dashboard.auto_match_pct}%` : 'From assigned workload', icon: TrendingUp, tone: 'accent' },
      ]
    }
    if (role === 'reviewer') {
      return [
        { label: 'Tasks Completed', value: completedWorkflows.length, sub: `${myWorkflows.length} assigned workflows`, icon: CheckCircle2, tone: 'success' },
        { label: 'Pending Work', value: pendingWorkflows.length, sub: `${myExceptions.filter((e) => String(e.status || '').toUpperCase() === 'ESCALATED').length} escalations`, icon: Clock, tone: 'warning' },
        { label: 'Average Cycle', value: avgCycleHours != null ? `${avgCycleHours}h` : '—', sub: 'Based on completed reviews', icon: BarChart2, tone: 'info' },
        { label: 'Completion Rate', value: `${completionRate}%`, sub: dashboard?.completion_pct != null ? `Queue completion ${dashboard.completion_pct}%` : 'From assigned workload', icon: TrendingUp, tone: 'accent' },
      ]
    }
    return [
      { label: 'Tasks Completed', value: completedWorkflows.length, sub: `${myWorkflows.length} linked workflows`, icon: CheckCircle2, tone: 'success' },
      { label: 'Pending Work', value: pendingWorkflows.length, sub: `${myExceptions.length} linked exceptions`, icon: Clock, tone: 'warning' },
      { label: 'Average Cycle', value: avgCycleHours != null ? `${avgCycleHours}h` : '—', sub: 'Across assigned items', icon: BarChart2, tone: 'info' },
      { label: 'Completion Rate', value: `${completionRate}%`, sub: 'Derived from workflow status', icon: TrendingUp, tone: 'accent' },
    ]
  }, [role, completedWorkflows.length, myWorkflows.length, pendingWorkflows.length, myExceptions, avgCycleHours, completionRate, dashboard])

  const activityRows = useMemo(() => {
    const workflowRows = [...myWorkflows]
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime())
      .slice(0, 5)
      .map((w) => ({
        id: `wf-${w.id}`,
        title: w.profile_name || `Workflow #${w.id}`,
        meta: `${String(w.status || 'UNKNOWN').replace(/_/g, ' ')} · Stage ${w.current_stage || '-'}`,
        when: w.updated_at || w.created_at || null,
      }))
    const exceptionRows = [...myExceptions]
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime())
      .slice(0, 5)
      .map((e) => ({
        id: `exc-${e.id}`,
        title: `Exception #${e.id}`,
        meta: `${e.queue_type || '-'} · ${e.status || '-'}`,
        when: e.updated_at || e.created_at || null,
      }))
    return [...workflowRows, ...exceptionRows].slice(0, 6)
  }, [myWorkflows, myExceptions])

  const TONE = {
    success: { border: 'var(--ok-bdr)', iconBg: 'var(--ok-bg)', iconColor: 'var(--ok)' },
    warning: { border: 'var(--warn-bdr)', iconBg: 'var(--warn-bg)', iconColor: 'var(--warn)' },
    info: { border: 'var(--info-bdr)', iconBg: 'var(--info-bg)', iconColor: 'var(--info)' },
    accent: { border: 'var(--accent-border)', iconBg: 'var(--accent-subtle)', iconColor: 'var(--accent)' },
  }

  const loading = profilesLoading || workflowsLoading || exceptionsLoading

  if (loading) {
    return (
      <div className="h-full flex flex-col">
        <PageHeader title="My Performance" subtitle={subtitle} badge={(user?.role || 'user').toUpperCase()} />
        <LoadingState />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="My Performance"
        subtitle={subtitle}
        badge={(user?.role || 'user').toUpperCase()}
      />

      <div className="flex-1 overflow-auto p-5" style={{ background: 'var(--surface-0)' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 10,
          marginBottom: 20,
        }}>
          {cards.map((m) => {
            const Icon = m.icon
            const t = TONE[m.tone]
            return (
              <div
                key={m.label}
                style={{
                  background: 'var(--surface-2)',
                  border: `1px solid var(--border-1)`,
                  borderLeft: `3px solid ${t.border}`,
                  borderRadius: 'var(--r-lg)',
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 30, height: 30,
                    borderRadius: 'var(--r-sm)',
                    background: t.iconBg,
                    border: `1px solid ${t.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon style={{ width: 14, height: 14, color: t.iconColor }} />
                  </div>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                    {m.label}
                  </p>
                </div>
                <p style={{ fontSize: 28, fontWeight: 700, fontFamily: 'IBM Plex Sans Condensed, sans-serif', color: 'var(--text-primary)', lineHeight: 1 }}>
                  {m.value}
                </p>
                <p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
                  {m.sub}
                </p>
              </div>
            )
          })}
        </div>

        <div className="bl-section">
          <div className="bl-section-header">
            <p className="bl-section-title">Recent Activity</p>
          </div>
          {activityRows.length === 0 ? (
            <div style={{ padding: 20 }}>
              <EmptyState title="No activity yet" description="Your assigned workflows and exceptions will appear here once work starts flowing." />
            </div>
          ) : (
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activityRows.map((item) => (
                <div key={item.id} style={{
                  padding: '10px 12px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border-1)',
                  borderRadius: 8,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{item.title}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{item.meta}</p>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-disabled)', whiteSpace: 'nowrap' }}>
                      {item.when ? new Date(item.when).toLocaleString() : '—'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
