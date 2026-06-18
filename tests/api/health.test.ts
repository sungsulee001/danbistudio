import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../../src/app/api/health/route';

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  defaultIsHealthy: vi.fn(),
  customIsHealthy: vi.fn(),
  ComfyUIClient: vi.fn(),
  validateComfyUIBaseUrl: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
  },
}));

vi.mock('@/lib/comfyui-client', () => ({
  comfyuiClient: {
    isHealthy: mocks.defaultIsHealthy,
  },
  readComfyUIClientConfig: () => ({
    baseUrl: 'http://localhost:8188',
    allowedUrls: ['https://remote.example'],
    allowLocalhost: true,
  }),
  ComfyUIClient: mocks.ComfyUIClient,
  validateComfyUIBaseUrl: mocks.validateComfyUIBaseUrl,
}));

function createGetRequest(url = 'http://localhost/api/health'): NextRequest {
  return new NextRequest(url, {
    method: 'GET',
  });
}

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryRaw.mockResolvedValue([{ ok: 1 }]);
    mocks.defaultIsHealthy.mockResolvedValue(true);
    mocks.customIsHealthy.mockResolvedValue(true);
    mocks.validateComfyUIBaseUrl.mockImplementation((
      baseUrl: string,
      options: { allowedUrls?: string[]; allowLocalhost?: boolean },
    ) => {
      const trimmed = baseUrl.trim();
      if (!trimmed) {
        return { ok: false, reason: 'ComfyUI server URL is missing.' };
      }

      let url: URL;
      try {
        url = new URL(trimmed);
      } catch {
        return { ok: false, reason: `ComfyUI server URL is invalid: ${baseUrl}` };
      }

      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { ok: false, reason: `ComfyUI server protocol must be http or https: ${url.protocol}` };
      }

      if ((options.allowLocalhost ?? true) && ['localhost', '127.0.0.1'].includes(url.hostname)) {
        return { ok: true, url: new URL(`${url.protocol}//${url.host}/`) };
      }

      if ((options.allowedUrls ?? []).some((entry) => new URL(entry).origin === url.origin)) {
        return { ok: true, url: new URL(`${url.protocol}//${url.host}/`) };
      }

      return {
        ok: false,
        reason: 'ComfyUI target is not allowed. Use localhost/127.0.0.1, or add the server to COMFYUI_ALLOWED_URLS for explicit remote execution.',
      };
    });
    mocks.ComfyUIClient.mockImplementation(function MockComfyUIClient(
      this: { config?: unknown; isHealthy?: typeof mocks.customIsHealthy },
      config: unknown,
    ) {
      this.config = config;
      this.isHealthy = mocks.customIsHealthy;
    });
  });

  it('checks the default ComfyUI client when no URL override is provided', async () => {
    const response = await GET(createGetRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.defaultIsHealthy).toHaveBeenCalledTimes(1);
    expect(mocks.ComfyUIClient).not.toHaveBeenCalled();
    expect(data).toMatchObject({
      status: 'healthy',
      services: {
        database: true,
        comfyui: true,
      },
      config: {
        comfyuiUrl: 'http://localhost:8188',
        customComfyuiUrl: false,
      },
    });
  });

  it('checks a requested ComfyUI URL with the same safety config', async () => {
    const response = await GET(createGetRequest('http://localhost/api/health?comfyuiUrl=http%3A%2F%2F127.0.0.1%3A8189'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.defaultIsHealthy).not.toHaveBeenCalled();
    expect(mocks.validateComfyUIBaseUrl).toHaveBeenCalledWith('http://127.0.0.1:8189', {
      allowedUrls: ['https://remote.example'],
      allowLocalhost: true,
    });
    expect(mocks.ComfyUIClient).toHaveBeenCalledWith({
      baseUrl: 'http://127.0.0.1:8189/',
      allowedUrls: ['https://remote.example'],
      allowLocalhost: true,
    });
    expect(mocks.customIsHealthy).toHaveBeenCalledTimes(1);
    expect(data).toMatchObject({
      status: 'healthy',
      services: {
        database: true,
        comfyui: true,
      },
      config: {
        comfyuiUrl: 'http://127.0.0.1:8189/',
        customComfyuiUrl: true,
      },
    });
  });

  it('reports degraded status when the requested ComfyUI URL is offline', async () => {
    mocks.customIsHealthy.mockResolvedValueOnce(false);

    const response = await GET(createGetRequest('http://localhost/api/health?comfyuiUrl=http%3A%2F%2F127.0.0.1%3A8190'));
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data).toMatchObject({
      status: 'degraded',
      services: {
        database: true,
        comfyui: false,
      },
      config: {
        comfyuiUrl: 'http://127.0.0.1:8190/',
        customComfyuiUrl: true,
      },
    });
  });

  it('returns 400 for a requested ComfyUI URL blocked by the safety policy', async () => {
    const response = await GET(createGetRequest('http://localhost/api/health?comfyuiUrl=https%3A%2F%2Fblocked.example%3A8188'));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(mocks.defaultIsHealthy).not.toHaveBeenCalled();
    expect(mocks.customIsHealthy).not.toHaveBeenCalled();
    expect(mocks.ComfyUIClient).not.toHaveBeenCalled();
    expect(data).toMatchObject({
      status: 'degraded',
      services: {
        database: false,
        comfyui: false,
      },
      config: {
        comfyuiUrl: 'https://blocked.example:8188',
        customComfyuiUrl: true,
      },
      error: expect.stringContaining('ComfyUI target is not allowed'),
    });
  });
});
