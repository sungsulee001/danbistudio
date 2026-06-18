import { afterEach, describe, expect, it, vi } from 'vitest';

import { probeRendererReadiness } from '../../scripts/dev-electron.mjs';

describe('Electron dev launcher helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses a bounded GET request for the Next renderer readiness probe', async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      return new Response('', { status: 200 });
    });

    await expect(probeRendererReadiness('http://127.0.0.1:3000/editor', 1000, fetchImpl)).resolves.toBe(true);

    expect(calls).toHaveLength(1);
    expect(calls[0].input).toBe('http://127.0.0.1:3000/editor');
    expect(calls[0].init?.method).toBe('GET');
    expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns false when the Next renderer readiness probe times out', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      })
    ));

    const probe = probeRendererReadiness('http://127.0.0.1:3000/editor', 25, fetchImpl);
    await vi.advanceTimersByTimeAsync(25);

    await expect(probe).resolves.toBe(false);
  });
});
