// Adapted from OpenCut Classic timeline/placement.
// Source: https://github.com/opencut-app/opencut-classic
// Commit: cf5e79e919144200294fb9fed22a222592a0aeea
// License: MIT. See third_party/NOTICE.md and docs/THIRD_PARTY_SOURCE_REGISTER_KR.md.

import type { ClipKind, EditorProject, TimelineClip, TimelineTrack, TrackKind } from './types';

export interface TimelinePlacementTimeSpan {
  start: number;
  duration: number;
  excludeClipId?: string;
}

export type TimelinePlacementStrategy =
  | { type: 'explicit'; trackId: string }
  | { type: 'firstAvailable' }
  | { type: 'preferIndex'; trackIndex: number; createNewTrackOnly?: boolean }
  | { type: 'alwaysNew'; position: 'highest' | 'default' };

export type TimelinePlacementResult =
  | {
      kind: 'existingTrack';
      trackId: string;
      trackIndex: number;
      trackKind: TrackKind;
    }
  | {
      kind: 'newTrack';
      insertIndex: number;
      trackKind: TrackKind;
    };

export function canPlaceClipKindOnTrack(clipKind: ClipKind, trackKind: TrackKind): boolean {
  return trackKindForClipKind(clipKind) === trackKind;
}

export function trackKindForClipKind(clipKind: ClipKind): TrackKind {
  if (clipKind === 'audio') {
    return 'audio';
  }

  if (clipKind === 'text') {
    return 'text';
  }

  if (clipKind === 'effect') {
    return 'effect';
  }

  return 'video';
}

export function canPlaceTimeSpansOnTrack({
  track,
  timeSpans,
}: {
  track: Pick<TimelineTrack, 'clips'>;
  timeSpans: TimelinePlacementTimeSpan[];
}): boolean {
  return timeSpans.every((timeSpan) => !track.clips.some((clip) => (
    timeSpan.excludeClipId !== clip.id && timeSpansOverlapClip(timeSpan, clip)
  )));
}

export function canPlaceTimeSpansTogether(timeSpans: TimelinePlacementTimeSpan[]): boolean {
  return timeSpans.every((timeSpan, index) => !timeSpans.some((nextSpan, nextIndex) => (
    index !== nextIndex && timeSpansOverlap(timeSpan, nextSpan)
  )));
}

export function resolveTimelineTrackPlacement({
  project,
  trackKind,
  timeSpans,
  strategy,
}: {
  project: EditorProject;
  trackKind: TrackKind;
  timeSpans: TimelinePlacementTimeSpan[];
  strategy: TimelinePlacementStrategy;
}): TimelinePlacementResult | null {
  if (strategy.type === 'explicit') {
    const trackIndex = project.tracks.findIndex((track) => track.id === strategy.trackId);
    const track = project.tracks[trackIndex];

    if (!track || track.kind !== trackKind || track.locked || !canPlaceTimeSpansOnTrack({ track, timeSpans })) {
      return null;
    }

    return {
      kind: 'existingTrack',
      trackId: track.id,
      trackIndex,
      trackKind: track.kind,
    };
  }

  if (strategy.type === 'firstAvailable') {
    const trackIndex = project.tracks.findIndex((track) => (
      track.kind === trackKind &&
      !track.locked &&
      canPlaceTimeSpansOnTrack({ track, timeSpans })
    ));

    if (trackIndex >= 0) {
      const track = project.tracks[trackIndex];
      return {
        kind: 'existingTrack',
        trackId: track.id,
        trackIndex,
        trackKind: track.kind,
      };
    }

    return resolveNewTrackPlacement(project, trackKind, 'highest');
  }

  if (strategy.type === 'preferIndex') {
    const preferredTrack = project.tracks[strategy.trackIndex];
    const canUsePreferredTrack = !strategy.createNewTrackOnly &&
      preferredTrack?.kind === trackKind &&
      !preferredTrack.locked &&
      canPlaceTimeSpansOnTrack({ track: preferredTrack, timeSpans });

    if (canUsePreferredTrack) {
      return {
        kind: 'existingTrack',
        trackId: preferredTrack.id,
        trackIndex: strategy.trackIndex,
        trackKind: preferredTrack.kind,
      };
    }

    return resolveNewTrackPlacement(project, trackKind, 'highest');
  }

  return resolveNewTrackPlacement(project, trackKind, strategy.position);
}

function resolveNewTrackPlacement(
  project: EditorProject,
  trackKind: TrackKind,
  position: 'highest' | 'default',
): TimelinePlacementResult {
  if (position === 'default') {
    return {
      kind: 'newTrack',
      insertIndex: project.tracks.length,
      trackKind,
    };
  }

  const firstSameKindIndex = project.tracks.findIndex((track) => track.kind === trackKind);
  return {
    kind: 'newTrack',
    insertIndex: firstSameKindIndex >= 0 ? firstSameKindIndex : project.tracks.length,
    trackKind,
  };
}

function timeSpansOverlapClip(timeSpan: TimelinePlacementTimeSpan, clip: Pick<TimelineClip, 'start' | 'duration'>): boolean {
  return timeSpansOverlap(timeSpan, {
    start: clip.start,
    duration: clip.duration,
  });
}

function timeSpansOverlap(first: Pick<TimelinePlacementTimeSpan, 'start' | 'duration'>, second: Pick<TimelinePlacementTimeSpan, 'start' | 'duration'>): boolean {
  const firstEnd = first.start + first.duration;
  const secondEnd = second.start + second.duration;
  return first.start < secondEnd - 0.001 && second.start < firstEnd - 0.001;
}
