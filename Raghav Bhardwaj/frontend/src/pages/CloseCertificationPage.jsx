import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { enterpriseAPI, authAPI, projectsAPI } from '../api'
import { advancedAPI, enterpriseExtAPI } from '../api'
import { useProjectStore } from '../store/projectStore'
import toast from 'react-hot-toast'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, LoadingState } from '../components/ui/PageState'
import { Lock, Unlock, CheckSquare, Clock, CheckCircle2, AlertTriangle, X, ChevronDown, ChevronUp, Plus } from 'lucide-react'

const CERT_META = {
  OPEN:         { color: 'var(--text-tertiary)', label: 'Open' },
  PREPARED:     { color: 'var(--info)',           label: 'Prepared' },
  UNDER_REVIEW: { color: 'var(--warn)',           label: 'Under Review' },
  SUBMITTED:    { color: 'var(--warn)',           label: 'Submitted' },
  APPROVED:     { color: 'var(--ok)',             label: 'Approved' },
  REJECTED:     { color: 'var(--bad)',            label: 'Rejected' },
  CERTIFIED:    { color: 'var(--ok)',             label: 'Certified' },
  CLOSED:       { color: 'var(--text-disabled)',  label: 'Closed' },
}

function CertBadge({ status }) {
  const m = CERT_META[status] || { color: 'var(--text-tertiary)', label: status }
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 9999,
      border: `1px solid ${m.color}33`, color: m.color, background: `${m.color}14` }}>
      {m.label}
    </span>
  )
}

// ── Period Row with lock/unlock + tasks ───────────────────────
function PeriodRow({ cal, profile, cert, tasks, onLock, onUnlock, users }) {
  const [expanded, setExpanded] = useState(false)
  const [unlockReason, setUnlockReason] = useState('')
  const [showUnlockBox, setShowUnlockBox] = useState(false)

  const completedTasks = tasks.filter((t) => t.status === 'COMPLETE').length
  const totalTasks     = tasks.length
  const taskPct        = totalTasks ? Math.round(completedTasks / totalTasks * 100) : 0

  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
      {/* Header */}
      <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'IBM Plex Mono, monospace' }}>
              {cal.period_key}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', background: 'var(--surface-3)', padding: '1px 6px', borderRadius: 4 }}>
              {cal.cycle_type}
            </span>
            {cert && <CertBadge status={cert.status} />}
            {cal.is_locked
              ? <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--bad)', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)', padding: '2px 7px', borderRadius: 9999 }}>🔒 Locked</span>
              : <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ok)', background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.2)', padding: '2px 7px', borderRadius: 9999 }}>🔓 Open</span>
            }
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {profile?.name || `Profile #${cal.profile_id}`} · Due {cal.due_date || '—'}
          </p>
        </div>

        {/* Progress bar */}
        {totalTasks > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
            <div style={{ width: 80, height: 6, background: 'var(--surface-3)', borderRadius: 9999, overflow: 'hidden' }}>
              <div style={{ width: `${taskPct}%`, height: '100%', background: taskPct === 100 ? 'var(--ok)' : 'var(--accent)', transition: 'width 300ms' }} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', minWidth: 40 }}>{completedTasks}/{totalTasks}</span>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {!cal.is_locked ? (
            <button className="btn-primary text-xs py-1 h-7"
              onClick={() => onLock(cal.id)}
              title="Lock this period — prevents all data changes">
              <Lock style={{ width: 11, height: 11 }} /> Lock Period
            </button>
          ) : (
            !showUnlockBox ? (
              <button className="btn-secondary text-xs py-1 h-7" onClick={() => setShowUnlockBox(true)}>
                <Unlock style={{ width: 11, height: 11 }} /> Unlock
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input className="input h-7 text-xs w-40" placeholder="Unlock reason…"
                  value={unlockReason} onChange={(e) => setUnlockReason(e.target.value)} />
                <button className="btn-primary text-xs py-1 h-7"
                  style={{ background: 'var(--warn)', border: 'none' }}
                  disabled={!unlockReason.trim()}
                  onClick={() => { onUnlock(cal.id, unlockReason); setShowUnlockBox(false); setUnlockReason('') }}>
                  Confirm
                </button>
                <button className="btn-ghost text-xs py-1 h-7" onClick={() => setShowUnlockBox(false)}><X style={{ width: 10, height: 10 }} /></button>
              </div>
            )
          )}
          <button className="btn-ghost text-xs py-1 h-7" onClick={() => setExpanded((v) => !v)}>
            {expanded ? <ChevronUp style={{ width: 13, height: 13 }} /> : <ChevronDown style={{ width: 13, height: 13 }} />}
          </button>
        </div>
      </div>

      {/* Expanded tasks */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border-0)', padding: '10px 16px', background: 'var(--surface-1)' }}>
          {tasks.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No close tasks. Use profile rollover to auto-generate tasks.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {tasks.map((task) => {
                const statusColors = { NOT_STARTED: 'var(--text-tertiary)', IN_PROGRESS: 'var(--warn)', COMPLETE: 'var(--ok)', BLOCKED: 'var(--bad)', OVERDUE: '#c026d3' }
                const color = statusColors[task.status] || 'var(--text-tertiary)'
                return (
                  <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: 'var(--surface-2)', borderRadius: 7 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, flex: 1, color: 'var(--text-primary)' }}>{task.task_name}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{task.task_type}</span>
                    <span style={{ fontSize: 10, color, fontWeight: 600 }}>{task.status}</span>
                    {task.due_date && <span style={{ fontSize: 10, color: 'var(--text-disabled)' }}>{task.due_date}</span>}
                  </div>
                )
              })}
            </div>
          )}
          {/* Certification history for this cert */}
          {cert && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-0)' }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                Certification Workflow
              </p>
              <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                <span>Preparer: <strong>{users.find((u) => u.id === cert.preparer_id)?.username || `#${cert.preparer_id}`}</strong></span>
                <span>Reviewer: <strong>{users.find((u) => u.id === cert.reviewer_id)?.username || `#${cert.reviewer_id}`}</strong></span>
                <span>Approver: <strong>{users.find((u) => u.id === cert.approver_id)?.username || `#${cert.approver_id}`}</strong></span>
                <span>Due: <strong>{cert.due_date}</strong></span>
                {cert.last_comment && <span>Comment: <em>"{cert.last_comment}"</em></span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Workflow row ──────────────────────────────────────────────
function WorkflowRow({ w, profile, onAction }) {
  const isActionable = !['CERTIFIED', 'CLOSED', 'FORCE_CLOSED'].includes((w.status || '').toUpperCase())
  return (
    <tr>
      <td style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 600, fontSize: 11 }}>#{w.id}</td>
      <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {profile?.name || `Profile #${w.profile_id}`}
      </td>
      <td><CertBadge status={w.status} /></td>
      <td style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{w.current_stage || '—'}</td>
      <td style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{w.due_date || '—'}</td>
      <td>
        {isActionable ? (
          <button className="btn-primary text-xs py-0.5 h-6"
            onClick={() => onAction(w)}>
            Action
          </button>
        ) : (
          <span style={{ fontSize: 10, color: 'var(--ok)' }}>✓ Done</span>
        )}
      </td>
    </tr>
  )
}

