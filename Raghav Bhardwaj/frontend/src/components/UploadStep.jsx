import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { datasetsAPI } from '../api'
import toast from 'react-hot-toast'
import { Upload, CheckCircle, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'
import clsx from 'clsx'

function FileDropzone({ label, type, onUploaded, projectId, existingDataset }) {
  const [uploading, setUploading] = useState(false)
  const [dataset, setDataset] = useState(existingDataset || null)
  const [preview, setPreview] = useState(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    setDataset(existingDataset || null)
    setExpanded(false)
  }, [existingDataset])

  useEffect(() => {
    if (!existingDataset) {
      setPreview(null)
      return
    }

    let cancelled = false

    const loadPreview = async () => {
      try {
        const pv = await datasetsAPI.preview(projectId, existingDataset.id, 5)
        if (!cancelled) {
          setPreview(pv)
        }
      } catch {
        if (!cancelled) {
          setPreview(null)
        }
      }
    }

    loadPreview()

    return () => {
      cancelled = true
    }
  }, [existingDataset, projectId])

  const onDrop = useCallback(
    async (files) => {
      const file = files[0]
      if (!file) return
      setUploading(true)
      try {
        const ds = await datasetsAPI.upload(projectId, type, file)
        setDataset(ds)
        const pv = await datasetsAPI.preview(projectId, ds.id, 5)
        setPreview(pv)
        onUploaded(ds)
        toast.success(`${label} uploaded: ${ds.row_count} rows`)
      } catch (err) {
        toast.error(err.response?.data?.detail || 'Upload failed')
      } finally {
        setUploading(false)
      }
    },
    [projectId, type, label, onUploaded]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
    maxFiles: 1,
    disabled: uploading,
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span
          className={clsx(
            'text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wide',
            type === 'source'
              ? 'bg-surface-700 text-slate-300 border border-surface-600'
              : 'bg-surface-700 text-slate-300 border border-surface-600'
          )}
        >
          {type}
        </span>
        <span className="text-sm font-medium text-slate-300">{label}</span>
        {dataset && <CheckCircle className="w-4 h-4 text-emerald-400" />}
      </div>

      <div
        {...getRootProps()}
        className={clsx(
          'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
          isDragActive
            ? 'border-brand-500 bg-brand-500/10'
            : dataset
              ? 'border-emerald-700 bg-emerald-900/10'
              : 'border-surface-600 hover:border-surface-500 bg-surface-900/50'
        )}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <div className="space-y-2">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-500 border-t-transparent mx-auto" />
            <p className="text-sm text-slate-400">Uploading and parsing...</p>
          </div>
        ) : dataset ? (
          <div className="space-y-1">
            <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto" />
            <p className="text-sm font-medium text-emerald-300">{dataset.file_name}</p>
            <p className="text-xs text-slate-400">
              {dataset.row_count} rows | {dataset.columns?.length} columns
            </p>
            <p className="text-xs text-slate-500 mt-1">Drop a new file to replace</p>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="w-8 h-8 text-slate-500 mx-auto" />
            <p className="text-sm text-slate-400">
              {isDragActive ? 'Drop file here...' : 'Drag and drop or click to upload'}
            </p>
            <p className="text-xs text-slate-500">CSV or XLSX</p>
          </div>
        )}
      </div>

      {preview && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Preview ({preview.total_rows} total rows)
          </button>
          {expanded && (
            <div className="mt-2 overflow-auto rounded-lg border border-surface-700 max-h-40">
              <table className="text-xs w-full">
                <thead>
                  <tr className="bg-surface-900">
                    {preview.columns.map((column) => (
                      <th
                        key={column}
                        className="px-3 py-2 text-left text-slate-400 font-medium whitespace-nowrap border-b border-surface-700"
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, index) => (
                    <tr key={index} className="border-b border-surface-700/50 hover:bg-surface-700/30">
                      {preview.columns.map((column) => (
                        <td
                          key={column}
                          className="px-3 py-1.5 text-slate-300 whitespace-nowrap max-w-[120px] truncate"
                        >
                          {row[column] ?? '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function UploadStep({ project, datasets, onNext }) {
  const [sourceDs, setSourceDs] = useState(
    datasets?.find((dataset) => dataset.dataset_type === 'source') || null
  )
  const [targetDs, setTargetDs] = useState(
    datasets?.find((dataset) => dataset.dataset_type === 'target') || null
  )

  useEffect(() => {
    setSourceDs(datasets?.find((dataset) => dataset.dataset_type === 'source') || null)
    setTargetDs(datasets?.find((dataset) => dataset.dataset_type === 'target') || null)
  }, [datasets])

  const canProceed = sourceDs && targetDs
  const applyTransformations = (row) => {
    const out = { ...row }
    Object.keys(out).forEach((key) => {
      const value = out[key]
      if (typeof value === 'string') out[key] = value.trim()
    })
    if (out.date && !out.tx_date) out.tx_date = String(out.date).slice(0, 10)
    if (out.reference_no && !out.reference) out.reference = out.reference_no
    if (out.curr && !out.currency) out.currency = out.curr
    if (out.amount != null && out.amount !== '') {
      const numeric = Number(String(out.amount).replace(/,/g, ''))
      out.amount = Number.isNaN(numeric) ? out.amount : numeric
    }
    if (out.currency && typeof out.currency === 'string') {
      out.currency = out.currency.toUpperCase()
    }
    return out
  }

  return (
    <div className="p-6 space-y-6">
      <div className="card p-4">
        <p className="oracle-panel-title text-sm">Data Ingestion</p>
        <p className="text-sm oracle-subtle mt-1">
          Upload source and target files, then validate transformed preview before moving to mapping.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FileDropzone
          label="Source Data"
          type="source"
          projectId={project.id}
          existingDataset={sourceDs}
          onUploaded={setSourceDs}
        />
        <FileDropzone
          label="Target Data"
          type="target"
          projectId={project.id}
          existingDataset={targetDs}
          onUploaded={setTargetDs}
        />
      </div>

      {canProceed && (
        <TransformationPreview
          projectId={project.id}
          sourceDs={sourceDs}
          targetDs={targetDs}
          applyTransformations={applyTransformations}
        />
      )}

      {!canProceed && (
        <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-900/20 border border-amber-800/50 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          Both source and target files must be uploaded to proceed.
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          className="btn-primary"
          disabled={!canProceed}
          onClick={() => onNext({ source: sourceDs, target: targetDs })}
        >
          Save and Continue to Mapping
        </button>
      </div>
    </div>
  )
}

function TransformationPreview({ projectId, sourceDs, targetDs, applyTransformations }) {
  const [sourcePreview, setSourcePreview] = useState(null)
  const [targetPreview, setTargetPreview] = useState(null)
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [src, tgt] = await Promise.all([
          datasetsAPI.preview(projectId, sourceDs.id, 5),
          datasetsAPI.preview(projectId, targetDs.id, 5),
        ])
        if (!cancelled) {
          setSourcePreview(src)
          setTargetPreview(tgt)
        }
      } catch {
        if (!cancelled) {
          setSourcePreview(null)
          setTargetPreview(null)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [projectId, sourceDs?.id, targetDs?.id])

  const renderTable = (preview, label) => {
    if (!preview) return <div className="text-xs text-slate-500">No preview available.</div>
    const rows = (preview.rows || []).map((row) => applyTransformations(row))
    return (
      <div className="space-y-1">
        <p className="text-xs font-semibold text-slate-300">{label} (Transformed)</p>
        <div className="overflow-auto rounded-lg border border-surface-700 max-h-44">
          <table className="text-xs w-full">
            <thead>
              <tr className="bg-surface-900">
                {preview.columns.map((column) => (
                  <th key={column} className="px-2 py-1.5 text-left text-slate-400 border-b border-surface-700 whitespace-nowrap">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} className="border-b border-surface-700/40">
                  {preview.columns.map((column) => (
                    <td key={`${idx}-${column}`} className="px-2 py-1 text-slate-300 whitespace-nowrap max-w-[140px] truncate">{String(row[column] ?? '-')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="card p-4 space-y-3">
      <button onClick={() => setExpanded((v) => !v)} className="flex items-center gap-1 text-sm text-slate-300">
        {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        Transformation Preview
      </button>
      {expanded && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {renderTable(sourcePreview, 'Source')}
          {renderTable(targetPreview, 'Target')}
        </div>
      )}
    </div>
  )
}
