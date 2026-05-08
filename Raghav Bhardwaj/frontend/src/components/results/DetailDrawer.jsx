import { X } from 'lucide-react'

const parseJson = (value) => {
  if (!value) return {}
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

export default function DetailDrawer({ transaction, open, onClose }) {
  if (!open || !transaction) return null

  const sourceData = parseJson(transaction.source_data)
  const targetData = parseJson(transaction.target_data)
  const discrepancies = Array.isArray(parseJson(transaction.discrepancies))
    ? parseJson(transaction.discrepancies)
    : []

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div className="absolute inset-0 bg-black/40 pointer-events-auto" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-xl bg-surface-800 border-l border-surface-700 shadow-2xl pointer-events-auto flex flex-col">
        <div className="px-4 py-3 border-b border-surface-700 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Transaction #{transaction.id}</h3>
            <p className="text-xs text-slate-400">Status: {transaction.match_status} | Score: {((transaction.match_score || 0) * 100).toFixed(0)}%</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="surface-panel p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Full Source Data</p>
              <div className="space-y-1">
                {Object.keys(sourceData).length === 0 && <div className="text-xs text-slate-500">No source row</div>}
                {Object.entries(sourceData).map(([key, value]) => (
                  <div key={key} className="text-xs flex gap-2">
                    <span className="text-slate-500 w-28 truncate">{key}</span>
                    <span className="text-slate-300 truncate">{value ?? '(null)'}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="surface-panel p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Full Target Data</p>
              <div className="space-y-1">
                {Object.keys(targetData).length === 0 && <div className="text-xs text-slate-500">No target row</div>}
                {Object.entries(targetData).map(([key, value]) => (
                  <div key={key} className="text-xs flex gap-2">
                    <span className="text-slate-500 w-28 truncate">{key}</span>
                    <span className="text-slate-300 truncate">{value ?? '(null)'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="surface-panel p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Differences</p>
            {discrepancies.length === 0 ? (
              <p className="text-xs text-emerald-300">No differences found.</p>
            ) : (
              <div className="space-y-1.5">
                {discrepancies.map((item, idx) => (
                  <div key={idx} className="text-xs text-slate-300">
                    <span className="text-slate-500">{item.source_column}:</span> {item.source_value ?? '(empty)'} vs {item.target_value ?? '(empty)'}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

