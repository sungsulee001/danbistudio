import { findClipSelectionRange, snapTimeToEditPoints } from '../../lib/editor/timeline';
import {
  fitTimelinePixelsPerSecond,
  timelineAutoScrollLeftForPointer,
  timelinePointerTimeFromClientX,
  timelineScrollLeftForTime,
} from '../../lib/editor/timeline-view';
import type { EditorProject } from '../../lib/editor/types';
import { formatTimecode, roundTime } from './editor-time-helpers';
import type { TimelineEditGuide } from './editor-view-model';

export interface TimelineEditSnapOptions {
  threshold?: number;
  excludeClipId?: string;
  excludeClipIds?: string[];
  extraPoints: number[];
}

export interface TimelineFitZoomState {
  nextPixelsPerSecond: number;
  nextScrollLeft: number;
  status: string;
}

export interface TimelinePlayheadNudgePlan {
  playhead: number;
}

export interface TimelineRulerScrubSession {
  rulerLeft: number;
  startScrollLeft: number;
  lastScrubTime: number;
}

export interface TimelineRulerScrubStartPlan {
  activeMonitor: 'program';
  session: TimelineRulerScrubSession;
}

export interface TimelineRulerScrubMovePlan {
  session: TimelineRulerScrubSession;
  playhead: number;
}

export interface TimelineRulerScrubEndPlan extends TimelineRulerScrubMovePlan {
  status: string;
}

export function resolveTimelinePlayheadTime({
  project,
  time,
  snapEnabled,
}: {
  project: EditorProject;
  time: number;
  snapEnabled: boolean;
}): number {
  const nextTime = snapEnabled
    ? snapTimeToEditPoints(project, time, { threshold: 0.12 })
    : Math.max(0, time);

  return Math.min(project.duration, nextTime);
}

export function resolveTimelinePlayheadNudgePlan({
  playhead,
  deltaSeconds,
  duration,
}: {
  playhead: number;
  deltaSeconds: number;
  duration: number;
}): TimelinePlayheadNudgePlan {
  return {
    playhead: Math.max(0, Math.min(duration, playhead + deltaSeconds)),
  };
}

export function resolveTimelineEditSnapOptions(
  timelineEditSnapPoints: number[],
  options: Omit<TimelineEditSnapOptions, 'extraPoints'> = {},
): TimelineEditSnapOptions {
  return {
    ...options,
    extraPoints: timelineEditSnapPoints,
  };
}

export function resolveTimelineEdgeAutoScrollLeft({
  clientX,
  viewportLeft,
  viewportWidth,
  currentScrollLeft,
  maxScrollLeft,
}: {
  clientX: number;
  viewportLeft: number;
  viewportWidth: number;
  currentScrollLeft: number;
  maxScrollLeft: number;
}): number {
  return timelineAutoScrollLeftForPointer({
    clientXPixels: clientX,
    viewportLeftPixels: viewportLeft,
    viewportWidthPixels: viewportWidth,
    currentScrollLeftPixels: currentScrollLeft,
    maxScrollLeftPixels: maxScrollLeft,
    edgeThresholdPixels: 56,
    maxStepPixels: 32,
  });
}

export function resolveTimelineEditGuide(guide: TimelineEditGuide | null): TimelineEditGuide | null {
  return guide ? { ...guide, time: roundTime(Math.max(0, guide.time)) } : null;
}

export function resolveTimelineVisibleScrollLeft({
  playhead,
  viewportWidth,
  currentScrollLeft,
  pixelsPerSecond,
  timelineStartOffsetPixels = 0,
}: {
  playhead: number;
  viewportWidth: number;
  currentScrollLeft: number;
  pixelsPerSecond: number;
  timelineStartOffsetPixels?: number;
}): number {
  const timelineStartOffset = Math.max(0, timelineStartOffsetPixels);
  const offsetSeconds = pixelsPerSecond > 0 ? timelineStartOffset / pixelsPerSecond : 0;

  return timelineScrollLeftForTime(playhead + offsetSeconds, {
    viewportWidthPixels: viewportWidth,
    currentScrollLeftPixels: currentScrollLeft,
    pixelsPerSecond,
    paddingPixels: 48,
  });
}

