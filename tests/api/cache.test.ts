import { mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../../src/app/cache/[...path]/route';

describe('GET /cache/[...path]', () => {
  let rootDir: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;
  let previousLocalDataRoot: string | undefined;
  let previousElectronUserData: string | undefined;

  beforeEach(async () => {
    previousLocalDataRoot = process.env.DANBI_LOCAL_DATA_ROOT;
    previousElectronUserData = process.env.DANBI_ELECTRON_USER_DATA;
    rootDir = join(tmpdir(), `danbi-cache-route-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    await mkdir(rootDir, { recursive: true });
    delete process.env.DANBI_LOCAL_DATA_ROOT;
    delete process.env.DANBI_ELECTRON_USER_DATA;
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(rootDir);
  });

  afterEach(async () => {
    cwdSpy.mockRestore();
    restoreEnvValue('DANBI_LOCAL_DATA_ROOT', previousLocalDataRoot);
    restoreEnvValue('DANBI_ELECTRON_USER_DATA', previousElectronUserData);
    await rm(rootDir, { recursive: true, force: true });
  });

  it('serves durable media cache files with cache-safe headers', async () => {
    await writeFixture('.danbi/cache/media/thumbnails/thumb.jpg', new Uint8Array([255, 216, 255]));

    const response = await GET(createRequest('/cache/media/thumbnails/thumb.jpg'), createContext(['media', 'thumbnails', 'thumb.jpg']));
    const body = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(Array.from(body)).toEqual([255, 216, 255]);
  });

  it('supports range requests for proxy media cache playback', async () => {
    await writeFixture('.danbi/cache/media/proxies/proxy.mp4', new Uint8Array([1, 2, 3, 4, 5]));

    const response = await GET(
      createRequest('/cache/media/proxies/proxy.mp4', { range: 'bytes=2-4' }),
      createContext(['media', 'proxies', 'proxy.mp4']),
    );
    const body = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 2-4/5');
    expect(Array.from(body)).toEqual([3, 4, 5]);
  });

  it('falls back to legacy public cache without exposing traversal paths', async () => {
    await writeFixture('public/cache/media/waveforms/legacy.json', new Uint8Array([123, 125]));

    const legacyResponse = await GET(createRequest('/cache/media/waveforms/legacy.json'), createContext(['media', 'waveforms', 'legacy.json']));
    expect(legacyResponse.status).toBe(200);

    const unsafeResponse = await GET(createRequest('/cache/../secret.json'), createContext(['..', 'secret.json']));
    const unsafeData = await unsafeResponse.json();
    expect(unsafeResponse.status).toBe(400);
    expect(unsafeData.error).toContain('unsafe');
  });

  async function writeFixture(relativePath: string, body: Uint8Array): Promise<void> {
    const filePath = join(rootDir, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, body);
  }
});

function createRequest(pathname: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest(`http://localhost${pathname}`, { headers });
}

function createContext(path: string[]): { params: Promise<{ path?: string[] }> } {
  return { params: Promise.resolve({ path }) };
}

function restoreEnvValue(name: 'DANBI_LOCAL_DATA_ROOT' | 'DANBI_ELECTRON_USER_DATA', value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
