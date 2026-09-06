import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      external: [] // on laisse vide
    }
  },
  optimizeDeps: {
    exclude: ['@payloca/db'] // si tu as un workspace
  }
})
