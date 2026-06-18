import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { acquireReleaseOutputLock } from './electron-release-lock.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const unpackedExe = path.join(rootDir, 'release', 'electron', 'win-unpacked', 'Danbi Studio.exe');
const unpackedSampleDir = path.join(rootDir, 'release', 'electron', 'win-unpacked', 'resources', 'samples', 'getting-started');
const guiSmokeUserData = path.join(rootDir, '.danbi', 'electron-gui-smoke', 'user-data');
const failureScreenshot = path.join(rootDir, '.danbi', 'electron-gui-smoke', 'failure.png');
const runLog = path.join(rootDir, '.danbi', 'electron-gui-smoke', 'run.log');
const renderOutputPath = path.join(rootDir, '.danbi', 'electron-gui-smoke', 'renders', 'getting-started-ui-render.mp4');
const rendererPort = String(31942 + Math.floor(Math.random() * 1000));
const skipPackage = process.argv.includes('--skip-package') || process.env.DANBI_ELECTRON_GUI_SMOKE_SKIP_PACKAGE === '1';
const releaseOutputLock = await acquireReleaseOutputLock({ label: 'electron:gui-smoke' });

if (!skipPackage) {
  run(process.execPath, ['scripts/prepare-electron-release.mjs'], { timeout: 240_000 });
  const packageBuild = run(process.execPath, ['node_modules/electron-builder/out/cli/cli.js', '--dir', '--win', '--x64'], {
    timeout: 180_000,
  });
  assertNoPackagingMetadataWarnings(packageBuild);
}

assertFile(unpackedExe, 10_000_000);
assertFile(path.join(unpackedSampleDir, 'project.danbi-project.json'), 1_000);
assertFile(path.join(unpackedSampleDir, 'tutorial.md'), 500);

rmSync(guiSmokeUserData, { recursive: true, force: true });
rmSync(failureScreenshot, { force: true });
rmSync(runLog, { force: true });
rmSync(path.dirname(renderOutputPath), { recursive: true, force: true });

let app;
let page;
const smokeTimeout = setTimeout(() => {
  logStep('Packaged Electron GUI smoke timed out.');
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
}, 240_000);

logStep(`Launching packaged Electron GUI smoke on renderer port ${rendererPort}.`);
app = await electron.launch({
  executablePath: unpackedExe,
  cwd: rootDir,
  env: {
    ...process.env,
    DANBI_ELECTRON_DISABLE_SINGLE_INSTANCE: '1',
    DANBI_ELECTRON_RENDERER_PORT: rendererPort,
    DANBI_ELECTRON_USE_PACKAGED_RENDERER: '1',
    DANBI_ELECTRON_USER_DATA: guiSmokeUserData,
    DANBI_ELECTRON_AUTOMATION_SAVE_FILE_PATH: renderOutputPath,
  },
});

try {
  logStep('Waiting for first Electron window.');
  page = await app.firstWindow({ timeout: 120_000 });
  page.on('dialog', (dialog) => {
    void dialog.accept().catch(() => undefined);
  });

  logStep('Waiting for packaged editor window.');
  await page.waitForLoadState('domcontentloaded', { timeout: 120_000 });
  await waitForPackagedEditorReady(page);

  logStep('Checking packaged runtime diagnostics.');
  await page.waitForFunction(() => Boolean(window.danbiEditor?.system?.diagnostics), null, { timeout: 60_000 });
  const diagnostics = await page.evaluate(async () => window.danbiEditor?.system.diagnostics());
  if (!diagnostics?.samples?.available || !diagnostics.samples.gettingStartedPackagePath) {
    throw new Error(`Packaged GUI smoke did not expose a sample project package: ${JSON.stringify(diagnostics?.samples)}`);
  }

  assertFile(path.join(diagnostics.samples.gettingStartedPackagePath, 'project.danbi-project.json'), 1_000);

  logStep('Opening packaged sample project through the UI.');
  const openSampleButton = page.getByRole('button', { name: 'Open sample' });
  await expect(openSampleButton).toBeEnabled({ timeout: 60_000 });
  await openSampleButton.click();

  await expect(page.getByRole('heading', { name: 'Danbi Getting Started' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Timeline clip Generated intro' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Timeline clip Opening title' })).toBeVisible({ timeout: 60_000 });

  logStep('Verifying Program Monitor layers for the sample timeline.');
  await setRangeInputValue(page.getByLabel('Timeline playhead'), 1.2);
  await expect(page.getByTestId('program-stack-summary')).toHaveText(/\d+ media \/ [1-9]\d* text \/ [1-9]\d* caption \/ [1-9]\d* audio/, {
    timeout: 60_000,
  });
  await expect(page.getByTestId('program-monitor').getByText('Import, edit, and export locally.')).toBeVisible({
    timeout: 60_000,
  });

  logStep('Editing sample project settings and building export plan.');
  const nameInput = page.getByLabel('Name').first();
  await nameInput.fill('Danbi GUI Smoke Sample');
  await nameInput.press('Enter');
  await expect(page.getByRole('heading', { name: 'Danbi GUI Smoke Sample' })).toBeVisible({ timeout: 60_000 });

  await page.locator('header').getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Export Plan' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/\d+ inputs/).first()).toBeVisible({ timeout: 60_000 });

  logStep('Running a real FFmpeg render from the packaged GUI.');
  await page.getByLabel('Profile').first().selectOption({ label: 'Sample H.264 360p' });
  const renderButton = page.locator('header').getByRole('button', { name: 'Render', exact: true });
  await expect(renderButton).toBeEnabled({ timeout: 60_000 });
  await renderButton.click();
  await expect(page.getByTestId('render-job-panel')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('render-job-status')).toHaveText('completed', { timeout: 120_000 });
  await expect(page.getByTestId('render-job-progress')).toHaveText('100%', { timeout: 60_000 });
  await expect(page.getByTestId('render-output-path')).toContainText(renderOutputPath, { timeout: 60_000 });
  await waitForFile(renderOutputPath, 10_000, 120_000);

  logStep('Packaged Electron GUI smoke passed.');
} catch (error) {
  if (page) {
    await page.screenshot({ path: failureScreenshot, fullPage: true }).catch(() => undefined);
    console.error(`Packaged Electron GUI smoke failed. Screenshot: ${path.relative(rootDir, failureScreenshot)}`);
  }
  throw error;
} finally {
  clearTimeout(smokeTimeout);
  if (app) {
    terminateElectronApp(app);
  }
  releaseOutputLock.release();
}

async function setRangeInputValue(locator, value) {
  await locator.waitFor({ state: 'visible', timeout: 60_000 });
  await locator.evaluate((element, nextValue) => {
    const input = element;
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(input, String(nextValue));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function waitForPackagedEditorReady(page) {
  await expect(page.getByRole('link', { name: 'Editor' })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId('editor-shell')).toHaveAttribute('data-hydrated', 'true', { timeout: 120_000 });
  await expect(page.getByTestId('program-monitor')).toBeVisible({ timeout: 120_000 });
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

function assertFile(filePath, minimumBytes) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing file: ${path.relative(rootDir, filePath)}`);
  }

  const stats = statSync(filePath);
  if (!stats.isFile() || stats.size < minimumBytes) {
    throw new Error(`File is unexpectedly small: ${path.relative(rootDir, filePath)} (${stats.size} bytes)`);
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

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    });
    return;
  }

  child.kill('SIGTERM');
}
