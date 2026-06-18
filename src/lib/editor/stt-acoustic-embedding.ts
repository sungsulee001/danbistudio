import { getClipPlaybackSpeed } from './clip-timing';
import type { CaptionSegment, TimelineClip } from './types';
import { normalizeWaveformPeaks } from './waveform-cache';

export interface SttAcousticEmbeddingOptions {
  clip: TimelineClip;
  assetDuration: number;
  waveformPeaks?: number[];
  minPeakSamples?: number;
}

export interface SttAcousticEmbeddingResult {
  captions: CaptionSegment[];
  generatedCount: number;
  preservedCount: number;
  skippedCount: number;
}

const DEFAULT_MIN_PEAK_SAMPLES = 3;
const EMBEDDING_DIMENSIONS = 12;

export function enrichSttCaptionsWithAcousticEmbeddings(
  captions: CaptionSegment[],
  options: SttAcousticEmbeddingOptions,
): SttAcousticEmbeddingResult {
  const peaks = normalizeWaveformPeaks(options.waveformPeaks);
  const minPeakSamples = Math.max(2, Math.round(options.minPeakSamples ?? DEFAULT_MIN_PEAK_SAMPLES));
  let generatedCount = 0;
  let preservedCount = 0;
  let skippedCount = 0;

  if (captions.length === 0) {
    return { captions, generatedCount, preservedCount, skippedCount };
  }

  const enrichedCaptions = captions.map((caption) => {
    if (hasValidSpeakerEmbedding(caption)) {
      preservedCount += 1;
      return caption;
    }

    const embedding = buildCaptionAcousticEmbedding(caption, {
      ...options,
      waveformPeaks: peaks,
      minPeakSamples,
    });
    if (!embedding) {
      skippedCount += 1;
      return caption;
    }

    generatedCount += 1;
    return {
      ...caption,
      speakerEmbedding: embedding,
    };
  });

  return {
    captions: generatedCount > 0 ? enrichedCaptions : captions,
    generatedCount,
    preservedCount,
    skippedCount,
  };
}

export function buildCaptionAcousticEmbedding(
  caption: CaptionSegment,
  options: SttAcousticEmbeddingOptions,
): number[] | undefined {
  const peaks = normalizeWaveformPeaks(options.waveformPeaks);
  const minPeakSamples = Math.max(2, Math.round(options.minPeakSamples ?? DEFAULT_MIN_PEAK_SAMPLES));
  if (peaks.length < minPeakSamples || options.assetDuration <= 0 || caption.end <= caption.start) {
    return undefined;
  }

  const sourceRange = resolveCaptionSourceRange(caption, options.clip, options.assetDuration);
  const values = readWaveformPeakRange(peaks, options.assetDuration, sourceRange.start, sourceRange.end);
  if (values.length < minPeakSamples) {
    return undefined;
  }

  return buildEmbeddingFromPeaks(values);
}

function resolveCaptionSourceRange(
  caption: CaptionSegment,
  clip: TimelineClip,
  assetDuration: number,
): { start: number; end: number } {
  const speed = getClipPlaybackSpeed(clip);
  const localStart = Math.max(0, caption.start - clip.start);
  const localEnd = Math.max(localStart, caption.end - clip.start);
  const sourceStart = clip.reversed
    ? clip.sourceIn + Math.max(0, clip.duration - localEnd) * speed
    : clip.sourceIn + localStart * speed;
  const sourceEnd = clip.reversed
    ? clip.sourceIn + Math.max(0, clip.duration - localStart) * speed
    : clip.sourceIn + localEnd * speed;

  return {
    start: clamp(Math.min(sourceStart, sourceEnd), 0, assetDuration),
    end: clamp(Math.max(sourceStart, sourceEnd), 0, assetDuration),
  };
}

function readWaveformPeakRange(
  peaks: number[],
  assetDuration: number,
  sourceStart: number,
  sourceEnd: number,
): number[] {
  if (peaks.length === 0 || assetDuration <= 0 || sourceEnd <= sourceStart) {
    return [];
  }

  const startIndex = clampInteger(Math.floor((sourceStart / assetDuration) * peaks.length), 0, peaks.length - 1);
  const endIndex = clampInteger(Math.ceil((sourceEnd / assetDuration) * peaks.length), startIndex + 1, peaks.length);
  return peaks.slice(startIndex, endIndex).map((peak) => clamp(Math.abs(peak), 0, 1));
}

function buildEmbeddingFromPeaks(values: number[]): number[] | undefined {
  const max = Math.max(...values);
  if (max <= 0.001) {
    return undefined;
  }

  const normalized = values.map((value) => value / max);
  const mean = average(normalized);
  const rms = Math.sqrt(average(normalized.map((value) => value * value)));
  const normalizedMax = Math.max(...normalized);
  const min = Math.min(...normalized);
  const dynamicRange = normalizedMax - min;
  const density = normalized.filter((value) => value >= Math.max(0.08, mean * 0.65)).length / normalized.length;
  const deltas = normalized.slice(1).map((value, index) => Math.abs(value - normalized[index]));
  const averageDelta = deltas.length > 0 ? average(deltas) : 0;
  const maxDelta = deltas.length > 0 ? Math.max(...deltas) : 0;
  const firstThird = averageWindow(normalized, 0, 1 / 3);
  const middleThird = averageWindow(normalized, 1 / 3, 2 / 3);
  const lastThird = averageWindow(normalized, 2 / 3, 1);
  const centroid = normalized.reduce((sum, value, index) => sum + value * (index / Math.max(1, normalized.length - 1)), 0) /
    Math.max(0.001, normalized.reduce((sum, value) => sum + value, 0));
  const nonSilentRatio = normalized.filter((value) => value >= 0.05).length / normalized.length;

  return normalizeVector([
    mean,
    rms,
    normalizedMax,
    min,
    dynamicRange,
    density,
    averageDelta,
    maxDelta,
    firstThird,
    middleThird,
    lastThird,
    centroid,
    nonSilentRatio,
  ].slice(0, EMBEDDING_DIMENSIONS));
}

function hasValidSpeakerEmbedding(caption: CaptionSegment): boolean {
  return Array.isArray(caption.speakerEmbedding) &&
    caption.speakerEmbedding.length >= 2 &&
    caption.speakerEmbedding.every((value) => Number.isFinite(value));
}

function average(values: number[]): number {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function averageWindow(values: number[], startRatio: number, endRatio: number): number {
  const start = clampInteger(Math.floor(values.length * startRatio), 0, Math.max(0, values.length - 1));
  const end = clampInteger(Math.ceil(values.length * endRatio), start + 1, values.length);
  return average(values.slice(start, end));
}

function normalizeVector(values: number[]): number[] | undefined {
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (magnitude <= 0.001) {
    return undefined;
  }

  return values.map((value) => Math.round((value / magnitude) * 10000) / 10000);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}
