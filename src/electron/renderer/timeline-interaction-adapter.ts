import { timelinePointerDeltaSeconds } from '../../lib/editor/timeline-view';
import type { EditorProject, TimelineClip } from '../../lib/editor/types';
import { resolveTimelineDropStartPlan } from './media-drop-helpers';
import type {
  TimelineClipBodyDragMode,
  TimelineClipEdgeDragMode,
} from './editor-view-model';
import {
  resolveTimelineClipClickSelection,
  type TimelineClipClickModifiers,
  type TimelineClipSelectionResult,
} from './timeline-selection-helpers';
import {
  resolveTimelineRulerScrubEndPlan,
  resolveTimelineRulerScrubMovePlan,
  resolveTimelineRulerScrubStartPlan,
  type TimelineRulerScrubEndPlan,
  type TimelineRulerScrubMovePlan,
  type TimelineRulerScrubStartPlan,
} from './timeline-viewport-helpers';

export const TIMELINE_INTERACTION_DRAG_THRESHOLD_PX = 4;

export interface TimelineClipBodyInteractionSession {
  kind: 'clip-body';
  pointerX: number;
  pointerY: number;
  scrollLeft: number;
  start: number;
  clickOffsetSeconds: number;
  deltaSeconds: number;
  moved: boolean;
  mode: TimelineClipBodyDragMode;
}

export interface TimelineClipEdgeInteractionSession {
  kind: 'clip-edge';
  pointerX: number;
  scrollLeft: number;
  clipStart: number;
  clipDuration: number;
  minDuration: number;
  rawDeltaSeconds: number;
  deltaSeconds: number;
  moved: boolean;
  edge: 'start' | 'end';
  mode: TimelineClipEdgeDragMode;
}

export interface TimelineClipBodyInteractionMove {
  session: TimelineClipBodyInteractionSession;
  deltaSeconds: number;
  nextStart: number;
  grabTime: number;
}

export interface TimelineClipEdgeInteractionMove {
  session: TimelineClipEdgeInteractionSession;
  rawDeltaSeconds: number;
  deltaSeconds: number;
  constrained: boolean;
  previewStart: number;
  previewDuration: number;
}

export interface TimelineWheelZoomPlan {
  nextPixelsPerSecond: number;
  nextScrollLeft: number;
  anchorTime: number;
  shouldZoom: boolean;
}

export function beginTimelineClipBodyInteraction({
  clientX,
  clientY,
  scrollLeft,
  start,
  clickOffsetSeconds = 0,
  mode,
}: {
  clientX: number;
  clientY: number;
  scrollLeft: number;
  start: number;
  clickOffsetSeconds?: number;
  mode: TimelineClipBodyDragMode;
}): TimelineClipBodyInteractionSession {
  return {
    kind: 'clip-body',
    pointerX: clientX,
    pointerY: clientY,
    scrollLeft,
    start,
    clickOffsetSeconds: Math.max(0, clickOffsetSeconds),
    deltaSeconds: 0,
    moved: false,
    mode,
  };
}

export function resolveTimelineClipBodyInteractionMove({
  session,
  clientX,
  clientY,
  currentScrollLeft,
  pixelsPerSecond,
}: {
  session: TimelineClipBodyInteractionSession;
  clientX: number;
  clientY: number;
  currentScrollLeft: number;
  pixelsPerSecond: number;
}): TimelineClipBodyInteractionMove {
  const deltaSeconds = resolveTimelineInteractionDeltaSeconds({
    pointerX: session.pointerX,
    scrollLeft: session.scrollLeft,
    clientX,
    currentScrollLeft,
    pixelsPerSecond,
  });
  const moved = session.moved || hasMovedPastTimelineInteractionThreshold({
    originX: session.pointerX,
    originY: session.pointerY,
    clientX,
    clientY,
  });

  return {
    session: {
      ...session,
      deltaSeconds,
      moved,
    },
    deltaSeconds,
    nextStart: Math.max(0, session.start + deltaSeconds),
    grabTime: Math.max(0, session.start + deltaSeconds) + session.clickOffsetSeconds,
  };
}

