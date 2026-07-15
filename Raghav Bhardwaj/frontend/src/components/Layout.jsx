import { useEffect, useMemo, useState } from 'react'
import { Outlet, NavLink, matchPath, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  AlertTriangle, BarChart3, CalendarCheck2, CheckCircle2,
  ClipboardList, Command, FolderOpen, LogOut, Moon, Repeat,
  Shield, Sun, ShieldAlert, Scale, User, Search, ChevronRight, ChevronDown,
  LayoutDashboard, Settings, ChevronsLeft, ChevronsRight,
  Grid2x2, List, Plus, Clock, Repeat2, FileCheck2, Database,
  TrendingUp, BookOpen, Lock, Archive, Sliders, Bell, DollarSign, ArrowLeftRight, CheckCheck,
  Network, Layers, ShieldCheck,
} from 'lucide-react'
import NotificationCenter from './NotificationCenter'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'
import { authAPI, projectsAPI } from '../api'
import { normalizeRole } from '../utils/roles'
import { useProjectStore } from '../store/projectStore'

const PAGE_META = {
  '/command-center':          { label: 'Home',                      section: 'Operations' },
  '/exception-ops':                    { label: 'Exception Ops',              section: 'Operations' },
  '/transaction-matching-workspace':   { label: 'Transaction Matching',       section: 'Reconciliation' },
  '/bulk-operations':                  { label: 'Bulk Operations',            section: 'Reconciliation' },
  '/exception-workbench':              { label: 'Exception Workbench',        section: 'Operations' },

  '/certification-workflow':  { label: 'Certification Workflow',    section: 'Close Management' },
  '/analytics-explorer':      { label: 'Analytics',                section: 'Analytics' },
  '/variance-analytics':      { label: 'Variance Analytics',       section: 'Analytics' },
  '/reconciliation-profiles': { label: 'Reconciliation Profiles',  section: 'Operations' },

  '/work-queue':              { label: 'Work Queue',                section: 'My Work' },
  '/my-reconciliations':      { label: 'My Reconciliations',        section: 'My Work' },
  '/my-performance':          { label: 'My Performance',            section: 'My Work' },
  '/enterprise-center':       { label: 'Enterprise Reconciliation', section: 'Operations' },
  '/enterprise-ops':          { label: 'Enterprise Reconciliation Ops', section: 'Operations' },
  '/rule-builder':            { label: 'Rule Builder',              section: 'Configuration' },
  '/reconciliations':         { label: 'Reconciliations',           section: 'Operations' },
  '/executive-dashboard':     { label: 'Executive Dashboard',       section: 'Analytics', subtitle: 'Real-time financial close analytics and material risk exposure.' },
  '/approver-dashboard':      { label: 'Dashboard',                 section: 'Approval' },
  '/approver-queue':          { label: 'Pending Approvals',         section: 'Approval' },
  '/aging-dashboard':         { label: 'Aging Analysis',            section: 'Analytics' },
  '/close-calendar':          { label: 'Close Calendar',            section: 'Close Management' },
  '/financial-close-calendar': { label: 'Close Calendar',            section: 'Close Management' },
  '/controls-governance':     { label: 'Policy & Controls Studio',      section: 'Governance', subtitle: 'Segregation-of-duties enforcement, approval policy testing, and reusable control coverage.'},
  '/audit':                   { label: 'Audit Trail',               section: 'Governance' },
  '/risk-dashboard':          { label: 'Risk Analytics',            section: 'Analytics' },
  '/close-certification':     { label: 'Period Close Monitor', section: 'Period Close Monitor', subtitle: 'Manage close periods, lock controls, and certification workflows.' },
  '/auto-cert':               { label: 'Auto-Certification Settings', section: 'Certification', subtitle: 'Configure zero-touch certification rules to automate the financial close.' },
  '/ingestion':               { label: 'Data Ingestion',            section: 'Data' },
  '/evidence-retention':      { label: 'Evidence Retention & Archival', subtitle: 'Manage data lifecycle, archival schedules, and storage metrics for PDFs and attachments.' },
}

