import { describe, expect, it } from 'vitest';

import { buildComfyUIReviewItems } from '../../src/electron/renderer/comfyui-review-helpers';
import { createDefaultEditorProject } from '../../src/lib/editor/project';

describe('ComfyUI review helpers', () => {
  it('builds review items only for supported result media kinds', () => {
    const project = createDefaultEditorProject();
    const clips = project.tracks.flatMap((track) => track.clips);
    const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));

    const items = buildComfyUIReviewItems([
      {
        automationJobId: 'comfyui-audio-review',
        clipId: 'clip-ai-city',
        status: 'completed',
        source: '/outputs/voiceover.webm',
        filename: 'voiceover.webm',
        mimeType: 'audio/webm',
      },
      {
        automationJobId: 'comfyui-svg-review',
        clipId: 'clip-ai-city',
        status: 'completed',
        source: '/outputs/vector.svg',
        filename: 'vector.svg',
        mimeType: 'image/svg+xml',
      },
      {
        automationJobId: 'comfyui-analyzed-webm-review',
        clipId: 'clip-ai-city',
        status: 'completed',
        source: '/outputs/analyzed-voice.webm',
        filename: 'analyzed-voice.webm',
        mimeType: 'video/webm',
        media: {
          duration: 3,
          hasVideo: false,
          hasAudio: true,
          warnings: [],
        },
      },
      {
        automationJobId: 'comfyui-tiff-review',
        clipId: 'clip-ai-city',
        status: 'completed',
        source: '/outputs/still-pass.tiff',
        filename: 'still-pass.tiff',
      },
    ], clips, assetById, project);

    expect(items).toHaveLength(3);
    expect(items[0].result.automationJobId).toBe('comfyui-audio-review');
    expect(items[0].resultAsset).toMatchObject({
      kind: 'audio',
      metadata: {
        mimeType: 'audio/webm',
      },
    });
    expect(items[0].resultClip).toMatchObject({
      kind: 'audio',
      assetId: items[0].resultAsset.id,
    });
    expect(items[1].result.automationJobId).toBe('comfyui-analyzed-webm-review');
    expect(items[1].resultAsset.kind).toBe('audio');
    expect(items[2].result.automationJobId).toBe('comfyui-tiff-review');
    expect(items[2].resultAsset).toMatchObject({
      kind: 'image',
      metadata: {
        mimeType: 'image/tiff',
      },
    });
  });
});
