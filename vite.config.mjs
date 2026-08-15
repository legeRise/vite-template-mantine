import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    // Single-page app: silence the large-chunk warning.
    // The app is intentionally kept as one bundle for simplicity.
    chunkSizeWarningLimit: 1500,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './vitest.setup.mjs',
  },

  resolve: {
    tsconfigPaths: true,
  },
});
