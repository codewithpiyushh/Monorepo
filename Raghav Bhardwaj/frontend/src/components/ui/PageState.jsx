import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react'

export function LoadingState({ message = 'Loading data…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 flex-1 py-16"
      style={{ color: 'var(--text-tertiary)' }}>
      <div style={{ position: 'relative', width: 32, height: 32 }}>
        <div className="animate-spin rounded-full"
          style={{ width: 32, height: 32, border: '2px solid var(--border-2)', borderTopColor: 'var(--accent)' }} />
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>{message}</p>
    </div>
  )
}

export function EmptyState({ title = 'No data', description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 flex-1 py-16">
      <div style={{
        width: 40, height: 40, borderRadius: 'var(--r-lg)',
        background: 'var(--surface-3)', border: '1px solid var(--border-1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Inbox style={{ width: 18, height: 18, color: 'var(--text-tertiary)' }} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>{title}</p>
        {description && (
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', maxWidth: 320 }}>{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}

export function ErrorState({ message = 'Something went wrong', onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 flex-1 py-16">
      <div style={{
        width: 40, height: 40, borderRadius: 'var(--r-lg)',
        background: 'var(--bad-bg)', border: '1px solid var(--bad-bdr)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <AlertTriangle style={{ width: 18, height: 18, color: 'var(--bad)' }} />
      </div>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{message}</p>
      {onRetry && (
        <button className="btn-secondary btn-sm" onClick={onRetry}>
          <RefreshCw style={{ width: 12, height: 12 }} />
          Retry
        </button>
      )}
    </div>
  )
}

// Legacy compat
export default function PageState({ loading, empty, emptyTitle, emptyDesc, error, onRetry, children }) {
  if (loading) return <LoadingState />
  if (error)   return <ErrorState message={error} onRetry={onRetry} />
  if (empty)   return <EmptyState title={emptyTitle} description={emptyDesc} />
  return children || null
}
