import { describe, expect, it } from 'vitest';

import { createDefaultEditorProject } from '../../src/lib/editor/project';
import {
  deleteProjectFromDatabase,
  fetchAutosaveSummaries,
  fetchSampleProjectPackageMetadata,
  fetchSavedProjectSummaries,
  readCloudSyncProjectBestAvailable,
  saveProjectToDatabase,
  syncProjectToCloudFolderBestAvailable,
} from '../../src/electron/renderer/project-persistence-client';
import type { AutosaveSummary, SavedProjectSummary } from '../../src/electron/renderer/editor-view-model';

describe('renderer project persistence client', () => {
  it('uses bounded HTTP requests for project summaries, saves, and deletes', async () => {
    const project = createDefaultEditorProject();
    const savedProject: SavedProjectSummary = {
      id: project.id,
      name: project.name,
      duration: project.duration,
      clipCount: 3,
      updatedAt: project.updatedAt,
    };
    const autosave: AutosaveSummary = {
      id: 'autosave-http',
      projectId: project.id,
      name: project.name,
      duration: project.duration,
      clipCount: 3,
      savedAt: project.updatedAt,
      reason: 'autosave',
    };
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const previousFetch = globalThis.fetch;

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ input: String(input), init });
        const body = init?.method === 'DELETE'
          ? { deleted: true, id: project.id }
          : String(input).includes('/autosave')
          ? { autosaves: [autosave] }
          : init?.method === 'POST'
            ? { project }
            : { projects: [savedProject] };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    try {
      await expect(fetchSavedProjectSummaries()).resolves.toEqual([savedProject]);
      await expect(fetchAutosaveSummaries()).resolves.toEqual([autosave]);
      await expect(saveProjectToDatabase(project)).resolves.toEqual(project);
      await expect(deleteProjectFromDatabase(project.id)).resolves.toEqual({ deleted: true, id: project.id });

      expect(calls.map((call) => call.input)).toEqual([
        '/api/editor/projects',
        '/api/editor/autosave',
        '/api/editor/projects',
        '/api/editor/projects/danbi-demo-project',
      ]);
      expect(calls.every((call) => call.init?.signal instanceof AbortSignal)).toBe(true);
      expect(calls.some((call) => 'timeoutMs' in (call.init as Record<string, unknown>))).toBe(false);
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: previousFetch,
      });
    }
  });

  it('aborts project persistence status reads with caller signals', async () => {
    const previousFetch = globalThis.fetch;
    const calls: Array<{ input: string; init?: RequestInit }> = [];

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        calls.push({ input: String(input), init });
        init?.signal?.addEventListener('abort', () => {
          reject(new Error('project persistence read aborted'));
        }, { once: true });
      }),
    });

    try {
      const projectsController = new AbortController();
      const projects = expect(fetchSavedProjectSummaries({
        signal: projectsController.signal,
      })).rejects.toThrow('project persistence read aborted');
      projectsController.abort();
      await projects;

      const autosavesController = new AbortController();
      const autosaves = expect(fetchAutosaveSummaries({
        signal: autosavesController.signal,
      })).rejects.toThrow('project persistence read aborted');
      autosavesController.abort();
      await autosaves;

      const sampleController = new AbortController();
      const sample = expect(fetchSampleProjectPackageMetadata({
        signal: sampleController.signal,
      })).rejects.toThrow('project persistence read aborted');
      sampleController.abort();
      await sample;

      expect(calls.map((call) => call.input)).toEqual([
        '/api/editor/projects',
        '/api/editor/autosave',
        '/api/editor/sample?metadata=1',
      ]);
      expect(calls.every((call) => call.init?.signal?.aborted)).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: previousFetch,
      });
    }
  });

  it('passes force through cloud sync conflict retries', async () => {
    const project = createDefaultEditorProject();
    const calls: unknown[] = [];
    const previousWindow = globalThis.window;
    const response = {
      kind: 'danbi.cloud-sync.result',
      status: 'synced',
      syncDirectory: 'E:/sync',
      projectSyncDirectory: 'E:/sync/Danbi',
      packageDirectory: 'E:/sync/Danbi',
      projectFilePath: 'E:/sync/Danbi/project.danbi-project.json',
      manifestPath: 'E:/sync/Danbi/danbi-cloud-sync.json',
      exportedAt: '2026-06-18T00:00:00.000Z',
      projectId: project.id,
      projectName: project.name,
      projectUpdatedAt: project.updatedAt,
      copiedMedia: [{ assetId: 'asset-interview', role: 'render', status: 'copied' }],
      warnings: [],
    };

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        danbiEditor: {
          projects: {
            syncCloudFolder: async (request: unknown) => {
              calls.push(request);
              return response;
            },
            importCloudSyncProject: async (request: unknown) => {
              calls.push(request);
              return {
                ...response,
                project,
                packageVersion: 1,
                packageDirectory: response.projectSyncDirectory,
                projectSyncDirectory: response.projectSyncDirectory,
                warnings: [],
              };
            },
          },
        },
      },
    });

    try {
      await expect(syncProjectToCloudFolderBestAvailable(project, 'E:/sync')).resolves.toMatchObject({
        available: true,
        status: 'Project synced to E:/sync/Danbi with 1 media file',
      });
      await expect(syncProjectToCloudFolderBestAvailable(project, 'E:/sync', { force: true })).resolves.toMatchObject({
        available: true,
      });
      await expect(readCloudSyncProjectBestAvailable('E:/sync', project.id)).resolves.toMatchObject({
        project: { id: project.id },
        projectSyncDirectory: 'E:/sync/Danbi',
      });

      expect(calls).toEqual([
        { project, syncDirectory: 'E:/sync' },
        { project, syncDirectory: 'E:/sync', force: true },
        { syncDirectory: 'E:/sync', projectId: project.id },
      ]);
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: previousWindow,
      });
    }
  });
});
