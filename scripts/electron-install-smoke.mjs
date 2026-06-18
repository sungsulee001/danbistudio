import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { buildWindowsInstallerArtifactName, cleanWindowsInstallerArtifacts } from './electron-release-artifacts.mjs';
import { acquireReleaseOutputLock } from './electron-release-lock.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const productName = 'Danbi Studio';
const installerName = buildWindowsInstallerArtifactName(productName, packageJson.version);
const installerPath = path.join(rootDir, 'release', 'electron', installerName);
const smokeRoot = path.join(rootDir, '.danbi', 'electron-install-smoke');
const installDir = path.join(smokeRoot, 'app');
const userDataDir = path.join(smokeRoot, 'user-data');
const renderOutputPath = path.join(smokeRoot, 'renders', 'getting-started-installed-render.mp4');
const importSourcePath = path.join(smokeRoot, 'import-source', 'local-installed-import.wav');
const failureScreenshot = path.join(smokeRoot, 'failure.png');
const smokeResultPath = path.join(smokeRoot, 'result.json');
const runLog = path.join(smokeRoot, 'run.log');
const rendererPort = String(34100 + Math.floor(Math.random() * 800));
const skipBuild = process.argv.includes('--skip-build') || process.env.DANBI_ELECTRON_INSTALL_SMOKE_SKIP_BUILD === '1';
const shortcutSnapshots = snapshotShortcutState();
const releaseOutputLock = await acquireReleaseOutputLock({ label: 'electron:install-smoke' });

if (process.platform !== 'win32') {
  throw new Error('electron:install-smoke currently verifies the Windows NSIS installer and must run on Windows.');
}

if (!skipBuild) {
  run(process.execPath, ['scripts/prepare-electron-release.mjs'], { timeout: 300_000 });
  cleanWindowsInstallerArtifacts(path.join(rootDir, 'release', 'electron'));
  const packageBuild = run(process.execPath, ['node_modules/electron-builder/out/cli/cli.js', '--win', '--x64'], {
    timeout: 360_000,
  });
  assertNoPackagingMetadataWarnings(packageBuild);
}

