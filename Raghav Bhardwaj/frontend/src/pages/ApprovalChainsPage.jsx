import React, { useState, useEffect } from 'react';
import PageHeader from '../components/ui/PageHeader';
import { Network, GitMerge, AlertCircle, ArrowRight, CheckCircle, Clock, Search, Plus, Filter, MoreVertical, DollarSign, Activity, Trash2 } from 'lucide-react';
import client from '../api/client';
import { approvalChainsAPI } from '../api';
import { useProjectStore } from '../store/projectStore';

export default function ApprovalChainsPage() {
  const selectedProjectId = useProjectStore((state) => state.selectedProjectId);
  const [activeTab, setActiveTab] = useState('active');
  const [chains, setChains] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchChains();
  }, [selectedProjectId]);

  const fetchChains = async () => {
    try {
      setIsLoading(true);
      const res = await approvalChainsAPI.list({ project_id: selectedProjectId });
      const rawList = res.data || res || [];
      const mapped = rawList.map((c) => ({
        ...c,
        name: `Approval Routing Rule #${c.id}`,
        description: `Automatically route matching groups where ${c.condition_field} ${c.condition_operator} ${c.condition_value} to ${c.action}.`,
        status: c.is_active ? 'active' : 'draft',
      }));
      setChains(mapped);
    } catch (error) {
      console.error('Failed to fetch approval chains:', error);
      setChains([]); // fallback
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddChain = async () => {
    try {
      const newChain = {
        condition_field: 'amount',
        condition_operator: '>',
        condition_value: '50000',
        action: 'Route to Manager',
        target_role: 'approver',
        is_active: true,
        project_id: selectedProjectId
      };
      await approvalChainsAPI.create(newChain);
      fetchChains();
    } catch (error) {
      console.error('Failed to add approval chain:', error);
    }
  };

  const handleDeleteChain = async (id) => {
    try {
      await approvalChainsAPI.delete(id);
      fetchChains();
    } catch (error) {
      console.error('Failed to delete approval chain:', error);
    }
  };

  const filteredChains = chains.filter(c => 
    activeTab === 'all' || 
    (activeTab === 'active' && c.status === 'active') || 
    (activeTab === 'draft' && c.status === 'draft') || 
    (activeTab === 'archived' && c.status === 'archived')
  );

  const activeCount = chains.filter(c => c.status === 'active').length;
  const draftCount = chains.filter(c => c.status === 'draft').length;
  const archivedCount = chains.filter(c => c.status === 'archived').length;

  return (
    <div className="app-shell flex-col h-full bg-[var(--surface-0)] overflow-hidden">
      <PageHeader 
        title="Approval Chains" 
        subtitle="Configure and manage intelligent routing rules for reconciliation approvals."
        badge="Enterprise"
        tabs={[
          { id: 'active', label: 'Active Chains', count: activeCount },
          { id: 'draft', label: 'Drafts', count: draftCount },
          { id: 'archived', label: 'Archived', count: archivedCount }
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        actions={
          <div className="flex items-center gap-3">
            <button className="btn-secondary">
              <Search size={16} />
            </button>
            <button className="btn-primary" onClick={handleAddChain}>
              <Plus size={16} /> New Chain
            </button>
          </div>
        }
      />
      
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Visual Header / KPI */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="premium-card glass-panel micro-anim p-5 rounded-xl border border-[var(--border-1)] flex items-center justify-between shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all">
             <div>
                <p className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Active Rules</p>
                <div className="text-2xl font-bold text-[var(--text-primary)]">{activeCount}</div>
             </div>
             <div className="w-10 h-10 rounded-full bg-[var(--accent-subtle)] flex items-center justify-center text-[var(--accent)] border border-[var(--accent-border)]">
                <Network size={20} />
             </div>
          </div>
          <div className="premium-card glass-panel micro-anim p-5 rounded-xl border border-[var(--border-1)] flex items-center justify-between shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all">
             <div>
                <p className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Routed This Week</p>
                <div className="text-2xl font-bold text-[var(--text-primary)]">842</div>
             </div>
             <div className="w-10 h-10 rounded-full bg-[var(--info-bg)] flex items-center justify-center text-[var(--info)] border border-[var(--info-bdr)]">
                <Activity size={20} />
             </div>
          </div>
          <div className="premium-card glass-panel micro-anim p-5 rounded-xl border border-[var(--border-1)] flex items-center justify-between shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all">
             <div>
                <p className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Avg Resolution Time</p>
                <div className="text-2xl font-bold text-[var(--text-primary)]">4.2 hrs</div>
             </div>
             <div className="w-10 h-10 rounded-full bg-[var(--ok-bg)] flex items-center justify-center text-[var(--ok)] border border-[var(--ok-bdr)]">
                <Clock size={20} />
             </div>
          </div>
        </div>

        {/* List of chains */}
        <div className="space-y-6">
          {isLoading ? (
            <div className="text-center p-16 text-[var(--text-tertiary)]">
               <div className="animate-spin w-8 h-8 mx-auto mb-4 flex items-center justify-center rounded-full border-2 border-[var(--accent)] border-t-transparent"></div>
               <p>Loading approval chains...</p>
            </div>
          ) : (
            <>
              {filteredChains.map(chain => (
                <div key={chain.id} className="premium-card glass-panel micro-anim rounded-xl border border-[var(--border-1)] bg-[var(--surface-2)] overflow-hidden flex flex-col shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all">
                  
                  <div className="flex items-start justify-between p-5 border-b border-[var(--border-1)] bg-[var(--surface-1)]">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-[16px] font-bold text-[var(--text-primary)]">{chain.name}</h3>
                        <span className={`badge ${chain.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>
                          {(chain.status || 'draft').toUpperCase()}
                        </span>
                      </div>
                      <p className="text-[13px] text-[var(--text-secondary)]">{chain.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="btn-ghost btn-sm text-[var(--text-tertiary)]"><Filter size={14} /> Simulate</button>
                      <button 
                        className="btn-icon hover:text-[var(--danger)] hover:bg-[var(--danger-subtle)] transition-colors"
                        onClick={() => handleDeleteChain(chain.id)}
                        title="Delete Chain"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="p-6">
                     <div className="flex items-center gap-4 text-[11px] text-[var(--text-tertiary)] mb-5 font-bold uppercase tracking-wider">
                       <span>Routing Logic Visualizer</span>
                     </div>
                     
                     <div className="flex flex-col gap-4 relative">
                        {/* Vertical connector line */}
                        <div className="absolute left-[23px] top-[30px] bottom-[30px] w-0.5 bg-[var(--border-2)] z-0"></div>

                        <div className="relative z-10 flex items-center gap-5">
                             
                             <div className="w-12 h-12 rounded-full bg-[var(--surface-3)] border-2 border-[var(--border-2)] flex items-center justify-center flex-shrink-0 shadow-[var(--shadow-sm)] relative">
                                 <GitMerge size={20} className="text-[var(--text-secondary)]" />
                             </div>

                             <div className="flex-1 premium-card p-4 rounded-lg border border-[var(--border-1)] bg-[var(--surface-2)] flex items-center justify-between transition-all hover:border-[var(--accent-border)] hover:bg-[var(--surface-3)] cursor-pointer group">
                                <div className="flex items-center gap-5">
                                  <div className="bg-[var(--surface-0)] px-3 py-1.5 rounded-md text-[13px] font-mono text-[var(--text-primary)] border border-[var(--border-1)] shadow-sm flex items-center gap-2 group-hover:border-[var(--accent-border)] transition-colors">
                                     {chain.condition_field?.includes('amount') ? <DollarSign size={14} className="text-[var(--text-secondary)]"/> : null}
                                     {chain.condition_field} {chain.condition_operator} {chain.condition_value}
                                  </div>
                                  <ArrowRight size={16} className="text-[var(--text-tertiary)] group-hover:text-[var(--accent)] transition-colors" />
                                  <div className="text-[14px] font-medium text-[var(--text-primary)] flex items-center gap-2">
                                     <CheckCircle size={16} className="text-[var(--ok)]" />
                                     {chain.action}
                                  </div>
                                </div>
                             </div>
                        </div>
                     </div>
                  </div>
                  
                  <div className="px-6 py-3 border-t border-[var(--border-1)] bg-[var(--surface-1)] flex justify-between items-center text-[12px] text-[var(--text-secondary)]">
                    <div>Chain ID: <span className="font-mono text-[var(--text-primary)] ml-1">{chain.id}</span></div>
                    <div className="flex items-center gap-1"><Activity size={12} className="text-[var(--accent)]"/> Used in <span className="font-semibold text-[var(--text-primary)]">{chain.usageCount || 0}</span> workflows</div>
                  </div>
                </div>
              ))}

              {filteredChains.length === 0 && (
                <div className="text-center p-16 text-[var(--text-tertiary)] border-2 border-dashed border-[var(--border-1)] rounded-xl bg-[var(--surface-1)]">
                   <Network size={48} className="mx-auto mb-4 opacity-30" />
                   <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">No chains found</h3>
                   <p className="max-w-md mx-auto">No approval chains match the selected view. Try switching tabs or creating a new chain.</p>
                   <button className="btn-primary mt-6" onClick={handleAddChain}><Plus size={16}/> Create Chain</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
