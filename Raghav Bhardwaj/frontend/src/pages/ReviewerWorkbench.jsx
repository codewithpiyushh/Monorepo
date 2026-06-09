/**
 * ReviewerWorkbench — Full Oracle ARCS-style reviewer workspace
 *
 * Navigation sections (6 primary areas):
 *  Home         — KPI cards, review queue grid, dashboard widgets
 *  Matching     — match quality review (read-only), low confidence, manual overrides
 *  Recon Hub    — pending/approved/returned/escalated tabs with full grid
 *  Close Cal    — reviews due this period, close readiness
 *  Certification — review queue, approval timeline, return queue, checklist
 *  Controls     — policy violations, control failures, risk monitoring (read-only)
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import ReactECharts from 'echarts-for-react'
import {
  Home, GitMerge, Layers, Calendar, Award, Shield,
  CheckCircle2, XCircle, AlertTriangle, Clock,
  ThumbsUp, ThumbsDown, ShieldAlert, MessageSquare,
  Send, Eye, Flag, ChevronRight, RefreshCw,
  TrendingUp, BarChart2, Paperclip, File,
} from 'lucide-react'
import { enterpriseAPI, authAPI } from '../api'
import { advancedAPI, enterpriseExtAPI } from '../api'
import { useAuthStore } from '../store/authStore'
import { useProjectStore } from '../store/projectStore'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, LoadingState } from '../components/ui/PageState'

// ─────────────────────────────────────────────────────────────
// Constants & helpers
// ─────────────────────────────────────────────────────────────
const fmt      = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate  = (s) => { try { return new Date(s).toLocaleString() } catch { return s || '—' } }
const fmtShort = (s) => { try { return new Date(s).toLocaleDateString() } catch { return s || '—' } }
const isOverdue = (dateStr) => { try { return new Date() > new Date(dateStr) } catch { return false } }
const daysSince = (dateStr) => { try { return Math.floor((Date.now() - new Date(dateStr)) / 86400000) } catch { return 0 } }

const RISK_COLOR = { LOW: 'var(--ok)', MEDIUM: 'var(--warn)', HIGH: 'var(--bad)', CRITICAL: '#c026d3' }
const CERT_META  = {
  OPEN:         { label: 'Open',         color: 'var(--text-tertiary)' },
  PREPARED:     { label: 'Prepared',     color: 'var(--info)' },
  UNDER_REVIEW: { label: 'Under Review', color: 'var(--warn)' },
  SUBMITTED:    { label: 'Submitted',    color: 'var(--warn)' },
  APPROVED:     { label: 'Approved',     color: 'var(--ok)' },
  REJECTED:     { label: 'Rejected',     color: 'var(--bad)' },
  CERTIFIED:    { label: 'Certified',    color: 'var(--ok)' },
  ESCALATED:    { label: 'Escalated',    color: '#c026d3' },
}

function CertBadge({ status }) {
  const m = CERT_META[status] || { label: status, color: 'var(--text-tertiary)' }
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 9999,
    border: `1px solid ${m.color}33`, color: m.color, background: `${m.color}14` }}>{m.label}</span>
}
function RiskBadge({ risk }) {
  const c = RISK_COLOR[(risk || 'MEDIUM').toUpperCase()] || 'var(--warn)'
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 9999,
    border: `1px solid ${c}33`, color: c, background: `${c}14` }}>{risk}</span>
}

// ─────────────────────────────────────────────────────────────
// Shared: KPI Card
// ─────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, icon: Icon, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: 'var(--surface-2)', border: '1px solid var(--border-1)',
      borderRadius: 10, padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
      cursor: onClick ? 'pointer' : 'default',
      transition: 'border-color 150ms',
    }}
    onMouseEnter={(e) => { if (onClick) e.currentTarget.style.borderColor = color }}
    onMouseLeave={(e) => { if (onClick) e.currentTarget.style.borderColor = 'var(--border-1)' }}
    >
      <div style={{ width: 38, height: 38, borderRadius: 9, background: `${color}18`,
        border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon style={{ width: 16, height: 16, color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>{label}</p>
        <p style={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1.0 }}>{value}</p>
        {sub && <p style={{ fontSize: 10.5, color: 'var(--text-disabled)', marginTop: 2 }}>{sub}</p>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Shared: Action panel for cert workflow
// ─────────────────────────────────────────────────────────────
function WorkflowActions({ workflowId, certActionMutation, compact = false }) {
  const [comment, setComment] = useState('')
  const [mode,    setMode]    = useState(null) // 'approve' | 'return' | 'escalate'

  const handle = (action) => {
    if ((action === 'REJECT') && !comment.trim()) { toast.error('Return reason required'); return }
    certActionMutation.mutate({ workflow_id: workflowId, action, comments: comment })
    setMode(null); setComment('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {!compact && (
        <textarea className="input text-xs" rows={2}
          placeholder="Add reviewer note or return reason…"
          value={comment} onChange={(e) => setComment(e.target.value)}
          style={{ resize: 'vertical' }} />
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn-primary text-xs h-7" disabled={certActionMutation.isPending}
          onClick={() => handle('APPROVE')}>
          <ThumbsUp style={{ width: 11, height: 11 }} /> Approve
        </button>
        <button className="btn-secondary text-xs h-7"
          style={{ color: 'var(--warn)', borderColor: 'rgba(245,158,11,.30)' }}
          disabled={certActionMutation.isPending}
          onClick={() => { if (!compact) handle('REJECT'); else setMode(mode === 'return' ? null : 'return') }}>
          <ThumbsDown style={{ width: 11, height: 11 }} /> Return
        </button>
        <button className="btn-secondary text-xs h-7"
          style={{ color: '#c026d3', borderColor: 'rgba(192,38,211,.25)' }}
          disabled={certActionMutation.isPending}
          onClick={() => handle('ESCALATE')}>
          <ShieldAlert style={{ width: 11, height: 11 }} /> Escalate
        </button>
      </div>
      {compact && mode === 'return' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <input className="input text-xs flex-1" placeholder="Return reason (required)…"
            value={comment} onChange={(e) => setComment(e.target.value)} />
          <button className="btn-primary text-xs h-8" onClick={() => handle('REJECT')}>Send</button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// HOME section
// ─────────────────────────────────────────────────────────────
function HomeSection({ profiles, allCerts, dashboard, users, onNavigate }) {
  const today = new Date()

  const reviewable    = allCerts.filter((c) => ['PREPARED','UNDER_REVIEW','SUBMITTED'].includes(c.status || ''))
  const dueToday      = reviewable.filter((c) => { try { const d = new Date(c.due_date); return d.toDateString() === today.toDateString() } catch { return false } })
  const overdue       = reviewable.filter((c) => isOverdue(c.due_date))
  const returnedMonth = allCerts.filter((c) => c.status === 'REJECTED')
  const approvedMonth = allCerts.filter((c) => ['APPROVED','CERTIFIED'].includes(c.status || ''))
  const highRisk      = profiles.filter((p) => ['HIGH','CRITICAL'].includes((p.risk_classification || '').toUpperCase()))

  const getProfile  = (cert) => profiles.find((p) => p.id === cert?.profile_id)
  const getPreparer = (profile) => users.find((u) => u.id === profile?.assigned_preparer)
  const getVariance = (cert) => {
    // Try to get from cert last_comment or show placeholder
    return cert?.variance_amount || null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
        <KpiCard label="Pending Reviews"    value={reviewable.length}    color='var(--warn)'    icon={Clock}          onClick={() => onNavigate('recon-hub')} />
        <KpiCard label="Due Today"          value={dueToday.length}      color='var(--bad)'     icon={AlertTriangle}  onClick={() => onNavigate('recon-hub')} />
        <KpiCard label="Overdue Reviews"    value={overdue.length}       color='var(--bad)'     icon={ShieldAlert}    onClick={() => onNavigate('recon-hub')} />
        <KpiCard label="Returned This Month" value={returnedMonth.length} color='var(--text-tertiary)' icon={ThumbsDown} />
        <KpiCard label="Approved This Month" value={approvedMonth.length} color='var(--ok)'     icon={ThumbsUp} />
      </div>

      {/* Main review queue grid */}
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-0)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>My Review Queue</p>
          <button className="btn-secondary text-xs h-7" onClick={() => onNavigate('recon-hub')}>
            View All <ChevronRight style={{ width: 11, height: 11 }} />
          </button>
        </div>
        {reviewable.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center' }}>
            <CheckCircle2 style={{ width: 28, height: 28, color: 'var(--ok)', margin: '0 auto 8px' }} />
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>All caught up — no pending reviews</p>
          </div>
        ) : (
          <table className="data-table" style={{ borderRadius: 0 }}>
            <thead>
              <tr><th>Reconciliation</th><th>Preparer</th><th>Due Date</th><th>Risk</th><th>Variance</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {reviewable.slice(0, 10).map((cert) => {
                const profile  = getProfile(cert)
                const preparer = getPreparer(profile)
                const odColor  = isOverdue(cert.due_date) ? 'var(--bad)' : 'var(--text-tertiary)'
                return (
                  <tr key={cert.id}>
                    <td style={{ maxWidth: 220 }}>
                      <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {profile?.name || `Profile #${cert.profile_id}`}
                      </p>
                      <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
                        {(profile?.reconciliation_type || '').replace(/_/g,' ')}
                      </p>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {preparer?.username || `User #${profile?.assigned_preparer}`}
                    </td>
                    <td style={{ fontSize: 11, color: odColor, fontWeight: isOverdue(cert.due_date) ? 700 : 400 }}>
                      {isOverdue(cert.due_date) ? `⚠ ` : ''}{cert.due_date || '—'}
                    </td>
                    <td><RiskBadge risk={profile?.risk_classification || 'MEDIUM'} /></td>
                    <td style={{ fontSize: 11, color: 'var(--warn)' }}>—</td>
                    <td><CertBadge status={cert.status} /></td>
                    <td>
                      <button className="btn-secondary text-xs py-0.5 h-6"
                        onClick={() => onNavigate('certification', cert.id)}>
                        Review
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Dashboard widgets row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>

        {/* Awaiting Review */}
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'var(--text-tertiary)', marginBottom: 10 }}>
            AWAITING REVIEW
          </p>
          {reviewable.slice(0, 4).map((cert) => {
            const profile = getProfile(cert)
            return (
              <div key={cert.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border-0)' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warn)', flexShrink: 0 }} />
                <p style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                  {profile?.name || `WF-${cert.id}`}
                </p>
              </div>
            )
          })}
          {reviewable.length === 0 && <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>None pending</p>}
        </div>

        {/* High Risk Reviews */}
        <div style={{ background: 'var(--surface-2)', border: '1px solid rgba(239,68,68,.20)', borderRadius: 10, padding: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'var(--bad)', marginBottom: 10 }}>
            HIGH RISK ({highRisk.length})
          </p>
          {highRisk.slice(0, 4).map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border-0)' }}>
              <ShieldAlert style={{ width: 11, height: 11, color: 'var(--bad)', flexShrink: 0 }} />
              <p style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                {p.name}
              </p>
            </div>
          ))}
          {highRisk.length === 0 && <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>None flagged</p>}
        </div>

        {/* Returned Items */}
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'var(--text-tertiary)', marginBottom: 10 }}>
            RETURNED ({returnedMonth.length})
          </p>
          {returnedMonth.slice(0, 4).map((cert) => {
            const profile = getProfile(cert)
            return (
              <div key={cert.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border-0)' }}>
                <ThumbsDown style={{ width: 10, height: 10, color: 'var(--text-tertiary)', flexShrink: 0 }} />
                <p style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                  {profile?.name || `WF-${cert.id}`}
                </p>
              </div>
            )
          })}
          {returnedMonth.length === 0 && <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>None returned</p>}
        </div>

        {/* Recently Approved */}
        <div style={{ background: 'var(--surface-2)', border: '1px solid rgba(34,197,94,.15)', borderRadius: 10, padding: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'var(--ok)', marginBottom: 10 }}>
            RECENTLY APPROVED ({approvedMonth.length})
          </p>
          {approvedMonth.slice(0, 4).map((cert) => {
            const profile = getProfile(cert)
            return (
              <div key={cert.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border-0)' }}>
                <CheckCircle2 style={{ width: 10, height: 10, color: 'var(--ok)', flexShrink: 0 }} />
                <p style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                  {profile?.name || `WF-${cert.id}`}
                </p>
              </div>
            )
          })}
          {approvedMonth.length === 0 && <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>None yet</p>}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// MATCHING section — review quality only, no match/unmatch
