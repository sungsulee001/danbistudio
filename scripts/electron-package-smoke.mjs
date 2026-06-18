import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireReleaseOutputLock } from './electron-release-lock.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distMain = path.join(rootDir, 'dist-electron', 'main', 'electron-app.cjs');
const standaloneServer = path.join(rootDir, '.next', 'standalone', 'server.js');
const standaloneStatic = path.join(rootDir, '.next', 'standalone', '.next', 'static');
const standalonePublicWorker = path.join(rootDir, '.next', 'standalone', 'public', 'editor-preview-worker.js');
const standaloneWorkflowFiles = [
  path.join(rootDir, '.next', 'standalone', 'workflows', 'broll_i2v.json'),
  path.join(rootDir, '.next', 'standalone', 'workflows', 'broll_reference_i2v.json'),
];
const releaseSampleDir = path.join(rootDir, '.danbi', 'electron-release', 'samples', 'getting-started');
const releaseSampleProject = path.join(releaseSampleDir, 'project.danbi-project.json');
const releaseSampleTutorial = path.join(releaseSampleDir, 'tutorial.md');
const appIcon = path.join(rootDir, 'build', 'icon.ico');
const smokeUserData = path.join(rootDir, '.danbi', 'electron-package-smoke', 'user-data');
const sourceSmokeResult = path.join(rootDir, '.danbi', 'electron-package-smoke', 'source-result.json');
const unpackedSmokeUserData = path.join(rootDir, '.danbi', 'electron-unpacked-smoke', 'user-data');
const unpackedSmokeResult = path.join(rootDir, '.danbi', 'electron-unpacked-smoke', 'result.json');
const unpackedExe = path.join(rootDir, 'release', 'electron', 'win-unpacked', 'Danbi Studio.exe');
const unpackedNextPackage = path.join(rootDir, 'release', 'electron', 'win-unpacked', 'resources', 'renderer', 'standalone', 'node_modules', 'next', 'package.json');
const unpackedWorkflowFiles = [
  path.join(rootDir, 'release', 'electron', 'win-unpacked', 'resources', 'renderer', 'standalone', 'workflows', 'broll_i2v.json'),
  path.join(rootDir, 'release', 'electron', 'win-unpacked', 'resources', 'renderer', 'standalone', 'workflows', 'broll_reference_i2v.json'),
];
const unpackedSampleDir = path.join(rootDir, 'release', 'electron', 'win-unpacked', 'resources', 'samples', 'getting-started');
const unpackedSampleProject = path.join(unpackedSampleDir, 'project.danbi-project.json');
const unpackedSampleTutorial = path.join(unpackedSampleDir, 'tutorial.md');
const unpackedSampleRender = path.join(rootDir, '.danbi', 'electron-package-smoke', 'sample-render', 'getting-started.mp4');
const releaseOutputLock = await acquireReleaseOutputLock({ label: 'electron:package:smoke' });

run(process.execPath, ['scripts/prepare-electron-release.mjs']);
assertFile(distMain, 10_000);
assertFile(standaloneServer, 5_000);
assertDirectory(standaloneStatic);
assertFile(standalonePublicWorker, 1_000);
standaloneWorkflowFiles.forEach((workflowFile) => assertFile(workflowFile, 1_000));
assertFile(appIcon, 1_000);
assertFile(releaseSampleProject, 1_000);
assertFile(releaseSampleTutorial, 500);
assertNoDevelopmentStandaloneArtifacts(path.join(rootDir, '.next', 'standalone'));
assertStandaloneReleaseMetadata(path.join(rootDir, '.next', 'standalone'));
assertBuilderConfig();
assertMainBundle();

rmSync(smokeUserData, { recursive: true, force: true });
rmSync(sourceSmokeResult, { force: true });
const smoke = run(electronCommand(), [distMain], {
  env: {
    ...process.env,
    DANBI_ELECTRON_SMOKE: '1',
    DANBI_ELECTRON_USE_PACKAGED_RENDERER: '1',
    DANBI_ELECTRON_SMOKE_USER_DATA: smokeUserData,
    DANBI_ELECTRON_SMOKE_RESULT_PATH: sourceSmokeResult,
    DANBI_ELECTRON_RENDERER_PORT: '31940',
  },
  timeout: 60_000,
});

