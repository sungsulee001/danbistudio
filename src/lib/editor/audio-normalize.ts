import { getClipSourceDuration } from './clip-timing';
import { clipHasTimelineAudio } from './media-metadata';
import { addClipEffect, expandClipIdsWithLinkedAndGroupedClips, findClip, toggleClipEffect, updateClipEffectParameters } from './timeline';
import type { ClipEffect, EditorAsset, EditorProject, TimelineClip } from './types';

export const DEFAULT_NORMALIZE_TARGET_PEAK = 0.89;
export const MIN_NORMALIZE_TARGET_PEAK = 0.05;
export const MAX_NORMALIZE_TARGET_PEAK = 1;
export const MIN_NORMALIZE_GAIN_DB = -24;
export const MAX_NORMALIZE_GAIN_DB = 12;
export const PEAK_NORMALIZE_EFFECT_LABEL = 'Peak normalize';

export interface AudioPeakNormalizePlan {
  clipId: string;
  assetId?: string;
  currentPeak: number;
  targetPeak: number;
  gainDb: number;
  rawGainDb: number;
  limited: boolean;
  sourceStart: number;
  sourceEnd: number;
  peakStartIndex: number;
  peakEndIndex: number;
}

export interface AudioPeakNormalizeSkippedClip {
  clipId: string;
  reason: string;
}

export interface AudioPeakNormalizeBatchResult {
  project: EditorProject;
  plans: AudioPeakNormalizePlan[];
  skipped: AudioPeakNormalizeSkippedClip[];
  addedCount: number;
  updatedCount: number;
  limitedCount: number;
}

export function buildAudioPeakNormalizePlan(
  clip: TimelineClip,
  asset?: EditorAsset,
  targetPeak = DEFAULT_NORMALIZE_TARGET_PEAK,
): AudioPeakNormalizePlan {
  if (!asset || !clipHasTimelineAudio(clip, asset)) {
    throw new Error('Select an audio clip or a video clip with audio.');
  }

  const peaks = asset.mediaCache?.waveformPeaks;
  if (!peaks?.length) {
    throw new Error('Waveform cache is required before peak normalize.');
  }

  const normalizedTargetPeak = normalizeTargetPeak(targetPeak);
  const range = getClipPeakRange(clip, asset);
  const peakRange = readPeakInSourceRange(peaks, asset.duration, range.start, range.end);
  if (peakRange.peak <= 0.0001) {
    throw new Error('Cannot normalize silent audio.');
  }

  const rawGainDb = roundDb(20 * Math.log10(normalizedTargetPeak / peakRange.peak));
  const gainDb = roundDb(clamp(rawGainDb, MIN_NORMALIZE_GAIN_DB, MAX_NORMALIZE_GAIN_DB));

  return {
    clipId: clip.id,
    assetId: asset.id,
    currentPeak: peakRange.peak,
    targetPeak: normalizedTargetPeak,
    gainDb,
    rawGainDb,
    limited: Math.abs(gainDb - rawGainDb) > 0.001,
    sourceStart: range.start,
    sourceEnd: range.end,
    peakStartIndex: peakRange.startIndex,
    peakEndIndex: peakRange.endIndex,
  };
}

export function buildAudioPeakNormalizeEffect(
  clip: TimelineClip,
  plan: AudioPeakNormalizePlan,
): ClipEffect {
  return {
    id: `effect-peak-normalize-${clip.id}`,
    type: 'audio',
    label: PEAK_NORMALIZE_EFFECT_LABEL,
    enabled: true,
    parameters: buildAudioPeakNormalizeEffectParameters(plan),
  };
}

export function buildAudioPeakNormalizeEffectParameters(
  plan: AudioPeakNormalizePlan,
): ClipEffect['parameters'] {
  return {
    gainDb: plan.gainDb,
    sourcePeak: plan.currentPeak,
    targetPeak: plan.targetPeak,
    rawGainDb: plan.rawGainDb,
    normalizedPeak: true,
    gainLimited: plan.limited,
  };
}

export function findPeakNormalizeEffect(clip: TimelineClip): ClipEffect | undefined {
  return clip.effects.find((effect) => (
    effect.type === 'audio' &&
    (
      effect.label === PEAK_NORMALIZE_EFFECT_LABEL ||
      effect.parameters.normalizedPeak === true
    )
  ));
}

