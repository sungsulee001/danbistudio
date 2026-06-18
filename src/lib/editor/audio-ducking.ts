import { isDuckingAudioEffect } from './audio-effect-gain';
import { clipHasTimelineAudio, hasEmbeddedAudio } from './media-metadata';
import { resolveRenderableAssetMediaKind } from './renderable-media-kind';
import type { EditorAsset, TimelineClip } from './types';

export interface AudioDuckingContext {
  clip: TimelineClip;
  asset: EditorAsset;
}

export interface AudioDuckingInterval {
  start: number;
  end: number;
}

export interface AudioDuckingSettings {
  factor: number;
  attackSeconds: number;
  releaseSeconds: number;
}

export function buildAudioDuckingIntervalsForClip(
  clip: TimelineClip,
  audioClips: AudioDuckingContext[],
): AudioDuckingInterval[] {
  if (!resolveAudioDuckingSettings(clip)) {
    return [];
  }

  const clipStart = clip.start;
  const clipEnd = clip.start + clip.duration;
  const intervals = audioClips
    .filter((context) => context.clip.id !== clip.id && isDuckingSourceClip(context.clip, context.asset))
    .map((context) => ({
      start: Math.max(0, context.clip.start - clipStart),
      end: Math.min(clip.duration, context.clip.start + context.clip.duration - clipStart),
    }))
    .filter((interval) => interval.end > interval.start && interval.end > 0 && interval.start < clipEnd - clipStart)
    .sort((a, b) => a.start - b.start);

  return mergeDuckingIntervals(intervals);
}

export function audioDuckingGainAt(
  clip: TimelineClip,
  intervals: AudioDuckingInterval[],
  clipTime: number,
): number {
  const settings = resolveAudioDuckingSettings(clip);
  if (!settings || intervals.length === 0) {
    return 1;
  }

  const time = roundTime(Math.max(0, clipTime));
  for (const interval of intervals) {
    const attackStart = Math.max(0, interval.start - settings.attackSeconds);
    if (settings.attackSeconds > 0.001 && interval.start > 0.001 && time >= attackStart && time <= interval.start) {
      const attackDuration = Math.max(0.001, interval.start - attackStart);
      const ratio = clamp((time - attackStart) / attackDuration, 0, 1);
      return roundTime(1 + (settings.factor - 1) * ratio);
    }

    if (time >= interval.start && time <= interval.end) {
      return settings.factor;
    }

    const releaseEnd = interval.end + settings.releaseSeconds;
    if (settings.releaseSeconds > 0.001 && time >= interval.end && time <= releaseEnd) {
      const ratio = clamp((time - interval.end) / settings.releaseSeconds, 0, 1);
      return roundTime(settings.factor + (1 - settings.factor) * ratio);
    }
  }

  return 1;
}

export function resolveAudioDuckingSettings(clip: TimelineClip): AudioDuckingSettings | undefined {
  const effect = clip.effects.find((item) => item.enabled && isDuckingAudioEffect(item));
  if (!effect) {
    return undefined;
  }

  return {
    factor: roundTime(clamp(Math.pow(10, readNumericParameter(effect.parameters.reductionDb, -10, -60, 0) / 20), 0, 1)),
    attackSeconds: readNumericParameter(effect.parameters.attackMs, 80, 0, 2000) / 1000,
    releaseSeconds: readNumericParameter(effect.parameters.releaseMs, 250, 0, 3000) / 1000,
  };
}

function isDuckingSourceClip(clip: TimelineClip, asset: EditorAsset): boolean {
  if (!clipHasTimelineAudio(clip, asset)) {
    return false;
  }

  if (clip.effects.some((effect) => effect.enabled && isDuckingAudioEffect(effect))) {
    return false;
  }

  if (clip.automationTags.includes('caption') || clip.automationTags.includes('voice') || clip.automationTags.includes('dialogue')) {
    return true;
  }

  return asset.kind === 'video' ||
    hasEmbeddedAudio(asset) ||
    (asset.kind === 'ai' && resolveRenderableAssetMediaKind(asset) === 'audio');
}

function mergeDuckingIntervals(intervals: AudioDuckingInterval[]): AudioDuckingInterval[] {
  return intervals.reduce<AudioDuckingInterval[]>((merged, interval) => {
    const previous = merged[merged.length - 1];
    if (!previous || interval.start > previous.end + 0.05) {
      merged.push({
        start: roundTime(interval.start),
        end: roundTime(interval.end),
      });
      return merged;
    }

    previous.end = roundTime(Math.max(previous.end, interval.end));
    return merged;
  }, []);
}

function readNumericParameter(value: unknown, fallback: number, min: number, max: number): number {
  return clamp(typeof value === 'number' && Number.isFinite(value) ? value : fallback, min, max);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}
