import { describe, expect, it } from 'vitest';

import { createDefaultEditorProject } from '../../src/lib/editor/project';
import { fetchSttJob, queueSttCaptionJob } from '../../src/electron/renderer/stt-client';
import type { SttJobView } from '../../src/electron/renderer/editor-view-model';

describe('renderer STT client', () => {
  it('uses bounded HTTP requests for STT queue polling and submission', async () => {
    const job: SttJobView = {
      id: 'stt-http',
      status: 'queued',
      progress: 0,
      priority: 5,
      execute: false,
      engine: 'local',
      language: 'auto',
      totalClips: 1,
      completedClips: 0,
      failedClips: 0,
      captions: [],
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
      await expect(fetchSttJob('stt-http')).resolves.toEqual(job);
      await expect(queueSttCaptionJob({
        project: createDefaultEditorProject(),
        selectedClipIds: ['clip-ai-city'],
        priority: 5,
        execute: false,
      })).resolves.toEqual(job);

      expect(calls.map((call) => call.input)).toEqual([
        '/api/editor/stt-jobs/stt-http',
        '/api/editor/stt-jobs',
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

  it('aborts STT queue polling with caller signals', async () => {
    const previousFetch = globalThis.fetch;
    const controller = new AbortController();
    const calls: Array<{ input: string; init?: RequestInit }> = [];

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        calls.push({ input: String(input), init });
        init?.signal?.addEventListener('abort', () => {
          reject(new Error('STT polling aborted'));
        }, { once: true });
      }),
    });

    try {
      const request = expect(fetchSttJob('stt-http', {
        signal: controller.signal,
      })).rejects.toThrow('STT polling aborted');

      controller.abort();
      await request;

      expect(calls).toHaveLength(1);
      expect(calls[0].input).toBe('/api/editor/stt-jobs/stt-http');
      expect(calls[0].init?.signal?.aborted).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: previousFetch,
      });
    }
  });
});
