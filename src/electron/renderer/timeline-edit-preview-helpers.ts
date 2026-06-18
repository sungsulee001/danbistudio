import {
  clampClipTrimTime,
  findClip,
  getGroupedClipIds,
  getLinkedClipIds,
  rollTrimLinkedClip,
  slideLinkedClip,
  slipLinkedClip,
  snapTimeToEditPoints,
} from '../../lib/editor/timeline';
import { resolveTimelineGroupMoveFromProject, type TimelineGroupMoveNewTrack } from '../../lib/editor/timeline-group-move';
import { canPlaceTimeSpansOnTrack, canPlaceTimeSpansTogether, type TimelinePlacementTimeSpan } from '../../lib/editor/timeline-placement';
import { timelineTrackIdsInVerticalRange } from '../../lib/editor/timeline-view';
import type { EditorProject, TimelineClip, TimelineTrack } from '../../lib/editor/types';
import type { TimelineClipDropPreview, TimelineClipEditPreview, TimelineEditGuide } from './editor-view-model';
import { clampNumber, formatSignedEditDelta, roundTime } from './editor-time-helpers';
import { trackKindForTimelineClip } from './timeline-source-helpers';

export interface TimelineLaneBounds {
  id: string;
  topPixels: number;
  bottomPixels: number;
}

interface TimelineLaneElement {
  getBoundingClientRect(): Pick<DOMRect, 'top' | 'bottom'>;
}

interface TimelinePreviewOptions {
  project: EditorProject;
  selectedClipIds: string[];
  snapEnabled: boolean;
  snapExtraPoints?: number[];
}

export interface TimelineClipMoveEdit {
  group: TimelineClip[];
  appliedDelta: number;
  preview: TimelineClipEditPreview;
}

export interface TimelineClipDragPointerPlan {
  targetTrackId: string | null;
  newTrack?: TimelineGroupMoveNewTrack;
  clipDragPreview?: TimelineClipDropPreview | null;
  editGuide?: TimelineEditGuide | null;
}

export interface TimelineClipDragPreviewState {
  moveEdit: TimelineClipMoveEdit;
  dropPreview: TimelineClipDropPreview | null;
  editGuide: TimelineEditGuide;
}

export interface TimelineClipDragCommitState {
  edit: TimelineClipMoveEdit;
  targetTrack?: TimelineTrack;
  newTrack?: TimelineGroupMoveNewTrack;
}

export function readTimelineLaneBounds(
  tracks: TimelineTrack[],
  laneElementsByTrackId: Record<string, TimelineLaneElement | null>,
): TimelineLaneBounds[] {
  return tracks.flatMap((track) => {
    const lane = laneElementsByTrackId[track.id];
    if (!lane) {
      return [];
    }

    const rect = lane.getBoundingClientRect();
    return [{ id: track.id, topPixels: rect.top, bottomPixels: rect.bottom }];
  });
}

export function resolveTimelineTrackIdsInDragRange(
  laneBounds: TimelineLaneBounds[],
  startClientY: number,
  endClientY: number,
): string[] {
  return timelineTrackIdsInVerticalRange(laneBounds, startClientY, endClientY);
}

export function resolveTimelineClipMoveEdit({
  project,
  selectedClipIds,
  snapEnabled,
  snapExtraPoints,
  anchorClip,
  nextStart,
}: TimelinePreviewOptions & {
  anchorClip: TimelineClip;
  nextStart: number;
}): TimelineClipMoveEdit {
  const groupIds = resolvePreviewClipGroupIds(project, selectedClipIds, anchorClip);
  const group = findPreviewClips(project, groupIds);
  const requestedStart = roundTime(Math.max(0, nextStart));
  const snappedStart = snapEnabled
    ? snapTimeToEditPoints(project, requestedStart, {
      threshold: 0.18,
      excludeClipIds: groupIds,
      extraPoints: snapExtraPoints,
    })
    : requestedStart;
  const movePlan = resolveTimelineGroupMoveFromProject({
    project,
    clipIds: groupIds,
    anchorClipId: anchorClip.id,
    requestedAnchorStart: snappedStart,
    preventOverlap: true,
  });
  const appliedDelta = movePlan?.appliedDelta ?? 0;
  const appliedStart = roundTime(clampNumber(movePlan?.appliedAnchorStart ?? anchorClip.start, 0, project.duration));

  return {
    group: movePlan?.group.members.map((member) => member.clip) ?? group,
    appliedDelta,
    preview: {
      start: appliedStart,
      duration: anchorClip.duration,
      snapped: Math.abs(snappedStart - requestedStart) > 0.001,
      constrained: Math.abs(appliedStart - snappedStart) > 0.001,
    },
  };
}

