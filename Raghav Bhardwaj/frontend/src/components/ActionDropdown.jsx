import { useState, useRef, useEffect } from 'react'
import { MoreHorizontal } from 'lucide-react'

export default function ActionDropdown({ actions }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        title="More actions"
        style={{
          width: 32, height: 32, borderRadius: '50%',
          border: '1px solid var(--border-2)', background: open ? 'var(--surface-3)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: 'var(--text-tertiary)', flexShrink: 0,
          transition: 'border-color 100ms, color 100ms, background 100ms',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255,230,0,0.40)'
          e.currentTarget.style.color = '#FFE600'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-2)'
          e.currentTarget.style.color = open ? '#FFE600' : 'var(--text-tertiary)'
        }}
      >
        <MoreHorizontal style={{ width: 14, height: 14 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: 4,
          background: 'var(--surface-2)', border: '1px solid var(--border-2)',
          borderRadius: 8, padding: 6, minWidth: 160, zIndex: 50,
          boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
          fontFamily: 'Inter, sans-serif',
        }}>
          {actions.map((act, i) => {
            const Icon = act.icon
            const isDanger = act.variant === 'danger'
            return (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setOpen(false)
                  act.onClick(e)
                }}
                disabled={act.disabled}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '8px 10px', borderRadius: 5,
                  border: 'none', background: 'transparent',
                  color: act.disabled ? 'var(--text-disabled)' : (isDanger ? '#ef4444' : 'var(--text-primary)'),
                  fontSize: 12.5, fontWeight: 500, cursor: act.disabled ? 'not-allowed' : 'pointer',
                  textAlign: 'left', transition: 'background 100ms',
                }}
                onMouseEnter={e => {
                  if (!act.disabled) {
                    e.currentTarget.style.background = isDanger ? 'rgba(239,68,68,0.1)' : 'var(--surface-3)'
                  }
                }}
                onMouseLeave={e => {
                  if (!act.disabled) {
                    e.currentTarget.style.background = 'transparent'
                  }
                }}
              >
                {Icon && <Icon style={{ width: 14, height: 14, flexShrink: 0 }} />}
                {act.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
