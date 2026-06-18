export type ShuttleDirection = 'reverse' | 'stop' | 'forward';

const MAX_SHUTTLE_RATE = 4;

export interface PlaybackLoopRange {
  start: number;
  end: number;
}

export interface PlaybackAdvanceOptions {
  loopRange?: PlaybackLoopRange;
}

export function stepShuttleRate(currentRate: number, direction: ShuttleDirection): number {
  if (direction === 'stop') {
    return 0;
  }

  if (direction === 'forward') {
    if (currentRate <= 0) {
      return 1;
    }

    return Math.min(MAX_SHUTTLE_RATE, currentRate * 2);
  }

  if (currentRate >= 0) {
    return -1;
  }

  return Math.max(-MAX_SHUTTLE_RATE, currentRate * 2);
}

export function advancePlaybackTime(
  currentTime: number,
  duration: number,
  playbackRate: number,
  elapsedSeconds: number,
  options: PlaybackAdvanceOptions = {},
): number {
  const safeDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);
  const safeCurrent = clamp(currentTime, 0, safeDuration);
  const safeElapsed = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  const loopRange = normalizePlaybackLoopRange(options.loopRange, safeDuration);

  if (!Number.isFinite(playbackRate) || playbackRate === 0 || safeElapsed === 0) {
    return roundTime(safeCurrent);
  }

  if (loopRange) {
    return advanceLoopPlaybackTime(safeCurrent, playbackRate, safeElapsed, loopRange);
  }

  return roundTime(clamp(safeCurrent + playbackRate * safeElapsed, 0, safeDuration));
}

export function isPlaybackAtBoundary(
  time: number,
  duration: number,
  playbackRate: number,
  options: PlaybackAdvanceOptions = {},
): boolean {
  if (normalizePlaybackLoopRange(options.loopRange, duration)) {
    return false;
  }

  if (playbackRate > 0) {
    return time >= duration;
  }

  if (playbackRate < 0) {
    return time <= 0;
  }

  return false;
}

function advanceLoopPlaybackTime(
  currentTime: number,
  playbackRate: number,
  elapsedSeconds: number,
  range: Required<PlaybackLoopRange>,
): number {
  const rangeDuration = range.end - range.start;
  if (currentTime < range.start || currentTime > range.end) {
    return playbackRate > 0 ? roundTime(range.start) : roundTime(range.end);
  }

  const rawTime = currentTime + playbackRate * elapsedSeconds;
  if (rawTime >= range.start && rawTime <= range.end) {
    return roundTime(rawTime);
  }

  if (rawTime > range.end) {
    const overflow = (rawTime - range.start) % rangeDuration;
    return roundTime(range.start + overflow);
  }

  const underflow = (range.end - rawTime) % rangeDuration;
  return roundTime(range.end - underflow);
}

function normalizePlaybackLoopRange(range: PlaybackLoopRange | undefined, duration: number): Required<PlaybackLoopRange> | undefined {
  if (!range) {
    return undefined;
  }

  const start = clamp(Math.min(range.start, range.end), 0, duration);
  const end = clamp(Math.max(range.start, range.end), 0, duration);
  if (end - start <= 0.001) {
    return undefined;
  }

  return { start, end };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}
