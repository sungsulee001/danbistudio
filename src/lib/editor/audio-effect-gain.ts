import { hasSupportedAudioCleanupEffect } from './audio-cleanup-effects';
import type { ClipEffect, TimelineClip } from './types';

export function buildStaticAudioEffectGain(clip: TimelineClip): number {
  return clip.effects
    .filter((effect) => effect.enabled && effect.type === 'audio' && hasSupportedAudioEffect(effect) && !isDuckingAudioEffect(effect))
    .reduce((gain, effect) => {
      const gainDb = getNumericParameter(effect, 'gainDb');
      const reductionDb = getNumericParameter(effect, 'reductionDb');
      const makeupGainDb = getNumericParameter(effect, 'makeupGainDb');
      return gain * audioGainDbToMultiplier(clamp(gainDb ?? reductionDb ?? makeupGainDb ?? 0, -60, 24));
    }, 1);
}

export function hasSupportedAudioEffect(effect: ClipEffect): boolean {
  return hasStaticAudioGain(effect) || isDuckingAudioEffect(effect) || hasSupportedAudioCleanupEffect(effect);
}

export function isDuckingAudioEffect(effect: ClipEffect): boolean {
  if (effect.type !== 'audio' || getNumericParameter(effect, 'reductionDb') === undefined) {
    return false;
  }

  const id = effect.id.toLowerCase();
  const label = effect.label.toLowerCase();
  return id.includes('duck') ||
    label.includes('duck') ||
    effect.parameters.attackMs !== undefined ||
    effect.parameters.releaseMs !== undefined;
}

function hasStaticAudioGain(effect: ClipEffect): boolean {
  return effect.type === 'audio' && getNumericParameter(effect, 'gainDb') !== undefined;
}

function audioGainDbToMultiplier(gainDb: number): number {
  return clamp(Math.pow(10, gainDb / 20), 0, 4);
}

function getNumericParameter(effect: ClipEffect, key: string): number | undefined {
  const value = effect.parameters[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
