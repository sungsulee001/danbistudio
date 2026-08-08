import {
  expandClipIdsWithLinkedAndGroupedClips,
  findAdjacentEditPoint,
  findAllSelectableClipIds,
  findClipIdsAtTime,
  findClipIdsInRange,
  findClipIdsRelativeToTime,
  getGroupedClipIds,
  type TimelineRange,
} from '../../lib/editor/timeline';
import type { EditorProject, TimelineClip } from '../../lib/editor/types';
import { formatTimecode } from './editor-time-helpers';

export type ClipSelectionMode = 'replace' | 'add' | 'toggle';

export interface TimelineClipSelectionResult {
  selectedClipId: string;
  selectedClipIds: string[];
  selectedTrackId: string;
  seekTime?: number;
}

export interface TimelineClipClickModifiers {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}

export interface TimelineClipListSelectionResult {
  selectedClipId: string;
  selectedClipIds: string[];
  status: string;
}

export interface TimelineAdjacentEditResult {
  editPoint?: number;
  status: string;
}

export interface TimelineBoxRangeSelectionResult {
  selectedClipId: string;
  selectedClipIds: string[];
  selectedInRangeIds: string[];
  shouldUpdateSelection: boolean;
  status?: string;
}

export interface TimelineBoxSelectionState {
  trackIds: string[];
  start: number;
  end: number;
}

export interface TimelineLaneDragSession {
  trackId: string;
  laneLeft: number;
  startScrollLeft: number;
  startTime: number;
  startClientY: number;
  appendSelection: boolean;
  moved: boolean;
}

export interface TimelineLaneDragStartPlan {
  session: TimelineLaneDragSession;
}

export interface TimelineLaneDragMovePlan {
  session: TimelineLaneDragSession;
  boxSelection: TimelineBoxSelectionState;
}

export type TimelineLaneDragEndPlan =
  | {
    kind: 'seek';
    boxSelection: null;
    playhead: number;
    shouldClearSelection: boolean;
  }
  | {
    kind: 'select';
    boxSelection: null;
    shouldUpdateSelection: boolean;
    selectedClipId: string;
    selectedClipIds: string[];
    status?: string;
  };

export function resolvePrimarySelection(clipId: string): Pick<TimelineClipListSelectionResult, 'selectedClipId' | 'selectedClipIds'> {
  return {
    selectedClipId: clipId,
    selectedClipIds: clipId ? [clipId] : [],
  };
}

export function resolveTimelineClipSelection({
  project,
  currentSelectedClipIds,
  clip,
  shouldSeek,
  mode,
  includeLinked = true,
}: {
  project: EditorProject;
  currentSelectedClipIds: string[];
  clip: TimelineClip;
  shouldSeek: boolean;
  mode: ClipSelectionMode;
  includeLinked?: boolean;
}): TimelineClipSelectionResult {
  const selectionIds = includeLinked
    ? getGroupedClipIds(project, clip.id)
    : expandClipIdsWithLinkedAndGroupedClips(project, [clip.id], { includeLinked: false, includeGrouped: true });

  return {
    selectedClipId: clip.id,
    selectedClipIds: mergeClipSelectionIds(currentSelectedClipIds, selectionIds, mode),
    selectedTrackId: clip.trackId,
    seekTime: shouldSeek ? clip.start : undefined,
  };
}

export function resolveTimelineClipClickSelection({
  project,
  currentSelectedClipIds,
  clip,
  modifiers,
  includeLinked = true,
}: {
  project: EditorProject;
  currentSelectedClipIds: string[];
  clip: TimelineClip;
  modifiers: TimelineClipClickModifiers;
  includeLinked?: boolean;
}): TimelineClipSelectionResult {
  if (modifiers.metaKey || modifiers.ctrlKey) {
    return resolveTimelineClipSelection({
      project,
      currentSelectedClipIds,
      clip,
      shouldSeek: false,
      mode: 'toggle',
      includeLinked,
    });
  }

  if (modifiers.shiftKey) {
    return resolveTimelineClipSelection({
      project,
      currentSelectedClipIds,
      clip,
      shouldSeek: false,
      mode: 'add',
      includeLinked,
    });
  }

  if (currentSelectedClipIds.includes(clip.id) && currentSelectedClipIds.length > 1) {
    return {
      selectedClipId: clip.id,
      selectedClipIds: currentSelectedClipIds,
      selectedTrackId: clip.trackId,
    };
  }

  return resolveTimelineClipSelection({
    project,
    currentSelectedClipIds,
    clip,
    shouldSeek: true,
    mode: 'replace',
    includeLinked,
  });
}

export function resolveSelectAllTimelineClips(project: EditorProject): TimelineClipListSelectionResult {
  const clipIds = findAllSelectableClipIds(project);
  return {
    selectedClipId: clipIds[0] ?? '',
    selectedClipIds: clipIds,
    status: `Selected ${clipIds.length} clips`,
  };
}

