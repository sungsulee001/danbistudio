import { getAssetMediaTime } from './subclip';
import type { EditorAsset, TimelineClip } from './types';
import { getAverageSpeed, getSpeedAtTime, getSpeedRampSourceDuration, getSpeedRampSourceTimeOffset, hasSpeedRamp } from './speed-ramp';

export function getClipPlaybackSpeed(clip: TimelineClip, clipTime?: number): number {
  if (hasSpeedRamp(clip)) {
    return clipTime === undefined ? getAverageSpeed(clip) : getSpeedAtTime(clip, clipTime);
  }

  return clamp(clip.speed, 0.05, 8);
}

export function getClipSourceDuration(clip: TimelineClip): number {
  return hasSpeedRamp(clip)
    ? getSpeedRampSourceDuration(clip)
    : roundTime(clip.duration * getClipPlaybackSpeed(clip));
}

export function getClipSourceTime(clip: TimelineClip, clipTime: number): number {
  if (typeof clip.freezeFrameTime === 'number' && Number.isFinite(clip.freezeFrameTime)) {
    return getClipPlaybackSourceTime(clip, clamp(clip.freezeFrameTime, 0, Math.max(0, clip.duration)));
  }

  return getClipPlaybackSourceTime(clip, clipTime);
}

export function getClipMediaSourceTime(
  clip: TimelineClip,
  asset: EditorAsset | undefined,
  clipTime: number,
): number {
  return getAssetMediaTime(asset, getClipSourceTime(clip, clipTime));
}

export function getClipMediaSourceIn(
  asset: EditorAsset | undefined,
  clip: TimelineClip,
): number {
  return getAssetMediaTime(asset, clip.sourceIn);
}

function getClipPlaybackSourceTime(clip: TimelineClip, clipTime: number): number {
  const sourceOffset = hasSpeedRamp(clip)
    ? getSpeedRampSourceTimeOffset(clip, clipTime)
    : roundTime(clipTime * getClipPlaybackSpeed(clip));
  if (clip.reversed) {
    const sourceDuration = getClipSourceDuration(clip);
    return roundTime(Math.max(0, clip.sourceIn + sourceDuration - sourceOffset));
  }

  return roundTime(Math.max(0, clip.sourceIn + sourceOffset));
}

export function timelineDeltaToSourceDelta(clip: TimelineClip, deltaSeconds: number): number {
  if (hasSpeedRamp(clip) && deltaSeconds >= 0) {
    return getSpeedRampSourceTimeOffset(clip, deltaSeconds);
  }

  return roundTime(deltaSeconds * getClipPlaybackSpeed(clip));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}
