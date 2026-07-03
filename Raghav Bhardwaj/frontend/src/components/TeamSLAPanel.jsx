// frontend/src/components/sla/TeamSLAPanel.jsx
//
// SLA Monitoring & Escalation — Phase 2, Chunk 4, Part 6.
// Approver placement: additional panel inside the existing Aging Dashboard
// view (AgingDashboard.jsx) — NOT a new route. Team-wide SLA metrics for
// profiles where the viewer is assigned_approver.

import { useQuery } from '@tanstack/react-query'
import { ShieldAlert, TrendingUp, AlertOctagon } from 'lucide-react'
import slaAPI from '../../api/slaAPI'

const C = { accent: '#6366f1', ok: '#22c55e', warn: '#f59e0b', bad: '#ef4444' }

export default function TeamSLAPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['sla-team-panel'],
    queryFn: () => slaAPI.listTeamViolations(),
    staleTime: 60_000,
  })

  if (isLoading) return null

  const violations = data?.violations || []
  const open = violations.filter(v => v.status === 'OPEN')
  const escalated = open.filter(v => v.escalation_level === 3)
  const compliancePct = violations.length
    ? Math.round(((violations.length - open.length) / violations.length) * 100)
    : 100

  return (
    <div style={{
      background: 'var(--surface-1)', border: '1px solid var(--border-0)',
      borderRadius: 12, padding: '16px 18px', marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <ShieldAlert size={15} color={C.accent} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Team SLA Metrics</span>
      </div>
      <div style={{ display: 'flex', gap: 24 }}>
        <div>
          <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>Open Violations</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: open.length ? C.bad : C.ok }}>{open.length}</div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>Escalated</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: escalated.length ? C.bad : C.ok }}>{escalated.length}</div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>Team Compliance</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: compliancePct >= 90 ? C.ok : C.warn }}>{compliancePct}%</div>
        </div>
      </div>
      {open.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {open.slice(0, 4).map(v => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11 }}>
              <AlertOctagon size={11} color={C.warn} />
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{v.profile_name}</span>
              <span style={{ color: 'var(--text-tertiary)' }}>— {v.days_overdue}d overdue, Level {v.escalation_level}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/*
INTEGRATION — AgingDashboard.jsx (verified anchor: PageHeader block ~line 430):

  import TeamSLAPanel from '../components/sla/TeamSLAPanel'
  import { normalizeRole } from '../utils/roles'   // already imported there

  ...inside the component, after the role check (`const role = normalizeRole(user?.role)`)...

  return (
    <div ...>
      <PageHeader title="Exception Aging Analysis" ... />

      {role === 'approver' && <TeamSLAPanel />}

      ...existing aging bucket grid / charts unchanged...
*/
