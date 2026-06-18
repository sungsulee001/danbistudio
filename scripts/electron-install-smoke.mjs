import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
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
const failureScreenshot = path.join(smokeRoot, 'failure.png');
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

let app;
let page;
let installed = false;
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
  const diagnostics = await page.evaluate(async () => window.danbiEditor?.system.diagnostics());
  if (!diagnostics?.samples?.available || !diagnostics.samples.gettingStartedPackagePath) {
    throw new Error(`Installed smoke did not expose a packaged sample project: ${JSON.stringify(diagnostics?.samples)}`);
  }
  if (!diagnostics?.ffmpeg?.ready) {
    throw new Error(`Installed smoke did not find an FFmpeg setup: ${JSON.stringify(diagnostics?.ffmpeg)}`);
  }
  assertPathInside(diagnostics.samples.gettingStartedPackagePath, installDir, 'sample package path');

  logStep('Opening sample project from installed app.');
  const openSampleButton = page.getByRole('button', { name: 'Open sample' });
  await expect(openSampleButton).toBeEnabled({ timeout: 60_000 });
  await openSampleButton.click();
  await expect(page.getByRole('heading', { name: 'Danbi Getting Started' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Timeline clip Generated intro' })).toBeVisible({ timeout: 60_000 });

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

  const externalWebSockets = [...observedWebSockets].filter((url) => !isAllowedOfflineUrl(url));
  if (blockedRequests.length > 0 || externalWebSockets.length > 0) {
    throw new Error(`Installed smoke blocked external network access: ${JSON.stringify({
      blockedRequests,
      externalWebSockets,
    }, null, 2)}`);
  }

  logStep(`Installed Electron smoke passed with ${observedRequests.size} renderer request(s), all local.`);
  console.log(JSON.stringify({
    status: 'passed',
    installer: path.relative(rootDir, installerPath).replace(/\\/g, '/'),
    installDir: path.relative(rootDir, installDir).replace(/\\/g, '/'),
    installedExe: path.relative(rootDir, installedExe).replace(/\\/g, '/'),
    renderOutput: path.relative(rootDir, renderOutputPath).replace(/\\/g, '/'),
    rendererRequestCount: observedRequests.size,
    websocketCount: observedWebSockets.size,
  }, null, 2));
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