/* ─── Admin sidebar — new grouped structure with collapsible sections ─── */
const ADMIN_NAV = [
  // Direct link
  {
    kind: 'link',
    to: '/command-center',
    icon: LayoutDashboard,
    label: 'Home',
    tip: 'Home / Command Center',
  },
  // ── RECONCILIATION dropdown ──
  {
    kind: 'group',
    label: 'Reconciliation',
    defaultOpen: true,
    items: [
      { to: '/transaction-matching-workspace', icon: ArrowLeftRight, label: 'Transaction Matching', tip: 'Full Matching Workspace' },
      { to: '/bulk-operations',               icon: CheckCheck,      label: 'Bulk Operations',      tip: 'Batch approve, certify, assign, export' },
      { to: '/enterprise-center',             icon: Scale,           label: 'Recon Hub',             tip: 'Reconciliation Hub' },
      { to: '/balance-reconciliation',        icon: Database,        label: 'Balance Reconciliation',tip: 'Balance Reconciliation' },
    ],
  },


  // ── ANALYTICS dropdown ──
  {
    kind: 'group',
    label: 'Analytics',
    defaultOpen: false,
    items: [
      { to: '/analytics-explorer', icon: BarChart3,     label: 'Analytics Dashboard', tip: 'Analytics Explorer' },
      { to: '/risk-dashboard',     icon: ShieldAlert,   label: 'Risk Dashboard',      tip: 'Risk Dashboard' },
      { to: '/variance-analytics', icon: TrendingUp,    label: 'Variance Analytics',  tip: 'Variance Analytics' },
      { to: '/aging-dashboard',    icon: Clock,         label: 'Aging Analysis',      tip: 'Aging Analysis' },
    ],
  },
  // ── CLOSE MANAGEMENT dropdown ──
  {
    kind: 'group',
    label: 'Close Management',
    defaultOpen: false,
    items: [
      { to: '/close-certification',    icon: CalendarCheck2, label: 'Close Certification',    tip: 'Close Certification Queue' },
      { to: '/certification-workflow', icon: FileCheck2,     label: 'Certification Workflow', tip: 'Certification Workflow Management' },
      { to: '/financial-close-calendar', icon: Clock,        label: 'Close Calendar',         tip: 'Financial Close Calendar' },
    ],
  },
  // ── CONFIGURATION dropdown ──
  {
    kind: 'group',
    label: 'Configuration',
    defaultOpen: false,
    items: [
      { to: '/reconciliation-profiles', icon: FolderOpen, label: 'Profiles',          tip: 'Reconciliation Profiles' },
      { to: '/rule-builder',            icon: Sliders,    label: 'Rules Engine',       tip: 'Rule Builder' },
      { to: '/fx-management',           icon: DollarSign, label: 'FX Management',      tip: 'Multi-Currency FX Rates' },
      { to: '/approval-chains',         icon: CheckCircle2, label: 'Approval Chains',  tip: 'Approval Chains' },
      { to: '/risk-configuration',      icon: Shield,     label: 'Risk Configuration', tip: 'Risk Configuration' },
    ],
  },
  // ── GOVERNANCE dropdown ──
  {
    kind: 'group',
    label: 'Governance',
    defaultOpen: false,
    items: [
      { to: '/audit',              icon: ClipboardList, label: 'Audit Trail',        tip: 'Audit Trail' },
      { to: '/sla-monitor',        icon: AlertTriangle, label: 'SLA Monitor',        tip: 'SLA Monitoring & Escalation' },
      { to: '/escalation-workbench', icon: Bell,        label: 'Escalation Workbench', tip: 'Escalation Management' },
      { to: '/controls-governance', icon: BookOpen,      label: 'Controls Governance', tip: 'Governance & Compliance Hub' },
      { to: '/evidence-retention',      icon: Archive,       label: 'Evidence Retention', tip: 'Evidence Retention' },
    ],
  },

]

/* Flat list of all routable items (for collapsed icon-only mode) */
const ADMIN_NAV_GROUPS = [
  {
    section: 'Admin',
    items: ADMIN_NAV.flatMap(entry =>
      entry.kind === 'link'
        ? [{ to: entry.to, icon: entry.icon, label: entry.label, tip: entry.tip }]
        : entry.items.filter(i => i.to).map(i => ({ to: i.to, icon: i.icon, label: i.label, tip: i.tip }))
    ),
  },
]

/* ─── Preparer sidebar — collapsible grouped structure ─── */
const PREPARER_NAV = [
  // Direct link — Home / Dashboard
  {
    kind: 'link',
    to: '/my-reconciliations',
    icon: LayoutDashboard,
    label: 'Home',
    tip: 'Home / Dashboard',
  },

  // ── RECONCILIATION dropdown ──
  {
    kind: 'group',
    label: 'Reconciliation',
    emoji: '🔄',
    defaultOpen: true,
    items: [
      { to: '/my-reconciliations',      icon: ClipboardList, label: 'My Reconciliations', tip: 'My Reconciliations' },
      { to: '/balance-reconciliation',  icon: Database,      label: 'Workbench',          tip: 'Balance Reconciliation Workbench' },
    ],
  },

  // ── ANALYTICS dropdown ──
  {
    kind: 'group',
    label: 'Analytics',
    emoji: '📊',
    defaultOpen: false,
    items: [
      { to: '/aging-dashboard',    icon: Clock,      label: 'My Aging Analysis',    tip: 'My Aging Analysis' },
      { to: '/variance-analytics', icon: TrendingUp, label: 'My Variance Analysis', tip: 'My Variance Analysis' },
    ],
  },
  // Direct link — Performance
  {
    kind: 'link',
    to: '/my-performance',
    icon: BarChart3,
    label: 'Performance',
    tip: 'My Performance',
  },
  // Direct link — Close Management (blank placeholder)
  {
    kind: 'link',
    to: '/preparer-close-management',
    icon: CalendarCheck2,
    label: 'Close Management',
    tip: 'Close Management',
  },
]

/* Flat list for collapsed (icon-only) mode — preparer */
const PREPARER_NAV_FLAT = PREPARER_NAV.flatMap(entry =>
  entry.kind === 'link'
    ? (entry.to ? [{ to: entry.to, icon: entry.icon, label: entry.label, tip: entry.tip }] : [])
    : entry.items.filter(i => i.to).map(i => ({ to: i.to, icon: i.icon, label: i.label, tip: i.tip }))
)

/* Legacy flat groups — only still used by approver/certifier */
const PREPARER_NAV_GROUPS = [
  {
    section: 'My Work',
    items: PREPARER_NAV_FLAT,
  },
]

