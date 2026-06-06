import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight, BookOpen, Zap, AlertTriangle,
  Grid2x2, List, Plus, Search, X, ChevronRight,
  TrendingUp, CheckCircle2, Clock, ShieldAlert, BarChart3,
  AlertTriangle as AlertIcon,
} from 'lucide-react'
import { projectsAPI, enterpriseAPI } from '../api'
import { advancedAPI } from '../api'
import { LoadingState } from '../components/ui/PageState'
import ProjectCreationModal from '../components/ProjectCreationModal'
import { useProjectStore } from '../store/projectStore'

// ── Fixed tile dimensions ────────────────────────────────────
const TILE_MIN_W = 200   // px — minimum tile width (responsive)
const TILE_H     = 152   // px — compact tile height (3 rows fit easily)
const TILE_GAP   = 10    // px — gap between tiles
const LIST_ROW_H = 65    // px — list row height (including border)

// ── Project Info Modal ────────────────────────────────────────
function ProjectInfoModal({ project, onClose }) {
  if (!project) return null
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', padding: 16,
    }}>
      <div style={{
        background: 'var(--surface-2)', border: '1px solid var(--border-2)',
        borderTop: '3px solid #FFE600', borderRadius: 12,
        width: '100%', maxWidth: 520,
        boxShadow: '0 24px 64px rgba(0,0,0,0.40)', overflow: 'hidden',
        fontFamily: 'Inter, sans-serif',
      }}>
        <div style={{
          height: 56, padding: '0 20px', borderBottom: '1px solid var(--border-1)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
              Project Information
            </p>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {project.name}
            </h2>
          </div>
          <button type="button" onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border-2)',
            background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--text-secondary)',
          }}>
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>
        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[
            { label: 'Project ID',  value: `#${project.id}` },
            { label: 'Status',      value: project.status || '-' },
            { label: 'Source',      value: project.source_dataset_name || 'source' },
            { label: 'Target',      value: project.target_dataset_name || 'target' },
            { label: 'Created by',  value: project.created_by_username || project.owner_username || '-' },
            { label: 'Updated by',  value: project.updated_by_username || project.owner_username || '-' },
          ].map(({ label, value }) => (
            <div key={label}>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-tertiary)' }}>{label}</p>
              <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</p>
            </div>
          ))}
          <div style={{ gridColumn: '1 / -1' }}>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-tertiary)' }}>Last updated</p>
            <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {project.updated_at ? new Date(project.updated_at).toLocaleString() : '-'}
            </p>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-tertiary)' }}>Description</p>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>
              {project.description || 'No description provided.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tile Card — fixed size ────────────────────────────────────
function ProjectTileCard({ project }) {
  const navigate = useNavigate()
  const src = project.source_dataset_name || 'source'
  const tgt = project.target_dataset_name || 'target'

  return (
    <div style={{
      height: TILE_H, width: '100%', minWidth: 0,
      position: 'relative', display: 'flex', flexDirection: 'column',
      borderRadius: 12, border: '1px solid var(--border-1)',
      background: 'var(--surface-2)', overflow: 'hidden',
      fontFamily: 'Inter, sans-serif',
      transition: 'border-color 140ms, box-shadow 140ms',
      boxSizing: 'border-box',
    }}
    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,230,0,0.35)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.22)' }}
    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-1)'; e.currentTarget.style.boxShadow = 'none' }}
    >
      {/* EY yellow accent bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#FFE600' }} />

      <div style={{ padding: '12px 12px 10px', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

        {/* Row 1: Title + ID */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <h3 style={{
            margin: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flex: 1, minWidth: 0, letterSpacing: '-0.01em', lineHeight: 1.2,
          }}>
            {project.name}
          </h3>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, height: 22, padding: '0 8px', borderRadius: 6,
            border: '1px solid var(--border-2)', background: 'var(--surface-3)',
            fontSize: 10.5, fontWeight: 700, color: 'var(--text-secondary)',
          }}>
            #{project.id}
          </span>
        </div>

        {/* Row 2: Source / target */}
        <p style={{ margin: '2px 0 6px', fontSize: 10.5, color: 'var(--text-tertiary)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {src}, {tgt}
        </p>

        {/* Row 3: Compact meta — created + last updated on one line */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 'auto' }}>
          <p style={{ margin: 0, fontSize: 10.5, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: 'var(--text-disabled)' }}>By:</span> {project.created_by_username || 'admin'}
          </p>
          <p style={{ margin: 0, fontSize: 10.5, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: 'var(--text-disabled)' }}>Updated:</span> {project.updated_at ? new Date(project.updated_at).toLocaleString() : '-'}
          </p>
        </div>

        {/* Row 4: Action buttons */}
        <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'nowrap' }}>
          {/* Ingestion */}
          <button type="button"
            onClick={(e) => { e.stopPropagation(); navigate(`/projects/${project.id}/ingestion`) }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              height: 26, padding: '0 8px', borderRadius: 5,
              border: '1px solid var(--border-2)', background: 'var(--surface-3)',
              color: 'var(--text-primary)', fontSize: 11, fontWeight: 600,
              cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'Inter, sans-serif',
              transition: 'border-color 100ms, background 100ms', flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,230,0,0.30)'; e.currentTarget.style.background = 'var(--surface-4)' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-2)'; e.currentTarget.style.background = 'var(--surface-3)' }}
          >
            <BookOpen style={{ width: 11, height: 11 }} /> Ingestion
          </button>

          {/* Rules */}
          <button type="button"
            onClick={(e) => { e.stopPropagation(); navigate(`/projects/${project.id}/rules`) }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              height: 26, padding: '0 8px', borderRadius: 5,
              border: '1px solid var(--border-2)', background: 'var(--surface-3)',
              color: 'var(--text-primary)', fontSize: 11, fontWeight: 600,
              cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'Inter, sans-serif',
              transition: 'border-color 100ms, background 100ms', flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,230,0,0.30)'; e.currentTarget.style.background = 'var(--surface-4)' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-2)'; e.currentTarget.style.background = 'var(--surface-3)' }}
          >
            <Zap style={{ width: 11, height: 11 }} /> Rules
          </button>

          {/* Run — EY yellow */}
          <button type="button"
            onClick={(e) => { e.stopPropagation(); navigate(`/projects/${project.id}/results`) }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              height: 26, padding: '0 10px', borderRadius: 5,
              border: '1px solid #E6CF00', background: '#FFE600',
              color: '#1A1A24', fontSize: 11, fontWeight: 700,
              cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'Inter, sans-serif',
              transition: 'background 100ms, box-shadow 100ms', flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#FFED4A'; e.currentTarget.style.boxShadow = '0 3px 10px rgba(255,230,0,0.28)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#FFE600'; e.currentTarget.style.boxShadow = 'none' }}
          >
            <ArrowRight style={{ width: 11, height: 11 }} /> Run
          </button>
        </div>
      </div>
    </div>
  )
}

