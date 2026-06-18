import type { ClipSpeedRampPoint, TimelineClip } from './types';

export type SpeedRampPresetId = 'hero-push' | 'bullet-time' | 'quick-punch';

export interface SpeedRampPreset {
  id: SpeedRampPresetId;
  label: string;
  points: Array<{ timeRatio: number; speed: number }>;
}

export const SPEED_RAMP_PRESETS: SpeedRampPreset[] = [
  {
    id: 'hero-push',
    label: 'Hero push',
    points: [
      { timeRatio: 0, speed: 0.65 },
      { timeRatio: 0.45, speed: 1 },
      { timeRatio: 1, speed: 2.1 },
    ],
  },
  {
    id: 'bullet-time',
    label: 'Bullet time',
    points: [
      { timeRatio: 0, speed: 1 },
      { timeRatio: 0.34, speed: 0.25 },
      { timeRatio: 0.66, speed: 0.25 },
      { timeRatio: 1, speed: 1.6 },
    ],
  },
  {
    id: 'quick-punch',
    label: 'Quick punch',
    points: [
      { timeRatio: 0, speed: 1.35 },
      { timeRatio: 0.5, speed: 2.4 },
      { timeRatio: 1, speed: 1 },
    ],
  },
];

export function buildSpeedRampFromPreset(clip: TimelineClip, presetId: SpeedRampPresetId): ClipSpeedRampPoint[] {
  const preset = SPEED_RAMP_PRESETS.find((item) => item.id === presetId);
  if (!preset) {
    throw new Error('Speed ramp preset not found.');
  }

  return normalizeSpeedRampPoints(
    preset.points.map((point, index) => ({
      id: `speed-ramp-${clip.id}-${preset.id}-${index}`,
      time: roundTime(point.timeRatio * clip.duration),
      speed: point.speed,
    })),
    clip.duration,
  );
}

export function hasSpeedRamp(clip: TimelineClip): boolean {
  return normalizeSpeedRampPoints(clip.speedRamp, clip.duration).length >= 2;
}

export function normalizeSpeedRampPoints(
  points: ClipSpeedRampPoint[] | undefined,
  duration: number,
): ClipSpeedRampPoint[] {
  const safeDuration = Math.max(0.001, Number.isFinite(duration) ? duration : 0.001);
  const normalized = (points ?? [])
    .map((point, index) => ({
      id: typeof point.id === 'string' && point.id ? point.id : `speed-ramp-${index}`,
      time: roundTime(clamp(point.time, 0, safeDuration)),
      speed: roundTime(clamp(point.speed, 0.05, 8)),
    }))
    .sort((left, right) => left.time - right.time);
  const byTime = new Map<number, ClipSpeedRampPoint>();
  for (const point of normalized) {
    byTime.set(point.time, point);
  }

  const deduped = Array.from(byTime.values()).sort((left, right) => left.time - right.time);
  if (deduped.length === 0) {
    return [];
  }

  if (deduped[0].time > 0) {
    deduped.unshift({ ...deduped[0], id: `${deduped[0].id}-start`, time: 0 });
  }

  const last = deduped[deduped.length - 1];
  if (last.time < safeDuration) {
    deduped.push({ ...last, id: `${last.id}-end`, time: safeDuration });
  }

  return deduped;
}

export function getSpeedAtTime(clip: TimelineClip, clipTime: number): number {
  const points = normalizeSpeedRampPoints(clip.speedRamp, clip.duration);
  if (points.length < 2) {
    return clamp(clip.speed, 0.05, 8);
  }

  const time = clamp(clipTime, 0, clip.duration);
  const segment = findSpeedRampSegment(points, time);
  if (!segment) {
    return points.at(-1)?.speed ?? clip.speed;
  }

  const duration = Math.max(0.001, segment.end.time - segment.start.time);
  const ratio = clamp((time - segment.start.time) / duration, 0, 1);
  return roundTime(segment.start.speed + (segment.end.speed - segment.start.speed) * ratio);
}

export function getSpeedRampSourceDuration(clip: TimelineClip): number {
  const points = normalizeSpeedRampPoints(clip.speedRamp, clip.duration);
  if (points.length < 2) {
    return roundTime(clip.duration * clamp(clip.speed, 0.05, 8));
  }

  return roundTime(integrateSpeedRamp(points, clip.duration));
}

export function getSpeedRampSourceTimeOffset(clip: TimelineClip, clipTime: number): number {
  const points = normalizeSpeedRampPoints(clip.speedRamp, clip.duration);
  const time = clamp(clipTime, 0, clip.duration);
  if (points.length < 2) {
    return roundTime(time * clamp(clip.speed, 0.05, 8));
  }

  return roundTime(integrateSpeedRamp(points, time));
}

export function getAverageSpeed(clip: TimelineClip): number {
  return roundTime(getSpeedRampSourceDuration(clip) / Math.max(0.001, clip.duration));
}

function integrateSpeedRamp(points: ClipSpeedRampPoint[], targetTime: number): number {
  let sourceDuration = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (targetTime <= start.time) {
      break;
    }

    const segmentDuration = end.time - start.time;
    const consumed = Math.min(segmentDuration, targetTime - start.time);
    if (consumed <= 0) {
      continue;
    }

    const acceleration = (end.speed - start.speed) / Math.max(0.001, segmentDuration);
    sourceDuration += start.speed * consumed + 0.5 * acceleration * consumed * consumed;
  }

  return sourceDuration;
}

function findSpeedRampSegment(points: ClipSpeedRampPoint[], time: number): { start: ClipSpeedRampPoint; end: ClipSpeedRampPoint } | undefined {
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (time >= start.time && time <= end.time) {
      return { start, end };
    }
  }

  return undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}
