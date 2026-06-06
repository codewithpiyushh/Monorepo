import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { auditAPI } from '../api'
import { ScrollText, Filter, ChevronLeft, ChevronRight, User, Clock, Download, Search, X } from 'lucide-react'
import clsx from 'clsx'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, LoadingState } from '../components/ui/PageState'

const ACTION_META = {
  USER_LOGIN:        { color: 'badge-neutral', label: 'Login' },
  USER_REGISTERED:   { color: 'badge-neutral', label: 'Register' },
  PROJECT_CREATED:   { color: 'badge-success', label: 'Project Created' },
  PROJECT_UPDATED:   { color: 'badge-warning', label: 'Project Updated' },
  PROJECT_DELETED:   { color: 'badge-danger',  label: 'Project Deleted' },
  DATASET_UPLOADED:  { color: 'badge-info',    label: 'Dataset Upload' },
  MAPPINGS_SAVED:    { color: 'badge-neutral', label: 'Mappings Saved' },
  RULE_CREATED:      { color: 'badge-accent',  label: 'Rule Created' },
  RULE_UPDATED:      { color: 'badge-warning', label: 'Rule Updated' },
  RULE_DELETED:      { color: 'badge-danger',  label: 'Rule Deleted' },
  EXECUTION_STARTED: { color: 'badge-accent',  label: 'Execution' },
}

const ACTION_TYPES = Object.keys(ACTION_META)
const ENTITY_TYPES = ['user', 'project', 'dataset', 'rule', 'execution']

function MetadataCell({ jsonStr }) {
  if (!jsonStr) return <span style={{ color: 'var(--text-disabled)' }}>—</span>
  try {
    const obj = JSON.parse(jsonStr)
    const pairs = Object.entries(obj).slice(0, 3)
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {pairs.map(([k, v]) => (
          <span key={k} style={{
            fontSize: 10.5, background: 'var(--surface-3)', border: '1px solid var(--border-1)',
            borderRadius: 'var(--r-xs)', padding: '1px 6px', color: 'var(--text-secondary)',
            fontFamily: 'IBM Plex Mono, monospace',
          }}>
            <span style={{ color: 'var(--text-tertiary)' }}>{k}:</span>{' '}
            {String(v).slice(0, 24)}
          </span>
        ))}
      </div>
    )
  } catch {
    return <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontFamily: 'IBM Plex Mono, monospace' }}>
      {String(jsonStr).slice(0, 50)}
    </span>
  }
}

export default function AuditLogs() {
  const [page, setPage] = useState(1)
  const [actionFilter, setActionFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const [search, setSearch] = useState('')
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

  const hasFilters = actionFilter || entityFilter
  const clearFilters = () => { setActionFilter(''); setEntityFilter(''); setPage(1) }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title="Audit Trail"
        subtitle="Immutable record of all platform actions for compliance and SOX audit."
        badge={`${total.toLocaleString()} events`}
        actions={
          <button className="btn-secondary btn-sm">
            <Download style={{ width: 12, height: 12 }} />
            Export
          </button>
        }
      />

      {/* Toolbar */}
      <div className="table-toolbar flex-shrink-0">
        <Filter style={{ width: 13, height: 13, color: 'var(--text-tertiary)', flexShrink: 0 }} />

        <select className="input h-[26px] text-[12px] w-44"
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1) }}>
          <option value="">All Action Types</option>
          {ACTION_TYPES.map((t) => <option key={t} value={t}>{ACTION_META[t]?.label || t}</option>)}
        </select>

        <select className="input h-[26px] text-[12px] w-36"
          value={entityFilter}
          onChange={(e) => { setEntityFilter(e.target.value); setPage(1) }}>
          <option value="">All Entities</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t} style={{ textTransform: 'capitalize' }}>{t}</option>
          ))}
        </select>

        {hasFilters && (
          <button className="btn-ghost btn-sm" onClick={clearFilters}>
            <X style={{ width: 11, height: 11 }} />
            Clear
          </button>
        )}

        <div className="table-toolbar-right">
          <div className="global-search" style={{ width: 200 }}>
            <Search className="global-search-icon" style={{ width: 12, height: 12 }} />
            <input className="input h-[26px] text-[12px]" placeholder="Search logs..."
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 8, whiteSpace: 'nowrap' }}>
            Page {page}/{totalPages || 1}
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }} className="slim-scroll">
        {isLoading ? (
          <LoadingState />
        ) : logs.length === 0 ? (
          <EmptyState title="No audit events" description="Filters may be too restrictive." />
        ) : (
          <div className="data-table-wrap" style={{ borderRadius: 0, border: 'none' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 160 }}>Timestamp</th>
                  <th style={{ width: 120 }}>Action</th>
                  <th style={{ width: 100 }}>Entity Type</th>
                  <th style={{ width: 80 }}>Entity ID</th>
                  <th style={{ width: 130 }}>
                    <User style={{ display: 'inline', width: 10, height: 10, marginRight: 4 }} />
                    User
                  </th>
                  <th>Metadata</th>
                  <th style={{ width: 90 }}>IP Address</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const meta = ACTION_META[log.action_type] || { color: 'badge-neutral', label: log.action_type }
                  return (
                    <tr key={log.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Clock style={{ width: 11, height: 11, color: 'var(--text-tertiary)', flexShrink: 0 }} />
                          <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}>
                            {fmt(log.timestamp || log.created_at)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={clsx('badge', meta.color)}>{meta.label}</span>
                      </td>
                      <td>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                          {log.entity_type || '—'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                          {log.entity_id ?? '—'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <div style={{
                            width: 18, height: 18, borderRadius: '50%',
                            background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            <User style={{ width: 9, height: 9, color: 'var(--accent-hover)' }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
                            {log.username || log.user_id || '—'}
                          </span>
                        </div>
                      </td>
                      <td style={{ maxWidth: 280 }}>
                        <MetadataCell jsonStr={log.metadata || log.extra_data} />
                      </td>
                      <td>
                        <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: 'var(--text-tertiary)' }}>
                          {log.ip_address || '—'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px',
        background: 'var(--surface-1)',
        borderTop: '1px solid var(--border-1)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
          Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()} events
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn-secondary btn-sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            <ChevronLeft style={{ width: 12, height: 12 }} />
            Previous
          </button>
          <button className="btn-secondary btn-sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            Next
            <ChevronRight style={{ width: 12, height: 12 }} />
          </button>
        </div>
      </div>
    </div>
  )
}