export function resolveTimelineClipDropTrack({
  project,
  selectedClipIds,
  anchorClip,
  clientY,
  laneBounds,
}: {
  project: EditorProject;
  selectedClipIds: string[];
  anchorClip: TimelineClip;
  clientY: number;
  laneBounds: TimelineLaneBounds[];
}): TimelineTrack | undefined {
  const targetTrackId = laneBounds.find((bounds) => clientY >= bounds.topPixels && clientY <= bounds.bottomPixels)?.id;
  const targetTrack = project.tracks.find((track) => track.id === targetTrackId);
  if (!targetTrack || targetTrack.locked) {
    return undefined;
  }

  const groupIds = resolvePreviewClipGroupIds(project, selectedClipIds, anchorClip);
  const group = findPreviewClips(project, groupIds);
  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const groupKinds = Array.from(new Set(group.map((clip) => trackKindForTimelineClip(
    clip,
    clip.assetId ? assetById.get(clip.assetId) : undefined,
  ))));
  if (groupKinds.length !== 1 || groupKinds[0] !== targetTrack.kind) {
    return undefined;
  }

  return targetTrack;
}

export function resolveTimelineClipNewTrackDrop({
  project,
  selectedClipIds,
  anchorClip,
  clientY,
  laneBounds,
}: {
  project: EditorProject;
  selectedClipIds: string[];
  anchorClip: TimelineClip;
  clientY: number;
  laneBounds: TimelineLaneBounds[];
}): TimelineGroupMoveNewTrack | undefined {
  if (laneBounds.length === 0) {
    return undefined;
  }

  const sortedBounds = [...laneBounds].sort((a, b) => a.topPixels - b.topPixels);
  const firstLane = sortedBounds[0];
  const lastLane = sortedBounds[sortedBounds.length - 1];
  const newTrackPosition = clientY < firstLane.topPixels
    ? 'above'
    : clientY > lastLane.bottomPixels
      ? 'below'
      : undefined;
  if (!newTrackPosition) {
    return undefined;
  }

  const groupIds = resolvePreviewClipGroupIds(project, selectedClipIds, anchorClip);
  const movePlan = resolveTimelineGroupMoveFromProject({
    project,
    clipIds: groupIds,
    anchorClipId: anchorClip.id,
    requestedAnchorStart: anchorClip.start,
    newTrackPosition,
  });
  return movePlan?.newTrack;
}

