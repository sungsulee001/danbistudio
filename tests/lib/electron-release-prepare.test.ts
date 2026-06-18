import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanStaleNextBuildArtifacts,
} from '../../scripts/prepare-electron-release-helpers.mjs';

const tempRoots: string[] = [];
const prepareScriptPath = fileURLToPath(new URL('../../scripts/prepare-electron-release.mjs', import.meta.url));

describe('Electron release prepare helpers', () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((tempRoot) => rm(tempRoot, { recursive: true, force: true })));
  });

  it('removes stale Next dev type artifacts before production release build while preserving cache', async () => {
    const rootDir = await makeTempRoot();
    await writeFixtureFile(rootDir, '.next/dev/types/validator.ts', 'broken dev validator');
    await writeFixtureFile(rootDir, '.next/types/app/page.ts', 'old production validator');
    await writeFixtureFile(rootDir, '.next/diagnostics/build.json', '{}');
    await writeFixtureFile(rootDir, '.next/cache/webpack/client.pack', 'cache');

    const result = cleanStaleNextBuildArtifacts(rootDir);

    expect(result).toMatchObject({
      status: 'passed',
      removed: [
        '.next/dev',
        '.next/types',
        '.next/diagnostics',
      ],
    });
    expect(existsSync(join(rootDir, '.next/dev'))).toBe(false);
    expect(existsSync(join(rootDir, '.next/types'))).toBe(false);
    expect(existsSync(join(rootDir, '.next/diagnostics'))).toBe(false);
    expect(existsSync(join(rootDir, '.next/cache/webpack/client.pack'))).toBe(true);
  });

  it('refuses cleanup targets outside the workspace', async () => {
    const rootDir = await makeTempRoot();

    expect(() => cleanStaleNextBuildArtifacts(rootDir, ['../outside'])).toThrow('outside workspace');
  });

  it('prints prepare CLI parse failures in stdout JSON before building', () => {
    const result = spawnSync('node', [
      prepareScriptPath,
      '--bad-option',
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    expect(result.status).toBe(1);
    const output = JSON.parse(result.stdout);
    expect(output).toMatchObject({
      kind: 'danbi.electron.release-prepare',
      status: 'failed',
      failureCount: 1,
      failures: ['Unknown option: --bad-option'],
    });
    expect(result.stdout).not.toContain('Electron release preparation passed');
    expect(result.stderr).toContain('Unknown option: --bad-option');
  });
});

async function makeTempRoot(): Promise<string> {
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-electron-release-prepare-'));
  tempRoots.push(tempRoot);
  return tempRoot;
}

async function writeFixtureFile(rootDir: string, relativePath: string, text: string): Promise<void> {
  const filePath = join(rootDir, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, text, 'utf8');
}
