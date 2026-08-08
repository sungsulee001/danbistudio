import { resolveMotionDragPatch } from '../../lib/editor/motion-transform';
import type { ProgramMonitorGuides, ProgramMotionPatch } from './editor-view-model';

export type ProgramMonitorScaleHandle = 'nw' | 'ne' | 'sw' | 'se';

export const PROGRAM_MONITOR_INTERACTION_DRAG_THRESHOLD_PX = 3;

export interface ProgramMonitorMoveInteractionSession {
  kind: 'move';
  originClientX: number;
  originClientY: number;
  startX: number;
  startY: number;
  previewScale: number;
  moved: boolean;
}

export interface ProgramMonitorScaleInteractionSession {
  kind: 'scale';
  originClientX: number;
  originClientY: number;
  startScale: number;
  handle: ProgramMonitorScaleHandle;
  diagonalPixels: number;
  moved: boolean;
}

export interface ProgramMonitorRotationInteractionSession {
  kind: 'rotation';
  centerX: number;
  centerY: number;
  startAngle: number;
  startRotation: number;
  moved: boolean;
}

export interface ProgramMonitorMoveInteractionMove {
  session: ProgramMonitorMoveInteractionSession;
  patch: ProgramMotionPatch;
  guides: ProgramMonitorGuides | null;
}

export interface ProgramMonitorScaleInteractionMove {
  session: ProgramMonitorScaleInteractionSession;
  patch: ProgramMotionPatch;
}

export interface ProgramMonitorRotationInteractionMove {
  session: ProgramMonitorRotationInteractionSession;
  patch: ProgramMotionPatch;
}

export interface ProgramMonitorWheelZoomPlan {
  nextZoomPercent: number;
  nextPan: { x: number; y: number };
  shouldZoom: boolean;
}

export function beginProgramMonitorMoveInteraction({
  clientX,
  clientY,
  startX,
  startY,
  previewScale,
}: {
  clientX: number;
  clientY: number;
  startX: number;
  startY: number;
  previewScale: number;
}): ProgramMonitorMoveInteractionSession {
  return {
    kind: 'move',
    originClientX: clientX,
    originClientY: clientY,
    startX,
    startY,
    previewScale,
    moved: false,
  };
}

export function resolveProgramMonitorMoveInteractionMove({
  session,
  clientX,
  clientY,
}: {
  session: ProgramMonitorMoveInteractionSession;
  clientX: number;
  clientY: number;
}): ProgramMonitorMoveInteractionMove {
  const safeScale = resolveSafePreviewScale(session.previewScale);
  const rawDeltaX = clientX - session.originClientX;
  const rawDeltaY = clientY - session.originClientY;
  const moved = session.moved || Math.hypot(rawDeltaX, rawDeltaY) >= PROGRAM_MONITOR_INTERACTION_DRAG_THRESHOLD_PX;

  if (!moved) {
    return {
      session: {
        ...session,
        moved,
      },
      patch: {
        positionX: session.startX,
        positionY: session.startY,
      },
      guides: null,
    };
  }

  const resolution = resolveMotionDragPatch({
    startX: session.startX,
    startY: session.startY,
    deltaX: rawDeltaX / safeScale,
    deltaY: rawDeltaY / safeScale,
    previewScale: safeScale,
  });

  return {
    session: {
      ...session,
      moved,
    },
    patch: resolution.patch,
    guides: resolution.guides,
  };
}

export function beginProgramMonitorScaleInteraction({
  clientX,
  clientY,
  startScale,
  handle,
  boxWidth,
  boxHeight,
}: {
  clientX: number;
  clientY: number;
  startScale: number;
  handle: ProgramMonitorScaleHandle;
  boxWidth: number;
  boxHeight: number;
}): ProgramMonitorScaleInteractionSession {
  return {
    kind: 'scale',
    originClientX: clientX,
    originClientY: clientY,
    startScale,
    handle,
    diagonalPixels: Math.max(96, Math.sqrt((boxWidth * boxWidth) + (boxHeight * boxHeight))),
    moved: false,
  };
}

export function resolveProgramMonitorScaleInteractionMove({
  session,
  clientX,
  clientY,
}: {
  session: ProgramMonitorScaleInteractionSession;
  clientX: number;
  clientY: number;
}): ProgramMonitorScaleInteractionMove {
  const signX = session.handle.includes('e') ? 1 : -1;
  const signY = session.handle.includes('s') ? 1 : -1;
  const projectedPixels = ((clientX - session.originClientX) * signX) + ((clientY - session.originClientY) * signY);
  const scaleDelta = (projectedPixels / Math.max(1, session.diagonalPixels)) * session.startScale;
  const nextScale = clampProgramMonitorValue(roundProgramMonitorValue(session.startScale + scaleDelta), 0.05, 8);
  const moved = session.moved || Math.abs(nextScale - session.startScale) > 0.005;

  return {
    session: {
      ...session,
      moved,
    },
    patch: {
      scale: nextScale,
    },
  };
}

export function beginProgramMonitorRotationInteraction({
  clientX,
  clientY,
  centerX,
  centerY,
  startRotation,
}: {
  clientX: number;
  clientY: number;
  centerX: number;
  centerY: number;
  startRotation: number;
}): ProgramMonitorRotationInteractionSession {
  return {
    kind: 'rotation',
    centerX,
    centerY,
    startAngle: resolvePointerAngleDegrees(clientX, clientY, centerX, centerY),
    startRotation,
    moved: false,
  };
}

