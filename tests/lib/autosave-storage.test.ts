import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { clearEditorAutosaves, getEditorAutosave, listEditorAutosaves, saveEditorAutosave } from '../../src/electron/main/autosave-store';
import { createDefaultEditorProject } from '../../src/lib/editor/project';

const originalCwd = process.cwd();
const originalLocalDataRoot = process.env.DANBI_LOCAL_DATA_ROOT;
const originalElectronUserData = process.env.DANBI_ELECTRON_USER_DATA;
const tempRoots: string[] = [];

describe('autosave storage root', () => {
  afterEach(async () => {
    process.chdir(originalCwd);
    restoreEnvValue('DANBI_LOCAL_DATA_ROOT', originalLocalDataRoot);
    restoreEnvValue('DANBI_ELECTRON_USER_DATA', originalElectronUserData);
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('persists project recovery snapshots under Electron user data', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-autosave-storage-'));
    tempRoots.push(tempRoot);
    const userDataRoot = join(tempRoot, 'userData');
    process.chdir(tempRoot);
    delete process.env.DANBI_LOCAL_DATA_ROOT;
    process.env.DANBI_ELECTRON_USER_DATA = userDataRoot;

    await clearEditorAutosaves();
    const project = {
      ...createDefaultEditorProject(),
      id: 'project-autosave-durable',
      name: 'Autosave Durable Root',
    };

    const snapshot = await saveEditorAutosave(project, 'storage-test', '2026-06-17T00:00:00.000Z');
    const durablePath = join(userDataRoot, 'autosave', 'editor-autosaves.json');
    const legacyCwdPath = join(tempRoot, '.danbi', 'autosave', 'editor-autosaves.json');
    const records = JSON.parse(await readFile(durablePath, 'utf8')) as Array<{ projectId: string; reason: string }>;

    expect(snapshot).toMatchObject({
      projectId: project.id,
      reason: 'storage-test',
      project: { id: project.id, name: project.name },
    });
    expect(records[0]).toMatchObject({ projectId: project.id, reason: 'storage-test' });
    expect((await getEditorAutosave(project.id))?.project).toMatchObject({ id: project.id, name: project.name });
    await expect(stat(legacyCwdPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps concurrent project recovery autosaves and removes temporary writes', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-autosave-concurrent-'));
    tempRoots.push(tempRoot);
    const userDataRoot = join(tempRoot, 'userData');
    process.chdir(tempRoot);
    delete process.env.DANBI_LOCAL_DATA_ROOT;
    process.env.DANBI_ELECTRON_USER_DATA = userDataRoot;

    await clearEditorAutosaves();

    const projects = Array.from({ length: 5 }, (_, index) => ({
      ...createDefaultEditorProject(),
      id: `project-autosave-concurrent-${index}`,
      name: `Autosave Concurrent ${index}`,
    }));

    await Promise.all(projects.map((project, index) => saveEditorAutosave(
      project,
      'concurrent-test',
      `2026-06-17T00:00:0${index}.000Z`,
    )));

    const summaries = await listEditorAutosaves();
    const autosaveDirectory = join(userDataRoot, 'autosave');

    expect(summaries.map((summary) => summary.projectId)).toEqual(
      expect.arrayContaining(projects.map((project) => project.id)),
    );
    expect(summaries.filter((summary) => summary.projectId.startsWith('project-autosave-concurrent-'))).toHaveLength(5);
    expect((await readdir(autosaveDirectory)).some((fileName) => fileName.endsWith('.tmp'))).toBe(false);
  });

  it('skips corrupted project recovery records while keeping valid autosaves readable', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-autosave-corrupted-records-'));
    tempRoots.push(tempRoot);
    const userDataRoot = join(tempRoot, 'userData');
    const autosaveDirectory = join(userDataRoot, 'autosave');
    process.chdir(tempRoot);
    delete process.env.DANBI_LOCAL_DATA_ROOT;
    process.env.DANBI_ELECTRON_USER_DATA = userDataRoot;

    const project = {
      ...createDefaultEditorProject(),
      id: 'project-autosave-valid',
      name: 'Valid Autosave',
      updatedAt: '2026-06-17T00:00:00.000Z',
    };
    await mkdir(autosaveDirectory, { recursive: true });
    await writeFile(join(autosaveDirectory, 'editor-autosaves.json'), JSON.stringify([
      {
        projectId: project.id,
        reason: 'Manual Recovery',
        savedAt: '2026-06-17T00:00:00.000Z',
        data: JSON.stringify(project),
      },
      {
        projectId: 'project-autosave-corrupted',
        reason: 'autosave',
        savedAt: '2026-06-17T00:00:01.000Z',
        data: '{',
      },
      {
        projectId: 'project-autosave-mismatch',
        reason: 'autosave',
        savedAt: '2026-06-17T00:00:02.000Z',
        data: JSON.stringify({ ...project, id: 'different-project-id' }),
      },
    ], null, 2), 'utf8');

    const summaries = await listEditorAutosaves();

    expect(summaries).toEqual([
      expect.objectContaining({
        projectId: project.id,
        name: project.name,
        reason: 'manual-recovery',
      }),
    ]);
    await expect(getEditorAutosave('project-autosave-corrupted')).resolves.toBeUndefined();
    await expect(getEditorAutosave('project-autosave-mismatch')).resolves.toBeUndefined();
  });
});

function restoreEnvValue(name: 'DANBI_LOCAL_DATA_ROOT' | 'DANBI_ELECTRON_USER_DATA', value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
