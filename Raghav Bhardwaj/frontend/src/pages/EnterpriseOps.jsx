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

  return (
    <div className="h-full flex flex-col">
      <div className="section-header">
        <h1 className="text-base font-semibold text-white">Enterprise Reconciliation Ops</h1>
      </div>
      <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">1) Ingestion & Pipeline</h2>
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

        <div className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">2) Reconciliation Profiles</h2>
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

        <div className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">3) Matching Engine / Auto-Match</h2>
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
        </div>

        <div className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">4) Exception Queue Workflow</h2>
          <div className="flex gap-2">
            <select className="input max-w-xs" value={queueType} onChange={(e) => setQueueType(e.target.value)}>
              <option value="">All</option>
              <option value="exception">exception</option>
              <option value="unresolved">unresolved</option>
              <option value="assigned">assigned</option>
              <option value="escalated">escalated</option>
            </select>
          </div>
          <div className="max-h-48 overflow-auto border border-surface-700 rounded-md p-2">
            {exceptions.map((e) => (
              <div key={e.id} className="text-xs text-slate-300 py-1 border-b border-surface-700/40 last:border-b-0">
                #{e.id} | {e.queue_type} | {e.status} | assigned:{e.assigned_to ?? '-'}
              </div>
            ))}
            {exceptions.length === 0 && <p className="text-xs text-slate-500">No exceptions</p>}
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

        <div className="card p-4 space-y-3 xl:col-span-2">
          <h2 className="text-sm font-semibold text-slate-200">5) Finalization & Attachment Metadata</h2>
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

