import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useOutletContext } from 'react-router-dom'
import { auditAPI } from '../api'
import { Filter, ChevronLeft, ChevronRight, User, Clock, Download, Search, X } from 'lucide-react'
import clsx from 'clsx'
import { EmptyState, LoadingState } from '../components/ui/PageState'

const ACTION_META = {
  USER_LOGIN: { color: 'badge-neutral', label: 'Login' },
  USER_REGISTERED: { color: 'badge-neutral', label: 'Register' },
  PROJECT_CREATED: { color: 'badge-success', label: 'Project Created' },
  PROJECT_UPDATED: { color: 'badge-warning', label: 'Project Updated' },
  PROJECT_DELETED: { color: 'badge-danger', label: 'Project Deleted' },
  DATASET_UPLOADED: { color: 'badge-info', label: 'Dataset Upload' },
  MAPPINGS_SAVED: { color: 'badge-neutral', label: 'Mappings Saved' },
  RULE_CREATED: { color: 'badge-accent', label: 'Rule Created' },
  RULE_UPDATED: { color: 'badge-warning', label: 'Rule Updated' },
  RULE_DELETED: { color: 'badge-danger', label: 'Rule Deleted' },
  EXECUTION_STARTED: { color: 'badge-accent', label: 'Execution' },
}

const ACTION_TYPES = Object.keys(ACTION_META)
const ENTITY_TYPES = ['user', 'project', 'dataset', 'rule', 'execution']

function MetadataCell({ jsonStr }) {
  if (!jsonStr) return <span style={{ color: '#94a3b8' }}>-</span>
  try {
    const obj = JSON.parse(jsonStr)
    const pairs = Object.entries(obj).slice(0, 3)
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {pairs.map(([k, v]) => (
          <span
            key={k}
            style={{
              fontSize: 10.5,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: '1px 6px',
              color: '#475569',
              fontFamily: 'IBM Plex Mono, monospace',
            }}
          >
            <span style={{ color: '#94a3b8' }}>{k}:</span> {String(v).slice(0, 24)}
          </span>
        ))}
      </div>
    )
  } catch {
    return (
      <span style={{ fontSize: 11.5, color: '#475569', fontFamily: 'IBM Plex Mono, monospace' }}>
        {String(jsonStr).slice(0, 50)}
      </span>
    )
  }
}

export default function AuditLogs() {
  const { setHeaderOverride } = useOutletContext() || {}
  const [page, setPage] = useState(1)
  const [actionFilter, setActionFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const [search, setSearch] = useState('')
  const PAGE_SIZE = 15

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
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilters = actionFilter || entityFilter

  const fmt = (d) =>
    new Date(d).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

  const clearFilters = () => {
    setActionFilter('')
    setEntityFilter('')
    setPage(1)
  }

  useEffect(() => {
    if (setHeaderOverride) {
      setHeaderOverride(
        <header
          className="bl-header"
          style={{
            padding: '8px 24px',
            height: 56,
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(255,255,255,0.92)',
            borderBottom: '1px solid rgba(148,163,184,0.16)',
          }}
        >
          <div className="flex flex-col min-w-0 flex-shrink-0">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 className="bl-header-title" style={{ margin: 0, fontSize: 16, color: '#0f172a' }}>
                Audit Trail
              </h1>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 18,
                  padding: '0 6px',
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  background: '#eff6ff',
                  color: '#2563eb',
                  border: '1px solid #bfdbfe',
                  borderRadius: 999,
                }}
              >
                {total.toLocaleString()} events
              </span>
            </div>
            <p
              style={{
                fontSize: 11,
                color: '#64748b',
                marginTop: 2,
                lineHeight: 1.2,
                margin: 0,
              }}
            >
              Immutable record of all platform actions for compliance and SOX audit.
            </p>
          </div>
        </header>
      )
    }
    return () => setHeaderOverride?.(null)
  }, [setHeaderOverride, total])

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg, #fafbff 0%, #f5f7fb 52%, #eef2f7 100%)',
        color: '#0f172a',
      }}
    >
      <div
        className="table-toolbar flex-shrink-0"
        style={{
          background: 'rgba(255,255,255,0.9)',
          borderBottom: '1px solid rgba(148,163,184,0.16)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <Filter style={{ width: 13, height: 13, color: '#64748b', flexShrink: 0 }} />

        <select
          className="input h-[26px] text-[12px] w-44"
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value)
            setPage(1)
          }}
        >
          <option value="">All Action Types</option>
          {ACTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {ACTION_META[t]?.label || t}
            </option>
          ))}
        </select>

        <select
          className="input h-[26px] text-[12px] w-36"
          value={entityFilter}
          onChange={(e) => {
            setEntityFilter(e.target.value)
            setPage(1)
          }}
        >
          <option value="">All Entities</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t} style={{ textTransform: 'capitalize' }}>
              {t}
            </option>
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
            <input
              className="input h-[26px] text-[12px]"
              placeholder="Search logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginLeft: 8, marginRight: 8, whiteSpace: 'nowrap' }}>
            Page {page}/{totalPages}
          </div>
          <button className="btn-secondary btn-sm h-[26px] flex items-center gap-1" style={{ fontSize: 11 }}>
            <Download style={{ width: 11, height: 11 }} />
            Export
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', padding: 16 }}>
        <div
          style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(255,255,255,0.9)',
            border: '1px solid rgba(148,163,184,0.22)',
            borderRadius: 18,
            boxShadow: '0 16px 40px rgba(15,23,42,0.06)',
            overflow: 'hidden',
          }}
        >
          <div style={{ flex: 1, overflow: 'auto' }}>
            {isLoading ? (
              <LoadingState message="Loading audit trail..." />
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
                              <Clock style={{ width: 11, height: 11, color: '#94a3b8', flexShrink: 0 }} />
                              <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: '#334155' }}>
                                {fmt(log.timestamp || log.created_at)}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className={clsx('badge', meta.color)}>{meta.label}</span>
                          </td>
                          <td>
                            <span style={{ fontSize: 12, color: '#334155', textTransform: 'capitalize' }}>
                              {log.entity_type || '-'}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11.5, color: '#64748b' }}>
                              {log.entity_id ?? '-'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <div
                                style={{
                                  width: 18,
                                  height: 18,
                                  borderRadius: '50%',
                                  background: '#eff6ff',
                                  border: '1px solid #bfdbfe',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}
                              >
                                <User style={{ width: 9, height: 9, color: '#2563eb' }} />
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 500, color: '#0f172a' }}>
                                {log.username || log.user_id || '-'}
                              </span>
                            </div>
                          </td>
                          <td style={{ maxWidth: 280 }}>
                            <MetadataCell jsonStr={log.metadata || log.extra_data} />
                          </td>
                          <td>
                            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: '#64748b' }}>
                              {log.ip_address || '-'}
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

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 16px',
              background: '#f8fafc',
              borderTop: '1px solid #e2e8f0',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 11.5, color: '#64748b' }}>
              Showing {((page - 1) * PAGE_SIZE) + 1}-{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()} events
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn-secondary btn-sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                <ChevronLeft style={{ width: 12, height: 12 }} />
                Previous
              </button>
              <button className="btn-secondary btn-sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>
                Next
                <ChevronRight style={{ width: 12, height: 12 }} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
