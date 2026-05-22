import { AlertCircle } from 'lucide-react'

export default function ErrorState({
  title = 'Something went wrong',
  description = 'An error occurred while loading this content',
  error = null,
  action: Action = null,
  variant = 'default' // default | critical
}) {
  const variants = {
    default: {
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      textColor: 'text-red-700',
      descColor: 'text-red-600',
      iconColor: 'text-red-500'
    },
    critical: {
      bgColor: 'bg-rose-50',
      borderColor: 'border-rose-200',
      textColor: 'text-rose-900',
      descColor: 'text-rose-700',
      iconColor: 'text-rose-600'
    }
  }

  const config = variants[variant] || variants.default

  return (
    <div className={`${config.bgColor} border ${config.borderColor} rounded-lg p-8 flex flex-col items-start min-h-[200px]`}>
      <div className="flex items-start gap-4 w-full">
        <AlertCircle className={`w-5 h-5 ${config.iconColor} flex-shrink-0 mt-0.5`} />
        <div className="flex-1">
          <h3 className={`font-semibold ${config.textColor} mb-1`}>{title}</h3>
          <p className={`text-sm ${config.descColor} mb-3`}>{description}</p>
          {error && (
            <details className="mt-3">
              <summary className={`text-xs ${config.descColor} cursor-pointer hover:underline`}>
                Error details
              </summary>
              <pre className={`text-xs ${config.descColor} mt-2 p-2 bg-white rounded border ${config.borderColor} overflow-auto max-h-48`}>
                {error instanceof Error ? error.message : String(error)}
              </pre>
            </details>
          )}
          {Action && <div className="mt-4"><Action /></div>}
        </div>
      </div>
    </div>
  )
}