export function resolveProgramMonitorRotationInteractionMove({
  session,
  clientX,
  clientY,
}: {
  session: ProgramMonitorRotationInteractionSession;
  clientX: number;
  clientY: number;
}): ProgramMonitorRotationInteractionMove {
  const currentAngle = resolvePointerAngleDegrees(clientX, clientY, session.centerX, session.centerY);
  const delta = currentAngle - session.startAngle;
  const nextRotation = clampProgramMonitorValue(roundProgramMonitorValue(session.startRotation + delta), -360, 360);
  const moved = session.moved || Math.abs(nextRotation - session.startRotation) > 0.5;

  return {
    session: {
      ...session,
      moved,
    },
    patch: {
      rotation: nextRotation,
    },
  };
}

export function resolveProgramMonitorWheelZoomInteraction({
  clientX,
  clientY,
  viewportLeft,
  viewportTop,
  viewportWidth,
  viewportHeight,
  stageWidth,
  stageHeight,
  pan,
  currentZoomPercent,
  deltaY,
  deltaMode,
  minZoomPercent = 50,
  maxZoomPercent = 200,
}: {
  clientX: number;
  clientY: number;
  viewportLeft: number;
  viewportTop: number;
  viewportWidth: number;
  viewportHeight: number;
  stageWidth: number;
  stageHeight: number;
  pan: { x: number; y: number };
  currentZoomPercent: number;
  deltaY: number;
  deltaMode: number;
  minZoomPercent?: number;
  maxZoomPercent?: number;
}): ProgramMonitorWheelZoomPlan {
  const safeZoomPercent = clampProgramMonitorValue(currentZoomPercent, minZoomPercent, maxZoomPercent);
  const normalizedDelta = deltaMode === 1 ? deltaY * 16 : deltaY;
  const cappedDelta = Math.sign(normalizedDelta) * Math.min(Math.abs(normalizedDelta), 30);
  const zoomFactor = Math.exp(-cappedDelta / 300);
  const nextZoomPercent = roundProgramMonitorZoomPercent(
    clampProgramMonitorValue(safeZoomPercent * zoomFactor, minZoomPercent, maxZoomPercent),
  );

  if (nextZoomPercent === safeZoomPercent) {
    return {
      nextZoomPercent: safeZoomPercent,
      nextPan: pan,
      shouldZoom: false,
    };
  }

  const localX = clampProgramMonitorValue(clientX - viewportLeft, 0, Math.max(0, viewportWidth));
  const localY = clampProgramMonitorValue(clientY - viewportTop, 0, Math.max(0, viewportHeight));
  const stageLeft = (viewportWidth / 2) - (stageWidth / 2) + pan.x;
  const stageTop = (viewportHeight / 2) - (stageHeight / 2) + pan.y;
  const anchorX = stageWidth > 0 ? clampProgramMonitorValue((localX - stageLeft) / stageWidth, 0, 1) : 0.5;
  const anchorY = stageHeight > 0 ? clampProgramMonitorValue((localY - stageTop) / stageHeight, 0, 1) : 0.5;
  const scaleRatio = nextZoomPercent / safeZoomPercent;
  const nextStageWidth = stageWidth * scaleRatio;
  const nextStageHeight = stageHeight * scaleRatio;
  const nextPan = clampProgramMonitorPan({
    pan: {
      x: localX - (viewportWidth / 2) + (nextStageWidth / 2) - (anchorX * nextStageWidth),
      y: localY - (viewportHeight / 2) + (nextStageHeight / 2) - (anchorY * nextStageHeight),
    },
    stageWidth: nextStageWidth,
    stageHeight: nextStageHeight,
    viewportWidth,
    viewportHeight,
  });

  return {
    nextZoomPercent,
    nextPan,
    shouldZoom: true,
  };
}

export function clampProgramMonitorViewportPan({
  pan,
  stageWidth,
  stageHeight,
  viewportWidth,
  viewportHeight,
}: {
  pan: { x: number; y: number };
  stageWidth: number;
  stageHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}): { x: number; y: number } {
  return clampProgramMonitorPan({
    pan,
    stageWidth,
    stageHeight,
    viewportWidth,
    viewportHeight,
  });
}

function resolveSafePreviewScale(previewScale: number): number {
  return previewScale > 0.001 ? previewScale : 1;
}

function resolvePointerAngleDegrees(clientX: number, clientY: number, centerX: number, centerY: number): number {
  return Math.atan2(clientY - centerY, clientX - centerX) * 180 / Math.PI;
}

function roundProgramMonitorValue(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roundProgramMonitorZoomPercent(value: number): number {
  return Math.round(value / 10) * 10;
}

function clampProgramMonitorValue(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function clampProgramMonitorPan({
  pan,
  stageWidth,
  stageHeight,
  viewportWidth,
  viewportHeight,
}: {
  pan: { x: number; y: number };
  stageWidth: number;
  stageHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}): { x: number; y: number } {
  const maxX = Math.max(0, (stageWidth - viewportWidth) / 2);
  const maxY = Math.max(0, (stageHeight - viewportHeight) / 2);

  return {
    x: clampProgramMonitorValue(pan.x, -maxX, maxX),
    y: clampProgramMonitorValue(pan.y, -maxY, maxY),
  };
}
