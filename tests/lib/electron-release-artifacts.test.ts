import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildWindowsInstallerArtifactName,
  cleanWindowsInstallerArtifacts,
} from '../../scripts/electron-release-artifacts.mjs';

const tempRoots: string[] = [];

describe('Electron release artifact helpers', () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((tempRoot) => rm(tempRoot, { recursive: true, force: true })));
  });

  it('builds the sanitized Windows installer artifact name', () => {
    expect(buildWindowsInstallerArtifactName('Danbi Studio', '0.1.0')).toBe('Danbi-Studio-0.1.0-win-x64.exe');
    expect(buildWindowsInstallerArtifactName(' Danbi   Studio ', '1.2.3')).toBe('Danbi-Studio-1.2.3-win-x64.exe');
  });

  it('removes only top-level Windows installer artifacts before packaging', async () => {
    const releaseDir = await mkdtemp(join(tmpdir(), 'danbi-release-artifacts-'));
    tempRoots.push(releaseDir);
    await writeFile(join(releaseDir, 'Danbi Studio-0.1.0-win-x64.exe'), 'old installer');
    await writeFile(join(releaseDir, 'Danbi Studio-0.1.0-win-x64.exe.blockmap'), 'old blockmap');
    await writeFile(join(releaseDir, 'latest.yml'), 'old latest');
    await writeFile(join(releaseDir, 'builder-debug.yml'), 'debug');
    await mkdir(join(releaseDir, 'win-unpacked'));
    await writeFile(join(releaseDir, 'win-unpacked', 'Danbi Studio.exe'), 'unpacked app');

    const removed = cleanWindowsInstallerArtifacts(releaseDir);

    expect(removed).toEqual([
      'Danbi Studio-0.1.0-win-x64.exe',
      'Danbi Studio-0.1.0-win-x64.exe.blockmap',
      'latest.yml',
    ]);
    await expect(readdir(releaseDir)).resolves.toEqual(expect.arrayContaining([
      'builder-debug.yml',
      'win-unpacked',
    ]));
    await expect(readdir(join(releaseDir, 'win-unpacked'))).resolves.toEqual(['Danbi Studio.exe']);
  });
});
