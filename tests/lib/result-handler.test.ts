import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveResultFile } from '../../src/lib/result-handler';

describe('result handler storage', () => {
  let tempRoot: string;
  let previousLocalDataRoot: string | undefined;
  let previousElectronUserData: string | undefined;

  beforeEach(async () => {
    previousLocalDataRoot = process.env.DANBI_LOCAL_DATA_ROOT;
    previousElectronUserData = process.env.DANBI_ELECTRON_USER_DATA;
    tempRoot = join(tmpdir(), `danbi-result-handler-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    await mkdir(tempRoot, { recursive: true });
    delete process.env.DANBI_LOCAL_DATA_ROOT;
    delete process.env.DANBI_ELECTRON_USER_DATA;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    restoreEnvValue('DANBI_LOCAL_DATA_ROOT', previousLocalDataRoot);
    restoreEnvValue('DANBI_ELECTRON_USER_DATA', previousElectronUserData);
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('keeps duplicate generated result saves instead of overwriting the first output', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1800000000000);

    const firstSource = join(tempRoot, 'comfy-output', 'first.mp4');
    const secondSource = join(tempRoot, 'comfy-output', 'second.mp4');
    await mkdir(dirname(firstSource), { recursive: true });
    await writeFile(firstSource, 'first render');
    await writeFile(secondSource, 'second render');

    const firstSaved = await saveResultFile(firstSource, 'job-1', { rootDir: tempRoot });
    const secondSaved = await saveResultFile(secondSource, 'job-1', { rootDir: tempRoot });

    expect(firstSaved.filename).toBe('job-1_1800000000000.mp4');
    expect(secondSaved.filename).toBe('job-1_1800000000000-1.mp4');
    expect(firstSaved.savedPath).toBe('/outputs/job-1_1800000000000.mp4');
    expect(secondSaved.savedPath).toBe('/outputs/job-1_1800000000000-1.mp4');
    await expect(readFile(firstSaved.filePath, 'utf8')).resolves.toBe('first render');
    await expect(readFile(secondSaved.filePath, 'utf8')).resolves.toBe('second render');
  });

  it('bounds long generated result job IDs before writing output filenames', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1800000000000);

    const source = join(tempRoot, 'comfy-output', 'long-job.mp4');
    const longJobId = `job-${'very-long-comfyui-result-'.repeat(8)}`;
    await mkdir(dirname(source), { recursive: true });
    await writeFile(source, 'long job render');

    const saved = await saveResultFile(source, longJobId, { rootDir: tempRoot });

    expect(saved.filename.length).toBeLessThanOrEqual(102);
    expect(saved.filename).toMatch(/^job-very-long-comfyui-result-.*-[a-f0-9]{8}_1800000000000\.mp4$/);
    expect(saved.savedPath).toBe(`/outputs/${saved.filename}`);
    await expect(readFile(saved.filePath, 'utf8')).resolves.toBe('long job render');
  });
});

function restoreEnvValue(name: 'DANBI_LOCAL_DATA_ROOT' | 'DANBI_ELECTRON_USER_DATA', value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
