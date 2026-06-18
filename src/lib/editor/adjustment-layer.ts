import { isRenderableVisualMediaAsset } from './renderable-media-kind';
import { isTrackPlayableForDomain } from './track-playback';
import type { ClipEffect, EditorAsset, EditorProject, TimelineClip, TimelineTrack } from './types';

export interface AdjustmentLayerAddOptions {
  start: number;
  duration?: number;
  name?: string;
  effects?: ClipEffect[];
}

export interface AdjustmentLayerAddResult {
  project: EditorProject;
  track: TimelineTrack;
  clip: TimelineClip;
}

export interface ResolvedAdjustmentEffect {
  layerClipId: string;
  layerName: string;
  layerStart: number;
  layerEnd: number;
  effect: ClipEffect;
}

export type AdjustmentCoverageMode = 'point' | 'overlap' | 'full-clip';

const ADJUSTMENT_LAYER_COLOR = '#a855f7';
const DEFAULT_ADJUSTMENT_DURATION = 10;

export function addAdjustmentLayerAtTime(
  project: EditorProject,
  options: AdjustmentLayerAddOptions,
): AdjustmentLayerAddResult {
  const maxStart = Math.max(0, project.duration - 0.25);
  const start = roundTime(clamp(options.start, 0, maxStart));
  const fallbackDuration = Math.min(DEFAULT_ADJUSTMENT_DURATION, Math.max(0.25, project.duration - start));
  const requestedDuration = options.duration ?? fallbackDuration;
  const duration = roundTime(clamp(requestedDuration, 0.25, Math.max(0.25, project.duration - start)));
  const trackResult = resolveAdjustmentTrack(project, start, duration);
  const clipIndex = trackResult.track.clips.length + 1;
  const stamp = Date.now();
  const clip: TimelineClip = {
    id: `clip-adjustment-${stamp}`,
    trackId: trackResult.track.id,
    name: normalizeAdjustmentLayerName(options.name, clipIndex),
    kind: 'effect',
    start,
    duration,
    sourceIn: 0,
    color: ADJUSTMENT_LAYER_COLOR,
    speed: 1,
    reversed: false,
    volume: 1,
    opacity: 1,
    blendMode: 'normal',
    muted: false,
    locked: false,
    automationTags: ['adjustment', 'effect'],
    effects: options.effects?.map((effect, index) => ({
      ...effect,
      id: effect.id || `effect-adjustment-${stamp}-${index + 1}`,
      enabled: effect.enabled !== false,
      parameters: { ...effect.parameters },
    })) ?? [],
    keyframes: [],
  };
  const tracks = trackResult.project.tracks.map((track) => (
    track.id === trackResult.track.id
      ? {
        ...track,
        clips: [...track.clips, clip].sort((left, right) => left.start - right.start || left.id.localeCompare(right.id)),
      }
      : track
  ));

  return {
    project: {
      ...trackResult.project,
      tracks,
      updatedAt: new Date().toISOString(),
    },
    track: {
      ...trackResult.track,
      clips: [...trackResult.track.clips, clip],
    },
    clip,
  };
}

export function isAdjustmentLayerClip(clip: TimelineClip, asset?: EditorAsset): boolean {
  return clip.kind === 'effect' || asset?.kind === 'effect';
}

export function isAdjustmentLayerEffect(effect: ClipEffect): boolean {
  return effect.enabled && (
    effect.type === 'color' ||
    effect.type === 'filter' ||
    effect.type === 'ai'
  );
}

export function isAdjustmentLayerTarget(clip: TimelineClip, asset?: EditorAsset): boolean {
  return clip.kind === 'video' ||
    clip.kind === 'image' ||
    isRenderableVisualMediaAsset(asset);
}

