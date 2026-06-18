import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { clearTerminalPersistedJobs, getPersistedJob, listPersistedJobs, savePersistedJob } from '../../src/server/editor/job-store';

const originalCwd = process.cwd();
const originalLocalDataRoot = process.env.DANBI_LOCAL_DATA_ROOT;
const originalElectronUserData = process.env.DANBI_ELECTRON_USER_DATA;
const tempRoots: string[] = [];

function restoreEnvValue(key: 'DANBI_LOCAL_DATA_ROOT' | 'DANBI_ELECTRON_USER_DATA', value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

describe('job store storage root', () => {
  afterEach(async () => {
    process.chdir(originalCwd);
    restoreEnvValue('DANBI_LOCAL_DATA_ROOT', originalLocalDataRoot);
    restoreEnvValue('DANBI_ELECTRON_USER_DATA', originalElectronUserData);

    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('persists queue snapshots under Electron user data instead of the server cwd', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-job-store-'));
    tempRoots.push(tempRoot);
    const workspaceRoot = join(tempRoot, 'workspace');
    const userDataRoot = join(tempRoot, 'userData');
    process.chdir(tempRoot);
    delete process.env.DANBI_LOCAL_DATA_ROOT;
    process.env.DANBI_ELECTRON_USER_DATA = userDataRoot;

    const snapshot = {
      id: 'job-durable-root',
      status: 'queued',
      createdAt: '2026-06-17T00:00:00.000Z',
      label: 'Durable root test',
    };
    const reservedSnapshot = {
      id: 'job-reserved-kind',
      status: 'queued',
      createdAt: '2026-06-17T00:00:01.000Z',
      label: 'Reserved kind test',
    };
    const fallbackSnapshot = {
      id: 'job-fallback-kind',
      status: 'queued',
      createdAt: '2026-06-17T00:00:02.000Z',
      label: 'Fallback kind test',
    };

    await savePersistedJob('render storage/test', snapshot);
    await savePersistedJob('CON', reservedSnapshot);
    await savePersistedJob('...', fallbackSnapshot);

    const durablePath = join(userDataRoot, 'jobs', 'render-storage-test.json');
    const reservedKindPath = join(userDataRoot, 'jobs', 'jobs-CON.json');
    const fallbackKindPath = join(userDataRoot, 'jobs', 'jobs.json');
    const legacyCwdPath = join(tempRoot, '.danbi', 'jobs', 'render-storage-test.json');
    const unrelatedWorkspacePath = join(workspaceRoot, '.danbi', 'jobs', 'render-storage-test.json');
    const records = JSON.parse(await readFile(durablePath, 'utf8')) as Array<{ snapshot: typeof snapshot }>;
    const reservedRecords = JSON.parse(await readFile(reservedKindPath, 'utf8')) as Array<{ snapshot: typeof reservedSnapshot }>;
    const fallbackRecords = JSON.parse(await readFile(fallbackKindPath, 'utf8')) as Array<{ snapshot: typeof fallbackSnapshot }>;

    expect(records[0]?.snapshot).toMatchObject(snapshot);
    expect(reservedRecords[0]?.snapshot).toMatchObject(reservedSnapshot);
    expect(fallbackRecords[0]?.snapshot).toMatchObject(fallbackSnapshot);
    expect(await getPersistedJob<typeof snapshot>('render storage/test', snapshot.id)).toMatchObject(snapshot);
    expect(await getPersistedJob<typeof reservedSnapshot>('CON', reservedSnapshot.id)).toMatchObject(reservedSnapshot);
    expect(await getPersistedJob<typeof fallbackSnapshot>('...', fallbackSnapshot.id)).toMatchObject(fallbackSnapshot);
    await expect(stat(legacyCwdPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(stat(unrelatedWorkspacePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps concurrent queue snapshots and removes temporary job writes', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-job-store-concurrent-'));
    tempRoots.push(tempRoot);
    const userDataRoot = join(tempRoot, 'userData');
    process.chdir(tempRoot);
    delete process.env.DANBI_LOCAL_DATA_ROOT;
    process.env.DANBI_ELECTRON_USER_DATA = userDataRoot;

    const activeSnapshot = {
      id: 'job-active',
      status: 'running',
      createdAt: '2026-06-17T00:00:00.000Z',
      label: 'Active render',
    };
    const terminalSnapshots = Array.from({ length: 5 }, (_, index) => ({
      id: `job-terminal-${index}`,
      status: index % 2 === 0 ? 'completed' : 'failed',
      createdAt: `2026-06-17T00:00:0${index + 1}.000Z`,
      label: `Terminal render ${index}`,
    }));

    await Promise.all([
      savePersistedJob('render concurrent/test', activeSnapshot),
      ...terminalSnapshots.map((snapshot) => savePersistedJob('render concurrent/test', snapshot)),
    ]);

    const savedJobs = await listPersistedJobs<typeof activeSnapshot>('render concurrent/test');
    expect(savedJobs.map((job) => job.id)).toEqual(expect.arrayContaining([
      activeSnapshot.id,
      ...terminalSnapshots.map((snapshot) => snapshot.id),
    ]));

    expect(await clearTerminalPersistedJobs('render concurrent/test')).toBe(terminalSnapshots.length);
    expect(await listPersistedJobs<typeof activeSnapshot>('render concurrent/test')).toEqual([activeSnapshot]);
    expect((await readdir(join(userDataRoot, 'jobs'))).some((fileName) => fileName.endsWith('.tmp'))).toBe(false);
  });

  it('skips corrupted queue records while keeping valid persisted jobs readable', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-job-store-corrupted-records-'));
    tempRoots.push(tempRoot);
    const userDataRoot = join(tempRoot, 'userData');
    const jobsRoot = join(userDataRoot, 'jobs');
    process.chdir(tempRoot);
    delete process.env.DANBI_LOCAL_DATA_ROOT;
    process.env.DANBI_ELECTRON_USER_DATA = userDataRoot;

    const activeSnapshot = {
      id: 'job-valid-active',
      status: 'running',
      createdAt: '2026-06-17T00:00:00.000Z',
      label: 'Valid active render',
    };
    await mkdir(jobsRoot, { recursive: true });
    await writeFile(join(jobsRoot, 'render-corrupted-test.json'), JSON.stringify([
      {
        id: activeSnapshot.id,
        kind: 'render corrupted/test',
        status: activeSnapshot.status,
        snapshot: activeSnapshot,
        createdAt: activeSnapshot.createdAt,
        updatedAt: '2026-06-17T00:00:01.000Z',
      },
      null,
      {
        id: 'job-mismatched',
        kind: 'render corrupted/test',
        status: 'queued',
        snapshot: {
          id: 'different-job-id',
          status: 'queued',
          createdAt: '2026-06-17T00:00:02.000Z',
          label: 'Mismatched render',
        },
        createdAt: '2026-06-17T00:00:02.000Z',
        updatedAt: '2026-06-17T00:00:02.000Z',
      },
      {
        id: 'job-invalid-created-at',
        kind: 'render corrupted/test',
        status: 'failed',
        snapshot: {
          id: 'job-invalid-created-at',
          status: 'failed',
          createdAt: 'not-a-date',
          label: 'Invalid date render',
        },
        createdAt: 'not-a-date',
        updatedAt: '2026-06-17T00:00:03.000Z',
      },
    ], null, 2), 'utf8');

    await expect(listPersistedJobs<typeof activeSnapshot>('render corrupted/test')).resolves.toEqual([activeSnapshot]);
    await expect(getPersistedJob<typeof activeSnapshot>('render corrupted/test', activeSnapshot.id)).resolves.toEqual(activeSnapshot);
    await expect(getPersistedJob<typeof activeSnapshot>('render corrupted/test', 'job-mismatched')).resolves.toBeUndefined();
    await expect(clearTerminalPersistedJobs('render corrupted/test')).resolves.toBe(0);
  });
});
