import {
  clampClipMoveDelta,
  expandClipIdsWithLinkedAndGroupedClips,
  snapTimeToEditPoints,
} from '../../lib/editor/timeline';
import type { TimelineGroupMoveNewTrack } from '../../lib/editor/timeline-group-move';
import type { EditorProject, TimelineClip, TimelineTrack } from '../../lib/editor/types';

export type ClipMoveCommandPlan =
  | {
    canCommit: false;
    status: string;
  }
  | {
    canCommit: true;
    commitLabel: string;
    targetClipIds: string[];
    nextPlayhead: number;
    appliedDelta?: number;
    targetTrackId?: string;
    status?: string;
  };

export interface TimelineClipMoveEditState {
  group: TimelineClip[];
  appliedDelta: number;
  preview: {
    start: number;
  };
}

export interface TimelineClipGroupMoveCommitPlan {
  commitLabel: string;
  clipIds: string[];
  appliedDelta: number;
  preventOverlap: true;
  shouldMoveTracks: boolean;
  anchorClipId: string;
  nextStart: number;
  nextPlayhead: number;
  targetTrackId?: string;
  targetTrackName?: string;
  nextSelectedTrackId?: string;
  newTrackPosition?: TimelineGroupMoveNewTrack['position'];
}

export function resolveMoveSelectedClipsPlan({
  project,
  selectedClip,
  selectedClips,
  deltaSeconds,
  snapEnabled,
  includeLinked = true,
}: {
  project: EditorProject;
  selectedClip?: TimelineClip | null;
  selectedClips: TimelineClip[];
  deltaSeconds: number;
  snapEnabled: boolean;
  includeLinked?: boolean;
}): ClipMoveCommandPlan {
  if (selectedClips.length === 0) {
    return { canCommit: false, status: 'Select a clip first' };
  }

  const anchorClip = selectedClip ?? selectedClips[0];
  const nextStart = anchorClip.start + deltaSeconds;
  const snappedStart = snapEnabled
    ? snapTimeToEditPoints(project, nextStart, { threshold: 0.18, excludeClipId: anchorClip.id })
    : nextStart;
  const targetClipIds = expandSelectedClipIds(project, selectedClips, includeLinked);
  const appliedDelta = clampClipMoveDelta(project, targetClipIds, snappedStart - anchorClip.start);

  return {
    canCommit: true,
    commitLabel: selectedClips.length > 1 ? 'Clips moved' : 'Clip moved',
    targetClipIds,
    appliedDelta,
    nextPlayhead: roundTime(clampNumber(anchorClip.start + appliedDelta, 0, project.duration)),
  };
}

export function resolveTimelineClipGroupMoveCommitPlan({
  anchorClip,
  edit,
  targetTrack,
  newTrack,
  nextStart,
}: {
  anchorClip: TimelineClip;
  edit: TimelineClipMoveEditState;
  targetTrack?: TimelineTrack;
  newTrack?: TimelineGroupMoveNewTrack;
  nextStart: number;
}): TimelineClipGroupMoveCommitPlan {
  const targetTrackId = targetTrack?.id ?? newTrack?.id;
  const targetTrackName = targetTrack?.name ?? newTrack?.name;
  const shouldMoveTracks = Boolean(newTrack) || Boolean(targetTrack && edit.group.some((clip) => clip.trackId !== targetTrack.id));
  const isMultiClipMove = edit.group.length > 1;
  const commitLabel = shouldMoveTracks && targetTrackName
    ? `${isMultiClipMove ? 'Clips' : 'Clip'} dragged to ${targetTrackName}`
    : `${isMultiClipMove ? 'Clips' : 'Clip'} dragged`;

  return {
    commitLabel,
    clipIds: edit.group.map((clip) => clip.id),
    appliedDelta: edit.appliedDelta,
    preventOverlap: true,
    shouldMoveTracks,
    anchorClipId: anchorClip.id,
    nextStart,
    nextPlayhead: edit.preview.start,
    targetTrackId: shouldMoveTracks ? targetTrackId : undefined,
    targetTrackName: shouldMoveTracks ? targetTrackName : undefined,
    nextSelectedTrackId: targetTrackId,
    ...(newTrack ? { newTrackPosition: newTrack.position } : {}),
  };
}

export function resolveMoveSelectionToPlayheadPlan({
  project,
  selectedClips,
  playhead,
  includeLinked = true,
}: {
  project: EditorProject;
  selectedClips: TimelineClip[];
  playhead: number;
  includeLinked?: boolean;
}): ClipMoveCommandPlan {
  if (selectedClips.length === 0) {
    return { canCommit: false, status: 'Select a clip first' };
  }

  return {
    canCommit: true,
    commitLabel: selectedClips.length > 1 ? 'Clips moved to playhead' : 'Clip moved to playhead',
    targetClipIds: expandSelectedClipIds(project, selectedClips, includeLinked),
    nextPlayhead: playhead,
  };
}

export function resolveMoveSelectedClipsToTrackPlan({
  selectedClips,
  tracks,
  targetTrackId,
}: {
  selectedClips: TimelineClip[];
  tracks: TimelineTrack[];
  targetTrackId: string;
}): ClipMoveCommandPlan {
  if (selectedClips.length === 0) {
    return { canCommit: false, status: 'Select a clip first' };
  }

  const targetTrack = tracks.find((track) => track.id === targetTrackId);
  if (!targetTrack) {
    return { canCommit: false, status: 'Target track not found' };
  }

  return {
    canCommit: true,
    commitLabel: selectedClips.length > 1 ? `Clips moved to ${targetTrack.name}` : `Clip moved to ${targetTrack.name}`,
    targetClipIds: selectedClips.map((clip) => clip.id),
    targetTrackId,
    nextPlayhead: selectedClips[0]?.start ?? 0,
    status: `${selectedClips.length} clip${selectedClips.length > 1 ? 's' : ''} moved to ${targetTrack.name}`,
  };
}

function expandSelectedClipIds(project: EditorProject, selectedClips: TimelineClip[], includeLinked = true): string[] {
  return expandClipIdsWithLinkedAndGroupedClips(project, selectedClips.map((clip) => clip.id), {
    includeLinked,
    includeGrouped: true,
  });
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}
