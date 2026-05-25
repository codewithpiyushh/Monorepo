import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { enterpriseAPI } from '../api'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/PageState'

export default function CloseCertificationPage() {
  const { data: calendars = [], isLoading: calLoading, isError: calError, error: calErr, refetch: refetchCal } = useQuery({ queryKey: ['close-cal'], queryFn: () => enterpriseAPI.listCloseCalendar() })
  const { data: workflows = [], isLoading: wfLoading, isError: wfError, error: wfErr, refetch: refetchWf } = useQuery({ queryKey: ['cert-workflows'], queryFn: () => enterpriseAPI.listCertificationWorkflows() })

  const kpis = useMemo(() => ({
    periods: calendars.length,
    locked: calendars.filter((c) => c.is_locked).length,
    workflowOpen: workflows.filter((w) => !['CLOSED', 'CERTIFIED', 'FORCE_CLOSED'].includes((w.status || '').toUpperCase())).length,
    workflowClosed: workflows.filter((w) => ['CLOSED', 'CERTIFIED', 'FORCE_CLOSED'].includes((w.status || '').toUpperCase())).length,
  }), [calendars, workflows])

  const loading = calLoading || wfLoading
  const hasError = calError || wfError

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Period Close Monitor" subtitle="Manage period controls and certification state progression with traceable workflow history." badge={`${kpis.periods} periods`} />
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {loading ? <LoadingState label="Loading close and certification..." /> : null}

        {!loading && hasError ? (
          <ErrorState
            title="Unable to load close or certification data"
            description={calErr?.response?.data?.detail || wfErr?.response?.data?.detail || 'Please retry in a moment.'}
            action={<button className="btn-secondary" onClick={() => { refetchCal(); refetchWf() }}>Retry</button>}
          />
        ) : null}

        {!loading && !hasError ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="oracle-kpi p-3"><p className="text-xs text-slate-400">Close Periods</p><p className="text-lg font-semibold text-slate-100">{kpis.periods}</p></div>
              <div className="oracle-kpi p-3"><p className="text-xs text-slate-400">Locked</p><p className="text-lg font-semibold text-slate-100">{kpis.locked}</p></div>
              <div className="oracle-kpi p-3"><p className="text-xs text-slate-400">Workflow Open</p><p className="text-lg font-semibold text-slate-100">{kpis.workflowOpen}</p></div>
              <div className="oracle-kpi p-3"><p className="text-xs text-slate-400">Workflow Closed</p><p className="text-lg font-semibold text-slate-100">{kpis.workflowClosed}</p></div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <div className="card p-3 overflow-auto">
                <p className="text-sm font-semibold text-slate-200 mb-2">Close Calendar</p>
                {calendars.length === 0 ? <EmptyState title="No close periods" description="Create close periods from reconciliation profile workflows." /> : (
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-slate-400 border-b border-surface-700"><th className="p-2">Period</th><th className="p-2">Cycle</th><th className="p-2">Due Date</th><th className="p-2">Locked</th></tr></thead>
                    <tbody>
                      {calendars.map((c) => <tr key={c.id} className="border-b border-surface-800"><td className="p-2 text-slate-200">{c.period_key}</td><td className="p-2 text-slate-400">{c.cycle_type}</td><td className="p-2 text-slate-400">{c.due_date}</td><td className="p-2 text-slate-400">{c.is_locked ? 'Yes' : 'No'}</td></tr>)}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="card p-3 overflow-auto">
                <p className="text-sm font-semibold text-slate-200 mb-2">Certification Workflows</p>
                {workflows.length === 0 ? <EmptyState title="No certification workflows" description="Create workflow instances to start close sign-off." /> : (
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-slate-400 border-b border-surface-700"><th className="p-2">Workflow</th><th className="p-2">Profile</th><th className="p-2">Stage</th><th className="p-2">Status</th></tr></thead>
                    <tbody>
                      {workflows.map((w) => <tr key={w.id} className="border-b border-surface-800"><td className="p-2 text-slate-200">#{w.id}</td><td className="p-2 text-slate-400">{w.profile_id}</td><td className="p-2 text-slate-400">{w.current_stage}</td><td className="p-2 text-slate-400">{w.status}</td></tr>)}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
