import type { ClipEffect } from './types';

export type TrackingPointId = 'start' | 'mid' | 'end';

export interface TrackingControlPoint {
  id: TrackingPointId;
  time: number;
  x: number;
  y: number;
}

export interface TrackingPathQualityReport {
  pointCount: number;
  duration: number;
  maxJump: number;
  maxSegmentSpeed: number;
  edgePointCount: number;
  score: number;
  status: 'stable' | 'needs-review';
  warnings: string[];
}

export interface TrackingObservationPoint {
  time: number;
  x: number;
  y: number;
  confidence?: number;
  width?: number;
  height?: number;
}

export interface TrackingModelHintRefinementOptions {
  duration: number;
  smoothing?: number;
  minConfidence?: number;
}

export interface TrackingModelHintRefinementResult {
  controlPoints: TrackingControlPoint[];
  quality: TrackingPathQualityReport;
  acceptedObservationCount: number;
  rejectedObservationCount: number;
  averageConfidence: number;
  averageWidth?: number;
  averageHeight?: number;
  status: 'stable' | 'review' | 'rejected';
  warnings: string[];
}

export function buildTrackingQualityParameterPatch(
  effect: ClipEffect,
  duration: number,
): ClipEffect['parameters'] {
  if (effect.parameters.trackingEnabled !== true) {
    return {};
  }

  const points = readTrackingEffectControlPoints(effect);
  if (!points) {
    return {};
  }

  const quality = buildTrackingPathQualityReport(points, duration);
  return {
    trackingPointCount: points.length,
    trackingQualityScore: quality.score,
    trackingMaxJump: quality.maxJump,
    trackingNeedsReview: quality.status === 'needs-review',
  };
}

export function refineTrackingControlPointsFromModelHints(
  observations: TrackingObservationPoint[],
  options: TrackingModelHintRefinementOptions,
): TrackingModelHintRefinementResult {
  const safeDuration = Math.max(0, Number.isFinite(options.duration) ? options.duration : 0);
  const minConfidence = clampNumber(options.minConfidence ?? 0.35, 0, 1);
  const smoothing = clampNumber(options.smoothing ?? 0.35, 0, 1);
  const warnings: string[] = [];
  const accepted: Array<TrackingObservationPoint & { confidence: number }> = [];
  let rejectedObservationCount = 0;

  observations.forEach((observation) => {
    const hasFinitePosition = Number.isFinite(observation.time) && Number.isFinite(observation.x) && Number.isFinite(observation.y);
    const confidence = Number.isFinite(observation.confidence) ? clampNumber(observation.confidence ?? 1, 0, 1) : 1;
    if (!hasFinitePosition || confidence < minConfidence) {
      rejectedObservationCount += 1;
      return;
    }

    accepted.push({
      ...observation,
      time: roundNumber(clampNumber(observation.time, 0, safeDuration)),
      x: roundNumber(clampRatio(observation.x)),
      y: roundNumber(clampRatio(observation.y)),
      confidence,
      width: Number.isFinite(observation.width) ? roundNumber(clampNumber(observation.width ?? 0, 0.01, 1)) : undefined,
      height: Number.isFinite(observation.height) ? roundNumber(clampNumber(observation.height ?? 0, 0.01, 1)) : undefined,
    });
  });

  if (rejectedObservationCount > 0) {
    warnings.push(`Rejected ${rejectedObservationCount} low-confidence or malformed model tracking hint${rejectedObservationCount === 1 ? '' : 's'}.`);
  }

  if (accepted.length === 0) {
    warnings.push('No accepted model tracking hints were available.');
    return {
      controlPoints: [],
      quality: buildTrackingPathQualityReport([], safeDuration),
      acceptedObservationCount: 0,
      rejectedObservationCount,
      averageConfidence: 0,
      status: 'rejected',
      warnings,
    };
  }

  accepted.sort((left, right) => left.time - right.time);
  const averageConfidence = roundNumber(accepted.reduce((sum, point) => sum + point.confidence, 0) / accepted.length);
  const averageWidth = averageFiniteValue(accepted.map((point) => point.width));
  const averageHeight = averageFiniteValue(accepted.map((point) => point.height));
  const targetMidTime = safeDuration / 2;
  const start = accepted[0];
  const mid = accepted.reduce((closest, point) => (
    Math.abs(point.time - targetMidTime) < Math.abs(closest.time - targetMidTime) ? point : closest
  ), accepted[0]);
  const end = accepted[accepted.length - 1];

  if (accepted.length < 3) {
    warnings.push('Model tracking hints contained fewer than three accepted observations.');
  }

  if (averageConfidence < Math.max(minConfidence, 0.55)) {
    warnings.push('Accepted model tracking hints have low average confidence.');
  }

  const controlPoints = smoothTrackingControlPoints(normalizeTrackingControlPoints([
    toControlPoint('start', start),
    toControlPoint('mid', mid),
    toControlPoint('end', end),
  ], safeDuration), smoothing * 0.35);
  const quality = buildTrackingPathQualityReport(controlPoints, safeDuration);
  const status = quality.status === 'needs-review' || accepted.length < 3 || averageConfidence < Math.max(minConfidence, 0.55)
    ? 'review'
    : 'stable';

  return {
    controlPoints,
    quality,
    acceptedObservationCount: accepted.length,
    rejectedObservationCount,
    averageConfidence,
    averageWidth,
    averageHeight,
    status,
    warnings: [...warnings, ...quality.warnings],
  };
}

