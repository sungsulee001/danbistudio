import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../../src/app/api/editor/sample/route';

const mocks = vi.hoisted(() => ({
  getSampleProjectPackageMetadata: vi.fn(),
  readSampleProjectPackage: vi.fn(),
}));

vi.mock('@/server/editor/sample-project-package', () => ({
  getSampleProjectPackageMetadata: mocks.getSampleProjectPackageMetadata,
  readSampleProjectPackage: mocks.readSampleProjectPackage,
}));

function createGetRequest(url = 'http://localhost/api/editor/sample'): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

describe('GET /api/editor/sample', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSampleProjectPackageMetadata.mockReturnValue({
      available: true,
      packageDirectory: 'E:/sample',
      projectFilePath: 'E:/sample/project.danbi-project.json',
      candidates: ['E:/sample'],
    });
    mocks.readSampleProjectPackage.mockResolvedValue({
      project: {
        id: 'sample',
        name: 'Sample',
        tracks: [],
      },
      warnings: [],
      packageDirectory: 'E:/sample',
      projectFilePath: 'E:/sample/project.danbi-project.json',
    });
  });

  it('returns sample package metadata without reading the package body', async () => {
    const response = await GET(createGetRequest('http://localhost/api/editor/sample?metadata=1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.readSampleProjectPackage).not.toHaveBeenCalled();
    expect(data).toMatchObject({
      available: true,
      packageDirectory: 'E:/sample',
      projectFilePath: 'E:/sample/project.danbi-project.json',
    });
  });

  it('returns the imported sample project package', async () => {
    const response = await GET(createGetRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      available: true,
      project: {
        id: 'sample',
        name: 'Sample',
      },
      packageDirectory: 'E:/sample',
    });
  });

  it('returns 404 when no sample package is available', async () => {
    mocks.getSampleProjectPackageMetadata.mockReturnValueOnce({
      available: false,
      candidates: ['E:/missing'],
    });
    mocks.readSampleProjectPackage.mockResolvedValueOnce(null);

    const response = await GET(createGetRequest());
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toMatchObject({
      available: false,
      candidates: ['E:/missing'],
    });
  });
});
