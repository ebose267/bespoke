import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: '0.0.0.0', port: 3000, allowedHosts: 'all' },
  build: {
    outDir: 'dist/store',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        main: 'index.html',
        admin: 'admin.html',
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.{js,jsx}'],
    exclude: ['tests/backend.test.js', 'node_modules/**'],
  },
});