export function buildTrackingEffectModelHintPatch(
  effect: ClipEffect,
  observations: TrackingObservationPoint[],
  duration: number,
  options: Omit<TrackingModelHintRefinementOptions, 'duration'> = {},
): ClipEffect['parameters'] {
  if (effect.type !== 'reframe' && !(effect.type === 'mask' && effect.parameters.maskMode === 'object')) {
    return {};
  }

  const refinement = refineTrackingControlPointsFromModelHints(observations, {
    ...options,
    duration,
  });
  const telemetry = buildModelRefinementTelemetry(refinement);
  if (refinement.controlPoints.length === 0) {
    return telemetry;
  }

  const start = refinement.controlPoints[0];
  const mid = refinement.controlPoints[1] ?? start;
  const end = refinement.controlPoints[2] ?? refinement.controlPoints[refinement.controlPoints.length - 1] ?? mid;
  const qualityPatch = {
    trackingEnabled: true,
    trackingPointCount: refinement.controlPoints.length,
    trackingQualityScore: refinement.quality.score,
    trackingMaxJump: refinement.quality.maxJump,
    trackingNeedsReview: refinement.status !== 'stable',
    trackingMidTime: mid.time,
    trackingDuration: end.time,
  };

  if (effect.type === 'reframe') {
    return {
      ...qualityPatch,
      ...telemetry,
      focalX: mid.x,
      focalY: mid.y,
      focalXStart: start.x,
      focalYStart: start.y,
      focalXMid: mid.x,
      focalYMid: mid.y,
      focalXEnd: end.x,
      focalYEnd: end.y,
    };
  }

  return {
    ...qualityPatch,
    ...telemetry,
    centerX: mid.x,
    centerY: mid.y,
    centerXStart: start.x,
    centerYStart: start.y,
    centerXMid: mid.x,
    centerYMid: mid.y,
    centerXEnd: end.x,
    centerYEnd: end.y,
    ...(refinement.averageWidth !== undefined ? { width: clampNumber(refinement.averageWidth, 0.05, 1) } : {}),
    ...(refinement.averageHeight !== undefined ? { height: clampNumber(refinement.averageHeight, 0.05, 1) } : {}),
  };
}

export function normalizeTrackingControlPoints(
  points: TrackingControlPoint[],
  duration: number,
): TrackingControlPoint[] {
  const safeDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);

  return points
    .map((point) => ({
      id: point.id,
      time: roundNumber(clampNumber(point.time, 0, safeDuration)),
      x: roundNumber(clampRatio(point.x)),
      y: roundNumber(clampRatio(point.y)),
    }))
    .sort((left, right) => left.time - right.time || pointOrder(left.id) - pointOrder(right.id));
}

export function smoothTrackingControlPoints(
  points: TrackingControlPoint[],
  amount = 0,
): TrackingControlPoint[] {
  const smoothing = clampNumber(amount, 0, 1);
  if (points.length <= 2 || smoothing === 0) {
    return points.map((point) => ({ ...point }));
  }

  return points.map((point, index) => {
    if (index === 0 || index === points.length - 1) {
      return { ...point };
    }

    const previous = points[index - 1];
    const next = points[index + 1];
    const neighborX = (previous.x + next.x) / 2;
    const neighborY = (previous.y + next.y) / 2;

    return {
      ...point,
      x: roundNumber(clampRatio((point.x * (1 - smoothing)) + (neighborX * smoothing))),
      y: roundNumber(clampRatio((point.y * (1 - smoothing)) + (neighborY * smoothing))),
    };
  });
}

