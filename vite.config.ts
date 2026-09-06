import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    // Empêche vite d'aller chercher les fichiers de lib/db
    rollupOptions: {
      external: []
    }
  },
  optimizeDeps: {
    exclude: ['@payloca/db'] // si tu utilises le workspace
  }
})