if (!smoke.stdout.includes('Danbi Electron smoke passed')) {
  throw new Error(`Packaged Electron smoke did not print a pass marker.\nstdout:\n${smoke.stdout}\nstderr:\n${smoke.stderr}`);
}

if (!smoke.stdout.includes('http://127.0.0.1:31940/editor')) {
  throw new Error(`Packaged Electron smoke did not use the internal renderer server.\nstdout:\n${smoke.stdout}`);
}
assertSmokeResult(sourceSmokeResult, 'http://127.0.0.1:31940/editor');

const packageBuild = run(process.execPath, ['node_modules/electron-builder/out/cli/cli.js', '--dir', '--win', '--x64'], {
  timeout: 180_000,
});
assertNoPackagingMetadataWarnings(packageBuild);
assertFile(unpackedExe, 10_000_000);
assertFile(unpackedNextPackage, 1_000);
unpackedWorkflowFiles.forEach((workflowFile) => assertFile(workflowFile, 1_000));
assertFile(unpackedSampleProject, 1_000);
assertFile(unpackedSampleTutorial, 500);
assertNoDevelopmentStandaloneArtifacts(path.join(rootDir, 'release', 'electron', 'win-unpacked', 'resources', 'renderer', 'standalone'));
assertStandaloneReleaseMetadata(path.join(rootDir, 'release', 'electron', 'win-unpacked', 'resources', 'renderer', 'standalone'));

run(process.execPath, [
  'scripts/sample-project-pack.mjs',
  '--verify-only',
  '--out',
  unpackedSampleDir,
  '--render-output',
  unpackedSampleRender,
], {
  timeout: 120_000,
});
assertFile(unpackedSampleRender, 1_000);

rmSync(unpackedSmokeUserData, { recursive: true, force: true });
rmSync(unpackedSmokeResult, { force: true });
run(unpackedExe, [], {
  env: {
    ...process.env,
    DANBI_ELECTRON_SMOKE: '1',
    DANBI_ELECTRON_USE_PACKAGED_RENDERER: '1',
    DANBI_ELECTRON_SMOKE_USER_DATA: unpackedSmokeUserData,
    DANBI_ELECTRON_SMOKE_RESULT_PATH: unpackedSmokeResult,
    DANBI_ELECTRON_RENDERER_PORT: '31941',
    DANBI_ELECTRON_SMOKE_TIMEOUT_MS: '60000',
  },
  timeout: 90_000,
});
assertSmokeResult(unpackedSmokeResult, 'http://127.0.0.1:31941/editor');

console.log('Packaged Electron smoke passed.');
releaseOutputLock.release();

function assertBuilderConfig() {
  const configPath = path.join(rootDir, 'electron-builder.yml');
  const config = readFileSync(configPath, 'utf8');
  const requiredTerms = [
    'dist-electron/**/*',
    '.next/standalone',
    'renderer/standalone',
    '.danbi/electron-release/samples',
    'samples',
    'buildResources: build',
    'icon: build/icon.ico',
    'nsis',
  ];

  for (const term of requiredTerms) {
    if (!config.includes(term)) {
      throw new Error(`electron-builder.yml is missing required term: ${term}`);
    }
  }

  assertNoBlockedSourceMarkers(configPath);
}

function assertNoPackagingMetadataWarnings(result) {
  const output = `${result.stdout}\n${result.stderr}`;
  const blockedWarnings = [
    /author is missed/i,
    /default Electron icon is used/i,
    /application icon is not set/i,
  ];

  for (const warning of blockedWarnings) {
    if (warning.test(output)) {
      throw new Error(`Electron package metadata warning regressed: ${warning}`);
    }
  }
}

