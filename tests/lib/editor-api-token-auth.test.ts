import { describe, expect, it } from 'vitest';

import {
  authorizeEditorApiRequest,
  DANBI_EDITOR_API_TOKEN_ENV,
  readConfiguredEditorApiToken,
  readEditorApiTokenCandidates,
} from '../../src/server/editor/editor-api-token-auth';
import { buildEditorApiRequestInit, editorApiFetch } from '../../src/electron/renderer/editor-api-client';

describe('editor API token auth', () => {
  it('allows editor API requests when no token is configured', () => {
    expect(
      authorizeEditorApiRequest(
        {
          pathname: '/api/editor/projects',
        },
        undefined,
      ),
    ).toEqual({ allowed: true, required: false, reason: 'not-configured' });
  });

  it('ignores empty configured tokens', () => {
    expect(readConfiguredEditorApiToken({ [DANBI_EDITOR_API_TOKEN_ENV]: '   ' })).toBeUndefined();
  });

  it('accepts a bearer token for external automation clients', () => {
    expect(
      authorizeEditorApiRequest(
        {
          pathname: '/api/editor/render-plan',
          authorization: 'Bearer local-dev-token',
        },
        'local-dev-token',
      ),
    ).toEqual({ allowed: true, required: true, reason: 'valid-token' });
  });

  it('accepts the editor API token header for clients that cannot set Authorization', () => {
    expect(
      authorizeEditorApiRequest(
        {
          pathname: '/api/editor/hooks',
          editorApiTokenHeader: 'local-dev-token',
        },
        'local-dev-token',
      ),
    ).toEqual({ allowed: true, required: true, reason: 'valid-token' });
  });

  it('also accepts the generic Danbi API token header', () => {
    expect(
      authorizeEditorApiRequest(
        {
          pathname: '/api/editor/media-cache',
          genericApiTokenHeader: 'local-dev-token',
        },
        'local-dev-token',
      ),
    ).toEqual({ allowed: true, required: true, reason: 'valid-token' });
  });

  it('rejects external editor API requests with no matching token', () => {
    expect(
      authorizeEditorApiRequest(
        {
          pathname: '/api/editor/render-jobs',
          authorization: 'Bearer wrong',
        },
        'local-dev-token',
      ),
    ).toEqual({ allowed: false, required: true, reason: 'missing-or-invalid-token' });
  });

  it('does not apply the editor token policy outside the editor API namespace', () => {
    expect(
      authorizeEditorApiRequest(
        {
          pathname: '/api/generate',
        },
        'local-dev-token',
      ),
    ).toEqual({ allowed: true, required: false, reason: 'out-of-scope' });
  });

  it('normalizes bearer and header token candidates', () => {
    expect(
      readEditorApiTokenCandidates({
        pathname: '/api/editor/projects',
        authorization: 'Bearer  first-token  ',
        editorApiTokenHeader: ' second-token ',
      }),
    ).toEqual(['first-token', 'second-token']);
  });

  it('adds the stored editor API token to renderer API requests without replacing explicit auth headers', () => {
    const withToken = buildEditorApiRequestInit({
      headers: { 'Content-Type': 'application/json' },
    }, 'local-dev-token');
    const headers = new Headers(withToken.headers);

    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Authorization')).toBe('Bearer local-dev-token');

    const withExplicitHeader = buildEditorApiRequestInit({
      headers: { Authorization: 'Bearer explicit-token' },
    }, 'local-dev-token');

    expect(new Headers(withExplicitHeader.headers).get('Authorization')).toBe('Bearer explicit-token');
  });

  it('aborts renderer editor API fetches after the configured timeout', async () => {
    const previousFetch = globalThis.fetch;
    const abortSignals: AbortSignal[] = [];

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (_input: RequestInfo | URL, init?: RequestInit) => new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          abortSignals.push(signal);
          signal.addEventListener('abort', () => reject(new Error('editor API request aborted')), { once: true });
        }
      }),
    });

    try {
      await expect(editorApiFetch('/api/editor/render-jobs', {
        timeoutMs: 1,
      })).rejects.toThrow('editor API request aborted');
      expect(abortSignals).toHaveLength(1);
      expect(abortSignals[0].aborted).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: previousFetch,
      });
    }
  });
});
