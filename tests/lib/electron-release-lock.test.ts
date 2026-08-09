import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const lockModuleUrl = pathToFileURL(join(process.cwd(), 'scripts', 'electron-release-lock.mjs')).href;

/** Poll until `predicate` holds, so the test waits on the event and not a guess. */
async function waitFor(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const tempRoots: string[] = [];

describe('Electron release output lock', () => {
  afterEach(async () => {
    // Same race as the STT suite: a spawned child may still hold the lock dir.
    await Promise.all(tempRoots.splice(0).map((tempRoot) => rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })));
  });

  it('sets lock metadata and release env while held, then removes the lock', async () => {
    const tempRoot = await makeTempRoot();
    const lockDir = join(tempRoot, 'electron-release-output.lock');
    const { withReleaseOutputLock } = await import('../../scripts/electron-release-lock.mjs');

    let lockExistedWhileHeld = false;
    let envWhileHeld: string | undefined;
    await withReleaseOutputLock(async () => {
      lockExistedWhileHeld = existsSync(join(lockDir, 'owner.json'));
      envWhileHeld = process.env.DANBI_ELECTRON_RELEASE_OUTPUT_LOCK_HELD;
    }, {
      lockDir,
      label: 'unit-test-lock',
      timeoutMs: 1_000,
      pollIntervalMs: 10,
      force: true,
    });

    expect(lockExistedWhileHeld).toBe(true);
    expect(envWhileHeld).toBe('1');
    expect(existsSync(lockDir)).toBe(false);
  });

  it('waits for another process to release the active release-output lock', async () => {
    const tempRoot = await makeTempRoot();
    const lockDir = join(tempRoot, 'electron-release-output.lock');
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, 'owner.json'), `${JSON.stringify({
      token: 'parent-held-lock',
      pid: process.pid,
      label: 'parent-test-holder',
      acquiredAt: new Date().toISOString(),
    })}\n`, 'utf8');

    const startedAt = Date.now();
    const child = spawn(process.execPath, [
      '--input-type=module',
      '-e',
      [
        `import { withReleaseOutputLock } from ${JSON.stringify(lockModuleUrl)};`,
        `await withReleaseOutputLock(async () => { console.log('child-acquired:' + Date.now()); }, { lockDir: ${JSON.stringify(lockDir)}, timeoutMs: 5000, pollIntervalMs: 25, force: true });`,
      ].join('\n'),
    ], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    // Wait for the child to say it is blocked rather than sleeping a fixed
    // 150ms and assuming it got that far. Node's startup exceeds 150ms on a
    // loaded machine, and releasing the lock before the child began waiting
    // let it acquire immediately — the "Waiting for..." assertion below then
    // failed for reasons that had nothing to do with the lock.
    await waitFor(() => stderr.includes('Waiting for Electron release output lock'));
    expect(stdout).not.toContain('child-acquired');
    const releasedAt = Date.now();
    rmSync(lockDir, { recursive: true, force: true });

    const [status] = await once(child, 'close') as [number | null];
    expect(status).toBe(0);
    expect(stdout).toContain('child-acquired');
    // The contract is the ordering, not a duration: the child announced it was
    // blocked, held off while the lock existed, and only acquired once the lock
    // was gone. The previous wall-clock assertion just re-measured the test's
    // own 150ms sleep, so it broke the moment the sleep did.
    const acquiredAt = Number(/child-acquired:(\d+)/.exec(stdout)?.[1]);
    expect(Number.isFinite(acquiredAt)).toBe(true);
    expect(acquiredAt).toBeGreaterThanOrEqual(releasedAt);
    expect(acquiredAt).toBeGreaterThanOrEqual(startedAt);
    expect(existsSync(lockDir)).toBe(false);
  });

  it('removes stale release-output locks before acquiring', async () => {
    const tempRoot = await makeTempRoot();
    const lockDir = join(tempRoot, 'electron-release-output.lock');
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, 'owner.json'), `${JSON.stringify({
      token: 'stale-lock',
      pid: 1,
      label: 'stale-test-holder',
      acquiredAt: new Date(Date.now() - 10_000).toISOString(),
    })}\n`, 'utf8');
    const { withReleaseOutputLock } = await import('../../scripts/electron-release-lock.mjs');

    let acquired = false;
    await withReleaseOutputLock(async () => {
      acquired = true;
    }, {
      lockDir,
      label: 'stale-lock-test',
      timeoutMs: 1_000,
      staleMs: 1,
      pollIntervalMs: 10,
      force: true,
    });

    expect(acquired).toBe(true);
    expect(existsSync(lockDir)).toBe(false);
  });
});

async function makeTempRoot(): Promise<string> {
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-electron-release-lock-'));
  tempRoots.push(tempRoot);
  return tempRoot;
}
