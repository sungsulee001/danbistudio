import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createEditorIpcHandlers } from '../../src/electron/main/ipc-handlers';
import { createReadonlyProjectRepository } from '../../src/electron/main/project-store-adapter';
import { EDITOR_IPC_CHANNELS } from '../../src/electron/shared/ipc-contract';
import { createDefaultEditorProject } from '../../src/lib/editor/project';

const tempRoots: string[] = [];

describe('Electron IPC runtime storage paths', () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((tempRoot) => rm(tempRoot, { recursive: true, force: true })));
  });

  it('resolves relative project package directories under the runtime package root', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-ipc-storage-'));
    tempRoots.push(tempRoot);

    const project = createDefaultEditorProject();
    const packageRoot = join(tempRoot, 'user-data', 'packages');
    const handlers = createEditorIpcHandlers({
      projects: createReadonlyProjectRepository(project),
      projectPackageRoot: packageRoot,
    });

    const exported = await handlers[EDITOR_IPC_CHANNELS.projectPackageExport]({
      project,
      packageDirectory: '.danbi/packages/client-export',
      exportedAt: '2026-06-18T00:00:00.000Z',
    });
    const imported = await handlers[EDITOR_IPC_CHANNELS.projectPackageImport]({
      packageDirectory: 'packages/client-export',
    });

    expect(exported.packageDirectory).toBe(join(packageRoot, 'client-export'));
    expect(exported.projectFilePath).toBe(join(packageRoot, 'client-export', 'project.danbi-project.json'));
    expect((await stat(exported.projectFilePath)).isFile()).toBe(true);
    await expect(readFile(exported.projectFilePath, 'utf8')).resolves.toContain('"app": "Danbi Studio"');
    expect(imported.packageDirectory).toBe(join(packageRoot, 'client-export'));
    expect(imported.project).toMatchObject({
      id: project.id,
      name: project.name,
    });
  });
});
