import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const lockModuleUrl = pathToFileURL(join(process.cwd(), 'scripts', 'electron-release-lock.mjs')).href;
const tempRoots: string[] = [];

describe('Electron release output lock', () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((tempRoot) => rm(tempRoot, { recursive: true, force: true })));
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

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(stdout).not.toContain('child-acquired');
    rmSync(lockDir, { recursive: true, force: true });

    const [status] = await once(child, 'close') as [number | null];
    expect(status).toBe(0);
    expect(stderr).toContain('Waiting for Electron release output lock');
    expect(stdout).toContain('child-acquired');
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(125);
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
