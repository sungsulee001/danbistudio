import { describe, expect, it } from 'vitest';

import { resolveRuntimeAudioPeakReadRequests } from '../../src/electron/renderer/audio-analysis-workflow-helpers';
import { createClip, createDefaultEditorProject } from '../../src/lib/editor/project';
import { buildSttClipTasks, resolveSttCaptionSpeaker } from '../../src/lib/editor/stt-queue';
import type { EditorAsset, EditorProject } from '../../src/lib/editor/types';
import { assetCanHaveWaveform, buildWaveformRuntimeReadRequests } from '../../src/lib/editor/waveform-cache';

describe('audio-only WebM workflows', () => {
  it('keeps imported audio/webm eligible for STT, waveform, and audio analysis follow-ups', () => {
    const baseProject = createDefaultEditorProject();
    const webmAsset: EditorAsset = {
      id: 'asset-voiceover-webm',
      name: 'Browser voiceover WebM',
      kind: 'ai',
      source: '/imports/browser-voiceover.webm',
      renderPath: 'E:/media/browser-voiceover.webm',
      duration: 8,
      metadata: {
        mimeType: 'audio/webm',
        hasAudio: true,
        hasVideo: false,
      },
    };
    const webmClip = createClip({
      id: 'clip-voiceover-webm',
      assetId: webmAsset.id,
      trackId: 'track-a1',
      name: webmAsset.name,
      kind: 'ai',
      start: 3,
      duration: 8,
      color: '#84cc16',
    });
    const project: EditorProject = {
      ...baseProject,
      assets: [...baseProject.assets, webmAsset],
      tracks: baseProject.tracks.map((track) => (
        track.id === 'track-a1'
          ? { ...track, clips: [webmClip] }
          : track
      )),
    };

    const sttTasks = buildSttClipTasks(project, [webmClip.id]);
    expect(sttTasks).toHaveLength(1);
    expect(sttTasks[0]).toMatchObject({
      assetId: webmAsset.id,
      assetMediaKind: 'audio',
      inputPath: 'E:/media/browser-voiceover.webm',
    });
    expect(resolveSttCaptionSpeaker(sttTasks[0])).toBe('Voice');
    expect(assetCanHaveWaveform(webmAsset)).toBe(true);
    expect(buildWaveformRuntimeReadRequests({
      assets: [webmAsset],
      runtimePeaksByAssetId: {},
    })).toEqual([
      { assetId: webmAsset.id, source: '/imports/browser-voiceover.webm' },
    ]);
    expect(resolveRuntimeAudioPeakReadRequests({
      assets: [webmAsset],
      audioPeaksByAssetId: {},
    })).toEqual([
      { assetId: webmAsset.id, source: '/imports/browser-voiceover.webm' },
    ]);
  });
});
