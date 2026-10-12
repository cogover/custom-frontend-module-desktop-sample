import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    // let `styles.css?raw` return the real stylesheet (the app-shell rules are asserted as text)
    css: { include: [/styles\.css/, /tailwind\.css/, /notes\.css/, /settings\.css/] },
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      // every source file counts, including files no test imports
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/**/*.d.ts'],
      reporter: ['text', 'html', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: { lines: 70 },
    },
  },
});
