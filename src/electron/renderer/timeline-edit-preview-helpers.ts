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
import { resolveTimelineGroupResizeFromProject, type TimelineGroupResizeUpdate } from '../../lib/editor/timeline-group-resize';
import { canPlaceTimeSpansOnTrack, canPlaceTimeSpansTogether, type TimelinePlacementTimeSpan } from '../../lib/editor/timeline-placement';
import { timelineTrackIdsInVerticalRange } from '../../lib/editor/timeline-view';
import type { EditorProject, TimelineClip, TimelineTrack } from '../../lib/editor/types';
import type { TimelineClipDropPreview, TimelineClipEditPreview, TimelineEditGuide } from './editor-view-model';
import { clampNumber, formatRulerTime, formatSignedEditDelta, roundTime } from './editor-time-helpers';
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
  includeLinked?: boolean;
}

export interface TimelineClipMoveEdit {
  group: TimelineClip[];
  appliedDelta: number;
  preview: TimelineClipEditPreview;
}

export interface TimelineClipTrimEdit {
  group: TimelineClip[];
  edge: 'start' | 'end';
  appliedDelta: number;
  updates: TimelineGroupResizeUpdate[];
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
  includeLinked,
  anchorClip,
  nextStart,
}: TimelinePreviewOptions & {
  anchorClip: TimelineClip;
  nextStart: number;
}): TimelineClipMoveEdit {
  const groupIds = resolvePreviewClipGroupIds(project, selectedClipIds, anchorClip, includeLinked);
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
      operation: 'move',
      delta: appliedDelta,
      groupCount: group.length,
    },
  };
}

export function resolveTimelineClipDropTrack({
  project,
  selectedClipIds,
  includeLinked,
  anchorClip,
  clientY,
  laneBounds,
}: {
  project: EditorProject;
  selectedClipIds: string[];
  includeLinked?: boolean;
  anchorClip: TimelineClip;
  clientY: number;
  laneBounds: TimelineLaneBounds[];
}): TimelineTrack | undefined {
  const targetTrackId = laneBounds.find((bounds) => clientY >= bounds.topPixels && clientY <= bounds.bottomPixels)?.id;
  const targetTrack = project.tracks.find((track) => track.id === targetTrackId);
  if (!targetTrack || targetTrack.locked) {
    return undefined;
  }

  const groupIds = resolvePreviewClipGroupIds(project, selectedClipIds, anchorClip, includeLinked);
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
  includeLinked,
  anchorClip,
  clientY,
  laneBounds,
}: {
  project: EditorProject;
  selectedClipIds: string[];
  includeLinked?: boolean;
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

  const groupIds = resolvePreviewClipGroupIds(project, selectedClipIds, anchorClip, includeLinked);
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
  includeLinked,
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

  const groupIds = resolvePreviewClipGroupIds(project, selectedClipIds, anchorClip, includeLinked);
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
    snapped: Math.abs(snappedStart - requestedStart) > 0.001,
    constrained: !canPlaceOnTarget,
    collision: !canPlaceOnTarget,
    operation: newTrack ? 'new-track' : 'clip-drop',
    groupCount: group.length,
    isNewTrack: Boolean(newTrack),
  };
}

export function resolveTimelineClipDragPointerPlan({
  project,
  selectedClipIds,
  includeLinked,
  anchorClip,
  clientY,
  laneBounds,
}: {
  project: EditorProject;
  selectedClipIds: string[];
  includeLinked?: boolean;
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
    includeLinked,
    anchorClip,
    clientY,
    laneBounds,
  });
  const newTrack = targetTrack
    ? undefined
    : resolveTimelineClipNewTrackDrop({
      project,
      selectedClipIds,
      includeLinked,
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
  includeLinked,
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
    includeLinked,
    anchorClip,
    nextStart,
  });
  const targetTrack = resolveTimelineClipDropTrack({
    project,
    selectedClipIds,
    includeLinked,
    anchorClip,
    clientY,
    laneBounds,
  });
  const newTrack = targetTrack
    ? undefined
    : resolveTimelineClipNewTrackDrop({
      project,
      selectedClipIds,
      includeLinked,
      anchorClip,
      clientY,
      laneBounds,
    });
  const dropPreview = resolveTimelineClipDropPreview({
    project,
    selectedClipIds,
    snapEnabled,
    snapExtraPoints,
    includeLinked,
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
      groupCount: moveEdit.group.length,
    }),
  };
}

