import { getClipSourceDuration } from './clip-timing';
import { normalizeClipVolume } from './audio-mixer';
import { resolveClipNumericKeyframeValue } from './keyframe-interpolation';
import { clipHasTimelineAudio } from './media-metadata';
import { resolveRenderableAssetMediaKind } from './renderable-media-kind';
import type { ClipKeyframe, EditorAsset, TimelineClip } from './types';
import { normalizeWaveformPeaks } from './waveform-cache';

export const DEFAULT_TIMELINE_WAVEFORM_BAR_COUNT = 48;
export const TIMELINE_ENVELOPE_EASING_SEGMENT_STEPS = 4;
export const TIMELINE_VOLUME_ENVELOPE_MAX_VALUE = 2;
export const TIMELINE_OPACITY_ENVELOPE_MAX_VALUE = 1;

export interface TimelineVolumeEnvelopePoint {
  time: number;
  position: number;
  value: number;
}

export interface TimelineOpacityEnvelopePoint {
  time: number;
  position: number;
  value: number;
}

export function resolveTimelineClipWaveformPeaks({
  clip,
  asset,
  peaks,
  maxBars = DEFAULT_TIMELINE_WAVEFORM_BAR_COUNT,
}: {
  clip: TimelineClip;
  asset?: EditorAsset;
  peaks?: number[];
  maxBars?: number;
}): number[] | undefined {
  const normalizedPeaks = normalizeWaveformPeaks(peaks);
  if (normalizedPeaks.length === 0) {
    return undefined;
  }

  const assetDuration = asset?.duration;
  if (!assetDuration || assetDuration <= 0) {
    return sampleWaveformBars(clip.reversed ? normalizedPeaks.slice().reverse() : normalizedPeaks, maxBars);
  }

  const sourceStart = clampNumber(clip.sourceIn, 0, assetDuration);
  const sourceEnd = clampNumber(clip.sourceIn + getClipSourceDuration(clip), sourceStart, assetDuration);
  const startIndex = clampNumber(Math.floor((sourceStart / assetDuration) * normalizedPeaks.length), 0, normalizedPeaks.length - 1);
  const endIndex = clampNumber(Math.ceil((sourceEnd / assetDuration) * normalizedPeaks.length) - 1, startIndex, normalizedPeaks.length - 1);
  const visiblePeaks = normalizedPeaks.slice(startIndex, endIndex + 1);
  const orderedPeaks = clip.reversed ? visiblePeaks.reverse() : visiblePeaks;

  return sampleWaveformBars(orderedPeaks, maxBars);
}

export function shouldRenderTimelineAudioWaveform({
  clip,
  asset,
  peaks,
}: {
  clip: TimelineClip;
  asset?: EditorAsset;
  peaks?: number[];
}): boolean {
  if (clip.kind === 'audio' || resolveRenderableAssetMediaKind(asset) === 'audio') {
    return true;
  }

  return clipHasTimelineAudio(clip, asset) && normalizeWaveformPeaks(peaks).length > 0;
}

export function resolveTimelineClipVolumeEnvelope(clip: TimelineClip): TimelineVolumeEnvelopePoint[] {
  const duration = Math.max(0, Number.isFinite(clip.duration) ? clip.duration : 0);
  if (duration <= 0) {
    return [];
  }

  const times = resolveTimelineEnvelopeTimes(clip, 'volume', duration);

  return times.map((time) => ({
    time,
    position: roundRatio(time / duration),
    value: normalizeClipVolume(resolveClipNumericKeyframeValue(clip, 'volume', time, clip.volume, {
      min: 0,
      max: TIMELINE_VOLUME_ENVELOPE_MAX_VALUE,
      round: true,
    })),
  }));
}

export function shouldRenderTimelineOpacityEnvelope(clip: TimelineClip, asset?: EditorAsset): boolean {
  if (clip.kind === 'audio' || resolveRenderableAssetMediaKind(asset) === 'audio') {
    return false;
  }

  if (Math.abs(clampNumber(clip.opacity, 0, TIMELINE_OPACITY_ENVELOPE_MAX_VALUE) - 1) > 0.001) {
    return true;
  }

  return clip.keyframes.some((keyframe) => (
    keyframe.property === 'opacity' &&
    typeof keyframe.value === 'number' &&
    Number.isFinite(keyframe.value)
  ));
}

