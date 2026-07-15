import { useEffect, useMemo, useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useOutletContext, useNavigate, useParams } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import { BarChart3, CheckCircle2, Clock, Layers, ShieldAlert, TrendingUp, Users, AlertTriangle, ChevronDown } from 'lucide-react'
import { enterpriseAPI, projectsAPI, executionsAPI, workflowAPI } from '../api'
import { useProjectStore } from '../store/projectStore'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, LoadingState } from '../components/ui/PageState'

const COLORS = {
  blue: '#6366f1',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  cyan: '#38bdf8',
  violet: '#a855f7',
  slate: '#94a3b8',
}

const BASE_CHART = {
  backgroundColor: 'transparent',
  textStyle: { color: COLORS.slate, fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 11 },
  grid: { left: 48, right: 18, top: 20, bottom: 36, containLabel: false },
}

const safeJson = (value) => {
  if (!value) return {}
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch { return {} }
}

const toNumber = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function KpiCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div className="flex items-center gap-2.5 px-3 border-l border-[var(--border-1)]">
      <div style={{
        width: 24,
        height: 24,
        borderRadius: 6,
        background: `${color}15`,
        border: `1px solid ${color}30`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon style={{ width: 12, height: 12, color }} />
      </div>
      <div className="flex flex-col justify-center">
        <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1, margin: '3px 0 2px 0' }}>{value}</span>
        {sub && <span style={{ fontSize: 9, color: 'var(--text-secondary)', lineHeight: 1 }}>{sub}</span>}
      </div>
    </div>
  )
}