export function resolveTimelineClipDragCommitState({
  project,
  selectedClipIds,
  snapEnabled,
  snapExtraPoints,
  includeLinked,
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
      includeLinked,
      anchorClip,
      clientY,
      laneBounds,
    });
  const newTrack = clientY === undefined || targetTrack
    ? undefined
    : resolveTimelineClipNewTrackDrop({
      project,
      selectedClipIds,
      includeLinked,
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
      includeLinked,
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
  groupCount,
}: {
  anchorClip: TimelineClip;
  movePreview: TimelineClipEditPreview;
  dropPreview: TimelineClipDropPreview | null;
  groupCount: number;
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
    operation: dropPreview?.operation ?? movePreview.operation,
    delta: movePreview.delta,
    duration: dropPreview?.duration ?? movePreview.duration,
    groupCount: dropPreview?.groupCount ?? groupCount,
    snapped: dropPreview?.snapped ?? movePreview.snapped,
    constrained: dropPreview?.constrained ?? movePreview.constrained,
    ripple: dropPreview?.ripple ?? movePreview.ripple,
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
    operation: preview.operation,
    delta: preview.delta,
    duration: preview.duration,
    groupCount: preview.groupCount ?? 1,
    snapped: preview.snapped,
    constrained: preview.constrained,
    ripple: preview.ripple,
  };
}

export function resolveTimelineClipTrimEdit({
  project,
  selectedClipIds,
  snapEnabled,
  snapExtraPoints,
  includeLinked,
  rippleMode,
  clip,
  edge,
  deltaSeconds,
}: TimelinePreviewOptions & {
  rippleMode: boolean;
  clip: TimelineClip;
  edge: 'start' | 'end';
  deltaSeconds: number;
}): TimelineClipTrimEdit {
  const clipEnd = roundTime(clip.start + clip.duration);
  const trimGroupIds = rippleMode && includeLinked !== false
    ? getLinkedClipIds(project, clip.id)
    : resolvePreviewClipGroupIds(project, selectedClipIds, clip, includeLinked);
  const trimOptions = { ripple: rippleMode, preventOverlap: !rippleMode };

  if (!rippleMode && trimGroupIds.length > 1) {
    const requestedAnchorTime = roundTime(edge === 'start'
      ? Math.min(clipEnd - 0.25, Math.max(0, clip.start + deltaSeconds))
      : Math.max(clip.start + 0.25, clipEnd + deltaSeconds));
    const snappedAnchorTime = snapEnabled
      ? snapTimeToEditPoints(project, requestedAnchorTime, {
        threshold: 0.18,
        excludeClipIds: trimGroupIds,
        extraPoints: snapExtraPoints,
      })
      : requestedAnchorTime;
    const resizePlan = resolveTimelineGroupResizeFromProject({
      project,
      clipIds: trimGroupIds,
      edge,
      anchorClipId: clip.id,
      requestedAnchorTimelineTime: snappedAnchorTime,
    });
    const group = resizePlan?.group.members.map((member) => member.clip) ?? findPreviewClips(project, trimGroupIds);
    const appliedAnchorTime = resizePlan?.appliedAnchorTimelineTime ?? (edge === 'start' ? clip.start : clipEnd);
    const nextDuration = edge === 'start'
      ? roundTime(Math.max(0.25, clipEnd - appliedAnchorTime))
      : roundTime(Math.max(0.25, appliedAnchorTime - clip.start));
    const appliedDelta = resizePlan?.appliedDelta ?? 0;

    return {
      group,
      edge,
      appliedDelta,
      updates: resizePlan?.updates ?? [],
      preview: {
        start: edge === 'start' ? appliedAnchorTime : clip.start,
        duration: nextDuration,
        snapped: Math.abs(snappedAnchorTime - requestedAnchorTime) > 0.001,
        constrained: resizePlan?.constrained ?? false,
        operation: 'trim',
        ripple: false,
        delta: appliedDelta,
        groupCount: group.length,
        label: `Trim ${edge === 'start' ? 'head' : 'tail'} ${formatSignedEditDelta(appliedDelta)} / ${formatRulerTime(nextDuration)} / ${group.length} clips`,
      },
    };
  }

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
      group: findPreviewClips(project, trimGroupIds),
      edge,
      appliedDelta: roundTime(appliedStart - clip.start),
      updates: [{
        clipId: clip.id,
        trackId: clip.trackId,
        currentTimelineTime: clip.start,
        appliedTimelineTime: appliedStart,
      }],
      preview: {
        start: appliedStart,
        duration: roundTime(Math.max(0.25, clipEnd - appliedStart)),
        snapped: Math.abs(snappedStart - requestedStart) > 0.001,
        constrained: Math.abs(appliedStart - snappedStart) > 0.001,
        operation: 'trim',
        ripple: rippleMode,
        delta: roundTime(appliedStart - clip.start),
        groupCount: 1,
        label: `Trim head ${formatSignedEditDelta(appliedStart - clip.start)} / ${formatRulerTime(roundTime(Math.max(0.25, clipEnd - appliedStart)))}`,
      },
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
    group: findPreviewClips(project, trimGroupIds),
    edge,
    appliedDelta: roundTime(appliedEnd - clipEnd),
    updates: [{
      clipId: clip.id,
      trackId: clip.trackId,
      currentTimelineTime: clipEnd,
      appliedTimelineTime: appliedEnd,
    }],
    preview: {
      start: clip.start,
      duration: roundTime(Math.max(0.25, appliedEnd - clip.start)),
      snapped: Math.abs(snappedEnd - requestedEnd) > 0.001,
      constrained: Math.abs(appliedEnd - snappedEnd) > 0.001,
      operation: 'trim',
      ripple: rippleMode,
      delta: roundTime(appliedEnd - clipEnd),
      groupCount: 1,
      label: `Trim tail ${formatSignedEditDelta(appliedEnd - clipEnd)} / ${formatRulerTime(roundTime(Math.max(0.25, appliedEnd - clip.start)))}`,
    },
  };
}

