import type { ClipEffect, EditorAsset, EditorProject, TimelineClip } from './types';
import { isRenderableVisualMediaAsset } from './renderable-media-kind';
import {
  buildTrackingPathQualityReport,
  normalizeTrackingControlPoints,
  refineTrackingControlPointsFromModelHints,
  smoothTrackingControlPoints,
  type TrackingObservationPoint,
  type TrackingPathQualityReport,
} from './tracking-path';

export type ObjectMaskShape = 'ellipse' | 'rectangle';

export interface ObjectMaskPoint {
  time: number;
  centerX: number;
  centerY: number;
}

export interface ObjectMaskParameters {
  shape: ObjectMaskShape;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  feather: number;
  invert: boolean;
  trackingEnabled: boolean;
}

export interface TrackedObjectMaskOptions {
  shape?: ObjectMaskShape;
  width?: number;
  height?: number;
  feather?: number;
  invert?: boolean;
  smoothing?: number;
  modelHints?: TrackingObservationPoint[];
  minConfidence?: number;
}

export interface TrackedObjectMaskPlan {
  clipId: string;
  effectId: string;
  shape: ObjectMaskShape;
  width: number;
  height: number;
  feather: number;
  invert: boolean;
  points: ObjectMaskPoint[];
  quality: TrackingPathQualityReport;
  modelHintCount?: number;
  rejectedModelHintCount?: number;
  averageModelConfidence?: number;
  modelRefinementStatus?: 'stable' | 'review' | 'rejected';
  warnings: string[];
}

export interface TrackedObjectMaskResult {
  project: EditorProject;
  updatedClipIds: string[];
  skipped: Array<{ clipId: string; reason: string }>;
  plans: TrackedObjectMaskPlan[];
}

export const OBJECT_MASK_EFFECT_LABEL = 'Object mask: tracked';

const DEFAULT_OBJECT_MASK_WIDTH = 0.36;
const DEFAULT_OBJECT_MASK_HEIGHT = 0.52;
const DEFAULT_OBJECT_MASK_FEATHER = 0.05;

export function isObjectMaskEffect(effect: ClipEffect): boolean {
  return effect.type === 'mask' && (
    effect.parameters.maskMode === 'object' ||
    effect.parameters.centerX !== undefined ||
    effect.parameters.centerY !== undefined ||
    effect.parameters.width !== undefined ||
    effect.parameters.height !== undefined
  );
}

export function hasSupportedObjectMaskEffect(effect: ClipEffect): boolean {
  return isObjectMaskEffect(effect);
}

export function findObjectMaskEffect(clip: TimelineClip): ClipEffect | undefined {
  return clip.effects.find(isObjectMaskEffect);
}

