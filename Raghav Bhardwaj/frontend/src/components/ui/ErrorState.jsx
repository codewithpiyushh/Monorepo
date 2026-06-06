import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function ErrorState({ message = 'Something went wrong', onRetry }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '40px 20px', flex: 1 }}>
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
          <RefreshCw style={{ width: 12, height: 12 }} /> Retry
        </button>
      )}
    </div>
  )
}
