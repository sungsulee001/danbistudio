import { describe, expect, it } from 'vitest';

import { resolveBulkRelinkUploadedMediaPlan } from '../../src/electron/renderer/media-bin-workflow-helpers';
import type { UploadedMediaFile } from '../../src/electron/renderer/editor-view-model';
import type { EditorAsset } from '../../src/lib/editor/types';

describe('media bin workflow helpers', () => {
  it('matches audio-only WebM uploads to audio relink candidates using analyzer metadata', () => {
    const audioAsset = buildAsset({
      id: 'asset-voice',
      name: 'voice.webm',
      kind: 'audio',
      source: 'offline://voice.webm',
    });
    const uploaded: UploadedMediaFile = {
      originalName: 'voice.webm',
      name: 'voice.webm',
      mimeType: 'video/webm',
      source: '/imports/voice.webm',
      renderPath: 'E:/media/voice.webm',
      metadata: {
        mimeType: 'video/webm',
        hasVideo: false,
        hasAudio: true,
      },
    };

    const plan = resolveBulkRelinkUploadedMediaPlan({
      assets: [audioAsset],
      files: [{ name: 'voice.webm', type: 'video/webm', size: 128 }],
      uploaded: [uploaded],
    });

    expect(plan.canRelink).toBe(true);
    expect(plan.assetIds).toEqual(['asset-voice']);
    expect(plan.matches).toHaveLength(1);
    expect(plan.matches[0]).toMatchObject({
      assetId: 'asset-voice',
      fileName: 'voice.webm',
      input: {
        name: 'voice.webm',
        mimeType: 'video/webm',
        source: '/imports/voice.webm',
        metadata: {
          hasAudio: true,
          hasVideo: false,
        },
      },
    });
  });

  it('keeps video uploads relinkable when analyzer metadata only confirms audio presence', () => {
    const videoAsset = buildAsset({
      id: 'asset-interview',
      name: 'interview.mp4',
      kind: 'video',
      source: 'offline://interview.mp4',
    });
    const uploaded: UploadedMediaFile = {
      originalName: 'interview.mp4',
      name: 'interview.mp4',
      mimeType: 'video/mp4',
      source: '/imports/interview.mp4',
      renderPath: 'E:/media/interview.mp4',
      metadata: {
        mimeType: 'video/mp4',
        hasAudio: true,
      },
    };

    const plan = resolveBulkRelinkUploadedMediaPlan({
      assets: [videoAsset],
      files: [{ name: 'interview.mp4', type: 'video/mp4', size: 128 }],
      uploaded: [uploaded],
    });

    expect(plan.canRelink).toBe(true);
    expect(plan.assetIds).toEqual(['asset-interview']);
    expect(plan.matches).toEqual([
      expect.objectContaining({
        assetId: 'asset-interview',
        fileName: 'interview.mp4',
      }),
    ]);
  });

  it('does not bulk relink explicit unsupported MIME uploads through analyzer video metadata', () => {
    const videoAsset = buildAsset({
      id: 'asset-spoofed',
      name: 'spoofed.png',
      kind: 'video',
      source: 'offline://spoofed.png',
    });
    const uploaded: UploadedMediaFile = {
      originalName: 'spoofed.png',
      name: 'spoofed.png',
      mimeType: 'image/svg+xml',
      source: '/imports/spoofed.png',
      renderPath: 'E:/media/spoofed.png',
      metadata: {
        mimeType: 'image/svg+xml',
        hasVideo: true,
        hasAudio: false,
      },
    };

    const plan = resolveBulkRelinkUploadedMediaPlan({
      assets: [videoAsset],
      files: [{ name: 'spoofed.png', type: 'application/octet-stream', size: 128 }],
      uploaded: [uploaded],
    });

    expect(plan.canRelink).toBe(false);
    expect(plan.assetIds).toEqual([]);
    expect(plan.matches).toEqual([]);
    expect(plan.status).toBe('No relinkable media files were prepared.');
    expect(plan.skipped).toEqual([
      expect.objectContaining({
        kind: 'file',
        fileName: 'spoofed.png',
        reason: 'Unsupported media file.',
      }),
    ]);
  });
});

function buildAsset(overrides: Partial<EditorAsset>): EditorAsset {
  return {
    id: 'asset',
    name: 'asset',
    kind: 'video',
    source: '',
    duration: 1,
    ...overrides,
  };
}