export function buildTrackedObjectMaskPlan(
  clip: TimelineClip,
  asset?: EditorAsset,
  options: TrackedObjectMaskOptions = {},
): TrackedObjectMaskPlan {
  const shape = options.shape === 'rectangle' ? 'rectangle' : 'ellipse';
  const feather = roundNumber(clampNumber(options.feather ?? DEFAULT_OBJECT_MASK_FEATHER, 0, 0.4));
  const invert = options.invert === true;
  const smoothing = clampNumber(options.smoothing ?? 0.6, 0, 1);
  const warnings: string[] = [];
  const modelRefinement = options.modelHints?.length
    ? refineTrackingControlPointsFromModelHints(options.modelHints, {
      duration: clip.duration,
      smoothing,
      minConfidence: options.minConfidence,
    })
    : undefined;
  const width = roundNumber(clampNumber(options.width ?? modelRefinement?.averageWidth ?? DEFAULT_OBJECT_MASK_WIDTH, 0.05, 1));
  const height = roundNumber(clampNumber(options.height ?? modelRefinement?.averageHeight ?? DEFAULT_OBJECT_MASK_HEIGHT, 0.05, 1));
  const motion = readMotionPath(clip);

  if (!asset) {
    warnings.push('No source asset metadata was available; using center-weighted object estimate.');
  }

  const baseY = resolveBaseCenterY(asset);
  const direction = hashToDirection(`${clip.id}:${clip.name}:mask`);
  const drift = roundNumber(0.07 * (1 - smoothing));
  const rawPoints = modelRefinement && modelRefinement.controlPoints.length > 0
    ? modelRefinement.controlPoints.map(fromTrackingControlPoint)
    : motion ?? [
    { time: 0, centerX: clampRatio(0.5 - (direction * drift)), centerY: baseY },
    { time: roundNumber(clip.duration / 2), centerX: clampRatio(0.5 + (direction * drift * 0.4)), centerY: clampRatio(baseY - 0.015) },
    { time: roundNumber(clip.duration), centerX: clampRatio(0.5 + (direction * drift)), centerY: clampRatio(baseY) },
  ];
  const points = modelRefinement && modelRefinement.controlPoints.length > 0
    ? rawPoints
    : refineObjectMaskPoints(rawPoints, clip.duration, smoothing);
  const quality = modelRefinement && modelRefinement.controlPoints.length > 0
    ? modelRefinement.quality
    : buildTrackingPathQualityReport(points.map(toTrackingControlPoint), clip.duration);

  return {
    clipId: clip.id,
    effectId: findObjectMaskEffect(clip)?.id ?? `effect-object-mask-track-${clip.id}`,
    shape,
    width,
    height,
    feather,
    invert,
    points,
    quality,
    modelHintCount: modelRefinement?.acceptedObservationCount,
    rejectedModelHintCount: modelRefinement?.rejectedObservationCount,
    averageModelConfidence: modelRefinement?.averageConfidence,
    modelRefinementStatus: modelRefinement?.status,
    warnings: Array.from(new Set([...warnings, ...(modelRefinement?.warnings ?? quality.warnings)])),
  };
}

export function applyTrackedObjectMask(
  project: EditorProject,
  clipIds: string[],
  options: TrackedObjectMaskOptions = {},
): TrackedObjectMaskResult {
  const requestedIds = Array.from(new Set(clipIds.filter(Boolean)));
  if (requestedIds.length === 0) {
    throw new Error('No target clips selected.');
  }

  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const updatedClipIds: string[] = [];
  const skipped: Array<{ clipId: string; reason: string }> = [];
  const plans: TrackedObjectMaskPlan[] = [];

  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (!requestedIds.includes(clip.id)) {
        return clip;
      }

      if (track.locked || clip.locked) {
        throw new Error('Cannot edit an effect on a locked track or clip.');
      }

      if (clip.kind === 'audio' || clip.kind === 'text') {
        skipped.push({ clipId: clip.id, reason: 'Object masks require a video or image clip.' });
        return clip;
      }

      const asset = clip.assetId ? assetById.get(clip.assetId) : undefined;
      if (asset && !isRenderableVisualMediaAsset(asset)) {
        skipped.push({ clipId: clip.id, reason: 'Object masks require video or image media.' });
        return clip;
      }

      const plan = buildTrackedObjectMaskPlan(clip, asset, options);
      plans.push(plan);
      updatedClipIds.push(clip.id);
      return upsertTrackedObjectMaskEffect(clip, plan);
    }),
  }));

  if (updatedClipIds.length === 0) {
    const reason = skipped[0]?.reason;
    throw new Error(reason ? `No selected clips could receive object mask: ${reason}` : 'No selected clips could receive object mask.');
  }

  return {
    project: {
      ...project,
      tracks,
      updatedAt: new Date().toISOString(),
    },
    updatedClipIds,
    skipped,
    plans,
  };
}

export function readObjectMaskParameters(effect?: ClipEffect): ObjectMaskParameters {
  return {
    shape: readShape(effect?.parameters.shape),
    centerX: clampRatio(readNumber(effect?.parameters.centerX, 0.5)),
    centerY: clampRatio(readNumber(effect?.parameters.centerY, 0.45)),
    width: clampNumber(readNumber(effect?.parameters.width, DEFAULT_OBJECT_MASK_WIDTH), 0.05, 1),
    height: clampNumber(readNumber(effect?.parameters.height, DEFAULT_OBJECT_MASK_HEIGHT), 0.05, 1),
    feather: clampNumber(readNumber(effect?.parameters.feather, DEFAULT_OBJECT_MASK_FEATHER), 0, 0.4),
    invert: effect?.parameters.invert === true,
    trackingEnabled: effect?.parameters.trackingEnabled === true,
  };
}

