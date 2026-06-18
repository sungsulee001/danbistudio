import { build } from 'esbuild';
import { rm } from 'node:fs/promises';

await rm('dist-electron', { recursive: true, force: true });

await build({
  entryPoints: [
    'src/electron/main/electron-app.ts',
    'src/electron/preload/electron-preload.ts',
  ],
  outdir: 'dist-electron',
  outbase: 'src/electron',
  entryNames: '[dir]/[name]',
  outExtension: {
    '.js': '.cjs',
  },
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  external: ['electron'],
  logLevel: 'info',
});
