import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RELEASE_OUTPUT_LOCK_HELD_ENV = 'DANBI_ELECTRON_RELEASE_OUTPUT_LOCK_HELD';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_LOCK_DIR = path.join(rootDir, '.danbi', 'locks', 'electron-release-output.lock');
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_STALE_MS = 60 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 500;

export async function withReleaseOutputLock(callback, options = {}) {
  if (process.env[RELEASE_OUTPUT_LOCK_HELD_ENV] === '1' && !options.force) {
    return callback({
      acquired: false,
      lockDir: path.resolve(options.lockDir ?? DEFAULT_LOCK_DIR),
      release: () => undefined,
      skippedReason: 'release-output-lock-already-held',
    });
  }

  const lock = await acquireReleaseOutputLock(options);
  try {
    return await callback(lock);
  } finally {
    lock.release();
  }
}

export async function acquireReleaseOutputLock(options = {}) {
  if (process.env[RELEASE_OUTPUT_LOCK_HELD_ENV] === '1' && !options.force) {
    return {
      acquired: false,
      lockDir: path.resolve(options.lockDir ?? DEFAULT_LOCK_DIR),
      release: () => undefined,
      skippedReason: 'release-output-lock-already-held',
    };
  }

  const lockDir = path.resolve(options.lockDir ?? DEFAULT_LOCK_DIR);
  const timeoutMs = readPositiveNumber(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const staleMs = readPositiveNumber(options.staleMs, DEFAULT_STALE_MS);
  const pollIntervalMs = readPositiveNumber(options.pollIntervalMs, DEFAULT_POLL_INTERVAL_MS);
  const label = options.label ?? 'electron-release-output';
  const ownerPath = path.join(lockDir, 'owner.json');
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const startedAt = Date.now();
  let waitLogged = false;

  mkdirSync(path.dirname(lockDir), { recursive: true });

  while (true) {
    try {
      mkdirSync(lockDir);
      const owner = {
        token,
        pid: process.pid,
        label,
        cwd: process.cwd(),
        acquiredAt: new Date().toISOString(),
      };
      writeFileSync(ownerPath, `${JSON.stringify(owner, null, 2)}\n`, 'utf8');
      return createReleaseHandle(lockDir, ownerPath, token);
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }

      removeStaleLock(lockDir, staleMs);
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error(`Timed out waiting for Electron release output lock at ${toRelative(lockDir)}. ${describeLockOwner(lockDir)}`);
      }

      if (!waitLogged) {
        waitLogged = true;
        process.stderr.write(`Waiting for Electron release output lock at ${toRelative(lockDir)}. ${describeLockOwner(lockDir)}\n`);
      }
      await sleep(pollIntervalMs);
    }
  }
}

function createReleaseHandle(lockDir, ownerPath, token) {
  let released = false;
  const previousEnv = process.env[RELEASE_OUTPUT_LOCK_HELD_ENV];
  process.env[RELEASE_OUTPUT_LOCK_HELD_ENV] = '1';

  const release = () => {
    if (released) {
      return;
    }
    released = true;

    if (previousEnv === undefined) {
      delete process.env[RELEASE_OUTPUT_LOCK_HELD_ENV];
    } else {
      process.env[RELEASE_OUTPUT_LOCK_HELD_ENV] = previousEnv;
    }

    if (!isCurrentOwner(ownerPath, token)) {
      return;
    }
    rmSync(lockDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  };

  process.once('exit', release);
  return {
    acquired: true,
    lockDir,
    release,
  };
}

function removeStaleLock(lockDir, staleMs) {
  const owner = readOwner(lockDir);
  const acquiredAt = owner?.acquiredAt ? Date.parse(owner.acquiredAt) : NaN;
  const fallbackMtimeMs = statSync(lockDir, { throwIfNoEntry: false })?.mtimeMs ?? Date.now();
  const lockAgeMs = Date.now() - (Number.isFinite(acquiredAt) ? acquiredAt : fallbackMtimeMs);
  if (lockAgeMs < staleMs) {
    return;
  }

  rmSync(lockDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

function describeLockOwner(lockDir) {
  const owner = readOwner(lockDir);
  if (!owner) {
    return 'Lock owner metadata is unavailable.';
  }
  return `Current owner: pid=${owner.pid ?? 'unknown'}, label=${owner.label ?? 'unknown'}, acquiredAt=${owner.acquiredAt ?? 'unknown'}.`;
}

function readOwner(lockDir) {
  const ownerPath = path.join(lockDir, 'owner.json');
  if (!existsSync(ownerPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(ownerPath, 'utf8'));
  } catch {
    return null;
  }
}

function isCurrentOwner(ownerPath, token) {
  try {
    const owner = JSON.parse(readFileSync(ownerPath, 'utf8'));
    return owner?.token === token;
  } catch {
    return false;
  }
}

function readPositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function isAlreadyExistsError(error) {
  return error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toRelative(filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}
