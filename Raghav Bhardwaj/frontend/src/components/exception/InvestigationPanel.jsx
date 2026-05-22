import React from 'react'

export default function InvestigationPanel() {
  return (
    <div>
      <h3 className="text-lg font-medium mb-3">Transaction Details</h3>
      <div className="text-sm text-slate-600 mb-4">(Transaction metadata placeholder)</div>

      <h3 className="text-lg font-medium mb-3">Evidence</h3>
      <div className="text-sm text-slate-600 mb-4">(Evidence viewer placeholder)</div>

      <h3 className="text-lg font-medium mb-3">Resolution Actions</h3>
      <div className="flex gap-2"><button className="btn">Mark Resolved</button><button className="btn">Escalate</button></div>
    </div>
  )
}
