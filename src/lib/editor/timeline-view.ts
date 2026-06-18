export interface TimelineZoomFitOptions {
  minPixelsPerSecond?: number;
  maxPixelsPerSecond?: number;
  paddingPixels?: number;
}

export interface TimelinePointerTimeOptions {
  rulerLeftPixels: number;
  pixelsPerSecond: number;
  durationSeconds: number;
  frameRate?: number;
}

export interface TimelineScrollVisibilityOptions {
  viewportWidthPixels: number;
  currentScrollLeftPixels: number;
  pixelsPerSecond: number;
  paddingPixels?: number;
}

export interface TimelinePointerDeltaOptions {
  originClientXPixels: number;
  currentClientXPixels: number;
  originScrollLeftPixels: number;
  currentScrollLeftPixels?: number;
  pixelsPerSecond: number;
}

export interface TimelineTransitionDurationDragOptions {
  startDurationSeconds: number;
  deltaSeconds: number;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
}

export interface TimelineKeyframeTimeDragOptions {
  startTimeSeconds: number;
  deltaSeconds: number;
  clipDurationSeconds: number;
}

export interface TimelineMarkerTimeDragOptions {
  startTimeSeconds: number;
  deltaSeconds: number;
  durationSeconds: number;
  frameRate?: number;
}

export interface TimelineEdgeAutoScrollOptions {
  clientXPixels: number;
  viewportLeftPixels: number;
  viewportWidthPixels: number;
  currentScrollLeftPixels: number;
  maxScrollLeftPixels: number;
  edgeThresholdPixels?: number;
  maxStepPixels?: number;
}

export interface TimelineTrackLaneBounds {
  id: string;
  topPixels: number;
  bottomPixels: number;
}

export function fitTimelinePixelsPerSecond(
  durationSeconds: number,
  viewportWidthPixels: number,
  options: TimelineZoomFitOptions = {},
): number {
  const minPixelsPerSecond = options.minPixelsPerSecond ?? 8;
  const maxPixelsPerSecond = Math.max(minPixelsPerSecond, options.maxPixelsPerSecond ?? 52);
  const paddingPixels = Math.max(0, options.paddingPixels ?? 24);

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return minPixelsPerSecond;
  }

  if (!Number.isFinite(viewportWidthPixels) || viewportWidthPixels <= paddingPixels) {
    return minPixelsPerSecond;
  }

  const usableWidth = viewportWidthPixels - paddingPixels;
  const fitted = usableWidth / durationSeconds;

  return roundToStep(clamp(fitted, minPixelsPerSecond, maxPixelsPerSecond), 0.5);
}

export function timelinePointerTimeFromClientX(
  clientXPixels: number,
  options: TimelinePointerTimeOptions,
): number {
  if (!Number.isFinite(clientXPixels) || !Number.isFinite(options.rulerLeftPixels)) {
    return 0;
  }

  if (!Number.isFinite(options.pixelsPerSecond) || options.pixelsPerSecond <= 0) {
    return 0;
  }

  if (!Number.isFinite(options.durationSeconds) || options.durationSeconds <= 0) {
    return 0;
  }

  const rawTime = (clientXPixels - options.rulerLeftPixels) / options.pixelsPerSecond;
  const clampedTime = clamp(rawTime, 0, options.durationSeconds);
  const frameRate = options.frameRate;
  if (frameRate && Number.isFinite(frameRate) && frameRate > 0) {
    return roundTime(Math.round(clampedTime * frameRate) / frameRate);
  }

  return roundTime(clampedTime);
}

export function timelineScrollLeftForTime(
  timeSeconds: number,
  options: TimelineScrollVisibilityOptions,
): number {
  const currentScrollLeft = Math.max(0, Number.isFinite(options.currentScrollLeftPixels) ? options.currentScrollLeftPixels : 0);
  if (!Number.isFinite(timeSeconds) || timeSeconds < 0) {
    return currentScrollLeft;
  }

  if (!Number.isFinite(options.viewportWidthPixels) || options.viewportWidthPixels <= 0) {
    return currentScrollLeft;
  }

  if (!Number.isFinite(options.pixelsPerSecond) || options.pixelsPerSecond <= 0) {
    return currentScrollLeft;
  }

  const paddingPixels = Math.max(0, options.paddingPixels ?? 48);
  const timePixels = timeSeconds * options.pixelsPerSecond;
  const visibleStart = currentScrollLeft + paddingPixels;
  const visibleEnd = currentScrollLeft + Math.max(0, options.viewportWidthPixels - paddingPixels);

  if (timePixels < visibleStart) {
    return Math.max(0, Math.round(timePixels - paddingPixels));
  }

  if (timePixels > visibleEnd) {
    return Math.max(0, Math.round(timePixels - options.viewportWidthPixels + paddingPixels));
  }

  return currentScrollLeft;
}

