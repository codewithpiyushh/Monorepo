// frontend/src/components/sla/SLAWarningBanner.jsx
//
// SLA Monitoring & Escalation — Phase 2, Chunk 4, Part 6.
// Preparer placement: a card/banner on the existing Home Dashboard / My
// Reconciliations landing page (PreparerWorkbench.jsx) — NOT a new route.
// Shows only violations where the current user is current_owner_id.
// Renders nothing if there are no open violations (no banner spam).

import { useQuery } from '@tanstack/react-query'
import { AlertOctagon, Clock } from 'lucide-react'
import slaAPI from '../../api/slaAPI'

const C = { warn: '#f59e0b', bad: '#ef4444', orange: '#f97316' }
const LEVEL_COLOR = { 1: C.warn, 2: C.orange, 3: C.bad }

export default function SLAWarningBanner({ onSelectBalance }) {
  const { data, isLoading } = useQuery({
    queryKey: ['sla-my-violations-banner'],
    queryFn: () => slaAPI.listMyViolations(),
    staleTime: 60_000,
  })

  const violations = (data?.violations || []).filter(v => v.status === 'OPEN')
  if (isLoading || !violations.length) return null

  return (
    <div style={{
      background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)',
      borderRadius: 10, padding: '12px 16px', marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <AlertOctagon size={15} color={C.bad} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>
          {violations.length} SLA Warning{violations.length > 1 ? 's' : ''} on your reconciliations
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {violations.slice(0, 3).map(v => (
          <div
            key={v.id}
            onClick={() => onSelectBalance?.(v.balance_id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5,
              color: 'var(--text-secondary)', cursor: onSelectBalance ? 'pointer' : 'default',
            }}
          >
            <Clock size={11} color={LEVEL_COLOR[v.escalation_level] || C.warn} />
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{v.profile_name}</span>
            <span>— {v.days_overdue}d overdue (Level {v.escalation_level})</span>
          </div>
        ))}
        {violations.length > 3 && (
          <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
            +{violations.length - 3} more
          </span>
        )}
      </div>
    </div>
  )
}

/*
INTEGRATION — PreparerWorkbench.jsx (verified anchor in your uploaded file):

  import SLAWarningBanner from '../components/sla/SLAWarningBanner'

  ...

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="My Reconciliations"
        subtitle="Prepare, match, explain variances and submit for review."
        badge={`${myProfiles.length} assigned`}
      />

      <div style={{ padding: '0 20px' }}>
        <SLAWarningBanner onSelectBalance={(balanceId) => navigate(`/balance-reconciliation/${balanceId}`)} />
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        ...existing sidebar/content unchanged...
*/
