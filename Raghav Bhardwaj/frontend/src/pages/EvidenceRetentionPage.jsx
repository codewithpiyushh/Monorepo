import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import PageHeader from '../components/ui/PageHeader';
import { evidenceRetentionAPI } from '../api';
import { 
  Database, Archive, FileText, HardDrive, Clock, Shield, 
  Trash2, Download, Settings, Play, CheckCircle2, AlertCircle, ArrowRight
} from 'lucide-react';

// Data will be fetched from API

export default function EvidenceRetentionPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [policies, setPolicies] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [policiesData, jobsData, metricsData] = await Promise.all([
          evidenceRetentionAPI.listPolicies(),
          evidenceRetentionAPI.listJobs(),
          evidenceRetentionAPI.getMetrics().catch(() => null)
        ]);
        setMetrics(metricsData);
        
        const mappedPolicies = (policiesData || []).map(p => ({
          id: p.id,
          name: p.doc_type || 'General Document',
          rule: `> ${p.retention_period_days} Days`,
          action: p.cold_storage_days ? 'Move to Cold Storage' : 'Hard Delete',
          isArchive: !!p.cold_storage_days
        }));
        
        const mappedJobs = (jobsData || []).map(j => {
          let uiStatus = j.status;
          if (j.status === 'PENDING') uiStatus = 'Scheduled';
          if (j.status === 'IN_PROGRESS') uiStatus = 'Running';
          if (j.status === 'COMPLETED' || j.status === 'SUCCESS') uiStatus = 'Completed';
          
          return {
            id: `JOB-${j.id.toString().padStart(3, '0')}`,
            name: `Archival Job #${j.id}`,
            dataset: `Project ${j.project_id}`,
            status: uiStatus,
            nextRun: j.started_at ? new Date(j.started_at).toLocaleString() : 'Pending',
            items: j.docs_archived?.toLocaleString() || '0',
            size: '-'
          };
        });
        
        setPolicies(mappedPolicies);
        setSchedules(mappedJobs);
      } catch (err) {
        console.error('Failed to fetch evidence retention data:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  const metricData = metrics ? [
    { label: 'Total Storage', value: metrics.total_storage, icon: HardDrive, color: 'var(--accent)' },
    { label: 'Active Data', value: metrics.active_storage, icon: Database, color: 'var(--ok)' },
    { label: 'Cold Storage (Archived)', value: metrics.cold_storage, icon: Archive, color: 'var(--warn)' },
  ] : [
    { label: 'Total Storage', value: '—', icon: HardDrive, color: 'var(--accent)' },
    { label: 'Active Data', value: '—', icon: Database, color: 'var(--ok)' },
    { label: 'Cold Storage (Archived)', value: '—', icon: Archive, color: 'var(--warn)' },
  ];

  // Chart Configuration
  const storageChartOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    legend: {
      data: ['Active Data', 'Cold Storage'],
      textStyle: { color: '#9ca3af' },
      bottom: 0
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '12%',
      top: '10%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      axisLine: { lineStyle: { color: '#4b5563' } },
      axisLabel: { color: '#9ca3af' }
    },
    yAxis: {
      type: 'value',
      name: 'Storage (GB)',
      nameTextStyle: { color: '#9ca3af' },
      axisLine: { lineStyle: { color: '#4b5563' } },
      splitLine: { lineStyle: { color: '#374151', type: 'dashed' } },
      axisLabel: { color: '#9ca3af' }
    },
    series: [
      {
        name: 'Active Data',
        type: 'bar',
        stack: 'total',
        itemStyle: { color: '#3b82f6', borderRadius: [0, 0, 4, 4] },
        data: [1200, 1320, 1010, 1340, 1400, 1450, 1500, 1480, 1520, 1580, 1600, 1500]
      },
      {
        name: 'Cold Storage',
        type: 'bar',
        stack: 'total',
        itemStyle: { color: '#8b5cf6', borderRadius: [4, 4, 0, 0] },
        data: [1500, 1600, 1800, 1900, 2100, 2200, 2350, 2400, 2500, 2600, 2650, 2700]
      }
    ]
  };

  return (
    <div className="h-full flex flex-col">

      {/* Tabs */}
      <div style={{ padding: '12px 24px', background: 'var(--surface-0)', borderBottom: '1px solid var(--border-1)' }}>
        <div className="tab-bar" style={{ background: 'var(--surface-1)', borderRadius: 8, display: 'inline-flex' }}>
          {['overview', 'policies', 'schedules', 'settings'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`tab-item ${activeTab === tab ? 'tab-active' : ''}`}
              style={{ textTransform: 'capitalize' }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4" style={{ background: 'var(--surface-0)' }}>
        {activeTab === 'overview' && (
          <div className="flex flex-col h-full gap-4">
            
            {/* Top Metrics Banner */}
            <div style={{ display: 'flex', gap: 12 }}>
              {metricData.map((metric, idx) => (
                <div key={idx} style={{ flex: 1, background: 'var(--surface-1)', border: '1px solid var(--border-1)', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>{metric.label}</p>
                    <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{metric.value}</p>
                  </div>
                  <div style={{ color: metric.color }}>
                    <metric.icon size={24} strokeWidth={1.5} />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 250 }}>
              {/* Chart Area */}
              <div style={{ flex: 2, background: 'var(--surface-1)', border: '1px solid var(--border-1)', borderRadius: 8, display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-0)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Database size={16} style={{ color: 'var(--accent)' }} />
                    Storage Growth Trends
                  </h3>
                  <button className="btn-secondary text-xs py-1 h-7 px-3 flex items-center gap-1">
                    <Download size={12} /> Export
                  </button>
                </div>
                <div style={{ flex: 1, minHeight: 0, padding: '8px' }}>
                  <ReactECharts option={storageChartOption} style={{ height: '100%', width: '100%' }} />
                </div>
              </div>

              {/* Quick Policies Area */}
              <div style={{ flex: 1, background: 'var(--surface-1)', border: '1px solid var(--border-1)', borderRadius: 8, display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-0)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Shield size={16} style={{ color: '#8b5cf6' }} />
                    Active Retention Rules
                  </h3>
                  <button className="btn-ghost text-xs py-1 h-7 px-2">
                    <Settings size={14} />
                  </button>
                </div>
                <div className="slim-scroll" style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {policies.map(policy => (
                    <div key={policy.id} style={{ background: 'var(--surface-2)', border: '1px solid var(--border-0)', borderRadius: 6, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{policy.name}</span>
                        {policy.isArchive ? <Archive size={14} style={{ color: 'var(--text-tertiary)' }} /> : <Trash2 size={14} style={{ color: 'var(--text-tertiary)' }} />}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, background: 'var(--surface-3)', color: 'var(--accent)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>
                          {policy.rule}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <ArrowRight size={10} /> {policy.action}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Archival Schedules Table */}
            <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border-1)', borderRadius: 8, display: 'flex', flexDirection: 'column', height: 180, flexShrink: 0 }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-0)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Clock size={16} style={{ color: 'var(--ok)' }} />
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Upcoming Archival Schedules</h3>
                </div>
                <button className="btn-primary text-xs py-1 h-7 px-3 flex items-center gap-1">
                  <Play size={12} /> Run Manual
                </button>
              </div>
              <div className="slim-scroll" style={{ flex: 1, overflowY: 'auto' }}>
                <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-2)', zIndex: 1 }}>
                    <tr>
                      <th style={{ padding: '6px 16px', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', borderBottom: '1px solid var(--border-0)' }}>Job ID</th>
                      <th style={{ padding: '6px 16px', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', borderBottom: '1px solid var(--border-0)' }}>Name</th>
                      <th style={{ padding: '6px 16px', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', borderBottom: '1px solid var(--border-0)' }}>Dataset</th>
                      <th style={{ padding: '6px 16px', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', borderBottom: '1px solid var(--border-0)' }}>Next Run</th>
                      <th style={{ padding: '6px 16px', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', borderBottom: '1px solid var(--border-0)' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map((schedule) => (
                      <tr key={schedule.id} style={{ borderBottom: '1px solid var(--border-0)' }}>
                        <td style={{ padding: '6px 16px', fontSize: 12, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{schedule.id}</td>
                        <td style={{ padding: '6px 16px', fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>{schedule.name}</td>
                        <td style={{ padding: '6px 16px', fontSize: 12, color: 'var(--text-secondary)' }}>{schedule.dataset}</td>
                        <td style={{ padding: '6px 16px', fontSize: 12, color: 'var(--text-secondary)' }}>{schedule.nextRun}</td>
                        <td style={{ padding: '6px 16px' }}>
                          <span style={{ 
                            fontSize: 10, padding: '2px 8px', borderRadius: 9999, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4,
                            background: schedule.status === 'Completed' ? 'rgba(34,197,94,.1)' : schedule.status === 'Running' ? 'rgba(59,130,246,.1)' : 'var(--surface-3)',
                            color: schedule.status === 'Completed' ? 'var(--ok)' : schedule.status === 'Running' ? 'var(--accent)' : 'var(--text-tertiary)'
                          }}>
                            {schedule.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {activeTab !== 'overview' && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ textAlign: 'center' }}>
              <Archive size={32} style={{ color: 'var(--text-disabled)', margin: '0 auto 12px' }} />
              <h2 style={{ fontSize: 16, color: 'var(--text-secondary)' }}>Detailed {activeTab} view</h2>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
