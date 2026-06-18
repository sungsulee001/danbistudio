import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../src/app/api/editor/media/route';

vi.mock('@/server/editor/media-analyzer', () => ({
  analyzeMediaFile: vi.fn(async () => ({
    duration: 2,
    width: 1920,
    height: 1080,
    fps: 30,
    warnings: [],
    hasVideo: true,
    hasAudio: true,
    videoCodec: 'h264',
    audioCodec: 'aac',
    audioChannels: 2,
    sampleRate: 48000,
    bitrate: 12000000,
    rotation: 0,
    codedWidth: 1920,
    codedHeight: 1080,
    sampleAspectRatio: '1:1',
    displayAspectRatio: '16:9',
    pixelAspectRatio: 1,
  })),
}));

vi.mock('@/lib/editor/media-cache-queue', () => ({
  createMediaCacheJob: vi.fn(() => ({
    id: 'media-cache-job-test',
    status: 'queued',
    progress: 0,
    priority: 5,
    source: '/imports/test',
    originalName: 'test.mov',
    mimeType: 'video/quicktime',
    createdAt: '2026-06-18T00:00:00.000Z',
    warnings: [],
  })),
}));

function createUploadRequest(files: File[]): Request {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append('files', file);
  });

  return new Request('http://localhost/api/editor/media', {
    method: 'POST',
    body: formData,
  });
}

