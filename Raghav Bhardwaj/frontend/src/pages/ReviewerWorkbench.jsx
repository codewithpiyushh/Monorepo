/**
 * ReviewerWorkbench — Enterprise-first
 * Shows profiles in UNDER_REVIEW / SUBMITTED state assigned to the reviewer.
 * Approve / Reject with comments. Full match group + exception visibility.
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  CheckCircle2, XCircle, Clock, AlertTriangle,
  ThumbsUp, ThumbsDown, Eye, ChevronDown, ChevronUp,
} from 'lucide-react'
import { enterpriseAPI, projectsAPI, workflowAPI } from '../api'
import { useAuthStore } from '../store/authStore'
import { useProjectStore } from '../store/projectStore'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, LoadingState } from '../components/ui/PageState'

// ── Helpers ───────────────────────────────────────────────────
const CERT_STATUS_META = {
  OPEN:         { label: 'Open',           color: 'var(--text-tertiary)' },
  PREPARED:     { label: 'Prepared',       color: 'var(--info)' },
  UNDER_REVIEW: { label: 'Under Review',   color: 'var(--warn)' },
  APPROVED:     { label: 'Approved',       color: 'var(--ok)' },
  REJECTED:     { label: 'Rejected',       color: 'var(--bad)' },
  CERTIFIED:    { label: 'Certified',      color: 'var(--ok)' },
  ESCALATED:    { label: 'Escalated',      color: '#c026d3' },
}
function CertBadge({ status }) {
  const meta = CERT_STATUS_META[status] || { label: status, color: 'var(--text-tertiary)' }
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 9999,
      border: `1px solid ${meta.color}33`, color: meta.color, background: `${meta.color}14`,
    }}>{meta.label}</span>
  )
}

function ProfileItem({ profile, cert, isSelected, onSelect }) {
  const status = cert?.status || 'OPEN'
  return (
    <button
      onClick={() => onSelect(profile.id)}
      style={{
        width: '100%', textAlign: 'left', padding: '10px 14px',
        background: isSelected ? 'var(--accent-subtle)' : 'transparent',
        border: `1px solid ${isSelected ? 'var(--accent-border)' : 'transparent'}`,
        borderRadius: 8, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4,
      }}
      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-3)' }}
      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: isSelected ? 'var(--accent-hover)' : 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {profile.name}
        </p>
        <CertBadge status={status} />
      </div>
      <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
        {(profile.reconciliation_type || '').replace(/_/g, ' ')} · {profile.risk_classification || 'MEDIUM'}
      </p>
      {cert?.due_date && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: 'var(--text-disabled)' }}>
          <Clock style={{ width: 9, height: 9 }} /> Due {cert.due_date}
        </div>
      )}
    </button>
  )
}

function MatchGroupRow({ mg }) {
  const classColor = {
    FULL_MATCH: 'var(--ok)', PARTIAL_MATCH: 'var(--warn)',
    UNMATCHED: 'var(--bad)', VARIANCE_FLAGGED: '#c026d3',
  }
  const color = classColor[mg.classification] || 'var(--text-tertiary)'
  return (
    <tr>
      <td style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}>#{mg.id}</td>
      <td>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 9999,
          background: `${color}14`, border: `1px solid ${color}33`, color }}>
          {mg.classification}
        </span>
      </td>
      <td style={{ fontSize: 12 }}>{mg.strategy}</td>
      <td style={{ fontSize: 12 }}>
        <span style={{ color: mg.confidence >= 0.95 ? 'var(--ok)' : mg.confidence >= 0.7 ? 'var(--warn)' : 'var(--bad)', fontWeight: 600 }}>
          {Math.round((mg.confidence || 0) * 100)}%
        </span>
      </td>
      <td style={{ fontSize: 12 }}>
        {mg.variance_amount > 0
          ? <span style={{ color: 'var(--warn)' }}>${Number(mg.variance_amount).toFixed(2)}</span>
          : <CheckCircle2 style={{ width: 12, height: 12, color: 'var(--ok)' }} />}
      </td>
      <td>
        <span style={{ fontSize: 10, color: mg.reconciled ? 'var(--ok)' : 'var(--bad)' }}>
          {mg.reconciled ? '✓' : '✗'}
        </span>
      </td>
    </tr>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function ReviewerWorkbench() {
  const { projectId } = useParams()
  const user          = useAuthStore((s) => s.user)
  const qc            = useQueryClient()
  const isLegacyMode  = Boolean(projectId)
  const { selectedProjectId, setSelectedProjectId } = useProjectStore()

  const [selectedProfileId, setSelectedProfileId] = useState(null)
  const [activeTab,          setActiveTab]         = useState('summary')
  const [approveComment,     setApproveComment]    = useState('')
  const [rejectComment,      setRejectComment]     = useState('')
  const [showRejectBox,      setShowRejectBox]     = useState(false)

  // ── Data ─────────────────────────────────────────────────
  const { data: profiles = [], isLoading: profLoading } = useQuery({
    queryKey: ['enterprise-profiles'],
    queryFn: enterpriseAPI.listProfiles,
    enabled: !isLegacyMode,
  })

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsAPI.list,
  })

  const selectedProject = useMemo(
    () => projects.find((project) => String(project.id) === String(selectedProjectId)) || null,
    [projects, selectedProjectId],
  )

  const { data: allCerts = [] } = useQuery({
    queryKey: ['cert-workflows-all'],
    queryFn: () => enterpriseAPI.listCertificationWorkflows(),
    enabled: !isLegacyMode,
  })

  const { data: dashboard } = useQuery({
    queryKey: ['reviewer-dashboard'],
    queryFn: enterpriseAPI.reviewerDashboard,
    refetchInterval: 30000,
  })

  useEffect(() => {
    if (!selectedProjectId && projects.length) setSelectedProjectId(String(projects[0].id))
  }, [projects, selectedProjectId, setSelectedProjectId])

  // Profiles where this user is reviewer AND cert is actionable
  const reviewableProfiles = useMemo(() => {
    if (isLegacyMode) return []
    return profiles.filter((p) => {
      const cert = allCerts.find((c) => c.profile_id === p.id)
      const isReviewer = !user || p.assigned_reviewer === user.id || ['admin', 'reviewer', 'approver'].includes(user.role)
      const isActionable = cert && ['PREPARED', 'UNDER_REVIEW', 'SUBMITTED'].includes(cert.status)
      return isReviewer && isActionable
    })
  }, [profiles, allCerts, user, isLegacyMode])

  // Also show approved/rejected for history
  const allMyProfiles = useMemo(() => {
    if (isLegacyMode) return []
    return profiles.filter((p) =>
      !user || p.assigned_reviewer === user.id || ['admin', 'reviewer', 'approver'].includes(user.role)
    )
  }, [profiles, user, isLegacyMode])

  useEffect(() => {
    if (reviewableProfiles.length > 0 && !selectedProfileId) {
      setSelectedProfileId(reviewableProfiles[0].id)
    } else if (allMyProfiles.length > 0 && !selectedProfileId) {
      setSelectedProfileId(allMyProfiles[0].id)
    }
  }, [reviewableProfiles, allMyProfiles, selectedProfileId])

  const selectedProfile = useMemo(
    () => allMyProfiles.find((p) => p.id === selectedProfileId) || null,
    [allMyProfiles, selectedProfileId]
  )
  const selectedCert = useMemo(
    () => allCerts.find((c) => c.profile_id === selectedProfileId) || null,
    [allCerts, selectedProfileId]
  )

  const { data: profileTxs = [] } = useQuery({
    queryKey: ['profile-transactions', selectedProfileId],
    queryFn: () => enterpriseAPI.listProfileTransactions(selectedProfileId),
    enabled: Boolean(selectedProfileId) && !isLegacyMode,
  })
  const matchGroups = useMemo(() => profileTxs.match_groups || profileTxs.matches || profileTxs || [], [profileTxs])

  const { data: allExceptions = [] } = useQuery({
    queryKey: ['enterprise-exceptions'],
    queryFn: () => enterpriseAPI.listExceptions(),
    enabled: !isLegacyMode,
  })
  const profileExceptions = useMemo(
    () => allExceptions.filter((e) => e.profile_id === selectedProfileId),
    [allExceptions, selectedProfileId]
  )

  const { data: certHistory = [] } = useQuery({
    queryKey: ['cert-history', selectedCert?.id],
    queryFn: () => enterpriseAPI.getCertificationWorkflowHistory(selectedCert.id),
    enabled: Boolean(selectedCert?.id),
  })

  // ── Actions ─────────────────────────────────────────────
  const certActionMutation = useMutation({
    mutationFn: (payload) => enterpriseAPI.actionCertificationWorkflow(payload),
    onSuccess: (_, vars) => {
      toast.success(`Workflow ${vars.action.toLowerCase()}d`)
      qc.invalidateQueries({ queryKey: ['cert-workflows-all'] })
      setApproveComment('')
      setRejectComment('')
      setShowRejectBox(false)
    },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Action failed'),
  })

  const handleApprove = () => {
    if (!selectedCert) return
    certActionMutation.mutate({ workflow_id: selectedCert.id, action: 'APPROVE', comments: approveComment })
  }

  const handleReject = () => {
    if (!selectedCert) return
    if (!rejectComment.trim()) { toast.error('Rejection reason is required'); return }
    certActionMutation.mutate({ workflow_id: selectedCert.id, action: 'REJECT', comments: rejectComment })
  }

  const canApprove = selectedCert && ['PREPARED', 'UNDER_REVIEW', 'SUBMITTED'].includes(selectedCert.status)

  const profileSummary = useMemo(() => {
    const arr = Array.isArray(matchGroups) ? matchGroups : []
    const full     = arr.filter((mg) => mg.classification === 'FULL_MATCH').length
    const partial  = arr.filter((mg) => mg.classification === 'PARTIAL_MATCH').length
    const unmatched = arr.filter((mg) => mg.classification === 'UNMATCHED').length
    const autoRate = arr.length ? Math.round((full / arr.length) * 100) : 0
    return { total: arr.length, full, partial, unmatched, autoRate, exceptions: profileExceptions.length }
  }, [matchGroups, profileExceptions])

  const TABS = [
    { id: 'summary',    label: 'Summary' },
    { id: 'matches',    label: `Matches (${profileSummary.full})` },
    { id: 'exceptions', label: `Exceptions (${profileSummary.exceptions})` },
    { id: 'history',    label: 'History' },
    { id: 'action',     label: 'Approve / Reject' },
  ]

  // ── Legacy fallback ─────────────────────────────────────
  if (isLegacyMode) {
    const numProjId = Number(projectId)
    const { data: legacyWF = [], isLoading: legLoading } = useQuery({
      queryKey: ['reviewer-workflows', numProjId],
      queryFn: () => workflowAPI.list({ project_id: numProjId }),
      enabled: Number.isFinite(numProjId),
    })
    return (
      <div className="h-full flex flex-col">
        <PageHeader title="Reviewer Workbench" subtitle={`Project #${projectId} — legacy mode`} />
        <div className="flex-1 overflow-auto p-5">
          <div style={{ background: 'var(--warn-bg)', border: '1px solid var(--warn-bdr)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: 'var(--warn)' }}>
              Legacy mode. Promote your execution to an enterprise profile for the full review workflow.
            </p>
          </div>
          {legLoading ? <LoadingState /> : legacyWF.map((w) => (
            <div key={w.id} style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>WF-{w.id}: {w.title || `Workflow #${w.id}`}</p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{w.workflow_state || w.status}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Reviewer Workbench"
        subtitle={selectedProject ? `Review reconciliations, verify exceptions, and approve or reject within ${selectedProject.name}.` : 'Review reconciliations, verify exceptions, and approve or reject.'}
        badge={selectedProject ? `Project #${selectedProject.id}` : `${reviewableProfiles.length} pending review`}
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Sidebar ───────────────────────────────────── */}
        <div style={{
          width: 280, flexShrink: 0, borderRight: '1px solid var(--border-1)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--surface-1)',
        }}>
          {/* Dashboard KPIs */}
          {dashboard && (
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-0)' }}>
              <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'var(--text-disabled)', marginBottom: 8 }}>
                Review Queue
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  ['Pending Approvals', dashboard.pending_approvals, 'var(--warn)'],
                  ['Escalations', dashboard.escalation_alerts, 'var(--bad)'],
                  ['Completion', `${dashboard.completion_pct}%`, 'var(--ok)'],
                  ['Auto-Match', `${dashboard.auto_match_pct}%`, 'var(--accent)'],
                ].map(([label, val, color]) => (
                  <div key={label} style={{ background: 'var(--surface-2)', borderRadius: 7, padding: '7px 10px' }}>
                    <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{label}</p>
                    <p style={{ fontSize: 16, fontWeight: 700, color }}>{val ?? 0}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reviewable list */}
          <div style={{ flex: 1, overflow: 'auto', padding: '8px 8px' }} className="slim-scroll">
            {reviewableProfiles.length > 0 && (
              <>
                <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.10em',
                  color: 'var(--warn)', padding: '4px 6px 8px', fontWeight: 700 }}>
                  Pending Review ({reviewableProfiles.length})
                </p>
                {reviewableProfiles.map((p) => {
                  const cert = allCerts.find((c) => c.profile_id === p.id)
                  return <ProfileItem key={p.id} profile={p} cert={cert}
                    isSelected={selectedProfileId === p.id} onSelect={setSelectedProfileId} />
                })}
              </>
            )}
            {allMyProfiles.filter((p) => !reviewableProfiles.find((rp) => rp.id === p.id)).length > 0 && (
              <>
                <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.10em',
                  color: 'var(--text-disabled)', padding: '12px 6px 8px' }}>
                  Other Assigned
                </p>
                {allMyProfiles
                  .filter((p) => !reviewableProfiles.find((rp) => rp.id === p.id))
                  .map((p) => {
                    const cert = allCerts.find((c) => c.profile_id === p.id)
                    return <ProfileItem key={p.id} profile={p} cert={cert}
                      isSelected={selectedProfileId === p.id} onSelect={setSelectedProfileId} />
                  })}
              </>
            )}
            {allMyProfiles.length === 0 && (
              <EmptyState title="No profiles assigned" description="No profiles assigned to you as reviewer." />
            )}
          </div>
        </div>

        {/* ── Main content ──────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selectedProfile ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <EmptyState title="Select a profile" description="Choose a profile from the left to begin review." />
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{
                padding: '10px 20px', background: 'var(--surface-2)',
                borderBottom: '1px solid var(--border-1)', flexShrink: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {selectedProfile.name}
                    </p>
                    <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)', alignItems: 'center' }}>
                      <span>{(selectedProfile.reconciliation_type || '').replace(/_/g, ' ')}</span>
                      <span>Risk: <strong style={{ color: selectedProfile.risk_classification === 'CRITICAL' ? 'var(--bad)' : selectedProfile.risk_classification === 'HIGH' ? 'var(--warn)' : 'var(--ok)' }}>{selectedProfile.risk_classification}</strong></span>
                      {selectedCert && <CertBadge status={selectedCert.status} />}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
                    <span style={{ color: 'var(--ok)' }}>✓ {profileSummary.full}</span>
                    <span style={{ color: 'var(--warn)' }}>~ {profileSummary.partial}</span>
                    <span style={{ color: 'var(--bad)' }}>✗ {profileSummary.unmatched}</span>
                    <span style={{ color: 'var(--accent)' }}>{profileSummary.autoRate}% auto</span>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="tab-bar" style={{ background: 'var(--surface-1)', flexShrink: 0 }}>
                {TABS.map((t) => (
                  <button key={t.id} className={`tab-item ${activeTab === t.id ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab(t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>

              <div style={{ flex: 1, overflow: 'auto', padding: activeTab === 'matches' || activeTab === 'exceptions' ? 0 : 20 }} className="slim-scroll">

                {/* Summary */}
                {activeTab === 'summary' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Preparer comment */}
                    {selectedCert?.last_comment && (
                      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: 14 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                          Preparer Comment
                        </p>
                        <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>{selectedCert.last_comment}</p>
                      </div>
                    )}
                    {/* Match breakdown */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
                      {[
                        ['Total Groups', profileSummary.total, 'var(--text-primary)'],
                        ['Full Match', profileSummary.full, 'var(--ok)'],
                        ['Partial', profileSummary.partial, 'var(--warn)'],
                        ['Unmatched', profileSummary.unmatched, 'var(--bad)'],
                        ['Exceptions', profileSummary.exceptions, 'var(--bad)'],
                      ].map(([label, val, color]) => (
                        <div key={label} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '12px', textAlign: 'center', border: '1px solid var(--border-1)' }}>
                          <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginBottom: 4 }}>{label}</p>
                          <p style={{ fontSize: 22, fontWeight: 700, color }}>{val}</p>
                        </div>
                      ))}
                    </div>
                    {/* Risk indicator */}
                    <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: 14, border: '1px solid var(--border-1)' }}>
                      <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', marginBottom: 10 }}>
                        Review Checklist
                      </p>
                      {[
                        [profileSummary.unmatched === 0, 'All transactions matched or explained'],
                        [profileSummary.exceptions === 0, 'No open exceptions'],
                        [selectedCert?.status !== 'OPEN', 'Preparer has submitted'],
                        [selectedProfile.risk_classification !== 'CRITICAL' || profileSummary.exceptions === 0, 'Critical risk — exceptions cleared'],
                      ].map(([pass, label], i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          {pass
                            ? <CheckCircle2 style={{ width: 14, height: 14, color: 'var(--ok)', flexShrink: 0 }} />
                            : <AlertTriangle style={{ width: 14, height: 14, color: 'var(--warn)', flexShrink: 0 }} />}
                          <p style={{ fontSize: 12, color: pass ? 'var(--text-primary)' : 'var(--warn)' }}>{label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Matches */}
                {activeTab === 'matches' && (
                  Array.isArray(matchGroups) && matchGroups.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No match groups for this profile.</div>
                  ) : (
                    <table className="data-table" style={{ borderRadius: 0 }}>
                      <thead>
                        <tr><th>ID</th><th>Classification</th><th>Strategy</th><th>Confidence</th><th>Variance</th><th>Reconciled</th></tr>
                      </thead>
                      <tbody>
                        {(Array.isArray(matchGroups) ? matchGroups : []).map((mg) => <MatchGroupRow key={mg.id} mg={mg} />)}
                      </tbody>
                    </table>
                  )
                )}

                {/* Exceptions */}
                {activeTab === 'exceptions' && (
                  profileExceptions.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--ok)', fontSize: 13 }}>✓ No exceptions.</div>
                  ) : (
                    <table className="data-table" style={{ borderRadius: 0 }}>
                      <thead>
                        <tr><th>ID</th><th>Status</th><th>Queue</th><th>Classification</th><th>Comments</th></tr>
                      </thead>
                      <tbody>
                        {profileExceptions.map((exc) => {
                          const statusColor = { OPEN: 'var(--bad)', IN_PROGRESS: 'var(--warn)', RESOLVED: 'var(--ok)', ESCALATED: '#c026d3' }
                          const color = statusColor[exc.status] || 'var(--text-tertiary)'
                          return (
                            <tr key={exc.id}>
                              <td style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}>#{exc.id}</td>
                              <td><span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 9999, background: `${color}14`, border: `1px solid ${color}33`, color }}>{exc.status}</span></td>
                              <td style={{ fontSize: 11 }}>{exc.queue_type}</td>
                              <td style={{ fontSize: 11 }}>{exc.classification || '—'}</td>
                              <td style={{ fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exc.comments || '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )
                )}

                {/* History */}
                {activeTab === 'history' && (
                  certHistory.length === 0 ? (
                    <EmptyState title="No history yet" description="Workflow actions will appear here." />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {certHistory.map((h, i) => (
                        <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: i < certHistory.length - 1 ? '1px solid var(--border-0)' : 'none' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', marginTop: 5, flexShrink: 0 }} />
                          <div>
                            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{h.action} by {h.actor_role}</p>
                            <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{h.from_status} → {h.to_status}{h.comments ? ` · "${h.comments}"` : ''}</p>
                            <p style={{ fontSize: 10.5, color: 'var(--text-disabled)' }}>{h.created_at ? new Date(h.created_at).toLocaleString() : ''}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {/* Approve / Reject */}
                {activeTab === 'action' && (
                  <div style={{ maxWidth: 540 }}>
                    <div style={{
                      padding: '12px 14px', marginBottom: 20, borderRadius: 8,
                      background: canApprove ? 'var(--accent-subtle)' : 'var(--surface-2)',
                      border: `1px solid ${canApprove ? 'var(--accent-border)' : 'var(--border-1)'}`,
                      fontSize: 12.5, color: canApprove ? 'var(--accent-hover)' : 'var(--text-secondary)',
                    }}>
                      {canApprove
                        ? `✓ Ready for your action. Current status: ${selectedCert?.status}`
                        : `Current status: "${selectedCert?.status || 'No workflow'}" — no action available.`}
                    </div>

                    {canApprove && (
                      <>
                        {/* Approve */}
                        <div style={{ background: 'var(--ok-bg)', border: '1px solid var(--ok-bdr)', borderRadius: 10, padding: 16, marginBottom: 12 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--ok)', marginBottom: 8 }}>Approve</p>
                          <textarea
                            className="input" rows={3} placeholder="Optional approval comment…"
                            value={approveComment} onChange={(e) => setApproveComment(e.target.value)}
                            style={{ resize: 'vertical', marginBottom: 10 }}
                          />
                          <button className="btn-primary text-xs" onClick={handleApprove} disabled={certActionMutation.isPending}>
                            <ThumbsUp style={{ width: 12, height: 12 }} />
                            {certActionMutation.isPending ? 'Processing…' : 'Approve'}
                          </button>
                        </div>

                        {/* Reject */}
                        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: 16 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--bad)', marginBottom: 8 }}>Reject</p>
                          {!showRejectBox ? (
                            <button className="btn-secondary text-xs" onClick={() => setShowRejectBox(true)}>
                              <ThumbsDown style={{ width: 12, height: 12 }} /> Reject this reconciliation
                            </button>
                          ) : (
                            <>
                              <textarea
                                className="input" rows={3} placeholder="Rejection reason (required)…"
                                value={rejectComment} onChange={(e) => setRejectComment(e.target.value)}
                                style={{ resize: 'vertical', marginBottom: 10, borderColor: 'var(--bad)' }}
                              />
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn-primary text-xs" style={{ background: 'var(--bad)', border: 'none' }}
                                  onClick={handleReject} disabled={certActionMutation.isPending || !rejectComment.trim()}>
                                  <XCircle style={{ width: 12, height: 12 }} /> Confirm Reject
                                </button>
                                <button className="btn-ghost text-xs" onClick={() => setShowRejectBox(false)}>Cancel</button>
                              </div>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
