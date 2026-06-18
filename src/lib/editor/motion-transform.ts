import type { ClipEffect, ClipKeyframe, TimelineClip } from './types';

export interface ClipMotionTransform {
  positionX: number;
  positionY: number;
  scale: number;
  rotation: number;
}

export interface MotionCenterSnapGuides {
  centerX: boolean;
  centerY: boolean;
}

export interface MotionDragResolution {
  patch: Pick<ClipMotionTransform, 'positionX' | 'positionY'>;
  guides: MotionCenterSnapGuides | null;
}

export const DEFAULT_MOTION_TRANSFORM: ClipMotionTransform = {
  positionX: 0,
  positionY: 0,
  scale: 1,
  rotation: 0,
};

export const MOTION_TRANSFORM_EFFECT_LABEL = 'Motion';

export function isMotionTransformEffect(effect: ClipEffect): boolean {
  return effect.type === 'motion' && (
    effect.parameters.positionX !== undefined ||
    effect.parameters.positionY !== undefined ||
    effect.parameters.scale !== undefined ||
    effect.parameters.rotation !== undefined
  );
}

export function findMotionTransformEffect(clip: TimelineClip): ClipEffect | undefined {
  return clip.effects.find(isMotionTransformEffect);
}

export function findEnabledMotionTransformEffect(clip: TimelineClip): ClipEffect | undefined {
  return clip.effects.find((effect) => effect.enabled && isMotionTransformEffect(effect));
}

export function readClipMotionTransform(clip: TimelineClip): ClipMotionTransform {
  const effect = findEnabledMotionTransformEffect(clip);
  if (!effect) {
    return DEFAULT_MOTION_TRANSFORM;
  }

  return {
    positionX: readMotionNumber(effect, 'positionX', DEFAULT_MOTION_TRANSFORM.positionX, -200, 200),
    positionY: readMotionNumber(effect, 'positionY', DEFAULT_MOTION_TRANSFORM.positionY, -200, 200),
    scale: readMotionNumber(effect, 'scale', DEFAULT_MOTION_TRANSFORM.scale, 0.05, 8),
    rotation: readMotionNumber(effect, 'rotation', DEFAULT_MOTION_TRANSFORM.rotation, -360, 360),
  };
}

export function readMotionTransformFallback(clip: TimelineClip, property: ClipKeyframe['property']): number {
  const transform = readClipMotionTransform(clip);

  switch (property) {
    case 'positionX':
      return transform.positionX;
    case 'positionY':
      return transform.positionY;
    case 'scale':
      return transform.scale;
    case 'rotation':
      return transform.rotation;
    default:
      return 0;
  }
}

export function normalizeMotionTransformPatch(patch: Partial<ClipMotionTransform>): Partial<ClipMotionTransform> {
  const normalized: Partial<ClipMotionTransform> = {};

  if (patch.positionX !== undefined) {
    normalized.positionX = clampMotionNumber(patch.positionX, -200, 200);
  }

  if (patch.positionY !== undefined) {
    normalized.positionY = clampMotionNumber(patch.positionY, -200, 200);
  }

  if (patch.scale !== undefined) {
    normalized.scale = clampMotionNumber(patch.scale, 0.05, 8);
  }

  if (patch.rotation !== undefined) {
    normalized.rotation = clampMotionNumber(patch.rotation, -360, 360);
  }

  return normalized;
}

export function resolveMotionDragPatch({
  startX,
  startY,
  deltaX,
  deltaY,
  previewScale,
  snapPixels = 8,
}: {
  startX: number;
  startY: number;
  deltaX: number;
  deltaY: number;
  previewScale: number;
  snapPixels?: number;
}): MotionDragResolution {
  const safeScale = previewScale > 0.001 ? previewScale : 1;
  const snapThreshold = Math.max(0, snapPixels) / safeScale;
  const candidateX = startX + deltaX;
  const candidateY = startY + deltaY;
  const centerX = Math.abs(candidateX) <= snapThreshold;
  const centerY = Math.abs(candidateY) <= snapThreshold;

  return {
    patch: {
      positionX: clampMotionNumber(centerX ? 0 : candidateX, -200, 200),
      positionY: clampMotionNumber(centerY ? 0 : candidateY, -200, 200),
    },
    guides: centerX || centerY ? { centerX, centerY } : null,
  };
}

export function buildDefaultMotionTransformParameters(): ClipMotionTransform {
  return { ...DEFAULT_MOTION_TRANSFORM };
}

function readMotionNumber(effect: ClipEffect, key: keyof ClipMotionTransform, fallback: number, min: number, max: number): number {
  const value = effect.parameters[key];
  return clampMotionNumber(typeof value === 'number' && Number.isFinite(value) ? value : fallback, min, max);
}

function clampMotionNumber(value: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, Number.isFinite(value) ? value : min)) * 1000) / 1000;
}