assertFile(installerPath, 10_000_000);
assertInsideWorkspace(smokeRoot);
rmSync(smokeRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
mkdirSync(smokeRoot, { recursive: true });
writeSilentWavFile(importSourcePath);

let app;
let page;
let installed = false;
let diagnostics = null;
let importedMediaPath = null;
let ffprobeEvidence = null;
let runtimePathCheck = null;
let installWriteCheck = null;
let sampleMediaPathCheck = null;
const blockedRequests = [];
const observedRequests = new Set();
const observedWebSockets = new Set();
const smokeTimeout = setTimeout(() => {
  logStep('Installed Electron smoke timed out.');
  if (page) {
    void page.screenshot({ path: failureScreenshot, fullPage: true }).catch(() => undefined);
  }
  if (app) {
    void app.evaluate(({ app: electronApp }) => {
      setImmediate(() => electronApp.exit(1));
      return true;
    }).catch(() => undefined);
  }
  process.exit(1);
}, 300_000);

try {
  logStep(`Installing ${installerName} into ${path.relative(rootDir, installDir)}.`);
  run(installerPath, ['/currentuser', '/S', `/D=${installDir}`], {
    timeout: 240_000,
  });
  installed = true;

  const installedExe = path.join(installDir, 'Danbi Studio.exe');
  const installedSampleDir = path.join(installDir, 'resources', 'samples', 'getting-started');
  const installedStandaloneRoot = path.join(installDir, 'resources', 'renderer', 'standalone');
  assertFile(installedExe, 10_000_000);
  assertFile(path.join(installedSampleDir, 'project.danbi-project.json'), 1_000);
  assertFile(path.join(installedSampleDir, 'tutorial.md'), 500);
  assertFile(path.join(installedStandaloneRoot, 'server.js'), 5_000);
  assertNoDevelopmentStandaloneArtifacts(installedStandaloneRoot);
  assertStandaloneReleaseMetadata(installedStandaloneRoot);

  rmSync(userDataDir, { recursive: true, force: true });
  rmSync(failureScreenshot, { force: true });
  rmSync(path.dirname(renderOutputPath), { recursive: true, force: true });

  logStep(`Launching installed Electron app on renderer port ${rendererPort}.`);
  app = await electron.launch({
    executablePath: installedExe,
    cwd: installDir,
    env: {
      ...process.env,
      DANBI_ELECTRON_DISABLE_SINGLE_INSTANCE: '1',
      DANBI_ELECTRON_RENDERER_PORT: rendererPort,
      DANBI_ELECTRON_USER_DATA: userDataDir,
      DANBI_ELECTRON_AUTOMATION_SAVE_FILE_PATH: renderOutputPath,
      DANBI_ELECTRON_AUTOMATION_MEDIA_FILE_PATHS: JSON.stringify([importSourcePath]),
    },
  });

  await app.context().route('**/*', async (route) => {
    const url = route.request().url();
    observedRequests.add(url);
    if (isAllowedOfflineUrl(url)) {
      await route.continue();
      return;
    }
    blockedRequests.push(url);
    await route.abort('blockedbyclient');
  });

  page = await app.firstWindow({ timeout: 120_000 });
  page.on('dialog', (dialog) => {
    void dialog.accept().catch(() => undefined);
  });
  page.on('request', (request) => {
    observedRequests.add(request.url());
  });
  page.on('websocket', (socket) => {
    observedWebSockets.add(socket.url());
  });

  await page.waitForLoadState('domcontentloaded', { timeout: 120_000 });
  await waitForPackagedEditorReady(page);

  logStep('Checking installed runtime diagnostics.');
  await page.waitForFunction(() => Boolean(window.danbiEditor?.system?.diagnostics), null, { timeout: 60_000 });
  diagnostics = await page.evaluate(async () => window.danbiEditor?.system.diagnostics());
  if (!diagnostics?.samples?.available || !diagnostics.samples.gettingStartedPackagePath) {
    throw new Error(`Installed smoke did not expose a packaged sample project: ${JSON.stringify(diagnostics?.samples)}`);
  }
  if (!diagnostics?.ffmpeg?.ready) {
    throw new Error(`Installed smoke did not find an FFmpeg setup: ${JSON.stringify(diagnostics?.ffmpeg)}`);
  }
  runtimePathCheck = assertRuntimePathsUnderUserData(diagnostics.paths, userDataDir);
  assertPathInside(diagnostics.samples.gettingStartedPackagePath, installDir, 'sample package path');
  sampleMediaPathCheck = inspectSamplePackageRenderMedia(diagnostics.samples.gettingStartedPackagePath);

  logStep('Opening sample project from installed app.');
  const openSampleButton = page.getByRole('button', { name: 'Open sample' });
  await expect(openSampleButton).toBeEnabled({ timeout: 60_000 });
  await openSampleButton.click();
  await expect(page.getByRole('heading', { name: 'Danbi Getting Started' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Timeline clip Generated intro' })).toBeVisible({ timeout: 60_000 });

  logStep('Importing local media into installed app.');
  await page.getByRole('button', { name: 'Import media' }).first().click();
  await expect(page.getByText('local-installed-import.wav', { exact: true })).toBeVisible({ timeout: 60_000 });
  importedMediaPath = findImportedMediaFile(diagnostics.paths.importsPath, 'local-installed-import.wav');
  assertFile(importedMediaPath, 44);
  assertPathInside(importedMediaPath, diagnostics.paths.importsPath, 'imported media path');

  logStep('Rendering sample project from installed app.');
  await page.locator('header').getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Export Plan' })).toBeVisible({ timeout: 60_000 });
  await page.getByLabel('Profile').first().selectOption({ label: 'Sample H.264 360p' });
  const renderButton = page.locator('header').getByRole('button', { name: 'Render', exact: true });
  await expect(renderButton).toBeEnabled({ timeout: 60_000 });
  await renderButton.click();
  await expect(page.getByTestId('render-job-status')).toHaveText('completed', { timeout: 120_000 });
  await expect(page.getByTestId('render-job-progress')).toHaveText('100%', { timeout: 60_000 });
  await waitForFile(renderOutputPath, 10_000, 120_000);
  ffprobeEvidence = probeMp4(renderOutputPath, diagnostics.ffmpeg.ffprobePath);

  const externalWebSockets = [...observedWebSockets].filter((url) => !isAllowedOfflineUrl(url));
  if (blockedRequests.length > 0 || externalWebSockets.length > 0) {
    throw new Error(`Installed smoke blocked external network access: ${JSON.stringify({
      blockedRequests,
      externalWebSockets,
    }, null, 2)}`);
  }
  installWriteCheck = buildForbiddenInstallWriteCheck(installDir);
  if (installWriteCheck.violations.length > 0) {
    throw new Error(`Installed app wrote runtime storage inside the install directory: ${installWriteCheck.violations.join(', ')}`);
  }

  logStep(`Installed Electron smoke passed with ${observedRequests.size} renderer request(s), all local.`);
  const report = {
    kind: 'danbi.electron.installed-app-smoke',
    status: 'passed',
    generatedAt: new Date().toISOString(),
    installer: path.relative(rootDir, installerPath).replace(/\\/g, '/'),
    install: {
      status: 'passed',
      installDir: path.relative(rootDir, installDir).replace(/\\/g, '/'),
      installedExe: path.relative(rootDir, installedExe).replace(/\\/g, '/'),
    },
    launch: {
      status: 'passed',
      rendererPort,
      userDataPath: diagnostics.paths.userDataPath,
    },
    sampleProject: {
      status: 'passed',
      packagePath: diagnostics.samples.gettingStartedPackagePath,
      mediaPathCheck: sampleMediaPathCheck,
    },
    mediaImport: {
      status: 'passed',
      sourcePath: path.relative(rootDir, importSourcePath).replace(/\\/g, '/'),
      importedPath: importedMediaPath,
      importedInsideUserData: isPathInsideOrEqual(diagnostics.paths.userDataPath, importedMediaPath),
    },
    exportPreflight: {
      status: 'passed',
      profile: 'Sample H.264 360p',
      evidence: 'Render button enabled after export plan preflight.',
    },
    mp4Render: {
      status: 'passed',
      outputPath: path.relative(rootDir, renderOutputPath).replace(/\\/g, '/'),
      outputBytes: statSync(renderOutputPath).size,
      ffprobe: ffprobeEvidence,
    },
    storage: {
      status: 'passed',
      runtimePathCheck,
      installWriteCheck,
    },
    rendererRequestCount: observedRequests.size,
    websocketCount: observedWebSockets.size,
  };
  writeJsonReport(smokeResultPath, report);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  if (page) {
    await page.screenshot({ path: failureScreenshot, fullPage: true }).catch(() => undefined);
    console.error(`Installed Electron smoke failed. Screenshot: ${path.relative(rootDir, failureScreenshot)}`);
  }
  throw error;
} finally {
  clearTimeout(smokeTimeout);
  if (app) {
    terminateElectronApp(app);
  }
  if (installed) {
    await uninstallInstalledApp();
  }
  cleanupNewShortcuts(shortcutSnapshots);
  releaseOutputLock.release();
}

async function uninstallInstalledApp() {
  const uninstaller = findUninstaller();
  if (uninstaller) {
    run(uninstaller, ['/S'], { timeout: 180_000 });
  }
  if (existsSync(installDir)) {
    await waitForPathToDisappear(installDir, 60_000);
  }
  if (existsSync(installDir)) {
    rmSync(installDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 });
  }
}

async function waitForPackagedEditorReady(page) {
  await expect(page.getByRole('link', { name: 'Editor' })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId('editor-shell')).toHaveAttribute('data-hydrated', 'true', { timeout: 120_000 });
  await expect(page.getByTestId('program-monitor')).toBeVisible({ timeout: 120_000 });
}

function findUninstaller() {
  if (!existsSync(installDir)) {
    return null;
  }
  return readdirSync(installDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^uninstall .*\.exe$/i.test(entry.name))
    .map((entry) => path.join(installDir, entry.name))[0] ?? null;
}

function snapshotShortcutState() {
  return shortcutPaths().map((shortcutPath) => ({
    path: shortcutPath,
    existed: existsSync(shortcutPath),
  }));
}

function cleanupNewShortcuts(snapshots) {
  for (const snapshot of snapshots) {
    if (!snapshot.existed && existsSync(snapshot.path)) {
      rmSync(snapshot.path, { force: true });
    }
  }
}

function shortcutPaths() {
  const paths = [
    path.join(homedir(), 'Desktop', 'Danbi Studio.lnk'),
  ];
  if (process.env.APPDATA) {
    paths.push(path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Danbi Studio.lnk'));
  }
  return paths;
}

function isAllowedOfflineUrl(value) {
  if (value === 'about:blank') {
    return true;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (['blob:', 'data:', 'file:', 'devtools:', 'chrome-error:'].includes(url.protocol)) {
    return true;
  }
  if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'ws:' || url.protocol === 'wss:') {
    return isLocalHostname(url.hostname);
  }
  return false;
}

function isLocalHostname(hostname) {
  const normalized = hostname.toLowerCase();
  return normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized.endsWith('.localhost');
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
      throw new Error(`Development-only standalone artifact leaked into installed app: ${path.relative(rootDir, target)}`);
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

function assertNoPackagingMetadataWarnings(result) {
  const output = `${result.stdout}\n${result.stderr}`;
  const blockedWarnings = [
    /author is missed/i,
    /default Electron icon is used/i,
    /application icon is not set/i,
  ];
  for (const warning of blockedWarnings) {
    if (warning.test(output)) {
      throw new Error(`Electron installer metadata warning regressed: ${warning}`);
    }
  }
}

function assertFile(filePath, minimumBytes) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing file: ${path.relative(rootDir, filePath)}`);
  }
  const stats = statSync(filePath);
  if (!stats.isFile() || stats.size < minimumBytes) {
    throw new Error(`File is unexpectedly small: ${path.relative(rootDir, filePath)} (${stats.size} bytes)`);
  }
}

function assertInsideWorkspace(targetPath) {
  assertPathInside(targetPath, rootDir, 'smoke path');
}

function assertPathInside(targetPath, parentPath, label) {
  const relativePath = path.relative(parentPath, path.resolve(targetPath));
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`${label} is outside expected directory: ${targetPath}`);
  }
}

function assertRuntimePathsUnderUserData(paths, expectedUserDataPath) {
  const expectedRoot = path.resolve(expectedUserDataPath);
  if (path.resolve(paths.userDataPath) !== expectedRoot) {
    throw new Error(`Installed runtime userDataPath mismatch. Expected ${expectedRoot}, got ${paths.userDataPath}`);
  }

  const requiredKeys = [
    'importsPath',
    'cachePath',
    'autosavePath',
    'projectsPath',
    'packagesPath',
    'rendersPath',
    'tempPath',
    'jobsPath',
    'sttPath',
    'outputsPath',
  ];
  const checked = {};
  for (const key of requiredKeys) {
    if (!paths[key]) {
      throw new Error(`Installed runtime diagnostics is missing ${key}.`);
    }
    assertPathInside(paths[key], expectedRoot, key);
    checked[key] = paths[key];
  }

  return {
    status: 'passed',
    userDataPath: paths.userDataPath,
    checked,
  };
}

function inspectSamplePackageRenderMedia(packageDirectory) {
  const packageFilePath = path.join(packageDirectory, 'project.danbi-project.json');
  assertFile(packageFilePath, 1_000);
  const packageJson = JSON.parse(readFileSync(packageFilePath, 'utf8'));
  const entries = Array.isArray(packageJson.mediaManifest?.entries)
    ? packageJson.mediaManifest.entries
    : [];
  const renderEntries = entries.filter((entry) => (
    entry &&
    entry.role === 'render' &&
    entry.status === 'bundle-ready' &&
    typeof entry.packagePath === 'string'
  ));

  if (renderEntries.length === 0) {
    throw new Error('Packaged sample project has no bundle-ready render media entries.');
  }

  const files = renderEntries.map((entry) => {
    const filePath = path.resolve(packageDirectory, entry.packagePath);
    assertPathInside(filePath, packageDirectory, `${entry.assetName ?? entry.assetId ?? 'sample asset'} render media`);
    assertFile(filePath, 44);
    return {
      assetId: entry.assetId,
      assetName: entry.assetName,
      packagePath: entry.packagePath,
      filesystemPath: filePath,
      bytes: statSync(filePath).size,
    };
  });

  return {
    status: 'passed',
    packageDirectory,
    renderMediaCount: files.length,
    files,
  };
}

function buildForbiddenInstallWriteCheck(installDirectory) {
  const checkedRoots = uniqueExistingPaths([
    installDirectory,
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'Danbi Studio') : undefined,
  ]);
  const forbiddenNames = [
    '.danbi',
    'imports',
    'cache',
    'autosave',
    'projects',
    'packages',
    'renders',
    'temp',
    'jobs',
    'stt',
    'outputs',
  ];
  const violations = [];

  for (const root of checkedRoots) {
    for (const name of forbiddenNames) {
      const candidate = path.join(root, name);
      if (existsSync(candidate)) {
        violations.push(candidate);
      }
    }
  }

  return {
    status: violations.length === 0 ? 'passed' : 'failed',
    checkedRoots,
    forbiddenNames,
    violations,
  };
}

function uniqueExistingPaths(paths) {
  const seen = new Set();
  const unique = [];
  for (const candidate of paths) {
    if (!candidate || !existsSync(candidate)) {
      continue;
    }
    const resolved = path.resolve(candidate);
    const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(resolved);
    }
  }
  return unique;
}

function findImportedMediaFile(importsPath, suffix) {
  const match = readdirSync(importsPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => path.join(importsPath, entry.name))[0];
  if (!match) {
    throw new Error(`Imported media file was not found under userData imports: ${suffix}`);
  }
  return match;
}

function probeMp4(filePath, ffprobePath) {
  const command = ffprobePath || 'ffprobe';
  const result = spawnSync(command, [
    '-v',
    'error',
    '-show_entries',
    'format=duration:stream=codec_type,codec_name,width,height',
    '-of',
    'json',
    filePath,
  ], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`ffprobe failed for installed smoke MP4 with code ${result.status}.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }

  const data = JSON.parse(result.stdout);
  const streams = Array.isArray(data.streams) ? data.streams : [];
  const durationSeconds = Number(data.format?.duration);
  if (!streams.some((stream) => stream.codec_type === 'video')) {
    throw new Error('Installed smoke MP4 ffprobe did not find a video stream.');
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error(`Installed smoke MP4 ffprobe duration is invalid: ${data.format?.duration}`);
  }

  return {
    status: 'passed',
    ffprobePath: command,
    durationSeconds,
    streams: streams.map((stream) => ({
      codecType: stream.codec_type,
      codecName: stream.codec_name,
      width: stream.width,
      height: stream.height,
    })),
  };
}

function writeSilentWavFile(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, buildSilentWavBuffer(), { flag: 'w' });
}

function buildSilentWavBuffer() {
  const sampleRate = 8000;
  const channelCount = 1;
  const bytesPerSample = 2;
  const sampleCount = sampleRate;
  const dataBytes = sampleCount * channelCount * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channelCount, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channelCount * bytesPerSample, 28);
  buffer.writeUInt16LE(channelCount * bytesPerSample, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);

  return buffer;
}

function isPathInsideOrEqual(parentPath, targetPath) {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(targetPath));
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function writeJsonReport(filePath, data) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function waitForFile(filePath, minimumBytes, timeoutMs) {
  const startedAt = Date.now();
  let lastSize = 0;
  while (Date.now() - startedAt < timeoutMs) {
    if (existsSync(filePath)) {
      const stats = statSync(filePath);
      lastSize = stats.size;
      if (stats.isFile() && stats.size >= minimumBytes) {
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${path.relative(rootDir, filePath)} to reach ${minimumBytes} bytes; last size was ${lastSize}.`);
}

async function waitForPathToDisappear(filePath, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!existsSync(filePath)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
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

function logStep(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  mkdirSync(path.dirname(runLog), { recursive: true });
  appendFileSync(runLog, `${line}\n`, 'utf8');
}

function terminateElectronApp(electronApp) {
  const child = electronApp.process();
  if (!child.pid || child.killed || child.exitCode !== null) {
    return;
  }
  spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
    stdio: 'ignore',
    windowsHide: true,
  });
}
