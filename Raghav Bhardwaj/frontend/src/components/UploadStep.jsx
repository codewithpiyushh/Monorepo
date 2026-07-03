import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import {
  AlertCircle, ArrowLeft, ArrowRight, CheckCircle2,
  Database, FileUp, Info, Link2, Upload, X, Eye, EyeOff,
} from 'lucide-react'
import { datasetsAPI } from '../api'

const SOURCE_TYPES = [
  { id: 'file', label: 'File Upload',     icon: FileUp,   hint: 'CSV / XLSX' },
  { id: 'api',  label: 'API Connection',  icon: Link2,    hint: 'REST endpoint' },
  { id: 'sql',  label: 'SQL Connection',  icon: Database, hint: 'PG / MySQL / MSSQL' },
]

const INIT_CONNECTION = {
  file: {},
  api:  { url: '', authType: 'None', headers: '' },
  sql:  { dbType: 'PostgreSQL', host: '', port: '', username: '', database: '' },
}

const CLASSIFICATION_OPTIONS = [
  { value: 'FACT', label: 'FACT', subtitle: 'Transaction-level' },
  { value: 'DIM',  label: 'DIM',  subtitle: 'Master / reference' },
]

function StatusChip({ ok, label }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 700,
      padding: '2px 8px', borderRadius: 9999,
      border: `1px solid ${ok ? 'rgba(34,211,160,0.30)' : 'var(--border-1)'}`,
      background: ok ? 'rgba(34,211,160,0.10)' : 'var(--surface-3)',
      color: ok ? 'var(--ok)' : 'var(--text-tertiary)',
    }}>
      {ok && <CheckCircle2 style={{ width: 11, height: 11 }} />}
      {label}
    </span>
  )
}

