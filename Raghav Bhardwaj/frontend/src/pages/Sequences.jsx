import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { exportsAPI, projectsAPI, sequencesAPI } from '../api'
import toast from 'react-hot-toast'
import { Play, Download, RefreshCw } from 'lucide-react'

export default function Sequences() {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [stepsText, setStepsText] = useState('')
  const [stopOnFailure, setStopOnFailure] = useState(true)
  const [selectedSequenceId, setSelectedSequenceId] = useState(null)

  const { data: sequences = [], isLoading } = useQuery({ queryKey: ['sequences'], queryFn: sequencesAPI.list })
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: projectsAPI.list })
  const { data: selectedStatus } = useQuery({
    queryKey: ['sequence-status', selectedSequenceId],
    queryFn: () => sequencesAPI.status(selectedSequenceId),
    enabled: !!selectedSequenceId,
    refetchInterval: 4000,
  })

  const createMutation = useMutation({
    mutationFn: sequencesAPI.create,
    onSuccess: () => {
      toast.success('Sequence created')
      setName('')
      setStepsText('')
      setStopOnFailure(true)
      qc.invalidateQueries(['sequences'])
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Failed to create sequence'),
  })

  const runMutation = useMutation({
    mutationFn: sequencesAPI.run,
    onSuccess: () => {
      toast.success('Sequence started')
      qc.invalidateQueries(['sequences'])
      if (selectedSequenceId) qc.invalidateQueries(['sequence-status', selectedSequenceId])
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Failed to run sequence'),
  })

  const projectHint = useMemo(() => projects.map((p) => `${p.id}:${p.name}`).join(', '), [projects])

  const handleCreate = (e) => {
    e.preventDefault()
    const steps = stepsText.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n))
    if (!name.trim() || steps.length === 0) {
      toast.error('Provide sequence name and at least one project ID step')
      return
    }
    createMutation.mutate({ name: name.trim(), steps, stop_on_failure: stopOnFailure })
  }

  return (
    <div className="h-full flex flex-col">
      <div className="section-header">
        <h1 className="text-base font-semibold text-white">Sequences</h1>
      </div>
      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <form onSubmit={handleCreate} className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">Create Sequence</h2>
          <div>
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="month_end_sequence" />
          </div>
          <div>
            <label className="label">Steps (Project IDs comma-separated)</label>
            <input className="input" value={stepsText} onChange={(e) => setStepsText(e.target.value)} placeholder="1,2,3" />
            <p className="text-[11px] text-slate-500 mt-1 truncate">Available: {projectHint || 'No projects'}</p>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={stopOnFailure} onChange={(e) => setStopOnFailure(e.target.checked)} />
            Stop on failure
          </label>
          <button className="btn-primary" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create Sequence'}
          </button>
        </form>

        <div className="card p-4 lg:col-span-2 space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">Sequence List</h2>
          {isLoading ? <p className="text-xs text-slate-500">Loading...</p> : (
            <div className="space-y-2 max-h-[300px] overflow-auto">
              {sequences.map((s) => (
                <div key={s.id} className="border border-surface-700 rounded-md p-3">
                  <div className="flex items-center gap-2">
                    <button className="text-sm text-slate-200 hover:underline" onClick={() => setSelectedSequenceId(s.id)}>{s.name}</button>
                    <span className="chip-neutral">{s.status}</span>
                    <span className="text-xs text-slate-500 ml-auto">#{s.id}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Steps: {s.steps?.map((st) => st.project_id).join(' -> ') || '-'}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <button className="btn-secondary py-1 px-3 text-xs" onClick={() => runMutation.mutate(s.id)}><Play className="w-3.5 h-3.5" />Run</button>
                    <button className="btn-secondary py-1 px-3 text-xs" onClick={() => setSelectedSequenceId(s.id)}><RefreshCw className="w-3.5 h-3.5" />Status</button>
                    <button className="btn-secondary py-1 px-3 text-xs" onClick={() => exportsAPI.downloadSequenceReport(s.id)}><Download className="w-3.5 h-3.5" />Export</button>
                  </div>
                </div>
              ))}
              {sequences.length === 0 && <p className="text-xs text-slate-500">No sequences yet.</p>}
            </div>
          )}
        </div>

        <div className="card p-4 lg:col-span-3 space-y-2">
          <h2 className="text-sm font-semibold text-slate-200">Sequence Status</h2>
          {!selectedSequenceId && <p className="text-xs text-slate-500">Select a sequence to view status and logs.</p>}
          {selectedStatus && (
            <div className="space-y-2">
              <p className="text-xs text-slate-400">Status: <span className="text-slate-200">{selectedStatus.status}</span></p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="border border-surface-700 rounded-md p-3">
                  <p className="text-xs text-slate-400 mb-2">Step Results</p>
                  <div className="space-y-1 max-h-40 overflow-auto">
                    {selectedStatus.step_results?.map((r) => (
                      <div key={r.id} className="text-xs text-slate-300">
                        Step #{r.step_id}: {r.status} {r.execution_id ? `(exec ${r.execution_id})` : ''}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border border-surface-700 rounded-md p-3">
                  <p className="text-xs text-slate-400 mb-2">Logs</p>
                  <div className="space-y-1 max-h-40 overflow-auto">
                    {selectedStatus.logs?.map((l) => (
                      <div key={l.id} className="text-xs text-slate-300">[{l.level}] {l.message}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

