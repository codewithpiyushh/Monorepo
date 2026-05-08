import clsx from 'clsx'

export default function SummaryTable({ units, selectedKey, onSelect, getUnitKey, loading }) {
  const statusChip = (status) => status === 'matched' ? 'badge-matched' : status === 'partial' ? 'badge-partial' : 'badge-unmatched'

  return (
    <div className="surface-panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Reconciliation Units</p>
        <p className="text-xs text-slate-500">{units.length} items</p>
      </div>

      <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
        {loading && <div className="px-3 py-8 text-center text-slate-500 text-xs">Loading summary...</div>}
        {!loading && units.length === 0 && <div className="px-3 py-8 text-center text-slate-500 text-xs">No reconciliation units found.</div>}
        {!loading && units.map((unit, idx) => {
          const key = getUnitKey(unit, idx)
          const isSelected = key === selectedKey
          return (
            <button
              key={key}
              className={clsx(
                'w-full rounded-lg border p-3 text-left transition-colors',
                isSelected ? 'border-brand-600/50 bg-brand-900/10' : 'border-surface-700 hover:bg-surface-700/20'
              )}
              onClick={() => onSelect(unit, key)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-200 font-medium truncate">{unit.entity}</p>
                  <p className="text-xs text-slate-400 truncate">{unit.account}</p>
                </div>
                <span><span className={statusChip(unit.status)}>{unit.status}</span></span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded bg-surface-700/30 px-2 py-1"><span className="text-slate-500">Total</span><p className="text-slate-300">{unit.total_transactions}</p></div>
                <div className="rounded bg-surface-700/30 px-2 py-1"><span className="text-slate-500">Matched</span><p className="text-emerald-300">{unit.matched_count}</p></div>
                <div className="rounded bg-surface-700/30 px-2 py-1"><span className="text-slate-500">Unmatched</span><p className="text-red-300">{unit.unmatched_count}</p></div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
