import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell, CheckCircle2, Clock3, XCircle, AlertTriangle,
  Info, CheckCheck, X,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useAuthStore } from '../store/authStore'
import { enterpriseAPI } from '../api'
import { normalizeRole } from '../utils/roles'

// ── Role-based action URLs ────────────────────────────────────
const ROLE_ROUTES = {
  admin:    { default: '/command-center',    exception: '/exception-workbench', workflow: '/close-certification', reconciliation: '/reconciliation-profiles' },
  preparer: { default: '/my-reconciliations', exception: '/my-reconciliations',  workflow: '/my-reconciliations',  reconciliation: '/my-reconciliations' },
  reviewer: { default: '/work-queue',         exception: '/work-queue',          workflow: '/work-queue',          reconciliation: '/work-queue' },
  approver: { default: '/approver-queue',     exception: '/approver-queue',      workflow: '/approver-queue',      reconciliation: '/reconciliation-profiles' },
  certifier:{ default: '/close-certification',exception: '/exception-workbench', workflow: '/close-certification', reconciliation: '/reconciliation-profiles' },
  auditor:  { default: '/audit',              exception: '/exception-workbench', workflow: '/audit',               reconciliation: '/reconciliation-profiles' },
}

// ── Map notification_type → icon + color + route key ─────────
function getNotifMeta(type, role) {
  const routes = ROLE_ROUTES[role] || ROLE_ROUTES.admin
  const map = {
    exception:      { icon: 'warn',    color: 'var(--warn)', label: 'Exception',    route: routes.exception },
    alert:          { icon: 'bad',     color: 'var(--bad)',  label: 'Alert',        route: routes.exception },
    workflow:       { icon: 'pending', color: 'var(--info)', label: 'Workflow',     route: routes.workflow },
    certification:  { icon: 'pending', color: 'var(--info)', label: 'Certification',route: routes.workflow },
    system:         { icon: 'info',    color: 'var(--accent)',label: 'System',      route: routes.default },
    success:        { icon: 'ok',      color: 'var(--ok)',   label: 'Success',      route: routes.default },
    reconciliation: { icon: 'ok',      color: 'var(--ok)',   label: 'Reconciliation',route: routes.reconciliation },
  }
  return map[type] || { icon: 'info', color: 'var(--accent)', label: 'Info', route: routes.default }
}

function NotifIcon({ iconType, color }) {
  const style = { width: 13, height: 13, color, flexShrink: 0, marginTop: 1 }
  if (iconType === 'warn')    return <AlertTriangle  {...{ style }} />
  if (iconType === 'bad')     return <XCircle        {...{ style }} />
  if (iconType === 'pending') return <Clock3         {...{ style }} />
  if (iconType === 'ok')      return <CheckCircle2   {...{ style }} />
  return                             <Info           {...{ style }} />
}

