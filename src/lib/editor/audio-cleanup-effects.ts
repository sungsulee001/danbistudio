import { clipHasTimelineAudio } from './media-metadata';
import { expandClipIdsWithLinkedAndGroupedClips, findClip } from './timeline';
import type { ClipBatchEditResult, ClipBatchEditSkippedClip } from './timeline';
import type { ClipEffect, EditorProject, TimelineClip } from './types';

export type AudioCleanupPresetId =
  | 'voice-clean'
  | 'noise-reduce'
  | 'broadcast-compress'
  | 'de-ess'
  | 'multiband-eq'
  | 'spectral-repair';

export interface AudioCleanupPreset {
  id: AudioCleanupPresetId;
  label: string;
  parameters: Record<string, string | number | boolean>;
}

export const AUDIO_CLEANUP_EFFECT_LABEL = 'Audio clean';

export const AUDIO_CLEANUP_PRESETS: AudioCleanupPreset[] = [
  {
    id: 'voice-clean',
    label: 'Voice clean',
    parameters: {
      audioEffect: 'voice-clean',
      highpassHz: 80,
      lowpassHz: 14000,
      noiseFloorDb: -28,
      compressorThresholdDb: -18,
      compressorRatio: 3,
      compressorAttackMs: 20,
      compressorReleaseMs: 180,
      makeupGainDb: 2,
      limiterDb: -1,
    },
  },
  {
    id: 'noise-reduce',
    label: 'Noise reduce',
    parameters: {
      audioEffect: 'noise-reduce',
      highpassHz: 70,
      noiseFloorDb: -32,
    },
  },
  {
    id: 'broadcast-compress',
    label: 'Broadcast comp',
    parameters: {
      audioEffect: 'broadcast-compress',
      compressorThresholdDb: -20,
      compressorRatio: 4,
      compressorAttackMs: 12,
      compressorReleaseMs: 220,
      makeupGainDb: 3,
      limiterDb: -1,
    },
  },
  {
    id: 'de-ess',
    label: 'De-ess',
    parameters: {
      audioEffect: 'de-ess',
      deEssFrequencyHz: 6500,
      deEssGainDb: -4,
      deEssWidth: 2,
    },
  },
  {
    id: 'multiband-eq',
    label: 'Multi-band EQ',
    parameters: {
      audioEffect: 'multiband-eq',
      eqLowFrequencyHz: 120,
      eqLowGainDb: -1.5,
      eqLowWidth: 1.1,
      eqBodyFrequencyHz: 320,
      eqBodyGainDb: 1.5,
      eqBodyWidth: 1,
      eqPresenceFrequencyHz: 3500,
      eqPresenceGainDb: 2,
      eqPresenceWidth: 1,
      eqAirFrequencyHz: 10000,
      eqAirGainDb: 1,
      eqAirWidth: 0.7,
    },
  },
  {
    id: 'spectral-repair',
    label: 'Spectral repair',
    parameters: {
      audioEffect: 'spectral-repair',
      repairHighpassHz: 45,
      repairHumFrequencyHz: 60,
      repairHumReductionDb: -14,
      repairHumWidth: 8,
      repairNoiseFloorDb: -36,
      repairHissLowpassHz: 16000,
    },
  },
];

export function findAudioCleanupPreset(presetId: AudioCleanupPresetId): AudioCleanupPreset | undefined {
  return AUDIO_CLEANUP_PRESETS.find((preset) => preset.id === presetId);
}

export function readAudioCleanupPresetId(effect: ClipEffect): AudioCleanupPresetId | undefined {
  const value = effect.parameters.audioEffect;
  return typeof value === 'string' && isAudioCleanupPresetId(value) ? value : undefined;
}

export function isAudioCleanupEffect(effect: ClipEffect): boolean {
  return effect.type === 'audio' && readAudioCleanupPresetId(effect) !== undefined;
}

export function hasSupportedAudioCleanupEffect(effect: ClipEffect): boolean {
  return isAudioCleanupEffect(effect);
}

export function findAudioCleanupEffect(clip: TimelineClip, presetId?: AudioCleanupPresetId): ClipEffect | undefined {
  return clip.effects.find((effect) => (
    isAudioCleanupEffect(effect) &&
    (presetId === undefined || readAudioCleanupPresetId(effect) === presetId)
  ));
}

export function buildFfmpegAudioCleanupFilters(clip: TimelineClip): string[] {
  return clip.effects
    .filter((effect) => effect.enabled && hasSupportedAudioCleanupEffect(effect))
    .flatMap(buildFfmpegAudioCleanupEffectFilters)
    .filter(Boolean);
}

