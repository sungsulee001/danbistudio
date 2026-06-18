import { describe, expect, it } from 'vitest';

import { appendSkippedNonMediaDropStatus, countNonMediaDraggedFiles, getDraggedMediaFiles, hasImportableDraggedFiles, readDraggedMediaFilePreview, resolveUnsupportedTimelineMediaDropStatus } from '../../src/electron/renderer/media-drop-helpers';

describe('media drop helpers', () => {
  it('filters dropped files with the supported import media allowlist', () => {
    const dataTransfer = buildDataTransfer({
      files: [
        new File(['video'], 'capture.bin', { type: 'video/mp4' }),
        new File(['audio'], 'soft-pulse.wav', { type: 'application/octet-stream' }),
        new File(['voiceover'], 'voiceover.webm', { type: 'audio/webm' }),
        new File(['<svg />'], 'vector.svg', { type: 'image/svg+xml' }),
        new File(['image'], 'photo.heic', { type: 'image/heic' }),
      ],
    });

    expect(getDraggedMediaFiles(dataTransfer).map((file) => file.name)).toEqual([
      'capture.bin',
      'soft-pulse.wav',
      'voiceover.webm',
    ]);
    expect(readDraggedMediaFilePreview(dataTransfer)).toEqual({
      label: '3 media files',
      kinds: ['video', 'audio', 'audio'],
      duration: 70,
    });
  });

  it('ignores unsupported file items before showing a timeline drop preview', () => {
    expect(readDraggedMediaFilePreview(buildDataTransfer({
      files: [],
      items: [
        { kind: 'file', type: 'image/svg+xml' },
        { kind: 'file', type: 'image/heic' },
      ],
    }))).toBeUndefined();

    expect(readDraggedMediaFilePreview(buildDataTransfer({
      files: [],
      items: [
        { kind: 'file', type: 'video/mp4' },
        { kind: 'file', type: 'image/svg+xml' },
      ],
    }))).toEqual({
      label: 'Media file',
      kinds: ['video'],
      duration: 10,
    });
  });

  it('detects media-bin importable drags without accepting known unsupported types', () => {
    expect(hasImportableDraggedFiles(buildDataTransfer({
      files: [
        new File(['video'], 'clip.mp4', { type: 'video/mp4' }),
        new File(['caption'], 'captions.srt', { type: '' }),
        new File(['caption'], 'plain-captions.vtt', { type: 'text/plain' }),
      ],
    }))).toBe(true);

    expect(hasImportableDraggedFiles(buildDataTransfer({
      files: [
        new File(['<svg />'], 'vector.svg', { type: 'image/svg+xml' }),
        new File(['pdf'], 'spoofed.vtt', { type: 'application/pdf' }),
        new File(['pdf'], 'notes.pdf', { type: 'application/pdf' }),
      ],
    }))).toBe(false);

    expect(hasImportableDraggedFiles(buildDataTransfer({
      files: [],
      items: [
        { kind: 'file', type: 'image/svg+xml' },
        { kind: 'file', type: 'application/pdf' },
      ],
    }))).toBe(false);

    expect(hasImportableDraggedFiles(buildDataTransfer({
      files: [],
      items: [
        { kind: 'file', type: '' },
      ],
    }))).toBe(true);
  });

  it('reports non-media files skipped from timeline drops', () => {
    const dataTransfer = buildDataTransfer({
      files: [
        new File(['video'], 'clip.mp4', { type: 'video/mp4' }),
        new File(['caption'], 'captions.srt', { type: '' }),
        new File(['pdf'], 'notes.pdf', { type: 'application/pdf' }),
      ],
    });

    expect(countNonMediaDraggedFiles(dataTransfer)).toBe(2);
    expect(appendSkippedNonMediaDropStatus('Dropped 1 media file on A-roll', 2)).toBe('Dropped 1 media file on A-roll / Skipped 2 non-media files');
    expect(appendSkippedNonMediaDropStatus('Dropped 1 media file on A-roll', 0)).toBe('Dropped 1 media file on A-roll');
    expect(resolveUnsupportedTimelineMediaDropStatus()).toBe('Drop supported video, audio, or image files on the timeline. Import subtitle sidecars in the Media Bin.');
  });
});

function buildDataTransfer({
  files,
  items = files.map((file) => ({ kind: 'file', type: file.type })),
}: {
  files: File[];
  items?: Array<{ kind: string; type: string }>;
}): DataTransfer {
  return {
    files,
    items,
    types: ['Files'],
    getData: () => '',
  } as unknown as DataTransfer;
}
