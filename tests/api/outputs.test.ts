import { mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../../src/app/outputs/[...path]/route';

describe('GET /outputs/[...path]', () => {
  let rootDir: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;
  let previousLocalDataRoot: string | undefined;
  let previousElectronUserData: string | undefined;

  beforeEach(async () => {
    previousLocalDataRoot = process.env.DANBI_LOCAL_DATA_ROOT;
    previousElectronUserData = process.env.DANBI_ELECTRON_USER_DATA;
    rootDir = join(tmpdir(), `danbi-outputs-route-${Date.now()}-${Math.random().toString(16).slice(2)}`);
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

  it('serves durable output files with video headers', async () => {
    await writeFixture('.danbi/outputs/renders/result.mp4', new Uint8Array([1, 2, 3, 4]));

    const response = await GET(createRequest('/outputs/renders/result.mp4'), createContext(['renders', 'result.mp4']));
    const body = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(Array.from(body)).toEqual([1, 2, 3, 4]);
  });

  it('supports range requests for playback seeking', async () => {
    await writeFixture('.danbi/outputs/result.mp4', new Uint8Array([10, 20, 30, 40, 50]));

    const response = await GET(
      createRequest('/outputs/result.mp4', { range: 'bytes=1-3' }),
      createContext(['result.mp4']),
    );
    const body = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 1-3/5');
    expect(Array.from(body)).toEqual([20, 30, 40]);
  });

  it('falls back to legacy public outputs without exposing traversal paths', async () => {
    await writeFixture('public/outputs/legacy.mp4', new Uint8Array([7, 8]));

    const legacyResponse = await GET(createRequest('/outputs/legacy.mp4'), createContext(['legacy.mp4']));
    expect(legacyResponse.status).toBe(200);

    const unsafeResponse = await GET(createRequest('/outputs/../secret.mp4'), createContext(['..', 'secret.mp4']));
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