export function applyAudioCleanupPreset(
  project: EditorProject,
  clipId: string,
  presetId: AudioCleanupPresetId,
): EditorProject {
  const preset = findAudioCleanupPreset(presetId);
  if (!preset) {
    throw new Error('Audio cleanup preset not found.');
  }

  let updated = false;
  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (clip.id !== clipId) {
        return clip;
      }

      if (track.locked || clip.locked) {
        throw new Error('Cannot edit an effect on a locked track or clip.');
      }

      const asset = clip.assetId ? project.assets.find((item) => item.id === clip.assetId) : undefined;
      if (!clipHasTimelineAudio(clip, asset)) {
        throw new Error('Audio cleanup presets are available for audio clips and video clips with audio.');
      }

      const existingEffect = findAudioCleanupEffect(clip, preset.id);
      const nextEffect: ClipEffect = {
        id: existingEffect?.id ?? `effect-audio-clean-${preset.id}-${Date.now()}-${clip.id}`,
        type: 'audio',
        label: `${AUDIO_CLEANUP_EFFECT_LABEL}: ${preset.label}`,
        enabled: true,
        parameters: { ...preset.parameters },
      };

      updated = true;
      return {
        ...clip,
        effects: existingEffect
          ? clip.effects.map((effect) => (effect.id === existingEffect.id ? nextEffect : effect))
          : [...clip.effects, nextEffect],
      };
    }),
  }));

  if (!updated) {
    throw new Error('Clip not found.');
  }

  return {
    ...project,
    tracks,
    updatedAt: new Date().toISOString(),
  };
}

export function applyAudioCleanupPresetToClips(
  project: EditorProject,
  clipIds: string[],
  presetId: AudioCleanupPresetId,
): ClipBatchEditResult {
  const preset = findAudioCleanupPreset(presetId);
  if (!preset) {
    throw new Error('Audio cleanup preset not found.');
  }

  const requestedIds = clipIds.filter(Boolean);
  if (requestedIds.length === 0) {
    throw new Error('No target clips selected.');
  }

  const targetIds = expandClipIdsWithLinkedAndGroupedClips(project, requestedIds);
  if (targetIds.length === 0) {
    throw new Error('Target clip not found.');
  }

  let nextProject = project;
  const updatedClipIds: string[] = [];
  const skipped: ClipBatchEditSkippedClip[] = [];

  for (const clipId of targetIds) {
    const clip = findClip(nextProject, clipId);
    if (!clip) {
      skipped.push({ clipId, reason: 'Clip not found.' });
      continue;
    }

    try {
      nextProject = applyAudioCleanupPreset(nextProject, clip.id, preset.id);
      updatedClipIds.push(clip.id);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('locked track') || message.includes('locked clip') || message.includes('locked track or clip')) {
        throw error;
      }

      skipped.push({ clipId: clip.id, reason: message });
    }
  }

  if (updatedClipIds.length === 0) {
    const reason = skipped[0]?.reason;
    throw new Error(reason ? `No selected clips could receive audio cleanup preset: ${reason}` : 'No selected clips could receive audio cleanup preset.');
  }

  return {
    project: nextProject,
    updatedClipIds,
    skipped,
  };
}

function buildFfmpegAudioCleanupEffectFilters(effect: ClipEffect): string[] {
  const presetId = readAudioCleanupPresetId(effect);

  switch (presetId) {
    case 'voice-clean':
      return [
        buildHighpassFilter(effect, 80),
        buildLowpassFilter(effect, 14000),
        buildNoiseReductionFilter(effect, -28),
        buildCompressorFilter(effect, -18, 3, 20, 180),
        buildLimiterFilter(effect, -1),
      ].filter(Boolean);
    case 'noise-reduce':
      return [
        buildHighpassFilter(effect, 70),
        buildNoiseReductionFilter(effect, -32),
      ].filter(Boolean);
    case 'broadcast-compress':
      return [
        buildCompressorFilter(effect, -20, 4, 12, 220),
        buildLimiterFilter(effect, -1),
      ].filter(Boolean);
    case 'de-ess':
      return [
        buildDeEssFilter(effect),
      ].filter(Boolean);
    case 'multiband-eq':
      return buildMultibandEqFilters(effect);
    case 'spectral-repair':
      return buildSpectralRepairFilters(effect);
    default:
      return [];
  }
}

function buildHighpassFilter(effect: ClipEffect, fallbackHz: number): string {
  const frequency = Math.round(readAudioNumber(effect, 'highpassHz', fallbackHz, 20, 400));
  return frequency > 0 ? `highpass=f=${frequency}` : '';
}

function buildLowpassFilter(effect: ClipEffect, fallbackHz: number): string {
  const frequency = Math.round(readAudioNumber(effect, 'lowpassHz', fallbackHz, 2000, 22000));
  return frequency > 0 ? `lowpass=f=${frequency}` : '';
}

function buildNoiseReductionFilter(effect: ClipEffect, fallbackNoiseFloorDb: number): string {
  const noiseFloorDb = readAudioNumber(effect, 'noiseFloorDb', fallbackNoiseFloorDb, -80, -10);
  return `afftdn=nf=${formatAudioNumber(noiseFloorDb)}`;
}

