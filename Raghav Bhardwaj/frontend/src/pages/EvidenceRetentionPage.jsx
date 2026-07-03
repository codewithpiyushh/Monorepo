import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import PageHeader from '../components/ui/PageHeader';
import client from '../api/client';
import { 
  Database, Archive, FileText, HardDrive, Clock, Shield, 
  Trash2, Download, Settings, Play, CheckCircle2, AlertCircle, ArrowRight
} from 'lucide-react';

// Mock Data
const metricData = [
  { label: 'Total Storage', value: '4.2 TB', icon: HardDrive, color: 'text-blue-400' },
  { label: 'Active Data', value: '1.5 TB', icon: Database, color: 'text-emerald-400' },
  { label: 'Cold Storage (Archived)', value: '2.7 TB', icon: Archive, color: 'text-purple-400' },
];

// Data will be fetched from API

export default function EvidenceRetentionPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [policies, setPolicies] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [policiesRes, jobsRes] = await Promise.all([
          client.get('/api/v1/evidence-retention/policies'),
          client.get('/api/v1/evidence-retention/jobs')
        ]);
        
        const mappedPolicies = (policiesRes.data || []).map(p => ({
          id: p.id,
          name: p.doc_type || 'General Document',
          rule: `> ${p.retention_period_days} Days`,
          action: p.cold_storage_days ? 'Move to Cold Storage' : 'Hard Delete',
          isArchive: !!p.cold_storage_days
        }));
        
        const mappedJobs = (jobsRes.data || []).map(j => {
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
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader 
        title="Evidence Retention & Archival" 
        subtitle="Manage data lifecycle, archival schedules, and storage metrics for PDFs and attachments." 
      />

      {/* Tabs */}
      <div className="flex space-x-4 border-b border-[var(--border-color)] pb-2">
        {['overview', 'policies', 'schedules', 'settings'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 capitalize font-medium transition-colors ${
              activeTab === tab 
                ? 'text-blue-400 border-b-2 border-blue-400' 
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Top Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {metricData.map((metric, idx) => (
              <div key={idx} className="premium-card micro-anim p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400 mb-1">{metric.label}</p>
                  <p className="text-3xl font-bold text-white">{metric.value}</p>
                </div>
                <div className={`p-4 rounded-full bg-black/20 ${metric.color}`}>
                  <metric.icon size={32} strokeWidth={1.5} />
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chart Area */}
            <div className="lg:col-span-2 glass-panel p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Database size={20} className="text-blue-400" />
                  Storage Growth Trends
                </h3>
                <button className="text-xs text-gray-400 hover:text-white flex items-center gap-1 transition-colors">
                  <Download size={14} /> Export Report
                </button>
              </div>
              <div className="h-[350px]">
                <ReactECharts option={storageChartOption} style={{ height: '100%', width: '100%' }} />
              </div>
            </div>

            {/* Quick Policies */}
            <div className="glass-panel p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Shield size={20} className="text-purple-400" />
                  Active Retention Rules
                </h3>
                <button className="text-blue-400 hover:text-blue-300 transition-colors">
                  <Settings size={18} />
                </button>
              </div>
              <div className="space-y-4">
                {policies.map(policy => (
                  <div key={policy.id} className="premium-card p-4 hover:border-blue-500/50 transition-colors cursor-pointer group">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-medium text-gray-200 group-hover:text-white transition-colors">{policy.name}</span>
                      {policy.isArchive ? (
                        <Archive size={16} className="text-gray-400 group-hover:text-blue-400" />
                      ) : (
                        <Trash2 size={16} className="text-gray-400 group-hover:text-blue-400" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-400 font-mono text-xs">
                        {policy.rule}
                      </span>
                      <span className="text-gray-400 flex items-center gap-1">
                        <ArrowRight size={12} /> {policy.action}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Archival Schedules Table */}
          <div className="glass-panel p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Clock size={20} className="text-emerald-400" />
                  Upcoming Archival Schedules
                </h3>
                <p className="text-sm text-gray-400 mt-1">Automated jobs for moving data to cold storage or deletion.</p>
              </div>
              <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors flex items-center gap-2">
                <Play size={16} /> Run Manual Job
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-700/50 text-gray-400">
                    <th className="pb-3 font-medium">Job ID</th>
                    <th className="pb-3 font-medium">Name</th>
                    <th className="pb-3 font-medium">Target Dataset</th>
                    <th className="pb-3 font-medium">Next Run</th>
                    <th className="pb-3 font-medium">Impact (Size)</th>
                    <th className="pb-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/30">
                  {schedules.map((schedule) => (
                    <tr key={schedule.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-4 font-mono text-gray-300">{schedule.id}</td>
                      <td className="py-4 text-gray-200 font-medium">{schedule.name}</td>
                      <td className="py-4">
                        <div className="flex items-center gap-2 text-gray-400">
                          <FileText size={14} /> {schedule.dataset}
                        </div>
                      </td>
                      <td className="py-4 text-gray-300">{schedule.nextRun}</td>
                      <td className="py-4 text-gray-400">{schedule.items} items <span className="text-gray-500">({schedule.size})</span></td>
                      <td className="py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                          schedule.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400' :
                          schedule.status === 'Running' ? 'bg-blue-500/10 text-blue-400' :
                          'bg-gray-500/10 text-gray-400'
                        }`}>
                          {schedule.status === 'Completed' && <CheckCircle2 size={12} />}
                          {schedule.status === 'Running' && <AlertCircle size={12} className="animate-pulse" />}
                          {schedule.status === 'Scheduled' && <Clock size={12} />}
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
        <div className="glass-panel p-12 text-center flex flex-col items-center justify-center">
          <Archive size={48} className="text-gray-600 mb-4" strokeWidth={1} />
          <h2 className="text-xl font-medium text-gray-300 mb-2">Detailed {activeTab} view</h2>
          <p className="text-gray-500 max-w-md">
            This module provides comprehensive management for {activeTab}. Content goes here in full implementation.
          </p>
        </div>
      )}
    </div>
  );
}
