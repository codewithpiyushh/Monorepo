// frontend/src/pages/BalanceReconciliationPage.jsx
// Balance Reconciliation Workspace — Oracle ARCS-style GL vs Supporting balance view.
// Styling and layout mirrors ReconciliationProfilesPage.jsx exactly.

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Scale, Plus, RefreshCw, ChevronDown, ChevronUp,
  CheckCircle, XCircle, AlertTriangle, Clock,
  TrendingUp, DollarSign, FileText, Eye, Send,
  ThumbsUp, ThumbsDown, Award, History, Filter, ChevronRight, ChevronLeft
} from 'lucide-react';
import toast from 'react-hot-toast';
import balancesAPI from '../api/balancesAPI';
import { useAuthStore } from '../store/authStore';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import WorkflowLifecyclePanel, { isBalanceLocked } from './WorkflowLifecyclePanel';
import SupportingItemsPanel from './SupportingItemsPanel';
import RootCauseNarrativeBlock from '../components/balance/RootCauseNarrativeBlock';
import CommentThreadPanel from './CommentThreadPanel';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_META = {
  DRAFT:            { label: 'Draft',            color: '#8a8a9a', bg: 'rgba(138,138,154,0.12)', icon: FileText },
  BALANCED:         { label: 'Balanced',         color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   icon: CheckCircle },
  WITHIN_THRESHOLD: { label: 'Within Threshold', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', icon: CheckCircle },
  OUT_OF_BALANCE:   { label: 'Out of Balance',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  icon: XCircle },
  UNDER_REVIEW:     { label: 'Under Review',     color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: Clock },
  APPROVED:         { label: 'Approved',         color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  icon: ThumbsUp },
  CERTIFIED:        { label: 'Certified',        color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', icon: Award },
  REJECTED:         { label: 'Rejected',         color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  icon: XCircle },
};

const ROLE_ACTIONS = {
  preparer:  ['submit'],
  reviewer:  ['reject'],
  approver:  ['approve', 'reject'],
  certifier: ['certify'],
  admin:     ['submit', 'approve', 'reject', 'certify'],
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.DRAFT;
  const Icon = meta.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      color: meta.color, background: meta.bg,
    }}>
      <Icon size={11} />
      {meta.label}
    </span>
  );
}