describe('POST /api/editor/media', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores uploaded media with Windows-safe filenames', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-media-upload-'));
    const previousLocalDataRoot = process.env.DANBI_LOCAL_DATA_ROOT;

    try {
      process.env.DANBI_LOCAL_DATA_ROOT = tempRoot;
      vi.spyOn(Date, 'now').mockReturnValue(1800000000000);

      const response = await POST(createUploadRequest([
        new File(['video'], 'clip.', { type: 'video/quicktime' }),
        new File(['video'], '...', { type: 'video/quicktime' }),
      ]) as never);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.files.map((file: { name: string }) => file.name)).toEqual([
        '1800000000000-0-clip',
        '1800000000000-1-media',
      ]);
      expect(data.files.map((file: { source: string }) => file.source)).toEqual([
        '/imports/1800000000000-0-clip',
        '/imports/1800000000000-1-media',
      ]);
    } finally {
      if (previousLocalDataRoot === undefined) {
        delete process.env.DANBI_LOCAL_DATA_ROOT;
      } else {
        process.env.DANBI_LOCAL_DATA_ROOT = previousLocalDataRoot;
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('keeps duplicate upload filenames instead of overwriting the first import', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-media-upload-'));
    const previousLocalDataRoot = process.env.DANBI_LOCAL_DATA_ROOT;

    try {
      process.env.DANBI_LOCAL_DATA_ROOT = tempRoot;
      vi.spyOn(Date, 'now').mockReturnValue(1800000000000);

      const firstResponse = await POST(createUploadRequest([
        new File(['first upload'], '...wav', { type: 'audio/wav' }),
      ]) as never);
      const secondResponse = await POST(createUploadRequest([
        new File(['second upload'], '...wav', { type: 'audio/wav' }),
      ]) as never);
      const firstData = await firstResponse.json();
      const secondData = await secondResponse.json();

      expect(firstResponse.status).toBe(200);
      expect(secondResponse.status).toBe(200);
      expect(firstData.files[0]).toMatchObject({
        name: '1800000000000-0-media.wav',
        source: '/imports/1800000000000-0-media.wav',
      });
      expect(secondData.files[0]).toMatchObject({
        name: '1800000000000-0-media-1.wav',
        source: '/imports/1800000000000-0-media-1.wav',
      });
      await expect(readFile(firstData.files[0].renderPath, 'utf8')).resolves.toBe('first upload');
      await expect(readFile(secondData.files[0].renderPath, 'utf8')).resolves.toBe('second upload');
    } finally {
      if (previousLocalDataRoot === undefined) {
        delete process.env.DANBI_LOCAL_DATA_ROOT;
      } else {
        process.env.DANBI_LOCAL_DATA_ROOT = previousLocalDataRoot;
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('skips unsupported upload files before writing import artifacts', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-media-upload-'));
    const previousLocalDataRoot = process.env.DANBI_LOCAL_DATA_ROOT;

    try {
      process.env.DANBI_LOCAL_DATA_ROOT = tempRoot;
      vi.spyOn(Date, 'now').mockReturnValue(1800000000000);

      const response = await POST(createUploadRequest([
        new File(['not media'], 'notes.pdf', { type: 'application/pdf' }),
        new File(['<svg />'], 'vector.svg', { type: 'image/svg+xml' }),
        new File(['video'], 'clip.mp4', { type: 'video/mp4' }),
      ]) as never);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.files).toHaveLength(1);
      expect(data.files[0]).toMatchObject({
        originalName: 'clip.mp4',
        name: '1800000000000-2-clip.mp4',
        source: '/imports/1800000000000-2-clip.mp4',
      });
      expect(data.warnings).toEqual(['Skipped 2 unsupported media uploads.']);
      await expect(readdir(join(tempRoot, 'imports'))).resolves.toEqual(['1800000000000-2-clip.mp4']);
    } finally {
      if (previousLocalDataRoot === undefined) {
        delete process.env.DANBI_LOCAL_DATA_ROOT;
      } else {
        process.env.DANBI_LOCAL_DATA_ROOT = previousLocalDataRoot;
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('skips explicit unsupported MIME uploads even when the filename extension is supported', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-media-upload-'));
    const previousLocalDataRoot = process.env.DANBI_LOCAL_DATA_ROOT;

    try {
      process.env.DANBI_LOCAL_DATA_ROOT = tempRoot;
      vi.spyOn(Date, 'now').mockReturnValue(1800000000000);

      const response = await POST(createUploadRequest([
        new File(['<svg />'], 'spoofed.png', { type: 'image/svg+xml' }),
        new File(['video'], 'clip.mp4', { type: 'video/mp4' }),
      ]) as never);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.files).toHaveLength(1);
      expect(data.files[0]).toMatchObject({
        originalName: 'clip.mp4',
        name: '1800000000000-1-clip.mp4',
      });
      expect(data.warnings).toEqual(['Skipped 1 unsupported media upload.']);
      await expect(readdir(join(tempRoot, 'imports'))).resolves.toEqual(['1800000000000-1-clip.mp4']);
    } finally {
      if (previousLocalDataRoot === undefined) {
        delete process.env.DANBI_LOCAL_DATA_ROOT;
      } else {
        process.env.DANBI_LOCAL_DATA_ROOT = previousLocalDataRoot;
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('accepts parameterized audio WebM uploads before ambiguous extension fallback', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-media-upload-'));
    const previousLocalDataRoot = process.env.DANBI_LOCAL_DATA_ROOT;

    try {
      process.env.DANBI_LOCAL_DATA_ROOT = tempRoot;
      vi.spyOn(Date, 'now').mockReturnValue(1800000000000);

      const response = await POST(createUploadRequest([
        new File(['voice'], 'voiceover.webm', { type: 'audio/webm;codecs=opus' }),
      ]) as never);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.files[0]).toMatchObject({
        originalName: 'voiceover.webm',
        name: '1800000000000-0-voiceover.webm',
        mimeType: 'audio/webm;codecs=opus',
        source: '/imports/1800000000000-0-voiceover.webm',
      });
      expect(data.warnings).toEqual([]);
      await expect(readFile(data.files[0].renderPath, 'utf8')).resolves.toBe('voice');
    } finally {
      if (previousLocalDataRoot === undefined) {
        delete process.env.DANBI_LOCAL_DATA_ROOT;
      } else {
        process.env.DANBI_LOCAL_DATA_ROOT = previousLocalDataRoot;
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
