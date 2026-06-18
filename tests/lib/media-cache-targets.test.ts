import { describe, expect, it } from 'vitest';

import { buildMediaCacheBatchPlan } from '../../src/lib/editor/media-cache-targets';
import type { EditorAsset } from '../../src/lib/editor/types';

describe('media cache target planning', () => {
  it('uses renderable media inference for generated formats and explicit unsupported MIME assets', () => {
    const assets = [
      buildAsset({
        id: 'asset-voice-webm',
        name: 'Voice WebM',
        source: '/outputs/voice.webm',
        renderPath: 'E:/renders/voice.webm',
        metadata: {
          mimeType: 'audio/webm;codecs=opus',
          generated: true,
        },
      }),
      buildAsset({
        id: 'asset-still-tiff',
        name: 'Still TIFF',
        source: '/outputs/still.tiff',
        renderPath: 'E:/renders/still.tiff',
        metadata: {
          mimeType: 'application/octet-stream',
          generated: true,
        },
      }),
      buildAsset({
        id: 'asset-spoofed-svg',
        name: 'Spoofed PNG',
        source: '/outputs/spoofed.png',
        renderPath: 'E:/renders/spoofed.png',
        metadata: {
          mimeType: 'image/svg+xml',
          generated: true,
          hasVideo: true,
        },
      }),
      buildAsset({
        id: 'asset-title',
        name: 'Title',
        kind: 'text',
        source: 'Title',
      }),
    ];

    const plan = buildMediaCacheBatchPlan(assets);

    expect(plan.targets.map((asset) => asset.id)).toEqual([
      'asset-voice-webm',
      'asset-still-tiff',
    ]);
    expect(plan.skipped).toEqual(expect.arrayContaining([
      { assetId: 'asset-spoofed-svg', reason: 'unsupported-kind' },
      { assetId: 'asset-title', reason: 'unsupported-kind' },
    ]));
  });
});

function buildAsset(overrides: Partial<EditorAsset>): EditorAsset {
  return {
    id: 'asset',
    name: 'asset',
    kind: 'ai',
    source: '',
    duration: 1,
    ...overrides,
  };
}