function KpiCard({ label, value, sub, color = 'var(--text-primary)', icon: Icon }) {
  return (
    <div style={{
      background: 'linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)', 
      border: '1px solid rgba(255,255,255,0.06)',
      backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      borderRadius: 10, padding: '8px 12px', display: 'flex', flexDirection: 'column',
      boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
      transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.1)' }}
    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        {Icon && <Icon size={12} color="var(--text-tertiary)" />}
        <span style={{ fontSize: 9.5, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={value}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function VarianceBar({ amount, threshold, materiality }) {
  if (!threshold && !materiality) return null;
  const limit = materiality || threshold;
  const pct = Math.min((amount / limit) * 100, 100);
  const color = amount === 0 ? '#22c55e' : amount <= threshold ? '#3b82f6' : '#ef4444';
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 3 }}>
        <span>Variance vs Limit</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div style={{ height: 4, background: 'var(--border-0)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.4s' }} />
      </div>
    </div>
  );
}

function WorkflowProgress({ status }) {
  const stages = ['DRAFT', 'UNDER_REVIEW', 'APPROVED', 'CERTIFIED'];
  const rejectedStates = new Set(['REJECTED']);
  const isRejected = rejectedStates.has(status);
  const currentIdx = stages.indexOf(status);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, fontSize: 10 }}>
      {stages.map((stage, i) => {
        const done = currentIdx > i || (currentIdx === i && !isRejected);
        const active = currentIdx === i && !isRejected;
        const color = isRejected && i <= currentIdx ? '#ef4444'
          : done ? '#22c55e'
          : active ? '#FFE600'
          : 'var(--border-1)';
        return (
          <React.Fragment key={stage}>
            <div style={{
              width: 20, height: 20, borderRadius: '50%',
              background: color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 700,
              color: done || active ? '#000' : 'var(--text-tertiary)',
              flexShrink: 0,
            }}>
              {i + 1}
            </div>
            {i < stages.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? '#22c55e' : 'var(--border-0)', minWidth: 16 }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Create Modal ──────────────────────────────────────────────────────────────

function CreateBalanceModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    profile_id: '', period_key: '', source_balance: '', target_balance: '', comments: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.profile_id || !form.period_key || form.source_balance === '' || form.target_balance === '') {
      toast.error('Profile, period, source balance and target balance are required.');
      return;
    }
    setSaving(true);
    try {
      const created = await balancesAPI.create({
        profile_id:     parseInt(form.profile_id),
        period_key:     form.period_key.trim(),
        source_balance: parseFloat(form.source_balance),
        target_balance: parseFloat(form.target_balance),
        comments:       form.comments || undefined,
      });
      toast.success('Balance reconciliation created.');
      onCreated(created);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to create balance reconciliation.');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '8px 12px', borderRadius: 8,
    border: '1px solid var(--border-1)', background: 'var(--surface-0)',
    color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--surface-1)', border: '1px solid var(--border-0)',
        borderRadius: 14, padding: 28, width: 480, maxWidth: '95vw',
      }}>
        <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
          New Balance Reconciliation
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { label: 'Profile ID', key: 'profile_id', type: 'number', placeholder: 'e.g. 1' },
            { label: 'Period Key', key: 'period_key', type: 'text', placeholder: 'e.g. 2026-05' },
            { label: 'Source Balance (GL)', key: 'source_balance', type: 'number', placeholder: '0.00' },
            { label: 'Target Balance (Bank/Supporting)', key: 'target_balance', type: 'number', placeholder: '0.00' },
          ].map(({ label, key, type, placeholder }) => (
            <div key={key}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
                {label}
              </label>
              <input
                type={type}
                placeholder={placeholder}
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                style={inputStyle}
              />
            </div>
          ))}

          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
              Comments (optional)
            </label>
            <textarea
              placeholder="Notes or context..."
              value={form.comments}
              onChange={e => setForm(f => ({ ...f, comments: e.target.value }))}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border-1)',
              background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              padding: '8px 22px', borderRadius: 8, border: 'none',
              background: '#FFE600', color: '#1a1a2e', fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Action Modal ──────────────────────────────────────────────────────────────