export function interpolateObjectMask(effect: ClipEffect, clipTime: number): ObjectMaskParameters {
  const parameters = readObjectMaskParameters(effect);
  if (!parameters.trackingEnabled) {
    return parameters;
  }

  const points = readObjectMaskPoints(effect);
  if (points.length === 0) {
    return parameters;
  }

  const time = Math.max(0, clipTime);
  const nextIndex = points.findIndex((point) => point.time >= time);
  if (nextIndex <= 0) {
    return {
      ...parameters,
      centerX: points[0].centerX,
      centerY: points[0].centerY,
    };
  }

  if (nextIndex === -1) {
    const last = points[points.length - 1];
    return {
      ...parameters,
      centerX: last.centerX,
      centerY: last.centerY,
    };
  }

  const previous = points[nextIndex - 1];
  const next = points[nextIndex];
  const ratio = (time - previous.time) / Math.max(0.001, next.time - previous.time);
  return {
    ...parameters,
    centerX: clampRatio(previous.centerX + (next.centerX - previous.centerX) * ratio),
    centerY: clampRatio(previous.centerY + (next.centerY - previous.centerY) * ratio),
  };
}

function upsertTrackedObjectMaskEffect(clip: TimelineClip, plan: TrackedObjectMaskPlan): TimelineClip {
  const existing = findObjectMaskEffect(clip);
  const effect: ClipEffect = {
    id: existing?.id ?? plan.effectId,
    type: 'mask',
    label: OBJECT_MASK_EFFECT_LABEL,
    enabled: true,
    parameters: {
      ...(existing?.parameters ?? {}),
      maskMode: 'object',
      shape: plan.shape,
      centerX: plan.points[1]?.centerX ?? plan.points[0]?.centerX ?? 0.5,
      centerY: plan.points[1]?.centerY ?? plan.points[0]?.centerY ?? 0.45,
      width: plan.width,
      height: plan.height,
      feather: plan.feather,
      invert: plan.invert,
      trackingEnabled: true,
      trackingPointCount: plan.points.length,
      trackingQualityScore: plan.quality.score,
      trackingMaxJump: plan.quality.maxJump,
      trackingNeedsReview: plan.quality.status === 'needs-review' || plan.modelRefinementStatus === 'review' || plan.modelRefinementStatus === 'rejected',
      centerXStart: plan.points[0]?.centerX ?? 0.5,
      centerYStart: plan.points[0]?.centerY ?? 0.45,
      centerXMid: plan.points[1]?.centerX ?? plan.points[0]?.centerX ?? 0.5,
      centerYMid: plan.points[1]?.centerY ?? plan.points[0]?.centerY ?? 0.45,
      centerXEnd: plan.points[2]?.centerX ?? plan.points[plan.points.length - 1]?.centerX ?? 0.5,
      centerYEnd: plan.points[2]?.centerY ?? plan.points[plan.points.length - 1]?.centerY ?? 0.45,
      trackingMidTime: plan.points[1]?.time ?? 0,
      trackingDuration: plan.points[2]?.time ?? plan.points[plan.points.length - 1]?.time ?? 0,
      ...(plan.modelHintCount !== undefined ? { trackingModelHintCount: plan.modelHintCount } : {}),
      ...(plan.rejectedModelHintCount !== undefined ? { trackingRejectedHintCount: plan.rejectedModelHintCount } : {}),
      ...(plan.averageModelConfidence !== undefined ? { trackingAverageConfidence: plan.averageModelConfidence } : {}),
      ...(plan.modelRefinementStatus !== undefined ? { trackingModelRefinementStatus: plan.modelRefinementStatus } : {}),
      ...(plan.modelHintCount !== undefined ? { trackingModelWarningCount: plan.warnings.length } : {}),
    },
  };

  return {
    ...clip,
    effects: existing
      ? clip.effects.map((item) => (item.id === existing.id ? effect : item))
      : [...clip.effects, effect],
  };
}

