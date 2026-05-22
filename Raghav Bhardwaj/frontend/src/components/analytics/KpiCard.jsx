import React from 'react'

export default function KpiCard({ title, value, delta }) {
  return (
    <div className="bg-white rounded shadow p-4">
      <p className="text-xs text-slate-400">{title}</p>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      {delta ? <p className="text-xs text-green-600">{delta}</p> : null}
    </div>
  )
}
