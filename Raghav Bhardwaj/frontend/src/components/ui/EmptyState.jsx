import { Inbox } from 'lucide-react'

export default function EmptyState({ title = 'No data', description, icon: Icon = Inbox, action }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '40px 20px', flex: 1 }}>
      <div style={{
        width: 40, height: 40, borderRadius: 'var(--r-lg)',
        background: 'var(--surface-3)', border: '1px solid var(--border-1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon style={{ width: 18, height: 18, color: 'var(--text-tertiary)' }} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>{title}</p>
        {description && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', maxWidth: 320 }}>{description}</p>}
      </div>
      {action}
    </div>
  )
}
