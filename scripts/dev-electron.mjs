import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const port = process.env.PORT || '3000';
const host = process.env.HOST || '127.0.0.1';
const rendererUrl = process.env.DANBI_STUDIO_URL || `http://${host}:${port}/editor`;
const DEFAULT_RENDERER_WAIT_MS = 60_000;
const DEFAULT_RENDERER_PROBE_WAIT_MS = 1_000;
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const electronCommand = process.platform === 'win32'
  ? 'node_modules/.bin/electron.cmd'
  : 'node_modules/.bin/electron';

const children = new Set();

function spawnChild(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: false,
    ...options,
  });
  children.add(child);
  child.on('exit', () => children.delete(child));
  return child;
}

function stopChildren() {
  for (const child of children) {
    child.kill();
  }
}

if (isMainModule()) {
  process.on('SIGINT', () => {
    stopChildren();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    stopChildren();
    process.exit(143);
  });

  spawnChild(npmCommand, ['run', 'dev', '--', '--hostname', host, '--port', port]);
  await waitForRenderer(rendererUrl);
  await runBuild();

  const electron = spawnChild(electronCommand, ['dist-electron/main/electron-app.cjs'], {
    env: {
      ...process.env,
      DANBI_STUDIO_URL: rendererUrl,
    },
  });

  electron.on('exit', (code) => {
    stopChildren();
    process.exit(code ?? 0);
  });
}

async function runBuild() {
  await new Promise((resolve, reject) => {
    const child = spawnChild(process.execPath, ['scripts/build-electron.mjs']);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Electron build failed with code ${code}`));
    });
  });
}

export async function waitForRenderer(url, options = {}) {
  const startedAt = Date.now();
  const timeoutMs = readPositiveNumber(options.timeoutMs ?? process.env.DANBI_ELECTRON_WAIT_MS, DEFAULT_RENDERER_WAIT_MS);
  const probeTimeoutMs = readPositiveNumber(options.probeTimeoutMs ?? process.env.DANBI_ELECTRON_PROBE_WAIT_MS, DEFAULT_RENDERER_PROBE_WAIT_MS);
  const retryDelayMs = readPositiveNumber(options.retryDelayMs, 1_000);

  while (Date.now() - startedAt < timeoutMs) {
    const remainingMs = timeoutMs - (Date.now() - startedAt);
    if (await probeRendererReadiness(url, Math.min(probeTimeoutMs, Math.max(1, remainingMs)), options.fetchImpl)) {
      return;
    }

    await delay(Math.min(retryDelayMs, Math.max(1, timeoutMs - (Date.now() - startedAt))));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

export async function probeRendererReadiness(url, timeoutMs = DEFAULT_RENDERER_PROBE_WAIT_MS, fetchImpl = fetch) {
  const timeout = createFetchTimeoutSignal(timeoutMs);

  try {
    const response = await fetchImpl(url, timeout.signal ? { method: 'GET', signal: timeout.signal } : { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  } finally {
    timeout.clear();
  }
}

function createFetchTimeoutSignal(timeoutMs) {
  if (timeoutMs <= 0 || typeof AbortController === 'undefined') {
    return {
      clear: () => {},
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

function readPositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isMainModule() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}
