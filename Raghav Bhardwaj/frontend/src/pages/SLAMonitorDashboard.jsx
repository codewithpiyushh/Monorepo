// frontend/src/pages/SLAMonitorDashboard.jsx
//
// SLA Monitor Dashboard — Phase 2, Chunk 4, Part 6.
// Admin dedicated page. KPIs: Total Violations, Open Violations,
// Escalated Accounts, SLA Compliance %. Plus a violations table and SLA
// policy management. Linked from Command Center / Admin Center nav.

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  ShieldAlert, AlertOctagon, TrendingUp, Activity, RefreshCw,
  Settings, Plus, ChevronRight, X,
} from 'lucide-react'
import slaAPI from '../api/slaAPI'
import { enterpriseAPI } from '../api'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, LoadingState, ErrorState } from '../components/ui/PageState'

const C = { accent: '#6366f1', ok: '#22c55e', warn: '#f59e0b', bad: '#ef4444', orange: '#f97316', muted: '#64748b' }

const ESCALATION_COLOR = { 1: C.warn, 2: C.orange, 3: C.bad }
const STATUS_COLOR = { OPEN: C.bad, ACKNOWLEDGED: C.warn, RESOLVED: C.ok }

function KpiCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div style={{
      background: 'var(--surface-1)', border: '1px solid var(--border-0)',
      borderRadius: 12, padding: '16px 18px', flex: 1, minWidth: 170,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: `${color}18`, border: `1px solid ${color}33`,
        }}>
          <Icon size={14} color={color} />
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function PolicyModal({ onClose, onSaved, profiles }) {
  const [form, setForm] = useState({
    profile_id: '', priority_level: 'MEDIUM', max_days_open: 5,
    escalation_role: 'PREPARER', reminder_interval_days: 3,
  })
  const createMut = useMutation({
    mutationFn: () => slaAPI.createPolicy({
      ...form, profile_id: form.profile_id ? Number(form.profile_id) : null,
      max_days_open: Number(form.max_days_open), reminder_interval_days: Number(form.reminder_interval_days),
    }),
    onSuccess: () => { toast.success('SLA policy created.'); onSaved() },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Failed to create policy.'),
  })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 420, background: 'var(--surface-1)', border: '1px solid var(--border-1)', borderRadius: 14, padding: 22 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 14 }}>New SLA Policy</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            Profile (leave blank for global default)
            <select value={form.profile_id} onChange={e => setForm(f => ({ ...f, profile_id: e.target.value }))}
              style={{ width: '100%', marginTop: 4, padding: '7px 9px', borderRadius: 6, border: '1px solid var(--border-1)', background: 'var(--surface-0)', color: 'var(--text-primary)', fontSize: 12 }}>
              <option value="">— Global default —</option>
              {(profiles || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            Priority Level
            <select value={form.priority_level} onChange={e => setForm(f => ({ ...f, priority_level: e.target.value }))}
              style={{ width: '100%', marginTop: 4, padding: '7px 9px', borderRadius: 6, border: '1px solid var(--border-1)', background: 'var(--surface-0)', color: 'var(--text-primary)', fontSize: 12 }}>
              {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            Max Days Open
            <input type="number" min={1} value={form.max_days_open} onChange={e => setForm(f => ({ ...f, max_days_open: e.target.value }))}
              style={{ width: '100%', marginTop: 4, padding: '7px 9px', borderRadius: 6, border: '1px solid var(--border-1)', background: 'var(--surface-0)', color: 'var(--text-primary)', fontSize: 12 }} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            Escalation Owner Role
            <select value={form.escalation_role} onChange={e => setForm(f => ({ ...f, escalation_role: e.target.value }))}
              style={{ width: '100%', marginTop: 4, padding: '7px 9px', borderRadius: 6, border: '1px solid var(--border-1)', background: 'var(--surface-0)', color: 'var(--text-primary)', fontSize: 12 }}>
              {['PREPARER', 'APPROVER', 'CERTIFIER', 'ADMIN'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            Reminder Interval (days)
            <input type="number" min={1} value={form.reminder_interval_days} onChange={e => setForm(f => ({ ...f, reminder_interval_days: e.target.value }))}
              style={{ width: '100%', marginTop: 4, padding: '7px 9px', borderRadius: 6, border: '1px solid var(--border-1)', background: 'var(--surface-0)', color: 'var(--text-primary)', fontSize: 12 }} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
          <button className="btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn-primary btn-sm" disabled={createMut.isPending} onClick={() => createMut.mutate()}>
            {createMut.isPending ? 'Saving…' : 'Create Policy'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SLAMonitorDashboard() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showPolicyModal, setShowPolicyModal] = useState(false)

  const violationsQ = useQuery({
    queryKey: ['sla-violations-all'],
    queryFn: () => slaAPI.listAllViolations(),
  })
  const policiesQ = useQuery({
    queryKey: ['sla-policies'],
    queryFn: () => slaAPI.listPolicies(),
  })
  const profilesQ = useQuery({
    queryKey: ['enterprise-profiles', 'all'],
    queryFn: () => enterpriseAPI.listProfiles(),
  })

  const scanMut = useMutation({
    mutationFn: () => slaAPI.triggerScan(),
    onSuccess: (data) => {
      toast.success(`Scan complete — ${data.new_violations} new, ${data.auto_resolved} auto-resolved.`)
      qc.invalidateQueries({ queryKey: ['sla-violations-all'] })
    },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Scan failed.'),
  })

  const violations = violationsQ.data?.violations || []
  const policies = policiesQ.data || []

  const kpis = useMemo(() => {
    const total = violations.length
    const open = violations.filter(v => v.status === 'OPEN').length
    const escalated = violations.filter(v => v.escalation_level === 3 && v.status === 'OPEN').length
    const compliance = total > 0 ? Math.round(((total - open) / total) * 100) : 100
    return { total, open, escalated, compliance }
  }, [violations])

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        title="SLA Monitor Dashboard"
        subtitle="Enterprise SLA compliance, breach tracking, and escalation policy management"
        icon={<ShieldAlert size={22} />}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary btn-sm" disabled={scanMut.isPending} onClick={() => scanMut.mutate()}>
              <RefreshCw size={13} className={scanMut.isPending ? 'spin' : ''} /> {scanMut.isPending ? 'Scanning…' : 'Run Scan'}
            </button>
            <button className="btn-primary btn-sm" onClick={() => navigate('/escalation-workbench')}>
              <ChevronRight size={13} /> Escalation Workbench
            </button>
          </div>
        }
      />

      <div style={{ marginTop: 20 }}>
        {violationsQ.isLoading && <LoadingState message="Loading SLA violations…" />}
        {violationsQ.isError && <ErrorState message="Failed to load SLA data" onRetry={violationsQ.refetch} />}

        {!violationsQ.isLoading && (
          <>
            <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
              <KpiCard icon={Activity} label="Total Violations" value={kpis.total} color={C.accent} />
              <KpiCard icon={AlertOctagon} label="Open Violations" value={kpis.open} color={C.bad} />
              <KpiCard icon={ShieldAlert} label="Escalated Accounts" value={kpis.escalated} color={C.orange} sub="Level 3 — reassigned" />
              <KpiCard icon={TrendingUp} label="SLA Compliance" value={`${kpis.compliance}%`} color={kpis.compliance >= 90 ? C.ok : C.warn} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Open Violations by Priority</span>
            </div>

            {!violations.length ? (
              <EmptyState title="No SLA violations" description="All balances are currently within their configured SLA thresholds." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 28 }}>
                {violations.filter(v => v.status === 'OPEN').slice(0, 15).map(v => (
                  <div key={v.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                    background: 'var(--surface-1)', border: '1px solid var(--border-0)', borderRadius: 8,
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: ESCALATION_COLOR[v.escalation_level] || C.muted,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {v.profile_name} — {v.violation_type.replace(/_/g, ' ')}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
                        {v.days_overdue}d overdue · Level {v.escalation_level} · Owner: {v.current_owner_name || `User #${v.current_owner_id}`}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 9.5, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                      color: STATUS_COLOR[v.status], background: `${STATUS_COLOR[v.status]}18`,
                    }}>
                      {v.status}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                <Settings size={13} style={{ marginRight: 6, verticalAlign: -2 }} /> SLA Policies
              </span>
              <button className="btn-secondary btn-sm" onClick={() => setShowPolicyModal(true)}>
                <Plus size={12} /> New Policy
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {policies.length === 0 && (
                <EmptyState title="No SLA policies configured" description="Create a global default policy per priority level, or a profile-specific override." />
              )}
              {policies.map(p => (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                  background: 'var(--surface-1)', border: '1px solid var(--border-0)', borderRadius: 8,
                }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)', width: 110 }}>
                    {p.priority_level}
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)', flex: 1 }}>
                    {p.profile_name ? `Profile: ${p.profile_name}` : 'Global default'} · Max {p.max_days_open}d · Owner: {p.escalation_role} · Reminder every {p.reminder_interval_days}d
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {showPolicyModal && (
        <PolicyModal
          profiles={profilesQ.data || []}
          onClose={() => setShowPolicyModal(false)}
          onSaved={() => { setShowPolicyModal(false); policiesQ.refetch() }}
        />
      )}
    </div>
  )
}