function ProjectSelectorCard({ projects, selectedProjectId, onChange }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const selected = projects.find(p => String(p.id) === String(selectedProjectId));
  const [dropdownStyle, setDropdownStyle] = useState({});

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownStyle({
        top: rect.bottom + 8,
        left: rect.left,
        minWidth: Math.max(rect.width, 220),
      });
    }
  }, [open]);

  return (
    <div ref={containerRef} className="flex items-center gap-2 pl-4 border-l border-[var(--border-1)] relative cursor-pointer group" onClick={() => setOpen(!open)}>
      <div style={{
        width: 24,
        height: 24,
        borderRadius: 6,
        background: `${COLORS.blue}15`,
        border: `1px solid ${COLORS.blue}30`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Layers style={{ width: 12, height: 12, color: COLORS.blue }} />
      </div>
      <div className="flex flex-col justify-center">
        <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>Selected Project</span>
        <div className="flex items-center gap-1" style={{ margin: '3px 0 2px 0' }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{selected ? selected.name.substring(0, 15) + (selected.name.length > 15 ? '...' : '') : 'None'}</span>
          <ChevronDown style={{ width: 12, height: 12, color: 'var(--text-tertiary)' }} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
        <span style={{ fontSize: 9, color: 'var(--text-secondary)', lineHeight: 1 }}>Live analytics context</span>
      </div>

      {open && (
        <div style={{
          position: 'fixed',
          ...dropdownStyle,
          marginTop: 6,
          background: 'var(--surface-2)',
          border: '1px solid var(--border-1)',
          borderRadius: 8,
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
          zIndex: 50,
          maxHeight: 220,
          overflowY: 'auto',
          padding: 4,
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}>
          {projects.map(p => {
            const isSelected = String(p.id) === String(selectedProjectId);
            return (
              <div 
                key={p.id} 
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(p.id);
                  setOpen(false);
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: isSelected ? 600 : 500,
                  color: isSelected ? COLORS.blue : 'var(--text-secondary)',
                  background: isSelected ? `${COLORS.blue}18` : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if(!isSelected) e.currentTarget.style.background = 'var(--surface-3)' }}
                onMouseLeave={e => { if(!isSelected) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                {isSelected && <CheckCircle2 style={{ width: 14, height: 14, color: COLORS.blue, flexShrink: 0 }} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ChartCard({ title, subtitle, children, height = 260 }) {
  return (
    <div style={{
      background: 'var(--surface-2)',
      border: '1px solid var(--border-1)',
      borderRadius: 10,
      padding: '14px 16px',
    }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</p>
      {subtitle ? <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>{subtitle}</p> : null}
      <div style={{ height }}>{children}</div>
    </div>
  )
}

function MatchTrendChart({ data }) {
  if (!data.length) return <EmptyState title="No execution trend yet" description="Run the selected project to populate trend data." />
  
  const option = {
    ...BASE_CHART,
    // Maximize space, push everything to the edges
    grid: { left: 0, right: 0, top: 40, bottom: 20, containLabel: true }, 
    
    // Premium frosted-glass style tooltip
    tooltip: { 
      trigger: 'axis', 
      backgroundColor: 'rgba(15, 23, 42, 0.9)', // Deep slate with opacity
      borderColor: 'rgba(51, 65, 85, 0.5)',
      textStyle: { color: '#f8fafc', fontSize: 12 },
      axisPointer: { type: 'line', lineStyle: { color: 'rgba(99, 102, 241, 0.3)', width: 2 } },
      padding: [12, 16],
      borderRadius: 8,
      extraCssText: 'backdrop-filter: blur(4px); box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);'
    },
    
    // Sleek legend floating top right
    legend: { 
      data: ['Match Rate', 'Matched', 'Unmatched'], 
      top: 0, 
      right: 10,
      icon: 'circle', 
      itemWidth: 8, 
      textStyle: { color: 'var(--text-tertiary)', fontSize: 11, fontWeight: 500 } 
    },
    
    xAxis: { 
      type: 'category', 
      data: data.map((d) => d.label), 
      axisLine: { show: false }, // Zero chart junk
      axisTick: { show: false }, 
      axisLabel: { color: 'var(--text-tertiary)', fontSize: 11, margin: 16, fontWeight: 500 } 
    },
    
    yAxis: [
      { 
        type: 'value', 
        max: 100, 
        splitLine: { show: false }, // Completely remove grid lines
        axisLabel: { show: false }  // Hide Y-axis numbers (rely on tooltips & labels)
      },
      { 
        type: 'value', 
        splitLine: { show: false }, 
        axisLabel: { show: false } 
      },
    ],
    
    series: [
      // 1. The Glowing Area Trend Line
      { 
        name: 'Match Rate', 
        type: 'line', 
        yAxisIndex: 0, 
        smooth: 0.4, // High-tension smooth curve
        showSymbol: false, // Hide ugly dots
        z: 3, // Bring to front
        lineStyle: { 
          color: COLORS.cyan, 
          width: 3,
          shadowColor: 'rgba(56, 189, 248, 0.5)', // Neon glow effect
          shadowBlur: 12,
          shadowOffsetY: 4
        }, 
        // Smooth gradient fading down to zero
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(56, 189, 248, 0.3)' },
              { offset: 1, color: 'rgba(56, 189, 248, 0.0)' }
            ]
          }
        },
        data: data.map((d) => d.match_rate), 
      },
      
      // 2. Ultra-thin Gradient Bars
      { 
        name: 'Matched', 
        type: 'bar', 
        yAxisIndex: 1, 
        data: data.map((d) => d.matched), 
        barMaxWidth: 8, // Very thin bars
        itemStyle: { 
          borderRadius: 8, // Pill shaped
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: COLORS.blue },
              { offset: 1, color: 'rgba(99, 102, 241, 0.2)' } // Fades down
            ]
          }
        }, 
      },
      { 
        name: 'Unmatched', 
        type: 'bar', 
        yAxisIndex: 1, 
        data: data.map((d) => d.unmatched), 
        barMaxWidth: 8, 
        itemStyle: { 
          borderRadius: 8, 
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: COLORS.red },
              { offset: 1, color: 'rgba(239, 68, 68, 0.2)' }
            ]
          }
        }, 
      },
    ],
  }
  return <ReactECharts option={option} style={{ height: '100%' }} notMerge />
}

function IssueBucketChart({ data }) {
  if (!data.length) return <EmptyState title="No issue buckets yet" description="Open issues appear here after execution." />
  const option = {
    ...BASE_CHART,
    tooltip: { trigger: 'item', backgroundColor: '#1e293b', borderColor: '#334155' },
    series: [{
      type: 'pie',
      radius: ['42%', '70%'],
      center: ['50%', '50%'],
      data: data.map((d, index) => ({
        name: d.bucket,
        value: d.count,
        itemStyle: { color: [COLORS.green, COLORS.cyan, COLORS.amber, COLORS.red][index] || COLORS.violet },
      })),
      label: { color: COLORS.slate, fontSize: 10 },
    }],
  }
  return <ReactECharts option={option} style={{ height: '100%' }} notMerge />
}

function EntityChart({ data }) {
  if (!data.length) return <EmptyState title="No entity data" description="Upload a richer file set to see entity-level analytics." />
  const top = data.slice(0, 10).reverse()
  const option = {
    ...BASE_CHART,
    grid: { left: 110, right: 24, top: 10, bottom: 20 },
    tooltip: { trigger: 'axis', backgroundColor: '#1e293b', borderColor: '#334155' },
    xAxis: { type: 'value', max: 100, axisLabel: { color: '#64748b', fontSize: 10, formatter: '{value}%' }, axisLine: { lineStyle: { color: '#334155' } }, splitLine: { lineStyle: { color: '#1e293b' } } },
    yAxis: { type: 'category', data: top.map((d) => d.entity), axisLabel: { color: COLORS.slate, fontSize: 10 }, axisLine: { lineStyle: { color: '#334155' } } },
    series: [{
      name: 'Match Rate',
      type: 'bar',
      data: top.map((d) => d.match_rate),
      itemStyle: { color: COLORS.blue, borderRadius: [0, 4, 4, 0] },
      barMaxWidth: 18,
      label: { show: true, position: 'right', color: COLORS.slate, fontSize: 9, formatter: '{c}%' },
    }],
  }
  return <ReactECharts option={option} style={{ height: '100%' }} notMerge />
}

function WorkflowStatusChart({ data }) {
  if (!data.length) return <EmptyState title="No workflow data yet" description="Promote a completed execution to populate the workflow view." />
  const option = {
    ...BASE_CHART,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: '#1e293b', borderColor: '#334155' },
    xAxis: { type: 'category', data: data.map((d) => d.status), axisLabel: { color: '#64748b', fontSize: 10 }, axisLine: { lineStyle: { color: '#334155' } } },
    yAxis: { type: 'value', axisLabel: { color: '#64748b', fontSize: 10 }, splitLine: { lineStyle: { color: '#1e293b' } } },
    series: [{
      type: 'bar',
      data: data.map((d) => d.count),
      itemStyle: { color: `${COLORS.violet}99`, borderRadius: [4, 4, 0, 0] },
      barMaxWidth: 28,
    }],
  }
  return <ReactECharts option={option} style={{ height: '100%' }} notMerge />
}

function EntityTable({ data, onRowClick }) {
  if (!data.length) return <EmptyState title="No entity leaderboard yet" description="" />
  return (
    <table className="data-table" style={{ borderRadius: 0 }}>
      <thead>
        <tr>
          <th>Entity</th>
          <th>Total</th>
          <th>Matched</th>
          <th>Open Issues</th>
          <th>Match Rate</th>
        </tr>
      </thead>
      <tbody>
        {data.slice(0, 12).map((row) => (
          <tr 
            key={`${row.entity}-${row.account}`} 
            onClick={() => onRowClick?.(row)}
            className={onRowClick ? "cursor-pointer hover:bg-surface-700/30 transition-colors" : ""}
          >
            <td style={{ fontWeight: 600, fontSize: 12 }}>{row.entity}</td>
            <td style={{ fontSize: 12 }}>{row.total.toLocaleString()}</td>
            <td style={{ fontSize: 12, color: COLORS.green }}>{row.matched.toLocaleString()}</td>
            <td style={{ fontSize: 12, color: row.open_issues > 0 ? COLORS.red : COLORS.green }}>{row.open_issues.toLocaleString()}</td>
            <td>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 80, height: 4, background: 'var(--surface-3)', borderRadius: 9999, overflow: 'hidden' }}>
                  <div style={{ width: `${row.match_rate}%`, height: '100%', background: row.match_rate >= 90 ? COLORS.green : row.match_rate >= 70 ? COLORS.amber : COLORS.red }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: row.match_rate >= 90 ? COLORS.green : row.match_rate >= 70 ? COLORS.amber : COLORS.red }}>
                  {row.match_rate}%
                </span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DrilldownTable({ level, data, onSelect }) {
  if (!data.length) {
    return <EmptyState title="No drill-down data" description="Choose an entity or account to inspect deeper detail." />
  }

  const rows = data.slice(0, 20)

  if (level === 'account') {
    return (
      <table className="data-table" style={{ borderRadius: 0 }}>
        <thead>
          <tr>
            <th>Account</th>
            <th>Total</th>
            <th>Matched</th>
            <th>Open Issues</th>
            <th>Match Rate</th>
            <th>Variance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.account}
              onClick={() => onSelect?.(row)}
              className={onSelect ? 'cursor-pointer hover:bg-surface-700/30 transition-colors' : ''}
            >
              <td style={{ fontWeight: 600, fontSize: 12 }}>{row.account}</td>
              <td style={{ fontSize: 12 }}>{row.total_transactions?.toLocaleString?.() ?? row.total_transactions ?? 0}</td>
              <td style={{ fontSize: 12, color: COLORS.green }}>{row.matched_transactions?.toLocaleString?.() ?? row.matched_transactions ?? 0}</td>
              <td style={{ fontSize: 12, color: row.exceptions > 0 ? COLORS.red : COLORS.green }}>{row.exceptions?.toLocaleString?.() ?? row.exceptions ?? 0}</td>
              <td style={{ fontSize: 12, fontWeight: 700, color: row.match_rate >= 90 ? COLORS.green : row.match_rate >= 70 ? COLORS.amber : COLORS.red }}>
                {row.match_rate}%
              </td>
              <td style={{ fontSize: 12 }}>{Number(row.variance_amount || 0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  if (level === 'reconciliation') {
    return (
      <table className="data-table" style={{ borderRadius: 0 }}>
        <thead>
          <tr>
            <th>Profile</th>
            <th>Entity</th>
            <th>Account</th>
            <th>Status</th>
            <th>Total</th>
            <th>Matched</th>
            <th>Open Issues</th>
            <th>Match Rate</th>
            <th>Variance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.profile_id}
              onClick={() => onSelect?.(row)}
              className={onSelect ? 'cursor-pointer hover:bg-surface-700/30 transition-colors' : ''}
            >
              <td style={{ fontWeight: 600, fontSize: 12 }}>{row.profile_id}</td>
              <td style={{ fontSize: 12 }}>{row.entity}</td>
              <td style={{ fontSize: 12 }}>{row.account}</td>
              <td style={{ fontSize: 12 }}>{row.status || 'UNKNOWN'}</td>
              <td style={{ fontSize: 12 }}>{row.total_transactions?.toLocaleString?.() ?? row.total_transactions ?? 0}</td>
              <td style={{ fontSize: 12, color: COLORS.green }}>{row.matched_transactions?.toLocaleString?.() ?? row.matched_transactions ?? 0}</td>
              <td style={{ fontSize: 12, color: row.exceptions > 0 ? COLORS.red : COLORS.green }}>{row.exceptions?.toLocaleString?.() ?? row.exceptions ?? 0}</td>
              <td style={{ fontSize: 12, fontWeight: 700, color: row.match_rate >= 90 ? COLORS.green : row.match_rate >= 70 ? COLORS.amber : COLORS.red }}>
                {row.match_rate}%
              </td>
              <td style={{ fontSize: 12 }}>{Number(row.variance_amount || 0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  if (level === 'exception') {
    return (
      <table className="data-table" style={{ borderRadius: 0 }}>
        <thead>
          <tr>
            <th>Exception ID</th>
            <th>Profile</th>
            <th>Entity</th>
            <th>Account</th>
            <th>Classification</th>
            <th>Status</th>
            <th>Variance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.exception_id || row.record_id}
              onClick={() => onSelect?.(row)}
              className={onSelect ? 'cursor-pointer hover:bg-surface-700/30 transition-colors' : ''}
            >
              <td style={{ fontWeight: 600, fontSize: 12 }}>{row.exception_id || 'UNKNOWN'}</td>
              <td style={{ fontSize: 12 }}>{row.profile_id}</td>
              <td style={{ fontSize: 12 }}>{row.entity}</td>
              <td style={{ fontSize: 12 }}>{row.account}</td>
              <td style={{ fontSize: 12 }}>{row.classification || 'UNCLASSIFIED'}</td>
              <td style={{ fontSize: 12 }}>{row.status}</td>
              <td style={{ fontSize: 12 }}>{Number(row.variance_amount || 0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return (
    <table className="data-table" style={{ borderRadius: 0 }}>
      <thead>
        <tr>
          <th>Transaction</th>
          <th>Entity</th>
          <th>Account</th>
          <th>Status</th>
          <th>Variance</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={row.record_id || row.transaction_id || index}>
            <td style={{ fontWeight: 600, fontSize: 12 }}>{row.record_id || row.transaction_id || `Row ${index + 1}`}</td>
            <td style={{ fontSize: 12 }}>{row.entity || 'Unassigned'}</td>
            <td style={{ fontSize: 12 }}>{row.account || 'Unassigned'}</td>
            <td style={{ fontSize: 12 }}>{row.status || 'UNKNOWN'}</td>
            <td style={{ fontSize: 12 }}>{Number(row.match_variance || 0).toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function bucketIssueLoad(openIssues) {
  if (openIssues === 0) return 'Clean'
  if (openIssues <= 2) return 'Low'
  if (openIssues <= 5) return 'Medium'
  return 'High'
}

export default function ReconciliationAnalyticsExplorer() {
  const { selectedProjectId, setSelectedProjectId } = useProjectStore()
  const navigate = useNavigate()
  const { entity, account, profile, exception } = useParams()

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsAPI.list,
  })

  useEffect(() => {
    if (!selectedProjectId && projects.length) {
      setSelectedProjectId(String(projects[0].id))
    }
  }, [projects, selectedProjectId, setSelectedProjectId])

  const numericProjectId = Number(selectedProjectId)
  const selectedProject = useMemo(
    () => projects.find((project) => String(project.id) === String(selectedProjectId)) || null,
    [projects, selectedProjectId],
  )
  const selectedEntity = entity ? decodeURIComponent(entity) : ''
  const selectedAccount = account ? decodeURIComponent(account) : ''
  const selectedProfile = profile ? decodeURIComponent(profile) : ''
  const selectedException = exception ? decodeURIComponent(exception) : ''

  const context = useOutletContext();
  const setHeaderOverride = context?.setHeaderOverride;

  useEffect(() => {
    if (setHeaderOverride) {
      const subtitle = selectedProject 
        ? `Live analytics for ${selectedProject.name}` 
        : (selectedProjectId ? 'Live analytics for the selected project' : 'Select a project to view live analytics.');

      setHeaderOverride(
        <header className="bl-header">
          <div className="flex flex-col min-w-0 flex-shrink-0">
            <h1 className="bl-header-title" style={{ fontSize: 20 }}>Project Analytics</h1>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, fontWeight: 500 }}>{subtitle}</p>
          </div>
          <div className="flex-1" />
          {selectedProjectId && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 7px',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              background: 'var(--accent-subtle)', color: 'var(--accent)',
              border: '1px solid var(--accent-border)', borderRadius: 3,
            }}>
              Project #{selectedProjectId}
            </span>
          )}
        </header>
      );
      return () => setHeaderOverride(null);
    }
  }, [setHeaderOverride, selectedProject, selectedProjectId]);

  const { data: executions = [], isLoading: execLoading } = useQuery({
    queryKey: ['project-analytics-executions', selectedProjectId],
    queryFn: () => executionsAPI.list(numericProjectId),
    enabled: Number.isFinite(numericProjectId),
  })

  const latestExecution = useMemo(() => {
    const ordered = [...executions].sort((a, b) => {
      const aTime = new Date(a.started_at || 0).getTime()
      const bTime = new Date(b.started_at || 0).getTime()
      return bTime - aTime || (b.id - a.id)
    })
    return ordered.find((execution) => (execution.status || '').toLowerCase() === 'completed') || ordered[0] || null
  }, [executions])

  const { data: resultsPage, isLoading: resultsLoading } = useQuery({
    queryKey: ['project-analytics-results', selectedProjectId, latestExecution?.id],
    queryFn: () => executionsAPI.results(numericProjectId, latestExecution.id, { page: 1, page_size: 1000 }),
    enabled: Number.isFinite(numericProjectId) && Boolean(latestExecution?.id),
  })

  const { data: workflows = [], isLoading: workflowLoading } = useQuery({
    queryKey: ['project-analytics-workflows', selectedProjectId],
    queryFn: () => workflowAPI.list({ project_id: numericProjectId }),
    enabled: Number.isFinite(numericProjectId),
  })

  const units = resultsPage?.units || []
  const latestStats = safeJson(latestExecution?.stats)
  const drillLevel = selectedException ? 'transaction' : selectedProfile ? 'exception' : selectedAccount ? 'reconciliation' : selectedEntity ? 'account' : 'entity'
  const drillKey = selectedException || selectedProfile || selectedAccount || selectedEntity || ''

  const { data: drilldownData = { items: [], total: 0 }, isLoading: drillLoading } = useQuery({
    queryKey: ['project-analytics-drilldown', selectedProjectId, drillLevel, drillKey],
    queryFn: () => enterpriseAPI.analyticsDrilldown({
      level: drillLevel,
      key: drillKey,
      limit: 200,
    }),
    enabled: Number.isFinite(numericProjectId) && Boolean(drillKey),
  })
  const drilldownItems = drilldownData?.items || []

  const entityPerformance = useMemo(() => {
    return units
      .map((unit) => {
        const total = toNumber(unit.total_transactions)
        const matched = toNumber(unit.matched_count)
        const openIssues = toNumber(unit.unmatched_count) + toNumber(unit.partial_count)
        const matchRate = total ? Math.round((matched / total) * 100) : 0
        return {
          entity: unit.entity || 'Unassigned',
          account: unit.account || 'Unassigned',
          total,
          matched,
          open_issues: openIssues,
          match_rate: matchRate,
        }
      })
      .sort((a, b) => b.total - a.total || a.entity.localeCompare(b.entity) || a.account.localeCompare(b.account))
  }, [units])

  const trendData = useMemo(() => {
    return [...executions]
      .sort((a, b) => new Date(a.started_at || 0) - new Date(b.started_at || 0))
      .map((execution, index) => {
        const stats = safeJson(execution.stats)
        const started = execution.started_at ? new Date(execution.started_at) : null
        return {
          label: started ? started.toLocaleDateString([], { month: 'short', day: 'numeric' }) : `Run ${index + 1}`,
          matched: toNumber(stats.matched),
          unmatched: toNumber(stats.unmatched),
          partial: toNumber(stats.partial),
          match_rate: toNumber(stats.match_rate),
        }
      })
  }, [executions])

  const issueBuckets = useMemo(() => {
    const buckets = { Clean: 0, Low: 0, Medium: 0, High: 0 }
    entityPerformance.forEach((row) => {
      buckets[bucketIssueLoad(row.open_issues)] += 1
    })
    return Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }))
  }, [entityPerformance])

  const workflowStatus = useMemo(() => {
    const counts = {}
    workflows.forEach((workflow) => {
      const key = (workflow.status || 'UNKNOWN').toUpperCase()
      counts[key] = (counts[key] || 0) + 1
    })
    return Object.entries(counts)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status))
  }, [workflows])

  const kpis = [
    { label: 'Executions', value: executions.length, sub: latestExecution ? `Latest ${latestExecution.status}` : 'No runs yet', icon: BarChart3, color: COLORS.cyan },
    { label: 'Match Rate', value: `${latestStats.match_rate ?? 0}%`, sub: `${toNumber(latestStats.matched)} matched rows`, icon: TrendingUp, color: COLORS.green },
    { label: 'Open Issues', value: toNumber(latestStats.unmatched) + toNumber(latestStats.partial), sub: 'from latest execution', icon: AlertTriangle, color: COLORS.red },
    { label: 'Entities', value: entityPerformance.length, sub: 'from the latest run', icon: Users, color: COLORS.violet },
    { label: 'Workflows', value: workflows.length, sub: `${workflowStatus.length} workflow states`, icon: ShieldAlert, color: COLORS.amber },
  ]

  useEffect(() => {
    if (setHeaderOverride) {
      const subtitle = selectedProject 
        ? `Live analytics for ${selectedProject.name}` 
        : (selectedProjectId ? 'Live analytics for the selected project' : 'Select a project to view live analytics.');

      setHeaderOverride(
        <header className="bl-header" style={{ paddingRight: 0 }}>
          <div className="flex flex-col min-w-0 flex-shrink-0 mr-4">
            <h1 className="bl-header-title" style={{ fontSize: 18 }}>Project Analytics</h1>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, fontWeight: 500 }}>{subtitle}</p>
          </div>
          <div className="flex-1 flex items-center justify-end overflow-x-auto overflow-y-hidden pl-4 border-l border-[var(--border-1)] ml-auto h-full slim-scroll">
            <ProjectSelectorCard projects={projects} selectedProjectId={selectedProjectId} onChange={setSelectedProjectId} />
            {kpis.map((card) => <KpiCard key={card.label} {...card} />)}
          </div>
        </header>
      );
      return () => setHeaderOverride(null);
    }
  }, [setHeaderOverride, selectedProject, selectedProjectId, kpis, projects]);

  const handleEntitySelect = (row) => {
    const entityName = typeof row === 'string' ? row : row?.entity
    const accountName = typeof row === 'string' ? undefined : row?.account
    if (!entityName) return
    if (accountName && accountName !== 'Unassigned' && accountName !== 'General') {
      navigate(`/analytics-explorer/${encodeURIComponent(entityName)}/${encodeURIComponent(accountName)}`)
    } else {
      navigate(`/analytics-explorer/${encodeURIComponent(entityName)}`)
    }
  }
  const handleAccountSelect = (row) => {
    if (!selectedEntity || !row?.account) return
    navigate(`/analytics-explorer/${encodeURIComponent(selectedEntity)}/${encodeURIComponent(row.account)}`)
  }
  const handleProfileSelect = (row) => {
    if (!selectedEntity || !selectedAccount || !row?.profile_id) return
    navigate(`/analytics-explorer/${encodeURIComponent(selectedEntity)}/${encodeURIComponent(selectedAccount)}/${encodeURIComponent(row.profile_id)}`)
  }
  const handleExceptionSelect = (row) => {
    if (!selectedEntity || !selectedAccount || !selectedProfile || !row?.exception_id) return
    navigate(`/analytics-explorer/${encodeURIComponent(selectedEntity)}/${encodeURIComponent(selectedAccount)}/${encodeURIComponent(selectedProfile)}/${encodeURIComponent(row.exception_id)}`)
  }

  if (!selectedProjectId) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 overflow-auto p-5">
          <EmptyState title="No active project" description="Create or select a project to drive analytics from the uploaded data." />
        </div>
      </div>
    )
  }

  if (execLoading || (Number.isFinite(numericProjectId) && latestExecution && resultsLoading) || drillLoading) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 overflow-auto p-5">
          <LoadingState label="Loading project analytics..." />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto p-5 slim-scroll" style={{ background: 'var(--surface-0)' }}>



        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
          <ChartCard title="Execution Trend" subtitle="Latest runs for the selected project">
            <MatchTrendChart data={trendData} />
          </ChartCard>
          <ChartCard title="Issue Pressure" subtitle="Open issues grouped by workload">
            <IssueBucketChart data={issueBuckets} />
          </ChartCard>
        </div>

        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 12 }}>
          <ChartCard title="Entity Match Rates" subtitle="Top entities from the latest execution">
            <EntityChart data={entityPerformance} />
          </ChartCard>
          <ChartCard title="Workflow Status" subtitle="Project workflows by current status">
            <WorkflowStatusChart data={workflowStatus} />
          </ChartCard>
        </div>

        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: 12, minHeight: 0 }}>
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden', minHeight: 0 }}>
            <EntityTable data={entityPerformance} onRowClick={handleEntitySelect} />
          </div>
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <div style={{ padding: 16, borderBottom: '1px solid var(--border-1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Drill-down Explorer</p>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    {selectedEntity
                      ? selectedException
                        ? `${selectedEntity} / ${selectedAccount} / ${selectedProfile} / ${selectedException}`
                        : selectedProfile
                          ? `${selectedEntity} / ${selectedAccount} / ${selectedProfile}`
                          : selectedAccount
                            ? `${selectedEntity} / ${selectedAccount}`
                            : selectedEntity
                      : 'Select an entity to inspect account-level detail.'}
                  </p>
                </div>
                    {selectedEntity && (
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: COLORS.violet }}>
                    {drilldownData.total || drilldownItems.length} rows
                  </span>
                )}
              </div>
              {selectedEntity && (
                <button
                  className="btn-ghost text-xs h-8"
                  onClick={() => {
                    if (selectedException) navigate(`/analytics-explorer/${encodeURIComponent(selectedEntity)}/${encodeURIComponent(selectedAccount)}/${encodeURIComponent(selectedProfile)}`)
                    else if (selectedProfile) navigate(`/analytics-explorer/${encodeURIComponent(selectedEntity)}/${encodeURIComponent(selectedAccount)}`)
                    else if (selectedAccount) navigate(`/analytics-explorer/${encodeURIComponent(selectedEntity)}`)
                    else navigate('/analytics-explorer')
                  }}
                >
                  {selectedException ? 'Back to Profile' : selectedProfile ? 'Back to Account' : selectedAccount ? 'Back to Entity' : 'Clear selection'}
                </button>
              )}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }} className="slim-scroll">
              {selectedEntity ? (
                <DrilldownTable
                  level={drillLevel}
                  data={drilldownItems}
                  onSelect={drillLevel === 'account' ? handleAccountSelect : drillLevel === 'reconciliation' ? handleProfileSelect : drillLevel === 'exception' ? handleExceptionSelect : undefined}
                />
              ) : (
                <div style={{ padding: 16 }}>
                  <EmptyState title="No entity selected" description="Click any entity on the left to open account-level drill-down." />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
