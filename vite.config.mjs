import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/platform',
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
        // app origin, so proxied development requests identify as localhost.
        headers: {
          Origin: 'http://localhost:3000',
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
