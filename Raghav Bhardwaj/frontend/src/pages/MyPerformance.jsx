import { useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import PageHeader from '../components/ui/PageHeader'

export default function MyPerformance() {
  const user = useAuthStore((s) => s.user)
  const role = (user?.role || 'User').toLowerCase()

  const subtitle = useMemo(() => {
    if (role === 'preparer') {
      return 'View your personal task metrics, completion status, and assigned reconciliation workload.'
    }
    return 'A personal view of your reconciliation performance and recent activity.'
  }, [role])

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="My Performance"
        subtitle={subtitle}
        badge={(user?.role || 'user').toUpperCase()}
      />
      <div className="flex-1 overflow-auto p-8">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="card p-6 space-y-3 bg-surface-800 border border-surface-700">
            <p className="text-sm text-slate-400">Tasks Completed</p>
            <p className="text-3xl font-semibold text-white">--</p>
            <p className="text-xs text-slate-500">Your completed reconciliation activities will appear here.</p>
          </div>
          <div className="card p-6 space-y-3 bg-surface-800 border border-surface-700">
            <p className="text-sm text-slate-400">Pending Work</p>
            <p className="text-3xl font-semibold text-white">--</p>
            <p className="text-xs text-slate-500">Pending items assigned to you are shown in your worklist.</p>
          </div>
          <div className="card p-6 space-y-3 bg-surface-800 border border-surface-700">
            <p className="text-sm text-slate-400">Average Response</p>
            <p className="text-3xl font-semibold text-white">--</p>
            <p className="text-xs text-slate-500">Your overall turnaround metrics will be available here.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
