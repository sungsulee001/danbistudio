// Adapted from OpenCut Classic timeline/snapping.
// Source: https://github.com/opencut-app/opencut-classic
// Commit: cf5e79e919144200294fb9fed22a222592a0aeea
// License: MIT. See third_party/NOTICE.md and docs/THIRD_PARTY_SOURCE_REGISTER_KR.md.

import type { EditorProject } from './types';

export type TimelineSnapPointType =
  | 'project-start'
  | 'project-end'
  | 'clip-start'
  | 'clip-end'
  | 'marker'
  | 'playhead'
  | 'extra';

export interface TimelineSnapPoint {
  time: number;
  type: TimelineSnapPointType;
  clipId?: string;
  trackId?: string;
  markerId?: string;
}

export interface TimelineSnapResult {
  snappedTime: number;
  snapPoint: TimelineSnapPoint | null;
  snapDistance: number;
}

export interface BuildTimelineSnapPointsOptions {
  excludeClipId?: string;
  excludeClipIds?: string[];
  extraPoints?: number[];
  playhead?: number;
}

export function buildTimelineSnapPoints(
  project: EditorProject,
  options: BuildTimelineSnapPointsOptions = {},
): TimelineSnapPoint[] {
  const excludedClipIds = new Set([
    ...(options.excludeClipIds ?? []),
    ...(options.excludeClipId ? [options.excludeClipId] : []),
  ]);
  const snapPoints: TimelineSnapPoint[] = [
    { time: 0, type: 'project-start' },
    { time: project.duration, type: 'project-end' },
  ];

  if (Number.isFinite(options.playhead)) {
    snapPoints.push({ time: clampSnapTime(options.playhead ?? 0, project.duration), type: 'playhead' });
  }

  for (const marker of project.markers) {
    snapPoints.push({
      time: clampSnapTime(marker.time, project.duration),
      type: 'marker',
      markerId: marker.id,
    });
  }

  for (const extraPoint of options.extraPoints ?? []) {
    if (Number.isFinite(extraPoint)) {
      snapPoints.push({
        time: clampSnapTime(extraPoint, project.duration),
        type: 'extra',
      });
    }
  }

  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (excludedClipIds.has(clip.id)) {
        continue;
      }

      snapPoints.push(
        {
          time: clampSnapTime(clip.start, project.duration),
          type: 'clip-start',
          clipId: clip.id,
          trackId: track.id,
        },
        {
          time: clampSnapTime(clip.start + clip.duration, project.duration),
          type: 'clip-end',
          clipId: clip.id,
          trackId: track.id,
        },
      );
    }
  }

  return snapPoints;
}

export function resolveTimelineSnap({
  targetTime,
  snapPoints,
  threshold,
}: {
  targetTime: number;
  snapPoints: TimelineSnapPoint[];
  threshold: number;
}): TimelineSnapResult {
  let closestSnapPoint: TimelineSnapPoint | null = null;
  let closestDistance = Infinity;

  for (const snapPoint of snapPoints) {
    const distance = Math.abs(targetTime - snapPoint.time);
    if (distance <= threshold && distance < closestDistance) {
      closestDistance = distance;
      closestSnapPoint = snapPoint;
    }
  }

  return {
    snappedTime: closestSnapPoint ? closestSnapPoint.time : targetTime,
    snapPoint: closestSnapPoint,
    snapDistance: closestDistance,
  };
}

export function snapTimelineTime({
  project,
  time,
  threshold = 0.2,
  options,
}: {
  project: EditorProject;
  time: number;
  threshold?: number;
  options?: BuildTimelineSnapPointsOptions;
}): TimelineSnapResult {
  const targetTime = clampSnapTime(time, project.duration);
  return resolveTimelineSnap({
    targetTime,
    threshold,
    snapPoints: buildTimelineSnapPoints(project, options),
  });
}

function clampSnapTime(time: number, duration: number): number {
  if (!Number.isFinite(time)) {
    return 0;
  }

  return Math.min(Math.max(time, 0), Math.max(duration, 0));
}
