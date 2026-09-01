import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  esbuild: {
    tsconfig: 'tsconfig.json' // <- ON FORCE VITE À IGNORER lib/db
  }
})