export function resolveTimelineClipDropPreview({
  project,
  selectedClipIds,
  snapEnabled,
  snapExtraPoints,
  anchorClip,
  nextStart,
  targetTrack,
  newTrack,
}: TimelinePreviewOptions & {
  anchorClip: TimelineClip;
  nextStart: number;
  targetTrack: TimelineTrack | undefined;
  newTrack?: TimelineGroupMoveNewTrack;
}): TimelineClipDropPreview | null {
  if ((!targetTrack && !newTrack) || (targetTrack && targetTrack.id === anchorClip.trackId)) {
    return null;
  }

  const groupIds = resolvePreviewClipGroupIds(project, selectedClipIds, anchorClip);
  const group = findPreviewClips(project, groupIds);
  if (group.length === 0) {
    return null;
  }

  const requestedStart = roundTime(Math.max(0, nextStart));
  const snappedStart = snapEnabled
    ? snapTimeToEditPoints(project, requestedStart, {
      threshold: 0.18,
      excludeClipIds: groupIds,
      extraPoints: snapExtraPoints,
    })
    : requestedStart;
  const minStart = Math.min(...group.map((clip) => clip.start));
  const appliedDelta = roundTime(Math.max(-minStart, snappedStart - anchorClip.start));
  const shiftedClips = group.map((clip) => ({
    ...clip,
    start: roundTime(Math.max(0, clip.start + appliedDelta)),
  }));
  const dropPlan = resolveTimelineGroupMoveFromProject({
    project,
    clipIds: groupIds,
    anchorClipId: anchorClip.id,
    requestedAnchorStart: snappedStart,
    targetTrackId: targetTrack?.id,
    newTrackPosition: newTrack?.position,
  });
  const previewStart = Math.min(...shiftedClips.map((clip) => clip.start));
  const previewEnd = Math.max(...shiftedClips.map((clip) => clip.start + clip.duration));
  const timeSpans: TimelinePlacementTimeSpan[] = shiftedClips.map((clip) => ({
    start: clip.start,
    duration: clip.duration,
    excludeClipId: clip.id,
  }));
  const canPlaceOnTarget = newTrack
    ? Boolean(dropPlan)
    : targetTrack !== undefined && canPlaceTimeSpansTogether(timeSpans) && canPlaceTimeSpansOnTrack({
      track: targetTrack,
      timeSpans,
    }) && Boolean(dropPlan);

  return {
    trackId: targetTrack?.id ?? newTrack!.id,
    start: previewStart,
    duration: roundTime(Math.max(0.1, previewEnd - previewStart)),
    label: newTrack
      ? group.length > 1 ? `Create ${newTrack.name} for ${group.length} clips` : `Create ${newTrack.name}`
      : group.length > 1 ? `Drop ${group.length} clips` : `Drop ${anchorClip.name}`,
    valid: canPlaceOnTarget,
    isNewTrack: Boolean(newTrack),
  };
}

export function resolveTimelineClipDragPointerPlan({
  project,
  selectedClipIds,
  anchorClip,
  clientY,
  laneBounds,
}: {
  project: EditorProject;
  selectedClipIds: string[];
  anchorClip: TimelineClip;
  clientY?: number;
  laneBounds: TimelineLaneBounds[];
}): TimelineClipDragPointerPlan {
  if (clientY === undefined) {
    return {
      targetTrackId: null,
      clipDragPreview: null,
      editGuide: null,
    };
  }

  const targetTrack = resolveTimelineClipDropTrack({
    project,
    selectedClipIds,
    anchorClip,
    clientY,
    laneBounds,
  });
  const newTrack = targetTrack
    ? undefined
    : resolveTimelineClipNewTrackDrop({
      project,
      selectedClipIds,
      anchorClip,
      clientY,
      laneBounds,
    });

  return {
    targetTrackId: targetTrack?.id ?? newTrack?.id ?? null,
    ...(newTrack ? { newTrack } : {}),
  };
}

export function resolveTimelineClipDragPreviewState({
  project,
  selectedClipIds,
  snapEnabled,
  snapExtraPoints,
  anchorClip,
  nextStart,
  clientY,
  laneBounds,
}: TimelinePreviewOptions & {
  anchorClip: TimelineClip;
  nextStart: number;
  clientY: number;
  laneBounds: TimelineLaneBounds[];
}): TimelineClipDragPreviewState {
  const moveEdit = resolveTimelineClipMoveEdit({
    project,
    selectedClipIds,
    snapEnabled,
    snapExtraPoints,
    anchorClip,
    nextStart,
  });
  const targetTrack = resolveTimelineClipDropTrack({
    project,
    selectedClipIds,
    anchorClip,
    clientY,
    laneBounds,
  });
  const newTrack = targetTrack
    ? undefined
    : resolveTimelineClipNewTrackDrop({
      project,
      selectedClipIds,
      anchorClip,
      clientY,
      laneBounds,
    });
  const dropPreview = resolveTimelineClipDropPreview({
    project,
    selectedClipIds,
    snapEnabled,
    snapExtraPoints,
    anchorClip,
    nextStart,
    targetTrack,
    newTrack,
  });

  return {
    moveEdit,
    dropPreview,
    editGuide: buildTimelineClipDragGuide({
      anchorClip,
      movePreview: moveEdit.preview,
      dropPreview,
    }),
  };
}

