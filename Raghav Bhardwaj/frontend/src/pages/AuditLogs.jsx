import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { auditAPI } from '../api'
import { ScrollText, Filter, ChevronLeft, ChevronRight, User, Clock } from 'lucide-react'
import clsx from 'clsx'

const ACTION_COLORS = {
  USER_LOGIN: 'bg-surface-700 text-slate-300 border-surface-600',
  USER_REGISTERED: 'bg-surface-700 text-slate-300 border-surface-600',
  PROJECT_CREATED: 'bg-emerald-900/40 text-emerald-400 border-emerald-800/50',
  PROJECT_UPDATED: 'bg-amber-900/40 text-amber-400 border-amber-800/50',
  PROJECT_DELETED: 'bg-red-900/40 text-red-400 border-red-800/50',
  DATASET_UPLOADED: 'bg-surface-700 text-slate-300 border-surface-600',
  MAPPINGS_SAVED: 'bg-surface-700 text-slate-300 border-surface-600',
  RULE_CREATED: 'bg-surface-700 text-slate-300 border-surface-600',
  RULE_UPDATED: 'bg-surface-700 text-slate-300 border-surface-600',
  RULE_DELETED: 'bg-red-900/30 text-red-300 border-red-800/50',
  EXECUTION_STARTED: 'bg-brand-900/40 text-slate-100 border-brand-800/50',
}

const ACTION_TYPES = [
  'USER_LOGIN', 'USER_REGISTERED',
  'PROJECT_CREATED', 'PROJECT_UPDATED', 'PROJECT_DELETED',
  'DATASET_UPLOADED', 'MAPPINGS_SAVED',
  'RULE_CREATED', 'RULE_UPDATED', 'RULE_DELETED',
  'EXECUTION_STARTED',
]

const ENTITY_TYPES = ['user', 'project', 'dataset', 'rule', 'execution']

function MetadataCell({ jsonStr }) {
  if (!jsonStr) return <span className="text-slate-600">-</span>
  try {
    const obj = JSON.parse(jsonStr)
    const pairs = Object.entries(obj).slice(0, 3)
    return (
      <div className="flex flex-wrap gap-1">
        {pairs.map(([k, v]) => (
          <span key={k} className="text-[10px] bg-surface-700 rounded px-1.5 py-0.5 text-slate-400">
            <span className="text-slate-500">{k}:</span> {String(v).slice(0, 30)}
          </span>
        ))}
      </div>
    )
  } catch {
    return <span className="text-xs text-slate-500 truncate">{jsonStr.slice(0, 50)}</span>
  }
}

export default function AuditLogs() {
  const [page, setPage] = useState(1)
  const [actionFilter, setActionFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const PAGE_SIZE = 50

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, actionFilter, entityFilter],
    queryFn: () => {
      const params = { page, page_size: PAGE_SIZE }
      if (actionFilter) params.action_type = actionFilter
      if (entityFilter) params.entity_type = entityFilter
      return auditAPI.list(params)
    },
    keepPreviousData: true,
  })

  const logs = data?.logs || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const fmt = (d) =>
    new Date(d).toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })

  const clearFilters = () => {
    setActionFilter('')
    setEntityFilter('')
    setPage(1)
  }

  return (
    <div className="h-full flex flex-col">
      <div className="section-header">
        <div className="flex items-center gap-3">
          <ScrollText className="w-5 h-5 text-slate-300" />
          <h1 className="text-base font-semibold text-white">Audit Logs</h1>
          <span className="chip-neutral">{total.toLocaleString()} events</span>
        </div>
      </div>

      <div className="px-8 py-3 border-b border-surface-700/50 bg-surface-800/30 flex items-center gap-3 flex-shrink-0">
        <Filter className="w-3.5 h-3.5 text-slate-500" />
        <select
          className="input py-1.5 text-xs w-48"
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1) }}
        >
          <option value="">All Action Types</option>
          {ACTION_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select
          className="input py-1.5 text-xs w-36"
          value={entityFilter}
          onChange={(e) => { setEntityFilter(e.target.value); setPage(1) }}
        >
          <option value="">All Entities</option>
          {ENTITY_TYPES.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        {(actionFilter || entityFilter) && (
          <button className="btn-ghost text-xs py-1 px-2" onClick={clearFilters}>Clear filters</button>
        )}
      </div>

      <div className="flex-1 overflow-auto px-8 py-4">
        <div className="surface-panel overflow-hidden">
          <table className="w-full text-sm oracle-grid-table">
            <thead>
              <tr className="border-b border-surface-700">
                <th className="px-4 py-3 text-left text-xs text-slate-500 font-medium w-36">Timestamp</th>
                <th className="px-4 py-3 text-left text-xs text-slate-500 font-medium w-28">User</th>
                <th className="px-4 py-3 text-left text-xs text-slate-500 font-medium w-44">Action</th>
                <th className="px-4 py-3 text-left text-xs text-slate-500 font-medium w-24">Entity</th>
                <th className="px-4 py-3 text-left text-xs text-slate-500 font-medium w-16">Entity ID</th>
                <th className="px-4 py-3 text-left text-xs text-slate-500 font-medium">Metadata</th>
                <th className="px-4 py-3 text-left text-xs text-slate-500 font-medium w-24">IP</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-brand-500 border-t-transparent mx-auto" />
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500 text-sm">
                    No audit log entries found.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-b border-surface-700/40 hover:bg-surface-700/20 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Clock className="w-3 h-3 text-slate-600 flex-shrink-0" />
                        {fmt(log.timestamp)}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5 text-xs">
                        <User className="w-3 h-3 text-slate-600 flex-shrink-0" />
                        <span className="text-slate-300">{log.username || 'system'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={clsx(
                        'text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wide',
                        ACTION_COLORS[log.action_type] || 'bg-surface-700 text-slate-400 border-surface-600'
                      )}>
                        {log.action_type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400 capitalize">{log.entity_type || '-'}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{log.entity_id ?? '-'}</td>
                    <td className="px-4 py-2.5">
                      <MetadataCell jsonStr={log.metadata_json} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 font-mono">{log.ip_address || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-xs text-slate-400">
            <span>
              Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()} events
            </span>
            <div className="flex items-center gap-1">
              <button
                className={clsx('flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors',
                  page === 1 ? 'text-slate-600 cursor-not-allowed' : 'text-slate-400 hover:text-slate-200 hover:bg-surface-700'
                )}
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const pg = i + 1
                return (
                  <button
                    key={pg}
                    className={clsx('w-7 h-7 rounded-lg text-xs transition-colors',
                      page === pg ? 'bg-brand-600 text-slate-900' : 'text-slate-400 hover:bg-surface-700'
                    )}
                    onClick={() => setPage(pg)}
                  >
                    {pg}
                  </button>
                )
              })}
              <button
                className={clsx('flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors',
                  page === totalPages ? 'text-slate-600 cursor-not-allowed' : 'text-slate-400 hover:text-slate-200 hover:bg-surface-700'
                )}
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
