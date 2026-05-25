import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bell, CheckCircle2, Clock3, XCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useAuthStore } from '../store/authStore'
import { enterpriseAPI } from '../api'
import { normalizeRole } from '../utils/roles'

const fallbackTemplates = {
  admin: [{ id: 'a1', type: 'info', text: 'No active workflow notifications.', action: null }],
  preparer: [{ id: 'p1', type: 'info', text: 'No active workflow notifications.', action: null }],
  reviewer: [{ id: 'r1', type: 'info', text: 'No active workflow notifications.', action: null }],
}

function ItemIcon({ type }) {
  if (type === 'pending') return <Clock3 className="w-3.5 h-3.5 text-amber-300" />
  if (type === 'reject') return <XCircle className="w-3.5 h-3.5 text-rose-300" />
  return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
}

export default function NotificationCenter({ floating = false }) {
  const navigate = useNavigate()
  const role = normalizeRole(useAuthStore((s) => s.user?.role) || 'admin')
  const [open, setOpen] = useState(false)
  const [isPositioned, setIsPositioned] = useState(false)
  const [panelStyle, setPanelStyle] = useState({})
  const buttonRef = useRef(null)
  const panelRef = useRef(null)
  const { data: notificationPayload } = useQuery({
    queryKey: ['notifications', role],
    queryFn: () => enterpriseAPI.listNotifications(12),
    refetchInterval: 5000,
  })
  const itemsFromApi = notificationPayload?.items
  const notificationCount = notificationPayload?.count

  const items = useMemo(() => {
    if (Array.isArray(itemsFromApi) && itemsFromApi.length > 0) {
      return itemsFromApi.map((item) => ({
        ...item,
        action: item.action || (item.type === 'info' ? null : 'Open queue'),
      }))
    }
    return fallbackTemplates[role] || fallbackTemplates.admin
  }, [itemsFromApi, role])

  const badgeCount = useMemo(() => {
    if (typeof notificationCount === 'number') return notificationCount
    return items.length
  }, [notificationCount, items.length])

  useLayoutEffect(() => {
    if (!open) return

    const updatePosition = () => {
      if (!buttonRef.current) return
      const rect = buttonRef.current.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const panelHeight = panelRef.current?.offsetHeight || 340
      const desiredWidth = Math.min(320, Math.max(260, viewportWidth - 24))
      const left = Math.max(12, Math.min(rect.left - desiredWidth - 8, viewportWidth - desiredWidth - 12))
      const top = Math.max(12, Math.min(rect.top, viewportHeight - panelHeight - 12))
      setPanelStyle({ top: `${top}px`, left: `${left}px`, width: `${desiredWidth}px` })
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

  useEffect(() => {
    if (!open) return
    const onDocPointerDown = (event) => {
      const target = event.target
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocPointerDown)
    return () => document.removeEventListener('mousedown', onDocPointerDown)
  }, [open])

  return (
    <div
      className={floating ? 'fixed z-[9998]' : 'relative z-[9998]'}
      style={floating ? { right: '20px', bottom: '16px' } : undefined}
    >
      <button
        ref={buttonRef}
        className="relative z-10 w-9 h-9 rounded-lg border border-surface-700 bg-surface-900/80 flex items-center justify-center text-slate-300 hover:text-white"
        onClick={() => {
          setIsPositioned(false)
          setOpen((v) => !v)
        }}
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-600 text-white text-[10px] flex items-center justify-center">
          {badgeCount}
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed rounded-xl border border-surface-700 bg-surface-900 shadow-2xl z-[9999] overflow-hidden"
            style={{
              ...panelStyle,
              visibility: isPositioned ? 'visible' : 'hidden',
            }}
          >
            <div className="px-3 py-2 border-b border-surface-700 text-xs text-slate-300 font-semibold">
              Notifications ({badgeCount})
            </div>
            <div className="max-h-72 overflow-auto p-2 space-y-2">
              {items.map((item) => (
                <div key={item.id} className="flex items-start gap-2 rounded-lg border border-surface-700/80 p-2">
                  <ItemIcon type={item.type} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-300">{item.text}</p>
                    {item.action ? (
                      <button
                        className="mt-1 text-[11px] text-brand-300 hover:text-brand-200"
                        onClick={() => {
                          if (role === 'preparer' || role === 'reviewer') navigate('/work-queue')
                          else navigate('/admin')
                          setOpen(false)
                        }}
                      >
                        {item.action}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
