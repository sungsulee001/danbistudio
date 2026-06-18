// Adapted from OpenCut Classic animation interpolation/resolve patterns.
// Source: https://github.com/opencut-app/opencut-classic
// Commit: cf5e79e919144200294fb9fed22a222592a0aeea
// License: MIT. See third_party/NOTICE.md and docs/THIRD_PARTY_SOURCE_REGISTER_KR.md.

import type { ClipKeyframe, TimelineClip } from './types';

export type NumericKeyframeProperty = ClipKeyframe['property'];
export type NumericKeyframeEasing = ClipKeyframe['easing'];

export interface NumericKeyframeSample {
  id?: string;
  property?: NumericKeyframeProperty;
  time: number;
  value: number;
  easing: NumericKeyframeEasing;
}

export interface NumericKeyframeEvaluationOptions {
  min?: number;
  max?: number;
  round?: boolean;
}

export function toNumericKeyframeSamples(
  keyframes: readonly ClipKeyframe[],
  property?: NumericKeyframeProperty,
): NumericKeyframeSample[] {
  return sortNumericKeyframes(
    keyframes
      .filter((keyframe) => (
        (property === undefined || keyframe.property === property) &&
        typeof keyframe.value === 'number' &&
        Number.isFinite(keyframe.value)
      ))
      .map((keyframe) => ({
        id: keyframe.id,
        property: keyframe.property,
        time: normalizeKeyframeSampleTime(keyframe.time),
        value: Number(keyframe.value),
        easing: keyframe.easing,
      })),
  );
}

export function sortNumericKeyframes(samples: readonly NumericKeyframeSample[]): NumericKeyframeSample[] {
  return samples.slice().sort((a, b) => a.time - b.time);
}

export function interpolateNumericKeyframes(
  samples: readonly NumericKeyframeSample[],
  time: number,
  fallback: number,
  options: NumericKeyframeEvaluationOptions = {},
): number {
  const frames = sortNumericKeyframes(samples).map((sample) => ({
    ...sample,
    time: normalizeKeyframeSampleTime(sample.time),
    value: normalizeKeyframeSampleValue(sample.value, fallback, options),
  }));

  if (frames.length === 0) {
    return finalizeKeyframeValue(fallback, options);
  }

  const sampleTime = normalizeKeyframeSampleTime(time);
  const first = frames[0];
  if (sampleTime <= first.time) {
    return finalizeKeyframeValue(first.value, options);
  }

  const last = frames[frames.length - 1];
  if (sampleTime >= last.time) {
    return finalizeKeyframeValue(last.value, options);
  }

  const nextIndex = frames.findIndex((frame) => frame.time >= sampleTime);
  const previous = frames[Math.max(0, nextIndex - 1)];
  const next = frames[nextIndex];
  if (!previous || !next) {
    return finalizeKeyframeValue(fallback, options);
  }

  if (previous.easing === 'hold' || Math.abs(next.time - previous.time) < 0.001) {
    return finalizeKeyframeValue(previous.value, options);
  }

  const progress = clampNumber((sampleTime - previous.time) / (next.time - previous.time), 0, 1);
  const easedProgress = easeKeyframeProgress(progress, previous.easing);
  const value = previous.value + (next.value - previous.value) * easedProgress;
  return finalizeKeyframeValue(value, options);
}

export function resolveClipNumericKeyframeValue(
  clip: TimelineClip,
  property: NumericKeyframeProperty,
  time: number,
  fallback: number,
  options: NumericKeyframeEvaluationOptions = {},
): number {
  return interpolateNumericKeyframes(
    toNumericKeyframeSamples(clip.keyframes, property),
    time,
    fallback,
    options,
  );
}

export function normalizeKeyframeSampleTime(time: number): number {
  return roundKeyframeNumber(Math.max(0, Number.isFinite(time) ? time : 0));
}

export function smoothKeyframeProgress(progress: number): number {
  const safeProgress = clampNumber(progress, 0, 1);
  return safeProgress * safeProgress * (3 - (2 * safeProgress));
}

export function easeKeyframeProgress(progress: number, easing: NumericKeyframeEasing): number {
  const safeProgress = clampNumber(progress, 0, 1);

  switch (easing) {
    case 'easeIn':
      return safeProgress * safeProgress;
    case 'easeOut':
      return 1 - ((1 - safeProgress) * (1 - safeProgress));
    case 'easeInOut':
    case 'smooth':
      return smoothKeyframeProgress(safeProgress);
    case 'hold':
    case 'linear':
    default:
      return safeProgress;
  }
}

function normalizeKeyframeSampleValue(
  value: number,
  fallback: number,
  options: NumericKeyframeEvaluationOptions,
): number {
  return clampKeyframeValue(Number.isFinite(value) ? value : fallback, options);
}

function finalizeKeyframeValue(value: number, options: NumericKeyframeEvaluationOptions): number {
  const clamped = clampKeyframeValue(value, options);
  return options.round === true ? roundKeyframeNumber(clamped) : clamped;
}

function clampKeyframeValue(value: number, options: NumericKeyframeEvaluationOptions): number {
  const min = options.min ?? Number.NEGATIVE_INFINITY;
  const max = options.max ?? Number.POSITIVE_INFINITY;
  return clampNumber(Number.isFinite(value) ? value : min, min, max);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundKeyframeNumber(value: number): number {
  return Math.round(value * 1000) / 1000;
}
