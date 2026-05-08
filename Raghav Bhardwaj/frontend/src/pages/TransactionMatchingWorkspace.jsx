import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { enterpriseAPI } from '../api'
import toast from 'react-hot-toast'

export default function TransactionMatchingWorkspace() {
  const [profileId, setProfileId] = useState('')
  const [strategy, setStrategy] = useState('rule_based')
  const [threshold, setThreshold] = useState('1')

  const { data: profiles = [] } = useQuery({ queryKey: ['enterprise-profiles'], queryFn: enterpriseAPI.listProfiles })
  const matchMutation = useMutation({
    mutationFn: enterpriseAPI.runMatching,
    onSuccess: (d) => toast.success(`Matching completed: groups=${d.match_groups}, exceptions=${d.exceptions}`),
    onError: (e) => toast.error(e.response?.data?.detail || 'Matching failed'),
  })

  return (
    <div className="h-full flex flex-col">
      <div className="section-header"><h1 className="text-base font-semibold text-white">Transaction Matching Workspace</h1></div>
      <div className="p-6">
        <div className="card p-4 space-y-3 max-w-2xl">
          <select className="input" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            <option value="">Select profile</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.id} - {p.name}</option>)}
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
            disabled={!profileId || matchMutation.isPending}
            onClick={() => matchMutation.mutate({ profile_id: Number(profileId), strategy, auto_match_threshold: Number(threshold) || 1 })}
          >
            {matchMutation.isPending ? 'Running...' : 'Run Matching'}
          </button>
        </div>
      </div>
    </div>
  )
}

