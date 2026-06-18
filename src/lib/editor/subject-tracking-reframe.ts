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

export interface SubjectTrackingPoint {
  time: number;
  focalX: number;
  focalY: number;
}

export interface SubjectTrackingReframeOptions {
  targetAspect?: number;
  zoom?: number;
  smoothing?: number;
  modelHints?: TrackingObservationPoint[];
  minConfidence?: number;
}

export interface SubjectTrackingReframePlan {
  clipId: string;
  effectId: string;
  points: SubjectTrackingPoint[];
  targetAspect: number;
  zoom: number;
  quality: TrackingPathQualityReport;
  modelHintCount?: number;
  rejectedModelHintCount?: number;
  averageModelConfidence?: number;
  modelRefinementStatus?: 'stable' | 'review' | 'rejected';
  warnings: string[];
}

export interface SubjectTrackingReframeResult {
  project: EditorProject;
  updatedClipIds: string[];
  skipped: Array<{ clipId: string; reason: string }>;
  plans: SubjectTrackingReframePlan[];
}

const DEFAULT_TARGET_ASPECT = 9 / 16;
const DEFAULT_ZOOM = 1.16;

export function buildSubjectTrackingReframePlan(
  clip: TimelineClip,
  asset?: EditorAsset,
  options: SubjectTrackingReframeOptions = {},
): SubjectTrackingReframePlan {
  const targetAspect = clampNumber(options.targetAspect ?? DEFAULT_TARGET_ASPECT, 0.1, 10);
  const zoom = clampNumber(options.zoom ?? DEFAULT_ZOOM, 1, 4);
  const smoothing = clampNumber(options.smoothing ?? 0.65, 0, 1);
  const warnings: string[] = [];
  const modelRefinement = options.modelHints?.length
    ? refineTrackingControlPointsFromModelHints(options.modelHints, {
      duration: clip.duration,
      smoothing,
      minConfidence: options.minConfidence,
    })
    : undefined;
  const baseY = resolveBaseFocalY(asset);
  const direction = hashToDirection(`${clip.id}:${clip.name}`);
  const drift = roundNumber(0.08 * (1 - smoothing));
  const motion = readMotionPath(clip);

  if (!asset) {
    warnings.push('No source asset metadata was available; using center-weighted subject estimate.');
  }

  const rawPoints: SubjectTrackingPoint[] = modelRefinement && modelRefinement.controlPoints.length > 0
    ? modelRefinement.controlPoints.map(fromTrackingControlPoint)
    : motion ?? [
    { time: 0, focalX: clampRatio(0.5 - (direction * drift)), focalY: baseY },
    { time: roundNumber(clip.duration / 2), focalX: clampRatio(0.5 + (direction * drift * 0.5)), focalY: clampRatio(baseY - 0.02) },
    { time: roundNumber(clip.duration), focalX: clampRatio(0.5 + (direction * drift)), focalY: clampRatio(baseY) },
  ];
  const points = modelRefinement && modelRefinement.controlPoints.length > 0
    ? rawPoints
    : refineSubjectTrackingPoints(rawPoints, clip.duration, smoothing);
  const quality = modelRefinement && modelRefinement.controlPoints.length > 0
    ? modelRefinement.quality
    : buildTrackingPathQualityReport(points.map(toTrackingControlPoint), clip.duration);

  return {
    clipId: clip.id,
    effectId: findReframeEffect(clip)?.id ?? `effect-smart-reframe-track-${clip.id}`,
    points,
    targetAspect,
    zoom,
    quality,
    modelHintCount: modelRefinement?.acceptedObservationCount,
    rejectedModelHintCount: modelRefinement?.rejectedObservationCount,
    averageModelConfidence: modelRefinement?.averageConfidence,
    modelRefinementStatus: modelRefinement?.status,
    warnings: Array.from(new Set([...warnings, ...(modelRefinement?.warnings ?? quality.warnings)])),
  };
}

