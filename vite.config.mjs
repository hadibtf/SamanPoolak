import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: process.env.VITE_APP_SURFACE === 'employee' ? 'dist/employee' : 'dist/platform',
    emptyOutDir: true,
  },
  server: {
    host: process.env.HOST || '0.0.0.0',
    port: Number(process.env.PORT || 3000),
    proxy: {
      '/__api': {
        target: process.env.VITE_DEV_API_TARGET || 'http://127.0.0.1:18000',
        changeOrigin: true,
        // The API login route validates Origin against the configured local
        // app origin. LAN clients still enter through Vite, but the proxied
        // request identifies the local development surface to the API.
        headers: {
          Origin: process.env.VITE_DEV_APP_ORIGIN || 'http://localhost:3000',
        },
        rewrite: (path) => path.replace(/^\/__api/, ''),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
  },
});
