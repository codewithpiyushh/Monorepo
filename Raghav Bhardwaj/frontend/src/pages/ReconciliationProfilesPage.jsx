/**
 * ReconciliationProfilesPage
 * ──────────────────────────
 * Phase 1 — Profile Management screen
 *
 * Features:
 *  • Server-side paginated data table (name, account no., type, frequency,
 *    risk, status, assigned roles)
 *  • Live search on name / account_number
 *  • Multi-select Risk Level and Status filter dropdowns
 *  • Column sort (click headers)
 *  • Create / Edit modal — loads user list from /api/auth/users for dropdowns
 *  • Delete confirmation (soft by default)
 *  • Admin-only action buttons — completely hidden for non-admin roles
 *    (reads role from session token via useAuthStore)
 *  • Matches ExceptionWorkbench / ExecutiveDashboard layout & typography
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  ChevronDown, ChevronUp, ChevronsUpDown,
  Plus, Pencil, Trash2, RefreshCw, Search, X,
  AlertTriangle,
} from 'lucide-react'
import { authAPI } from '../api'
import { profilesAPI } from '../api/profilesAPI'

import { useAuthStore } from '../store/authStore'
import { normalizeRole } from '../utils/roles'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, LoadingState } from '../components/ui/PageState'

// ── Constants ─────────────────────────────────────────────────

const RISK_OPTIONS   = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
const STATUS_OPTIONS = ['ACTIVE', 'INACTIVE', 'ARCHIVED']
const FREQ_OPTIONS   = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY']
const TYPE_OPTIONS   = ['BANK', 'AR', 'AP', 'INTERCOMPANY', 'PAYROLL', 'INVENTORY']

const RISK_META = {
  LOW:      { color: 'var(--ok)',    bg: 'var(--ok)14'    },
  MEDIUM:   { color: 'var(--warn)',  bg: 'var(--warn)14'  },
  HIGH:     { color: 'var(--bad)',   bg: 'var(--bad)14'   },
  CRITICAL: { color: '#c026d3',      bg: '#c026d314'      },
}
const STATUS_META = {
  ACTIVE:   { color: 'var(--ok)',           bg: 'var(--ok)14'    },
  INACTIVE: { color: 'var(--text-tertiary)',bg: 'var(--surface-2)'},
  ARCHIVED: { color: 'var(--warn)',          bg: 'var(--warn)14'  },
}

// ── Reusable UI atoms ─────────────────────────────────────────

function RiskBadge({ level }) {
  const m = RISK_META[level] || { color: 'var(--text-tertiary)', bg: 'var(--surface-2)' }
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 9999,
      border: `1px solid ${m.color}33`, color: m.color, background: m.bg,
    }}>{level || '—'}</span>
  )
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { color: 'var(--text-tertiary)', bg: 'var(--surface-2)' }
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 9999,
      border: `1px solid ${m.color}33`, color: m.color, background: m.bg,
    }}>{status || '—'}</span>
  )
}

function SortIcon({ col, sortBy, sortDir }) {
  if (sortBy !== col) return <ChevronsUpDown size={12} style={{ opacity: 0.4 }} />
  return sortDir === 'asc'
    ? <ChevronUp size={12} style={{ color: 'var(--accent)' }} />
    : <ChevronDown size={12} style={{ color: 'var(--accent)' }} />
}

// ── Multi-select dropdown ─────────────────────────────────────

function MultiSelect({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = (opt) => {
    onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          height: 32, padding: '0 10px', fontSize: 12,
          background: 'var(--surface-1)', border: '1px solid var(--border-1)',
          borderRadius: 6, color: 'var(--text-primary)', cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {label}{value.length > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700, background: 'var(--accent)',
            color: '#fff', borderRadius: 99, padding: '0 5px',
          }}>{value.length}</span>
        )}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 36, left: 0, zIndex: 100,
          background: 'var(--surface-0)', border: '1px solid var(--border-1)',
          borderRadius: 8, padding: '4px 0', minWidth: 140,
          boxShadow: '0 4px 16px rgba(0,0,0,.12)',
        }}>
          {options.map(opt => (
            <label key={opt} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 12px', fontSize: 12, cursor: 'pointer',
              color: 'var(--text-primary)',
            }}>
              <input
                type="checkbox"
                checked={value.includes(opt)}
                onChange={() => toggle(opt)}
                style={{ accentColor: 'var(--accent)' }}
              />
              {opt}
            </label>
          ))}
          {value.length > 0 && (
            <button
              onClick={() => { onChange([]); setOpen(false) }}
              style={{
                width: '100%', padding: '6px 12px', fontSize: 11,
                background: 'none', border: 'none', borderTop: '1px solid var(--border-0)',
                color: 'var(--text-tertiary)', cursor: 'pointer', textAlign: 'left',
              }}
            >Clear filters</button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Profile modal form ────────────────────────────────────────

const EMPTY_FORM = {
  name: '', account_number: '', reconciliation_type: 'BANK',
  frequency: 'MONTHLY', tolerance_threshold: 0, date_window_days: 0,
  materiality_limit: 0, risk_classification: 'MEDIUM', auto_certify: false,
  auto_approve_threshold: 1.0, due_days: 5, status: 'ACTIVE',
  assigned_preparer: '', assigned_reviewer: '',
  assigned_approver: '', assigned_certifier: '',
}

function ProfileModal({ profile, users, onClose, onSaved }) {
  const isEdit = Boolean(profile?.id)
  const [form, setForm] = useState(() => {
    if (!profile) return { ...EMPTY_FORM }
    return {
      name:                   profile.name || '',
      account_number:         profile.account_number || '',
      reconciliation_type:    profile.reconciliation_type || 'BANK',
      frequency:              profile.frequency || 'MONTHLY',
      tolerance_threshold:    profile.tolerance_threshold ?? 0,
      date_window_days:       profile.date_window_days ?? 0,
      materiality_limit:      profile.materiality_limit ?? 0,
      risk_classification:    profile.risk_classification || 'MEDIUM',
      auto_certify:           profile.auto_certify ?? false,
      auto_approve_threshold: profile.auto_approve_threshold ?? 1.0,
      due_days:               profile.due_days ?? 5,
      status:                 profile.status || 'ACTIVE',
      assigned_preparer:      profile.assigned_preparer || '',
      assigned_reviewer:      profile.assigned_reviewer || '',
      assigned_approver:      profile.assigned_approver || '',
      assigned_certifier:     profile.assigned_certifier || '',
    }
  })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const usersByRole = useMemo(() => {
    const map = { preparer: [], reviewer: [], approver: [], certifier: [] }
    for (const u of (users || [])) {
      const r = (u.role || '').toLowerCase()
      if (map[r]) map[r].push(u)
    }
    return map
  }, [users])

  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = 'Name is required'
    if (!form.reconciliation_type) e.reconciliation_type = 'Required'
    if (!form.frequency) e.frequency = 'Required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async () => {
    if (!validate()) return
    setSaving(true)
    const body = {
      ...form,
      assigned_preparer:  form.assigned_preparer  ? Number(form.assigned_preparer)  : null,
      assigned_reviewer:  form.assigned_reviewer  ? Number(form.assigned_reviewer)  : null,
      assigned_approver:  form.assigned_approver  ? Number(form.assigned_approver)  : null,
      assigned_certifier: form.assigned_certifier ? Number(form.assigned_certifier) : null,
      tolerance_threshold:    Number(form.tolerance_threshold),
      date_window_days:       Number(form.date_window_days),
      materiality_limit:      Number(form.materiality_limit),
      auto_approve_threshold: Number(form.auto_approve_threshold),
      due_days:               Number(form.due_days),
    }
    try {
      if (isEdit) {
        await profilesAPI.update(profile.id, body)
        toast.success('Profile updated')
      } else {
        await profilesAPI.create(body)
        toast.success('Profile created')
      }
      onSaved()
    } catch (err) {
      const detail = err?.response?.data?.detail
      if (typeof detail === 'string') toast.error(detail)
      else toast.error('Save failed')
    } finally {
      setSaving(false)
    }
  }

  const field = (label, key, type = 'text', opts = {}) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
        {label}{opts.required && <span style={{ color: 'var(--bad)' }}> *</span>}
      </label>
      <input
        type={type}
        value={form[key]}
        onChange={e => set(key, type === 'number' ? e.target.value : e.target.value)}
        placeholder={opts.placeholder || ''}
        style={{
          height: 32, padding: '0 10px', fontSize: 12,
          background: 'var(--surface-1)', border: `1px solid ${errors[key] ? 'var(--bad)' : 'var(--border-1)'}`,
          borderRadius: 6, color: 'var(--text-primary)', outline: 'none',
        }}
      />
      {errors[key] && <span style={{ fontSize: 10, color: 'var(--bad)' }}>{errors[key]}</span>}
    </div>
  )

  const select = (label, key, options) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
        {label}{options.required && <span style={{ color: 'var(--bad)' }}> *</span>}
      </label>
      <select
        value={form[key]}
        onChange={e => set(key, e.target.value)}
        style={{
          height: 32, padding: '0 8px', fontSize: 12,
          background: 'var(--surface-1)', border: `1px solid ${errors[key] ? 'var(--bad)' : 'var(--border-1)'}`,
          borderRadius: 6, color: 'var(--text-primary)',
        }}
      >
        {options.map(o => (
          <option key={typeof o === 'string' ? o : o.value} value={typeof o === 'string' ? o : o.value}>
            {typeof o === 'string' ? o : o.label}
          </option>
        ))}
      </select>
    </div>
  )

  const userSelect = (label, key, role) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</label>
      <select
        value={form[key]}
        onChange={e => set(key, e.target.value)}
        style={{
          height: 32, padding: '0 8px', fontSize: 12,
          background: 'var(--surface-1)', border: '1px solid var(--border-1)',
          borderRadius: 6, color: 'var(--text-primary)',
        }}
      >
        <option value="">— unassigned —</option>
        {(usersByRole[role] || []).map(u => (
          <option key={u.id} value={u.id}>{u.username} ({u.email})</option>
        ))}
      </select>
    </div>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface-0)', border: '1px solid var(--border-1)',
          borderRadius: 12, width: 620, maxWidth: '96vw', maxHeight: '92vh',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid var(--border-0)',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              {isEdit ? 'Edit Profile' : 'New Reconciliation Profile'}
            </h2>
            {isEdit && (
              <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-tertiary)' }}>
                Profile ID: {profile.id}
              </p>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '16px 18px', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>

            {/* Section: Identity */}
            <div style={{ gridColumn: '1/-1', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '.06em', marginTop: 4 }}>
              PROFILE IDENTITY
            </div>
            {field('Profile Name', 'name', 'text', { required: true })}
            {field('Account Number', 'account_number', 'text', { placeholder: 'e.g. GL-1001' })}

            {/* Section: Config */}
            <div style={{ gridColumn: '1/-1', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '.06em', marginTop: 8 }}>
              RECONCILIATION CONFIG
            </div>
            {select('Type', 'reconciliation_type', TYPE_OPTIONS)}
            {select('Frequency', 'frequency', FREQ_OPTIONS)}
            {field('Tolerance Threshold', 'tolerance_threshold', 'number')}
            {field('Date Window (days)', 'date_window_days', 'number')}
            {field('Materiality Limit', 'materiality_limit', 'number')}
            {field('Due Days', 'due_days', 'number')}

            {/* Section: Risk & certification */}
            <div style={{ gridColumn: '1/-1', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '.06em', marginTop: 8 }}>
              RISK &amp; CERTIFICATION
            </div>
            {select('Risk Level', 'risk_classification', RISK_OPTIONS)}
            {select('Status', 'status', STATUS_OPTIONS)}
            {field('Auto-approve Threshold (0–1)', 'auto_approve_threshold', 'number')}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
              <input
                type="checkbox"
                id="auto_certify"
                checked={form.auto_certify}
                onChange={e => set('auto_certify', e.target.checked)}
                style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
              />
              <label htmlFor="auto_certify" style={{ fontSize: 12, color: 'var(--text-primary)', cursor: 'pointer' }}>
                Auto-certify (variance &lt; threshold)
              </label>
            </div>

            {/* Section: Workflow assignments */}
            <div style={{ gridColumn: '1/-1', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '.06em', marginTop: 8 }}>
              WORKFLOW ASSIGNMENTS
            </div>
            {userSelect('Preparer',  'assigned_preparer',  'preparer')}
            {userSelect('Reviewer',  'assigned_reviewer',  'reviewer')}
            {userSelect('Approver',  'assigned_approver',  'approver')}
            {userSelect('Certifier', 'assigned_certifier', 'certifier')}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          padding: '12px 18px', borderTop: '1px solid var(--border-0)',
        }}>
          <button
            onClick={onClose}
            style={{
              height: 32, padding: '0 14px', fontSize: 12,
              background: 'none', border: '1px solid var(--border-1)',
              borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer',
            }}
          >Cancel</button>
          <button
            onClick={submit}
            disabled={saving}
            style={{
              height: 32, padding: '0 18px', fontSize: 12, fontWeight: 600,
              background: 'var(--accent)', border: 'none',
              borderRadius: 6, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >{saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Profile'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Delete confirmation modal ─────────────────────────────────

function DeleteConfirm({ profile, onClose, onConfirm, loading }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001,
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface-0)', border: '1px solid var(--border-1)',
          borderRadius: 12, width: 420, padding: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <AlertTriangle size={20} color="var(--bad)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              Archive profile?
            </h3>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <strong>{profile?.name}</strong> will be archived (status = ARCHIVED).
              Existing reconciliations linked to this profile are preserved.
              This action is recorded in the audit trail.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              height: 32, padding: '0 14px', fontSize: 12,
              background: 'none', border: '1px solid var(--border-1)',
              borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer',
            }}
          >Cancel</button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              height: 32, padding: '0 18px', fontSize: 12, fontWeight: 600,
              background: 'var(--bad)', border: 'none',
              borderRadius: 6, color: '#fff', cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >{loading ? 'Archiving…' : 'Archive'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────

export default function ReconciliationProfilesPage() {
  const user   = useAuthStore(s => s.user)
  const isAdmin = normalizeRole(user?.role) === 'admin'
  const qc      = useQueryClient()

  // Table state
  const [search,     setSearch]     = useState('')
  const [riskFilter, setRiskFilter] = useState([])
  const [statFilter, setStatFilter] = useState([])
  const [sortBy,     setSortBy]     = useState('created_at')
  const [sortDir,    setSortDir]    = useState('desc')
  const [page,       setPage]       = useState(1)
  const PAGE_SIZE = 20

  // Modal state
  const [editProfile,   setEditProfile]   = useState(null)   // null=closed, {}=new, {id,...}=edit
  const [deleteProfile, setDeleteProfile] = useState(null)

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [search])

  // Fetch profiles
  const profilesQuery = useQuery({
    queryKey: ['profiles-v1', page, PAGE_SIZE, debouncedSearch, riskFilter, statFilter, sortBy, sortDir],
    queryFn: () => profilesAPI.list({
      page, pageSize: PAGE_SIZE,
      search:    debouncedSearch,
      riskLevel: riskFilter,
      status:    statFilter,
      sortBy,    sortDir,
    }),
    keepPreviousData: true,
  })

  // Fetch users for assignment dropdowns
  const usersQuery = useQuery({
    queryKey: ['users-list'],
    queryFn:  () => authAPI.listUsers(),
    staleTime: 5 * 60 * 1000,
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (profileId) => profilesAPI.delete(profileId),
    onSuccess: () => {
      toast.success('Profile archived')
      setDeleteProfile(null)
      qc.invalidateQueries({ queryKey: ['profiles-v1'] })
    },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Archive failed'),
  })

  const handleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
    setPage(1)
  }

  const handleSaved = () => {
    setEditProfile(null)
    qc.invalidateQueries({ queryKey: ['profiles-v1'] })
  }

  const data     = profilesQuery.data
  const profiles = data?.items || []
  const total    = data?.total || 0
  const pages    = data?.pages || 1

  const thStyle = (col) => ({
    padding: '8px 12px', fontSize: 11, fontWeight: 600,
    color: 'var(--text-secondary)', background: 'var(--surface-1)',
    borderBottom: '1px solid var(--border-1)', textAlign: 'left',
    cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none',
  })

  const tdStyle = {
    padding: '9px 12px', fontSize: 12, color: 'var(--text-primary)',
    borderBottom: '1px solid var(--border-0)', verticalAlign: 'middle',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Page header — matches ExceptionWorkbench pattern */}
      <PageHeader
        title="Reconciliation Profiles"
        badge={total > 0 ? total : null}
        subtitle="Profile-driven reconciliation management — Phase 1"
        actions={isAdmin && (
          <button
            onClick={() => setEditProfile({})}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              height: 32, padding: '0 14px', fontSize: 12, fontWeight: 600,
              background: 'var(--accent)', border: 'none', borderRadius: 6,
              color: '#fff', cursor: 'pointer',
            }}
          >
            <Plus size={13} /> New Profile
          </button>
        )}
      />

      {/* Toolbar */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 20px', borderBottom: '1px solid var(--border-0)',
        background: 'var(--surface-1)', flexWrap: 'wrap',
      }}>
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 200px', maxWidth: 320 }}>
          <Search size={13} color="var(--text-tertiary)" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name or account number…"
            style={{
              flex: 1, height: 30, padding: '0 8px', fontSize: 12,
              background: 'var(--surface-2)', border: '1px solid var(--border-0)',
              borderRadius: 6, color: 'var(--text-primary)', outline: 'none',
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 2 }}>
              <X size={12} />
            </button>
          )}
        </div>

        {/* Filters */}
        <MultiSelect label="Risk Level" options={RISK_OPTIONS} value={riskFilter} onChange={v => { setRiskFilter(v); setPage(1) }} />
        <MultiSelect label="Status"     options={STATUS_OPTIONS} value={statFilter} onChange={v => { setStatFilter(v); setPage(1) }} />

        {/* Refresh */}
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ['profiles-v1'] })}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            height: 32, padding: '0 10px', fontSize: 12,
            background: 'none', border: '1px solid var(--border-1)',
            borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer',
          }}
        >
          <RefreshCw size={12} />
        </button>

        {/* Active filter chips */}
        {(riskFilter.length + statFilter.length) > 0 && (
          <button
            onClick={() => { setRiskFilter([]); setStatFilter([]) }}
            style={{
              fontSize: 11, color: 'var(--text-tertiary)', background: 'none',
              border: 'none', cursor: 'pointer', textDecoration: 'underline',
            }}
          >Clear all filters</button>
        )}
      </div>

      {/* Table area */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
        {profilesQuery.isLoading ? (
          <LoadingState />
        ) : profiles.length === 0 ? (
          <EmptyState
            title="No profiles found"
            description={debouncedSearch || riskFilter.length || statFilter.length
              ? 'Try adjusting your search or filters'
              : isAdmin ? 'Create your first reconciliation profile to get started' : 'No profiles are assigned to you yet'
            }
            action={isAdmin && (
              <button
                onClick={() => setEditProfile({})}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  height: 30, padding: '0 14px', fontSize: 12, fontWeight: 600,
                  background: 'var(--accent)', border: 'none', borderRadius: 6,
                  color: '#fff', cursor: 'pointer', marginTop: 4,
                }}
              >
                <Plus size={12} /> Create Profile
              </button>
            )}
          />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr>
                {[
                  { key: 'name',             label: 'Profile Name'     },
                  { key: 'account_number',   label: 'Account Number'   },
                  { key: 'reconciliation_type', label: 'Type'          },
                  { key: 'frequency',        label: 'Frequency'        },
                  { key: 'risk_classification', label: 'Risk'          },
                  { key: 'status',           label: 'Status'           },
                  { key: '_assignees',       label: 'Assigned Roles', sortable: false },
                  { key: '_actions',         label: '',               sortable: false },
                ].map(col => (
                  <th
                    key={col.key}
                    style={thStyle(col.key)}
                    onClick={() => col.sortable !== false && handleSort(col.key)}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {col.label}
                      {col.sortable !== false && <SortIcon col={col.key} sortBy={sortBy} sortDir={sortDir} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profiles.map(p => (
                <tr
                  key={p.id}
                  style={{ background: 'var(--surface-0)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-1)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-0)'}
                >
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>ID #{p.id}</div>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)' }}>
                      {p.account_number || '—'}
                    </span>
                  </td>
                  <td style={tdStyle}>{p.reconciliation_type || '—'}</td>
                  <td style={tdStyle}>{p.frequency || '—'}</td>
                  <td style={tdStyle}><RiskBadge level={p.risk_classification} /></td>
                  <td style={tdStyle}><StatusBadge status={p.status} /></td>
                  <td style={{ ...tdStyle, fontSize: 11 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {p.assigned_preparer_user  && <span><span style={{ color: 'var(--text-tertiary)' }}>P: </span>{p.assigned_preparer_user.username}</span>}
                      {p.assigned_reviewer_user  && <span><span style={{ color: 'var(--text-tertiary)' }}>R: </span>{p.assigned_reviewer_user.username}</span>}
                      {p.assigned_approver_user  && <span><span style={{ color: 'var(--text-tertiary)' }}>A: </span>{p.assigned_approver_user.username}</span>}
                      {p.assigned_certifier_user && <span><span style={{ color: 'var(--text-tertiary)' }}>C: </span>{p.assigned_certifier_user.username}</span>}
                      {!p.assigned_preparer && !p.assigned_reviewer && !p.assigned_approver && !p.assigned_certifier && (
                        <span style={{ color: 'var(--text-disabled)' }}>unassigned</span>
                      )}
                    </div>
                  </td>
                  {/* Action buttons — conditionally rendered for admin only */}
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => setEditProfile(p)}
                          title="Edit profile"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            height: 28, padding: '0 10px', fontSize: 11,
                            background: 'none', border: '1px solid var(--border-1)',
                            borderRadius: 5, color: 'var(--text-secondary)', cursor: 'pointer',
                          }}
                        >
                          <Pencil size={11} /> Edit
                        </button>
                        <button
                          onClick={() => setDeleteProfile(p)}
                          title="Archive profile"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            height: 28, padding: '0 10px', fontSize: 11,
                            background: 'none', border: '1px solid var(--border-1)',
                            borderRadius: 5, color: 'var(--bad)', cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={11} /> Archive
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 20px', borderTop: '1px solid var(--border-0)',
          background: 'var(--surface-1)', fontSize: 12, color: 'var(--text-secondary)',
        }}>
          <span>
            {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} profiles
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{
                height: 28, padding: '0 10px', fontSize: 12,
                background: 'none', border: '1px solid var(--border-1)',
                borderRadius: 5, color: 'var(--text-primary)', cursor: page === 1 ? 'not-allowed' : 'pointer',
                opacity: page === 1 ? 0.4 : 1,
              }}
            >← Prev</button>
            <span style={{ height: 28, padding: '0 12px', lineHeight: '28px', fontSize: 12 }}>
              {page} / {pages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(pages, p + 1))}
              disabled={page === pages}
              style={{
                height: 28, padding: '0 10px', fontSize: 12,
                background: 'none', border: '1px solid var(--border-1)',
                borderRadius: 5, color: 'var(--text-primary)', cursor: page === pages ? 'not-allowed' : 'pointer',
                opacity: page === pages ? 0.4 : 1,
              }}
            >Next →</button>
          </div>
        </div>
      )}

      {/* Modals */}
      {editProfile !== null && (
        <ProfileModal
          profile={editProfile?.id ? editProfile : null}
          users={usersQuery.data || []}
          onClose={() => setEditProfile(null)}
          onSaved={handleSaved}
        />
      )}
      {deleteProfile && (
        <DeleteConfirm
          profile={deleteProfile}
          onClose={() => setDeleteProfile(null)}
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleteProfile.id)}
        />
      )}
    </div>
  )
}
