import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AgGridReact } from 'ag-grid-react'
import toast from 'react-hot-toast'
import ReactECharts from 'echarts-for-react'
import { enterpriseAPI } from '../api'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, LoadingState } from '../components/ui/PageState'
import {
  Briefcase, SlidersHorizontal, Sparkles, ChevronRight, Filter,
  Download, RefreshCw, Search, X, MessageSquare, TrendingUp,
} from 'lucide-react'

const CHART_COLORS = ['#2d8cf0', '#22d3a0', '#f59e0b', '#f3574d', '#38bdf8', '#a78bfa']

const RISK_META = {
  HIGH:   { color: 'badge-danger',  dot: 'var(--bad)' },
  MEDIUM: { color: 'badge-warning', dot: 'var(--warn)' },
  LOW:    { color: 'badge-success', dot: 'var(--ok)' },
}

const STATUS_META = {
  OPEN:       { color: 'badge-warning' },
  RECONCILED: { color: 'badge-success' },
  IN_REVIEW:  { color: 'badge-info' },
  ESCALATED:  { color: 'badge-danger' },
}

function MetricCard({ label, value, sub, tone }) {
  return (
    <div className={`kpi-card ${tone ? `kpi-${tone}` : ''}`}>
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{value ?? '—'}</p>
      {sub && <p className="kpi-meta">{sub}</p>}
    </div>
  )
}

const VIEWS = [
  { id: 'operate', label: 'Operate' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'comments', label: 'Comments' },
]

