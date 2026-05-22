import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AgGridReact } from 'ag-grid-react'
import toast from 'react-hot-toast'
import ReactECharts from 'echarts-for-react'
import { enterpriseAPI } from '../api'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, LoadingState } from '../components/ui/PageState'
import { Briefcase, SlidersHorizontal, Sparkles, ChevronRight } from 'lucide-react'

const CHART_AXIS = '#6c84ab'
const CHART_BLUE = ['#1f66cc', '#2f78ec', '#3f8ef5', '#5aa6ff', '#88c2ff']

function MetricCard({ label, value }) {
  return (
    <div className="card p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-100">{value}</p>
    </div>
  )
}

export default function EnterpriseReconciliationCenter() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState([])
  const [bulkAction, setBulkAction] = useState('ASSIGN')
  const [targetUser, setTargetUser] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [filters, setFilters] = useState({
    account_number: '',
    period: '',
    risk_level: '',
    status: '',
  })
  const [profileId, setProfileId] = useState('')
  const [comment, setComment] = useState('')
  const [reportingCurrency, setReportingCurrency] = useState('USD')
  const [activeView, setActiveView] = useState('operate')

  const searchFilters = useMemo(
    () => ({
      account_number: filters.account_number || undefined,
      period: filters.period || undefined,
      risk_level: filters.risk_level || undefined,
      status: filters.status || undefined,
    }),
    [filters]
  )

  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['executive-dashboard'],
    queryFn: enterpriseAPI.executiveDashboard,
    refetchInterval: 15000,
  })
  const { data: rows = [], isLoading: rowsLoading } = useQuery({
    queryKey: ['advanced-search', searchFilters],
    queryFn: () => enterpriseAPI.advancedSearch(searchFilters),
  })
  const { data: comments = [] } = useQuery({
    queryKey: ['comments', profileId],
    queryFn: () => enterpriseAPI.listComments(profileId),
    enabled: !!profileId,
  })
  const { data: varianceData } = useQuery({
    queryKey: ['variance', profileId],
    queryFn: () => enterpriseAPI.variance(profileId),
    enabled: !!profileId,
  })
  const { data: fxData } = useQuery({
    queryKey: ['fx', profileId, reportingCurrency],
    queryFn: () => enterpriseAPI.fxReconciliation(profileId, reportingCurrency),
    enabled: !!profileId,
  })

  const bulkMutation = useMutation({
    mutationFn: enterpriseAPI.bulkActions,
    onSuccess: () => {
      toast.success('Bulk action completed')
      qc.invalidateQueries({ queryKey: ['advanced-search'] })
    },
  })

  const commentMutation = useMutation({
    mutationFn: enterpriseAPI.addComment,
    onSuccess: () => {
      toast.success('Comment added')
      setComment('')
      qc.invalidateQueries({ queryKey: ['comments'] })
    },
  })

  const columns = useMemo(
    () => [
      { headerName: 'ID', field: 'id', checkboxSelection: true, headerCheckboxSelection: true, width: 90 },
      { headerName: 'Profile Name', field: 'name', flex: 1 },
      { headerName: 'Status', field: 'lifecycle_state', width: 130 },
      { headerName: 'Risk', field: 'risk_classification', width: 110 },
      { headerName: 'Type', field: 'reconciliation_type', width: 120 },
      { headerName: 'Frequency', field: 'frequency', width: 110 },
      { headerName: 'Reviewer', field: 'assigned_reviewer', width: 120 },
    ],
    []
  )

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Enterprise Reconciliation Workspace"
        subtitle="Premium control center with a queue-first operating model."
        badge={`${rows.length} profiles`}
        actions={(
          <>
            <button
              className="btn-secondary text-xs"
              onClick={() => enterpriseAPI.generateAgingReminders().then(() => toast.success('Reminders generated'))}
            >
              Run Reminders
            </button>
            <button className="btn-secondary text-xs" onClick={() => setShowAdvanced((v) => !v)}>
              {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
            </button>
          </>
        )}
      />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        <div className="card oracle-hero p-4 md:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">Enterprise Control Plane</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-100">Simplified Operations, Premium Visibility</h2>
              <p className="mt-1 text-sm text-slate-400">Start in Operate mode for daily execution. Switch to Analyze only when you need deep diagnostics.</p>
            </div>
            <div className="hidden md:flex items-center gap-2 rounded-xl border border-surface-600 bg-surface-800/50 p-2">
              <button
                className={`px-3 py-1.5 text-xs rounded-lg ${activeView === 'operate' ? 'bg-brand-900/30 text-slate-100 border border-brand-600/40' : 'text-slate-400'}`}
                onClick={() => setActiveView('operate')}
              >
                <Briefcase className="inline w-3.5 h-3.5 mr-1" />
                Operate
              </button>
              <button
                className={`px-3 py-1.5 text-xs rounded-lg ${activeView === 'analyze' ? 'bg-brand-900/30 text-slate-100 border border-brand-600/40' : 'text-slate-400'}`}
                onClick={() => setActiveView('analyze')}
              >
                <SlidersHorizontal className="inline w-3.5 h-3.5 mr-1" />
                Analyze
              </button>
            </div>
          </div>
        </div>

        {metricsLoading ? <LoadingState label="Loading enterprise metrics..." /> : null}

        {!metricsLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Completion" value={`${metrics?.completion_pct ?? 0}%`} />
            <MetricCard label="Auto Match" value={`${metrics?.auto_match_pct ?? 0}%`} />
            <MetricCard label="Pending Approvals" value={metrics?.pending_approvals ?? 0} />
            <MetricCard label="Overdue" value={metrics?.overdue_reconciliations ?? 0} />
          </div>
        ) : null}

        <div className="card p-3 grid grid-cols-1 md:grid-cols-5 gap-2">
          <input className="input" placeholder="Account" value={filters.account_number} onChange={(e) => setFilters((f) => ({ ...f, account_number: e.target.value }))} />
          <input className="input" placeholder="Period (e.g. 2026-05)" value={filters.period} onChange={(e) => setFilters((f) => ({ ...f, period: e.target.value }))} />
          <select className="input" value={filters.risk_level} onChange={(e) => setFilters((f) => ({ ...f, risk_level: e.target.value }))}>
            <option value="">Risk: All</option>
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="LOW">LOW</option>
          </select>
          <input className="input" placeholder="Status" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} />
          <button className="btn-secondary" onClick={() => setFilters({ account_number: '', period: '', risk_level: '', status: '' })}>Reset</button>
        </div>

        <div className="card p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-200">Profile Queue</p>
            <p className="text-xs text-slate-500">{selected.length} selected</p>
          </div>
          <div className="h-[420px] ag-theme-quartz">
            <AgGridReact
              rowData={rows}
              columnDefs={columns}
              animateRows
              rowSelection="multiple"
              onSelectionChanged={(e) => setSelected(e.api.getSelectedRows().map((r) => r.id))}
              defaultColDef={{ sortable: true, filter: true, resizable: true }}
            />
          </div>
          {!rowsLoading && rows.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="No profiles match current filters" description="Relax filters or create new profiles to continue." />
            </div>
          ) : null}
        </div>

        <div className="card p-3">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-brand-400" />
            <p className="text-sm font-semibold text-slate-200">Bulk Action Console</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <select className="input" value={bulkAction} onChange={(e) => setBulkAction(e.target.value)}>
            <option value="ASSIGN">Assign</option>
            <option value="APPROVE">Approve</option>
            <option value="CLOSE">Close</option>
            <option value="ESCALATE">Escalate</option>
          </select>
          <input className="input" placeholder="Target user id (for assign)" value={targetUser} onChange={(e) => setTargetUser(e.target.value)} />
          <button
            className="btn-primary"
            disabled={!selected.length}
            onClick={() => bulkMutation.mutate({ action: bulkAction, profile_ids: selected, target_user_id: targetUser ? Number(targetUser) : null })}
          >
            Run Bulk Action <ChevronRight className="w-4 h-4" />
          </button>
          <input className="input" placeholder="Profile ID for notes/analytics" value={profileId} onChange={(e) => setProfileId(e.target.value)} />
          </div>
        </div>

        <div className="card p-3">
          <p className="text-sm font-semibold text-slate-200 mb-2">Team Notes</p>
          <textarea className="input min-h-[80px]" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add operational note..." />
          <button
            className="btn-secondary mt-2"
            disabled={!profileId || !comment.trim()}
            onClick={() => commentMutation.mutate({ profile_id: Number(profileId), message: comment, mentions: comment.match(/@\w+/g) || [] })}
          >
            Post Comment
          </button>
          <div className="mt-3 space-y-2 max-h-[180px] overflow-auto">
            {comments.map((c) => (
              <div key={c.id} className="text-xs text-slate-300 border border-surface-700 rounded p-2">
                {c.message}
              </div>
            ))}
          </div>
        </div>

        {(showAdvanced || activeView === 'analyze') ? (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="card p-3">
                <h3 className="text-sm text-slate-200 font-semibold mb-2">Variance Analysis</h3>
                <pre className="text-xs text-slate-300 whitespace-pre-wrap">{JSON.stringify(varianceData || {}, null, 2)}</pre>
              </div>
              <div className="card p-3">
                <h3 className="text-sm text-slate-200 font-semibold mb-2">FX Analytics</h3>
                <input className="input mb-2" value={reportingCurrency} onChange={(e) => setReportingCurrency(e.target.value)} />
                <pre className="text-xs text-slate-300 whitespace-pre-wrap">{JSON.stringify(fxData || {}, null, 2)}</pre>
              </div>
            </div>

            <div className="card p-3">
              <h3 className="text-sm text-slate-200 font-semibold mb-2">KPI Trend Charts</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <ReactECharts
                  style={{ height: 260 }}
                  option={{
                    backgroundColor: 'transparent',
                    tooltip: { trigger: 'axis' },
                    xAxis: { type: 'category', data: ['CURRENT', '1-7', '8-15', '16-30', '31+'], axisLabel: { color: CHART_AXIS } },
                    yAxis: { type: 'value', axisLabel: { color: CHART_AXIS } },
                    series: [{ type: 'bar', data: ['CURRENT', '1-7', '8-15', '16-30', '31+'].map((k) => metrics?.aging_summary?.[k] || 0), itemStyle: { color: CHART_BLUE[1] } }],
                  }}
                />
                <ReactECharts
                  style={{ height: 260 }}
                  option={{
                    backgroundColor: 'transparent',
                    tooltip: { trigger: 'item' },
                    legend: { textStyle: { color: CHART_AXIS } },
                    color: CHART_BLUE,
                    series: [{
                      type: 'pie',
                      radius: '65%',
                      data: [
                        { value: metrics?.high_risk_accounts || 0, name: 'High Risk' },
                        { value: metrics?.pending_approvals || 0, name: 'Pending Approval' },
                        { value: metrics?.escalation_alerts || 0, name: 'Escalations' },
                        { value: metrics?.rejected_items || 0, name: 'Rejected' },
                      ],
                    }],
                  }}
                />
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
