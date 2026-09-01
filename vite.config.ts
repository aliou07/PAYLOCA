import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // On ignore les erreurs de tsconfig manquant
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
})
