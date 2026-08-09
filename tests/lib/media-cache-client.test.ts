import { describe, expect, it, vi } from 'vitest';

import { fetchMediaCacheJob, queueMediaCacheJob } from '../../src/electron/renderer/media-cache-client';
import type { MediaCacheJobView } from '../../src/electron/renderer/editor-view-model';
import type { EditorAsset } from '../../src/lib/editor/types';

describe('renderer media cache client', () => {
  it('uses bounded HTTP requests for media cache polling and submission', async () => {
    const job: MediaCacheJobView = {
      id: 'cache-http',
      status: 'queued',
      progress: 0,
      priority: 5,
      warnings: [],
    };
    const asset: EditorAsset = {
      id: 'asset-cache-http',
      name: 'Interview.wav',
      kind: 'audio',
      source: '/imports/interview.wav',
      renderPath: 'E:/media/interview.wav',
      duration: 12,
      metadata: {
        mimeType: 'audio/wav',
      },
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
      await expect(fetchMediaCacheJob('cache-http')).resolves.toEqual(job);
      await expect(queueMediaCacheJob(asset, 5)).resolves.toEqual(job);

      expect(calls.map((call) => call.input)).toEqual([
        '/api/editor/media-cache/cache-http',
        '/api/editor/media-cache',
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

  it('aborts media cache polling with caller signals', async () => {
    const previousFetch = globalThis.fetch;
    const controller = new AbortController();
    const calls: Array<{ input: string; init?: RequestInit }> = [];

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        calls.push({ input: String(input), init });
        init?.signal?.addEventListener('abort', () => {
          reject(new Error('media cache polling aborted'));
        }, { once: true });
      }),
    });

    try {
      const request = expect(fetchMediaCacheJob('cache-http', {
        signal: controller.signal,
      })).rejects.toThrow('media cache polling aborted');

      controller.abort();
      await request;

      expect(calls).toHaveLength(1);
      expect(calls[0].input).toBe('/api/editor/media-cache/cache-http');
      expect(calls[0].init?.signal?.aborted).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: previousFetch,
      });
    }
  });

  it('rejects unsupported media cache assets before submitting HTTP requests', async () => {
    const previousFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    });

    const asset: EditorAsset = {
      id: 'asset-spoofed-cache',
      name: 'spoofed.png',
      kind: 'ai',
      source: '/imports/spoofed.png',
      renderPath: 'E:/media/spoofed.png',
      duration: 1,
      metadata: {
        mimeType: 'image/svg+xml',
        hasVideo: true,
      },
    };

    try {
      await expect(queueMediaCacheJob(asset, 5)).rejects.toThrow('Unsupported media cache file: spoofed.png.');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: previousFetch,
      });
    }
  });

  it('uses renderPath extension fallback when asset names are extensionless labels', async () => {
    const job: MediaCacheJobView = {
      id: 'cache-extensionless-label',
      status: 'queued',
      progress: 0,
      priority: 5,
      warnings: [],
    };
    const asset: EditorAsset = {
      id: 'asset-extensionless-label',
      name: 'Interview select',
      kind: 'video',
      source: '/imports/interview-select',
      renderPath: 'E:/media/interview-select.mov',
      duration: 12,
      metadata: {
        mimeType: 'application/octet-stream',
      },
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
      await expect(queueMediaCacheJob(asset, 5)).resolves.toEqual(job);
      expect(calls).toHaveLength(1);
      expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({
        filePath: 'E:/media/interview-select.mov',
        originalName: 'Interview select',
        mimeType: 'application/octet-stream',
      });
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: previousFetch,
      });
    }
  });
});
