import type { EditorAsset, EditorProject, TimelineClip, TimelineTrack, TrackKind } from '../../lib/editor/types';
import { trackKindForTimelineClip } from './timeline-source-helpers';

export interface TimelineWorkspaceRange {
  start: number;
  end: number;
}

export interface TimelineViewportState {
  scrollLeft: number;
  viewportWidth: number;
}

export interface TimelineWorkspaceState {
  timelineWidth: number;
  selectedClipMoveTrackKind: TrackKind | null;
  selectedClipMoveTrackOptions: TimelineTrack[];
  activeTimelineClip?: TimelineClip;
  markedRange: TimelineWorkspaceRange | null;
  activeLoopRange: TimelineWorkspaceRange | null;
  timelineEditSnapPoints: number[];
}

export interface TimelineLoopPlaybackTogglePlan {
  loopPlaybackEnabled: boolean;
  nextPlayhead?: number;
  status: string;
}

export function resolveTimelineWorkspaceState({
  project,
  selectedClips,
  allClips,
  assetById,
  pixelsPerSecond,
  playhead,
  markIn,
  markOut,
  loopPlaybackEnabled,
}: {
  project: EditorProject;
  selectedClips: TimelineClip[];
  allClips: TimelineClip[];
  assetById: Map<string, EditorAsset>;
  pixelsPerSecond: number;
  playhead: number;
  markIn: number | null;
  markOut: number | null;
  loopPlaybackEnabled: boolean;
}): TimelineWorkspaceState {
  const selectedClipMoveTrackKind = resolveSelectedClipMoveTrackKind(selectedClips, assetById);
  const markedRange = resolveMarkedRange(markIn, markOut);

  return {
    timelineWidth: Math.max(project.duration * pixelsPerSecond, 920),
    selectedClipMoveTrackKind,
    selectedClipMoveTrackOptions: resolveSelectedClipMoveTrackOptions(
      project.tracks,
      selectedClips,
      selectedClipMoveTrackKind,
    ),
    activeTimelineClip: resolveActiveTimelineClip(allClips, playhead),
    markedRange,
    activeLoopRange: loopPlaybackEnabled ? markedRange : null,
    timelineEditSnapPoints: [playhead, markIn, markOut].filter(isFiniteNumber),
  };
}

export function resolveTimelineLoopPlaybackToggle({
  loopPlaybackEnabled,
  markedRange,
  playhead,
}: {
  loopPlaybackEnabled: boolean;
  markedRange: TimelineWorkspaceRange | null;
  playhead: number;
}): TimelineLoopPlaybackTogglePlan {
  if (loopPlaybackEnabled) {
    return {
      loopPlaybackEnabled: false,
      status: 'Loop playback off',
    };
  }

  if (!markedRange) {
    return {
      loopPlaybackEnabled: false,
      status: 'Set In and Out marks before loop playback',
    };
  }

  const nextPlayhead = playhead < markedRange.start || playhead > markedRange.end
    ? markedRange.start
    : undefined;

  return {
    loopPlaybackEnabled: true,
    ...(nextPlayhead === undefined ? {} : { nextPlayhead }),
    status: 'Loop playback on',
  };
}

export function resolveTimelineClipRenderWindow({
  scrollLeft,
  viewportWidth,
  pixelsPerSecond,
  projectDuration,
  overscanSeconds = 8,
  timelineStartOffsetPixels = 0,
}: TimelineViewportState & {
  pixelsPerSecond: number;
  projectDuration: number;
  overscanSeconds?: number;
  timelineStartOffsetPixels?: number;
}): TimelineWorkspaceRange {
  if (pixelsPerSecond <= 0 || viewportWidth <= 0 || projectDuration <= 0) {
    return { start: 0, end: Math.max(0, projectDuration) };
  }

  const timelineStartOffset = Math.max(0, timelineStartOffsetPixels);
  const viewportStartPixels = Math.max(0, scrollLeft - timelineStartOffset);
  const viewportEndPixels = Math.max(0, scrollLeft + viewportWidth - timelineStartOffset);
  const viewportStart = Math.max(0, viewportStartPixels / pixelsPerSecond);
  const viewportEnd = Math.min(projectDuration, viewportEndPixels / pixelsPerSecond);
  return {
    start: Math.max(0, roundTime(viewportStart - overscanSeconds)),
    end: Math.min(projectDuration, roundTime(viewportEnd + overscanSeconds)),
  };
}

export function filterTimelineClipsForRender(
  clips: TimelineClip[],
  renderWindow: TimelineWorkspaceRange,
  forceClipIds: Iterable<string> = [],
): TimelineClip[] {
  const forced = new Set(forceClipIds);
  return clips.filter((clip) => (
    forced.has(clip.id) ||
    (clip.start < renderWindow.end && clip.start + clip.duration > renderWindow.start)
  ));
}

export function resolveValidatedLoopPlaybackEnabled({
  loopPlaybackEnabled,
  markedRange,
}: {
  loopPlaybackEnabled: boolean;
  markedRange: TimelineWorkspaceRange | null;
}): boolean {
  return loopPlaybackEnabled && !markedRange ? false : loopPlaybackEnabled;
}

function resolveSelectedClipMoveTrackKind(
  selectedClips: TimelineClip[],
  assetById: Map<string, EditorAsset>,
): TrackKind | null {
  if (selectedClips.length === 0) {
    return null;
  }

  const kinds = Array.from(new Set(selectedClips.map((clip) => trackKindForTimelineClip(
    clip,
    clip.assetId ? assetById.get(clip.assetId) : undefined,
  ))));
  return kinds.length === 1 ? kinds[0] : null;
}

function resolveSelectedClipMoveTrackOptions(
  tracks: TimelineTrack[],
  selectedClips: TimelineClip[],
  selectedClipMoveTrackKind: TrackKind | null,
): TimelineTrack[] {
  return selectedClipMoveTrackKind
    ? tracks.filter((track) => (
      track.kind === selectedClipMoveTrackKind &&
      !track.locked &&
      selectedClips.some((clip) => clip.trackId !== track.id)
    ))
    : [];
}

function resolveActiveTimelineClip(allClips: TimelineClip[], playhead: number): TimelineClip | undefined {
  return allClips
    .filter((clip) => playhead > clip.start && playhead < clip.start + clip.duration)
    .sort((a, b) => a.start - b.start)[0];
}

function resolveMarkedRange(markIn: number | null, markOut: number | null): TimelineWorkspaceRange | null {
  if (markIn === null || markOut === null || Math.abs(markOut - markIn) < 0.001) {
    return null;
  }

  return {
    start: Math.min(markIn, markOut),
    end: Math.max(markIn, markOut),
  };
}

function isFiniteNumber(point: number | null): point is number {
  return typeof point === 'number' && Number.isFinite(point);
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}
