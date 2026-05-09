import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Dev proxy: forwards /api/* → FastAPI at :8000
    // This avoids CORS preflight issues with Authorization headers in dev.
    // In production, configure your reverse proxy (nginx/caddy) the same way.
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