function buildCompressorFilter(
  effect: ClipEffect,
  fallbackThresholdDb: number,
  fallbackRatio: number,
  fallbackAttackMs: number,
  fallbackReleaseMs: number,
): string {
  const thresholdDb = readAudioNumber(effect, 'compressorThresholdDb', fallbackThresholdDb, -60, 0);
  const ratio = readAudioNumber(effect, 'compressorRatio', fallbackRatio, 1, 20);
  const attack = readAudioNumber(effect, 'compressorAttackMs', fallbackAttackMs, 0.01, 2000);
  const release = readAudioNumber(effect, 'compressorReleaseMs', fallbackReleaseMs, 10, 5000);
  const threshold = Math.pow(10, thresholdDb / 20);

  return `acompressor=threshold=${formatAudioNumber(threshold)}:ratio=${formatAudioNumber(ratio)}:attack=${formatAudioNumber(attack)}:release=${formatAudioNumber(release)}:makeup=1`;
}

function buildLimiterFilter(effect: ClipEffect, fallbackLimiterDb: number): string {
  const limiterDb = readAudioNumber(effect, 'limiterDb', fallbackLimiterDb, -24, 0);
  const limit = Math.pow(10, limiterDb / 20);
  return `alimiter=limit=${formatAudioNumber(limit)}`;
}

function buildDeEssFilter(effect: ClipEffect): string {
  const frequency = Math.round(readAudioNumber(effect, 'deEssFrequencyHz', 6500, 3000, 12000));
  const gain = readAudioNumber(effect, 'deEssGainDb', -4, -18, 0);
  const width = readAudioNumber(effect, 'deEssWidth', 2, 0.1, 8);
  return `equalizer=f=${frequency}:t=q:w=${formatAudioNumber(width)}:g=${formatAudioNumber(gain)}`;
}

function buildMultibandEqFilters(effect: ClipEffect): string[] {
  return [
    buildEqualizerBandFilter(effect, 'eqLow', 120, -1.5, 1.1),
    buildEqualizerBandFilter(effect, 'eqBody', 320, 1.5, 1),
    buildEqualizerBandFilter(effect, 'eqPresence', 3500, 2, 1),
    buildEqualizerBandFilter(effect, 'eqAir', 10000, 1, 0.7),
  ].filter(Boolean);
}

function buildEqualizerBandFilter(
  effect: ClipEffect,
  prefix: string,
  fallbackFrequencyHz: number,
  fallbackGainDb: number,
  fallbackWidth: number,
): string {
  const frequency = Math.round(readAudioNumber(effect, `${prefix}FrequencyHz`, fallbackFrequencyHz, 20, 20000));
  const gain = readAudioNumber(effect, `${prefix}GainDb`, fallbackGainDb, -18, 18);
  const width = readAudioNumber(effect, `${prefix}Width`, fallbackWidth, 0.1, 8);
  if (Math.abs(gain) < 0.001) {
    return '';
  }

  return `equalizer=f=${frequency}:t=q:w=${formatAudioNumber(width)}:g=${formatAudioNumber(gain)}`;
}

function buildSpectralRepairFilters(effect: ClipEffect): string[] {
  const humFrequency = Math.round(readAudioNumber(effect, 'repairHumFrequencyHz', 60, 45, 65));
  const humReductionDb = readAudioNumber(effect, 'repairHumReductionDb', -14, -30, 0);
  const humWidth = readAudioNumber(effect, 'repairHumWidth', 8, 1, 30);
  const hissLowpassHz = Math.round(readAudioNumber(effect, 'repairHissLowpassHz', 16000, 4000, 22000));

  return [
    buildRepairHighpassFilter(effect),
    buildNoiseReductionFilter(effect, readAudioNumber(effect, 'repairNoiseFloorDb', -36, -80, -10)),
    buildNotchFilter(humFrequency, humReductionDb, humWidth),
    buildNotchFilter(humFrequency * 2, humReductionDb * 0.75, humWidth),
    buildNotchFilter(humFrequency * 3, humReductionDb * 0.5, humWidth),
    hissLowpassHz < 22000 ? `lowpass=f=${hissLowpassHz}` : '',
  ].filter(Boolean);
}

function buildRepairHighpassFilter(effect: ClipEffect): string {
  const frequency = Math.round(readAudioNumber(effect, 'repairHighpassHz', 45, 20, 200));
  return frequency > 0 ? `highpass=f=${frequency}` : '';
}

function buildNotchFilter(frequency: number, gainDb: number, width: number): string {
  if (frequency > 20000 || Math.abs(gainDb) < 0.001) {
    return '';
  }

  return `equalizer=f=${Math.round(frequency)}:t=q:w=${formatAudioNumber(width)}:g=${formatAudioNumber(gainDb)}`;
}

function isAudioCleanupPresetId(value: string): value is AudioCleanupPresetId {
  return AUDIO_CLEANUP_PRESETS.some((preset) => preset.id === value);
}

function readAudioNumber(effect: ClipEffect, key: string, fallback: number, min: number, max: number): number {
  const value = effect.parameters[key];
  return clamp(typeof value === 'number' && Number.isFinite(value) ? value : fallback, min, max);
}

function formatAudioNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
