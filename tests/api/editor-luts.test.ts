import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../src/app/api/editor/luts/route';

function createUploadRequest(file?: File): Request {
  const formData = new FormData();
  if (file) {
    formData.append('file', file);
  }

  return new Request('http://localhost/api/editor/luts', {
    method: 'POST',
    body: formData,
  });
}

describe('POST /api/editor/luts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores LUT uploads with Windows-safe filenames while preserving supported extensions', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1800000000000);
    await rm(join(process.cwd(), 'public', 'luts', '1800000000000-cube.cube'), { force: true });

    const response = await POST(createUploadRequest(
      new File(['TITLE test\nLUT_3D_SIZE 2\n'], '...cube', { type: 'application/octet-stream' }),
    ) as never);
    const data = await response.json();

    try {
      expect(response.status).toBe(200);
      expect(data.lut).toMatchObject({
        originalName: '...cube',
        name: '1800000000000-cube.cube',
        source: '/luts/1800000000000-cube.cube',
      });
    } finally {
      await rm(join(process.cwd(), 'public', 'luts', '1800000000000-cube.cube'), { force: true });
    }
  });

  it('keeps duplicate LUT uploads instead of overwriting the first LUT file', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1800000000000);
    const firstPath = join(process.cwd(), 'public', 'luts', '1800000000000-look.cube');
    const secondPath = join(process.cwd(), 'public', 'luts', '1800000000000-look-1.cube');
    await rm(firstPath, { force: true });
    await rm(secondPath, { force: true });

    const firstResponse = await POST(createUploadRequest(
      new File(['first lut'], 'look.cube', { type: 'application/octet-stream' }),
    ) as never);
    const secondResponse = await POST(createUploadRequest(
      new File(['second lut'], 'look.cube', { type: 'application/octet-stream' }),
    ) as never);
    const firstData = await firstResponse.json();
    const secondData = await secondResponse.json();

    try {
      expect(firstResponse.status).toBe(200);
      expect(secondResponse.status).toBe(200);
      expect(firstData.lut).toMatchObject({
        name: '1800000000000-look.cube',
        source: '/luts/1800000000000-look.cube',
      });
      expect(secondData.lut).toMatchObject({
        name: '1800000000000-look-1.cube',
        source: '/luts/1800000000000-look-1.cube',
      });
      await expect(readFile(firstPath, 'utf8')).resolves.toBe('first lut');
      await expect(readFile(secondPath, 'utf8')).resolves.toBe('second lut');
    } finally {
      await rm(firstPath, { force: true });
      await rm(secondPath, { force: true });
    }
  });

  it('rejects unsupported LUT uploads before writing files', async () => {
    const response = await POST(createUploadRequest(
      new File(['bad'], 'look.txt', { type: 'text/plain' }),
    ) as never);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Unsupported LUT format. Use .cube, .3dl, .dat, .m3d, or .csp.');
  });
});