export function resolveTimelineClipDragCommitState({
  project,
  selectedClipIds,
  snapEnabled,
  snapExtraPoints,
  anchorClip,
  nextStart,
  clientY,
  laneBounds,
}: TimelinePreviewOptions & {
  anchorClip: TimelineClip;
  nextStart: number;
  clientY?: number;
  laneBounds: TimelineLaneBounds[];
}): TimelineClipDragCommitState {
  const targetTrack = clientY === undefined
    ? undefined
    : resolveTimelineClipDropTrack({
      project,
      selectedClipIds,
      anchorClip,
      clientY,
      laneBounds,
    });
  const newTrack = clientY === undefined || targetTrack
    ? undefined
    : resolveTimelineClipNewTrackDrop({
      project,
      selectedClipIds,
      anchorClip,
      clientY,
      laneBounds,
    });

  return {
    edit: resolveTimelineClipMoveEdit({
      project,
      selectedClipIds,
      snapEnabled,
      snapExtraPoints,
      anchorClip,
      nextStart,
    }),
    targetTrack,
    newTrack,
  };
}

export function buildTimelineClipDragGuide({
  anchorClip,
  movePreview,
  dropPreview,
}: {
  anchorClip: TimelineClip;
  movePreview: TimelineClipEditPreview;
  dropPreview: TimelineClipDropPreview | null;
}): TimelineEditGuide {
  return {
    trackId: dropPreview?.isNewTrack ? anchorClip.trackId : dropPreview?.trackId ?? anchorClip.trackId,
    time: dropPreview?.start ?? movePreview.start,
    label: dropPreview
      ? dropPreview.isNewTrack ? dropPreview.valid ? 'New track' : 'Overlap' : dropPreview.valid ? 'Drop' : 'Overlap'
      : movePreview.constrained ? 'Limit' : movePreview.snapped ? 'Snap' : 'Move',
    tone: dropPreview
      ? dropPreview.valid ? 'drop' : 'limit'
      : movePreview.constrained ? 'limit' : movePreview.snapped ? 'snap' : 'move',
  };
}

export function buildTimelineClipEditGuide(
  clip: TimelineClip,
  preview: TimelineClipEditPreview | null,
  edge?: 'start' | 'end',
): TimelineEditGuide | null {
  if (!preview) {
    return null;
  }

  return {
    trackId: clip.trackId,
    time: edge === 'end' ? roundTime(preview.start + preview.duration) : preview.start,
    label: preview.label ?? (preview.constrained ? 'Limit' : preview.snapped ? 'Snap' : edge ? 'Trim' : 'Move'),
    tone: preview.constrained ? 'limit' : preview.snapped ? 'snap' : 'move',
  };
}

export function resolveTimelineClipTrimPreview({
  project,
  snapEnabled,
  snapExtraPoints,
  rippleMode,
  clip,
  edge,
  deltaSeconds,
}: TimelinePreviewOptions & {
  rippleMode: boolean;
  clip: TimelineClip;
  edge: 'start' | 'end';
  deltaSeconds: number;
}): TimelineClipEditPreview {
  const clipEnd = roundTime(clip.start + clip.duration);
  const trimGroupIds = getLinkedClipIds(project, clip.id);
  const trimOptions = { ripple: rippleMode, preventOverlap: !rippleMode };

  if (edge === 'start') {
    const requestedStart = roundTime(Math.min(clipEnd - 0.25, Math.max(0, clip.start + deltaSeconds)));
    const snappedStart = snapEnabled
      ? Math.min(clipEnd - 0.25, snapTimeToEditPoints(project, requestedStart, {
        threshold: 0.18,
        excludeClipIds: trimGroupIds,
        extraPoints: snapExtraPoints,
      }))
      : requestedStart;
    const appliedStart = trimOptions.preventOverlap
      ? clampClipTrimTime(project, trimGroupIds, 'start', snappedStart)
      : snappedStart;

    return {
      start: appliedStart,
      duration: roundTime(Math.max(0.25, clipEnd - appliedStart)),
      snapped: Math.abs(snappedStart - requestedStart) > 0.001,
      constrained: Math.abs(appliedStart - snappedStart) > 0.001,
    };
  }

  const requestedEnd = roundTime(Math.max(clip.start + 0.25, clipEnd + deltaSeconds));
  const snappedEnd = snapEnabled
    ? Math.max(clip.start + 0.25, snapTimeToEditPoints(project, requestedEnd, {
      threshold: 0.18,
      excludeClipIds: trimGroupIds,
      extraPoints: snapExtraPoints,
    }))
    : requestedEnd;
  const appliedEnd = trimOptions.preventOverlap
    ? clampClipTrimTime(project, trimGroupIds, 'end', snappedEnd)
    : snappedEnd;

  return {
    start: clip.start,
    duration: roundTime(Math.max(0.25, appliedEnd - clip.start)),
    snapped: Math.abs(snappedEnd - requestedEnd) > 0.001,
    constrained: Math.abs(appliedEnd - snappedEnd) > 0.001,
  };
}

