import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const bundleDir = join(process.cwd(), '.danbi', 'render-worker-daemon', 'bundle');
const outfile = join(bundleDir, 'render-worker-daemon-entry.cjs');

await rm(bundleDir, { recursive: true, force: true });
await mkdir(bundleDir, { recursive: true });

await build({
  entryPoints: ['scripts/render-worker-daemon-entry.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  logLevel: 'silent',
});

await run(process.execPath, [outfile, ...process.argv.slice(2)]);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      windowsHide: true,
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}