// ── List Row ──────────────────────────────────────────────────
function ProjectListRow({ project, onShowInfo, isLast }) {
  const navigate = useNavigate()
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '14px 20px',
      borderBottom: isLast ? 'none' : '1px solid var(--border-0)',
      fontFamily: 'Inter, sans-serif', transition: 'background 100ms',
      background: 'transparent',
    }}
    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-3)'}
    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{
          margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)',
          letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {project.name}
        </h3>
        <p style={{
          margin: '3px 0 0', fontSize: 12, lineHeight: 1.5, color: 'var(--text-tertiary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {project.description || 'No description provided.'}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {/* Info */}
        <button type="button" onClick={(e) => { e.stopPropagation(); onShowInfo() }} title="Project information"
          style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '1px solid var(--border-2)', background: 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--text-tertiary)', flexShrink: 0,
            transition: 'border-color 100ms, color 100ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,230,0,0.40)'; e.currentTarget.style.color = '#FFE600' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-2)'; e.currentTarget.style.color = 'var(--text-tertiary)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
        </button>

        {/* Open */}
        <button type="button" onClick={() => navigate(`/projects/${project.id}/ingestion`)}
          style={{
            display: 'inline-flex', alignItems: 'center',
            height: 32, padding: '0 16px', borderRadius: 6,
            border: '1px solid var(--border-2)', background: 'var(--surface-3)',
            color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 600,
            cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'Inter, sans-serif',
            transition: 'border-color 100ms, background 100ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,230,0,0.35)'; e.currentTarget.style.background = 'var(--surface-4)' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-2)'; e.currentTarget.style.background = 'var(--surface-3)' }}
        >
          Open
        </button>

        {/* Run */}
        <button type="button" onClick={() => navigate(`/projects/${project.id}/results`)}
          style={{
            display: 'inline-flex', alignItems: 'center',
            height: 32, padding: '0 16px', borderRadius: 6,
            border: '1px solid #E6CF00', background: '#FFE600',
            color: '#1A1A24', fontSize: 12.5, fontWeight: 700,
            cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'Inter, sans-serif',
            transition: 'background 100ms, box-shadow 100ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#FFED4A'; e.currentTarget.style.boxShadow = '0 3px 10px rgba(255,230,0,0.30)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#FFE600'; e.currentTarget.style.boxShadow = 'none' }}
        >
          Run
        </button>
      </div>
    </div>
  )
}

