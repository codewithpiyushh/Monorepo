import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { enterpriseAPI } from '../api'
import toast from 'react-hot-toast'

export default function TransactionMatchingWorkbench() {
  const [profileId, setProfileId] = useState('')
  const [strategy, setStrategy] = useState('rule_based')
  const [threshold, setThreshold] = useState('0.92')
  const [suggestionMinConfidence, setSuggestionMinConfidence] = useState('0.70')
  const [suggestionTopK, setSuggestionTopK] = useState('25')
  const [fxAmount, setFxAmount] = useState('1000')
  const [fxFrom, setFxFrom] = useState('USD')
  const [fxTo, setFxTo] = useState('INR')
  const [fxDate, setFxDate] = useState('')
  const [journalPeriod, setJournalPeriod] = useState('')
  const [journalMinAmount, setJournalMinAmount] = useState('0')
  const [journalReportingCurrency, setJournalReportingCurrency] = useState('USD')

  const { data: profiles = [] } = useQuery({ queryKey: ['enterprise-profiles'], queryFn: enterpriseAPI.listProfiles })

  const matchMutation = useMutation({
    mutationFn: enterpriseAPI.runMatching,
    onSuccess: (d) => toast.success(`Matching completed: groups=${d.match_groups}, exceptions=${d.exceptions}`),
    onError: (e) => toast.error(e.response?.data?.detail || 'Matching failed'),
  })

  const suggestionsMutation = useMutation({
    mutationFn: enterpriseAPI.matchSuggestions,
    onError: (e) => toast.error(e.response?.data?.detail || 'Unable to fetch suggestions'),
  })

  const autoJournalMutation = useMutation({
    mutationFn: enterpriseAPI.autoJournal,
    onSuccess: (d) => toast.success(`Auto journal created: ${d.created_count}`),
    onError: (e) => toast.error(e.response?.data?.detail || 'Auto journal failed'),
  })

  const fxMutation = useMutation({
    mutationFn: enterpriseAPI.convertFx,
    onError: (e) => toast.error(e.response?.data?.detail || 'FX conversion failed'),
  })

  const selectedProfile = useMemo(
    () => profiles.find((p) => String(p.id) === String(profileId)) || null,
    [profiles, profileId],
  )
  const effectiveReportingCurrency = (journalReportingCurrency || 'USD').toUpperCase()

  const suggestionItems = suggestionsMutation.data?.items || []

  return (
    <div className="h-full flex flex-col">
      <div className="section-header"><h1 className="text-base font-semibold text-white">Transaction Matching Workbench</h1></div>
      <div className="p-6 space-y-4">
        <div className="card p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <select className="input" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              <option value="">Select profile</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.id} - {p.name} ({p.reconciliation_type})</option>)}
            </select>
            <select className="input" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
              <option value="rule_based">rule_based (recommended)</option>
              <option value="exact">exact</option>
              <option value="tolerance">tolerance</option>
              <option value="fuzzy">fuzzy_text</option>
              <option value="date_window">date_window</option>
              <option value="many_to_many">many_to_many</option>
            </select>
            <input className="input" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="Auto-match threshold (0-1)" />
            <button
              className="btn-primary"
              disabled={!profileId || matchMutation.isPending}
              onClick={() => matchMutation.mutate({ profile_id: Number(profileId), strategy, auto_match_threshold: Number(threshold) || 0.92 })}
            >
              {matchMutation.isPending ? 'Running...' : 'Run Matching'}
            </button>
          </div>
          {selectedProfile ? (
            <p className="text-xs text-slate-400">
              Profile config: tolerance {selectedProfile.tolerance_threshold}, date window {selectedProfile.date_window_days}, risk {selectedProfile.risk_classification}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="card p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-100">Auto Match Suggestions</h2>
            <div className="grid grid-cols-2 gap-2">
              <input className="input" value={suggestionMinConfidence} onChange={(e) => setSuggestionMinConfidence(e.target.value)} placeholder="Min confidence" />
              <input className="input" value={suggestionTopK} onChange={(e) => setSuggestionTopK(e.target.value)} placeholder="Top K (max 200)" />
              <button
                className="btn-secondary col-span-2"
                disabled={!profileId || suggestionsMutation.isPending}
                onClick={() =>
                  suggestionsMutation.mutate({
                    profile_id: Number(profileId),
                    top_k: Number(suggestionTopK) || 25,
                    min_confidence: Number(suggestionMinConfidence) || 0.7,
                  })
                }
              >
                {suggestionsMutation.isPending ? 'Loading...' : 'Get Suggestions'}
              </button>
            </div>
            <div className="max-h-[360px] overflow-auto space-y-2">
              {!suggestionItems.length ? <p className="text-xs text-slate-500">No suggestions yet.</p> : null}
              {suggestionItems.map((s) => (
                <div key={`${s.left_record_id}-${s.right_record_id}`} className="rounded-lg border border-surface-700 p-2">
                  <p className="text-xs text-slate-300">
                    {s.left_reference} -&gt; {s.right_reference}
                  </p>
                  <p className="text-xs text-slate-400">
                    confidence {Math.round((s.confidence || 0) * 100)}% | delta {s.amount_delta}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-100">Journal Entry Automation</h2>
            <div className="grid grid-cols-2 gap-2">
              <input className="input" value={journalPeriod} onChange={(e) => setJournalPeriod(e.target.value)} placeholder="Period key (optional)" />
              <input className="input" value={journalMinAmount} onChange={(e) => setJournalMinAmount(e.target.value)} placeholder="Min absolute amount" />
              <input className="input col-span-2" value={journalReportingCurrency} onChange={(e) => setJournalReportingCurrency(e.target.value.toUpperCase())} placeholder="Reporting currency (e.g. USD)" />
              <button
                className="btn-secondary col-span-2"
                disabled={!profileId || autoJournalMutation.isPending}
                onClick={() =>
                  autoJournalMutation.mutate({
                    profile_id: Number(profileId),
                    period_key: journalPeriod || undefined,
                    min_amount: Number(journalMinAmount) || 0,
                    reporting_currency: effectiveReportingCurrency,
                  })
                }
              >
                {autoJournalMutation.isPending ? 'Generating...' : 'Auto Generate Journals'}
              </button>
            </div>
            <div className="max-h-[200px] overflow-auto space-y-2">
              {(autoJournalMutation.data?.items || []).map((j) => (
                <div key={j.adjustment_id} className="rounded-lg border border-surface-700 p-2 text-xs text-slate-300">
                  #{j.adjustment_id} {j.account} {j.currency} {j.amount}
                  {j.converted_amount != null ? ` | converted ${j.converted_amount}` : ''}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-100">FX Conversion Utility</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            <input className="input" value={fxAmount} onChange={(e) => setFxAmount(e.target.value)} placeholder="Amount" />
            <input className="input" value={fxFrom} onChange={(e) => setFxFrom(e.target.value.toUpperCase())} placeholder="From" />
            <input className="input" value={fxTo} onChange={(e) => setFxTo(e.target.value.toUpperCase())} placeholder="To" />
            <input className="input" type="date" value={fxDate} onChange={(e) => setFxDate(e.target.value)} />
            <button
              className="btn-secondary"
              onClick={() => fxMutation.mutate({ amount: Number(fxAmount) || 0, from_currency: fxFrom, to_currency: fxTo, conversion_date: fxDate || undefined })}
            >
              Convert
            </button>
          </div>
          {fxMutation.data ? (
            <p className="text-sm text-slate-200">
              Converted: {fxMutation.data.converted_amount} | Rate: {fxMutation.data.rate} | FX Variance: {fxMutation.data.fx_variance}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
