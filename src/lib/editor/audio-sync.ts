import { getClipSourceDuration } from './clip-timing';
import { clipHasTimelineAudio } from './media-metadata';
import { clampClipMoveDelta, findClip, linkAudioVideoClips, moveClips } from './timeline';
import type { EditorAsset, EditorProject, TimelineClip } from './types';

export interface WaveformSyncOptions {
  maxOffsetSeconds?: number;
  minConfidence?: number;
  preventOverlap?: boolean;
}

export interface WaveformSyncPlan {
  referenceClipId: string;
  targetClipId: string;
  referenceAssetId?: string;
  targetAssetId?: string;
  lagSeconds: number;
  targetStart: number;
  requestedDelta: number;
  appliedDelta: number;
  confidence: number;
  comparedSamples: number;
  sampleDuration: number;
  warnings: string[];
}

interface ClipWaveformSegment {
  values: number[];
  sampleDuration: number;
}

interface SyncSearchResult {
  lagSamples: number;
  confidence: number;
  comparedSamples: number;
}

const DEFAULT_MAX_OFFSET_SECONDS = 30;
const DEFAULT_MIN_CONFIDENCE = 0.35;
const MIN_COMPARED_SAMPLES = 3;

export function buildWaveformSyncPlan(
  project: EditorProject,
  referenceClipId: string,
  targetClipId: string,
  options: WaveformSyncOptions = {},
): WaveformSyncPlan {
  if (referenceClipId === targetClipId) {
    throw new Error('Select two different clips for waveform sync.');
  }

  const referenceClip = findClip(project, referenceClipId);
  const targetClip = findClip(project, targetClipId);
  if (!referenceClip || !targetClip) {
    throw new Error('Select two timeline clips for waveform sync.');
  }

  const referenceAsset = findClipAsset(project, referenceClip);
  const targetAsset = findClipAsset(project, targetClip);
  assertSyncableClip(referenceClip, referenceAsset, 'reference');
  assertSyncableClip(targetClip, targetAsset, 'target');

  const sampleDuration = resolveCommonSampleDuration(referenceAsset!, targetAsset!);
  const referenceSegment = buildClipWaveformSegment(referenceClip, referenceAsset!, sampleDuration);
  const targetSegment = buildClipWaveformSegment(targetClip, targetAsset!, sampleDuration);
  const maxLagSamples = Math.max(1, Math.round(normalizeMaxOffset(options.maxOffsetSeconds) / sampleDuration));
  const result = findBestWaveformLag(referenceSegment.values, targetSegment.values, maxLagSamples);

  if (result.comparedSamples < MIN_COMPARED_SAMPLES) {
    throw new Error('Waveform sync needs more overlapping waveform samples.');
  }

  const confidence = roundConfidence(result.confidence);
  const minConfidence = normalizeConfidence(options.minConfidence);
  const lagSeconds = roundTime(result.lagSamples * sampleDuration);
  const targetStart = roundTime(referenceClip.start - lagSeconds);
  const requestedDelta = roundTime(targetStart - targetClip.start);
  const appliedDelta = options.preventOverlap === false
    ? Math.max(-targetClip.start, requestedDelta)
    : clampClipMoveDelta(project, [targetClip.id], requestedDelta);
  const warnings: string[] = [];

  if (confidence < minConfidence) {
    warnings.push(`Waveform match confidence ${confidence.toFixed(2)} is below ${minConfidence.toFixed(2)}.`);
  }

  if (Math.abs(appliedDelta - requestedDelta) > 0.001) {
    warnings.push('Target clip movement was clamped by the timeline start or neighboring clips.');
  }

  return {
    referenceClipId: referenceClip.id,
    targetClipId: targetClip.id,
    referenceAssetId: referenceAsset?.id,
    targetAssetId: targetAsset?.id,
    lagSeconds,
    targetStart: roundTime(targetClip.start + appliedDelta),
    requestedDelta,
    appliedDelta,
    confidence,
    comparedSamples: result.comparedSamples,
    sampleDuration: roundTime(sampleDuration),
    warnings,
  };
}

export function applyWaveformSync(
  project: EditorProject,
  referenceClipId: string,
  targetClipId: string,
  options: WaveformSyncOptions = {},
): { project: EditorProject; plan: WaveformSyncPlan } {
  const plan = buildWaveformSyncPlan(project, referenceClipId, targetClipId, options);
  if (Math.abs(plan.appliedDelta) < 0.001) {
    return { project, plan };
  }

  return {
    project: moveClips(project, [targetClipId], plan.appliedDelta, {
      preventOverlap: options.preventOverlap !== false,
    }),
    plan,
  };
}

export function applyWaveformSyncAndLink(
  project: EditorProject,
  referenceClipId: string,
  targetClipId: string,
  options: WaveformSyncOptions = {},
): { project: EditorProject; plan: WaveformSyncPlan } {
  const synced = applyWaveformSync(project, referenceClipId, targetClipId, options);
  return {
    project: linkAudioVideoClips(synced.project, referenceClipId, targetClipId),
    plan: synced.plan,
  };
}

