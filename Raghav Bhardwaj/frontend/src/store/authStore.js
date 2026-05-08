import { create } from 'zustand'

const stored = () => {
  try {
    return JSON.parse(localStorage.getItem('drms_user'))
  } catch {
    return null
  }
}

export const useAuthStore = create((set) => ({
  user: stored(),
  token: localStorage.getItem('drms_token'),

  setAuth: (user, token) => {
    localStorage.setItem('drms_token', token)
    localStorage.setItem('drms_user', JSON.stringify(user))
    set({ user, token })
  },

  clearAuth: () => {
    localStorage.removeItem('drms_token')
    localStorage.removeItem('drms_user')
    set({ user: null, token: null })
  },
}))
