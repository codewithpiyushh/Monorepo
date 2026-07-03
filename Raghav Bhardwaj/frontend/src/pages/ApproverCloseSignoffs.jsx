import React, { useState, useEffect } from 'react';
import PageHeader from '../components/ui/PageHeader';
import { 
  Building2, ShieldCheck, CheckCircle2, 
  Clock, AlertCircle, Signature, TrendingUp, ChevronRight,
  Filter, Download
} from 'lucide-react';
import client from '../api/client';

export default function ApproverCloseSignoffs() {
  const [activeTab, setActiveTab] = useState('pending');
  const [signOffModal, setSignOffModal] = useState(null);
  const [signoffs, setSignoffs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSignoffs = async () => {
    try {
      const res = await client.get('/api/v1/entity-signoffs');
      setSignoffs(res.data);
    } catch (err) {
      console.error('Failed to fetch signoffs', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSignoffs();
  }, []);
  
  const pendingCount = signoffs.filter(d => d.status === 'Ready for Sign-off').length;
  const completedCount = signoffs.filter(d => d.status === 'Signed Off').length;

  const handleSignOff = (entity) => {
    setSignOffModal(entity);
  };

  const confirmSignOff = async () => {
    if (!signOffModal) return;
    try {
      await client.post(`/api/v1/entity-signoffs/${signOffModal.id}/signoff`);
      await fetchSignoffs();
    } catch (err) {
      console.error('Sign-off failed', err);
    }
    setSignOffModal(null);
  };

  const buttonStyle = {
    background: 'var(--accent)',
    color: '#ffffff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer'
  };

  const buttonSecondaryStyle = {
    background: 'var(--surface-2)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-1)',
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--background)' }}>
      <PageHeader 
        title="Entity Portfolio Sign-offs" 
        subtitle="Review and digitally certify completed account portfolios by business unit."
        badge="Approver Workspace"
        tabs={[
          { id: 'pending', label: 'Action Required', count: pendingCount },
          { id: 'completed', label: 'Recently Certified', count: completedCount },
          { id: 'all', label: 'All Portfolios' }
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="micro-anim" style={buttonSecondaryStyle}>
              <Filter size={14} /> Filter
            </button>
            <button className="micro-anim" style={buttonStyle}>
              <Download size={14} /> Export Report
            </button>
          </div>
        }
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
        
        {/* Summary Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Pending Sign-offs', value: pendingCount, icon: <Signature size={18} color="var(--accent)" /> },
            { label: 'Total Certified', value: completedCount, icon: <ShieldCheck size={18} color="var(--success)" /> },
            { label: 'Open Exceptions', value: '5', icon: <AlertCircle size={18} color="var(--warning)" /> },
            { label: 'Portfolio Value', value: '$84.2M', icon: <TrendingUp size={18} color="var(--text-secondary)" /> },
          ].map((stat, i) => (
            <div key={i} className="premium-card micro-anim" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ 
                width: 40, height: 40, borderRadius: 8, 
                background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' 
              }}>
                {stat.icon}
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500, marginBottom: 4 }}>{stat.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{stat.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Portfolios List */}
        <div className="glass-panel" style={{ borderRadius: 12, border: '1px solid var(--border-1)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-1)', background: 'var(--surface-1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Business Unit Portfolios</h3>
          </div>
          
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {loading ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>
            ) : signoffs.filter(item => {
              if (activeTab === 'pending') return item.status === 'Ready for Sign-off';
              if (activeTab === 'completed') return item.status === 'Signed Off';
              return true;
            }).map((item) => (
              <div key={item.id} className="premium-card micro-anim" style={{ 
                padding: 20, 
                display: 'flex', 
                flexDirection: 'column',
                gap: 16,
                borderLeft: item.status === 'Ready for Sign-off' ? '4px solid var(--accent)' : 
                            item.status === 'Signed Off' ? '4px solid var(--success)' : '4px solid var(--border-2)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Building2 size={24} color="var(--text-secondary)" />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        {item.entity}
                        <span style={{ 
                          fontSize: 10, padding: '2px 8px', borderRadius: 999, fontWeight: 600, textTransform: 'uppercase',
                          background: item.status === 'Ready for Sign-off' ? 'var(--accent-subtle)' : 
                                      item.status === 'Signed Off' ? 'var(--success-subtle)' : 'var(--surface-3)',
                          color: item.status === 'Ready for Sign-off' ? 'var(--accent)' : 
                                 item.status === 'Signed Off' ? 'var(--success)' : 'var(--text-secondary)',
                        }}>
                          {item.status}
                        </span>
                      </h4>
                      <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                        {item.portfolio} &bull; {item.region}
                      </p>
                    </div>
                  </div>
                  
                  {item.status === 'Ready for Sign-off' && (
                    <button 
                      className="micro-anim" 
                      onClick={() => handleSignOff(item)}
                      style={buttonStyle}
                    >
                      <Signature size={14} /> Digitally Sign-off
                    </button>
                  )}
                  {item.status === 'Signed Off' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success)', fontWeight: 500, fontSize: 13, padding: '8px 16px', background: 'var(--success-subtle)', borderRadius: 6 }}>
                      <CheckCircle2 size={16} /> Certified
                    </div>
                  )}
                  {item.status === 'In Progress' && (
                    <button className="micro-anim" style={buttonSecondaryStyle}>
                      View Details <ChevronRight size={14} />
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, padding: '16px', background: 'var(--surface-1)', borderRadius: 8, border: '1px solid var(--border-1)' }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Accounts</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{item.accounts}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Reconciled</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{item.reconciled} / {item.accounts}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Exceptions</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: item.exceptions > 0 ? 'var(--error)' : 'var(--text-primary)' }}>{item.exceptions}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Total Balance</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{item.totalBalance}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Due Date</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={12} /> {item.dueDate}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sign Off Modal */}
      {signOffModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="premium-card micro-anim" style={{ width: 500, padding: 32, borderRadius: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--accent-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShieldCheck size={20} color="var(--accent)" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>Digital Sign-off</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>Certify portfolio completion</p>
              </div>
            </div>
            
            <div style={{ padding: 16, background: 'var(--surface-1)', borderRadius: 8, marginBottom: 24, border: '1px solid var(--border-1)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{signOffModal.entity}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{signOffModal.accounts} Accounts &bull; {signOffModal.totalBalance} Total Balance</div>
            </div>

            <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: 24 }}>
              By signing off, I certify that I have reviewed the reconciliation portfolio for this business unit. 
              All underlying accounts have been reconciled according to corporate policy, and any outstanding exceptions 
              have been documented and escalated appropriately.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button className="micro-anim" style={buttonSecondaryStyle} onClick={() => setSignOffModal(null)}>Cancel</button>
              <button className="micro-anim" style={buttonStyle} onClick={confirmSignOff}>
                <Signature size={14} /> Confirm Certification
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