function assertNoDevelopmentStandaloneArtifacts(standaloneRoot) {
  const blockedPaths = [
    '.env',
    '.git',
    '.logs',
    path.join('.next', 'cache'),
    path.join('.next', 'dev'),
    path.join('.next', 'diagnostics'),
    path.join('.next', 'types'),
    '.next-dev.err.log',
    '.next-dev.out.log',
    '.danbi',
    'coverage',
    'dev-server.combined.log',
    'dev-server.err.log',
    'dev-server.out.log',
    'dist-electron',
    'electron-builder.yml',
    'next-env.d.ts',
    'package-lock.json',
    'plan-template.md',
    'playwright-report',
    'release',
    'scripts',
    'src',
    'test-results',
    'tests',
    'third_party',
  ];

  for (const blockedPath of blockedPaths) {
    const target = path.join(standaloneRoot, blockedPath);
    if (existsSync(target)) {
      throw new Error(`Development-only standalone artifact leaked into package: ${path.relative(rootDir, target)}`);
    }
  }
}

function assertStandaloneReleaseMetadata(standaloneRoot) {
  const packageJsonPath = path.join(standaloneRoot, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  if (packageJson.main !== 'server.js') {
    throw new Error(`Standalone package main must be server.js: ${path.relative(rootDir, packageJsonPath)}`);
  }
  if (packageJson.devDependencies) {
    throw new Error(`Standalone package.json must not include devDependencies: ${path.relative(rootDir, packageJsonPath)}`);
  }
  if (JSON.stringify(packageJson.scripts ?? {}) !== JSON.stringify({ start: 'node server.js' })) {
    throw new Error(`Standalone package.json must only expose the runtime start script: ${path.relative(rootDir, packageJsonPath)}`);
  }
  const serverBundle = readFileSync(path.join(standaloneRoot, 'server.js'), 'utf8');
  const buildRootMarkers = [
    rootDir,
    rootDir.replace(/\\/g, '\\\\'),
    rootDir.replace(/\\/g, '/'),
  ];
  for (const marker of buildRootMarkers) {
    if (marker && serverBundle.includes(marker)) {
      throw new Error(`Standalone server.js leaked build root marker ${marker}: ${path.relative(rootDir, standaloneRoot)}`);
    }
  }
}

function assertMainBundle() {
  const bundle = readFileSync(distMain, 'utf8');
  const requiredTerms = [
    'startPackagedRendererServer',
    'DANBI_ELECTRON_USE_PACKAGED_RENDERER',
    'DANBI_ELECTRON_RENDERER_SERVER_ENTRY',
    'editor:system:diagnostics',
    'discoverFfmpegSetup',
    'DANBI_ELECTRON_RESOURCES_PATH',
  ];

  for (const term of requiredTerms) {
    if (!bundle.includes(term)) {
      throw new Error(`Electron main bundle is missing packaged renderer term: ${term}`);
    }
  }

  assertNoBlockedSourceMarkers(distMain);
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
      throw new Error(`Blocked third-party source marker found in release file: ${path.relative(rootDir, filePath)}`);
    }
  }
}

function assertSmokeResult(filePath, rendererUrl) {
  assertFile(filePath, 20);
  const result = JSON.parse(readFileSync(filePath, 'utf8'));
  if (result.rendererUrl !== rendererUrl) {
    throw new Error(`Unexpected smoke renderer URL in ${path.relative(rootDir, filePath)}: ${result.rendererUrl}`);
  }
  if (!result.preloadPath || !result.userDataPath) {
    throw new Error(`Smoke result is missing preloadPath/userDataPath: ${path.relative(rootDir, filePath)}`);
  }
  if (!result.diagnostics?.paths?.logsPath || !result.diagnostics?.paths?.crashDumpsPath) {
    throw new Error(`Smoke result is missing runtime diagnostics paths: ${path.relative(rootDir, filePath)}`);
  }
  if (!Array.isArray(result.diagnostics?.ffmpeg?.candidates)) {
    throw new Error(`Smoke result is missing FFmpeg discovery candidates: ${path.relative(rootDir, filePath)}`);
  }
}

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

function assertFile(filePath, minimumBytes) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing release file: ${path.relative(rootDir, filePath)}`);
  }

  const stats = statSync(filePath);
  if (!stats.isFile() || stats.size < minimumBytes) {
    throw new Error(`Release file is unexpectedly small: ${path.relative(rootDir, filePath)} (${stats.size} bytes)`);
  }
}

function assertDirectory(filePath) {
  if (!statSync(filePath, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Missing release directory: ${path.relative(rootDir, filePath)}`);
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