export function resolveTimelineClipSlipPreview(
  project: EditorProject,
  clip: TimelineClip,
  deltaSeconds: number,
): TimelineClipEditPreview {
  try {
    const previewProject = slipLinkedClip(project, clip.id, deltaSeconds);
    const previewClip = findClip(previewProject, clip.id);
    const appliedDelta = previewClip ? roundTime(previewClip.sourceIn - clip.sourceIn) : 0;

    return {
      start: clip.start,
      duration: clip.duration,
      snapped: false,
      constrained: Math.abs(appliedDelta - deltaSeconds) > 0.001,
      label: `Slip ${formatSignedEditDelta(appliedDelta)}`,
    };
  } catch {
    return {
      start: clip.start,
      duration: clip.duration,
      snapped: false,
      constrained: true,
      label: 'Slip blocked',
    };
  }
}

export function resolveTimelineClipSlidePreview(
  project: EditorProject,
  clip: TimelineClip,
  deltaSeconds: number,
): TimelineClipEditPreview {
  try {
    const previewProject = slideLinkedClip(project, clip.id, deltaSeconds);
    const previewClip = findClip(previewProject, clip.id);
    const appliedDelta = previewClip ? roundTime(previewClip.start - clip.start) : 0;

    return {
      start: previewClip?.start ?? clip.start,
      duration: previewClip?.duration ?? clip.duration,
      snapped: false,
      constrained: Math.abs(appliedDelta - deltaSeconds) > 0.001,
      label: `Slide ${formatSignedEditDelta(appliedDelta)}`,
    };
  } catch {
    return {
      start: clip.start,
      duration: clip.duration,
      snapped: false,
      constrained: true,
      label: 'Slide blocked',
    };
  }
}

export function resolveTimelineClipRollTrimPreview(
  project: EditorProject,
  clip: TimelineClip,
  edge: 'start' | 'end',
  deltaSeconds: number,
): TimelineClipEditPreview {
  try {
    const previewProject = rollTrimLinkedClip(project, clip.id, edge, deltaSeconds);
    const previewClip = findClip(previewProject, clip.id);
    const appliedDelta = previewClip
      ? edge === 'start'
        ? roundTime(previewClip.start - clip.start)
        : roundTime(previewClip.duration - clip.duration)
      : 0;

    return {
      start: previewClip?.start ?? clip.start,
      duration: previewClip?.duration ?? clip.duration,
      snapped: false,
      constrained: Math.abs(appliedDelta - deltaSeconds) > 0.001,
      label: `Roll ${formatSignedEditDelta(appliedDelta)}`,
    };
  } catch {
    return {
      start: clip.start,
      duration: clip.duration,
      snapped: false,
      constrained: true,
      label: 'Roll blocked',
    };
  }
}

function resolvePreviewClipGroupIds(
  project: EditorProject,
  selectedClipIds: string[],
  anchorClip: TimelineClip,
): string[] {
  return selectedClipIds.includes(anchorClip.id)
    ? selectedClipIds
    : getGroupedClipIds(project, anchorClip.id);
}

function findPreviewClips(project: EditorProject, clipIds: string[]): TimelineClip[] {
  return project.tracks.flatMap((track) => track.clips).filter((clip) => clipIds.includes(clip.id));
}
