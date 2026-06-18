import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    exclude: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.danbi/**',
      '**/tests/e2e/**',
      '**/third_party/source-mirrors/**',
      '**/dist/**',
      '**/build/**',
    ],
  },
});
