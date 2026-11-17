import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Storefront builds to dist/store (publish this folder to the client's storefront Netlify site).
// The owner dashboard builds separately to dist/admin (see scripts/build-admin.mjs).
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist/store', emptyOutDir: true, sourcemap: false },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.{js,jsx}'],
  },
});
