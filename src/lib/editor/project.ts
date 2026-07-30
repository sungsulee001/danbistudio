import type { EditorProject, TimelineClip, TimelineTrack, TrackKind } from './types';
import { defaultCaptionStyle } from './caption-style';
import { DEFAULT_COMFYUI_WORKFLOW_NAME } from '../comfyui-workflow-defaults';

const now = '2026-06-12T00:00:00.000Z';
export const DEFAULT_EXPORT_PROFILE_ID = 'profile-youtube-4k';
export const PRORES_INTERMEDIATE_PROFILE_ID = 'profile-prores-422-hq-master';

let blankProjectIdSequence = 0;

export interface BlankEditorProjectOptions {
  id?: string;
  name?: string;
  createdAt?: string;
  width?: number;
  height?: number;
  fps?: number;
  duration?: number;
}

export function createDefaultEditorProject(): EditorProject {
  return {
    id: 'danbi-demo-project',
    schemaVersion: 2,
    name: 'Danbi Studio AI Edit',
    fps: 30,
    width: 1920,
    height: 1080,
    duration: 92,
    updatedAt: now,
    assets: [
      {
        id: 'asset-interview',
        name: 'Interview master take',
        kind: 'video',
        source: '/media/interview-master.mp4',
        duration: 78,
        width: 1920,
        height: 1080,
        fps: 30,
        metadata: {
          camera: 'A-cam',
          colorSpace: 'Rec.709',
          audioCodec: 'aac',
          audioChannels: 2,
          hasAudio: true,
        },
      },
      {
        id: 'asset-bgm',
        name: 'Soft pulse bed',
        kind: 'audio',
        source: '/media/soft-pulse.wav',
        duration: 92,
      },
      {
        id: 'asset-title',
        name: 'Launch title',
        kind: 'text',
        source: 'Danbi Studio',
        duration: 5,
      },
    ],
    tracks: [
      {
        id: 'track-v1',
        name: 'A-roll',
        kind: 'video',
        muted: false,
        solo: false,
        syncLocked: false,
        volumeDb: 0,
        pan: 0,
        locked: false,
        clips: [
          createClip({
        id: 'clip-interview-1',
            assetId: 'asset-interview',
            trackId: 'track-v1',
            name: 'Founder intro',
            kind: 'video',
            start: 0,
            duration: 28,
            color: '#38bdf8',
            automationTags: ['caption', 'color-match'],
            transitionOut: {
              id: 'transition-intro-out',
              type: 'crossfade',
              duration: 0.6,
              easing: 'easeInOut',
              parameters: { preserveAudio: true },
            },
            keyframes: [
              {
                id: 'kf-intro-scale-0',
                property: 'scale',
                time: 0,
                value: 1,
                easing: 'smooth',
              },
              {
                id: 'kf-intro-scale-1',
                property: 'scale',
                time: 28,
                value: 1.04,
                easing: 'smooth',
              },
            ],
          }),
          createClip({
            id: 'clip-interview-2',
            assetId: 'asset-interview',
            trackId: 'track-v1',
            name: 'Workflow demo',
            kind: 'video',
            start: 32,
            duration: 34,
            sourceIn: 28,
            color: '#22c55e',
            automationTags: ['caption', 'stabilize'],
            effects: [
              {
                id: 'effect-stabilize',
                type: 'stabilize',
                label: 'Stabilize',
                enabled: false,
                parameters: { radius: 16, blockSize: 16, stabilizeContrast: 125 },
              },
              {
                id: 'effect-crop-mask',
                type: 'mask',
                label: 'Crop mask',
                enabled: false,
                parameters: { left: 0.05, right: 0.05, top: 0, bottom: 0 },
              },
            ],
          }),
        ],
      },
      {
        id: 'track-v2',
        name: 'AI B-roll',
        kind: 'video',
        muted: false,
        solo: false,
        syncLocked: false,
        volumeDb: 0,
        pan: 0,
        locked: false,
        clips: [
          createClip({
            id: 'clip-ai-city',
            trackId: 'track-v2',
            name: 'Generated city cutaway',
            kind: 'ai',
            start: 18,
            duration: 8,
            color: '#f59e0b',
            automationTags: ['comfyui', 'b-roll'],
            generation: {
              provider: 'comfyui',
              workflowName: DEFAULT_COMFYUI_WORKFLOW_NAME,
              prompt: 'cinematic Seoul studio, precise editing timeline, clean local AI workstation',
              seed: 240612,
              status: 'draft',
            },
          }),
        ],
      },
      {
        id: 'track-t1',
        name: 'Titles',
        kind: 'text',
        muted: false,
        solo: false,
        syncLocked: false,
        volumeDb: 0,
        pan: 0,
        locked: false,
        clips: [
          createClip({
            id: 'clip-title-1',
            assetId: 'asset-title',
            trackId: 'track-t1',
            name: 'Opening title',
            kind: 'text',
            start: 1,
            duration: 5,
            color: '#eab308',
            automationTags: ['brand-kit'],
            effects: [
              {
                id: 'effect-title-motion',
                type: 'motion',
                label: 'Slide in',
                enabled: true,
                parameters: { distance: 32, easing: 'easeOut' },
              },
            ],
          }),
        ],
      },
      {
        id: 'track-a1',
        name: 'Music',
        kind: 'audio',
        muted: false,
        solo: false,
        syncLocked: false,
        volumeDb: 0,
        pan: 0,
        locked: false,
        clips: [
          createClip({
            id: 'clip-music-1',
            assetId: 'asset-bgm',
            trackId: 'track-a1',
            name: 'Music bed',
            kind: 'audio',
            start: 0,
            duration: 92,
            color: '#a3e635',
            automationTags: ['ducking', 'loudness'],
            effects: [
              {
                id: 'effect-ducking',
                type: 'audio',
                label: 'Voice ducking',
                enabled: true,
                parameters: { reductionDb: -10, attackMs: 80 },
              },
            ],
          }),
        ],
      },
    ],
    markers: [
      {
        id: 'marker-hook',
        time: 0,
        label: 'Hook',
        color: '#22c55e',
        kind: 'chapter',
        duration: 4,
        note: 'Opening hook and brand promise.',
      },
      {
        id: 'marker-ai-demo',
        time: 18,
        label: 'AI B-roll',
        color: '#f59e0b',
        kind: 'todo',
        duration: 6,
        note: 'Check generated B-roll candidate before final export.',
      },
      {
        id: 'marker-export-check',
        time: 66,
        label: 'Export check',
        color: '#ef4444',
        kind: 'warning',
        duration: 3,
        note: 'Verify subtitles, loudness, and chapter metadata.',
      },
    ],
    captions: [
      {
        id: 'caption-1',
        start: 1.2,
        end: 4.8,
        text: 'Danbi Studio turns local AI generation into an editing workflow.',
        speaker: 'Narrator',
        confidence: 0.98,
        style: defaultCaptionStyle(),
      },
      {
        id: 'caption-2',
        start: 18.2,
        end: 23.4,
        text: 'ComfyUI jobs can be queued from selected timeline clips.',
        speaker: 'Narrator',
        confidence: 0.96,
        style: defaultCaptionStyle(),
      },
    ],
    automation: [
      {
        id: 'rule-ai-gap-fill',
        name: 'Generate B-roll for empty visual gaps',
        provider: 'comfyui',
        trigger: 'on-gap',
        workflowName: DEFAULT_COMFYUI_WORKFLOW_NAME,
        targetTrackIds: ['track-v2'],
        parameters: {
          steps: 24,
          cfg: 6,
          width: 1280,
          height: 720,
        },
      },
      {
        id: 'rule-manual-object-mask',
        name: 'Apply tracked object mask',
        provider: 'local',
        trigger: 'manual',
        targetTrackIds: ['track-v1', 'track-v2'],
        parameters: {
          objectMask: true,
          objectMaskShape: 'ellipse',
          objectMaskWidth: 0.36,
          objectMaskHeight: 0.52,
          objectMaskFeather: 0.05,
        },
      },
      {
        id: 'rule-before-export',
        name: 'Caption, loudness, color pass',
        provider: 'local',
        trigger: 'before-export',
        targetTrackIds: ['track-v1', 'track-a1'],
        parameters: {
          captions: true,
          loudnessLufs: -14,
          truePeakDb: -1.5,
          colorMatch: true,
        },
      },
    ],
    plugins: [
      {
        id: 'plugin-comfyui-bridge',
        name: 'ComfyUI Bridge',
        version: '0.1.0',
        entry: 'plugins/comfyui-bridge/index.ts',
        permissions: ['network', 'comfyui', 'project'],
        contributes: ['automation', 'effect', 'analyzer', 'workflow'],
      },
      {
        id: 'plugin-ffmpeg-renderer',
        name: 'FFmpeg Renderer',
        version: '0.1.0',
        entry: 'plugins/ffmpeg-renderer/index.ts',
        permissions: ['filesystem', 'render', 'project'],
        contributes: ['exporter', 'transition'],
      },
    ],
    exportProfiles: [
      {
        id: DEFAULT_EXPORT_PROFILE_ID,
        label: 'YouTube 4K Master',
        purpose: 'master',
        container: 'mp4',
        codec: 'h265',
        width: 3840,
        height: 2160,
        fps: 30,
        videoBitrateMbps: 45,
        audioBitrateKbps: 320,
      },
      {
        id: 'profile-short-vertical',
        label: 'Shorts/Reels 9:16',
        purpose: 'social',
        container: 'mp4',
        codec: 'h264',
        width: 1080,
        height: 1920,
        fps: 30,
        videoBitrateMbps: 16,
        audioBitrateKbps: 192,
      },
      {
        id: 'profile-proxy-review',
        label: 'Proxy Review 540p',
        purpose: 'proxy',
        container: 'mp4',
        codec: 'h264',
        width: 960,
        height: 540,
        fps: 30,
        videoBitrateMbps: 4,
        audioBitrateKbps: 128,
        ffmpegPreset: 'veryfast',
        crf: 24,
      },
      {
        id: PRORES_INTERMEDIATE_PROFILE_ID,
        label: 'ProRes 422 HQ Master',
        purpose: 'master',
        container: 'mov',
        codec: 'prores',
        width: 3840,
        height: 2160,
        fps: 30,
        videoBitrateMbps: 180,
        audioBitrateKbps: 320,
      },
    ],
  };
}

