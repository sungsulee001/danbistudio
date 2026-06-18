import { DEFAULT_COMFYUI_WORKFLOW_NAME } from '../comfyui-workflow-defaults';
import { findComfyUIWorkflowPreset } from './comfyui-workflows';
import { createClip } from './project';
import { resolveRenderableAssetMediaKind } from './renderable-media-kind';
import type { EditorAsset, EditorProject, TimelineClip, TimelineTrack } from './types';

export interface VisualTimelineGap {
  id: string;
  start: number;
  end: number;
  duration: number;
}

export interface AiBrollGapFillOptions {
  targetTrackId?: string;
  minGapDuration?: number;
  maxClipDuration?: number;
  limit?: number;
  prompt?: string;
  presetId?: string;
  seedStart?: number;
}

export interface AiBrollGapFillResult {
  project: EditorProject;
  gaps: VisualTimelineGap[];
  clipIds: string[];
}

interface VisualInterval {
  start: number;
  end: number;
}

export function findVisualTimelineGaps(
  project: EditorProject,
  options: Pick<AiBrollGapFillOptions, 'minGapDuration'> = {},
): VisualTimelineGap[] {
  const minGapDuration = roundTime(Math.max(0, options.minGapDuration ?? 1));
  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const intervals = project.tracks
    .filter((track) => track.kind !== 'audio')
    .flatMap((track) => track.clips
      .filter((clip) => isVisualCoverageClip(clip, clip.assetId ? assetById.get(clip.assetId) : undefined))
      .map((clip) => ({
        start: roundTime(clamp(clip.start, 0, project.duration)),
        end: roundTime(clamp(clip.start + clip.duration, 0, project.duration)),
      })))
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged = mergeIntervals(intervals);
  const gaps: VisualTimelineGap[] = [];
  let cursor = 0;

  for (const interval of merged) {
    if (interval.start > cursor) {
      gaps.push(buildGap(cursor, interval.start));
    }
    cursor = Math.max(cursor, interval.end);
  }

  if (cursor < project.duration) {
    gaps.push(buildGap(cursor, project.duration));
  }

  return gaps.filter((gap) => gap.duration >= minGapDuration);
}

export function fillAiBrollGaps(
  project: EditorProject,
  options: AiBrollGapFillOptions = {},
): AiBrollGapFillResult {
  const targetTrack = resolveAiBrollTargetTrack(project, options.targetTrackId);
  const gaps = findVisualTimelineGaps(project, { minGapDuration: options.minGapDuration });
  if (gaps.length === 0) {
    throw new Error('No visual timeline gaps found for AI B-roll.');
  }

  const preset = findComfyUIWorkflowPreset(options.presetId ?? 'broll-i2v') ?? findComfyUIWorkflowPreset('broll-i2v');
  const existingIds = new Set(project.tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
  const maxClipDuration = Math.max(0.25, options.maxClipDuration ?? 8);
  const limit = Math.max(1, Math.floor(options.limit ?? 8));
  const selectedGaps = gaps.slice(0, limit);
  const clipIds: string[] = [];
  const clips = selectedGaps.map((gap, index) => {
    const duration = roundTime(Math.min(gap.duration, maxClipDuration));
    const clipId = uniqueId(`clip-ai-gap-${safeTime(gap.start)}-${safeTime(gap.end)}`, existingIds);
    clipIds.push(clipId);

    return createClip({
      id: clipId,
      trackId: targetTrack.id,
      name: `AI B-roll gap ${index + 1}`,
      kind: 'ai',
      start: gap.start,
      duration,
      color: '#fb7185',
      automationTags: ['comfyui', 'b-roll', 'gap-fill'],
      generation: {
        provider: 'comfyui',
        presetId: preset?.id ?? 'broll-i2v',
        workflowName: preset?.workflowName ?? DEFAULT_COMFYUI_WORKFLOW_NAME,
        prompt: buildGapPrompt(project, gap, options.prompt),
        negativePrompt: preset?.negativePrompt,
        seed: (options.seedStart ?? 260613) + index,
        parameters: {
          ...(preset?.parameters ?? {}),
          width: project.width,
          height: project.height,
        },
        status: 'draft',
      },
    });
  });

  const tracks = project.tracks.map((track) => (
    track.id === targetTrack.id
      ? {
        ...track,
        clips: [...track.clips, ...clips].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id)),
      }
      : track
  ));

  return {
    project: {
      ...project,
      tracks,
      duration: Math.max(project.duration, ...clips.map((clip) => clip.start + clip.duration)),
      updatedAt: new Date().toISOString(),
    },
    gaps: selectedGaps,
    clipIds,
  };
}

function resolveAiBrollTargetTrack(project: EditorProject, targetTrackId?: string): TimelineTrack {
  const requested = targetTrackId
    ? project.tracks.find((track) => track.id === targetTrackId && track.kind === 'video' && !track.locked)
    : undefined;
  if (requested) {
    return requested;
  }

  const aiTrack = project.tracks.find((track) => track.id === 'track-v2' && track.kind === 'video' && !track.locked);
  if (aiTrack) {
    return aiTrack;
  }

  const fallback = project.tracks.find((track) => track.kind === 'video' && !track.locked);
  if (!fallback) {
    throw new Error('An unlocked video track is required for AI B-roll gap fill.');
  }

  return fallback;
}

function isVisualCoverageClip(clip: TimelineClip, asset?: EditorAsset): boolean {
  if (clip.muted || clip.duration <= 0 || clip.kind === 'audio') {
    return false;
  }

  const mediaKind = resolveRenderableAssetMediaKind(asset);
  return mediaKind === undefined || mediaKind === 'video' || mediaKind === 'image';
}

function mergeIntervals(intervals: VisualInterval[]): VisualInterval[] {
  const merged: VisualInterval[] = [];
  for (const interval of intervals) {
    const previous = merged[merged.length - 1];
    if (!previous || interval.start > previous.end) {
      merged.push({ ...interval });
      continue;
    }

    previous.end = Math.max(previous.end, interval.end);
  }

  return merged;
}

function buildGap(start: number, end: number): VisualTimelineGap {
  return {
    id: `gap-${safeTime(start)}-${safeTime(end)}`,
    start: roundTime(start),
    end: roundTime(end),
    duration: roundTime(end - start),
  };
}

function buildGapPrompt(project: EditorProject, gap: VisualTimelineGap, prompt?: string): string {
  const basePrompt = prompt?.trim() || 'cinematic B-roll bridge shot, editor-ready insert, matches surrounding scene';
  const context = [
    ...project.markers
      .filter((marker) => marker.time >= gap.start - 2 && marker.time <= gap.end + 2)
      .map((marker) => marker.label),
    ...project.captions
      .filter((caption) => caption.end >= gap.start - 2 && caption.start <= gap.end + 2)
      .map((caption) => caption.text),
  ]
    .map((text) => text.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' / ');

  return context ? `${basePrompt}, context: ${context}` : basePrompt;
}

function uniqueId(baseId: string, ids: Set<string>): string {
  let id = baseId;
  let suffix = 2;
  while (ids.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  ids.add(id);
  return id;
}

function safeTime(value: number): string {
  return String(Math.max(0, Math.round(value * 1000)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}
