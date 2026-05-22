import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'

const FILTERS = ['all', 'matched', 'unmatched', 'partial']

export default function TransactionTable({
  transactions,
  mappedColumns,
  filter,
  onFilterChange,
  selectedTransactionId,
  onSelectTransaction,
  showAdvancedFilters = false,
}) {
  const [search, setSearch] = useState('')
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [page, setPage] = useState(1)
  const [showColumnsPanel, setShowColumnsPanel] = useState(false)
  const [viewName, setViewName] = useState('')
  const [savedViews, setSavedViews] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('drms_tx_views') || '[]')
    } catch {
      return []
    }
  })
  const [visibleColumns, setVisibleColumns] = useState([])
  const statusChip = (status) => status === 'matched' ? 'badge-matched badge-subtle' : status === 'partial' ? 'badge-partial badge-subtle' : 'badge-unmatched badge-subtle'
  const columns = mappedColumns.length ? mappedColumns : [{ source_column: 'mapped_fields', target_column: 'mapped_fields' }]

  useEffect(() => {
    setVisibleColumns((prev) => {
      if (!prev.length) return columns.slice(0, 6).map((c) => c.source_column)
      const available = new Set(columns.map((c) => c.source_column))
      const kept = prev.filter((c) => available.has(c))
      return kept.length ? kept : columns.map((c) => c.source_column)
    })
  }, [mappedColumns])

  const parseJson = (value) => {
    if (!value) return {}
    if (typeof value === 'object') return value
    try {
      return JSON.parse(value)
    } catch {
      return {}
    }
  }

  const filteredTransactions = useMemo(() => {
    const statusFiltered = transactions.filter((tx) => (filter === 'all' ? true : tx.match_status === filter))
    const q = search.trim().toLowerCase()
    if (!q) return statusFiltered
    return statusFiltered.filter((tx) => {
      const sourceData = parseJson(tx.source_data)
      const targetData = parseJson(tx.target_data)
      const haystack = [
        `tx-${tx.id}`,
        tx.match_status,
        ...Object.values(sourceData || {}),
        ...Object.values(targetData || {}),
      ].join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [transactions, filter, search])

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / rowsPerPage))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * rowsPerPage
  const pagedTransactions = filteredTransactions.slice(start, start + rowsPerPage)
  const activeColumns = columns.filter((c) => visibleColumns.includes(c.source_column))

  const saveView = () => {
    const trimmed = viewName.trim()
    if (!trimmed) return
    const next = savedViews.filter((v) => v.name !== trimmed).concat({
      name: trimmed,
      filter,
      rowsPerPage,
      visibleColumns,
      search,
    })
    setSavedViews(next)
    localStorage.setItem('drms_tx_views', JSON.stringify(next))
    setViewName('')
  }

  const applyView = (name) => {
    const selected = savedViews.find((v) => v.name === name)
    if (!selected) return
    onFilterChange(selected.filter || 'all')
    setRowsPerPage(selected.rowsPerPage || 10)
    setVisibleColumns(selected.visibleColumns || columns.map((c) => c.source_column))
    setSearch(selected.search || '')
    setPage(1)
  }

  return (
    <div className="surface-panel p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs uppercase tracking-[0.16em] text-slate-500 mr-2">Transactions</p>
        {FILTERS.map((value) => (
          <button
            key={value}
            onClick={() => onFilterChange(value)}
            className={clsx(
              'px-2.5 py-1 rounded-md text-xs capitalize border',
              filter === value
                ? 'bg-brand-900/20 border-brand-600/50 text-brand-300'
                : 'border-surface-700 text-slate-400 hover:bg-surface-700/20'
            )}
          >
            {value}
          </button>
        ))}
        <div className="ml-auto w-full max-w-md">
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search all columns..."
            className="input h-10 result-search"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap opacity-90">
        {showAdvancedFilters && (
          <>
            <button className="btn-secondary h-8 py-1 text-xs" onClick={() => setShowColumnsPanel((v) => !v)}>
              {showColumnsPanel ? 'Hide Columns' : 'Choose Columns'}
            </button>
            <select className="input h-8 py-1 w-44 text-xs" defaultValue="" onChange={(e) => applyView(e.target.value)}>
              <option value="" disabled>Apply saved view</option>
              {savedViews.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
            </select>
            <input className="input h-8 py-1 w-44 text-xs" value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="Save current view as..." />
            <button className="btn-secondary h-8 py-1 text-xs" onClick={saveView}>Save View</button>
          </>
        )}
      </div>

      {showColumnsPanel && (
        <div className="rounded-lg border border-surface-700 bg-surface-800/40 p-3">
          <p className="text-xs text-slate-400 mb-2">Visible columns</p>
          <div className="flex flex-wrap gap-3">
            {columns.map((c) => {
              const checked = visibleColumns.includes(c.source_column)
              return (
                <label key={c.source_column} className="text-xs text-slate-300 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setVisibleColumns((prev) => {
                        if (checked) return prev.filter((x) => x !== c.source_column)
                        return [...prev, c.source_column]
                      })
                    }}
                  />
                  {c.source_column}
                </label>
              )
            })}
          </div>
        </div>
      )}

      <div className="overflow-auto border border-surface-700 rounded-lg">
        <div className="min-w-max">
          <div
            className="sticky top-0 z-10 grid gap-3 px-3 py-3 border-b border-surface-700/70 bg-surface-700/95 backdrop-blur"
            style={{ gridTemplateColumns: `130px ${'minmax(140px,1fr) '.repeat(Math.max(activeColumns.length, 1))}120px 90px` }}
          >
            <span className="text-[11px] uppercase tracking-wide text-slate-400">Transaction</span>
            {activeColumns.map((mapping, idx) => (
              <span key={`${mapping.source_column}-${mapping.target_column}-${idx}`} className="text-[11px] uppercase tracking-wide text-slate-400 truncate">
                {mapping.source_column}
              </span>
            ))}
            <span className="text-[11px] uppercase tracking-wide text-slate-300">Status</span>
            <span className="text-[11px] uppercase tracking-wide text-slate-300 text-right">Score</span>
          </div>

          <div className="divide-y divide-surface-700/50 max-h-[34vh] overflow-y-auto">
            {filteredTransactions.length === 0 && (
              <div className="px-3 py-8 text-center text-slate-500 text-xs">No transactions for this filter.</div>
            )}
            {pagedTransactions.map((tx, idx) => {
              const sourceData = parseJson(tx.source_data)
              const targetData = parseJson(tx.target_data)
              const isSelected = selectedTransactionId === tx.id

              return (
                <button
                  key={tx.id}
                  onClick={() => onSelectTransaction(tx)}
                  className={clsx(
                    'w-full grid gap-3 px-3 text-left items-center result-grid-row transition-colors',
                    'py-2.5',
                    idx % 2 === 1 && 'result-grid-row-alt',
                    isSelected && 'bg-brand-900/20'
                  )}
                  style={{ gridTemplateColumns: `130px ${'minmax(140px,1fr) '.repeat(Math.max(activeColumns.length, 1))}120px 90px` }}
                >
                  <span className="text-xs text-slate-300">Tx #{tx.id}</span>
                  {activeColumns.map((mapping, idx) => {
                    const sourceValue = sourceData[mapping.source_column]
                    const targetValue = targetData[mapping.target_column]
                    return (
                      <span key={`${tx.id}-${idx}`} className="text-xs text-slate-100 truncate">
                        <span>{sourceValue ?? '(null)'}</span>
                        <span className="text-slate-500"> | </span>
                        <span className="font-medium">{targetValue ?? '(null)'}</span>
                      </span>
                    )
                  })}
                  <span><span className={statusChip(tx.match_status)}>{tx.match_status}</span></span>
                  <span className="text-[11px] text-slate-500 text-right">{((tx.match_score || 0) * 100).toFixed(0)}%</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span>Rows per page:</span>
          <select
            value={rowsPerPage}
            onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(1) }}
            className="input h-9 py-1 w-20 text-sm"
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
          </select>
        </div>
        <div className="ml-auto text-sm text-slate-400">
          Page {safePage} of {totalPages} (Total {filteredTransactions.length} entries)
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-secondary h-9 px-4"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <button
            className="btn-primary h-9 px-4"
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