export function resolveAdjustmentEffectsForClip(
  project: EditorProject,
  clip: TimelineClip,
  asset: EditorAsset | undefined,
  mode: AdjustmentCoverageMode,
  time = clip.start,
): ResolvedAdjustmentEffect[] {
  if (!isAdjustmentLayerTarget(clip, asset)) {
    return [];
  }

  const targetTrackIndex = project.tracks.findIndex((track) => track.id === clip.trackId);
  if (targetTrackIndex < 0) {
    return [];
  }

  return project.tracks
    .map((track, trackIndex) => ({ track, trackIndex }))
    .filter(({ track, trackIndex }) => (
      trackIndex > targetTrackIndex &&
      track.kind === 'effect' &&
      isTrackPlayableForDomain(track, project.tracks, 'visual')
    ))
    .flatMap(({ track }) => track.clips
      .filter((layerClip) => (
        !layerClip.muted &&
        isAdjustmentLayerClip(layerClip) &&
        adjustmentLayerCoversClip(layerClip, clip, mode, time)
      ))
      .sort((left, right) => left.start - right.start || left.id.localeCompare(right.id))
      .flatMap((layerClip) => layerClip.effects
        .filter(isAdjustmentLayerEffect)
        .map((effect) => ({
          layerClipId: layerClip.id,
          layerName: layerClip.name,
          layerStart: layerClip.start,
          layerEnd: layerClip.start + layerClip.duration,
          effect,
        }))));
}

export function buildClipWithAdjustmentEffects(
  project: EditorProject,
  clip: TimelineClip,
  asset: EditorAsset | undefined,
  mode: AdjustmentCoverageMode,
  time = clip.start,
): TimelineClip {
  const adjustmentEffects = resolveAdjustmentEffectsForClip(project, clip, asset, mode, time);
  if (adjustmentEffects.length === 0) {
    return clip;
  }

  return {
    ...clip,
    effects: [
      ...clip.effects,
      ...adjustmentEffects.map(({ layerClipId, layerName, layerStart, layerEnd, effect }) => ({
        ...effect,
        id: `adjustment-${layerClipId}-${effect.id}`,
        label: `Adjustment: ${effect.label}`,
        parameters: {
          ...effect.parameters,
          adjustmentLayerClipId: layerClipId,
          adjustmentLayerName: layerName,
          adjustmentLayerStart: roundTime(layerStart),
          adjustmentLayerEnd: roundTime(layerEnd),
        },
      })),
    ],
  };
}

function resolveAdjustmentTrack(
  project: EditorProject,
  start: number,
  duration: number,
): { project: EditorProject; track: TimelineTrack } {
  const availableTrack = project.tracks.find((track) => (
    track.kind === 'effect' &&
    !track.locked &&
    !trackHasRangeOverlap(track, start, duration)
  ));
  if (availableTrack) {
    return { project, track: availableTrack };
  }

  const trackCount = project.tracks.filter((track) => track.kind === 'effect').length + 1;
  const track: TimelineTrack = {
    id: `track-adjustment-${Date.now()}`,
    name: `Adjustment ${trackCount}`,
    kind: 'effect',
    muted: false,
    solo: false,
    syncLocked: false,
    volumeDb: 0,
    pan: 0,
    locked: false,
    clips: [],
  };

  return {
    project: {
      ...project,
      tracks: [...project.tracks, track],
    },
    track,
  };
}

function adjustmentLayerCoversClip(
  layerClip: TimelineClip,
  targetClip: TimelineClip,
  mode: AdjustmentCoverageMode,
  time: number,
): boolean {
  const layerStart = layerClip.start;
  const layerEnd = layerClip.start + layerClip.duration;

  if (mode === 'point') {
    return time >= layerStart - 0.001 && time <= layerEnd + 0.001;
  }

  if (mode === 'overlap') {
    return layerStart < targetClip.start + targetClip.duration - 0.001 &&
      targetClip.start < layerEnd - 0.001;
  }

  return layerStart <= targetClip.start + 0.001 &&
    layerEnd >= targetClip.start + targetClip.duration - 0.001;
}

function trackHasRangeOverlap(track: TimelineTrack, start: number, duration: number): boolean {
  const end = start + duration;
  return track.clips.some((clip) => start < clip.start + clip.duration - 0.001 && clip.start < end - 0.001);
}

function normalizeAdjustmentLayerName(name: string | undefined, index: number): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : `Adjustment Layer ${index}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}
