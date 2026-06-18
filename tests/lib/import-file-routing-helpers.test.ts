import { describe, expect, it } from 'vitest';

import { inferCaptionSidecarFormat, inferMediaFileReferenceKind, isCaptionSidecarFileReference, isMediaFileReference, partitionImportFileReferences } from '../../src/electron/renderer/import-file-routing-helpers';

describe('import file routing helpers', () => {
  it('routes only supported media references while preserving sidecars and extension fallback', () => {
    expect(isMediaFileReference({ name: 'capture.bin', type: 'video/mp4' })).toBe(true);
    expect(isMediaFileReference({ name: 'camera.qt', type: '' })).toBe(true);
    expect(isMediaFileReference({ name: 'cache-entry', type: '', mimeType: 'audio/wav' })).toBe(true);
    expect(isMediaFileReference({ name: 'phone-capture.bin', type: 'video/x-m4v' })).toBe(true);
    expect(isMediaFileReference({ name: 'voiceover.webm', type: 'audio/webm' })).toBe(true);
    expect(isMediaFileReference({ name: 'voiceover.webm', type: 'audio/webm;codecs=opus' })).toBe(true);
    expect(inferMediaFileReferenceKind({ name: 'capture.bin', type: 'video/mp4' })).toBe('video');
    expect(inferMediaFileReferenceKind({ name: 'phone-capture.bin', type: 'video/x-m4v' })).toBe('video');
    expect(inferMediaFileReferenceKind({ name: 'soft-pulse.bin', mimeType: 'audio/wav' })).toBe('audio');
    expect(inferMediaFileReferenceKind({ name: 'voiceover.webm', type: 'audio/webm' })).toBe('audio');
    expect(inferMediaFileReferenceKind({ name: 'voiceover.webm', type: 'audio/webm;codecs=opus' })).toBe('audio');
    expect(inferMediaFileReferenceKind({ name: 'voiceover.bin', type: 'application/octet-stream', mimeType: 'audio/x-m4a' })).toBe('audio');
    expect(inferMediaFileReferenceKind({ name: 'still.tiff', type: '' })).toBe('image');
    expect(isMediaFileReference({ name: 'vector.svg', type: 'image/svg+xml' })).toBe(false);
    expect(isMediaFileReference({ name: 'vector.png', type: 'image/svg+xml' })).toBe(false);
    expect(isMediaFileReference({ name: 'photo.heic', type: 'image/heic' })).toBe(false);
    expect(isMediaFileReference({ name: 'notes.pdf', type: 'application/pdf' })).toBe(false);
    expect(isCaptionSidecarFileReference({ name: 'captions.srt', type: 'text/plain' })).toBe(true);
    expect(isCaptionSidecarFileReference({ name: 'spoofed.vtt', type: 'application/pdf' })).toBe(false);

    expect(partitionImportFileReferences([
      { name: 'capture.bin', type: 'video/mp4' },
      { name: 'camera.qt', type: '' },
      { name: 'captions.vtt', type: 'text/vtt' },
      { name: 'caption-upload', type: 'Text/VTT; charset=utf-8' },
      { name: 'caption-fallback', type: 'application/octet-stream', mimeType: 'application/x-subrip; charset=utf-8' },
      { name: 'spoofed.vtt', type: 'application/pdf' },
      { name: 'photo.heic', type: 'image/heic' },
      { name: 'notes.pdf', type: 'application/pdf' },
    ])).toEqual({
      mediaFiles: [
        { name: 'capture.bin', type: 'video/mp4' },
        { name: 'camera.qt', type: '' },
      ],
      captionSidecarFiles: [
        { name: 'captions.vtt', type: 'text/vtt' },
        { name: 'caption-upload', type: 'Text/VTT; charset=utf-8' },
        { name: 'caption-fallback', type: 'application/octet-stream', mimeType: 'application/x-subrip; charset=utf-8' },
      ],
      unsupportedFiles: [
        { name: 'spoofed.vtt', type: 'application/pdf' },
        { name: 'photo.heic', type: 'image/heic' },
        { name: 'notes.pdf', type: 'application/pdf' },
      ],
    });
  });

  it('infers extensionless caption sidecar formats from normalized MIME types', () => {
    expect(inferCaptionSidecarFormat('caption-upload', 'Text/VTT; charset=utf-8')).toBe('vtt');
    expect(inferCaptionSidecarFormat('caption-upload', 'Application/SRT; charset=utf-8')).toBe('srt');
    expect(inferCaptionSidecarFormat('caption-upload')).toBe('auto');
  });
});
