import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { datasetsAPI, executionsAPI, mappingsAPI, projectsAPI, rulesAPI } from '../api'
import CreateProjectModal from '../components/CreateProjectModal'
import toast from 'react-hot-toast'
import {
  Plus,
  FolderOpen,
  Calendar,
  Clock,
  Trash2,
  ChevronRight,
  Database,
  Scale,
  FileUp,
  Link,
  ShieldCheck,
  Play,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuthStore } from '../store/authStore'

const STATUS_COLORS = {
  active: 'bg-emerald-900/40 text-emerald-400 border-emerald-800',
  archived: 'bg-slate-700/50 text-slate-400 border-slate-600',
  completed: 'bg-brand-900/40 text-slate-100 border-brand-800',
}

function parseStats(statsRaw) {
  if (!statsRaw) return null
  if (typeof statsRaw === 'object') return statsRaw
  try {
    return JSON.parse(statsRaw)
  } catch {
    return null
  }
}

function ProjectCard({ project, details, onOpen, onDelete }) {
  const fmt = (d) =>
    new Date(d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })

  return (
    <div
      className="card p-5 hover:border-brand-600/50 transition-all cursor-pointer group hover:-translate-y-0.5"
      onClick={() => onOpen(project, details)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-lg bg-surface-700 flex items-center justify-center flex-shrink-0 border border-surface-600">
          <Database className="w-4.5 h-4.5 text-slate-300" style={{ width: 18, height: 18 }} />
        </div>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <span
            className={clsx(
              'text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider',
              STATUS_COLORS[project.status] || STATUS_COLORS.active
            )}
          >
            {project.status}
          </span>
          <button
            className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-red-900/20"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(project)
            }}
            title="Delete project"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <h3 className="text-sm font-semibold text-white mb-1 truncate">{project.name}</h3>
      {project.description && (
        <p className="text-xs text-slate-500 mb-3 line-clamp-2">{project.description}</p>
      )}

      <div className="grid grid-cols-2 gap-2 text-[11px] mb-3">
        <div className="rounded-lg border border-surface-700 bg-surface-900/50 px-2 py-1.5">
          <div className="flex items-center gap-1 text-slate-500 mb-0.5">
            <FileUp className="w-3 h-3" />
            Data Upload
          </div>
          <p className="text-slate-300 font-medium">
            {details?.hasSource ? `${details.sourceRows} src` : '-'} / {details?.hasTarget ? `${details.targetRows} tgt` : '-'} rows
          </p>
        </div>
        <div className="rounded-lg border border-surface-700 bg-surface-900/50 px-2 py-1.5">
          <div className="flex items-center gap-1 text-slate-500 mb-0.5">
            <Link className="w-3 h-3" />
            Mappings
          </div>
          <p className="text-slate-300 font-medium">{details?.mappingsCount ?? 0} total</p>
        </div>
        <div className="rounded-lg border border-surface-700 bg-surface-900/50 px-2 py-1.5">
          <div className="flex items-center gap-1 text-slate-500 mb-0.5">
            <ShieldCheck className="w-3 h-3" />
            Rules
          </div>
          <p className="text-slate-300 font-medium">
            {details?.activeRulesCount ?? 0}/{details?.rulesCount ?? 0} active
          </p>
        </div>
        <div className="rounded-lg border border-surface-700 bg-surface-900/50 px-2 py-1.5">
          <div className="flex items-center gap-1 text-slate-500 mb-0.5">
            <Play className="w-3 h-3" />
            Latest Run
          </div>
          <p className="text-slate-300 font-medium">
            {details?.latestExecution?.status || 'not run'}
            {details?.latestMatchRate !== null && details?.latestMatchRate !== undefined
              ? ` (${details.latestMatchRate}%)`
              : ''}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-500 mt-3 pt-3 border-t border-surface-700">
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          {fmt(project.created_at)}
        </div>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {fmt(project.updated_at)}
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const role = (useAuthStore((s) => s.user?.role) || '').toLowerCase()
  const [createOpen, setCreateOpen] = useState(false)
  const [projectDetails, setProjectDetails] = useState({})

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsAPI.list,
  })

  useEffect(() => {
    if (!projects.length) {
      setProjectDetails({})
      return
    }

    let cancelled = false

    const loadProjectDetails = async () => {
      const entries = await Promise.all(
        projects.map(async (project) => {
          const [datasetsRes, mappingsRes, rulesRes, executionsRes] = await Promise.allSettled([
            datasetsAPI.list(project.id),
            mappingsAPI.list(project.id),
            rulesAPI.list(project.id),
            executionsAPI.list(project.id),
          ])

          const datasets = datasetsRes.status === 'fulfilled' ? datasetsRes.value : []
          const mappings = mappingsRes.status === 'fulfilled' ? mappingsRes.value : []
          const rules = rulesRes.status === 'fulfilled' ? rulesRes.value : []
          const executions = executionsRes.status === 'fulfilled' ? executionsRes.value : []

          const latestExecution = executions[0] || null
          const parsedStats = parseStats(latestExecution?.stats)

          return [
            project.id,
            {
              hasSource: datasets.some((d) => d.dataset_type === 'source'),
              hasTarget: datasets.some((d) => d.dataset_type === 'target'),
              sourceRows: datasets.find((d) => d.dataset_type === 'source')?.row_count || 0,
              targetRows: datasets.find((d) => d.dataset_type === 'target')?.row_count || 0,
              mappingsCount: mappings.length,
              keyMappingsCount: mappings.filter((m) => m.is_key_field).length,
              rulesCount: rules.length,
              activeRulesCount: rules.filter((r) => r.is_active).length,
              latestExecution,
              latestMatchRate:
                parsedStats?.match_rate !== undefined ? parsedStats.match_rate : null,
            },
          ]
        })
      )

      if (!cancelled) {
        setProjectDetails(Object.fromEntries(entries))
      }
    }

    loadProjectDetails()

    return () => {
      cancelled = true
    }
  }, [projects])

  useEffect(() => {
    const openUploadProjectId = location.state?.openUploadProjectId
    if (!openUploadProjectId || projects.length === 0) return

    const project = projects.find((p) => p.id === openUploadProjectId)
    if (project) {
      navigate(`/projects/${project.id}/ingestion`)
    }

    navigate(location.pathname, { replace: true, state: null })
  }, [location.pathname, location.state, navigate, projects])

  const handleDelete = async (project) => {
    if (!confirm(`Delete project "${project.name}"? This cannot be undone.`)) return
    try {
      await projectsAPI.delete(project.id)
      qc.invalidateQueries(['projects'])
      toast.success('Project deleted')
    } catch {
      toast.error('Failed to delete project')
    }
  }

  const handleOpenWorkflow = (project, details) => {
    if (role === 'preparer') {
      navigate(`/projects/${project.id}/preparer`)
      return
    }
    if (role === 'reviewer') {
      navigate(`/projects/${project.id}/reviewer`)
      return
    }
    if (details?.hasSource && details?.hasTarget) {
      navigate(`/projects/${project.id}/results`)
      return
    }
    navigate(`/projects/${project.id}/ingestion`)
  }

  return (
    <div className="h-full flex flex-col">
      <div className="section-header">
        <div className="flex items-center gap-3">
          <Scale className="w-5 h-5 text-slate-300" />
          <h1 className="text-base font-semibold text-white">Reconciliation Projects</h1>
          <span className="chip-neutral">
            {projects.length} project{projects.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button className="btn-primary" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      <div className="flex-1 overflow-auto p-8">
        <div className="card oracle-hero p-4 mb-5">
          <p className="oracle-panel-title text-sm">Operations Console</p>
          <p className="oracle-subtle text-xs mt-1">Track ingestion readiness, mapping completeness, rules coverage, and latest execution status for each project.</p>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-500 border-t-transparent" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-surface-800 border-2 border-dashed border-surface-600 flex items-center justify-center mb-4">
              <FolderOpen className="w-7 h-7 text-slate-600" />
            </div>
            <h2 className="text-base font-semibold text-slate-300 mb-1">No projects yet</h2>
            <p className="text-sm text-slate-500 mb-6 max-w-xs">
              Create your first reconciliation project to start matching source and target data.
            </p>
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" />
              Create First Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                details={projectDetails[p.id]}
                onOpen={handleOpenWorkflow}
                onDelete={handleDelete}
              />
            ))}
            <div
              className="border-2 border-dashed border-surface-700 rounded-xl p-5 flex flex-col items-center justify-center text-center cursor-pointer hover:border-surface-500 hover:bg-surface-700/20 transition-all min-h-[160px] group"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="w-8 h-8 text-slate-600 group-hover:text-slate-300 transition-colors mb-2" />
              <span className="text-xs text-slate-500 group-hover:text-slate-300 transition-colors">New Project</span>
            </div>
          </div>
        )}
      </div>

      <CreateProjectModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(project) => {
          qc.invalidateQueries(['projects'])
          navigate(`/projects/${project.id}/ingestion`)
        }}
      />
    </div>
  )
}
