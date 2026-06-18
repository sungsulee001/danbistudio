import { describe, expect, it } from 'vitest';

import { filterAndSortMediaAssets, listMediaBinSmartCollections, resolveMediaBinAssetKindLabel } from '../../src/lib/editor/media-bin';
import type { EditorAsset } from '../../src/lib/editor/types';

describe('media bin filtering', () => {
  it('uses renderable media inference for supported generated formats and explicit unsupported MIME files', () => {
    const voiceAsset = buildAsset({
      id: 'asset-voice-webm',
      name: 'Voice WebM',
      kind: 'ai',
      source: '/outputs/voice.webm',
      renderPath: 'E:/renders/voice.webm',
      metadata: {
        mimeType: 'audio/webm;codecs=opus',
        generated: true,
      },
    });
    const tiffAsset = buildAsset({
      id: 'asset-still-tiff',
      name: 'Still TIFF',
      kind: 'ai',
      source: '/outputs/still.tiff',
      renderPath: 'E:/renders/still.tiff',
      metadata: {
        mimeType: 'application/octet-stream',
        generated: true,
      },
    });
    const spoofedAsset = buildAsset({
      id: 'asset-spoofed-svg',
      name: 'Spoofed PNG',
      kind: 'ai',
      source: '/outputs/spoofed.png',
      renderPath: 'E:/renders/spoofed.png',
      metadata: {
        mimeType: 'image/svg+xml',
        generated: true,
      },
    });
    const assets = [voiceAsset, tiffAsset, spoofedAsset];

    expect(filterAndSortMediaAssets(assets, { kind: 'audio' }).map((asset) => asset.id)).toEqual(['asset-voice-webm']);
    expect(filterAndSortMediaAssets(assets, { kind: 'image' }).map((asset) => asset.id)).toEqual(['asset-still-tiff']);
    expect(resolveMediaBinAssetKindLabel(voiceAsset)).toBe('ai/audio');
    expect(resolveMediaBinAssetKindLabel(tiffAsset)).toBe('ai/image');
    expect(resolveMediaBinAssetKindLabel(spoofedAsset)).toBe('ai');
    expect(listMediaBinSmartCollections(assets).find((collection) => collection.id === 'generated')?.count).toBe(3);
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
