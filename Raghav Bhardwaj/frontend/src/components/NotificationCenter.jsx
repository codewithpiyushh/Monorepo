import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bell, CheckCircle2, Clock3, XCircle } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { enterpriseAPI } from '../api'

const fallbackTemplates = {
  admin: [{ id: 'a1', type: 'info', text: 'No active workflow notifications.' }],
  preparer: [{ id: 'p1', type: 'info', text: 'No active workflow notifications.' }],
  reviewer: [{ id: 'r1', type: 'info', text: 'No active workflow notifications.' }],
}

function ItemIcon({ type }) {
  if (type === 'pending') return <Clock3 className="w-3.5 h-3.5 text-amber-300" />
  if (type === 'reject') return <XCircle className="w-3.5 h-3.5 text-rose-300" />
  return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
}

export default function NotificationCenter({ floating = false }) {
  const role = (useAuthStore((s) => s.user?.role) || 'admin').toLowerCase()
  const [open, setOpen] = useState(false)
  const { data: exceptions = [] } = useQuery({
    queryKey: ['notifications-exceptions', role],
    queryFn: () => {
      if (role === 'preparer') return enterpriseAPI.listExceptions('actionable_preparer')
      if (role === 'reviewer') return enterpriseAPI.listExceptions('actionable_reviewer')
      return enterpriseAPI.listExceptions('')
    },
    refetchInterval: 5000,
  })

  const items = useMemo(() => {
    if (!Array.isArray(exceptions)) return fallbackTemplates[role] || fallbackTemplates.admin
    const byQueue = exceptions.reduce((acc, row) => {
      const key = row?.queue_type || 'unknown'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    const byStatus = exceptions.reduce((acc, row) => {
      const key = row?.status || 'unknown'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})

    if (role === 'preparer') {
      return [
        {
          id: 'prep-action',
          type: 'pending',
          text: `${exceptions.length} transactions need preparer action (unresolved/assigned).`,
        },
        {
          id: 'prep-submit',
          type: 'info',
          text: `${byStatus.UNDER_REVIEW || 0} submitted cases are under reviewer check.`,
        },
      ]
    }
    if (role === 'reviewer') {
      return [
        {
          id: 'rev-review',
          type: 'pending',
          text: `${(byQueue.exception || 0) + (byQueue.escalated || 0)} items are waiting for review/escalation.`,
        },
        {
          id: 'rev-reject',
          type: 'reject',
          text: `${byStatus.REJECTED || 0} items are rejected and may need rework communication.`,
        },
      ]
    }
    return [
      {
        id: 'adm-open',
        type: 'pending',
        text: `${exceptions.length} total open workflow exceptions across queues.`,
      },
      {
        id: 'adm-progress',
        type: 'info',
        text: `${byStatus.UNDER_REVIEW || 0} in review, ${byStatus.APPROVED || 0} approved, ${byStatus.REJECTED || 0} rejected.`,
      },
    ]
  }, [exceptions, role])
  const badgeCount = useMemo(() => {
    if (!Array.isArray(exceptions)) return 0
    if (role === 'preparer') {
      return exceptions.filter((row) => ['unresolved', 'assigned'].includes(row?.queue_type)).length
    }
    if (role === 'reviewer') {
      return exceptions.filter((row) => ['exception', 'escalated'].includes(row?.queue_type) || row?.status === 'UNDER_REVIEW').length
    }
    return exceptions.length
  }, [exceptions, role])

  return (
    <div
      className={floating ? 'fixed z-40' : 'relative'}
      style={floating ? { right: '20px', bottom: '16px' } : undefined}
    >
      <button
        className="relative w-9 h-9 rounded-lg border border-surface-700 bg-surface-900/80 flex items-center justify-center text-slate-300 hover:text-white"
        onClick={() => setOpen((v) => !v)}
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-600 text-white text-[10px] flex items-center justify-center">
          {badgeCount}
        </span>
      </button>
      {open && (
        <div className={`absolute right-0 w-80 max-w-[85vw] rounded-xl border border-surface-700 bg-surface-900 shadow-2xl z-30 ${floating ? 'bottom-full mb-2' : 'mt-2'}`}>
          <div className="px-3 py-2 border-b border-surface-700 text-xs text-slate-300 font-semibold">
            Notifications ({badgeCount})
          </div>
          <div className="max-h-72 overflow-auto p-2 space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex items-start gap-2 rounded-lg border border-surface-700/80 p-2">
                <ItemIcon type={item.type} />
                <p className="text-xs text-slate-300">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