function findClipAsset(project: EditorProject, clip: TimelineClip): EditorAsset | undefined {
  return clip.assetId ? project.assets.find((asset) => asset.id === clip.assetId) : undefined;
}

function assertSyncableClip(clip: TimelineClip, asset: EditorAsset | undefined, role: 'reference' | 'target') {
  if (!asset || !clipHasTimelineAudio(clip, asset)) {
    throw new Error(`The ${role} clip must have timeline audio.`);
  }

  if (!asset.mediaCache?.waveformPeaks?.length) {
    throw new Error(`The ${role} clip needs waveform cache before audio sync.`);
  }
}

function resolveCommonSampleDuration(referenceAsset: EditorAsset, targetAsset: EditorAsset): number {
  const referencePeaks = referenceAsset.mediaCache?.waveformPeaks ?? [];
  const targetPeaks = targetAsset.mediaCache?.waveformPeaks ?? [];
  const referenceSampleDuration = referenceAsset.duration > 0 && referencePeaks.length > 0
    ? referenceAsset.duration / referencePeaks.length
    : 1;
  const targetSampleDuration = targetAsset.duration > 0 && targetPeaks.length > 0
    ? targetAsset.duration / targetPeaks.length
    : 1;

  return Math.max(0.001, Math.min(referenceSampleDuration, targetSampleDuration));
}

function buildClipWaveformSegment(
  clip: TimelineClip,
  asset: EditorAsset,
  sampleDuration: number,
): ClipWaveformSegment {
  const peaks = asset.mediaCache?.waveformPeaks ?? [];
  const sourceDuration = getClipSourceDuration(clip);
  const start = clamp(clip.sourceIn, 0, asset.duration);
  const end = clamp(clip.sourceIn + sourceDuration, start, asset.duration);
  const values: number[] = [];

  for (let time = start; time < end - 0.0001; time += sampleDuration) {
    values.push(readPeakAtSourceTime(peaks, asset.duration, time));
  }

  return {
    values: normalizeWaveform(values),
    sampleDuration,
  };
}

function readPeakAtSourceTime(peaks: number[], duration: number, time: number): number {
  if (peaks.length === 0 || duration <= 0) {
    return 0;
  }

  const index = clampInteger(Math.floor((clamp(time, 0, duration) / duration) * peaks.length), 0, peaks.length - 1);
  return Math.abs(peaks[index] ?? 0);
}

function normalizeWaveform(values: number[]): number[] {
  if (values.length === 0) {
    return [];
  }

  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const centered = values.map((value) => value - mean);
  const maxAbs = Math.max(...centered.map((value) => Math.abs(value)), 0.0001);
  return centered.map((value) => value / maxAbs);
}

function findBestWaveformLag(reference: number[], target: number[], maxLagSamples: number): SyncSearchResult {
  let best: SyncSearchResult = { lagSamples: 0, confidence: -1, comparedSamples: 0 };
  const minimumOverlap = Math.max(MIN_COMPARED_SAMPLES, Math.floor(Math.min(reference.length, target.length) * 0.5));
  const minLag = -Math.min(maxLagSamples, Math.max(0, reference.length - MIN_COMPARED_SAMPLES));
  const maxLag = Math.min(maxLagSamples, Math.max(0, target.length - MIN_COMPARED_SAMPLES));

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    const score = scoreWaveformLag(reference, target, lag);
    if (
      score.comparedSamples >= minimumOverlap &&
      (
        score.confidence > best.confidence ||
        (Math.abs(score.confidence - best.confidence) <= 0.0001 && Math.abs(lag) < Math.abs(best.lagSamples))
      )
    ) {
      best = { lagSamples: lag, confidence: score.confidence, comparedSamples: score.comparedSamples };
    }
  }

  return best;
}

function scoreWaveformLag(reference: number[], target: number[], lag: number): { confidence: number; comparedSamples: number } {
  let dot = 0;
  let referenceEnergy = 0;
  let targetEnergy = 0;
  let comparedSamples = 0;

  for (let referenceIndex = 0; referenceIndex < reference.length; referenceIndex += 1) {
    const targetIndex = referenceIndex + lag;
    if (targetIndex < 0 || targetIndex >= target.length) {
      continue;
    }

    const referenceValue = reference[referenceIndex] ?? 0;
    const targetValue = target[targetIndex] ?? 0;
    dot += referenceValue * targetValue;
    referenceEnergy += referenceValue * referenceValue;
    targetEnergy += targetValue * targetValue;
    comparedSamples += 1;
  }

  const denominator = Math.sqrt(referenceEnergy * targetEnergy);
  return {
    confidence: denominator > 0.0001 ? dot / denominator : 0,
    comparedSamples,
  };
}

function normalizeMaxOffset(value: number | undefined): number {
  return clamp(value ?? DEFAULT_MAX_OFFSET_SECONDS, 0.1, 3600);
}

function normalizeConfidence(value: number | undefined): number {
  return clamp(value ?? DEFAULT_MIN_CONFIDENCE, -1, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roundConfidence(value: number): number {
  return Math.round(value * 1000) / 1000;
}
