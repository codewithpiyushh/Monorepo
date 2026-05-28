import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { CheckCircle2, FileUp, RefreshCw, UploadCloud } from 'lucide-react'
import { enterpriseAPI, executionsAPI, workflowAPI } from '../api'
import { useAuthStore } from '../store/authStore'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, LoadingState } from '../components/ui/PageState'

const parseJson = (value) => {
  if (!value) return {}
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

const statusLabel = (status) => {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'pending') return 'PENDING_PREPARER'
  if (normalized === 'rejected') return 'REJECTED'
  if (normalized === 'in_progress') return 'IN_PROGRESS'
  if (normalized === 'under_review') return 'PENDING_REVIEWER'
  if (normalized === 'approved') return 'APPROVED'
  return normalized.toUpperCase() || '-'
}

export default function PreparerWorkbench() {
  const navigate = useNavigate()
  const { projectId } = useParams()
  const numericProjectId = Number(projectId)
  const user = useAuthStore((s) => s.user)
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('')
  const [justification, setJustification] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)

  const { data: workflows = [], refetch: refetchWorkflows, isLoading } = useQuery({
    queryKey: ['preparer-workflows', numericProjectId],
    queryFn: () => workflowAPI.list({ project_id: numericProjectId }),
    enabled: Number.isFinite(numericProjectId),
    refetchInterval: 5000,
  })

  const selectedWorkflow = useMemo(
    () => workflows.find((workflow) => String(workflow.id) === String(selectedWorkflowId)) || null,
    [workflows, selectedWorkflowId]
  )

  const { data: workflowDetail, refetch: refetchWorkflowDetail } = useQuery({
    queryKey: ['workflow-detail', selectedWorkflowId],
    queryFn: () => workflowAPI.get(Number(selectedWorkflowId)),
    enabled: Boolean(selectedWorkflowId),
  })

  const executionId = workflowDetail?.reconciliation_id || selectedWorkflow?.reconciliation_id || null

  const { data: resultsPage, refetch: refetchResults } = useQuery({
    queryKey: ['workflow-results', numericProjectId, executionId],
    queryFn: () => executionsAPI.results(numericProjectId, executionId, { page: 1, page_size: 250 }),
    enabled: Number.isFinite(numericProjectId) && Boolean(executionId),
  })

  const { data: attachments = [], refetch: refetchAttachments } = useQuery({
    queryKey: ['workflow-attachments', selectedWorkflowId],
    queryFn: () => workflowAPI.listAttachments(Number(selectedWorkflowId)),
    enabled: Boolean(selectedWorkflowId),
  })

  const { data: dashboard } = useQuery({
    queryKey: ['preparer-dashboard'],
    queryFn: enterpriseAPI.preparerDashboard,
    refetchInterval: 15000,
  })

  useEffect(() => {
    if (!selectedWorkflowId && workflows.length > 0) {
      setSelectedWorkflowId(String(workflows[0].id))
    }
  }, [workflows, selectedWorkflowId])

  useEffect(() => {
    if (workflowDetail?.comments != null) {
      setJustification(workflowDetail.comments || '')
    }
  }, [workflowDetail?.id])

  const submitMutation = useMutation({
    mutationFn: workflowAPI.submit,
    onSuccess: async () => {
      toast.success('Submitted to reviewer')
      await Promise.all([refetchWorkflows(), refetchWorkflowDetail(), refetchResults()])
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Submit failed'),
  })

  const uploadMutation = useMutation({
    mutationFn: ({ workflowId, file }) => workflowAPI.uploadAttachment(workflowId, file),
    onSuccess: async () => {
      toast.success('Proof uploaded')
      setSelectedFile(null)
      await Promise.all([refetchAttachments(), refetchWorkflowDetail()])
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Upload failed'),
    onSettled: () => setUploading(false),
  })

  const deleteMutation = useMutation({
    mutationFn: workflowAPI.delete,
    onSuccess: async () => {
      toast.success('Reconciliation deleted')
      setSelectedWorkflowId('')
      setJustification('')
      setSelectedFile(null)
      await refetchWorkflows()
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Delete failed'),
  })

  const actionableRows = useMemo(() => {
    const units = resultsPage?.units || []
    return units
      .flatMap((unit) => unit.transactions || [])
      .filter((tx) => ['unmatched', 'partial'].includes(String(tx.match_status || '').toLowerCase()))
  }, [resultsPage])

  const executionStats = useMemo(() => parseJson(resultsPage?.stats), [resultsPage])

  const canSubmit = Boolean(executionId && justification.trim())
  const proofCount = attachments.length

  const handleProofUpload = () => {
    if (!selectedWorkflowId || !selectedFile) return
    setUploading(true)
    uploadMutation.mutate({ workflowId: Number(selectedWorkflowId), file: selectedFile })
  }

  if (!Number.isFinite(numericProjectId)) {
    return (
      <div className="p-6">
        <EmptyState
          title="Missing project context"
          description="Open a project-specific preparer workspace from the Work Queue."
        />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Preparer Worklist"
        subtitle="Inbox for tasks that are pending, in progress, or rejected back to the preparer."
        badge={user?.role?.toUpperCase() || 'PREPARER'}
        actions={(
          <>
            <button className="btn-secondary" onClick={() => refetchWorkflows()}>
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button className="btn-primary" onClick={() => navigate('/work-queue')}>
              <CheckCircle2 className="w-4 h-4" />
              Work Queue
            </button>
          </>
        )}
      />

      <div className="flex-1 overflow-auto p-4 lg:p-6">
        {isLoading ? <LoadingState label="Loading preparer worklist..." /> : null}
        {!isLoading && workflows.length === 0 ? (
          <EmptyState
            title="No preparer tasks"
            description="This project does not currently have any pending, in-progress, or rejected work for the preparer."
          />
        ) : null}

        {!isLoading && workflows.length > 0 ? (
          <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-4">
            <section className="card p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="card p-3 text-xs text-slate-300">Assigned<br /><span className="text-white font-semibold">{dashboard?.assigned_tasks ?? workflows.length}</span></div>
                <div className="card p-3 text-xs text-slate-300">Rejected Back<br /><span className="text-white font-semibold">{dashboard?.rejected_items ?? 0}</span></div>
                <div className="card p-3 text-xs text-slate-300">Pending<br /><span className="text-white font-semibold">{workflows.filter((w) => String(w.status).toLowerCase() === 'pending').length}</span></div>
                <div className="card p-3 text-xs text-slate-300">Need Action<br /><span className="text-white font-semibold">{workflows.filter((w) => ['pending', 'in_progress', 'rejected'].includes(String(w.status).toLowerCase())).length}</span></div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Worklist</span>
              </div>

              <div className="space-y-2 max-h-[62vh] overflow-auto pr-1">
                {workflows.map((workflow) => {
                  const active = String(workflow.id) === String(selectedWorkflowId)
                  return (
                    <button
                      key={workflow.id}
                      className={`w-full text-left rounded-lg border px-3 py-3 transition ${
                        active ? 'border-brand-500/50 bg-brand-900/20' : 'border-surface-700 bg-surface-800/50 hover:border-surface-500'
                      }`}
                      onClick={() => setSelectedWorkflowId(String(workflow.id))}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-100 truncate">Execution #{workflow.reconciliation_id}</p>
                          <p className="text-xs text-slate-400">Workflow #{workflow.id}</p>
                        </div>
                        <span className="chip-neutral text-[10px]">{statusLabel(workflow.status)}</span>
                      </div>
                      <div className="mt-2 text-xs text-slate-400 flex items-center justify-between gap-2">
                        <span>Assigned to: {workflow.assigned_to ?? '-'}</span>
                        <span>{workflow.updated_at ? new Date(workflow.updated_at).toLocaleString() : ''}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="space-y-4">
              {!selectedWorkflow ? (
                <EmptyState
                  title="Select a reconciliation"
                  description="Choose a workflow from the inbox to review unmatched and partially matched rows."
                />
              ) : (
                <>
                  <div className="card p-4 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-base font-semibold text-white">Execution #{selectedWorkflow.reconciliation_id}</h2>
                        <p className="text-xs text-slate-400">Workflow status: {statusLabel(selectedWorkflow.status)}</p>
                      </div>
                      <div className="text-xs text-slate-400 text-right">
                        <div>Proof attachments: {proofCount}</div>
                        <div>Rows needing attention: {actionableRows.length}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="surface-panel p-3">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Mandatory justification</p>
                        <textarea
                          className="input min-h-[140px]"
                          value={justification}
                          onChange={(e) => setJustification(e.target.value)}
                          placeholder="Explain the mismatch, the corrective action, and the proof reference."
                        />
                      </div>
                      <div className="surface-panel p-3 space-y-3">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Proof upload</p>
                        <input
                          type="file"
                          className="input"
                          onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                        />
                        <div className="flex gap-2">
                          <button
                            className="btn-primary"
                            onClick={handleProofUpload}
                            disabled={!selectedFile || uploading}
                          >
                            <UploadCloud className="w-4 h-4" />
                            {uploading ? 'Uploading...' : 'Upload Proof'}
                          </button>
                          <button className="btn-secondary" onClick={() => refetchAttachments()} disabled={!selectedWorkflowId}>
                            <FileUp className="w-4 h-4" />
                            Refresh Proofs
                          </button>
                        </div>
                        <div className="space-y-2">
                          {attachments.map((attachment) => (
                            <div key={attachment.id} className="rounded-md border border-surface-700 p-3 text-xs text-slate-300 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-medium text-slate-100 truncate">{attachment.file_name}</div>
                                <div className="text-slate-500">Uploaded {new Date(attachment.created_at).toLocaleString()}</div>
                              </div>
                              <a
                                className="btn-secondary !py-1 !px-2"
                                href={workflowAPI.downloadAttachmentUrl(attachment.id)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Download
                              </a>
                            </div>
                          ))}
                          {attachments.length === 0 ? (
                            <p className="text-xs text-slate-500">No proof has been uploaded yet.</p>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        className="btn-primary"
                        onClick={() => {
                          const comments = justification.trim()
                          if (!comments) {
                            toast.error('Justification is required before submission')
                            return
                          }
                          submitMutation.mutate({
                            reconciliation_id: Number(selectedWorkflow.reconciliation_id),
                            comments,
                          })
                        }}
                        disabled={!canSubmit}
                      >
                        Submit to Reviewer
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          if (!selectedWorkflow.reconciliation_id) return
                          const ok = window.confirm(`Delete reconciliation ${selectedWorkflow.reconciliation_id}? This removes workflow and results.`)
                          if (!ok) return
                          deleteMutation.mutate({
                            reconciliation_id: Number(selectedWorkflow.reconciliation_id),
                            comments: 'Deleted from preparer workspace',
                          })
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="card p-4">
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div>
                        <h3 className="text-sm font-semibold text-white">Unmatched and Partial Rows</h3>
                        <p className="text-xs text-slate-400">Side-by-side source and target values for the records that need attention.</p>
                      </div>
                      <div className="text-xs text-slate-400">
                        Execution stats: {executionStats.matched ?? 0} matched
                      </div>
                    </div>

                    <div className="space-y-3 max-h-[56vh] overflow-auto pr-1">
                      {actionableRows.map((row) => {
                        const source = parseJson(row.source_data)
                        const target = parseJson(row.target_data)
                        const discrepancies = Array.isArray(parseJson(row.discrepancies)) ? parseJson(row.discrepancies) : []
                        return (
                          <div key={row.id} className="rounded-xl border border-surface-700 bg-surface-800/70 p-4">
                            <div className="flex items-center justify-between gap-3 mb-3">
                              <div>
                                <p className="text-sm font-semibold text-white">Transaction #{row.id}</p>
                                <p className="text-xs text-slate-400">Status: {row.match_status} | Score: {((row.match_score || 0) * 100).toFixed(0)}%</p>
                              </div>
                              <span className="chip-neutral text-[10px]">{String(row.match_status || '').toUpperCase()}</span>
                            </div>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                              <div className="surface-panel p-3">
                                <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Source</p>
                                <div className="space-y-1 text-xs text-slate-300">
                                  {Object.keys(source).length === 0 ? <p className="text-slate-500">No source data</p> : null}
                                  {Object.entries(source).map(([key, value]) => (
                                    <div key={key} className="flex gap-2">
                                      <span className="w-28 truncate text-slate-500">{key}</span>
                                      <span className="truncate">{String(value ?? '(null)')}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="surface-panel p-3">
                                <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Target</p>
                                <div className="space-y-1 text-xs text-slate-300">
                                  {Object.keys(target).length === 0 ? <p className="text-slate-500">No target data</p> : null}
                                  {Object.entries(target).map(([key, value]) => (
                                    <div key={key} className="flex gap-2">
                                      <span className="w-28 truncate text-slate-500">{key}</span>
                                      <span className="truncate">{String(value ?? '(null)')}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <div className="mt-3">
                              <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Differences</p>
                              {discrepancies.length === 0 ? (
                                <p className="text-xs text-emerald-300">No field-level differences were captured for this row.</p>
                              ) : (
                                <div className="space-y-1 text-xs text-slate-300">
                                  {discrepancies.map((item, idx) => (
                                    <div key={idx}>
                                      <span className="text-slate-500">{item.source_column}:</span> {String(item.source_value ?? '(empty)')} vs {String(item.target_value ?? '(empty)')}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                      {actionableRows.length === 0 ? (
                        <p className="text-xs text-slate-500">This workflow has no unmatched or partial rows.</p>
                      ) : null}
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  )
}
