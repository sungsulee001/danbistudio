import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distMain = path.join(rootDir, 'dist-electron', 'main', 'electron-app.cjs');
const distPreload = path.join(rootDir, 'dist-electron', 'preload', 'electron-preload.cjs');
const smokeUserData = path.join(rootDir, '.danbi', 'electron-smoke', 'user-data');
const studioUrl = process.env.DANBI_STUDIO_URL || 'http://127.0.0.1:3000/editor';

run('node', ['scripts/build-electron.mjs']);
assertBundle(distMain, 10_000, [
  'DANBI_ELECTRON_SMOKE',
  'createDanbiEditorWindow',
  'registerDanbiElectronIpc',
  'editor:system:diagnostics',
  'discoverFfmpegSetup',
  'crashDumps',
]);
assertBundle(distPreload, 1_000, [
  'danbiEditor',
  'contextBridge',
  'createEditorPreloadApi',
]);
assertNoBlockedSourceMarkers(distMain);
assertNoBlockedSourceMarkers(distPreload);

rmSync(smokeUserData, { recursive: true, force: true });
const smoke = run(electronCommand(), [distMain], {
  env: {
    ...process.env,
    DANBI_ELECTRON_SMOKE: '1',
    DANBI_ELECTRON_SMOKE_USER_DATA: smokeUserData,
    DANBI_STUDIO_URL: studioUrl,
  },
  timeout: 30_000,
});

if (!smoke.stdout.includes('Danbi Electron smoke passed')) {
  throw new Error(`Electron smoke did not print a pass marker.\nstdout:\n${smoke.stdout}\nstderr:\n${smoke.stderr}`);
}

console.log('Electron smoke passed.');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with code ${result.status}.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function assertBundle(filePath, minimumBytes, requiredTerms) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing Electron bundle: ${path.relative(rootDir, filePath)}`);
  }

  const stats = statSync(filePath);
  if (stats.size < minimumBytes) {
    throw new Error(`Electron bundle is unexpectedly small: ${path.relative(rootDir, filePath)} (${stats.size} bytes)`);
  }

  const text = readFileSync(filePath, 'utf8');
  for (const term of requiredTerms) {
    if (!text.includes(term)) {
      throw new Error(`Electron bundle ${path.relative(rootDir, filePath)} is missing expected term: ${term}`);
    }
  }
}

function assertNoBlockedSourceMarkers(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const blockedPatterns = [
    /\bthird_party[\\/]+source-mirrors\b/i,
    /\bmltframework[\\/]+shotcut\b/i,
    /GNU General Public License/i,
    /GNU Affero General Public License/i,
    /SPDX-License-Identifier:\s*(?:AGPL|GPL)-/i,
    /\b(?:AGPL|GPL)-\d(?:\.\d)?(?:-(?:only|or-later))?\b/i,
  ];

  for (const pattern of blockedPatterns) {
    if (pattern.test(text)) {
      throw new Error(`Blocked third-party source marker found in Electron bundle: ${path.relative(rootDir, filePath)}`);
    }
  }
}

function electronCommand() {
  if (process.platform === 'win32') {
    const electronExe = path.join(rootDir, 'node_modules', 'electron', 'dist', 'electron.exe');
    if (existsSync(electronExe)) {
      return electronExe;
    }

    return path.join(rootDir, 'node_modules', '.bin', 'electron.cmd');
  }

  return path.join(rootDir, 'node_modules', '.bin', 'electron');
}
