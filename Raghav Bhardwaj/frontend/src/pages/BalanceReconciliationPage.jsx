// frontend/src/pages/BalanceReconciliationPage.jsx
// Balance Reconciliation Workspace — Oracle ARCS-style GL vs Supporting balance view.
// Styling and layout mirrors ReconciliationProfilesPage.jsx exactly.

import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Scale, Plus, RefreshCw, ChevronDown, ChevronUp,
  CheckCircle, XCircle, AlertTriangle, Clock,
  TrendingUp, DollarSign, FileText, Eye, Send,
  ThumbsUp, ThumbsDown, Award, History, Filter,
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
      background: 'var(--surface-1)', border: '1px solid var(--border-0)',
      borderRadius: 10, padding: '16px 20px', flex: 1, minWidth: 130,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {Icon && <Icon size={15} color="var(--text-tertiary)" />}
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{sub}</div>}
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

function BalanceRow({ balance, role, onAction, onView, onNarrativeSaved }) {
  const [expanded, setExpanded] = useState(false);
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
      background: 'var(--surface-1)', border: `1px solid ${isOutOfBalance ? 'rgba(239,68,68,0.3)' : 'var(--border-0)'}`,
      borderRadius: 10, overflow: 'hidden', marginBottom: 10,
    }}>
      {/* Main Header Row */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        <div style={{ flex: 2, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              Profile #{balance.profile_id} · {balance.period_key}
            </span>
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
        <div style={{ flex: 1, textAlign: 'right' }}><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>GL Balance</div><div style={{ fontSize: 14, fontWeight: 600 }}>{(balance.source_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
        <div style={{ flex: 1, textAlign: 'right' }}><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Supporting</div><div style={{ fontSize: 14, fontWeight: 600 }}>{(balance.target_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
        <div style={{ flex: 1, textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Variance</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: varianceColor }}>{variance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
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

function HistoryDrawer({ balance, onClose }) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['balance-history', balance.id],
    queryFn: () => balancesAPI.getHistory(balance.id),
  });

  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, width: 380,
      background: 'var(--surface-1)', borderLeft: '1px solid var(--border-0)',
      zIndex: 500, padding: 24, overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Audit History</h3>
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

  const [showCreate, setShowCreate]   = useState(false);
  const [actionModal, setActionModal] = useState(null);   // { action, balance }
  const [historyDrawer, setHistoryDrawer] = useState(null); // balance

  // Filters
  const [filterStatus, setFilterStatus]   = useState('');
  const [filterPeriod, setFilterPeriod]   = useState('');
  const [page, setPage]                   = useState(1);

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
      page_size: 20,
      ...(filterStatus  ? { status: filterStatus }      : {}),
      ...(filterPeriod  ? { period_key: filterPeriod }  : {}),
    }),
    keepPreviousData: true,
    staleTime: 15_000,
  });

  const dash  = dashQ.data  || {};
  const items = listQ.data?.items || [];
  const total = listQ.data?.total || 0;
  const totalPages = Math.ceil(total / 20);

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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        title="Balance Reconciliation"
        subtitle="GL vs Supporting balance reconciliation workspace"
        icon={<Scale size={22} />}
        actions={canCreate ? (
          <button
            onClick={() => setShowCreate(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 20px', borderRadius: 9, border: 'none',
              background: '#FFE600', color: '#1a1a2e', fontWeight: 700,
              cursor: 'pointer', fontSize: 13,
            }}
          >
            <Plus size={15} /> New Balance Recon
          </button>
        ) : null}
      />

      {/* KPI Dashboard */}
      {dashQ.isLoading ? (
        <Skeleton height={80} style={{ marginBottom: 24 }} />
      ) : (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}>
          <KpiCard label="Total"            value={dash.total || 0}               icon={FileText} />
          <KpiCard label="Balanced"         value={dash.balanced || 0}            icon={CheckCircle} color="#22c55e" />
          <KpiCard label="Out of Balance"   value={dash.out_of_balance || 0}      icon={XCircle}    color={dash.out_of_balance > 0 ? '#ef4444' : undefined} />
          <KpiCard label="Pending Review"   value={dash.pending_review || 0}      icon={Clock}      color="#f59e0b" />
          <KpiCard label="Pending Cert."    value={dash.pending_certification || 0} icon={Award}   color="#8b5cf6" />
          <KpiCard label="Certified"        value={dash.certified || 0}           icon={Award}      color="#22c55e" />
          <KpiCard
            label="Total Variance"
            value={`$${(dash.total_variance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
            icon={DollarSign}
            color={dash.total_variance > 0 ? '#ef4444' : '#22c55e'}
          />
          <KpiCard label="High Risk"        value={dash.high_risk || 0}           icon={AlertTriangle} color={dash.high_risk > 0 ? '#ef4444' : undefined} />
        </div>
      )}

      {/* Filters */}
      <div style={{
        display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18,
        padding: '12px 16px', background: 'var(--surface-1)',
        border: '1px solid var(--border-0)', borderRadius: 10,
      }}>
        <Filter size={14} color="var(--text-tertiary)" />
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          style={{
            padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border-1)',
            background: 'var(--surface-0)', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer',
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
            padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border-1)',
            background: 'var(--surface-0)', color: 'var(--text-primary)', fontSize: 12, outline: 'none', width: 220,
          }}
        />

        <button
          onClick={() => { setFilterStatus(''); setFilterPeriod(''); setPage(1); }}
          style={{
            padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border-1)',
            background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
          <RefreshCw size={12} /> Reset
        </button>

        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)' }}>
          {total} record{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* List */}
      {listQ.isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map(i => <Skeleton key={i} height={70} />)}
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
            />
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  padding: '6px 14px', borderRadius: 7, border: '1px solid var(--border-1)',
                  background: 'transparent', color: page === 1 ? 'var(--text-tertiary)' : 'var(--text-primary)',
                  cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 12,
                }}
              >
                ← Prev
              </button>
              <span style={{ padding: '6px 12px', fontSize: 12, color: 'var(--text-secondary)' }}>
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{
                  padding: '6px 14px', borderRadius: 7, border: '1px solid var(--border-1)',
                  background: 'transparent', color: page === totalPages ? 'var(--text-tertiary)' : 'var(--text-primary)',
                  cursor: page === totalPages ? 'not-allowed' : 'pointer', fontSize: 12,
                }}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

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

      {historyDrawer && (
        <HistoryDrawer
          balance={historyDrawer}
          onClose={() => setHistoryDrawer(null)}
        />
      )}
    </div>
  );
}
