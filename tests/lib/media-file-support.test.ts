import { describe, expect, it } from 'vitest';

import {
  inferSupportedMediaFileKind,
  inferSupportedMediaMimeType,
  isSupportedMediaFileReference,
  normalizeMediaFileMimeType,
  readExplicitUnsupportedMediaMimeType,
  SUPPORTED_MEDIA_AND_CAPTION_FILE_ACCEPT,
  SUPPORTED_MEDIA_FILE_ACCEPT,
  SUPPORTED_MEDIA_FILE_EXTENSIONS,
} from '../../src/lib/editor/media-file-support';

describe('media file support', () => {
  it('publishes exact media accept lists instead of broad MIME wildcards', () => {
    expect(SUPPORTED_MEDIA_FILE_ACCEPT).not.toContain('video/*');
    expect(SUPPORTED_MEDIA_FILE_ACCEPT).not.toContain('audio/*');
    expect(SUPPORTED_MEDIA_FILE_ACCEPT).not.toContain('image/*');
    expect(SUPPORTED_MEDIA_FILE_ACCEPT).toContain('.avi');
    expect(SUPPORTED_MEDIA_FILE_ACCEPT).toContain('.ogg');
    expect(SUPPORTED_MEDIA_FILE_ACCEPT).toContain('.bmp');
    expect(SUPPORTED_MEDIA_FILE_ACCEPT).toContain('.tiff');
    expect(SUPPORTED_MEDIA_FILE_ACCEPT).toContain('audio/webm');
    expect(SUPPORTED_MEDIA_AND_CAPTION_FILE_ACCEPT).toContain('.srt');
    expect(SUPPORTED_MEDIA_AND_CAPTION_FILE_ACCEPT).toContain('application/x-subrip');
    expect(SUPPORTED_MEDIA_FILE_EXTENSIONS).toEqual(expect.arrayContaining(['avi', 'ogg', 'bmp', 'tif', 'tiff']));
  });

  it('infers canonical MIME types for every supported extension fallback', () => {
    expect(inferSupportedMediaMimeType('clip.avi')).toBe('video/x-msvideo');
    expect(inferSupportedMediaMimeType('voice.ogg')).toBe('audio/ogg');
    expect(inferSupportedMediaMimeType('still.bmp')).toBe('image/bmp');
    expect(inferSupportedMediaMimeType('scan.tif')).toBe('image/tiff');
    expect(inferSupportedMediaMimeType('scan.tiff')).toBe('image/tiff');
    expect(inferSupportedMediaMimeType('notes.pdf')).toBe('application/octet-stream');
    expect(isSupportedMediaFileReference({ name: 'scan.tiff?cache=1' })).toBe(true);
    expect(isSupportedMediaFileReference({ name: 'camera.qt', type: '' })).toBe(true);
    expect(isSupportedMediaFileReference({ name: 'camera.qt', type: 'application/octet-stream' })).toBe(true);
    expect(isSupportedMediaFileReference({ name: 'spoofed.png', type: 'image/svg+xml' })).toBe(false);
  });

  it('normalizes MIME parameters before falling back to ambiguous extensions', () => {
    expect(normalizeMediaFileMimeType(' Image/JPEG; charset=binary ')).toBe('image/jpeg');
    expect(inferSupportedMediaFileKind({
      name: 'voiceover.webm',
      type: 'audio/webm;codecs=opus',
    })).toBe('audio');
    expect(inferSupportedMediaFileKind({
      name: 'voiceover.bin',
      mimeType: 'audio/webm; codecs=opus',
    })).toBe('audio');
    expect(inferSupportedMediaFileKind({
      name: 'capture.webm',
      type: 'video/webm; codecs=vp9',
    })).toBe('video');
    expect(inferSupportedMediaFileKind({
      name: 'photo.bin',
      type: 'image/jpeg; charset=binary',
    })).toBe('image');
  });

  it('distinguishes explicit unsupported MIME types from generic fallback MIME types', () => {
    expect(readExplicitUnsupportedMediaMimeType('image/svg+xml; charset=utf-8')).toBe('image/svg+xml');
    expect(readExplicitUnsupportedMediaMimeType('image/heic')).toBe('image/heic');
    expect(readExplicitUnsupportedMediaMimeType('application/octet-stream')).toBeUndefined();
    expect(readExplicitUnsupportedMediaMimeType('binary/octet-stream')).toBeUndefined();
    expect(readExplicitUnsupportedMediaMimeType('audio/webm;codecs=opus')).toBeUndefined();
  });
});