// ── Pagination bar ────────────────────────────────────────────
function PaginationBar({ current, total, onPrev, onNext, onPage, showing, totalItems }) {
  const visiblePages = useMemo(() => {
    if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1)
    const half = 2
    let start = Math.max(1, current - half)
    let end   = Math.min(total, current + half)
    if (current - half < 1)      end   = Math.min(total, 5)
    if (current + half > total)  start = Math.max(1, total - 4)
    return Array.from({ length: end - start + 1 }, (_, i) => start + i)
  }, [current, total])

  // Always render — shows count even on single page, ready for overflow
  if (total === 0) return null

  return (
    <div style={{
      marginTop: 14, display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, flexShrink: 0,
    }}>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>
        {showing}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {total > 1 && <button type="button" disabled={current === 1} onClick={onPrev} style={{
          height: 34, padding: '0 14px', borderRadius: 8,
          border: '1px solid var(--border-2)', background: 'var(--surface-2)',
          color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 600,
          cursor: current === 1 ? 'not-allowed' : 'pointer',
          fontFamily: 'Inter, sans-serif', opacity: current === 1 ? 0.5 : 1,
        }}>Previous</button>}

        {total > 1 && visiblePages.map((page) => {
          const isActive = page === current
          return (
            <button key={page} type="button" onClick={() => onPage(page)} style={{
              width: 34, height: 34, borderRadius: 8,
              border: isActive ? '1px solid #E6CF00' : '1px solid var(--border-2)',
              background: isActive ? '#FFE600' : 'var(--surface-2)',
              color: isActive ? '#1A1A24' : 'var(--text-secondary)',
              fontSize: 12.5, fontWeight: isActive ? 800 : 500,
              cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              transition: 'background 100ms, border-color 100ms',
            }}
            onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.borderColor = 'rgba(255,230,0,0.30)'; e.currentTarget.style.background = 'var(--surface-3)' } }}
            onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.borderColor = 'var(--border-2)'; e.currentTarget.style.background = 'var(--surface-2)' } }}
            >{page}</button>
          )
        })}

        {total > 1 && <button type="button" disabled={current === total} onClick={onNext} style={{
          height: 34, padding: '0 14px', borderRadius: 8,
          border: '1px solid var(--border-2)', background: 'var(--surface-2)',
          color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 600,
          cursor: current === total ? 'not-allowed' : 'pointer',
          fontFamily: 'Inter, sans-serif', opacity: current === total ? 0.5 : 1,
        }}>Next</button>}
      </div>
    </div>
  )
}