export function resolveTimelineFitZoom({
  project,
  selectedClipIds,
  viewportWidth,
  mode,
  timelineStartOffsetPixels = 0,
}: {
  project: EditorProject;
  selectedClipIds: string[];
  viewportWidth: number;
  mode: 'timeline' | 'selection';
  timelineStartOffsetPixels?: number;
}): TimelineFitZoomState {
  const range = mode === 'selection' ? findClipSelectionRange(project, selectedClipIds) : undefined;
  const duration = range ? roundTime(range.end - range.start) : project.duration;
  const timelineStartOffset = Math.max(0, timelineStartOffsetPixels);
  const contentViewportWidth = Math.max(0, viewportWidth - timelineStartOffset);
  const nextPixelsPerSecond = fitTimelinePixelsPerSecond(duration, contentViewportWidth, {
    minPixelsPerSecond: 8,
    maxPixelsPerSecond: 52,
  });

  return {
    nextPixelsPerSecond,
    nextScrollLeft: range ? Math.max(0, timelineStartOffset + (range.start * nextPixelsPerSecond) - 12) : 0,
    status: range ? 'Timeline zoom fit to selection' : 'Timeline zoom fit',
  };
}

export function resolveTimelineRulerScrubTime({
  clientX,
  rulerLeft,
  scrollDelta,
  pixelsPerSecond,
  duration,
  frameRate,
}: {
  clientX: number;
  rulerLeft: number;
  scrollDelta: number;
  pixelsPerSecond: number;
  duration: number;
  frameRate: number;
}): number {
  return timelinePointerTimeFromClientX(clientX, {
    rulerLeftPixels: rulerLeft - scrollDelta,
    pixelsPerSecond,
    durationSeconds: duration,
    frameRate,
  });
}

export function resolveTimelineRulerScrubStartPlan({
  rulerLeft,
  startScrollLeft,
  playhead,
}: {
  rulerLeft: number;
  startScrollLeft: number;
  playhead: number;
}): TimelineRulerScrubStartPlan {
  return {
    activeMonitor: 'program',
    session: {
      rulerLeft,
      startScrollLeft,
      lastScrubTime: playhead,
    },
  };
}

export function resolveTimelineRulerScrubMovePlan({
  session,
  clientX,
  currentScrollLeft,
  pixelsPerSecond,
  duration,
  frameRate,
}: {
  session: TimelineRulerScrubSession;
  clientX: number;
  currentScrollLeft: number;
  pixelsPerSecond: number;
  duration: number;
  frameRate: number;
}): TimelineRulerScrubMovePlan {
  const playhead = resolveTimelineRulerScrubTime({
    clientX,
    rulerLeft: session.rulerLeft,
    scrollDelta: currentScrollLeft - session.startScrollLeft,
    pixelsPerSecond,
    duration,
    frameRate,
  });

  return {
    session: {
      ...session,
      lastScrubTime: playhead,
    },
    playhead,
  };
}

export function resolveTimelineRulerScrubEndPlan({
  session,
  clientX,
  currentScrollLeft,
  pixelsPerSecond,
  duration,
  frameRate,
}: {
  session: TimelineRulerScrubSession;
  clientX: number;
  currentScrollLeft: number;
  pixelsPerSecond: number;
  duration: number;
  frameRate: number;
}): TimelineRulerScrubEndPlan {
  const movePlan = resolveTimelineRulerScrubMovePlan({
    session,
    clientX,
    currentScrollLeft,
    pixelsPerSecond,
    duration,
    frameRate,
  });

  return {
    ...movePlan,
    status: `Timeline scrubbed to ${formatTimecode(movePlan.session.lastScrubTime, frameRate)}`,
  };
}
