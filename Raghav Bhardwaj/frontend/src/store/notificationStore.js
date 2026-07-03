import { create } from 'zustand'
import toast from 'react-hot-toast'

/**
 * notificationStore.js — Phase 3 Chunk 5
 * Zustand store that manages the SSE connection + notification state.
 *
 * Usage:
 *   const { unreadCount, notifications, connect, disconnect } = useNotificationStore()
 *
 * Auto-connect is wired in App.jsx on login/logout.
 */

const TYPE_META = {
  sla_breach:          { icon: '🚨', color: '#FF4D4D' },
  escalation:          { icon: '⚡', color: '#FF4D4D' },
  approval_bottleneck: { icon: '⏰', color: '#FFE600' },
  workflow_action:     { icon: '🔄', color: '#4D94FF' },
  comment_mention:     { icon: '💬', color: '#4D94FF' },
  exception:           { icon: '⚠️', color: '#FFE600' },
  certification:       { icon: '✅', color: '#00C891' },
  fx_alert:            { icon: '💱', color: '#A78BFA' },
  system:              { icon: 'ℹ️', color: '#94A3B8' },
}

function getMeta(type) {
  return TYPE_META[type?.toLowerCase()] || TYPE_META.system
}

export const useNotificationStore = create((set, get) => ({
  // ── State ──────────────────────────────────────────────────────────────────
  notifications: [],   // recent notification objects (capped at 50)
  unreadCount:   0,
  isConnected:   false,
  _es:           null, // EventSource instance
  _retries:      0,
  _retryTimer:   null,

  // ── Connect ────────────────────────────────────────────────────────────────
  connect: () => {
    const token = localStorage.getItem('drms_token')
    if (!token) return
    if (get()._es) return  // already connected

    const base = '/api'
    const url  = `${base}/v1/notifications/stream?token=${encodeURIComponent(token)}`
    const es   = new EventSource(url)

    es.addEventListener('connected', () => {
      set({ isConnected: true, _retries: 0 })
    })

    es.addEventListener('notification', (e) => {
      try {
        const notif = JSON.parse(e.data)
        const meta  = getMeta(notif.notification_type)

        // Add to front of list, cap at 50
        set(state => ({
          notifications: [notif, ...state.notifications].slice(0, 50),
          unreadCount:   state.unreadCount + 1,
        }))

        // Toast popup
        toast(
          (t) => (
            `${meta.icon} ${notif.title}`
          ),
          {
            duration: 5000,
            style: {
              background:  'var(--surface-2, #1A1A2E)',
              color:       'var(--text-primary, #F1F5F9)',
              border:      `1px solid ${meta.color}44`,
              borderLeft:  `3px solid ${meta.color}`,
              borderRadius: '10px',
              fontSize:    '13px',
              maxWidth:    '380px',
              padding:     '10px 14px',
            },
          }
        )
      } catch (err) {
        console.warn('[SSE] Parse error:', err)
      }
    })

    es.addEventListener('heartbeat', () => { /* keep-alive — no-op */ })

    es.onerror = () => {
      es.close()
      set({ _es: null, isConnected: false })

      const retries = get()._retries
      if (retries < 6) {
        const delay = Math.min(5000 * (retries + 1), 30000) // max 30 s
        set({ _retries: retries + 1 })
        const timer = setTimeout(() => get().connect(), delay)
        set({ _retryTimer: timer })
      } else {
        console.warn('[SSE] Max retries reached — SSE disabled. Refresh page to reconnect.')
      }
    }

    set({ _es: es })
  },

  // ── Disconnect ─────────────────────────────────────────────────────────────
  disconnect: () => {
    const { _es, _retryTimer } = get()
    if (_es)        _es.close()
    if (_retryTimer) clearTimeout(_retryTimer)
    set({
      _es: null, _retryTimer: null,
      isConnected: false,
      notifications: [], unreadCount: 0,
      _retries: 0,
    })
  },

  // ── Local state mutations (called after API actions) ───────────────────────
  markRead: (id) => {
    set(state => ({
      notifications: state.notifications.map(n =>
        n.id === id ? { ...n, is_read: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }))
  },

  markAllRead: () => {
    set(state => ({
      notifications: state.notifications.map(n => ({ ...n, is_read: true })),
      unreadCount:   0,
    }))
  },

  dismiss: (id) => {
    set(state => ({
      notifications: state.notifications.filter(n => n.id !== id),
      unreadCount:   Math.max(
        0,
        state.unreadCount - (state.notifications.find(n => n.id === id && !n.is_read) ? 1 : 0),
      ),
    }))
  },

  setUnreadCount: (count) => set({ unreadCount: count }),

  prependNotifications: (items) => {
    set(state => ({
      notifications: [...items, ...state.notifications].slice(0, 50),
    }))
  },
}))