export function resolveRelativeTimelineClipSelection({
  project,
  playhead,
  direction,
  selectedTrackId,
  allTracks,
}: {
  project: EditorProject;
  playhead: number;
  direction: 'left' | 'right';
  selectedTrackId: string;
  allTracks: boolean;
}): TimelineClipListSelectionResult {
  const clipIds = findClipIdsRelativeToTime(project, playhead, {
    direction,
    trackId: allTracks ? undefined : selectedTrackId,
  });

  return {
    selectedClipId: clipIds[0] ?? '',
    selectedClipIds: clipIds,
    status: clipIds.length > 0
      ? `Selected ${clipIds.length} clip${clipIds.length > 1 ? 's' : ''} to the ${direction}${allTracks ? ' on all tracks' : ''}`
      : `No selectable clips to the ${direction}${allTracks ? ' on all tracks' : ''}`,
  };
}

export function resolveTimelineClipSelectionAtPlayhead({
  project,
  playhead,
  selectedTrackId,
  allTracks,
}: {
  project: EditorProject;
  playhead: number;
  selectedTrackId: string;
  allTracks: boolean;
}): TimelineClipListSelectionResult {
  const clipIds = findClipIdsAtTime(project, playhead, {
    trackId: allTracks ? undefined : selectedTrackId,
  });

  return {
    selectedClipId: clipIds[0] ?? '',
    selectedClipIds: clipIds,
    status: clipIds.length > 0
      ? `Selected ${clipIds.length} clip${clipIds.length > 1 ? 's' : ''} at playhead${allTracks ? ' on all tracks' : ''}`
      : `No selectable clip at playhead${allTracks ? ' on all tracks' : ''}`,
  };
}

export function resolveMarkedTimelineRangeSelection({
  project,
  markedRange,
  selectedTrackId,
  allTracks,
}: {
  project: EditorProject;
  markedRange: TimelineRange | null;
  selectedTrackId: string;
  allTracks: boolean;
}): TimelineClipListSelectionResult {
  if (!markedRange) {
    return {
      selectedClipId: '',
      selectedClipIds: [],
      status: 'Set both in and out points first',
    };
  }

  const clipIds = findClipIdsInRange(project, markedRange, {
    trackId: allTracks ? undefined : selectedTrackId,
  });

  return {
    selectedClipId: clipIds[0] ?? '',
    selectedClipIds: clipIds,
    status: clipIds.length > 0
      ? `Selected ${clipIds.length} clip${clipIds.length > 1 ? 's' : ''} in marked range${allTracks ? ' on all tracks' : ''}`
      : `No selectable clips in marked range${allTracks ? ' on all tracks' : ''}`,
  };
}

export function resolveAdjacentTimelineEdit({
  project,
  playhead,
  direction,
  selectedTrackId,
  allTracks,
}: {
  project: EditorProject;
  playhead: number;
  direction: 'previous' | 'next';
  selectedTrackId: string;
  allTracks: boolean;
}): TimelineAdjacentEditResult {
  const editPoint = findAdjacentEditPoint(project, playhead, {
    direction,
    trackId: allTracks ? undefined : selectedTrackId,
  });

  if (editPoint === undefined) {
    return {
      status: `No ${direction} edit point${allTracks ? ' on all tracks' : ''}`,
    };
  }

  return {
    editPoint,
    status: `${direction === 'previous' ? 'Previous' : 'Next'} edit point at ${formatTimecode(editPoint, project.fps)}${allTracks ? ' on all tracks' : ''}`,
  };
}

export function resolveTimelineBoxRangeSelection({
  project,
  scopedTrackIds,
  rangeStart,
  rangeEnd,
  appendSelection,
  currentSelectedClipIds,
}: {
  project: EditorProject;
  scopedTrackIds: string[];
  rangeStart: number;
  rangeEnd: number;
  appendSelection: boolean;
  currentSelectedClipIds: string[];
}): TimelineBoxRangeSelectionResult {
  const trackIds = new Set(scopedTrackIds);
  const selectedInRangeIds = expandClipIdsWithLinkedAndGroupedClips(project, project.tracks
    .filter((track) => trackIds.has(track.id))
    .flatMap((track) => track.clips)
    .filter((clip) => clip.start < rangeEnd && clip.start + clip.duration > rangeStart)
    .map((clip) => clip.id));

  if (selectedInRangeIds.length === 0) {
    return {
      selectedClipId: appendSelection ? currentSelectedClipIds[0] ?? '' : '',
      selectedClipIds: appendSelection ? currentSelectedClipIds : [],
      selectedInRangeIds,
      shouldUpdateSelection: !appendSelection,
    };
  }

  const selectedClipIds = appendSelection
    ? Array.from(new Set([...currentSelectedClipIds, ...selectedInRangeIds]))
    : selectedInRangeIds;

  return {
    selectedClipId: selectedClipIds[0] ?? '',
    selectedClipIds,
    selectedInRangeIds,
    shouldUpdateSelection: true,
    status: `Selected ${selectedInRangeIds.length} clip${selectedInRangeIds.length > 1 ? 's' : ''} across ${scopedTrackIds.length} track${scopedTrackIds.length > 1 ? 's' : ''}`,
  };
}

