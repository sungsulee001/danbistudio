import { access, mkdir, rm, utimes, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupStorageFiles,
  normalizeStorageCleanupMaxAgeDays,
  normalizeStorageCleanupTargets,
} from '../../src/server/storage-cleanup';

describe('storage cleanup', () => {
  let rootDir: string;
  let previousLocalDataRoot: string | undefined;
  let previousElectronUserData: string | undefined;
  const now = new Date('2026-06-16T00:00:00.000Z');
  const oldDate = new Date('2026-04-01T00:00:00.000Z');
  const freshDate = new Date('2026-06-10T00:00:00.000Z');

  beforeEach(async () => {
    previousLocalDataRoot = process.env.DANBI_LOCAL_DATA_ROOT;
    previousElectronUserData = process.env.DANBI_ELECTRON_USER_DATA;
    rootDir = await makeTempRoot();
    delete process.env.DANBI_LOCAL_DATA_ROOT;
    delete process.env.DANBI_ELECTRON_USER_DATA;
  });

  afterEach(async () => {
    restoreEnvValue('DANBI_LOCAL_DATA_ROOT', previousLocalDataRoot);
    restoreEnvValue('DANBI_ELECTRON_USER_DATA', previousElectronUserData);
    await rm(rootDir, { recursive: true, force: true });
  });

  it('reports old cache, output, and STT files without deleting them during dry run', async () => {
    const oldCache = await writeDatedFile(rootDir, '.danbi/cache/thumbs/old.jpg', oldDate);
    const oldOutput = await writeDatedFile(rootDir, '.danbi/outputs/old.mp4', oldDate);
    const oldStt = await writeDatedFile(rootDir, '.danbi/stt/job-1/task-1/transcript.json', oldDate);
    const freshCache = await writeDatedFile(rootDir, '.danbi/cache/thumbs/fresh.jpg', freshDate);

    const result = await cleanupStorageFiles({
      rootDir,
      now,
      maxAgeDays: 30,
      dryRun: true,
    });

    expect(result).toMatchObject({
      dryRun: true,
      maxAgeDays: 30,
      eligibleFiles: 3,
      deletedFiles: 0,
    });
    expect(result.targets.find((target) => target.id === 'cache')).toMatchObject({
      rootPaths: [
        join(rootDir, '.danbi', 'cache'),
        join(rootDir, 'public', 'cache'),
      ],
    });
    expect(result.targets.find((target) => target.id === 'outputs')).toMatchObject({
      rootPaths: [
        join(rootDir, '.danbi', 'outputs'),
        join(rootDir, 'public', 'outputs'),
      ],
    });
    expect(result.targets.find((target) => target.id === 'stt')).toMatchObject({
      rootPaths: [
        join(rootDir, '.danbi', 'stt'),
      ],
    });
    expect(result.eligibleBytes).toBeGreaterThan(0);
    await expectFileExists(oldCache);
    await expectFileExists(oldOutput);
    await expectFileExists(oldStt);
    await expectFileExists(freshCache);
  });

  it('deletes only old cache, output, and STT files while preserving source imports and LUTs', async () => {
    const oldCache = await writeDatedFile(rootDir, '.danbi/cache/thumbs/old.jpg', oldDate);
    const legacyCache = await writeDatedFile(rootDir, 'public/cache/thumbs/legacy-old.jpg', oldDate);
    const oldOutput = await writeDatedFile(rootDir, '.danbi/outputs/old.mp4', oldDate);
    const legacyOutput = await writeDatedFile(rootDir, 'public/outputs/legacy-old.mp4', oldDate);
    const oldStt = await writeDatedFile(rootDir, '.danbi/stt/job-1/task-1/transcript.json', oldDate);
    const freshCache = await writeDatedFile(rootDir, '.danbi/cache/thumbs/fresh.jpg', freshDate);
    const importedSource = await writeDatedFile(rootDir, 'public/imports/source.mp4', oldDate);
    const lutFile = await writeDatedFile(rootDir, 'public/luts/look.cube', oldDate);

    const result = await cleanupStorageFiles({
      rootDir,
      now,
      maxAgeDays: 30,
      dryRun: false,
    });

    expect(result).toMatchObject({
      dryRun: false,
      eligibleFiles: 5,
      deletedFiles: 5,
    });
    expect(result.deletedBytes).toBe(result.eligibleBytes);
    await expectFileMissing(oldCache);
    await expectFileMissing(legacyCache);
    await expectFileMissing(oldOutput);
    await expectFileMissing(legacyOutput);
    await expectFileMissing(oldStt);
    await expectFileExists(freshCache);
    await expectFileExists(importedSource);
    await expectFileExists(lutFile);
  });

  it('can limit cleanup to selected targets', async () => {
    const oldCache = await writeDatedFile(rootDir, '.danbi/cache/old.jpg', oldDate);
    const oldOutput = await writeDatedFile(rootDir, '.danbi/outputs/old.mp4', oldDate);
    const legacyOutput = await writeDatedFile(rootDir, 'public/outputs/legacy-old.mp4', oldDate);

    const result = await cleanupStorageFiles({
      rootDir,
      now,
      maxAgeDays: 30,
      dryRun: false,
      targets: ['outputs'],
    });

    expect(result.targets.map((target) => target.id)).toEqual(['outputs']);
    expect(result.deletedFiles).toBe(2);
    await expectFileExists(oldCache);
    await expectFileMissing(oldOutput);
    await expectFileMissing(legacyOutput);
  });

  it('normalizes unsafe cleanup inputs to bounded defaults', () => {
    expect(normalizeStorageCleanupMaxAgeDays('bad')).toBe(30);
    expect(normalizeStorageCleanupMaxAgeDays(0)).toBe(1);
    expect(normalizeStorageCleanupMaxAgeDays(5000)).toBe(3650);
    expect(normalizeStorageCleanupTargets(['imports', 'cache', 'outputs', 'stt', 'cache'])).toEqual(['cache', 'outputs', 'stt']);
    expect(normalizeStorageCleanupTargets(['imports'])).toEqual(['cache', 'outputs', 'stt']);
  });
});

async function makeTempRoot(): Promise<string> {
  const root = join(tmpdir(), `danbi-storage-cleanup-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(root, { recursive: true });
  return root;
}

async function writeDatedFile(rootDir: string, relativePath: string, date: Date): Promise<string> {
  const filePath = join(rootDir, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `fixture ${relativePath}`);
  await utimes(filePath, date, date);
  return filePath;
}

async function expectFileExists(path: string): Promise<void> {
  await expect(access(path)).resolves.toBeUndefined();
}

async function expectFileMissing(path: string): Promise<void> {
  await expect(access(path)).rejects.toBeTruthy();
}

function restoreEnvValue(name: 'DANBI_LOCAL_DATA_ROOT' | 'DANBI_ELECTRON_USER_DATA', value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
