import { useState, useMemo } from 'react'
import clsx from 'clsx'
import { Check, X, Calculator, Plus, AlertTriangle, Play, Link } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ARCSWorkbench({
  transactions,
  mappedColumns,
  onSelectTransaction,
}) {
  const [activeTab, setActiveTab] = useState('unmatched')
  
  // Selection states for manual matching
  const [selectedSourceIds, setSelectedSourceIds] = useState(new Set())
  const [selectedTargetIds, setSelectedTargetIds] = useState(new Set())

  // Parse JSON helper
  const parseJson = (value) => {
    if (!value) return {}
    if (typeof value === 'object') return value
    try {
      return JSON.parse(value)
    } catch {
      return {}
    }
  }

  const hasData = (dataStr) => {
    if (!dataStr) return false
    if (dataStr === '{}' || dataStr === 'null') return false
    return true
  }

  // Derived datasets
  const { unmatchedSource, unmatchedTarget, suggestedMatches, confirmedMatches } = useMemo(() => {
    const unSource = []
    const unTarget = []
    const suggested = []
    const confirmed = []

    transactions.forEach((tx) => {
      if (tx.match_status === 'matched') {
        confirmed.push(tx)
      } else if (tx.match_status === 'partial') {
        suggested.push(tx)
      } else if (tx.match_status === 'unmatched') {
        const hasSource = hasData(tx.source_data)
        const hasTarget = hasData(tx.target_data)
        if (hasSource && !hasTarget) unSource.push(tx)
        else if (hasTarget && !hasSource) unTarget.push(tx)
        else if (hasSource && hasTarget) {
           unSource.push(tx)
           unTarget.push({ ...tx, id: tx.id + '_tgt' }) // Fake split if it has both but is unmatched
        }
      }
    })
    return { unmatchedSource: unSource, unmatchedTarget: unTarget, suggestedMatches: suggested, confirmedMatches: confirmed }
  }, [transactions])

  // Get active columns to show
  const activeColumns = mappedColumns.length ? mappedColumns.slice(0, 4) : [{ source_column: 'mapped_fields', target_column: 'mapped_fields' }]

  // Extract amount safely
  const getAmount = (dataObj) => {
    if (!dataObj) return 0
    const amt = dataObj['amount'] || dataObj['Amount'] || dataObj['AMOUNT'] || 0
    return parseFloat(amt) || 0
  }

  // Calculate Variance
  const varianceState = useMemo(() => {
    let sourceSum = 0
    let targetSum = 0

    unmatchedSource.forEach(tx => {
      if (selectedSourceIds.has(tx.id)) {
        sourceSum += getAmount(parseJson(tx.source_data))
      }
    })
    unmatchedTarget.forEach(tx => {
      if (selectedTargetIds.has(tx.id)) {
        targetSum += getAmount(parseJson(tx.target_data))
      }
    })

    const variance = sourceSum - targetSum
    return { sourceSum, targetSum, variance }
  }, [unmatchedSource, unmatchedTarget, selectedSourceIds, selectedTargetIds])

  const toggleSourceSelection = (id) => {
    const next = new Set(selectedSourceIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedSourceIds(next)
  }

  const toggleTargetSelection = (id) => {
    const next = new Set(selectedTargetIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedTargetIds(next)
  }

  const handleManualMatch = () => {
    if (selectedSourceIds.size === 0 && selectedTargetIds.size === 0) return
    if (Math.abs(varianceState.variance) > 0.01) {
      toast.error('Cannot match: Variance is not zero. Create an adjustment first.')
      return
    }
    toast.success('Manual match created successfully!')
    setSelectedSourceIds(new Set())
    setSelectedTargetIds(new Set())
  }

  const renderTransactionGrid = (list, isSource, selectedSet, toggleSelection) => {
    return (
      <div className="flex flex-col border border-surface-700 rounded-lg overflow-hidden h-[400px]">
        <div className="bg-surface-800/80 px-3 py-2 border-b border-surface-700 flex justify-between items-center">
          <span className="text-xs font-semibold text-slate-200">
            {isSource ? 'Source System (Subledger)' : 'Target System (GL/Bank)'}
          </span>
          <span className="text-[10px] bg-surface-700 px-2 py-0.5 rounded text-slate-400">
            {list.length} records
          </span>
        </div>
        <div className="overflow-auto flex-1 bg-surface-900/30 relative">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-surface-800/90 backdrop-blur sticky top-0 z-10 shadow-sm border-b border-surface-700">
              <tr>
                <th className="px-3 py-2 font-medium text-slate-400 w-8">
                  <input type="checkbox" className="rounded bg-surface-700 border-surface-600" />
                </th>
                <th className="px-3 py-2 font-medium text-slate-400">ID</th>
                {activeColumns.map(c => (
                  <th key={c.source_column} className="px-3 py-2 font-medium text-slate-400">
                    {isSource ? c.source_column : c.target_column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-700/50">
              {list.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-slate-500 italic">No unmatched records.</td>
                </tr>
              )}
              {list.map(tx => {
                const data = parseJson(isSource ? tx.source_data : tx.target_data)
                const isSelected = selectedSet.has(tx.id)
                return (
                  <tr 
                    key={tx.id} 
                    className={clsx(
                      'hover:bg-surface-700/30 cursor-pointer transition-colors',
                      isSelected && 'bg-brand-900/20'
                    )}
                    onClick={() => toggleSelection(tx.id)}
                  >
                    <td className="px-3 py-2">
                      <input 
                        type="checkbox" 
                        checked={isSelected}
                        onChange={() => {}} 
                        className="rounded bg-surface-700 border-surface-600 accent-brand-500" 
                      />
                    </td>
                    <td className="px-3 py-2 text-slate-500">#{tx.id}</td>
                    {activeColumns.map(c => (
                      <td key={c.source_column} className="px-3 py-2 text-slate-200 truncate max-w-[120px]">
                        {data[isSource ? c.source_column : c.target_column] ?? '-'}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const renderSuggestedMatches = () => {
    return (
      <div className="space-y-3 max-h-[500px] overflow-y-auto">
        {suggestedMatches.length === 0 && (
          <div className="p-8 text-center text-slate-500 text-sm border border-surface-700 border-dashed rounded-xl">
            No suggested matches pending review.
          </div>
        )}
        {suggestedMatches.map(tx => (
          <div key={tx.id} className="border border-surface-700 rounded-lg p-3 bg-surface-800/20 hover:bg-surface-800/40 transition-colors">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-200">Match Group #{tx.id}</span>
                <span className="badge-partial text-[10px]">Suggested ({((tx.match_score || 0)*100).toFixed(0)}%)</span>
                {tx.discrepancies && <span className="text-[10px] text-amber-400 bg-amber-900/30 px-2 py-0.5 rounded border border-amber-800/50">Variance Flagged</span>}
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary h-7 px-3 py-0 text-[11px] text-red-400 hover:bg-red-900/20 hover:border-red-900/50">Discard</button>
                <button className="btn-primary h-7 px-3 py-0 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white border-transparent">Confirm Match</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div className="text-xs text-slate-400 bg-surface-900/50 p-2 rounded">
                 <p className="text-[10px] uppercase mb-1 text-slate-500 font-semibold">Source Record</p>
                 <pre className="whitespace-pre-wrap font-mono text-[10px]">{tx.source_data}</pre>
               </div>
               <div className="text-xs text-slate-400 bg-surface-900/50 p-2 rounded">
                 <p className="text-[10px] uppercase mb-1 text-slate-500 font-semibold">Target Record</p>
                 <pre className="whitespace-pre-wrap font-mono text-[10px]">{tx.target_data}</pre>
               </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  const renderConfirmedMatches = () => {
    return (
      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {confirmedMatches.length === 0 && (
          <div className="p-8 text-center text-slate-500 text-sm border border-surface-700 border-dashed rounded-xl">
            No confirmed matches.
          </div>
        )}
        {confirmedMatches.map(tx => (
          <div key={tx.id} className="border border-emerald-900/30 rounded-lg p-3 bg-emerald-900/5 flex justify-between items-center">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-200">Match Group #{tx.id}</span>
              <span className="text-[11px] text-slate-500">Auto-matched via rule execution</span>
            </div>
            <span className="badge-matched text-[10px]">Confirmed Match</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col bg-surface-900 rounded-xl overflow-hidden shadow-inner border border-surface-700/50 mt-3">
      
      {/* ── Tabs ── */}
      <div className="flex items-center gap-6 px-4 bg-surface-800 border-b border-surface-700">
        {[
          { id: 'unmatched', label: 'Unmatched', count: unmatchedSource.length + unmatchedTarget.length },
          { id: 'suggested', label: 'Suggested Matches', count: suggestedMatches.length },
          { id: 'matched', label: 'Confirmed Matches', count: confirmedMatches.length },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'py-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-2',
              activeTab === tab.id 
                ? 'border-brand-500 text-brand-400' 
                : 'border-transparent text-slate-400 hover:text-slate-300'
            )}
          >
            {tab.label}
            <span className={clsx(
              "px-1.5 py-0.5 rounded-full text-[10px]",
              activeTab === tab.id ? "bg-brand-900/40 text-brand-300" : "bg-surface-700 text-slate-400"
            )}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="p-4 overflow-hidden">
        
        {activeTab === 'unmatched' && (
          <div className="space-y-4">
            
            {/* Variance Calculator Ribbon */}
            <div className="bg-surface-800 border border-surface-600 rounded-lg p-3 flex flex-wrap items-center justify-between shadow-lg relative z-20">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-brand-400" />
                  <span className="text-xs font-semibold text-slate-200">Variance Calculator</span>
                </div>
                
                <div className="flex gap-4 text-xs">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wide">Source Selected</span>
                    <span className="font-mono text-slate-200">${varianceState.sourceSum.toFixed(2)}</span>
                  </div>
                  <div className="text-slate-600 text-lg flex items-center">-</div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wide">Target Selected</span>
                    <span className="font-mono text-slate-200">${varianceState.targetSum.toFixed(2)}</span>
                  </div>
                  <div className="text-slate-600 text-lg flex items-center">=</div>
                  <div className="flex flex-col bg-surface-900 px-3 rounded border border-surface-700 justify-center">
                    <span className={clsx(
                      "font-mono font-bold",
                      Math.abs(varianceState.variance) < 0.01 ? "text-emerald-400" : "text-amber-400"
                    )}>
                      ${Math.abs(varianceState.variance).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button className="btn-secondary h-8 py-0 text-xs px-3 bg-surface-700 hover:bg-surface-600">
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Create Adjustment
                </button>
                <button 
                  className="btn-primary h-8 py-0 text-xs px-4"
                  disabled={selectedSourceIds.size === 0 && selectedTargetIds.size === 0}
                  onClick={handleManualMatch}
                >
                  <Link className="w-3.5 h-3.5 mr-1" />
                  Match Selected
                </button>
              </div>
            </div>

            {/* Split Grid */}
            <div className="grid grid-cols-2 gap-4">
              {renderTransactionGrid(unmatchedSource, true, selectedSourceIds, toggleSourceSelection)}
              {renderTransactionGrid(unmatchedTarget, false, selectedTargetIds, toggleTargetSelection)}
            </div>

          </div>
        )}

        {activeTab === 'suggested' && renderSuggestedMatches()}
        {activeTab === 'matched' && renderConfirmedMatches()}

      </div>
    </div>
  )
}