export function beginTimelineClipEdgeInteraction({
  clientX,
  scrollLeft,
  clipStart = 0,
  clipDuration = Number.POSITIVE_INFINITY,
  minDuration = 0.25,
  edge,
  mode,
}: {
  clientX: number;
  scrollLeft: number;
  clipStart?: number;
  clipDuration?: number;
  minDuration?: number;
  edge: 'start' | 'end';
  mode: TimelineClipEdgeDragMode;
}): TimelineClipEdgeInteractionSession {
  return {
    kind: 'clip-edge',
    pointerX: clientX,
    scrollLeft,
    clipStart: Math.max(0, clipStart),
    clipDuration: Math.max(0, clipDuration),
    minDuration: Math.max(0.001, minDuration),
    rawDeltaSeconds: 0,
    deltaSeconds: 0,
    moved: false,
    edge,
    mode,
  };
}

export function resolveTimelineClipEdgeInteractionMove({
  session,
  clientX,
  currentScrollLeft,
  pixelsPerSecond,
}: {
  session: TimelineClipEdgeInteractionSession;
  clientX: number;
  currentScrollLeft: number;
  pixelsPerSecond: number;
}): TimelineClipEdgeInteractionMove {
  const rawDeltaSeconds = resolveTimelineInteractionDeltaSeconds({
    pointerX: session.pointerX,
    scrollLeft: session.scrollLeft,
    clientX,
    currentScrollLeft,
    pixelsPerSecond,
  });
  const deltaSeconds = clampTimelineClipEdgeDeltaSeconds(session, rawDeltaSeconds);
  const previewStart = session.edge === 'start'
    ? Math.max(0, session.clipStart + deltaSeconds)
    : session.clipStart;
  const previewDuration = session.edge === 'start'
    ? Math.max(session.minDuration, session.clipDuration - deltaSeconds)
    : Math.max(session.minDuration, session.clipDuration + deltaSeconds);

  return {
    session: {
      ...session,
      rawDeltaSeconds,
      deltaSeconds,
      moved:
        session.moved ||
        (
          Math.abs(clientX - session.pointerX) > TIMELINE_INTERACTION_DRAG_THRESHOLD_PX &&
          Math.abs(deltaSeconds) > 0
        ),
    },
    rawDeltaSeconds,
    deltaSeconds,
    constrained: Math.abs(deltaSeconds - rawDeltaSeconds) > 0.001,
    previewStart,
    previewDuration,
  };
}

export function beginTimelineScrubInteraction({
  rulerLeft,
  startScrollLeft,
  playhead,
}: {
  rulerLeft: number;
  startScrollLeft: number;
  playhead: number;
}): TimelineRulerScrubStartPlan {
  return resolveTimelineRulerScrubStartPlan({
    rulerLeft,
    startScrollLeft,
    playhead,
  });
}

export function resolveTimelineScrubInteractionMove({
  session,
  clientX,
  currentScrollLeft,
  pixelsPerSecond,
  duration,
  frameRate,
}: Parameters<typeof resolveTimelineRulerScrubMovePlan>[0]): TimelineRulerScrubMovePlan {
  return resolveTimelineRulerScrubMovePlan({
    session,
    clientX,
    currentScrollLeft,
    pixelsPerSecond,
    duration,
    frameRate,
  });
}

export function resolveTimelineScrubInteractionEnd({
  session,
  clientX,
  currentScrollLeft,
  pixelsPerSecond,
  duration,
  frameRate,
}: Parameters<typeof resolveTimelineRulerScrubEndPlan>[0]): TimelineRulerScrubEndPlan {
  return resolveTimelineRulerScrubEndPlan({
    session,
    clientX,
    currentScrollLeft,
    pixelsPerSecond,
    duration,
    frameRate,
  });
}

export function resolveTimelineImportDropStart({
  project,
  clientX,
  laneLeft,
  pixelsPerSecond,
  snapEnabled,
  snapExtraPoints,
}: {
  project: EditorProject;
  clientX: number;
  laneLeft: number;
  pixelsPerSecond: number;
  snapEnabled: boolean;
  snapExtraPoints: number[];
}): number {
  return resolveTimelineDropStartPlan({
    project,
    clientX,
    laneLeft,
    pixelsPerSecond,
    snapEnabled,
    snapExtraPoints,
  }).start;
}

