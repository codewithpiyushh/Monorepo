import { useState } from 'react'
import { CheckCircle2, ChevronDown } from 'lucide-react'

const options = [
  { id: 'normalize', label: 'Data normalization' },
  { id: 'schema', label: 'Schema transformation' },
  { id: 'datatype', label: 'Datatype conversion' },
]

export default function TransformationStep({ onNext }) {
  const [selected, setSelected] = useState(['normalize', 'schema', 'datatype'])
  const [done, setDone] = useState(false)

  const toggle = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]))
  }

  const handleApply = () => {
    setDone(true)
  }

  return (
    <div className="p-6 space-y-4">
      <p className="text-sm text-slate-400">
        Transform raw uploaded data into reconciliation-ready structure before auto mapping.
      </p>
      <details className="card p-3">
        <summary className="list-none cursor-pointer flex items-center justify-between text-sm text-slate-200">
          <span>Transformation Section</span>
          <ChevronDown className="w-4 h-4 text-slate-500" />
        </summary>
        <div className="pt-3 space-y-2">
          {options.map((option) => (
            <label key={option.id} className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={selected.includes(option.id)}
                onChange={() => toggle(option.id)}
                className="h-4 w-4 accent-brand-500"
              />
              {option.label}
            </label>
          ))}
        </div>
      </details>
      <div className="flex items-center gap-2">
        <button className="btn-secondary" onClick={handleApply}>
          Apply Transformation
        </button>
        {done && <span className="inline-flex items-center gap-1 text-xs text-emerald-300"><CheckCircle2 className="w-3.5 h-3.5" />Transformed data ready for auto mapping</span>}
      </div>
      <div className="flex justify-end">
        <button className="btn-primary" onClick={onNext} disabled={!done}>
          Continue to Auto Mapping
        </button>
      </div>
    </div>
  )
}
