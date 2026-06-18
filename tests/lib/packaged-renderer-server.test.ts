import { afterEach, describe, expect, it, vi } from 'vitest';

import { probePackagedRendererReadiness } from '../../src/electron/main/packaged-renderer-server';

describe('packaged renderer server readiness probe', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it('uses a bounded GET request for renderer readiness', async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      return new Response('', { status: 200 });
    });

    await expect(probePackagedRendererReadiness('http://127.0.0.1:31890/editor', 1000)).resolves.toBe(true);

    expect(calls).toHaveLength(1);
    expect(calls[0].input).toBe('http://127.0.0.1:31890/editor');
    expect(calls[0].init?.method).toBe('GET');
    expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns false when a renderer readiness probe times out', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      })
    ));

    const probe = probePackagedRendererReadiness('http://127.0.0.1:31890/editor', 25);
    await vi.advanceTimersByTimeAsync(25);

    await expect(probe).resolves.toBe(false);
  });

  it('returns false when the renderer responds before it is ready', async () => {
    globalThis.fetch = vi.fn(async () => new Response('', { status: 503 }));

    await expect(probePackagedRendererReadiness('http://127.0.0.1:31890/editor', 1000)).resolves.toBe(false);
  });
});