/**
 * APPROVER — collapsible grouped sidebar structure.
 * Home → Approval (dropdown) → Exception Management → Analytics (dropdown) → Close Sign-offs
 */
const APPROVER_NAV = [
  // Direct link — Home / Dashboard
  {
    kind: 'link',
    to: '/approver-dashboard',
    icon: LayoutDashboard,
    label: 'Home',
    tip: 'Approver Dashboard',
  },
  // ── APPROVAL dropdown ──
  {
    kind: 'group',
    label: 'Approval',
    emoji: '✅',
    defaultOpen: true,
    items: [
      { to: '/approver-queue',     icon: FileCheck2,    label: 'Pending Approvals', tip: 'Profiles awaiting final sign-off' },
      { to: '/exception-workbench', icon: ShieldAlert,  label: 'Escalated Items',   tip: 'Critical-risk & manually escalated items' },
    ],
  },
  // Direct link — Exception Management
  {
    kind: 'link',
    to: '/exception-investigation',
    icon: AlertTriangle,
    label: 'Exception Management',
    tip: 'Investigate variances and validate preparer explanations',
  },
  // ── ANALYTICS dropdown ──
  {
    kind: 'group',
    label: 'Analytics',
    emoji: '📊',
    defaultOpen: false,
    items: [
      { to: '/aging-dashboard',    icon: Clock,       label: 'Team Aging Analysis', tip: 'Track how long tasks sit in team queues' },
      { to: '/variance-analytics', icon: TrendingUp,  label: 'Variance Analysis',   tip: 'MoM balance comparison and flux investigation' },
    ],
  },
  // Direct link — Close Sign-offs
  {
    kind: 'link',
    to: '/approver-close-signoffs',
    icon: CalendarCheck2,
    label: 'Close Sign-offs',
    tip: 'Period-close procedural checklist',
  },
]

/* Flat list for collapsed (icon-only) mode — approver */
const APPROVER_NAV_FLAT = APPROVER_NAV.flatMap(entry =>
  entry.kind === 'link'
    ? (entry.to ? [{ to: entry.to, icon: entry.icon, label: entry.label, tip: entry.tip }] : [])
    : entry.items.filter(i => i.to).map(i => ({ to: i.to, icon: i.icon, label: i.label, tip: i.tip }))
)

/* Legacy flat groups — only still used by certifier */
const APPROVER_NAV_GROUPS = [
  {
    section: 'Approval',
    items: APPROVER_NAV_FLAT,
  },
]

/**
 * CERTIFIER — collapsible grouped sidebar structure.
 * Home → Certification (dropdown) → Analytics (dropdown) → Close Management (dropdown) → Governance (dropdown)
 */
const CERTIFIER_NAV = [
  // Direct link — Home / Executive Dashboard
  {
    kind: 'link',
    to: '/executive-dashboard',
    icon: LayoutDashboard,
    label: 'Home',
    tip: 'Executive Dashboard — daily overview',
  },
  // ── CERTIFICATION dropdown ──
  {
    kind: 'group',
    label: 'Certification',
    emoji: '✅',
    defaultOpen: true,
    items: [
      { to: '/close-certification', icon: FileCheck2,  label: 'Certification Queue', tip: 'All approved balances awaiting final sign-off' },
      { to: '/auto-cert', icon: ShieldCheck, label: 'Auto-Certification Settings', tip: 'Configure auto-certification rules' },
      { to: '/exception-workbench', icon: AlertTriangle, label: 'Escalated Items',  tip: 'System and manually escalated items requiring intervention' },
    ],
  },
  // ── ANALYTICS dropdown ──
  {
    kind: 'group',
    label: 'Analytics',
    emoji: '📊',
    defaultOpen: false,
    items: [
      { to: '/variance-analytics', icon: TrendingUp, label: 'Variance Analytics', tip: 'Top variances, MoM/QoQ flux, waterfall, root cause' },
      { to: '/aging-dashboard',    icon: Clock,      label: 'Aging Analysis',     tip: 'Exception aging buckets by entity, project, profile' },
      { to: '/risk-dashboard',     icon: ShieldAlert, label: 'Risk Analytics',    tip: 'Enterprise risk scoring by profile and business unit' },
    ],
  },
  // ── CLOSE MANAGEMENT dropdown ──
  {
    kind: 'group',
    label: 'Close Management',
    emoji: '📅',
    defaultOpen: false,
    items: [
      { to: '/financial-close-calendar', icon: CalendarCheck2, label: 'Close Calendar', tip: 'Monthly / quarterly close period schedule and readiness' },
      { to: '/close-readiness',         icon: CheckCircle2,   label: 'Close Readiness', tip: 'Validation engine: can we close the books?' },
    ],
  },
  // ── GOVERNANCE dropdown ──
  {
    kind: 'group',
    label: 'Governance',
    emoji: '🛡️',
    defaultOpen: false,
    items: [
      { to: '/audit',               icon: ClipboardList, label: 'Audit Trail',  tip: 'Complete certification audit trail for internal / external audits' },
      { to: '/controls-governance', icon: Shield,        label: 'Controls Governance', tip: 'SOX violations, policy exceptions, SoD breaches, control failures' },
    ],
  },
]

