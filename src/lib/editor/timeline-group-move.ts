// Adapted from OpenCut Classic timeline/group-move.
// Source: https://github.com/opencut-app/opencut-classic
// Commit: cf5e79e919144200294fb9fed22a222592a0aeea
// License: MIT. See third_party/NOTICE.md and docs/THIRD_PARTY_SOURCE_REGISTER_KR.md.

import { canPlaceTimeSpansOnTrack, canPlaceTimeSpansTogether, trackKindForClipKind, type TimelinePlacementTimeSpan } from './timeline-placement';
import { resolveRenderableAssetMediaKind } from './renderable-media-kind';
import type { EditorAsset, EditorProject, TimelineClip, TimelineTrack, TrackKind } from './types';

export interface TimelineMoveGroupMember {
  clip: TimelineClip;
  track: TimelineTrack;
  timeOffset: number;
  trackIndex: number;
}

export interface TimelineMoveGroup {
  anchor: TimelineMoveGroupMember;
  members: TimelineMoveGroupMember[];
}

export interface TimelineGroupMovePlan {
  group: TimelineMoveGroup;
  requestedAnchorStart: number;
  appliedAnchorStart: number;
  appliedDelta: number;
  movedClips: TimelineClip[];
  constrained: boolean;
  targetTrackId?: string;
  newTrack?: TimelineGroupMoveNewTrack;
}

export type TimelineGroupMoveNewTrackPosition = 'above' | 'below';

export interface TimelineGroupMoveNewTrack {
  id: string;
  name: string;
  kind: TrackKind;
  insertIndex: number;
  position: TimelineGroupMoveNewTrackPosition;
}

export function buildTimelineMoveGroup({
  project,
  clipIds,
  anchorClipId,
}: {
  project: EditorProject;
  clipIds: string[];
  anchorClipId?: string;
}): TimelineMoveGroup | null {
  const idSet = new Set(clipIds.filter(Boolean));
  if (idSet.size === 0) {
    return null;
  }

  const items = project.tracks.flatMap((track, trackIndex) => (
    track.clips
      .filter((clip) => idSet.has(clip.id))
      .map((clip) => ({ track, trackIndex, clip }))
  ));
  if (items.length === 0) {
    return null;
  }

  const anchorItem = anchorClipId
    ? items.find((item) => item.clip.id === anchorClipId) ?? items[0]
    : items[0];
  const members = items.map((item) => ({
    ...item,
    timeOffset: roundTime(item.clip.start - anchorItem.clip.start),
  }));
  const anchor = members.find((member) => member.clip.id === anchorItem.clip.id);
  if (!anchor) {
    return null;
  }

  return { anchor, members };
}

export function resolveTimelineGroupMove({
  project,
  group,
  requestedAnchorStart,
  preventOverlap = false,
  targetTrackId,
  newTrackPosition,
}: {
  project: EditorProject;
  group: TimelineMoveGroup;
  requestedAnchorStart: number;
  preventOverlap?: boolean;
  targetTrackId?: string;
  newTrackPosition?: TimelineGroupMoveNewTrackPosition;
}): TimelineGroupMovePlan | null {
  if (targetTrackId && newTrackPosition) {
    return null;
  }

  const targetTrack = targetTrackId ? project.tracks.find((track) => track.id === targetTrackId) : undefined;
  if (targetTrackId && !targetTrack) {
    return null;
  }

  if (targetTrack && !canMoveGroupToSingleTrack(group, targetTrack, project)) {
    return null;
  }

  const newTrack = newTrackPosition
    ? resolveGroupMoveNewTrack(project, group, newTrackPosition)
    : undefined;
  if (newTrackPosition && !newTrack) {
    return null;
  }

  const requestedStart = roundTime(Math.max(0, requestedAnchorStart));
  const timelineClampedDelta = clampDeltaToTimelineStart(group, roundTime(requestedStart - group.anchor.clip.start));
  const appliedDelta = preventOverlap && !targetTrack && !newTrack
    ? clampMoveDeltaToNonOverlappingTracks(project, group.members.map((member) => member.clip.id), timelineClampedDelta)
    : timelineClampedDelta;
  const appliedAnchorStart = roundTime(Math.max(0, group.anchor.clip.start + appliedDelta));
  const movedClips = group.members.map((member) => ({
    ...member.clip,
    trackId: targetTrackId ?? newTrack?.id ?? member.clip.trackId,
    start: roundTime(Math.max(0, member.clip.start + appliedDelta)),
  }));

  if (newTrack && !canPlaceTimeSpansTogether(movedClips.map((clip) => ({
    start: clip.start,
    duration: clip.duration,
    excludeClipId: clip.id,
  })))) {
    return null;
  }

  if (targetTrack && !canPlaceMovedClipsOnTargetTrack({
    targetTrack,
    movedClips,
    movingClipIds: group.members.map((member) => member.clip.id),
  })) {
    return null;
  }

  return {
    group,
    requestedAnchorStart: requestedStart,
    appliedAnchorStart,
    appliedDelta,
    movedClips,
    constrained: Math.abs(appliedAnchorStart - requestedStart) > 0.001,
    targetTrackId: targetTrackId ?? newTrack?.id,
    newTrack,
  };
}

export function resolveTimelineGroupMoveFromProject({
  project,
  clipIds,
  anchorClipId,
  requestedAnchorStart,
  preventOverlap = false,
  targetTrackId,
  newTrackPosition,
}: {
  project: EditorProject;
  clipIds: string[];
  anchorClipId?: string;
  requestedAnchorStart: number;
  preventOverlap?: boolean;
  targetTrackId?: string;
  newTrackPosition?: TimelineGroupMoveNewTrackPosition;
}): TimelineGroupMovePlan | null {
  const group = buildTimelineMoveGroup({ project, clipIds, anchorClipId });
  if (!group) {
    return null;
  }

  return resolveTimelineGroupMove({
    project,
    group,
    requestedAnchorStart,
    preventOverlap,
    targetTrackId,
    newTrackPosition,
  });
}

