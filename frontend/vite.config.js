import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const backend = process.env.BACKEND_URL || 'http://localhost:4000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy API and auth calls to the backend so the session cookie is
    // same-origin during development.
    proxy: {
      '/api': backend,
      '/auth': backend,
    },
  },
})