function ActionModal({ action, balance, onClose, onDone }) {
  const [comments, setComments] = useState('');
  const [loading, setLoading] = useState(false);

  const actionConfig = {
    submit:  { label: 'Submit for Review', fn: balancesAPI.submit,  color: '#3b82f6', requireComment: false },
    approve: { label: 'Approve',           fn: balancesAPI.approve, color: '#22c55e', requireComment: false },
    reject:  { label: 'Reject',            fn: balancesAPI.reject,  color: '#ef4444', requireComment: true },
    certify: { label: 'Certify',           fn: balancesAPI.certify, color: '#8b5cf6', requireComment: false },
  };

  const cfg = actionConfig[action];

  const handleAction = async () => {
    if (cfg.requireComment && !comments.trim()) {
      toast.error('Comments are required for this action.');
      return;
    }
    setLoading(true);
    try {
      await cfg.fn(balance.id, { comments: comments || undefined });
      toast.success(`Balance ${action}d successfully.`);
      onDone();
    } catch (err) {
      toast.error(err?.response?.data?.detail || `Failed to ${action}.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--surface-1)', border: '1px solid var(--border-0)',
        borderRadius: 14, padding: 26, width: 420, maxWidth: '95vw',
      }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700 }}>{cfg.label}</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-tertiary)' }}>
          Period: {balance.period_key} · Variance: {(balance.variance_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </p>

        <textarea
          placeholder={cfg.requireComment ? 'Reason is required…' : 'Optional comments…'}
          value={comments}
          onChange={e => setComments(e.target.value)}
          rows={4}
          style={{
            width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box',
            border: '1px solid var(--border-1)', background: 'var(--surface-0)',
            color: 'var(--text-primary)', fontSize: 13, resize: 'vertical', outline: 'none',
          }}
        />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border-1)',
              background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleAction}
            disabled={loading}
            style={{
              padding: '8px 22px', borderRadius: 8, border: 'none',
              background: cfg.color, color: '#fff', fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13, opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Processing…' : cfg.label}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Balance Row ────────────────────────────────────────────────────────────────

function BalanceRow({ balance, role, onAction, onView, onNarrativeSaved, isHighlighted }) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const allowedActions = ROLE_ACTIONS[role?.toLowerCase()] || [];

  const canSubmit  = allowedActions.includes('submit')  && ['DRAFT', 'REJECTED', 'BALANCED', 'WITHIN_THRESHOLD', 'OUT_OF_BALANCE'].includes(balance.status);
  const canApprove = allowedActions.includes('approve') && balance.status === 'UNDER_REVIEW';
  const canReject  = allowedActions.includes('reject')  && ['UNDER_REVIEW', 'APPROVED'].includes(balance.status);
  const canCertify = allowedActions.includes('certify') && balance.status === 'APPROVED';

  const variance = balance.variance_amount || 0;
  const isOutOfBalance = balance.status === 'OUT_OF_BALANCE';
  const varianceColor = variance === 0 ? '#22c55e' : isOutOfBalance ? '#ef4444' : '#3b82f6';

  return (
    <div style={{
      background: isHighlighted ? 'rgba(255, 230, 0, 0.08)' : 'linear-gradient(145deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.0) 100%)', 
      border: `1px solid ${isHighlighted ? '#FFE600' : isOutOfBalance ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.05)'}`,
      backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      borderRadius: 8, overflow: 'hidden', marginBottom: 4,
      boxShadow: '0 1px 6px rgba(0,0,0,0.03)',
      transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.2s',
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)' }}
    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 6px rgba(0,0,0,0.03)' }}>
      {/* Main Header Row */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        <div style={{ flex: 2, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 2 }}>
            <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
              {balance.profile_name ? `${balance.profile_name}` : `Profile #${balance.profile_id}`} - {balance.period_key}
            </h3>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-tertiary)' }}>
              {balance.project_name ? `Project: ${balance.project_name} | ` : ''}ID: {balance.id}
            </p>
            {(balance.comment_count || 0) > 0 && (
              <span style={{ 
                fontSize: 10, padding: '2px 6px', borderRadius: '10px', 
                background: 'var(--surface-2)', color: 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', gap: 3 
              }}>
                💬 {balance.comment_count}
              </span>
            )}
          </div>
          <WorkflowProgress status={balance.status} />
        </div>

        {/* ... Rest of your existing header info (GL Balance, Supporting, etc) ... */}
        <div style={{ flex: 1, textAlign: 'right' }}><div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>GL Balance</div><div style={{ fontSize: 12, fontWeight: 600 }}>{(balance.source_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
        <div style={{ flex: 1, textAlign: 'right' }}><div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>Supporting</div><div style={{ fontSize: 12, fontWeight: 600 }}>{(balance.target_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
        <div style={{ flex: 1, textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>Variance</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: varianceColor }}>{variance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}><StatusBadge status={balance.status} /></div>
        <div>{expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{
          borderTop: '1px solid var(--border-0)',
          padding: '16px 18px',
          background: 'var(--surface-0)',
          display: 'grid',
          gridTemplateColumns: '1fr 350px', // Content on left, comments on right
          gap: '24px',
        }}>
          {/* LEFT: Data & Lifecycle */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <WorkflowLifecyclePanel balance={balance} profile={null} />
            <SupportingItemsPanel balance={balance} profile={null} />
            <RootCauseNarrativeBlock balance={balance} onSaved={onNarrativeSaved} />
            
            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={(e) => { e.stopPropagation(); onView(balance); }} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-1)', background: 'transparent' }}>
                    <History size={13} /> History
                </button>
                {variance !== 0 && balance.profile_id && (
                  <button onClick={(e) => { e.stopPropagation(); navigate(`/transaction-matching-workspace?profileId=${balance.profile_id}&period=${balance.period_key}`); }} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--brand)', background: 'rgba(77, 148, 255, 0.1)', color: 'var(--brand)' }}>
                      <Eye size={13} /> Investigate Variance
                  </button>
                )}
                {canSubmit && !isBalanceLocked(balance.status) && (
                    <button onClick={(e) => { e.stopPropagation(); onAction('submit', balance); }} style={{ border: 'none', background: '#3b82f6', color: '#fff', padding: '7px 14px', borderRadius: 8 }}>
                        <Send size={13} /> Submit
                    </button>
                )}
            </div>
          </div>

          {/* RIGHT: Collaboration Sidebar */}
          <div style={{ borderLeft: '1px solid var(--border-0)', paddingLeft: '24px' }}>
            <CommentThreadPanel balance={balance} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── History Drawer ────────────────────────────────────────────────────────────

function HistoryDrawer({ balance, collapsed, onToggleCollapse, onClose }) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['balance-history', balance.id],
    queryFn: () => balancesAPI.getHistory(balance.id),
  });

  if (collapsed) {
    return (
      <div style={{
        width: 48, height: '100%', flexShrink: 0,
        background: 'var(--surface-1)', borderLeft: '1px solid var(--border-0)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 24,
      }}>
        <button onClick={onToggleCollapse} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }} title="Expand Audit History">
          <ChevronLeft size={20} />
        </button>
      </div>
    );
  }

  return (
    <div style={{
      width: 380, height: '100%', flexShrink: 0,
      background: 'var(--surface-1)', borderLeft: '1px solid var(--border-0)',
      padding: 24, overflowY: 'auto', transition: 'width 0.3s ease'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={onToggleCollapse} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 0 }} title="Collapse">
            <ChevronRight size={18} />
          </button>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Audit History</h3>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-tertiary)' }}>×</button>
      </div>

      {isLoading ? (
        <Skeleton />
      ) : history.length === 0 ? (
        <EmptyState message="No history yet." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[...history].reverse().map(h => (
            <div key={h.id} style={{
              padding: '12px 14px', borderRadius: 8,
              border: '1px solid var(--border-0)', background: 'var(--surface-0)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase' }}>
                  {h.action}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {h.actor_role || 'system'}
                </span>
              </div>
              {(h.from_status || h.to_status) && (
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  {h.from_status} → {h.to_status}
                </div>
              )}
              {h.variance_amount !== null && h.variance_amount !== undefined && (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  Variance: {h.variance_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              )}
              {h.comments && (
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, fontStyle: 'italic' }}>
                  "{h.comments}"
                </div>
              )}
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 6 }}>
                {new Date(h.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BalanceReconciliationPage() {
  const { user } = useAuthStore();
  const role = user?.role || 'preparer';
  const qc = useQueryClient();
  const context = useOutletContext();
  const setHeaderOverride = context?.setHeaderOverride;

  const [showCreate, setShowCreate]   = useState(false);
  const [actionModal, setActionModal] = useState(null);   // { action, balance }
  const [historyDrawer, setHistoryDrawer] = useState(null); // balance
  const [historyCollapsed, setHistoryCollapsed] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus]   = useState('');
  const [filterPeriod, setFilterPeriod]   = useState('');
  const [page, setPage]                   = useState(1);
  const navigate = useNavigate();
  const { balanceId } = useParams();

  const singleItemQuery = useQuery({
    queryKey: ['balance-single', balanceId],
    queryFn: () => balancesAPI.get(balanceId),
    enabled: !!balanceId,
  });

  useEffect(() => {
    if (singleItemQuery.data && balanceId && !historyDrawer) {
      setHistoryDrawer(singleItemQuery.data);
    }
  }, [singleItemQuery.data, balanceId]);

  // ── Queries ──────────────────────────────────────────────────────────────
  const dashQ = useQuery({
    queryKey: ['balance-dashboard'],
    queryFn: () => balancesAPI.getDashboard(),
    staleTime: 30_000,
  });

  const listQ = useQuery({
    queryKey: ['balance-list', page, filterStatus, filterPeriod],
    queryFn: () => balancesAPI.list({
      page,
      page_size: 8,
      ...(filterStatus  ? { status: filterStatus }      : {}),
      ...(filterPeriod  ? { period_key: filterPeriod }  : {}),
    }),
    keepPreviousData: true,
    staleTime: 15_000,
  });

  const dash  = dashQ.data  || {};
  const items = (balanceId && singleItemQuery.data) ? [singleItemQuery.data] : (listQ.data?.items || []);
  const total = (balanceId && singleItemQuery.data) ? 1 : (listQ.data?.total || 0);
  const totalPages = Math.ceil(total / ((balanceId && singleItemQuery.data) ? 1 : 8));

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleCreated = useCallback(() => {
    setShowCreate(false);
    qc.invalidateQueries({ queryKey: ['balance-list'] });
    qc.invalidateQueries({ queryKey: ['balance-dashboard'] });
  }, [qc]);

  const handleActionDone = useCallback(() => {
    setActionModal(null);
    qc.invalidateQueries({ queryKey: ['balance-list'] });
    qc.invalidateQueries({ queryKey: ['balance-dashboard'] });
  }, [qc]);

  const canCreate = ['admin', 'preparer'].includes(role.toLowerCase());

  useEffect(() => {
    if (setHeaderOverride) {
      setHeaderOverride(
        <header className="bl-header">
          <div className="flex flex-col min-w-0 flex-shrink-0">
            <h1 className="bl-header-title" style={{ fontSize: 20 }}>Balance Reconciliation</h1>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, fontWeight: 500 }}>GL vs Supporting balance reconciliation workspace</p>
          </div>
          <div className="flex-1" />
          {canCreate && (
            <button
              onClick={() => setShowCreate(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 8, border: 'none',
                background: '#FFE600', color: '#1a1a2e', fontWeight: 700,
                cursor: 'pointer', fontSize: 12, transition: 'opacity 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              <Plus size={14} /> New Balance Recon
            </button>
          )}
        </header>
      );
      return () => setHeaderOverride(null);
    }
  }, [setHeaderOverride, canCreate]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, padding: '16px 24px', maxWidth: 1200, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        
        {/* Top Header Section (KPIs and Filters) */}
        <div style={{ flexShrink: 0, paddingBottom: 12, marginBottom: 0, borderBottom: '1px solid var(--border-0)' }}>



      {/* KPI Dashboard */}
      {dashQ.isLoading ? (
        <Skeleton height={50} style={{ marginBottom: 16 }} />
      ) : (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', 
          gap: 10, 
          marginBottom: 10 
        }}>
          <KpiCard label="Total"            value={dash.total || 0}               icon={FileText} />
          <KpiCard label="Balanced"         value={dash.balanced || 0}            icon={CheckCircle} color="#22c55e" />
          <KpiCard label="Out of Balance"   value={dash.out_of_balance || 0}      icon={XCircle}    color={dash.out_of_balance > 0 ? '#ef4444' : undefined} />
          <KpiCard label="Pending Review"   value={dash.pending_review || 0}      icon={Clock}      color="#f59e0b" />
          <KpiCard label="Pending Cert."    value={dash.pending_certification || 0} icon={Award}   color="#8b5cf6" />
          <KpiCard label="Certified"        value={dash.certified || 0}           icon={Award}      color="#22c55e" />
          <KpiCard
            label="Total Variance"
            value={`$${(dash.total_variance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            icon={DollarSign}
            color={dash.total_variance > 0 ? '#ef4444' : '#22c55e'}
          />
          <KpiCard label="High Risk"        value={dash.high_risk || 0}           icon={AlertTriangle} color={dash.high_risk > 0 ? '#ef4444' : undefined} />
        </div>
      )}

      {/* Filters */}
      <div style={{
        display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8,
        padding: '6px 10px', background: 'var(--surface-1)',
        border: '1px solid var(--border-0)', borderRadius: 6,
      }}>
        <Filter size={13} color="var(--text-tertiary)" />
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          style={{
            padding: '4px 8px', borderRadius: 5, border: '1px solid var(--border-1)',
            background: 'var(--surface-0)', color: 'var(--text-primary)', fontSize: 11, cursor: 'pointer',
          }}
        >
          <option value="">All Statuses</option>
          {Object.keys(STATUS_META).map(s => (
            <option key={s} value={s}>{STATUS_META[s].label}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Filter by period (e.g. 2026-05)"
          value={filterPeriod}
          onChange={e => { setFilterPeriod(e.target.value); setPage(1); }}
          style={{
            padding: '4px 8px', borderRadius: 5, border: '1px solid var(--border-1)',
            background: 'var(--surface-0)', color: 'var(--text-primary)', fontSize: 11, outline: 'none', width: 200,
          }}
        />

        <button
          onClick={() => { setFilterStatus(''); setFilterPeriod(''); setPage(1); }}
          style={{
            padding: '4px 8px', borderRadius: 5, border: '1px solid var(--border-1)',
            background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11,
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <RefreshCw size={11} /> Reset
        </button>
        
        <div style={{ flex: 1 }} />
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            Showing {Math.min((page - 1) * 8 + 1, total)} to {Math.min(page * 8, total)} of {total} records
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{
                padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-1)',
                background: 'var(--surface-1)', color: page === 1 ? 'var(--text-tertiary)' : 'var(--text-primary)',
                cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 11, transition: 'background 0.2s',
              }}
            >
              ← Prev
            </button>
            <div style={{ 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              minWidth: 26, padding: '0 6px', fontSize: 11, fontWeight: 600,
              background: 'var(--surface-2)', borderRadius: 6, color: 'var(--text-primary)'
            }}>
              {page}
            </div>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || totalPages === 0}
              style={{
                padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-1)',
                background: 'var(--surface-1)', color: (page === totalPages || totalPages === 0) ? 'var(--text-tertiary)' : 'var(--text-primary)',
                cursor: (page === totalPages || totalPages === 0) ? 'not-allowed' : 'pointer', fontSize: 11, transition: 'background 0.2s',
              }}
            >
              Next →
            </button>
          </div>
        </div>
      </div>
        </div>

      {/* Bottom Split Section */}
      <div style={{ display: 'flex', flexDirection: 'row', flex: 1, overflow: 'hidden' }}>
        
        {/* Left: Main Content (List) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingRight: historyDrawer ? 16 : 0, transition: 'padding-right 0.3s ease' }}>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }} className="slim-scroll">
        {listQ.isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3].map(i => <Skeleton key={i} height={50} />)}
          </div>
        ) : items.length === 0 ? (
        <EmptyState
          icon={<Scale size={40} />}
          title="No balance reconciliations found"
          message={canCreate ? 'Create your first balance reconciliation to get started.' : 'No records match your filters.'}
          action={canCreate ? { label: 'New Balance Recon', onClick: () => setShowCreate(true) } : undefined}
        />
      ) : (
        <>
          {items.map(balance => (
            <BalanceRow
              key={balance.id}
              balance={balance}
              role={role}
              onAction={(action, b) => setActionModal({ action, balance: b })}
              onView={(b) => setHistoryDrawer(b)}
              onNarrativeSaved={() => {
                qc.invalidateQueries({ queryKey: ['balance-list'] });
                qc.invalidateQueries({ queryKey: ['balance-dashboard'] });
              }}
              isHighlighted={balanceId && Number(balanceId) === balance.id}
            />
          ))}

        </>
      )}
      </div>

      {/* Modals */}
      {showCreate && (
        <CreateBalanceModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}

      {actionModal && (
        <ActionModal
          action={actionModal.action}
          balance={actionModal.balance}
          onClose={() => setActionModal(null)}
          onDone={handleActionDone}
        />
      )}
        </div>

        {/* Right: Audit History */}
        {historyDrawer && (
          <HistoryDrawer
            balance={historyDrawer}
            collapsed={historyCollapsed}
            onToggleCollapse={() => setHistoryCollapsed(!historyCollapsed)}
            onClose={() => {
              setHistoryDrawer(null);
              setHistoryCollapsed(false);
              if (balanceId) navigate('/balance-reconciliation', { replace: true });
            }}
          />
        )}
      </div>

      </div>
    </div>
  );
}
