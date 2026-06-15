import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        proxyTimeout: 10000,   // 10 s — gives backend time to start
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            // Suppress the giant ECONNREFUSED stack; print one clean line instead
            console.warn(`[proxy] Backend not ready yet (${req.method} ${req.url}) — is uvicorn running on :8000?`)
            if (!res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ detail: 'Backend unavailable — start uvicorn on port 8000' }))
            }
          })
        },
      },
    },
  },
})
