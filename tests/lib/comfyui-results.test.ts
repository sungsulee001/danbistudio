import { describe, expect, it } from 'vitest';

import { applyComfyUIResultAssets, buildComfyUIResultReviewReport } from '../../src/lib/editor/comfyui-results';
import { createDefaultEditorProject } from '../../src/lib/editor/project';

describe('ComfyUI result assets', () => {
  it('applies supported audio/webm results as audio assets', () => {
    const project = createDefaultEditorProject();
    const updated = applyComfyUIResultAssets(project, [{
      automationJobId: 'comfyui-audio-webm',
      clipId: 'clip-ai-city',
      status: 'completed',
      source: '/outputs/voiceover.webm',
      renderPath: 'E:/ai_tool/Danbi_Studio/public/outputs/voiceover.webm',
      filename: 'voiceover.webm',
      mimeType: 'audio/webm',
      media: {
        duration: 4.5,
        hasVideo: false,
        hasAudio: true,
        warnings: [],
      },
    }]);

    const audioAsset = updated.assets.find((asset) => asset.source === '/outputs/voiceover.webm');
    const audioTrack = updated.tracks.find((track) => track.id === 'track-comfy-audio-results');

    expect(audioAsset).toMatchObject({
      kind: 'audio',
      duration: 4.5,
      metadata: {
        mimeType: 'audio/webm',
        hasAudio: true,
      },
    });
    expect(audioTrack).toMatchObject({ kind: 'audio' });
    expect(audioTrack?.clips.find((clip) => clip.assetId === audioAsset?.id)).toMatchObject({
      kind: 'audio',
    });

    const parameterizedAudioWebm = applyComfyUIResultAssets(project, [{
      automationJobId: 'comfyui-audio-webm-codecs',
      clipId: 'clip-ai-city',
      status: 'completed',
      source: '/outputs/voiceover-codecs.webm',
      filename: 'voiceover-codecs.webm',
      mimeType: 'audio/webm;codecs=opus',
    }]);
    expect(parameterizedAudioWebm.assets.find((asset) => asset.source === '/outputs/voiceover-codecs.webm')).toMatchObject({
      kind: 'audio',
      metadata: {
        mimeType: 'audio/webm;codecs=opus',
      },
    });

    const analyzedWebm = applyComfyUIResultAssets(project, [{
      automationJobId: 'comfyui-analyzed-webm',
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
    }]);
    const analyzedWebmAsset = analyzedWebm.assets.find((asset) => asset.source === '/outputs/analyzed-voice.webm');
    expect(analyzedWebmAsset).toMatchObject({
      kind: 'audio',
      metadata: {
        mimeType: 'video/webm',
        hasAudio: true,
      },
    });
  });

  it('skips unsupported MIME results instead of importing them as video fallbacks', () => {
    const project = createDefaultEditorProject();
    const updated = applyComfyUIResultAssets(project, [{
      automationJobId: 'comfyui-svg-result',
      clipId: 'clip-ai-city',
      status: 'completed',
      source: '/outputs/vector.svg',
      filename: 'vector.svg',
      mimeType: 'image/svg+xml',
      media: {
        duration: 3,
        hasVideo: true,
        hasAudio: false,
        warnings: [],
      },
    }]);

    expect(updated).toBe(project);
    expect(updated.assets.some((asset) => asset.source === '/outputs/vector.svg')).toBe(false);
  });

  it('preserves shared media MIME fallback for results without explicit MIME metadata', () => {
    const project = createDefaultEditorProject();
    const updated = applyComfyUIResultAssets(project, [{
      automationJobId: 'comfyui-tiff-result',
      clipId: 'clip-ai-city',
      status: 'completed',
      source: '/outputs/still-pass.tiff',
      filename: 'still-pass.tiff',
    }]);

    expect(updated.assets.find((asset) => asset.source === '/outputs/still-pass.tiff')).toMatchObject({
      kind: 'image',
      metadata: {
        mimeType: 'image/tiff',
      },
    });
  });

  it('uses supported media kind inference for audio review issues', () => {
    const project = createDefaultEditorProject();
    const sourceClip = project.tracks.flatMap((track) => track.clips).find((clip) => clip.id === 'clip-ai-city')!;

    const report = buildComfyUIResultReviewReport({
      automationJobId: 'comfyui-audio-review',
      clipId: 'clip-ai-city',
      status: 'completed',
      source: '/outputs/voiceover.webm',
      filename: 'voiceover.webm',
      mimeType: 'audio/webm',
      prompt: 'voiceover pass',
    }, sourceClip);

    expect(report.issues).toContain('Waveform cache is missing for audio review.');
  });

  it('reports unsupported MIME review issues before trusting result audio metadata', () => {
    const project = createDefaultEditorProject();
    const sourceClip = project.tracks.flatMap((track) => track.clips).find((clip) => clip.id === 'clip-ai-city')!;

    const report = buildComfyUIResultReviewReport({
      automationJobId: 'comfyui-unsupported-review',
      clipId: 'clip-ai-city',
      status: 'completed',
      source: '/outputs/spoofed.png',
      filename: 'spoofed.png',
      mimeType: 'image/svg+xml',
      prompt: 'spoofed result',
      media: {
        duration: sourceClip.duration,
        hasVideo: false,
        hasAudio: true,
        warnings: [],
      },
    }, sourceClip);

    expect(report.issues).toContain('Result media type is unsupported: image/svg+xml.');
    expect(report.issues).not.toContain('Waveform cache is missing for audio review.');
  });
});