// ── Relative time ─────────────────────────────────────────────
function relativeTime(isoStr) {
  if (!isoStr) return ''
  const diff = (Date.now() - new Date(isoStr).getTime()) / 1000
  if (diff < 60)   return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ── Main component ────────────────────────────────────────────
export default function NotificationCenter({ floating = false }) {
  const navigate = useNavigate()
  const qc       = useQueryClient()
  const role     = normalizeRole(useAuthStore((s) => s.user?.role) || 'admin')

  const [open,          setOpen]          = useState(false)
  const [isPositioned,  setIsPositioned]  = useState(false)
  const [panelStyle,    setPanelStyle]    = useState({})
  const buttonRef = useRef(null)
  const panelRef  = useRef(null)

  // ── Fetch notifications ───────────────────────────────────
  const { data: payload } = useQuery({
    queryKey: ['notifications', role],
    queryFn: async () => {
      try { return await enterpriseAPI.listNotifications(20) }
      catch { return { items: [], unread_count: 0, total: 0 } }
    },
    refetchInterval: 15000,
  })

  const items        = payload?.items        || []
  const unreadCount  = payload?.unread_count ?? items.filter((i) => !i.is_read).length

  // ── Mark read ─────────────────────────────────────────────
  const markReadMutation = useMutation({
    mutationFn: (id) => enterpriseAPI.markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markAllReadMutation = useMutation({
    mutationFn: () => enterpriseAPI.markAllNotificationsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  // ── Position panel ────────────────────────────────────────
  useLayoutEffect(() => {
    if (!open) return
    const updatePosition = () => {
      if (!buttonRef.current) return
      const rect  = buttonRef.current.getBoundingClientRect()
      const vw    = window.innerWidth
      const vh    = window.innerHeight
      const panelH = panelRef.current?.offsetHeight || 380
      const w      = Math.min(320, Math.max(260, vw - 24))
      const left   = Math.max(12, Math.min(rect.right - w, vw - w - 12))
      const top    = Math.max(12, Math.min(rect.bottom + 6, vh - panelH - 12))
      setPanelStyle({ top: `${top}px`, left: `${left}px`, width: `${w}px` })
      setIsPositioned(true)
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  // ── Close on outside click ────────────────────────────────
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target) || buttonRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const handleNotifClick = (item) => {
    const meta = getNotifMeta(item.notification_type, role)
    const dest = item.action_url || meta.route
    if (!item.is_read) markReadMutation.mutate(item.id)
    navigate(dest)
    setOpen(false)
  }

  return (
    <div
      className={floating ? 'fixed z-[9998]' : 'relative z-[9998]'}
      style={floating ? { right: '20px', bottom: '16px' } : undefined}
    >
      {/* ── Bell button ───────────────────────────────────── */}
      <button
        ref={buttonRef}
        onClick={() => { setIsPositioned(false); setOpen((v) => !v) }}
        title="Notifications"
        style={{
          position: 'relative', width: 32, height: 32,
          borderRadius: 'var(--r-md)', border: '1px solid var(--border-2)',
          background: open ? 'var(--accent-subtle)' : 'var(--surface-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: open ? 'var(--accent)' : 'var(--text-secondary)',
          cursor: 'pointer', transition: 'background var(--dur-fast), color var(--dur-fast)',
        }}
        onMouseEnter={(e) => { if (!open) { e.currentTarget.style.background = 'var(--surface-3)'; e.currentTarget.style.color = 'var(--text-primary)' } }}
        onMouseLeave={(e) => { if (!open) { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
      >
        <Bell style={{ width: 14, height: 14 }} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -5, right: -5,
            minWidth: 16, height: 16, padding: '0 3px', borderRadius: 9999,
            background: '#FFE600', color: '#1A1A24',
            fontSize: 9, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1.5px solid var(--surface-0)',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* ── Panel ─────────────────────────────────────────── */}
      {open && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed', ...panelStyle,
            visibility: isPositioned ? 'visible' : 'hidden',
            background: 'var(--surface-2)',
            border: '1px solid var(--border-2)',
            borderTop: '2px solid #FFE600',
            borderRadius: 12,
            boxShadow: '0 24px 60px rgba(0,0,0,0.40)',
            zIndex: 9999, overflow: 'hidden',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '10px 14px', borderBottom: '1px solid var(--border-1)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                Notifications
              </p>
              {unreadCount > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 800,
                  background: '#FFE600', color: '#1A1A24',
                  borderRadius: 9999, padding: '1px 7px',
                }}>
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllReadMutation.mutate()}
                title="Mark all as read"
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 11, color: 'var(--text-tertiary)', background: 'none',
                  border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 5,
                  transition: 'color 100ms',
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}
              >
                <CheckCheck style={{ width: 11, height: 11 }} /> Mark all read
              </button>
            )}
          </div>

          {/* Items */}
          <div style={{ maxHeight: 340, overflowY: 'auto', padding: '6px 8px' }} className="slim-scroll">
            {items.length === 0 ? (
              <div style={{ padding: '28px 16px', textAlign: 'center' }}>
                <CheckCircle2 style={{ width: 24, height: 24, color: 'var(--ok)', margin: '0 auto 8px' }} />
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>You're all caught up</p>
              </div>
            ) : (
              items.map((item) => {
                const meta    = getNotifMeta(item.notification_type, role)
                const isUnread = !item.is_read
                return (
                  <div
                    key={item.id}
                    onClick={() => handleNotifClick(item)}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 9,
                      padding: '9px 10px',
                      borderRadius: 8, marginBottom: 3,
                      background: isUnread ? `${meta.color}0A` : 'var(--surface-3)',
                      border: `1px solid ${isUnread ? `${meta.color}22` : 'var(--border-0)'}`,
                      cursor: 'pointer',
                      transition: 'background 100ms',
                      position: 'relative',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = isUnread ? `${meta.color}18` : 'var(--surface-4)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = isUnread ? `${meta.color}0A` : 'var(--surface-3)'}
                  >
                    {/* Unread dot */}
                    {isUnread && (
                      <div style={{
                        position: 'absolute', top: 10, right: 10,
                        width: 6, height: 6, borderRadius: '50%',
                        background: meta.color,
                      }} />
                    )}

                    <NotifIcon iconType={meta.icon} color={meta.color} />

                    <div style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
                      {/* Title */}
                      <p style={{
                        margin: 0, fontSize: 12, fontWeight: isUnread ? 700 : 600,
                        color: 'var(--text-primary)', lineHeight: 1.35,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {item.title || meta.label}
                      </p>
                      {/* Message */}
                      {item.message && (
                        <p style={{
                          margin: '2px 0 0', fontSize: 11, color: 'var(--text-tertiary)',
                          lineHeight: 1.45,
                          display: '-webkit-box', WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }}>
                          {item.message}
                        </p>
                      )}
                      {/* Time + action */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                        <span style={{ fontSize: 10, color: 'var(--text-disabled)' }}>
                          {relativeTime(item.created_at)}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: meta.color }}>
                          View →
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          {items.length > 0 && (
            <div style={{
              padding: '8px 14px', borderTop: '1px solid var(--border-1)',
              display: 'flex', justifyContent: 'center',
            }}>
              <button
                onClick={() => { navigate(ROLE_ROUTES[role]?.default || '/command-center'); setOpen(false) }}
                style={{
                  fontSize: 11.5, fontWeight: 600, color: 'var(--text-tertiary)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: '2px 8px',
                  transition: 'color 100ms',
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}
              >
                View all notifications
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
