import { describe, expect, it } from 'vitest';

import { createDefaultEditorProject } from '../../src/lib/editor/project';
import { fetchComfyUIQueueJob, queueComfyUIBatchJob } from '../../src/electron/renderer/comfyui-client';
import type { ComfyUIQueueJobView } from '../../src/electron/renderer/editor-view-model';

describe('renderer ComfyUI client', () => {
  it('uses bounded HTTP requests for ComfyUI queue polling and submission', async () => {
    const job: ComfyUIQueueJobView = {
      id: 'comfyui-http',
      status: 'queued',
      progress: 0,
      priority: 5,
      modelName: 'local-comfyui',
      execute: false,
      totalJobs: 1,
      completedJobs: 0,
      failedJobs: 0,
      results: [],
      warnings: [],
    };
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const previousFetch = globalThis.fetch;

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ input: String(input), init });
        return new Response(JSON.stringify({ job }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    try {
      await expect(fetchComfyUIQueueJob('comfyui-http')).resolves.toEqual(job);
      await expect(queueComfyUIBatchJob({
        project: createDefaultEditorProject(),
        selectedClipIds: ['clip-ai-city'],
        priority: 5,
        execute: false,
      })).resolves.toEqual(job);

      expect(calls.map((call) => call.input)).toEqual([
        '/api/editor/comfyui-jobs/comfyui-http',
        '/api/editor/comfyui-jobs',
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

  it('aborts ComfyUI queue polling with caller signals', async () => {
    const previousFetch = globalThis.fetch;
    const controller = new AbortController();
    const calls: Array<{ input: string; init?: RequestInit }> = [];

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        calls.push({ input: String(input), init });
        init?.signal?.addEventListener('abort', () => {
          reject(new Error('ComfyUI polling aborted'));
        }, { once: true });
      }),
    });

    try {
      const request = expect(fetchComfyUIQueueJob('comfyui-http', {
        signal: controller.signal,
      })).rejects.toThrow('ComfyUI polling aborted');

      controller.abort();
      await request;

      expect(calls).toHaveLength(1);
      expect(calls[0].input).toBe('/api/editor/comfyui-jobs/comfyui-http');
      expect(calls[0].init?.signal?.aborted).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: previousFetch,
      });
    }
  });
});
