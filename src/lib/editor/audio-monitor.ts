import { getClipPlaybackSpeed } from './clip-timing';
import type { ProgramPreviewLayer } from './preview';

export interface ProgramAudioMonitorState {
  canPlay: boolean;
  seekTime: number;
  playbackRate: number;
  gain: number;
  pan: number;
  reason?: string;
}

export function resolveProgramAudioMonitorState(
  layer: Pick<ProgramPreviewLayer, 'clip' | 'localTime' | 'mediaTime' | 'style'>,
  timelinePlaybackRate: number,
  monitorActive: boolean,
): ProgramAudioMonitorState {
  const seekTime = roundTo(Math.max(0, finiteNumber(layer.mediaTime, layer.localTime)), 1000);
  const gain = roundTo(clamp(finiteNumber(layer.style.volume, 1), 0, 4), 1000);
  const pan = roundTo(clamp(finiteNumber(layer.style.pan, 0), -1, 1), 100);

  if (!monitorActive) {
    return { canPlay: false, seekTime, playbackRate: 0, gain, pan, reason: 'Program monitor is inactive.' };
  }

  if (!Number.isFinite(timelinePlaybackRate) || timelinePlaybackRate <= 0) {
    return { canPlay: false, seekTime, playbackRate: 0, gain, pan, reason: 'Program monitor is not playing forward.' };
  }

  if (layer.clip.reversed) {
    return { canPlay: false, seekTime, playbackRate: 0, gain, pan, reason: 'Reverse browser audio preview is not supported.' };
  }

  return {
    canPlay: true,
    seekTime,
    playbackRate: roundTo(clamp(timelinePlaybackRate * getClipPlaybackSpeed(layer.clip, layer.localTime), 0.25, 4), 1000),
    gain,
    pan,
  };
}

function finiteNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, multiplier: number): number {
  return Math.round(value * multiplier) / multiplier;
}
