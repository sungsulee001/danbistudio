// Adapted from OpenCut Classic timeline/group-resize.
// Source: https://github.com/opencut-app/opencut-classic
// Commit: cf5e79e919144200294fb9fed22a222592a0aeea
// License: MIT. See third_party/NOTICE.md and docs/THIRD_PARTY_SOURCE_REGISTER_KR.md.

import { getClipPlaybackSpeed } from './clip-timing';
import type { EditorProject, TimelineClip, TimelineTrack } from './types';

const MIN_CLIP_DURATION = 0.25;

export type TimelineResizeEdge = 'start' | 'end';

export interface TimelineResizeGroupMember {
  clip: TimelineClip;
  track: TimelineTrack;
  trackIndex: number;
  currentTimelineTime: number;
  leftNeighborBound: number;
  rightNeighborBound: number;
  sourceStartBound: number;
  sourceEndBound: number;
  minTimelineTime: number;
  maxTimelineTime: number;
}

export interface TimelineResizeGroup {
  edge: TimelineResizeEdge;
  anchor: TimelineResizeGroupMember;
  members: TimelineResizeGroupMember[];
  minTimelineTime: number;
  maxTimelineTime: number;
  minDelta: number;
  maxDelta: number;
}

export interface TimelineResizeTimePlan {
  group: TimelineResizeGroup;
  requestedTimelineTime: number;
  appliedTimelineTime: number;
  constrained: boolean;
}

export interface TimelineGroupResizeUpdate {
  clipId: string;
  trackId: string;
  currentTimelineTime: number;
  appliedTimelineTime: number;
}

export interface TimelineGroupResizePlan {
  group: TimelineResizeGroup;
  requestedAnchorTimelineTime: number;
  appliedAnchorTimelineTime: number;
  requestedDelta: number;
  appliedDelta: number;
  constrained: boolean;
  updates: TimelineGroupResizeUpdate[];
}

export function buildTimelineResizeGroup({
  project,
  clipIds,
  edge,
  anchorClipId,
}: {
  project: EditorProject;
  clipIds: string[];
  edge: TimelineResizeEdge;
  anchorClipId?: string;
}): TimelineResizeGroup | null {
  const idSet = new Set(clipIds.filter(Boolean));
  if (idSet.size === 0) {
    return null;
  }

  const members = project.tracks.flatMap((track, trackIndex) => (
    track.clips
      .filter((clip) => idSet.has(clip.id))
      .map((clip) => buildResizeMember({ project, track, trackIndex, clip, clipIds: idSet, edge }))
  ));
  if (members.length === 0) {
    return null;
  }

  const anchor = anchorClipId
    ? members.find((member) => member.clip.id === anchorClipId) ?? members[0]
    : members[0];
  const bounds = members.reduce((current, member) => {
    const memberMinDelta = roundTime(member.minTimelineTime - member.currentTimelineTime);
    const memberMaxDelta = roundTime(member.maxTimelineTime - member.currentTimelineTime);

    return {
      minTimelineTime: Math.max(current.minTimelineTime, member.minTimelineTime),
      maxTimelineTime: Math.min(current.maxTimelineTime, member.maxTimelineTime),
      minDelta: Math.max(current.minDelta, memberMinDelta),
      maxDelta: Math.min(current.maxDelta, memberMaxDelta),
    };
  }, {
    minTimelineTime: 0,
    maxTimelineTime: Number.POSITIVE_INFINITY,
    minDelta: Number.NEGATIVE_INFINITY,
    maxDelta: Number.POSITIVE_INFINITY,
  });

  return {
    edge,
    anchor,
    members,
    ...bounds,
  };
}

export function resolveTimelineResizeTimeFromProject({
  project,
  clipIds,
  edge,
  timelineTime,
}: {
  project: EditorProject;
  clipIds: string[];
  edge: TimelineResizeEdge;
  timelineTime: number;
}): TimelineResizeTimePlan | null {
  const group = buildTimelineResizeGroup({ project, clipIds, edge });
  if (!group) {
    return null;
  }

  return resolveTimelineResizeTime({ group, timelineTime });
}

export function resolveTimelineResizeTime({
  group,
  timelineTime,
}: {
  group: TimelineResizeGroup;
  timelineTime: number;
}): TimelineResizeTimePlan {
  const requestedTimelineTime = roundTime(timelineTime);
  const appliedTimelineTime = roundTime(clamp(
    requestedTimelineTime,
    group.minTimelineTime,
    group.maxTimelineTime,
  ));

  return {
    group,
    requestedTimelineTime,
    appliedTimelineTime,
    constrained: Math.abs(appliedTimelineTime - requestedTimelineTime) > 0.001,
  };
}