// ── CommandCenter ─────────────────────────────────────────────
export default function CommandCenter() {
  const navigate = useNavigate()
  const gridRef  = useRef(null)   // measures available space for tiles
  const listRef  = useRef(null)   // measures available space for list rows

  const [infoProject,    setInfoProject]    = useState(null)
  const [currentPage,    setCurrentPage]    = useState(1)
  const [tilesPerPage,   setTilesPerPage]   = useState(8)
  const [rowsPerPage,    setRowsPerPage]    = useState(8)

  const {
    ccSearch: searchTerm, setCcSearch: setSearchTerm,
    ccView: projectView,  setCcView: setProjectView,
    ccShowModal: showCreationModal, setCcShowModal: setShowCreationModal,
    setCcCounts,
  } = useProjectStore()

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsAPI.list,
  })

  const { data: execDash } = useQuery({
    queryKey: ['executive-dashboard-real'],
    queryFn: async () => {
      try { return await advancedAPI.executiveDashboard() }
      catch { return null }  // silently fail for lower-privilege roles
    },
    refetchInterval: 60000,
    retry: false,
  })

  // ── Measure available space → derive page size ────────────
  const measureTileGrid = useCallback(() => {
    const el = gridRef.current
    if (!el) return
    const w = el.clientWidth
    const h = el.clientHeight
    // Responsive cols: fill width with minimum tile width
    const cols = Math.max(1, Math.floor((w + TILE_GAP) / (TILE_MIN_W + TILE_GAP)))
    // Always show exactly 3 rows — fixed requirement
    const rows = 3
    setTilesPerPage(cols * rows)
  }, [])

  const measureListRows = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const h = el.clientHeight
    // Leave 60px for pagination, 2px for container border
    const rows = Math.max(1, Math.floor((h - 62) / LIST_ROW_H))
    setRowsPerPage(rows)
  }, [])

  // Observe size changes
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      if (projectView === 'tile') measureTileGrid()
      else measureListRows()
    })
    const target = projectView === 'tile' ? gridRef.current : listRef.current
    if (target) ro.observe(target)
    // Initial measure
    if (projectView === 'tile') measureTileGrid()
    else measureListRows()
    return () => ro.disconnect()
  }, [projectView, measureTileGrid, measureListRows])

  const filteredProjects = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((p) =>
      [p.name, p.description, String(p.id), p.status].join(' ').toLowerCase().includes(q)
    )
  }, [projects, searchTerm])

  // Reset page when search/view changes
  useEffect(() => { setCurrentPage(1) }, [searchTerm, projectView])

  const activeCount = useMemo(
    () => projects.filter((p) => String(p.status || '').toLowerCase() === 'active').length,
    [projects]
  )

  useEffect(() => {
    setCcCounts({ active: activeCount, inactive: projects.length - activeCount, total: projects.length })
  }, [activeCount, projects.length, setCcCounts])

  const pageSize     = projectView === 'tile' ? tilesPerPage : rowsPerPage
  const totalPages   = Math.max(1, Math.ceil(filteredProjects.length / pageSize))
  const safePage     = Math.min(currentPage, totalPages)

  const paginatedProjects = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filteredProjects.slice(start, start + pageSize)
  }, [safePage, filteredProjects, pageSize])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const showingLabel = filteredProjects.length === 0 ? 'No projects' :
    `Showing ${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, filteredProjects.length)} of ${filteredProjects.length}`

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'Inter, sans-serif' }}>

      {/* ── Enterprise KPI Strip ─────────────────────────────── */}
      {execDash && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: 8,
          padding: '10px 16px',
          borderBottom: '1px solid var(--border-1)',
          background: 'var(--surface-1)',
          flexShrink: 0,
        }}>
          {[
            ['Profiles',        execDash.profile_summary?.total ?? '—',                                          BarChart3,    'var(--accent)',  '/reconciliation-profiles'],
            ['Certified',       `${execDash.profile_summary?.certification_pct ?? 0}%`,                          CheckCircle2, 'var(--ok)',      '/close-certification'],
            ['Open Exceptions', execDash.exceptions?.open ?? '—',                                                AlertIcon,    'var(--bad)',     '/exception-workbench'],
            ['Auto-Match',      `${execDash.matching?.auto_match_rate ?? 0}%`,                                   TrendingUp,   'var(--info)',    '/transaction-matching'],
            ['Overdue Periods', execDash.close_management?.overdue_periods ?? '—',                               Clock,        'var(--warn)',    '/close-certification'],
            ['High Risk',       (execDash.risk_breakdown?.HIGH ?? 0) + (execDash.risk_breakdown?.CRITICAL ?? 0), ShieldAlert,  '#c026d3',       '/risk-dashboard'],
          ].map(([label, val, Icon, color, path]) => (
            <button key={label} onClick={() => navigate(path)} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
              background: 'var(--surface-2)', border: '1px solid var(--border-1)',
              borderRadius: 8, cursor: 'pointer', textAlign: 'left',
              transition: 'border-color 120ms', fontFamily: 'Inter, sans-serif',
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = color}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-1)'}
            >
              <Icon style={{ width: 13, height: 13, color, flexShrink: 0 }} />
              <div>
                <p style={{ margin: 0, fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1 }}>{label}</p>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color, lineHeight: 1.2 }}>{val}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Main content area ────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {isLoading ? (
          <LoadingState label="Loading projects..." />
        ) : (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '16px 20px' }}>

            {/* Empty state */}
            {filteredProjects.length === 0 && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{
                  background: 'var(--surface-2)', border: '1px solid var(--border-1)',
                  borderRadius: 12, padding: 32, textAlign: 'center', maxWidth: 380,
                }}>
                  <AlertTriangle style={{ width: 28, height: 28, color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {projects.length === 0 ? 'No projects yet' : 'No projects match your search'}
                  </p>
                  <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--text-tertiary)' }}>
                    {projects.length === 0
                      ? 'Click "New Project" to create your first reconciliation project'
                      : 'Try a different search term or clear the filter'}
                  </p>
                </div>
              </div>
            )}

            {/* ── TILE view ──────────────────────────────────── */}
            {filteredProjects.length > 0 && projectView === 'tile' && (
              <div ref={gridRef} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{
                  flex: 1, minHeight: 0, overflow: 'hidden',
                  display: 'grid',
                  gridTemplateColumns: `repeat(auto-fill, minmax(${TILE_MIN_W}px, 1fr))`,
                  gridAutoRows: TILE_H,
                  gap: TILE_GAP,
                  alignContent: 'start',
                }}>
                  {paginatedProjects.map((p) => (
                    <ProjectTileCard key={p.id} project={p} />
                  ))}
                </div>

                <PaginationBar
                  current={safePage} total={totalPages}
                  onPrev={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  onNext={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  onPage={setCurrentPage}
                  showing={showingLabel}
                  totalItems={filteredProjects.length}
                />
              </div>
            )}

            {/* ── LIST view ──────────────────────────────────── */}
            {filteredProjects.length > 0 && projectView === 'list' && (
              <div ref={listRef} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  <div style={{
                    background: 'var(--surface-2)', border: '1px solid var(--border-1)',
                    borderRadius: 10, overflow: 'hidden',
                  }}>
                    {paginatedProjects.map((p, idx) => (
                      <ProjectListRow
                        key={p.id} project={p}
                        isLast={idx === paginatedProjects.length - 1}
                        onShowInfo={() => setInfoProject(p)}
                      />
                    ))}
                  </div>
                </div>

                <PaginationBar
                  current={safePage} total={totalPages}
                  onPrev={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  onNext={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  onPage={setCurrentPage}
                  showing={showingLabel}
                  totalItems={filteredProjects.length}
                />
              </div>
            )}

          </div>
        )}
      </div>

      <ProjectCreationModal isOpen={showCreationModal} onClose={() => setShowCreationModal(false)} />
      <ProjectInfoModal project={infoProject} onClose={() => setInfoProject(null)} />
    </div>
  )
}