// ── Main Page ─────────────────────────────────────────────────
const TABS = [
  { id: 'calendar',   label: 'Close Calendar' },
  { id: 'workflows',  label: 'Certification Workflows' },
]

export default function CloseCertificationPage() {
  const [activeTab,    setActiveTab]    = useState('calendar')
  const [filterStatus, setFilterStatus] = useState('')
  const qc = useQueryClient()
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId)

  const { data: projects = [], isLoading: projectsLoading } = useQuery({ queryKey: ['projects'], queryFn: projectsAPI.list })
  const hasProjects = projects.length > 0

  const { data: calendars = [],  isLoading: calLoading  } = useQuery({ queryKey: ['close-cal'],         queryFn: () => enterpriseAPI.listCloseCalendar() })
  const { data: workflows = [],  isLoading: wfLoading   } = useQuery({ queryKey: ['cert-workflows-all'], queryFn: () => enterpriseAPI.listCertificationWorkflows() })
  const { data: profiles  = [] }                           = useQuery({ queryKey: ['enterprise-profiles', selectedProjectId || 'all'], queryFn: () => enterpriseAPI.listProfiles(selectedProjectId ? Number(selectedProjectId) : undefined) })
  const { data: users     = [] }                           = useQuery({ queryKey: ['users-list'],          queryFn: authAPI.listUsers })
  const { data: allTasks  = [] }                           = useQuery({ queryKey: ['all-close-tasks'],     queryFn: () => enterpriseExtAPI.listCloseTasks() })

  const lockMutation = useMutation({
    mutationFn: (calId) => advancedAPI.lockPeriod(calId),
    onSuccess: (res) => { toast.success(`Period ${res.period_key} locked`); qc.invalidateQueries({ queryKey: ['close-cal'] }) },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Lock failed'),
  })

  const unlockMutation = useMutation({
    mutationFn: ({ calId, reason }) => advancedAPI.unlockPeriod(calId, reason),
    onSuccess: (res) => { toast.success(`Period ${res.period_key} unlocked`); qc.invalidateQueries({ queryKey: ['close-cal'] }) },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Unlock failed'),
  })

  const certActionMutation = useMutation({
    mutationFn: (payload) => enterpriseAPI.actionCertificationWorkflow(payload),
    onSuccess: () => { toast.success('Action completed'); qc.invalidateQueries({ queryKey: ['cert-workflows-all'] }) },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Action failed'),
  })

  const kpis = useMemo(() => ({
    periods:    calendars.length,
    locked:     calendars.filter((c) => c.is_locked).length,
    open:       calendars.filter((c) => !c.is_locked && !['CLOSED','CERTIFIED'].includes((c.status||'').toUpperCase())).length,
    overdue:    calendars.filter((c) => { if (c.is_locked) return false; try { return new Date() > new Date(c.due_date) } catch { return false } }).length,
    wfPending:  workflows.filter((w) => ['PREPARED','UNDER_REVIEW','SUBMITTED'].includes((w.status||'').toUpperCase())).length,
    wfCertified: workflows.filter((w) => ['CERTIFIED','CLOSED'].includes((w.status||'').toUpperCase())).length,
  }), [calendars, workflows])

  const filteredCals = useMemo(() => {
    if (!filterStatus) return calendars
    if (filterStatus === 'locked')  return calendars.filter((c) => c.is_locked)
    if (filterStatus === 'open')    return calendars.filter((c) => !c.is_locked)
    if (filterStatus === 'overdue') return calendars.filter((c) => { try { return !c.is_locked && new Date() > new Date(c.due_date) } catch { return false } })
    return calendars
  }, [calendars, filterStatus])

  const loading = calLoading || wfLoading || projectsLoading

  if (!loading && !hasProjects) {
    return (
      <div className="h-full flex flex-col">
        <PageHeader
          title="Period Close Monitor"
          subtitle="Manage close periods, lock controls, and certification workflows."
          badge="No projects"
        />
        <div className="flex-1 flex items-center justify-center p-6">
          <EmptyState
            title="No projects yet"
            description="Create your first reconciliation project before using the Period Close Monitor."
          />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Period Close Monitor"
        subtitle="Manage close periods, lock controls, and certification workflows."
        badge={`${kpis.periods} periods`}
      />

      <div className="flex-1 overflow-auto p-5 space-y-4" style={{ background: 'var(--surface-0)' }}>

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10 }}>
          {[
            ['Total Periods', kpis.periods,     'var(--accent)'],
            ['Locked',        kpis.locked,      'var(--bad)'],
            ['Open',          kpis.open,        'var(--ok)'],
            ['Overdue',       kpis.overdue,     'var(--warn)'],
            ['Pending Cert',  kpis.wfPending,   'var(--warn)'],
            ['Certified',     kpis.wfCertified, 'var(--ok)'],
          ].map(([label, val, color]) => (
            <div key={label} style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: '10px 14px' }}>
              <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{label}</p>
              <p style={{ fontSize: 22, fontWeight: 700, color }}>{val}</p>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div className="tab-bar" style={{ background: 'var(--surface-1)', borderRadius: 8 }}>
          {TABS.map((t) => (
            <button key={t.id} className={`tab-item ${activeTab === t.id ? 'tab-active' : ''}`} onClick={() => setActiveTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {loading ? <LoadingState /> : null}

        {/* ── Calendar tab ────────────────────────────── */}
        {!loading && activeTab === 'calendar' && (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {['', 'locked', 'open', 'overdue'].map((f) => (
                <button key={f} className={`btn-secondary text-xs h-7 ${filterStatus === f ? 'opacity-100 ring-1 ring-inset ring-accent' : 'opacity-60'}`}
                  style={{ fontWeight: filterStatus === f ? 700 : 400 }}
                  onClick={() => setFilterStatus(f)}>
                  {f === '' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-tertiary)' }}>{filteredCals.length} periods</span>
            </div>

            {filteredCals.length === 0 ? (
              <EmptyState title="No periods" description="Create periods via profile rollover." />
            ) : (
              filteredCals.map((cal) => {
                const profile  = profiles.find((p) => p.id === cal.profile_id)
                const cert     = workflows.find((w) => w.profile_id === cal.profile_id)
                const tasks    = allTasks.filter((t) => t.calendar_id === cal.id)
                return (
                  <PeriodRow key={cal.id} cal={cal} profile={profile} cert={cert} tasks={tasks} users={users}
                    onLock={(id) => lockMutation.mutate(id)}
                    onUnlock={(id, reason) => unlockMutation.mutate({ calId: id, reason })}
                  />
                )
              })
            )}
          </>
        )}

        {/* ── Workflows tab ────────────────────────────── */}
        {!loading && activeTab === 'workflows' && (
          workflows.length === 0 ? (
            <EmptyState title="No certification workflows" description="Workflows are created automatically when you promote an execution or rollover a profile." />
          ) : (
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden' }}>
              <table className="data-table" style={{ borderRadius: 0 }}>
                <thead>
                  <tr><th>ID</th><th>Profile</th><th>Status</th><th>Stage</th><th>Due Date</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {workflows.map((w) => (
                    <WorkflowRow key={w.id} w={w}
                      profile={profiles.find((p) => p.id === w.profile_id)}
                      onAction={(wf) => {
                        const action = (wf.status === 'APPROVED') ? 'CERTIFY' : 'APPROVE'
                        certActionMutation.mutate({ workflow_id: wf.id, action, comments: `${action} via Close Monitor` })
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  )
}
