import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { enterpriseAPI } from '../api'
import toast from 'react-hot-toast'

export default function PreparerWorkbench() {
  const [queueType, setQueueType] = useState('actionable_preparer')
  const [exceptionId, setExceptionId] = useState('')
  const [comments, setComments] = useState('')
  const [recordId, setRecordId] = useState('')
  const [docType, setDocType] = useState('invoice')
  const [docName, setDocName] = useState('')
  const [docPath, setDocPath] = useState('/docs/evidence.pdf')
  const [selectedFile, setSelectedFile] = useState(null)

  const { data: exceptions = [], refetch } = useQuery({
    queryKey: ['preparer-exceptions', queueType],
    queryFn: () => enterpriseAPI.listExceptions(queueType),
    refetchInterval: 5000,
  })
  const { data: dashboard } = useQuery({
    queryKey: ['preparer-dashboard'],
    queryFn: enterpriseAPI.preparerDashboard,
    refetchInterval: 15000,
  })

  const submitMutation = useMutation({
    mutationFn: enterpriseAPI.submitException,
    onSuccess: () => { toast.success('Submitted to reviewer'); refetch() },
    onError: (e) => toast.error(e.response?.data?.detail || 'Submit failed'),
  })
  const uploadMutation = useMutation({
    mutationFn: ({ rid, payload }) => enterpriseAPI.uploadAttachment(rid, payload),
    onSuccess: () => toast.success('Evidence uploaded'),
    onError: (e) => toast.error(e.response?.data?.detail || 'Upload failed'),
  })

  return (
    <div className="h-full flex flex-col">
      <div className="section-header"><h1 className="text-base font-semibold text-white">Preparer Workbench</h1></div>
      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {dashboard && (
          <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="card p-3 text-xs text-slate-300">Assigned Reconciliations<br /><span className="text-white font-semibold">{dashboard.assigned_tasks}</span></div>
            <div className="card p-3 text-xs text-slate-300">Pending Submissions<br /><span className="text-white font-semibold">{dashboard.pending_submissions}</span></div>
            <div className="card p-3 text-xs text-slate-300">Rejected Reconciliations<br /><span className="text-white font-semibold">{dashboard.rejected_items}</span></div>
            <div className="card p-3 text-xs text-slate-300">Due-Date Warnings<br /><span className="text-white font-semibold">{dashboard.overdue_reconciliations}</span></div>
          </div>
        )}
        <div className="card p-4 space-y-3">
          <p className="oracle-panel-title text-sm">Assigned Exception Queue</p>
          <div className="flex items-center gap-2">
            <select className="input max-w-xs" value={queueType} onChange={(e) => setQueueType(e.target.value)}>
              <option value="actionable_preparer">actionable (unresolved + assigned)</option>
              <option value="assigned">assigned</option>
              <option value="unresolved">unresolved</option>
            </select>
          </div>
          <div className="max-h-[520px] overflow-auto border border-surface-700 rounded-md p-2">
            {exceptions.map((e) => (
              <div key={e.id} className="text-xs text-slate-300 border-b border-surface-700/40 py-2 last:border-b-0">
                #{e.id} | {e.queue_type} | {e.status} | assigned:{e.assigned_to ?? '-'}
              </div>
            ))}
          </div>
        </div>

        <div className="card p-4 space-y-3">
          <h2 className="oracle-panel-title text-sm">Submit Exception</h2>
          <input className="input" value={exceptionId} onChange={(e) => setExceptionId(e.target.value)} placeholder="Exception ID" />
          <textarea className="input min-h-[90px]" value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Investigation notes / justification (required)" />
          <button className="btn-secondary" onClick={() => submitMutation.mutate({ exception_id: Number(exceptionId), comments })} disabled={!exceptionId || !comments.trim()}>Submit for Review</button>

          <h2 className="oracle-panel-title text-sm pt-2">Evidence Upload</h2>
          <input className="input" value={recordId} onChange={(e) => setRecordId(e.target.value)} placeholder="Reconciliation Record ID" />
          <div className="grid grid-cols-3 gap-2">
            <input className="input" value={docType} onChange={(e) => setDocType(e.target.value)} placeholder="Document type" />
            <input className="input" value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="Document name" />
            <input className="input" value={docPath} onChange={(e) => setDocPath(e.target.value)} placeholder="Document path" />
          </div>
          <input className="input" type="file" onChange={(e) => {
            const file = e.target.files?.[0] || null
            setSelectedFile(file)
            if (file) setDocName(file.name)
          }} />
          <button
            className="btn-primary"
            onClick={() => uploadMutation.mutate({ rid: Number(recordId), payload: { document_type: docType, document_name: docName, document_path: docPath, file: selectedFile } })}
            disabled={!recordId || !docName}
          >
            Upload Evidence
          </button>
        </div>
      </div>
    </div>
  )
}
