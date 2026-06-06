import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { enterpriseAPI } from '../api'
import { advancedAPI } from '../api'
import toast from 'react-hot-toast'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/PageState'
import { Play, Zap, RefreshCw, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2 } from 'lucide-react'

const CLASS_COLOR = { FULL_MATCH: 'var(--ok)', PARTIAL_MATCH: 'var(--warn)', UNMATCHED: 'var(--bad)', VARIANCE_FLAGGED: '#c026d3' }
const STRATEGY_LABEL = { exact: 'Exact', tolerance: 'Tolerance', date_window: 'Date Window', fuzzy: 'Fuzzy', many_to_one: 'Many→One', one_to_many: 'One→Many', cross_period: 'Cross-Period', rule_based: 'Rule-Based', unmatched: 'Unmatched' }

export default function TransactionMatchingWorkspace() {
  const [profileId,         setProfileId]         = useState('')
  const [threshold,         setThreshold]         = useState('0.92')
  const [crossPeriodDays,   setCrossPeriodDays]   = useState('90')
  const [minConfidence,     setMinConfidence]     = useState('0.50')
  const [topK,              setTopK]              = useState('25')
  const [showAdvanced,      setShowAdvanced]      = useState(false)
  const [activeTab,         setActiveTab]         = useState('matches')
  const [matchPage,         setMatchPage]         = useState(1)
  const [exceptionPage,     setExceptionPage]     = useState(1)
  const PAGE_SIZE = 10

  // Legacy fields
  const [legacyStrategy,    setLegacyStrategy]    = useState('rule_based')
  const [fxAmount,          setFxAmount]          = useState('1000')
  const [fxFrom,            setFxFrom]            = useState('USD')
  const [fxTo,              setFxTo]              = useState('INR')
  const [fxDate,            setFxDate]            = useState('')

  const qc = useQueryClient()
  const { data: profiles = [] } = useQuery({ queryKey: ['enterprise-profiles'], queryFn: enterpriseAPI.listProfiles })

  const selectedProfile = useMemo(() => profiles.find((p) => String(p.id) === String(profileId)) || null, [profiles, profileId])

  // Fetch match groups for selected profile
  const { data: matchGroups = [], isLoading: mgLoading, refetch: refetchGroups } = useQuery({
    queryKey: ['profile-transactions', profileId],
    queryFn: () => advancedAPI.profileTransactions(Number(profileId)),
    enabled: Boolean(profileId),
  })

  // Fetch exceptions for selected profile
  const { data: exceptions = [], refetch: refetchExc } = useQuery({
    queryKey: ['exceptions-profile', profileId],
    queryFn: () => advancedAPI.exceptionsWithProfile({ profile_id: profileId }),
    enabled: Boolean(profileId),
  })

  // Advanced matching
  const advancedMutation = useMutation({
    mutationFn: (payload) => advancedAPI.runAdvancedMatching(payload),
    onSuccess: (d) => {
      toast.success(`Advanced matching: ${d.match_groups} groups, ${d.exceptions} exceptions, ${d.auto_match_rate}% auto-matched`)
      refetchGroups(); refetchExc()
    },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Matching failed'),
  })

  // Legacy matching
  const legacyMutation = useMutation({
    mutationFn: enterpriseAPI.runMatching,
    onSuccess: (d) => { toast.success(`Matching: ${d.match_groups} groups, ${d.exceptions} exceptions`); refetchGroups(); refetchExc() },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Matching failed'),
  })

  // Suggestions
  const suggestionsMutation = useMutation({
    mutationFn: ({ pid, topK, minConf }) => advancedAPI.getMatchSuggestionsAdvanced(pid, { top_k: topK, min_confidence: minConf }),
    onError: (e) => toast.error(e?.response?.data?.detail || 'Suggestions failed'),
  })

  // FX
  const fxMutation = useMutation({
    mutationFn: enterpriseAPI.convertFx,
    onError: (e) => toast.error(e?.response?.data?.detail || 'FX failed'),
  })

  // Match group stats
  const stats = useMemo(() => {
    const full    = matchGroups.filter((m) => m.classification === 'FULL_MATCH').length
    const partial = matchGroups.filter((m) => m.classification === 'PARTIAL_MATCH').length
    const unmatched = matchGroups.filter((m) => m.classification === 'UNMATCHED').length
    const varFlagged = matchGroups.filter((m) => m.classification === 'VARIANCE_FLAGGED').length
    const rate = matchGroups.length ? Math.round(full / matchGroups.length * 100) : 0
    return { total: matchGroups.length, full, partial, unmatched, varFlagged, rate }
  }, [matchGroups])

  // Phase breakdown from last advanced run
  const phaseBreakdown = advancedMutation.data?.phase_breakdown

  const matchTotalPages = Math.max(1, Math.ceil(matchGroups.length / PAGE_SIZE))
  const exceptionTotalPages = Math.max(1, Math.ceil(exceptions.length / PAGE_SIZE))

  const visibleMatchGroups = useMemo(() => {
    const start = (matchPage - 1) * PAGE_SIZE
    return matchGroups.slice(start, start + PAGE_SIZE)
  }, [matchGroups, matchPage])

  const visibleExceptions = useMemo(() => {
    const start = (exceptionPage - 1) * PAGE_SIZE
    return exceptions.slice(start, start + PAGE_SIZE)
  }, [exceptions, exceptionPage])

  useEffect(() => {
    setMatchPage(1)
    setExceptionPage(1)
  }, [profileId])

  useEffect(() => {
    setMatchPage((page) => Math.min(page, matchTotalPages))
  }, [matchTotalPages])

  useEffect(() => {
    setExceptionPage((page) => Math.min(page, exceptionTotalPages))
  }, [exceptionTotalPages])

  const TABS = [
    { id: 'matches',     label: `Match Groups (${stats.total})` },
    { id: 'exceptions',  label: `Exceptions (${exceptions.length})` },
    { id: 'suggestions', label: 'AI Suggestions' },
    { id: 'fx',          label: 'FX Utility' },
  ]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, sans-serif' }}>
      <PageHeader
        title="Transaction Matching Workspace"
        subtitle="Run advanced 4-phase matching, view match groups, exceptions and AI suggestions."
      />

      <div className="flex-1 overflow-auto p-5 space-y-4" style={{ background: 'var(--surface-0)' }}>

        {/* ── Control panel ─────────────────────────── */}
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
            <div>
              <label className="label">Reconciliation Profile</label>
              <select className="input" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                <option value="">Select profile…</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.name} ({(p.reconciliation_type||'').replace(/_/g,' ')})</option>)}
              </select>
            </div>
            <div>
              <label className="label">Auto-Match Threshold</label>
              <input className="input" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="0.92" />
            </div>
            <div>
              <label className="label">Cross-Period Days</label>
              <input className="input" value={crossPeriodDays} onChange={(e) => setCrossPeriodDays(e.target.value)} placeholder="90" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary h-[38px]"
                disabled={!profileId || advancedMutation.isPending}
                onClick={() => advancedMutation.mutate({ profile_id: Number(profileId), auto_match_threshold: Number(threshold) || 0.92, cross_period_days: Number(crossPeriodDays) || 90 })}>
                <Zap style={{ width: 13, height: 13 }} />
                {advancedMutation.isPending ? 'Running…' : 'Run Advanced Match'}
              </button>
            </div>
          </div>

          {/* Advanced toggle */}
          <div style={{ marginTop: 10 }}>
            <button className="btn-ghost text-xs h-7" onClick={() => setShowAdvanced((v) => !v)}>
              {showAdvanced ? <ChevronUp style={{ width: 12, height: 12 }} /> : <ChevronDown style={{ width: 12, height: 12 }} />}
              {showAdvanced ? 'Hide' : 'Show'} legacy matching options
            </button>
            {showAdvanced && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, marginTop: 10 }}>
                <select className="input text-xs" value={legacyStrategy} onChange={(e) => setLegacyStrategy(e.target.value)}>
                  {['rule_based','exact','tolerance','fuzzy','date_window','many_to_many'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <div />
                <button className="btn-secondary text-xs h-[38px]"
                  disabled={!profileId || legacyMutation.isPending}
                  onClick={() => legacyMutation.mutate({ profile_id: Number(profileId), strategy: legacyStrategy, auto_match_threshold: Number(threshold) || 0.92 })}>
                  {legacyMutation.isPending ? 'Running…' : 'Run Legacy Match'}
                </button>
              </div>
            )}
          </div>

          {/* Profile config hint */}
          {selectedProfile && (
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
              Profile config: tolerance {selectedProfile.tolerance_threshold}% · date window {selectedProfile.date_window_days}d · risk {selectedProfile.risk_classification}
            </p>
          )}
        </div>

        {/* ── KPI strip ──────────────────────────────── */}
        {profileId && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
            {[
              ['Total Groups', stats.total,     'var(--text-primary)'],
              ['Full Match',   stats.full,      'var(--ok)'],
              ['Partial',      stats.partial,   'var(--warn)'],
              ['Unmatched',    stats.unmatched, 'var(--bad)'],
              ['Auto Rate',    `${stats.rate}%`, stats.rate >= 85 ? 'var(--ok)' : stats.rate >= 60 ? 'var(--warn)' : 'var(--bad)'],
            ].map(([label, val, color]) => (
              <div key={label} style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 8, padding: '10px 14px' }}>
                <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{label}</p>
                <p style={{ fontSize: 22, fontWeight: 700, color }}>{val}</p>
              </div>
            ))}
          </div>
        )}

        {/* Phase breakdown */}
        {phaseBreakdown && (
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: '12px 16px' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>Phase Breakdown (last run)</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
              {[
                ['1:1 Holistic',   phaseBreakdown.one_to_one,   'var(--accent)'],
                ['Many→One',       phaseBreakdown.many_to_one,  'var(--info)'],
                ['One→Many',       phaseBreakdown.one_to_many,  'var(--info)'],
                ['Cross-Period',   phaseBreakdown.cross_period, '#a855f7'],
                ['Unmatched',      phaseBreakdown.unmatched,    'var(--bad)'],
              ].map(([label, val, color]) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{label}</p>
                  <p style={{ fontSize: 18, fontWeight: 700, color }}>{val ?? 0}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Tab content ────────────────────────────── */}
        {profileId && (
          <>
            <div className="bl-page-tabs">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  className={`bl-tab${activeTab === t.id ? ' active' : ''}`}
                  onClick={() => setActiveTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Match Groups */}
            {activeTab === 'matches' && (
              matchGroups.length === 0 ? (
                <EmptyState title="No match groups" description="Run matching to populate this view." />
              ) : (
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border-1)' }}>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>
                      Showing {(matchPage - 1) * PAGE_SIZE + 1}-{Math.min(matchPage * PAGE_SIZE, matchGroups.length)} of {matchGroups.length}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        className="btn-secondary text-xs h-8"
                        disabled={matchPage <= 1}
                        onClick={() => setMatchPage((page) => Math.max(1, page - 1))}
                      >
                        Prev
                      </button>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Page {matchPage} of {matchTotalPages}
                      </span>
                      <button
                        className="btn-secondary text-xs h-8"
                        disabled={matchPage >= matchTotalPages}
                        onClick={() => setMatchPage((page) => Math.min(matchTotalPages, page + 1))}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                  <table className="data-table" style={{ borderRadius: 0 }}>
                    <thead><tr><th>ID</th><th>Classification</th><th>Strategy</th><th>Confidence</th><th>Variance</th><th>Records</th><th>Status</th></tr></thead>
                    <tbody>
                      {visibleMatchGroups.map((mg) => {
                        const color = CLASS_COLOR[mg.classification] || 'var(--text-tertiary)'
                        return (
                          <tr key={mg.id}>
                            <td style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}>#{mg.id}</td>
                            <td><span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 9999, background: `${color}14`, border: `1px solid ${color}33`, color }}>{mg.classification}</span></td>
                            <td style={{ fontSize: 11 }}>{STRATEGY_LABEL[mg.strategy] || mg.strategy}</td>
                            <td style={{ fontSize: 12, fontWeight: 600, color: mg.confidence >= 0.92 ? 'var(--ok)' : mg.confidence >= 0.7 ? 'var(--warn)' : 'var(--bad)' }}>
                              {Math.round((mg.confidence || 0) * 100)}%
                            </td>
                            <td style={{ fontSize: 12, color: mg.variance_amount > 0 ? 'var(--warn)' : 'var(--ok)' }}>
                              {mg.variance_amount > 0 ? `$${Number(mg.variance_amount).toFixed(2)}` : '—'}
                            </td>
                            <td style={{ fontSize: 11 }}>{mg.item_count || 0}</td>
                            <td style={{ fontSize: 10, color: mg.reconciled ? 'var(--ok)' : 'var(--text-tertiary)' }}>
                              {mg.reconciled ? '✓ Reconciled' : '— Pending'}
                            </td>
                          </tr>
                          )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* Exceptions */}
            {activeTab === 'exceptions' && (
              exceptions.length === 0 ? (
                <EmptyState title="No exceptions" description="Run matching to detect exceptions." />
              ) : (
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border-1)' }}>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>
                      Showing {(exceptionPage - 1) * PAGE_SIZE + 1}-{Math.min(exceptionPage * PAGE_SIZE, exceptions.length)} of {exceptions.length}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        className="btn-secondary text-xs h-8"
                        disabled={exceptionPage <= 1}
                        onClick={() => setExceptionPage((page) => Math.max(1, page - 1))}
                      >
                        Prev
                      </button>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Page {exceptionPage} of {exceptionTotalPages}
                      </span>
                      <button
                        className="btn-secondary text-xs h-8"
                        disabled={exceptionPage >= exceptionTotalPages}
                        onClick={() => setExceptionPage((page) => Math.min(exceptionTotalPages, page + 1))}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                  <table className="data-table" style={{ borderRadius: 0 }}>
                    <thead><tr><th>ID</th><th>Status</th><th>Queue</th><th>Classification</th><th>Variance</th><th>Comments</th></tr></thead>
                    <tbody>
                      {visibleExceptions.map((exc) => {
                        const statusColor = { OPEN: 'var(--bad)', IN_PROGRESS: 'var(--warn)', RESOLVED: 'var(--ok)', ESCALATED: '#c026d3' }
                        const color = statusColor[exc.status] || 'var(--text-tertiary)'
                        return (
                          <tr key={exc.id}>
                            <td style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}>#{exc.id}</td>
                            <td><span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 9999, background: `${color}14`, border: `1px solid ${color}33`, color }}>{exc.status}</span></td>
                            <td style={{ fontSize: 11 }}>{exc.queue_type}</td>
                            <td style={{ fontSize: 11 }}>{exc.classification || exc.mg_classification || '—'}</td>
                            <td style={{ fontSize: 11, color: exc.mg_variance > 0 ? 'var(--warn)' : 'var(--text-tertiary)' }}>
                              {exc.mg_variance > 0 ? `$${Number(exc.mg_variance).toFixed(2)}` : '—'}
                            </td>
                            <td style={{ fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exc.comments || '—'}</td>
                          </tr>
                          )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* AI Suggestions */}
            {activeTab === 'suggestions' && (
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: 16 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'end', marginBottom: 16 }}>
                  <div>
                    <label className="label">Min Confidence</label>
                    <input className="input text-xs w-28" value={minConfidence} onChange={(e) => setMinConfidence(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Top K</label>
                    <input className="input text-xs w-20" value={topK} onChange={(e) => setTopK(e.target.value)} />
                  </div>
                  <button className="btn-primary text-xs h-[38px]"
                    disabled={!profileId || suggestionsMutation.isPending}
                    onClick={() => suggestionsMutation.mutate({ pid: Number(profileId), topK: Number(topK) || 25, minConf: Number(minConfidence) || 0.5 })}>
                    {suggestionsMutation.isPending ? 'Loading…' : 'Get AI Suggestions'}
                  </button>
                </div>
                {(suggestionsMutation.data?.items || []).length === 0
                  ? <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No suggestions yet. Run suggestions to surface likely matches for unmatched records.</p>
                  : (
                    <table className="data-table" style={{ borderRadius: 0 }}>
                      <thead><tr><th>Source Ref</th><th>Target Ref</th><th>Confidence</th><th>Amount Delta</th></tr></thead>
                      <tbody>
                        {suggestionsMutation.data.items.map((s, i) => (
                          <tr key={i}>
                            <td style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}>{s.left_reference || `Rec #${s.left_record_id}`}</td>
                            <td style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}>{s.right_reference || `Rec #${s.right_record_id}`}</td>
                            <td style={{ fontWeight: 600, color: s.confidence >= 0.8 ? 'var(--ok)' : 'var(--warn)' }}>{Math.round(s.confidence * 100)}%</td>
                            <td style={{ color: Math.abs(s.amount_delta) > 0 ? 'var(--warn)' : 'var(--ok)' }}>${s.amount_delta}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
              </div>
            )}

            {/* FX */}
            {activeTab === 'fx' && (
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>FX Conversion Utility</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
                  <div><label className="label">Amount</label><input className="input" value={fxAmount} onChange={(e) => setFxAmount(e.target.value)} /></div>
                  <div><label className="label">From</label><input className="input" value={fxFrom} onChange={(e) => setFxFrom(e.target.value.toUpperCase())} /></div>
                  <div><label className="label">To</label><input className="input" value={fxTo} onChange={(e) => setFxTo(e.target.value.toUpperCase())} /></div>
                  <div><label className="label">Date</label><input className="input" type="date" value={fxDate} onChange={(e) => setFxDate(e.target.value)} /></div>
                  <button className="btn-secondary h-[38px]" onClick={() => fxMutation.mutate({ amount: Number(fxAmount), from_currency: fxFrom, to_currency: fxTo, conversion_date: fxDate || undefined })}>Convert</button>
                </div>
                {fxMutation.data && (
                  <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--surface-1)', borderRadius: 8, fontSize: 13, color: 'var(--text-primary)' }}>
                    <strong>{fxMutation.data.converted_amount}</strong> {fxTo} · Rate: {fxMutation.data.rate} · FX Variance: {fxMutation.data.fx_variance}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {!profileId && (
          <EmptyState title="Select a profile" description="Choose a reconciliation profile above to view match groups and run matching." />
        )}
      </div>
    </div>
  )
}
