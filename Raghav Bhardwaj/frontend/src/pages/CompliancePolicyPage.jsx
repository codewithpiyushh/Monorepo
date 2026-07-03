import React, { useState, useEffect } from 'react';
import client from '../api/client';
import PageHeader from '../components/ui/PageHeader';
import { 
  ShieldCheck, ShieldAlert, Activity, AlertCircle, 
  MoreVertical, RefreshCw, Filter, Download, 
  FileCheck, Shield
} from 'lucide-react';

export default function CompliancePolicyPage() {
  const [filter, setFilter] = useState('All');
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPolicies = async () => {
      try {
        const response = await client.get('/api/v1/compliance-policy');
        setPolicies(response.data);
      } catch (err) {
        console.error('Error fetching policies:', err);
        setError('Failed to load compliance policies. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchPolicies();
  }, []);
  
  const filteredPolicies = filter === 'All' 
    ? policies 
    : policies.filter(p => p.status === filter.toLowerCase());

  const getStatusColor = (status) => {
    switch(status) {
      case 'active': return 'var(--success, #10b981)';
      case 'warning': return 'var(--warning, #f59e0b)';
      case 'violated': return 'var(--danger, #ef4444)';
      default: return 'var(--text-secondary, #6b7280)';
    }
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'active': return <ShieldCheck size={16} color="var(--success, #10b981)" />;
      case 'warning': return <ShieldAlert size={16} color="var(--warning, #f59e0b)" />;
      case 'violated': return <AlertCircle size={16} color="var(--danger, #ef4444)" />;
      default: return <Shield size={16} color="var(--text-secondary, #6b7280)" />;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--background)' }}>
      <PageHeader 
        title="Compliance & Governance"
        subtitle="Policy management hub for SOX controls and governance"
        badge="Enterprise"
        actions={
          <>
            <button className="micro-anim" style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--surface-2)', border: '1px solid var(--border-1)',
              color: 'var(--text-primary)', padding: '6px 12px', borderRadius: 6,
              fontSize: 13, fontWeight: 500, cursor: 'pointer'
            }}>
              <Download size={14} /> Export Report
            </button>
            <button className="micro-anim" style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--accent)', border: '1px solid var(--accent-border)',
              color: '#fff', padding: '6px 12px', borderRadius: 6,
              fontSize: 13, fontWeight: 500, cursor: 'pointer'
            }}>
              <RefreshCw size={14} /> Sync Controls
            </button>
          </>
        }
      />

      <div style={{ padding: '24px 32px', flex: 1, overflowY: 'auto' }}>
        {/* Stats Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24, marginBottom: 32 }}>
          {[
            { label: 'Total Monitored Controls', value: '142', sub: '+12 this month', icon: Activity, color: 'var(--accent, #3b82f6)' },
            { label: 'Active Violations', value: '14', sub: '3 require immediate action', icon: AlertCircle, color: 'var(--danger, #ef4444)' },
            { label: 'Overall Compliance Score', value: '94%', sub: 'Target: >95%', icon: ShieldCheck, color: 'var(--success, #10b981)' }
          ].map((stat, i) => (
            <div key={i} className="premium-card micro-anim" style={{
              padding: 24,
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              background: 'var(--surface-1)',
              borderRadius: 12,
              border: '1px solid var(--border-1)',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)'
            }}>
              <div>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>{stat.label}</p>
                <div style={{ margin: '8px 0', fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  {stat.value}
                </div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>{stat.sub}</p>
              </div>
              <div style={{ padding: 10, borderRadius: 8, background: `${stat.color}15`, color: stat.color }}>
                <stat.icon size={24} />
              </div>
            </div>
          ))}
        </div>

        {/* Filters & Grid Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Active Policies</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            {['All', 'Active', 'Warning', 'Violated'].map(f => (
              <button 
                key={f}
                onClick={() => setFilter(f)}
                className="micro-anim"
                style={{
                  background: filter === f ? 'var(--accent-subtle)' : 'var(--surface-2)',
                  color: filter === f ? 'var(--accent)' : 'var(--text-secondary)',
                  border: `1px solid ${filter === f ? 'var(--accent-border)' : 'var(--border-1)'}`,
                  padding: '4px 12px',
                  borderRadius: 16,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                {f}
              </button>
            ))}
            <button className="micro-anim" style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'transparent', border: '1px solid var(--border-1)',
              color: 'var(--text-secondary)', padding: '4px 12px', borderRadius: 16,
              fontSize: 13, fontWeight: 500, cursor: 'pointer', marginLeft: 8
            }}>
              <Filter size={14} /> More Filters
            </button>
          </div>
        </div>

        {/* Policies Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', gridColumn: '1 / -1', color: 'var(--text-secondary)' }}>
              <RefreshCw size={32} style={{ marginBottom: 16, opacity: 0.5 }} />
              <p style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>Loading compliance policies...</p>
            </div>
          ) : error ? (
            <div style={{ padding: '40px', textAlign: 'center', gridColumn: '1 / -1', color: 'var(--danger)' }}>
              <AlertCircle size={32} style={{ marginBottom: 16, opacity: 0.8 }} />
              <p style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{error}</p>
            </div>
          ) : filteredPolicies.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', gridColumn: '1 / -1', color: 'var(--text-secondary)' }}>
              <Shield size={32} style={{ marginBottom: 16, opacity: 0.5 }} />
              <p style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>No policies found.</p>
            </div>
          ) : filteredPolicies.map((policy) => (
            <div key={policy.id} className="glass-panel premium-card micro-anim" style={{
              background: 'var(--surface-1)',
              borderRadius: 12,
              border: '1px solid var(--border-1)',
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              position: 'relative',
              overflow: 'hidden'
            }}>
              {/* Top border indicator */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                background: getStatusColor(policy.status)
              }} />

              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ marginTop: 2 }}>
                    {getStatusIcon(policy.status)}
                  </div>
                  <div>
                    <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {policy.name}
                    </h3>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
                        {policy.id}
                      </span>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--border-2)' }} />
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                        {policy.category}
                      </span>
                    </div>
                  </div>
                </div>
                <button className="micro-anim" style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
                  <MoreVertical size={16} />
                </button>
              </div>

              {/* Progress/Threshold */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Violation Threshold</span>
                  <span style={{ fontWeight: 600, color: policy.violations >= policy.threshold ? 'var(--danger, #ef4444)' : 'var(--text-primary)' }}>
                    {policy.violations} / {policy.threshold}
                  </span>
                </div>
                <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    background: getStatusColor(policy.status),
                    width: `${Math.min((policy.violations / policy.threshold) * 100, 100)}%`,
                    transition: 'width 0.5s ease-out'
                  }} />
                </div>
              </div>

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid var(--border-0)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: 'var(--text-primary)', fontSize: 10 }}>
                    {policy.owner.charAt(0)}
                  </div>
                  {policy.owner}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-tertiary)' }}>
                  <FileCheck size={12} />
                  {policy.lastAudited}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
