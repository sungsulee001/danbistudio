import {
  advancePlaybackTime,
  isPlaybackAtBoundary,
  stepShuttleRate,
  type PlaybackAdvanceOptions,
  type PlaybackLoopRange,
  type ShuttleDirection,
} from '../../lib/editor/playback';

export type { PlaybackLoopRange, ShuttleDirection };

const MAX_PLAYBACK_FRAME_SECONDS = 0.25;

export interface PlaybackFrameState {
  playhead: number;
  playbackRate: number;
  isPlaying: boolean;
  shouldStop: boolean;
}

export interface ProgramPlaybackRateState {
  timelinePlaybackRate: number;
  isPlaying: boolean;
  activeMonitor: 'program';
}

export function resolveShuttlePlaybackRate(currentRate: number, direction: ShuttleDirection): number {
  return stepShuttleRate(currentRate, direction);
}

export function resolveProgramPlaybackRateState(rate: number): ProgramPlaybackRateState {
  return {
    timelinePlaybackRate: rate,
    isPlaying: rate !== 0,
    activeMonitor: 'program',
  };
}

export function resolveProgramPlaybackToggleRate(currentRate: number): number {
  return currentRate === 0 ? 1 : 0;
}

export function resolvePlaybackFrameElapsedSeconds(
  previousTimestamp: number | undefined,
  timestamp: number,
): number {
  if (previousTimestamp === undefined) {
    return 0;
  }

  return Math.min(MAX_PLAYBACK_FRAME_SECONDS, Math.max(0, (timestamp - previousTimestamp) / 1000));
}

export function resolvePlaybackFrameState({
  currentPlayhead,
  duration,
  playbackRate,
  elapsedSeconds,
  loopRange,
}: {
  currentPlayhead: number;
  duration: number;
  playbackRate: number;
  elapsedSeconds: number;
  loopRange?: PlaybackLoopRange | null;
}): PlaybackFrameState {
  const options: PlaybackAdvanceOptions = loopRange ? { loopRange } : {};
  const playhead = advancePlaybackTime(currentPlayhead, duration, playbackRate, elapsedSeconds, options);
  const shouldStop = isPlaybackAtBoundary(playhead, duration, playbackRate, options);

  return {
    playhead,
    playbackRate: shouldStop ? 0 : playbackRate,
    isPlaying: !shouldStop && playbackRate !== 0,
    shouldStop,
  };
}
