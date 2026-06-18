import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const bundleDir = join(process.cwd(), '.danbi', 'extension-sandbox', 'bundle');
const outfile = join(bundleDir, 'extension-sandbox-entry.cjs');

await rm(bundleDir, { recursive: true, force: true });
await mkdir(bundleDir, { recursive: true });

await build({
  entryPoints: ['scripts/extension-sandbox-entry.ts'],
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
      stdio: ['inherit', 'inherit', 'inherit'],
      windowsHide: true,
      env: {
        ...process.env,
        DANBI_EXTENSION_SANDBOX_PROCESS: '1',
      },
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
