import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../store/authStore'
import { enterpriseAPI, projectsAPI } from '../api'
import PageHeader from '../components/ui/PageHeader'
import { ClipboardList, ArrowRight, CheckCircle2, AlertTriangle, FolderKanban, ChevronRight } from 'lucide-react'
import { EmptyState, LoadingState } from '../components/ui/PageState'
import { useProjectStore } from '../store/projectStore'
import { normalizeRole } from '../utils/roles'

const ROLE_CONFIG = {
  preparer: {
    title: 'Preparer Work Queue',
    subtitle: 'Access assigned reconciliations, upload evidence, and submit for review.',
  },
  reviewer: {
    title: 'Reviewer Queue',
    subtitle: 'Review submissions, approve or reject, and escalate exceptions.',
  },
  admin: {
    title: 'Work Queue',
    subtitle: 'Role-aware queue for preparation, review, and exception handling.',
  },
}

const QUEUE_CARDS = [
  {
    id: 'preparer',
    title: 'Preparer Workbench',
    description: 'Work assigned reconciliations, upload evidence documents, and submit for reviewer approval.',
    icon: ClipboardList,
    tone: 'accent',
    getPath: (projectId) => projectId ? `/projects/${projectId}/preparer` : '/reconciliations',
  },
  {
    id: 'reviewer',
    title: 'Reviewer Workbench',
    description: 'Inspect preparer submissions, approve, reject, or escalate open exceptions to resolution.',
    icon: CheckCircle2,
    tone: 'success',
    getPath: (projectId) => projectId ? `/projects/${projectId}/reviewer` : '/reconciliations',
  },
  {
    id: 'execution',
    title: 'Execution Workbench',
    description: 'Run reconciliation matches and perform role-based workflow actions on results.',
    icon: AlertTriangle,
    tone: 'warning',
    getPath: (projectId) => projectId ? `/projects/${projectId}/results` : '/reconciliations',
  },
]

const TONE_STYLES = {
  accent:  { border: 'var(--accent-border)',  bg: 'var(--accent-subtle)',  color: 'var(--accent-hover)' },
  success: { border: 'var(--ok-bdr)',         bg: 'var(--ok-bg)',          color: 'var(--ok)' },
  warning: { border: 'var(--warn-bdr)',        bg: 'var(--warn-bg)',        color: 'var(--warn)' },
}

