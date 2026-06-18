import type { TimelineClip, TimelineTransition } from './types';

export interface ResolvedAudioTransition {
  fadeIn?: AudioTransitionFade;
  fadeOut?: AudioTransitionFade;
}

export interface AudioTransitionFade {
  start: number;
  duration: number;
}

export function resolveClipAudioTransition(
  clip: TimelineClip,
  trackClips: TimelineClip[],
): ResolvedAudioTransition {
  const sorted = trackClips.slice().sort((a, b) => a.start - b.start);
  const index = sorted.findIndex((item) => item.id === clip.id);
  if (index < 0) {
    return {};
  }

  const previousClip = index > 0 ? sorted[index - 1] : undefined;
  const nextClip = sorted[index + 1];
  const transition: ResolvedAudioTransition = {};

  if (previousClip?.transitionOut && canFadeAudioTransition(previousClip.transitionOut)) {
    const duration = resolveOverlappedAudioTransitionDuration(previousClip, clip, previousClip.transitionOut);
    if (duration !== undefined) {
      transition.fadeIn = {
        start: roundTime(Math.max(0, previousClip.start + previousClip.duration - duration - clip.start)),
        duration,
      };
    }
  }

  if (clip.transitionOut && canFadeAudioTransition(clip.transitionOut)) {
    const duration = nextClip
      ? resolveOverlappedAudioTransitionDuration(clip, nextClip, clip.transitionOut)
      : roundTime(clamp(clip.transitionOut.duration, 0.05, clip.duration));

    if (duration !== undefined) {
      transition.fadeOut = {
        start: roundTime(Math.max(0, clip.duration - duration)),
        duration,
      };
    }
  }

  return transition;
}

export function audioTransitionGainAt(transition: ResolvedAudioTransition, clipTime: number): number {
  const time = roundTime(Math.max(0, clipTime));
  const fadeInGain = transition.fadeIn ? fadeInGainAt(transition.fadeIn, time) : 1;
  const fadeOutGain = transition.fadeOut ? fadeOutGainAt(transition.fadeOut, time) : 1;

  return roundTime(clamp(fadeInGain * fadeOutGain, 0, 1));
}

function resolveOverlappedAudioTransitionDuration(
  fromClip: TimelineClip,
  toClip: TimelineClip,
  transition: TimelineTransition,
): number | undefined {
  const overlap = roundTime(fromClip.start + fromClip.duration - toClip.start);
  if (overlap <= 0.001) {
    return undefined;
  }

  return roundTime(clamp(
    transition.duration,
    0.05,
    Math.max(0.05, Math.min(overlap, fromClip.duration, toClip.duration)),
  ));
}

function canFadeAudioTransition(transition: TimelineTransition): boolean {
  if (transition.parameters.preserveAudio === false) {
    return false;
  }

  return transition.type === 'crossfade' ||
    transition.type === 'dip' ||
    transition.type === 'push' ||
    transition.type === 'wipe';
}

function fadeInGainAt(fade: AudioTransitionFade, time: number): number {
  if (time < fade.start) {
    return 0;
  }

  if (time >= fade.start + fade.duration) {
    return 1;
  }

  return clamp((time - fade.start) / fade.duration, 0, 1);
}

function fadeOutGainAt(fade: AudioTransitionFade, time: number): number {
  if (time < fade.start) {
    return 1;
  }

  if (time >= fade.start + fade.duration) {
    return 0;
  }

  return clamp(1 - ((time - fade.start) / fade.duration), 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}
