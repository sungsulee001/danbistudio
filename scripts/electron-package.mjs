import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withReleaseOutputLock } from './electron-release-lock.mjs';
import { cleanWindowsInstallerArtifacts } from './electron-release-artifacts.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const builderArgs = process.argv.slice(2);

await withReleaseOutputLock(() => {
  run(process.execPath, ['scripts/prepare-electron-release.mjs'], { timeout: 300_000 });
  if (willBuildWindowsInstaller(builderArgs)) {
    cleanWindowsInstallerArtifacts(path.join(rootDir, 'release', 'electron'));
  }
  run(process.execPath, ['node_modules/electron-builder/out/cli/cli.js', ...builderArgs], {
    timeout: 360_000,
  });
}, { label: `electron:package ${builderArgs.join(' ')}`.trim() });

function willBuildWindowsInstaller(args) {
  return args.includes('--win') && !args.includes('--dir');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: 'inherit',
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with code ${result.status}.`);
  }
}
