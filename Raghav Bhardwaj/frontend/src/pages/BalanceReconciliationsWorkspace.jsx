import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { enterpriseAPI } from '../api'
import toast from 'react-hot-toast'

export default function BalanceReconciliationsWorkbench() {
  const [batchId, setBatchId] = useState('')
  const [profileId, setProfileId] = useState('')

  const { data: profiles = [] } = useQuery({ queryKey: ['enterprise-profiles'], queryFn: enterpriseAPI.listProfiles })
  const loadMutation = useMutation({
    mutationFn: ({ b, p }) => enterpriseAPI.loadBatch(b, p),
    onSuccess: (d) => toast.success(`Loaded ${d.loaded_count} records`),
    onError: (e) => toast.error(e.response?.data?.detail || 'Load failed'),
  })

  return (
    <div className="h-full flex flex-col">
      <div className="section-header"><h1 className="text-base font-semibold text-white">Balance Reconciliations Workbench</h1></div>
      <div className="p-6">
        <div className="card p-4 space-y-3 max-w-2xl">
          <p className="text-xs text-slate-500">
            Use this workspace to load validated transformed data into balance reconciliation records by profile.
          </p>
          <input className="input" value={batchId} onChange={(e) => setBatchId(e.target.value)} placeholder="Batch ID (validated)" />
          <select className="input" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            <option value="">Select reconciliation profile</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.id} - {p.name}</option>
            ))}
          </select>
          <button
            className="btn-primary"
            disabled={!batchId || !profileId}
            onClick={() => loadMutation.mutate({ b: batchId, p: Number(profileId) })}
          >
            Load to Balance Reconciliation
          </button>
        </div>
      </div>
    </div>
  )
}

