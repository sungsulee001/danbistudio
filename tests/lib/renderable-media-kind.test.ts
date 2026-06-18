import { describe, expect, it } from 'vitest';

import { isRenderableVisualMediaAsset, resolveRenderableAssetMediaKind } from '../../src/lib/editor/renderable-media-kind';
import type { EditorAsset } from '../../src/lib/editor/types';

describe('renderable media kind', () => {
  it('uses the supported media allowlist for AI asset render kind inference', () => {
    expect(resolveRenderableAssetMediaKind(buildAiAsset({
      name: 'voiceover.webm',
      source: '/outputs/voiceover.webm',
      mimeType: 'audio/webm',
    }))).toBe('audio');
    expect(resolveRenderableAssetMediaKind(buildAiAsset({
      name: 'voiceover.webm',
      source: '/outputs/voiceover.webm',
      mimeType: 'audio/webm;codecs=opus',
    }))).toBe('audio');

    expect(isRenderableVisualMediaAsset(buildAiAsset({
      name: 'voiceover.webm',
      source: '/outputs/voiceover.webm',
      mimeType: 'audio/webm;codecs=opus',
    }))).toBe(false);

    expect(resolveRenderableAssetMediaKind(buildAiAsset({
      name: 'still',
      source: '/outputs/still.png?cache=1',
      mimeType: 'application/octet-stream',
    }))).toBe('image');
    expect(resolveRenderableAssetMediaKind(buildAiAsset({
      name: 'Voice label.wav',
      source: '/outputs/voice-label.wav',
      renderPath: 'E:/renders/still-frame.tiff',
      mimeType: 'application/octet-stream',
    }))).toBe('image');

    expect(resolveRenderableAssetMediaKind(buildAiAsset({
      name: 'vector.svg',
      source: '/outputs/vector.svg',
      mimeType: 'image/svg+xml',
    }))).toBeUndefined();

    expect(resolveRenderableAssetMediaKind(buildAiAsset({
      name: 'photo.heic',
      source: '/outputs/photo.heic',
      mimeType: 'image/heic',
    }))).toBeUndefined();

    expect(resolveRenderableAssetMediaKind(buildAiAsset({
      name: 'spoofed.png',
      source: '/outputs/spoofed.png',
      mimeType: 'image/svg+xml',
      metadata: {
        hasVideo: true,
      },
    }))).toBeUndefined();
  });
});

function buildAiAsset({
  name,
  source,
  renderPath,
  mimeType,
  metadata,
}: {
  name: string;
  source: string;
  renderPath?: string;
  mimeType: string;
  metadata?: Record<string, string | number | boolean>;
}): EditorAsset {
  return {
    id: `asset-${name}`,
    name,
    kind: 'ai',
    source,
    renderPath,
    duration: 5,
    metadata: { mimeType, ...metadata },
  };
}
