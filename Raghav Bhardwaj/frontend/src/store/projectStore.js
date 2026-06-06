import { create } from 'zustand'

const PROJECT_KEY = 'drms_active_project_id'
const CC_VIEW_KEY = 'drms_cc_view'

const getStoredProjectId = () => {
  try { return localStorage.getItem(PROJECT_KEY) || '' } catch { return '' }
}
const getStoredView = () => {
  try { return localStorage.getItem(CC_VIEW_KEY) || 'tile' } catch { return 'tile' }
}

export const useProjectStore = create((set) => ({
  // Active project selection (persisted)
  selectedProjectId: getStoredProjectId(),
  setSelectedProjectId: (projectId) => {
    const next = projectId ? String(projectId) : ''
    localStorage.setItem(PROJECT_KEY, next)
    set({ selectedProjectId: next })
  },

  // Command-center toolbar state (shared between Layout header & CommandCenter page)
  ccSearch: '',
  setCcSearch: (v) => set({ ccSearch: v }),

  ccView: getStoredView(),
  setCcView: (v) => {
    localStorage.setItem(CC_VIEW_KEY, v)
    set({ ccView: v })
  },

  ccShowModal: false,
  setCcShowModal: (v) => set({ ccShowModal: v }),

  // Project counts — set by CommandCenter, read by Layout header
  ccCounts: { total: 0, active: 0, inactive: 0 },
  setCcCounts: (counts) => set({ ccCounts: counts }),
}))