export function applyAudioPeakNormalizeToClips(
  project: EditorProject,
  clipIds: string[],
  targetPeak = DEFAULT_NORMALIZE_TARGET_PEAK,
): AudioPeakNormalizeBatchResult {
  const requestedIds = clipIds.filter(Boolean);
  if (requestedIds.length === 0) {
    throw new Error('No target clips selected.');
  }

  const targetIds = expandClipIdsWithLinkedAndGroupedClips(project, requestedIds);
  if (targetIds.length === 0) {
    throw new Error('Target clip not found.');
  }

  let nextProject = project;
  let addedCount = 0;
  let updatedCount = 0;
  const plans: AudioPeakNormalizePlan[] = [];
  const skipped: AudioPeakNormalizeSkippedClip[] = [];

  for (const clipId of targetIds) {
    const clip = findClip(nextProject, clipId);
    if (!clip) {
      skipped.push({ clipId, reason: 'Clip not found.' });
      continue;
    }

    const asset = clip.assetId
      ? nextProject.assets.find((item) => item.id === clip.assetId)
      : undefined;

    try {
      const plan = buildAudioPeakNormalizePlan(clip, asset, targetPeak);
      const existingEffect = findPeakNormalizeEffect(clip);
      if (existingEffect) {
        const enabledProject = existingEffect.enabled
          ? nextProject
          : toggleClipEffect(nextProject, clip.id, existingEffect.id);
        nextProject = updateClipEffectParameters(
          enabledProject,
          clip.id,
          existingEffect.id,
          buildAudioPeakNormalizeEffectParameters(plan),
        );
        updatedCount += 1;
      } else {
        nextProject = addClipEffect(nextProject, clip.id, buildAudioPeakNormalizeEffect(clip, plan));
        addedCount += 1;
      }
      plans.push(plan);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('locked track') || message.includes('locked clip') || message.includes('locked track or clip')) {
        throw error;
      }

      skipped.push({ clipId, reason: message });
    }
  }

  if (plans.length === 0) {
    const reason = skipped[0]?.reason;
    throw new Error(reason ? `No selected clips could be normalized: ${reason}` : 'No selected clips could be normalized.');
  }

  return {
    project: nextProject,
    plans,
    skipped,
    addedCount,
    updatedCount,
    limitedCount: plans.filter((plan) => plan.limited).length,
  };
}

export function normalizeTargetPeak(value: number): number {
  return roundPeak(clamp(value, MIN_NORMALIZE_TARGET_PEAK, MAX_NORMALIZE_TARGET_PEAK));
}

function getClipPeakRange(clip: TimelineClip, asset: EditorAsset): { start: number; end: number } {
  const sourceStart = clamp(clip.sourceIn, 0, asset.duration);
  const sourceEnd = clamp(clip.sourceIn + getClipSourceDuration(clip), sourceStart, asset.duration);
  if (sourceEnd > sourceStart) {
    return { start: roundTime(sourceStart), end: roundTime(sourceEnd) };
  }

  return {
    start: roundTime(sourceStart),
    end: roundTime(Math.min(asset.duration, sourceStart + Math.max(0.001, asset.duration / 1000))),
  };
}

function readPeakInSourceRange(
  peaks: number[],
  assetDuration: number,
  sourceStart: number,
  sourceEnd: number,
): { peak: number; startIndex: number; endIndex: number } {
  if (peaks.length === 0 || assetDuration <= 0) {
    return { peak: 0, startIndex: 0, endIndex: 0 };
  }

  const segmentDuration = assetDuration / peaks.length;
  const startIndex = clamp(Math.floor(sourceStart / segmentDuration), 0, peaks.length - 1);
  const endIndex = clamp(Math.ceil(sourceEnd / segmentDuration) - 1, startIndex, peaks.length - 1);
  let peak = 0;

  for (let index = startIndex; index <= endIndex; index += 1) {
    peak = Math.max(peak, Math.abs(peaks[index] ?? 0));
  }

  return { peak: roundPeak(peak), startIndex, endIndex };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundDb(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundPeak(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}