export function createBlankEditorProject(options: BlankEditorProjectOptions = {}): EditorProject {
  const defaults = createDefaultEditorProject();
  const createdAt = options.createdAt ?? new Date().toISOString();

  return {
    ...defaults,
    id: options.id ?? buildBlankProjectId(createdAt),
    name: normalizeBlankProjectName(options.name),
    width: normalizeProjectNumber(options.width, 1920, 16),
    height: normalizeProjectNumber(options.height, 1080, 16),
    fps: normalizeProjectNumber(options.fps, 30, 1),
    duration: normalizeProjectNumber(options.duration, 60, 1),
    updatedAt: createdAt,
    assets: [],
    tracks: createBlankTimelineTracks(),
    markers: [],
    captions: [],
    automation: [],
  };
}

export function createClip(clip: Partial<TimelineClip> & Pick<TimelineClip, 'id' | 'trackId' | 'name' | 'kind' | 'start' | 'duration' | 'color'>): TimelineClip {
  return {
    assetId: clip.assetId,
    id: clip.id,
    trackId: clip.trackId,
    name: clip.name,
    kind: clip.kind,
    start: clip.start,
    duration: clip.duration,
    sourceIn: clip.sourceIn ?? 0,
    color: clip.color,
    speed: clip.speed ?? 1,
    speedRamp: clip.speedRamp,
    reversed: clip.reversed ?? false,
    freezeFrameTime: clip.freezeFrameTime,
    volume: clip.volume ?? 1,
    // 미지정 클립에는 키를 만들지 않는다(기존 클립 형상 불변 — 0dB는 게인 없음과 같다)
    ...(clip.volumeDb === undefined ? {} : { volumeDb: clip.volumeDb }),
    opacity: clip.opacity ?? 1,
    blendMode: clip.blendMode ?? 'normal',
    muted: clip.muted ?? false,
    locked: clip.locked ?? false,
    automationTags: clip.automationTags ?? [],
    effects: clip.effects ?? [],
    keyframes: clip.keyframes ?? [],
    transitionIn: clip.transitionIn,
    transitionOut: clip.transitionOut,
    generation: clip.generation,
  };
}

function createBlankTimelineTracks(): TimelineTrack[] {
  return [
    createBlankTrack('track-v1', 'Video 1', 'video'),
    createBlankTrack('track-t1', 'Titles', 'text'),
    createBlankTrack('track-a1', 'Audio 1', 'audio'),
  ];
}

function createBlankTrack(id: string, name: string, kind: TrackKind): TimelineTrack {
  return {
    id,
    name,
    kind,
    muted: false,
    solo: false,
    syncLocked: false,
    volumeDb: 0,
    pan: 0,
    locked: false,
    clips: [],
  };
}

function buildBlankProjectId(createdAt: string): string {
  blankProjectIdSequence += 1;
  const timestamp = createdAt.replace(/\D/g, '').slice(0, 17) || Date.now().toString();
  return `danbi-project-${timestamp}-${blankProjectIdSequence.toString(36)}`;
}

function normalizeBlankProjectName(name?: string): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'Untitled Project';
}

function normalizeProjectNumber(value: number | undefined, fallback: number, min: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, value);
}
