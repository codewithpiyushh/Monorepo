import { useQuery } from '@tanstack/react-query'
import { auditAPI, authAPI, enterpriseAPI } from '../api'
import PageHeader from '../components/ui/PageHeader'
import { ErrorState, LoadingState } from '../components/ui/PageState'

export default function PlatformAdminPage() {
  const { data: users = [], isLoading: usersLoading, isError: usersError, error: usersErr, refetch: refetchUsers } = useQuery({ queryKey: ['users'], queryFn: authAPI.listUsers })
  const { data: audits, isLoading: auditsLoading, isError: auditsError, error: auditsErr, refetch: refetchAudits } = useQuery({ queryKey: ['audit-preview'], queryFn: () => auditAPI.list({ page: 1, page_size: 10 }) })
  const { data: jobs, isLoading: jobsLoading, isError: jobsError, error: jobsErr, refetch: refetchJobs } = useQuery({ queryKey: ['job-metrics'], queryFn: enterpriseAPI.jobMetrics })
  const { data: schedules = [], isLoading: schedulesLoading, isError: schedulesError, error: schedulesErr, refetch: refetchSchedules } = useQuery({ queryKey: ['report-schedules'], queryFn: enterpriseAPI.listReportSchedules })

  const loading = usersLoading || auditsLoading || jobsLoading || schedulesLoading
  const hasError = usersError || auditsError || jobsError || schedulesError
  const auditRows = audits?.items || []
  const jobDashboard = jobs?.dashboard || {}

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Application Administration" subtitle="Users, audit telemetry, scheduled reports, and operational job health." badge={`${users.length} users`} />
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {loading ? <LoadingState label="Loading platform controls..." /> : null}

        {!loading && hasError ? (
          <ErrorState
            title="Unable to load platform controls"
            description={usersErr?.response?.data?.detail || auditsErr?.response?.data?.detail || jobsErr?.response?.data?.detail || schedulesErr?.response?.data?.detail || 'Please retry in a moment.'}
            action={<button className="btn-secondary" onClick={() => { refetchUsers(); refetchAudits(); refetchJobs(); refetchSchedules() }}>Retry</button>}
          />
        ) : null}

        {!loading && !hasError ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="oracle-kpi p-3"><p className="text-xs text-slate-400">Users</p><p className="text-lg font-semibold text-slate-100">{users.length}</p></div>
              <div className="oracle-kpi p-3"><p className="text-xs text-slate-400">Audit Events (page)</p><p className="text-lg font-semibold text-slate-100">{auditRows.length}</p></div>
              <div className="oracle-kpi p-3"><p className="text-xs text-slate-400">Job Families</p><p className="text-lg font-semibold text-slate-100">{Object.keys(jobDashboard).length}</p></div>
              <div className="oracle-kpi p-3"><p className="text-xs text-slate-400">Report Schedules</p><p className="text-lg font-semibold text-slate-100">{schedules.length}</p></div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
              <div className="card p-3 overflow-auto">
                <p className="text-sm font-semibold text-slate-200 mb-2">Users</p>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-400 border-b border-surface-700"><th className="p-2">Username</th><th className="p-2">Role</th><th className="p-2">Active</th></tr></thead>
                  <tbody>{users.map((u) => <tr key={u.id} className="border-b border-surface-800"><td className="p-2 text-slate-200">{u.username}</td><td className="p-2 text-slate-400">{u.role}</td><td className="p-2 text-slate-400">{u.is_active ? 'Yes' : 'No'}</td></tr>)}</tbody>
                </table>
              </div>

              <div className="card p-3 overflow-auto">
                <p className="text-sm font-semibold text-slate-200 mb-2">Recent Audit Trail</p>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-400 border-b border-surface-700"><th className="p-2">Action</th><th className="p-2">Entity</th><th className="p-2">When</th></tr></thead>
                  <tbody>{auditRows.map((a) => <tr key={a.id} className="border-b border-surface-800"><td className="p-2 text-slate-200">{a.action}</td><td className="p-2 text-slate-400">{a.entity_type}</td><td className="p-2 text-slate-400">{a.created_at ? new Date(a.created_at).toLocaleString() : '-'}</td></tr>)}</tbody>
                </table>
              </div>

              <div className="card p-3 overflow-auto">
                <p className="text-sm font-semibold text-slate-200 mb-2">Job Health</p>
                <div className="space-y-2 text-xs">
                  {Object.entries(jobDashboard).length === 0 ? <p className="text-slate-500">No job metrics available.</p> : Object.entries(jobDashboard).map(([name, stats]) => (
                    <div key={name} className="border border-surface-700 p-2">
                      <p className="text-slate-200 font-medium">{name}</p>
                      <p className="text-slate-400">Runs: {stats.runs} | Failed: {stats.failed} | Avg ms: {stats.avg_duration_ms}</p>
                    </div>
                  ))}
                </div>
                <p className="text-sm font-semibold text-slate-200 mt-4 mb-2">Scheduled Reports</p>
                <div className="space-y-1 text-xs text-slate-400">
                  {schedules.length === 0 ? <p>No report schedules configured.</p> : schedules.map((s) => <p key={s.id}>#{s.id} {s.report_type} ({s.active ? 'active' : 'inactive'})</p>)}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
