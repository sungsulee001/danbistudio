import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';

const DEFAULT_PACKAGED_RENDERER_HOST = '127.0.0.1';
const DEFAULT_PACKAGED_RENDERER_PORT = 31890;
const DEFAULT_PACKAGED_RENDERER_TIMEOUT_MS = 30_000;
const DEFAULT_PACKAGED_RENDERER_PROBE_TIMEOUT_MS = 1_000;

export interface PackagedRendererServerOptions {
  appPath?: string;
  resourcesPath?: string;
  userDataPath?: string;
  env?: NodeJS.ProcessEnv;
  execPath?: string;
  host?: string;
  port?: number;
  timeoutMs?: number;
}

export interface PackagedRendererServerHandle {
  child: ChildProcess;
  entryPath: string;
  host: string;
  port: number;
  url: string;
  stop: () => Promise<void>;
}

export function resolvePackagedRendererServerEntry(options: PackagedRendererServerOptions = {}): string {
  const envEntry = options.env?.DANBI_ELECTRON_RENDERER_SERVER_ENTRY;
  if (envEntry) {
    return resolve(envEntry);
  }

  const candidates = [
    options.resourcesPath ? join(options.resourcesPath, 'renderer', 'standalone', 'server.js') : undefined,
    options.appPath ? join(options.appPath, '.next', 'standalone', 'server.js') : undefined,
    join(process.cwd(), '.next', 'standalone', 'server.js'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

export function isPackagedRendererServerAvailable(options: PackagedRendererServerOptions = {}): boolean {
  return existsSync(resolvePackagedRendererServerEntry(options));
}

export async function startPackagedRendererServer(
  options: PackagedRendererServerOptions = {},
): Promise<PackagedRendererServerHandle> {
  const entryPath = resolvePackagedRendererServerEntry(options);
  if (!existsSync(entryPath)) {
    throw new Error(`Packaged renderer server entry is missing: ${entryPath}`);
  }

  const host = options.host ?? options.env?.DANBI_ELECTRON_RENDERER_HOST ?? DEFAULT_PACKAGED_RENDERER_HOST;
  const requestedPort = options.port ?? readPort(options.env?.DANBI_ELECTRON_RENDERER_PORT);
  const port = requestedPort ?? await findAvailablePort(DEFAULT_PACKAGED_RENDERER_PORT, host);
  const url = `http://${host}:${port}/editor`;
  const userDataPath = options.userDataPath ?? options.env?.DANBI_ELECTRON_USER_DATA;
  const child = spawn(options.execPath ?? process.execPath, [entryPath], {
    cwd: dirname(entryPath),
    env: {
      ...process.env,
      ...options.env,
      NODE_ENV: 'production',
      HOSTNAME: host,
      PORT: String(port),
      ELECTRON_RUN_AS_NODE: '1',
      DANBI_ELECTRON_INTERNAL_RENDERER: '1',
      DANBI_ELECTRON_RESOURCES_PATH: options.resourcesPath,
      DANBI_ELECTRON_APP_PATH: options.appPath,
      DANBI_ELECTRON_USER_DATA: userDataPath,
      DANBI_LOCAL_DATA_ROOT: userDataPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const output = createOutputBuffer(child);
  try {
    await waitForRenderer(url, child, output, options.timeoutMs ?? DEFAULT_PACKAGED_RENDERER_TIMEOUT_MS);
  } catch (error) {
    await stopChild(child);
    throw error;
  }

  return {
    child,
    entryPath,
    host,
    port,
    url,
    stop: () => stopChild(child),
  };
}

async function waitForRenderer(
  url: string,
  child: ChildProcess,
  output: () => string,
  timeoutMs: number,
): Promise<void> {
  const startedAt = Date.now();
  let exitCode: number | null = null;
  child.once('exit', (code) => {
    exitCode = code;
  });

  while (Date.now() - startedAt < timeoutMs) {
    if (exitCode !== null) {
      throw new Error(`Packaged renderer server exited before readiness with code ${exitCode}.\n${output()}`);
    }

    const remainingMs = timeoutMs - (Date.now() - startedAt);
    if (await probePackagedRendererReadiness(
      url,
      Math.min(DEFAULT_PACKAGED_RENDERER_PROBE_TIMEOUT_MS, Math.max(1, remainingMs)),
    )) {
      return;
    }

    await delay(Math.min(500, Math.max(1, timeoutMs - (Date.now() - startedAt))));
  }

  throw new Error(`Timed out waiting for packaged renderer server at ${url}.\n${output()}`);
}

export async function probePackagedRendererReadiness(
  url: string,
  timeoutMs = DEFAULT_PACKAGED_RENDERER_PROBE_TIMEOUT_MS,
): Promise<boolean> {
  const timeout = createFetchTimeoutSignal(timeoutMs);

  try {
    const response = await fetch(url, timeout.signal ? { method: 'GET', signal: timeout.signal } : { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  } finally {
    timeout.clear();
  }
}

async function findAvailablePort(startPort: number, host: string): Promise<number> {
  for (let offset = 0; offset < 50; offset += 1) {
    const port = startPort + offset;
    if (await canBind(port, host)) {
      return port;
    }
  }

  throw new Error(`Could not find an available packaged renderer port starting at ${startPort}.`);
}

function canBind(port: number, host: string): Promise<boolean> {
  return new Promise((resolveCanBind) => {
    const server = createServer()
      .once('error', () => resolveCanBind(false))
      .once('listening', () => {
        server.close(() => resolveCanBind(true));
      })
      .listen(port, host);
  });
}

function createOutputBuffer(child: ChildProcess): () => string {
  const chunks: string[] = [];
  const append = (chunk: Buffer) => {
    chunks.push(chunk.toString('utf8'));
    while (chunks.join('').length > 8_000) {
      chunks.shift();
    }
  };

  child.stdout?.on('data', append);
  child.stderr?.on('data', append);

  return () => chunks.join('').trim();
}

function stopChild(child: ChildProcess): Promise<void> {
  return new Promise((resolveStop) => {
    if (child.exitCode !== null || child.killed) {
      resolveStop();
      return;
    }

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolveStop();
    }, 2_000);

    child.once('exit', () => {
      clearTimeout(timeout);
      resolveStop();
    });
    child.kill();
  });
}

function readPort(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid DANBI_ELECTRON_RENDERER_PORT: ${value}`);
  }

  return parsed;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

function createFetchTimeoutSignal(timeoutMs: number): { signal?: AbortSignal; clear: () => void } {
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
