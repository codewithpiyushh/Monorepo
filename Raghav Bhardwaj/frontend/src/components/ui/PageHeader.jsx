import clsx from 'clsx'

export default function PageHeader({ title, subtitle, badge, actions, className }) {
  return (
    <div className={clsx('section-header', className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <h1 className="truncate text-lg font-semibold text-white">{title}</h1>
          {badge ? <span className="chip-neutral">{badge}</span> : null}
        </div>
        {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
      </div>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  )
}
