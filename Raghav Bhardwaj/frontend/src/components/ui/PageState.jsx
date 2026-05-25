import { AlertTriangle, Inbox, Loader2 } from 'lucide-react'

export function LoadingState({ label = 'Loading...' }) {
  return (
    <div className="min-h-[260px] rounded-xl border border-surface-700 bg-surface-800/40 p-5">
      <div className="mb-4 flex items-center gap-3 text-sm text-slate-300">
        <Loader2 className="h-4 w-4 animate-spin text-brand-400" />
        {label}
      </div>
      <div className="space-y-2">
        <div className="h-8 animate-pulse rounded-md bg-surface-700/40" />
        <div className="h-8 animate-pulse rounded-md bg-surface-700/30" />
        <div className="h-8 animate-pulse rounded-md bg-surface-700/40" />
        <div className="h-8 animate-pulse rounded-md bg-surface-700/30" />
      </div>
    </div>
  )
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-surface-600 bg-surface-800/40 p-8 text-center">
      <div className="mb-4 rounded-2xl border border-surface-600 bg-surface-800 p-4">
        <Inbox className="h-7 w-7 text-slate-500" />
      </div>
      <h3 className="text-base font-semibold text-slate-100">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-slate-400">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export function ErrorState({ title = 'Something went wrong', description = 'Please retry in a moment.', action }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-red-900/40 bg-red-950/10 p-8 text-center">
      <div className="mb-4 rounded-2xl border border-red-800/40 bg-red-900/20 p-4">
        <AlertTriangle className="h-7 w-7 text-red-300" />
      </div>
      <h3 className="text-base font-semibold text-slate-100">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-slate-400">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
