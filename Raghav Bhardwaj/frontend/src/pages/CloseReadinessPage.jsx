import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Clock, 
  ChevronRight, 
  ShieldCheck, 
  Activity, 
  FileCheck, 
  Users,
  RefreshCw
} from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import client from '../api/client';

const CloseReadinessPage = () => {
  const { setHeaderOverride } = useOutletContext() || {};
  const [checks, setChecks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const pageBg = 'linear-gradient(180deg, #fafbff 0%, #f5f7fb 46%, #eef2f7 100%)';
  const panelStyle = {
    background: 'rgba(255,255,255,0.88)',
    border: '1px solid rgba(148,163,184,0.22)',
    boxShadow: '0 16px 40px rgba(15,23,42,0.06)',
    backdropFilter: 'blur(10px)',
  };

  const fetchReadiness = async () => {
    try {
      setError('');
      setIsRefreshing(true);
      setIsLoading(true);
      const res = await client.get('/api/v1/close-readiness');
      const data = res.data?.readiness || {};
      
      const mappedChecks = [
        {
          id: 1,
          category: 'Exceptions',
          title: 'Critical Exceptions Resolved',
          description: 'Ensure all high-priority exceptions are addressed before close.',
          status: data.all_critical_exceptions_resolved ? 'pass' : 'fail',
          icon: AlertCircle,
          lastChecked: 'Just now'
        },
        {
          id: 2,
          category: 'Profiles',
          title: 'High-Risk Profiles Certified',
          description: 'All profiles identified as high-risk must have current certification.',
          status: data.all_high_risk_certified ? 'pass' : 'fail',
          icon: ShieldCheck,
          lastChecked: 'Just now'
        },
        {
          id: 3,
          category: 'Reconciliation',
          title: 'Key Accounts Reconciled',
          description: 'Top 50 key accounts by volume are fully reconciled.',
          status: data.key_accounts_reconciled ? 'pass' : 'fail',
          icon: FileCheck,
          lastChecked: 'Just now'
        },
        {
          id: 4,
          category: 'Approvals',
          title: 'Managerial Sign-offs',
          description: 'All required department heads have provided sign-off.',
          status: data.managerial_signoffs_complete ? 'pass' : 'warning',
          icon: Users,
          lastChecked: 'Just now'
        },
        {
          id: 5,
          category: 'System',
          title: 'Data Feeds Synchronized',
          description: 'All upstream data feeds are fully synced and verified.',
          status: data.data_feeds_synchronized ? 'pass' : 'fail',
          icon: Activity,
          lastChecked: 'Just now'
        }
      ];
      setChecks(mappedChecks);
    } catch (error) {
      console.error('Error fetching readiness:', error);
      setError(error?.response?.data?.detail || 'Unable to load close readiness checks.');
      setChecks([]);
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReadiness();
  }, []);

  const handleRefresh = () => {
    fetchReadiness();
  };

  const getStatusConfig = (status) => {
    switch(status) {
      case 'pass':
        return {
          color: 'text-emerald-500',
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/20',
          icon: <CheckCircle2 className="w-6 h-6 text-emerald-500" />,
          label: 'PASS'
        };
      case 'fail':
        return {
          color: 'text-rose-500',
          bg: 'bg-rose-500/10',
          border: 'border-rose-500/20',
          icon: <XCircle className="w-6 h-6 text-rose-500" />,
          label: 'FAIL'
        };
      case 'warning':
        return {
          color: 'text-amber-500',
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/20',
          icon: <Clock className="w-6 h-6 text-amber-500" />,
          label: 'PENDING'
        };
      default:
        return {
          color: 'text-slate-400',
          bg: 'bg-slate-500/10',
          border: 'border-slate-500/20',
          icon: <Activity className="w-6 h-6 text-slate-400" />,
          label: 'UNKNOWN'
        };
    }
  };

  const passedCount = checks.filter(c => c.status === 'pass').length;
  const totalCount = checks.length;
  const progressPercentage = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;
  const isReady = totalCount > 0 && checks.every(c => c.status === 'pass');

  useEffect(() => {
    if (setHeaderOverride) {
      setHeaderOverride(
        <header className="bl-header" style={{ padding: '0 24px', background: 'rgba(255,255,255,0.92)', borderBottom: '1px solid rgba(148,163,184,0.16)' }}>
          <div className="flex flex-col min-w-0 flex-shrink-0">
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#6b7280', lineHeight: 1, fontFamily: 'Inter, sans-serif' }}>
              ANALYTICS
            </p>
            <div className="flex items-center gap-3 mt-[2px]">
              <h1 className="bl-header-title" style={{ color: '#0f172a' }}>Close Readiness Engine</h1>
            </div>
          </div>
          
          <div className="flex-1" />
          
          <div className="flex items-center gap-4">
            <button 
              onClick={handleRefresh}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border transition-all micro-anim h-8"
              style={{ background: 'linear-gradient(180deg, #eef2ff 0%, #e0e7ff 100%)', color: '#4f46e5', borderColor: '#c7d2fe', fontSize: 12, fontWeight: 700 }}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Run Checks
            </button>
          </div>
        </header>
      );
    }
    return () => setHeaderOverride?.(null);
  }, [setHeaderOverride, isRefreshing]);

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: pageBg, color: '#0f172a' }}>

      {/* Dashboard Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 micro-anim col-span-1 md:col-span-2" style={{ ...panelStyle, borderRadius: 20 }}>
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-bold tracking-wide" style={{ color: '#0f172a' }}>Overall Readiness Status</h2>
              <p className="text-sm mt-1" style={{ color: '#64748b' }}>Real-time aggregation of pre-close validations</p>
            </div>
          </div>

          <div className="flex items-center gap-8">
            <div className="relative w-32 h-32 flex-shrink-0 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-200" />
                <circle 
                  cx="50" cy="50" r="45" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="8" 
                  strokeDasharray={`${progressPercentage * 2.83} 283`}
                  className={`${isReady ? 'text-emerald-500' : 'text-indigo-500'} transition-all duration-1000 ease-out`} 
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold" style={{ color: '#0f172a' }}>{isLoading ? '—' : `${progressPercentage}%`}</span>
              </div>
            </div>
            
            <div className="flex-1 grid grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border" style={{ background: '#f8fafc', borderColor: '#dbe4ee' }}>
                <div className="text-sm font-medium mb-1" style={{ color: '#64748b' }}>Total Checks</div>
                <div className="text-2xl font-semibold" style={{ color: '#0f172a' }}>{totalCount}</div>
              </div>
              <div className="p-4 rounded-xl border" style={{ background: '#ecfdf5', borderColor: '#a7f3d0' }}>
                <div className="text-sm font-medium mb-1" style={{ color: '#059669' }}>Passed</div>
                <div className="text-2xl font-semibold" style={{ color: '#059669' }}>{passedCount}</div>
              </div>
              <div className="p-4 rounded-xl border" style={{ background: '#fff1f2', borderColor: '#fecdd3' }}>
                <div className="text-sm font-medium mb-1" style={{ color: '#e11d48' }}>Failed</div>
                <div className="text-2xl font-semibold" style={{ color: '#e11d48' }}>{checks.filter(c => c.status === 'fail').length}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 micro-anim flex flex-col justify-between" style={{ ...panelStyle, borderRadius: 20 }}>
          <div>
            <h3 className="text-lg font-bold mb-2" style={{ color: '#0f172a' }}>Final Decision</h3>
            <p className="text-sm" style={{ color: '#64748b' }}>System recommendation based on current validation state.</p>
          </div>
          
          <div className={`mt-6 p-6 rounded-2xl border ${isLoading ? 'bg-slate-50 border-slate-200' : isReady ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'} flex flex-col items-center text-center`}>
            {isLoading ? (
              <>
                <Activity className="w-12 h-12 text-slate-500 mb-3" />
                <h4 className="text-2xl font-bold text-slate-700">RUNNING</h4>
                <p className="text-slate-500 text-sm mt-2">Loading validation results</p>
              </>
            ) : isReady ? (
              <>
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-3" />
                <h4 className="text-2xl font-bold text-emerald-700">GO</h4>
                <p className="text-emerald-700 text-sm mt-2">All systems ready for close</p>
              </>
            ) : (
              <>
                <XCircle className="w-12 h-12 text-rose-500 mb-3" />
                <h4 className="text-2xl font-bold text-rose-700">NO-GO</h4>
                <p className="text-rose-700 text-sm mt-2">{error || 'Critical issues require attention'}</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Readiness Checklist */}
      <div className="space-y-4 mt-8">
        <h3 className="text-xl font-bold px-2" style={{ color: '#0f172a' }}>Validation Engine Logs</h3>
        {isLoading && (
          <div className="p-5 text-sm" style={{ ...panelStyle, borderRadius: 18, color: '#475569' }}>
            Running close readiness checks...
          </div>
        )}
        {!!error && !isLoading && (
          <div className="p-5 text-sm border" style={{ borderRadius: 18, color: '#b91c1c', background: '#fff1f2', borderColor: '#fecdd3' }}>
            {error}
          </div>
        )}
        
        <div className="grid grid-cols-1 gap-4">
          {checks.map((check) => {
            const status = getStatusConfig(check.status);
            return (
              <div 
                key={check.id} 
                className="p-5 flex items-center gap-6 micro-anim group transition-colors"
                style={{ ...panelStyle, borderRadius: 18 }}
              >
                <div className={`p-3 rounded-xl ${status.bg} border ${status.border}`}>
                  {status.icon}
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#4f46e5' }}>
                      {check.category}
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#cbd5e1' }}></span>
                    <span className="text-xs" style={{ color: '#64748b' }}>
                      Checked {check.lastChecked}
                    </span>
                  </div>
                  <h4 className="text-lg font-medium transition-colors" style={{ color: '#0f172a' }}>
                    {check.title}
                  </h4>
                  <p className="text-sm mt-1" style={{ color: '#64748b' }}>
                    {check.description}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className={`px-4 py-1.5 rounded-full border font-bold text-sm tracking-wide flex items-center gap-2 ${status.bg} ${status.border} ${status.color}`}>
                    {status.label}
                  </div>
                  <button className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
      );
  };

export default CloseReadinessPage;
