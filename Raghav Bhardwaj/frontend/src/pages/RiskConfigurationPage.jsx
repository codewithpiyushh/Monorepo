import React, { useState, useMemo, useEffect } from 'react';
import PageHeader from '../components/ui/PageHeader';
import { ShieldAlert, Activity, DollarSign, Clock, Layers, Save, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import client from '../api/client';

export default function RiskConfigurationPage() {
  const [weights, setWeights] = useState({
    aging: 0,
    dollarValue: 0,
    accountType: 0
  });
  
  const [entities, setEntities] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setIsLoading(true);
        const res = await client.get('/api/v1/risk-config');
        if (res.data) {
          setWeights({
            aging: res.data.aging ?? res.data.aging_weight ?? 35,
            dollarValue: res.data.dollarValue ?? res.data.materiality_weight ?? 45,
            accountType: res.data.accountType ?? res.data.account_type_weight ?? 20
          });
          if (res.data.entities) {
            setEntities(res.data.entities);
          } else if (Array.isArray(res.data.previewData)) {
            setEntities(res.data.previewData);
          }
        }
      } catch (error) {
        console.error('Failed to fetch risk configurations:', error);
        // Fallback for UI testing if backend fails
        setWeights({ aging: 35, dollarValue: 45, accountType: 20 });
      } finally {
        setIsLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleWeightChange = (key, value) => {
    setWeights(prev => ({ ...prev, [key]: parseInt(value, 10) }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await client.post('/api/v1/risk-config', {
        aging: weights.aging,
        dollarValue: weights.dollarValue,
        accountType: weights.accountType,
        aging_weight: weights.aging,
        materiality_weight: weights.dollarValue,
        account_type_weight: weights.accountType
      });
    } catch (error) {
      console.error('Failed to save risk configuration:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Ensure total is 100 for display
  const totalWeight = weights.aging + weights.dollarValue + weights.accountType;

  const scoredEntities = useMemo(() => {
    return entities.map(ent => {
      // Normalize weights
      const wAging = weights.aging / 100;
      const wDollar = weights.dollarValue / 100;
      const wType = weights.accountType / 100;
      
      const score = (ent.agingVal * wAging) + (ent.dollarVal * wDollar) + (ent.typeVal * wType);
      
      let riskLevel = 'Low';
      let riskColor = 'var(--status-success)';
      if (score >= 75) { riskLevel = 'Critical'; riskColor = 'var(--status-error)'; }
      else if (score >= 50) { riskLevel = 'High'; riskColor = 'var(--status-warning)'; }
      else if (score >= 25) { riskLevel = 'Medium'; riskColor = 'var(--status-info)'; }

      return { ...ent, score: score.toFixed(1), riskLevel, riskColor };
    }).sort((a, b) => b.score - a.score);
  }, [weights, entities]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--background)' }}>
      <PageHeader 
        title="Risk Scoring Configuration"
        subtitle="Calibrate the impact of different dimensions on overall account reconciliation risk scores."
        badge="Enterprise Model v2.4"
        actions={
          <button 
            className="micro-anim"
            onClick={handleSave}
            disabled={isSaving || isLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 13,
              cursor: (isSaving || isLoading) ? 'not-allowed' : 'pointer',
              opacity: (isSaving || isLoading) ? 0.8 : 1
            }}
          >
            {isSaving ? <RefreshCw size={16} className="spin" /> : <Save size={16} />}
            {isSaving ? 'Saving...' : 'Deploy Changes'}
          </button>
        }
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 32 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '400px 1fr', gap: 32 }}>
          
          {/* Controls Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div className="premium-card" style={{ padding: 24, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 16, borderBottom: '1px solid var(--border-1)' }}>
                <div style={{ padding: 8, borderRadius: 8, background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Weight Parameters</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>Adjust the relative importance of each risk dimension.</p>
                </div>
              </div>

              {/* Slider: Aging */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', fontWeight: 500, fontSize: 14 }}>
                    <Clock size={16} style={{ color: 'var(--status-warning)' }} /> Aging Factor
                  </div>
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{weights.aging}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" max="100" 
                  value={weights.aging} 
                  onChange={(e) => handleWeightChange('aging', e.target.value)}
                  disabled={isLoading}
                  style={{ width: '100%', accentColor: 'var(--accent)', cursor: isLoading ? 'not-allowed' : 'pointer' }}
                />
              </div>

              {/* Slider: Dollar Value */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', fontWeight: 500, fontSize: 14 }}>
                    <DollarSign size={16} style={{ color: 'var(--status-success)' }} /> Financial Impact
                  </div>
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{weights.dollarValue}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" max="100" 
                  value={weights.dollarValue} 
                  onChange={(e) => handleWeightChange('dollarValue', e.target.value)}
                  disabled={isLoading}
                  style={{ width: '100%', accentColor: 'var(--accent)', cursor: isLoading ? 'not-allowed' : 'pointer' }}
                />
              </div>

              {/* Slider: Account Type */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', fontWeight: 500, fontSize: 14 }}>
                    <Layers size={16} style={{ color: 'var(--status-info)' }} /> Account Classification
                  </div>
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{weights.accountType}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" max="100" 
                  value={weights.accountType} 
                  onChange={(e) => handleWeightChange('accountType', e.target.value)}
                  disabled={isLoading}
                  style={{ width: '100%', accentColor: 'var(--accent)', cursor: isLoading ? 'not-allowed' : 'pointer' }}
                />
              </div>

              <div style={{ 
                marginTop: 8, padding: 16, borderRadius: 8, 
                background: totalWeight === 100 ? 'var(--status-success-subtle)' : 'var(--status-warning-subtle)',
                color: totalWeight === 100 ? 'var(--status-success)' : 'var(--status-warning)',
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500
              }}>
                {totalWeight === 100 ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                Total weight: {totalWeight}% {totalWeight !== 100 && '(Recommended to equal 100%)'}
              </div>
            </div>
          </div>

          {/* Preview Column */}
          <div className="glass-panel" style={{ borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-1)', paddingBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ padding: 8, borderRadius: 8, background: 'var(--surface-2)', color: 'var(--text-primary)' }}>
                  <Activity size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Live Scenario Preview</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>Instant risk reassessment based on current weightings.</p>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {isLoading ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>
                  Loading preview data...
                </div>
              ) : scoredEntities.length > 0 ? (
                scoredEntities.map((ent) => (
                  <div key={ent.id} className="micro-anim" style={{ 
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                    padding: '16px 20px', 
                    background: 'var(--surface-1)', 
                    border: '1px solid var(--border-1)', 
                    borderRadius: 8,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{ent.name}</span>
                        <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--surface-2)', borderRadius: 4, color: 'var(--text-tertiary)' }}>{ent.id}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> {ent.agingVal}d</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><DollarSign size={12} /> {ent.dollarVal}k</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Layers size={12} /> Lvl {ent.typeVal}</span>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <div style={{ fontSize: 24, fontWeight: 700, color: ent.riskColor, lineHeight: 1 }}>
                        {ent.score}
                      </div>
                      <div style={{ 
                        fontSize: 11, fontWeight: 600, textTransform: 'uppercase', 
                        letterSpacing: '0.05em', color: ent.riskColor 
                      }}>
                        {ent.riskLevel}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No preview data available from server.
                </div>
              )}
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
