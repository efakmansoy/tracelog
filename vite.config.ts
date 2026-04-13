import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub repository ismi. Repo adınız "takip" değilse, bunu kendi repo adınızla (/repo-adi/) değiştirin.
  base: '/takip/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@sentry')) return 'sentry'
            if (id.includes('react')) return 'react-vendor'
            if (id.includes('@supabase')) return 'supabase'
            if (id.includes('date-fns')) return 'date-fns'
            return 'vendor'
          }
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**'],
  },
})
