import { Inbox, AlertTriangle, Search } from 'lucide-react'

export default function EmptyState({ 
  icon: Icon = Inbox,
  title = 'No data found',
  description = 'There are no items to display',
  action: Action = null,
  variant = 'default' // default | no-results | no-search
}) {
  const variants = {
    default: {
      bgColor: 'bg-slate-50',
      textColor: 'text-slate-600',
      descColor: 'text-slate-500'
    },
    'no-results': {
      bgColor: 'bg-amber-50',
      textColor: 'text-amber-700',
      descColor: 'text-amber-600'
    },
    'no-search': {
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-700',
      descColor: 'text-blue-600'
    }
  }

  const config = variants[variant] || variants.default

  return (
    <div className={`${config.bgColor} rounded-lg p-12 flex flex-col items-center justify-center min-h-[300px]`}>
      <Icon className={`w-12 h-12 ${config.textColor} mb-4 opacity-40`} />
      <h3 className={`text-lg font-semibold ${config.textColor} mb-2`}>{title}</h3>
      <p className={`text-sm ${config.descColor} mb-6 max-w-sm text-center`}>{description}</p>
      {Action && <Action />}
    </div>
  )
}
