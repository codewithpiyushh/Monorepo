import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { AgGridReact } from 'ag-grid-react'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Columns3,
  Database,
  FileUp,
  GripVertical,
  Info,
  Layers,
  Link2,
  Search,
  Server,
  Settings2,
  Upload,
  X,
  Zap,
} from 'lucide-react'
import { datasetsAPI } from '../api'

// ─── constants ────────────────────────────────────────────────────────────────

const SOURCE_TYPES = [
  { id: 'file',  label: 'File Upload',     icon: FileUp,   hint: 'CSV / XLSX' },
  { id: 'api',   label: 'API Connection',  icon: Link2,    hint: 'REST endpoint' },
  { id: 'sql',   label: 'SQL Connection',  icon: Database, hint: 'PG / MySQL / MSSQL' },
]

const CLASSIFICATION_OPTIONS = [
  { value: 'FACT', label: 'FACT', subtitle: 'Transaction-level', icon: Zap,    color: 'brand' },
  { value: 'DIM',  label: 'DIM',  subtitle: 'Master / reference', icon: Layers, color: 'violet' },
]

const REQUIRED_HINTS = ['transaction', 'tran', 'id', 'amount', 'entity', 'currency']

const INIT_CONNECTION = {
  file: {},
  api:  { url: '', authType: 'None', headers: '' },
  sql:  { dbType: 'PostgreSQL', host: '', port: '', username: '', database: '' },
}

function isRequired(col) {
  const n = col.toLowerCase()
  return REQUIRED_HINTS.some((h) => n.includes(h))
}

// ─── tiny reusable status chip ────────────────────────────────────────────────

function StatusChip({ ok, label }) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border',
      ok
        ? 'border-emerald-700/50 bg-emerald-900/20 text-emerald-300'
        : 'border-surface-600/60 bg-surface-800/40 text-slate-500'
    )}>
      {ok && <CheckCircle2 className="w-3 h-3" />}
      {label}
    </span>
  )
}

// ─── ConfigModal ─────────────────────────────────────────────────────────────
// Full-screen overlay: left = AG Grid preview, right = column select + classify

