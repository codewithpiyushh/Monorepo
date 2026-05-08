import { create } from 'zustand'

const THEME_KEY = 'drms_theme'

const getStoredTheme = () => {
  const saved = localStorage.getItem(THEME_KEY)
  return saved === 'light' ? 'light' : 'dark'
}

export const useThemeStore = create((set, get) => ({
  theme: getStoredTheme(),

  setTheme: (theme) => {
    const nextTheme = theme === 'light' ? 'light' : 'dark'
    localStorage.setItem(THEME_KEY, nextTheme)
    set({ theme: nextTheme })
  },

  toggleTheme: () => {
    const current = get().theme
    const next = current === 'dark' ? 'light' : 'dark'
    localStorage.setItem(THEME_KEY, next)
    set({ theme: next })
  },
}))
