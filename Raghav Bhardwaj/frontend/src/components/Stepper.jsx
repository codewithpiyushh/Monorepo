import { Check } from 'lucide-react'
import clsx from 'clsx'

export default function Stepper({ steps, currentStep, compact = false, className = '' }) {
  const progressPercent = steps.length > 1 ? (currentStep / (steps.length - 1)) * 100 : 100

  return (
    <div className={clsx('space-y-2', className)}>
      {/* Progress bar — amber fill */}
      <div style={{
        position: 'relative', height: 3,
        borderRadius: 9999,
        background: 'var(--surface-4)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          borderRadius: 9999,
          background: 'var(--accent)',
          width: `${progressPercent}%`,
          transition: 'width 300ms var(--ease-out)',
        }} />
      </div>

      {/* Steps */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        padding: compact ? '0' : '10px 16px',
        background: compact ? 'transparent' : 'var(--surface-1)',
        borderBottom: compact ? 'none' : '1px solid var(--border-1)',
      }}>
        {steps.map((step, idx) => {
          const isActive = idx === currentStep
          const isDone   = idx < currentStep
          const isLast   = idx === steps.length - 1

          return (
            <div key={step.id} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 5 : 7, flexShrink: 0 }}>
                {/* Step dot */}
                <div style={{
                  width:  compact ? 18 : 22,
                  height: compact ? 18 : 22,
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: compact ? 9 : 10,
                  fontWeight: 700,
                  flexShrink: 0,
                  transition: 'all 160ms',
                  ...(isActive ? {
                    background: 'var(--accent)',
                    color: 'var(--accent-text)',
                    boxShadow: '0 0 0 3px var(--accent-subtle)',
                  } : isDone ? {
                    background: 'var(--ok)',
                    color: '#fff',
                  } : {
                    background: 'var(--surface-4)',
                    color: 'var(--text-tertiary)',
                    border: '1px solid var(--border-2)',
                  }),
                }}>
                  {isDone ? <Check style={{ width: compact ? 9 : 11, height: compact ? 9 : 11 }} /> : idx + 1}
                </div>

                {/* Label */}
                <span style={{
                  fontSize: compact ? 11 : 12,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? 'var(--accent)' : isDone ? 'var(--ok)' : 'var(--text-tertiary)',
                  whiteSpace: 'nowrap',
                }}>
                  {step.label}
                </span>
              </div>

              {/* Connector */}
              {!isLast && (
                <div style={{
                  flex: 1,
                  height: 1,
                  margin: `0 ${compact ? 8 : 12}px`,
                  background: isDone ? 'rgba(34,211,160,0.4)' : 'var(--border-1)',
                }} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
