import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const rawPort = process.env.PORT ?? '5173';
const parsedPort = Number(rawPort);
const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 5173;

const basePath = process.env.BASE_PATH || '/';
const isReplitDev =
  process.env.NODE_ENV !== 'production' && process.env.REPL_ID !== undefined;

async function getReplitPlugins() {
  if (!isReplitDev) {
    return [];
  }

  try {
    const [{ default: runtimeErrorOverlay }, cartographerModule, devBannerModule] =
      await Promise.all([
        import('@replit/vite-plugin-runtime-error-modal'),
        import('@replit/vite-plugin-cartographer'),
        import('@replit/vite-plugin-dev-banner'),
      ]);

    return [
      runtimeErrorOverlay(),
      cartographerModule.cartographer({
        root: path.resolve(import.meta.dirname, '..'),
      }),
      devBannerModule.devBanner(),
    ];
  } catch {
    return [];
  }
}

export default defineConfig(async () => ({
  base: basePath,
  plugins: [react(), tailwindcss({ optimize: false }), ...(await getReplitPlugins())],
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(import.meta.dirname, '..', '..', 'attached_assets'),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
}));
