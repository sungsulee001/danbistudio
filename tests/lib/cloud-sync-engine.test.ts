import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { importProjectFromCloudFolder, syncProjectToCloudFolder } from '../../src/electron/main/cloud-sync-engine';
import { createDefaultEditorProject } from '../../src/lib/editor/project';

describe('cloud sync engine', () => {
  it('syncs a portable project package and cloud sync manifest into a local sync folder', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-cloud-sync-'));

    try {
      const project = {
        ...createDefaultEditorProject(),
        id: 'project:cloud/sync',
        name: 'Cloud Sync Project',
        updatedAt: '2026-06-16T00:00:00.000Z',
      };
      const result = await syncProjectToCloudFolder({
        project,
        syncDirectory: tempRoot,
        exportedAt: '2026-06-16T01:00:00.000Z',
      });

      expect(result.status).toBe('synced');
      expect(result.projectSyncDirectory).toContain('Cloud-Sync-Project');
      expect(result.projectFilePath.endsWith('project.danbi-project.json')).toBe(true);
      expect(result.manifestPath.endsWith('danbi-cloud-sync.json')).toBe(true);

      const packageJson = JSON.parse(await readFile(result.projectFilePath, 'utf8')) as {
        project?: { id?: string };
      };
      const manifest = JSON.parse(await readFile(result.manifestPath, 'utf8')) as {
        kind?: string;
        projectId?: string;
        projectUpdatedAt?: string;
      };
      const index = JSON.parse(await readFile(join(tempRoot, 'danbi-cloud-sync-index.json'), 'utf8')) as {
        projects?: Array<{ projectId: string; relativeProjectDirectory: string }>;
      };
      const syncRootFiles = await readdir(tempRoot);
      const projectSyncFiles = await readdir(result.projectSyncDirectory);

      expect(packageJson.project?.id).toBe(project.id);
      expect(manifest).toMatchObject({
        kind: 'danbi.cloud-sync.manifest',
        projectId: project.id,
        projectUpdatedAt: project.updatedAt,
      });
      expect(index.projects).toEqual([
        expect.objectContaining({
          projectId: project.id,
          relativeProjectDirectory: expect.stringContaining('Cloud-Sync-Project'),
        }),
      ]);
      expect([...syncRootFiles, ...projectSyncFiles].some((filename) => filename.endsWith('.tmp'))).toBe(false);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('imports the latest cloud sync project snapshot from the sync index', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-cloud-sync-import-'));

    try {
      const olderProject = {
        ...createDefaultEditorProject(),
        id: 'project-cloud-import',
        name: 'Cloud Import',
        updatedAt: '2026-06-16T01:00:00.000Z',
      };
      const newerProject = {
        ...olderProject,
        name: 'Cloud Import Updated',
        updatedAt: '2026-06-16T02:00:00.000Z',
      };

      await syncProjectToCloudFolder({
        project: olderProject,
        syncDirectory: tempRoot,
        exportedAt: '2026-06-16T01:05:00.000Z',
      });
      const synced = await syncProjectToCloudFolder({
        project: newerProject,
        syncDirectory: tempRoot,
        exportedAt: '2026-06-16T02:05:00.000Z',
      });
      const imported = await importProjectFromCloudFolder({
        syncDirectory: tempRoot,
        projectId: olderProject.id,
      });

      expect(imported.project).toMatchObject({
        id: newerProject.id,
        name: newerProject.name,
        updatedAt: newerProject.updatedAt,
      });
      expect(imported.syncDirectory).toBe(tempRoot);
      expect(imported.projectSyncDirectory).toBe(synced.projectSyncDirectory);
      expect(imported.manifestPath).toBe(synced.manifestPath);
      expect(imported.projectUpdatedAt).toBe(newerProject.updatedAt);
      expect(imported.exportedAt).toBe('2026-06-16T02:05:00.000Z');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('imports a cloud sync project snapshot when the sync index is missing', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-cloud-sync-import-scan-'));

    try {
      const project = {
        ...createDefaultEditorProject(),
        id: 'project-cloud-import-scan',
        name: 'Cloud Import Scan',
        updatedAt: '2026-06-16T04:00:00.000Z',
      };
      const synced = await syncProjectToCloudFolder({
        project,
        syncDirectory: tempRoot,
        exportedAt: '2026-06-16T04:05:00.000Z',
      });

      await rm(join(tempRoot, 'danbi-cloud-sync-index.json'), { force: true });

      const imported = await importProjectFromCloudFolder({
        syncDirectory: tempRoot,
        projectId: project.id,
      });

      expect(imported.project).toMatchObject({
        id: project.id,
        name: project.name,
        updatedAt: project.updatedAt,
      });
      expect(imported.projectSyncDirectory).toBe(synced.projectSyncDirectory);
      expect(imported.manifestPath).toBe(synced.manifestPath);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('imports a cloud sync project snapshot when the selected directory is the project folder', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-cloud-sync-import-folder-'));

    try {
      const project = {
        ...createDefaultEditorProject(),
        id: 'project-cloud-import-folder',
        name: 'Cloud Import Folder',
        updatedAt: '2026-06-16T05:00:00.000Z',
      };
      const synced = await syncProjectToCloudFolder({
        project,
        syncDirectory: tempRoot,
        exportedAt: '2026-06-16T05:05:00.000Z',
      });

      const imported = await importProjectFromCloudFolder({
        syncDirectory: synced.projectSyncDirectory,
        projectId: project.id,
      });

      expect(imported.project).toMatchObject({
        id: project.id,
        name: project.name,
        updatedAt: project.updatedAt,
      });
      expect(imported.syncDirectory).toBe(synced.projectSyncDirectory);
      expect(imported.projectSyncDirectory).toBe(synced.projectSyncDirectory);
      expect(imported.manifestPath).toBe(synced.manifestPath);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('blocks older local projects when the sync folder has a newer snapshot unless forced', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-cloud-sync-conflict-'));

    try {
      const newerProject = {
        ...createDefaultEditorProject(),
        id: 'project-cloud-conflict',
        name: 'Cloud Conflict',
        updatedAt: '2026-06-16T03:00:00.000Z',
      };
      const olderProject = {
        ...newerProject,
        updatedAt: '2026-06-16T02:00:00.000Z',
      };

      const first = await syncProjectToCloudFolder({
        project: newerProject,
        syncDirectory: tempRoot,
        exportedAt: '2026-06-16T03:05:00.000Z',
      });
      const conflict = await syncProjectToCloudFolder({
        project: olderProject,
        syncDirectory: tempRoot,
        exportedAt: '2026-06-16T03:10:00.000Z',
      });
      const forced = await syncProjectToCloudFolder({
        project: olderProject,
        syncDirectory: tempRoot,
        exportedAt: '2026-06-16T03:15:00.000Z',
        force: true,
      });

      expect(first.status).toBe('synced');
      expect(conflict.status).toBe('conflict');
      expect(conflict.copiedMedia).toEqual([]);
      expect(conflict.previousProjectUpdatedAt).toBe(newerProject.updatedAt);
      expect(conflict.warnings[0]).toContain('newer project snapshot');
      expect(forced.status).toBe('synced');
      expect(forced.previousProjectUpdatedAt).toBe(newerProject.updatedAt);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('keeps conflict protection for legacy cloud sync manifests without optional counts', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-cloud-sync-legacy-conflict-'));

    try {
      const newerProject = {
        ...createDefaultEditorProject(),
        id: 'project-cloud-legacy-conflict',
        name: 'Cloud Legacy Conflict',
        updatedAt: '2026-06-16T03:00:00.000Z',
      };
      const olderProject = {
        ...newerProject,
        updatedAt: '2026-06-16T02:00:00.000Z',
      };

      const first = await syncProjectToCloudFolder({
        project: newerProject,
        syncDirectory: tempRoot,
        exportedAt: '2026-06-16T03:05:00.000Z',
      });
      const legacyManifest = JSON.parse(await readFile(first.manifestPath, 'utf8')) as Record<string, unknown>;
      delete legacyManifest.packageFileName;
      delete legacyManifest.mediaEntryCount;
      delete legacyManifest.copiedMediaCount;
      delete legacyManifest.warningCount;
      await writeFile(first.manifestPath, `${JSON.stringify(legacyManifest, null, 2)}\n`, 'utf8');

      const conflict = await syncProjectToCloudFolder({
        project: olderProject,
        syncDirectory: tempRoot,
        exportedAt: '2026-06-16T03:10:00.000Z',
      });

      expect(first.status).toBe('synced');
      expect(conflict.status).toBe('conflict');
      expect(conflict.previousProjectUpdatedAt).toBe(newerProject.updatedAt);
      expect(conflict.copiedMedia).toEqual([]);
      expect(conflict.warnings[0]).toContain('newer project snapshot');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('blocks older renamed local projects by reading the indexed existing sync folder', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-cloud-sync-rename-conflict-'));

    try {
      const newerProject = {
        ...createDefaultEditorProject(),
        id: 'project-cloud-rename-conflict',
        name: 'Original Cloud Name',
        updatedAt: '2026-06-16T03:00:00.000Z',
      };
      const olderRenamedProject = {
        ...newerProject,
        name: 'Renamed Local Name',
        updatedAt: '2026-06-16T02:00:00.000Z',
      };

      const first = await syncProjectToCloudFolder({
        project: newerProject,
        syncDirectory: tempRoot,
        exportedAt: '2026-06-16T03:05:00.000Z',
      });
      const conflict = await syncProjectToCloudFolder({
        project: olderRenamedProject,
        syncDirectory: tempRoot,
        exportedAt: '2026-06-16T03:10:00.000Z',
      });
      const syncRootFiles = await readdir(tempRoot);

      expect(first.status).toBe('synced');
      expect(conflict.status).toBe('conflict');
      expect(conflict.previousProjectUpdatedAt).toBe(newerProject.updatedAt);
      expect(conflict.copiedMedia).toEqual([]);
      expect(conflict.warnings[0]).toContain('newer project snapshot');
      expect(syncRootFiles.some((filename) => filename.includes('Renamed-Local-Name'))).toBe(false);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('keeps renamed-project conflict protection when the sync index has legacy entries', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-cloud-sync-legacy-index-conflict-'));

    try {
      const newerProject = {
        ...createDefaultEditorProject(),
        id: 'project-cloud-legacy-index-conflict',
        name: 'Original Indexed Name',
        updatedAt: '2026-06-16T03:00:00.000Z',
      };
      const olderRenamedProject = {
        ...newerProject,
        name: 'Renamed Local Legacy Index',
        updatedAt: '2026-06-16T02:00:00.000Z',
      };

      const first = await syncProjectToCloudFolder({
        project: newerProject,
        syncDirectory: tempRoot,
        exportedAt: '2026-06-16T03:05:00.000Z',
      });
      const indexPath = join(tempRoot, 'danbi-cloud-sync-index.json');
      const legacyIndex = JSON.parse(await readFile(indexPath, 'utf8')) as {
        projects?: Array<Record<string, unknown>>;
      };
      if (legacyIndex.projects?.[0]) {
        delete legacyIndex.projects[0].projectName;
        delete legacyIndex.projects[0].projectUpdatedAt;
        delete legacyIndex.projects[0].exportedAt;
        delete legacyIndex.projects[0].packageFileName;
        delete legacyIndex.projects[0].warningCount;
      }
      await writeFile(indexPath, `${JSON.stringify(legacyIndex, null, 2)}\n`, 'utf8');

      const conflict = await syncProjectToCloudFolder({
        project: olderRenamedProject,
        syncDirectory: tempRoot,
        exportedAt: '2026-06-16T03:10:00.000Z',
      });
      const syncRootFiles = await readdir(tempRoot);

      expect(first.status).toBe('synced');
      expect(conflict.status).toBe('conflict');
      expect(conflict.previousProjectUpdatedAt).toBe(newerProject.updatedAt);
      expect(conflict.copiedMedia).toEqual([]);
      expect(syncRootFiles.some((filename) => filename.includes('Renamed-Local-Legacy-Index'))).toBe(false);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('ignores indexed same-project manifests outside the sync root', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-cloud-sync-outside-index-'));
    const outsideRoot = await mkdtemp(join(tmpdir(), 'danbi-cloud-sync-outside-target-'));

    try {
      const project = {
        ...createDefaultEditorProject(),
        id: 'project-cloud-outside-index',
        name: 'Outside Index Project',
        updatedAt: '2026-06-16T02:00:00.000Z',
      };
      const outsideManifestDirectory = join(outsideRoot, 'Outside-Indexed-Project');
      await mkdir(outsideManifestDirectory, { recursive: true });
      await writeFile(join(outsideManifestDirectory, 'danbi-cloud-sync.json'), `${JSON.stringify({
        kind: 'danbi.cloud-sync.manifest',
        version: 1,
        projectId: project.id,
        projectName: project.name,
        projectUpdatedAt: '2026-06-16T03:00:00.000Z',
        exportedAt: '2026-06-16T03:05:00.000Z',
        packageFileName: 'project.danbi-project.json',
        mediaEntryCount: 0,
        copiedMediaCount: 0,
        warningCount: 0,
      }, null, 2)}\n`, 'utf8');
      await writeFile(join(tempRoot, 'danbi-cloud-sync-index.json'), `${JSON.stringify({
        kind: 'danbi.cloud-sync.index',
        version: 1,
        updatedAt: '2026-06-16T03:05:00.000Z',
        projects: [
          {
            projectId: project.id,
            projectName: project.name,
            projectUpdatedAt: '2026-06-16T03:00:00.000Z',
            exportedAt: '2026-06-16T03:05:00.000Z',
            relativeProjectDirectory: relative(tempRoot, outsideManifestDirectory).replace(/\\/g, '/'),
            packageFileName: 'project.danbi-project.json',
            warningCount: 0,
          },
          {
            projectId: 'unrelated-outside-project',
            projectName: 'Unrelated Outside Project',
            projectUpdatedAt: '2026-06-16T03:00:00.000Z',
            exportedAt: '2026-06-16T03:05:00.000Z',
            relativeProjectDirectory: relative(tempRoot, outsideRoot).replace(/\\/g, '/'),
            packageFileName: 'project.danbi-project.json',
            warningCount: 0,
          },
        ],
      }, null, 2)}\n`, 'utf8');

      const result = await syncProjectToCloudFolder({
        project,
        syncDirectory: tempRoot,
        exportedAt: '2026-06-16T02:05:00.000Z',
      });
      const rewrittenIndex = JSON.parse(await readFile(join(tempRoot, 'danbi-cloud-sync-index.json'), 'utf8')) as {
        projects?: Array<{ projectId?: string; relativeProjectDirectory?: string }>;
      };

      expect(result.status).toBe('synced');
      expect(result.previousProjectUpdatedAt).toBeUndefined();
      expect(result.projectSyncDirectory).toContain('Outside-Index-Project');
      expect(rewrittenIndex.projects?.some((entry) => entry.projectId === 'unrelated-outside-project')).toBe(false);
      expect(rewrittenIndex.projects?.every((entry) => !entry.relativeProjectDirectory?.startsWith('..'))).toBe(true);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
      await rm(outsideRoot, { recursive: true, force: true });
    }
  });

  it('normalizes preserved cloud sync index project directories to relative paths', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-cloud-sync-index-normalize-'));

    try {
      const preservedDirectory = join(tempRoot, 'Existing Project');
      await mkdir(preservedDirectory, { recursive: true });
      await writeFile(join(tempRoot, 'danbi-cloud-sync-index.json'), `${JSON.stringify({
        kind: 'danbi.cloud-sync.index',
        version: 1,
        updatedAt: '2026-06-16T01:00:00.000Z',
        projects: [
          {
            projectId: 'existing-project',
            projectName: 'Existing Project',
            projectUpdatedAt: '2026-06-16T01:00:00.000Z',
            exportedAt: '2026-06-16T01:05:00.000Z',
            relativeProjectDirectory: preservedDirectory,
            packageFileName: 'project.danbi-project.json',
            warningCount: 0,
          },
        ],
      }, null, 2)}\n`, 'utf8');

      const project = {
        ...createDefaultEditorProject(),
        id: 'project-cloud-index-normalize',
        name: 'Index Normalize Project',
        updatedAt: '2026-06-16T02:00:00.000Z',
      };

      await syncProjectToCloudFolder({
        project,
        syncDirectory: tempRoot,
        exportedAt: '2026-06-16T02:05:00.000Z',
      });

      const rewrittenIndex = JSON.parse(await readFile(join(tempRoot, 'danbi-cloud-sync-index.json'), 'utf8')) as {
        projects?: Array<{ projectId?: string; relativeProjectDirectory?: string }>;
      };
      expect(rewrittenIndex.projects).toEqual(expect.arrayContaining([
        expect.objectContaining({
          projectId: 'existing-project',
          relativeProjectDirectory: 'Existing Project',
        }),
      ]));
      expect(rewrittenIndex.projects?.every((entry) => !entry.relativeProjectDirectory?.includes('\\'))).toBe(true);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('uses the newest same-project manifest when current and indexed sync folders differ', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-cloud-sync-newest-conflict-'));

    try {
      const olderCurrentNameProject = {
        ...createDefaultEditorProject(),
        id: 'project-cloud-newest-conflict',
        name: 'Current Cloud Name',
        updatedAt: '2026-06-16T02:00:00.000Z',
      };
      const newerIndexedNameProject = {
        ...olderCurrentNameProject,
        name: 'Indexed Newer Name',
        updatedAt: '2026-06-16T03:00:00.000Z',
      };
      const staleCurrentNameProject = {
        ...olderCurrentNameProject,
        updatedAt: '2026-06-16T02:30:00.000Z',
      };

      const first = await syncProjectToCloudFolder({
        project: olderCurrentNameProject,
        syncDirectory: tempRoot,
        exportedAt: '2026-06-16T02:05:00.000Z',
      });
      const renamed = await syncProjectToCloudFolder({
        project: newerIndexedNameProject,
        syncDirectory: tempRoot,
        exportedAt: '2026-06-16T03:05:00.000Z',
      });
      const conflict = await syncProjectToCloudFolder({
        project: staleCurrentNameProject,
        syncDirectory: tempRoot,
        exportedAt: '2026-06-16T02:35:00.000Z',
      });

      expect(first.status).toBe('synced');
      expect(renamed.status).toBe('synced');
      expect(conflict.status).toBe('conflict');
      expect(conflict.previousProjectUpdatedAt).toBe(newerIndexedNameProject.updatedAt);
      expect(conflict.copiedMedia).toEqual([]);
      expect(conflict.warnings[0]).toContain('newer project snapshot');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
