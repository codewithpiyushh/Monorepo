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
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Home, GitMerge, AlertTriangle, Paperclip, BarChart2,
  BookOpen, MessageSquare, Clock, Send, ChevronDown,
  ChevronUp, Upload, X, File, CheckCircle2, Plus,
  RefreshCw, DollarSign, Layers, ShieldAlert,
} from 'lucide-react'
import { enterpriseAPI, workflowAPI } from '../api'
import { enterpriseExtAPI, advancedAPI } from '../api'
import { useAuthStore } from '../store/authStore'
import { useProjectStore } from '../store/projectStore'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, LoadingState } from '../components/ui/PageState'

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
        <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'var(--text-disabled)', marginBottom: 8, fontWeight: 700 }}>
          MY ASSIGNED RECONCILIATION
        </p>
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
              {dueSoon.slice(0, 3).map((t) => (
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
              : closeTasks.slice(0, 5).map((t) => {
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
// EVIDENCE TAB — upload documents, list attachments
// ─────────────────────────────────────────────────────────────
function EvidenceTab({ profileId }) {
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
          ['Unexplained',       varLines.filter((l) => !explanations[l.id]).length, 'var(--bad)'],
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
        <button className="btn-primary text-xs h-8" onClick={() => setShowForm((v) => !v)}>
          <Plus style={{ width: 12, height: 12 }} /> New Adjustment
        </button>
      </div>

      {/* Create form */}
      {showForm && (
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
  { id: 'home',        label: 'Home',        Icon: Home },
  { id: 'matching',    label: 'Matching',    Icon: GitMerge },
  { id: 'exceptions',  label: 'Exceptions',  Icon: AlertTriangle },
  { id: 'evidence',    label: 'Evidence',    Icon: Paperclip },
  { id: 'variance',    label: 'Variance',    Icon: BarChart2 },
  { id: 'adjustments', label: 'Adjustments', Icon: BookOpen },
  { id: 'comments',    label: 'Comments',    Icon: MessageSquare },
  { id: 'history',     label: 'History',     Icon: Clock },
  { id: 'submit',      label: 'Submit',      Icon: Send },
]

export default function PreparerWorkbench() {
  const { projectId } = useParams()
  const user         = useAuthStore((s) => s.user)
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId)
  const qc           = useQueryClient()
  const isLegacyMode = Boolean(projectId)

  const [selectedProfileId, setSelectedProfileId] = useState(null)
  const [activeTab,          setActiveTab]         = useState('home')
  const [justification,      setJustification]     = useState('')

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
    queryKey: ['preparer-dashboard'],
    queryFn: () => { try { return enterpriseAPI.preparerDashboard() } catch { return null } },
  })

  const myProfiles = useMemo(() => {
    if (isLegacyMode) return []
    const scopedProfiles = selectedProjectId
      ? profiles.filter((p) => String(p.project_id || '') === String(selectedProjectId))
      : profiles
    return scopedProfiles.filter((p) =>
      !user || p.assigned_preparer === user.id || ['admin','preparer'].includes(user?.role)
    )
  }, [profiles, user, isLegacyMode, selectedProjectId])

  useEffect(() => {
    if (myProfiles.length > 0 && (!selectedProfileId || !myProfiles.some((p) => p.id === selectedProfileId))) {
      setSelectedProfileId(myProfiles[0].id)
    }
  }, [myProfiles, selectedProfileId])

  const selectedProfile = useMemo(() => myProfiles.find((p) => p.id === selectedProfileId) || null, [myProfiles, selectedProfileId])
  const selectedCert    = useMemo(() => allCerts.find((c) => c.profile_id === selectedProfileId) || null, [allCerts, selectedProfileId])

  const { data: matchGroups = [] } = useQuery({
    queryKey: ['profile-transactions', selectedProfileId],
    queryFn: () => advancedAPI.profileTransactions(Number(selectedProfileId)),
    enabled: Boolean(selectedProfileId) && !isLegacyMode,
  })
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
      <PageHeader
        title="My Reconciliations"
        subtitle="Prepare, match, explain variances and submit for review."
        badge={`${myProfiles.length} assigned`}
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Sidebar ──────────────────────────────────────── */}
        <div style={{
          width: 260, flexShrink: 0, borderRight: '1px solid var(--border-1)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--surface-1)',
        }}>
          {/* Dashboard KPIs */}
          {dashboard && (
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-0)' }}>
              <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'var(--text-disabled)', marginBottom: 8 }}>
                MY DASHBOARD
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  ['Assigned',     dashboard.assigned_tasks    ?? myProfiles.length, '#FFE600'],
                  ['Pending',      dashboard.pending_submissions ?? 0,               'var(--warn)'],
                  ['Rejected',     dashboard.rejected_items    ?? 0,                 'var(--bad)'],
                  ['Match Rate',   `${dashboard.auto_match_pct ?? 0}%`,             'var(--ok)'],
                ].map(([label, val, color]) => (
                  <div key={label} style={{ background: 'var(--surface-2)', borderRadius: 7, padding: '7px 10px' }}>
                    <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{label}</p>
                    <p style={{ fontSize: 16, fontWeight: 700, color }}>{val}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Profile list */}
          <div style={{ flex: 1, overflow: 'auto', padding: '8px' }} className="slim-scroll">
            <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'var(--text-disabled)', padding: '4px 6px 8px', fontWeight: 700 }}>
              MY PROFILES ({myProfiles.length})
            </p>
            {profLoading ? <LoadingState /> : myProfiles.length === 0 ? (
              <EmptyState title="No profiles assigned" description="No profiles assigned to you as preparer." />
            ) : myProfiles.map((p) => (
              <ProfileItem key={p.id} profile={p} cert={allCerts.find((c) => c.profile_id === p.id)}
                isSelected={selectedProfileId === p.id} onSelect={(id) => { setSelectedProfileId(id); setActiveTab('home') }} />
            ))}
          </div>
        </div>

        {/* ── Main content ─────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selectedProfile ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <EmptyState title="Select a profile" description="Choose a reconciliation from the left panel." />
            </div>
          ) : (
            <>
              {/* Profile header */}
              <div style={{
                padding: '10px 20px', background: 'var(--surface-2)',
                borderBottom: '1px solid var(--border-1)', flexShrink: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{selectedProfile.name}</p>
                    <div style={{ display: 'flex', gap: 10, marginTop: 3, fontSize: 11, color: 'var(--text-tertiary)', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span>{(selectedProfile.reconciliation_type || '').replace(/_/g, ' ')}</span>
                      <span style={{ color: RISK_COLOR[(selectedProfile.risk_classification||'').toUpperCase()] || 'var(--warn)', fontWeight: 700 }}>
                        {selectedProfile.risk_classification}
                      </span>
                      {selectedCert && <CertBadge status={selectedCert.status} />}
                      {selectedCert?.due_date && <span>Due {selectedCert.due_date}</span>}
                    </div>
                  </div>
                  {/* Quick stats */}
                  <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                    <span style={{ color: 'var(--ok)', fontWeight: 600 }}>✓ {profileSummary.full}</span>
                    <span style={{ color: 'var(--warn)', fontWeight: 600 }}>~ {profileSummary.partial}</span>
                    <span style={{ color: 'var(--bad)', fontWeight: 600 }}>✗ {profileSummary.unmatched}</span>
                    <span style={{ color: 'var(--bad)', fontWeight: 600 }}>⚠ {profileSummary.exceptions} exc</span>
                  </div>
                </div>
              </div>

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
                  Array.isArray(matchGroups) && matchGroups.length === 0 ? (
                    <EmptyState title="No match groups" description="Run matching from the Transaction Matching Workspace to populate this view." />
                  ) : (
                    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 12, overflow: 'hidden' }}>
                      <table className="data-table" style={{ borderRadius: 0 }}>
                        <thead>
                          <tr><th>ID</th><th>Classification</th><th>Strategy</th><th>Confidence</th><th>Variance</th><th>Records</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                          {(Array.isArray(matchGroups) ? matchGroups : []).map((mg) => {
                            const cc = { FULL_MATCH: 'var(--ok)', PARTIAL_MATCH: 'var(--warn)', UNMATCHED: 'var(--bad)' }
                            const c  = cc[mg.classification] || 'var(--text-tertiary)'
                            return (
                              <tr key={mg.id}>
                                <td style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}>#{mg.id}</td>
                                <td><span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 9999, background: `${c}14`, border: `1px solid ${c}33`, color: c }}>{mg.classification}</span></td>
                                <td style={{ fontSize: 11 }}>{mg.strategy}</td>
                                <td style={{ fontSize: 12, fontWeight: 600, color: mg.confidence >= 0.95 ? 'var(--ok)' : mg.confidence >= 0.7 ? 'var(--warn)' : 'var(--bad)' }}>
                                  {Math.round((mg.confidence || 0) * 100)}%
                                </td>
                                <td style={{ fontSize: 12, color: mg.variance_amount > 0 ? 'var(--warn)' : 'var(--ok)' }}>
                                  {mg.variance_amount > 0 ? `$${Number(mg.variance_amount).toFixed(2)}` : '—'}
                                </td>
                                <td style={{ fontSize: 11 }}>{mg.item_count || 0}</td>
                                <td style={{ fontSize: 10, color: mg.reconciled ? 'var(--ok)' : 'var(--text-tertiary)' }}>
                                  {mg.reconciled ? '✓ Reconciled' : '— Pending'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                )}

                {activeTab === 'exceptions' && (
                  allExceptions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 16px' }}>
                      <CheckCircle2 style={{ width: 32, height: 32, color: 'var(--ok)', margin: '0 auto 10px' }} />
                      <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--ok)' }}>No open exceptions</p>
                    </div>
                  ) : (
                    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 12, overflow: 'hidden' }}>
                      <table className="data-table" style={{ borderRadius: 0 }}>
                        <thead><tr><th>ID</th><th>Status</th><th>Queue</th><th>Classification</th><th>Variance</th><th>Comments</th></tr></thead>
                        <tbody>
                          {allExceptions.map((exc) => {
                            const sc = { OPEN: 'var(--bad)', IN_PROGRESS: 'var(--warn)', RESOLVED: 'var(--ok)', ESCALATED: '#c026d3' }
                            const c  = sc[exc.status] || 'var(--text-tertiary)'
                            return (
                              <tr key={exc.id}>
                                <td style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}>#{exc.id}</td>
                                <td><span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 9999, background: `${c}14`, border: `1px solid ${c}33`, color: c }}>{exc.status}</span></td>
                                <td style={{ fontSize: 11 }}>{exc.queue_type}</td>
                                <td style={{ fontSize: 11 }}>{exc.classification || exc.mg_classification || '—'}</td>
                                <td style={{ fontSize: 11, color: exc.mg_variance > 0 ? 'var(--warn)' : 'var(--text-tertiary)' }}>
                                  {exc.mg_variance > 0 ? `$${Number(exc.mg_variance).toFixed(2)}` : '—'}
                                </td>
                                <td style={{ fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exc.comments || '—'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                )}

                {activeTab === 'evidence'    && <EvidenceTab    profileId={selectedProfileId} />}
                {activeTab === 'variance'    && <VarianceTab    profileId={selectedProfileId} matchGroups={matchGroups} />}
                {activeTab === 'adjustments' && <AdjustmentsTab profileId={selectedProfileId} />}
                {activeTab === 'comments'    && <CommentsTab    profileId={selectedProfileId} currentUser={user} />}

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
