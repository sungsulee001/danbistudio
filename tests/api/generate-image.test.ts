import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../src/app/api/generate/image/route';

const mocks = vi.hoisted(() => ({
  saveGenerateImageUpload: vi.fn(),
}));

vi.mock('@/server/generate-image-upload', () => ({
  saveGenerateImageUpload: mocks.saveGenerateImageUpload,
}));

function createFormRequest(formData: FormData): Request {
  return new Request('http://localhost/api/generate/image', {
    method: 'POST',
    body: formData,
  });
}

describe('POST /api/generate/image', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.saveGenerateImageUpload.mockResolvedValue({
      originalName: 'reference.png',
      name: '123-reference.png',
      mimeType: 'image/png',
      size: 4,
      source: '/imports/generate/123-reference.png',
    });
  });

  it('stores an uploaded source image and returns its import record', async () => {
    const formData = new FormData();
    formData.append('image', new File([new Uint8Array([1, 2, 3, 4])], 'reference.png', {
      type: 'image/png',
    }));

    const response = await POST(createFormRequest(formData) as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.saveGenerateImageUpload).toHaveBeenCalledWith(expect.any(File));
    expect(data).toEqual({
      image: {
        originalName: 'reference.png',
        name: '123-reference.png',
        mimeType: 'image/png',
        size: 4,
        source: '/imports/generate/123-reference.png',
      },
    });
  });

  it('returns 400 when no image file is present', async () => {
    const response = await POST(createFormRequest(new FormData()) as never);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('No image file');
    expect(mocks.saveGenerateImageUpload).not.toHaveBeenCalled();
  });
});