/* Flat list for collapsed (icon-only) mode — certifier */
const CERTIFIER_NAV_FLAT = CERTIFIER_NAV.flatMap(entry =>
  entry.kind === 'link'
    ? (entry.to ? [{ to: entry.to, icon: entry.icon, label: entry.label, tip: entry.tip }] : [])
    : entry.items.filter(i => i.to && !i.disabled).map(i => ({ to: i.to, icon: i.icon, label: i.label, tip: i.tip }))
)

/* Legacy flat groups — kept for potential future use */
const CERTIFIER_NAV_GROUPS = [
  {
    section: 'Close Certification',
    items: CERTIFIER_NAV_FLAT,
  },
]

/* ─── SidebarNav — reusable collapsible sidebar ─── */
function SidebarNav({ items, SB_TEXT, SB_TEXT_DIM, SB_BORDER, theme }) {
  const [openGroups, setOpenGroups] = useState(() =>
    Object.fromEntries(
      items.filter(e => e.kind === 'group').map(e => [e.label, e.defaultOpen])
    )
  )
  const toggle = (label) => setOpenGroups(s => ({ ...s, [label]: !s[label] }))

  const navItemStyle = (isActive) => ({
    display: 'flex', alignItems: 'center', gap: 9,
    height: 34, borderRadius: 6,
    padding: '0 10px', margin: '1px 2px',
    color: isActive ? '#FFE600' : (theme === 'light' ? '#FFE600' : SB_TEXT_DIM),
    background: isActive ? 'rgba(255,230,0,0.10)' : 'transparent',
    border: `1px solid ${isActive ? 'rgba(255,230,0,0.20)' : 'transparent'}`,
    fontWeight: isActive ? 600 : 500,
    fontSize: 12.5, fontFamily: 'Inter, sans-serif',
    textDecoration: 'none', position: 'relative',
    transition: 'color 100ms, background 100ms',
    whiteSpace: 'nowrap', overflow: 'hidden',
  })

  const subItemStyle = (isActive) => ({
    ...navItemStyle(isActive),
    paddingLeft: 28,
    height: 30,
    fontSize: 12,
  })

  const disabledStyleMain = {
    display: 'flex', alignItems: 'center', gap: 9,
    height: 34, borderRadius: 6,
    padding: '0 10px', margin: '1px 2px',
    color: 'rgba(255,255,255,0.22)',
    fontSize: 12.5, fontFamily: 'Inter, sans-serif',
    whiteSpace: 'nowrap', overflow: 'hidden',
    cursor: 'default', userSelect: 'none',
  }

  const disabledStyleSub = {
    display: 'flex', alignItems: 'center', gap: 9,
    height: 30, borderRadius: 6,
    padding: '0 10px 0 28px', margin: '1px 2px',
    color: 'rgba(255,255,255,0.22)',
    fontSize: 12, fontFamily: 'Inter, sans-serif',
    whiteSpace: 'nowrap', overflow: 'hidden',
    cursor: 'default', userSelect: 'none',
  }

  const Divider = () => <div style={{ height: 1, background: SB_BORDER, margin: '5px 8px' }} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {items.map((entry, idx) => {
        const showDivider = idx > 0

        if (entry.kind === 'link') {
          if (entry.disabled || !entry.to) {
            const DisabledIcon = entry.icon
            return (
              <div key={entry.label}>
                {showDivider && <Divider />}
                <div style={disabledStyleMain} title={entry.tip}>
                  <DisabledIcon style={{ width: 14, height: 14, flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 9, opacity: 0.45 }}>soon</span>
                </div>
              </div>
            )
          }
          const Icon = entry.icon
          return (
            <div key={entry.to}>
              {showDivider && <Divider />}
              <NavLink
                to={entry.to}
                title={entry.tip}
                style={({ isActive }) => navItemStyle(isActive)}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                onMouseLeave={e => { e.currentTarget.style.background = '' }}
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span style={{ position: 'absolute', left: 0, top: 7, bottom: 7, width: 3, borderRadius: '0 2px 2px 0', background: '#FFE600' }} />}
                    <Icon style={{ width: 14, height: 14, flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.label}</span>
                  </>
                )}
              </NavLink>
            </div>
          )
        }

        // kind === 'group'
        const isOpen = openGroups[entry.label]
        return (
          <div key={entry.label}>
            {showDivider && <Divider />}
            <button
              onClick={() => toggle(entry.label)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', height: 32,
                padding: '0 10px', margin: '1px 2px',
                borderRadius: 6, border: 'none',
                background: 'transparent',
                color: theme === 'light' ? '#FFE600' : SB_TEXT_DIM,
                cursor: 'pointer',
                fontSize: 11, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                fontFamily: 'Inter, sans-serif',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontSize: 13, lineHeight: 1 }}>{entry.emoji}</span>
              <span style={{ flex: 1, textAlign: 'left' }}>{entry.label}</span>
              {isOpen
                ? <ChevronDown style={{ width: 11, height: 11, flexShrink: 0 }} />
                : <ChevronRight style={{ width: 11, height: 11, flexShrink: 0 }} />}
            </button>

            {isOpen && entry.items.map(item => {
              const ItemIcon = item.icon
              if (item.disabled || !item.to) {
                return (
                  <div key={item.label} style={disabledStyleSub} title={item.tip}>
                    <ItemIcon style={{ width: 13, height: 13, flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 9, opacity: 0.45 }}>soon</span>
                  </div>
                )
              }
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={item.tip}
                  style={({ isActive }) => subItemStyle(isActive)}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '' }}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 3, borderRadius: '0 2px 2px 0', background: '#FFE600' }} />}
                      <ItemIcon style={{ width: 13, height: 13, flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                    </>
                  )}
                </NavLink>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

