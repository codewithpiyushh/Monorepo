import { X } from 'lucide-react'
import { useState } from 'react'

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
  const [activeTab, setActiveTab] = useState('adjustment')
  if (!open || !transaction) return null

  const sourceData = parseJson(transaction.source_data)
  const targetData = parseJson(transaction.target_data)
  const sourceEntries = Object.entries(sourceData)
  const targetEntries = Object.entries(targetData)
  const discrepancies = Array.isArray(parseJson(transaction.discrepancies))
    ? parseJson(transaction.discrepancies)
    : []

  return (
    <section className="card p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-700 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Match Review - Transaction #{transaction.id}</h3>
          <p className="text-xs text-slate-400">Status: {transaction.match_status} | Confidence: {((transaction.match_score || 0) * 100).toFixed(0)}%</p>
        </div>
        <button onClick={onClose} className="btn-ghost p-1.5" title="Close review panel">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
        <div className="space-y-4 min-w-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="surface-panel p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Source Record</p>
              <div className="space-y-1">
                {sourceEntries.length === 0 && <div className="text-xs text-slate-500">No source row</div>}
                {sourceEntries.map(([key, value]) => (
                  <div key={key} className="text-xs flex gap-2">
                    <span className="text-slate-500 w-28 truncate">{key}</span>
                    <span className="text-slate-300 truncate">{value ?? '(null)'}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="surface-panel p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Target Record</p>
              <div className="space-y-1">
                {targetEntries.length === 0 && <div className="text-xs text-slate-500">No target row</div>}
                {targetEntries.map(([key, value]) => (
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

        <aside className="surface-panel p-3 space-y-3">
          <div className="flex items-center gap-1 rounded-md border border-surface-700 p-1">
            <button className={`px-2 py-1 text-xs rounded ${activeTab === 'adjustment' ? 'bg-brand-900/30 text-slate-100' : 'text-slate-400'}`} onClick={() => setActiveTab('adjustment')}>Adjustment</button>
            <button className={`px-2 py-1 text-xs rounded ${activeTab === 'evidence' ? 'bg-brand-900/30 text-slate-100' : 'text-slate-400'}`} onClick={() => setActiveTab('evidence')}>Evidence</button>
            <button className={`px-2 py-1 text-xs rounded ${activeTab === 'comments' ? 'bg-brand-900/30 text-slate-100' : 'text-slate-400'}`} onClick={() => setActiveTab('comments')}>Comments</button>
          </div>
          {activeTab === 'adjustment' && (
            <>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Adjustment</p>
              <div className="text-xs text-slate-300 space-y-2">
                <label className="flex items-center gap-2"><input type="radio" name={`action-${transaction.id}`} defaultChecked /> Confirm Match</label>
                <label className="flex items-center gap-2"><input type="radio" name={`action-${transaction.id}`} /> Discard Match</label>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wide text-slate-500">Comment</label>
                <textarea className="input mt-1 min-h-20 text-xs" placeholder="Add review note..." />
              </div>
            </>
          )}
          {activeTab === 'evidence' && (
            <div className="text-xs text-slate-400">
              <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Evidence</p>
              Link attachment from record-level evidence manager for this transaction group.
            </div>
          )}
          {activeTab === 'comments' && (
            <div className="text-xs text-slate-400">
              <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Comments</p>
              Reviewer and preparer collaboration notes will appear here.
            </div>
          )}
          <div className="flex gap-2">
            <button className="btn-secondary h-8 py-1 text-xs">Previous</button>
            <button className="btn-primary h-8 py-1 text-xs">Next</button>
          </div>
        </aside>
      </div>
    </section>
  )
}