export function applySubjectTrackingReframe(
  project: EditorProject,
  clipIds: string[],
  options: SubjectTrackingReframeOptions = {},
): SubjectTrackingReframeResult {
  const requestedIds = clipIds.filter(Boolean);
  if (requestedIds.length === 0) {
    throw new Error('No target clips selected.');
  }

  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const updatedClipIds: string[] = [];
  const skipped: Array<{ clipId: string; reason: string }> = [];
  const plans: SubjectTrackingReframePlan[] = [];

  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (!requestedIds.includes(clip.id)) {
        return clip;
      }

      if (track.locked || clip.locked) {
        throw new Error('Cannot edit an effect on a locked track or clip.');
      }

      if (clip.kind === 'audio') {
        skipped.push({ clipId: clip.id, reason: 'Subject tracking reframe requires a visual clip.' });
        return clip;
      }

      const asset = clip.assetId ? assetById.get(clip.assetId) : undefined;
      if (asset && !isRenderableVisualMediaAsset(asset)) {
        skipped.push({ clipId: clip.id, reason: 'Subject tracking reframe requires video or image media.' });
        return clip;
      }

      const plan = buildSubjectTrackingReframePlan(clip, asset, options);
      plans.push(plan);
      updatedClipIds.push(clip.id);
      return upsertSubjectTrackingReframeEffect(clip, plan);
    }),
  }));

  if (updatedClipIds.length === 0) {
    const reason = skipped[0]?.reason;
    throw new Error(reason ? `No selected clips could receive subject tracking reframe: ${reason}` : 'No selected clips could receive subject tracking reframe.');
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

export function interpolateSubjectTrackingFocal(effect: ClipEffect, clipTime: number): { focalX: number; focalY: number } {
  if (effect.parameters.trackingEnabled !== true) {
    return {
      focalX: readNumber(effect.parameters.focalX, 0.5),
      focalY: readNumber(effect.parameters.focalY, 0.5),
    };
  }

  const points = readTrackingPoints(effect);
  if (points.length === 0) {
    return {
      focalX: readNumber(effect.parameters.focalX, 0.5),
      focalY: readNumber(effect.parameters.focalY, 0.5),
    };
  }

  const time = Math.max(0, clipTime);
  const nextIndex = points.findIndex((point) => point.time >= time);
  if (nextIndex <= 0) {
    return { focalX: points[0].focalX, focalY: points[0].focalY };
  }

  if (nextIndex === -1) {
    const last = points[points.length - 1];
    return { focalX: last.focalX, focalY: last.focalY };
  }

  const previous = points[nextIndex - 1];
  const next = points[nextIndex];
  const ratio = (time - previous.time) / Math.max(0.001, next.time - previous.time);
  return {
    focalX: clampRatio(previous.focalX + (next.focalX - previous.focalX) * ratio),
    focalY: clampRatio(previous.focalY + (next.focalY - previous.focalY) * ratio),
  };
}

function upsertSubjectTrackingReframeEffect(clip: TimelineClip, plan: SubjectTrackingReframePlan): TimelineClip {
  const existing = findReframeEffect(clip);
  const effect: ClipEffect = {
    id: existing?.id ?? plan.effectId,
    type: 'reframe',
    label: 'Smart reframe: tracked subject',
    enabled: true,
    parameters: {
      ...(existing?.parameters ?? {}),
      targetAspect: plan.targetAspect,
      zoom: plan.zoom,
      focalX: plan.points[1]?.focalX ?? plan.points[0]?.focalX ?? 0.5,
      focalY: plan.points[1]?.focalY ?? plan.points[0]?.focalY ?? 0.5,
      trackingEnabled: true,
      trackingPointCount: plan.points.length,
      trackingQualityScore: plan.quality.score,
      trackingMaxJump: plan.quality.maxJump,
      trackingNeedsReview: plan.quality.status === 'needs-review' || plan.modelRefinementStatus === 'review' || plan.modelRefinementStatus === 'rejected',
      focalXStart: plan.points[0]?.focalX ?? 0.5,
      focalYStart: plan.points[0]?.focalY ?? 0.5,
      focalXMid: plan.points[1]?.focalX ?? plan.points[0]?.focalX ?? 0.5,
      focalYMid: plan.points[1]?.focalY ?? plan.points[0]?.focalY ?? 0.5,
      focalXEnd: plan.points[2]?.focalX ?? plan.points[plan.points.length - 1]?.focalX ?? 0.5,
      focalYEnd: plan.points[2]?.focalY ?? plan.points[plan.points.length - 1]?.focalY ?? 0.5,
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

function readMotionPath(clip: TimelineClip): SubjectTrackingPoint[] | undefined {
  const positionX = clip.keyframes.filter((keyframe) => keyframe.property === 'positionX');
  const positionY = clip.keyframes.filter((keyframe) => keyframe.property === 'positionY');
  if (positionX.length === 0 && positionY.length === 0) {
    return undefined;
  }

  const sampleTimes = [0, roundNumber(clip.duration / 2), roundNumber(clip.duration)];
  return sampleTimes.map((time) => ({
    time,
    focalX: clampRatio(0.5 - (sampleKeyframes(positionX, time, 0) / 400)),
    focalY: clampRatio(0.42 - (sampleKeyframes(positionY, time, 0) / 400)),
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

function readTrackingPoints(effect: ClipEffect): SubjectTrackingPoint[] {
  const start = {
    time: 0,
    focalX: readNumber(effect.parameters.focalXStart, readNumber(effect.parameters.focalX, 0.5)),
    focalY: readNumber(effect.parameters.focalYStart, readNumber(effect.parameters.focalY, 0.5)),
  };
  const mid = {
    time: readNumber(effect.parameters.trackingMidTime, 0),
    focalX: readNumber(effect.parameters.focalXMid, start.focalX),
    focalY: readNumber(effect.parameters.focalYMid, start.focalY),
  };
  const end = {
    time: readNumber(effect.parameters.trackingDuration, mid.time),
    focalX: readNumber(effect.parameters.focalXEnd, mid.focalX),
    focalY: readNumber(effect.parameters.focalYEnd, mid.focalY),
  };

  return normalizeTrackingPoints([start, mid, end], end.time);
}

function normalizeTrackingPoints(points: SubjectTrackingPoint[], duration: number): SubjectTrackingPoint[] {
  return normalizeTrackingControlPoints(points.map(toTrackingControlPoint), duration).map(fromTrackingControlPoint);
}

function refineSubjectTrackingPoints(
  points: SubjectTrackingPoint[],
  duration: number,
  smoothing: number,
): SubjectTrackingPoint[] {
  return smoothTrackingControlPoints(
    normalizeTrackingControlPoints(points.map(toTrackingControlPoint), duration),
    smoothing * 0.35,
  ).map(fromTrackingControlPoint);
}

function toTrackingControlPoint(point: SubjectTrackingPoint, index = 0) {
  return {
    id: index === 0 ? 'start' as const : index === 1 ? 'mid' as const : 'end' as const,
    time: point.time,
    x: point.focalX,
    y: point.focalY,
  };
}

function fromTrackingControlPoint(point: { time: number; x: number; y: number }): SubjectTrackingPoint {
  return {
    time: point.time,
    focalX: point.x,
    focalY: point.y,
  };
}

function findReframeEffect(clip: TimelineClip): ClipEffect | undefined {
  return clip.effects.find((effect) => effect.type === 'reframe');
}

function resolveBaseFocalY(asset?: EditorAsset): number {
  if (!asset?.width || !asset.height) {
    return 0.42;
  }

  return asset.height > asset.width ? 0.45 : 0.4;
}

function hashToDirection(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }

  return hash % 2 === 0 ? 1 : -1;
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
