import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  BookOpen,
  Zap,
  AlertTriangle,
  Grid2x2,
  Info,
  List,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { projectsAPI } from '../api'
import { LoadingState } from '../components/ui/PageState'
import ProjectCreationModal from '../components/ProjectCreationModal'

const TILE_CARD_HEIGHT = 174
const TILE_ROW_GAP = 10
const LIST_ROW_HEIGHT = 74
const LIST_ROW_GAP = 12
const PAGINATION_HEIGHT = 56

function getVisibleItemCount({ height, columns, view }) {
  if (!height) return view === 'tile' ? columns : 3

  if (view === 'tile') {
    const rows = Math.max(1, Math.floor((height + TILE_ROW_GAP) / (TILE_CARD_HEIGHT + TILE_ROW_GAP)))
    return rows * columns
  }

  return Math.max(1, Math.floor((height + LIST_ROW_GAP) / (LIST_ROW_HEIGHT + LIST_ROW_GAP)))
}

function ProjectInfoModal({ project, onClose }) {
  if (!project) return null

  const sourceLabel = project.source_dataset_name || 'source'
  const targetLabel = project.target_dataset_name || 'target'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="card w-full max-w-xl overflow-hidden">
        <div className="h-14 px-5 border-b border-surface-700/60 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Project Information</p>
            <h2 className="text-sm font-semibold text-slate-100 truncate">{project.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg border border-surface-700/70 bg-surface-900/40 flex items-center justify-center text-slate-400 hover:text-slate-100"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-500">Project ID</p>
            <p className="font-semibold text-slate-100">#{project.id}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Status</p>
            <p className="font-semibold text-slate-100 capitalize">{project.status || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Source</p>
            <p className="font-semibold text-slate-100 truncate">{sourceLabel}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Target</p>
            <p className="font-semibold text-slate-100 truncate">{targetLabel}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Created by</p>
            <p className="font-semibold text-slate-100">{project.created_by_username || project.owner_username || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Updated by</p>
            <p className="font-semibold text-slate-100">{project.updated_by_username || project.owner_username || '-'}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-slate-500">Last updated</p>
            <p className="font-semibold text-slate-100">{project.updated_at ? new Date(project.updated_at).toLocaleString() : '-'}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-slate-500">Description</p>
            <p className="text-slate-100">{project.description || 'No description provided'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProjectCard({ project, onOpenWorkspace, onShowInfo }) {
  const sourceLabel = project.source_dataset_name || 'source'
  const targetLabel = project.target_dataset_name || 'target'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenWorkspace}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpenWorkspace()
        }
      }}
      className="card h-[174px] p-4 space-y-2.5 border-surface-700 text-left w-full transition hover:-translate-y-0.5 hover:border-brand-500/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-[13px] font-semibold text-slate-100 truncate">{project.name}</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {`source-${sourceLabel}, target-${targetLabel}`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onKeyDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onShowInfo()
            }}
            className="w-7 h-7 rounded-lg border border-surface-700/70 bg-surface-900/40 flex items-center justify-center text-slate-400 hover:text-slate-100"
            title="Project information"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
          <div className="text-[10px] font-semibold px-2 py-0.5 bg-surface-700 text-slate-200 rounded whitespace-nowrap">
            #{project.id}
          </div>
        </div>
      </div>

      <div className="space-y-0.5 text-[11px] text-slate-300">
        <p>Created by: <span className="text-slate-100">{project.created_by_username || project.owner_username || '-'}</span></p>
        <p>Updated by: <span className="text-slate-100">{project.updated_by_username || project.owner_username || '-'}</span></p>
        <p>Last updated: <span className="text-slate-100">{project.updated_at ? new Date(project.updated_at).toLocaleString() : '-'}</span></p>
      </div>

      <div className="flex gap-2">
        <span className="btn-secondary py-1.5 px-2.5 text-[11px] flex items-center gap-1.5 flex-1 justify-center">
          <BookOpen className="w-3.5 h-3.5" />
          Ingestion
        </span>
        <span className="btn-secondary py-1.5 px-2.5 text-[11px] flex items-center gap-1.5 flex-1 justify-center">
          <Zap className="w-3.5 h-3.5" />
          Rules
        </span>
        <span className="btn-primary py-1.5 px-2.5 text-[11px] flex items-center gap-1.5 flex-1 justify-center">
          <ArrowRight className="w-3.5 h-3.5" />
          Run
        </span>
      </div>
    </div>
  )
}