export function resolveTimelineClipOpacityEnvelope(clip: TimelineClip, asset?: EditorAsset): TimelineOpacityEnvelopePoint[] {
  const duration = Math.max(0, Number.isFinite(clip.duration) ? clip.duration : 0);
  if (duration <= 0 || !shouldRenderTimelineOpacityEnvelope(clip, asset)) {
    return [];
  }

  const times = resolveTimelineEnvelopeTimes(clip, 'opacity', duration);

  return times.map((time) => ({
    time,
    position: roundRatio(time / duration),
    value: roundOpacity(resolveClipNumericKeyframeValue(clip, 'opacity', time, clip.opacity, {
      min: 0,
      max: TIMELINE_OPACITY_ENVELOPE_MAX_VALUE,
      round: true,
    })),
  }));
}

function resolveTimelineEnvelopeTimes(
  clip: TimelineClip,
  property: ClipKeyframe['property'],
  duration: number,
): number[] {
  const keyframes = clip.keyframes
    .filter((keyframe) => (
      keyframe.property === property &&
      typeof keyframe.value === 'number' &&
      Number.isFinite(keyframe.value)
    ))
    .map((keyframe) => ({
      time: roundTime(clampNumber(keyframe.time, 0, duration)),
      easing: keyframe.easing,
    }))
    .sort((a, b) => a.time - b.time);
  const times = new Set([0, duration].map(roundTime));

  for (let index = 0; index < keyframes.length; index += 1) {
    const keyframe = keyframes[index];
    times.add(keyframe.time);

    if (!shouldSampleEnvelopeEasing(keyframe.easing)) {
      continue;
    }

    const nextKeyframeTime = keyframes.slice(index + 1).find((candidate) => candidate.time > keyframe.time + 0.001)?.time;
    const segmentEnd = nextKeyframeTime ?? duration;
    if (segmentEnd - keyframe.time <= 0.001) {
      continue;
    }

    for (let step = 1; step < TIMELINE_ENVELOPE_EASING_SEGMENT_STEPS; step += 1) {
      times.add(roundTime(keyframe.time + ((segmentEnd - keyframe.time) * step / TIMELINE_ENVELOPE_EASING_SEGMENT_STEPS)));
    }
  }

  return Array.from(times).sort((a, b) => a - b);
}

function shouldSampleEnvelopeEasing(easing: ClipKeyframe['easing']): boolean {
  return easing === 'smooth' || easing === 'easeIn' || easing === 'easeOut' || easing === 'easeInOut';
}

export function sampleWaveformBars(peaks: number[], maxBars = DEFAULT_TIMELINE_WAVEFORM_BAR_COUNT): number[] {
  const normalizedPeaks = normalizeWaveformPeaks(peaks);
  const safeMaxBars = Math.max(1, Math.round(Number.isFinite(maxBars) ? maxBars : DEFAULT_TIMELINE_WAVEFORM_BAR_COUNT));
  if (normalizedPeaks.length <= safeMaxBars) {
    return normalizedPeaks;
  }

  const bars: number[] = [];
  for (let barIndex = 0; barIndex < safeMaxBars; barIndex += 1) {
    const start = Math.floor((barIndex / safeMaxBars) * normalizedPeaks.length);
    const end = Math.max(start + 1, Math.ceil(((barIndex + 1) / safeMaxBars) * normalizedPeaks.length));
    bars.push(roundPeak(Math.max(...normalizedPeaks.slice(start, end))));
  }

  return bars;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function roundPeak(value: number): number {
  return Math.round(Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 1000) / 1000;
}

function roundRatio(value: number): number {
  return Math.round(clampNumber(value, 0, 1) * 1000) / 1000;
}

function roundOpacity(value: number): number {
  return Math.round(clampNumber(value, 0, TIMELINE_OPACITY_ENVELOPE_MAX_VALUE) * 1000) / 1000;
}

function roundTime(value: number): number {
  return Math.round(Math.max(0, Number.isFinite(value) ? value : 0) * 1000) / 1000;
}
