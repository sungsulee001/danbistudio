import { describe, expect, it } from 'vitest';

import { applyQueueSettings, fetchFfmpegCapabilities, fetchQueueSettings } from '../../src/electron/renderer/editor-system-client';
import type { EditorQueueSettingsView } from '../../src/electron/renderer/editor-view-model';

describe('renderer editor system client', () => {
  it('uses bounded HTTP requests for queue settings reads and updates', async () => {
    const settings: EditorQueueSettingsView = {
      renderConcurrency: 1,
      mediaCacheConcurrency: 2,
      comfyuiConcurrency: 1,
      sttConcurrency: 1,
      defaultRenderPriority: 10,
      defaultMediaCachePriority: 5,
      defaultComfyUIPriority: 6,
      defaultSttPriority: 4,
    };
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const previousFetch = globalThis.fetch;

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ input: String(input), init });
        return new Response(JSON.stringify({ settings }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    try {
      await expect(fetchQueueSettings()).resolves.toEqual(settings);
      await expect(applyQueueSettings(settings)).resolves.toEqual(settings);

      expect(calls.map((call) => call.input)).toEqual([
        '/api/editor/queue-settings',
        '/api/editor/queue-settings',
      ]);
      expect(calls.map((call) => call.init?.method ?? 'GET')).toEqual(['GET', 'PUT']);
      expect(calls.every((call) => call.init?.signal instanceof AbortSignal)).toBe(true);
      expect(calls.some((call) => 'timeoutMs' in (call.init as Record<string, unknown>))).toBe(false);
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: previousFetch,
      });
    }
  });

  it('aborts editor system status reads with caller signals', async () => {
    const previousFetch = globalThis.fetch;
    const calls: Array<{ input: string; init?: RequestInit }> = [];

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        calls.push({ input: String(input), init });
        init?.signal?.addEventListener('abort', () => {
          reject(new Error('editor system read aborted'));
        }, { once: true });
      }),
    });

    try {
      const queueController = new AbortController();
      const queueRequest = expect(fetchQueueSettings({
        signal: queueController.signal,
      })).rejects.toThrow('editor system read aborted');
      queueController.abort();
      await queueRequest;

      const ffmpegController = new AbortController();
      const ffmpegRequest = expect(fetchFfmpegCapabilities({
        signal: ffmpegController.signal,
      })).rejects.toThrow('editor system read aborted');
      ffmpegController.abort();
      await ffmpegRequest;

      expect(calls.map((call) => call.input)).toEqual([
        '/api/editor/queue-settings',
        '/api/editor/ffmpeg-capabilities',
      ]);
      expect(calls.every((call) => call.init?.signal?.aborted)).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: previousFetch,
      });
    }
  });
});
