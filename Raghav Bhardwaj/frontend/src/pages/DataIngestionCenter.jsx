import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Database, FileJson, Play, CheckCircle2, XCircle, Clock, Copy } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '../components/ui/PageHeader'
import { EmptyState, LoadingState } from '../components/ui/PageState'
import { useAuthStore } from '../store/authStore'
import { ingestionAPI } from '../api'

function StatusBadge({ status }) {
  const meta = {
    PENDING: { color: 'var(--text-tertiary)', icon: Clock },
    PROCESSING: { color: 'var(--warn)', icon: Play },
    SUCCESS: { color: 'var(--ok)', icon: CheckCircle2 },
    FAILED: { color: 'var(--bad)', icon: XCircle },
  }[status] || { color: 'var(--text-secondary)', icon: Database }

  const Icon = meta.icon
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 9999,
      border: `1px solid ${meta.color}33`, color: meta.color, background: `${meta.color}14`,
    }}>
      <Icon style={{ width: 10, height: 10 }} />
      {status}
    </span>
  )
}

export default function DataIngestionCenter() {
  const qc = useQueryClient()
  const project = useAuthStore((s) => s.project)
  const [activeTab, setActiveTab] = useState('jobs') // 'jobs' or 'dev'

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['ingestion-jobs', project?.id],
    queryFn: () => ingestionAPI.listJobs(project?.id),
    enabled: !!project?.id,
    refetchInterval: 5000,
  })

  // A dummy test injection to simulate external system
  const testMutation = useMutation({
    mutationFn: () => ingestionAPI.ingestBalances(project?.id, 'source', [
      { profile_id: 1, period_key: '2026-06', source_balance: Math.random() * 50000, target_balance: 0 }
    ]),
    onSuccess: () => {
      toast.success('Test payload sent to API')
      qc.invalidateQueries({ queryKey: ['ingestion-jobs'] })
    },
    onError: (e) => toast.error('Ingestion failed: ' + e.message)
  })

  const curlSnippet = `curl -X POST "http://localhost:8000/api/v1/projects/${project?.id}/ingestion/balances" \\
-H "Authorization: Bearer <YOUR_TOKEN>" \\
-H "Content-Type: application/json" \\
-d '{
  "dataset_type": "source",
  "balances": [
    {
      "profile_id": 123,
      "period_key": "2026-06",
      "source_balance": 150000.00
    }
  ]
}'`

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="API Data Ingestion"
        subtitle="Monitor high-speed automated JSON data pushes from external ERPs."
        badge={`${jobs.length} jobs`}
      />

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid var(--border-1)', display: 'flex', gap: 24, padding: '0 20px', background: 'var(--surface-0)' }}>
        {[
          { id: 'jobs', label: 'Job History', icon: Database },
          { id: 'dev', label: 'Developer Hub', icon: FileJson },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '12px 0', borderBottom: `2px solid ${activeTab === t.id ? 'var(--accent)' : 'transparent'}`,
              color: activeTab === t.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontSize: 13, fontWeight: 500, cursor: 'pointer', background: 'none'
            }}
          >
            <t.icon style={{ width: 14, height: 14 }} /> {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-5" style={{ background: 'var(--surface-0)' }}>
        {activeTab === 'jobs' && (
          <div className="space-y-4">
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-secondary text-xs h-8" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
                <Play style={{ width: 12, height: 12 }} /> Run Test Injection
              </button>
            </div>

            {isLoading ? <LoadingState /> : jobs.length === 0 ? (
              <EmptyState title="No API jobs yet" description="Push JSON payloads to the ingestion endpoint to see history." />
            ) : (
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden' }}>
                <table className="data-table" style={{ borderRadius: 0 }}>
                  <thead>
                    <tr>
                      <th>Job ID</th><th>Status</th><th>Type</th>
                      <th>Received</th><th>Inserted</th><th>Failed</th>
                      <th>Started At</th><th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map(job => (
                      <tr key={job.id}>
                        <td style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, fontWeight: 600 }}>#{job.id}</td>
                        <td><StatusBadge status={job.status} /></td>
                        <td style={{ fontSize: 11, textTransform: 'uppercase' }}>{job.dataset_type}</td>
                        <td style={{ fontSize: 12 }}>{job.records_received}</td>
                        <td style={{ fontSize: 12, color: job.records_inserted > 0 ? 'var(--ok)' : 'var(--text-secondary)' }}>{job.records_inserted}</td>
                        <td style={{ fontSize: 12, color: job.records_failed > 0 ? 'var(--bad)' : 'var(--text-secondary)' }}>{job.records_failed}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{new Date(job.created_at).toLocaleString()}</td>
                        <td style={{ fontSize: 11, color: 'var(--bad)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {job.error_message || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'dev' && (
          <div style={{ maxWidth: 800 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Integration Setup</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.5 }}>
              Use the REST API to bypass manual CSV uploads. Send GL or Subledger balances as JSON payloads directly to DRMS. 
              The matching engine will automatically trigger upon successful ingestion.
            </p>

            <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border-1)', borderRadius: 10, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)' }}>cURL Example</span>
                <button className="btn-ghost text-xs" onClick={() => { navigator.clipboard.writeText(curlSnippet); toast.success('Copied') }}>
                  <Copy style={{ width: 12, height: 12 }} /> Copy
                </button>
              </div>
              <pre style={{ margin: 0, padding: 16, background: '#0a0a0a', borderRadius: 6, fontSize: 12, color: '#e5e5e5', overflowX: 'auto' }}>
                <code>{curlSnippet}</code>
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