/* Flat list for collapsed (icon-only) mode — for approver/certifier flat-group fallback */
const flatItems = (groups) => groups.flatMap((g) => g.items)

const SIDEBAR_COLLAPSED_KEY = 'drms_sidebar_collapsed'



export default function Layout() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const { user, clearAuth, setAuth } = useAuthStore()
  const { theme, toggleTheme }       = useThemeStore()
  const {
    selectedProjectId, setSelectedProjectId,
    ccSearch, setCcSearch,
    ccView, setCcView,
    ccShowModal, setCcShowModal,
    ccCounts,
  } = useProjectStore()

  const isCommandCenter = location.pathname === '/command-center'
  
  // Header Override Logic
  const [headerOverride, setHeaderOverride] = useState(null);

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  )

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: projectsAPI.list })

  const workflowMatch   = matchPath('/projects/:projectId/:section', location.pathname)
  const activeProjectId = workflowMatch?.params?.projectId || null
  const workflowSection = workflowMatch?.params?.section   || null
  const isWorkflowRoute = ['ingestion','mapping','rules','results'].includes(workflowSection || '')
  const role            = normalizeRole(user?.role)

  const activeProject   = activeProjectId
    ? projects.find((p) => String(p.id) === String(activeProjectId))
    : null

  const navGroups = role === 'preparer'  ? PREPARER_NAV_GROUPS
    : role === 'approver'  ? APPROVER_NAV_GROUPS
    : role === 'certifier' ? CERTIFIER_NAV_GROUPS
    : ADMIN_NAV_GROUPS

  const navFlat = role === 'preparer' ? PREPARER_NAV_FLAT
    : role === 'approver' ? APPROVER_NAV_FLAT
    : role === 'certifier' ? CERTIFIER_NAV_FLAT
    : flatItems(navGroups)

  const currentPage = useMemo(() => {
    if (location.pathname.startsWith('/projects/'))
      return { label: activeProject?.name || 'Reconciliation Workspace', section: 'Projects' }
    if (location.pathname.startsWith('/exception-investigation'))
      return { label: 'Exception Investigation', section: 'Operations' }
    const key = Object.keys(PAGE_META).find((k) => location.pathname.startsWith(k))
    return PAGE_META[key] || { label: 'Workbench', section: 'DRMS' }
  }, [location.pathname, activeProject])

  /* persist collapse state */
  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
      return next
    })
  }

  useEffect(() => {
    document.documentElement.classList.toggle('theme-light', theme === 'light')
  }, [theme])

  useEffect(() => {
    if (activeProjectId && String(activeProjectId) !== String(selectedProjectId || ''))
      setSelectedProjectId(String(activeProjectId))
  }, [activeProjectId, selectedProjectId, setSelectedProjectId])

  useEffect(() => {
    if (!selectedProjectId && projects.length) setSelectedProjectId(String(projects[0].id))
  }, [projects, selectedProjectId, setSelectedProjectId])

  const handleLogout = () => { clearAuth(); navigate('/login') }

  const handleSwitchUser = async () => {
    if (!import.meta.env.DEV) return
    const seq = [
      { role: 'admin',    username: 'admin',     password: 'admin123' },
      { role: 'preparer', username: 'preparer',  password: 'preparer123' },
      { role: 'approver', username: 'approver',  password: 'approver123' },
      { role: 'certifier', username: 'certifier', password: 'certifier123' },
    ]
    const idx    = seq.findIndex((e) => e.role === (user?.role || 'admin').toLowerCase())
    const target = seq[(idx + 1 + seq.length) % seq.length]
    try {
      const data = await authAPI.login(target.username, target.password)
      setAuth(data.user, data.access_token)
      navigate('/')
    } catch { clearAuth(); navigate('/login') }
  }

  const now = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })

  /* ─── Sidebar widths ─── */
  const COLLAPSED_W = 52
  const EXPANDED_W  = 200

  /* ─── EY Off Black sidebar ─── */
  const SB_BG      = '#2E2E38'
  const SB_BORDER  = 'rgba(255,255,255,0.07)'
  const SB_TEXT_DIM = 'rgba(255,255,255,0.40)'
  const SB_TEXT     = 'rgba(255,255,255,0.82)'

  return (
    <div className="h-screen w-screen flex overflow-hidden" style={{ background: 'var(--surface-0)' }}>

      {/* ════════════════════════════════════════════════════
          SIDEBAR
      ════════════════════════════════════════════════════ */}
      <aside
        style={{
          width: collapsed ? COLLAPSED_W : EXPANDED_W,
          minWidth: collapsed ? COLLAPSED_W : EXPANDED_W,
          background: SB_BG,
          borderRight: `1px solid ${SB_BORDER}`,
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          transition: 'width 200ms cubic-bezier(0.4,0,0.2,1), min-width 200ms cubic-bezier(0.4,0,0.2,1)',
          overflow: 'hidden',
          zIndex: 40,
        }}
      >
        {/* ── Logo row ── */}
        <div style={{
          height: 52,
          borderBottom: `1px solid ${SB_BORDER}`,
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
          padding: collapsed ? '0' : '0 10px',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: 8,
        }}>
          {/* EY Brand mark — yellow square with EY wordmark */}
          <div style={{
            width: 30, height: 30, flexShrink: 0,
            borderRadius: 4,
            background: '#FFE600',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{
              fontSize: 11, fontWeight: 800,
              color: '#1A1A24',
              letterSpacing: '-0.03em',
              lineHeight: 1,
              fontFamily: 'Inter, system-ui, sans-serif',
              userSelect: 'none',
            }}>DRMS</span>
          </div>

          {/* Brand name — hidden when collapsed */}
          {!collapsed && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                fontSize: 13, fontWeight: 700,
                fontFamily: 'Inter, sans-serif',
                letterSpacing: '-0.02em',
                color: 'rgba(255,255,255,0.92)',
                lineHeight: 1, margin: 0,
              }}>
                DRMS
              </p>
              <p style={{ fontSize: 9.5, color: SB_TEXT_DIM, lineHeight: 1, marginTop: 2, letterSpacing: '0.04em' }}>
              Reconciliation Platform
              </p>
            </div>
          )}

          {/* Collapse toggle */}
          <button
            onClick={toggleCollapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              width: 26, height: 26, flexShrink: 0,
              borderRadius: 5,
              border: `1px solid ${SB_BORDER}`,
              background: 'rgba(255,255,255,0.04)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              color: SB_TEXT_DIM,
              transition: 'background 100ms, color 100ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; e.currentTarget.style.color = SB_TEXT }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = SB_TEXT_DIM }}
          >
            {collapsed
              ? <ChevronsRight style={{ width: 13, height: 13 }} />
              : <ChevronsLeft  style={{ width: 13, height: 13 }} />}
          </button>
        </div>

        {/* ── Nav items ── */}
        <nav
          className="slim-scroll"
          style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 4px' }}
        >
          {collapsed ? (
            /* ── COLLAPSED: icon only ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
              {navFlat.map(({ to, icon: Icon, tip }) => (
                <NavLink
                  key={to}
                  to={to}
                  title={tip}
                  style={({ isActive }) => ({
                    width: 40, height: 40,
                    borderRadius: 7,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: isActive ? '#FFE600' : (theme === 'light' ? '#FFE600' : SB_TEXT_DIM),
                    background: isActive ? 'rgba(255,230,0,0.10)' : 'transparent',
                    border: `1px solid ${isActive ? 'rgba(255,230,0,0.22)' : 'transparent'}`,
                    position: 'relative',
                    textDecoration: 'none',
                    transition: 'color 100ms, background 100ms',
                    flexShrink: 0,
                  })}
                  onMouseEnter={(e) => { e.currentTarget.style.color = SB_TEXT; e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                  onMouseLeave={(e) => {
                    /* restore — handled by NavLink re-render via inline style fn */
                    e.currentTarget.style.color = ''
                    e.currentTarget.style.background = ''
                  }}
                >
                  {({ isActive }) => (
                    <>
                      {/* EY Yellow left accent bar */}
                      {isActive && (
                        <span style={{
                          position: 'absolute', left: 0, top: 8, bottom: 8,
                          width: 3, borderRadius: '0 2px 2px 0',
                          background: '#FFE600',
                        }} />
                      )}
                      <Icon style={{ width: 16, height: 16 }} />
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ) : (
            /* ── EXPANDED nav ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {role === 'admin' ? (
                /* Admin: collapsible-group structure */
                <SidebarNav items={ADMIN_NAV} SB_TEXT={SB_TEXT} SB_TEXT_DIM={SB_TEXT_DIM} SB_BORDER={SB_BORDER} theme={theme} />
              ) : role === 'preparer' ? (
                /* Preparer: collapsible-group structure */
                <SidebarNav items={PREPARER_NAV} SB_TEXT={SB_TEXT} SB_TEXT_DIM={SB_TEXT_DIM} SB_BORDER={SB_BORDER} theme={theme} />
              ) : role === 'approver' ? (
                /* Approver: collapsible-group structure */
                <SidebarNav items={APPROVER_NAV} SB_TEXT={SB_TEXT} SB_TEXT_DIM={SB_TEXT_DIM} SB_BORDER={SB_BORDER} theme={theme} />
              ) : role === 'certifier' ? (
                /* Certifier: collapsible-group structure */
                <SidebarNav items={CERTIFIER_NAV} SB_TEXT={SB_TEXT} SB_TEXT_DIM={SB_TEXT_DIM} SB_BORDER={SB_BORDER} theme={theme} />
              ) : (
                /* Other roles: original flat group render */
                navGroups.map((group) => (
                  <div key={group.section} style={{ marginBottom: 6 }}>
                    <p style={{
                      fontSize: 9.5, fontWeight: 700,
                      letterSpacing: '0.12em', textTransform: 'uppercase',
                      color: theme === 'light' ? '#FFE600' : SB_TEXT_DIM,
                      padding: '8px 10px 3px',
                      margin: 0,
                    }}>
                      {group.section}
                    </p>

                    {group.items.map(({ to, icon: Icon, label }) => (
                      <NavLink
                        key={to}
                        to={to}
                        style={({ isActive }) => ({
                          display: 'flex', alignItems: 'center', gap: 9,
                          height: 34,
                          borderRadius: 6,
                          padding: '0 10px',
                          margin: '1px 2px',
                          color: isActive ? '#FFE600' : (theme === 'light' ? '#FFE600' : SB_TEXT_DIM),
                          background: isActive ? 'rgba(255,230,0,0.10)' : 'transparent',
                          border: `1px solid ${isActive ? 'rgba(255,230,0,0.20)' : 'transparent'}`,
                          fontWeight: isActive ? 600 : 500,
                          fontSize: 12.5,
                          fontFamily: 'Inter, sans-serif',
                          textDecoration: 'none',
                          position: 'relative',
                          transition: 'color 100ms, background 100ms',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                        })}
                        onMouseEnter={(e) => {
                          if (!e.currentTarget.classList.contains('active-link')) {
                            e.currentTarget.style.color   = SB_TEXT
                            e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color   = ''
                          e.currentTarget.style.background = ''
                        }}
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && (
                              <span style={{
                                position: 'absolute', left: 0, top: 7, bottom: 7,
                                width: 3, borderRadius: '0 2px 2px 0',
                                background: '#FFE600',
                              }} />
                            )}
                            <Icon style={{ width: 14, height: 14, flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
                          </>
                        )}
                      </NavLink>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
        </nav>

        {/* ── Bottom: theme + dev + logout + user ── */}
        <div style={{
          borderTop: `1px solid ${SB_BORDER}`,
          padding: collapsed ? '8px 4px' : '8px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: collapsed ? 6 : 4,
          alignItems: collapsed ? 'center' : 'stretch',
        }}>
          {/* Theme toggle */}
          {collapsed ? (
            <button
              onClick={toggleTheme}
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
              style={{
                width: 40, height: 40, borderRadius: 7,
                border: `1px solid ${SB_BORDER}`,
                background: 'rgba(255,255,255,0.04)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: SB_TEXT_DIM,
              }}
            >
              {theme === 'dark' ? <Moon style={{ width: 15, height: 15 }} /> : <Sun style={{ width: 15, height: 15, color: '#F5A623' }} />}
            </button>
          ) : (
            <button
              onClick={toggleTheme}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                height: 32, padding: '0 10px', borderRadius: 6,
                border: `1px solid ${SB_BORDER}`,
                background: 'rgba(255,255,255,0.04)',
                cursor: 'pointer', width: '100%',
                color: SB_TEXT_DIM, fontSize: 12,
                transition: 'background 100ms',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
            >
              {theme === 'dark'
                ? <Moon style={{ width: 13, height: 13, flexShrink: 0 }} />
                : <Sun  style={{ width: 13, height: 13, flexShrink: 0, color: '#F5A623' }} />}
              <span style={{ color: SB_TEXT, fontWeight: 500, fontSize: 12 }}>
                {theme === 'dark' ? 'Dark' : 'Light'} Mode
              </span>
            </button>
          )}

          {/* Dev user switcher */}
          {import.meta.env.DEV && (
            collapsed ? (
              <button
                onClick={handleSwitchUser}
                title="Switch user (dev)"
                style={{ width: 40, height: 40, borderRadius: 7, border: `1px solid ${SB_BORDER}`, background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: SB_TEXT_DIM }}
              >
                <Repeat style={{ width: 14, height: 14 }} />
              </button>
            ) : (
              <button
                onClick={handleSwitchUser}
                style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 10px', borderRadius: 6, border: `1px solid ${SB_BORDER}`, background: 'rgba(255,255,255,0.04)', cursor: 'pointer', width: '100%', color: SB_TEXT_DIM, fontSize: 12 }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
              >
                <Repeat style={{ width: 13, height: 13, flexShrink: 0 }} />
                <span style={{ color: SB_TEXT, fontWeight: 500, fontSize: 12 }}>Switch User</span>
              </button>
            )
          )}

          {/* Logout */}
          {collapsed ? (
            <button
              onClick={handleLogout}
              title="Sign out"
              style={{ width: 40, height: 40, borderRadius: 7, border: `1px solid ${SB_BORDER}`, background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: SB_TEXT_DIM }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#f05252'}
              onMouseLeave={(e) => e.currentTarget.style.color = SB_TEXT_DIM}
            >
              <LogOut style={{ width: 14, height: 14 }} />
            </button>
          ) : (
            <button
              onClick={handleLogout}
              style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 10px', borderRadius: 6, border: `1px solid ${SB_BORDER}`, background: 'rgba(255,255,255,0.04)', cursor: 'pointer', width: '100%', color: SB_TEXT_DIM, fontSize: 12 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(240,82,82,0.10)'; e.currentTarget.style.color = '#f05252' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = SB_TEXT_DIM }}
            >
              <LogOut style={{ width: 13, height: 13, flexShrink: 0 }} />
              <span style={{ fontWeight: 500, fontSize: 12 }}>Sign Out</span>
            </button>
          )}

          {/* User avatar */}
          {collapsed ? (
            <div
              title={`${user?.username} (${user?.role})`}
              style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,230,0,0.12)', border: '1px solid rgba(255,230,0,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <User style={{ width: 14, height: 14, color: '#FFE600' }} />
            </div>
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px',
              borderRadius: 6,
              background: 'rgba(255,230,0,0.07)',
              border: '1px solid rgba(255,230,0,0.16)',
              marginTop: 2,
            }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,230,0,0.12)', border: '1px solid rgba(255,230,0,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <User style={{ width: 13, height: 13, color: '#FFE600' }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.username}
                </p>
                <p style={{ fontSize: 10, color: SB_TEXT_DIM, margin: 0, textTransform: 'capitalize' }}>
                  {user?.role}
                </p>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ════════════════════════════════════════════════════
          MAIN CONTENT
      ════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top header — EY Yellow 3px top strip via .bl-header class */}
        {headerOverride ? headerOverride : (
        <header className="bl-header">
          {/* Page title */}
          <div className="flex flex-col min-w-0 flex-shrink-0">
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-tertiary)', lineHeight: 1, fontFamily: 'Inter, sans-serif' }}>
              {currentPage.section}
            </p>
            <h1 className="bl-header-title" style={{ marginTop: 2 }}>
              {isWorkflowRoute && activeProject ? activeProject.name : currentPage.label}
            </h1>
            {currentPage.subtitle && !isWorkflowRoute && (
              <p style={{
                margin: '2px 0 0',
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--text-tertiary)',
                fontFamily: 'Inter, sans-serif',
                letterSpacing: '0.01em',
                lineHeight: 1.4,
              }}>
                {currentPage.subtitle}
              </p>
            )}
          </div>



          <div className="flex-1" />

          {/* ── Right actions — two modes ─────────────────── */}
          <div className="flex items-center gap-3">

            {isCommandCenter ? (
              /* ── CommandCenter toolbar (replaces default right section) ── */
              <>
                {/* Project count */}
                <div style={{ flexShrink: 0 }}>
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-tertiary)', lineHeight: 1 }}>Projects</p>
                  <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1, whiteSpace: 'nowrap' }}>
                    {ccCounts.total}
                    <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 6 }}>
                      {ccCounts.active} active · {ccCounts.inactive} inactive
                    </span>
                  </p>
                </div>

                {/* Divider */}
                <div style={{ width: 1, height: 24, background: 'var(--border-2)' }} />

                {/* Search projects */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  height: 32, padding: '0 10px',
                  borderRadius: 8,
                  border: '1px solid var(--border-2)',
                  background: 'var(--surface-2)',
                  width: 220,
                }}>
                  <Search style={{ width: 13, height: 13, color: 'var(--text-tertiary)', flexShrink: 0 }} />
                  <input
                    style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 12.5, color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}
                    placeholder="Search projects..."
                    value={ccSearch}
                    onChange={(e) => setCcSearch(e.target.value)}
                  />
                </div>

                {/* List / Tile toggle */}
                <div style={{
                  display: 'flex', alignItems: 'center',
                  height: 32, padding: 3,
                  borderRadius: 8,
                  border: '1px solid var(--border-2)',
                  background: 'var(--surface-2)',
                  gap: 2,
                }}>
                  {[{ id: 'list', icon: List, label: 'List' }, { id: 'tile', icon: Grid2x2, label: 'Tile' }].map(({ id, icon: Icon, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setCcView(id)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        height: 26, padding: '0 9px',
                        borderRadius: 6, border: 'none',
                        background: ccView === id ? '#FFE600' : 'transparent',
                        color: ccView === id ? '#1A1A24' : 'var(--text-tertiary)',
                        fontSize: 11.5, fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'background 100ms, color 100ms',
                        fontFamily: 'Inter, sans-serif',
                      }}
                    >
                      <Icon style={{ width: 12, height: 12 }} />
                      {label}
                    </button>
                  ))}
                </div>

                {/* New Project button */}
                <button
                  type="button"
                  onClick={() => setCcShowModal(true)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    height: 32, padding: '0 14px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,230,0,0.35)',
                    background: 'rgba(255,230,0,0.10)',
                    color: '#FFE600',
                    fontSize: 12, fontWeight: 700,
                    cursor: 'pointer', whiteSpace: 'nowrap',
                    fontFamily: 'Inter, sans-serif',
                    transition: 'background 100ms',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,230,0,0.18)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,230,0,0.10)'}
                >
                  <Plus style={{ width: 13, height: 13 }} />
                  New Project
                </button>

              </>

            ) : (
              /* ── Default right section (all other pages) ── */
              <>
                {/* Date badge */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '0 10px', height: 28,
                  background: 'var(--surface-2)', border: '1px solid var(--border-1)',
                  borderRadius: 'var(--r-md)', fontSize: 12, fontWeight: 500,
                  color: 'var(--text-secondary)',
                }}>
                  <CalendarCheck2 style={{ width: 12, height: 12 }} />
                  {now}
                </div>

                {/* Global search */}
                <div className="global-search hidden lg:block" style={{ width: 200 }}>
                  <Search className="global-search-icon" style={{ width: 12, height: 12 }} />
                  <input className="input h-[26px] text-[12px]" placeholder="Search..." />
                </div>

                {/* Notifications */}
                <NotificationCenter floating={false} />
              </>

            )}
          </div>
        </header>
        )}

        {/* Page content */}
        <div className="flex-1 min-h-0 overflow-auto relative" style={{ background: 'var(--surface-0)' }}>
          <Outlet context={{ setHeaderOverride }} />
        </div>
      </div>
    </div>
  )
}
