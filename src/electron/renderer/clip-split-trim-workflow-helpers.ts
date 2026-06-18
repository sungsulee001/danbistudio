import {
  clampClipTrimTime,
  getLinkedClipIds,
  snapTimeToEditPoints,
} from '../../lib/editor/timeline';
import type { EditorProject, TimelineClip } from '../../lib/editor/types';
import { formatTimecode } from './editor-time-helpers';

export type ClipTrimEdge = 'start' | 'end';
export type ClipDeleteSide = 'left' | 'right';

export interface ClipTrimCommitOptions {
  ripple: boolean;
  preventOverlap: boolean;
}

export type ClipTrimCommandPlan =
  | {
    canCommit: false;
    status: string;
  }
  | {
    canCommit: true;
    commitLabel: string;
    clipId: string;
    edge: ClipTrimEdge;
  };

export interface TimelineClipTrimDragCommitPlan {
  commitLabel: string;
  clipId: string;
  edge: ClipTrimEdge;
  nextTimelineTime: number;
  trimOptions: ClipTrimCommitOptions;
}

export type SplitClipCommandPlan =
  | {
    canSplit: false;
    status: string;
  }
  | {
    canSplit: true;
    commitLabel: string;
    mode: 'selected' | 'target';
    targetClipIds: string[];
    targetClipId?: string;
    nextSelectedClipId: string;
    nextSelectedTrackId: string;
  };

export interface SplitAllClipsPlan {
  commitLabel: string;
}

export function resolveDeleteClipSidePlan({
  selectedClip,
  playhead,
  side,
}: {
  selectedClip?: TimelineClip | null;
  playhead: number;
  side: ClipDeleteSide;
}): ClipTrimCommandPlan {
  if (!selectedClip) {
    return { canCommit: false, status: 'Select a clip first' };
  }

  if (!isPlayheadInsideClip(selectedClip, playhead)) {
    return { canCommit: false, status: 'Move the playhead inside the selected clip' };
  }

  return {
    canCommit: true,
    commitLabel: side === 'left' ? 'Deleted left side of linked clip' : 'Deleted right side of linked clip',
    clipId: selectedClip.id,
    edge: side === 'left' ? 'start' : 'end',
  };
}

export function resolveTrimClipToPlayheadPlan({
  selectedClip,
  playhead,
  edge,
}: {
  selectedClip?: TimelineClip | null;
  playhead: number;
  edge: ClipTrimEdge;
}): ClipTrimCommandPlan {
  if (!selectedClip) {
    return { canCommit: false, status: 'Select a clip first' };
  }

  if (!isPlayheadInsideClip(selectedClip, playhead)) {
    return { canCommit: false, status: 'Move the playhead inside the selected clip' };
  }

  return {
    canCommit: true,
    commitLabel: edge === 'start' ? 'Trimmed linked clip head to playhead' : 'Trimmed linked clip tail to playhead',
    clipId: selectedClip.id,
    edge,
  };
}

export function resolveTimelineClipTrimDragCommitPlan({
  project,
  clip,
  edge,
  deltaSeconds,
  rippleMode,
  snapEnabled,
  snapExtraPoints = [],
}: {
  project: EditorProject;
  clip: TimelineClip;
  edge: ClipTrimEdge;
  deltaSeconds: number;
  rippleMode: boolean;
  snapEnabled: boolean;
  snapExtraPoints?: number[];
}): TimelineClipTrimDragCommitPlan {
  const clipEnd = clip.start + clip.duration;
  const trimGroupIds = getLinkedClipIds(project, clip.id);
  const trimOptions = { ripple: rippleMode, preventOverlap: !rippleMode };

  if (edge === 'start') {
    const desiredStart = Math.min(clipEnd - 0.25, Math.max(0, clip.start + deltaSeconds));
    const snappedStart = snapEnabled
      ? Math.min(clipEnd - 0.25, snapTimeToEditPoints(project, desiredStart, {
        threshold: 0.18,
        excludeClipIds: trimGroupIds,
        extraPoints: snapExtraPoints,
      }))
      : desiredStart;
    const nextTimelineTime = trimOptions.preventOverlap
      ? clampClipTrimTime(project, trimGroupIds, 'start', snappedStart)
      : snappedStart;

    return {
      commitLabel: 'Linked clip edge trimmed',
      clipId: clip.id,
      edge,
      nextTimelineTime,
      trimOptions,
    };
  }

  const desiredEnd = Math.max(clip.start + 0.25, clipEnd + deltaSeconds);
  const snappedEnd = snapEnabled
    ? Math.max(clip.start + 0.25, snapTimeToEditPoints(project, desiredEnd, {
      threshold: 0.18,
      excludeClipIds: trimGroupIds,
      extraPoints: snapExtraPoints,
    }))
    : desiredEnd;
  const nextTimelineTime = trimOptions.preventOverlap
    ? clampClipTrimTime(project, trimGroupIds, 'end', snappedEnd)
    : snappedEnd;

  return {
    commitLabel: 'Linked clip edge trimmed',
    clipId: clip.id,
    edge,
    nextTimelineTime,
    trimOptions,
  };
}

export function resolveSplitClipAtPlayheadPlan({
  selectedClip,
  selectedClips,
  selectedClipIds,
  activeTimelineClip,
  playhead,
  fps,
}: {
  selectedClip?: TimelineClip | null;
  selectedClips: TimelineClip[];
  selectedClipIds: string[];
  activeTimelineClip?: TimelineClip | null;
  playhead: number;
  fps: number;
}): SplitClipCommandPlan {
  const selectedOverlappingClips = selectedClips.filter((clip) => isPlayheadInsideClip(clip, playhead));
  if (selectedOverlappingClips.length > 0) {
    const primaryClip = selectedOverlappingClips[0];
    return {
      canSplit: true,
      mode: 'selected',
      commitLabel: `Split ${selectedOverlappingClips.length} selected clip${selectedOverlappingClips.length === 1 ? '' : 's'} at ${formatTimecode(playhead, fps)}`,
      targetClipIds: selectedClipIds,
      nextSelectedClipId: primaryClip.id,
      nextSelectedTrackId: primaryClip.trackId,
    };
  }

  const targetClip = selectedClip && isPlayheadInsideClip(selectedClip, playhead)
    ? selectedClip
    : activeTimelineClip;

  if (!targetClip) {
    return { canSplit: false, status: 'Move the playhead inside a clip before splitting' };
  }

  return {
    canSplit: true,
    mode: 'target',
    commitLabel: `Split ${targetClip.name} at ${formatTimecode(playhead, fps)}`,
    targetClipIds: [targetClip.id],
    targetClipId: targetClip.id,
    nextSelectedClipId: targetClip.id,
    nextSelectedTrackId: targetClip.trackId,
  };
}

export function resolveSplitAllClipsAtPlayheadPlan({
  playhead,
  fps,
}: {
  playhead: number;
  fps: number;
}): SplitAllClipsPlan {
  return {
    commitLabel: `Split all unlocked clips at ${formatTimecode(playhead, fps)}`,
  };
}

function isPlayheadInsideClip(clip: TimelineClip, playhead: number): boolean {
  return playhead > clip.start && playhead < clip.start + clip.duration;
}