export function resolveTimelineLaneDragStartPlan({
  trackId,
  laneLeft,
  startScrollLeft,
  clientX,
  clientY,
  pixelsPerSecond,
  appendSelection,
}: {
  trackId: string;
  laneLeft: number;
  startScrollLeft: number;
  clientX: number;
  clientY: number;
  pixelsPerSecond: number;
  appendSelection: boolean;
}): TimelineLaneDragStartPlan {
  return {
    session: {
      trackId,
      laneLeft,
      startScrollLeft,
      startTime: resolveTimelineLaneDragTime({
        laneLeft,
        startScrollLeft,
        currentScrollLeft: startScrollLeft,
        clientX,
        pixelsPerSecond,
      }),
      startClientY: clientY,
      appendSelection,
      moved: false,
    },
  };
}

export function resolveTimelineLaneDragMovePlan({
  session,
  clientX,
  clientY,
  currentScrollLeft,
  pixelsPerSecond,
  scopedTrackIds,
}: {
  session: TimelineLaneDragSession;
  clientX: number;
  clientY: number;
  currentScrollLeft: number;
  pixelsPerSecond: number;
  scopedTrackIds: string[];
}): TimelineLaneDragMovePlan {
  const currentTime = resolveTimelineLaneDragTime({
    laneLeft: session.laneLeft,
    startScrollLeft: session.startScrollLeft,
    currentScrollLeft,
    clientX,
    pixelsPerSecond,
  });
  const moved = session.moved
    || Math.abs(currentTime - session.startTime) > 0.1
    || Math.abs(clientY - session.startClientY) > 6;
  const trackIds = scopedTrackIds.length > 0 ? scopedTrackIds : [session.trackId];

  return {
    session: {
      ...session,
      moved,
    },
    boxSelection: {
      trackIds,
      start: Math.min(session.startTime, currentTime),
      end: Math.max(session.startTime, currentTime),
    },
  };
}

export function resolveTimelineLaneDragEndPlan({
  project,
  session,
  clientX,
  currentScrollLeft,
  pixelsPerSecond,
  scopedTrackIds,
  currentSelectedClipIds,
}: {
  project: EditorProject;
  session: TimelineLaneDragSession;
  clientX: number;
  currentScrollLeft: number;
  pixelsPerSecond: number;
  scopedTrackIds: string[];
  currentSelectedClipIds: string[];
}): TimelineLaneDragEndPlan {
  const endTime = resolveTimelineLaneDragTime({
    laneLeft: session.laneLeft,
    startScrollLeft: session.startScrollLeft,
    currentScrollLeft,
    clientX,
    pixelsPerSecond,
  });

  if (!session.moved) {
    return {
      kind: 'seek',
      boxSelection: null,
      playhead: session.startTime,
      shouldClearSelection: !session.appendSelection,
    };
  }

  const selection = resolveTimelineBoxRangeSelection({
    project,
    scopedTrackIds: scopedTrackIds.length > 0 ? scopedTrackIds : [session.trackId],
    rangeStart: Math.min(session.startTime, endTime),
    rangeEnd: Math.max(session.startTime, endTime),
    appendSelection: session.appendSelection,
    currentSelectedClipIds,
  });

  return {
    kind: 'select',
    boxSelection: null,
    shouldUpdateSelection: selection.shouldUpdateSelection,
    selectedClipId: selection.selectedClipId,
    selectedClipIds: selection.selectedClipIds,
    status: selection.status,
  };
}

function resolveTimelineLaneDragTime({
  laneLeft,
  startScrollLeft,
  currentScrollLeft,
  clientX,
  pixelsPerSecond,
}: {
  laneLeft: number;
  startScrollLeft: number;
  currentScrollLeft: number;
  clientX: number;
  pixelsPerSecond: number;
}): number {
  const scrollDelta = currentScrollLeft - startScrollLeft;
  return Math.max(0, (clientX - laneLeft + scrollDelta) / pixelsPerSecond);
}

function mergeClipSelectionIds(
  currentSelectedClipIds: string[],
  selectionIds: string[],
  mode: ClipSelectionMode,
): string[] {
  if (mode === 'add') {
    return Array.from(new Set([...currentSelectedClipIds, ...selectionIds]));
  }

  if (mode === 'toggle') {
    const allSelectionIdsSelected = selectionIds.every((id) => currentSelectedClipIds.includes(id));
    const next = allSelectionIdsSelected
      ? currentSelectedClipIds.filter((id) => !selectionIds.includes(id))
      : [...currentSelectedClipIds, ...selectionIds];

    return next.length > 0 ? Array.from(new Set(next)) : selectionIds;
  }

  return selectionIds;
}
