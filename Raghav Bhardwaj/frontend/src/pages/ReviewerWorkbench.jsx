import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { CheckCircle2, RefreshCw, XCircle } from 'lucide-react'
import { enterpriseAPI, executionsAPI, workflowAPI } from '../api'
import { useAuthStore } from '../store/authStore'
import Modal from '../components/Modal'
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

export default function ReviewerWorkbench() {
  const { projectId } = useParams()
  const numericProjectId = Number(projectId)
  const user = useAuthStore((s) => s.user)
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [rejectOpen, setRejectOpen] = useState(false)

  const { data: workflows = [], refetch: refetchWorkflows, isLoading } = useQuery({
    queryKey: ['reviewer-workflows', numericProjectId],
    queryFn: () => workflowAPI.list({ project_id: numericProjectId }),
    enabled: Number.isFinite(numericProjectId),
    refetchInterval: 5000,
  })

  const selectedWorkflow = useMemo(
    () => workflows.find((workflow) => String(workflow.id) === String(selectedWorkflowId)) || null,
    [workflows, selectedWorkflowId]
  )

  const { data: workflowDetail, refetch: refetchWorkflowDetail } = useQuery({
    queryKey: ['reviewer-workflow-detail', selectedWorkflowId],
    queryFn: () => workflowAPI.get(Number(selectedWorkflowId)),
    enabled: Boolean(selectedWorkflowId),
  })

  const executionId = workflowDetail?.reconciliation_id || selectedWorkflow?.reconciliation_id || null

  const { data: resultsPage, refetch: refetchResults } = useQuery({
    queryKey: ['reviewer-results', numericProjectId, executionId],
    queryFn: () => executionsAPI.results(numericProjectId, executionId, { page: 1, page_size: 250 }),
    enabled: Number.isFinite(numericProjectId) && Boolean(executionId),
  })

  const { data: attachments = [], refetch: refetchAttachments } = useQuery({
    queryKey: ['reviewer-attachments', selectedWorkflowId],
    queryFn: () => workflowAPI.listAttachments(Number(selectedWorkflowId)),
    enabled: Boolean(selectedWorkflowId),
  })

  const { data: dashboard } = useQuery({
    queryKey: ['reviewer-dashboard'],
    queryFn: enterpriseAPI.reviewerDashboard,
    refetchInterval: 15000,
  })

  useEffect(() => {
    if (!selectedWorkflowId && workflows.length > 0) {
      setSelectedWorkflowId(String(workflows[0].id))
    }
  }, [workflows, selectedWorkflowId])

  const approveMutation = useMutation({
    mutationFn: workflowAPI.approve,
    onSuccess: async () => {
      toast.success('Approved')
      await Promise.all([refetchWorkflows(), refetchWorkflowDetail(), refetchResults()])
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Approve failed'),
  })

  const rejectMutation = useMutation({
    mutationFn: workflowAPI.reject,
    onSuccess: async () => {
      toast.success('Rejected and sent back')
      setRejectOpen(false)
      setRejectReason('')
      await Promise.all([refetchWorkflows(), refetchWorkflowDetail(), refetchResults()])
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Reject failed'),
  })

  const actionableRows = useMemo(() => {
    const units = resultsPage?.units || []
    return units
      .flatMap((unit) => unit.transactions || [])
      .filter((tx) => ['unmatched', 'partial'].includes(String(tx.match_status || '').toLowerCase()))
  }, [resultsPage])

  if (!Number.isFinite(numericProjectId)) {
    return (
      <div className="p-6">
        <EmptyState
          title="Missing project context"
          description="Open a project-specific reviewer workspace from the Work Queue."
        />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Reviewer Worklist"
        subtitle="Inbox for tasks waiting on approval. Work submitted by the same user is excluded by segregation of duties."
        badge={user?.role?.toUpperCase() || 'REVIEWER'}
        actions={(
          <button className="btn-secondary" onClick={() => refetchWorkflows()}>
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        )}
      />

      <div className="flex-1 overflow-auto p-4 lg:p-6">
        {isLoading ? <LoadingState label="Loading reviewer worklist..." /> : null}
        {!isLoading && workflows.length === 0 ? (
          <EmptyState
            title="No reviewer tasks"
            description="There are no workflows currently waiting for review in this project."
          />
        ) : null}

        {!isLoading && workflows.length > 0 ? (
          <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-4">
            <section className="card p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="card p-3 text-xs text-slate-300">Pending Review<br /><span className="text-white font-semibold">{dashboard?.pending_approvals ?? workflows.length}</span></div>
                <div className="card p-3 text-xs text-slate-300">Rejected<br /><span className="text-white font-semibold">{dashboard?.rejected_items ?? 0}</span></div>
                <div className="card p-3 text-xs text-slate-300">Overdue<br /><span className="text-white font-semibold">{dashboard?.overdue_reconciliations ?? 0}</span></div>
                <div className="card p-3 text-xs text-slate-300">Escalations<br /><span className="text-white font-semibold">{dashboard?.escalation_alerts ?? 0}</span></div>
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
                  title="Select a workflow"
                  description="Choose a pending review task to inspect the prepared justification, proofs, and mismatches."
                />
              ) : (
                <>
                  <div className="card p-4 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-base font-semibold text-white">Execution #{selectedWorkflow.reconciliation_id}</h2>
                        <p className="text-xs text-slate-400">Status: {statusLabel(selectedWorkflow.status)}</p>
                      </div>
                      <div className="text-xs text-slate-400 text-right">
                        <div>Proof attachments: {attachments.length}</div>
                        <div>Rows needing attention: {actionableRows.length}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="surface-panel p-3 space-y-2">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Preparer justification</p>
                        <textarea
                          className="input min-h-[160px]"
                          value={workflowDetail?.comments || ''}
                          readOnly
                        />
                      </div>
                      <div className="surface-panel p-3 space-y-2">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Proof attachments</p>
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
                            <p className="text-xs text-slate-500">No proof attachments are available.</p>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        className="btn-primary"
                        onClick={() => {
                          approveMutation.mutate({
                            reconciliation_id: Number(selectedWorkflow.reconciliation_id),
                            comments: (workflowDetail?.comments || '').trim(),
                          })
                        }}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Approve
                      </button>
                      <button className="btn-secondary" onClick={() => setRejectOpen(true)}>
                        <XCircle className="w-4 h-4" />
                        Reject
                      </button>
                    </div>
                  </div>

                  <div className="card p-4">
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div>
                        <h3 className="text-sm font-semibold text-white">Unmatched and Partial Rows</h3>
                        <p className="text-xs text-slate-400">Read-only comparison view for the records needing reviewer attention.</p>
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

      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Reject Workflow"
        subtitle="A rejection reason is required before the workflow can be sent back to the preparer."
        size="md"
      >
        <div className="p-5 space-y-4">
          <textarea
            className="input min-h-[140px]"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Type the rejection reason here..."
          />
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setRejectOpen(false)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                const reason = rejectReason.trim()
                if (!reason) {
                  toast.error('Rejection reason is required')
                  return
                }
                rejectMutation.mutate({
                  reconciliation_id: Number(selectedWorkflow.reconciliation_id),
                  comments: reason,
                })
              }}
              disabled={!selectedWorkflow}
            >
              Send Back
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
