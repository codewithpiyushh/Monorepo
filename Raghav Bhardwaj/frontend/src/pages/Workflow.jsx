import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { enterpriseAPI } from '../api'
import toast from 'react-hot-toast'
import PageHeader from '../components/ui/PageHeader'

export default function WorkflowPage() {
  const qc = useQueryClient()
  const [profileId, setProfileId] = useState('')
  const [workflowId, setWorkflowId] = useState('')
  const [action, setAction] = useState('PREPARE')
  const [comments, setComments] = useState('')
  const [profileFilter, setProfileFilter] = useState('')

  const { data: profiles = [] } = useQuery({
    queryKey: ['certification-profiles'],
    queryFn: enterpriseAPI.listProfiles,
  })

  const { data: workflows = [] } = useQuery({
    queryKey: ['certification-workflows', profileFilter],
    queryFn: () => enterpriseAPI.listCertificationWorkflows(profileFilter || undefined),
  })
  const selectedWorkflow = workflows.find((w) => String(w.id) === String(workflowId))
  const actionOptionsByStatus = {
    OPEN: ['PREPARE', 'FORCE_CLOSE'],
    PREPARED: ['SUBMIT', 'REOPEN', 'FORCE_CLOSE'],
    SUBMITTED: ['REVIEW', 'REOPEN', 'FORCE_CLOSE'],
    REVIEWED: ['APPROVE', 'REOPEN', 'FORCE_CLOSE'],
    APPROVED: ['CERTIFY', 'REOPEN', 'FORCE_CLOSE'],
    CERTIFIED: ['CLOSE', 'REOPEN'],
    CLOSED: ['REOPEN'],
    REOPENED: ['PREPARE', 'FORCE_CLOSE'],
    FORCE_CLOSED: ['REOPEN'],
  }
  const allowedActions = actionOptionsByStatus[(selectedWorkflow?.status || 'OPEN').toUpperCase()] || ['PREPARE']

  useEffect(() => {
    if (!workflowId && workflows.length) {
      setWorkflowId(String(workflows[0].id))
    }
  }, [workflowId, workflows])

  useEffect(() => {
    if (!allowedActions.includes(action)) {
      setAction(allowedActions[0])
    }
  }, [allowedActions, action])

  const { data: history = [] } = useQuery({
    queryKey: ['certification-history', workflowId],
    queryFn: () => enterpriseAPI.getCertificationWorkflowHistory(workflowId),
    enabled: !!workflowId,
  })

  const createMutation = useMutation({
    mutationFn: enterpriseAPI.createCertificationWorkflow,
    onSuccess: (row) => {
      toast.success('Certification workflow created')
      setWorkflowId(String(row.id))
      qc.invalidateQueries({ queryKey: ['certification-workflows'] })
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed to create workflow'),
  })

  const actionMutation = useMutation({
    mutationFn: enterpriseAPI.actionCertificationWorkflow,
    onSuccess: () => {
      toast.success('Workflow state updated')
      qc.invalidateQueries({ queryKey: ['certification-workflows'] })
      qc.invalidateQueries({ queryKey: ['certification-history'] })
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Action failed'),
  })

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Certification Workflow"
        subtitle="Create workflow instances, apply lifecycle actions, and review full audit history."
      />
      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">Create Workflow</h2>
          <select className="input" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            <option value="">Select Profile</option>
            {profiles.map((p) => (
              <option key={p.id} value={String(p.id)}>
                #{p.id} | {p.name} | {p.lifecycle_state}
              </option>
            ))}
          </select>
          <button
            className="btn-primary"
            onClick={() => createMutation.mutate({ profile_id: Number(profileId) })}
            disabled={!profileId}
          >
            Create
          </button>
        </div>

        <div className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">Action</h2>
          <select className="input" value={profileFilter} onChange={(e) => setProfileFilter(e.target.value)}>
            <option value="">Filter Workflows: All Profiles</option>
            {profiles.map((p) => (
              <option key={p.id} value={String(p.id)}>
                #{p.id} | {p.name}
              </option>
            ))}
          </select>
          <select className="input" value={workflowId} onChange={(e) => setWorkflowId(e.target.value)}>
            <option value="">Select Workflow</option>
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>
                #{w.id} | {w.status} | {w.current_stage}
              </option>
            ))}
          </select>
          <select className="input" value={action} onChange={(e) => setAction(e.target.value)}>
            {allowedActions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <textarea className="input min-h-[80px]" placeholder="Comments" value={comments} onChange={(e) => setComments(e.target.value)} />
          <button
            className="btn-secondary"
            onClick={() => actionMutation.mutate({ workflow_id: Number(workflowId), action, comments })}
            disabled={!workflowId}
          >
            Apply Action
          </button>
        </div>

        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-200 mb-3">Audit History</h2>
          {workflowId ? <p className="text-xs text-slate-500 mb-2">Workflow #{workflowId}</p> : null}
          <div className="space-y-2 max-h-[420px] overflow-auto">
            {history.map((h) => (
              <div key={h.id} className="border border-surface-700 rounded-md p-2 text-xs text-slate-300">
                {h.action}: {h.from_status || '-'} to {h.to_status || '-'}
                {h.comments ? ` | ${h.comments}` : ''}
              </div>
            ))}
            {history.length === 0 && <p className="text-xs text-slate-500">No history found.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
