import { useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { enterpriseAPI, authAPI } from '../api'
import { enterpriseExtAPI } from '../api'
import toast from 'react-hot-toast'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/PageState'
import {
  Plus, Copy, RefreshCw, Edit2, Trash2, X, ChevronDown, ChevronUp,
  ShieldAlert, CheckCircle2, Clock, AlertTriangle, Layers,
} from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────
const RECON_TYPES = [
  'BANK_RECONCILIATION','AP_RECONCILIATION','AR_RECONCILIATION',
  'INTERCOMPANY_RECONCILIATION','PAYROLL_RECONCILIATION','CASH_RECONCILIATION',
  'INVENTORY_RECONCILIATION','FX_RECONCILIATION',
]
const FREQUENCIES  = ['DAILY','WEEKLY','MONTHLY','QUARTERLY','YEARLY']
const RISK_LEVELS  = ['LOW','MEDIUM','HIGH','CRITICAL']
const LIFECYCLE_STATES = ['OPEN','IN_PROGRESS','PREPARED','SUBMITTED','UNDER_REVIEW','APPROVED','CERTIFIED','CLOSED']

const BLANK_FORM = {
  name:'', reconciliation_type:'BANK_RECONCILIATION', frequency:'MONTHLY',
  tolerance_threshold:0.5, date_window_days:2, risk_classification:'MEDIUM',
  due_days:5, assigned_preparer:'', assigned_reviewer:'',
  assigned_approver:'', assigned_certifier:'',
}

const RISK_COLOR = { LOW:'var(--ok)', MEDIUM:'var(--warn)', HIGH:'var(--bad)', CRITICAL:'#c026d3' }
const STATE_COLOR = {
  OPEN:'var(--text-tertiary)', IN_PROGRESS:'var(--accent)', PREPARED:'var(--info)',
  SUBMITTED:'var(--warn)', UNDER_REVIEW:'var(--warn)', APPROVED:'var(--ok)',
  CERTIFIED:'var(--ok)', CLOSED:'var(--text-disabled)',
}

// ── Small helpers ─────────────────────────────────────────────
function RiskBadge({ risk }) {
  const color = RISK_COLOR[risk] || 'var(--text-tertiary)'
  return (
    <span style={{
      fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:9999,
      border:`1px solid ${color}33`, color, background:`${color}14`,
    }}>{risk}</span>
  )
}

function StateBadge({ state }) {
  const color = STATE_COLOR[state] || 'var(--text-tertiary)'
  return (
    <span style={{
      fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:9999,
      border:`1px solid ${color}33`, color, background:`${color}14`,
    }}>{(state||'').replace(/_/g,' ')}</span>
  )
}

// ── Profile Form Modal ────────────────────────────────────────
function ProfileFormModal({ profile, users, onClose, onSaved }) {
  const isEdit = !!profile
  const qc = useQueryClient()
  const [form, setForm] = useState(isEdit ? {
    name: profile.name,
    reconciliation_type: profile.reconciliation_type || 'BANK_RECONCILIATION',
    frequency: profile.frequency || 'MONTHLY',
    tolerance_threshold: profile.tolerance_threshold ?? 0.5,
    date_window_days: profile.date_window_days ?? 2,
    risk_classification: profile.risk_classification || 'MEDIUM',
    due_days: profile.due_days ?? 5,
    assigned_preparer: String(profile.assigned_preparer || ''),
    assigned_reviewer: String(profile.assigned_reviewer || ''),
    assigned_approver: String(profile.assigned_approver || ''),
    assigned_certifier: String(profile.assigned_certifier || ''),
  } : { ...BLANK_FORM })

  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const preparers  = users.filter((u) => ['preparer','admin'].includes(u.role))
  const reviewers  = users.filter((u) => ['reviewer','admin'].includes(u.role))
  const approvers  = users.filter((u) => ['approver','admin'].includes(u.role))
  const certifiers = users.filter((u) => ['certifier','admin'].includes(u.role))

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Profile name is required'); return }
    setSaving(true)
    try {
      const payload = {
        ...form,
        tolerance_threshold: Number(form.tolerance_threshold),
        date_window_days: Number(form.date_window_days),
        due_days: Number(form.due_days),
        assigned_preparer: form.assigned_preparer ? Number(form.assigned_preparer) : null,
        assigned_reviewer: form.assigned_reviewer ? Number(form.assigned_reviewer) : null,
        assigned_approver: form.assigned_approver ? Number(form.assigned_approver) : null,
        assigned_certifier: form.assigned_certifier ? Number(form.assigned_certifier) : null,
        workflow_config: { require_preparer:true, require_reviewer:true,
          require_approver: ['HIGH','CRITICAL'].includes(form.risk_classification),
          require_certifier: form.risk_classification === 'CRITICAL', sod_enforced:true },
        matching_rules: { primary:'EXACT', fallback:['TOLERANCE','DATE_WINDOW','FUZZY'] },
      }
      if (isEdit) {
        await enterpriseAPI.updateProfile(profile.id, payload)
        toast.success('Profile updated')
      } else {
        await enterpriseAPI.createProfile(payload)
        toast.success('Profile created')
      }
      qc.invalidateQueries({ queryKey: ['enterprise-profiles'] })
      onSaved()
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const Field = ({ label, children }) => (
    <div>
      <label style={{ fontSize:11, color:'var(--text-tertiary)', display:'block', marginBottom:4 }}>{label}</label>
      {children}
    </div>
  )

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:60, background:'rgba(0,0,0,0.55)',
      display:'flex', alignItems:'center', justifyContent:'center', padding:16,
    }}>
      <div style={{
        background:'var(--surface-1)', border:'1px solid var(--border-1)',
        borderRadius:14, width:'100%', maxWidth:560,
        maxHeight:'90vh', overflow:'auto', padding:24,
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:20 }}>
          <div>
            <p style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'0.10em', color:'var(--text-tertiary)' }}>
              {isEdit ? 'Edit Profile' : 'New Reconciliation Profile'}
            </p>
            <h3 style={{ fontSize:15, fontWeight:700, color:'var(--text-primary)', marginTop:2 }}>
              {isEdit ? profile.name : 'Create Profile'}
            </h3>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary)' }}>
            <X style={{ width:18, height:18 }} />
          </button>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {/* Name */}
          <Field label="Profile Name *">
            <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Bank Recon – MFG-US – 2025-06" />
          </Field>

          {/* Type + Frequency */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field label="Reconciliation Type">
              <select className="input text-xs" value={form.reconciliation_type} onChange={(e) => set('reconciliation_type', e.target.value)}>
                {RECON_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
              </select>
            </Field>
            <Field label="Frequency">
              <select className="input text-xs" value={form.frequency} onChange={(e) => set('frequency', e.target.value)}>
                {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
          </div>

          {/* Risk + Due Days */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
            <Field label="Risk Classification">
              <select className="input text-xs" value={form.risk_classification} onChange={(e) => set('risk_classification', e.target.value)}>
                {RISK_LEVELS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Tolerance %">
              <input className="input text-xs" type="number" min={0} step={0.01}
                value={form.tolerance_threshold} onChange={(e) => set('tolerance_threshold', e.target.value)} />
            </Field>
            <Field label="Date Window (days)">
              <input className="input text-xs" type="number" min={0}
                value={form.date_window_days} onChange={(e) => set('date_window_days', e.target.value)} />
            </Field>
          </div>

          {/* User assignments */}
          <div style={{ background:'var(--surface-2)', borderRadius:10, padding:14 }}>
            <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-tertiary)', marginBottom:10 }}>
              Workflow Assignments (SoD enforced)
            </p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              {[
                ['Preparer', 'assigned_preparer', preparers],
                ['Reviewer', 'assigned_reviewer', reviewers],
                ['Approver', 'assigned_approver', approvers],
                ['Certifier', 'assigned_certifier', certifiers],
              ].map(([label, key, pool]) => (
                <Field key={key} label={label}>
                  <select className="input text-xs" value={form[key]} onChange={(e) => set(key, e.target.value)}>
                    <option value="">Unassigned</option>
                    {pool.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
                  </select>
                </Field>
              ))}
            </div>
          </div>

          <Field label="Due in (days after period end)">
            <input className="input text-xs" type="number" min={1} value={form.due_days}
              onChange={(e) => set('due_days', e.target.value)} style={{ width:120 }} />
          </Field>
        </div>

        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:20 }}>
          <button className="btn-secondary text-xs" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary text-xs" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : (isEdit ? 'Update Profile' : 'Create Profile')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Clone Modal ───────────────────────────────────────────────
function CloneModal({ profile, onClose, onDone }) {
  const [name, setName] = useState(`${profile.name} (Copy)`)
  const [busy, setBusy] = useState(false)
  const qc = useQueryClient()
  const handle = async () => {
    setBusy(true)
    try {
      await enterpriseExtAPI.cloneProfile(profile.id, { name })
      toast.success('Profile cloned')
      qc.invalidateQueries({ queryKey: ['enterprise-profiles'] })
      onDone()
    } catch (e) { toast.error(e?.response?.data?.detail || 'Clone failed') }
    finally { setBusy(false) }
  }
  return (
    <div style={{ position:'fixed', inset:0, zIndex:60, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'var(--surface-1)', border:'1px solid var(--border-1)', borderRadius:14, width:'100%', maxWidth:420, padding:24 }}>
        <p style={{ fontWeight:700, color:'var(--text-primary)', marginBottom:16 }}>Clone Profile</p>
        <label className="label">New Profile Name</label>
        <input className="input mb-4" value={name} onChange={(e) => setName(e.target.value)} />
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button className="btn-secondary text-xs" onClick={onClose}>Cancel</button>
          <button className="btn-primary text-xs" onClick={handle} disabled={busy}>{busy ? 'Cloning…' : 'Clone'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Rollover Modal ────────────────────────────────────────────
function RolloverModal({ profile, onClose, onDone }) {
  const [period, setPeriod] = useState('')
  const [busy, setBusy] = useState(false)
  const qc = useQueryClient()
  const handle = async () => {
    setBusy(true)
    try {
      const res = await enterpriseExtAPI.rolloverProfile(profile.id, period ? { next_period: period } : {})
      toast.success(`Rolled over to ${res.period} — ${res.tasks_created} tasks created`)
      qc.invalidateQueries({ queryKey: ['enterprise-profiles'] })
      onDone()
    } catch (e) { toast.error(e?.response?.data?.detail || 'Rollover failed') }
    finally { setBusy(false) }
  }
  return (
    <div style={{ position:'fixed', inset:0, zIndex:60, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'var(--surface-1)', border:'1px solid var(--border-1)', borderRadius:14, width:'100%', maxWidth:420, padding:24 }}>
        <p style={{ fontWeight:700, color:'var(--text-primary)', marginBottom:8 }}>Auto-Rollover to Next Period</p>
        <p style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:16 }}>
          Clones this profile for the next calendar period, creates close tasks, and opens a new certification workflow.
          Leave period blank to auto-detect.
        </p>
        <label className="label">Next Period (optional, e.g. 2025-07)</label>
        <input className="input mb-4" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="Auto-detect" />
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button className="btn-secondary text-xs" onClick={onClose}>Cancel</button>
          <button className="btn-primary text-xs" onClick={handle} disabled={busy}>{busy ? 'Rolling over…' : 'Rollover'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Profile Card ──────────────────────────────────────────────
function ProfileCard({ profile, users, onEdit, onClone, onRollover, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const preparer  = users.find((u) => u.id === profile.assigned_preparer)
  const reviewer  = users.find((u) => u.id === profile.assigned_reviewer)
  const approver  = users.find((u) => u.id === profile.assigned_approver)
  const certifier = users.find((u) => u.id === profile.assigned_certifier)

  return (
    <div style={{
      background:'var(--surface-2)', border:'1px solid var(--border-1)',
      borderRadius:10, overflow:'hidden',
    }}>
      {/* Header row */}
      <div style={{ padding:'12px 14px', display:'flex', alignItems:'flex-start', gap:12 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
            <p style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>
              {profile.name}
            </p>
            <RiskBadge risk={profile.risk_classification || 'MEDIUM'} />
            <StateBadge state={profile.lifecycle_state || 'OPEN'} />
          </div>
          <p style={{ fontSize:11, color:'var(--text-tertiary)' }}>
            {(profile.reconciliation_type||'').replace(/_/g,' ')} · {profile.frequency} · Due in {profile.due_days ?? 5}d
          </p>
        </div>
        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
          <button className="btn-secondary text-xs py-1 h-7" onClick={() => onEdit(profile)} title="Edit">
            <Edit2 style={{ width:11, height:11 }} />
          </button>
          <button className="btn-secondary text-xs py-1 h-7" onClick={() => onClone(profile)} title="Clone">
            <Copy style={{ width:11, height:11 }} />
          </button>
          <button className="btn-secondary text-xs py-1 h-7" onClick={() => onRollover(profile)} title="Rollover">
            <RefreshCw style={{ width:11, height:11 }} />
          </button>
          <button className="btn-ghost text-xs py-1 h-7 text-red-400 hover:text-red-300"
            onClick={() => onDelete(profile.id)} title="Delete">
            <Trash2 style={{ width:11, height:11 }} />
          </button>
          <button className="btn-ghost text-xs py-1 h-7" onClick={() => setExpanded((v) => !v)}>
            {expanded ? <ChevronUp style={{ width:13, height:13 }} /> : <ChevronDown style={{ width:13, height:13 }} />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop:'1px solid var(--border-0)', padding:'10px 14px', background:'var(--surface-1)' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
            {[
              ['Preparer', preparer?.username],
              ['Reviewer', reviewer?.username],
              ['Approver', approver?.username],
              ['Certifier', certifier?.username],
            ].map(([role, name]) => (
              <div key={role}>
                <p style={{ fontSize:10, color:'var(--text-disabled)', textTransform:'uppercase', letterSpacing:'0.08em' }}>{role}</p>
                <p style={{ fontSize:12, color: name ? 'var(--text-primary)' : 'var(--text-disabled)', fontWeight: name ? 600 : 400 }}>
                  {name || 'Unassigned'}
                </p>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:16, marginTop:10 }}>
            <span style={{ fontSize:11, color:'var(--text-tertiary)' }}>Tolerance: {profile.tolerance_threshold ?? 0}%</span>
            <span style={{ fontSize:11, color:'var(--text-tertiary)' }}>Date window: {profile.date_window_days ?? 0}d</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function ReconciliationProfiles() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editProfile, setEditProfile] = useState(null)
  const [cloneProfile, setCloneProfile] = useState(null)
  const [rolloverProfile, setRolloverProfile] = useState(null)
  const [filterRisk, setFilterRisk] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterState, setFilterState] = useState('')
  const [search, setSearch] = useState('')

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ['enterprise-profiles'],
    queryFn: enterpriseAPI.listProfiles,
  })
  const { data: users = [] } = useQuery({
    queryKey: ['users-list'],
    queryFn: authAPI.listUsers,
  })

  const deleteMutation = useMutation({
    mutationFn: enterpriseAPI.deleteProfile,
    onSuccess: () => { toast.success('Profile deleted'); qc.invalidateQueries({ queryKey: ['enterprise-profiles'] }) },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Delete failed'),
  })

  const filtered = useMemo(() => {
    return profiles.filter((p) => {
      if (filterRisk && p.risk_classification !== filterRisk) return false
      if (filterType && p.reconciliation_type !== filterType) return false
      if (filterState && p.lifecycle_state !== filterState) return false
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [profiles, filterRisk, filterType, filterState, search])

  // Summary KPIs
  const kpis = useMemo(() => {
    const open = profiles.filter((p) => !['CLOSED','CERTIFIED'].includes(p.lifecycle_state||'')).length
    const certified = profiles.filter((p) => ['CERTIFIED','CLOSED'].includes(p.lifecycle_state||'')).length
    const high = profiles.filter((p) => ['HIGH','CRITICAL'].includes(p.risk_classification||'')).length
    return { total: profiles.length, open, certified, high }
  }, [profiles])

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Reconciliation Profiles"
        subtitle="Create, manage and rollover reconciliation profiles across entities."
        badge={`${profiles.length} profiles`}
        actions={
          <button className="btn-primary text-xs" onClick={() => setShowCreate(true)}>
            <Plus style={{ width:13, height:13 }} /> New Profile
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-5 space-y-4" style={{ background:'var(--surface-0)' }}>

        {/* KPI strip */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
          {[
            ['Total Profiles', kpis.total, Layers, 'var(--accent)'],
            ['Open', kpis.open, Clock, 'var(--warn)'],
            ['Certified', kpis.certified, CheckCircle2, 'var(--ok)'],
            ['High / Critical Risk', kpis.high, ShieldAlert, 'var(--bad)'],
          ].map(([label, val, Icon, color]) => (
            <div key={label} style={{
              background:'var(--surface-2)', border:'1px solid var(--border-1)',
              borderRadius:10, padding:'12px 16px',
              display:'flex', alignItems:'center', gap:12,
            }}>
              <div style={{ width:34, height:34, borderRadius:8, background:`${color}18`, border:`1px solid ${color}33`,
                display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <Icon style={{ width:15, height:15, color }} />
              </div>
              <div>
                <p style={{ fontSize:11, color:'var(--text-tertiary)' }}>{label}</p>
                <p style={{ fontSize:22, fontWeight:700, color:'var(--text-primary)', lineHeight:1.1 }}>{val}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <input className="input h-8 text-xs w-48" placeholder="Search profiles…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input h-8 text-xs" value={filterRisk} onChange={(e) => setFilterRisk(e.target.value)}>
            <option value="">All Risks</option>
            {RISK_LEVELS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select className="input h-8 text-xs" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">All Types</option>
            {RECON_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
          </select>
          <select className="input h-8 text-xs" value={filterState} onChange={(e) => setFilterState(e.target.value)}>
            <option value="">All States</option>
            {LIFECYCLE_STATES.map((s) => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
          </select>
          {(filterRisk || filterType || filterState || search) && (
            <button className="btn-ghost text-xs h-8"
              onClick={() => { setFilterRisk(''); setFilterType(''); setFilterState(''); setSearch('') }}>
              Clear
            </button>
          )}
          <span style={{ marginLeft:'auto', fontSize:11, color:'var(--text-tertiary)' }}>
            {filtered.length} of {profiles.length}
          </span>
        </div>

        {/* Profile list */}
        {isLoading ? (
          <div style={{ textAlign:'center', padding:40, color:'var(--text-tertiary)', fontSize:13 }}>Loading profiles…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No profiles found"
            description="Create a new reconciliation profile or adjust your filters."
            action={<button className="btn-primary text-xs" onClick={() => setShowCreate(true)}><Plus style={{ width:12, height:12 }} />New Profile</button>}
          />
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {filtered.map((p) => (
              <ProfileCard
                key={p.id}
                profile={p}
                users={users}
                onEdit={(prof) => setEditProfile(prof)}
                onClone={(prof) => setCloneProfile(prof)}
                onRollover={(prof) => setRolloverProfile(prof)}
                onDelete={(id) => { if (window.confirm('Delete this profile?')) deleteMutation.mutate(id) }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {(showCreate || editProfile) && (
        <ProfileFormModal
          profile={editProfile}
          users={users}
          onClose={() => { setShowCreate(false); setEditProfile(null) }}
          onSaved={() => { setShowCreate(false); setEditProfile(null) }}
        />
      )}
      {cloneProfile && (
        <CloneModal profile={cloneProfile} onClose={() => setCloneProfile(null)} onDone={() => setCloneProfile(null)} />
      )}
      {rolloverProfile && (
        <RolloverModal profile={rolloverProfile} onClose={() => setRolloverProfile(null)} onDone={() => setRolloverProfile(null)} />
      )}
    </div>
  )
}