function readMotionPath(clip: TimelineClip): ObjectMaskPoint[] | undefined {
  const positionX = clip.keyframes.filter((keyframe) => keyframe.property === 'positionX');
  const positionY = clip.keyframes.filter((keyframe) => keyframe.property === 'positionY');
  if (positionX.length === 0 && positionY.length === 0) {
    return undefined;
  }

  const sampleTimes = [0, roundNumber(clip.duration / 2), roundNumber(clip.duration)];
  return sampleTimes.map((time) => ({
    time,
    centerX: clampRatio(0.5 - (sampleKeyframes(positionX, time, 0) / 500)),
    centerY: clampRatio(0.45 - (sampleKeyframes(positionY, time, 0) / 500)),
  }));
}

function sampleKeyframes(keyframes: TimelineClip['keyframes'], time: number, fallback: number): number {
  if (keyframes.length === 0) {
    return fallback;
  }

  const sorted = keyframes.slice().sort((a, b) => a.time - b.time);
  const nextIndex = sorted.findIndex((keyframe) => keyframe.time >= time);
  if (nextIndex <= 0) {
    return keyframeNumber(sorted[0].value, fallback);
  }

  if (nextIndex === -1) {
    return keyframeNumber(sorted[sorted.length - 1].value, fallback);
  }

  const previous = sorted[nextIndex - 1];
  const next = sorted[nextIndex];
  const ratio = (time - previous.time) / Math.max(0.001, next.time - previous.time);
  const previousValue = keyframeNumber(previous.value, fallback);
  const nextValue = keyframeNumber(next.value, previousValue);
  return previousValue + (nextValue - previousValue) * ratio;
}

function keyframeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readObjectMaskPoints(effect: ClipEffect): ObjectMaskPoint[] {
  const start = {
    time: 0,
    centerX: readNumber(effect.parameters.centerXStart, readNumber(effect.parameters.centerX, 0.5)),
    centerY: readNumber(effect.parameters.centerYStart, readNumber(effect.parameters.centerY, 0.45)),
  };
  const mid = {
    time: readNumber(effect.parameters.trackingMidTime, 0),
    centerX: readNumber(effect.parameters.centerXMid, start.centerX),
    centerY: readNumber(effect.parameters.centerYMid, start.centerY),
  };
  const end = {
    time: readNumber(effect.parameters.trackingDuration, mid.time),
    centerX: readNumber(effect.parameters.centerXEnd, mid.centerX),
    centerY: readNumber(effect.parameters.centerYEnd, mid.centerY),
  };

  return normalizeObjectMaskPoints([start, mid, end], end.time);
}

function normalizeObjectMaskPoints(points: ObjectMaskPoint[], duration: number): ObjectMaskPoint[] {
  return normalizeTrackingControlPoints(points.map(toTrackingControlPoint), duration).map(fromTrackingControlPoint);
}

function refineObjectMaskPoints(
  points: ObjectMaskPoint[],
  duration: number,
  smoothing: number,
): ObjectMaskPoint[] {
  return smoothTrackingControlPoints(
    normalizeTrackingControlPoints(points.map(toTrackingControlPoint), duration),
    smoothing * 0.35,
  ).map(fromTrackingControlPoint);
}

function toTrackingControlPoint(point: ObjectMaskPoint, index = 0) {
  return {
    id: index === 0 ? 'start' as const : index === 1 ? 'mid' as const : 'end' as const,
    time: point.time,
    x: point.centerX,
    y: point.centerY,
  };
}

function fromTrackingControlPoint(point: { time: number; x: number; y: number }): ObjectMaskPoint {
  return {
    time: point.time,
    centerX: point.x,
    centerY: point.y,
  };
}

function resolveBaseCenterY(asset?: EditorAsset): number {
  if (!asset?.width || !asset.height) {
    return 0.45;
  }

  return asset.height > asset.width ? 0.48 : 0.43;
}

function hashToDirection(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }

  return hash % 2 === 0 ? 1 : -1;
}

function readShape(value: unknown): ObjectMaskShape {
  return value === 'rectangle' ? 'rectangle' : 'ellipse';
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampRatio(value: number): number {
  return clampNumber(value, 0, 1);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundNumber(value: number): number {
  return Math.round(value * 1000) / 1000;
}
