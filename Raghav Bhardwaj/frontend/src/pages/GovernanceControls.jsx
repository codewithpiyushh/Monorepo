import React from 'react'
import PageHeader from '../components/ui/PageHeader'

export default function GovernanceControls() {
  return (
    <div className="p-6">
      <PageHeader title="Governance Controls" subtitle="Segregation of duties and approval policies" />
      <div className="bg-white rounded shadow p-4">
        <h3 className="text-lg font-medium mb-2">Segregation of Duties</h3>
        <ul className="text-sm text-slate-600">
          <li>Preparer ≠ Reviewer</li>
          <li>Reviewer ≠ Approver</li>
          <li>Approver ≠ Certifier</li>
        </ul>
        <h3 className="text-lg font-medium mt-4 mb-2">Approval Policies</h3>
        <div className="text-sm text-slate-600">High Risk → 2 Approvals; Critical Risk → 3 Approvals</div>
      </div>
    </div>
  )
}
