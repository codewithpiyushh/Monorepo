/**
 * ApproverDashboard — Daily landing page for the Approver role.
 *
 * Answers: "What is the most urgent thing I need to do today?"
 * Shows:
 *  • KPI row: Pending Approvals | Nearing SLA Breach | Escalated Items | Approved Today
 *  • Team progress overview (exception health, aging ring)
 *  • Quick-action cards linking to key pages
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, AlertTriangle, Clock, ShieldAlert,
  ArrowRight, BarChart3, TrendingUp, FileCheck2,
  Users, Zap, AlertOctagon, ChevronRight,
} from 'lucide-react'
import { enterpriseAPI } from '../api'
import agingAPI from '../api/agingAPI'
import { useAuthStore } from '../store/authStore'
import PageHeader from '../components/ui/PageHeader'
import { LoadingState } from '../components/ui/PageState'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  return Number(n || 0).toLocaleString()
}

function fmtDate(s) {
  try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) } catch { return '—' }
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color, onClick, urgent }) {
  return (
    <div
      onClick={onClick}
      style={{
        flex: 1, minWidth: 170,
        background: 'var(--surface-2)',
        border: `1px solid ${urgent ? color + '55' : 'var(--border-1)'}`,
        borderTop: `3px solid ${color}`,
        borderRadius: 12,
        padding: '16px 18px',
        display: 'flex', flexDirection: 'column', gap: 10,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 80ms, box-shadow 80ms',
        position: 'relative', overflow: 'hidden',
      }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${color}22` } }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} color={color} />
        </div>
        {urgent && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 9999, background: `${color}22`, color, letterSpacing: '0.06em' }}>
            ACTION NEEDED
          </span>
        )}
      </div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1, fontFamily: 'Inter, sans-serif' }}>{value}</div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{sub}</div>}
      </div>
    </div>
  )
}

// ── Quick-Action Card ─────────────────────────────────────────────────────────

function ActionCard({ title, description, icon: Icon, color, to, badge, disabled }) {
  const navigate = useNavigate()
  return (
    <div
      onClick={() => !disabled && navigate(to)}
      style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border-1)',
        borderRadius: 12,
        padding: '16px 18px',
        display: 'flex', gap: 14, alignItems: 'flex-start',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'border-color 100ms, background 100ms',
        position: 'relative',
      }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.borderColor = color + '55'; e.currentTarget.style.background = color + '08' } }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.background = '' }}
    >
      <div style={{ width: 38, height: 38, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={18} color={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
          {badge != null && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 9999, background: `${color}22`, color }}>
              {badge}
            </span>
          )}
          {disabled && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 9999, background: 'var(--surface-3)', color: 'var(--text-tertiary)', letterSpacing: '0.06em' }}>SOON</span>}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{description}</div>
      </div>
      {!disabled && <ChevronRight size={14} color="var(--text-tertiary)" style={{ flexShrink: 0, marginTop: 2 }} />}
    </div>
  )
}

// ── Aging Ring Visual ─────────────────────────────────────────────────────────

function AgingRing({ summary }) {
  const total = Object.values(summary || {}).reduce((s, b) => s + (b?.exception_count || 0), 0)
  const critical = summary?.CRITICAL?.exception_count || 0
  const breach = summary?.BREACH?.exception_count || 0
  const warning = summary?.WARNING?.exception_count || 0
  const current = summary?.CURRENT?.exception_count || 0

  const segments = [
    { label: 'Critical 90+', count: critical, color: '#ef4444' },
    { label: 'Breach 61–90', count: breach,   color: '#f97316' },
    { label: 'Warning 31–60', count: warning, color: '#eab308' },
    { label: 'Current 0–30', count: current,  color: '#22c55e' },
  ]

  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '16px 20px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Team Aging Snapshot
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {segments.map(({ label, count, color }) => {
          const pct = total ? Math.round((count / total) * 100) : 0
          return (
            <div key={label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color }}>{count}</span>
              </div>
              <div style={{ height: 5, borderRadius: 9999, background: 'var(--surface-3)', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 9999, transition: 'width 600ms ease' }} />
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'right' }}>
        {total} total team exceptions
      </div>
    </div>
  )
}

// ── Recent Pending Items Table ────────────────────────────────────────────────

function PendingTable({ workflows }) {
  const pending = useMemo(
    () => (workflows || []).filter(w => w.status === 'reviewed').slice(0, 6),
    [workflows]
  )

  if (!pending.length) {
    return (
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 12, padding: 24, textAlign: 'center' }}>
        <CheckCircle2 size={28} color="#22c55e" style={{ marginBottom: 8 }} />
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>All caught up!</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 4 }}>No pending approvals at the moment.</div>
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pending Approvals</span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 9999, background: '#eab30822', color: '#eab308' }}>
          {pending.length} awaiting
        </span>
      </div>
      {pending.map((w, i) => (
        <div key={w.id} style={{ padding: '10px 16px', borderBottom: i < pending.length - 1 ? '1px solid var(--border-0)' : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(234,179,8,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <FileCheck2 size={13} color="#eab308" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {w.profile_name || w.entity_name || `Workflow #${w.id}`}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              Submitted {fmtDate(w.submitted_at || w.updated_at || w.created_at)}
              {w.preparer_name ? ` · ${w.preparer_name}` : ''}
            </div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 9999, background: 'rgba(234,179,8,0.10)', color: '#eab308', flexShrink: 0 }}>
            Awaiting
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ApproverDashboard() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()

  // Reviewer/approver shared dashboard metrics
  const { data: dashMetrics, isLoading: dashLoading } = useQuery({
    queryKey: ['approver-dashboard-metrics'],
    queryFn: () => enterpriseAPI.reviewerDashboard(),
    refetchInterval: 30000,
  })

  // All certification workflows — to count pending & compute SLA risk
  const { data: workflows = [], isLoading: wfLoading } = useQuery({
    queryKey: ['approver-cert-workflows'],
    queryFn: () => enterpriseAPI.listCertificationWorkflows(),
    refetchInterval: 30000,
  })

  // Exceptions for escalated count
  const { data: exceptions = [], isLoading: exLoading } = useQuery({
    queryKey: ['approver-exceptions'],
    queryFn: () => enterpriseAPI.listExceptions(),
    refetchInterval: 30000,
  })

  // Aging summary — full team view for approver (no scoping)
  const { data: agingSummary, isLoading: agingLoading } = useQuery({
    queryKey: ['approver-aging-summary'],
    queryFn: () => agingAPI.getSummary({}),
    refetchInterval: 60000,
  })

  const isLoading = dashLoading || wfLoading || exLoading

  // ── Computed KPIs ──
  const pendingCount = useMemo(
    () => workflows.filter(w => w.status === 'reviewed').length,
    [workflows]
  )

  const approvedToday = useMemo(() => {
    const today = new Date().toDateString()
    return workflows.filter(w => {
      if (w.status !== 'approved') return false
      try { return new Date(w.approved_at || w.updated_at).toDateString() === today } catch { return false }
    }).length
  }, [workflows])

  const escalatedCount = useMemo(
    () => exceptions.filter(e => e.status === 'ESCALATED').length,
    [exceptions]
  )

  // Items where submitted > 3 days ago (SLA breach risk)
  const nearingSlaCount = useMemo(() => {
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000
    return workflows.filter(w => {
      if (w.status !== 'reviewed') return false
      try { return Date.now() - new Date(w.submitted_at || w.updated_at).getTime() > threeDaysMs } catch { return false }
    }).length
  }, [workflows])

  if (isLoading) return <LoadingState message="Loading your dashboard…" />

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const displayName = user?.username ? user.username.charAt(0).toUpperCase() + user.username.slice(1) : 'Approver'

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1280, margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      <PageHeader
        title={`${greeting}, ${displayName}`}
        subtitle="Here's a snapshot of your approval queue and team status."
      />

      {/* ── KPI Row ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
        <KpiCard
          label="Pending Approvals"
          value={fmt(pendingCount)}
          sub="Profiles submitted & awaiting your sign-off"
          icon={FileCheck2}
          color="#eab308"
          urgent={pendingCount > 0}
          onClick={() => navigate('/approver-queue')}
        />
        <KpiCard
          label="Nearing SLA Breach"
          value={fmt(nearingSlaCount)}
          sub="Items open for 3+ days — intervene now"
          icon={Clock}
          color="#f97316"
          urgent={nearingSlaCount > 0}
          onClick={() => navigate('/approver-queue')}
        />
        <KpiCard
          label="Escalated Items"
          value={fmt(escalatedCount)}
          sub="Critical-risk items requiring immediate action"
          icon={ShieldAlert}
          color="#ef4444"
          urgent={escalatedCount > 0}
          onClick={() => navigate('/exception-workbench')}
        />
        <KpiCard
          label="Approved Today"
          value={fmt(approvedToday)}
          sub="Sign-offs completed in today's session"
          icon={CheckCircle2}
          color="#22c55e"
        />
      </div>

      {/* ── Main Content Grid ────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, marginBottom: 24 }}>

        {/* Left: Pending Table + Quick Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <PendingTable workflows={workflows} />

          {/* Quick Actions */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 10 }}>
              Quick Actions
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ActionCard
                title="Pending Approvals"
                description="View all reconciliation profiles submitted and awaiting your final sign-off. Approve or return with comments."
                icon={FileCheck2}
                color="#eab308"
                to="/approver-queue"
                badge={pendingCount || undefined}
              />
              <ActionCard
                title="Exception Management"
                description="Investigate isolated variances and validate the explanations Preparers have provided for breaks."
                icon={AlertTriangle}
                color="#f97316"
                to="/exception-investigation"
              />
              <ActionCard
                title="Escalated Items"
                description="High-priority inbox. Critical-risk items flagged by the system or manually escalated by Preparers."
                icon={ShieldAlert}
                color="#ef4444"
                to="/exception-workbench"
                badge={escalatedCount || undefined}
              />
              <ActionCard
                title="Close Sign-offs"
                description="Procedural close checklist: sub-ledger locks, compliance policy acknowledgements."
                icon={FileCheck2}
                color="#6366f1"
                to="#"
                disabled
              />
            </div>
          </div>
        </div>

        {/* Right: Aging Ring + Analytics shortcuts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <AgingRing summary={agingSummary?.buckets || agingSummary} />

          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Analytics
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { label: 'Team Aging Analysis', icon: Clock, color: '#6366f1', to: '/aging-dashboard', desc: 'Track how long tasks sit in queues' },
                { label: 'Variance Analysis', icon: TrendingUp, color: '#22c55e', to: '/variance-analytics', desc: 'MoM balance comparison & flux shifts' },
              ].map(({ label, icon: Icon, color, to, desc }) => (
                <div
                  key={to}
                  onClick={() => navigate(to)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 8,
                    border: '1px solid var(--border-0)',
                    cursor: 'pointer',
                    transition: 'border-color 100ms, background 100ms',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = color + '55'; e.currentTarget.style.background = color + '0a' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.background = '' }}
                >
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={13} color={color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 1 }}>{desc}</div>
                  </div>
                  <ChevronRight size={12} color="var(--text-tertiary)" />
                </div>
              ))}
            </div>
          </div>

          {/* Team progress from dashboard metrics */}
          {dashMetrics && (
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Team Progress
              </div>
              {[
                { label: 'Total Assigned', value: dashMetrics.total_assigned ?? dashMetrics.total_workflows ?? '—', color: '#6366f1' },
                { label: 'Completed',      value: dashMetrics.completed ?? dashMetrics.approved ?? '—',             color: '#22c55e' },
                { label: 'In Progress',    value: dashMetrics.in_progress ?? dashMetrics.under_review ?? '—',       color: '#eab308' },
                { label: 'Overdue',        value: dashMetrics.overdue ?? '0',                                       color: '#ef4444' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border-0)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color }}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