function ConfigModal({ dsLabel, dsType, preview, allColumns, initialSelected, initialClassification, onSave, onClose }) {
  const [selected, setSelected]         = useState(initialSelected || [])
  const [classification, setClass]      = useState(initialClassification || '')
  const [colQuery, setColQuery]         = useState('')
  const [gridQuery, setGridQuery]       = useState('')
  const gridRef = useRef(null)

  const selectedSet  = useMemo(() => new Set(selected), [selected])
  const filteredCols = useMemo(
    () => allColumns.filter((c) => c.toLowerCase().includes(colQuery.toLowerCase())),
    [allColumns, colQuery]
  )

  const rows = preview?.rows || []

  // Grid shows ONLY selected columns, or all if none chosen yet
  const visibleCols = selected.length ? selected : allColumns
  const columnDefs  = useMemo(
    () => visibleCols.map((field) => ({
      field, filter: true, sortable: true, resizable: true, minWidth: 130,
      valueFormatter: (p) => p.value ?? '—',
    })),
    [visibleCols]
  )

  const toggle = (col) =>
    setSelected((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    )

  const move = (col, dir) => {
    const idx = selected.indexOf(col)
    const nxt = idx + dir
    if (idx < 0 || nxt < 0 || nxt >= selected.length) return
    const arr = [...selected]
    ;[arr[idx], arr[nxt]] = [arr[nxt], arr[idx]]
    setSelected(arr)
  }

  const hasRequired = selected.some(isRequired)
  const canSave     = selected.length > 0 && hasRequired && classification

  const handleSave = () => {
    if (!canSave) return
    onSave({ selectedColumns: selected, classification })
  }

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'var(--bg)' }}
    >
      {/* ── Modal header ── */}
      <div
        className="h-14 flex-shrink-0 flex items-center justify-between px-5 border-b border-surface-700/60"
        style={{ background: 'var(--header-bg)' }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost px-2 py-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-surface-600/60" />
          <div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{dsType}</span>
            <p className="text-sm font-bold text-slate-100 leading-tight">{dsLabel} — Configure Dataset</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* live validation chips */}
          <div className="hidden sm:flex items-center gap-2">
            <StatusChip ok={rows.length > 0}    label="Preview loaded" />
            <StatusChip ok={selected.length > 0} label={`${selected.length} cols`} />
            <StatusChip ok={hasRequired}          label="Required cols" />
            <StatusChip ok={!!classification}     label={classification || 'Classify'} />
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={!canSave}
            onClick={handleSave}
          >
            <CheckCircle2 className="w-4 h-4" />
            Save &amp; Close
          </button>
        </div>
      </div>

      {/* ── Body: two panels ── */}
      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">

        {/* LEFT: Data Preview */}
        <div className="flex-1 min-w-0 flex flex-col border-r border-surface-700/40 overflow-hidden">
          <div className="flex-shrink-0 px-4 py-3 border-b border-surface-700/40 flex items-center justify-between gap-3" style={{ background: 'var(--bg-elev)' }}>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Raw Data Preview</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Top {rows.length} rows · {allColumns.length} total columns
                {selected.length > 0 && <> · showing {visibleCols.length} selected</>}
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-surface-700/70 bg-surface-900/40 px-3 h-8">
              <Search className="w-3.5 h-3.5 text-slate-500" />
              <input
                className="w-40 bg-transparent outline-none text-xs text-slate-100 placeholder:text-slate-500"
                placeholder="Search…"
                value={gridQuery}
                onChange={(e) => setGridQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 ag-theme-alpine-dark overflow-hidden">
            <AgGridReact
              ref={gridRef}
              rowData={rows}
              columnDefs={columnDefs}
              quickFilterText={gridQuery}
              suppressCellFocus
              defaultColDef={{ resizable: true, minWidth: 120 }}
            />
          </div>
        </div>

        {/* RIGHT: Column select + Classification */}
        <div className="w-full lg:w-[340px] flex-shrink-0 flex flex-col overflow-hidden" style={{ background: 'var(--bg-elev)' }}>

          {/* Column selector */}
          <div className="flex flex-col overflow-hidden border-b border-surface-700/40" style={{ flex: '1 1 0' }}>
            <div className="flex-shrink-0 px-4 py-3 border-b border-surface-700/40 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-surface-700/70 bg-surface-900/50 px-3 h-8 flex-1">
                <Search className="w-3.5 h-3.5 text-slate-500" />
                <input
                  className="w-full bg-transparent outline-none text-xs text-slate-100 placeholder:text-slate-500"
                  placeholder="Search columns…"
                  value={colQuery}
                  onChange={(e) => setColQuery(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="text-[11px] font-semibold text-brand-400 hover:text-brand-300 whitespace-nowrap"
                onClick={() => setSelected([...allColumns])}
              >All</button>
              <span className="text-slate-600">·</span>
              <button
                type="button"
                className="text-[11px] font-semibold text-slate-500 hover:text-slate-300 whitespace-nowrap"
                onClick={() => setSelected([])}
              >None</button>
            </div>

            {/* Available columns list */}
            <div className="overflow-y-auto" style={{ flex: '1 1 0' }}>
              {filteredCols.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">No columns match.</p>
              ) : filteredCols.map((col) => {
                const checked = selectedSet.has(col)
                const req     = isRequired(col)
                return (
                  <label
                    key={col}
                    className={clsx(
                      'flex items-center gap-2.5 px-4 py-2 text-xs cursor-pointer border-b border-surface-700/30 transition-colors',
                      checked ? 'bg-brand-500/5 text-slate-200' : 'text-slate-400 hover:bg-surface-800/50'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(col)}
                      className="accent-brand-500 flex-shrink-0"
                    />
                    <span className="flex-1 truncate">{col}</span>
                    {req && (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-amber-300 bg-amber-900/30 px-1.5 py-0.5 rounded">req</span>
                    )}
                  </label>
                )
              })}
            </div>
          </div>

          {/* Selected columns (reorder) */}
          <div className="flex flex-col border-b border-surface-700/40" style={{ maxHeight: '200px' }}>
            <div className="flex-shrink-0 px-4 py-2 flex items-center justify-between border-b border-surface-700/40">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Selected <span className="text-brand-400">{selected.length}</span>
              </p>
              {!hasRequired && selected.length > 0 && (
                <span className="text-[10px] text-amber-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Add a required col
                </span>
              )}
            </div>
            <div className="overflow-y-auto flex-1">
              {selected.length === 0 ? (
                <p className="py-4 text-center text-[11px] text-slate-600">No columns selected.</p>
              ) : selected.map((col, i) => (
                <div key={col} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 border-b border-surface-700/20 group">
                  <GripVertical className="w-3 h-3 text-slate-600 flex-shrink-0" />
                  <span className="flex-1 truncate text-[11px]">{col}</span>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" onClick={() => move(col, -1)} disabled={i === 0}           className="px-1 text-slate-500 hover:text-slate-200 disabled:opacity-30">↑</button>
                    <button type="button" onClick={() => move(col, 1)}  disabled={i === selected.length - 1} className="px-1 text-slate-500 hover:text-slate-200 disabled:opacity-30">↓</button>
                    <button type="button" onClick={() => toggle(col)}   className="px-1 text-slate-500 hover:text-red-400">×</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Classification */}
          <div className="flex-shrink-0 p-4 space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Dataset Classification</p>
            <div className="grid grid-cols-2 gap-2">
              {CLASSIFICATION_OPTIONS.map(({ value, label, subtitle, icon: Icon }) => {
                const active = classification === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setClass(value)}
                    className={clsx(
                      'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all duration-150',
                      active
                        ? 'border-brand-500/60 bg-brand-500/10'
                        : 'border-surface-700/60 bg-surface-900/30 hover:border-surface-500/60'
                    )}
                  >
                    <div className={clsx('w-6 h-6 rounded-md flex items-center justify-center', active ? 'bg-brand-500/20' : 'bg-surface-700/60')}>
                      <Icon className={clsx('w-3.5 h-3.5', active ? 'text-brand-400' : 'text-slate-500')} />
                    </div>
                    <p className={clsx('text-xs font-bold', active ? 'text-slate-100' : 'text-slate-400')}>{label}</p>
                    <p className="text-[10px] text-slate-500 leading-tight">{subtitle}</p>
                  </button>
                )
              })}
            </div>
            {!classification && (
              <p className="text-[11px] text-amber-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Select FACT or DIM to continue
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── DatasetCard ──────────────────────────────────────────────────────────────
// A single compact card for one dataset (source or target)

function DatasetCard({ label, type, projectId, existingDataset, onUploaded, onReadyChange }) {
  const [dataset,        setDataset]    = useState(existingDataset || null)
  const [preview,        setPreview]    = useState(null)
  const [sourceType,     setSourceType] = useState('file')
  const [connection,     setConnection] = useState(INIT_CONNECTION)
  const [selectedCols,   setSelCols]    = useState([])
  const [classification, setClass]      = useState('')
  const [uploading,      setUploading]  = useState(false)
  const [showModal,      setShowModal]  = useState(false)
  const [connExpanded,   setConnExp]    = useState(false)   // API/SQL fields toggle

  // sync prop
  useEffect(() => { setDataset(existingDataset || null) }, [existingDataset])

  // load preview when dataset changes
  useEffect(() => {
    if (!dataset) { setPreview(null); setSelCols([]); setClass(''); return }
    let cancelled = false
    datasetsAPI.preview(projectId, dataset.id, 50).then((pv) => {
      if (cancelled) return
      setPreview(pv)
      setSelCols((c) => c.length ? c : pv.columns.slice(0, Math.min(6, pv.columns.length)))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [dataset, projectId])

  useEffect(() => { if (dataset) onUploaded(dataset) }, [dataset, onUploaded])

  const ready = Boolean(dataset && selectedCols.length && classification && preview)
  useEffect(() => { onReadyChange(type, ready) }, [onReadyChange, ready, type])

  const columns = preview?.columns || dataset?.columns?.map((c) => c.column_name) || []

  // ── dropzone ──
  const onDrop = useCallback(async (files) => {
    const file = files[0]; if (!file) return
    setUploading(true)
    try {
      const ds = await datasetsAPI.upload(projectId, type, file)
      const pv = await datasetsAPI.preview(projectId, ds.id, 50)
      setDataset(ds); setPreview(pv)
      setSelCols(pv.columns.slice(0, Math.min(6, pv.columns.length)))
      toast.success(`${label} uploaded — ${ds.row_count} rows`)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Upload failed')
    } finally { setUploading(false) }
  }, [label, projectId, type])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
    maxFiles: 1,
    disabled: uploading || sourceType !== 'file',
  })

  const handleModalSave = ({ selectedColumns, classification: cls }) => {
    setSelCols(selectedColumns)
    setClass(cls)
    setShowModal(false)
    toast.success(`${label} configured — ${selectedColumns.length} columns · ${cls}`)
  }

  // ── Status chips row ──
  const chips = [
    { label: dataset ? `${dataset.row_count?.toLocaleString()} rows` : 'No file', ok: !!dataset },
    { label: selectedCols.length ? `${selectedCols.length}/${columns.length} cols` : 'Cols pending', ok: selectedCols.length > 0 },
    { label: classification || 'Unclassified', ok: !!classification },
    { label: ready ? 'Ready' : 'Pending', ok: ready },
  ]

  return (
    <>
      <div className={clsx(
        'card flex flex-col overflow-hidden transition-all duration-200',
        ready ? 'border-emerald-700/40' : ''
      )}>
        {/* Card header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700/50" style={{ background: 'var(--bg-elev)' }}>
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest bg-surface-700/80 text-slate-300 border border-surface-600/80">
              {type}
            </span>
            <p className="text-sm font-bold text-slate-100">{label}</p>
          </div>
          {ready && (
            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5" /> Ready
            </span>
          )}
        </div>

        {/* Source type tabs */}
        <div className="flex gap-1 px-4 pt-3 pb-0">
          {SOURCE_TYPES.map(({ id, label: lbl, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => { setSourceType(id); setConnExp(id !== 'file') }}
              className={clsx(
                'flex items-center gap-1.5 h-8 px-3 rounded-t-lg text-xs font-semibold border border-b-0 transition-all',
                sourceType === id
                  ? 'border-surface-600/80 bg-surface-800/80 text-slate-100'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {lbl}
            </button>
          ))}
        </div>

        {/* Content area */}
        <div className="flex-1 p-4 space-y-3 border-t border-surface-700/40" style={{ background: 'var(--bg-elev)' }}>

          {/* File upload dropzone */}
          {sourceType === 'file' && (
            <div
              {...getRootProps()}
              className={clsx(
                'border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all duration-150 select-none',
                isDragActive  ? 'border-brand-500 bg-brand-500/10'
                : dataset     ? 'border-emerald-700/50 bg-emerald-900/10'
                              : 'border-surface-600/70 hover:border-surface-500/80 bg-surface-900/40'
              )}
            >
              <input {...getInputProps()} />
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="animate-spin rounded-full h-7 w-7 border-2 border-brand-500 border-t-transparent" />
                  <p className="text-xs text-slate-400">Uploading…</p>
                </div>
              ) : dataset ? (
                <div className="flex flex-col items-center gap-1">
                  <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                  <p className="text-sm font-semibold text-emerald-300">{dataset.file_name}</p>
                  <p className="text-xs text-slate-500">Drop a new file to replace</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-7 h-7 text-slate-500" />
                  <p className="text-xs text-slate-400">{isDragActive ? 'Drop it…' : 'Drag & drop or click'}</p>
                  <p className="text-[11px] text-slate-600">CSV or XLSX</p>
                </div>
              )}
            </div>
          )}

          {/* API config */}
          {sourceType === 'api' && (
            <div className="space-y-2.5">
              <input className="input text-xs" placeholder="API URL  https://…" value={connection.api.url}
                onChange={(e) => setConnection({ ...connection, api: { ...connection.api, url: e.target.value } })} />
              <div className="grid grid-cols-2 gap-2">
                <select className="input text-xs" value={connection.api.authType}
                  onChange={(e) => setConnection({ ...connection, api: { ...connection.api, authType: e.target.value } })}>
                  <option>None</option><option>Bearer Token</option><option>Basic Auth</option><option>API Key</option>
                </select>
                <input className="input text-xs" placeholder='{"X-Key": "…"}' value={connection.api.headers}
                  onChange={(e) => setConnection({ ...connection, api: { ...connection.api, headers: e.target.value } })} />
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 bg-surface-900/40 rounded-lg px-3 py-2 border border-surface-700/40">
                <Info className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
                Prototype mode — upload a CSV/XLSX sample below to populate the preview.
              </div>
              <div {...getRootProps()} className="border border-dashed border-surface-600/60 rounded-xl p-4 text-center cursor-pointer hover:border-surface-500/80 transition-all">
                <input {...getInputProps()} />
                {dataset ? <p className="text-xs text-emerald-300 font-semibold">{dataset.file_name}</p>
                         : <p className="text-xs text-slate-500">Upload sample data for preview</p>}
              </div>
            </div>
          )}

          {/* SQL config */}
          {sourceType === 'sql' && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-3 gap-2">
                <select className="input text-xs" value={connection.sql.dbType}
                  onChange={(e) => setConnection({ ...connection, sql: { ...connection.sql, dbType: e.target.value } })}>
                  <option>PostgreSQL</option><option>MySQL</option><option>SQL Server</option><option>Oracle</option>
                </select>
                <input className="input text-xs" placeholder="Host" value={connection.sql.host}
                  onChange={(e) => setConnection({ ...connection, sql: { ...connection.sql, host: e.target.value } })} />
                <input className="input text-xs" placeholder="Port" value={connection.sql.port}
                  onChange={(e) => setConnection({ ...connection, sql: { ...connection.sql, port: e.target.value } })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input className="input text-xs" placeholder="Username" value={connection.sql.username}
                  onChange={(e) => setConnection({ ...connection, sql: { ...connection.sql, username: e.target.value } })} />
                <input className="input text-xs" placeholder="Database" value={connection.sql.database}
                  onChange={(e) => setConnection({ ...connection, sql: { ...connection.sql, database: e.target.value } })} />
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 bg-surface-900/40 rounded-lg px-3 py-2 border border-surface-700/40">
                <Info className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
                Prototype mode — upload a CSV/XLSX sample below to populate the preview.
              </div>
              <div {...getRootProps()} className="border border-dashed border-surface-600/60 rounded-xl p-4 text-center cursor-pointer hover:border-surface-500/80 transition-all">
                <input {...getInputProps()} />
                {dataset ? <p className="text-xs text-emerald-300 font-semibold">{dataset.file_name}</p>
                         : <p className="text-xs text-slate-500">Upload sample data for preview</p>}
              </div>
            </div>
          )}

          {/* Status chips */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {chips.map(({ label: lbl, ok }) => (
              <StatusChip key={lbl} ok={ok} label={lbl} />
            ))}
          </div>
        </div>

        {/* Card footer: Configure button */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-surface-700/40">
          <p className="text-[11px] text-slate-500">
            {ready
              ? `${selectedCols.length} columns · ${classification}`
              : dataset
              ? 'Configure columns & classification to proceed'
              : 'Upload data first'}
          </p>
          <button
            type="button"
            disabled={!dataset}
            onClick={() => setShowModal(true)}
            className={clsx(
              'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold border transition-all',
              dataset
                ? ready
                  ? 'border-emerald-700/50 bg-emerald-900/10 text-emerald-300 hover:bg-emerald-900/20'
                  : 'border-brand-500/50 bg-brand-500/10 text-brand-300 hover:bg-brand-500/20'
                : 'border-surface-700/40 text-slate-600 cursor-not-allowed opacity-50'
            )}
          >
            <Settings2 className="w-3.5 h-3.5" />
            {ready ? 'Edit Config' : 'Configure'}
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {showModal && (
        <ConfigModal
          dsLabel={label}
          dsType={type}
          preview={preview}
          allColumns={columns}
          initialSelected={selectedCols}
          initialClassification={classification}
          onSave={handleModalSave}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}

// ─── UploadStep (exported) ────────────────────────────────────────────────────

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
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex-shrink-0 flex items-center justify-between gap-4 px-5 py-3.5 border-b border-surface-700/60">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-slate-500 font-bold">Data Ingestion</p>
          <p className="text-sm font-bold text-slate-100 mt-0.5">Configure Source &amp; Target Datasets</p>
        </div>
        {onBack && (
          <button type="button" className="btn-secondary" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        )}
      </div>

      {/* Two dataset cards */}
      <div className="flex-1 overflow-auto p-5">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <DatasetCard
            label="Source Data"    type="source"
            projectId={project.id} existingDataset={sourceDs}
            onUploaded={setSourceDs} onReadyChange={handleReadyChange}
          />
          <DatasetCard
            label="Target Data"    type="target"
            projectId={project.id} existingDataset={targetDs}
            onUploaded={setTargetDs} onReadyChange={handleReadyChange}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 flex items-center justify-between gap-3 px-5 py-3.5 border-t border-surface-700/60">
        <div className="flex items-center gap-2">
          {!canProceed && (
            <span className="flex items-center gap-1.5 text-xs text-amber-400">
              <AlertCircle className="w-3.5 h-3.5" />
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
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}