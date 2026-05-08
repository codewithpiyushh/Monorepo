import { Check } from 'lucide-react'
import clsx from 'clsx'

export default function Stepper({ steps, currentStep, compact = false, className = '' }) {
  const progressPercent = steps.length > 1 ? (currentStep / (steps.length - 1)) * 100 : 100

  return (
    <div className={clsx('space-y-2', className)}>
      <div className="relative h-1.5 rounded-full bg-surface-700 overflow-hidden">
        <div
          className="h-full rounded-full bg-brand-600 transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div
        className={clsx(
          'flex items-center gap-0',
          compact
            ? 'px-0 py-0 bg-transparent border-0'
            : 'px-4 lg:px-6 py-3 border-b border-surface-700 bg-surface-900/40'
        )}
      >
        {steps.map((step, idx) => {
          const isActive = idx === currentStep
          const isDone = idx < currentStep
          const isLast = idx === steps.length - 1

          return (
            <div key={step.id} className="flex items-center flex-1">
              <div className={clsx('flex items-center flex-shrink-0', compact ? 'gap-1.5' : 'gap-2')}>
                <div
                  className={clsx(
                    compact
                      ? 'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all'
                      : 'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                    isActive && 'bg-brand-600 text-slate-900 shadow-none ring-2 ring-brand-900/20',
                    isDone && 'bg-emerald-600 text-white',
                    !isActive && !isDone && 'bg-surface-700 text-slate-500'
                  )}
                >
                  {isDone ? <Check className="w-3 h-3" /> : idx + 1}
                </div>
                <span
                  className={clsx(
                    compact ? 'text-[11px] font-medium' : 'text-xs font-medium',
                    isActive && 'text-slate-100',
                    isDone && 'text-emerald-400',
                    !isActive && !isDone && 'text-slate-500'
                  )}
                >
                  {step.label}
                </span>
              </div>
              {!isLast && (
                <div
                  className={clsx(
                    compact ? 'flex-1 h-px mx-2' : 'flex-1 h-px mx-3',
                    isDone ? 'bg-emerald-600/50' : 'bg-surface-700'
                  )}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
