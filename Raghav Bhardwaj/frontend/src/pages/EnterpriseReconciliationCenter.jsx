import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { enterpriseAPI } from '../api'
import { AgGridReact } from 'ag-grid-react'
import toast from 'react-hot-toast'
import ReactECharts from 'echarts-for-react'

export default function EnterpriseReconciliationCenter() {
  const qc = useQueryClient()
  const [filters, setFilters] = useState({})
  const [selected, setSelected] = useState([])
  const [comment, setComment] = useState('')
  const [profileIdForComment, setProfileIdForComment] = useState('')
  const [reportingCurrency, setReportingCurrency] = useState('USD')
  const [bulkAction, setBulkAction] = useState('ASSIGN')
  const [targetUser, setTargetUser] = useState('')

  const { data: metrics } = useQuery({ queryKey: ['executive-dashboard'], queryFn: enterpriseAPI.executiveDashboard, refetchInterval: 15000 })
  const { data: rows = [] } = useQuery({ queryKey: ['advanced-search', filters], queryFn: () => enterpriseAPI.advancedSearch(filters) })
  const { data: comments = [] } = useQuery({ queryKey: ['comments', profileIdForComment], queryFn: () => enterpriseAPI.listComments(profileIdForComment), enabled: !!profileIdForComment })
  const { data: varianceData } = useQuery({ queryKey: ['variance', profileIdForComment], queryFn: () => enterpriseAPI.variance(profileIdForComment), enabled: !!profileIdForComment })
  const { data: fxData } = useQuery({ queryKey: ['fx', profileIdForComment, reportingCurrency], queryFn: () => enterpriseAPI.fxReconciliation(profileIdForComment, reportingCurrency), enabled: !!profileIdForComment })

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

  const columns = useMemo(() => [
    { headerName: 'Profile ID', field: 'id', checkboxSelection: true, headerCheckboxSelection: true, width: 110 },
    { headerName: 'Name', field: 'name', flex: 1, editable: true },
    { headerName: 'Type', field: 'reconciliation_type', width: 140 },
    { headerName: 'Status', field: 'lifecycle_state', width: 140 },
    { headerName: 'Risk', field: 'risk_classification', width: 120 },
    { headerName: 'Frequency', field: 'frequency', width: 130 },
    { headerName: 'Preparer', field: 'assigned_preparer', width: 120 },
    { headerName: 'Reviewer', field: 'assigned_reviewer', width: 120 },
  ], [])

  return (
    <div className="h-full flex flex-col">
      <div className="section-header"><h1 className="text-base font-semibold text-white">Enterprise Reconciliation Workspace</h1></div>
      <div className="p-6 space-y-4 overflow-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
          <div className="card p-3 text-xs text-slate-300">Completion<br /><span className="text-white font-semibold">{metrics?.completion_pct ?? 0}%</span></div>
          <div className="card p-3 text-xs text-slate-300">Auto Match<br /><span className="text-white font-semibold">{metrics?.auto_match_pct ?? 0}%</span></div>
          <div className="card p-3 text-xs text-slate-300">Pending Approvals<br /><span className="text-white font-semibold">{metrics?.pending_approvals ?? 0}</span></div>
          <div className="card p-3 text-xs text-slate-300">Overdue<br /><span className="text-white font-semibold">{metrics?.overdue_reconciliations ?? 0}</span></div>
          <div className="card p-3 text-xs text-slate-300">High Risk<br /><span className="text-white font-semibold">{metrics?.high_risk_accounts ?? 0}</span></div>
          <div className="card p-3 text-xs text-slate-300">Escalations<br /><span className="text-white font-semibold">{metrics?.escalation_alerts ?? 0}</span></div>
          <div className="card p-3 text-xs text-slate-300">Rejected<br /><span className="text-white font-semibold">{metrics?.rejected_items ?? 0}</span></div>
          <button className="btn-secondary text-xs" onClick={() => enterpriseAPI.generateAgingReminders().then(() => toast.success('Reminders generated'))}>Run Reminders</button>
        </div>

        <div className="card p-3 grid grid-cols-2 md:grid-cols-5 gap-2">
          <input className="input" placeholder="Account number" onChange={(e) => setFilters((f) => ({ ...f, account_number: e.target.value || undefined }))} />
          <input className="input" placeholder="Period" onChange={(e) => setFilters((f) => ({ ...f, period: e.target.value || undefined }))} />
          <input className="input" placeholder="Risk (HIGH/MEDIUM/LOW)" onChange={(e) => setFilters((f) => ({ ...f, risk_level: e.target.value || undefined }))} />
          <input className="input" placeholder="Status" onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value || undefined }))} />
          <input className="input" placeholder="Recon Type" onChange={(e) => setFilters((f) => ({ ...f, reconciliation_type: e.target.value || undefined }))} />
        </div>

        <div className="card p-3 h-[420px] ag-theme-quartz">
          <AgGridReact
            rowData={rows}
            columnDefs={columns}
            animateRows
            rowSelection="multiple"
            onSelectionChanged={(e) => setSelected(e.api.getSelectedRows().map((r) => r.id))}
            defaultColDef={{ sortable: true, filter: true, resizable: true }}
          />
        </div>

        <div className="card p-3 grid grid-cols-1 md:grid-cols-4 gap-2">
          <select className="input" value={bulkAction} onChange={(e) => setBulkAction(e.target.value)}>
            <option value="ASSIGN">Mass Assign</option>
            <option value="APPROVE">Mass Approve</option>
            <option value="EXPORT">Mass Export</option>
            <option value="CLOSE">Mass Close</option>
            <option value="ESCALATE">Mass Escalate</option>
          </select>
          <input className="input" placeholder="Target user id" value={targetUser} onChange={(e) => setTargetUser(e.target.value)} />
          <button className="btn-primary" onClick={() => bulkMutation.mutate({ action: bulkAction, profile_ids: selected, target_user_id: targetUser ? Number(targetUser) : null })}>Run Bulk Action</button>
          <input className="input" placeholder="Profile ID for drilldown/comments" value={profileIdForComment} onChange={(e) => setProfileIdForComment(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="card p-3">
            <h3 className="text-sm text-slate-200 font-semibold mb-2">Variance Analysis</h3>
            <pre className="text-xs text-slate-300 whitespace-pre-wrap">{JSON.stringify(varianceData || {}, null, 2)}</pre>
          </div>
          <div className="card p-3">
            <h3 className="text-sm text-slate-200 font-semibold mb-2">FX Analytics</h3>
            <div className="flex gap-2 mb-2">
              <input className="input" value={reportingCurrency} onChange={(e) => setReportingCurrency(e.target.value)} />
            </div>
            <pre className="text-xs text-slate-300 whitespace-pre-wrap">{JSON.stringify(fxData || {}, null, 2)}</pre>
          </div>
          <div className="card p-3">
            <h3 className="text-sm text-slate-200 font-semibold mb-2">Threaded Comments</h3>
            <textarea className="input min-h-[80px]" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add comment with @mentions" />
            <button className="btn-secondary mt-2" onClick={() => commentMutation.mutate({ profile_id: Number(profileIdForComment), message: comment, mentions: comment.match(/@\w+/g) || [] })}>Post Comment</button>
            <div className="mt-3 space-y-2 max-h-[240px] overflow-auto">
              {comments.map((c) => <div key={c.id} className="text-xs text-slate-300 border border-surface-700 rounded p-2">{c.message}</div>)}
            </div>
          </div>
        </div>

        <div className="card p-3">
          <h3 className="text-sm text-slate-200 font-semibold mb-2">Oracle-Style KPI Trend Charts (Drill-Down)</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <ReactECharts
              style={{ height: 260 }}
              option={{
                backgroundColor: 'transparent',
                tooltip: { trigger: 'axis' },
                xAxis: { type: 'category', data: ['CURRENT', '1-7', '8-15', '16-30', '31+'], axisLabel: { color: '#94a3b8' } },
                yAxis: { type: 'value', axisLabel: { color: '#94a3b8' } },
                series: [{ type: 'bar', data: ['CURRENT', '1-7', '8-15', '16-30', '31+'].map((k) => metrics?.aging_summary?.[k] || 0), itemStyle: { color: '#3b82f6' } }],
              }}
            />
            <ReactECharts
              style={{ height: 260 }}
              option={{
                backgroundColor: 'transparent',
                tooltip: { trigger: 'item' },
                legend: { textStyle: { color: '#94a3b8' } },
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
      </div>
    </div>
  )
}
