import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import ReactECharts from 'echarts-for-react'
import { BarChart3, CheckCircle2, Clock, Layers, ShieldAlert, TrendingUp, Users, AlertTriangle } from 'lucide-react'
import { projectsAPI, executionsAPI, workflowAPI } from '../api'
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
    <div style={{
      background: 'var(--surface-2)',
      border: '1px solid var(--border-1)',
      borderRadius: 10,
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      <div style={{
        width: 38,
        height: 38,
        borderRadius: 10,
        background: `${color}18`,
        border: `1px solid ${color}33`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon style={{ width: 16, height: 16, color }} />
      </div>
      <div>
        <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{label}</p>
        <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>{value}</p>
        {sub ? <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{sub}</p> : null}
      </div>
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

function EntityTable({ data }) {
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
          <tr key={row.entity}>
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

function bucketIssueLoad(openIssues) {
  if (openIssues === 0) return 'Clean'
  if (openIssues <= 2) return 'Low'
  if (openIssues <= 5) return 'Medium'
  return 'High'
}

export default function ReconciliationAnalyticsExplorer() {
  const { selectedProjectId, setSelectedProjectId } = useProjectStore()

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
    { label: 'Selected Project', value: selectedProject?.name || `#${selectedProjectId || 'N/A'}`, sub: 'live project context', icon: Layers, color: COLORS.blue },
    { label: 'Executions', value: executions.length, sub: latestExecution ? `Latest ${latestExecution.status}` : 'No runs yet', icon: BarChart3, color: COLORS.cyan },
    { label: 'Match Rate', value: `${latestStats.match_rate ?? 0}%`, sub: `${toNumber(latestStats.matched)} matched rows`, icon: TrendingUp, color: COLORS.green },
    { label: 'Open Issues', value: toNumber(latestStats.unmatched) + toNumber(latestStats.partial), sub: 'from latest execution', icon: AlertTriangle, color: COLORS.red },
    { label: 'Entities', value: entityPerformance.length, sub: 'from the latest run', icon: Users, color: COLORS.violet },
    { label: 'Workflows', value: workflows.length, sub: `${workflowStatus.length} workflow states`, icon: ShieldAlert, color: COLORS.amber },
  ]

  if (!selectedProjectId) {
    return (
      <div className="h-full flex flex-col">
        <PageHeader title="Project Analytics" subtitle="Select a project to view live analytics." />
        <div className="flex-1 overflow-auto p-5">
          <EmptyState title="No active project" description="Create or select a project to drive analytics from the uploaded data." />
        </div>
      </div>
    )
  }

  if (execLoading || (Number.isFinite(numericProjectId) && latestExecution && resultsLoading)) {
    return (
      <div className="h-full flex flex-col">
        <PageHeader
          title="Project Analytics"
          subtitle={selectedProject ? `Live analytics for ${selectedProject.name}` : 'Live project analytics'}
        />
        <div className="flex-1 overflow-auto p-5">
          <LoadingState label="Loading project analytics..." />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Project Analytics"
        subtitle={selectedProject ? `Live analytics for ${selectedProject.name}` : 'Live analytics for the selected project'}
        badge={selectedProjectId ? `Project #${selectedProjectId}` : 'No project'}
      />

      <div className="flex-1 overflow-auto p-5 slim-scroll" style={{ background: 'var(--surface-0)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {kpis.map((card) => <KpiCard key={card.label} {...card} />)}
        </div>

        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
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

        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden' }}>
            <EntityTable data={entityPerformance} />
          </div>
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, padding: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Run Summary</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                ['Matched', toNumber(latestStats.matched), COLORS.green],
                ['Partial', toNumber(latestStats.partial), COLORS.amber],
                ['Unmatched', toNumber(latestStats.unmatched), COLORS.red],
                ['Match Rate', `${latestStats.match_rate ?? 0}%`, COLORS.blue],
              ].map(([label, value, color]) => (
                <div key={label} style={{ background: 'var(--surface-1)', border: '1px solid var(--border-1)', borderRadius: 8, padding: 12 }}>
                  <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>{label}</p>
                  <p style={{ fontSize: 20, fontWeight: 700, color }}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
