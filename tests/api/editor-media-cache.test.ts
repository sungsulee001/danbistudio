import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../src/app/api/editor/media-cache/route';
import { analyzeMediaFile } from '../../src/server/editor/media-analyzer';
import { createMediaCacheJob } from '../../src/lib/editor/media-cache-queue';

vi.mock('../../src/server/editor/media-analyzer', () => ({
  analyzeMediaFile: vi.fn(async () => ({
    hasVideo: true,
    hasAudio: false,
    warnings: [],
  })),
}));

vi.mock('../../src/lib/editor/media-cache-queue', () => ({
  clearCompletedMediaCacheJobs: vi.fn(async () => 0),
  createMediaCacheJob: vi.fn(() => ({
    id: 'media-cache-job-test',
    status: 'queued',
    progress: 0,
    priority: 5,
    warnings: [],
  })),
  listMediaCacheJobs: vi.fn(async () => []),
}));

function createMediaCacheRequest(body: unknown): Request {
  return new Request('http://localhost/api/editor/media-cache', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/editor/media-cache', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unsupported media cache requests before analysis or queueing', async () => {
    const response = await POST(createMediaCacheRequest({
      filePath: 'E:/media/notes.pdf',
      source: '/imports/notes.pdf',
      mimeType: 'application/pdf',
      originalName: 'notes.pdf',
    }) as never);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Unsupported media cache file: notes.pdf.');
    expect(analyzeMediaFile).not.toHaveBeenCalled();
    expect(createMediaCacheJob).not.toHaveBeenCalled();
  });

  it('rejects unsupported broad image MIME cache requests', async () => {
    const response = await POST(createMediaCacheRequest({
      filePath: 'E:/media/vector.svg',
      source: '/imports/vector.svg',
      mimeType: 'image/svg+xml',
      originalName: 'vector.svg',
    }) as never);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Unsupported media cache file: vector.svg.');
    expect(analyzeMediaFile).not.toHaveBeenCalled();
    expect(createMediaCacheJob).not.toHaveBeenCalled();
  });

  it('rejects explicit unsupported MIME cache requests even when the filename extension is supported', async () => {
    const response = await POST(createMediaCacheRequest({
      filePath: 'E:/media/spoofed.png',
      source: '/imports/spoofed.png',
      mimeType: 'image/svg+xml',
      originalName: 'spoofed.png',
    }) as never);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Unsupported media cache file: spoofed.png.');
    expect(analyzeMediaFile).not.toHaveBeenCalled();
    expect(createMediaCacheJob).not.toHaveBeenCalled();
  });

  it('rejects non-local media cache file paths before analysis or queueing', async () => {
    const nullBytePath = `E:/media/${String.fromCharCode(0)}voice.wav`;
    const cases = [
      {
        filePath: 'https://example.com/remote.mp4',
        error: 'Media cache filePath must be a local filesystem path, not a URL or shell protocol.',
      },
      {
        filePath: 'relative.mp4',
        error: 'Media cache filePath must be a local absolute filesystem path.',
      },
      {
        filePath: '\\\\.\\pipe\\danbi-cache.wav',
        error: 'Media cache filePath cannot use a Windows device namespace path.',
      },
      {
        filePath: nullBytePath,
        error: 'Media cache filePath cannot contain null bytes.',
      },
    ];

    for (const item of cases) {
      const response = await POST(createMediaCacheRequest({
        filePath: item.filePath,
        source: item.filePath,
        mimeType: 'video/mp4',
        originalName: 'clip.mp4',
      }) as never);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe(item.error);
    }

    expect(analyzeMediaFile).not.toHaveBeenCalled();
    expect(createMediaCacheJob).not.toHaveBeenCalled();
  });

  it('accepts parameterized audio WebM cache requests before ambiguous extension fallback', async () => {
    const response = await POST(createMediaCacheRequest({
      filePath: 'E:/media/voiceover.webm',
      source: '/imports/voiceover.webm',
      mimeType: 'audio/webm;codecs=opus',
      originalName: 'voiceover.webm',
    }) as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.job).toMatchObject({
      id: 'media-cache-job-test',
      status: 'queued',
    });
    expect(analyzeMediaFile).toHaveBeenCalledWith('E:/media/voiceover.webm', 'audio/webm;codecs=opus');
    expect(createMediaCacheJob).toHaveBeenCalledWith(expect.objectContaining({
      filePath: 'E:/media/voiceover.webm',
      mimeType: 'audio/webm;codecs=opus',
      originalName: 'voiceover.webm',
    }), expect.any(Object));
  });

  it('uses filePath extension fallback when cache originalName has no extension', async () => {
    const response = await POST(createMediaCacheRequest({
      filePath: 'E:/media/interview-select.mov',
      source: '/imports/interview-select',
      mimeType: 'application/octet-stream',
      originalName: 'Interview select',
    }) as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.job).toMatchObject({
      id: 'media-cache-job-test',
      status: 'queued',
    });
    expect(analyzeMediaFile).toHaveBeenCalledWith('E:/media/interview-select.mov', 'application/octet-stream');
    expect(createMediaCacheJob).toHaveBeenCalledWith(expect.objectContaining({
      filePath: 'E:/media/interview-select.mov',
      mimeType: 'application/octet-stream',
      originalName: 'Interview select',
    }), expect.any(Object));
  });
});