/* ─────────────────────────────────────────────────────────────────
   PREVIEW MODAL  —  full-screen, column toggles in table header
───────────────────────────────────────────────────────────────── */
function PreviewModal({
  dsLabel, dsType, preview, classification,
  columnClassifications, onClassifyColumn, onMarkAll,
  onClassificationChange, onClose,
}) {
  const rows    = preview?.rows    || []
  const columns = preview?.columns || []
  const visibleCols = columns.filter((c) => columnClassifications[c] !== 'SKIP')

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const fmtVal = (v) => {
    if (v == null || v === '') return '—'
    return String(v)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', flexDirection: 'column',
      background: 'var(--surface-0)',
    }}>
      {/* ── Top bar ── */}
      <div style={{
        height: 52, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px',
        background: 'var(--surface-1)',
        borderBottom: '1px solid var(--border-1)',
        gap: 12,
      }}>
        {/* Left */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 'var(--r-md)',
              border: '1px solid var(--border-2)',
              background: 'var(--surface-3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text-secondary)',
            }}
          >
            <ArrowLeft style={{ width: 14, height: 14 }} />
          </button>
          <div style={{ width: 1, height: 20, background: 'var(--border-1)' }} />
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-tertiary)', lineHeight: 1 }}>
              {dsType}
            </p>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2, marginTop: 2 }}>
              {dsLabel} — Preview Data
            </p>
          </div>
        </div>

        {/* Center: status chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <StatusChip ok={rows.length > 0}    label="Preview loaded" />
          <StatusChip ok={columns.length > 0} label={`${visibleCols.length} of ${columns.length} cols`} />
        </div>

        {/* Right side was moved to footer */}
      </div>

      {/* ── Sub-toolbar: col count + select/clear ── */}
      <div style={{
        height: 36, flexShrink: 0,
        display: 'flex', alignItems: 'center',
        padding: '0 16px', gap: 12,
        background: 'var(--surface-1)',
        borderBottom: '1px solid var(--border-1)',
      }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)' }}>
          Raw Data Preview
        </p>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          Top {rows.length} rows · {visibleCols.length} of {columns.length} columns visible
        </span>
        <div style={{ marginLeft: 8, display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => onMarkAll('DIM')}
            style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            All DIM
          </button>
          <span style={{ color: 'var(--text-disabled)' }}>·</span>
          <button
            type="button"
            onClick={() => onMarkAll('FACT')}
            style={{ fontSize: 11, fontWeight: 600, color: 'var(--ok)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            All FACT
          </button>
          <span style={{ color: 'var(--text-disabled)' }}>·</span>
          <button
            type="button"
            onClick={() => onMarkAll('SKIP')}
            style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Skip All
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div style={{ flex: 1, overflow: 'auto' }} className="slim-scroll">
        <table style={{
          width: '100%',
          borderCollapse: 'separate',
          borderSpacing: 0,
          tableLayout: 'fixed',
        }}>
          {/* ── HEADER with inline column toggles ── */}
          <thead>
            <tr style={{ background: 'var(--surface-2)' }}>
              {columns.map((col, idx) => {
                const colClass = columnClassifications[col] || 'DIM'
                const hidden  = colClass === 'SKIP'
                const isLast  = idx === columns.length - 1
                
                const headerColor = colClass === 'FACT' ? 'var(--ok)' : colClass === 'DIM' ? 'var(--accent)' : 'var(--text-tertiary)'
                const headerBg = colClass === 'FACT' ? 'rgba(34,211,160,0.05)' : colClass === 'DIM' ? 'rgba(99,102,241,0.05)' : 'var(--surface-2)'

                return (
                  <th
                    key={col}
                    style={{
                      position: 'sticky', top: 0, zIndex: 2,
                      background: headerBg,
                      borderBottom: `2px solid ${hidden ? 'var(--border-1)' : headerColor}`,
                      borderRight: isLast ? 'none' : '1px solid var(--border-1)',
                      padding: '0 0 0 0',
                      minWidth: 160,
                      opacity: hidden ? 0.45 : 1,
                      transition: 'all 150ms',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', padding: '8px 12px 6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 8 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase',
                          color: hidden ? 'var(--text-disabled)' : headerColor,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {col}
                        </span>
                      </div>

                      <div style={{
                        display: 'flex', alignItems: 'center',
                        background: 'var(--surface-3)', borderRadius: 'var(--r-sm)',
                        padding: 2, gap: 2, border: '1px solid var(--border-1)',
                      }}>
                        {['SKIP', 'DIM', 'FACT'].map((type) => {
                          const active = colClass === type
                          const activeColor = type === 'FACT' ? 'var(--ok)' : type === 'DIM' ? 'var(--accent)' : 'var(--text-primary)'
                          return (
                            <button
                              key={type}
                              type="button"
                              onClick={() => onClassifyColumn(col, type)}
                              style={{
                                flex: 1, height: 20, padding: 0,
                                background: active ? (type === 'SKIP' ? 'var(--surface-4)' : 'var(--surface-1)') : 'transparent',
                                color: active ? activeColor : 'var(--text-tertiary)',
                                border: active ? '1px solid var(--border-2)' : '1px solid transparent',
                                borderRadius: 'var(--r-xs)',
                                fontSize: 9.5, fontWeight: active ? 700 : 500,
                                cursor: 'pointer', transition: 'all 150ms',
                              }}
                            >
                              {type}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>

          {/* ── BODY ── */}
          <tbody>
            {rows.map((row, rIdx) => (
              <tr
                key={rIdx}
                style={{ background: rIdx % 2 === 0 ? 'var(--surface-2)' : 'var(--surface-1)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-3)'}
                onMouseLeave={(e) => e.currentTarget.style.background = rIdx % 2 === 0 ? 'var(--surface-2)' : 'var(--surface-1)'}
              >
                {columns.map((col, cIdx) => {
                  const colClass = columnClassifications[col] || 'DIM'
                  const hidden = colClass === 'SKIP'
                  const isLast = cIdx === columns.length - 1
                  return (
                    <td
                      key={col}
                      style={{
                        fontSize: 12.5,
                        color: hidden ? 'var(--text-disabled)' : 'var(--text-primary)',
                        padding: '0 12px',
                        height: 36,
                        borderBottom: '1px solid var(--border-0)',
                        borderRight: isLast ? 'none' : '1px solid var(--border-0)',
                        verticalAlign: 'middle',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: 220,
                        fontFamily: hidden ? 'inherit' : (
                          ['amount','balance','count','qty','quantity'].some((k) => col.toLowerCase().includes(k)) || colClass === 'FACT'
                            ? 'IBM Plex Mono, monospace' : 'inherit'
                        ),
                        opacity: hidden ? 0.35 : 1,
                        transition: 'opacity 150ms',
                      }}
                    >
                      {hidden ? '—' : fmtVal(row[col])}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {rows.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
            No rows to preview
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{
        height: 60, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        padding: '0 20px',
        background: 'var(--surface-1)',
        borderTop: '1px solid var(--border-1)',
      }}>
        <button
          type="button"
          onClick={onClose}
          className="btn-primary"
          style={{ cursor: 'pointer', minWidth: 120 }}
        >
          Save &amp; Close
        </button>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
   DATASET CARD
───────────────────────────────────────────────────────────────── */
function DatasetCard({ label, type, projectId, existingDataset, onUploaded, onReadyChange }) {
  const [dataset,        setDataset]        = useState(existingDataset || null)
  const [preview,        setPreview]        = useState(null)
  const [sourceType,     setSourceType]     = useState('file')
  const [connection,     setConnection]     = useState(INIT_CONNECTION)
  const [uploading,      setUploading]      = useState(false)
  const [showPreview,    setShowPreview]    = useState(false)
  const [columnClassifications, setColumnClassifications] = useState({}) // { col: 'FACT' | 'DIM' | 'SKIP' }

  useEffect(() => { setDataset(existingDataset || null) }, [existingDataset])

  useEffect(() => {
    if (!dataset) { setPreview(null); setColumnClassifications({}); return }
    let cancelled = false
    datasetsAPI.preview(projectId, dataset.id, 50)
      .then((pv) => { 
        if (!cancelled) { 
          setPreview(pv);
          // Smart Auto-Detection
          const cls = {}
          const firstRow = pv.rows?.[0] || {}
          pv.columns?.forEach(col => {
            const val = firstRow[col]
            if (typeof val === 'number' || (typeof val === 'string' && !isNaN(parseFloat(val)) && val.trim() !== '')) {
              const lower = col.toLowerCase()
              if (lower.includes('id') || lower.includes('code') || lower.includes('num')) {
                cls[col] = 'DIM'
              } else {
                cls[col] = 'FACT'
              }
            } else {
              cls[col] = 'DIM'
            }
          })
          setColumnClassifications(cls)
        } 
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [dataset, projectId])

  useEffect(() => { if (dataset) onUploaded(dataset) }, [dataset, onUploaded])

  const columns = preview?.columns || dataset?.columns?.map((c) => c.column_name) || []
  const ready   = Boolean(dataset && preview)

  useEffect(() => { onReadyChange(type, ready) }, [onReadyChange, ready, type])

  const onDrop = useCallback(async (files) => {
    const file = files[0]
    if (!file) return
    setUploading(true)
    try {
      const ds = await datasetsAPI.upload(projectId, type, file)
      const pv = await datasetsAPI.preview(projectId, ds.id, 50)
      setDataset(ds)
      setPreview(pv)
      setColumnClassifications({})
      toast.success(`${label} uploaded — ${ds.row_count} rows`)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }, [label, projectId, type])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
    maxFiles: 1,
    disabled: uploading || sourceType !== 'file',
  })

  const factCount = Object.values(columnClassifications).filter(c => c === 'FACT').length
  const dimCount = Object.values(columnClassifications).filter(c => c === 'DIM').length

  const chips = [
    { label: dataset ? `${dataset.row_count?.toLocaleString()} rows` : 'No file',       ok: !!dataset },
    { label: preview  ? `${columns.length} cols` : 'Preview pending',                   ok: !!preview  },
    { label: ready ? `${factCount} facts · ${dimCount} dims` : 'Schema pending',        ok: ready && (factCount > 0 || dimCount > 0) },
    { label: ready ? 'Ready' : 'Pending',                                                ok: ready  },
  ]

  return (
    <>
      <div style={{
        background: 'var(--surface-2)',
        border: `1px solid ${ready ? 'var(--ok-bdr)' : 'var(--border-1)'}`,
        borderRadius: 'var(--r-lg)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        transition: 'border-color 200ms',
      }}>
        {/* Card header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px',
          background: 'var(--surface-1)',
          borderBottom: '1px solid var(--border-1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em',
              textTransform: 'uppercase', padding: '2px 7px',
              borderRadius: 'var(--r-xs)',
              background: 'var(--surface-4)', color: 'var(--text-secondary)',
              border: '1px solid var(--border-2)',
            }}>
              {type}
            </span>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{label}</p>
          </div>
          {ready && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, color: 'var(--ok)' }}>
              <CheckCircle2 style={{ width: 13, height: 13 }} /> Ready
            </span>
          )}
        </div>

        {/* Source type tabs */}
        <div style={{ display: 'flex', gap: 2, padding: '8px 14px 0' }}>
          {SOURCE_TYPES.map(({ id, label: lbl, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSourceType(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                height: 30, padding: '0 10px',
                borderRadius: 'var(--r-sm) var(--r-sm) 0 0',
                border: '1px solid transparent',
                borderBottom: 'none',
                fontSize: 11.5, fontWeight: 600,
                background: sourceType === id ? 'var(--surface-3)' : 'transparent',
                color: sourceType === id ? 'var(--text-primary)' : 'var(--text-tertiary)',
                borderColor: sourceType === id ? 'var(--border-1)' : 'transparent',
                cursor: 'pointer',
                transition: 'background 100ms, color 100ms',
              }}
            >
              <Icon style={{ width: 12, height: 12 }} />
              {lbl}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{
          flex: 1, padding: 14,
          background: 'var(--surface-2)',
          borderTop: '1px solid var(--border-1)',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {/* File upload zone */}
          {sourceType === 'file' && (
            <div
              {...getRootProps()}
              style={{
                border: `2px dashed ${isDragActive ? 'var(--accent)' : dataset ? 'var(--ok-bdr)' : 'var(--border-2)'}`,
                borderRadius: 'var(--r-md)',
                padding: '18px 12px',
                textAlign: 'center',
                cursor: 'pointer',
                background: isDragActive ? 'var(--accent-subtle)' : dataset ? 'var(--ok-bg)' : 'var(--surface-3)',
                transition: 'all 150ms',
              }}
            >
              <input {...getInputProps()} />
              {uploading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div className="animate-spin" style={{ width: 24, height: 24, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%' }} />
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Uploading…</p>
                </div>
              ) : dataset ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <CheckCircle2 style={{ width: 22, height: 22, color: 'var(--ok)' }} />
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ok)', margin: 0 }}>{dataset.file_name}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>Drop a new file to replace</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <Upload style={{ width: 22, height: 22, color: 'var(--text-tertiary)' }} />
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
                    {isDragActive ? 'Drop the file…' : 'Drag & drop or click to upload'}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>CSV or XLSX</p>
                </div>
              )}
            </div>
          )}

          {sourceType === 'api' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input className="input" placeholder="API URL https://..." value={connection.api.url}
                onChange={(e) => setConnection({ ...connection, api: { ...connection.api, url: e.target.value } })} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <select className="input" value={connection.api.authType}
                  onChange={(e) => setConnection({ ...connection, api: { ...connection.api, authType: e.target.value } })}>
                  <option>None</option><option>Bearer Token</option><option>Basic Auth</option><option>API Key</option>
                </select>
                <input className="input" placeholder='{"X-Key": "..."}' value={connection.api.headers}
                  onChange={(e) => setConnection({ ...connection, api: { ...connection.api, headers: e.target.value } })} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-tertiary)', background: 'var(--surface-3)', borderRadius: 'var(--r-sm)', padding: '6px 10px', border: '1px solid var(--border-1)' }}>
                <Info style={{ width: 12, height: 12, color: 'var(--accent)', flexShrink: 0 }} />
                Upload a real source extract here to preview the columns that will be mapped into the live project.
              </div>
              <div {...getRootProps()} style={{ border: '1px dashed var(--border-2)', borderRadius: 'var(--r-md)', padding: '12px', textAlign: 'center', cursor: 'pointer' }}>
                <input {...getInputProps()} />
                {dataset
                  ? <p style={{ fontSize: 12, color: 'var(--ok)', fontWeight: 600 }}>{dataset.file_name}</p>
                  : <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Upload source data for preview</p>}
              </div>
            </div>
          )}

          {sourceType === 'sql' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <select className="input" value={connection.sql.dbType}
                  onChange={(e) => setConnection({ ...connection, sql: { ...connection.sql, dbType: e.target.value } })}>
                  <option>PostgreSQL</option><option>MySQL</option><option>SQL Server</option><option>Oracle</option>
                </select>
                <input className="input" placeholder="Host" value={connection.sql.host}
                  onChange={(e) => setConnection({ ...connection, sql: { ...connection.sql, host: e.target.value } })} />
                <input className="input" placeholder="Port" value={connection.sql.port}
                  onChange={(e) => setConnection({ ...connection, sql: { ...connection.sql, port: e.target.value } })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input className="input" placeholder="Username" value={connection.sql.username}
                  onChange={(e) => setConnection({ ...connection, sql: { ...connection.sql, username: e.target.value } })} />
                <input className="input" placeholder="Database" value={connection.sql.database}
                  onChange={(e) => setConnection({ ...connection, sql: { ...connection.sql, database: e.target.value } })} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-tertiary)', background: 'var(--surface-3)', borderRadius: 'var(--r-sm)', padding: '6px 10px', border: '1px solid var(--border-1)' }}>
                <Info style={{ width: 12, height: 12, color: 'var(--accent)', flexShrink: 0 }} />
                Upload a real target extract here to preview the columns that will be mapped into the live project.
              </div>
              <div {...getRootProps()} style={{ border: '1px dashed var(--border-2)', borderRadius: 'var(--r-md)', padding: '12px', textAlign: 'center', cursor: 'pointer' }}>
                <input {...getInputProps()} />
                {dataset
                  ? <p style={{ fontSize: 12, color: 'var(--ok)', fontWeight: 600 }}>{dataset.file_name}</p>
                  : <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Upload target data for preview</p>}
              </div>
            </div>
          )}

          {/* Status chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {chips.map(({ label: chipLabel, ok }) => (
              <StatusChip key={chipLabel} ok={ok} label={chipLabel} />
            ))}
          </div>
        </div>

        {/* Card footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px',
          borderTop: '1px solid var(--border-1)',
          background: 'var(--surface-1)',
        }}>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {ready
              ? `${columns.length} columns · ${(preview?.rows || []).length} rows previewed`
              : dataset
              ? 'Click Preview to inspect the uploaded data'
              : 'Upload data first'}
          </p>
          <button
            type="button"
            disabled={!dataset}
            onClick={() => setShowPreview(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              height: 28, padding: '0 10px',
              borderRadius: 'var(--r-md)',
              fontSize: 11.5, fontWeight: 600,
              background: dataset ? 'var(--accent-subtle)' : 'var(--surface-3)',
              border: `1px solid ${dataset ? 'var(--accent-border)' : 'var(--border-1)'}`,
              color: dataset ? 'var(--accent)' : 'var(--text-disabled)',
              cursor: dataset ? 'pointer' : 'not-allowed',
              opacity: dataset ? 1 : 0.5,
              transition: 'background 100ms',
            }}
          >
            <Database style={{ width: 12, height: 12 }} />
            Preview Data
          </button>
        </div>
      </div>

      {showPreview && (
        <PreviewModal
          dsLabel={label}
          dsType={type}
          preview={preview}
          columnClassifications={columnClassifications}
          onClassifyColumn={(col, cType) => setColumnClassifications(prev => ({ ...prev, [col]: cType }))}
          onMarkAll={(cType) => {
            const cls = {}
            columns.forEach(c => cls[c] = cType)
            setColumnClassifications(cls)
          }}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  )
}

/* ─────────────────────────────────────────────────────────────────
   UPLOAD STEP (parent)
───────────────────────────────────────────────────────────────── */
export default function UploadStep({ project, datasets, onNext, onBack }) {
  const [sourceDs, setSourceDs] = useState(datasets?.find((d) => d.dataset_type === 'source') || null)
  const [targetDs, setTargetDs] = useState(datasets?.find((d) => d.dataset_type === 'target') || null)
  const [readyState, setReadyState] = useState({ source: false, target: false })

  useEffect(() => {
    setSourceDs(datasets?.find((d) => d.dataset_type === 'source') || null)
    setTargetDs(datasets?.find((d) => d.dataset_type === 'target') || null)
  }, [datasets])

  const handleReadyChange = useCallback((type, ready) => {
    setReadyState((s) => ({ ...s, [type]: ready }))
  }, [])

  const canProceed = sourceDs && targetDs && readyState.source && readyState.target

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px',
        borderBottom: '1px solid var(--border-1)',
        background: 'var(--surface-1)',
      }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: 0 }}>
            Data Ingestion
          </p>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', margin: '2px 0 0' }}>
            Configure Source &amp; Target Datasets
          </p>
        </div>
        {onBack && (
          <button type="button" className="btn-secondary btn-sm" onClick={onBack}>
            <ArrowLeft style={{ width: 13, height: 13 }} /> Back
          </button>
        )}
      </div>

      {/* Cards */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          <DatasetCard label="Source Data" type="source" projectId={project.id}
            existingDataset={sourceDs} onUploaded={setSourceDs} onReadyChange={handleReadyChange} />
          <DatasetCard label="Target Data" type="target" projectId={project.id}
            existingDataset={targetDs} onUploaded={setTargetDs} onReadyChange={handleReadyChange} />
        </div>
      </div>

      {/* Footer */}
      <div style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px',
        borderTop: '1px solid var(--border-1)',
        background: 'var(--surface-1)',
      }}>
        <div>
          {!canProceed && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--warn)' }}>
              <AlertCircle style={{ width: 13, height: 13 }} />
              Configure both Source and Target datasets to continue
            </span>
          )}
        </div>
        <button
          className="btn-primary"
          disabled={!canProceed}
          onClick={() => onNext({ source: sourceDs, target: targetDs })}
        >
          Save and Continue to Mapping
          <ArrowRight style={{ width: 13, height: 13 }} />
        </button>
      </div>
    </div>
  )
}