export function resolveTimelineClipTrimPreview(options: TimelinePreviewOptions & {
  rippleMode: boolean;
  clip: TimelineClip;
  edge: 'start' | 'end';
  deltaSeconds: number;
}): TimelineClipEditPreview {
  return resolveTimelineClipTrimEdit(options).preview;
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
      operation: 'slip',
      delta: appliedDelta,
      sourceIn: previewClip?.sourceIn ?? clip.sourceIn,
      sourceInDelta: appliedDelta,
      label: `Slip ${formatSignedEditDelta(appliedDelta)}`,
    };
  } catch {
    return {
    start: clip.start,
    duration: clip.duration,
    snapped: false,
    constrained: true,
    operation: 'slip',
    delta: 0,
    sourceIn: clip.sourceIn,
    sourceInDelta: 0,
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
      operation: 'slide',
      delta: appliedDelta,
      sourceIn: previewClip?.sourceIn ?? clip.sourceIn,
      sourceInDelta: previewClip ? roundTime(previewClip.sourceIn - clip.sourceIn) : 0,
      label: `Slide ${formatSignedEditDelta(appliedDelta)}`,
    };
  } catch {
    return {
    start: clip.start,
    duration: clip.duration,
    snapped: false,
    constrained: true,
    operation: 'slide',
    delta: 0,
    sourceIn: clip.sourceIn,
    sourceInDelta: 0,
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
      operation: 'roll',
      delta: appliedDelta,
      sourceIn: previewClip?.sourceIn ?? clip.sourceIn,
      sourceInDelta: previewClip ? roundTime(previewClip.sourceIn - clip.sourceIn) : 0,
      label: `Roll ${formatSignedEditDelta(appliedDelta)}`,
    };
  } catch {
    return {
    start: clip.start,
    duration: clip.duration,
    snapped: false,
    constrained: true,
    operation: 'roll',
    delta: 0,
    sourceIn: clip.sourceIn,
    sourceInDelta: 0,
    label: 'Roll blocked',
  };
}
}

function resolvePreviewClipGroupIds(
  project: EditorProject,
  selectedClipIds: string[],
  anchorClip: TimelineClip,
  includeLinked = true,
): string[] {
  return selectedClipIds.includes(anchorClip.id)
    ? selectedClipIds
    : includeLinked
      ? getGroupedClipIds(project, anchorClip.id)
      : [anchorClip.id];
}

function findPreviewClips(project: EditorProject, clipIds: string[]): TimelineClip[] {
  return project.tracks.flatMap((track) => track.clips).filter((clip) => clipIds.includes(clip.id));
}