export function resolveTimelineGroupResizeFromProject({
  project,
  clipIds,
  edge,
  requestedAnchorTimelineTime,
  anchorClipId,
}: {
  project: EditorProject;
  clipIds: string[];
  edge: TimelineResizeEdge;
  requestedAnchorTimelineTime: number;
  anchorClipId?: string;
}): TimelineGroupResizePlan | null {
  const group = buildTimelineResizeGroup({ project, clipIds, edge, anchorClipId });
  if (!group) {
    return null;
  }

  return resolveTimelineGroupResize({ group, requestedAnchorTimelineTime });
}

export function resolveTimelineGroupResize({
  group,
  requestedAnchorTimelineTime,
}: {
  group: TimelineResizeGroup;
  requestedAnchorTimelineTime: number;
}): TimelineGroupResizePlan {
  const requestedAnchorTime = roundTime(requestedAnchorTimelineTime);
  const requestedDelta = roundTime(requestedAnchorTime - group.anchor.currentTimelineTime);
  const appliedDelta = roundTime(clamp(requestedDelta, group.minDelta, group.maxDelta));
  const appliedAnchorTimelineTime = roundTime(group.anchor.currentTimelineTime + appliedDelta);

  return {
    group,
    requestedAnchorTimelineTime: requestedAnchorTime,
    appliedAnchorTimelineTime,
    requestedDelta,
    appliedDelta,
    constrained: Math.abs(appliedDelta - requestedDelta) > 0.001,
    updates: group.members.map((member) => ({
      clipId: member.clip.id,
      trackId: member.track.id,
      currentTimelineTime: member.currentTimelineTime,
      appliedTimelineTime: roundTime(member.currentTimelineTime + appliedDelta),
    })),
  };
}

function buildResizeMember({
  project,
  track,
  trackIndex,
  clip,
  clipIds,
  edge,
}: {
  project: EditorProject;
  track: TimelineTrack;
  trackIndex: number;
  clip: TimelineClip;
  clipIds: Set<string>;
  edge: TimelineResizeEdge;
}): TimelineResizeGroupMember {
  const sortedClips = [...track.clips].sort((a, b) => a.start - b.start);
  const staticClips = sortedClips.filter((item) => !clipIds.has(item.id));
  const clipEnd = roundTime(clip.start + clip.duration);
  const previousClip = staticClips
    .filter((item) => item.start + item.duration <= clip.start)
    .at(-1);
  const nextClip = staticClips.find((item) => item.start >= clipEnd);
  const leftNeighborBound = previousClip ? roundTime(previousClip.start + previousClip.duration) : 0;
  const rightNeighborBound = nextClip ? roundTime(nextClip.start) : Number.POSITIVE_INFINITY;
  const sourceStartBound = roundTime(Math.max(0, clip.start - (clip.sourceIn / getClipPlaybackSpeed(clip))));
  const sourceEndBound = getClipSourceEndBound(project, clip);

  if (edge === 'start') {
    return {
      clip,
      track,
      trackIndex,
      currentTimelineTime: clip.start,
      leftNeighborBound,
      rightNeighborBound,
      sourceStartBound,
      sourceEndBound,
      minTimelineTime: Math.max(0, leftNeighborBound, sourceStartBound),
      maxTimelineTime: roundTime(clipEnd - MIN_CLIP_DURATION),
    };
  }

  return {
    clip,
    track,
    trackIndex,
    currentTimelineTime: clipEnd,
    leftNeighborBound,
    rightNeighborBound,
    sourceStartBound,
    sourceEndBound,
    minTimelineTime: roundTime(clip.start + MIN_CLIP_DURATION),
    maxTimelineTime: Math.min(rightNeighborBound, sourceEndBound),
  };
}

function getClipSourceEndBound(project: EditorProject, clip: TimelineClip): number {
  const asset = clip.assetId ? project.assets.find((item) => item.id === clip.assetId) : undefined;
  if (!asset) {
    return Number.POSITIVE_INFINITY;
  }

  return roundTime(clip.start + Math.max(
    MIN_CLIP_DURATION,
    (asset.duration - clip.sourceIn) / getClipPlaybackSpeed(clip),
  ));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundTime(value: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }

  return Math.round(value * 1000) / 1000;
}
