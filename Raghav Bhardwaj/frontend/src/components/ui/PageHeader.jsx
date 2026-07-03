export default function PageHeader({ title, subtitle, badge, actions, children, tabs, activeTab, onTabChange }) {
  return (
    <div style={{ flexShrink: 0, background: 'var(--surface-1)', borderBottom: '1px solid var(--border-1)' }}>
      {/* Title row */}
      <div style={{
        padding: '24px 32px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        borderBottom: tabs ? '1px solid var(--border-0)' : 'none',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
              margin: 0,
              lineHeight: 1.2,
            }}>
              {title}
            </h1>
            {badge && (
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                height: 20, padding: '0 7px',
                fontSize: 10, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                background: 'var(--accent-subtle)',
                color: 'var(--accent)',
                border: '1px solid var(--accent-border)',
                borderRadius: 3,
              }}>
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p style={{
              fontSize: 13,
              color: 'var(--text-secondary)',
              marginTop: 4,
              lineHeight: 1.4,
            }}>
              {subtitle}
            </p>
          )}
        </div>

        {(actions || children) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {actions}
            {children}
          </div>
        )}
      </div>

      {/* Optional inline tabs — Blackline horizontal tab bar */}
      {tabs && (
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          padding: '0 20px',
          gap: 0,
          height: 36,
        }}>
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange?.(tab.id)}
                style={{
                  height: 36,
                  padding: '0 16px',
                  fontSize: 12.5,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? 'var(--accent)' : 'var(--text-tertiary)',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                  cursor: 'pointer',
                  transition: 'color 100ms, border-color 100ms',
                  whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--text-secondary)' }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--text-tertiary)' }}
              >
                {tab.label}
                {tab.count != null && (
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    background: isActive ? 'var(--accent-subtle)' : 'var(--surface-3)',
                    color: isActive ? 'var(--accent)' : 'var(--text-tertiary)',
                    border: `1px solid ${isActive ? 'var(--accent-border)' : 'var(--border-1)'}`,
                    borderRadius: 9999, padding: '1px 6px',
                  }}>
                    {tab.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