export function timelinePointerDeltaSeconds(options: TimelinePointerDeltaOptions): number {
  if (!Number.isFinite(options.originClientXPixels) || !Number.isFinite(options.currentClientXPixels)) {
    return 0;
  }

  if (!Number.isFinite(options.pixelsPerSecond) || options.pixelsPerSecond <= 0) {
    return 0;
  }

  const originScrollLeft = Number.isFinite(options.originScrollLeftPixels) ? options.originScrollLeftPixels : 0;
  const currentScrollLeft = Number.isFinite(options.currentScrollLeftPixels) ? options.currentScrollLeftPixels ?? originScrollLeft : originScrollLeft;
  const scrollDeltaPixels = currentScrollLeft - originScrollLeft;

  return roundTime((options.currentClientXPixels - options.originClientXPixels + scrollDeltaPixels) / options.pixelsPerSecond);
}

export function timelineTransitionDurationFromDrag(options: TimelineTransitionDurationDragOptions): number {
  const minDuration = Math.max(0.05, Number.isFinite(options.minDurationSeconds) ? options.minDurationSeconds ?? 0.05 : 0.05);
  const maxDuration = Math.max(minDuration, Number.isFinite(options.maxDurationSeconds) ? options.maxDurationSeconds ?? 5 : 5);
  const startDuration = Number.isFinite(options.startDurationSeconds) ? options.startDurationSeconds : minDuration;
  const delta = Number.isFinite(options.deltaSeconds) ? options.deltaSeconds : 0;

  return roundTime(clamp(startDuration + delta, minDuration, maxDuration));
}

export function timelineKeyframeTimeFromDrag(options: TimelineKeyframeTimeDragOptions): number {
  const duration = Math.max(0, Number.isFinite(options.clipDurationSeconds) ? options.clipDurationSeconds : 0);
  const startTime = Number.isFinite(options.startTimeSeconds) ? options.startTimeSeconds : 0;
  const delta = Number.isFinite(options.deltaSeconds) ? options.deltaSeconds : 0;

  return roundTime(clamp(startTime + delta, 0, duration));
}

export function timelineMarkerTimeFromDrag(options: TimelineMarkerTimeDragOptions): number {
  const duration = Math.max(0, Number.isFinite(options.durationSeconds) ? options.durationSeconds : 0);
  const startTime = Number.isFinite(options.startTimeSeconds) ? options.startTimeSeconds : 0;
  const delta = Number.isFinite(options.deltaSeconds) ? options.deltaSeconds : 0;
  let nextTime = clamp(startTime + delta, 0, duration);

  if (Number.isFinite(options.frameRate) && (options.frameRate ?? 0) > 0) {
    nextTime = Math.round(nextTime * options.frameRate!) / options.frameRate!;
  }

  return roundTime(nextTime);
}

export function timelineTrackIdsInVerticalRange(
  lanes: TimelineTrackLaneBounds[],
  startClientYPixels: number,
  endClientYPixels: number,
): string[] {
  if (!Number.isFinite(startClientYPixels) || !Number.isFinite(endClientYPixels)) {
    return [];
  }

  const rangeTop = Math.min(startClientYPixels, endClientYPixels);
  const rangeBottom = Math.max(startClientYPixels, endClientYPixels);
  return lanes.flatMap((lane) => {
    if (!lane.id || !Number.isFinite(lane.topPixels) || !Number.isFinite(lane.bottomPixels)) {
      return [];
    }

    const laneTop = Math.min(lane.topPixels, lane.bottomPixels);
    const laneBottom = Math.max(lane.topPixels, lane.bottomPixels);
    return laneBottom >= rangeTop && laneTop <= rangeBottom ? [lane.id] : [];
  });
}

export function timelineAutoScrollLeftForPointer(options: TimelineEdgeAutoScrollOptions): number {
  const currentScrollLeft = Math.max(0, Number.isFinite(options.currentScrollLeftPixels) ? options.currentScrollLeftPixels : 0);
  const maxScrollLeft = Math.max(0, Number.isFinite(options.maxScrollLeftPixels) ? options.maxScrollLeftPixels : 0);
  if (!Number.isFinite(options.clientXPixels) || !Number.isFinite(options.viewportLeftPixels)) {
    return clamp(currentScrollLeft, 0, maxScrollLeft);
  }

  if (!Number.isFinite(options.viewportWidthPixels) || options.viewportWidthPixels <= 0) {
    return clamp(currentScrollLeft, 0, maxScrollLeft);
  }

  const threshold = clamp(options.edgeThresholdPixels ?? 56, 8, Math.max(8, options.viewportWidthPixels / 2));
  const maxStep = Math.max(1, options.maxStepPixels ?? 28);
  const localX = options.clientXPixels - options.viewportLeftPixels;
  if (localX < threshold) {
    const strength = (threshold - localX) / threshold;
    return clamp(Math.round(currentScrollLeft - (maxStep * strength)), 0, maxScrollLeft);
  }

  if (localX > options.viewportWidthPixels - threshold) {
    const strength = (localX - (options.viewportWidthPixels - threshold)) / threshold;
    return clamp(Math.round(currentScrollLeft + (maxStep * strength)), 0, maxScrollLeft);
  }

  return clamp(currentScrollLeft, 0, maxScrollLeft);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}
