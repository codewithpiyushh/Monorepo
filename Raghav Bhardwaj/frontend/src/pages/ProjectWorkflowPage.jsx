import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, FolderOpen, Link, ShieldCheck, Upload, Play, RefreshCw, CheckCircle2, XCircle } from 'lucide-react'
import { datasetsAPI, projectsAPI } from '../api'
import UploadStep from '../components/UploadStep'
import MappingStep from '../components/MappingStep'
import RulesStep from '../components/RulesStep'
import ExecuteStep from '../components/ExecuteStep'
import { useAuthStore } from '../store/authStore'
import { LoadingState } from '../components/ui/PageState'
import { normalizeRole } from '../utils/roles'

const STEPS = [
  { id: 'ingestion', label: 'Ingestion', icon: FolderOpen },
  { id: 'mapping', label: 'Auto Mapping', icon: Link },
  { id: 'rules', label: 'Matching Rules', icon: ShieldCheck },
  { id: 'results', label: 'Workbench', icon: Play },
]

const STEP_INDEX = {
  ingestion: 0,
  mapping: 1,
  rules: 2,
  results: 3,
}

export default function ProjectWorkflowPage() {
  const navigate = useNavigate()
  const { projectId, section = 'ingestion' } = useParams()
  const role = normalizeRole(useAuthStore((s) => s.user?.role))
  const [executeTopbar, setExecuteTopbar] = useState({
    status: null,
    running: false,
    runAction: null,
  })

  if (!(section in STEP_INDEX)) {
    return <Navigate to={`/projects/${projectId}/ingestion`} replace />
  }
  if (role === 'preparer') {
    return <Navigate to={`/projects/${projectId}/preparer`} replace />
  }
  if (role === 'reviewer') {
    return <Navigate to={`/projects/${projectId}/reviewer`} replace />
  }

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

  const datasets = useMemo(() => {
    const source = datasetList.find((dataset) => dataset.dataset_type === 'source') || null
    const target = datasetList.find((dataset) => dataset.dataset_type === 'target') || null
    return { source, target }
  }, [datasetList])

  const hasBothDatasets = Boolean(datasets.source && datasets.target)
  const isFirstStep = section === 'ingestion'
  useEffect(() => {
    if (project && !hasBothDatasets && section !== 'ingestion') {
      navigate(`/projects/${project.id}/ingestion`, { replace: true })
    }
  }, [project, hasBothDatasets, section, navigate])

  const renderStep = () => {
    if (!project) return null

    if (section === 'ingestion') {
      return (
        <UploadStep
          project={project}
          datasets={datasetList}
          onNext={async () => {
            await refetchDatasets()
            navigate(`/projects/${project.id}/mapping`)
          }}
        />
      )
    }

    if (!hasBothDatasets) return null

    if (section === 'mapping') {
      return (
        <MappingStep
          project={project}
          datasets={datasets}
          onNext={() => navigate(`/projects/${project.id}/rules`)}
        />
      )
    }

    if (section === 'rules') {
      return (
        <RulesStep
          project={project}
          datasets={datasets}
          onNext={() => navigate(`/projects/${project.id}/results`)}
        />
      )
    }

    if (section === 'results') {
      return (
        <ExecuteStep
          project={project}
          datasets={datasets}
          onTopbarStateChange={setExecuteTopbar}
        />
      )
    }

    return (
      <div className="card p-6 mx-6 mt-6">
        <p className="text-sm text-slate-300">Unknown section. Redirecting...</p>
      </div>
    )
  }

  const handleTopbarBack = () => {
    if (!project) return
    if (section === 'results') {
      navigate(`/projects/${project.id}/rules`)
      return
    }
    if (section === 'rules') {
      navigate(`/projects/${project.id}/mapping`)
      return
    }
    if (section === 'mapping') {
      navigate(`/projects/${project.id}/ingestion`)
      return
    }
  }

  const goToStep = (stepId) => {
    if (!project) return
    navigate(`/projects/${project.id}/${stepId}`)
  }

  return (
    <div className="h-full flex flex-col">
      <div className="h-[66px] px-4 border-b border-surface-700/60 flex items-center" style={{ background: 'var(--header-bg)' }}>
        <div className="w-full flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex w-full flex-wrap items-center gap-2">
              {STEPS.map((step) => {
                const Icon = step.icon
                const isActive = step.id === section
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => goToStep(step.id)}
                    className={`h-10 px-3 rounded-lg border text-xs font-semibold transition inline-flex items-center gap-2 ${
                      isActive
                        ? 'border-brand-500/60 bg-brand-500/15 text-slate-100 shadow-sm'
                        : 'border-surface-700/70 bg-surface-900/30 text-slate-400 hover:text-slate-100 hover:border-surface-500'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {step.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {section === 'ingestion' && (
              <button className="btn-secondary" onClick={() => navigate(`/projects/${project?.id}/ingestion`)}>
                <Upload className="w-4 h-4" />
                Upload Data
              </button>
            )}
            {section === 'results' && (
              <>
                {executeTopbar.status === 'running' && <span className="inline-flex items-center gap-1 text-xs text-brand-300"><RefreshCw className="w-3 h-3 animate-spin" />Running</span>}
                {executeTopbar.status === 'completed' && <span className="inline-flex items-center gap-1 text-xs text-emerald-300"><CheckCircle2 className="w-3 h-3" />Completed</span>}
                {executeTopbar.status === 'failed' && <span className="inline-flex items-center gap-1 text-xs text-red-300"><XCircle className="w-3 h-3" />Failed</span>}
                <button
                  className="btn-primary"
                  onClick={() => executeTopbar.runAction?.()}
                  disabled={executeTopbar.running}
                >
                  {executeTopbar.running ? <><RefreshCw className="w-4 h-4 animate-spin" />Running...</> : <><Play className="w-4 h-4" />Run Reconciliation</>}
                </button>
              </>
            )}
            <button className="btn-secondary rounded-md" onClick={handleTopbarBack} disabled={isFirstStep}>
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          </div>
        </div>
      </div>

      {(projectLoading || datasetsLoading) ? (
        <div className="flex-1 px-6 py-6">
          <LoadingState label="Loading workflow context..." />
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-4 lg:p-6">
          <div className="w-full">
            <div className="card overflow-hidden">
              {renderStep()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
