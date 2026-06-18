import { clampClipMoveDelta, clampClipTrimTime, expandClipIdsWithLinkedAndGroupedClips, expandClipIdsWithLinkedClips, findClip, snapTimeToEditPoints } from '../../lib/editor/timeline';
import type { EditorProject, TimelineClip } from '../../lib/editor/types';
import { clampNumber, roundTime } from './editor-time-helpers';

export type PrecisionEditEdge = 'start' | 'end';
export type ToggleClipState = 'muted' | 'locked';

export type PrecisionClipCommandPlan =
  | {
    canCommit: false;
    status: string;
  }
  | {
    canCommit: true;
    commitLabel: string;
    clipId: string;
    edge?: PrecisionEditEdge;
    deltaSeconds?: number;
    nextSelectedClipId?: string;
    nextSelectedTrackId?: string;
    nextPlayhead?: number;
  };

export type ToggleClipStatePlan =
  | {
    canCommit: false;
    status: string;
  }
  | {
    canCommit: true;
    commitLabel: string;
    targetClipIds: string[];
    state: ToggleClipState;
  };

export interface InspectorClipStartChangeResult {
  targetClipIds: string[];
  appliedDelta: number;
  nextPlayhead: number;
}

export interface InspectorClipDurationChangeResult {
  nextEnd: number;
  nextPlayhead: number;
  trimOptions: {
    ripple: boolean;
    preventOverlap: boolean;
  };
}

export function resolvePrecisionEditStepFrames(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(600, Math.max(1, Math.round(value)));
}

export function resolveInspectorClipStartChangePlan({
  selectedClip,
}: {
  selectedClip?: TimelineClip | null;
}): PrecisionClipCommandPlan {
  if (!selectedClip) {
    return { canCommit: false, status: 'Select a clip first' };
  }

  return {
    canCommit: true,
    commitLabel: 'Clip start updated',
    clipId: selectedClip.id,
  };
}

export function resolveInspectorClipStartChangeResult({
  project,
  clipId,
  value,
  snapEnabled,
}: {
  project: EditorProject;
  clipId: string;
  value: number;
  snapEnabled: boolean;
}): InspectorClipStartChangeResult {
  const currentClip = findClip(project, clipId);
  if (!currentClip) {
    throw new Error('Clip not found.');
  }

  const targetStart = snapEnabled
    ? snapTimeToEditPoints(project, value, { excludeClipId: currentClip.id })
    : value;
  const targetClipIds = expandClipIdsWithLinkedAndGroupedClips(project, [currentClip.id]);
  const appliedDelta = clampClipMoveDelta(project, targetClipIds, targetStart - currentClip.start);

  return {
    targetClipIds,
    appliedDelta,
    nextPlayhead: roundTime(clampNumber(currentClip.start + appliedDelta, 0, project.duration)),
  };
}

export function resolveInspectorClipDurationChangePlan({
  selectedClip,
}: {
  selectedClip?: TimelineClip | null;
}): PrecisionClipCommandPlan {
  if (!selectedClip) {
    return { canCommit: false, status: 'Select a clip first' };
  }

  return {
    canCommit: true,
    commitLabel: 'Clip duration updated',
    clipId: selectedClip.id,
  };
}

export function resolveInspectorClipDurationChangeResult({
  project,
  clipId,
  value,
  rippleMode,
}: {
  project: EditorProject;
  clipId: string;
  value: number;
  rippleMode: boolean;
}): InspectorClipDurationChangeResult {
  const currentClip = findClip(project, clipId);
  if (!currentClip) {
    throw new Error('Clip not found.');
  }

  const targetClipIds = expandClipIdsWithLinkedClips(project, [currentClip.id]);
  const requestedEnd = roundTime(currentClip.start + Math.max(0.25, value));
  const trimOptions = { ripple: rippleMode, preventOverlap: !rippleMode };
  const nextEnd = trimOptions.preventOverlap
    ? clampClipTrimTime(project, targetClipIds, 'end', requestedEnd)
    : requestedEnd;

  return {
    nextEnd,
    nextPlayhead: roundTime(clampNumber(nextEnd, 0, project.duration)),
    trimOptions,
  };
}

export function resolveSlipSelectedClipPlan({
  selectedClip,
  deltaSeconds,
}: {
  selectedClip?: TimelineClip | null;
  deltaSeconds: number;
}): PrecisionClipCommandPlan {
  if (!selectedClip) {
    return { canCommit: false, status: 'Select a clip first' };
  }

  return {
    canCommit: true,
    commitLabel: 'Linked slip edit applied',
    clipId: selectedClip.id,
    deltaSeconds,
  };
}

