import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  FolderOpen, Link, ShieldCheck, Play,
  RefreshCw, CheckCircle2, XCircle, ArrowLeft, ChevronLeft,
} from 'lucide-react'
import { datasetsAPI, projectsAPI } from '../api'
import UploadStep from '../components/UploadStep'
import MappingStep from '../components/MappingStep'
import RulesStep from '../components/RulesStep'
import ExecuteStep from '../components/ExecuteStep'
import { useAuthStore } from '../store/authStore'
import { LoadingState } from '../components/ui/PageState'
import { normalizeRole } from '../utils/roles'

const STEPS = [
  { id: 'ingestion', label: 'Ingestion',      icon: FolderOpen  },
  { id: 'mapping',   label: 'Auto Mapping',   icon: Link        },
  { id: 'rules',     label: 'Matching Rules', icon: ShieldCheck },
  { id: 'results',   label: 'Workbench',      icon: Play        },
]

const STEP_INDEX = { ingestion: 0, mapping: 1, rules: 2, results: 3 }

export default function ProjectWorkflowPage() {
  const navigate = useNavigate()
  const { projectId, section = 'ingestion' } = useParams()
  const role = normalizeRole(useAuthStore((s) => s.user?.role))
  const [executeTopbar, setExecuteTopbar] = useState({ status: null, running: false, runAction: null })

  if (!(section in STEP_INDEX)) return <Navigate to={`/projects/${projectId}/ingestion`} replace />
  if (role === 'preparer') return <Navigate to={`/projects/${projectId}/preparer`} replace />
  if (role === 'reviewer') return <Navigate to={`/projects/${projectId}/reviewer`} replace />

  const numericProjectId = Number(projectId)

  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ['project', numericProjectId],
    queryFn: () => projectsAPI.get(numericProjectId),
    enabled: Number.isFinite(numericProjectId),
  })

  const { data: datasetList = [], isLoading: datasetsLoading, refetch: refetchDatasets } = useQuery({
    queryKey: ['datasets', numericProjectId],
    queryFn: () => datasetsAPI.list(numericProjectId),
    enabled: Number.isFinite(numericProjectId),
  })

  const datasets = useMemo(() => ({
    source: datasetList.find((d) => d.dataset_type === 'source') || null,
    target: datasetList.find((d) => d.dataset_type === 'target') || null,
  }), [datasetList])

  const hasBothDatasets = Boolean(datasets.source && datasets.target)

  useEffect(() => {
    if (project && !hasBothDatasets && section !== 'ingestion') {
      navigate(`/projects/${project.id}/ingestion`, { replace: true })
    }
  }, [project, hasBothDatasets, section, navigate])

  const goToStep = (stepId) => { if (project) navigate(`/projects/${project.id}/${stepId}`) }

  const handleBack = () => {
    if (!project) return
    const prev = { results: 'rules', rules: 'mapping', mapping: 'ingestion' }
    if (prev[section]) navigate(`/projects/${project.id}/${prev[section]}`)
  }

  const renderStep = () => {
    if (!project) return null
    if (section === 'ingestion') return (
      <UploadStep project={project} datasets={datasetList}
        onNext={async () => { await refetchDatasets(); navigate(`/projects/${project.id}/mapping`) }} />
    )
    if (!hasBothDatasets) return null
    if (section === 'mapping') return (
      <MappingStep project={project} datasets={datasets} onNext={() => navigate(`/projects/${project.id}/rules`)} />
    )
    if (section === 'rules') return (
      <RulesStep project={project} datasets={datasets} onNext={() => navigate(`/projects/${project.id}/results`)} />
    )
    if (section === 'results') return (
      <ExecuteStep project={project} datasets={datasets} onTopbarStateChange={setExecuteTopbar} />
    )
    return null
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--surface-0)' }}>

      {/* ── Excel-style tab bar + action bar ─────────────────── */}
      <div style={{
        background: 'var(--surface-1)',
        borderBottom: '1px solid var(--border-1)',
        flexShrink: 0,
      }}>
        {/* Project breadcrumb */}
        <div style={{
          padding: '8px 16px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <button
            onClick={() => navigate('/command-center')}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 11, color: 'var(--text-tertiary)', background: 'none',
              border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            <ChevronLeft style={{ width: 12, height: 12 }} />
            Projects
          </button>
          <span style={{ fontSize: 11, color: 'var(--border-2)' }}>/</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
            {project?.name || `Project #${projectId}`}
          </span>
        </div>

        {/* Tabs row */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          padding: '6px 16px 0',
        }}>
          {/* Excel tabs */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2 }}>
            {STEPS.map((step) => {
              const Icon = step.icon
              const isActive = step.id === section
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => goToStep(step.id)}
                  className={`excel-tab ${isActive ? 'active' : ''}`}
                  style={isActive ? {
                    background: 'var(--surface-0)',
                    borderBottomColor: 'var(--surface-0)',
                  } : {}}
                >
                  <Icon style={{ width: 13, height: 13 }} />
                  {step.label}
                </button>
              )
            })}
          </div>

          {/* Right actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 4 }}>
            {section === 'results' && (
              <>
                {executeTopbar.status === 'running' && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--accent)' }}>
                    <RefreshCw style={{ width: 12, height: 12 }} className="animate-spin" />
                    Running
                  </span>
                )}
                {executeTopbar.status === 'completed' && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--ok)' }}>
                    <CheckCircle2 style={{ width: 12, height: 12 }} />
                    Completed
                  </span>
                )}
                {executeTopbar.status === 'failed' && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--bad)' }}>
                    <XCircle style={{ width: 12, height: 12 }} />
                    Failed
                  </span>
                )}
                <button
                  className="btn-primary btn-sm"
                  onClick={() => executeTopbar.runAction?.()}
                  disabled={executeTopbar.running}
                >
                  {executeTopbar.running
                    ? <><RefreshCw style={{ width: 11, height: 11 }} className="animate-spin" />Running…</>
                    : <><Play style={{ width: 11, height: 11 }} />Run Reconciliation</>}
                </button>
              </>
            )}
            <button
              className="btn-secondary btn-sm"
              onClick={handleBack}
              disabled={section === 'ingestion'}
            >
              <ArrowLeft style={{ width: 11, height: 11 }} />
              Back
            </button>
          </div>
        </div>
      </div>

      {/* ── Step content ─────────────────────────────────────── */}
      {(projectLoading || datasetsLoading) ? (
        <div className="flex-1 flex items-center justify-center">
          <LoadingState label="Loading workflow..." />
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-5 flex flex-col" style={{ background: 'var(--surface-0)' }}>
          <div className="card overflow-hidden flex flex-col grow shrink-0 basis-auto min-h-min">
            {renderStep()}
          </div>
        </div>
      )}
    </div>
  )
}
