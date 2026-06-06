import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { enterpriseAPI } from '../api'
import toast from 'react-hot-toast'

function parseJsonSafe(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export default function EnterpriseOps() {
  const qc = useQueryClient()
  const [sourceSystem, setSourceSystem] = useState('ERP')
  const [metadataText, setMetadataText] = useState('{"file_name":"sample.csv","period":"2026-04"}')
  const [recordsText, setRecordsText] = useState('[{"entity":"E1","account":"A1","period":"2026-04","currency":"USD","amount":1000,"reference":"REF1","date":"2026-04-02"},{"entity":"E1","account":"A1","period":"2026-04","currency":"USD","amount":-1000,"reference":"REF1","date":"2026-04-02"}]')
  const [batchId, setBatchId] = useState('')

  const [profileForm, setProfileForm] = useState({
    name: 'Monthly GL Reconciliation',
    reconciliation_type: 'TRANSACTION',
    frequency: 'MONTHLY',
    tolerance_threshold: 0.0,
    date_window_days: 0,
    workflow_config: '{"requires_reviewer": true}',
    matching_rules: '{"strategies":["exact","tolerance","fuzzy","date_window"]}',
    assigned_preparer: '',
    assigned_reviewer: '',
  })
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [strategy, setStrategy] = useState('rule_based')
  const [threshold, setThreshold] = useState('1.0')
  const [queueType, setQueueType] = useState('')
  const [suggestionMinConfidence, setSuggestionMinConfidence] = useState('0.70')
  const [suggestionTopK, setSuggestionTopK] = useState('25')
  const [fxAmount, setFxAmount] = useState('1000')
  const [fxFrom, setFxFrom] = useState('USD')
  const [fxTo, setFxTo] = useState('INR')
  const [fxDate, setFxDate] = useState('')
  const [journalPeriod, setJournalPeriod] = useState('')
  const [journalMinAmount, setJournalMinAmount] = useState('0')
  const [journalReportingCurrency, setJournalReportingCurrency] = useState('USD')

  const [exceptionAction, setExceptionAction] = useState({
    exception_id: '',
    assigned_to: '',
    comments: '',
  })
  const [attachment, setAttachment] = useState({
    record_id: '',
    document_type: 'invoice',
    document_name: 'supporting_doc.pdf',
    document_path: '/docs/supporting_doc.pdf',
  })

  const { data: profiles = [] } = useQuery({ queryKey: ['enterprise-profiles'], queryFn: enterpriseAPI.listProfiles })
  const { data: exceptions = [] } = useQuery({
    queryKey: ['enterprise-exceptions', queueType],
    queryFn: () => enterpriseAPI.listExceptions(queueType),
    refetchInterval: 5000,
  })

  const createBatchMutation = useMutation({
    mutationFn: enterpriseAPI.createBatch,
    onSuccess: (data) => {
      toast.success('Batch created')
      setBatchId(data.batch_id)
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Batch creation failed'),
  })
  const transformMutation = useMutation({
    mutationFn: enterpriseAPI.transformBatch,
    onSuccess: () => toast.success('Transformation completed'),
    onError: (err) => toast.error(err.response?.data?.detail || 'Transform failed'),
  })
  const validateMutation = useMutation({
    mutationFn: enterpriseAPI.validateBatch,
    onSuccess: (data) => toast.success(`Validated. valid=${data.valid_count} errors=${data.error_count}`),
    onError: (err) => toast.error(err.response?.data?.detail || 'Validation failed'),
  })
  const loadMutation = useMutation({
    mutationFn: ({ b, p }) => enterpriseAPI.loadBatch(b, p),
    onSuccess: () => toast.success('Loaded into reconciliation records'),
    onError: (err) => toast.error(err.response?.data?.detail || 'Load failed'),
  })

  const createProfileMutation = useMutation({
    mutationFn: enterpriseAPI.createProfile,
    onSuccess: () => {
      toast.success('Profile created')
      qc.invalidateQueries(['enterprise-profiles'])
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Profile creation failed'),
  })
  const matchMutation = useMutation({
    mutationFn: enterpriseAPI.runMatching,
    onSuccess: (data) => {
      toast.success(`Matching completed. groups=${data.match_groups}, exceptions=${data.exceptions}`)
      qc.invalidateQueries(['enterprise-exceptions', queueType])
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Matching failed'),
  })
  const suggestionsMutation = useMutation({
    mutationFn: enterpriseAPI.matchSuggestions,
    onError: (err) => toast.error(err.response?.data?.detail || 'Unable to fetch suggestions'),
  })
  const autoJournalMutation = useMutation({
    mutationFn: enterpriseAPI.autoJournal,
    onSuccess: (data) => toast.success(`Auto journal created: ${data.created_count}`),
    onError: (err) => toast.error(err.response?.data?.detail || 'Auto journal failed'),
  })
  const fxMutation = useMutation({
    mutationFn: enterpriseAPI.convertFx,
    onError: (err) => toast.error(err.response?.data?.detail || 'FX conversion failed'),
  })

  const assignMutation = useMutation({
    mutationFn: enterpriseAPI.assignException,
    onSuccess: () => {
      toast.success('Exception assigned')
      qc.invalidateQueries(['enterprise-exceptions', queueType])
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Assign failed'),
  })
  const submitMutation = useMutation({
    mutationFn: enterpriseAPI.submitException,
    onSuccess: () => {
      toast.success('Exception submitted')
      qc.invalidateQueries(['enterprise-exceptions', queueType])
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Submit failed'),
  })
  const approveMutation = useMutation({
    mutationFn: enterpriseAPI.approveException,
    onSuccess: () => {
      toast.success('Exception approved')
      qc.invalidateQueries(['enterprise-exceptions', queueType])
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Approve failed'),
  })
  const rejectMutation = useMutation({
    mutationFn: enterpriseAPI.rejectException,
    onSuccess: () => {
      toast.success('Exception rejected')
      qc.invalidateQueries(['enterprise-exceptions', queueType])
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Reject failed'),
  })

  const finalizeMutation = useMutation({
    mutationFn: enterpriseAPI.finalizeRecord,
    onSuccess: () => toast.success('Record finalized'),
    onError: (err) => toast.error(err.response?.data?.detail || 'Finalize failed'),
  })
  const uploadAttMutation = useMutation({
    mutationFn: ({ recordId, payload }) => enterpriseAPI.uploadAttachment(recordId, payload),
    onSuccess: () => toast.success('Attachment metadata saved'),
    onError: (err) => toast.error(err.response?.data?.detail || 'Attachment upload failed'),
  })

  const profileOptions = useMemo(
    () => profiles.map((p) => ({ id: p.id, label: `${p.id} - ${p.name}` })),
    [profiles]
  )
  const selectedProfile = useMemo(
    () => profiles.find((p) => String(p.id) === String(selectedProfileId)) || null,
    [profiles, selectedProfileId],
  )
  const suggestionItems = suggestionsMutation.data?.items || []
  const effectiveReportingCurrency = (journalReportingCurrency || 'USD').toUpperCase()

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, sans-serif' }}>
      {/* EY Page Header */}
      <div style={{
        height: 52, padding: '0 20px', flexShrink: 0,
        background: 'var(--header-bg)',
        borderBottom: '1px solid var(--border-1)',
        borderTop: '3px solid #FFE600',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Operations</p>
          <h1 style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>Enterprise Reconciliation Ops</h1>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: 16, alignContent: 'start', background: 'var(--surface-0)' }}>
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>1) Ingestion &amp; Pipeline</h2>
          <input className="input" value={sourceSystem} onChange={(e) => setSourceSystem(e.target.value)} placeholder="Source System" />
          <textarea className="input min-h-[80px]" value={metadataText} onChange={(e) => setMetadataText(e.target.value)} placeholder="Batch metadata JSON" />
          <textarea className="input min-h-[120px]" value={recordsText} onChange={(e) => setRecordsText(e.target.value)} placeholder="Records JSON array" />
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-primary"
              onClick={() => {
                const metadata = parseJsonSafe(metadataText)
                const records = parseJsonSafe(recordsText)
                if (!metadata || !Array.isArray(records)) return toast.error('Invalid metadata/records JSON')
                createBatchMutation.mutate({ source_system: sourceSystem, metadata, records })
              }}
            >
              Create Batch
            </button>
            <input className="input max-w-xs" value={batchId} onChange={(e) => setBatchId(e.target.value)} placeholder="Batch ID" />
            <button className="btn-secondary" onClick={() => transformMutation.mutate(batchId)} disabled={!batchId}>Transform</button>
            <button className="btn-secondary" onClick={() => validateMutation.mutate(batchId)} disabled={!batchId}>Validate</button>
          </div>
          <div className="flex items-center gap-2">
            <select className="input max-w-sm" value={selectedProfileId} onChange={(e) => setSelectedProfileId(e.target.value)}>
              <option value="">Select Profile</option>
              {profileOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <button
              className="btn-secondary"
              onClick={() => loadMutation.mutate({ b: batchId, p: Number(selectedProfileId) })}
              disabled={!batchId || !selectedProfileId}
            >
              Load Validated
            </button>
          </div>
        </div>

        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>2) Reconciliation Profiles</h2>
          <input className="input" value={profileForm.name} onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))} placeholder="Profile Name" />
          <div className="grid grid-cols-2 gap-2">
            <input className="input" value={profileForm.reconciliation_type} onChange={(e) => setProfileForm((p) => ({ ...p, reconciliation_type: e.target.value }))} placeholder="Type" />
            <input className="input" value={profileForm.frequency} onChange={(e) => setProfileForm((p) => ({ ...p, frequency: e.target.value }))} placeholder="Frequency" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="input" value={profileForm.tolerance_threshold} onChange={(e) => setProfileForm((p) => ({ ...p, tolerance_threshold: e.target.value }))} placeholder="Tolerance" />
            <input className="input" value={profileForm.date_window_days} onChange={(e) => setProfileForm((p) => ({ ...p, date_window_days: e.target.value }))} placeholder="Date Window Days" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="input" value={profileForm.assigned_preparer} onChange={(e) => setProfileForm((p) => ({ ...p, assigned_preparer: e.target.value }))} placeholder="Preparer User ID" />
            <input className="input" value={profileForm.assigned_reviewer} onChange={(e) => setProfileForm((p) => ({ ...p, assigned_reviewer: e.target.value }))} placeholder="Reviewer User ID" />
          </div>
          <textarea className="input min-h-[70px]" value={profileForm.workflow_config} onChange={(e) => setProfileForm((p) => ({ ...p, workflow_config: e.target.value }))} placeholder="Workflow config JSON" />
          <textarea className="input min-h-[70px]" value={profileForm.matching_rules} onChange={(e) => setProfileForm((p) => ({ ...p, matching_rules: e.target.value }))} placeholder="Matching rules JSON" />
          <button
            className="btn-primary"
            onClick={() => {
              const workflowConfig = parseJsonSafe(profileForm.workflow_config)
              const matchingRules = parseJsonSafe(profileForm.matching_rules)
              if (!workflowConfig || !matchingRules) return toast.error('Invalid workflow/matching JSON')
              createProfileMutation.mutate({
                name: profileForm.name,
                reconciliation_type: profileForm.reconciliation_type,
                frequency: profileForm.frequency,
                tolerance_threshold: Number(profileForm.tolerance_threshold) || 0,
                date_window_days: Number(profileForm.date_window_days) || 0,
                workflow_config: workflowConfig,
                matching_rules: matchingRules,
                assigned_preparer: profileForm.assigned_preparer ? Number(profileForm.assigned_preparer) : null,
                assigned_reviewer: profileForm.assigned_reviewer ? Number(profileForm.assigned_reviewer) : null,
              })
            }}
          >
            Create Profile
          </button>
        </div>

        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>3) Matching Engine / Auto-Match</h2>
          <select className="input" value={selectedProfileId} onChange={(e) => setSelectedProfileId(e.target.value)}>
            <option value="">Select Profile</option>
            {profileOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select className="input" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
              <option value="rule_based">rule_based</option>
              <option value="exact">exact</option>
              <option value="tolerance">tolerance</option>
              <option value="fuzzy">fuzzy</option>
              <option value="date_window">date_window</option>
            </select>
            <input className="input" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="Auto-match threshold" />
          </div>
          <button
            className="btn-primary"
            disabled={!selectedProfileId}
            onClick={() => matchMutation.mutate({ profile_id: Number(selectedProfileId), strategy, auto_match_threshold: Number(threshold) || 1.0 })}
          >
            Run Matching
          </button>
          <p className="text-xs text-slate-500">
            {selectedProfile
              ? `Profile config: tolerance ${selectedProfile.tolerance_threshold}, date window ${selectedProfile.date_window_days}, risk ${selectedProfile.risk_classification}`
              : 'Pick a profile to enable matching and enterprise tools.'}
          </p>
        </div>

        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, gridColumn: 'span 1' }}>
          <h2 style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>4) Suggestions, Journals &amp; FX Utilities</h2>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="space-y-3">
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Auto-Match Suggestions</p>
              <div className="grid grid-cols-2 gap-2">
                <input className="input" value={suggestionMinConfidence} onChange={(e) => setSuggestionMinConfidence(e.target.value)} placeholder="Min confidence" />
                <input className="input" value={suggestionTopK} onChange={(e) => setSuggestionTopK(e.target.value)} placeholder="Top K" />
                <button
                  className="btn-secondary col-span-2"
                  disabled={!selectedProfileId || suggestionsMutation.isPending}
                  onClick={() =>
                    suggestionsMutation.mutate({
                      profile_id: Number(selectedProfileId),
                      top_k: Number(suggestionTopK) || 25,
                      min_confidence: Number(suggestionMinConfidence) || 0.7,
                    })
                  }
                >
                  {suggestionsMutation.isPending ? 'Loading...' : 'Get Suggestions'}
                </button>
              </div>
              <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid var(--border-1)', borderRadius: 6, padding: 8 }}>
                {!suggestionItems.length ? <p className="text-xs text-slate-500">No suggestions yet.</p> : null}
                {suggestionItems.map((s) => (
                  <div key={`${s.left_record_id}-${s.right_record_id}`} style={{ background: 'var(--surface-3)', border: '1px solid var(--border-1)', borderRadius: 6, padding: '6px 10px' }}>
                    <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-primary)' }}>{s.left_reference} → {s.right_reference}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-tertiary)' }}>confidence {Math.round((s.confidence || 0) * 100)}% | delta {s.amount_delta}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Journal Automation</p>
              <div className="grid grid-cols-2 gap-2">
                <input className="input" value={journalPeriod} onChange={(e) => setJournalPeriod(e.target.value)} placeholder="Period key" />
                <input className="input" value={journalMinAmount} onChange={(e) => setJournalMinAmount(e.target.value)} placeholder="Min abs amount" />
                <input className="input col-span-2" value={journalReportingCurrency} onChange={(e) => setJournalReportingCurrency(e.target.value.toUpperCase())} placeholder="Reporting currency" />
                <button
                  className="btn-secondary col-span-2"
                  disabled={!selectedProfileId || autoJournalMutation.isPending}
                  onClick={() =>
                    autoJournalMutation.mutate({
                      profile_id: Number(selectedProfileId),
                      period_key: journalPeriod || undefined,
                      min_amount: Number(journalMinAmount) || 0,
                      reporting_currency: effectiveReportingCurrency,
                    })
                  }
                >
                  {autoJournalMutation.isPending ? 'Generating...' : 'Auto Generate Journals'}
                </button>
              </div>
              <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid var(--border-1)', borderRadius: 6, padding: 8 }}>
                {(autoJournalMutation.data?.items || []).map((j) => (
                  <div key={j.adjustment_id} style={{ background: 'var(--surface-3)', border: '1px solid var(--border-1)', borderRadius: 6, padding: '6px 10px', fontSize: 11.5, color: 'var(--text-primary)' }}>
                    #{j.adjustment_id} {j.account} {j.currency} {j.amount}
                    {j.converted_amount != null ? ` | converted ${j.converted_amount}` : ''}
                  </div>
                ))}
                {!autoJournalMutation.data?.items?.length ? <p className="text-xs text-slate-500">No journals generated yet.</p> : null}
              </div>
            </div>

            <div className="space-y-3">
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>FX Conversion</p>
              <div className="grid grid-cols-2 gap-2">
                <input className="input" value={fxAmount} onChange={(e) => setFxAmount(e.target.value)} placeholder="Amount" />
                <input className="input" value={fxFrom} onChange={(e) => setFxFrom(e.target.value.toUpperCase())} placeholder="From" />
                <input className="input" value={fxTo} onChange={(e) => setFxTo(e.target.value.toUpperCase())} placeholder="To" />
                <input className="input" type="date" value={fxDate} onChange={(e) => setFxDate(e.target.value)} />
                <button
                  className="btn-secondary col-span-2"
                  onClick={() => fxMutation.mutate({ amount: Number(fxAmount) || 0, from_currency: fxFrom, to_currency: fxTo, conversion_date: fxDate || undefined })}
                >
                  Convert
                </button>
              </div>
              {fxMutation.data ? (
                <div style={{ background: 'var(--surface-3)', border: '1px solid var(--border-1)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: 'var(--text-primary)' }}>
                  Converted: {fxMutation.data.converted_amount} | Rate: {fxMutation.data.rate} | FX Variance: {fxMutation.data.fx_variance}
                </div>
              ) : (
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Run a conversion to view the result here.</p>
              )}
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>5) Exception Queue Workflow</h2>
          <div className="flex gap-2">
            <select className="input max-w-xs" value={queueType} onChange={(e) => setQueueType(e.target.value)}>
              <option value="">All</option>
              <option value="exception">exception</option>
              <option value="unresolved">unresolved</option>
              <option value="assigned">assigned</option>
              <option value="escalated">escalated</option>
            </select>
          </div>
          <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border-1)', borderRadius: 6, padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {exceptions.map((e) => (
              <div key={e.id} style={{ fontSize: 11.5, color: 'var(--text-secondary)', padding: '4px 0', borderBottom: '1px solid var(--border-0)' }}>
                #{e.id} | {e.queue_type} | {e.status} | assigned:{e.assigned_to ?? '-'}
              </div>
            ))}
            {exceptions.length === 0 && <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>No exceptions</p>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input className="input" value={exceptionAction.exception_id} onChange={(e) => setExceptionAction((p) => ({ ...p, exception_id: e.target.value }))} placeholder="Exception ID" />
            <input className="input" value={exceptionAction.assigned_to} onChange={(e) => setExceptionAction((p) => ({ ...p, assigned_to: e.target.value }))} placeholder="Assign User ID" />
            <input className="input" value={exceptionAction.comments} onChange={(e) => setExceptionAction((p) => ({ ...p, comments: e.target.value }))} placeholder="Comments" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => assignMutation.mutate({ exception_id: Number(exceptionAction.exception_id), assigned_to: Number(exceptionAction.assigned_to), comments: exceptionAction.comments })}>Assign</button>
            <button className="btn-secondary" onClick={() => submitMutation.mutate({ exception_id: Number(exceptionAction.exception_id), comments: exceptionAction.comments })}>Submit</button>
            <button className="btn-secondary" onClick={() => approveMutation.mutate({ exception_id: Number(exceptionAction.exception_id), comments: exceptionAction.comments })}>Approve</button>
            <button className="btn-secondary" onClick={() => rejectMutation.mutate({ exception_id: Number(exceptionAction.exception_id), comments: exceptionAction.comments })}>Reject</button>
          </div>
        </div>

        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>6) Finalization &amp; Attachment Metadata</h2>
          <div className="grid grid-cols-2 gap-2">
            <input className="input" value={attachment.record_id} onChange={(e) => setAttachment((p) => ({ ...p, record_id: e.target.value }))} placeholder="Reconciliation Record ID" />
            <button className="btn-secondary" onClick={() => finalizeMutation.mutate(Number(attachment.record_id))}>Finalize Record</button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input className="input" value={attachment.document_type} onChange={(e) => setAttachment((p) => ({ ...p, document_type: e.target.value }))} placeholder="Document Type" />
            <input className="input" value={attachment.document_name} onChange={(e) => setAttachment((p) => ({ ...p, document_name: e.target.value }))} placeholder="Document Name" />
            <input className="input" value={attachment.document_path} onChange={(e) => setAttachment((p) => ({ ...p, document_path: e.target.value }))} placeholder="Document Path" />
          </div>
          <button
            className="btn-primary"
            onClick={() =>
              uploadAttMutation.mutate({
                recordId: Number(attachment.record_id),
                payload: {
                  document_type: attachment.document_type,
                  document_name: attachment.document_name,
                  document_path: attachment.document_path,
                },
              })
            }
          >
            Save Attachment Metadata
          </button>
        </div>
      </div>
    </div>
  )
}
