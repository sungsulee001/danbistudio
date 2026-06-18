import type { EditorProject } from './types';

export interface ProjectSettingsPatch {
  name?: string;
  width?: number;
  height?: number;
  fps?: number;
  duration?: number;
}

export function updateProjectSettings(project: EditorProject, patch: ProjectSettingsPatch): EditorProject {
  const nextName = patch.name === undefined ? project.name : patch.name.trim();
  if (nextName.length === 0) {
    throw new Error('Project name cannot be empty.');
  }

  const nextWidth = patch.width === undefined ? project.width : normalizeEvenInteger(patch.width, project.width, 16, 8192);
  const nextHeight = patch.height === undefined ? project.height : normalizeEvenInteger(patch.height, project.height, 16, 8192);
  const nextFps = patch.fps === undefined ? project.fps : normalizeNumber(patch.fps, project.fps, 1, 240);
  const requestedDuration = patch.duration === undefined ? project.duration : normalizeNumber(patch.duration, project.duration, 1, 24 * 60 * 60);
  const nextDuration = roundSeconds(Math.max(requiredProjectDuration(project), requestedDuration));

  if (
    nextName === project.name &&
    nextWidth === project.width &&
    nextHeight === project.height &&
    nextFps === project.fps &&
    nextDuration === project.duration
  ) {
    return project;
  }

  return {
    ...project,
    name: nextName,
    width: nextWidth,
    height: nextHeight,
    fps: nextFps,
    duration: nextDuration,
    updatedAt: new Date().toISOString(),
  };
}

export function requiredProjectDuration(project: EditorProject): number {
  const clipEnd = project.tracks.reduce((maxEnd, track) => (
    Math.max(maxEnd, ...track.clips.map((clip) => clip.start + clip.duration))
  ), 0);
  const markerEnd = project.markers.reduce((maxEnd, marker) => Math.max(maxEnd, marker.time), 0);
  const captionEnd = project.captions.reduce((maxEnd, caption) => Math.max(maxEnd, caption.end), 0);

  return roundSeconds(Math.max(1, clipEnd, markerEnd, captionEnd));
}

function normalizeEvenInteger(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const clamped = Math.min(max, Math.max(min, Math.round(value)));
  return clamped % 2 === 0 ? clamped : clamped + (clamped >= max ? -1 : 1);
}

function normalizeNumber(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return roundSeconds(Math.min(max, Math.max(min, value)));
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}
