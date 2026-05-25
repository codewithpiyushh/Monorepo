import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../store/authStore'
import { projectsAPI } from '../api'
import PageHeader from '../components/ui/PageHeader'
import { ClipboardList, ArrowRight, CheckCircle2, AlertTriangle } from 'lucide-react'
import { EmptyState, LoadingState } from '../components/ui/PageState'

export default function WorkQueue() {
  const user = useAuthStore((s) => s.user)
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const role = (user?.role || '').toLowerCase()

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsAPI.list,
  })

  useEffect(() => {
    if (!selectedProjectId && projects.length) {
      setSelectedProjectId(String(projects[0].id))
    }
  }, [projects, selectedProjectId])

  const cards = useMemo(() => {
    const projectPath = selectedProjectId ? `/projects/${selectedProjectId}` : '/reconciliations'
    return [
      {
        title: 'Preparer Workbench',
        description: 'Work assigned reconciliations, evidence upload, and submissions.',
        to: selectedProjectId ? `${projectPath}/preparer` : '/reconciliations',
        icon: ClipboardList,
      },
      {
        title: 'Reviewer Workbench',
        description: 'Review submissions, approve/reject, and escalate exceptions.',
        to: selectedProjectId ? `${projectPath}/reviewer` : '/reconciliations',
        icon: CheckCircle2,
      },
      {
        title: 'Execution Workbench',
        description: 'Run reconciliation and complete role-based workflow actions.',
        to: selectedProjectId ? `${projectPath}/results` : '/reconciliations',
        icon: AlertTriangle,
      },
    ]
  }, [selectedProjectId])

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Work Queue"
        subtitle="Role-aware queue for preparation, review, and exception handling."
        badge={(user?.role || 'user').toUpperCase()}
      />
      <div className="flex-1 overflow-auto p-6 md:p-8">
        <div className="card p-4 mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <p className="text-xs text-slate-400 mb-2">Active project context</p>
            <select
              className="input h-10 text-sm"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              disabled={!projects.length}
            >
              {projects.length === 0 && <option value="">No projects found</option>}
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} (#{project.id})
                </option>
              ))}
            </select>
          </div>
          <div className="text-xs text-slate-400 flex items-end">
            {role === 'preparer' && 'Preparer role: open Preparer Workbench first.'}
            {role === 'reviewer' && 'Reviewer role: open Reviewer Workbench first.'}
            {role === 'admin' && 'Admin role: use Execution Workbench for full lifecycle control.'}
          </div>
        </div>
        {isLoading ? <LoadingState label="Loading work queue..." /> : null}
        {!isLoading && projects.length === 0 ? (
          <EmptyState
            title="No projects available"
            description="Create a project first from the main workflow so this queue can route work end-to-end."
          />
        ) : null}
        {!isLoading && projects.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon
            return (
              <Link key={card.title} to={card.to} className="card group p-5 transition hover:-translate-y-0.5 hover:border-brand-600/40">
                <div className="mb-4 inline-flex rounded-xl border border-surface-600 bg-surface-800 p-2.5">
                  <Icon className="h-4 w-4 text-brand-400" />
                </div>
                <h3 className="text-sm font-semibold text-slate-100">{card.title}</h3>
                <p className="mt-2 text-xs text-slate-400">{card.description}</p>
                <div className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-brand-400">
                  Open workspace
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </Link>
            )
          })}
        </div>
        ) : null}
      </div>
    </div>
  )
}
