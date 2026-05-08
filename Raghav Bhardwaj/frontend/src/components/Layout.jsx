import { useEffect, useState } from 'react'
import { Outlet, NavLink, matchPath, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'
import clsx from 'clsx'
import NotificationCenter from './NotificationCenter'
import {
  Scale,
  FolderOpen,
  ScrollText,
  LogOut,
  User,
  Workflow,
  Sun,
  Moon,
  Link,
  ShieldCheck,
  Play,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, clearAuth } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('drms_sidebar_collapsed') === '1')

  const workflowMatch = matchPath('/projects/:projectId/:section', location.pathname)
  const activeProjectId = workflowMatch?.params?.projectId || null

  const role = (user?.role || '').toLowerCase()

  const navItems = [
    { to: '/', label: 'Projects', icon: FolderOpen, end: true, show: true },
    { to: '/audit', label: 'Audit Logs', icon: ScrollText, show: true },
  ].filter((item) => item.show)

  useEffect(() => {
    document.documentElement.classList.toggle('theme-light', theme === 'light')
  }, [theme])

  useEffect(() => {
    localStorage.setItem('drms_sidebar_collapsed', sidebarCollapsed ? '1' : '0')
  }, [sidebarCollapsed])

  const handleLogout = () => {
    clearAuth()
    navigate('/login')
  }

  const workflowItems = activeProjectId
    ? [
        { to: `/projects/${activeProjectId}/ingestion`, label: 'Ingestion', icon: FolderOpen, show: role === 'admin' },
        { to: `/projects/${activeProjectId}/mapping`, label: 'Auto Mapping', icon: Link, show: role === 'admin' },
        { to: `/projects/${activeProjectId}/rules`, label: 'Matching Rules', icon: ShieldCheck, show: role === 'admin' },
        { to: `/projects/${activeProjectId}/results`, label: 'Workspace', icon: Play, show: role === 'admin' },
        { to: `/projects/${activeProjectId}/preparer`, label: 'Preparer Workspace', icon: User, show: role === 'preparer' },
        { to: `/projects/${activeProjectId}/reviewer`, label: 'Reviewer Workspace', icon: User, show: role === 'reviewer' },
      ].filter((item) => item.show)
    : []

  const getNavClasses = (active) =>
    clsx(
      'sidebar-nav-item flex items-center rounded-lg text-sm transition-colors',
      sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2',
      active
        ? 'sidebar-nav-item-active text-white font-medium'
        : 'text-slate-200 hover:text-white'
    )

  return (
    <div className="h-screen w-screen p-0">
      <div className="premium-shell flex h-full w-full overflow-hidden">
        <aside
          className={clsx(
            'relative premium-sidebar sidebar-designer flex-shrink-0 border-r border-surface-700 flex flex-col transition-all duration-200',
            sidebarCollapsed ? 'w-[88px]' : 'w-[286px]'
          )}
        >
          <div className={clsx('h-16 border-b border-surface-700/50 relative', sidebarCollapsed ? 'px-2' : 'px-5')}>
            <div className={clsx('h-full flex items-center', sidebarCollapsed ? 'justify-center' : 'justify-between')}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border border-brand-600/40 bg-brand-900/20">
                  <Scale className="w-5 h-5 text-slate-100" />
                </div>
                {!sidebarCollapsed && (
                  <div>
                    <p className="text-sm font-bold text-slate-100 leading-none">DRMS</p>
                    <p className="text-[11px] text-slate-400 leading-none mt-1">Reconciliation</p>
                  </div>
                )}
              </div>
              {!sidebarCollapsed && (
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  className="sidebar-collapse-btn"
                  title="Collapse sidebar"
                >
                  <ChevronsLeft className="w-4 h-4 text-slate-600" />
                </button>
              )}
              {sidebarCollapsed && (
                <button
                  onClick={() => setSidebarCollapsed(false)}
                  className="sidebar-collapse-btn absolute top-4 -right-3"
                  title="Expand sidebar"
                >
                  <ChevronsRight className="w-4 h-4 text-slate-600" />
                </button>
              )}
            </div>
          </div>

          <nav className="flex-1 py-4 px-3 space-y-1 overflow-auto">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => {
                  const projectFlowActive = to === '/' && location.pathname.startsWith('/projects/')
                  const active = isActive || projectFlowActive
                  return getNavClasses(active)
                }}
                title={sidebarCollapsed ? label : undefined}
              >
                <Icon className="w-4 h-4" />
                {!sidebarCollapsed && label}
              </NavLink>
            ))}

            {activeProjectId && (
              <div className="pt-4 mt-4 border-t border-surface-700/70 space-y-1">
                {!sidebarCollapsed && (
                  <p className="px-3 pb-1 text-[10px] uppercase tracking-[0.12em] text-slate-400 flex items-center gap-2">
                    <Workflow className="w-3 h-3" />
                    Project Flow
                  </p>
                )}
                {workflowItems.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) => getNavClasses(isActive)}
                    title={sidebarCollapsed ? label : undefined}
                  >
                    <Icon className="w-4 h-4" />
                    {!sidebarCollapsed && label}
                  </NavLink>
                ))}
              </div>
            )}
          </nav>

          <div className="p-3 border-t border-surface-700/50">
            {sidebarCollapsed ? (
              <button
                onClick={toggleTheme}
                className="theme-toggle theme-toggle-collapsed"
                title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Theme`}
              >
                {theme === 'dark' ? (
                  <Moon className="w-4 h-4 text-slate-300" />
                ) : (
                  <Sun className="w-4 h-4 text-amber-500" />
                )}
              </button>
            ) : (
              <button
                onClick={toggleTheme}
                className="theme-toggle"
              >
                <div className="flex items-center gap-2">
                  {theme === 'dark' ? (
                    <Moon className="w-4 h-4 text-slate-300" />
                  ) : (
                    <Sun className="w-4 h-4 text-amber-500" />
                  )}
                  <span className="text-xs font-semibold text-slate-200">Theme</span>
                </div>
                <span
                  className={clsx(
                    'theme-toggle-track',
                    theme === 'dark' ? 'theme-toggle-track-dark' : 'theme-toggle-track-light'
                  )}
                >
                  <span
                    className={clsx(
                      'theme-toggle-thumb',
                      theme === 'dark' ? 'theme-toggle-thumb-dark' : 'theme-toggle-thumb-light'
                    )}
                  />
                </span>
              </button>
            )}

            <div className={clsx('flex items-center px-2 py-2 rounded-lg', sidebarCollapsed ? 'justify-center' : 'gap-2')}>
              <div className="w-7 h-7 rounded-full bg-surface-700/60 flex items-center justify-center flex-shrink-0">
                <User className="w-3.5 h-3.5 text-slate-300" />
              </div>
              {!sidebarCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-200 truncate">{user?.username}</p>
                  <p className="text-[10px] text-slate-500 capitalize">{user?.role}</p>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="text-slate-500 hover:text-red-400 transition-colors"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </aside>

        <main className="premium-main flex-1 min-w-0 overflow-auto bg-surface-900 relative">
          <NotificationCenter floating />
          <Outlet />
        </main>
      </div>
    </div>
  )
}
