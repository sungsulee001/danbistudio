import { EDITOR_PROJECT_SCHEMA_VERSION } from '../../src/electron/shared/project-schema';
import { createClip } from '../../src/lib/editor/project';
import type { EditorProject } from '../../src/lib/editor/types';

const LONG_FORM_DURATION_SECONDS = 30 * 60;
const LONG_FORM_CLIP_SECONDS = 30;

export function buildLongFormEditorProject(): EditorProject {
  const waveformPeaks = [0.05, 0.22, 0.48, 0.31, 0.62, 0.4, 0.18, 0.56];
  const videoClips = Array.from({ length: LONG_FORM_DURATION_SECONDS / LONG_FORM_CLIP_SECONDS }, (_, index) => {
    const start = index * LONG_FORM_CLIP_SECONDS;
    return createClip({
      id: `clip-long-v1-${String(index).padStart(3, '0')}`,
      assetId: 'asset-long-a-roll',
      trackId: 'track-long-v1',
      name: `Long form scene ${String(index + 1).padStart(2, '0')}`,
      kind: 'video',
      start,
      duration: LONG_FORM_CLIP_SECONDS,
      sourceIn: start % 900,
      color: index % 2 === 0 ? '#38bdf8' : '#22c55e',
      keyframes: index === 10
        ? [
          { id: 'kf-long-010-start', property: 'scale', time: 0, value: 1, easing: 'linear' },
          { id: 'kf-long-010-end', property: 'scale', time: LONG_FORM_CLIP_SECONDS, value: 1.03, easing: 'linear' },
        ]
        : [],
    });
  });
  const audioClips = Array.from({ length: LONG_FORM_DURATION_SECONDS / 150 }, (_, index) => {
    const start = index * 150;
    return createClip({
      id: `clip-long-a1-${String(index).padStart(3, '0')}`,
      assetId: 'asset-long-music',
      trackId: 'track-long-a1',
      name: `Long form music bed ${String(index + 1).padStart(2, '0')}`,
      kind: 'audio',
      start,
      duration: 150,
      sourceIn: start,
      color: '#a3e635',
      volume: 0.72,
      automationTags: ['bed'],
    });
  });
  const titleClips = Array.from({ length: 6 }, (_, index) => {
    const start = index * 300;
    return createClip({
      id: `clip-long-t1-${String(index).padStart(3, '0')}`,
      assetId: 'asset-long-title',
      trackId: 'track-long-t1',
      name: `Chapter ${index + 1}`,
      kind: 'text',
      start,
      duration: 6,
      sourceIn: 0,
      color: '#facc15',
      opacity: 0.94,
    });
  });

  return {
    id: 'danbi-long-form-regression',
    schemaVersion: EDITOR_PROJECT_SCHEMA_VERSION,
    name: 'Danbi Long Form Regression',
    fps: 30,
    width: 1920,
    height: 1080,
    duration: LONG_FORM_DURATION_SECONDS,
    updatedAt: '2026-06-15T00:00:00.000Z',
    assets: [
      {
        id: 'asset-long-a-roll',
        name: 'Long form A-roll',
        kind: 'video',
        source: '/imports/long-form-a-roll.mp4',
        renderPath: 'E:/media/long-form-a-roll.mp4',
        duration: LONG_FORM_DURATION_SECONDS,
        width: 1920,
        height: 1080,
        fps: 30,
        metadata: {
          hasAudio: true,
          audioChannels: 2,
          colorSpace: 'Rec.709',
        },
        mediaCache: {
          generatedAt: '2026-06-15T00:00:00.000Z',
          thumbnailSource: '/cache/media/thumbnails/long-form-a-roll-thumb.jpg',
          thumbnailPath: 'E:/cache/long-form-a-roll-thumb.jpg',
          proxySource: '/cache/media/proxies/long-form-a-roll-proxy.mp4',
          proxyPath: 'E:/cache/long-form-a-roll-proxy.mp4',
          waveformSource: '/cache/media/waveforms/long-form-a-roll-waveform.json',
          waveformPath: 'E:/cache/long-form-a-roll-waveform.json',
          waveformPeaks,
          warnings: [],
        },
      },
      {
        id: 'asset-long-music',
        name: 'Long form music bed',
        kind: 'audio',
        source: '/imports/long-form-music.wav',
        renderPath: 'E:/media/long-form-music.wav',
        duration: LONG_FORM_DURATION_SECONDS,
        metadata: {
          audioChannels: 2,
        },
        mediaCache: {
          generatedAt: '2026-06-15T00:00:00.000Z',
          waveformSource: '/cache/media/waveforms/long-form-music-waveform.json',
          waveformPath: 'E:/cache/long-form-music-waveform.json',
          waveformPeaks,
          warnings: [],
        },
      },
      {
        id: 'asset-long-title',
        name: 'Long form chapter title',
        kind: 'text',
        source: 'Chapter break',
        duration: 6,
      },
    ],
    tracks: [
      {
        id: 'track-long-v1',
        name: 'Long form A-roll',
        kind: 'video',
        muted: false,
        solo: false,
        syncLocked: false,
        volumeDb: 0,
        pan: 0,
        locked: false,
        clips: videoClips,
      },
      {
        id: 'track-long-t1',
        name: 'Long form titles',
        kind: 'text',
        muted: false,
        solo: false,
        syncLocked: true,
        volumeDb: 0,
        pan: 0,
        locked: false,
        clips: titleClips,
      },
      {
        id: 'track-long-a1',
        name: 'Long form music',
        kind: 'audio',
        muted: false,
        solo: false,
        syncLocked: true,
        volumeDb: -6,
        pan: 0,
        locked: false,
        clips: audioClips,
      },
    ],
    markers: Array.from({ length: 6 }, (_, index) => ({
      id: `marker-long-chapter-${String(index).padStart(3, '0')}`,
      time: index * 300,
      label: `Chapter ${index + 1}`,
      color: '#22c55e',
      kind: 'chapter' as const,
      duration: 4,
    })),
    captions: [
      ...Array.from({ length: 15 }, (_, index) => ({
        id: `caption-long-${String(index).padStart(3, '0')}`,
        start: index * 120 + 1,
        end: index * 120 + 5,
        text: `Long form caption ${index + 1}`,
        speaker: 'Narrator',
        confidence: 0.98,
      })),
      {
        id: 'caption-long-range-review',
        start: 301,
        end: 305,
        text: 'Range export caption',
        speaker: 'Narrator',
        confidence: 0.99,
      },
    ],
    automation: [],
    plugins: [],
    exportProfiles: [
      {
        id: 'profile-long-h264',
        label: 'Long Form H.264 Review',
        purpose: 'master',
        container: 'mp4',
        codec: 'h264',
        width: 1920,
        height: 1080,
        fps: 30,
        videoBitrateMbps: 18,
        audioBitrateKbps: 192,
        ffmpegPreset: 'fast',
        crf: 20,
      },
    ],
  };
}
