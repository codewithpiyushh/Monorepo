import { useState, useEffect } from 'react'
import { mappingsAPI, datasetsAPI } from '../api'
import toast from 'react-hot-toast'
import { Wand2, Trash2, Plus, AlertCircle, Sparkles, ArrowRight } from 'lucide-react'
import clsx from 'clsx'

export default function MappingStep({ project, datasets, onNext }) {
  const [mappings, setMappings] = useState([])
  const [srcCols, setSrcCols] = useState([])
  const [tgtCols, setTgtCols] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [autoMapping, setAutoMapping] = useState(false)
  const [autoMapType, setAutoMapType] = useState('exact')

  useEffect(() => {
    loadData()
  }, [project.id, datasets.source?.id, datasets.target?.id])

  const loadData = async () => {
    setLoading(true)
    try {
      const [existing, srcPreview, tgtPreview] = await Promise.all([
        mappingsAPI.list(project.id),
        datasetsAPI.preview(project.id, datasets.source.id, 1),
        datasetsAPI.preview(project.id, datasets.target.id, 1),
      ])
      setSrcCols(srcPreview.columns)
      setTgtCols(tgtPreview.columns)

      if (existing.length > 0) {
        const normalized = existing.map((mapping) => ({
          source_column: mapping.source_column,
          target_column: mapping.target_column,
          expression: mapping.expression || '',
          is_key_field: mapping.is_key_field,
          include: true,
        }))
        const firstKeyIndex = normalized.findIndex((mapping) => mapping.is_key_field)
        setMappings(
          normalized.map((mapping, index) => ({
            ...mapping,
            is_key_field: firstKeyIndex >= 0 ? index === firstKeyIndex : index === 0,
          }))
        )
      } else {
        await handleAutoMap()
      }
    } catch {
      toast.error('Failed to load mapping data')
    } finally {
      setLoading(false)
    }
  }

  const handleAutoMap = async () => {
    setAutoMapping(true)
    try {
      const suggestions = await mappingsAPI.autoSuggest(project.id)
      if (suggestions.length > 0) {
        setMappings(
          suggestions.map((suggestion, index) => ({
            source_column: suggestion.source_column,
            target_column: suggestion.target_column,
            expression: '',
            is_key_field: index === 0,
            include: true,
          }))
        )
        toast.success(`Auto-mapped ${suggestions.length} columns`)
      } else {
        toast('No close matches found. Add mappings manually.')
      }
    } catch {
      toast.error('Auto-map failed')
    } finally {
      setAutoMapping(false)
    }
  }

  const addMapping = () => {
    const unusedSrc = srcCols.find((column) => !mappings.find((mapping) => mapping.source_column === column))
    const unusedTgt = tgtCols.find((column) => !mappings.find((mapping) => mapping.target_column === column))
    setMappings([
      ...mappings,
      {
        source_column: unusedSrc || srcCols[0] || '',
        target_column: unusedTgt || tgtCols[0] || '',
        expression: '',
        is_key_field: mappings.length === 0,
        include: true,
      },
    ])
  }

  const removeMapping = (index) => {
    const nextMappings = mappings.filter((_, idx) => idx !== index)
    if (nextMappings.length > 0 && !nextMappings.some((mapping) => mapping.is_key_field && mapping.include)) {
      setMappings(nextMappings.map((mapping, idx) => ({ ...mapping, is_key_field: idx === 0 })))
      return
    }
    setMappings(nextMappings)
  }

  const updateMapping = (index, field, value) => {
    setMappings(mappings.map((mapping, idx) => (idx === index ? { ...mapping, [field]: value } : mapping)))
  }

  const setKeyField = (index) => {
    const mapping = mappings[index]
    if (!mapping?.include) {
      return
    }
    const source = (mapping.source_column || '').trim().toLowerCase()
    const target = (mapping.target_column || '').trim().toLowerCase()
    if (source !== target) {
      toast.error('Key field can only be selected when source and target columns match')
      return
    }
    setMappings(mappings.map((item, idx) => ({ ...item, is_key_field: item.include && idx === index })))
  }

  const toggleInclude = (index) => {
    const next = mappings.map((mapping, idx) => (idx === index ? { ...mapping, include: !mapping.include } : mapping))
    const enabledCount = next.filter((mapping) => mapping.include).length
    if (enabledCount === 0) {
      toast.error('At least one mapping must be included')
      return
    }
    if (!next.some((mapping) => mapping.is_key_field && mapping.include)) {
      const firstIncluded = next.findIndex((mapping) => mapping.include)
      if (firstIncluded >= 0) {
        next.forEach((mapping, idx) => { mapping.is_key_field = idx === firstIncluded })
      }
    }
    setMappings([...next])
  }

  const handleSave = async () => {
    const selectedMappings = mappings.filter((mapping) => mapping.include)
    if (selectedMappings.length === 0) {
      toast.error('Add at least one mapping')
      return
    }
    const keyCount = selectedMappings.filter((mapping) => mapping.is_key_field).length
    if (keyCount !== 1) {
      toast.error('Select exactly one key field')
      return
    }
    setSaving(true)
    try {
      await mappingsAPI.save(
        project.id,
        selectedMappings.map((mapping) => ({
          source_column: mapping.source_column,
          target_column: mapping.target_column,
          expression: mapping.expression,
          is_key_field: mapping.is_key_field,
        }))
      )
      toast.success('Mappings saved')
      onNext()
    } catch {
      toast.error('Failed to save mappings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-500 border-t-transparent" />
        <p className="text-xs text-slate-500">Preparing columns and saved mappings...</p>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-400">
          Map source columns to target columns. Select one key field where source and target column names match.
        </p>
        <button
          className={clsx(
            'btn-secondary text-xs',
            !mappings.length && 'ring-2 ring-brand-900/30'
          )}
          onClick={handleAutoMap}
          disabled={saving || autoMapping}
        >
          {autoMapping ? (
            <>
              <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-slate-700 border-t-transparent" />
              Auto-mapping...
            </>
          ) : (
            <>
              <Wand2 className="w-3.5 h-3.5" />
              Auto Map Suggested Columns
            </>
          )}
        </button>
      </div>

      <div className="surface-panel overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_90px_40px] gap-3 px-3 py-2 border-b border-surface-700/70 bg-surface-800/40">
          <span className="text-[11px] text-slate-500 uppercase tracking-wide">Target Attribute</span>
          <span className="text-[11px] text-slate-500 uppercase tracking-wide">Source Column</span>
          <span className="text-[11px] text-slate-500 uppercase tracking-wide text-center">Key</span>
          <span />
        </div>

        <div className="max-h-72 overflow-y-auto divide-y divide-surface-700/60">
          {mappings.length === 0 && (
            <div className="py-10 px-4 text-center space-y-2">
              <Sparkles className="w-8 h-8 text-slate-500 mx-auto" />
              <p className="text-sm text-slate-300">No mappings yet</p>
              <p className="text-xs text-slate-500">Use Auto Map or add the first mapping manually.</p>
            </div>
          )}
          {mappings.map((mapping, index) => {
            const namesMatch = (mapping.source_column || '').trim().toLowerCase() === (mapping.target_column || '').trim().toLowerCase()
            const keyDisabled = !mapping.include || !namesMatch
            return (
            <div
              key={index}
              className={clsx(
                'interactive-table-row grid grid-cols-[1fr_1fr_90px_40px] gap-3 items-center px-3 py-2.5',
                mapping.is_key_field && mapping.include ? 'bg-brand-900/20 border-l-2 border-brand-600' : 'hover:bg-surface-700/10',
                !mapping.include && 'opacity-55'
              )}
            >
              <select
                className="input text-xs py-1.5 h-9"
                value={mapping.target_column}
                onChange={(event) => updateMapping(index, 'target_column', event.target.value)}
              >
                {tgtCols.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
              <select
                className="input text-xs py-1.5 h-9"
                value={mapping.source_column}
                onChange={(event) => updateMapping(index, 'source_column', event.target.value)}
              >
                {srcCols.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
              <div className="flex justify-center">
                <input
                  type="checkbox"
                  checked={mapping.is_key_field && mapping.include}
                  disabled={keyDisabled}
                  onChange={() => setKeyField(index)}
                  className="h-4 w-4 rounded border-surface-600 bg-surface-800 accent-brand-500 cursor-pointer disabled:cursor-not-allowed"
                  title={keyDisabled ? 'Key field requires included row and matching source/target columns' : 'Set as key field'}
                />
              </div>
              <button
                onClick={() => removeMapping(index)}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                title="Remove mapping"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )})}
        </div>
      </div>

      {mappings.length > 0 && !mappings.some((mapping) => mapping.is_key_field && mapping.include) && (
        <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-900/20 border border-amber-800/50 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5" />
          Mark exactly one field as a key field (used to join source and target rows), and ensure its source/target column names match.
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save and Continue to Rules'}
          {!saving && <ArrowRight className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}
