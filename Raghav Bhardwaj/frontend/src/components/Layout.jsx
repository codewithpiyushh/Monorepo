import { useEffect, useMemo, useState } from 'react'
import { Outlet, NavLink, matchPath, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  AlertTriangle,
  BarChart3,
  CalendarCheck2,
  ChevronsLeft,
  ChevronsRight,
  Command,
  FolderOpen,
  Link,
  LogOut,
  Moon,
  Play,
  PlaySquare,
  Repeat,
  Scale,
  Shield,
  ShieldCheck,
  Sun,
  ShieldAlert,
  User,
  Workflow,
} from 'lucide-react'
import NotificationCenter from './NotificationCenter'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'
import { authAPI, projectsAPI } from '../api'
import { normalizeRole } from '../utils/roles'
import { useProjectStore } from '../store/projectStore'

const PAGE_TITLES = {
  '/command-center': 'Reconciliation Command Center',
  '/executive-dashboard': 'Executive Overview',
  '/reconciliation-runs': 'Auto Reconciliation',
  '/exception-ops': 'Transaction Matching',
  '/exception-investigation': 'Exception Investigation',
  '/analytics-explorer': 'Reconciliation Compliance',
  '/risk-dashboard': 'Risk & Compliance Dashboard',
  '/close-certification': 'Period Close Monitor',
  '/controls-governance': 'Policy & Controls Studio',
  '/platform-admin': 'Application Administration',
  '/admin': 'Admin Operations',
}

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, clearAuth, setAuth } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()
  const { selectedProjectId, setSelectedProjectId } = useProjectStore()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('drms_sidebar_collapsed') === '1')
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: projectsAPI.list })

  const workflowMatch = matchPath('/projects/:projectId/:section', location.pathname)
  const activeProjectId = workflowMatch?.params?.projectId || null
  const role = normalizeRole(user?.role)

  const navGroups = [
    {
      title: 'Operate',
      items: [
        { to: '/command-center', label: 'Reconciliation Command Center', icon: Command, end: true, show: true },
        { to: '/reconciliation-runs', label: 'Auto Reconciliation', icon: PlaySquare, show: true },
        { to: '/exception-ops', label: 'Transaction Matching', icon: AlertTriangle, show: true },
        { to: '/analytics-explorer', label: 'Reconciliation Compliance', icon: BarChart3, show: role === 'admin' || role === 'preparer' },
      ],
    },
    {
      title: 'Analyze',
      items: [
        { to: '/executive-dashboard', label: 'Executive Overview', icon: BarChart3, show: role === 'admin' || role === 'reviewer' },
        { to: '/risk-dashboard', label: 'Risk & Compliance Dashboard', icon: ShieldAlert, show: role === 'admin' || role === 'reviewer' },
      ],
    },
    {
      title: 'Control',
      items: [
        { to: '/close-certification', label: 'Period Close Monitor', icon: CalendarCheck2, show: true },
        { to: '/controls-governance', label: 'Policy & Controls Studio', icon: ShieldCheck, show: role === 'admin' || role === 'reviewer' },
        { to: '/admin', label: 'Admin Operations', icon: Shield, show: role === 'admin' || role === 'reviewer' },
      ],
    },
  ]

  const workflowItems = activeProjectId
    ? [
        { to: `/projects/${activeProjectId}/ingestion`, label: 'Ingestion', icon: FolderOpen, show: role === 'admin' },
        { to: `/projects/${activeProjectId}/mapping`, label: 'Auto Mapping', icon: Link, show: role === 'admin' },
        { to: `/projects/${activeProjectId}/rules`, label: 'Matching Rules', icon: ShieldCheck, show: role === 'admin' },
        { to: `/projects/${activeProjectId}/results`, label: 'Workbench', icon: Play, show: role === 'admin' },
        { to: `/projects/${activeProjectId}/preparer`, label: 'Preparer Workbench', icon: User, show: role === 'preparer' },
        { to: `/projects/${activeProjectId}/reviewer`, label: 'Reviewer Workbench', icon: User, show: role === 'reviewer' },
      ].filter((item) => item.show)
    : []

  const currentTitle = useMemo(() => {
    if (location.pathname.startsWith('/projects/')) return 'Reconciliation Process'
    if (location.pathname.startsWith('/exception-investigation')) return 'Exception Investigation'
    return PAGE_TITLES[location.pathname] || 'Workbench'
  }, [location.pathname])

  useEffect(() => {
    document.documentElement.classList.toggle('theme-light', theme === 'light')
  }, [theme])

  useEffect(() => {
    localStorage.setItem('drms_sidebar_collapsed', sidebarCollapsed ? '1' : '0')
  }, [sidebarCollapsed])

  useEffect(() => {
    if (activeProjectId && String(activeProjectId) !== String(selectedProjectId || '')) {
      setSelectedProjectId(String(activeProjectId))
    }
  }, [activeProjectId, selectedProjectId, setSelectedProjectId])

  useEffect(() => {
    if (!selectedProjectId && projects.length) {
      setSelectedProjectId(String(projects[0].id))
    }
  }, [projects, selectedProjectId, setSelectedProjectId])

  const handleLogout = () => {
    clearAuth()
    navigate('/login')
  }

  const handleSwitchUser = async () => {
    if (!import.meta.env.DEV) return
    const switchSequence = [
      { role: 'admin', username: 'admin', password: 'admin123' },
      { role: 'preparer', username: 'preparer', password: 'preparer123' },
      { role: 'reviewer', username: 'reviewer', password: 'reviewer123' },
    ]
    const currentRole = (user?.role || 'admin').toLowerCase()
    const currentIndex = switchSequence.findIndex((entry) => entry.role === currentRole)
    const target = switchSequence[(currentIndex + 1 + switchSequence.length) % switchSequence.length]
    try {
      const data = await authAPI.login(target.username, target.password)
      setAuth(data.user, data.access_token)
      navigate('/command-center')
    } catch {
      clearAuth()
      navigate('/login')
    }
  }

  const getNavClasses = (active) =>
    clsx(
      'sidebar-nav-item flex items-center text-sm transition-colors',
      sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
      active ? 'sidebar-nav-item-active text-white font-semibold' : 'text-slate-200 hover:text-white'
    )

  return (
    <div className="h-screen w-screen p-3">
      <div className="premium-shell flex h-full w-full overflow-hidden rounded-2xl border border-surface-700/70">
        <aside
          className={clsx(
            'premium-sidebar relative flex-shrink-0 border-r border-surface-700/60 flex flex-col transition-all duration-200',
            sidebarCollapsed ? 'w-[92px]' : 'w-[294px]'
          )}
        >
          <div className={clsx('h-[74px] border-b border-surface-700/60 relative', sidebarCollapsed ? 'px-2' : 'px-5')}>
            <div className={clsx('h-full flex items-center', sidebarCollapsed ? 'justify-center' : 'justify-between')}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border border-brand-600/40 bg-brand-900/20">
                  <Scale className="w-5 h-5 text-slate-100" />
                </div>
                {!sidebarCollapsed && (
                  <div>
                    <p className="text-sm font-bold text-slate-100 leading-none">DRMS Platform</p>
                    <p className="text-[11px] text-slate-400 leading-none mt-1">Enterprise Reconciliation</p>
                  </div>
                )}
              </div>
              {!sidebarCollapsed ? (
                <button onClick={() => setSidebarCollapsed(true)} className="sidebar-collapse-btn" title="Collapse sidebar">
                  <ChevronsLeft className="w-4 h-4 text-slate-400" />
                </button>
              ) : (
                <button onClick={() => setSidebarCollapsed(false)} className="sidebar-collapse-btn absolute top-5 -right-3" title="Expand sidebar">
                  <ChevronsRight className="w-4 h-4 text-slate-400" />
                </button>
              )}
            </div>
          </div>

          <nav className="flex-1 py-4 px-3 space-y-3 overflow-auto">
            {navGroups.map((group) => {
              const visible = group.items.filter((item) => item.show)
              if (!visible.length) return null
              return (
                <div key={group.title} className="space-y-1">
                  {!sidebarCollapsed && <p className="px-3 pb-1 text-[10px] uppercase tracking-[0.13em] text-slate-500">{group.title}</p>}
                  {visible.map(({ to, label, icon: Icon, end }) => (
                    <NavLink key={to} to={to} end={end} className={({ isActive }) => getNavClasses(isActive)} title={sidebarCollapsed ? label : undefined}>
                      <Icon className="w-4 h-4" />
                      {!sidebarCollapsed && label}
                    </NavLink>
                  ))}
                </div>
              )
            })}

            {activeProjectId && (
              <div className="pt-3 mt-3 border-t border-surface-700/70 space-y-1">
                {!sidebarCollapsed && (
                  <p className="px-3 pb-1 text-[10px] uppercase tracking-[0.13em] text-slate-500 flex items-center gap-2">
                    <Workflow className="w-3 h-3" />
                    Reconciliation Process
                  </p>
                )}
                {workflowItems.map(({ to, label, icon: Icon }) => (
                  <NavLink key={to} to={to} className={({ isActive }) => getNavClasses(isActive)} title={sidebarCollapsed ? label : undefined}>
                    <Icon className="w-4 h-4" />
                    {!sidebarCollapsed && label}
                  </NavLink>
                ))}
              </div>
            )}
          </nav>

          <div className="p-3 border-t border-surface-700/60">
            {sidebarCollapsed ? (
              <button onClick={toggleTheme} className="theme-toggle theme-toggle-collapsed" title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Theme`}>
                {theme === 'dark' ? <Moon className="w-4 h-4 text-slate-300" /> : <Sun className="w-4 h-4 text-amber-500" />}
              </button>
            ) : (
              <button onClick={toggleTheme} className="theme-toggle">
                <div className="flex items-center gap-2">
                  {theme === 'dark' ? <Moon className="w-4 h-4 text-slate-300" /> : <Sun className="w-4 h-4 text-amber-500" />}
                  <span className="text-xs font-semibold text-slate-200">Theme</span>
                </div>
                <span className={clsx('theme-toggle-track', theme === 'dark' ? 'theme-toggle-track-dark' : 'theme-toggle-track-light')}>
                  <span className={clsx('theme-toggle-thumb', theme === 'dark' ? 'theme-toggle-thumb-dark' : 'theme-toggle-thumb-light')} />
                </span>
              </button>
            )}

            <div className={clsx('flex items-center px-2 py-2 rounded-lg border border-surface-700/70 bg-surface-900/40', sidebarCollapsed ? 'justify-center' : 'gap-2')}>
              <div className="w-7 h-7 rounded-full bg-surface-700/60 flex items-center justify-center flex-shrink-0">
                <User className="w-3.5 h-3.5 text-slate-300" />
              </div>
              {!sidebarCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-200 truncate">{user?.username}</p>
                  <p className="text-[10px] text-slate-500 capitalize">{user?.role}</p>
                </div>
              )}
              <div className={clsx('flex items-center', sidebarCollapsed ? 'gap-1' : 'gap-2')}>
                <button onClick={handleSwitchUser} className="text-slate-500 hover:text-blue-300 transition-colors" title="Switch user" disabled={!import.meta.env.DEV}>
                  <Repeat className="w-3.5 h-3.5" />
                </button>
                <button onClick={handleLogout} className="text-slate-500 hover:text-red-400 transition-colors" title="Sign out">
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </aside>

        <main className="premium-main flex-1 min-w-0 overflow-auto relative">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-48 bg-[radial-gradient(800px_180px_at_75%_0%,rgba(60,130,246,0.20),transparent),radial-gradient(700px_200px_at_12%_0%,rgba(47,187,127,0.14),transparent)]" />
          <div className="relative z-10 h-full flex flex-col">
            <div className="h-[74px] px-6 border-b border-surface-700/60 backdrop-blur-xl flex items-center justify-between" style={{ background: 'color-mix(in srgb, var(--header-bg) 82%, transparent)' }}>
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Workbench</p>
                <p className="text-base font-semibold text-slate-100">{currentTitle}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden md:flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Project</span>
                  <select className="input h-9 py-1 min-w-[220px]" value={selectedProjectId || ''} onChange={(e) => setSelectedProjectId(e.target.value)}>
                    {!projects.length ? <option value="">No projects</option> : null}
                    {projects.map((project) => <option key={project.id} value={String(project.id)}>{project.name} (#{project.id})</option>)}
                  </select>
                </div>
                <NotificationCenter floating={false} />
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