export default function WorkQueue() {
  const user = useAuthStore((s) => s.user)
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const { setSelectedProjectId: setGlobalProjectId } = useProjectStore()
  const role = normalizeRole(user?.role)

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsAPI.list,
  })

  const { data: profiles = [] } = useQuery({
    queryKey: ['enterprise-profiles', selectedProjectId || 'all'],
    queryFn: () => enterpriseAPI.listProfiles(selectedProjectId ? Number(selectedProjectId) : undefined),
  })

  const { data: workflows = [] } = useQuery({
    queryKey: ['enterprise-cert-workflows'],
    queryFn: () => enterpriseAPI.listCertificationWorkflows(),
    refetchInterval: 30000,
  })

  const { data: exceptions = [] } = useQuery({
    queryKey: ['enterprise-exceptions'],
    queryFn: () => enterpriseAPI.listExceptions(),
    refetchInterval: 30000,
  })

  const { data: roleDashboard } = useQuery({
    queryKey: ['role-dashboard', role, selectedProjectId || 'all'],
    queryFn: async () => {
      if (selectedProjectId) return null
      if (role === 'reviewer') return enterpriseAPI.reviewerDashboard()
      if (role === 'preparer') return enterpriseAPI.preparerDashboard()
      const [preparer, reviewer] = await Promise.all([
        enterpriseAPI.preparerDashboard(),
        enterpriseAPI.reviewerDashboard(),
      ])
      return { preparer, reviewer }
    },
    enabled: Boolean(user),
    refetchInterval: 30000,
  })

  useEffect(() => {
    if (!selectedProjectId && projects.length) setSelectedProjectId(String(projects[0].id))
  }, [projects, selectedProjectId])

  useEffect(() => {
    if (selectedProjectId) setGlobalProjectId(selectedProjectId)
  }, [selectedProjectId, setGlobalProjectId])

  const config = ROLE_CONFIG[role] || ROLE_CONFIG.admin

  const myProfiles = useMemo(() => {
    if (!user) return []
    if (role === 'preparer') {
      return profiles.filter((p) => p.assigned_preparer === user.id)
    }
    if (role === 'reviewer') {
      return profiles.filter((p) => p.assigned_reviewer === user.id)
    }
    return profiles
  }, [profiles, role, user])

  const myProfileIds = useMemo(() => new Set(myProfiles.map((p) => p.id)), [myProfiles])
  const myWorkflows = useMemo(() => workflows.filter((w) => myProfileIds.has(w.profile_id)), [workflows, myProfileIds])
  const myExceptions = useMemo(() => exceptions.filter((e) => myProfileIds.has(e.profile_id)), [exceptions, myProfileIds])

  const dashboardCards = useMemo(() => {
    if (role === 'preparer') {
      return [
        { label: 'Assigned Profiles', value: myProfiles.length, color: 'var(--accent-hover)' },
        { label: 'Pending Submit', value: roleDashboard?.pending_submissions ?? myWorkflows.filter((w) => ['OPEN', 'PREPARED', 'REJECTED'].includes(String(w.status || '').toUpperCase())).length, color: 'var(--warn)' },
        { label: 'Completed', value: roleDashboard?.completed_tasks ?? myWorkflows.filter((w) => ['APPROVED', 'CERTIFIED'].includes(String(w.status || '').toUpperCase())).length, color: 'var(--ok)' },
      ]
    }
    if (role === 'reviewer') {
      return [
        { label: 'Pending Approvals', value: roleDashboard?.pending_approvals ?? myWorkflows.filter((w) => ['PREPARED', 'UNDER_REVIEW', 'SUBMITTED'].includes(String(w.status || '').toUpperCase())).length, color: 'var(--warn)' },
        { label: 'Escalations', value: roleDashboard?.escalation_alerts ?? myExceptions.filter((e) => String(e.status || '').toUpperCase() === 'ESCALATED').length, color: 'var(--bad)' },
        { label: 'Completed', value: roleDashboard?.completed_reviews ?? myWorkflows.filter((w) => ['APPROVED', 'CERTIFIED'].includes(String(w.status || '').toUpperCase())).length, color: 'var(--ok)' },
      ]
    }
    return [
      { label: 'Assigned Profiles', value: myProfiles.length, color: 'var(--accent-hover)' },
      { label: 'Open Exceptions', value: myExceptions.filter((e) => ['OPEN', 'IN_PROGRESS'].includes(String(e.status || '').toUpperCase())).length, color: 'var(--bad)' },
      { label: 'Active Workflows', value: myWorkflows.filter((w) => !['APPROVED', 'CERTIFIED', 'CLOSED'].includes(String(w.status || '').toUpperCase())).length, color: 'var(--ok)' },
    ]
  }, [myProfiles.length, myWorkflows, myExceptions, role, roleDashboard])

  const recentItems = useMemo(() => {
    const workflowRows = [...myWorkflows]
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))
      .slice(0, 5)
      .map((w) => ({
        id: `wf-${w.id}`,
        title: w.profile_name || `Workflow #${w.id}`,
        meta: `${String(w.status || 'UNKNOWN').replace(/_/g, ' ')} · Stage ${w.current_stage || '-'}`,
      }))
    const exceptionRows = [...myExceptions]
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))
      .slice(0, 5)
      .map((e) => ({
        id: `exc-${e.id}`,
        title: `Exception #${e.id}`,
        meta: `${e.queue_type || '-'} · ${e.status || '-'}`,
      }))
    return [...workflowRows, ...exceptionRows].slice(0, 6)
  }, [myWorkflows, myExceptions])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title={config.title}
        subtitle={`${config.subtitle} ${selectedProjectId ? `Active project: #${selectedProjectId}.` : ''}`.trim()}
        badge={(user?.role || 'user').toUpperCase()}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 20 }} className="slim-scroll">


        {/* Queue Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {QUEUE_CARDS.map((card) => {
            const Icon = card.icon
            const tone = TONE_STYLES[card.tone]
            const path = card.getPath(selectedProjectId)

            return (
              <Link key={card.id} to={path} style={{ textDecoration: 'none' }}>
                <div
                  className="card"
                  style={{
                    padding: 18,
                    cursor: 'pointer',
                    transition: 'border-color var(--dur-base), box-shadow var(--dur-base)',
                    height: '100%',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = tone.border
                    e.currentTarget.style.boxShadow = 'var(--shadow-md)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-1)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{
                      width: 36, height: 36,
                      borderRadius: 'var(--r-md)',
                      background: tone.bg,
                      border: `1px solid ${tone.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon style={{ width: 16, height: 16, color: tone.color }} />
                    </div>
                    <ArrowRight style={{ width: 14, height: 14, color: tone.color, marginTop: 2 }} />
                  </div>
                  <h3 style={{
                    fontSize: 13.5, fontWeight: 700,
                    fontFamily: 'IBM Plex Sans Condensed, sans-serif',
                    color: 'var(--text-primary)',
                    marginBottom: 6,
                  }}>
                    {card.title}
                  </h3>
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                    {card.description}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>

        {/* Live role snapshot */}
        {projects.length > 0 && selectedProjectId && (
          <div className="card" style={{ marginTop: 20, padding: 16 }}>
            <p style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'var(--text-tertiary)', marginBottom: 12,
            }}>
              Live Work Snapshot — #{selectedProjectId}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
              {dashboardCards.map((s) => (
                <div key={s.label} style={{
                  padding: '10px 12px',
                  background: 'var(--surface-3)',
                  border: '1px solid var(--border-0)',
                  borderRadius: 'var(--r-md)',
                }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 4 }}>{s.label}</p>
                  <p style={{ fontSize: 20, fontWeight: 700, fontFamily: 'IBM Plex Sans Condensed, sans-serif', color: s.color }}>{s.value ?? 0}</p>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14 }}>
              <p style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: 'var(--text-tertiary)', marginBottom: 8,
              }}>
                Recent Items
              </p>
              {recentItems.length === 0 ? (
                <EmptyState title="No live items yet" description="Your assigned profiles and workflows will appear here." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recentItems.map((item) => (
                    <div key={item.id} style={{
                      padding: '10px 12px',
                      background: 'var(--surface-3)',
                      border: '1px solid var(--border-0)',
                      borderRadius: 'var(--r-md)',
                    }}>
                      <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{item.title}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{item.meta}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
