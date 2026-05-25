import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { enterpriseAPI } from '../api'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/PageState'

function toCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount || 0))
}

function timelineSort(a, b) {
  return new Date(b.when || 0).getTime() - new Date(a.when || 0).getTime()
}

export default function ExceptionInvestigation() {
  const { exceptionId: routeExceptionId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [selectedExceptionId, setSelectedExceptionId] = useState(routeExceptionId || '')
  const [newComment, setNewComment] = useState('')
  const [classification, setClassification] = useState('PROCESS_ISSUE')

  const { data: exceptions = [], isLoading: exLoading, isError: exError, error: exErr, refetch: refetchExceptions } = useQuery({
    queryKey: ['exception-investigation-exceptions'],
    queryFn: () => enterpriseAPI.listExceptions(),
  })
  const { data: explorer, isLoading: explorerLoading, isError: explorerError, error: explorerErr, refetch: refetchExplorer } = useQuery({
    queryKey: ['exception-investigation-explorer'],
    queryFn: enterpriseAPI.analyticsExplorer,
  })

  useEffect(() => {
    if (!selectedExceptionId && routeExceptionId) {
      setSelectedExceptionId(routeExceptionId)
    }
  }, [routeExceptionId, selectedExceptionId])

  useEffect(() => {
    if (!selectedExceptionId && exceptions.length) {
      setSelectedExceptionId(String(exceptions[0].id))
    }
  }, [exceptions, selectedExceptionId])

  const selectedException = useMemo(() => {
    return exceptions.find((row) => String(row.id) === String(selectedExceptionId)) || null
  }, [exceptions, selectedExceptionId])

  const transaction = useMemo(() => {
    if (!selectedException) return null
    return (explorer?.transactions || []).find((row) => String(row.exception_id) === String(selectedException.id)) || null
  }, [explorer?.transactions, selectedException])

  const { data: evidence = [], isLoading: evidenceLoading, refetch: refetchEvidence } = useQuery({
    queryKey: ['exception-evidence', transaction?.record_id],
    queryFn: () => enterpriseAPI.listAttachments(transaction.record_id),
    enabled: !!transaction?.record_id,
  })
  const { data: comments = [], isLoading: commentsLoading, refetch: refetchComments } = useQuery({
    queryKey: ['exception-comments', selectedException?.id],
    queryFn: () => enterpriseAPI.listExceptionComments(selectedException.id),
    enabled: !!selectedException?.id,
  })
  const { data: workflows = [], isLoading: workflowsLoading } = useQuery({
    queryKey: ['exception-workflows', transaction?.profile_id],
    queryFn: () => enterpriseAPI.listCertificationWorkflows(transaction.profile_id),
    enabled: !!transaction?.profile_id,
  })

  const selectedWorkflow = workflows[0] || null
  const { data: workflowHistory = [], isLoading: historyLoading, refetch: refetchHistory } = useQuery({
    queryKey: ['exception-workflow-history', selectedWorkflow?.id],
    queryFn: () => enterpriseAPI.getCertificationWorkflowHistory(selectedWorkflow.id),
    enabled: !!selectedWorkflow?.id,
  })

  const refreshDetails = () => {
    qc.invalidateQueries({ queryKey: ['exception-investigation-exceptions'] })
    qc.invalidateQueries({ queryKey: ['exception-investigation-explorer'] })
    if (selectedException?.id) refetchComments()
    if (transaction?.record_id) refetchEvidence()
    if (selectedWorkflow?.id) refetchHistory()
  }

  const addCommentMutation = useMutation({
    mutationFn: (payload) => enterpriseAPI.addExceptionComment(payload),
    onSuccess: () => {
      toast.success('Comment added')
      setNewComment('')
      refetchComments()
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Unable to add comment'),
  })

  const classifyMutation = useMutation({
    mutationFn: (payload) => enterpriseAPI.classifyException(payload),
    onSuccess: () => {
      toast.success('Exception classified')
      refreshDetails()
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Unable to classify exception'),
  })

  const actionMutation = useMutation({
    mutationFn: async ({ type, payload }) => {
      if (type === 'resolve') return enterpriseAPI.resolveException(payload)
      if (type === 'escalate') return enterpriseAPI.escalateException(payload)
      return enterpriseAPI.reopenException(payload)
    },
    onSuccess: (_, variables) => {
      toast.success(`Exception ${variables.type}d`)
      refreshDetails()
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Unable to update exception'),
  })

  const loading = exLoading || explorerLoading
  const hasError = exError || explorerError

  const auditTimeline = useMemo(() => {
    const rows = []
    if (selectedException?.created_at) rows.push({ label: 'Exception created', detail: selectedException.classification || selectedException.queue_type, when: selectedException.created_at })
    if (selectedException?.updated_at) rows.push({ label: 'Exception updated', detail: selectedException.status, when: selectedException.updated_at })
    if (selectedException?.resolved_at) rows.push({ label: 'Exception resolved', detail: selectedException.resolution_notes || 'Resolution captured', when: selectedException.resolved_at })
    comments.forEach((comment) => rows.push({ label: 'Comment added', detail: comment.comment, when: comment.created_at }))
    workflowHistory.forEach((entry) => rows.push({ label: `Workflow ${entry.action}`, detail: `${entry.from_status || 'N/A'} -> ${entry.to_status || 'N/A'}`, when: entry.created_at }))
    return rows.sort(timelineSort)
  }, [comments, selectedException, workflowHistory])

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Exception Investigation Workbench"
        subtitle="Transaction, evidence, comments, workflow history, audit trail, and resolution actions in one screen."
        badge={selectedException ? `Exception #${selectedException.id}` : 'No exception selected'}
        actions={selectedException ? <button className="btn-secondary" onClick={() => navigate('/exception-ops')}>Back to Queue</button> : null}
      />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        <div className="card p-3 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_160px] gap-2">
          <select className="input" value={selectedExceptionId} onChange={(e) => { setSelectedExceptionId(e.target.value); navigate(`/exception-investigation/${e.target.value}`) }}>
            {exceptions.map((row) => (
              <option key={row.id} value={String(row.id)}>
                #{row.id} · {row.status} · {row.queue_type}
              </option>
            ))}
          </select>
          <button className="btn-secondary" onClick={refreshDetails}>Refresh</button>
        </div>

        {loading ? <LoadingState label="Loading investigation workspace..." /> : null}

        {!loading && hasError ? (
          <ErrorState
            title="Unable to load exception workspace"
            description={exErr?.response?.data?.detail || explorerErr?.response?.data?.detail || 'Please retry in a moment.'}
            action={<button className="btn-secondary" onClick={() => { refetchExceptions(); refetchExplorer() }}>Retry</button>}
          />
        ) : null}

        {!loading && !hasError && !selectedException ? (
          <EmptyState title="No exceptions available" description="Queue activity will appear here once breaks are raised." />
        ) : null}

        {!loading && !hasError && selectedException ? (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-8 space-y-4">
              <div className="card p-4">
                <p className="text-sm font-semibold text-slate-100 mb-3">Transaction Details</p>
                {transaction ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="oracle-kpi p-3"><p className="text-xs text-slate-400">Entity</p><p className="text-sm font-semibold text-slate-100">{transaction.entity || '-'}</p></div>
                    <div className="oracle-kpi p-3"><p className="text-xs text-slate-400">Account</p><p className="text-sm font-semibold text-slate-100">{transaction.account || '-'}</p></div>
                    <div className="oracle-kpi p-3"><p className="text-xs text-slate-400">Status</p><p className="text-sm font-semibold text-slate-100">{transaction.status || '-'}</p></div>
                    <div className="oracle-kpi p-3"><p className="text-xs text-slate-400">Variance</p><p className="text-sm font-semibold text-slate-100">{toCurrency(transaction.match_variance, 'INR')}</p></div>
                    <div className="oracle-kpi p-3"><p className="text-xs text-slate-400">Reference</p><p className="text-sm font-semibold text-slate-100">{transaction.reference || transaction.record_id}</p></div>
                    <div className="oracle-kpi p-3"><p className="text-xs text-slate-400">Period</p><p className="text-sm font-semibold text-slate-100">{transaction.period || '-'}</p></div>
                    <div className="oracle-kpi p-3"><p className="text-xs text-slate-400">Currency</p><p className="text-sm font-semibold text-slate-100">{transaction.currency || '-'}</p></div>
                    <div className="oracle-kpi p-3"><p className="text-xs text-slate-400">Risk</p><p className="text-sm font-semibold text-slate-100">{transaction.profile?.risk_classification || '-'}</p></div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">No linked transaction found for this exception.</p>
                )}
              </div>

              <div className="card p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <p className="text-sm font-semibold text-slate-100">Evidence</p>
                  <span className="text-xs text-slate-500">{evidence.length} attachment(s)</span>
                </div>
                {evidenceLoading ? <p className="text-sm text-slate-400">Loading evidence...</p> : null}
                {!evidenceLoading && evidence.length === 0 ? <p className="text-sm text-slate-400">No evidence uploaded for this transaction yet.</p> : null}
                {!evidenceLoading && evidence.length > 0 ? (
                  <div className="space-y-2">
                    {evidence.map((item) => (
                      <div key={item.id} className="rounded-xl border border-surface-700 bg-surface-900/40 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-slate-100">{item.document_name}</p>
                            <p className="mt-1 text-xs text-slate-400">{item.document_type} · v{item.version} · {item.document_status}</p>
                          </div>
                          <span className="text-xs text-slate-500">{item.document_path || 'Uploaded file'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="card p-4">
                <p className="text-sm font-semibold text-slate-100 mb-3">Resolution Actions</p>
                <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-3">
                  <div className="space-y-2">
                    <select className="input" value={classification} onChange={(e) => setClassification(e.target.value)}>
                      <option value="PROCESS_ISSUE">PROCESS_ISSUE</option>
                      <option value="DATA_ISSUE">DATA_ISSUE</option>
                      <option value="POLICY_RISK">POLICY_RISK</option>
                      <option value="OTHER">OTHER</option>
                    </select>
                    <button className="btn-secondary w-full" onClick={() => classifyMutation.mutate({ exception_id: selectedException.id, classification, comments: 'Classified from workspace' })} disabled={classifyMutation.isPending}>Classify</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <button className="btn-secondary" onClick={() => actionMutation.mutate({ type: 'resolve', payload: { exception_id: selectedException.id, comments: 'Resolved from investigation workspace' } })} disabled={actionMutation.isPending}>Resolve</button>
                    <button className="btn-secondary" onClick={() => actionMutation.mutate({ type: 'escalate', payload: { exception_id: selectedException.id, comments: 'Escalated from investigation workspace' } })} disabled={actionMutation.isPending}>Escalate</button>
                    <button className="btn-secondary" onClick={() => actionMutation.mutate({ type: 'reopen', payload: { exception_id: selectedException.id, comments: 'Reopened from investigation workspace' } })} disabled={actionMutation.isPending}>Reopen</button>
                  </div>
                </div>
              </div>
            </div>

            <div className="xl:col-span-4 space-y-4">
              <div className="card p-4">
                <p className="text-sm font-semibold text-slate-100 mb-3">Comments</p>
                <div className="space-y-2 mb-3">
                  <textarea className="input min-h-[88px]" value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Add investigation notes, evidence references, or resolution context..." />
                  <button className="btn-secondary w-full" onClick={() => addCommentMutation.mutate({ exception_id: selectedException.id, comment: newComment })} disabled={!newComment.trim() || addCommentMutation.isPending}>Add Comment</button>
                </div>
                {commentsLoading ? <p className="text-sm text-slate-400">Loading comments...</p> : null}
                {!commentsLoading && comments.length === 0 ? <p className="text-sm text-slate-400">No comments logged yet.</p> : null}
                {!commentsLoading && comments.length > 0 ? (
                  <div className="space-y-2 max-h-[260px] overflow-auto">
                    {comments.map((comment) => (
                      <div key={comment.id} className="rounded-xl border border-surface-700 bg-surface-900/40 p-3">
                        <p className="text-sm text-slate-100">{comment.comment}</p>
                        <p className="mt-1 text-xs text-slate-500">User {comment.user_id || '-'} · {comment.created_at ? new Date(comment.created_at).toLocaleString() : '-'}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="card p-4">
                <p className="text-sm font-semibold text-slate-100 mb-3">Workflow History</p>
                {workflowsLoading || historyLoading ? <p className="text-sm text-slate-400">Loading workflow history...</p> : null}
                {!workflowsLoading && !historyLoading && !selectedWorkflow ? <p className="text-sm text-slate-400">No certification workflow found for this reconciliation.</p> : null}
                {!workflowsLoading && !historyLoading && selectedWorkflow ? (
                  <div className="space-y-2">
                    <div className="rounded-xl border border-surface-700 bg-surface-900/40 p-3">
                      <p className="text-sm font-medium text-slate-100">Workflow #{selectedWorkflow.id}</p>
                      <p className="mt-1 text-xs text-slate-400">{selectedWorkflow.status} · Stage {selectedWorkflow.current_stage}</p>
                    </div>
                    {workflowHistory.map((entry) => (
                      <div key={entry.id} className="rounded-xl border border-surface-700 p-3">
                        <p className="text-sm text-slate-100">{entry.action}</p>
                        <p className="mt-1 text-xs text-slate-400">{entry.from_status || 'N/A'} {'->'} {entry.to_status || 'N/A'}</p>
                        <p className="mt-1 text-xs text-slate-500">{entry.created_at ? new Date(entry.created_at).toLocaleString() : '-'}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="card p-4">
                <p className="text-sm font-semibold text-slate-100 mb-3">Audit Timeline</p>
                <div className="space-y-2 max-h-[300px] overflow-auto">
                  {auditTimeline.map((entry, index) => (
                    <div key={`${entry.label}-${index}`} className="rounded-xl border border-surface-700 p-3">
                      <p className="text-sm font-medium text-slate-100">{entry.label}</p>
                      <p className="mt-1 text-xs text-slate-400">{entry.detail}</p>
                      <p className="mt-1 text-xs text-slate-500">{entry.when ? new Date(entry.when).toLocaleString() : '-'}</p>
                    </div>
                  ))}
                  {!auditTimeline.length ? <p className="text-sm text-slate-400">No audit activity available.</p> : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