// ─────────────────────────────────────────────────────────────
function MatchingSection({ profiles }) {
  const [profileId, setProfileId] = useState('')

  const { data: matchGroups = [], isLoading } = useQuery({
    queryKey: ['profile-transactions', profileId],
    queryFn: () => advancedAPI.profileTransactions(Number(profileId)),
    enabled: Boolean(profileId),
  })

  const stats = useMemo(() => {
    const arr = Array.isArray(matchGroups) ? matchGroups : []
    const full     = arr.filter((m) => m.classification === 'FULL_MATCH').length
    const partial  = arr.filter((m) => m.classification === 'PARTIAL_MATCH').length
    const unmatched = arr.filter((m) => m.classification === 'UNMATCHED').length
    const lowConf  = arr.filter((m) => (m.confidence || 0) < 0.7 && m.classification !== 'UNMATCHED').length
    const manual   = arr.filter((m) => m.strategy === 'manual').length
    const override = arr.filter((m) => m.strategy === 'rule_based').length
    const rate     = arr.length ? Math.round(full / arr.length * 100) : 0
    return { total: arr.length, full, partial, unmatched, lowConf, manual, override, rate }
  }, [matchGroups])

  const matchTypeData = useMemo(() => {
    if (!Array.isArray(matchGroups)) return []
    const counts = {}
    matchGroups.forEach((m) => { counts[m.strategy || 'unknown'] = (counts[m.strategy || 'unknown'] || 0) + 1 })
    return Object.entries(counts).map(([k, v]) => ({ type: k, count: v }))
  }, [matchGroups])

  const lowConfMatches = useMemo(() =>
    (Array.isArray(matchGroups) ? matchGroups : []).filter((m) => (m.confidence || 0) < 0.7 && m.classification !== 'UNMATCHED'),
  [matchGroups])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Profile selector */}
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>Review Match Quality</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="input text-xs flex-1" value={profileId} onChange={(e) => setProfileId(e.target.value)} style={{ maxWidth: 400 }}>
            <option value="">Select a reconciliation profile to review…</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(245,158,11,0.06)',
          border: '1px solid rgba(245,158,11,0.20)', borderRadius: 8, fontSize: 12, color: 'var(--warn)' }}>
          ⓘ Reviewer access is read-only. Matching, unmatching, splitting and merging are preparer functions.
          You may approve the match set or return it for rework.
        </div>
      </div>

      {profileId && (
        <>
          {/* Match quality KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
            {[
              ['Matches Approved',    stats.full,      'var(--ok)'],
              ['Manual Matches',      stats.manual,    'var(--info)'],
              ['Override Matches',    stats.override,  'var(--accent)'],
              ['Low Confidence',      stats.lowConf,   'var(--warn)'],
              ['Auto-Match Rate',     `${stats.rate}%`, stats.rate >= 85 ? 'var(--ok)' : stats.rate >= 60 ? 'var(--warn)' : 'var(--bad)'],
            ].map(([label, val, color]) => (
              <div key={label} style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 9, padding: '12px 14px' }}>
                <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginBottom: 4 }}>{label}</p>
                <p style={{ fontSize: 20, fontWeight: 700, color }}>{val}</p>
              </div>
            ))}
          </div>

          {/* Match type breakdown table */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-0)' }}>
                <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>Match Type Breakdown</p>
              </div>
              <table className="data-table" style={{ borderRadius: 0 }}>
                <thead><tr><th>Match Type</th><th>Count</th><th>%</th></tr></thead>
                <tbody>
                  {matchTypeData.map((row) => (
                    <tr key={row.type}>
                      <td style={{ fontSize: 12, fontWeight: 600 }}>{row.type.replace(/_/g,' ')}</td>
                      <td style={{ fontSize: 12 }}>{row.count}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                        {stats.total ? Math.round(row.count / stats.total * 100) : 0}%
                      </td>
                    </tr>
                  ))}
                  {matchTypeData.length === 0 && <tr><td colSpan={3} style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center' }}>No data</td></tr>}
                </tbody>
              </table>
            </div>

            {/* Low confidence matches */}
            <div style={{ background: 'var(--surface-2)', border: `1px solid ${stats.lowConf > 0 ? 'rgba(245,158,11,.25)' : 'var(--border-1)'}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-0)' }}>
                <p style={{ fontSize: 12.5, fontWeight: 700, color: stats.lowConf > 0 ? 'var(--warn)' : 'var(--text-primary)' }}>
                  Low Confidence Matches ({stats.lowConf})
                </p>
              </div>
              {lowConfMatches.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center' }}>
                  <CheckCircle2 style={{ width: 20, height: 20, color: 'var(--ok)', margin: '0 auto 6px' }} />
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No low-confidence matches</p>
                </div>
              ) : (
                <table className="data-table" style={{ borderRadius: 0 }}>
                  <thead><tr><th>Group</th><th>Strategy</th><th>Confidence</th><th>Variance</th></tr></thead>
                  <tbody>
                    {lowConfMatches.slice(0, 8).map((mg) => (
                      <tr key={mg.id}>
                        <td style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}>#{mg.id}</td>
                        <td style={{ fontSize: 11 }}>{mg.strategy}</td>
                        <td style={{ fontSize: 12, fontWeight: 700, color: 'var(--warn)' }}>
                          {Math.round((mg.confidence || 0) * 100)}%
                        </td>
                        <td style={{ fontSize: 11, color: mg.variance_amount > 0 ? 'var(--warn)' : 'var(--text-tertiary)' }}>
                          {mg.variance_amount > 0 ? `$${Number(mg.variance_amount).toFixed(2)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Reviewer actions */}
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: 16 }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Reviewer Actions</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[
                { label: 'View Match Details',   icon: Eye,          action: () => toast('Match details view — open Transaction Matching Workspace') },
                { label: 'Review Evidence',      icon: Paperclip,    action: () => toast('Evidence attached to this profile') },
                { label: 'Approve Match Set',    icon: CheckCircle2, action: () => toast.success('Match set approved'), style: { background: '#FFE600', border: '1px solid #E6CF00', color: '#1A1A24' } },
                { label: 'Return For Rework',    icon: ThumbsDown,   action: () => toast('Returned for preparer rework') },
              ].map(({ label, icon: Icon, action, style: btnStyle }) => (
                <button key={label} onClick={action} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  height: 32, padding: '0 14px', borderRadius: 7,
                  border: '1px solid var(--border-2)', background: 'var(--surface-3)',
                  color: 'var(--text-primary)', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                  ...btnStyle,
                }}>
                  <Icon style={{ width: 12, height: 12 }} /> {label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// RECON HUB section — review workbench with status tabs
// ─────────────────────────────────────────────────────────────
function ReconHubSection({ profiles, allCerts, users, certActionMutation }) {
  const [hubTab,    setHubTab]    = useState('pending')
  const [selected,  setSelected]  = useState(null)   // selected cert ID for detail
  const [comment,   setComment]   = useState('')

  const tabDefs = [
    { id: 'pending',   label: 'Pending Review', statuses: ['PREPARED','UNDER_REVIEW','SUBMITTED'] },
    { id: 'approved',  label: 'Approved',        statuses: ['APPROVED'] },
    { id: 'returned',  label: 'Returned',        statuses: ['REJECTED'] },
    { id: 'escalated', label: 'Escalated',       statuses: ['ESCALATED'] },
  ]

  const currentTab  = tabDefs.find((t) => t.id === hubTab)
  const filtered    = allCerts.filter((c) => currentTab?.statuses.includes(c.status || ''))
  const selectedCert = allCerts.find((c) => c.id === selected)
  const selectedProfile = profiles.find((p) => p.id === selectedCert?.profile_id)

  const getProfile  = (cert) => profiles.find((p) => p.id === cert?.profile_id)
  const getPreparer = (cert) => {
    const prof = getProfile(cert)
    return users.find((u) => u.id === prof?.assigned_preparer)
  }

  return (
    <div style={{ display: 'flex', gap: 14, height: '100%' }}>

      {/* Left: grid */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0, background: 'var(--surface-1)', borderRadius: 8, overflow: 'hidden',
          border: '1px solid var(--border-1)', flexShrink: 0 }}>
          {tabDefs.map((t) => {
            const count   = allCerts.filter((c) => t.statuses.includes(c.status || '')).length
            const isActive = hubTab === t.id
            return (
              <button key={t.id} onClick={() => { setHubTab(t.id); setSelected(null) }} style={{
                flex: 1, padding: '9px 8px', fontSize: 11.5, fontWeight: isActive ? 700 : 500,
                color: isActive ? '#FFE600' : 'var(--text-tertiary)',
                background: isActive ? 'rgba(255,230,0,0.08)' : 'none',
                border: 'none', borderBottom: `2px solid ${isActive ? '#FFE600' : 'transparent'}`,
                cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 5, transition: 'color 120ms',
              }}>
                {t.label}
                {count > 0 && (
                  <span style={{ fontSize: 9, fontWeight: 800, minWidth: 16, height: 16, padding: '0 3px',
                    borderRadius: 9999, background: t.id === 'pending' ? '#FFE600' : 'var(--surface-3)',
                    color: t.id === 'pending' ? '#1A1A24' : 'var(--text-secondary)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Grid */}
        <div style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '40px 16px', textAlign: 'center' }}>
              <CheckCircle2 style={{ width: 28, height: 28, color: 'var(--ok)', margin: '0 auto 8px' }} />
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No items in this queue</p>
            </div>
          ) : (
            <table className="data-table" style={{ borderRadius: 0 }}>
              <thead>
                <tr><th>Profile</th><th>Entity</th><th>Preparer</th><th>Variance</th><th>Risk</th><th>Due Date</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map((cert) => {
                  const profile  = getProfile(cert)
                  const preparer = getPreparer(cert)
                  const isSelected = selected === cert.id
                  const od = isOverdue(cert.due_date)
                  return (
                    <tr key={cert.id}
                      style={{ background: isSelected ? 'rgba(255,230,0,0.05)' : 'transparent', cursor: 'pointer' }}
                      onClick={() => setSelected(isSelected ? null : cert.id)}>
                      <td style={{ maxWidth: 200 }}>
                        <p style={{ fontSize: 12.5, fontWeight: 700, color: isSelected ? '#FFE600' : 'var(--text-primary)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {profile?.name || `Profile #${cert.profile_id}`}
                        </p>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        {(profile?.reconciliation_type || '').replace(/_/g,' ')}
                      </td>
                      <td style={{ fontSize: 11 }}>{preparer?.username || '—'}</td>
                      <td style={{ fontSize: 11, color: 'var(--warn)' }}>—</td>
                      <td><RiskBadge risk={profile?.risk_classification || 'MEDIUM'} /></td>
                      <td style={{ fontSize: 11, color: od ? 'var(--bad)' : 'var(--text-tertiary)', fontWeight: od ? 700 : 400 }}>
                        {od ? '⚠ ' : ''}{cert.due_date || '—'}
                      </td>
                      <td>
                        <button className="btn-secondary text-xs py-0.5 h-6"
                          onClick={(e) => { e.stopPropagation(); setSelected(isSelected ? null : cert.id) }}>
                          {isSelected ? 'Close' : 'Details'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Right: focus panel */}
      {selectedCert && selectedProfile && (
        <div style={{ width: 300, flexShrink: 0, background: 'var(--surface-2)', border: '1px solid rgba(255,230,0,0.25)',
          borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto' }} className="slim-scroll">
          <div>
            <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.10em', color: '#FFE600', marginBottom: 4 }}>Selected Profile</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{selectedProfile.name}</p>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <CertBadge status={selectedCert.status} />
              <RiskBadge risk={selectedProfile.risk_classification} />
            </div>
          </div>

          {/* Focus areas */}
          {[
            { label: 'Variance Explanation', icon: BarChart2, color: 'var(--warn)', note: 'Review preparer explanations on Variance tab' },
            { label: 'Attached Evidence',    icon: Paperclip, color: 'var(--info)', note: 'Verify all supporting docs are uploaded' },
            { label: 'Open Exceptions',      icon: AlertTriangle, color: 'var(--bad)', note: 'Confirm all exceptions resolved' },
            { label: 'Adjustment Requests',  icon: TrendingUp, color: 'var(--accent)', note: 'Review submitted journal adjustments' },
          ].map(({ label, icon: Icon, color, note }) => (
            <div key={label} style={{ padding: '10px 12px', background: 'var(--surface-1)', borderRadius: 8, border: `1px solid ${color}20` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <Icon style={{ width: 12, height: 12, color, flexShrink: 0 }} />
                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{label}</p>
              </div>
              <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>{note}</p>
            </div>
          ))}

          {/* Reviewer actions */}
          {['PREPARED','UNDER_REVIEW','SUBMITTED'].includes(selectedCert.status || '') && (
            <div>
              <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'var(--text-tertiary)', marginBottom: 8 }}>ACTIONS</p>
              <WorkflowActions workflowId={selectedCert.id} certActionMutation={certActionMutation} compact />
            </div>
          )}

          {/* Preparer note */}
          {selectedCert.last_comment && (
            <div style={{ background: 'var(--surface-1)', borderRadius: 8, padding: '10px 12px', borderLeft: '3px solid #FFE600' }}>
              <p style={{ fontSize: 10, color: '#FFE600', fontWeight: 700, marginBottom: 4 }}>PREPARER NOTE</p>
              <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{selectedCert.last_comment}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// CLOSE CALENDAR section
// ─────────────────────────────────────────────────────────────
function CloseCalSection({ profiles, allCerts }) {
  const { data: calendars = [] } = useQuery({
    queryKey: ['close-cal'],
    queryFn: () => enterpriseAPI.listCloseCalendar(),
  })
  const { data: allTasks = [] } = useQuery({
    queryKey: ['all-close-tasks'],
    queryFn: () => enterpriseExtAPI.listCloseTasks(),
  })

  const today = new Date()

  const reviewDue = calendars.filter((c) => {
    if (c.is_locked) return false
    const cert = allCerts.find((wf) => wf.profile_id === c.profile_id)
    return cert && ['PREPARED','UNDER_REVIEW','SUBMITTED'].includes(cert.status || '')
  })

  const overdue = calendars.filter((c) => !c.is_locked && isOverdue(c.due_date))

  // Close readiness per period
  const periodStats = useMemo(() => {
    const byPeriod = {}
    calendars.forEach((c) => {
      if (!c.period_key) return
      const ps = byPeriod[c.period_key] = byPeriod[c.period_key] || { total: 0, locked: 0, complete: 0 }
      ps.total++
      if (c.is_locked || c.status === 'CLOSED') ps.locked++
      if (['CLOSED','CERTIFIED','IN_PROGRESS'].includes(c.status || '')) ps.complete++
    })
    return Object.entries(byPeriod).sort(([a],[b]) => b.localeCompare(a)).slice(0,8).map(([period, s]) => ({
      period, ...s, readiness: s.total ? Math.round(s.locked / s.total * 100) : 0,
    }))
  }, [calendars])

  // Tasks awaiting reviewer
  const reviewTasks = allTasks.filter((t) => ['REVIEW','APPROVAL'].includes(t.task_type) && t.status !== 'COMPLETE')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        <KpiCard label="Reviews Due This Period" value={reviewDue.length}    color='var(--warn)'  icon={Clock} />
        <KpiCard label="Late Reviews"            value={overdue.length}      color='var(--bad)'   icon={AlertTriangle} />
        <KpiCard label="Tasks Awaiting Reviewer" value={reviewTasks.length}  color='var(--accent)' icon={Eye} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Reviews due this period */}
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-0)' }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>Reviews Due This Period</p>
          </div>
          {reviewDue.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <CheckCircle2 style={{ width: 20, height: 20, color: 'var(--ok)', margin: '0 auto 6px' }} />
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No reviews pending</p>
            </div>
          ) : (
            <table className="data-table" style={{ borderRadius: 0 }}>
              <thead><tr><th>Profile</th><th>Period</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>
                {reviewDue.map((cal) => {
                  const cert = allCerts.find((c) => c.profile_id === cal.profile_id)
                  const profile = profiles.find((p) => p.id === cal.profile_id)
                  const od = isOverdue(cal.due_date)
                  return (
                    <tr key={cal.id}>
                      <td style={{ fontSize: 11, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                        {profile?.name || `Profile #${cal.profile_id}`}
                      </td>
                      <td style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}>{cal.period_key}</td>
                      <td style={{ fontSize: 11, color: od ? 'var(--bad)' : 'var(--text-tertiary)', fontWeight: od ? 700 : 400 }}>
                        {od ? '⚠ ' : ''}{cal.due_date}
                      </td>
                      <td>{cert && <CertBadge status={cert.status} />}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Close readiness */}
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-0)' }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>Close Readiness by Period</p>
          </div>
          <div style={{ padding: 12 }}>
            {periodStats.map((row) => (
              <div key={row.period} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <p style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10.5, color: 'var(--text-secondary)', width: 60, flexShrink: 0 }}>{row.period}</p>
                <div style={{ flex: 1, height: 6, background: 'var(--surface-3)', borderRadius: 9999, overflow: 'hidden' }}>
                  <div style={{ width: `${row.readiness}%`, height: '100%',
                    background: row.readiness === 100 ? 'var(--ok)' : row.readiness >= 60 ? '#FFE600' : 'var(--warn)',
                    transition: 'width 400ms' }} />
                </div>
                <p style={{ fontSize: 11, fontWeight: 700, color: row.readiness === 100 ? 'var(--ok)' : 'var(--text-primary)', minWidth: 34 }}>
                  {row.readiness}%
                </p>
                <p style={{ fontSize: 10, color: 'var(--text-disabled)', minWidth: 40 }}>{row.locked}/{row.total}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tasks awaiting reviewer */}
      {reviewTasks.length > 0 && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-0)' }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>Close Tasks Awaiting Review</p>
          </div>
          <table className="data-table" style={{ borderRadius: 0 }}>
            <thead><tr><th>Task</th><th>Type</th><th>Assigned To</th><th>Due Date</th><th>Status</th></tr></thead>
            <tbody>
              {reviewTasks.map((t) => {
                const od = isOverdue(t.due_date)
                return (
                  <tr key={t.id}>
                    <td style={{ fontSize: 12, fontWeight: 600 }}>{t.task_name}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{t.task_type}</td>
                    <td style={{ fontSize: 11 }}>{t.assigned_username || '—'}</td>
                    <td style={{ fontSize: 11, color: od ? 'var(--bad)' : 'var(--text-tertiary)', fontWeight: od ? 700 : 400 }}>
                      {od ? '⚠ ' : ''}{t.due_date}
                    </td>
                    <td>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 9999,
                        background: t.status === 'NOT_STARTED' ? 'var(--surface-3)' : 'rgba(245,158,11,0.14)',
                        color: t.status === 'NOT_STARTED' ? 'var(--text-tertiary)' : 'var(--warn)',
                        border: `1px solid ${t.status === 'NOT_STARTED' ? 'var(--border-1)' : 'rgba(245,158,11,0.30)'}` }}>
                        {t.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// CERTIFICATION section — primary reviewer page
// ─────────────────────────────────────────────────────────────
function CertificationSection({ profiles, allCerts, users, certActionMutation }) {
  const [certTab,   setCertTab]   = useState('queue')
  const [selected,  setSelected]  = useState(null)
  const [comment,   setComment]   = useState('')

  const pending   = allCerts.filter((c) => ['PREPARED','UNDER_REVIEW','SUBMITTED'].includes(c.status || ''))
  const approved  = allCerts.filter((c) => ['APPROVED','CERTIFIED'].includes(c.status || ''))
  const returned  = allCerts.filter((c) => c.status === 'REJECTED')

  const { data: certHistory = [] } = useQuery({
    queryKey: ['cert-history', selected],
    queryFn: () => enterpriseAPI.getCertificationWorkflowHistory(selected),
    enabled: Boolean(selected),
  })

  const selectedCert    = allCerts.find((c) => c.id === selected)
  const selectedProfile = profiles.find((p) => p.id === selectedCert?.profile_id)

  const CERT_TABS = [
    { id: 'queue',    label: `Review Queue (${pending.length})` },
    { id: 'timeline', label: 'Approval Timeline' },
    { id: 'returned', label: `Return Queue (${returned.length})` },
  ]

  const reviewChecklist = [
    { label: 'Evidence Complete',       icon: Paperclip },
    { label: 'Variance Explained',      icon: BarChart2 },
    { label: 'Exceptions Resolved',     icon: AlertTriangle },
    { label: 'Adjustments Approved',    icon: TrendingUp },
  ]

  const getProfile = (cert) => profiles.find((p) => p.id === cert?.profile_id)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 0, background: 'var(--surface-1)', borderRadius: 8,
        border: '1px solid var(--border-1)', overflow: 'hidden', flexShrink: 0 }}>
        {CERT_TABS.map((t) => {
          const isActive = certTab === t.id
          return (
            <button key={t.id} onClick={() => setCertTab(t.id)} style={{
              flex: 1, padding: '9px 8px', fontSize: 12, fontWeight: isActive ? 700 : 500,
              color: isActive ? '#FFE600' : 'var(--text-tertiary)',
              background: isActive ? 'rgba(255,230,0,0.08)' : 'none',
              border: 'none', borderBottom: `2px solid ${isActive ? '#FFE600' : 'transparent'}`,
              cursor: 'pointer', transition: 'color 120ms',
            }}>{t.label}</button>
          )
        })}
      </div>

      {/* Queue tab */}
      {certTab === 'queue' && (
        <div style={{ display: 'flex', gap: 14 }}>
          {/* List */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pending.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border-1)' }}>
                <CheckCircle2 style={{ width: 28, height: 28, color: 'var(--ok)', margin: '0 auto 8px' }} />
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No certifications pending review</p>
              </div>
            ) : pending.map((cert) => {
              const profile  = getProfile(cert)
              const preparer = users.find((u) => u.id === profile?.assigned_preparer)
              const isActive = selected === cert.id
              const od       = isOverdue(cert.due_date)
              return (
                <div key={cert.id}
                  style={{ background: 'var(--surface-2)', border: `1px solid ${isActive ? 'rgba(255,230,0,0.30)' : 'var(--border-1)'}`, borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer' }}
                    onClick={() => setSelected(isActive ? null : cert.id)}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: isActive ? '#FFE600' : 'var(--text-primary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {profile?.name || `Profile #${cert.profile_id}`}
                      </p>
                      <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          Submitted by: {preparer?.username || `User #${profile?.assigned_preparer}`}
                        </span>
                        <CertBadge status={cert.status} />
                        <RiskBadge risk={profile?.risk_classification || 'MEDIUM'} />
                        {od && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--bad)' }}>⚠ OVERDUE</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 11, color: od ? 'var(--bad)' : 'var(--text-tertiary)', fontWeight: od ? 700 : 400 }}>
                        Due {cert.due_date || '—'}
                      </p>
                    </div>
                  </div>

                  {/* Review checklist + actions */}
                  {isActive && (
                    <div style={{ borderTop: '1px solid var(--border-0)', padding: '14px 16px', background: 'var(--surface-1)', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                      {/* Checklist */}
                      <div style={{ minWidth: 200 }}>
                        <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'var(--text-disabled)', fontWeight: 700, marginBottom: 8 }}>
                          REVIEW CHECKLIST
                        </p>
                        {reviewChecklist.map(({ label, icon: Icon }) => (
                          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                            <div style={{ width: 16, height: 16, border: '2px solid var(--border-2)', borderRadius: 4,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} />
                            <Icon style={{ width: 11, height: 11, color: 'var(--text-tertiary)', flexShrink: 0 }} />
                            <p style={{ fontSize: 11.5, color: 'var(--text-primary)' }}>{label}</p>
                          </div>
                        ))}
                      </div>

                      {/* Comment + actions */}
                      <div style={{ flex: 1, minWidth: 250 }}>
                        <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'var(--text-disabled)', fontWeight: 700, marginBottom: 8 }}>
                          REVIEW NOTES
                        </p>
                        {cert.last_comment && (
                          <div style={{ background: 'var(--surface-2)', borderRadius: 7, padding: '8px 10px', marginBottom: 8,
                            borderLeft: '3px solid #FFE600', fontSize: 12, color: 'var(--text-secondary)' }}>
                            {cert.last_comment}
                          </div>
                        )}
                        <textarea className="input text-xs" rows={2}
                          placeholder="Add approval note or return reason…"
                          value={comment} onChange={(e) => setComment(e.target.value)}
                          style={{ resize: 'vertical', marginBottom: 10 }} />
                        <WorkflowActions workflowId={cert.id} certActionMutation={certActionMutation} compact={false} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Timeline tab */}
      {certTab === 'timeline' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            Select a certification from the Queue tab to see its detailed timeline.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
            {[
              ['Prepared',     allCerts.filter((c) => ['PREPARED'].includes(c.status||'')).length,         'var(--info)'],
              ['Under Review', allCerts.filter((c) => ['UNDER_REVIEW','SUBMITTED'].includes(c.status||'')).length, 'var(--warn)'],
              ['Returned',     allCerts.filter((c) => c.status === 'REJECTED').length,                     'var(--bad)'],
              ['Approved',     allCerts.filter((c) => ['APPROVED','CERTIFIED'].includes(c.status||'')).length,     'var(--ok)'],
            ].map(([label, val, color]) => (
              <div key={label} style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>{label}</p>
                <p style={{ fontSize: 28, fontWeight: 700, color }}>{val}</p>
              </div>
            ))}
          </div>
          {/* Pipeline view */}
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: 20 }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>Review Pipeline</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              {[
                { label: 'Prepared',     color: 'var(--info)',    count: allCerts.filter((c) => c.status === 'PREPARED').length },
                { label: 'Under Review', color: 'var(--warn)',    count: allCerts.filter((c) => ['UNDER_REVIEW','SUBMITTED'].includes(c.status||'')).length },
                { label: 'Returned',     color: 'var(--bad)',     count: allCerts.filter((c) => c.status === 'REJECTED').length },
                { label: 'Approved',     color: 'var(--ok)',      count: allCerts.filter((c) => ['APPROVED','CERTIFIED'].includes(c.status||'')).length },
              ].map((stage, i, arr) => (
                <>
                  <div key={stage.label} style={{ flex: 1, padding: '14px 16px', background: `${stage.color}10`,
                    border: `1px solid ${stage.color}30`, borderRadius: 8, textAlign: 'center' }}>
                    <p style={{ fontSize: 10, color: stage.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{stage.label}</p>
                    <p style={{ fontSize: 26, fontWeight: 700, color: stage.color }}>{stage.count}</p>
                  </div>
                  {i < arr.length - 1 && (
                    <ChevronRight key={`arrow-${i}`} style={{ width: 20, height: 20, color: 'var(--text-disabled)', flexShrink: 0 }} />
                  )}
                </>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Return queue tab */}
      {certTab === 'returned' && (
        returned.length === 0 ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border-1)' }}>
            <CheckCircle2 style={{ width: 28, height: 28, color: 'var(--ok)', margin: '0 auto 8px' }} />
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No returned certifications</p>
          </div>
        ) : (
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden' }}>
            <table className="data-table" style={{ borderRadius: 0 }}>
              <thead><tr><th>Profile</th><th>Preparer</th><th>Risk</th><th>Return Note</th><th>Returned</th></tr></thead>
              <tbody>
                {returned.map((cert) => {
                  const profile  = getProfile(cert)
                  const preparer = users.find((u) => u.id === profile?.assigned_preparer)
                  return (
                    <tr key={cert.id}>
                      <td style={{ fontSize: 12.5, fontWeight: 700, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {profile?.name || `Profile #${cert.profile_id}`}
                      </td>
                      <td style={{ fontSize: 11 }}>{preparer?.username || '—'}</td>
                      <td><RiskBadge risk={profile?.risk_classification || 'MEDIUM'} /></td>
                      <td style={{ fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                        {cert.last_comment || '—'}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtShort(cert.updated_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// CONTROLS section — read-only visibility for reviewer
// ─────────────────────────────────────────────────────────────
function ControlsSection() {
  const { data: riskData } = useQuery({
    queryKey: ['risk-dashboard-real'],
    queryFn: async () => { try { return await advancedAPI.riskDashboard() } catch { return null } },
  })

  const violations = riskData?.sod_violations || []
  const overdue    = riskData?.overdue_high_risk || []
  const profileScores = (riskData?.profile_risk_scores || []).slice(0, 20)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Read-only notice */}
      <div style={{ padding: '10px 16px', borderRadius: 8, background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.20)', fontSize: 12, color: 'var(--accent)' }}>
        ⓘ Reviewer view: read-only. You can acknowledge issues and add comments. Controls configuration is admin-only.
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
        <KpiCard label="SoD Violations"   value={violations.length}                                   color='var(--bad)'   icon={ShieldAlert} />
        <KpiCard label="Overdue High Risk" value={overdue.length}                                      color='var(--warn)'  icon={AlertTriangle} />
        <KpiCard label="Critical Profiles" value={(riskData?.risk_breakdown?.CRITICAL || 0)}          color='#c026d3'       icon={ShieldAlert} />
        <KpiCard label="Avg Risk Score"    value={`${riskData?.total_risk_score || 0}/100`}           color='var(--accent)' icon={BarChart2} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* SoD Violations */}
        <div style={{ background: 'var(--surface-2)', border: `1px solid ${violations.length ? 'rgba(239,68,68,.25)' : 'var(--border-1)'}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-0)' }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: violations.length ? 'var(--bad)' : 'var(--text-primary)' }}>
              SoD Violations ({violations.length})
            </p>
          </div>
          {violations.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <CheckCircle2 style={{ width: 20, height: 20, color: 'var(--ok)', margin: '0 auto 6px' }} />
              <p style={{ fontSize: 12, color: 'var(--ok)' }}>No SoD violations detected</p>
            </div>
          ) : violations.map((v, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border-0)' }}>
              <ShieldAlert style={{ width: 13, height: 13, color: 'var(--bad)', flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.profile_name}</p>
                <p style={{ fontSize: 11, color: 'var(--bad)' }}>{v.violation}</p>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 9999,
                background: 'rgba(239,68,68,.14)', border: '1px solid rgba(239,68,68,.30)', color: 'var(--bad)', flexShrink: 0 }}>
                {v.severity}
              </span>
            </div>
          ))}
        </div>

        {/* Risk monitoring */}
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-0)' }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>Risk Monitoring</p>
          </div>
          <table className="data-table" style={{ borderRadius: 0 }}>
            <thead><tr><th>Profile</th><th>Risk</th><th>Score</th><th>Open Exc.</th></tr></thead>
            <tbody>
              {profileScores.filter((p) => p.risk_score > 40).slice(0, 8).map((p) => {
                const rc = RISK_COLOR[(p.risk_classification || '').toUpperCase()] || 'var(--warn)'
                return (
                  <tr key={p.id}>
                    <td style={{ fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{p.name}</td>
                    <td><RiskBadge risk={p.risk_classification} /></td>
                    <td style={{ fontSize: 12, fontWeight: 700, color: p.risk_score >= 70 ? 'var(--bad)' : p.risk_score >= 40 ? 'var(--warn)' : 'var(--ok)' }}>
                      {p.risk_score}
                    </td>
                    <td style={{ fontSize: 12, color: p.open_exceptions > 0 ? 'var(--bad)' : 'var(--ok)', fontWeight: p.open_exceptions > 0 ? 700 : 400 }}>
                      {p.open_exceptions}
                    </td>
                  </tr>
                )
              })}
              {profileScores.filter((p) => p.risk_score > 40).length === 0 && (
                <tr><td colSpan={4} style={{ fontSize: 12, color: 'var(--ok)', textAlign: 'center', padding: '16px' }}>No high-risk profiles</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Overdue high risk */}
      {overdue.length > 0 && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-0)' }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--warn)' }}>Overdue High-Risk Certifications</p>
          </div>
          <table className="data-table" style={{ borderRadius: 0 }}>
            <thead><tr><th>Profile</th><th>Risk</th><th>Due Date</th><th>Days Overdue</th></tr></thead>
            <tbody>
              {overdue.map((item, i) => (
                <tr key={i}>
                  <td style={{ fontSize: 12, fontWeight: 600 }}>{item.profile_name}</td>
                  <td><RiskBadge risk={item.risk} /></td>
                  <td style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}>{item.due_date}</td>
                  <td style={{ fontSize: 12, fontWeight: 700, color: item.days_overdue > 7 ? 'var(--bad)' : 'var(--warn)' }}>
                    +{item.days_overdue}d
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────
const NAV_SECTIONS = [
  { id: 'home',          label: 'Home',         Icon: Home },
  { id: 'matching',      label: 'Matching',     Icon: GitMerge },
  { id: 'recon-hub',     label: 'Recon Hub',    Icon: Layers },
  { id: 'close-cal',     label: 'Close Cal',    Icon: Calendar },
  { id: 'certification', label: 'Certification', Icon: Award },
  { id: 'controls',      label: 'Controls',     Icon: Shield },
]

export default function ReviewerWorkbench() {
  const { projectId } = useParams()
  const user          = useAuthStore((s) => s.user)
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId)
  const qc            = useQueryClient()
  const isLegacyMode  = Boolean(projectId)

  const [activeSection, setActiveSection] = useState('home')

  // ── Data ───────────────────────────────────────────────────
  const { data: profiles = [], isLoading: profLoading } = useQuery({
    queryKey: ['enterprise-profiles', selectedProjectId || 'all'],
    queryFn: () => enterpriseAPI.listProfiles(selectedProjectId ? Number(selectedProjectId) : undefined),
    enabled: !isLegacyMode,
  })
  const { data: allCerts = [] } = useQuery({
    queryKey: ['cert-workflows-all'],
    queryFn: () => enterpriseAPI.listCertificationWorkflows(),
    enabled: !isLegacyMode,
    refetchInterval: 30000,
  })
  const { data: users = [] } = useQuery({
    queryKey: ['users-list'],
    queryFn: authAPI.listUsers,
  })
  const { data: dashboard } = useQuery({
    queryKey: ['reviewer-dashboard'],
    queryFn: async () => { try { return await enterpriseAPI.reviewerDashboard() } catch { return null } },
    refetchInterval: 30000,
  })

  const certActionMutation = useMutation({
    mutationFn: (payload) => enterpriseAPI.actionCertificationWorkflow(payload),
    onSuccess: (_, vars) => {
      const label = { APPROVE: 'Approved', REJECT: 'Returned', ESCALATE: 'Escalated' }[vars.action] || vars.action
      toast.success(label)
      qc.invalidateQueries({ queryKey: ['cert-workflows-all'] })
      qc.invalidateQueries({ queryKey: ['reviewer-dashboard'] })
    },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Action failed'),
  })

  const pendingCount = allCerts.filter((c) => ['PREPARED','UNDER_REVIEW','SUBMITTED'].includes(c.status || '')).length

  const badgeCounts = {
    'home':          pendingCount > 0 ? pendingCount : null,
    'certification': pendingCount > 0 ? pendingCount : null,
  }

  if (isLegacyMode) return (
    <div className="h-full flex flex-col">
      <PageHeader title="Review Queue" subtitle={`Project #${projectId} — legacy mode`} />
      <div className="flex-1 overflow-auto p-5">
        <div style={{ background: 'var(--warn-bg)', border: '1px solid var(--warn-bdr)', borderRadius: 10, padding: 16 }}>
          <p style={{ fontSize: 12, color: 'var(--warn)' }}>Legacy mode. Promote your execution to an enterprise profile for the full review workflow.</p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Review Queue"
        subtitle="Review reconciliations, certifications, variances and controls."
        badge={`${pendingCount} pending`}
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Left nav sidebar ─────────────────────────────── */}
        <div style={{
          width: 200, flexShrink: 0, borderRight: '1px solid var(--border-1)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--surface-1)',
        }}>
          {/* Reviewer KPIs */}
          {dashboard && (
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-0)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {[
                  ['Pending',    dashboard.pending_approvals ?? pendingCount,        'var(--warn)'],
                  ['Escalated',  dashboard.escalation_alerts ?? 0,                   'var(--bad)'],
                  ['Complete',   `${dashboard.completion_pct ?? 0}%`,               'var(--ok)'],
                  ['Auto-Match', `${dashboard.auto_match_pct ?? 0}%`,               '#FFE600'],
                ].map(([label, val, color]) => (
                  <div key={label} style={{ background: 'var(--surface-2)', borderRadius: 6, padding: '6px 8px' }}>
                    <p style={{ fontSize: 9.5, color: 'var(--text-tertiary)', lineHeight: 1 }}>{label}</p>
                    <p style={{ fontSize: 14, fontWeight: 700, color, lineHeight: 1.2, marginTop: 1 }}>{val}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Nav items */}
          <div style={{ flex: 1, padding: '8px 8px', overflow: 'auto' }}>
            {NAV_SECTIONS.map(({ id, label, Icon }) => {
              const isActive = activeSection === id
              const badge    = badgeCounts[id]
              return (
                <button key={id} onClick={() => setActiveSection(id)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 8, marginBottom: 2,
                  background: isActive ? 'rgba(255,230,0,0.10)' : 'transparent',
                  border: `1px solid ${isActive ? 'rgba(255,230,0,0.30)' : 'transparent'}`,
                  color: isActive ? '#FFE600' : 'var(--text-secondary)',
                  fontSize: 13, fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter, sans-serif',
                  transition: 'background 120ms, color 120ms',
                }}
                onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'var(--surface-3)'; e.currentTarget.style.color = 'var(--text-primary)' } }}
                onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
                >
                  <Icon style={{ width: 14, height: 14, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{label}</span>
                  {badge && (
                    <span style={{ fontSize: 9, fontWeight: 800, minWidth: 16, height: 16, padding: '0 3px',
                      borderRadius: 9999, background: '#FFE600', color: '#1A1A24',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Main content ─────────────────────────────────── */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }} className="slim-scroll">
          {profLoading ? <LoadingState /> : (
            <>
              {activeSection === 'home' && (
                <HomeSection profiles={profiles} allCerts={allCerts} dashboard={dashboard}
                  users={users} onNavigate={(section) => setActiveSection(section)} />
              )}
              {activeSection === 'matching' && (
                <MatchingSection profiles={profiles} />
              )}
              {activeSection === 'recon-hub' && (
                <ReconHubSection profiles={profiles} allCerts={allCerts} users={users} certActionMutation={certActionMutation} />
              )}
              {activeSection === 'close-cal' && (
                <CloseCalSection profiles={profiles} allCerts={allCerts} />
              )}
              {activeSection === 'certification' && (
                <CertificationSection profiles={profiles} allCerts={allCerts} users={users} certActionMutation={certActionMutation} />
              )}
              {activeSection === 'controls' && (
                <ControlsSection />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