export default function CommandCenter() {
  const navigate = useNavigate()
  const projectsAreaRef = useRef(null)
  const [showCreationModal, setShowCreationModal] = useState(false)
  const [infoProject, setInfoProject] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [projectView, setProjectView] = useState('tile')
  const [currentPage, setCurrentPage] = useState(1)
  const [windowWidth, setWindowWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 0))
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsAPI.list,
  })

  const filteredProjects = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((project) => {
      const haystack = [project.name, project.description, String(project.id), project.status].join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [projects, searchTerm])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, projectView])

  useEffect(() => {
    const element = projectsAreaRef.current
    if (!element) return undefined

    const updateViewportSize = () => {
      setViewportSize({
        width: element.clientWidth,
        height: element.clientHeight,
      })
    }

    updateViewportSize()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateViewportSize)
      return () => window.removeEventListener('resize', updateViewportSize)
    }

    const observer = new ResizeObserver(updateViewportSize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const updateWindowWidth = () => setWindowWidth(window.innerWidth)
    updateWindowWidth()
    window.addEventListener('resize', updateWindowWidth)
    return () => window.removeEventListener('resize', updateWindowWidth)
  }, [])

  const projectCounts = useMemo(() => {
    const active = projects.filter((project) => String(project.status || '').toLowerCase() === 'active').length
    const inactive = projects.length - active
    return { active, inactive, total: projects.length }
  }, [projects])

  const columns = useMemo(() => {
    if (projectView !== 'tile') return 1
    if (windowWidth >= 1280) return 4
    if (windowWidth >= 640) return 2
    return 1
  }, [projectView, windowWidth])

  const pageSize = useMemo(() => {
    const height = viewportSize.height || 0
    const fullHeightCount = getVisibleItemCount({ height, columns, view: projectView })
    if (filteredProjects.length <= fullHeightCount) {
      return fullHeightCount
    }

    return getVisibleItemCount({
      height: Math.max(0, height - PAGINATION_HEIGHT),
      columns,
      view: projectView,
    })
  }, [columns, filteredProjects.length, projectView, viewportSize.height])

  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / pageSize))
  const paginatedProjects = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredProjects.slice(start, start + pageSize)
  }, [currentPage, filteredProjects, pageSize])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const loading = projectsLoading

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {loading ? <LoadingState label="Loading projects..." /> : null}

        {!loading && (
          <>
            <div className="sticky top-0 z-20 border-b border-surface-700/60" style={{ background: 'var(--header-bg)' }}>
              <div className="px-4 py-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Projects</p>
                    <p className="text-base font-semibold text-slate-100">
                      {projectCounts.total} total
                      <span className="ml-3 text-sm font-normal text-slate-400">
                        {projectCounts.active} active, {projectCounts.inactive} inactive
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="flex-1 lg:flex-none flex items-center gap-2 rounded-xl border border-surface-700/70 bg-surface-900/40 px-3 h-10 min-w-0 md:min-w-[280px]">
                      <Search className="w-4 h-4 text-slate-500" />
                      <input
                        className="w-full bg-transparent outline-none text-sm text-slate-100 placeholder:text-slate-500"
                        placeholder="Search projects..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>

                    <div className="flex items-center rounded-xl border border-surface-700/70 bg-surface-900/40 p-1 h-10">
                      <button
                        type="button"
                        onClick={() => setProjectView('list')}
                        className={`h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-2 transition ${
                          projectView === 'list' ? 'bg-brand-900/30 text-slate-100' : 'text-slate-400 hover:text-slate-100'
                        }`}
                      >
                        <List className="w-3.5 h-3.5" />
                        List
                      </button>
                      <button
                        type="button"
                        onClick={() => setProjectView('tile')}
                        className={`h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-2 transition ${
                          projectView === 'tile' ? 'bg-brand-900/30 text-slate-100' : 'text-slate-400 hover:text-slate-100'
                        }`}
                      >
                        <Grid2x2 className="w-3.5 h-3.5" />
                        Tile
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowCreationModal(true)}
                      className="h-10 px-4 rounded-xl border border-brand-500/40 bg-brand-500/10 text-brand-200 hover:bg-brand-500/15 transition flex items-center gap-2 text-sm font-semibold"
                    >
                      <Plus className="w-4 h-4" />
                      New Project
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Projects Grid */}
            <div ref={projectsAreaRef} className="flex-1 min-h-0 flex flex-col overflow-hidden p-4">
              {filteredProjects.length === 0 ? (
                <div className="flex-1 min-h-0 flex items-center justify-center">
                  <div className="card p-6 text-center max-w-md w-full">
                    <AlertTriangle className="w-7 h-7 text-slate-500 mx-auto mb-2" />
                    <p className="text-slate-400">{projects.length === 0 ? 'No projects yet' : 'No projects match your search'}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {projects.length === 0 ? 'Click "New Project" to create your first reconciliation project' : 'Try a different search term or clear the filter'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-hidden">
                  {projectView === 'list' ? (
                    <div className="space-y-3">
                      {paginatedProjects.map((project) => (
                        <div key={project.id} className="card h-[74px] px-4 border-surface-700 flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-semibold text-slate-100 truncate">{project.name}</h3>
                            <p className="text-xs text-slate-400 mt-1 truncate">{project.description || 'No description provided'}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              type="button"
                              className="w-9 h-9 rounded-lg border border-surface-700/70 bg-surface-900/40 flex items-center justify-center text-slate-400 hover:text-slate-100"
                              onClick={() => setInfoProject(project)}
                              title="Project information"
                            >
                              <Info className="w-4 h-4" />
                            </button>
                            <button className="btn-secondary py-2 px-3 text-xs" onClick={() => navigate(`/projects/${project.id}/ingestion`)}>
                              Open
                            </button>
                            <button className="btn-primary py-2 px-3 text-xs" onClick={() => navigate(`/projects/${project.id}/results`)}>
                              Run
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
                      {paginatedProjects.map((project) => (
                        <ProjectCard
                          key={project.id}
                          project={project}
                          onOpenWorkspace={() => navigate(`/projects/${project.id}/ingestion`)}
                          onShowInfo={() => setInfoProject(project)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {filteredProjects.length > pageSize ? (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-500">
                    Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, filteredProjects.length)} of {filteredProjects.length}
                  </p>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn-secondary px-3 py-2 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </button>

                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => {
                        const isActive = page === currentPage
                        return (
                          <button
                            key={page}
                            type="button"
                            onClick={() => setCurrentPage(page)}
                            className={`min-w-9 h-9 px-3 rounded-lg border text-xs font-semibold transition ${
                              isActive
                                ? 'border-brand-500/50 bg-brand-500/15 text-slate-100'
                                : 'border-surface-700/70 bg-surface-900/40 text-slate-400 hover:text-slate-100 hover:border-surface-500'
                            }`}
                          >
                            {page}
                          </button>
                        )
                      })}
                    </div>

                    <button
                      type="button"
                      className="btn-secondary px-3 py-2 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>

      <ProjectCreationModal isOpen={showCreationModal} onClose={() => setShowCreationModal(false)} />
      <ProjectInfoModal project={infoProject} onClose={() => setInfoProject(null)} />
    </div>
  )
}
