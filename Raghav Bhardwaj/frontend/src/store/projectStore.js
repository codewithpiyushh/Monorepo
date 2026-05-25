import { create } from 'zustand'

const PROJECT_KEY = 'drms_active_project_id'

const getStoredProjectId = () => {
  try {
    return localStorage.getItem(PROJECT_KEY) || ''
  } catch {
    return ''
  }
}

export const useProjectStore = create((set) => ({
  selectedProjectId: getStoredProjectId(),
  setSelectedProjectId: (projectId) => {
    const next = projectId ? String(projectId) : ''
    localStorage.setItem(PROJECT_KEY, next)
    set({ selectedProjectId: next })
  },
}))
