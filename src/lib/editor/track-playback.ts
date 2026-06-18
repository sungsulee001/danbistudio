import type { TimelineTrack } from './types';

export type TrackPlaybackDomain = 'visual' | 'audio' | 'other';

export function isTrackPlayable(track: TimelineTrack, tracks: TimelineTrack[]): boolean {
  return isTrackPlayableForDomain(track, tracks, trackPlaybackDomain(track));
}

export function isTrackPlayableForDomain(
  track: TimelineTrack,
  tracks: TimelineTrack[],
  domain: TrackPlaybackDomain,
): boolean {
  if (track.muted) {
    return false;
  }

  if (domain === 'other') {
    return true;
  }

  return !hasSoloInDomain(tracks, domain) || Boolean(track.solo);
}

export function hasSoloInDomain(tracks: TimelineTrack[], domain: TrackPlaybackDomain): boolean {
  return tracks.some((track) => trackPlaybackDomain(track) === domain && Boolean(track.solo));
}

function trackPlaybackDomain(track: TimelineTrack): TrackPlaybackDomain {
  if (track.kind === 'audio') {
    return 'audio';
  }

  if (track.kind === 'video' || track.kind === 'text' || track.kind === 'effect') {
    return 'visual';
  }

  return 'other';
}
