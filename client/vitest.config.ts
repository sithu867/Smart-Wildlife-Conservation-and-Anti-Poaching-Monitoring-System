import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
    // Unmocked requests fail like an offline device instead of reaching a running dev API (and its database).
    env: { VITE_API_URL: 'http://127.0.0.1:9/api' },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/**/*TestFixtures.ts',
        'src/**/*TestSetup.ts',
        'src/main.tsx',
        'src/vite-env.d.ts'
      ]
    }
  }
});