export function resolveTimelineClipSelectInteraction({
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
  return resolveTimelineClipClickSelection({
    project,
    currentSelectedClipIds,
    clip,
    modifiers,
    includeLinked,
  });
}

export function resolveTimelineWheelZoomInteraction({
  clientX,
  viewportLeft,
  viewportWidth,
  scrollLeft,
  currentPixelsPerSecond,
  deltaY,
  deltaMode,
  duration,
  minPixelsPerSecond = 8,
  maxPixelsPerSecond = 52,
  timelineStartOffsetPixels = 0,
}: {
  clientX: number;
  viewportLeft: number;
  viewportWidth: number;
  scrollLeft: number;
  currentPixelsPerSecond: number;
  deltaY: number;
  deltaMode: number;
  duration: number;
  minPixelsPerSecond?: number;
  maxPixelsPerSecond?: number;
  timelineStartOffsetPixels?: number;
}): TimelineWheelZoomPlan {
  const safeCurrentPixelsPerSecond = clampNumber(currentPixelsPerSecond, minPixelsPerSecond, maxPixelsPerSecond);
  const localX = clampNumber(clientX - viewportLeft, 0, Math.max(0, viewportWidth));
  const timelineStartOffset = Math.max(0, timelineStartOffsetPixels);
  const anchorTime = duration > 0
    ? clampNumber(
      (Math.max(0, scrollLeft) + localX - timelineStartOffset) / safeCurrentPixelsPerSecond,
      0,
      duration,
    )
    : 0;
  const normalizedDelta = deltaMode === 1 ? deltaY * 16 : deltaY;
  const cappedDelta = Math.sign(normalizedDelta) * Math.min(Math.abs(normalizedDelta), 30);
  const zoomFactor = Math.exp(-cappedDelta / 300);
  const nextPixelsPerSecond = roundToStep(
    clampNumber(safeCurrentPixelsPerSecond * zoomFactor, minPixelsPerSecond, maxPixelsPerSecond),
    0.5,
  );
  const nextTimelineWidth = Math.max(0, timelineStartOffset + (duration * nextPixelsPerSecond));
  const maxScrollLeft = Math.max(0, nextTimelineWidth - Math.max(0, viewportWidth));
  const nextScrollLeft = clampNumber(
    timelineStartOffset + (anchorTime * nextPixelsPerSecond) - localX,
    0,
    maxScrollLeft,
  );

  return {
    nextPixelsPerSecond,
    nextScrollLeft: Math.round(nextScrollLeft),
    anchorTime,
    shouldZoom: nextPixelsPerSecond !== safeCurrentPixelsPerSecond,
  };
}

function resolveTimelineInteractionDeltaSeconds({
  pointerX,
  scrollLeft,
  clientX,
  currentScrollLeft,
  pixelsPerSecond,
}: {
  pointerX: number;
  scrollLeft: number;
  clientX: number;
  currentScrollLeft: number;
  pixelsPerSecond: number;
}): number {
  return timelinePointerDeltaSeconds({
    originClientXPixels: pointerX,
    currentClientXPixels: clientX,
    originScrollLeftPixels: scrollLeft,
    currentScrollLeftPixels: currentScrollLeft,
    pixelsPerSecond,
  });
}

function hasMovedPastTimelineInteractionThreshold({
  originX,
  originY,
  clientX,
  clientY,
}: {
  originX: number;
  originY: number;
  clientX: number;
  clientY: number;
}): boolean {
  return (
    Math.abs(clientX - originX) > TIMELINE_INTERACTION_DRAG_THRESHOLD_PX ||
    Math.abs(clientY - originY) > TIMELINE_INTERACTION_DRAG_THRESHOLD_PX
  );
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function clampTimelineClipEdgeDeltaSeconds(
  session: TimelineClipEdgeInteractionSession,
  rawDeltaSeconds: number,
): number {
  if (!Number.isFinite(rawDeltaSeconds)) {
    return 0;
  }

  if (!Number.isFinite(session.clipDuration)) {
    return rawDeltaSeconds;
  }

  if (session.edge === 'start') {
    const minDelta = -session.clipStart;
    const maxDelta = Math.max(0, session.clipDuration - session.minDuration);
    return normalizeDeltaZero(clampNumber(rawDeltaSeconds, minDelta, maxDelta));
  }

  const minDelta = session.minDuration - session.clipDuration;
  return normalizeDeltaZero(Math.max(minDelta, rawDeltaSeconds));
}

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function normalizeDeltaZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}