export function buildTrackingPathQualityReport(
  points: TrackingControlPoint[],
  duration: number,
): TrackingPathQualityReport {
  const normalizedPoints = normalizeTrackingControlPoints(points, duration);
  const warnings: string[] = [];
  const edgePointCount = normalizedPoints.filter((point) => (
    point.x <= 0.03 || point.x >= 0.97 || point.y <= 0.03 || point.y >= 0.97
  )).length;
  let maxJump = 0;
  let maxSegmentSpeed = 0;

  for (let index = 1; index < normalizedPoints.length; index += 1) {
    const previous = normalizedPoints[index - 1];
    const current = normalizedPoints[index];
    const jump = Math.hypot(current.x - previous.x, current.y - previous.y);
    const segmentDuration = Math.max(0.001, current.time - previous.time);

    maxJump = Math.max(maxJump, jump);
    maxSegmentSpeed = Math.max(maxSegmentSpeed, jump / segmentDuration);
  }

  if (normalizedPoints.length < 3) {
    warnings.push('Tracking path has fewer than three control points.');
  }

  if (maxJump > 0.35) {
    warnings.push('Tracking path has a large position jump and should be reviewed.');
  }

  if (maxSegmentSpeed > 0.28) {
    warnings.push('Tracking path moves very quickly between adjacent points.');
  }

  if (edgePointCount > 0) {
    warnings.push('Tracking path touches the frame edge and may crop or mask the subject.');
  }

  const score = roundNumber(clampNumber(
    1 - (maxJump * 1.15) - (maxSegmentSpeed > 0.28 ? 0.2 : 0) - (edgePointCount * 0.12),
    0,
    1,
  ));

  return {
    pointCount: normalizedPoints.length,
    duration: roundNumber(Math.max(0, duration)),
    maxJump: roundNumber(maxJump),
    maxSegmentSpeed: roundNumber(maxSegmentSpeed),
    edgePointCount,
    score,
    status: warnings.length > 0 ? 'needs-review' : 'stable',
    warnings,
  };
}

function pointOrder(point: TrackingPointId): number {
  switch (point) {
    case 'start':
      return 0;
    case 'mid':
      return 1;
    case 'end':
      return 2;
    default:
      return 3;
  }
}

function toControlPoint(
  id: TrackingPointId,
  point: TrackingObservationPoint & { confidence: number },
): TrackingControlPoint {
  return {
    id,
    time: point.time,
    x: point.x,
    y: point.y,
  };
}

function buildModelRefinementTelemetry(
  refinement: TrackingModelHintRefinementResult,
): ClipEffect['parameters'] {
  return {
    trackingModelHintCount: refinement.acceptedObservationCount,
    trackingRejectedHintCount: refinement.rejectedObservationCount,
    trackingAverageConfidence: refinement.averageConfidence,
    trackingModelWarningCount: refinement.warnings.length,
    trackingModelRefinementStatus: refinement.status,
    ...(refinement.averageWidth !== undefined ? { trackingAverageWidth: refinement.averageWidth } : {}),
    ...(refinement.averageHeight !== undefined ? { trackingAverageHeight: refinement.averageHeight } : {}),
  };
}

function averageFiniteValue(values: Array<number | undefined>): number | undefined {
  const finiteValues = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (finiteValues.length === 0) {
    return undefined;
  }

  return roundNumber(finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length);
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

function readTrackingEffectControlPoints(effect: ClipEffect): TrackingControlPoint[] | undefined {
  if (effect.type === 'reframe') {
    return [
      {
        id: 'start',
        time: 0,
        x: readNumber(effect.parameters.focalXStart, readNumber(effect.parameters.focalX, 0.5)),
        y: readNumber(effect.parameters.focalYStart, readNumber(effect.parameters.focalY, 0.5)),
      },
      {
        id: 'mid',
        time: readNumber(effect.parameters.trackingMidTime, 0),
        x: readNumber(effect.parameters.focalXMid, readNumber(effect.parameters.focalX, 0.5)),
        y: readNumber(effect.parameters.focalYMid, readNumber(effect.parameters.focalY, 0.5)),
      },
      {
        id: 'end',
        time: readNumber(effect.parameters.trackingDuration, readNumber(effect.parameters.trackingMidTime, 0)),
        x: readNumber(effect.parameters.focalXEnd, readNumber(effect.parameters.focalXMid, readNumber(effect.parameters.focalX, 0.5))),
        y: readNumber(effect.parameters.focalYEnd, readNumber(effect.parameters.focalYMid, readNumber(effect.parameters.focalY, 0.5))),
      },
    ];
  }

  if (effect.type === 'mask' && effect.parameters.maskMode === 'object') {
    return [
      {
        id: 'start',
        time: 0,
        x: readNumber(effect.parameters.centerXStart, readNumber(effect.parameters.centerX, 0.5)),
        y: readNumber(effect.parameters.centerYStart, readNumber(effect.parameters.centerY, 0.45)),
      },
      {
        id: 'mid',
        time: readNumber(effect.parameters.trackingMidTime, 0),
        x: readNumber(effect.parameters.centerXMid, readNumber(effect.parameters.centerX, 0.5)),
        y: readNumber(effect.parameters.centerYMid, readNumber(effect.parameters.centerY, 0.45)),
      },
      {
        id: 'end',
        time: readNumber(effect.parameters.trackingDuration, readNumber(effect.parameters.trackingMidTime, 0)),
        x: readNumber(effect.parameters.centerXEnd, readNumber(effect.parameters.centerXMid, readNumber(effect.parameters.centerX, 0.5))),
        y: readNumber(effect.parameters.centerYEnd, readNumber(effect.parameters.centerYMid, readNumber(effect.parameters.centerY, 0.45))),
      },
    ];
  }

  return undefined;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
