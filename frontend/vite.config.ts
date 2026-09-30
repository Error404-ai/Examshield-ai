import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Local dev: set VITE_API_URL=/api in frontend/.env.local.
// Backend routes already start with /api, so the proxy must NOT rewrite the path.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  }
})