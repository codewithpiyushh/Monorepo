/**
 * PreparerWorkbench — Full enterprise reconciliation workspace
 *
 * Tabs per profile:
 *  Home        — overview, balances, checklist, overdue/tasks
 *  Matching    — match groups table + run matching
 *  Exceptions  — exception queue, investigate, resolve
 *  Evidence    — upload supporting docs, list attachments
 *  Variance    — explain variances, line-by-line breakdown
 *  Adjustments — create/view journal adjustments
 *  Comments    — threaded discussion per profile
 *  History     — workflow timeline
 *  Submit      — preparer justification + submit for review
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, useOutletContext, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Home, GitMerge, AlertTriangle, Paperclip, BarChart2,
  BookOpen, MessageSquare, Clock, Send, ChevronDown,
  ChevronUp, Upload, X, File, CheckCircle2, Plus,
  RefreshCw, DollarSign, Layers, ShieldAlert, CalendarCheck2, Search,
  Info, Tag, ArrowUpCircle, CheckSquare, ExternalLink, ChevronRight,
} from 'lucide-react'
import { enterpriseAPI, workflowAPI, matchingAPI } from '../api'
import { enterpriseExtAPI, advancedAPI } from '../api'
import { useAuthStore } from '../store/authStore'
import { useProjectStore } from '../store/projectStore'
import { normalizeRole } from '../utils/roles'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, LoadingState } from '../components/ui/PageState'
import NotificationCenter from '../components/NotificationCenter'

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (s) => { try { return new Date(s).toLocaleString() } catch { return s || '—' } }

const CERT_META = {
  OPEN:         { label: 'Open',         color: 'var(--text-tertiary)' },
  PREPARED:     { label: 'Prepared',     color: 'var(--info)' },
  UNDER_REVIEW: { label: 'Under Review', color: 'var(--warn)' },
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

const RISK_COLOR = { LOW: 'var(--ok)', MEDIUM: 'var(--warn)', HIGH: 'var(--bad)', CRITICAL: '#c026d3' }

// ─────────────────────────────────────────────────────────────
// EXCEPTION DETAIL DRAWER
// ─────────────────────────────────────────────────────────────
const EXC_STATUS_META = {
  OPEN:        { label: 'Open',        color: '#ef4444' },
  IN_PROGRESS: { label: 'In Progress', color: '#f59e0b' },
  RESOLVED:    { label: 'Resolved',    color: '#22c55e' },
  ESCALATED:   { label: 'Escalated',   color: '#c026d3' },
  CLOSED:      { label: 'Closed',      color: '#94a3b8' },
}
const EXC_SEVERITY_META = {
  LOW:      { label: 'Low',      color: '#22c55e' },
  MEDIUM:   { label: 'Medium',   color: '#f59e0b' },
  HIGH:     { label: 'High',     color: '#ef4444' },
  CRITICAL: { label: 'Critical', color: '#c026d3' },
}
const CLASSIFICATIONS = ['DATA_ISSUE','PROCESS_ISSUE','SYSTEM_ERROR','TIMING_DIFFERENCE','DUPLICATE','FX_DIFFERENCE','MISSING_TRANSACTION','OTHER']
const ROOT_CAUSES     = ['TIMING_DIFFERENCE','DATA_MAPPING_ISSUE','MISSING_TRANSACTION','FX_ADJUSTMENT','MANUAL_JOURNAL','INTERCOMPANY_DIFFERENCE','SYSTEM_ERROR','OTHER']

function DrawerField({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-disabled)' }}>{label}</span>
      <span style={{ fontSize: 12.5, color: 'var(--text-primary)', lineHeight: 1.5 }}>{children || '—'}</span>
    </div>
  )
}

function ExceptionDrawer({ exc, onClose, onRefresh }) {
  const qc = useQueryClient()
  const [commentText, setCommentText] = useState('')
  const [classForm, setClassForm] = useState({ classification: exc?.classification || '', root_cause: exc?.root_cause || '', root_cause_detail: '' })
  const [resolveNote, setResolveNote] = useState('')
  const [section, setSection] = useState('details') // details | classify | resolve

  const { data: comments = [], refetch: refetchComments } = useQuery({
    queryKey: ['exc-comments', exc?.id],
    queryFn: () => enterpriseAPI.listExceptionComments(exc.id),
    enabled: Boolean(exc?.id),
  })

  const addCommentMut = useMutation({
    mutationFn: (data) => enterpriseAPI.addExceptionComment(data),
    onSuccess: () => { setCommentText(''); refetchComments(); toast.success('Comment added') },
    onError: () => toast.error('Failed to add comment'),
  })
  const classifyMut = useMutation({
    mutationFn: (data) => enterpriseAPI.classifyException(data),
    onSuccess: () => { toast.success('Exception classified'); onRefresh?.(); qc.invalidateQueries({ queryKey: ['exceptions-profile'] }) },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Classification failed'),
  })
  const resolveMut = useMutation({
    mutationFn: (data) => enterpriseAPI.resolveException(data),
    onSuccess: () => { toast.success('Exception resolved'); onRefresh?.(); onClose(); qc.invalidateQueries({ queryKey: ['exceptions-profile'] }) },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Resolve failed'),
  })
  const escalateMut = useMutation({
    mutationFn: (data) => enterpriseAPI.escalateException(data),
    onSuccess: () => { toast.success('Exception escalated'); onRefresh?.(); onClose(); qc.invalidateQueries({ queryKey: ['exceptions-profile'] }) },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Escalate failed'),
  })

  if (!exc) return null

  const statusMeta   = EXC_STATUS_META[exc.status]   || { label: exc.status,   color: '#94a3b8' }
  const severityMeta = EXC_SEVERITY_META[exc.severity] || { label: exc.severity || 'MEDIUM', color: '#f59e0b' }
  const canAct = !['RESOLVED','CLOSED'].includes(exc.status)

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          zIndex: 1000, backdropFilter: 'blur(2px)',
        }}
      />
      {/* Drawer panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 480,
        background: 'var(--surface-1)', borderLeft: '1px solid var(--border-1)',
        zIndex: 1001, display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
        animation: 'slideInRight 0.22s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: `${statusMeta.color}18`, border: `1px solid ${statusMeta.color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertTriangle size={15} color={statusMeta.color} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Exception #{exc.id}</p>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>{exc.queue_type === 'exception' ? 'Exception Queue' : 'Assigned Queue'} · {exc.classification || exc.mg_classification || 'Unclassified'}</p>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 9999, background: `${statusMeta.color}18`, border: `1px solid ${statusMeta.color}33`, color: statusMeta.color }}>{statusMeta.label}</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 9999, background: `${severityMeta.color}18`, border: `1px solid ${severityMeta.color}33`, color: severityMeta.color }}>{severityMeta.label}</span>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4, borderRadius: 6 }}>
            <X size={16} />
          </button>
        </div>

        {/* Section tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-1)', flexShrink: 0 }}>
          {[['details', 'Details', Info], ['classify', 'Classify', Tag], ['resolve', 'Resolve / Escalate', CheckSquare]].map(([key, label, Icon]) => (
            <button key={key} onClick={() => setSection(key)} style={{
              flex: 1, padding: '10px 4px', fontSize: 11, fontWeight: 600,
              background: section === key ? 'rgba(255,230,0,0.07)' : 'transparent',
              borderBottom: section === key ? '2px solid #FFE600' : '2px solid transparent',
              color: section === key ? '#FFE600' : 'var(--text-tertiary)',
              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}>
              <Icon size={12} />{label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }} className="slim-scroll">

          {section === 'details' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Core fields */}
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <DrawerField label="Queue Type">{exc.queue_type}</DrawerField>
                <DrawerField label="Status">{statusMeta.label}</DrawerField>
                <DrawerField label="Severity">{severityMeta.label}</DrawerField>
                <DrawerField label="Classification">{exc.classification || exc.mg_classification || '—'}</DrawerField>
                <DrawerField label="Root Cause">{exc.root_cause ? exc.root_cause.replace(/_/g,' ') : '—'}</DrawerField>
                <DrawerField label="Created">{exc.created_at ? new Date(exc.created_at).toLocaleDateString() : '—'}</DrawerField>
                <DrawerField label="Match Group ID">{exc.match_group_id ? `#${exc.match_group_id}` : '—'}</DrawerField>
                <DrawerField label="Variance">{ exc.mg_variance > 0 ? `$${Number(exc.mg_variance).toFixed(2)}` : '—' }</DrawerField>
              </div>
              {/* Comments / context */}
              {exc.comments && (
                <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '10px 14px' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>System Note</p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{exc.comments}</p>
                </div>
              )}
              {/* Root cause detail */}
              {exc.root_cause_detail && (
                <DrawerField label="Root Cause Detail">
                  <span style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{exc.root_cause_detail}</span>
                </DrawerField>
              )}
              {/* Resolution notes */}
              {exc.resolution_notes && (
                <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, padding: '10px 14px' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Resolution Notes</p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{exc.resolution_notes}</p>
                </div>
              )}
              {/* Comments thread */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Discussion</p>
                {comments.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--text-disabled)', fontStyle: 'italic' }}>No comments yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {comments.map((c) => (
                      <div key={c.id} style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{c.author_name || `User #${c.user_id}`}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-disabled)' }}>{c.created_at ? new Date(c.created_at).toLocaleString() : ''}</span>
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{c.comment}</p>
                      </div>
                    ))}
                  </div>
                )}
                {/* Add comment */}
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add a comment..."
                    rows={2}
                    style={{ flex: 1, resize: 'vertical', background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12, padding: '8px 10px' }}
                  />
                  <button
                    onClick={() => commentText.trim() && addCommentMut.mutate({ exception_id: exc.id, comment: commentText.trim() })}
                    disabled={!commentText.trim() || addCommentMut.isPending}
                    style={{ alignSelf: 'flex-end', padding: '8px 14px', background: '#FFE600', color: '#0a0a0a', fontWeight: 700, fontSize: 12, border: 'none', borderRadius: 8, cursor: 'pointer', opacity: !commentText.trim() ? 0.5 : 1 }}
                  >
                    <Send size={13} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {section === 'classify' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>Set or update the classification and root cause for this exception.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: 5 }}>Classification *</label>
                  <select
                    value={classForm.classification}
                    onChange={(e) => setClassForm((p) => ({ ...p, classification: e.target.value }))}
                    style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12, padding: '8px 10px' }}
                  >
                    <option value="">Select classification...</option>
                    {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c.replace(/_/g,' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: 5 }}>Root Cause</label>
                  <select
                    value={classForm.root_cause}
                    onChange={(e) => setClassForm((p) => ({ ...p, root_cause: e.target.value }))}
                    style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12, padding: '8px 10px' }}
                  >
                    <option value="">Select root cause...</option>
                    {ROOT_CAUSES.map((r) => <option key={r} value={r}>{r.replace(/_/g,' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: 5 }}>Root Cause Detail</label>
                  <textarea
                    value={classForm.root_cause_detail}
                    onChange={(e) => setClassForm((p) => ({ ...p, root_cause_detail: e.target.value }))}
                    rows={3}
                    placeholder="Describe the root cause in detail..."
                    style={{ width: '100%', resize: 'vertical', background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12, padding: '8px 10px' }}
                  />
                </div>
              </div>
              <button
                onClick={() => classifyMut.mutate({ exception_id: exc.id, classification: classForm.classification, root_cause: classForm.root_cause, root_cause_detail: classForm.root_cause_detail })}
                disabled={!classForm.classification || classifyMut.isPending}
                style={{ padding: '10px 0', background: classForm.classification ? '#FFE600' : 'var(--surface-3)', color: classForm.classification ? '#0a0a0a' : 'var(--text-disabled)', fontWeight: 700, fontSize: 13, border: 'none', borderRadius: 9, cursor: classForm.classification ? 'pointer' : 'not-allowed', transition: 'all 0.15s' }}
              >
                {classifyMut.isPending ? 'Saving...' : 'Save Classification'}
              </button>
            </div>
          )}

          {section === 'resolve' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Resolve */}
              <div style={{ background: 'var(--surface-2)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <CheckSquare size={14} color="#22c55e" />
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>Mark as Resolved</p>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>Confirm this exception has been investigated and resolved. Add resolution notes for the audit trail.</p>
                <textarea
                  value={resolveNote}
                  onChange={(e) => setResolveNote(e.target.value)}
                  rows={3}
                  placeholder="Resolution notes (optional)..."
                  style={{ width: '100%', resize: 'vertical', background: 'var(--surface-3)', border: '1px solid var(--border-1)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12, padding: '8px 10px', marginBottom: 10 }}
                />
                <button
                  onClick={() => resolveMut.mutate({ exception_id: exc.id, resolution_notes: resolveNote })}
                  disabled={resolveMut.isPending || !canAct}
                  style={{ width: '100%', padding: '10px 0', background: canAct ? 'rgba(34,197,94,0.15)' : 'var(--surface-3)', color: canAct ? '#22c55e' : 'var(--text-disabled)', fontWeight: 700, fontSize: 13, border: `1px solid ${canAct ? 'rgba(34,197,94,0.3)' : 'var(--border-1)'}`, borderRadius: 9, cursor: canAct ? 'pointer' : 'not-allowed', transition: 'all 0.15s' }}
                >
                  {resolveMut.isPending ? 'Resolving...' : 'Resolve Exception'}
                </button>
                {!canAct && <p style={{ fontSize: 11, color: 'var(--text-disabled)', marginTop: 6, textAlign: 'center' }}>This exception is already {exc.status?.toLowerCase()}.</p>}
              </div>
              {/* Escalate */}
              <div style={{ background: 'var(--surface-2)', border: '1px solid rgba(192,38,211,0.3)', borderRadius: 10, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <ArrowUpCircle size={14} color="#c026d3" />
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#c026d3' }}>Escalate</p>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>Escalate this exception to a reviewer or manager for further investigation.</p>
                <button
                  onClick={() => escalateMut.mutate({ exception_id: exc.id, comments: 'Escalated by preparer' })}
                  disabled={escalateMut.isPending || !canAct}
                  style={{ width: '100%', padding: '10px 0', background: canAct ? 'rgba(192,38,211,0.12)' : 'var(--surface-3)', color: canAct ? '#c026d3' : 'var(--text-disabled)', fontWeight: 700, fontSize: 13, border: `1px solid ${canAct ? 'rgba(192,38,211,0.3)' : 'var(--border-1)'}`, borderRadius: 9, cursor: canAct ? 'pointer' : 'not-allowed', transition: 'all 0.15s' }}
                >
                  {escalateMut.isPending ? 'Escalating...' : 'Escalate to Reviewer'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes slideInRight { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// EXCEPTIONS TAB PANEL (wrapper with drawer state)
// ─────────────────────────────────────────────────────────────
function ExceptionsTabPanel({ exceptions, profileId, onRefresh }) {
  const qc = useQueryClient()
  const [openExcDrawer, setOpenExcDrawer] = useState(null)

  return (
    <>
      {openExcDrawer && (
        <ExceptionDrawer
          exc={openExcDrawer}
          onClose={() => setOpenExcDrawer(null)}
          onRefresh={() => { onRefresh?.(); qc.invalidateQueries({ queryKey: ['exceptions-profile', profileId] }) }}
        />
      )}
      {exceptions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 16px' }}>
          <CheckCircle2 style={{ width: 32, height: 32, color: 'var(--ok)', margin: '0 auto 10px' }} />
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--ok)' }}>No open exceptions</p>
        </div>
      ) : (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Exception Queue</p>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Click any row to view details &amp; take action</p>
          </div>
          <table className="data-table" style={{ borderRadius: 0 }}>
            <thead><tr><th>ID</th><th>Status</th><th>Queue</th><th>Classification</th><th>Variance</th><th>Comments</th><th></th></tr></thead>
            <tbody>
              {exceptions.map((exc) => {
                const sc = { OPEN: 'var(--bad)', IN_PROGRESS: 'var(--warn)', RESOLVED: 'var(--ok)', ESCALATED: '#c026d3' }
                const c = sc[exc.status] || 'var(--text-tertiary)'
                return (
                  <tr
                    key={exc.id}
                    onClick={() => setOpenExcDrawer(exc)}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-3)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = ''}
                  >
                    <td style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}>#{exc.id}</td>
                    <td><span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 9999, background: `${c}14`, border: `1px solid ${c}33`, color: c }}>{exc.status}</span></td>
                    <td style={{ fontSize: 11 }}>{exc.queue_type}</td>
                    <td style={{ fontSize: 11 }}>{exc.classification || exc.mg_classification || '—'}</td>
                    <td style={{ fontSize: 11, color: exc.mg_variance > 0 ? 'var(--warn)' : 'var(--text-tertiary)' }}>
                      {exc.mg_variance > 0 ? `$${Number(exc.mg_variance).toFixed(2)}` : '—'}
                    </td>
                    <td style={{ fontSize: 11, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exc.comments || '—'}</td>
                    <td style={{ width: 28 }}><ChevronRight size={13} color="var(--text-disabled)" /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// Profile sidebar item
// ─────────────────────────────────────────────────────────────
function ProfileItem({ profile, cert, isSelected, onSelect }) {
  const status = cert?.status || 'OPEN'
  const m = CERT_META[status] || { color: 'var(--text-tertiary)' }
  return (
    <button onClick={() => onSelect(profile.id)} style={{
      width: '100%', textAlign: 'left', padding: '10px 14px',
      background: isSelected ? 'rgba(255,230,0,0.07)' : 'transparent',
      border: `1px solid ${isSelected ? 'rgba(255,230,0,0.30)' : 'transparent'}`,
      borderRadius: 8, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 3,
    }}
    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-3)' }}
    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: isSelected ? '#FFE600' : 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {profile.name}
        </p>
        <CertBadge status={status} />
      </div>
      <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
        {(profile.reconciliation_type || '').replace(/_/g, ' ')} · {profile.risk_classification || 'MEDIUM'}
      </p>
      {cert?.due_date && (
        <p style={{ fontSize: 10.5, color: 'var(--text-disabled)' }}>Due {cert.due_date}</p>
      )}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────
// HOME TAB — balances, checklist, tasks
// ─────────────────────────────────────────────────────────────
function HomeTab({ profile, cert, matchGroups, exceptions, closeTasks, varianceData, onUpdateTask, onTabChange }) {
  const riskColor = RISK_COLOR[(profile.risk_classification || 'MEDIUM').toUpperCase()] || 'var(--warn)'

  const totalVariance = useMemo(() => {
    if (varianceData?.total_variance !== undefined) return varianceData.total_variance
    return (matchGroups || []).reduce((s, mg) => s + Math.abs(Number(mg.variance_amount || 0)), 0)
  }, [varianceData, matchGroups])

  const srcBalance = varianceData?.source_balance ?? 0
  const tgtBalance = varianceData?.target_balance ?? Math.max(srcBalance - totalVariance, 0)

  const totalMG   = (matchGroups || []).length
  const fullMatch = (matchGroups || []).filter((m) => m.classification === 'FULL_MATCH').length
  const openExc   = (exceptions || []).filter((e) => !['RESOLVED','CLOSED'].includes(e.status || '')).length
  const hasEvidence   = false // would come from attachments query
  const completedTasks = (closeTasks || []).filter((t) => t.status === 'COMPLETE').length
  const totalTasks     = (closeTasks || []).length
  const taskPct = totalTasks ? Math.round(completedTasks / totalTasks * 100) : 0

  const checklist = [
    { key: 'matched',   label: 'Transactions Matched',  done: fullMatch > 0 && openExc === 0,   tab: 'matching' },
    { key: 'exc',       label: 'Exceptions Reviewed',   done: openExc === 0 && totalMG > 0,     tab: 'exceptions' },
    { key: 'evidence',  label: 'Evidence Attached',     done: hasEvidence,                       tab: 'evidence' },
    { key: 'variance',  label: 'Variance Explained',    done: totalVariance === 0,               tab: 'variance' },
    { key: 'adj',       label: 'Adjustments Submitted', done: false,                             tab: 'adjustments' },
  ]
  const checkDone  = checklist.filter((c) => c.done).length
  const checkTotal = checklist.length
  const checkPct   = Math.round(checkDone / checkTotal * 100)

  const overdue = (closeTasks || []).filter((t) => {
    if (!t.due_date) return false
    try { return new Date() > new Date(t.due_date) && t.status !== 'COMPLETE' } catch { return false }
  })
  const dueSoon = (closeTasks || []).filter((t) => {
    if (!t.due_date) return false
    try {
      const d = new Date(t.due_date)
      const now = new Date()
      return d > now && (d - now) < 7 * 86400000 && t.status !== 'COMPLETE'
    } catch { return false }
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Rejected banner */}
      {cert?.status === 'REJECTED' && (
        <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 10, padding: '12px 16px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--bad)' }}>⚠ Reconciliation Rejected</p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{cert?.last_comment || 'Review comments from the reviewer and resubmit.'}</p>
        </div>
      )}

      {/* Balance cards */}
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {[
            ['Source Balance',  `$${fmt(srcBalance)}`,   'var(--text-primary)'],
            ['Target Balance',  `$${fmt(tgtBalance)}`,   'var(--text-primary)'],
            ['Variance',        totalVariance > 0 ? `$${fmt(totalVariance)}` : '$0.00', totalVariance > 0 ? 'var(--warn)' : 'var(--ok)'],
            ['Risk Rating',     profile.risk_classification || 'MEDIUM', riskColor],
          ].map(([label, val, color]) => (
            <div key={label} style={{ background: 'var(--surface-2)', border: `1px solid var(--border-1)`, borderRadius: 10, padding: '14px 18px' }}>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>{label}</p>
              <p style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: '-0.02em' }}>{val}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* Completion checklist */}
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: 16 }}>
          <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'var(--text-disabled)', fontWeight: 700, marginBottom: 10 }}>
            COMPLETION CHECKLIST
          </p>
          <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 9999, overflow: 'hidden', marginBottom: 4 }}>
            <div style={{ width: `${checkPct}%`, height: '100%', background: checkPct === 100 ? 'var(--ok)' : '#FFE600', transition: 'width 400ms' }} />
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 12, textAlign: 'right' }}>{checkPct}%</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {checklist.map((item) => (
              <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                onClick={() => onTabChange(item.tab)}>
                <div style={{
                  width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                  border: `2px solid ${item.done ? 'var(--ok)' : 'var(--border-2)'}`,
                  background: item.done ? 'rgba(34,197,94,0.15)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {item.done && <CheckCircle2 style={{ width: 11, height: 11, color: 'var(--ok)' }} />}
                </div>
                <p style={{ fontSize: 12.5, fontWeight: 600, color: item.done ? 'var(--text-secondary)' : 'var(--text-primary)',
                  textDecoration: item.done ? 'line-through' : 'none' }}>
                  {item.label}
                </p>
                {!item.done && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#FFE600', fontWeight: 600 }}>→</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Tasks / overdue / due soon */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {overdue.length > 0 && (
            <div style={{ background: 'var(--surface-2)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 10, padding: 14 }}>
              <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'var(--bad)', fontWeight: 700, marginBottom: 8 }}>
                OVERDUE ({overdue.length})
              </p>
              {overdue.slice(0, 3).map((t) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                  <AlertTriangle style={{ width: 12, height: 12, color: 'var(--bad)', flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--bad)' }}>{t.task_name}</p>
                    <p style={{ fontSize: 10.5, color: 'var(--text-disabled)' }}>Was due {t.due_date}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {dueSoon.length > 0 && (
            <div style={{ background: 'var(--surface-2)', border: '1px solid rgba(245,158,11,.20)', borderRadius: 10, padding: 14 }}>
              <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'var(--warn)', fontWeight: 700, marginBottom: 8 }}>
                DUE SOON ({dueSoon.length})
              </p>
              {dueSoon.map((t) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Clock style={{ width: 11, height: 11, color: 'var(--warn)', flexShrink: 0 }} />
                  <p style={{ fontSize: 12, color: 'var(--text-primary)' }}>{t.task_name}</p>
                  <p style={{ fontSize: 10.5, color: 'var(--text-disabled)', marginLeft: 'auto' }}>Due {t.due_date}</p>
                </div>
              ))}
            </div>
          )}
          {/* My tasks */}
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'var(--text-disabled)', fontWeight: 700 }}>
                MY TASKS ({completedTasks}/{totalTasks})
              </p>
              <div style={{ height: 4, width: 60, background: 'var(--surface-3)', borderRadius: 9999, overflow: 'hidden' }}>
                <div style={{ width: `${taskPct}%`, height: '100%', background: taskPct === 100 ? 'var(--ok)' : '#FFE600' }} />
              </div>
            </div>
            {closeTasks.length === 0
              ? <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No tasks. Rollover profile to generate tasks.</p>
              : closeTasks.map((t) => {
                const sc = { NOT_STARTED: 'var(--text-tertiary)', IN_PROGRESS: 'var(--warn)', COMPLETE: 'var(--ok)', BLOCKED: 'var(--bad)' }
                const c  = sc[t.status] || 'var(--text-tertiary)'
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border-0)' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: c, flexShrink: 0 }} />
                    <p style={{ fontSize: 12, flex: 1, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.task_name}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-disabled)' }}>{t.due_date}</p>
                    {t.status !== 'COMPLETE' && (
                      <button className="btn-primary text-xs py-0 h-5"
                        onClick={() => onUpdateTask(t.id, { status: 'COMPLETE', completion_pct: 100 })}>Done</button>
                    )}
                  </div>
                )
              })
            }
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// MATCHING TAB — interactive match group viewer
// ─────────────────────────────────────────────────────────────
function MatchingTab({ profileId, matchGroups, onRefresh }) {
  const qc = useQueryClient()
  const [expandedId,  setExpandedId]  = useState(null)
  const [notesMap,    setNotesMap]    = useState({})
  const [savingNotes, setSavingNotes] = useState(null)
  const [rejectId,    setRejectId]    = useState(null)
  const [rejectReason,setRejectReason]= useState('')
  const [filter,      setFilter]      = useState('ALL')
  const [showManual,  setShowManual]  = useState(false)
  const [manualSrc,   setManualSrc]   = useState([])
  const [manualTgt,   setManualTgt]   = useState([])

  // Fetch unmatched records for manual pairing
  const { data: unmatchedData } = useQuery({
    queryKey: ['unmatched-records', profileId],
    queryFn: () => matchingAPI.unmatchedRecords(profileId),
    enabled: Boolean(profileId) && showManual,
  })
  const unmatchedRecords = unmatchedData?.records || []

  const confirmMutation = useMutation({
    mutationFn: (groupId) => matchingAPI.confirmMatch(groupId),
    onSuccess: () => { toast.success('Match confirmed ✓'); qc.invalidateQueries({ queryKey: ['profile-groups', profileId] }); onRefresh?.() },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Confirm failed'),
  })
  const rejectMutation = useMutation({
    mutationFn: ({ groupId, reason }) => matchingAPI.rejectMatch(groupId, reason),
    onSuccess: () => { toast.success('Match rejected'); setRejectId(null); setRejectReason(''); qc.invalidateQueries({ queryKey: ['profile-groups', profileId] }); onRefresh?.() },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Reject failed'),
  })
  const notesMutation = useMutation({
    mutationFn: ({ groupId, notes }) => matchingAPI.updateNotes(groupId, notes),
    onSuccess: (_, { groupId }) => { toast.success('Notes saved'); setSavingNotes(null); qc.invalidateQueries({ queryKey: ['profile-groups', profileId] }) },
    onError: (e) => { setSavingNotes(null); toast.error('Notes save failed') },
  })
  const manualMatchMutation = useMutation({
    mutationFn: (data) => matchingAPI.createManualMatch(data),
    onSuccess: () => { toast.success('Manual match created'); setShowManual(false); setManualSrc([]); setManualTgt([]); qc.invalidateQueries({ queryKey: ['profile-groups', profileId] }); onRefresh?.() },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Manual match failed'),
  })

  const CLASS_COLOR = { FULL_MATCH: 'var(--ok)', PARTIAL_MATCH: 'var(--warn)', UNMATCHED: 'var(--bad)' }
  const filtered = (Array.isArray(matchGroups) ? matchGroups : []).filter((mg) => filter === 'ALL' || mg.classification === filter)
  const counts = { ALL: matchGroups?.length || 0 }
  ;(matchGroups || []).forEach((mg) => { counts[mg.classification] = (counts[mg.classification] || 0) + 1 })

  const toggleRecord = (id, list, setter) =>
    setter((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[['ALL','All'], ['FULL_MATCH','Full Match'], ['PARTIAL_MATCH','Partial'], ['UNMATCHED','Unmatched']].map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)} style={{
              fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 9999, cursor: 'pointer',
              background: filter === val ? (CLASS_COLOR[val] || '#FFE600') : 'var(--surface-2)',
              color: filter === val ? '#000' : 'var(--text-secondary)',
              border: `1px solid ${filter === val ? (CLASS_COLOR[val] || '#FFE600') : 'var(--border-1)'}`,
            }}>
              {label} {counts[val] != null ? `(${counts[val]})` : ''}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Manual match button */}
        <button className="btn-primary text-xs h-8" onClick={() => setShowManual(!showManual)}>
          <GitMerge style={{ width: 12, height: 12 }} /> Manual Match
        </button>
      </div>

      {/* ── Manual Match Form ── */}
      {showManual && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 12, padding: 18 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>
            Create Manual Match
          </p>
          {unmatchedRecords.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No unmatched records available for manual pairing.</p>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                {/* Source */}
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>SOURCE Records (select)</p>
                  <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }} className="slim-scroll">
                    {unmatchedRecords.filter((r) => r.system_type === 'SOURCE' || r.side === 'source').map((r) => (
                      <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                        background: manualSrc.includes(r.id) ? 'rgba(255,230,0,0.08)' : 'var(--surface-1)',
                        border: `1px solid ${manualSrc.includes(r.id) ? '#FFE600' : 'var(--border-1)'}`,
                        borderRadius: 7, cursor: 'pointer', fontSize: 11 }}>
                        <input type="checkbox" checked={manualSrc.includes(r.id)} onChange={() => toggleRecord(r.id, manualSrc, setManualSrc)} />
                        <div>
                          <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.reference || r.transaction_id || `#${r.id}`}</p>
                          <p style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>${fmt(Math.abs(r.amount || 0))} · {r.description?.slice(0,30)}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                {/* Target */}
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>TARGET Records (select)</p>
                  <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }} className="slim-scroll">
                    {unmatchedRecords.filter((r) => r.system_type === 'TARGET' || r.side === 'target').map((r) => (
                      <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                        background: manualTgt.includes(r.id) ? 'rgba(99,102,241,0.1)' : 'var(--surface-1)',
                        border: `1px solid ${manualTgt.includes(r.id) ? 'var(--accent)' : 'var(--border-1)'}`,
                        borderRadius: 7, cursor: 'pointer', fontSize: 11 }}>
                        <input type="checkbox" checked={manualTgt.includes(r.id)} onChange={() => toggleRecord(r.id, manualTgt, setManualTgt)} />
                        <div>
                          <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.reference || r.transaction_id || `#${r.id}`}</p>
                          <p style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>${fmt(Math.abs(r.amount || 0))} · {r.description?.slice(0,30)}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn-secondary text-xs" onClick={() => { setShowManual(false); setManualSrc([]); setManualTgt([]) }}>Cancel</button>
                <button className="btn-primary text-xs"
                  disabled={manualSrc.length === 0 || manualTgt.length === 0 || manualMatchMutation.isPending}
                  onClick={() => manualMatchMutation.mutate({ profile_id: profileId, source_ids: manualSrc, target_ids: manualTgt })}>
                  {manualMatchMutation.isPending ? 'Creating…' : `Match ${manualSrc.length}S + ${manualTgt.length}T`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Match Groups List ── */}
      {filtered.length === 0 ? (
        <EmptyState title="No match groups" description="Run matching from the Transaction Matching Workspace or create a manual match above." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((mg) => {
            const c       = CLASS_COLOR[mg.classification] || 'var(--text-tertiary)'
            const isOpen  = expandedId === mg.id
            const srcRecs = mg.source_records || []
            const tgtRecs = mg.target_records || []
            const allRecs = mg.records        || [...srcRecs, ...tgtRecs]
            const conf    = Math.round((mg.confidence || 0) * 100)

            return (
              <div key={mg.id} style={{ background: 'var(--surface-2)', border: `1px solid ${isOpen ? c + '44' : 'var(--border-1)'}`, borderRadius: 12, overflow: 'hidden', transition: 'border-color 200ms' }}>

                {/* ── Group row (click to expand) ── */}
                <div onClick={() => setExpandedId(isOpen ? null : mg.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                  cursor: 'pointer', userSelect: 'none',
                  background: isOpen ? 'var(--surface-3)' : 'var(--surface-2)',
                }}>
                  {/* Chevron */}
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', transition: 'transform 200ms', display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>

                  {/* ID */}
                  <span style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-tertiary)', minWidth: 44 }}>#{mg.id}</span>

                  {/* Classification badge */}
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 9999,
                    background: `${c}14`, border: `1px solid ${c}33`, color: c, flexShrink: 0 }}>
                    {mg.classification}
                  </span>

                  {/* Strategy */}
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>{mg.strategy}</span>

                  <div style={{ flex: 1 }} />

                  {/* Confidence */}
                  <div style={{ textAlign: 'center', minWidth: 50 }}>
                    <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 1 }}>Confidence</p>
                    <p style={{ fontSize: 12, fontWeight: 700, color: conf >= 95 ? 'var(--ok)' : conf >= 70 ? 'var(--warn)' : 'var(--bad)' }}>{conf}%</p>
                  </div>

                  {/* Variance */}
                  <div style={{ textAlign: 'center', minWidth: 70 }}>
                    <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 1 }}>Variance</p>
                    <p style={{ fontSize: 12, fontWeight: 600, color: mg.variance_amount > 0 ? 'var(--warn)' : 'var(--ok)' }}>
                      {mg.variance_amount > 0 ? `$${Number(mg.variance_amount).toFixed(2)}` : '—'}
                    </p>
                  </div>

                  {/* Records */}
                  <div style={{ textAlign: 'center', minWidth: 50 }}>
                    <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 1 }}>Records</p>
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{allRecs.length || (srcRecs.length + tgtRecs.length)}</p>
                  </div>

                  {/* Status */}
                  <span style={{ fontSize: 10, fontWeight: 600, minWidth: 80, textAlign: 'right',
                    color: mg.reconciled || mg.status === 'CONFIRMED' ? 'var(--ok)' : mg.status === 'REJECTED' ? 'var(--bad)' : 'var(--text-tertiary)' }}>
                    {mg.reconciled || mg.status === 'CONFIRMED' ? '✓ Confirmed' : mg.status === 'REJECTED' ? '✗ Rejected' : '— Pending'}
                  </span>

                  {/* Quick actions (stop propagation so row click doesn't toggle) */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                    {mg.status !== 'CONFIRMED' && mg.status !== 'REJECTED' && (
                      <>
                        <button className="btn-sm" style={{ fontSize: 10, padding: '3px 9px', background: 'rgba(34,197,94,0.12)',
                          border: '1px solid rgba(34,197,94,0.35)', color: 'var(--ok)', borderRadius: 6, cursor: 'pointer' }}
                          disabled={confirmMutation.isPending}
                          onClick={() => confirmMutation.mutate(mg.id)}>
                          ✓ Confirm
                        </button>
                        <button className="btn-sm" style={{ fontSize: 10, padding: '3px 9px', background: 'rgba(239,68,68,0.10)',
                          border: '1px solid rgba(239,68,68,0.30)', color: 'var(--bad)', borderRadius: 6, cursor: 'pointer' }}
                          onClick={() => setRejectId(mg.id)}>
                          ✗ Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* ── Reject reason panel ── */}
                {rejectId === mg.id && (
                  <div style={{ padding: '10px 16px', background: 'rgba(239,68,68,0.06)', borderTop: '1px solid var(--border-1)', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input className="input text-xs" style={{ flex: 1 }} placeholder="Reason for rejection (optional)…"
                      value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                    <button className="btn-sm" style={{ fontSize: 10, padding: '4px 10px', background: 'rgba(239,68,68,0.15)',
                      border: '1px solid rgba(239,68,68,0.40)', color: 'var(--bad)', borderRadius: 6, cursor: 'pointer' }}
                      disabled={rejectMutation.isPending}
                      onClick={() => rejectMutation.mutate({ groupId: mg.id, reason: rejectReason })}>
                      {rejectMutation.isPending ? 'Rejecting…' : 'Confirm Reject'}
                    </button>
                    <button className="btn-ghost btn-sm" style={{ fontSize: 10 }} onClick={() => setRejectId(null)}>Cancel</button>
                  </div>
                )}

                {/* ── Expanded detail panel ── */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--border-1)', padding: 16, display: 'flex', flexDirection: 'column', gap: 14, background: 'var(--surface-1)' }}>

                    {/* Records split view */}
                    {(srcRecs.length > 0 || tgtRecs.length > 0 || allRecs.length > 0) && (
                      <div style={{ display: 'grid', gridTemplateColumns: srcRecs.length > 0 && tgtRecs.length > 0 ? '1fr 1fr' : '1fr', gap: 12 }}>
                        {/* Source */}
                        {(srcRecs.length > 0 || allRecs.length > 0) && (
                          <div>
                            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>
                              Source Records ({srcRecs.length || allRecs.length})
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                              {(srcRecs.length > 0 ? srcRecs : allRecs).map((r, i) => (
                                <div key={r.id || i} style={{ padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 7, border: '1px solid var(--border-0)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-primary)', fontWeight: 600 }}>{r.reference || r.transaction_id || `#${r.id}`}</span>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ok)' }}>${fmt(Math.abs(r.amount || 0))}</span>
                                  </div>
                                  <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{r.description || r.system_name || '—'} {r.transaction_date && `· ${fmtDate(r.transaction_date)}`}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Target */}
                        {tgtRecs.length > 0 && (
                          <div>
                            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>
                              Target Records ({tgtRecs.length})
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                              {tgtRecs.map((r, i) => (
                                <div key={r.id || i} style={{ padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 7, border: '1px solid var(--border-0)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-primary)', fontWeight: 600 }}>{r.reference || r.transaction_id || `#${r.id}`}</span>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>${fmt(Math.abs(r.amount || 0))}</span>
                                  </div>
                                  <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{r.description || r.system_name || '—'} {r.transaction_date && `· ${fmtDate(r.transaction_date)}`}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Notes */}
                    <div>
                      <label className="label" style={{ marginBottom: 4, display: 'block' }}>Notes / Explanation</label>
                      <textarea className="input" rows={2}
                        placeholder="Add notes about this match group…"
                        value={notesMap[mg.id] ?? (mg.notes || '')}
                        onChange={(e) => setNotesMap((p) => ({ ...p, [mg.id]: e.target.value }))}
                        style={{ resize: 'vertical', marginBottom: 6 }} />
                      <button className="btn-primary text-xs"
                        disabled={savingNotes === mg.id}
                        onClick={async () => {
                          setSavingNotes(mg.id)
                          notesMutation.mutate({ groupId: mg.id, notes: notesMap[mg.id] ?? mg.notes ?? '' })
                        }}>
                        {savingNotes === mg.id ? 'Saving…' : 'Save Notes'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// EVIDENCE TAB — upload documents, list attachments
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// COMBINED VARIANCE WORKBENCH — Evidence + Variance + Adjustments + Comments

// ─────────────────────────────────────────────────────────────
function VarianceWorkbenchTab({ profileId, matchGroups, currentUser }) {
  // ── Evidence state ──
  const [dragOver, setDragOver]   = useState(false)
  const [docType,  setDocType]    = useState('supporting')
  const [docName,  setDocName]    = useState('')
  const [file,     setFile]       = useState(null)
  const [uploading,setUploading]  = useState(false)
  const inputRef = useRef()

  // ── Variance state ──
  const [explanations, setExplanations] = useState({})
  const [saving, setSaving]             = useState(null)

  // ── Adjustments state ──
  const [showAdjForm, setShowAdjForm] = useState(false)
  const [adjForm, setAdjForm]         = useState({ account: '', amount: '', currency: 'USD', reason: '', period_key: '' })

  // ── Comments state ──
  const [commentText, setCommentText] = useState('')

  const qc = useQueryClient()

  // ── Queries ──
  const { data: attachments = [], refetch: refetchAttach } = useQuery({
    queryKey: ['profile-attachments', profileId],
    queryFn: () => enterpriseAPI.listAttachments(profileId),
    enabled: Boolean(profileId),
  })
  const { data: varianceData } = useQuery({
    queryKey: ['profile-variance', profileId],
    queryFn: () => enterpriseAPI.getVariance(profileId),
    enabled: Boolean(profileId),
  })
  const { data: adjustments = [], refetch: refetchAdj } = useQuery({
    queryKey: ['profile-adjustments', profileId],
    queryFn: () => enterpriseAPI.listJournalAdjustments(profileId),
    enabled: Boolean(profileId),
  })
  const { data: comments = [], refetch: refetchComments } = useQuery({
    queryKey: ['profile-comments', profileId],
    queryFn: () => enterpriseAPI.listComments(profileId),
    enabled: Boolean(profileId),
  })

  // ── Derived: variance lines ──
  const varLines = useMemo(() => {
    const lines = []
    if (varianceData?.line_items?.length) return varianceData.line_items
    ;(matchGroups || []).forEach((mg) => {
      if (mg.classification === 'FULL_MATCH') return
      if (!mg.variance_amount || Number(mg.variance_amount) === 0) return
      lines.push({
        id: mg.id,
        reference: `MG-${mg.id}`,
        description: `${mg.strategy} — ${mg.classification}`,
        variance: Number(mg.variance_amount),
        classification: mg.classification,
        confidence: mg.confidence,
      })
    })
    return lines
  }, [varianceData, matchGroups])

  const totalVariance    = varLines.reduce((s, l) => s + Math.abs(l.variance), 0)
  const totalAdjustments = adjustments
    .filter((adj) => ['SUBMITTED', 'APPROVED', 'POSTED'].includes(adj.status))
    .reduce((s, adj) => s + Math.abs(Number(adj.amount || 0)), 0)
  const unexplainedAmount = Math.max(0, totalVariance - totalAdjustments)

  // ── Mutations ──
  const createAdjMutation = useMutation({
    mutationFn: (payload) => enterpriseAPI.createJournal(payload),
    onSuccess: () => {
      toast.success('Adjustment created')
      setShowAdjForm(false)
      setAdjForm({ account: '', amount: '', currency: 'USD', reason: '', period_key: '' })
      refetchAdj()
    },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Failed to create adjustment'),
  })
  const addCommentMutation = useMutation({
    mutationFn: (payload) => enterpriseAPI.addComment(payload),
    onSuccess: () => { toast.success('Comment added'); setCommentText(''); refetchComments() },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Comment failed'),
  })

  const handleFileDrop = (e) => {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer?.files?.[0]
    if (f) { setFile(f); setDocName(f.name) }
  }
  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    try {
      await enterpriseAPI.uploadAttachment(profileId, { file, document_type: docType, document_name: docName || file.name })
      toast.success('Evidence uploaded')
      setFile(null); setDocName('')
      qc.invalidateQueries({ queryKey: ['profile-attachments', profileId] })
      refetchAttach()
    } catch (e) { toast.error(e?.response?.data?.detail || 'Upload failed') }
    finally { setUploading(false) }
  }
  const handleSaveExplanation = async (lineId) => {
    setSaving(lineId)
    try {
      await enterpriseAPI.addComment({ profile_id: profileId, comment: explanations[lineId], context: `variance_line_${lineId}` })
      toast.success('Explanation saved')
      qc.invalidateQueries({ queryKey: ['profile-comments', profileId] })
    } catch (e) { toast.error('Save failed') }
    finally { setSaving(null) }
  }

  const FILE_ICON_COLOR = { pdf: '#ef4444', xlsx: '#22c55e', xls: '#22c55e', csv: '#38bdf8',
    docx: '#6366f1', doc: '#6366f1', png: '#f59e0b', jpg: '#f59e0b', jpeg: '#f59e0b' }
  const CATEGORY_OPTIONS = [
    'Timing Difference', 'Currency Rounding', 'Accrual Difference',
    'Cut-off Issue', 'Bank Charges', 'In-Transit Items',
    'System Error', 'Duplicate Entry', 'Manual Adjustment', 'Other',
  ]
  const STATUS_COLOR = {
    DRAFT: 'var(--text-tertiary)', SUBMITTED: 'var(--warn)',
    APPROVED: 'var(--ok)', POSTED: 'var(--ok)', REJECTED: 'var(--bad)',
  }

  const sectionStyle = {
    background: 'var(--surface-2)', border: '1px solid var(--border-1)',
    borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 14,
  }
  const sectionHeader = (icon, title, badge) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{title}</p>
      {badge != null && (
        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 9999,
          background: 'var(--surface-3)', border: '1px solid var(--border-1)', color: 'var(--text-tertiary)' }}>
          {badge}
        </span>
      )}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── 1. VARIANCE SUMMARY ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        {[
          ['Total Variance',    `$${fmt(totalVariance)}`,    totalVariance > 0 ? 'var(--warn)' : 'var(--ok)'],
          ['Adjustments Applied', `$${fmt(totalAdjustments)}`, 'var(--ok)'],
          ['Unexplained',       `$${fmt(unexplainedAmount)}`, unexplainedAmount > 0 ? 'var(--bad)' : 'var(--ok)'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: '12px 16px' }}>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>{label}</p>
            <p style={{ fontSize: 20, fontWeight: 700, color }}>{val}</p>
          </div>
        ))}
      </div>

      {/* ── 2. VARIANCE LINES ── */}
      <div style={sectionStyle}>
        {sectionHeader('📊', 'Variance Lines', varLines.length)}
        {varLines.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <CheckCircle2 style={{ width: 28, height: 28, color: 'var(--ok)', margin: '0 auto 8px' }} />
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ok)' }}>No variances detected</p>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>All transactions are fully matched.</p>
          </div>
        ) : (
          varLines.map((line) => (
            <div key={line.id} style={{ background: 'var(--surface-1)', border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid var(--border-0)', background: 'var(--surface-2)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'IBM Plex Mono, monospace' }}>{line.reference}</p>
                    <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 9999,
                      background: 'rgba(245,158,11,0.14)', border: '1px solid rgba(245,158,11,0.30)', color: 'var(--warn)', fontWeight: 700 }}>
                      {line.classification}
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{line.description}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--warn)' }}>${fmt(Math.abs(line.variance))}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Confidence: {Math.round((line.confidence || 0) * 100)}%</p>
                </div>
              </div>
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label className="label">Variance Category</label>
                    <select className="input text-xs" value={explanations[`${line.id}_cat`] || ''}
                      onChange={(e) => setExplanations((p) => ({ ...p, [`${line.id}_cat`]: e.target.value }))}>
                      <option value="">Select category…</option>
                      {CATEGORY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Expected Resolution Date</label>
                    <input className="input text-xs" type="date" value={explanations[`${line.id}_date`] || ''}
                      onChange={(e) => setExplanations((p) => ({ ...p, [`${line.id}_date`]: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="label">Explanation *</label>
                  <textarea className="input" rows={2} placeholder="Explain the reason for this variance in detail…"
                    value={explanations[line.id] || ''}
                    onChange={(e) => setExplanations((p) => ({ ...p, [line.id]: e.target.value }))}
                    style={{ resize: 'vertical' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn-primary text-xs" disabled={saving === line.id || !explanations[line.id]}
                    onClick={() => handleSaveExplanation(line.id)}>
                    {saving === line.id ? 'Saving…' : 'Save Explanation'}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── 3. EVIDENCE UPLOAD ── */}
      <div style={sectionStyle}>
        {sectionHeader('📎', 'Supporting Evidence', attachments.length)}

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleFileDrop}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? '#FFE600' : file ? 'var(--ok)' : 'var(--border-2)'}`,
            borderRadius: 10, padding: '22px 16px', textAlign: 'center', cursor: 'pointer',
            background: dragOver ? 'rgba(255,230,0,0.04)' : file ? 'rgba(34,197,94,0.04)' : 'var(--surface-1)',
            transition: 'all 200ms',
          }}
        >
          <input ref={inputRef} type="file" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setDocName(f.name) } }} />
          {file ? (
            <><CheckCircle2 style={{ width: 24, height: 24, color: 'var(--ok)', margin: '0 auto 6px' }} />
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--ok)' }}>{file.name}</p>
              <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{(file.size / 1024).toFixed(1)} KB · Click to change</p>
            </>
          ) : (
            <><Upload style={{ width: 24, height: 24, color: 'var(--text-tertiary)', margin: '0 auto 6px' }} />
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Drop file here or click to browse</p>
              <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 3 }}>PDF, Excel, CSV, Word, Images supported</p>
            </>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label className="label">Document Type</label>
            <select className="input text-xs" value={docType} onChange={(e) => setDocType(e.target.value)}>
              <option value="supporting">Supporting Document</option>
              <option value="bank_statement">Bank Statement</option>
              <option value="ledger_extract">Ledger Extract</option>
              <option value="reconciliation_report">Reconciliation Report</option>
              <option value="audit_evidence">Audit Evidence</option>
              <option value="variance_explanation">Variance Explanation</option>
              <option value="approval_email">Approval Email</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="label">Document Name</label>
            <input className="input text-xs" value={docName} onChange={(e) => setDocName(e.target.value)}
              placeholder={file?.name || 'Document name'} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn-primary text-xs" onClick={handleUpload} disabled={!file || uploading}>
            <Upload style={{ width: 11, height: 11 }} />
            {uploading ? 'Uploading…' : 'Upload Evidence'}
          </button>
        </div>

        {/* Attachment list */}
        {attachments.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {attachments.map((att) => {
              const ext   = (att.document_name || att.file_name || '').split('.').pop()?.toLowerCase()
              const color = FILE_ICON_COLOR[ext] || 'var(--accent)'
              return (
                <div key={att.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  background: 'var(--surface-1)', borderRadius: 8, border: '1px solid var(--border-0)',
                }}>
                  <div style={{ width: 30, height: 30, borderRadius: 6, background: `${color}18`,
                    border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <File style={{ width: 13, height: 13, color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {att.document_name || att.file_name || `Document #${att.id}`}
                    </p>
                    <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                      {att.document_type?.replace(/_/g,' ')} · {fmtDate(att.created_at)}
                      {att.uploaded_by_username ? ` · ${att.uploaded_by_username}` : ''}
                    </p>
                  </div>
                  {att.download_url && (
                    <a href={att.download_url} target="_blank" rel="noreferrer"
                      style={{ fontSize: 11, fontWeight: 600, color: '#FFE600', textDecoration: 'none' }}>Download</a>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── 4. JOURNAL ADJUSTMENTS ── */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>{sectionHeader('📒', 'Journal Adjustments', adjustments.length)}</div>
          <button className="btn-primary text-xs h-7" onClick={() => {
            if (showAdjForm) {
              setShowAdjForm(false)
            } else {
              setShowAdjForm(true)
              if (varianceData) {
                setAdjForm({
                  account: '',
                  amount: String(Math.abs(varianceData.total_variance || '')),
                  currency: 'USD',
                  reason: `Adjustment for variance of $${fmt(Math.abs(varianceData.total_variance || 0))}`,
                  period_key: varianceData.period || '2026-07',
                })
              }
            }
          }}>
            <Plus style={{ width: 11, height: 11 }} /> New Adjustment
          </button>
        </div>

        {showAdjForm && (
          <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border-1)', borderRadius: 10, padding: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>New Journal Adjustment</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <label className="label">Account</label>
                <input className="input text-xs" placeholder="e.g. 10100"
                  value={adjForm.account} onChange={(e) => setAdjForm((p) => ({ ...p, account: e.target.value }))} />
              </div>
              <div>
                <label className="label">Amount</label>
                <input className="input text-xs" type="number" placeholder="0.00"
                  value={adjForm.amount} onChange={(e) => setAdjForm((p) => ({ ...p, amount: e.target.value }))} />
              </div>
              <div>
                <label className="label">Currency</label>
                <select className="input text-xs" value={adjForm.currency}
                  onChange={(e) => setAdjForm((p) => ({ ...p, currency: e.target.value }))}>
                  {['USD','EUR','GBP','JPY','CAD','AUD','CHF','SGD','INR'].map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div>
                <label className="label">Period</label>
                <input className="input text-xs" placeholder="e.g. 2025-06"
                  value={adjForm.period_key} onChange={(e) => setAdjForm((p) => ({ ...p, period_key: e.target.value }))} />
              </div>
              <div>
                <label className="label">Reason *</label>
                <input className="input text-xs" placeholder="Reason for adjustment"
                  value={adjForm.reason} onChange={(e) => setAdjForm((p) => ({ ...p, reason: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-secondary text-xs" onClick={() => setShowAdjForm(false)}>Cancel</button>
              <button className="btn-primary text-xs"
                disabled={createAdjMutation.isPending || !adjForm.account || !adjForm.amount || !adjForm.reason}
                onClick={() => createAdjMutation.mutate({ profile_id: profileId, ...adjForm, amount: Number(adjForm.amount) })}>
                {createAdjMutation.isPending ? 'Creating…' : 'Create Adjustment'}
              </button>
            </div>
          </div>
        )}

        {adjustments.length === 0 && !showAdjForm ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <DollarSign style={{ width: 24, height: 24, color: 'var(--text-tertiary)', margin: '0 auto 6px' }} />
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>No adjustments yet</p>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Create journal adjustments to correct variances.</p>
          </div>
        ) : (
          <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden' }}>
            <table className="data-table" style={{ borderRadius: 0 }}>
              <thead><tr><th>ID</th><th>Account</th><th>Period</th><th>Amount</th><th>Status</th><th>Reason</th><th>Created</th></tr></thead>
              <tbody>
                {adjustments.map((adj) => {
                  const color = STATUS_COLOR[adj.status] || 'var(--text-tertiary)'
                  return (
                    <tr key={adj.id}>
                      <td style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}>#{adj.id}</td>
                      <td style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}>{adj.account}</td>
                      <td style={{ fontSize: 11 }}>{adj.period_key}</td>
                      <td style={{ fontSize: 12, fontWeight: 600, color: Number(adj.amount) < 0 ? 'var(--bad)' : 'var(--ok)' }}>
                        {Number(adj.amount) < 0 ? '-' : '+'}${fmt(Math.abs(adj.amount))}
                      </td>
                      <td>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 9999,
                          background: `${color}14`, border: `1px solid ${color}30`, color }}>{adj.status}</span>
                      </td>
                      <td style={{ fontSize: 11, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{adj.reason}</td>
                      <td style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{fmtDate(adj.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 5. COMMENTS ── */}
      <div style={sectionStyle}>
        {sectionHeader('💬', 'Comments & Justification', comments.length)}

        <div>
          <label className="label" style={{ marginBottom: 6, display: 'block' }}>Add Comment / Variance Justification</label>
          <textarea className="input" rows={3}
            placeholder="Add a note, variance justification, or update for the reviewer…"
            value={commentText} onChange={(e) => setCommentText(e.target.value)}
            style={{ resize: 'vertical', marginBottom: 8 }} />
          <button className="btn-primary text-xs"
            disabled={!commentText.trim() || addCommentMutation.isPending}
            onClick={() => addCommentMutation.mutate({ profile_id: profileId, comment: commentText })}>
            <MessageSquare style={{ width: 11, height: 11 }} /> Post Comment
          </button>
        </div>

        {comments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>No comments yet. Start the conversation.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...comments].reverse().map((c, i) => {
              const isMe = c.author_id === currentUser?.id || c.author_username === currentUser?.username
              return (
                <div key={c.id || i} style={{
                  display: 'flex', gap: 10, padding: '10px 12px',
                  background: 'var(--surface-1)', border: '1px solid var(--border-1)', borderRadius: 8,
                  borderLeft: `3px solid ${isMe ? '#FFE600' : 'var(--accent)'}`,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: isMe ? 'rgba(255,230,0,0.15)' : 'rgba(99,102,241,0.15)',
                    border: `2px solid ${isMe ? 'rgba(255,230,0,0.40)' : 'rgba(99,102,241,0.40)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: isMe ? '#FFE600' : 'var(--accent)',
                  }}>
                    {(c.author_username || 'U')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {c.author_username || 'Unknown'}
                        {isMe && <span style={{ fontSize: 9, color: '#FFE600', marginLeft: 5 }}>You</span>}
                      </p>
                      <p style={{ fontSize: 10, color: 'var(--text-disabled)' }}>{fmtDate(c.created_at)}</p>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.55 }}>{c.message}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}

function _unused_placeholder_EvidenceTab({ profileId }) {
  const [dragOver, setDragOver]   = useState(false)
  const [docType,  setDocType]    = useState('supporting')
  const [docName,  setDocName]    = useState('')
  const [file,     setFile]       = useState(null)
  const [uploading,setUploading]  = useState(false)
  const inputRef = useRef()
  const qc = useQueryClient()

  const { data: attachments = [], refetch } = useQuery({
    queryKey: ['profile-attachments', profileId],
    queryFn: () => enterpriseAPI.listAttachments(profileId),
    enabled: Boolean(profileId),
  })

  const handleFileDrop = (e) => {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer?.files?.[0]
    if (f) { setFile(f); setDocName(f.name) }
  }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    try {
      await enterpriseAPI.uploadAttachment(profileId, {
        file, document_type: docType, document_name: docName || file.name,
      })
      toast.success('Evidence uploaded')
      setFile(null); setDocName('')
      qc.invalidateQueries({ queryKey: ['profile-attachments', profileId] })
      refetch()
    } catch (e) { toast.error(e?.response?.data?.detail || 'Upload failed') }
    finally { setUploading(false) }
  }

  const FILE_ICON_COLOR = { pdf: '#ef4444', xlsx: '#22c55e', xls: '#22c55e', csv: '#38bdf8',
    docx: '#6366f1', doc: '#6366f1', png: '#f59e0b', jpg: '#f59e0b', jpeg: '#f59e0b' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Upload area */}
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 12, padding: 18 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>Upload Supporting Evidence</p>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleFileDrop}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? '#FFE600' : file ? 'var(--ok)' : 'var(--border-2)'}`,
            borderRadius: 10, padding: '28px 16px', textAlign: 'center', cursor: 'pointer',
            background: dragOver ? 'rgba(255,230,0,0.04)' : file ? 'rgba(34,197,94,0.04)' : 'var(--surface-1)',
            transition: 'all 200ms', marginBottom: 14,
          }}
        >
          <input ref={inputRef} type="file" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setDocName(f.name) } }} />
          {file ? (
            <>
              <CheckCircle2 style={{ width: 28, height: 28, color: 'var(--ok)', margin: '0 auto 8px' }} />
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--ok)' }}>{file.name}</p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{(file.size / 1024).toFixed(1)} KB · Click to change</p>
            </>
          ) : (
            <>
              <Upload style={{ width: 28, height: 28, color: 'var(--text-tertiary)', margin: '0 auto 8px' }} />
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Drop file here or click to browse</p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>PDF, Excel, CSV, Word, Images supported</p>
            </>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label className="label">Document Type</label>
            <select className="input text-xs" value={docType} onChange={(e) => setDocType(e.target.value)}>
              <option value="supporting">Supporting Document</option>
              <option value="bank_statement">Bank Statement</option>
              <option value="ledger_extract">Ledger Extract</option>
              <option value="reconciliation_report">Reconciliation Report</option>
              <option value="audit_evidence">Audit Evidence</option>
              <option value="variance_explanation">Variance Explanation</option>
              <option value="approval_email">Approval Email</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="label">Document Name</label>
            <input className="input text-xs" value={docName} onChange={(e) => setDocName(e.target.value)}
              placeholder={file?.name || 'Document name'} />
          </div>
        </div>

        <button className="btn-primary text-xs" onClick={handleUpload} disabled={!file || uploading}>
          <Upload style={{ width: 12, height: 12 }} />
          {uploading ? 'Uploading…' : 'Upload Evidence'}
        </button>
      </div>

      {/* Attachment list */}
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 12, padding: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
          Attached Documents ({attachments.length})
        </p>
        {attachments.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', padding: '16px 0' }}>
            No evidence attached yet. Upload documents above.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {attachments.map((att) => {
              const ext   = (att.document_name || att.file_name || '').split('.').pop()?.toLowerCase()
              const color = FILE_ICON_COLOR[ext] || 'var(--accent)'
              return (
                <div key={att.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                  background: 'var(--surface-1)', borderRadius: 8, border: '1px solid var(--border-0)',
                }}>
                  <div style={{ width: 34, height: 34, borderRadius: 7, background: `${color}18`,
                    border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <File style={{ width: 15, height: 15, color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {att.document_name || att.file_name || `Document #${att.id}`}
                    </p>
                    <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
                      {att.document_type?.replace(/_/g,' ')} · {fmtDate(att.created_at)}
                      {att.uploaded_by_username ? ` · ${att.uploaded_by_username}` : ''}
                    </p>
                  </div>
                  {att.download_url && (
                    <a href={att.download_url} target="_blank" rel="noreferrer"
                      style={{ fontSize: 11, fontWeight: 600, color: '#FFE600', textDecoration: 'none' }}>
                      Download
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// VARIANCE TAB — line-by-line variance explanation
// ─────────────────────────────────────────────────────────────
function VarianceTab({ profileId, matchGroups }) {
  const [explanations, setExplanations] = useState({})
  const [saving, setSaving]             = useState(null)
  const qc = useQueryClient()

  const { data: varianceData } = useQuery({
    queryKey: ['profile-variance', profileId],
    queryFn: () => enterpriseAPI.getVariance(profileId),
    enabled: Boolean(profileId),
  })

  const { data: adjustments = [] } = useQuery({
    queryKey: ['profile-adjustments', profileId],
    queryFn: () => enterpriseAPI.listJournalAdjustments(profileId),
    enabled: Boolean(profileId),
  })

  const varLines = useMemo(() => {
    // Build variance lines from unmatched/partial match groups
    const lines = []
    if (varianceData?.line_items?.length) return varianceData.line_items
    ;(matchGroups || []).forEach((mg) => {
      if (mg.classification === 'FULL_MATCH') return
      if (!mg.variance_amount || Number(mg.variance_amount) === 0) return
      lines.push({
        id: mg.id,
        reference: `MG-${mg.id}`,
        description: `${mg.strategy} — ${mg.classification}`,
        variance: Number(mg.variance_amount),
        classification: mg.classification,
        confidence: mg.confidence,
      })
    })
    return lines
  }, [varianceData, matchGroups])

  const totalVariance = varLines.reduce((s, l) => s + Math.abs(l.variance), 0)
  const totalAdjustments = adjustments
    .filter((adj) => ['SUBMITTED', 'APPROVED', 'POSTED'].includes(adj.status))
    .reduce((s, adj) => s + Math.abs(Number(adj.amount || 0)), 0)
  const unexplainedAmount = Math.max(0, totalVariance - totalAdjustments)

  const handleSaveExplanation = async (lineId) => {
    setSaving(lineId)
    try {
      await enterpriseAPI.addComment({ profile_id: profileId, comment: explanations[lineId], context: `variance_line_${lineId}` })
      toast.success('Explanation saved')
      qc.invalidateQueries({ queryKey: ['profile-comments', profileId] })
    } catch (e) { toast.error('Save failed') }
    finally { setSaving(null) }
  }

  const CATEGORY_OPTIONS = [
    'Timing Difference', 'Currency Rounding', 'Accrual Difference',
    'Cut-off Issue', 'Bank Charges', 'In-Transit Items',
    'System Error', 'Duplicate Entry', 'Manual Adjustment', 'Other',
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Summary banner */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        {[
          ['Total Variance',    `$${fmt(totalVariance)}`, totalVariance > 0 ? 'var(--warn)' : 'var(--ok)'],
          ['Variance Lines',    varLines.length,          'var(--text-primary)'],
          ['Unexplained',       `$${fmt(unexplainedAmount)}`, unexplainedAmount > 0 ? 'var(--bad)' : 'var(--ok)'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)',
            borderRadius: 10, padding: '12px 16px' }}>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>{label}</p>
            <p style={{ fontSize: 20, fontWeight: 700, color }}>{val}</p>
          </div>
        ))}
      </div>

      {varLines.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 16px', background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border-1)' }}>
          <CheckCircle2 style={{ width: 32, height: 32, color: 'var(--ok)', margin: '0 auto 10px' }} />
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--ok)' }}>No variances detected</p>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>All transactions are fully matched.</p>
        </div>
      ) : (
        varLines.map((line) => (
          <div key={line.id} style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 12, overflow: 'hidden' }}>
            {/* Line header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              borderBottom: '1px solid var(--border-0)', background: 'var(--surface-1)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'IBM Plex Mono, monospace' }}>
                    {line.reference}
                  </p>
                  <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 9999,
                    background: 'rgba(245,158,11,0.14)', border: '1px solid rgba(245,158,11,0.30)', color: 'var(--warn)', fontWeight: 700 }}>
                    {line.classification}
                  </span>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{line.description}</p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--warn)' }}>${fmt(Math.abs(line.variance))}</p>
                <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>Confidence: {Math.round((line.confidence || 0) * 100)}%</p>
              </div>
            </div>

            {/* Explanation form */}
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="label">Variance Category</label>
                  <select className="input text-xs"
                    value={explanations[`${line.id}_cat`] || ''}
                    onChange={(e) => setExplanations((p) => ({ ...p, [`${line.id}_cat`]: e.target.value }))}>
                    <option value="">Select category…</option>
                    {CATEGORY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Expected Resolution Date</label>
                  <input className="input text-xs" type="date"
                    value={explanations[`${line.id}_date`] || ''}
                    onChange={(e) => setExplanations((p) => ({ ...p, [`${line.id}_date`]: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Explanation *</label>
                <textarea className="input" rows={3} placeholder="Explain the reason for this variance in detail…"
                  value={explanations[line.id] || ''}
                  onChange={(e) => setExplanations((p) => ({ ...p, [line.id]: e.target.value }))}
                  style={{ resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn-primary text-xs" disabled={saving === line.id || !explanations[line.id]}
                  onClick={() => handleSaveExplanation(line.id)}>
                  {saving === line.id ? 'Saving…' : 'Save Explanation'}
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// ADJUSTMENTS TAB — journal adjustments
// ─────────────────────────────────────────────────────────────
function AdjustmentsTab({ profileId }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ account: '', amount: '', currency: 'USD', reason: '', period_key: '' })

  const { data: adjustments = [], refetch } = useQuery({
    queryKey: ['profile-adjustments', profileId],
    queryFn: () => enterpriseAPI.listJournalAdjustments(profileId),
    enabled: Boolean(profileId),
  })

  const { data: varianceData } = useQuery({
    queryKey: ['profile-variance', profileId],
    queryFn: () => enterpriseAPI.getVariance(profileId),
    enabled: Boolean(profileId),
  })

  const createMutation = useMutation({
    mutationFn: (payload) => enterpriseAPI.createJournal(payload),
    onSuccess: () => {
      toast.success('Adjustment created')
      setShowForm(false)
      setForm({ account: '', amount: '', currency: 'USD', reason: '', period_key: '' })
      refetch()
    },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Failed to create adjustment'),
  })

  const STATUS_COLOR = {
    DRAFT: 'var(--text-tertiary)', SUBMITTED: 'var(--warn)',
    APPROVED: 'var(--ok)', POSTED: 'var(--ok)', REJECTED: 'var(--bad)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          Journal Adjustments ({adjustments.length})
        </p>
        {canCreateAdjustments && (
          <button className="btn-primary text-xs h-8" onClick={() => {
            if (showForm) {
              setShowForm(false)
            } else {
              setShowForm(true)
              if (varianceData) {
                setForm({
                  account: '',
                  amount: String(varianceData.total_variance || ''),
                  currency: 'USD',
                  reason: `Adjustment for variance of $${fmt(varianceData.total_variance || 0)}`,
                  period_key: varianceData.period || '2026-07',
                })
              }
            }
          }}>
            <Plus style={{ width: 12, height: 12 }} /> New Adjustment
          </button>
        )}
      </div>

      {/* Create form */}
      {canCreateAdjustments && showForm && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 12, padding: 18 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>New Journal Adjustment</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label className="label">Account</label>
              <input className="input text-xs" placeholder="e.g. 10100"
                value={form.account} onChange={(e) => setForm((p) => ({ ...p, account: e.target.value }))} />
            </div>
            <div>
              <label className="label">Amount</label>
              <input className="input text-xs" type="number" placeholder="0.00"
                value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} />
            </div>
            <div>
              <label className="label">Currency</label>
              <select className="input text-xs" value={form.currency}
                onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}>
                {['USD','EUR','GBP','JPY','CAD','AUD','CHF','SGD','INR'].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label className="label">Period</label>
              <input className="input text-xs" placeholder="e.g. 2025-06"
                value={form.period_key} onChange={(e) => setForm((p) => ({ ...p, period_key: e.target.value }))} />
            </div>
            <div>
              <label className="label">Reason *</label>
              <input className="input text-xs" placeholder="Reason for adjustment"
                value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn-secondary text-xs" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn-primary text-xs"
              disabled={createMutation.isPending || !form.account || !form.amount || !form.reason}
              onClick={() => createMutation.mutate({ profile_id: profileId, ...form, amount: Number(form.amount) })}>
              {createMutation.isPending ? 'Creating…' : 'Create Adjustment'}
            </button>
          </div>
        </div>
      )}

      {/* Adjustments list */}
      {adjustments.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center', padding: '32px 16px', background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border-1)' }}>
          <DollarSign style={{ width: 28, height: 28, color: 'var(--text-tertiary)', margin: '0 auto 10px' }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>No adjustments yet</p>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>Create journal adjustments to correct variances.</p>
        </div>
      ) : (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 12, overflow: 'hidden' }}>
          <table className="data-table" style={{ borderRadius: 0 }}>
            <thead>
              <tr><th>ID</th><th>Account</th><th>Period</th><th>Amount</th><th>Currency</th><th>Status</th><th>Reason</th><th>Created</th></tr>
            </thead>
            <tbody>
              {adjustments.map((adj) => {
                const color = STATUS_COLOR[adj.status] || 'var(--text-tertiary)'
                return (
                  <tr key={adj.id}>
                    <td style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}>#{adj.id}</td>
                    <td style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}>{adj.account}</td>
                    <td style={{ fontSize: 11 }}>{adj.period_key}</td>
                    <td style={{ fontSize: 12, fontWeight: 600, color: Number(adj.amount) < 0 ? 'var(--bad)' : 'var(--ok)' }}>
                      {Number(adj.amount) < 0 ? '-' : '+'}${fmt(Math.abs(adj.amount))}
                    </td>
                    <td style={{ fontSize: 11 }}>{adj.currency}</td>
                    <td>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 9999,
                        background: `${color}14`, border: `1px solid ${color}30`, color }}>
                        {adj.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 11, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{adj.reason}</td>
                    <td style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>{fmtDate(adj.created_at)}</td>
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
// COMMENTS TAB — threaded discussion
// ─────────────────────────────────────────────────────────────
function CommentsTab({ profileId, currentUser }) {
  const [text, setText] = useState('')
  const qc = useQueryClient()

  const { data: comments = [], refetch } = useQuery({
    queryKey: ['profile-comments', profileId],
    queryFn: () => enterpriseAPI.listComments(profileId),
    enabled: Boolean(profileId),
  })

  const addMutation = useMutation({
    mutationFn: (payload) => enterpriseAPI.addComment(payload),
    onSuccess: () => { toast.success('Comment added'); setText(''); refetch() },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Comment failed'),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Compose */}
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 12, padding: 16 }}>
        <label className="label" style={{ marginBottom: 8, display: 'block' }}>Add Comment</label>
        <textarea className="input" rows={3} placeholder="Add a note, question, or update for the reviewer…"
          value={text} onChange={(e) => setText(e.target.value)}
          style={{ resize: 'vertical', marginBottom: 10 }} />
        <button className="btn-primary text-xs" disabled={!text.trim() || addMutation.isPending}
          onClick={() => addMutation.mutate({ profile_id: profileId, comment: text })}>
          <MessageSquare style={{ width: 12, height: 12 }} /> Post Comment
        </button>
      </div>

      {/* Thread */}
      {comments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px', background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border-1)' }}>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No comments yet. Start the conversation.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...comments].reverse().map((c, i) => {
            const isMe = c.author_id === currentUser?.id || c.author_username === currentUser?.username
            return (
              <div key={c.id || i} style={{
                display: 'flex', gap: 10, padding: '12px 14px',
                background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10,
                borderLeft: `3px solid ${isMe ? '#FFE600' : 'var(--accent)'}`,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: isMe ? 'rgba(255,230,0,0.15)' : 'rgba(99,102,241,0.15)',
                  border: `2px solid ${isMe ? 'rgba(255,230,0,0.40)' : 'rgba(99,102,241,0.40)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: isMe ? '#FFE600' : 'var(--accent)',
                }}>
                  {(c.author_username || 'U')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {c.author_username || 'Unknown'}
                      {isMe && <span style={{ fontSize: 10, color: '#FFE600', marginLeft: 6 }}>You</span>}
                    </p>
                    <p style={{ fontSize: 10.5, color: 'var(--text-disabled)' }}>{fmtDate(c.created_at)}</p>
                  </div>
                  <p style={{ fontSize: 12.5, color: 'var(--text-primary)', lineHeight: 1.55 }}>{c.message}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// SUBMIT TAB
// ─────────────────────────────────────────────────────────────
function SubmitTab({ cert, profileSummary, certActionMutation, justification, setJustification }) {
  const canSubmit = cert && ['OPEN', 'PREPARED', 'REJECTED'].includes(cert.status || '')
  return (
    <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Status banner */}
      <div style={{
        padding: '12px 16px', borderRadius: 10,
        background: canSubmit ? 'rgba(255,230,0,0.06)' : 'var(--surface-2)',
        border: `1px solid ${canSubmit ? 'rgba(255,230,0,0.25)' : 'var(--border-1)'}`,
        fontSize: 12.5, color: canSubmit ? '#FFE600' : 'var(--text-secondary)',
      }}>
        {canSubmit
          ? '✓ Ready to submit for reviewer approval.'
          : `Current status: "${cert?.status || 'No workflow'}" — cannot submit at this stage.`}
      </div>

      {/* Match summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
        {[
          ['Total Groups', profileSummary.total,     'var(--text-primary)'],
          ['Full Match',   profileSummary.full,      'var(--ok)'],
          ['Partial',      profileSummary.partial,   'var(--warn)'],
          ['Unmatched',    profileSummary.unmatched, 'var(--bad)'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px', textAlign: 'center', border: '1px solid var(--border-1)' }}>
            <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4 }}>{label}</p>
            <p style={{ fontSize: 18, fontWeight: 700, color }}>{val}</p>
          </div>
        ))}
      </div>

      {/* Justification */}
      <div>
        <label className="label" style={{ marginBottom: 6, display: 'block' }}>Preparer Justification *</label>
        <textarea className="input" rows={6}
          placeholder="Describe:&#10;1. What was reconciled and for which period&#10;2. How exceptions were investigated and resolved&#10;3. Any variances and their explanations&#10;4. Evidence attached in support of this reconciliation"
          value={justification} onChange={(e) => setJustification(e.target.value)}
          disabled={!canSubmit} style={{ resize: 'vertical' }} />
        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{justification.length} characters</p>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-primary"
          onClick={() => certActionMutation.mutate({ workflow_id: cert?.id, action: 'SUBMIT', comments: justification })}
          disabled={!canSubmit || certActionMutation.isPending || !justification.trim()}>
          {certActionMutation.isPending
            ? 'Submitting…'
            : <><Send style={{ width: 13, height: 13 }} /> Submit for Review</>}
        </button>
        <button className="btn-ghost btn-sm" onClick={() => setJustification('')}>Clear</button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────
const TABS = [
  { id: 'home',               label: 'Home',               Icon: Home },
  { id: 'matching',           label: 'Matching',           Icon: GitMerge },
  { id: 'exceptions',         label: 'Exceptions',         Icon: AlertTriangle },
  { id: 'variance-workbench', label: 'Variance & Evidence', Icon: BarChart2 },
  { id: 'history',            label: 'History',            Icon: Clock },
  { id: 'submit',             label: 'Submit',             Icon: Send },
]

export default function PreparerWorkbench() {
  const { projectId } = useParams()
  const { setHeaderOverride } = useOutletContext() || {}
  const user         = useAuthStore((s) => s.user)
  const role         = normalizeRole(user?.role)
  const canCreateAdjustments = role === 'preparer'
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId)
  const qc           = useQueryClient()
  const isLegacyMode = Boolean(projectId)

  const [selectedProfileId, setSelectedProfileId] = useState(() => {
    // Support ?profile=<id> deep-link from Executive Dashboard "View Ledger" buttons
    try {
      const sp = new URLSearchParams(window.location.search)
      const pid = sp.get('profile')
      return pid ? Number(pid) : null
    } catch { return null }
  })
  const [activeTab,          setActiveTab]         = useState('home')
  const [justification,      setJustification]     = useState('')

  // Sync ?profile= search param changes (e.g. browser back/forward)
  const [searchParams] = useSearchParams()
  useEffect(() => {
    const pid = searchParams.get('profile')
    if (pid) setSelectedProfileId(Number(pid))
  }, [searchParams])

  // ── Data fetching ───────────────────────────────────────────
  const { data: profiles = [], isLoading: profLoading } = useQuery({
    queryKey: ['enterprise-profiles', selectedProjectId || 'all'],
    queryFn: () => enterpriseAPI.listProfiles(selectedProjectId ? Number(selectedProjectId) : undefined),
    enabled: !isLegacyMode,
  })
  const { data: allCerts = [] } = useQuery({
    queryKey: ['cert-workflows-all'],
    queryFn: () => enterpriseAPI.listCertificationWorkflows(),
    enabled: !isLegacyMode,
  })
  const { data: dashboard } = useQuery({
    queryKey: ['preparer-dashboard-stats', selectedProjectId || 'all'],
    queryFn: () => enterpriseAPI.getDashboardStats(selectedProjectId ? Number(selectedProjectId) : undefined),
    enabled: !isLegacyMode,
  })

  const myProfiles = useMemo(() => {
    if (isLegacyMode) return []
    const scopedProfiles = selectedProjectId
      ? profiles.filter((p) => String(p.project_id || '') === String(selectedProjectId))
      : profiles
    return scopedProfiles.filter((p) =>
      !user || p.assigned_preparer === user.id || ['admin','preparer'].includes(role)
    )
  }, [profiles, user, role, isLegacyMode, selectedProjectId])

  useEffect(() => {
    if (myProfiles.length > 0 && (!selectedProfileId || !myProfiles.some((p) => p.id === selectedProfileId))) {
      setSelectedProfileId(myProfiles[0].id)
    }
  }, [myProfiles, selectedProfileId])

  const selectedProfile = useMemo(() => myProfiles.find((p) => p.id === selectedProfileId) || null, [myProfiles, selectedProfileId])
  const selectedCert    = useMemo(() => allCerts.find((c) => c.profile_id === selectedProfileId) || null, [allCerts, selectedProfileId])

  useEffect(() => {
    if (setHeaderOverride && !isLegacyMode) {
      setHeaderOverride(
        <header className="bl-header" style={{ padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56, width: '100%' }}>
          {/* Left section: My Work / My Reconciliations */}
          <div className="flex flex-col min-w-0 flex-shrink-0" style={{ textAlign: 'left' }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-tertiary)', lineHeight: 1, fontFamily: 'Inter, sans-serif', margin: 0 }}>
              My Work
            </p>
            <h1 className="bl-header-title" style={{ marginTop: 2, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '2px 0 0' }}>
              My Reconciliations
            </h1>
          </div>

          {/* Middle section: Profile Selector */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '0 20px' }}>
            <select
              value={selectedProfileId || ''}
              onChange={(e) => {
                const val = e.target.value ? Number(e.target.value) : null
                setSelectedProfileId(val)
                setActiveTab('home')
              }}
              style={{
                background: 'var(--surface-2)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-2)',
                borderRadius: 'var(--r-md)',
                padding: '6px 12px',
                fontSize: 13,
                fontWeight: 500,
                outline: 'none',
                cursor: 'pointer',
                minWidth: 320,
                maxWidth: 450,
                textAlign: 'center',
                textAlignLast: 'center',
              }}
            >
              <option value="" disabled>Select a profile...</option>
              {myProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Right section: Date, Search, Notification bell */}
          <div className="flex items-center gap-3">
            {/* Date badge */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '0 10px', height: 28,
              background: 'var(--surface-2)', border: '1px solid var(--border-1)',
              borderRadius: 'var(--r-md)', fontSize: 12, fontWeight: 500,
              color: 'var(--text-secondary)',
            }}>
              <CalendarCheck2 style={{ width: 12, height: 12 }} />
              {new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })}
            </div>

            {/* Global search */}
            <div className="global-search hidden lg:block" style={{ width: 180 }}>
              <Search className="global-search-icon" style={{ width: 12, height: 12 }} />
              <input className="input h-[26px] text-[12px]" placeholder="Search..." />
            </div>

            {/* Notifications */}
            <NotificationCenter floating={false} />
          </div>
        </header>
      )
    }
    return () => setHeaderOverride?.(null)
  }, [setHeaderOverride, isLegacyMode, selectedProfileId, myProfiles, setSelectedProfileId, setActiveTab])



  const { data: matchGroupsData } = useQuery({
    queryKey: ['profile-groups', selectedProfileId],
    queryFn: () => matchingAPI.profileGroups(Number(selectedProfileId)),
    enabled: Boolean(selectedProfileId) && !isLegacyMode,
  })
  const matchGroups = matchGroupsData?.groups || []
  const { data: allExceptions = [] } = useQuery({
    queryKey: ['exceptions-profile', selectedProfileId],
    queryFn: () => advancedAPI.exceptionsWithProfile({ profile_id: selectedProfileId }),
    enabled: Boolean(selectedProfileId) && !isLegacyMode,
  })
  const { data: closeTasks = [], refetch: refetchTasks } = useQuery({
    queryKey: ['close-tasks', selectedProfileId],
    queryFn: () => enterpriseExtAPI.listCloseTasks({ profile_id: selectedProfileId }),
    enabled: Boolean(selectedProfileId) && !isLegacyMode,
  })
  const { data: certHistory = [] } = useQuery({
    queryKey: ['cert-history', selectedCert?.id],
    queryFn: () => enterpriseAPI.getCertificationWorkflowHistory(selectedCert.id),
    enabled: Boolean(selectedCert?.id),
  })
  const { data: varianceData } = useQuery({
    queryKey: ['profile-variance', selectedProfileId],
    queryFn: async () => { try { return await enterpriseAPI.getVariance(selectedProfileId) } catch { return null } },
    enabled: Boolean(selectedProfileId),
  })

  const certActionMutation = useMutation({
    mutationFn: (payload) => enterpriseAPI.actionCertificationWorkflow(payload),
    onSuccess: () => {
      toast.success('Submitted for review')
      qc.invalidateQueries({ queryKey: ['cert-workflows-all'] })
      setJustification('')
    },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Action failed'),
  })

  const handleTaskUpdate = async (taskId, data) => {
    try { await enterpriseExtAPI.updateCloseTask(taskId, data); toast.success('Task updated'); refetchTasks() }
    catch { toast.error('Update failed') }
  }

  const profileSummary = useMemo(() => {
    const arr      = Array.isArray(matchGroups) ? matchGroups : []
    const full     = arr.filter((m) => m.classification === 'FULL_MATCH').length
    const partial  = arr.filter((m) => m.classification === 'PARTIAL_MATCH').length
    const unmatched = arr.filter((m) => m.classification === 'UNMATCHED').length
    return { total: arr.length, full, partial, unmatched, exceptions: allExceptions.length }
  }, [matchGroups, allExceptions])

  // Compute tab badges
  const tabBadges = {
    matching:    profileSummary.total > 0 ? profileSummary.total : null,
    exceptions:  allExceptions.filter((e) => !['RESOLVED','CLOSED'].includes(e.status||'')).length || null,
    adjustments: null,
  }

  // Computed dynamic KPIs for horizontal bar
  const assignedCount = myProfiles.length
  
  const pendingCount = useMemo(() => {
    return myProfiles.filter((p) => {
      const cert = allCerts.find((c) => c.profile_id === p.id)
      return cert && ['SUBMITTED', 'UNDER_REVIEW'].includes(cert.status)
    }).length
  }, [myProfiles, allCerts])

  const rejectedCount = useMemo(() => {
    return myProfiles.filter((p) => {
      const cert = allCerts.find((c) => c.profile_id === p.id)
      return cert && cert.status === 'REJECTED'
    }).length
  }, [myProfiles, allCerts])

  const matchRateText = useMemo(() => {
    if (selectedProfile && matchGroups.length > 0) {
      const fullMatches = matchGroups.filter(mg => mg.classification === 'FULL_MATCH').length
      return `${(fullMatches / matchGroups.length * 100).toFixed(2)}%`
    }
    return dashboard ? `${dashboard.auto_match_pct ?? 0}%` : '100.00%'
  }, [selectedProfile, matchGroups, dashboard])

  // ── Legacy fallback ─────────────────────────────────────────
  if (isLegacyMode) return (
    <div className="h-full flex flex-col">
      <PageHeader title="Preparer Workbench" subtitle={`Project #${projectId} — legacy mode`} />
      <div className="flex-1 overflow-auto p-5">
        <div style={{ background: 'var(--warn-bg)', border: '1px solid var(--warn-bdr)', borderRadius: 10, padding: 16 }}>
          <p style={{ fontSize: 12, color: 'var(--warn)' }}>
            Legacy mode. Promote your execution to an enterprise profile for the full preparer workspace.
          </p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="h-full flex flex-col">

      {/* ── Merged KPIs and Selected Profile Header Bar ── */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 24px', borderBottom: '1px solid var(--border-1)',
        background: 'var(--surface-2)', gap: 16, flexWrap: 'wrap'
      }}>
        {/* Left side: Selected Profile details */}
        {!selectedProfile ? (
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', margin: 0 }}>
              Select a reconciliation profile from the dropdown above to begin work.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <p style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {selectedProfile.name}
            </p>
            <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--text-tertiary)', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ textTransform: 'capitalize' }}>{(selectedProfile.reconciliation_type || '').toLowerCase().replace(/_/g, ' ')}</span>
              <span style={{ color: RISK_COLOR[(selectedProfile.risk_classification||'').toUpperCase()] || 'var(--warn)', fontWeight: 700 }}>
                {selectedProfile.risk_classification}
              </span>
              {selectedCert && <CertBadge status={selectedCert.status} />}
              {selectedCert?.due_date && <span>Due {selectedCert.due_date}</span>}
              <span style={{ color: 'var(--border-2)' }}>|</span>
              <span style={{ color: 'var(--ok)', fontWeight: 600 }}>✓ {profileSummary.full}</span>
              <span style={{ color: 'var(--warn)', fontWeight: 600 }}>~ {profileSummary.partial}</span>
              <span style={{ color: 'var(--bad)', fontWeight: 600 }}>✗ {profileSummary.unmatched}</span>
              <span style={{ color: 'var(--bad)', fontWeight: 600 }}>⚠ {profileSummary.exceptions} exc</span>
            </div>
          </div>
        )}

        {/* Right side: Horizontal KPIs */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {[
            ['Assigned',     assignedCount, '#FFE600'],
            ['Pending',      pendingCount,  'var(--warn)'],
            ['Rejected',     rejectedCount, 'var(--bad)'],
            ['Match Rate',   matchRateText, 'var(--ok)'],
          ].map(([label, val, color]) => (
            <div key={label} style={{
              background: 'var(--surface-3)', borderRadius: 7, padding: '5px 12px',
              display: 'flex', flexDirection: 'column', minWidth: 90,
              border: '1px solid var(--border-1)', alignItems: 'center'
            }}>
              <p style={{ fontSize: 8.5, color: 'var(--text-tertiary)', textTransform: 'uppercase', margin: 0 }}>{label}</p>
              <p style={{ fontSize: 13.5, fontWeight: 700, color, margin: '1px 0 0' }}>{val}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Main content ─────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selectedProfile ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <EmptyState title="Select a profile" description="Choose a reconciliation from the dropdown above." />
            </div>
          ) : (
            <>

              {/* Tab bar */}
              <div style={{
                display: 'flex', gap: 0, overflowX: 'auto', flexShrink: 0,
                background: 'var(--surface-1)', borderBottom: '1px solid var(--border-1)',
                padding: '0 4px',
              }} className="slim-scroll">
                {TABS.map(({ id, label, Icon }) => {
                  const isActive = activeTab === id
                  const badge    = tabBadges[id]
                  return (
                    <button key={id} onClick={() => setActiveTab(id)} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '10px 14px', fontSize: 12, fontWeight: isActive ? 700 : 500,
                      color: isActive ? '#FFE600' : 'var(--text-tertiary)',
                      background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                      borderBottom: `2px solid ${isActive ? '#FFE600' : 'transparent'}`,
                      transition: 'color 120ms, border-color 120ms',
                      position: 'relative',
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--text-primary)' }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--text-tertiary)' }}
                    >
                      <Icon style={{ width: 12, height: 12 }} />
                      {label}
                      {badge > 0 && (
                        <span style={{
                          fontSize: 9, fontWeight: 800, minWidth: 16, height: 16, padding: '0 3px',
                          borderRadius: 9999, background: id === 'exceptions' ? 'var(--bad)' : 'var(--accent)',
                          color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        }}>{badge}</span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Tab content */}
              <div style={{ flex: 1, overflow: 'auto', padding: 20 }} className="slim-scroll">

                {activeTab === 'home' && (
                  <HomeTab
                    profile={selectedProfile} cert={selectedCert}
                    matchGroups={matchGroups} exceptions={allExceptions}
                    closeTasks={closeTasks} varianceData={varianceData}
                    onUpdateTask={handleTaskUpdate}
                    onTabChange={setActiveTab}
                  />
                )}

                {activeTab === 'matching' && (
                  <MatchingTab
                    profileId={selectedProfileId}
                    matchGroups={matchGroups}
                    onRefresh={() => qc.invalidateQueries({ queryKey: ['profile-groups', selectedProfileId] })}
                  />
                )}

                {activeTab === 'exceptions' && (
                  <ExceptionsTabPanel
                    exceptions={allExceptions}
                    profileId={selectedProfileId}
                    onRefresh={() => qc.invalidateQueries({ queryKey: ['exceptions-profile', selectedProfileId] })}
                  />
                )}

                {activeTab === 'variance-workbench' && <VarianceWorkbenchTab profileId={selectedProfileId} matchGroups={matchGroups} currentUser={user} />}

                {activeTab === 'history' && (
                  certHistory.length === 0 ? (
                    <EmptyState title="No history yet" description="Workflow actions appear here." />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      {certHistory.map((h, i) => (
                        <div key={i} style={{ display: 'flex', gap: 14, padding: '12px 0', borderBottom: i < certHistory.length - 1 ? '1px solid var(--border-0)' : 'none' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FFE600', marginTop: 3 }} />
                            {i < certHistory.length - 1 && <div style={{ width: 2, flex: 1, background: 'var(--border-1)', marginTop: 4 }} />}
                          </div>
                          <div style={{ paddingBottom: 8 }}>
                            <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                              {h.action} <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>by {h.actor_role}</span>
                            </p>
                            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                              {h.from_status} → {h.to_status}
                              {h.comments ? <em style={{ marginLeft: 8 }}>"{h.comments}"</em> : ''}
                            </p>
                            <p style={{ fontSize: 10.5, color: 'var(--text-disabled)', marginTop: 2 }}>{fmtDate(h.created_at)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {activeTab === 'submit' && (
                  <SubmitTab
                    cert={selectedCert} profileSummary={profileSummary}
                    certActionMutation={certActionMutation}
                    justification={justification} setJustification={setJustification}
                  />
                )}

              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