export function resolveTimelineSlipDragPlan({
  clip,
  deltaSeconds,
}: {
  clip: TimelineClip;
  deltaSeconds: number;
}): PrecisionClipCommandPlan {
  return {
    canCommit: true,
    commitLabel: 'Linked slip edit dragged',
    clipId: clip.id,
    deltaSeconds,
    nextSelectedClipId: clip.id,
    nextSelectedTrackId: clip.trackId,
  };
}

export function resolveRollTrimSelectedClipPlan({
  selectedClip,
  edge,
  deltaSeconds,
}: {
  selectedClip?: TimelineClip | null;
  edge: PrecisionEditEdge;
  deltaSeconds: number;
}): PrecisionClipCommandPlan {
  if (!selectedClip) {
    return { canCommit: false, status: 'Select a clip first' };
  }

  return {
    canCommit: true,
    commitLabel: `${edge === 'start' ? 'Head' : 'Tail'} roll trim applied`,
    clipId: selectedClip.id,
    edge,
    deltaSeconds,
  };
}

export function resolveTimelineRollTrimDragPlan({
  clip,
  edge,
  deltaSeconds,
}: {
  clip: TimelineClip;
  edge: PrecisionEditEdge;
  deltaSeconds: number;
}): PrecisionClipCommandPlan {
  return {
    canCommit: true,
    commitLabel: `${edge === 'start' ? 'Head' : 'Tail'} roll trim dragged`,
    clipId: clip.id,
    edge,
    deltaSeconds,
    nextSelectedClipId: clip.id,
    nextSelectedTrackId: clip.trackId,
    nextPlayhead: edge === 'start' ? clip.start : roundTime(clip.start + clip.duration),
  };
}

export function resolveTimelineRollTrimDragResult({
  project,
  clipId,
  edge,
  fallbackPlayhead,
}: {
  project: EditorProject;
  clipId: string;
  edge: PrecisionEditEdge;
  fallbackPlayhead: number;
}): number {
  const nextClip = findClip(project, clipId);
  if (!nextClip) {
    return fallbackPlayhead;
  }

  return edge === 'start'
    ? nextClip.start
    : roundTime(nextClip.start + nextClip.duration);
}

export function resolveSlideSelectedClipPlan({
  selectedClip,
  deltaSeconds,
}: {
  selectedClip?: TimelineClip | null;
  deltaSeconds: number;
}): PrecisionClipCommandPlan {
  if (!selectedClip) {
    return { canCommit: false, status: 'Select a clip first' };
  }

  return {
    canCommit: true,
    commitLabel: 'Linked slide edit applied',
    clipId: selectedClip.id,
    deltaSeconds,
  };
}

export function resolveTimelineSlideDragPlan({
  clip,
  deltaSeconds,
}: {
  clip: TimelineClip;
  deltaSeconds: number;
}): PrecisionClipCommandPlan {
  return {
    canCommit: true,
    commitLabel: 'Linked slide edit dragged',
    clipId: clip.id,
    deltaSeconds,
    nextSelectedClipId: clip.id,
    nextSelectedTrackId: clip.trackId,
    nextPlayhead: clip.start,
  };
}

export function resolveTimelineSlideDragResult({
  project,
  clipId,
  fallbackPlayhead,
}: {
  project: EditorProject;
  clipId: string;
  fallbackPlayhead: number;
}): number {
  return findClip(project, clipId)?.start ?? fallbackPlayhead;
}

export function resolveLinkedAudioSplitEditPlan({
  selectedClip,
  selectedCanRelinkAudio,
  edge,
  deltaSeconds,
}: {
  selectedClip?: TimelineClip | null;
  selectedCanRelinkAudio: boolean;
  edge: PrecisionEditEdge;
  deltaSeconds: number;
}): PrecisionClipCommandPlan {
  if (!selectedClip) {
    return { canCommit: false, status: 'Select a clip first' };
  }

  if (!selectedCanRelinkAudio) {
    return { canCommit: false, status: 'Detach or link audio before applying a J/L cut' };
  }

  return {
    canCommit: true,
    commitLabel: edge === 'start'
      ? deltaSeconds < 0 ? 'J-cut audio head extended' : 'Audio head trimmed'
      : deltaSeconds > 0 ? 'L-cut audio tail extended' : 'Audio tail trimmed',
    clipId: selectedClip.id,
    edge,
    deltaSeconds,
  };
}

export function resolveToggleSelectedClipStatePlan({
  selectedClips,
  state,
}: {
  selectedClips: TimelineClip[];
  state: ToggleClipState;
}): ToggleClipStatePlan {
  if (selectedClips.length === 0) {
    return { canCommit: false, status: 'Select a clip first' };
  }

  return {
    canCommit: true,
    commitLabel: state === 'muted'
      ? selectedClips.length > 1 ? 'Clips mute toggled' : 'Clip mute toggled'
      : selectedClips.length > 1 ? 'Clips lock toggled' : 'Clip lock toggled',
    targetClipIds: selectedClips.map((clip) => clip.id),
    state,
  };
}
