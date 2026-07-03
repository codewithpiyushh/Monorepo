// frontend/src/components/sla/EnterpriseSLAPanel.jsx
//
// SLA Monitoring & Escalation — Phase 2, Chunk 4, Part 6.
// Certifier placement: enterprise SLA metrics surfaced inside the existing
// Close Readiness page (FinancialCloseCalendarPage.jsx) AND the existing
// Executive Dashboard (ExecutiveDashboard.jsx) — additional panel/section
// on each, NOT new pages.
//
// Dual data-source design:
//   - Inside Close Readiness: pass `slaSection` (the `sla` field already
//     returned by GET /api/v1/close-calendar/{id}/dashboard — see Part 5
//     integration in close_calendar_service.py). No extra API call.
//   - Inside Executive Dashboard (no period context): omit `slaSection`
//     and the panel fetches enterprise-wide violations itself via
//     slaAPI.listEnterpriseViolations().

import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ShieldAlert, TrendingUp, AlertOctagon, Users, ArrowRight } from 'lucide-react'
import slaAPI from '../../api/slaAPI'

const C = { accent: '#6366f1', ok: '#22c55e', warn: '#f59e0b', bad: '#ef4444', orange: '#f97316' }

function deriveFromViolations(violations) {
  const open = violations.filter(v => v.status === 'OPEN')
  const escalated = open.filter(v => v.escalation_level === 3)
  const overdueCerts = open.filter(v => v.violation_type === 'CERTIFICATION_OVERDUE')
  const byPriority = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 }
  open.forEach(v => { if (v.priority_level && byPriority[v.priority_level] !== undefined) byPriority[v.priority_level]++ })

  const approverCounts = {}
  open.forEach(v => {
    if (v.current_owner_id) {
      approverCounts[v.current_owner_id] = approverCounts[v.current_owner_id] || { count: 0, name: v.current_owner_name }
      approverCounts[v.current_owner_id].count++
    }
  })
  const bottleneck_approvers = Object.entries(approverCounts)
    .map(([id, v]) => ({ user_id: Number(id), user_name: v.name || `User #${id}`, open_violation_count: v.count }))
    .sort((a, b) => b.open_violation_count - a.open_violation_count)
    .slice(0, 5)

  return {
    open_sla_violations_count: open.length,
    open_sla_violations_by_priority: byPriority,
    overdue_reconciliations_count: violations.filter(v => v.status !== 'RESOLVED').length,
    escalated_accounts_count: escalated.length,
    overdue_certifications_count: overdueCerts.length,
    bottleneck_approvers,
  }
}

export default function EnterpriseSLAPanel({ slaSection = null }) {
  const navigate = useNavigate()
  const shouldFetch = !slaSection

  const { data, isLoading } = useQuery({
    queryKey: ['sla-enterprise-panel'],
    queryFn: () => slaAPI.listEnterpriseViolations(),
    enabled: shouldFetch,
    staleTime: 60_000,
  })

  const section = slaSection || (data ? deriveFromViolations(data.violations || []) : null)

  if (shouldFetch && isLoading) return null
  if (!section) return null

  const hasCritical = (section.open_sla_violations_by_priority?.CRITICAL || 0) > 0

  return (
    <div style={{
      background: 'var(--surface-1)', border: `1px solid ${hasCritical ? 'rgba(239,68,68,0.3)' : 'var(--border-0)'}`,
      borderRadius: 12, padding: '16px 18px', marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldAlert size={15} color={hasCritical ? C.bad : C.accent} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Enterprise SLA Status</span>
        </div>
        <button className="btn-secondary btn-sm" onClick={() => navigate('/sla-monitor-dashboard')}>
          Full Dashboard <ArrowRight size={11} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginBottom: 12 }}>
        <Stat label="Open Violations" value={section.open_sla_violations_count} color={section.open_sla_violations_count ? C.bad : C.ok} />
        <Stat label="Escalated (L3)" value={section.escalated_accounts_count} color={section.escalated_accounts_count ? C.bad : C.ok} />
        <Stat label="Overdue Reconciliations" value={section.overdue_reconciliations_count} color={section.overdue_reconciliations_count ? C.warn : C.ok} />
        <Stat label="Overdue Certifications" value={section.overdue_certifications_count} color={section.overdue_certifications_count ? C.orange : C.ok} />
      </div>

      {hasCritical && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 10,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 7,
        }}>
          <AlertOctagon size={13} color={C.bad} />
          <span style={{ fontSize: 11.5, color: 'var(--text-primary)', fontWeight: 600 }}>
            {section.open_sla_violations_by_priority.CRITICAL} CRITICAL-priority violation(s) open — will block close readiness.
          </span>
        </div>
      )}

      {section.bottleneck_approvers?.length > 0 && (
        <div>
          <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Users size={11} /> Bottleneck Approvers
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {section.bottleneck_approvers.map(a => (
              <div key={a.user_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
                <span style={{ color: 'var(--text-primary)' }}>{a.user_name}</span>
                <span style={{ color: 'var(--text-tertiary)' }}>{a.open_violation_count} open</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color }}>{value}</div>
    </div>
  )
}

/*
INTEGRATION — ExecutiveDashboard.jsx (verified anchor: after "Secondary KPIs"
grid, ~line 178, before "Charts row"):

  import EnterpriseSLAPanel from '../components/sla/EnterpriseSLAPanel'

  ...
        // ── Secondary KPIs ────────────────────────────
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          ...existing 4 KpiCards unchanged...
        </div>

        <EnterpriseSLAPanel />   // no slaSection prop -> fetches enterprise-wide itself

        // ── Charts row ────────────────────────────────
        ...

INTEGRATION — FinancialCloseCalendarPage.jsx: see the direct edit already
applied in this delivery (PeriodDetailPanel now renders
<EnterpriseSLAPanel slaSection={d.sla} /> right after the KPI cards, reusing
the dashboard payload with zero extra API calls).
*/
