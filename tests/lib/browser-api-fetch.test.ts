import { afterEach, describe, expect, it, vi } from 'vitest';

import { browserApiFetch } from '../../src/lib/browser-api-fetch';

describe('browser API fetch', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it('passes an AbortSignal for bounded browser API requests and strips timeoutMs', async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      return new Response('{}', { status: 200 });
    });

    await expect(browserApiFetch('/api/workflows', {
      cache: 'no-store',
      timeoutMs: 1000,
    })).resolves.toBeInstanceOf(Response);

    expect(calls).toHaveLength(1);
    expect(calls[0].input).toBe('/api/workflows');
    expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);
    expect('timeoutMs' in (calls[0].init as Record<string, unknown>)).toBe(false);
  });

  it('aborts slow browser API requests after the timeout', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      })
    ));

    const request = expect(browserApiFetch('/api/status/job-1', { timeoutMs: 25 }))
      .rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(25);

    await request;
  });

  it('aborts bounded browser API requests when the parent signal is aborted', async () => {
    const controller = new AbortController();
    const abortSignals: AbortSignal[] = [];
    globalThis.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal) {
        abortSignals.push(init.signal);
      }

      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      });
    });

    const request = expect(browserApiFetch('/api/library', {
        signal: controller.signal,
        timeoutMs: 1000,
      }))
      .rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();

    await request;
    expect(abortSignals).toHaveLength(1);
    expect(abortSignals[0].aborted).toBe(true);
  });
});