export default function EnterpriseReconciliationCenter() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState([])
  const [bulkAction, setBulkAction] = useState('ASSIGN')
  const [targetUser, setTargetUser] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({ account_number: '', period: '', risk_level: '', status: '' })
  const [profileId, setProfileId] = useState('')
  const [comment, setComment] = useState('')
  const [reportingCurrency, setReportingCurrency] = useState('USD')
  const [activeView, setActiveView] = useState('operate')
  const [search, setSearch] = useState('')

  const searchFilters = useMemo(() => ({
    account_number: filters.account_number || undefined,
    period: filters.period || undefined,
    risk_level: filters.risk_level || undefined,
    status: filters.status || undefined,
  }), [filters])

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
      setSelected([])
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
    {
      headerName: '', field: 'id', checkboxSelection: true, headerCheckboxSelection: true,
      width: 52, suppressSizeToFit: true, pinned: 'left',
    },
    { headerName: 'Profile Name', field: 'name', flex: 1, minWidth: 180 },
    {
      headerName: 'Status', field: 'lifecycle_state', width: 130,
      cellRenderer: ({ value }) => {
        const meta = STATUS_META[value?.toUpperCase()] || { color: 'badge-neutral' }
        return value ? `<span class="badge ${meta.color}">${value}</span>` : '—'
      },
    },
    {
      headerName: 'Risk', field: 'risk_classification', width: 100,
      cellRenderer: ({ value }) => {
        const meta = RISK_META[value?.toUpperCase()]
        return value && meta
          ? `<span class="badge ${meta.color}">${value}</span>`
          : value || '—'
      },
    },
    { headerName: 'Type', field: 'reconciliation_type', width: 130 },
    { headerName: 'Frequency', field: 'frequency', width: 110 },
    { headerName: 'Reviewer', field: 'assigned_reviewer', width: 120 },
    { headerName: 'Period', field: 'period', width: 100 },
    { headerName: 'Account', field: 'account_number', width: 130 },
  ], [])

  const filteredRows = useMemo(() => {
    if (!search) return rows
    const q = search.toLowerCase()
    return rows.filter((r) =>
      [r.name, r.account_number, r.lifecycle_state, r.risk_classification].some((v) =>
        String(v || '').toLowerCase().includes(q)
      )
    )
  }, [rows, search])

  const hasFilters = Object.values(filters).some(Boolean)
  const clearFilters = () => setFilters({ account_number: '', period: '', risk_level: '', status: '' })

  const varChart = varianceData?.chart_data || []
  const varianceOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: 0, right: 0, top: 8, bottom: 24, containLabel: true },
    xAxis: {
      type: 'category',
      data: varChart.map((d) => d.period || d.label || ''),
      axisLabel: { color: 'var(--text-tertiary)', fontSize: 10 },
      axisLine: { lineStyle: { color: 'var(--border-1)' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: 'var(--text-tertiary)', fontSize: 10 },
      splitLine: { lineStyle: { color: 'var(--border-0)' } },
    },
    series: [{
      type: 'bar',
      data: varChart.map((d) => d.variance || d.value || 0),
      itemStyle: { color: '#2d8cf0', borderRadius: [2, 2, 0, 0] },
      barMaxWidth: 32,
    }],
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title="Enterprise Reconciliation Center"
        subtitle="Manage profiles, bulk actions, variance analytics, and FX reconciliation."
        actions={
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-ghost btn-sm" onClick={() => qc.invalidateQueries({ queryKey: ['advanced-search'] })}>
              <RefreshCw style={{ width: 12, height: 12 }} />
            </button>
            <button className="btn-secondary btn-sm">
              <Download style={{ width: 12, height: 12 }} />
              Export
            </button>
          </div>
        }
      />

      {/* KPI Bar */}
      {metricsLoading ? null : metrics && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 10, padding: '12px 20px',
          borderBottom: '1px solid var(--border-1)',
          background: 'var(--surface-1)',
          flexShrink: 0,
        }}>
          <MetricCard label="Total Profiles" value={metrics.total_profiles} />
          <MetricCard label="Open Items" value={metrics.open_count} tone={metrics.open_count > 0 ? 'warning' : 'success'} />
          <MetricCard label="Overdue" value={metrics.overdue_count} tone={metrics.overdue_count > 0 ? 'danger' : 'success'} />
          <MetricCard label="Match Rate" value={metrics.match_rate != null ? `${Math.round(metrics.match_rate)}%` : '—'} tone={metrics.match_rate >= 95 ? 'success' : 'warning'} />
          <MetricCard label="High Risk" value={metrics.high_risk_count} tone={metrics.high_risk_count > 0 ? 'danger' : 'success'} />
        </div>
      )}

      {/* View Tabs */}
      <div className="tab-bar" style={{ background: 'var(--surface-1)', flexShrink: 0 }}>
        {VIEWS.map((v) => (
          <button
            key={v.id}
            className={`tab-item ${activeView === v.id ? 'tab-active' : ''}`}
            onClick={() => setActiveView(v.id)}
            style={{
              background: activeView === v.id ? 'var(--surface-0)' : 'transparent',
              borderBottomColor: activeView === v.id ? 'var(--surface-0)' : 'transparent',
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* ── Operate view ── */}
        {activeView === 'operate' && (
          <>
            {/* Toolbar */}
            <div className="table-toolbar" style={{ flexShrink: 0 }}>
              <div className="global-search" style={{ width: 220 }}>
                <Search className="global-search-icon" style={{ width: 12, height: 12 }} />
                <input className="input h-[26px] text-[12px]" placeholder="Search profiles…"
                  value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>

              <button
                className={`btn-secondary btn-sm ${showFilters ? 'btn-primary' : ''}`}
                onClick={() => setShowFilters((v) => !v)}
                style={showFilters ? { background: 'var(--accent)', color: '#fff' } : {}}
              >
                <Filter style={{ width: 12, height: 12 }} />
                Filters {hasFilters && `(active)`}
              </button>

              {hasFilters && (
                <button className="btn-ghost btn-sm" onClick={clearFilters}>
                  <X style={{ width: 11, height: 11 }} />
                  Clear
                </button>
              )}

              {selected.length > 0 && (
                <>
                  <div className="divider-v" style={{ height: 20, margin: '0 4px' }} />
                  <span className="badge badge-accent">{selected.length} selected</span>
                  <select className="input h-[26px] text-[12px] w-32" value={bulkAction} onChange={(e) => setBulkAction(e.target.value)}>
                    <option value="ASSIGN">Assign</option>
                    <option value="APPROVE">Approve</option>
                    <option value="REJECT">Reject</option>
                    <option value="ESCALATE">Escalate</option>
                  </select>
                  {bulkAction === 'ASSIGN' && (
                    <input className="input h-[26px] text-[12px] w-32" placeholder="Username"
                      value={targetUser} onChange={(e) => setTargetUser(e.target.value)} />
                  )}
                  <button className="btn-primary btn-sm"
                    onClick={() => bulkMutation.mutate({ ids: selected, action: bulkAction, target_user: targetUser })}
                    disabled={bulkMutation.isPending}>
                    Apply
                  </button>
                </>
              )}

              <div className="table-toolbar-right">
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {filteredRows.length} profiles
                </span>
              </div>
            </div>

            {/* Filter strip */}
            {showFilters && (
              <div style={{
                display: 'flex', gap: 8, padding: '8px 16px',
                background: 'var(--surface-2)', borderBottom: '1px solid var(--border-1)',
                flexShrink: 0, flexWrap: 'wrap',
              }}>
                {[
                  { key: 'account_number', placeholder: 'Account Number' },
                  { key: 'period', placeholder: 'Period (YYYY-MM)' },
                  { key: 'risk_level', placeholder: 'Risk Level' },
                  { key: 'status', placeholder: 'Status' },
                ].map(({ key, placeholder }) => (
                  <input key={key} className="input h-[26px] text-[12px] w-44" placeholder={placeholder}
                    value={filters[key]} onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))} />
                ))}
              </div>
            )}

            {/* AG Grid */}
            <div style={{ flex: 1, overflow: 'hidden' }}
              className={document.documentElement.classList.contains('theme-light') ? 'ag-theme-quartz' : 'ag-theme-quartz-dark'}>
              {rowsLoading ? <LoadingState /> : filteredRows.length === 0 ? (
                <EmptyState title="No profiles found" description="Adjust filters or create reconciliation profiles." />
              ) : (
                <AgGridReact
                  rowData={filteredRows}
                  columnDefs={columns}
                  rowSelection="multiple"
                  suppressRowClickSelection={false}
                  onSelectionChanged={(e) => setSelected(e.api.getSelectedRows().map((r) => r.id))}
                  onRowClicked={(e) => setProfileId(String(e.data.id))}
                  animateRows
                  suppressCellFocus
                  rowHeight={36}
                  headerHeight={34}
                  defaultColDef={{ resizable: true, sortable: true, filter: true }}
                  rowClassRules={{
                    'selected': (params) => selected.includes(params.data?.id),
                  }}
                />
              )}
            </div>
          </>
        )}

        {/* ── Analytics view ── */}
        {activeView === 'analytics' && (
          <div style={{ flex: 1, overflow: 'auto', padding: 20 }} className="slim-scroll">
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="field-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 0 }}>
                <label className="label" style={{ marginBottom: 0 }}>Profile ID</label>
                <input className="input h-[26px] text-[12px] w-32" placeholder="e.g. 42"
                  value={profileId} onChange={(e) => setProfileId(e.target.value)} />
              </div>
              <div className="field-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 0 }}>
                <label className="label" style={{ marginBottom: 0 }}>Currency</label>
                <select className="input h-[26px] text-[12px] w-24" value={reportingCurrency}
                  onChange={(e) => setReportingCurrency(e.target.value)}>
                  {['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="card" style={{ padding: 16 }}>
                <p style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 10 }}>
                  Variance Analysis
                </p>
                {varChart.length > 0
                  ? <ReactECharts option={varianceOption} style={{ height: 220 }} />
                  : <EmptyState title="Enter a Profile ID" description="Variance data loads per profile." />}
              </div>

              <div className="card" style={{ padding: 16 }}>
                <p style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 10 }}>
                  FX Reconciliation — {reportingCurrency}
                </p>
                {fxData ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Object.entries(fxData).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                        <span style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="Enter a Profile ID" description="FX data loads per profile." />
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Comments view ── */}
        {activeView === 'comments' && (
          <div style={{ flex: 1, overflow: 'auto', padding: 20, maxWidth: 640 }} className="slim-scroll">
            <div className="field-group" style={{ marginBottom: 16 }}>
              <label className="label">Profile ID</label>
              <input className="input w-40" placeholder="Enter profile ID"
                value={profileId} onChange={(e) => setProfileId(e.target.value)} />
            </div>

            {/* Existing comments */}
            <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {comments.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '12px 0' }}>
                  {profileId ? 'No comments for this profile.' : 'Enter a profile ID to load comments.'}
                </p>
              ) : comments.map((c) => (
                <div key={c.id} style={{
                  padding: '10px 14px',
                  background: 'var(--surface-3)',
                  border: '1px solid var(--border-1)',
                  borderRadius: 'var(--r-md)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {c.username || c.author || 'User'}
                    </span>
                    <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
                      {c.created_at ? new Date(c.created_at).toLocaleString() : '—'}
                    </span>
                  </div>
                  <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{c.text || c.comment}</p>
                </div>
              ))}
            </div>

            {/* Add comment */}
            <div className="field-group">
              <label className="label">Add Comment</label>
              <textarea className="input" rows={3} placeholder="Enter your comment…"
                value={comment} onChange={(e) => setComment(e.target.value)}
                disabled={!profileId} />
              <button className="btn-primary btn-sm" style={{ marginTop: 8, alignSelf: 'flex-start' }}
                onClick={() => commentMutation.mutate({ profile_id: profileId, text: comment })}
                disabled={!profileId || !comment.trim() || commentMutation.isPending}>
                <MessageSquare style={{ width: 12, height: 12 }} />
                {commentMutation.isPending ? 'Posting…' : 'Post Comment'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
