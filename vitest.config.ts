import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    server: {
      deps: {
        // `scripts/publish/upload.mjs` and the gate scripts open with a
        // `#!/usr/bin/env node` shebang so they stay runnable as CLIs. Node
        // accepts that in ESM; the bundler's transform does not, and the whole
        // file failed to collect with "Invalid or unexpected token". Importing
        // them externally hands the job back to Node, which parses them fine.
        external: [/[\\/]scripts[\\/].*\.mjs$/],
      },
    },
    exclude: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.danbi/**',
      // Other sessions' git worktrees live here. Without this the runner
      // collects their copies of the suite too, so `npm test` reported
      // failures that belong to a different checkout entirely — noise that
      // hides real regressions in this tree.
      '**/.claude/worktrees/**',
      '**/tests/e2e/**',
      '**/third_party/source-mirrors/**',
      '**/dist/**',
      '**/build/**',
    ],
  },
});
