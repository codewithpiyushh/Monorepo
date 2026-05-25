import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-quartz.css'
import App from './App'
import { useThemeStore } from './store/themeStore'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

function RootApp() {
  const theme = useThemeStore((state) => state.theme)

  return (
    <>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          style:
            theme === 'light'
              ? {
                  background: '#ffffff',
                  color: '#1f252d',
                  border: '1px solid #d2d9e2',
                  borderRadius: '0px',
                  fontSize: '13px',
                }
              : {
                  background: '#22262b',
                  color: '#f4f6f8',
                  border: '1px solid #424a54',
                  borderRadius: '0px',
                  fontSize: '13px',
                },
        }}
      />
    </>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RootApp />
    </QueryClientProvider>
  </React.StrictMode>
)
