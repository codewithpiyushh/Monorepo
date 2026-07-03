// frontend/src/components/sla/EscalatedItemsPanel.jsx
//
// SLA Monitoring & Escalation — Phase 2, Chunk 4, Part 6.
// Approver placement: escalated items (escalation_level=3 affecting their
// team) surfaced inside the existing Pending Approvals / Work Queue view
// (WorkQueue.jsx) — NOT a new route.

import { useQuery } from '@tanstack/react-query'
import { ShieldAlert, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import slaAPI from '../../api/slaAPI'

const C = { bad: '#ef4444' }

export default function EscalatedItemsPanel() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['sla-escalated-panel'],
    queryFn: () => slaAPI.listTeamViolations(),
    staleTime: 60_000,
  })

  const escalated = (data?.violations || []).filter(v => v.escalation_level === 3 && v.status === 'OPEN')
  if (isLoading || !escalated.length) return null

  return (
    <div className="card" style={{
      padding: 14, marginBottom: 20, border: '1px solid rgba(239,68,68,0.3)',
      background: 'rgba(239,68,68,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldAlert size={15} color={C.bad} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>
            {escalated.length} Escalated Account{escalated.length > 1 ? 's' : ''} — Level 3
          </span>
        </div>
        <button className="btn-secondary btn-sm" onClick={() => navigate('/escalation-workbench')}>
          View All <ArrowRight size={11} />
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {escalated.slice(0, 4).map(v => (
          <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text-secondary)' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{v.profile_name}</span>
            <span>— reassigned to {v.current_owner_name || `User #${v.current_owner_id}`}, {v.days_overdue}d overdue</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/*
INTEGRATION — WorkQueue.jsx (verified anchor: right after PageHeader, ~line 177):

  import EscalatedItemsPanel from '../components/sla/EscalatedItemsPanel'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PageHeader title={config.title} subtitle={...} badge={...} />

      <div style={{ flex: 1, overflow: 'auto', padding: 20 }} className="slim-scroll">
        {(normalizeRole(user?.role) === 'approver') && <EscalatedItemsPanel />}

        // Project Selector
        <div className="card" ...>
        ...existing content unchanged...
*/
