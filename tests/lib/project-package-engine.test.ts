import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  exportProjectPackageFolder,
  importProjectPackageFolder,
} from '../../src/electron/main/project-package-engine';
import { createDefaultEditorProject } from '../../src/lib/editor/project';

describe('project package engine', () => {
  it('writes project package JSON atomically without leaving temp files', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-project-package-'));

    try {
      const packageDirectory = join(tempRoot, 'package');
      const project = {
        ...createDefaultEditorProject(),
        id: 'project-package-atomic',
        name: 'Project Package Atomic',
      };

      const exported = await exportProjectPackageFolder({
        project,
        packageDirectory,
        exportedAt: '2026-06-18T00:00:00.000Z',
      });
      const packageFiles = await readdir(packageDirectory);
      const packageJson = JSON.parse(await readFile(exported.projectFilePath, 'utf8')) as {
        project?: { id?: string };
      };
      const imported = await importProjectPackageFolder({ packageDirectory });

      expect(packageJson.project?.id).toBe(project.id);
      expect(imported.project).toMatchObject({ id: project.id, name: project.name });
      expect(packageFiles.some((filename) => filename.endsWith('.tmp'))).toBe(false);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('marks bundled media missing during import when the package media file was removed', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-project-package-missing-media-'));

    try {
      const packageDirectory = join(tempRoot, 'package');
      const sourceDirectory = join(tempRoot, 'source');
      const sourcePath = join(sourceDirectory, 'camera.mp4');
      const project = {
        ...createDefaultEditorProject(),
        id: 'project-package-missing-media',
        name: 'Project Package Missing Media',
        assets: [
          {
            id: 'asset-camera',
            name: 'Camera',
            kind: 'video' as const,
            source: 'offline://package/camera',
            renderPath: sourcePath,
            duration: 5,
            width: 1920,
            height: 1080,
            fps: 30,
          },
        ],
        tracks: [],
        markers: [],
        captions: [],
      };

      await mkdir(sourceDirectory, { recursive: true });
      await writeFile(sourcePath, 'fake mp4 bytes');

      const exported = await exportProjectPackageFolder({
        project,
        packageDirectory,
        exportedAt: '2026-06-18T00:00:00.000Z',
      });
      const copiedRenderEntry = exported.mediaManifest?.entries.find((entry) => entry.assetId === 'asset-camera' && entry.role === 'render');
      expect(copiedRenderEntry).toMatchObject({
        status: 'bundle-ready',
        packagePath: 'media/asset-camera/render-camera.mp4',
      });

      await rm(join(packageDirectory, copiedRenderEntry!.packagePath), { force: true });

      const imported = await importProjectPackageFolder({ packageDirectory });
      expect(imported.mediaManifest).toMatchObject({
        bundleReadyCount: 0,
        missingCount: 1,
      });
      expect(imported.mediaManifest?.entries.find((entry) => entry.assetId === 'asset-camera' && entry.role === 'render')).toMatchObject({
        status: 'missing',
      });
      expect(imported.project.assets.find((asset) => asset.id === 'asset-camera')).toMatchObject({
        source: 'offline://package/camera',
        renderPath: sourcePath,
      });
      expect(imported.warnings).toEqual(expect.arrayContaining([
        'Camera required render media is missing after package import.',
      ]));
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('filters invalid media manifest entries during import verification instead of failing import', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-project-package-invalid-media-'));

    try {
      const packageDirectory = join(tempRoot, 'package');
      const project = {
        ...createDefaultEditorProject(),
        id: 'project-package-invalid-media',
        name: 'Project Package Invalid Media',
        assets: [],
        tracks: [],
        markers: [],
        captions: [],
      };

      const exported = await exportProjectPackageFolder({
        project,
        packageDirectory,
        exportedAt: '2026-06-18T00:00:00.000Z',
      });
      const packageJson = JSON.parse(await readFile(exported.projectFilePath, 'utf8')) as {
        mediaManifest?: { entries?: unknown[] };
      };
      packageJson.mediaManifest = {
        ...packageJson.mediaManifest,
        entries: [
          null,
          {
            assetId: 'asset-camera',
            assetName: 'Camera',
            role: 'render',
            status: 'bundle-ready',
            originalPath: 'E:/media/camera.mp4',
            packagePath: '../escape.mp4',
            requiredForRender: true,
          },
        ],
      };
      await writeFile(exported.projectFilePath, JSON.stringify(packageJson, null, 2), 'utf8');

      const imported = await importProjectPackageFolder({ packageDirectory });
      expect(imported.mediaManifest).toMatchObject({
        entries: [],
        bundleReadyCount: 0,
        missingCount: 0,
        copyFailedCount: 0,
      });
      expect(imported.warnings).toEqual(expect.arrayContaining([
        'Skipped invalid package media manifest entry: entry is not an object',
        'Skipped invalid package media manifest entry: Camera render has unsafe packagePath ../escape.mp4',
      ]));
      expect(imported.project).toMatchObject({ id: project.id, name: project.name });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