export function canMoveGroupToSingleTrack(group: TimelineMoveGroup, targetTrack: TimelineTrack, project?: EditorProject): boolean {
  const clipKinds = Array.from(new Set(group.members.map((member) => trackKindForTimelineClip(
    member.clip,
    resolveClipAsset(project, member.clip),
  ))));
  return clipKinds.length === 1 && clipKinds[0] === targetTrack.kind && !targetTrack.locked;
}

export function trackKindForTimelineClip(clip: TimelineClip, asset?: EditorAsset): TrackKind {
  if (resolveRenderableAssetMediaKind(asset) === 'audio') {
    return 'audio';
  }

  return trackKindForClipKind(clip.kind);
}

function resolveGroupMoveNewTrack(
  project: EditorProject,
  group: TimelineMoveGroup,
  position: TimelineGroupMoveNewTrackPosition,
): TimelineGroupMoveNewTrack | undefined {
  const clipKinds = Array.from(new Set(group.members.map((member) => trackKindForTimelineClip(
    member.clip,
    resolveClipAsset(project, member.clip),
  ))));
  if (clipKinds.length !== 1) {
    return undefined;
  }

  const kind = clipKinds[0];
  const insertIndex = resolveNewTrackInsertIndex(project, kind, position);
  const ordinal = project.tracks.filter((track) => track.kind === kind).length + 1;
  return {
    id: uniqueTrackId(project, kind, ordinal),
    name: `${kind[0].toUpperCase()}${kind.slice(1)} ${ordinal}`,
    kind,
    insertIndex,
    position,
  };
}

function resolveClipAsset(project: EditorProject | undefined, clip: TimelineClip): EditorAsset | undefined {
  return clip.assetId ? project?.assets.find((asset) => asset.id === clip.assetId) : undefined;
}

function resolveNewTrackInsertIndex(
  project: EditorProject,
  kind: TrackKind,
  position: TimelineGroupMoveNewTrackPosition,
): number {
  const sameKindIndexes = project.tracks
    .map((track, index) => ({ track, index }))
    .filter((item) => item.track.kind === kind)
    .map((item) => item.index);

  if (sameKindIndexes.length === 0) {
    return project.tracks.length;
  }

  if (position === 'above') {
    return sameKindIndexes[0];
  }

  return sameKindIndexes[sameKindIndexes.length - 1] + 1;
}

function uniqueTrackId(project: EditorProject, kind: TrackKind, startOrdinal: number): string {
  const existingIds = new Set(project.tracks.map((track) => track.id));
  let ordinal = Math.max(1, startOrdinal);
  let id = `track-${kind}-${ordinal}`;

  while (existingIds.has(id)) {
    ordinal += 1;
    id = `track-${kind}-${ordinal}`;
  }

  return id;
}

function canPlaceMovedClipsOnTargetTrack({
  targetTrack,
  movedClips,
  movingClipIds,
}: {
  targetTrack: TimelineTrack;
  movedClips: TimelineClip[];
  movingClipIds: string[];
}): boolean {
  const movingIds = new Set(movingClipIds);
  const timeSpans: TimelinePlacementTimeSpan[] = movedClips.map((clip) => ({
    start: clip.start,
    duration: clip.duration,
    excludeClipId: clip.id,
  }));

  return canPlaceTimeSpansTogether(timeSpans) && canPlaceTimeSpansOnTrack({
    track: {
      ...targetTrack,
      clips: targetTrack.clips.filter((clip) => !movingIds.has(clip.id)),
    },
    timeSpans,
  });
}

function clampMoveDeltaToNonOverlappingTracks(
  project: EditorProject,
  movingClipIds: string[],
  deltaSeconds: number,
): number {
  const movingIds = new Set(movingClipIds);
  let minDelta = Number.NEGATIVE_INFINITY;
  let maxDelta = Number.POSITIVE_INFINITY;

  for (const track of project.tracks) {
    const movingClips = track.clips.filter((clip) => movingIds.has(clip.id));
    if (movingClips.length === 0) {
      continue;
    }

    const staticClips = track.clips.filter((clip) => !movingIds.has(clip.id));
    for (const movingClip of movingClips) {
      minDelta = Math.max(minDelta, -movingClip.start);
      const movingEnd = roundTime(movingClip.start + movingClip.duration);

      for (const staticClip of staticClips) {
        if (timeRangesOverlap(movingClip, staticClip)) {
          continue;
        }

        const staticEnd = roundTime(staticClip.start + staticClip.duration);
        if (staticEnd <= movingClip.start) {
          minDelta = Math.max(minDelta, roundTime(staticEnd - movingClip.start));
        }

        if (staticClip.start >= movingEnd) {
          maxDelta = Math.min(maxDelta, roundTime(staticClip.start - movingEnd));
        }
      }
    }
  }

  return roundTime(clampNumber(deltaSeconds, minDelta, maxDelta));
}

function clampDeltaToTimelineStart(group: TimelineMoveGroup, deltaSeconds: number): number {
  const minStart = Math.min(...group.members.map((member) => member.clip.start));
  return roundTime(Math.max(-minStart, deltaSeconds));
}

function timeRangesOverlap(first: Pick<TimelineClip, 'start' | 'duration'>, second: Pick<TimelineClip, 'start' | 'duration'>): boolean {
  return first.start < second.start + second.duration - 0.001
    && second.start < first.start + first.duration - 0.001;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}
