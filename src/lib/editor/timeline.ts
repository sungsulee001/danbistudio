import { normalizeClipVolume, normalizeTrackPan, normalizeTrackVolumeDb } from './audio-mixer';
import { DEFAULT_COMFYUI_WORKFLOW_NAME } from '../comfyui-workflow-defaults';
import { isAdjustmentLayerClip } from './adjustment-layer';
import type { CaptionSegment, CaptionStyle, ClipEffect, ClipKeyframe, EditorAsset, EditorProject, TimelineClip, TimelineMarker, TimelineTrack, TrackKind } from './types';
import { CANVAS_LAYOUT_EFFECT_LABEL, canvasLayoutLabel, normalizeCanvasLayoutMode, type CanvasLayoutMode } from './canvas-layout';
import { CROP_MASK_EFFECT_LABEL, findCropMaskEffect, findCropMaskPreset, isCropMaskEffect, type CropMaskPresetId } from './crop-mask';
import { defaultCaptionStyle } from './caption-style';
import { getClipPlaybackSpeed, getClipSourceDuration, timelineDeltaToSourceDelta } from './clip-timing';
import { interpolateNumericKeyframes, toNumericKeyframeSamples } from './keyframe-interpolation';
import { buildSpeedRampFromPreset, type SpeedRampPresetId } from './speed-ramp';
import { resolveTimelineGroupMoveFromProject, trackKindForTimelineClip, type TimelineGroupMoveNewTrackPosition } from './timeline-group-move';
import { resolveTimelineResizeTimeFromProject } from './timeline-group-resize';
import { buildTrackingQualityParameterPatch } from './tracking-path';
import {
  buildDetachedAudioTag,
  buildLinkedVideoTag,
  DETACHED_AUDIO_TAG_PREFIX,
  EMBEDDED_AUDIO_DISABLED_TAG,
  getDetachedAudioClipId,
  getLinkedVideoClipId,
  clipHasTimelineAudio,
  hasEmbeddedAudio,
  isEmbeddedAudioDisabled,
  LINKED_VIDEO_TAG_PREFIX,
  withoutEmbeddedAudioLinkTags,
  withUniqueTags,
} from './media-metadata';
import { createClip } from './project';
import { isRenderableVisualMediaAsset, resolveRenderableAssetMediaKind } from './renderable-media-kind';
import { findTitleStyleEffect, normalizeTitleStyle, TITLE_STYLE_EFFECT_LABEL } from './title-style';
import { snapTimelineTime } from './timeline-snapping';

const MIN_CLIP_DURATION = 0.25;
const MIN_CAPTION_DURATION = 0.05;
const CLIP_GROUP_TAG_PREFIX = 'clip-group:';

export const COLOR_GRADING_PRESETS = [
  {
    id: 'neutral',
    label: 'Neutral',
    parameters: { brightness: 0, contrast: 1, saturation: 1, gamma: 1, temperature: 0, tint: 0 },
  },
  {
    id: 'vivid',
    label: 'Vivid',
    parameters: { brightness: 0.03, contrast: 1.18, saturation: 1.28, gamma: 0.98, temperature: 0.05, tint: 0 },
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    parameters: { brightness: -0.02, contrast: 1.22, saturation: 0.92, gamma: 0.95, temperature: -0.12, tint: 0.08 },
  },
  {
    id: 'warm',
    label: 'Warm',
    parameters: { brightness: 0.02, contrast: 1.08, saturation: 1.12, gamma: 1, temperature: 0.35, tint: -0.04 },
  },
  {
    id: 'cool',
    label: 'Cool',
    parameters: { brightness: 0, contrast: 1.1, saturation: 1.04, gamma: 1, temperature: -0.35, tint: 0.04 },
  },
  {
    id: 'mono',
    label: 'Mono',
    parameters: { brightness: 0.01, contrast: 1.18, saturation: 0, gamma: 1, temperature: 0, tint: 0 },
  },
  {
    id: 'filmic-curve',
    label: 'Filmic curve',
    parameters: { brightness: -0.01, contrast: 1.08, saturation: 0.96, gamma: 0.98, temperature: -0.05, tint: 0.03, curveShadow: 0.18, curveMid: 0.5, curveHighlight: 0.86 },
  },
  {
    id: 'matte-fade',
    label: 'Matte fade',
    parameters: { brightness: 0.02, contrast: 1.02, saturation: 0.9, gamma: 1.03, temperature: 0.08, tint: 0, curveShadow: 0.34, curveMid: 0.54, curveHighlight: 0.82 },
  },
  {
    id: 'punch-curve',
    label: 'Punch curve',
    parameters: { brightness: 0, contrast: 1.1, saturation: 1.16, gamma: 0.98, temperature: 0.02, tint: 0, curveShadow: 0.14, curveMid: 0.5, curveHighlight: 0.9 },
  },
] as const;

export type ColorGradingPresetId = typeof COLOR_GRADING_PRESETS[number]['id'];

export type EditableClipPatch = Partial<Pick<
  TimelineClip,
  'name' | 'color' | 'start' | 'duration' | 'sourceIn' | 'speed' | 'reversed' | 'freezeFrameTime' | 'volume' | 'opacity' | 'blendMode' | 'muted' | 'locked'
>>;

export type BatchEditableClipPatch = Partial<Pick<
  TimelineClip,
  'color' | 'volume' | 'opacity' | 'blendMode' | 'reversed'
>>;

export type EditableClipState = 'muted' | 'locked';

export interface ClipAttributeClipboard {
  sourceClipId: string;
  sourceClipName: string;
  sourceDuration: number;
  volume: number;
  opacity: number;
  blendMode: TimelineClip['blendMode'];
  muted?: boolean;
  effects: ClipEffect[];
  keyframes: ClipKeyframe[];
}

export interface ClipBatchEditSkippedClip {
  clipId: string;
  reason: string;
}

export interface ClipBatchEditResult {
  project: EditorProject;
  updatedClipIds: string[];
  skipped: ClipBatchEditSkippedClip[];
}

export interface PasteClipAttributesOptions {
  includeBasicProperties?: boolean;
  includeEffects?: boolean;
  includeKeyframes?: boolean;
  scaleKeyframes?: boolean;
}

export type EditableCaptionPatch = Partial<Pick<CaptionSegment, 'start' | 'end' | 'text' | 'speaker' | 'confidence' | 'style'>>;

export type EditableMarkerPatch = Partial<Pick<TimelineMarker, 'time' | 'label' | 'color' | 'kind' | 'duration' | 'note'>>;

export type AudioFadeEdge = 'in' | 'out' | 'both';

export type VisualFadeEdge = 'in' | 'out' | 'both';

export const MOTION_PRESETS = [
  {
    id: 'zoom-in',
    label: 'Zoom in',
    start: { positionX: 0, positionY: 0, scale: 1 },
    end: { positionX: 0, positionY: 0, scale: 1.18 },
  },
  {
    id: 'zoom-out',
    label: 'Zoom out',
    start: { positionX: 0, positionY: 0, scale: 1.18 },
    end: { positionX: 0, positionY: 0, scale: 1 },
  },
  {
    id: 'pan-left',
    label: 'Pan left',
    start: { positionX: 60, positionY: 0, scale: 1.12 },
    end: { positionX: -60, positionY: 0, scale: 1.12 },
  },
  {
    id: 'pan-right',
    label: 'Pan right',
    start: { positionX: -60, positionY: 0, scale: 1.12 },
    end: { positionX: 60, positionY: 0, scale: 1.12 },
  },
  {
    id: 'pan-up',
    label: 'Pan up',
    start: { positionX: 0, positionY: 45, scale: 1.12 },
    end: { positionX: 0, positionY: -45, scale: 1.12 },
  },
  {
    id: 'pan-down',
    label: 'Pan down',
    start: { positionX: 0, positionY: -45, scale: 1.12 },
    end: { positionX: 0, positionY: 45, scale: 1.12 },
  },
] as const;

export type MotionPresetId = typeof MOTION_PRESETS[number]['id'];

type TimelineTransitionOut = NonNullable<TimelineClip['transitionOut']>;

export type EditableTransitionPatch = Partial<Pick<TimelineTransitionOut, 'type' | 'duration' | 'easing' | 'parameters'>>;

export type EditableTrackPatch = Partial<Pick<TimelineTrack, 'name' | 'muted' | 'solo' | 'syncLocked' | 'volumeDb' | 'pan' | 'locked'>>;

export type SupportedTransitionType = 'crossfade' | 'dip' | 'push' | 'wipe' | 'match-cut' | 'ai-morph';
export type SupportedTransition = TimelineTransitionOut & { type: SupportedTransitionType };

export interface EditableKeyframePatch {
  time?: number;
  value?: number;
  easing?: ClipKeyframe['easing'];
}

export interface AssetRangeEditOptions {
  start: number;
  targetTrackId?: string;
  sourceIn?: number;
  duration?: number;
  ripple?: boolean;
}

export interface AssetPatchEditOptions extends AssetRangeEditOptions {
  primaryTargetTrackId?: string;
  audioTargetTrackId?: string;
  includePrimary?: boolean;
  includeAudio?: boolean;
}

export interface PasteEditOptions {
  ripple?: boolean;
}

export interface InsertTimelineGapOptions {
  trackIds?: string[];
  includeSyncLocked?: boolean;
}

export interface ArrangeClipsOnTrackOptions {
  gapSeconds?: number;
  start?: number;
}

export interface DuplicateClipsOptions {
  gapSeconds?: number;
  includeLinked?: boolean;
  includeGrouped?: boolean;
}

export interface MoveClipOptions {
  preventOverlap?: boolean;
}

export interface MoveClipsToTimeOptions extends MoveClipOptions {}

export interface RetimeClipOptions {
  ripple?: boolean;
  preventOverlap?: boolean;
}

export interface TransitionEditOptions {
  autoOverlap?: boolean;
}

export interface TitleClipOptions {
  text: string;
  start: number;
  duration?: number;
  targetTrackId?: string;
  color?: string;
}

export interface ReplaceClipSourceOptions {
  sourceIn?: number;
  duration?: number;
}

export interface SelectClipsRelativeToTimeOptions {
  direction: 'left' | 'right';
  trackId?: string;
  includeLinked?: boolean;
  includeGrouped?: boolean;
  includeLocked?: boolean;
}

export interface SelectClipsAtTimeOptions {
  trackId?: string;
  includeLinked?: boolean;
  includeGrouped?: boolean;
  includeLocked?: boolean;
}

export interface SelectClipsInRangeOptions {
  trackId?: string;
  includeLinked?: boolean;
  includeGrouped?: boolean;
  includeLocked?: boolean;
  mode?: 'intersect' | 'contained';
}

export interface SelectAllClipIdsOptions {
  trackId?: string;
  includeLinked?: boolean;
  includeGrouped?: boolean;
  includeLocked?: boolean;
}

export interface CopyClipsInRangeOptions {
  trackIds?: string[];
  includeLinked?: boolean;
  includeLocked?: boolean;
}

export interface CutClipsInRangeOptions extends CopyClipsInRangeOptions {
  ripple?: boolean;
}

export interface CutClipsInRangeResult {
  project: EditorProject;
  clips: TimelineClip[];
}

export interface AdjacentEditPointOptions {
  direction: 'previous' | 'next';
  trackId?: string;
  includeLocked?: boolean;
}

export interface ClipSelectionRangeOptions {
  includeLinked?: boolean;
  includeGrouped?: boolean;
  includeLocked?: boolean;
}

export interface ExpandClipIdsOptions {
  includeLinked?: boolean;
  includeGrouped?: boolean;
}

export interface GroupClipsOptions {
  groupId?: string;
  includeLinked?: boolean;
}

export interface TimelineRange {
  start: number;
  end: number;
}

export function getAllClips(project: EditorProject): TimelineClip[] {
  return project.tracks.flatMap((track) => track.clips);
}

export function findClip(project: EditorProject, clipId: string): TimelineClip | undefined {
  return getAllClips(project).find((clip) => clip.id === clipId);
}

export function findAllSelectableClipIds(
  project: EditorProject,
  options: SelectAllClipIdsOptions = {},
): string[] {
  const includeLocked = options.includeLocked ?? false;
  const baseIds = project.tracks.flatMap((track) => {
    if (options.trackId && track.id !== options.trackId) {
      return [];
    }

    if (!includeLocked && track.locked) {
      return [];
    }

    return track.clips
      .filter((clip) => includeLocked || !clip.locked)
      .map((clip) => clip.id);
  });

  if (baseIds.length === 0) {
    return [];
  }

  const expandedIds = new Set(expandClipIdsWithLinkedAndGroupedClips(project, baseIds, {
    includeLinked: options.includeLinked ?? true,
    includeGrouped: options.includeGrouped ?? true,
  }));

  return project.tracks.flatMap((track) => {
    if (!includeLocked && track.locked) {
      return [];
    }

    return track.clips
      .filter((clip) => expandedIds.has(clip.id) && (includeLocked || !clip.locked))
      .map((clip) => clip.id);
  });
}

export function getLinkedClipIds(project: EditorProject, clipId: string): string[] {
  return expandClipIdsWithLinkedClips(project, [clipId]);
}

export function expandClipIdsWithLinkedClips(project: EditorProject, clipIds: string[]): string[] {
  return expandClipIdsWithLinkedAndGroupedClips(project, clipIds, { includeGrouped: false });
}

export function getGroupedClipIds(project: EditorProject, clipId: string): string[] {
  return expandClipIdsWithLinkedAndGroupedClips(project, [clipId]);
}

export function expandClipIdsWithLinkedAndGroupedClips(
  project: EditorProject,
  clipIds: string[],
  options: ExpandClipIdsOptions = {},
): string[] {
  const clips = getAllClips(project);
  const ids = new Set(clipIds.filter(Boolean));
  const includeLinked = options.includeLinked ?? true;
  const includeGrouped = options.includeGrouped ?? true;
  let changed = true;

  while (changed) {
    changed = false;
    const activeGroupIds = new Set(clips
      .filter((clip) => ids.has(clip.id))
      .flatMap((clip) => getClipGroupIds(clip)));

    for (const clip of clips) {
      const linkedVideoId = getLinkedVideoClipId(clip);
      const detachedAudioId = getDetachedAudioClipId(clip);
      const shouldAddLinkedClip = includeLinked && Boolean(
        (linkedVideoId && ids.has(linkedVideoId)) ||
        (detachedAudioId && ids.has(detachedAudioId)),
      );
      const shouldAddGroupedClip = includeGrouped && getClipGroupIds(clip).some((groupId) => activeGroupIds.has(groupId));
      const shouldAddClip = ids.has(clip.id) || shouldAddLinkedClip || shouldAddGroupedClip;

      if (shouldAddClip && !ids.has(clip.id)) {
        ids.add(clip.id);
        changed = true;
      }

      if (includeLinked && ids.has(clip.id)) {
        for (const linkedId of [linkedVideoId, detachedAudioId]) {
          if (linkedId && !ids.has(linkedId)) {
            ids.add(linkedId);
            changed = true;
          }
        }
      }
    }
  }

  return clips.filter((clip) => ids.has(clip.id)).map((clip) => clip.id);
}

export function groupClips(
  project: EditorProject,
  clipIds: string[],
  options: GroupClipsOptions = {},
): EditorProject {
  const targetIds = new Set(expandClipIdsWithLinkedAndGroupedClips(project, clipIds, {
    includeLinked: options.includeLinked ?? true,
    includeGrouped: true,
  }));
  if (targetIds.size < 2) {
    throw new Error('Select at least two clips to group.');
  }

  const groupTag = buildClipGroupTag(options.groupId ?? `group-${Date.now()}`);
  let updated = 0;

  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (!targetIds.has(clip.id)) {
        return clip;
      }

      if (track.locked || clip.locked) {
        throw new Error('Cannot group locked tracks or clips.');
      }

      updated += 1;
      return {
        ...clip,
        automationTags: withUniqueTags(withoutClipGroupTags(clip.automationTags), [groupTag]),
      };
    }),
  }));

  if (updated < 2) {
    throw new Error('Select at least two clips to group.');
  }

  return touchProject({
    ...project,
    tracks,
  });
}

export function ungroupClips(
  project: EditorProject,
  clipIds: string[],
  options: GroupClipsOptions = {},
): EditorProject {
  const targetIds = new Set(expandClipIdsWithLinkedAndGroupedClips(project, clipIds, {
    includeLinked: options.includeLinked ?? true,
    includeGrouped: true,
  }));
  if (targetIds.size === 0) {
    throw new Error('Select a grouped clip first.');
  }

  let found = false;
  let updated = false;
  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (!targetIds.has(clip.id)) {
        return clip;
      }

      found = true;
      if (track.locked || clip.locked) {
        throw new Error('Cannot ungroup locked tracks or clips.');
      }

      const automationTags = withoutClipGroupTags(clip.automationTags);
      if (automationTags.length === clip.automationTags.length) {
        return clip;
      }

      updated = true;
      return {
        ...clip,
        automationTags,
      };
    }),
  }));

  if (!found) {
    throw new Error('Clip not found.');
  }

  if (!updated) {
    throw new Error('Selected clips are not grouped.');
  }

  return touchProject({
    ...project,
    tracks,
  });
}

export function findClipIdsRelativeToTime(
  project: EditorProject,
  time: number,
  options: SelectClipsRelativeToTimeOptions,
): string[] {
  const targetTime = roundTime(Math.max(0, time));
  const includeLinked = options.includeLinked ?? true;
  const includeGrouped = options.includeGrouped ?? true;
  const includeLocked = options.includeLocked ?? false;
  const sourceTrackIds = new Set(options.trackId ? [options.trackId] : project.tracks.map((track) => track.id));
  const selectableTrackIds = new Set(
    project.tracks
      .filter((track) => sourceTrackIds.has(track.id) && (includeLocked || !track.locked))
      .map((track) => track.id),
  );

  const clipById = new Map<string, { clip: TimelineClip; track: TimelineTrack }>();
  const sourceClipIds = project.tracks.flatMap((track) => (
    track.clips
      .filter((clip) => {
        clipById.set(clip.id, { clip, track });

        if (!selectableTrackIds.has(track.id) || (!includeLocked && clip.locked)) {
          return false;
        }

        const clipEnd = roundTime(clip.start + clip.duration);
        return options.direction === 'right'
          ? clipEnd > targetTime + 0.001
          : clip.start < targetTime - 0.001;
      })
      .map((clip) => clip.id)
  ));

  const selectedIds = new Set(
    includeLinked || includeGrouped
      ? expandClipIdsWithLinkedAndGroupedClips(project, sourceClipIds, { includeLinked, includeGrouped })
      : sourceClipIds,
  );
  return project.tracks.flatMap((track) => (
    track.clips
      .filter((clip) => {
        if (!selectedIds.has(clip.id)) {
          return false;
        }

        if (includeLocked) {
          return true;
        }

        const entry = clipById.get(clip.id);
        return Boolean(entry && !entry.track.locked && !entry.clip.locked);
      })
      .map((clip) => clip.id)
  ));
}

export function findClipIdsAtTime(
  project: EditorProject,
  time: number,
  options: SelectClipsAtTimeOptions = {},
): string[] {
  const targetTime = roundTime(Math.max(0, time));
  const includeLinked = options.includeLinked ?? true;
  const includeGrouped = options.includeGrouped ?? true;
  const includeLocked = options.includeLocked ?? false;
  const sourceTrackIds = new Set(options.trackId ? [options.trackId] : project.tracks.map((track) => track.id));
  const clipById = new Map<string, { clip: TimelineClip; track: TimelineTrack }>();
  const sourceClipIds = project.tracks.flatMap((track) => (
    track.clips
      .filter((clip) => {
        clipById.set(clip.id, { clip, track });

        if (!sourceTrackIds.has(track.id) || (!includeLocked && (track.locked || clip.locked))) {
          return false;
        }

        const clipEnd = roundTime(clip.start + clip.duration);
        return targetTime >= clip.start - 0.001 && targetTime < clipEnd - 0.001;
      })
      .map((clip) => clip.id)
  ));

  const selectedIds = new Set(
    includeLinked || includeGrouped
      ? expandClipIdsWithLinkedAndGroupedClips(project, sourceClipIds, { includeLinked, includeGrouped })
      : sourceClipIds,
  );
  return project.tracks.flatMap((track) => (
    track.clips
      .filter((clip) => {
        if (!selectedIds.has(clip.id)) {
          return false;
        }

        if (includeLocked) {
          return true;
        }

        const entry = clipById.get(clip.id);
        return Boolean(entry && !entry.track.locked && !entry.clip.locked);
      })
      .map((clip) => clip.id)
  ));
}

export function findClipIdsInRange(
  project: EditorProject,
  range: TimelineRange,
  options: SelectClipsInRangeOptions = {},
): string[] {
  const rangeStart = roundTime(Math.max(0, Math.min(range.start, range.end)));
  const rangeEnd = roundTime(Math.max(rangeStart, Math.max(range.start, range.end)));
  if (rangeEnd <= rangeStart) {
    return [];
  }

  const includeLinked = options.includeLinked ?? true;
  const includeGrouped = options.includeGrouped ?? true;
  const includeLocked = options.includeLocked ?? false;
  const sourceTrackIds = new Set(options.trackId ? [options.trackId] : project.tracks.map((track) => track.id));
  const clipById = new Map<string, { clip: TimelineClip; track: TimelineTrack }>();
  const sourceClipIds = project.tracks.flatMap((track) => (
    track.clips
      .filter((clip) => {
        clipById.set(clip.id, { clip, track });

        if (!sourceTrackIds.has(track.id) || (!includeLocked && (track.locked || clip.locked))) {
          return false;
        }

        const clipEnd = roundTime(clip.start + clip.duration);
        return options.mode === 'contained'
          ? clip.start >= rangeStart - 0.001 && clipEnd <= rangeEnd + 0.001
          : clip.start < rangeEnd - 0.001 && clipEnd > rangeStart + 0.001;
      })
      .map((clip) => clip.id)
  ));

  const selectedIds = new Set(
    includeLinked || includeGrouped
      ? expandClipIdsWithLinkedAndGroupedClips(project, sourceClipIds, { includeLinked, includeGrouped })
      : sourceClipIds,
  );
  return project.tracks.flatMap((track) => (
    track.clips
      .filter((clip) => {
        if (!selectedIds.has(clip.id)) {
          return false;
        }

        if (includeLocked) {
          return true;
        }

        const entry = clipById.get(clip.id);
        return Boolean(entry && !entry.track.locked && !entry.clip.locked);
      })
      .map((clip) => clip.id)
  ));
}

export function findAdjacentEditPoint(
  project: EditorProject,
  time: number,
  options: AdjacentEditPointOptions,
): number | undefined {
  const targetTime = roundTime(Math.max(0, time));
  const includeLocked = options.includeLocked ?? false;
  const targetTrackIds = new Set(options.trackId ? [options.trackId] : project.tracks.map((track) => track.id));
  const editPoints = new Set<number>();

  for (const track of project.tracks) {
    if (!targetTrackIds.has(track.id) || (!includeLocked && track.locked)) {
      continue;
    }

    for (const clip of track.clips) {
      if (!includeLocked && clip.locked) {
        continue;
      }

      editPoints.add(roundTime(clip.start));
      editPoints.add(roundTime(clip.start + clip.duration));
    }
  }

  const sortedPoints = Array.from(editPoints).sort((a, b) => a - b);
  if (options.direction === 'previous') {
    return sortedPoints.filter((point) => point < targetTime - 0.001).at(-1);
  }

  return sortedPoints.find((point) => point > targetTime + 0.001);
}

export function findClipSelectionRange(
  project: EditorProject,
  clipIds: string[],
  options: ClipSelectionRangeOptions = {},
): TimelineRange | undefined {
  const includeLinked = options.includeLinked ?? true;
  const includeGrouped = options.includeGrouped ?? true;
  const includeLocked = options.includeLocked ?? false;
  const selectedIds = new Set(
    includeLinked || includeGrouped
      ? expandClipIdsWithLinkedAndGroupedClips(project, clipIds, { includeLinked, includeGrouped })
      : clipIds,
  );
  const clips = project.tracks.flatMap((track) => (
    track.clips.filter((clip) => (
      selectedIds.has(clip.id) &&
      (includeLocked || (!track.locked && !clip.locked))
    ))
  ));

  if (clips.length === 0) {
    return undefined;
  }

  return {
    start: roundTime(Math.min(...clips.map((clip) => clip.start))),
    end: roundTime(Math.max(...clips.map((clip) => clip.start + clip.duration))),
  };
}

export function copyClipsInRange(
  project: EditorProject,
  range: TimelineRange,
  options: CopyClipsInRangeOptions = {},
): TimelineClip[] {
  const rangeStart = roundTime(Math.max(0, Math.min(range.start, range.end)));
  const rangeEnd = roundTime(Math.max(rangeStart, Math.max(range.start, range.end)));
  if (rangeEnd <= rangeStart) {
    return [];
  }

  const includeLinked = options.includeLinked ?? true;
  const includeLocked = options.includeLocked ?? false;
  const sourceTrackIds = new Set(options.trackIds ?? project.tracks.map((track) => track.id));
  const sourceIds = project.tracks.flatMap((track) => {
    if (!sourceTrackIds.has(track.id) || (!includeLocked && track.locked)) {
      return [];
    }

    return track.clips.flatMap((clip) => {
      if (!includeLocked && clip.locked) {
        return [];
      }

      const clipEnd = roundTime(clip.start + clip.duration);
      return clip.start < rangeEnd - 0.001 && clipEnd > rangeStart + 0.001
        ? [clip.id]
        : [];
    });
  });
  const copyIds = new Set(sourceIds);
  if (includeLinked) {
    for (const linkedId of expandClipIdsWithLinkedClips(project, sourceIds)) {
      copyIds.add(linkedId);
    }
  }

  const copiedClips = project.tracks.flatMap((track) => {
    if (!includeLocked && track.locked) {
      return [];
    }

    return track.clips.flatMap((clip) => {
      if (!copyIds.has(clip.id) || (!includeLocked && clip.locked)) {
        return [];
      }

      const clipStart = roundTime(clip.start);
      const clipEnd = roundTime(clip.start + clip.duration);
      const sliceStart = roundTime(Math.max(rangeStart, clipStart));
      const sliceEnd = roundTime(Math.min(rangeEnd, clipEnd));
      const duration = roundTime(sliceEnd - sliceStart);
      if (duration < MIN_CLIP_DURATION) {
        return [];
      }

      const segmentStart = roundTime(sliceStart - clipStart);
      return [{
        ...clip,
        id: `${clip.id}-range-copy-${Math.round(rangeStart * 1000)}-${Math.round(rangeEnd * 1000)}`,
        start: roundTime(sliceStart - rangeStart),
        duration,
        sourceIn: sourceInForClipSegment(clip, segmentStart, duration),
        freezeFrameTime: sliceClipFreezeFrameTime(clip, segmentStart, duration),
        locked: false,
        keyframes: sliceClipKeyframes(clip, segmentStart, duration, '-range-copy'),
      }];
    });
  }).sort((a, b) => a.start - b.start);

  const copiedEntries = copiedClips.map((clip) => {
    const sourceId = clip.id.replace(/-range-copy-\d+-\d+$/, '');
    return { sourceId, clip };
  });
  relinkCopiedClipsInPlace(copiedEntries);

  return copiedClips;
}

export function cutClipsInRange(
  project: EditorProject,
  range: TimelineRange,
  options: CutClipsInRangeOptions = {},
): CutClipsInRangeResult {
  const clips = copyClipsInRange(project, range, options);
  if (clips.length === 0) {
    return { project, clips: [] };
  }

  const trackIds = Array.from(new Set(clips.map((clip) => clip.trackId)));
  return {
    clips,
    project: deleteRange(project, range.start, range.end, {
      trackIds,
      ripple: options.ripple,
    }),
  };
}

export function splitClip(project: EditorProject, clipId: string, offsetSeconds: number): EditorProject {
  const updatedTracks = project.tracks.map((track) => {
    const clipIndex = track.clips.findIndex((clip) => clip.id === clipId);
    if (clipIndex === -1) {
      return track;
    }

    const clip = track.clips[clipIndex];
    if (track.locked || clip.locked) {
      throw new Error('Cannot split a locked track or clip.');
    }

    if (offsetSeconds <= 0 || offsetSeconds >= clip.duration) {
      throw new Error('Split point must be inside the clip duration.');
    }

    const { left: leftClip, right: rightClip } = splitTimelineClip(clip, offsetSeconds);

    const clips = [...track.clips];
    clips.splice(clipIndex, 1, leftClip, rightClip);

    return {
      ...track,
      clips,
    };
  });

  return touchProject({
    ...project,
    tracks: updatedTracks,
  });
}

export function splitClipAtTime(project: EditorProject, clipId: string, timelineTime: number): EditorProject {
  const clip = findClip(project, clipId);
  if (!clip) {
    throw new Error('Clip not found.');
  }

  const offset = roundTime(timelineTime - clip.start);
  return splitClip(project, clipId, offset);
}

export function splitLinkedClipAtTime(project: EditorProject, clipId: string, timelineTime: number): EditorProject {
  const linkedIds = expandClipIdsWithLinkedClips(project, [clipId]);
  if (linkedIds.length <= 1) {
    return splitClipAtTime(project, clipId, timelineTime);
  }

  const linkedItems = project.tracks.flatMap((track) => (
    track.clips
      .filter((clip) => linkedIds.includes(clip.id))
      .map((clip) => ({ track, clip }))
  ));

  if (linkedItems.length === 0) {
    throw new Error('Clip not found.');
  }

  if (linkedItems.some(({ track, clip }) => track.locked || clip.locked)) {
    throw new Error('Cannot split a locked track or clip.');
  }

  if (linkedItems.some(({ clip }) => timelineTime <= clip.start || timelineTime >= clip.start + clip.duration)) {
    throw new Error('Linked clips must overlap the split time.');
  }

  const splitByOriginalId = new Map<string, { left: TimelineClip; right: TimelineClip }>();
  for (const { clip } of linkedItems) {
    splitByOriginalId.set(clip.id, splitTimelineClip(clip, roundTime(timelineTime - clip.start)));
  }

  const relinkedSplits = new Map<string, { left: TimelineClip; right: TimelineClip }>();
  for (const [originalId, split] of splitByOriginalId) {
    relinkedSplits.set(originalId, relinkSplitClipPair(split, splitByOriginalId));
  }

  const nextTracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.flatMap((clip) => {
      const split = relinkedSplits.get(clip.id);
      return split ? [split.left, split.right] : [clip];
    }).sort((a, b) => a.start - b.start),
  }));

  return touchProject({
    ...project,
    tracks: nextTracks,
  });
}

export function splitClipsAtTime(project: EditorProject, clipIds: string[], timelineTime: number): EditorProject {
  const expandedIds = new Set(expandClipIdsWithLinkedClips(project, clipIds));
  if (expandedIds.size === 0) {
    return project;
  }

  const splitItems = project.tracks.flatMap((track) => (
    track.clips
      .filter((clip) => expandedIds.has(clip.id) && timelineTime > clip.start && timelineTime < clip.start + clip.duration)
      .map((clip) => ({ track, clip }))
  ));

  if (splitItems.length === 0) {
    throw new Error('No selected clips overlap the split time.');
  }

  if (splitItems.some(({ track, clip }) => track.locked || clip.locked)) {
    throw new Error('Cannot split a locked track or clip.');
  }

  const splitIds = new Set(splitItems.map(({ clip }) => clip.id));
  for (const { clip } of splitItems) {
    const linkedIds = expandClipIdsWithLinkedClips(project, [clip.id]);
    if (linkedIds.length > 1 && linkedIds.some((linkedId) => expandedIds.has(linkedId) && !splitIds.has(linkedId))) {
      throw new Error('Linked clips must overlap the split time.');
    }
  }

  const splitByOriginalId = new Map<string, { left: TimelineClip; right: TimelineClip }>();
  for (const { clip } of splitItems) {
    splitByOriginalId.set(clip.id, splitTimelineClip(clip, roundTime(timelineTime - clip.start)));
  }

  const relinkedSplits = new Map<string, { left: TimelineClip; right: TimelineClip }>();
  for (const [originalId, split] of splitByOriginalId) {
    relinkedSplits.set(originalId, relinkSplitClipPair(split, splitByOriginalId));
  }

  const nextTracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.flatMap((clip) => {
      const split = relinkedSplits.get(clip.id);
      return split ? [split.left, split.right] : [clip];
    }).sort((a, b) => a.start - b.start),
  }));

  return touchProject({
    ...project,
    tracks: nextTracks,
  });
}

export function splitAllClipsAtTime(
  project: EditorProject,
  timelineTime: number,
  options: { trackIds?: string[] } = {},
): EditorProject {
  const targetTrackIds = options.trackIds ? new Set(options.trackIds) : undefined;
  const clipIds = project.tracks.flatMap((track) => {
    if ((targetTrackIds && !targetTrackIds.has(track.id)) || track.locked) {
      return [];
    }

    return track.clips
      .filter((clip) => !clip.locked && timelineTime > clip.start && timelineTime < clip.start + clip.duration)
      .map((clip) => clip.id);
  });

  if (clipIds.length === 0) {
    throw new Error('No unlocked clips overlap the split time.');
  }

  return splitClipsAtTime(project, clipIds, timelineTime);
}

export function updateClip(project: EditorProject, clipId: string, patch: EditableClipPatch): EditorProject {
  let updatedClip: TimelineClip | undefined;

  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (clip.id !== clipId) {
        return clip;
      }

      const unlockOnly = clip.locked && patch.locked === false && Object.keys(patch).every((key) => key === 'locked');
      if (track.locked || (clip.locked && !unlockOnly)) {
        throw new Error('Cannot edit a locked track or clip.');
      }

      if (patch.name !== undefined && patch.name.trim().length === 0) {
        throw new Error('Clip name cannot be empty.');
      }

      const nextClip: TimelineClip = {
        ...clip,
        ...patch,
        name: patch.name === undefined ? clip.name : patch.name.trim(),
        color: patch.color === undefined ? clip.color : normalizeClipColor(patch.color, clip.color),
        start: patch.start === undefined ? clip.start : roundTime(Math.max(0, patch.start)),
        duration: patch.duration === undefined ? clip.duration : roundTime(Math.max(MIN_CLIP_DURATION, patch.duration)),
        sourceIn: patch.sourceIn === undefined ? clip.sourceIn : roundTime(Math.max(0, patch.sourceIn)),
        speed: patch.speed === undefined ? clip.speed : clamp(patch.speed, 0.05, 8),
        speedRamp: patch.speed === undefined ? clip.speedRamp : undefined,
        freezeFrameTime: Object.prototype.hasOwnProperty.call(patch, 'freezeFrameTime')
          ? normalizeFreezeFrameTime({ ...clip, duration: patch.duration === undefined ? clip.duration : roundTime(Math.max(MIN_CLIP_DURATION, patch.duration)) }, patch.freezeFrameTime)
          : normalizeFreezeFrameTime({ ...clip, duration: patch.duration === undefined ? clip.duration : roundTime(Math.max(MIN_CLIP_DURATION, patch.duration)) }, clip.freezeFrameTime),
        volume: patch.volume === undefined ? clip.volume : normalizeClipVolume(patch.volume),
        opacity: patch.opacity === undefined ? clip.opacity : clamp(patch.opacity, 0, 1),
      };
      nextClip.keyframes = reconcileKeyframesForClipUpdate(clip, nextClip, patch);

      updatedClip = nextClip;
      return nextClip;
    }).sort((a, b) => a.start - b.start),
  }));

  if (!updatedClip) {
    throw new Error('Clip not found.');
  }

  return touchProject({
    ...project,
    tracks,
    duration: Math.max(project.duration, updatedClip.start + updatedClip.duration),
  });
}

export function updateClips(
  project: EditorProject,
  clipIds: string[],
  patch: BatchEditableClipPatch,
  options: ExpandClipIdsOptions = {},
): EditorProject {
  const requestedIds = clipIds.filter(Boolean);
  if (requestedIds.length === 0) {
    throw new Error('No target clips selected.');
  }

  const targetIds = new Set(expandClipIdsWithLinkedAndGroupedClips(project, requestedIds, options));
  if (targetIds.size === 0) {
    throw new Error('Target clip not found.');
  }

  let found = false;
  let updated = false;
  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (!targetIds.has(clip.id)) {
        return clip;
      }

      found = true;
      if (track.locked || clip.locked) {
        throw new Error('Cannot edit a locked track or clip.');
      }

      const nextClip: TimelineClip = {
        ...clip,
        color: patch.color === undefined ? clip.color : normalizeClipColor(patch.color, clip.color),
        volume: patch.volume === undefined ? clip.volume : normalizeClipVolume(patch.volume),
        opacity: patch.opacity === undefined ? clip.opacity : clamp(patch.opacity, 0, 1),
        blendMode: patch.blendMode === undefined ? clip.blendMode : patch.blendMode,
        reversed: patch.reversed === undefined ? clip.reversed : patch.reversed,
      };

      if (
        nextClip.color === clip.color &&
        nextClip.volume === clip.volume &&
        nextClip.opacity === clip.opacity &&
        nextClip.blendMode === clip.blendMode &&
        nextClip.reversed === clip.reversed
      ) {
        return clip;
      }

      updated = true;
      return nextClip;
    }),
  }));

  if (!found) {
    throw new Error('Target clip not found.');
  }

  if (!updated) {
    return project;
  }

  return touchProject({
    ...project,
    tracks,
  });
}

export function setClipsState(
  project: EditorProject,
  clipIds: string[],
  state: EditableClipState,
  value: boolean,
  options: ExpandClipIdsOptions = {},
): EditorProject {
  const targetIds = new Set(expandClipIdsWithLinkedAndGroupedClips(project, clipIds, options));
  if (targetIds.size === 0) {
    throw new Error('No target clips selected.');
  }

  let found = false;
  let updated = false;
  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (!targetIds.has(clip.id)) {
        return clip;
      }

      found = true;
      if (track.locked) {
        throw new Error('Cannot update clips on a locked track.');
      }

      if (state !== 'locked' && clip.locked) {
        throw new Error('Cannot update a locked clip.');
      }

      if (Boolean(clip[state]) === value) {
        return clip;
      }

      updated = true;
      return {
        ...clip,
        [state]: value,
      };
    }),
  }));

  if (!found) {
    throw new Error('Target clip not found.');
  }

  if (!updated) {
    return project;
  }

  return touchProject({
    ...project,
    tracks,
  });
}

export function toggleClipsState(
  project: EditorProject,
  clipIds: string[],
  state: EditableClipState,
  options: ExpandClipIdsOptions = {},
): EditorProject {
  const targetIds = new Set(expandClipIdsWithLinkedAndGroupedClips(project, clipIds, options));
  const clips = getAllClips(project).filter((clip) => targetIds.has(clip.id));
  if (clips.length === 0) {
    throw new Error('Target clip not found.');
  }

  const nextValue = !clips.every((clip) => Boolean(clip[state]));
  return setClipsState(project, [...targetIds], state, nextValue, {
    includeLinked: false,
    includeGrouped: false,
  });
}

export function copyClipAttributes(project: EditorProject, clipId: string): ClipAttributeClipboard {
  const clip = findClip(project, clipId);
  if (!clip) {
    throw new Error('Clip not found.');
  }

  return {
    sourceClipId: clip.id,
    sourceClipName: clip.name,
    sourceDuration: clip.duration,
    volume: clip.volume,
    opacity: clip.opacity,
    blendMode: clip.blendMode,
    muted: clip.muted,
    effects: cloneClipEffects(clip.effects),
    keyframes: cloneClipKeyframes(clip.keyframes),
  };
}

export function pasteClipAttributes(
  project: EditorProject,
  attributes: ClipAttributeClipboard,
  targetClipIds: string[],
  options: PasteClipAttributesOptions = {},
): EditorProject {
  const targetIds = new Set(targetClipIds);
  if (targetIds.size === 0) {
    throw new Error('No target clips selected.');
  }

  let clipFound = false;
  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (!targetIds.has(clip.id)) {
        return clip;
      }

      clipFound = true;
      if (track.locked || clip.locked) {
        throw new Error('Cannot paste attributes to a locked track or clip.');
      }

      const nextClip: TimelineClip = { ...clip };
      if (options.includeBasicProperties !== false) {
        nextClip.volume = clamp(attributes.volume, 0, 2);
        nextClip.opacity = clamp(attributes.opacity, 0, 1);
        nextClip.blendMode = attributes.blendMode;
        nextClip.muted = attributes.muted;
      }

      if (options.includeEffects !== false) {
        nextClip.effects = clonePastedEffects(attributes.effects, clip.id);
      }

      if (options.includeKeyframes !== false) {
        nextClip.keyframes = clonePastedKeyframes(attributes, clip, options);
      }

      return nextClip;
    }),
  }));

  if (!clipFound) {
    throw new Error('Target clip not found.');
  }

  return touchProject({
    ...project,
    tracks,
  });
}

export function replaceClipSource(
  project: EditorProject,
  clipId: string,
  assetId: string,
  options: ReplaceClipSourceOptions = {},
): EditorProject {
  const targetTrack = findTrackForClip(project, clipId);
  const targetClip = targetTrack?.clips.find((clip) => clip.id === clipId);
  const asset = project.assets.find((item) => item.id === assetId);
  if (!targetTrack || !targetClip) {
    throw new Error('Clip not found.');
  }

  if (!asset) {
    throw new Error('Replacement asset not found.');
  }

  const targetClipAsset = targetClip.assetId ? project.assets.find((item) => item.id === targetClip.assetId) : undefined;

  if (targetTrack.locked || targetClip.locked) {
    throw new Error('Cannot replace source on a locked track or clip.');
  }

  const linkedVideoId = getLinkedVideoClipId(targetClip);
  const videoClip = linkedVideoId ? findClip(project, linkedVideoId) : targetClip;
  const videoTrack = videoClip ? findTrackForClip(project, videoClip.id) : undefined;
  const detachedAudioId = videoClip ? getDetachedAudioClipId(videoClip) : undefined;
  const audioTrack = detachedAudioId ? findTrackForClip(project, detachedAudioId) : undefined;
  const audioClip = audioTrack?.clips.find((clip) => clip.id === detachedAudioId);

  if (resolveRenderableAssetMediaKind(asset) === 'audio') {
    const targetClipIsAudio = targetClip.kind === 'audio' || resolveRenderableAssetMediaKind(targetClipAsset) === 'audio';
    if (!targetClipIsAudio || targetTrack.kind !== 'audio') {
      throw new Error('Audio assets can only replace audio clips.');
    }

    const range = normalizeReplacementRange(asset, targetClip, options);
    return replaceClipsById(project, new Map([[
      targetClip.id,
      {
        ...targetClip,
        assetId: asset.id,
        name: asset.name,
        kind: 'audio',
        sourceIn: range.sourceIn,
        duration: range.duration,
        freezeFrameTime: undefined,
        speedRamp: undefined,
        keyframes: sliceClipKeyframes(targetClip, 0, range.duration, '-replace-source'),
      },
    ]]));
  }

  if (!videoClip || !videoTrack || videoClip.kind === 'audio' || trackKindForAsset(asset) !== videoTrack.kind) {
    throw new Error('Replacement asset kind does not match the selected clip track.');
  }

  if (videoTrack.locked || videoClip.locked || audioTrack?.locked || audioClip?.locked) {
    throw new Error('Cannot replace linked source through a locked track or clip.');
  }

  const range = normalizeReplacementRange(asset, videoClip, options);
  const hasReplacementAudio = hasEmbeddedAudio(asset);
  const nextVideoClip: TimelineClip = {
    ...videoClip,
    assetId: asset.id,
    name: asset.name,
    kind: asset.kind,
    sourceIn: range.sourceIn,
    duration: range.duration,
    freezeFrameTime: resolveRenderableAssetMediaKind(asset) === 'video' ? normalizeFreezeFrameTime({ ...videoClip, duration: range.duration }, videoClip.freezeFrameTime) : undefined,
    speedRamp: undefined,
    keyframes: sliceClipKeyframes(videoClip, 0, range.duration, '-replace-source'),
    automationTags: audioClip
      ? hasReplacementAudio
        ? withUniqueTags(videoClip.automationTags, [EMBEDDED_AUDIO_DISABLED_TAG, buildDetachedAudioTag(audioClip.id)])
        : stripClipLinkTags(videoClip.automationTags, { preserveEmbeddedAudioDisabled: false })
      : videoClip.automationTags,
  };

  if (!audioClip) {
    return replaceClipsById(project, new Map([[videoClip.id, nextVideoClip]]));
  }

  if (!hasReplacementAudio) {
    const nextTracks = project.tracks.map((track) => ({
      ...track,
      clips: track.clips
        .flatMap((clip) => {
          if (clip.id === videoClip.id) {
            return [nextVideoClip];
          }

          if (clip.id === audioClip.id) {
            return [];
          }

          return [clip];
        })
        .sort((a, b) => a.start - b.start),
    }));

    return touchProject({
      ...project,
      tracks: nextTracks,
      duration: durationForTracks(nextTracks, project.duration),
    });
  }

  const nextAudioClip: TimelineClip = {
    ...audioClip,
    assetId: asset.id,
    name: `${asset.name} audio`,
    kind: 'audio',
    sourceIn: range.sourceIn,
    duration: range.duration,
    speedRamp: undefined,
    keyframes: sliceClipKeyframes(audioClip, 0, range.duration, '-replace-source'),
    automationTags: withUniqueTags(audioClip.automationTags, ['detached-audio', buildLinkedVideoTag(videoClip.id)]),
  };

  return replaceClipsById(project, new Map([
    [videoClip.id, nextVideoClip],
    [audioClip.id, nextAudioClip],
  ]));
}

export function applySpeedRampPreset(project: EditorProject, clipId: string, presetId: SpeedRampPresetId): EditorProject {
  return updateClipById(project, clipId, (track, clip) => ({
    ...clip,
    speedRamp: buildSpeedRampFromPreset(clip, presetId),
  }));
}

export function applySpeedRampPresetToClips(
  project: EditorProject,
  clipIds: string[],
  presetId: SpeedRampPresetId,
): ClipBatchEditResult {
  const requestedIds = clipIds.filter(Boolean);
  if (requestedIds.length === 0) {
    throw new Error('No target clips selected.');
  }

  const targetIds = expandClipIdsWithLinkedAndGroupedClips(project, requestedIds);
  if (targetIds.length === 0) {
    throw new Error('Target clip not found.');
  }

  let nextProject = project;
  const updatedClipIds: string[] = [];

  for (const clipId of targetIds) {
    nextProject = applySpeedRampPreset(nextProject, clipId, presetId);
    updatedClipIds.push(clipId);
  }

  return {
    project: nextProject,
    updatedClipIds,
    skipped: [],
  };
}

export function clearSpeedRamp(project: EditorProject, clipId: string): EditorProject {
  return updateClipById(project, clipId, (_track, clip) => ({
    ...clip,
    speedRamp: undefined,
  }));
}

export function clearSpeedRampFromClips(
  project: EditorProject,
  clipIds: string[],
): ClipBatchEditResult {
  const requestedIds = clipIds.filter(Boolean);
  if (requestedIds.length === 0) {
    throw new Error('No target clips selected.');
  }

  const targetIds = expandClipIdsWithLinkedAndGroupedClips(project, requestedIds);
  if (targetIds.length === 0) {
    throw new Error('Target clip not found.');
  }

  let nextProject = project;
  const updatedClipIds: string[] = [];

  for (const clipId of targetIds) {
    nextProject = clearSpeedRamp(nextProject, clipId);
    updatedClipIds.push(clipId);
  }

  return {
    project: nextProject,
    updatedClipIds,
    skipped: [],
  };
}

function updateClipById(
  project: EditorProject,
  clipId: string,
  update: (track: TimelineTrack, clip: TimelineClip) => TimelineClip,
): EditorProject {
  let updatedClip: TimelineClip | undefined;
  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (clip.id !== clipId) {
        return clip;
      }

      if (track.locked || clip.locked) {
        throw new Error('Cannot edit a locked track or clip.');
      }

      updatedClip = update(track, clip);
      return updatedClip;
    }).sort((a, b) => a.start - b.start),
  }));

  if (!updatedClip) {
    throw new Error('Clip not found.');
  }

  return touchProject({
    ...project,
    tracks,
    duration: Math.max(project.duration, updatedClip.start + updatedClip.duration),
  });
}

export function retimeClipToSpeed(
  project: EditorProject,
  clipId: string,
  speed: number,
  options: RetimeClipOptions = {},
): EditorProject {
  return retimeClipsToSpeed(project, [clipId], speed, options, clipId);
}

export function retimeLinkedClipToSpeed(
  project: EditorProject,
  clipId: string,
  speed: number,
  options: RetimeClipOptions = {},
): EditorProject {
  const linkedIds = expandClipIdsWithLinkedClips(project, [clipId]);
  return retimeClipsToSpeed(project, linkedIds.length > 0 ? linkedIds : [clipId], speed, options, clipId);
}

interface RetimeClipContext {
  trackId: string;
  clipId: string;
  originalEnd: number;
  nextEnd: number;
  delta: number;
  downstreamClipIds: string[];
}

function retimeClipsToSpeed(
  project: EditorProject,
  clipIds: string[],
  speed: number,
  options: RetimeClipOptions,
  primaryClipId: string,
): EditorProject {
  const ids = new Set(clipIds);
  if (ids.size === 0) {
    throw new Error('Select at least one clip.');
  }

  const items = project.tracks.flatMap((track) => (
    track.clips
      .filter((clip) => ids.has(clip.id))
      .map((clip) => ({ track, clip }))
  ));
  if (items.length === 0) {
    throw new Error('Clip not found.');
  }

  if (items.some(({ track, clip }) => track.locked || clip.locked)) {
    throw new Error('Cannot retime a locked track or clip.');
  }

  const targetSpeed = roundTime(clamp(speed, 0.05, 8));
  const retimedById = new Map<string, TimelineClip>();
  const contexts: RetimeClipContext[] = [];

  for (const { track, clip } of items) {
    const retimedClip = buildRetimedClipForSpeed(clip, targetSpeed);
    if (!options.ripple && options.preventOverlap !== false) {
      assertRetimedClipDoesNotOverlap(track, clip, retimedClip, ids);
    }

    retimedById.set(clip.id, retimedClip);
    contexts.push(buildRetimeClipContext(track, clip, retimedClip, ids));
  }

  const primaryContext = contexts.find((context) => context.clipId === primaryClipId) ?? contexts[0];
  const retimedTrackIds = new Set(contexts.map((context) => context.trackId));
  if (options.ripple) {
    assertRetimeRippleUnlocked(project, contexts, primaryContext, retimedTrackIds);
  }

  const nextTracks = project.tracks.map((track) => {
    const trackContexts = contexts.filter((context) => context.trackId === track.id);
    const syncLockShift = options.ripple && track.syncLocked && !retimedTrackIds.has(track.id) && primaryContext
      ? primaryContext.delta
      : 0;

    return {
      ...track,
      clips: track.clips.map((clip) => {
        let nextClip = retimedById.get(clip.id) ?? clip;
        const rippleShift = options.ripple
          ? trackContexts.reduce((total, context) => (
            context.downstreamClipIds.includes(clip.id)
              ? roundTime(total + context.delta)
              : total
          ), 0)
          : 0;
        const syncShift = syncLockShift !== 0 && primaryContext && clip.start >= primaryContext.originalEnd
          ? syncLockShift
          : 0;
        const totalShift = roundTime(rippleShift + syncShift);

        if (Math.abs(totalShift) > 0.001) {
          nextClip = {
            ...nextClip,
            start: roundTime(Math.max(0, nextClip.start + totalShift)),
          };
        }

        return nextClip;
      }).sort((a, b) => a.start - b.start),
    };
  });

  return touchProject({
    ...project,
    tracks: nextTracks,
    duration: durationForTracks(nextTracks, project.duration),
    ...(options.ripple && primaryContext ? buildRetimeAnnotationPatch(project, primaryContext) : {}),
  });
}

export function insertAssetOnTimeline(
  project: EditorProject,
  assetId: string,
  start: number,
  targetTrackId?: string,
): EditorProject {
  return insertAssetRangeOnTimeline(project, assetId, { start, targetTrackId });
}

export function insertAssetRangeOnTimeline(
  project: EditorProject,
  assetId: string,
  options: AssetRangeEditOptions,
): EditorProject {
  const asset = project.assets.find((item) => item.id === assetId);
  if (!asset) {
    throw new Error('Asset not found.');
  }

  const trackKind = trackKindForAsset(asset);
  const { tracks, targetTrack } = ensureEditableTrack(project.tracks, trackKind, options.targetTrackId);
  const clip = createAssetRangeClip(asset, targetTrack.id, options, 'clip');
  const gapTrackIds = options.ripple ? rippleEditTrackIds(tracks, [targetTrack.id]) : new Set([targetTrack.id]);
  const nextTracks = tracks.map((track) => (
    gapTrackIds.has(track.id)
      ? {
        ...track,
        clips: [
          ...(options.ripple ? insertGapIntoTrack(track, clip.start, clip.duration) : track.clips),
          ...(track.id === targetTrack.id ? [clip] : []),
        ].sort((a, b) => a.start - b.start),
      }
      : track
  ));

  return touchProject({
    ...project,
    tracks: nextTracks,
    duration: durationForTracks(nextTracks, project.duration),
    ...(options.ripple ? shiftAnnotationsForInsertedRange(project, clip.start, clip.duration) : {}),
  });
}

export function overwriteAssetRangeOnTimeline(
  project: EditorProject,
  assetId: string,
  options: AssetRangeEditOptions,
): EditorProject {
  const asset = project.assets.find((item) => item.id === assetId);
  if (!asset) {
    throw new Error('Asset not found.');
  }

  const trackKind = trackKindForAsset(asset);
  const { tracks, targetTrack } = ensureEditableTrack(project.tracks, trackKind, options.targetTrackId);
  const clip = createAssetRangeClip(asset, targetTrack.id, options, 'clip-overwrite');
  const endTime = roundTime(clip.start + clip.duration);
  const nextTracks = tracks.map((track) => {
    if (track.id !== targetTrack.id) {
      return track;
    }

    return {
      ...track,
      clips: [
        ...removeTimeRangeFromTrack(track, clip.start, endTime),
        clip,
      ].sort((a, b) => a.start - b.start),
    };
  });

  return touchProject({
    ...project,
    tracks: nextTracks,
    duration: durationForTracks(nextTracks, project.duration),
    ...(options.ripple ? shiftAnnotationsForInsertedRange(project, clip.start, clip.duration) : {}),
  });
}

export function insertAssetPatchOnTimeline(
  project: EditorProject,
  assetId: string,
  options: AssetPatchEditOptions,
): EditorProject {
  return applyAssetPatchEdit(project, assetId, options, 'insert');
}

export function overwriteAssetPatchOnTimeline(
  project: EditorProject,
  assetId: string,
  options: AssetPatchEditOptions,
): EditorProject {
  return applyAssetPatchEdit(project, assetId, options, 'overwrite');
}

export function pasteClipAtTime(
  project: EditorProject,
  sourceClip: TimelineClip,
  start: number,
  targetTrackId?: string,
  options: PasteEditOptions = {},
): EditorProject {
  const trackKind = trackKindForClip(sourceClip, assetForTimelineClip(project, sourceClip));
  const { tracks, targetTrack } = ensureEditableTrack(project.tracks, trackKind, targetTrackId ?? sourceClip.trackId);
  const clip = relinkCopiedClipReferences(
    createPastedClip(sourceClip, targetTrack.id, start, 'clip-paste'),
    new Map(),
  );
  const nextTracks = tracks.map((track) => (
    options.ripple && rippleEditTrackIds(tracks, [targetTrack.id]).has(track.id)
      ? {
        ...track,
        clips: [
          ...(options.ripple ? insertGapIntoTrack(track, clip.start, clip.duration) : track.clips),
          ...(track.id === targetTrack.id ? [clip] : []),
        ].sort((a, b) => a.start - b.start),
      }
      : track.id === targetTrack.id
        ? {
          ...track,
          clips: [...track.clips, clip].sort((a, b) => a.start - b.start),
        }
      : track
  ));

  return touchProject({
    ...project,
    tracks: nextTracks,
    duration: durationForTracks(nextTracks, project.duration),
  });
}

export function pasteClipsAtTime(
  project: EditorProject,
  sourceClips: TimelineClip[],
  start: number,
  targetTrackId?: string,
  options: PasteEditOptions = {},
): EditorProject {
  if (sourceClips.length === 0) {
    return project;
  }

  const sortedClips = [...sourceClips].sort((a, b) => a.start - b.start);
  const firstStart = sortedClips[0].start;

  if (options.ripple) {
    const startTime = roundTime(Math.max(0, start));
    const lastEnd = sortedClips.reduce((maxEnd, clip) => Math.max(maxEnd, clip.start + clip.duration), firstStart);
    const insertDuration = roundTime(Math.max(0, lastEnd - firstStart));
    let workingTracks = project.tracks;
    const pastedByTrackId = new Map<string, TimelineClip[]>();

    const pastedEntries: Array<{ sourceId: string; clip: TimelineClip }> = [];

    sortedClips.forEach((clip, index) => {
      const trackKind = trackKindForClip(clip, assetForTimelineClip(project, clip));
      const { tracks, targetTrack } = ensureEditableTrack(workingTracks, trackKind, targetTrackId ?? clip.trackId);
      workingTracks = tracks;

      const pastedClip = createPastedClip(
        clip,
        targetTrack.id,
        startTime + (clip.start - firstStart),
        `clip-paste-${index}`,
      );
      pastedEntries.push({ sourceId: clip.id, clip: pastedClip });
      pastedByTrackId.set(targetTrack.id, [...(pastedByTrackId.get(targetTrack.id) ?? []), pastedClip]);
    });

    relinkCopiedClipsInPlace(pastedEntries);

    const gapTrackIds = rippleEditTrackIds(workingTracks, Array.from(pastedByTrackId.keys()));
    const nextTracks = workingTracks.map((track) => {
      const pastedClips = pastedByTrackId.get(track.id);
      if (!pastedClips && !gapTrackIds.has(track.id)) {
        return track;
      }

      return {
        ...track,
        clips: [
          ...(gapTrackIds.has(track.id) ? insertGapIntoTrack(track, startTime, insertDuration) : track.clips),
          ...(pastedClips ?? []),
        ].sort((a, b) => a.start - b.start),
      };
    });

    return touchProject({
      ...project,
      tracks: nextTracks,
      duration: durationForTracks(nextTracks, project.duration),
      ...shiftAnnotationsForInsertedRange(project, startTime, insertDuration),
    });
  }

  const startTime = roundTime(Math.max(0, start));
  let workingTracks = project.tracks;
  const pastedByTrackId = new Map<string, TimelineClip[]>();
  const pastedEntries: Array<{ sourceId: string; clip: TimelineClip }> = [];

  sortedClips.forEach((clip, index) => {
    const trackKind = trackKindForClip(clip, assetForTimelineClip(project, clip));
    const { tracks, targetTrack } = ensureEditableTrack(workingTracks, trackKind, targetTrackId ?? clip.trackId);
    workingTracks = tracks;

    const pastedClip = createPastedClip(
      clip,
      targetTrack.id,
      startTime + (clip.start - firstStart),
      `clip-paste-${index}`,
    );
    pastedEntries.push({ sourceId: clip.id, clip: pastedClip });
    pastedByTrackId.set(targetTrack.id, [...(pastedByTrackId.get(targetTrack.id) ?? []), pastedClip]);
  });

  relinkCopiedClipsInPlace(pastedEntries);

  const nextTracks = workingTracks.map((track) => {
    const pastedClips = pastedByTrackId.get(track.id);
    if (!pastedClips) {
      return track;
    }

    return {
      ...track,
      clips: [...track.clips, ...pastedClips].sort((a, b) => a.start - b.start),
    };
  });

  return touchProject({
    ...project,
    tracks: nextTracks,
    duration: durationForTracks(nextTracks, project.duration),
  });
}

export function insertTimelineGap(
  project: EditorProject,
  start: number,
  duration: number,
  options: InsertTimelineGapOptions = {},
): EditorProject {
  const gapStart = roundTime(Math.max(0, start));
  const gapDuration = roundTime(Math.max(0, duration));
  if (gapDuration <= 0) {
    throw new Error('Gap duration must be longer than 0 seconds.');
  }

  const requestedTrackIds = options.trackIds?.length
    ? options.trackIds
    : project.tracks.map((track) => track.id);
  const existingTrackIds = new Set(project.tracks.map((track) => track.id));
  if (requestedTrackIds.some((trackId) => !existingTrackIds.has(trackId))) {
    throw new Error('Target track not found.');
  }

  const targetTrackIds = options.includeSyncLocked === false
    ? new Set(requestedTrackIds)
    : rippleEditTrackIds(project.tracks, requestedTrackIds);

  const nextTracks = project.tracks.map((track) => (
    targetTrackIds.has(track.id)
      ? {
        ...track,
        clips: insertGapIntoTrack(track, gapStart, gapDuration).sort((a, b) => a.start - b.start),
      }
      : track
  ));

  return touchProject({
    ...project,
    tracks: nextTracks,
    duration: durationForTracks(nextTracks, roundTime(project.duration + gapDuration)),
    ...shiftAnnotationsForInsertedRange(project, gapStart, gapDuration),
  });
}

export function overwriteClipAtTime(
  project: EditorProject,
  sourceClip: TimelineClip,
  start: number,
  targetTrackId?: string,
): EditorProject {
  const trackKind = trackKindForClip(sourceClip, assetForTimelineClip(project, sourceClip));
  const { tracks, targetTrack } = ensureEditableTrack(project.tracks, trackKind, targetTrackId ?? sourceClip.trackId);
  const startTime = roundTime(Math.max(0, start));
  const endTime = roundTime(startTime + sourceClip.duration);
  const clip = relinkCopiedClipReferences({
    ...sourceClip,
    id: `clip-overwrite-${Date.now()}-${sourceClip.id}`,
    trackId: targetTrack.id,
    start: startTime,
    locked: false,
  }, new Map());

  return touchProject({
    ...project,
    tracks: tracks.map((track) => {
      if (track.id !== targetTrack.id) {
        return track;
      }

      return {
        ...track,
        clips: [
          ...removeTimeRangeFromTrack(track, startTime, endTime),
          clip,
        ].sort((a, b) => a.start - b.start),
      };
    }),
    duration: Math.max(project.duration, clip.start + clip.duration),
  });
}

export function overwriteClipsAtTime(
  project: EditorProject,
  sourceClips: TimelineClip[],
  start: number,
  targetTrackId?: string,
): EditorProject {
  if (sourceClips.length === 0) {
    return project;
  }

  const sortedClips = [...sourceClips].sort((a, b) => a.start - b.start);
  const firstStart = sortedClips[0].start;
  const startTime = roundTime(Math.max(0, start));
  let workingTracks = project.tracks;
  const pastedByTrackId = new Map<string, TimelineClip[]>();
  const pastedEntries: Array<{ sourceId: string; clip: TimelineClip }> = [];

  sortedClips.forEach((sourceClip, index) => {
    const trackKind = trackKindForClip(sourceClip, assetForTimelineClip(project, sourceClip));
    const { tracks, targetTrack } = ensureEditableTrack(workingTracks, trackKind, targetTrackId ?? sourceClip.trackId);
    workingTracks = tracks;

    const pastedClip = {
      ...sourceClip,
      id: `clip-overwrite-${index}-${Date.now()}-${sourceClip.id}`,
      trackId: targetTrack.id,
      start: roundTime(startTime + (sourceClip.start - firstStart)),
      locked: false,
    };
    pastedEntries.push({ sourceId: sourceClip.id, clip: pastedClip });
    pastedByTrackId.set(targetTrack.id, [...(pastedByTrackId.get(targetTrack.id) ?? []), pastedClip]);
  });

  relinkCopiedClipsInPlace(pastedEntries);

  const nextTracks = workingTracks.map((track) => {
    const pastedClips = pastedByTrackId.get(track.id);
    if (!pastedClips) {
      return track;
    }

    const clippedTimeline = pastedClips.reduce((clips, pastedClip) => (
      removeTimeRangeFromTrack({
        ...track,
        clips,
      }, pastedClip.start, roundTime(pastedClip.start + pastedClip.duration))
    ), track.clips);

    return {
      ...track,
      clips: [...clippedTimeline, ...pastedClips].sort((a, b) => a.start - b.start),
    };
  });

  return touchProject({
    ...project,
    tracks: nextTracks,
    duration: durationForTracks(nextTracks, project.duration),
  });
}

function applyAssetPatchEdit(
  project: EditorProject,
  assetId: string,
  options: AssetPatchEditOptions,
  mode: 'insert' | 'overwrite',
): EditorProject {
  const asset = project.assets.find((item) => item.id === assetId);
  if (!asset) {
    throw new Error('Asset not found.');
  }

  const assetMediaKind = resolveRenderableAssetMediaKind(asset);
  const includePrimary = options.includePrimary ?? assetMediaKind !== 'audio';
  const includeAudio = options.includeAudio ?? (assetMediaKind === 'audio' || hasEmbeddedAudio(asset));
  if (!includePrimary && !includeAudio) {
    throw new Error('At least one source patch target must be enabled.');
  }

  if (includeAudio && assetMediaKind !== 'audio' && !hasEmbeddedAudio(asset)) {
    throw new Error('Source asset has no audio patch.');
  }

  const range = normalizeAssetRangeEdit(asset, options);
  let workingTracks = project.tracks;
  const clipsByTrackId = new Map<string, TimelineClip[]>();
  let primaryClip: TimelineClip | undefined;
  let audioClip: TimelineClip | undefined;

  if (includePrimary && assetMediaKind !== 'audio') {
    const primaryTrackKind = trackKindForAsset(asset);
    const { tracks, targetTrack } = ensureEditableTrack(
      workingTracks,
      primaryTrackKind,
      options.primaryTargetTrackId ?? options.targetTrackId,
    );
    workingTracks = tracks;
    primaryClip = createAssetRangeClipFromRange(asset, targetTrack.id, range, 'clip-patch-video');
    clipsByTrackId.set(targetTrack.id, [primaryClip]);
  }

  if (includeAudio) {
    const { tracks, targetTrack } = ensureEditableTrack(
      workingTracks,
      'audio',
      assetMediaKind === 'audio'
        ? options.audioTargetTrackId ?? options.targetTrackId
        : options.audioTargetTrackId,
    );
    workingTracks = tracks;

    const linkedVideoId = primaryClip?.id;
    audioClip = createAssetAudioPatchClip(asset, targetTrack.id, range, linkedVideoId);
    clipsByTrackId.set(targetTrack.id, [...(clipsByTrackId.get(targetTrack.id) ?? []), audioClip]);
  }

  if (primaryClip && audioClip) {
    primaryClip = {
      ...primaryClip,
      automationTags: withUniqueTags(primaryClip.automationTags, [
        EMBEDDED_AUDIO_DISABLED_TAG,
        buildDetachedAudioTag(audioClip.id),
      ]),
    };
    clipsByTrackId.set(primaryClip.trackId, [primaryClip]);
  }

  const endTime = roundTime(range.start + range.duration);
  const patchTrackIds = Array.from(clipsByTrackId.keys());
  const gapTrackIds = mode === 'insert' && options.ripple
    ? rippleEditTrackIds(workingTracks, patchTrackIds)
    : new Set(patchTrackIds);
  const nextTracks = workingTracks.map((track) => {
    const patchClips = clipsByTrackId.get(track.id);
    if (!patchClips && !gapTrackIds.has(track.id)) {
      return track;
    }

    const timelineClips = mode === 'insert'
      ? options.ripple && gapTrackIds.has(track.id)
        ? insertGapIntoTrack(track, range.start, range.duration)
        : track.clips
      : removeTimeRangeFromTrack(track, range.start, endTime);

    return {
      ...track,
      clips: [...timelineClips, ...(patchClips ?? [])].sort((a, b) => a.start - b.start),
    };
  });

  return touchProject({
    ...project,
    tracks: nextTracks,
    duration: durationForTracks(nextTracks, project.duration),
    ...(mode === 'insert' && options.ripple ? shiftAnnotationsForInsertedRange(project, range.start, range.duration) : {}),
  });
}

export function deleteClips(project: EditorProject, clipIds: string[], ripple = false): EditorProject {
  const ids = new Set(clipIds);
  if (ids.size === 0) {
    return project;
  }

  const removedItems = project.tracks.flatMap((track) => (
    track.clips
      .filter((clip) => ids.has(clip.id))
      .map((clip) => ({ track, clip }))
  ));
  const rippleTrackIds = ripple
    ? rippleEditTrackIds(project.tracks, Array.from(new Set(removedItems.map((item) => item.track.id))))
    : new Set<string>();
  const rippleSpans = mergeTimeSpans(removedItems.map(({ clip }) => ({
    start: clip.start,
    end: roundTime(clip.start + clip.duration),
  })));

  return touchProject({
    ...project,
    tracks: project.tracks.map((track) => {
      const removedClips = track.clips
        .filter((clip) => ids.has(clip.id))
        .sort((a, b) => a.start - b.start);

      if (removedClips.length === 0) {
        if (!ripple || !rippleTrackIds.has(track.id)) {
          return track;
        }
      }

      if (track.locked || removedClips.some((clip) => clip.locked)) {
        throw new Error('Cannot delete locked clips.');
      }

      const clips = track.clips
        .filter((clip) => !ids.has(clip.id))
        .map((clip) => {
          if (!ripple || !rippleTrackIds.has(track.id)) {
            return clip;
          }

          const shift = rippleSpans
            .filter((span) => span.start < clip.start)
            .reduce((total, span) => total + roundTime(span.end - span.start), 0);

          return {
            ...clip,
            start: roundTime(Math.max(0, clip.start - shift)),
          };
        })
        .sort((a, b) => a.start - b.start);

      return {
        ...track,
        clips,
      };
    }),
    ...(ripple ? removeAnnotationsForTimeSpans(project, rippleSpans) : {}),
  });
}

export function deleteRange(
  project: EditorProject,
  start: number,
  end: number,
  options: { trackIds?: string[]; ripple?: boolean } = {},
): EditorProject {
  const startTime = roundTime(Math.max(0, Math.min(start, end)));
  const endTime = roundTime(Math.max(startTime, Math.max(start, end)));
  const rangeDuration = roundTime(endTime - startTime);
  const targetTrackIds = options.trackIds ? new Set(options.trackIds) : undefined;
  const editTrackIds = options.ripple && targetTrackIds
    ? rippleEditTrackIds(project.tracks, Array.from(targetTrackIds))
    : targetTrackIds;

  if (rangeDuration <= 0) {
    throw new Error('Select a valid in/out range first.');
  }

  let editedTrackCount = 0;
  const tailIdByOriginalId = new Map<string, string>();
  const tracks = project.tracks.map((track) => {
    if (editTrackIds && !editTrackIds.has(track.id)) {
      return track;
    }

    const hasOverlap = track.clips.some((clip) => clip.start < endTime && clip.start + clip.duration > startTime);
    const hasRippleDownstream = Boolean(options.ripple && track.clips.some((clip) => clip.start >= endTime));
    if (!hasOverlap && !hasRippleDownstream) {
      return track;
    }

    if (track.locked) {
      throw new Error('Cannot edit a locked track.');
    }

    if (hasOverlap) {
      editedTrackCount += 1;
    }
    const liftedClips = hasOverlap
      ? removeTimeRangeFromTrack(track, startTime, endTime, tailIdByOriginalId)
      : track.clips;
    const clips = options.ripple
      ? liftedClips.map((clip) => (
        clip.start >= endTime
          ? { ...clip, start: roundTime(Math.max(0, clip.start - rangeDuration)) }
          : clip
      ))
      : liftedClips;

    return {
      ...track,
      clips: clips.sort((a, b) => a.start - b.start),
    };
  });

  if (editedTrackCount === 0) {
    throw new Error('No clips overlap the selected range.');
  }

  return touchProject({
    ...project,
    tracks: relinkGeneratedTailClips(tracks, tailIdByOriginalId),
    ...(options.ripple ? removeAnnotationsForTimeSpans(project, [{ start: startTime, end: endTime }]) : {}),
  });
}

export function closeGapAtTime(project: EditorProject, trackId: string, time: number): EditorProject {
  const track = project.tracks.find((item) => item.id === trackId);
  if (!track) {
    throw new Error('Select a target track first.');
  }

  if (track.locked) {
    throw new Error('Cannot close a gap on a locked track.');
  }

  const playhead = roundTime(Math.max(0, time));
  const sortedClips = [...track.clips].sort((a, b) => a.start - b.start);
  const activeClip = sortedClips.find((clip) => playhead >= clip.start && playhead < clip.start + clip.duration);
  if (activeClip) {
    throw new Error('Move the playhead into an empty gap first.');
  }

  const previousClip = sortedClips
    .filter((clip) => clip.start + clip.duration <= playhead)
    .at(-1);
  const nextClip = sortedClips.find((clip) => clip.start > playhead);
  if (!nextClip) {
    throw new Error('No later clip found to close the gap.');
  }

  const gapStart = previousClip ? roundTime(previousClip.start + previousClip.duration) : 0;
  const gapDuration = roundTime(nextClip.start - gapStart);
  if (gapDuration <= 0 || playhead < gapStart || playhead >= nextClip.start) {
    throw new Error('Move the playhead into an empty gap first.');
  }

  const movingTrackClipIds = sortedClips
    .filter((clip) => clip.start >= nextClip.start)
    .map((clip) => clip.id);
  const syncLockedClipIds = project.tracks.flatMap((item) => (
    item.syncLocked
      ? item.clips.filter((clip) => clip.start >= nextClip.start).map((clip) => clip.id)
      : []
  ));
  const movingIds = new Set(expandClipIdsWithLinkedClips(project, [...movingTrackClipIds, ...syncLockedClipIds]));
  const movingItems = project.tracks.flatMap((item) => (
    item.clips
      .filter((clip) => movingIds.has(clip.id))
      .map((clip) => ({ track: item, clip }))
  ));

  if (movingItems.some((item) => item.track.locked || item.clip.locked)) {
    throw new Error('Cannot close a gap through locked linked clips.');
  }

  const tracks = project.tracks.map((item) => ({
    ...item,
    clips: item.clips.map((clip) => (
      movingIds.has(clip.id)
        ? { ...clip, start: roundTime(Math.max(0, clip.start - gapDuration)) }
        : clip
    )).sort((a, b) => a.start - b.start),
  }));

  return touchProject({
    ...project,
    tracks,
    duration: durationForTracks(tracks, project.duration),
    ...removeAnnotationsForTimeSpans(project, [{ start: gapStart, end: nextClip.start }]),
  });
}

export function closeAllGapsOnTrack(project: EditorProject, trackId: string): EditorProject {
  let currentProject = project;
  let closedGapCount = 0;

  for (let guard = 0; guard < 1000; guard += 1) {
    const track = currentProject.tracks.find((item) => item.id === trackId);
    if (!track) {
      throw new Error('Select a target track first.');
    }

    if (track.locked) {
      throw new Error('Cannot close gaps on a locked track.');
    }

    const sortedClips = [...track.clips].sort((a, b) => a.start - b.start);
    let cursor = 0;
    let gapPlayhead: number | undefined;

    for (const clip of sortedClips) {
      if (clip.start > cursor + 0.001) {
        gapPlayhead = roundTime(cursor);
        break;
      }

      cursor = roundTime(Math.max(cursor, clip.start + clip.duration));
    }

    if (gapPlayhead === undefined) {
      break;
    }

    currentProject = closeGapAtTime(currentProject, trackId, gapPlayhead);
    closedGapCount += 1;
  }

  if (closedGapCount === 0) {
    throw new Error('No timeline gaps found on selected track.');
  }

  return currentProject;
}

export function arrangeClipsOnTrack(
  project: EditorProject,
  clipIds: string[],
  options: ArrangeClipsOnTrackOptions = {},
): EditorProject {
  const requestedIds = Array.from(new Set(clipIds.filter(Boolean)));
  if (requestedIds.length < 2) {
    throw new Error('Select at least two clips to arrange.');
  }

  const selectedItems = requestedIds.flatMap((clipId) => {
    const track = project.tracks.find((item) => item.clips.some((clip) => clip.id === clipId));
    const clip = track?.clips.find((item) => item.id === clipId);
    return track && clip ? [{ track, clip }] : [];
  });
  if (selectedItems.length !== requestedIds.length) {
    throw new Error('Selected clip not found.');
  }

  const trackIds = new Set(selectedItems.map(({ track }) => track.id));
  if (trackIds.size !== 1) {
    throw new Error('Selected clips must be on the same track to arrange.');
  }

  const track = selectedItems[0].track;
  if (track.locked) {
    throw new Error('Cannot arrange clips on a locked track.');
  }

  if (selectedItems.some(({ clip }) => clip.locked)) {
    throw new Error('Cannot arrange locked clips.');
  }

  const gap = roundTime(clamp(options.gapSeconds ?? 0, 0, 60));
  const selectedIdSet = new Set(requestedIds);
  const sortedSelectedClips = selectedItems
    .map(({ clip }) => clip)
    .sort((a, b) => a.start - b.start);
  let cursor = roundTime(Math.max(0, options.start ?? sortedSelectedClips[0].start));
  let changed = false;
  const arrangedById = new Map<string, TimelineClip>();

  for (const clip of sortedSelectedClips) {
    const nextClip = {
      ...clip,
      start: cursor,
    };
    arrangedById.set(clip.id, nextClip);
    changed = changed || Math.abs(nextClip.start - clip.start) > 0.001;
    cursor = roundTime(cursor + clip.duration + gap);
  }

  if (!changed) {
    return project;
  }

  const staticClips = track.clips.filter((clip) => !selectedIdSet.has(clip.id));
  for (const arrangedClip of arrangedById.values()) {
    if (staticClips.some((staticClip) => clipsOverlap(arrangedClip, staticClip))) {
      throw new Error('Arranged clips would overlap an unselected clip.');
    }
  }

  const tracks = project.tracks.map((item) => (
    item.id === track.id
      ? {
        ...item,
        clips: item.clips
          .map((clip) => arrangedById.get(clip.id) ?? clip)
          .sort((a, b) => a.start - b.start),
      }
      : item
  ));

  return touchProject({
    ...project,
    tracks,
    duration: durationForTracks(tracks, project.duration),
  });
}

export function toggleTrackState(project: EditorProject, trackId: string, state: 'muted' | 'solo' | 'locked' | 'syncLocked'): EditorProject {
  return touchProject({
    ...project,
    tracks: project.tracks.map((track) => (
      track.id === trackId
        ? { ...track, [state]: !track[state] }
        : track
    )),
  });
}

export function snapTimeToEditPoints(
  project: EditorProject,
  time: number,
  options: { threshold?: number; excludeClipId?: string; excludeClipIds?: string[]; extraPoints?: number[] } = {},
): number {
  const rounded = roundTime(Math.max(0, time));
  const snapResult = snapTimelineTime({
    project,
    time: rounded,
    threshold: options.threshold ?? 0.2,
    options: {
      excludeClipId: options.excludeClipId,
      excludeClipIds: options.excludeClipIds,
      extraPoints: options.extraPoints,
    },
  });

  return roundTime(snapResult.snappedTime);
}

export function addAiBrollClip(project: EditorProject, prompt: string): EditorProject {
  const targetTrack = project.tracks.find((track) => track.id === 'track-v2') ?? project.tracks.find((track) => track.kind === 'video');
  if (!targetTrack) {
    throw new Error('A video track is required before adding AI B-roll.');
  }

  const start = findNextOpenStart(targetTrack, 6);
  const clip = createClip({
    id: `clip-ai-${Date.now()}`,
    trackId: targetTrack.id,
    name: 'AI B-roll draft',
    kind: 'ai',
    start,
    duration: 6,
    color: '#fb7185',
    automationTags: ['comfyui', 'b-roll'],
    generation: {
      provider: 'comfyui',
      workflowName: DEFAULT_COMFYUI_WORKFLOW_NAME,
      prompt: prompt.trim() || 'cinematic product b-roll, clean studio lighting',
      status: 'draft',
    },
  });

  return touchProject({
    ...project,
    tracks: project.tracks.map((track) => {
      if (track.id !== targetTrack.id) {
        return track;
      }

      return {
        ...track,
        clips: [...track.clips, clip].sort((a, b) => a.start - b.start),
      };
    }),
    duration: Math.max(project.duration, clip.start + clip.duration),
  });
}

export function addTitleClip(project: EditorProject, options: TitleClipOptions): EditorProject {
  const text = normalizeTitleText(options.text);
  const duration = roundTime(Math.max(MIN_CLIP_DURATION, options.duration ?? 5));
  const start = roundTime(Math.max(0, options.start));
  const { tracks: editableTracks, targetTrack } = ensureEditableTrack(project.tracks, 'text', options.targetTrackId);
  const { tracks, targetTrack: titleTrack } = ensureTextTrackForRange(editableTracks, targetTrack.id, start, duration);
  const assetId = `asset-title-${Date.now()}`;
  const clip = createClip({
    id: `clip-title-${Date.now()}`,
    assetId,
    trackId: titleTrack.id,
    name: titleClipName(text),
    kind: 'text',
    start,
    duration,
    color: options.color ?? '#eab308',
    automationTags: ['title'],
  });
  const asset: EditorAsset = {
    id: assetId,
    name: titleClipName(text),
    kind: 'text',
    source: text,
    duration,
  };
  const nextTracks = tracks.map((track) => (
    track.id === titleTrack.id
      ? {
        ...track,
        clips: [...track.clips, clip].sort((a, b) => a.start - b.start),
      }
      : track
  ));

  return touchProject({
    ...project,
    assets: [...project.assets, asset],
    tracks: nextTracks,
    duration: durationForTracks(nextTracks, project.duration),
  });
}

export function updateTitleClipText(project: EditorProject, clipId: string, text: string): EditorProject {
  const nextText = normalizeTitleText(text);
  const track = project.tracks.find((item) => item.clips.some((clip) => clip.id === clipId));
  const clip = track?.clips.find((item) => item.id === clipId);
  if (!track || !clip) {
    throw new Error('Clip not found.');
  }

  const asset = clip.assetId ? project.assets.find((item) => item.id === clip.assetId) : undefined;
  if (clip.kind !== 'text' && asset?.kind !== 'text') {
    throw new Error('Title text can only be edited on title clips.');
  }

  if (track.locked || clip.locked) {
    throw new Error('Cannot edit a locked track or clip.');
  }

  const assetUseCount = clip.assetId
    ? getAllClips(project).filter((item) => item.assetId === clip.assetId).length
    : 0;
  const shouldReuseAsset = Boolean(asset && asset.kind === 'text' && assetUseCount <= 1);
  const nextAssetId = shouldReuseAsset && asset
    ? asset.id
    : `asset-title-${Date.now()}-${clip.id}`;
  const nextAsset: EditorAsset = {
    id: nextAssetId,
    name: titleClipName(nextText),
    kind: 'text',
    source: nextText,
    duration: clip.duration,
  };
  const assets = shouldReuseAsset
    ? project.assets.map((item) => (
      item.id === nextAssetId
        ? {
          ...item,
          name: titleClipName(nextText),
          source: nextText,
          duration: Math.max(item.duration, clip.duration),
        }
        : item
    ))
    : [...project.assets, nextAsset];
  const tracks = project.tracks.map((item) => (
    item.id === track.id
      ? {
        ...item,
        clips: item.clips.map((trackClip) => (
          trackClip.id === clip.id
            ? {
              ...trackClip,
              assetId: nextAssetId,
              kind: 'text' as const,
              name: titleClipName(nextText),
            }
            : trackClip
        )),
      }
      : item
  ));

  return touchProject({
    ...project,
    assets,
    tracks,
  });
}

export function applyTitleStyle(project: EditorProject, clipId: string, patch: CaptionStyle): EditorProject {
  const track = project.tracks.find((item) => item.clips.some((clip) => clip.id === clipId));
  const clip = track?.clips.find((item) => item.id === clipId);
  if (!track || !clip) {
    throw new Error('Clip not found.');
  }

  const asset = clip.assetId ? project.assets.find((item) => item.id === clip.assetId) : undefined;
  if (clip.kind !== 'text' && asset?.kind !== 'text') {
    throw new Error('Title style can only be edited on title clips.');
  }

  if (track.locked || clip.locked) {
    throw new Error('Cannot edit a locked track or clip.');
  }

  const currentEffect = findTitleStyleEffect(clip);
  const nextStyle = normalizeTitleStyle({
    ...(currentEffect?.parameters as CaptionStyle | undefined),
    ...patch,
  });
  const nextParameters = {
    ...nextStyle,
    titleStyle: true,
  };
  const nextEffect: ClipEffect = currentEffect
    ? {
      ...currentEffect,
      enabled: true,
      parameters: nextParameters,
    }
    : {
      id: `effect-title-style-${Date.now()}`,
      type: 'caption',
      label: TITLE_STYLE_EFFECT_LABEL,
      enabled: true,
      parameters: nextParameters,
    };
  const tracks = project.tracks.map((item) => (
    item.id === track.id
      ? {
        ...item,
        clips: item.clips.map((trackClip) => {
          if (trackClip.id !== clip.id) {
            return trackClip;
          }

          return {
            ...trackClip,
            effects: currentEffect
              ? trackClip.effects.map((effect) => (effect.id === currentEffect.id ? nextEffect : effect))
              : [...trackClip.effects, nextEffect],
          };
        }),
      }
      : item
  ));

  return touchProject({
    ...project,
    tracks,
  });
}

export function moveClip(project: EditorProject, clipId: string, deltaSeconds: number): EditorProject {
  return moveClips(project, [clipId], deltaSeconds);
}

export function clampClipMoveDelta(project: EditorProject, clipIds: string[], deltaSeconds: number): number {
  const ids = new Set(clipIds);
  if (ids.size === 0 || Math.abs(deltaSeconds) < 0.001) {
    return 0;
  }

  const movableClips = getMovableClipItems(project, ids);
  if (movableClips.length === 0) {
    throw new Error('Clip not found.');
  }

  const anchorClip = movableClips[0].clip;
  const movePlan = resolveTimelineGroupMoveFromProject({
    project,
    clipIds,
    anchorClipId: anchorClip.id,
    requestedAnchorStart: roundTime(anchorClip.start + deltaSeconds),
    preventOverlap: true,
  });

  return movePlan?.appliedDelta ?? 0;
}

export function moveClips(
  project: EditorProject,
  clipIds: string[],
  deltaSeconds: number,
  options: MoveClipOptions = {},
): EditorProject {
  const ids = new Set(clipIds);
  if (ids.size === 0 || Math.abs(deltaSeconds) < 0.001) {
    return project;
  }

  const movableClips = getMovableClipItems(project, ids);
  if (movableClips.length === 0) {
    throw new Error('Clip not found.');
  }

  if (movableClips.some(({ track, clip }) => track.locked || clip.locked)) {
    throw new Error('Cannot move a locked track or clip.');
  }

  const anchorClip = movableClips[0].clip;
  const movePlan = resolveTimelineGroupMoveFromProject({
    project,
    clipIds,
    anchorClipId: anchorClip.id,
    requestedAnchorStart: roundTime(anchorClip.start + deltaSeconds),
    preventOverlap: options.preventOverlap,
  });
  const movedClipsById = new Map((movePlan?.movedClips ?? []).map((clip) => [clip.id, clip]));

  return touchProject({
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => {
        if (!ids.has(clip.id)) {
          return clip;
        }

        return movedClipsById.get(clip.id) ?? clip;
      }).sort((a, b) => a.start - b.start),
    })),
  });
}

export function moveClipsToTime(
  project: EditorProject,
  clipIds: string[],
  start: number,
  options: MoveClipsToTimeOptions = {},
): EditorProject {
  const ids = new Set(clipIds);
  if (ids.size === 0) {
    return project;
  }

  const movableClips = getMovableClipItems(project, ids);
  if (movableClips.length === 0) {
    throw new Error('Clip not found.');
  }

  const minStart = Math.min(...movableClips.map(({ clip }) => clip.start));
  const targetStart = roundTime(Math.max(0, start));
  return moveClips(project, clipIds, targetStart - minStart, options);
}

export function moveClipsToTrack(project: EditorProject, clipIds: string[], targetTrackId: string): EditorProject {
  const ids = new Set(clipIds);
  if (ids.size === 0) {
    return project;
  }

  const targetTrack = project.tracks.find((track) => track.id === targetTrackId);
  if (!targetTrack) {
    throw new Error('Target track not found.');
  }

  if (targetTrack.locked) {
    throw new Error('Cannot move clips to a locked track.');
  }

  const movableClips = getMovableClipItems(project, ids);
  if (movableClips.length === 0) {
    throw new Error('Clip not found.');
  }

  if (movableClips.some(({ track, clip }) => track.locked || clip.locked)) {
    throw new Error('Cannot move a locked track or clip.');
  }

  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const clipKinds = Array.from(new Set(movableClips.map(({ clip }) => trackKindForTimelineClip(
    clip,
    clip.assetId ? assetById.get(clip.assetId) : undefined,
  ))));
  if (clipKinds.length > 1) {
    throw new Error('Selected clips must share a track kind before moving tracks.');
  }

  if (targetTrack.kind !== clipKinds[0]) {
    throw new Error('Target track kind does not match selected clips.');
  }

  const movingClips = movableClips.map(({ clip }) => clip);
  if (movingClips.every((clip) => clip.trackId === targetTrackId)) {
    return project;
  }

  for (let index = 0; index < movingClips.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < movingClips.length; nextIndex += 1) {
      if (clipRangesOverlap(movingClips[index], movingClips[nextIndex])) {
        throw new Error('Selected clips overlap at the target track time range.');
      }
    }
  }

  const targetStaticClips = targetTrack.clips.filter((clip) => !ids.has(clip.id));
  if (movingClips.some((movingClip) => targetStaticClips.some((staticClip) => clipRangesOverlap(movingClip, staticClip)))) {
    throw new Error('Target track has a clip in the selected time range.');
  }

  return touchProject({
    ...project,
    tracks: project.tracks.map((track) => {
      const remainingClips = track.clips.filter((clip) => !ids.has(clip.id));
      if (track.id !== targetTrackId) {
        return {
          ...track,
          clips: remainingClips,
        };
      }

      return {
        ...track,
        clips: [
          ...remainingClips,
          ...movingClips.map((clip) => ({
            ...clip,
            trackId: targetTrackId,
          })),
        ].sort((a, b) => a.start - b.start),
      };
    }),
  });
}

export function moveClipsToTrackAtTime(
  project: EditorProject,
  clipIds: string[],
  targetTrackId: string,
  start: number,
  options: { anchorClipId?: string } = {},
): EditorProject {
  const ids = new Set(clipIds);
  if (ids.size === 0) {
    return project;
  }

  const targetTrack = project.tracks.find((track) => track.id === targetTrackId);
  if (!targetTrack) {
    throw new Error('Target track not found.');
  }

  if (targetTrack.locked) {
    throw new Error('Cannot move clips to a locked track.');
  }

  const movableClips = getMovableClipItems(project, ids);
  if (movableClips.length === 0) {
    throw new Error('Clip not found.');
  }

  if (movableClips.some(({ track, clip }) => track.locked || clip.locked)) {
    throw new Error('Cannot move a locked track or clip.');
  }

  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const clipKinds = Array.from(new Set(movableClips.map(({ clip }) => trackKindForTimelineClip(
    clip,
    clip.assetId ? assetById.get(clip.assetId) : undefined,
  ))));
  if (clipKinds.length > 1) {
    throw new Error('Selected clips must share a track kind before moving tracks.');
  }

  if (targetTrack.kind !== clipKinds[0]) {
    throw new Error('Target track kind does not match selected clips.');
  }

  const movingClips = movableClips.map(({ clip }) => clip);
  const anchorClip = options.anchorClipId
    ? movingClips.find((clip) => clip.id === options.anchorClipId) ?? movingClips[0]
    : movingClips[0];
  const movePlan = resolveTimelineGroupMoveFromProject({
    project,
    clipIds,
    anchorClipId: anchorClip.id,
    requestedAnchorStart: start,
    targetTrackId,
  });
  const shiftedClips = movePlan?.movedClips ?? [];

  if (!movePlan) {
    throw new Error('Target track has a clip in the selected time range.');
  }

  for (let index = 0; index < shiftedClips.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < shiftedClips.length; nextIndex += 1) {
      if (clipRangesOverlap(shiftedClips[index], shiftedClips[nextIndex])) {
        throw new Error('Selected clips overlap at the target track time range.');
      }
    }
  }

  const targetStaticClips = targetTrack.clips.filter((clip) => !ids.has(clip.id));
  if (shiftedClips.some((movingClip) => targetStaticClips.some((staticClip) => clipRangesOverlap(movingClip, staticClip)))) {
    throw new Error('Target track has a clip in the selected time range.');
  }

  return touchProject({
    ...project,
    tracks: project.tracks.map((track) => {
      const remainingClips = track.clips.filter((clip) => !ids.has(clip.id));
      if (track.id !== targetTrackId) {
        return {
          ...track,
          clips: remainingClips,
        };
      }

      return {
        ...track,
        clips: [
          ...remainingClips,
          ...shiftedClips,
        ].sort((a, b) => a.start - b.start),
      };
    }),
  });
}

export function moveClipsToNewTrackAtTime(
  project: EditorProject,
  clipIds: string[],
  newTrackPosition: TimelineGroupMoveNewTrackPosition,
  start: number,
  options: { anchorClipId?: string } = {},
): EditorProject {
  const ids = new Set(clipIds);
  if (ids.size === 0) {
    return project;
  }

  const movableClips = getMovableClipItems(project, ids);
  if (movableClips.length === 0) {
    throw new Error('Clip not found.');
  }

  if (movableClips.some(({ track, clip }) => track.locked || clip.locked)) {
    throw new Error('Cannot move a locked track or clip.');
  }

  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const clipKinds = Array.from(new Set(movableClips.map(({ clip }) => trackKindForTimelineClip(
    clip,
    clip.assetId ? assetById.get(clip.assetId) : undefined,
  ))));
  if (clipKinds.length > 1) {
    throw new Error('Selected clips must share a track kind before creating a track.');
  }

  const movingClips = movableClips.map(({ clip }) => clip);
  const anchorClip = options.anchorClipId
    ? movingClips.find((clip) => clip.id === options.anchorClipId) ?? movingClips[0]
    : movingClips[0];
  const movePlan = resolveTimelineGroupMoveFromProject({
    project,
    clipIds,
    anchorClipId: anchorClip.id,
    requestedAnchorStart: start,
    newTrackPosition,
  });

  if (!movePlan?.newTrack) {
    throw new Error('Selected clips overlap at the new track time range.');
  }

  const newTrack: TimelineTrack = {
    id: movePlan.newTrack.id,
    name: movePlan.newTrack.name,
    kind: movePlan.newTrack.kind,
    muted: false,
    solo: false,
    syncLocked: false,
    volumeDb: 0,
    pan: 0,
    locked: false,
    clips: movePlan.movedClips.sort((a, b) => a.start - b.start),
  };
  const tracksWithoutMovingClips = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.filter((clip) => !ids.has(clip.id)),
  }));
  const insertIndex = clampInteger(movePlan.newTrack.insertIndex, 0, tracksWithoutMovingClips.length);
  const tracks = [
    ...tracksWithoutMovingClips.slice(0, insertIndex),
    newTrack,
    ...tracksWithoutMovingClips.slice(insertIndex),
  ];

  return touchProject({
    ...project,
    tracks,
    duration: durationForTracks(tracks, project.duration),
  });
}

function getMovableClipItems(project: EditorProject, ids: Set<string>): Array<{ track: TimelineTrack; clip: TimelineClip }> {
  return project.tracks.flatMap((track) => (
    track.clips
      .filter((clip) => ids.has(clip.id))
      .map((clip) => ({ track, clip }))
  ));
}

function findNextNonOverlappingPasteStart(
  project: EditorProject,
  sourceClips: TimelineClip[],
  requestedStart: number,
  sourceFirstStart: number,
  gapSeconds: number,
): number {
  let candidateStart = roundTime(Math.max(0, requestedStart));
  const gap = roundTime(Math.max(0, gapSeconds));

  for (let guard = 0; guard < 1000; guard += 1) {
    let nextCandidateStart = candidateStart;

    for (const sourceClip of sourceClips) {
      const track = project.tracks.find((item) => item.id === sourceClip.trackId);
      if (!track) {
        throw new Error('Source track not found.');
      }

      const offset = roundTime(sourceClip.start - sourceFirstStart);
      const projectedClip = {
        ...sourceClip,
        start: roundTime(candidateStart + offset),
      };

      for (const existingClip of track.clips) {
        if (!clipsOverlap(projectedClip, existingClip)) {
          continue;
        }

        nextCandidateStart = Math.max(
          nextCandidateStart,
          roundTime(existingClip.start + existingClip.duration - offset + gap),
        );
      }
    }

    if (nextCandidateStart <= candidateStart + 0.001) {
      return candidateStart;
    }

    candidateStart = roundTime(nextCandidateStart);
  }

  throw new Error('Could not find an open timeline position for duplicated clips.');
}

function clipsOverlap(first: TimelineClip, second: TimelineClip): boolean {
  return first.start < second.start + second.duration - 0.001
    && second.start < first.start + first.duration - 0.001;
}

function clipRangesOverlap(first: TimelineClip, second: TimelineClip): boolean {
  return first.start < second.start + second.duration - 0.001
    && second.start < first.start + first.duration - 0.001;
}

export function clampClipTrimTime(
  project: EditorProject,
  clipIds: string[],
  edge: 'start' | 'end',
  timelineTime: number,
): number {
  const plan = resolveTimelineResizeTimeFromProject({
    project,
    clipIds,
    edge,
    timelineTime,
  });
  if (!plan) {
    throw new Error('Clip not found.');
  }

  return plan.appliedTimelineTime;
}

export function trimClip(
  project: EditorProject,
  clipId: string,
  edge: 'start' | 'end',
  deltaSeconds: number,
): EditorProject {
  return touchProject({
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => {
        if (clip.id !== clipId) {
          return clip;
        }

        if (track.locked || clip.locked) {
          throw new Error('Cannot trim a locked track or clip.');
        }

        return trimTimelineClip(clip, edge, deltaSeconds);
      }),
    })),
  });
}

export function trimLinkedClipToTime(
  project: EditorProject,
  clipId: string,
  edge: 'start' | 'end',
  timelineTime: number,
  options: { ripple?: boolean; preventOverlap?: boolean } = {},
): EditorProject {
  const linkedIds = expandClipIdsWithLinkedClips(project, [clipId]);
  if (linkedIds.length <= 1) {
    const track = findTrackForClip(project, clipId);
    const clip = track?.clips.find((item) => item.id === clipId);
    if (!track || !clip) {
      throw new Error('Clip not found.');
    }

    if (track.locked || clip.locked) {
      throw new Error('Cannot trim a locked track or clip.');
    }

    const clampedTimelineTime = options.preventOverlap
      ? clampClipTrimTime(project, [clip.id], edge, timelineTime)
      : timelineTime;
    const delta = edge === 'start'
      ? clampedTimelineTime - clip.start
      : clampedTimelineTime - (clip.start + clip.duration);
    const trimmedClip = trimTimelineClip(clip, edge, delta);
    const rippleContexts = options.ripple
      ? [buildRippleTrimContext(track, clip, trimmedClip, edge)]
      : [];

    return applyTrimmedClips(project, new Map([[clip.id, trimmedClip]]), rippleContexts);
  }

  const linkedItems = project.tracks.flatMap((track) => (
    track.clips
      .filter((clip) => linkedIds.includes(clip.id))
      .map((clip) => ({ track, clip }))
  ));
  if (linkedItems.length === 0) {
    throw new Error('Clip not found.');
  }

  if (linkedItems.some(({ track, clip }) => track.locked || clip.locked)) {
    throw new Error('Cannot trim a locked track or clip.');
  }

  if (!options.preventOverlap && linkedItems.some(({ clip }) => timelineTime <= clip.start || timelineTime >= clip.start + clip.duration)) {
    throw new Error('Linked clips must overlap the trim time.');
  }

  const clampedTimelineTime = options.preventOverlap
    ? clampClipTrimTime(project, linkedIds, edge, timelineTime)
    : timelineTime;
  const trimmedById = new Map<string, TimelineClip>();
  const rippleContexts: RippleTrimContext[] = [];

  for (const { track, clip } of linkedItems) {
    const delta = edge === 'start'
      ? clampedTimelineTime - clip.start
      : clampedTimelineTime - (clip.start + clip.duration);
    const trimmedClip = trimTimelineClip(clip, edge, delta);
    trimmedById.set(clip.id, trimmedClip);

    if (options.ripple) {
      rippleContexts.push(buildRippleTrimContext(track, clip, trimmedClip, edge));
    }
  }

  return applyTrimmedClips(project, trimmedById, rippleContexts);
}

interface RippleTrimContext {
  trackId: string;
  clipId: string;
  edge: 'start' | 'end';
  appliedDelta: number;
  downstreamClipIds: string[];
  annotationEdit?: AnnotationTimeEdit;
}

interface AnnotationTimeEdit {
  mode: 'insert' | 'remove';
  start: number;
  end: number;
}

type AnnotationEditState = Pick<EditorProject, 'markers' | 'captions'>;

function buildRippleTrimContext(
  track: TimelineTrack,
  clip: TimelineClip,
  trimmedClip: TimelineClip,
  edge: 'start' | 'end',
): RippleTrimContext {
  const sortedClips = [...track.clips].sort((a, b) => a.start - b.start);
  const clipIndex = sortedClips.findIndex((item) => item.id === clip.id);
  const originalEnd = roundTime(clip.start + clip.duration);
  const nextEnd = roundTime(trimmedClip.start + trimmedClip.duration);
  const appliedDelta = edge === 'start'
    ? roundTime(trimmedClip.start - clip.start)
    : roundTime(nextEnd - originalEnd);
  const annotationEdit = buildRippleTrimAnnotationEdit(clip.start, originalEnd, nextEnd, edge, appliedDelta);

  return {
    trackId: track.id,
    clipId: clip.id,
    edge,
    appliedDelta,
    downstreamClipIds: clipIndex === -1
      ? []
      : sortedClips.slice(clipIndex + 1).map((item) => item.id),
    annotationEdit,
  };
}

function applyTrimmedClips(
  project: EditorProject,
  trimmedById: Map<string, TimelineClip>,
  rippleContexts: RippleTrimContext[],
): EditorProject {
  assertRippleTrimUnlocked(project, rippleContexts);
  const contextByTrackId = new Map(rippleContexts.map((context) => [context.trackId, context]));
  const nextTracks = project.tracks.map((track) => {
    const context = contextByTrackId.get(track.id);
    const shift = context
      ? (context.edge === 'start' ? -context.appliedDelta : context.appliedDelta)
      : 0;

    return {
      ...track,
      clips: track.clips.map((clip) => {
        let nextClip = trimmedById.get(clip.id) ?? clip;
        if (context && shouldRippleShiftTrimmedClip(context, clip.id)) {
          nextClip = {
            ...nextClip,
            start: roundTime(Math.max(0, nextClip.start + shift)),
          };
        }

        return nextClip;
      }).sort((a, b) => a.start - b.start),
    };
  });

  return touchProject({
    ...project,
    tracks: nextTracks,
    duration: durationForTracks(nextTracks, project.duration),
    ...applyRippleTrimAnnotationEdits(project, rippleContexts),
  });
}

function buildRetimedClipForSpeed(clip: TimelineClip, speed: number): TimelineClip {
  const sourceDuration = getClipSourceDuration(clip);
  const duration = roundTime(Math.max(MIN_CLIP_DURATION, sourceDuration / speed));

  return {
    ...clip,
    speed,
    speedRamp: undefined,
    duration,
    keyframes: scaleClipKeyframesForRetime(clip, duration),
    transitionIn: clampTransitionDurationForClip(clip.transitionIn, duration),
    transitionOut: clampTransitionDurationForClip(clip.transitionOut, duration),
  };
}

function scaleClipKeyframesForRetime(clip: TimelineClip, nextDuration: number): ClipKeyframe[] {
  if (clip.keyframes.length === 0) {
    return clip.keyframes;
  }

  const scale = nextDuration / Math.max(MIN_CLIP_DURATION, clip.duration);
  return sortClipKeyframes(clip.keyframes.map((keyframe) => ({
    ...keyframe,
    time: roundTime(clamp(keyframe.time * scale, 0, nextDuration)),
  })));
}

function clampTransitionDurationForClip(
  transition: TimelineTransitionOut | undefined,
  duration: number,
): TimelineTransitionOut | undefined {
  if (!transition) {
    return undefined;
  }

  return {
    ...transition,
    duration: roundTime(clamp(transition.duration, 0.05, Math.max(0.05, duration))),
  };
}

function assertRetimedClipDoesNotOverlap(
  track: TimelineTrack,
  clip: TimelineClip,
  retimedClip: TimelineClip,
  retimedIds: Set<string>,
): void {
  const originalEnd = roundTime(clip.start + clip.duration);
  const nextEnd = roundTime(retimedClip.start + retimedClip.duration);
  if (nextEnd <= originalEnd + 0.001) {
    return;
  }

  const blockingClip = track.clips.find((item) => (
    item.id !== clip.id &&
    !retimedIds.has(item.id) &&
    item.start < nextEnd - 0.001 &&
    item.start + item.duration > clip.start + 0.001
  ));
  if (blockingClip) {
    throw new Error('Not enough timeline gap for retime. Enable Ripple mode or move the next clip.');
  }
}

function buildRetimeClipContext(
  track: TimelineTrack,
  clip: TimelineClip,
  retimedClip: TimelineClip,
  retimedIds: Set<string>,
): RetimeClipContext {
  const sortedClips = [...track.clips].sort((a, b) => a.start - b.start);
  const clipIndex = sortedClips.findIndex((item) => item.id === clip.id);
  const originalEnd = roundTime(clip.start + clip.duration);
  const nextEnd = roundTime(retimedClip.start + retimedClip.duration);

  return {
    trackId: track.id,
    clipId: clip.id,
    originalEnd,
    nextEnd,
    delta: roundTime(nextEnd - originalEnd),
    downstreamClipIds: clipIndex === -1
      ? []
      : sortedClips.slice(clipIndex + 1).filter((item) => !retimedIds.has(item.id)).map((item) => item.id),
  };
}

function assertRetimeRippleUnlocked(
  project: EditorProject,
  contexts: RetimeClipContext[],
  primaryContext: RetimeClipContext,
  retimedTrackIds: Set<string>,
): void {
  for (const context of contexts) {
    if (Math.abs(context.delta) <= 0.001) {
      continue;
    }

    const track = project.tracks.find((item) => item.id === context.trackId);
    if (!track) {
      continue;
    }

    if (track.locked) {
      throw new Error('Cannot ripple retime through a locked track.');
    }

    const affectedIds = new Set(context.downstreamClipIds);
    if (track.clips.some((clip) => affectedIds.has(clip.id) && clip.locked)) {
      throw new Error('Cannot ripple retime through locked clips.');
    }
  }

  if (Math.abs(primaryContext.delta) <= 0.001) {
    return;
  }

  for (const track of project.tracks) {
    if (!track.syncLocked || retimedTrackIds.has(track.id)) {
      continue;
    }

    const affectedClips = track.clips.filter((clip) => clip.start >= primaryContext.originalEnd);
    if (affectedClips.length === 0) {
      continue;
    }

    if (track.locked) {
      throw new Error('Cannot ripple retime through a locked sync track.');
    }

    if (affectedClips.some((clip) => clip.locked)) {
      throw new Error('Cannot ripple retime through locked clips.');
    }
  }
}

function buildRetimeAnnotationPatch(
  project: AnnotationEditState,
  context: RetimeClipContext,
): Partial<AnnotationEditState> {
  if (context.delta > 0.001) {
    return shiftAnnotationsForInsertedRange(project, context.originalEnd, context.delta);
  }

  if (context.delta < -0.001) {
    return removeAnnotationsForTimeSpans(project, [{ start: context.nextEnd, end: context.originalEnd }]);
  }

  return {};
}

function shouldRippleShiftTrimmedClip(context: RippleTrimContext, clipId: string): boolean {
  return context.downstreamClipIds.includes(clipId) || (context.edge === 'start' && context.clipId === clipId);
}

function assertRippleTrimUnlocked(project: EditorProject, contexts: RippleTrimContext[]): void {
  for (const context of contexts) {
    if (context.appliedDelta === 0) {
      continue;
    }

    const track = project.tracks.find((item) => item.id === context.trackId);
    if (!track) {
      continue;
    }

    if (track.locked) {
      throw new Error('Cannot ripple trim through a locked track.');
    }

    const affectedIds = new Set([
      ...context.downstreamClipIds,
      ...(context.edge === 'start' ? [context.clipId] : []),
    ]);
    if (track.clips.some((clip) => affectedIds.has(clip.id) && clip.locked)) {
      throw new Error('Cannot ripple trim through locked clips.');
    }
  }
}

export function slipClip(project: EditorProject, clipId: string, deltaSeconds: number): EditorProject {
  const clip = findClip(project, clipId);
  if (!clip) {
    throw new Error('Clip not found.');
  }

  const asset = clip.assetId ? project.assets.find((item) => item.id === clip.assetId) : undefined;
  const maxSourceIn = asset ? Math.max(0, asset.duration - getClipSourceDuration(clip)) : Number.POSITIVE_INFINITY;
  let updatedClip: TimelineClip | undefined;

  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((item) => {
      if (item.id !== clipId) {
        return item;
      }

      if (track.locked || item.locked) {
        throw new Error('Cannot slip a locked track or clip.');
      }

      updatedClip = {
        ...item,
        sourceIn: roundTime(clamp(item.sourceIn + deltaSeconds, 0, maxSourceIn)),
      };
      return updatedClip;
    }),
  }));

  if (!updatedClip) {
    throw new Error('Clip not found.');
  }

  return touchProject({
    ...project,
    tracks,
  });
}

export function slipLinkedClip(project: EditorProject, clipId: string, deltaSeconds: number): EditorProject {
  const linkedIds = expandClipIdsWithLinkedClips(project, [clipId]);
  if (linkedIds.length <= 1) {
    return slipClip(project, clipId, deltaSeconds);
  }

  const linkedItems = project.tracks.flatMap((track) => (
    track.clips
      .filter((clip) => linkedIds.includes(clip.id))
      .map((clip) => ({ track, clip }))
  ));
  if (linkedItems.length === 0) {
    throw new Error('Clip not found.');
  }

  if (linkedItems.some(({ track, clip }) => track.locked || clip.locked)) {
    throw new Error('Cannot slip a locked track or clip.');
  }

  const bounds = linkedItems.map(({ clip }) => {
    const asset = clip.assetId ? project.assets.find((item) => item.id === clip.assetId) : undefined;
    const maxSourceIn = asset ? Math.max(0, asset.duration - getClipSourceDuration(clip)) : Number.POSITIVE_INFINITY;
    return {
      min: -clip.sourceIn,
      max: maxSourceIn - clip.sourceIn,
    };
  });
  const minDelta = Math.max(...bounds.map((bound) => bound.min));
  const maxDelta = Math.min(...bounds.map((bound) => bound.max));
  const appliedDelta = roundTime(clamp(deltaSeconds, minDelta, maxDelta));

  return touchProject({
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => (
        linkedIds.includes(clip.id)
          ? { ...clip, sourceIn: roundTime(Math.max(0, clip.sourceIn + appliedDelta)) }
          : clip
      )),
    })),
  });
}

export function rollTrimClip(
  project: EditorProject,
  clipId: string,
  edge: 'start' | 'end',
  deltaSeconds: number,
): EditorProject {
  const track = findTrackForClip(project, clipId);
  if (!track) {
    throw new Error('Clip not found.');
  }

  if (track.locked) {
    throw new Error('Cannot roll trim a locked track.');
  }

  const sortedClips = [...track.clips].sort((a, b) => a.start - b.start);
  const clipIndex = sortedClips.findIndex((clip) => clip.id === clipId);
  const clip = sortedClips[clipIndex];
  if (!clip) {
    throw new Error('Clip not found.');
  }

  if (clip.locked) {
    throw new Error('Cannot roll trim a locked clip.');
  }

  const previousClip = sortedClips[clipIndex - 1];
  const nextClip = sortedClips[clipIndex + 1];
  let appliedDelta = 0;
  let updatedById: Map<string, TimelineClip>;

  if (edge === 'start') {
    if (!previousClip) {
      throw new Error('Roll trim start requires a previous clip on the same track.');
    }
    if (previousClip.locked) {
      throw new Error('Cannot roll trim through a locked neighboring clip.');
    }

    const minDelta = Math.max(MIN_CLIP_DURATION - previousClip.duration, -clip.sourceIn / getClipPlaybackSpeed(clip), -clip.start);
    const maxDelta = clip.duration - MIN_CLIP_DURATION;
    appliedDelta = roundTime(clamp(deltaSeconds, minDelta, maxDelta));
    updatedById = new Map([
      [previousClip.id, {
        ...previousClip,
        duration: roundTime(previousClip.duration + appliedDelta),
      }],
      [clip.id, {
        ...clip,
        start: roundTime(clip.start + appliedDelta),
        sourceIn: roundTime(clip.sourceIn + timelineDeltaToSourceDelta(clip, appliedDelta)),
        duration: roundTime(clip.duration - appliedDelta),
      }],
    ]);
  } else {
    if (!nextClip) {
      throw new Error('Roll trim end requires a next clip on the same track.');
    }
    if (nextClip.locked) {
      throw new Error('Cannot roll trim through a locked neighboring clip.');
    }

    const minDelta = Math.max(MIN_CLIP_DURATION - clip.duration, -nextClip.sourceIn / getClipPlaybackSpeed(nextClip));
    const maxDelta = nextClip.duration - MIN_CLIP_DURATION;
    appliedDelta = roundTime(clamp(deltaSeconds, minDelta, maxDelta));
    updatedById = new Map([
      [clip.id, {
        ...clip,
        duration: roundTime(clip.duration + appliedDelta),
      }],
      [nextClip.id, {
        ...nextClip,
        start: roundTime(nextClip.start + appliedDelta),
        sourceIn: roundTime(nextClip.sourceIn + timelineDeltaToSourceDelta(nextClip, appliedDelta)),
        duration: roundTime(nextClip.duration - appliedDelta),
      }],
    ]);
  }

  return touchProject({
    ...project,
    tracks: project.tracks.map((item) => (
      item.id === track.id
        ? {
          ...item,
          clips: item.clips.map((clipItem) => updatedById.get(clipItem.id) ?? clipItem).sort((a, b) => a.start - b.start),
        }
        : item
    )),
  });
}

export function rollTrimLinkedClip(
  project: EditorProject,
  clipId: string,
  edge: 'start' | 'end',
  deltaSeconds: number,
): EditorProject {
  const linkedIds = expandClipIdsWithLinkedClips(project, [clipId]);
  if (linkedIds.length <= 1) {
    return rollTrimClip(project, clipId, edge, deltaSeconds);
  }

  const contexts = linkedIds.map((id) => buildRollTrimContext(project, id, edge));
  if (contexts.some((context) => context.track.locked || context.clip.locked || context.neighborClip.locked)) {
    throw new Error('Cannot roll trim through a locked track or clip.');
  }

  const minDelta = Math.max(...contexts.map((context) => context.minDelta));
  const maxDelta = Math.min(...contexts.map((context) => context.maxDelta));
  const appliedDelta = roundTime(clamp(deltaSeconds, minDelta, maxDelta));
  const updatesByTrackId = new Map<string, Map<string, TimelineClip>>();

  for (const context of contexts) {
    if (edge === 'start') {
      updatesByTrackId.set(context.track.id, new Map([
        [context.neighborClip.id, {
          ...context.neighborClip,
          duration: roundTime(context.neighborClip.duration + appliedDelta),
        }],
        [context.clip.id, {
          ...context.clip,
          start: roundTime(context.clip.start + appliedDelta),
          sourceIn: roundTime(context.clip.sourceIn + timelineDeltaToSourceDelta(context.clip, appliedDelta)),
          duration: roundTime(context.clip.duration - appliedDelta),
        }],
      ]));
    } else {
      updatesByTrackId.set(context.track.id, new Map([
        [context.clip.id, {
          ...context.clip,
          duration: roundTime(context.clip.duration + appliedDelta),
        }],
        [context.neighborClip.id, {
          ...context.neighborClip,
          start: roundTime(context.neighborClip.start + appliedDelta),
          sourceIn: roundTime(context.neighborClip.sourceIn + timelineDeltaToSourceDelta(context.neighborClip, appliedDelta)),
          duration: roundTime(context.neighborClip.duration - appliedDelta),
        }],
      ]));
    }
  }

  return touchProject({
    ...project,
    tracks: project.tracks.map((track) => {
      const updates = updatesByTrackId.get(track.id);
      if (!updates) {
        return track;
      }

      return {
        ...track,
        clips: track.clips.map((clip) => updates.get(clip.id) ?? clip).sort((a, b) => a.start - b.start),
      };
    }),
  });
}

export function slideClip(project: EditorProject, clipId: string, deltaSeconds: number): EditorProject {
  const track = findTrackForClip(project, clipId);
  if (!track) {
    throw new Error('Clip not found.');
  }

  if (track.locked) {
    throw new Error('Cannot slide a locked track.');
  }

  const sortedClips = [...track.clips].sort((a, b) => a.start - b.start);
  const clipIndex = sortedClips.findIndex((clip) => clip.id === clipId);
  const previousClip = sortedClips[clipIndex - 1];
  const clip = sortedClips[clipIndex];
  const nextClip = sortedClips[clipIndex + 1];
  if (!clip) {
    throw new Error('Clip not found.');
  }

  if (!previousClip || !nextClip) {
    throw new Error('Slide edit requires previous and next clips on the same track.');
  }

  if (previousClip.locked || clip.locked || nextClip.locked) {
    throw new Error('Cannot slide through locked clips.');
  }

  const minDelta = Math.max(
    MIN_CLIP_DURATION - previousClip.duration,
    -nextClip.sourceIn / getClipPlaybackSpeed(nextClip),
    -clip.start,
  );
  const maxDelta = nextClip.duration - MIN_CLIP_DURATION;
  const appliedDelta = roundTime(clamp(deltaSeconds, minDelta, maxDelta));
  const updatedById = new Map([
    [previousClip.id, {
      ...previousClip,
      duration: roundTime(previousClip.duration + appliedDelta),
    }],
    [clip.id, {
      ...clip,
      start: roundTime(clip.start + appliedDelta),
    }],
    [nextClip.id, {
      ...nextClip,
      start: roundTime(nextClip.start + appliedDelta),
      sourceIn: roundTime(nextClip.sourceIn + timelineDeltaToSourceDelta(nextClip, appliedDelta)),
      duration: roundTime(nextClip.duration - appliedDelta),
    }],
  ]);

  return touchProject({
    ...project,
    tracks: project.tracks.map((item) => (
      item.id === track.id
        ? {
          ...item,
          clips: item.clips.map((clipItem) => updatedById.get(clipItem.id) ?? clipItem).sort((a, b) => a.start - b.start),
        }
        : item
    )),
  });
}

export function slideLinkedClip(project: EditorProject, clipId: string, deltaSeconds: number): EditorProject {
  const linkedIds = expandClipIdsWithLinkedClips(project, [clipId]);
  if (linkedIds.length <= 1) {
    return slideClip(project, clipId, deltaSeconds);
  }

  const contexts = linkedIds.map((id) => buildSlideContext(project, id));
  if (contexts.some((context) => context.track.locked || context.previousClip.locked || context.clip.locked || context.nextClip.locked)) {
    throw new Error('Cannot slide through locked clips.');
  }

  const minDelta = Math.max(...contexts.map((context) => context.minDelta));
  const maxDelta = Math.min(...contexts.map((context) => context.maxDelta));
  const appliedDelta = roundTime(clamp(deltaSeconds, minDelta, maxDelta));
  const updatesByTrackId = new Map<string, Map<string, TimelineClip>>();

  for (const context of contexts) {
    updatesByTrackId.set(context.track.id, new Map([
      [context.previousClip.id, {
        ...context.previousClip,
        duration: roundTime(context.previousClip.duration + appliedDelta),
      }],
      [context.clip.id, {
        ...context.clip,
        start: roundTime(context.clip.start + appliedDelta),
      }],
      [context.nextClip.id, {
        ...context.nextClip,
        start: roundTime(context.nextClip.start + appliedDelta),
        sourceIn: roundTime(context.nextClip.sourceIn + timelineDeltaToSourceDelta(context.nextClip, appliedDelta)),
        duration: roundTime(context.nextClip.duration - appliedDelta),
      }],
    ]));
  }

  return touchProject({
    ...project,
    tracks: project.tracks.map((track) => {
      const updates = updatesByTrackId.get(track.id);
      if (!updates) {
        return track;
      }

      return {
        ...track,
        clips: track.clips.map((clip) => updates.get(clip.id) ?? clip).sort((a, b) => a.start - b.start),
      };
    }),
  });
}

export function duplicateClip(project: EditorProject, clipId: string): EditorProject {
  return duplicateClips(project, [clipId], { includeGrouped: false });
}

export function duplicateClips(
  project: EditorProject,
  clipIds: string[],
  options: DuplicateClipsOptions = {},
): EditorProject {
  const requestedIds = clipIds.filter(Boolean);
  if (requestedIds.length === 0) {
    throw new Error('Select at least one clip to duplicate.');
  }

  const expandedIds = expandClipIdsWithLinkedAndGroupedClips(project, requestedIds, {
    includeLinked: options.includeLinked ?? true,
    includeGrouped: options.includeGrouped ?? true,
  });
  const expandedIdSet = new Set(expandedIds);
  const sourceItems = project.tracks.flatMap((track) => (
    track.clips
      .filter((clip) => expandedIdSet.has(clip.id))
      .map((clip) => ({ track, clip }))
  ));
  if (sourceItems.length !== expandedIdSet.size) {
    throw new Error('Clip not found.');
  }

  if (sourceItems.some(({ track, clip }) => track.locked || clip.locked)) {
    throw new Error('Cannot duplicate locked tracks or clips.');
  }

  const sourceClips = sourceItems.map(({ clip }) => clip).sort((a, b) => a.start - b.start);
  const earliestStart = Math.min(...sourceClips.map((clip) => clip.start));
  const latestEnd = Math.max(...sourceClips.map((clip) => clip.start + clip.duration));
  const gap = roundTime(clamp(options.gapSeconds ?? 0.5, 0, 60));
  const pasteStart = findNextNonOverlappingPasteStart(project, sourceClips, roundTime(latestEnd + gap), earliestStart, gap);

  return pasteClipsAtTime(project, sourceClips, pasteStart);
}

export function deleteClip(project: EditorProject, clipId: string, ripple = false): EditorProject {
  const clip = findClip(project, clipId);
  if (!clip) {
    return project;
  }

  return touchProject({
    ...project,
    tracks: project.tracks.map((track) => {
      if (track.id !== clip.trackId) {
        return track;
      }

      const clips = track.clips
        .filter((item) => item.id !== clipId)
        .map((item) => {
          if (!ripple || item.start <= clip.start) {
            return item;
          }

          return {
            ...item,
            start: roundTime(Math.max(0, item.start - clip.duration)),
          };
        })
        .sort((a, b) => a.start - b.start);

      return {
        ...track,
        clips,
      };
    }),
  });
}

export function addTrack(project: EditorProject, kind: TrackKind): EditorProject {
  const sameKindCount = project.tracks.filter((track) => track.kind === kind).length;
  const track: TimelineTrack = {
    id: `track-${kind}-${Date.now()}`,
    name: `${kind[0].toUpperCase()}${kind.slice(1)} ${sameKindCount + 1}`,
    kind,
    muted: false,
    solo: false,
    syncLocked: false,
    volumeDb: 0,
    pan: 0,
    locked: false,
    clips: [],
  };

  return touchProject({
    ...project,
    tracks: [...project.tracks, track],
  });
}

export function updateTrack(project: EditorProject, trackId: string, patch: EditableTrackPatch): EditorProject {
  let didUpdate = false;
  const tracks = project.tracks.map((track) => {
    if (track.id !== trackId) {
      return track;
    }

    const nextName = patch.name === undefined
      ? track.name
      : patch.name.trim();
    if (patch.name !== undefined && nextName.length === 0) {
      throw new Error('Track name cannot be empty.');
    }

    didUpdate = true;
    return {
      ...track,
      ...patch,
      name: nextName,
      muted: patch.muted ?? track.muted,
      solo: patch.solo ?? track.solo,
      syncLocked: patch.syncLocked ?? track.syncLocked,
      volumeDb: patch.volumeDb === undefined ? normalizeTrackVolumeDb(track.volumeDb) : normalizeTrackVolumeDb(patch.volumeDb),
      pan: patch.pan === undefined ? normalizeTrackPan(track.pan) : normalizeTrackPan(patch.pan),
      locked: patch.locked ?? track.locked,
    };
  });

  if (!didUpdate) {
    throw new Error('Track not found.');
  }

  return touchProject({
    ...project,
    tracks,
  });
}

export function removeTrack(
  project: EditorProject,
  trackId: string,
  options: { allowNonEmpty?: boolean } = {},
): EditorProject {
  const track = project.tracks.find((item) => item.id === trackId);
  if (!track) {
    throw new Error('Track not found.');
  }

  if (track.locked) {
    throw new Error('Cannot remove a locked track.');
  }

  if (track.clips.length > 0 && !options.allowNonEmpty) {
    throw new Error('Cannot remove a track that still has clips.');
  }

  return touchProject({
    ...project,
    tracks: project.tracks.filter((item) => item.id !== trackId),
    duration: durationForTracks(project.tracks.filter((item) => item.id !== trackId), project.duration),
  });
}

export function moveTrack(project: EditorProject, trackId: string, direction: 'up' | 'down'): EditorProject {
  const index = project.tracks.findIndex((track) => track.id === trackId);
  if (index === -1) {
    throw new Error('Track not found.');
  }

  const nextIndex = direction === 'up' ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= project.tracks.length) {
    return project;
  }

  const tracks = [...project.tracks];
  const [track] = tracks.splice(index, 1);
  tracks.splice(nextIndex, 0, track);

  return touchProject({
    ...project,
    tracks,
  });
}

export function detachEmbeddedAudio(project: EditorProject, clipId: string): EditorProject {
  const sourceTrack = findTrackForClip(project, clipId);
  const sourceClip = sourceTrack?.clips.find((clip) => clip.id === clipId);
  if (!sourceTrack || !sourceClip) {
    throw new Error('Clip not found.');
  }

  if (sourceTrack.locked || sourceClip.locked) {
    throw new Error('Cannot detach audio from a locked track or clip.');
  }

  if (sourceClip.kind === 'audio') {
    throw new Error('Selected clip is already an audio clip.');
  }

  const asset = sourceClip.assetId ? project.assets.find((item) => item.id === sourceClip.assetId) : undefined;
  if (!hasEmbeddedAudio(asset)) {
    throw new Error('Selected clip has no embedded audio to detach.');
  }

  if (isEmbeddedAudioDisabled(sourceClip) || getDetachedAudioClipId(sourceClip)) {
    throw new Error('Embedded audio is already detached for this clip.');
  }

  const { tracks, targetTrack } = ensureEditableTrack(project.tracks, 'audio');
  if (targetTrack.locked) {
    throw new Error('No editable audio track is available.');
  }

  const audioClipId = `clip-audio-${sourceClip.id}-${Date.now()}`;
  const audioClip = createClip({
    id: audioClipId,
    assetId: sourceClip.assetId,
    trackId: targetTrack.id,
    name: `${sourceClip.name} audio`,
    kind: 'audio',
    start: sourceClip.start,
    duration: sourceClip.duration,
    sourceIn: sourceClip.sourceIn,
    speed: sourceClip.speed,
    volume: sourceClip.volume,
    color: '#84cc16',
    automationTags: withUniqueTags(
      sourceClip.automationTags.filter((tag) => tag === 'caption' || tag === 'loudness' || tag === 'ducking'),
      ['detached-audio', buildLinkedVideoTag(sourceClip.id)],
    ),
    effects: sourceClip.effects.filter((effect) => effect.type === 'audio'),
    keyframes: sourceClip.keyframes.filter((keyframe) => keyframe.property === 'volume'),
  });

  const updatedSourceClip: TimelineClip = {
    ...sourceClip,
    automationTags: withUniqueTags(sourceClip.automationTags, [
      EMBEDDED_AUDIO_DISABLED_TAG,
      buildDetachedAudioTag(audioClip.id),
    ]),
  };

  const nextTracks = tracks.map((track) => {
    if (track.id === sourceTrack.id) {
      return {
        ...track,
        clips: track.clips.map((clip) => (clip.id === sourceClip.id ? updatedSourceClip : clip)),
      };
    }

    if (track.id === targetTrack.id) {
      return {
        ...track,
        clips: [...track.clips, audioClip].sort((a, b) => a.start - b.start),
      };
    }

    return track;
  });

  return touchProject({
    ...project,
    tracks: nextTracks,
  });
}

export function relinkDetachedAudio(project: EditorProject, clipId: string): EditorProject {
  const selectedTrack = findTrackForClip(project, clipId);
  const selectedClip = selectedTrack?.clips.find((clip) => clip.id === clipId);
  if (!selectedTrack || !selectedClip) {
    throw new Error('Clip not found.');
  }

  const linkedVideoClipId = getLinkedVideoClipId(selectedClip);
  const videoClip = linkedVideoClipId ? findClip(project, linkedVideoClipId) : selectedClip;
  if (!videoClip) {
    throw new Error('Linked video clip not found.');
  }

  const videoTrack = findTrackForClip(project, videoClip.id);
  if (!videoTrack) {
    throw new Error('Linked video track not found.');
  }

  const detachedAudioClipId = linkedVideoClipId ? selectedClip.id : getDetachedAudioClipId(videoClip);
  if (!detachedAudioClipId) {
    throw new Error('Selected clip has no detached audio link.');
  }

  const audioTrack = findTrackForClip(project, detachedAudioClipId);
  const audioClip = audioTrack?.clips.find((clip) => clip.id === detachedAudioClipId);
  if (videoTrack.locked || videoClip.locked || audioTrack?.locked || audioClip?.locked) {
    throw new Error('Cannot relink audio through a locked track or clip.');
  }

  const nextTracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips
      .flatMap((clip) => {
        if (clip.id === videoClip.id) {
          return [{
            ...clip,
            automationTags: withoutEmbeddedAudioLinkTags(clip.automationTags),
          }];
        }

        if (clip.id === detachedAudioClipId) {
          return [];
        }

        return [clip];
      })
      .sort((a, b) => a.start - b.start),
  }));

  return touchProject({
    ...project,
    tracks: nextTracks,
  });
}

export function unlinkLinkedClips(project: EditorProject, clipId: string): EditorProject {
  const linkedIds = expandClipIdsWithLinkedClips(project, [clipId]);
  if (linkedIds.length <= 1) {
    throw new Error('Selected clip has no linked audio/video pair.');
  }

  const linkedIdSet = new Set(linkedIds);
  const linkedItems = project.tracks.flatMap((track) => (
    track.clips
      .filter((clip) => linkedIdSet.has(clip.id))
      .map((clip) => ({ track, clip }))
  ));

  if (linkedItems.some(({ track, clip }) => track.locked || clip.locked)) {
    throw new Error('Cannot unlink locked clips.');
  }

  return touchProject({
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => (
        linkedIdSet.has(clip.id)
          ? { ...clip, automationTags: stripClipLinkTags(clip.automationTags, { preserveEmbeddedAudioDisabled: true }) }
          : clip
      )),
    })),
  });
}

export function applyLinkedAudioSplitEdit(
  project: EditorProject,
  clipId: string,
  edge: 'start' | 'end',
  deltaSeconds: number,
): EditorProject {
  if (!Number.isFinite(deltaSeconds) || Math.abs(deltaSeconds) < 0.001) {
    return project;
  }

  const pair = findLinkedAudioPair(project, clipId);
  if (pair.videoTrack.locked || pair.audioTrack.locked || pair.videoClip.locked || pair.audioClip.locked) {
    throw new Error('Cannot apply a J/L cut through a locked track or clip.');
  }

  const asset = pair.audioClip.assetId ? project.assets.find((item) => item.id === pair.audioClip.assetId) : undefined;
  const nextAudioClip = edge === 'start'
    ? applyLinkedAudioHeadSplitEdit(pair.audioTrack, pair.audioClip, deltaSeconds)
    : applyLinkedAudioTailSplitEdit(pair.audioTrack, pair.audioClip, asset, deltaSeconds);

  if (
    Math.abs(nextAudioClip.start - pair.audioClip.start) < 0.001 &&
    Math.abs(nextAudioClip.duration - pair.audioClip.duration) < 0.001 &&
    Math.abs(nextAudioClip.sourceIn - pair.audioClip.sourceIn) < 0.001
  ) {
    return project;
  }

  return touchProject({
    ...project,
    duration: Math.max(project.duration, nextAudioClip.start + nextAudioClip.duration),
    tracks: project.tracks.map((track) => (
      track.id === pair.audioTrack.id
        ? {
          ...track,
          clips: track.clips.map((clip) => (clip.id === nextAudioClip.id ? nextAudioClip : clip)).sort((a, b) => a.start - b.start),
        }
        : track
    )),
  });
}

export function linkAudioVideoClips(project: EditorProject, videoClipId: string, audioClipId: string): EditorProject {
  const videoTrack = findTrackForClip(project, videoClipId);
  const audioTrack = findTrackForClip(project, audioClipId);
  const videoClip = videoTrack?.clips.find((clip) => clip.id === videoClipId);
  const audioClip = audioTrack?.clips.find((clip) => clip.id === audioClipId);

  if (!videoTrack || !audioTrack || !videoClip || !audioClip) {
    throw new Error('Select both a video/image clip and an audio clip first.');
  }

  const videoAsset = videoClip.assetId ? project.assets.find((asset) => asset.id === videoClip.assetId) : undefined;
  const audioAsset = audioClip.assetId ? project.assets.find((asset) => asset.id === audioClip.assetId) : undefined;
  const videoClipIsAudio = videoClip.kind === 'audio' || resolveRenderableAssetMediaKind(videoAsset) === 'audio';
  const videoClipIsVisual = videoClip.kind === 'video' || videoClip.kind === 'image' || isRenderableVisualMediaAsset(videoAsset);
  const audioClipIsAudio = audioClip.kind === 'audio' || resolveRenderableAssetMediaKind(audioAsset) === 'audio';
  if (videoClipIsAudio || !videoClipIsVisual || !audioClipIsAudio) {
    throw new Error('Select one visual clip and one audio clip to link.');
  }

  if (videoTrack.locked || audioTrack.locked || videoClip.locked || audioClip.locked) {
    throw new Error('Cannot link locked clips.');
  }

  const linkedIdsToStrip = new Set([
    ...expandClipIdsWithLinkedClips(project, [videoClipId]),
    ...expandClipIdsWithLinkedClips(project, [audioClipId]),
  ]);
  return touchProject({
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => {
        const strippedClip = linkedIdsToStrip.has(clip.id)
          ? { ...clip, automationTags: stripClipLinkTags(clip.automationTags, { preserveEmbeddedAudioDisabled: true }) }
          : clip;

        if (clip.id === videoClip.id) {
          return {
            ...strippedClip,
            automationTags: withUniqueTags(strippedClip.automationTags, [
              ...(hasEmbeddedAudio(videoAsset) ? [EMBEDDED_AUDIO_DISABLED_TAG] : []),
              buildDetachedAudioTag(audioClip.id),
            ]),
          };
        }

        if (clip.id === audioClip.id) {
          return {
            ...strippedClip,
            automationTags: withUniqueTags(strippedClip.automationTags, [
              'detached-audio',
              buildLinkedVideoTag(videoClip.id),
            ]),
          };
        }

        return strippedClip;
      }),
    })),
  });
}

export function applyTransition(
  project: EditorProject,
  clipId: string,
  type: SupportedTransitionType,
  options: TransitionEditOptions = {},
): EditorProject {
  return updateTransitionForClip(project, clipId, (clip) => ({
    id: `transition-${clip.id}-${Date.now()}`,
    type,
    duration: type === 'ai-morph' ? 1.2 : 0.5,
    easing: 'easeInOut',
    parameters: defaultTransitionParameters(type),
  }), options);
}

export function upsertClipTransition(
  project: EditorProject,
  clipId: string,
  transition: SupportedTransition,
  options: TransitionEditOptions = {},
): EditorProject {
  return updateTransitionForClip(project, clipId, (clip) => ({
    ...transition,
    id: transition.id.trim() || `transition-${clip.id}-${Date.now()}`,
    duration: roundTime(clamp(transition.duration, 0.05, Math.max(0.05, clip.duration))),
    easing: transition.easing,
    parameters: {
      ...defaultTransitionParameters(transition.type),
      ...transition.parameters,
    },
  }), options);
}

export function updateClipTransition(
  project: EditorProject,
  clipId: string,
  patch: EditableTransitionPatch,
  options: TransitionEditOptions = {},
): EditorProject {
  return updateTransitionForClip(project, clipId, (clip) => {
    if (!clip.transitionOut) {
      throw new Error('Clip has no outgoing transition.');
    }

    const nextType = patch.type ?? clip.transitionOut.type;
    return {
      ...clip.transitionOut,
      ...patch,
      type: nextType,
      duration: patch.duration === undefined
        ? clip.transitionOut.duration
        : roundTime(clamp(patch.duration, 0.05, Math.max(0.05, clip.duration))),
      parameters: {
        ...defaultTransitionParameters(nextType),
        ...clip.transitionOut.parameters,
        ...patch.parameters,
      },
    };
  }, options);
}

export function removeClipTransition(project: EditorProject, clipId: string): EditorProject {
  return updateTransitionForClip(project, clipId, () => undefined);
}

export function updateClipTransitionForClips(
  project: EditorProject,
  clipIds: string[],
  patch: EditableTransitionPatch,
  options: TransitionEditOptions = {},
): ClipBatchEditResult {
  const requestedIds = clipIds.filter(Boolean);
  if (requestedIds.length === 0) {
    throw new Error('No target clips selected.');
  }

  const targetIds = expandClipIdsWithLinkedAndGroupedClips(project, requestedIds);
  if (targetIds.length === 0) {
    throw new Error('Target clip not found.');
  }

  let nextProject = project;
  const updatedClipIds: string[] = [];
  const skipped: ClipBatchEditSkippedClip[] = [];

  for (const clipId of targetIds) {
    const clip = findClip(nextProject, clipId);
    if (!clip) {
      skipped.push({ clipId, reason: 'Clip not found.' });
      continue;
    }

    if (!clip.transitionOut) {
      skipped.push({ clipId: clip.id, reason: 'Clip has no outgoing transition.' });
      continue;
    }

    try {
      nextProject = updateClipTransition(nextProject, clip.id, patch, options);
      updatedClipIds.push(clip.id);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('locked track') || message.includes('locked clip') || message.includes('locked track or clip')) {
        throw error;
      }

      skipped.push({ clipId: clip.id, reason: message });
    }
  }

  if (updatedClipIds.length === 0) {
    const reason = skipped[0]?.reason;
    throw new Error(reason ? `No selected clips could update transitions: ${reason}` : 'No selected clips could update transitions.');
  }

  return {
    project: nextProject,
    updatedClipIds,
    skipped,
  };
}

export function applyTransitionToClips(
  project: EditorProject,
  clipIds: string[],
  type: SupportedTransitionType,
  options: TransitionEditOptions = {},
): ClipBatchEditResult {
  const requestedIds = clipIds.filter(Boolean);
  if (requestedIds.length === 0) {
    throw new Error('No target clips selected.');
  }

  const targetIds = expandClipIdsWithLinkedAndGroupedClips(project, requestedIds);
  if (targetIds.length === 0) {
    throw new Error('Target clip not found.');
  }

  let nextProject = project;
  const updatedClipIds: string[] = [];
  const skipped: ClipBatchEditSkippedClip[] = [];

  for (const clipId of targetIds) {
    const clip = findClip(nextProject, clipId);
    if (!clip) {
      skipped.push({ clipId, reason: 'Clip not found.' });
      continue;
    }

    try {
      nextProject = applyTransition(nextProject, clip.id, type, options);
      updatedClipIds.push(clip.id);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('locked track') || message.includes('locked clip') || message.includes('locked track or clip')) {
        throw error;
      }

      skipped.push({ clipId: clip.id, reason: message });
    }
  }

  if (updatedClipIds.length === 0) {
    const reason = skipped[0]?.reason;
    throw new Error(reason ? `No selected clips could receive transition: ${reason}` : 'No selected clips could receive transition.');
  }

  return {
    project: nextProject,
    updatedClipIds,
    skipped,
  };
}

export function removeClipTransitionFromClips(
  project: EditorProject,
  clipIds: string[],
): ClipBatchEditResult {
  const requestedIds = clipIds.filter(Boolean);
  if (requestedIds.length === 0) {
    throw new Error('No target clips selected.');
  }

  const targetIds = expandClipIdsWithLinkedAndGroupedClips(project, requestedIds);
  if (targetIds.length === 0) {
    throw new Error('Target clip not found.');
  }

  let nextProject = project;
  const updatedClipIds: string[] = [];
  const skipped: ClipBatchEditSkippedClip[] = [];

  for (const clipId of targetIds) {
    const clip = findClip(nextProject, clipId);
    if (!clip) {
      skipped.push({ clipId, reason: 'Clip not found.' });
      continue;
    }

    if (!clip.transitionOut) {
      skipped.push({ clipId: clip.id, reason: 'Clip has no outgoing transition.' });
      continue;
    }

    try {
      nextProject = removeClipTransition(nextProject, clip.id);
      updatedClipIds.push(clip.id);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('locked track') || message.includes('locked clip') || message.includes('locked track or clip')) {
        throw error;
      }

      skipped.push({ clipId: clip.id, reason: message });
    }
  }

  if (updatedClipIds.length === 0) {
    const reason = skipped[0]?.reason;
    throw new Error(reason ? `No selected clips had outgoing transitions: ${reason}` : 'No selected clips had outgoing transitions.');
  }

  return {
    project: nextProject,
    updatedClipIds,
    skipped,
  };
}

export function addClipKeyframe(
  project: EditorProject,
  clipId: string,
  property: ClipKeyframe['property'],
  time: number,
  value: number,
  easing: ClipKeyframe['easing'] = 'smooth',
): EditorProject {
  return updateKeyframesForClip(project, clipId, (clip) => sortClipKeyframes([
    ...clip.keyframes,
    {
      id: `kf-${clip.id}-${property}-${Date.now()}-${clip.keyframes.length + 1}`,
      property,
      time: normalizeKeyframeTime(clip, time),
      value: normalizeKeyframeValue(property, value),
      easing,
    },
  ]));
}

export function updateClipKeyframe(
  project: EditorProject,
  clipId: string,
  keyframeId: string,
  patch: EditableKeyframePatch,
): EditorProject {
  let keyframeFound = false;

  const nextProject = updateKeyframesForClip(project, clipId, (clip) => sortClipKeyframes(clip.keyframes.map((keyframe) => {
    if (keyframe.id !== keyframeId) {
      return keyframe;
    }

    keyframeFound = true;
    return {
      ...keyframe,
      time: patch.time === undefined ? keyframe.time : normalizeKeyframeTime(clip, patch.time),
      value: patch.value === undefined ? keyframe.value : normalizeKeyframeValue(keyframe.property, patch.value),
      easing: patch.easing ?? keyframe.easing,
    };
  })));

  if (!keyframeFound) {
    throw new Error('Keyframe not found.');
  }

  return nextProject;
}

export function deleteClipKeyframe(project: EditorProject, clipId: string, keyframeId: string): EditorProject {
  let keyframeFound = false;

  const nextProject = updateKeyframesForClip(project, clipId, (clip) => (
    clip.keyframes.filter((keyframe) => {
      const keep = keyframe.id !== keyframeId;
      keyframeFound ||= !keep;
      return keep;
    })
  ));

  if (!keyframeFound) {
    throw new Error('Keyframe not found.');
  }

  return nextProject;
}

export function applyAudioFade(
  project: EditorProject,
  clipId: string,
  edge: AudioFadeEdge,
  duration = 1,
): EditorProject {
  const track = findTrackForClip(project, clipId);
  const clip = track?.clips.find((item) => item.id === clipId);
  if (!track || !clip) {
    throw new Error('Clip not found.');
  }

  const asset = clip.assetId ? project.assets.find((item) => item.id === clip.assetId) : undefined;
  if (!clipHasTimelineAudio(clip, asset)) {
    throw new Error('Selected clip has no timeline audio.');
  }

  if (track.locked || clip.locked) {
    throw new Error('Cannot edit audio fades on a locked track or clip.');
  }

  const fadeDuration = normalizeAudioFadeDuration(clip, edge, duration);
  return updateKeyframesForClip(project, clipId, (currentClip) => (
    buildAudioFadeKeyframes(currentClip, edge, fadeDuration)
  ));
}

export function applyAudioFadeToClips(
  project: EditorProject,
  clipIds: string[],
  edge: AudioFadeEdge,
  duration = 1,
): ClipBatchEditResult {
  const requestedIds = clipIds.filter(Boolean);
  if (requestedIds.length === 0) {
    throw new Error('No target clips selected.');
  }

  const targetIds = expandClipIdsWithLinkedAndGroupedClips(project, requestedIds);
  if (targetIds.length === 0) {
    throw new Error('Target clip not found.');
  }

  let nextProject = project;
  const updatedClipIds: string[] = [];
  const skipped: ClipBatchEditSkippedClip[] = [];

  for (const clipId of targetIds) {
    const clip = findClip(nextProject, clipId);
    if (!clip) {
      skipped.push({ clipId, reason: 'Clip not found.' });
      continue;
    }

    try {
      nextProject = applyAudioFade(nextProject, clip.id, edge, duration);
      updatedClipIds.push(clip.id);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('locked track') || message.includes('locked clip') || message.includes('locked track or clip')) {
        throw error;
      }

      skipped.push({ clipId: clip.id, reason: message });
    }
  }

  if (updatedClipIds.length === 0) {
    const reason = skipped[0]?.reason;
    throw new Error(reason ? `No selected clips could receive audio fade: ${reason}` : 'No selected clips could receive audio fade.');
  }

  return {
    project: nextProject,
    updatedClipIds,
    skipped,
  };
}

export function applyVisualFade(
  project: EditorProject,
  clipId: string,
  edge: VisualFadeEdge,
  duration = 1,
): EditorProject {
  const track = findTrackForClip(project, clipId);
  const clip = track?.clips.find((item) => item.id === clipId);
  if (!track || !clip) {
    throw new Error('Clip not found.');
  }

  const asset = clip.assetId ? project.assets.find((item) => item.id === clip.assetId) : undefined;
  if (!clipHasVisualLayer(clip, asset)) {
    throw new Error('Selected clip has no visual layer.');
  }

  if (track.locked || clip.locked) {
    throw new Error('Cannot edit visual fades on a locked track or clip.');
  }

  const fadeDuration = normalizeVisualFadeDuration(clip, edge, duration);
  return updateKeyframesForClip(project, clipId, (currentClip) => (
    buildVisualFadeKeyframes(currentClip, edge, fadeDuration)
  ));
}

export function applyVisualFadeToClips(
  project: EditorProject,
  clipIds: string[],
  edge: VisualFadeEdge,
  duration = 1,
): ClipBatchEditResult {
  const requestedIds = clipIds.filter(Boolean);
  if (requestedIds.length === 0) {
    throw new Error('No target clips selected.');
  }

  const targetIds = expandClipIdsWithLinkedAndGroupedClips(project, requestedIds);
  if (targetIds.length === 0) {
    throw new Error('Target clip not found.');
  }

  let nextProject = project;
  const updatedClipIds: string[] = [];
  const skipped: ClipBatchEditSkippedClip[] = [];

  for (const clipId of targetIds) {
    const clip = findClip(nextProject, clipId);
    if (!clip) {
      skipped.push({ clipId, reason: 'Clip not found.' });
      continue;
    }

    try {
      nextProject = applyVisualFade(nextProject, clip.id, edge, duration);
      updatedClipIds.push(clip.id);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('locked track') || message.includes('locked clip') || message.includes('locked track or clip')) {
        throw error;
      }

      skipped.push({ clipId: clip.id, reason: message });
    }
  }

  if (updatedClipIds.length === 0) {
    const reason = skipped[0]?.reason;
    throw new Error(reason ? `No selected clips could receive visual fade: ${reason}` : 'No selected clips could receive visual fade.');
  }

  return {
    project: nextProject,
    updatedClipIds,
    skipped,
  };
}

export function applyMotionPreset(
  project: EditorProject,
  clipId: string,
  presetId: MotionPresetId,
): EditorProject {
  const preset = MOTION_PRESETS.find((item) => item.id === presetId);
  if (!preset) {
    throw new Error('Motion preset not found.');
  }

  const track = findTrackForClip(project, clipId);
  const clip = track?.clips.find((item) => item.id === clipId);
  if (!track || !clip) {
    throw new Error('Clip not found.');
  }

  const asset = clip.assetId ? project.assets.find((item) => item.id === clip.assetId) : undefined;
  if (!clipHasVisualLayer(clip, asset)) {
    throw new Error('Motion presets are available for visual clips.');
  }

  if (track.locked || clip.locked) {
    throw new Error('Cannot edit motion presets on a locked track or clip.');
  }

  return updateKeyframesForClip(project, clipId, (currentClip) => (
    buildMotionPresetKeyframes(currentClip, preset)
  ));
}

export function applyMotionPresetToClips(
  project: EditorProject,
  clipIds: string[],
  presetId: MotionPresetId,
): ClipBatchEditResult {
  const preset = MOTION_PRESETS.find((item) => item.id === presetId);
  if (!preset) {
    throw new Error('Motion preset not found.');
  }

  const requestedIds = clipIds.filter(Boolean);
  if (requestedIds.length === 0) {
    throw new Error('No target clips selected.');
  }

  const targetIds = expandClipIdsWithLinkedAndGroupedClips(project, requestedIds);
  if (targetIds.length === 0) {
    throw new Error('Target clip not found.');
  }

  let nextProject = project;
  const updatedClipIds: string[] = [];
  const skipped: ClipBatchEditSkippedClip[] = [];

  for (const clipId of targetIds) {
    const clip = findClip(nextProject, clipId);
    if (!clip) {
      skipped.push({ clipId, reason: 'Clip not found.' });
      continue;
    }

    try {
      nextProject = applyMotionPreset(nextProject, clip.id, preset.id);
      updatedClipIds.push(clip.id);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('locked track') || message.includes('locked clip') || message.includes('locked track or clip')) {
        throw error;
      }

      skipped.push({ clipId: clip.id, reason: message });
    }
  }

  if (updatedClipIds.length === 0) {
    const reason = skipped[0]?.reason;
    throw new Error(reason ? `No selected clips could receive motion preset: ${reason}` : 'No selected clips could receive motion preset.');
  }

  return {
    project: nextProject,
    updatedClipIds,
    skipped,
  };
}

export function applyFreezeFrame(
  project: EditorProject,
  clipId: string,
  freezeFrameTime: number,
): EditorProject {
  return updateFreezeFrameForClip(project, clipId, (clip, asset) => {
    if (resolveRenderableAssetMediaKind(asset) !== 'video') {
      throw new Error('Freeze frame is available for video clips.');
    }

    return normalizeFreezeFrameTime(clip, freezeFrameTime);
  });
}

export function applyFreezeFrameAtTimelineTimeToClips(
  project: EditorProject,
  clipIds: string[],
  timelineTime: number,
): ClipBatchEditResult {
  const requestedIds = clipIds.filter(Boolean);
  if (requestedIds.length === 0) {
    throw new Error('No target clips selected.');
  }

  const targetIds = expandClipIdsWithLinkedAndGroupedClips(project, requestedIds);
  if (targetIds.length === 0) {
    throw new Error('Target clip not found.');
  }

  let nextProject = project;
  const updatedClipIds: string[] = [];
  const skipped: ClipBatchEditSkippedClip[] = [];

  for (const clipId of targetIds) {
    const clip = findClip(nextProject, clipId);
    if (!clip) {
      skipped.push({ clipId, reason: 'Clip not found.' });
      continue;
    }

    const localTime = roundTime(clamp(timelineTime - clip.start, 0, clip.duration));
    try {
      nextProject = applyFreezeFrame(nextProject, clip.id, localTime);
      updatedClipIds.push(clip.id);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('locked track') || message.includes('locked clip') || message.includes('locked track or clip')) {
        throw error;
      }

      skipped.push({ clipId: clip.id, reason: message });
    }
  }

  if (updatedClipIds.length === 0) {
    const reason = skipped[0]?.reason;
    throw new Error(reason ? `No selected clips could receive freeze frame: ${reason}` : 'No selected clips could receive freeze frame.');
  }

  return {
    project: nextProject,
    updatedClipIds,
    skipped,
  };
}

export function clearFreezeFrame(project: EditorProject, clipId: string): EditorProject {
  return updateFreezeFrameForClip(project, clipId, () => undefined);
}

export function clearFreezeFrameFromClips(
  project: EditorProject,
  clipIds: string[],
): ClipBatchEditResult {
  const requestedIds = clipIds.filter(Boolean);
  if (requestedIds.length === 0) {
    throw new Error('No target clips selected.');
  }

  const targetIds = expandClipIdsWithLinkedAndGroupedClips(project, requestedIds);
  if (targetIds.length === 0) {
    throw new Error('Target clip not found.');
  }

  let nextProject = project;
  const updatedClipIds: string[] = [];
  const skipped: ClipBatchEditSkippedClip[] = [];

  for (const clipId of targetIds) {
    const clip = findClip(nextProject, clipId);
    if (!clip) {
      skipped.push({ clipId, reason: 'Clip not found.' });
      continue;
    }

    try {
      nextProject = clearFreezeFrame(nextProject, clip.id);
      updatedClipIds.push(clip.id);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('locked track') || message.includes('locked clip') || message.includes('locked track or clip')) {
        throw error;
      }

      skipped.push({ clipId: clip.id, reason: message });
    }
  }

  if (updatedClipIds.length === 0) {
    const reason = skipped[0]?.reason;
    throw new Error(reason ? `No selected clips could clear freeze frame: ${reason}` : 'No selected clips could clear freeze frame.');
  }

  return {
    project: nextProject,
    updatedClipIds,
    skipped,
  };
}

function updateTransitionForClip(
  project: EditorProject,
  clipId: string,
  buildTransition: (clip: TimelineClip) => TimelineTransitionOut | undefined,
  options: TransitionEditOptions = {},
): EditorProject {
  let updated = false;
  let nextTransition: TimelineTransitionOut | undefined;

  const tracks = project.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => {
        if (clip.id !== clipId) {
          return clip;
        }

        if (track.locked || clip.locked) {
          throw new Error('Cannot edit a transition on a locked track or clip.');
        }

        updated = true;
        const transitionOut = buildTransition(clip);
        nextTransition = transitionOut;
        return {
          ...clip,
          transitionOut,
        };
      }),
    }));

  if (!updated) {
    throw new Error('Clip not found.');
  }

  const nextProject = {
    ...project,
    tracks,
  };

  return touchProject(
    options.autoOverlap && nextTransition
      ? createTransitionOverlap(nextProject, clipId, nextTransition.duration)
      : nextProject,
  );
}

function createTransitionOverlap(
  project: EditorProject,
  clipId: string,
  requestedDuration: number,
): EditorProject {
  const track = findTrackForClip(project, clipId);
  if (!track) {
    throw new Error('Clip not found.');
  }

  const sortedClips = [...track.clips].sort((a, b) => a.start - b.start);
  const clipIndex = sortedClips.findIndex((clip) => clip.id === clipId);
  const clip = sortedClips[clipIndex];
  const nextClip = sortedClips[clipIndex + 1];
  if (!clip || !nextClip) {
    throw new Error('Outgoing transition requires a next clip on the same track.');
  }

  const duration = roundTime(clamp(requestedDuration, 0.05, Math.min(clip.duration, nextClip.duration)));
  const clipEnd = roundTime(clip.start + clip.duration);
  const targetNextStart = roundTime(clipEnd - duration);
  const shift = roundTime(nextClip.start - targetNextStart);
  if (Math.abs(shift) <= 0.001) {
    return project;
  }

  if (track.locked || clip.locked || nextClip.locked) {
    throw new Error('Cannot create transition overlap through locked clips.');
  }

  const downstreamIds = sortedClips.slice(clipIndex + 1).map((item) => item.id);
  const movingClipIds = new Set(expandClipIdsWithLinkedClips(project, downstreamIds));
  const movingItems = project.tracks.flatMap((item) => (
    item.clips
      .filter((timelineClip) => movingClipIds.has(timelineClip.id))
      .map((timelineClip) => ({ track: item, clip: timelineClip }))
  ));
  if (movingItems.some((item) => item.track.locked || item.clip.locked)) {
    throw new Error('Cannot create transition overlap through locked clips.');
  }

  return {
    ...project,
    tracks: project.tracks.map((item) => ({
      ...item,
      clips: item.clips.map((timelineClip) => (
        movingClipIds.has(timelineClip.id)
          ? { ...timelineClip, start: roundTime(Math.max(0, timelineClip.start - shift)) }
          : timelineClip
      )).sort((a, b) => a.start - b.start),
    })),
  };
}

function updateKeyframesForClip(
  project: EditorProject,
  clipId: string,
  buildKeyframes: (clip: TimelineClip) => ClipKeyframe[],
): EditorProject {
  let updated = false;

  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (clip.id !== clipId) {
        return clip;
      }

      if (track.locked || clip.locked) {
        throw new Error('Cannot edit keyframes on a locked track or clip.');
      }

      updated = true;
      return {
        ...clip,
        keyframes: buildKeyframes(clip),
      };
    }),
  }));

  if (!updated) {
    throw new Error('Clip not found.');
  }

  return touchProject({
    ...project,
    tracks,
  });
}

function updateFreezeFrameForClip(
  project: EditorProject,
  clipId: string,
  buildFreezeFrameTime: (clip: TimelineClip, asset?: EditorAsset) => number | undefined,
): EditorProject {
  let updated = false;

  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (clip.id !== clipId) {
        return clip;
      }

      if (track.locked || clip.locked) {
        throw new Error('Cannot edit freeze frame on a locked track or clip.');
      }

      const asset = clip.assetId ? project.assets.find((item) => item.id === clip.assetId) : undefined;
      updated = true;
      return {
        ...clip,
        freezeFrameTime: buildFreezeFrameTime(clip, asset),
      };
    }),
  }));

  if (!updated) {
    throw new Error('Clip not found.');
  }

  return touchProject({
    ...project,
    tracks,
  });
}

function defaultTransitionParameters(type: TimelineTransitionOut['type']): TimelineTransitionOut['parameters'] {
  if (type === 'ai-morph') {
    return { provider: 'comfyui', workflowPreset: 'transition-morph', temporalConsistency: true, preserveAudio: true };
  }

  if (type === 'push' || type === 'wipe') {
    return { preserveAudio: true, direction: 'left' };
  }

  return { preserveAudio: true };
}

function sortClipKeyframes(keyframes: ClipKeyframe[]): ClipKeyframe[] {
  return keyframes.slice().sort((a, b) => {
    const propertyDelta = keyframePropertyOrder(a.property) - keyframePropertyOrder(b.property);
    if (propertyDelta !== 0) {
      return propertyDelta;
    }

    return a.time - b.time;
  });
}

function keyframePropertyOrder(property: ClipKeyframe['property']): number {
  switch (property) {
    case 'positionX':
      return 0;
    case 'positionY':
      return 1;
    case 'scale':
      return 2;
    case 'rotation':
      return 3;
    case 'opacity':
      return 4;
    case 'volume':
      return 5;
    default:
      return 99;
  }
}

function normalizeKeyframeTime(clip: TimelineClip, time: number): number {
  return roundTime(clamp(time, 0, Math.max(0, clip.duration)));
}

function normalizeKeyframeValue(property: ClipKeyframe['property'], value: number): number {
  switch (property) {
    case 'positionX':
    case 'positionY':
      return roundTime(clamp(value, -200, 200));
    case 'scale':
      return roundTime(clamp(value, 0.05, 8));
    case 'rotation':
      return roundTime(clamp(value, -360, 360));
    case 'opacity':
      return roundTime(clamp(value, 0, 1));
    case 'volume':
      return normalizeClipVolume(value);
    default:
      return roundTime(Number.isFinite(value) ? value : 0);
  }
}

function normalizeAudioFadeDuration(clip: TimelineClip, edge: AudioFadeEdge, duration: number): number {
  const maxDuration = Math.max(0.001, edge === 'both' ? clip.duration / 2 : clip.duration);
  const minDuration = Math.min(0.05, maxDuration);
  return roundTime(clamp(duration, minDuration, maxDuration));
}

function normalizeVisualFadeDuration(clip: TimelineClip, edge: VisualFadeEdge, duration: number): number {
  const maxDuration = Math.max(0.001, edge === 'both' ? clip.duration / 2 : clip.duration);
  const minDuration = Math.min(0.05, maxDuration);
  return roundTime(clamp(duration, minDuration, maxDuration));
}

function normalizeFreezeFrameTime(clip: TimelineClip, time: number | undefined): number | undefined {
  if (typeof time !== 'number' || !Number.isFinite(time)) {
    return undefined;
  }

  return roundTime(clamp(time, 0, Math.max(0, clip.duration)));
}

function sliceClipFreezeFrameTime(
  clip: TimelineClip,
  sliceStart: number,
  sliceDuration: number,
): number | undefined {
  if (typeof clip.freezeFrameTime !== 'number' || !Number.isFinite(clip.freezeFrameTime)) {
    return undefined;
  }

  return normalizeFreezeFrameTime(
    { ...clip, duration: sliceDuration },
    clip.freezeFrameTime - sliceStart,
  );
}

function buildAudioFadeKeyframes(
  clip: TimelineClip,
  edge: AudioFadeEdge,
  fadeDuration: number,
): ClipKeyframe[] {
  const fadeInEnd = roundTime(fadeDuration);
  const fadeOutStart = roundTime(Math.max(0, clip.duration - fadeDuration));
  const appliesFadeIn = edge === 'in' || edge === 'both';
  const appliesFadeOut = edge === 'out' || edge === 'both';
  const preservedKeyframes = clip.keyframes.filter((keyframe) => {
    if (keyframe.property !== 'volume') {
      return true;
    }

    if (appliesFadeIn && keyframe.time <= fadeInEnd + 0.001) {
      return false;
    }

    if (appliesFadeOut && keyframe.time >= fadeOutStart - 0.001) {
      return false;
    }

    return true;
  });
  const generated: ClipKeyframe[] = [];

  if (appliesFadeIn) {
    generated.push(
      {
        id: `kf-${clip.id}-audio-fade-in-start`,
        property: 'volume',
        time: 0,
        value: 0,
        easing: 'linear',
      },
      {
        id: `kf-${clip.id}-audio-fade-in-end`,
        property: 'volume',
        time: fadeInEnd,
        value: evaluateClipVolumeAt(clip, fadeInEnd),
        easing: 'linear',
      },
    );
  }

  if (appliesFadeOut) {
    generated.push(
      {
        id: `kf-${clip.id}-audio-fade-out-start`,
        property: 'volume',
        time: fadeOutStart,
        value: evaluateClipVolumeAt(clip, fadeOutStart),
        easing: 'linear',
      },
      {
        id: `kf-${clip.id}-audio-fade-out-end`,
        property: 'volume',
        time: roundTime(clip.duration),
        value: 0,
        easing: 'linear',
      },
    );
  }

  return dedupeClipKeyframesByPropertyTime(sortClipKeyframes([
    ...preservedKeyframes,
    ...generated,
  ]));
}

function buildVisualFadeKeyframes(
  clip: TimelineClip,
  edge: VisualFadeEdge,
  fadeDuration: number,
): ClipKeyframe[] {
  const fadeInEnd = roundTime(fadeDuration);
  const fadeOutStart = roundTime(Math.max(0, clip.duration - fadeDuration));
  const appliesFadeIn = edge === 'in' || edge === 'both';
  const appliesFadeOut = edge === 'out' || edge === 'both';
  const preservedKeyframes = clip.keyframes.filter((keyframe) => {
    if (keyframe.property !== 'opacity') {
      return true;
    }

    if (appliesFadeIn && keyframe.time <= fadeInEnd + 0.001) {
      return false;
    }

    if (appliesFadeOut && keyframe.time >= fadeOutStart - 0.001) {
      return false;
    }

    return true;
  });
  const generated: ClipKeyframe[] = [];

  if (appliesFadeIn) {
    generated.push(
      {
        id: `kf-${clip.id}-visual-fade-in-start`,
        property: 'opacity',
        time: 0,
        value: 0,
        easing: 'linear',
      },
      {
        id: `kf-${clip.id}-visual-fade-in-end`,
        property: 'opacity',
        time: fadeInEnd,
        value: evaluateClipOpacityAt(clip, fadeInEnd),
        easing: 'linear',
      },
    );
  }

  if (appliesFadeOut) {
    generated.push(
      {
        id: `kf-${clip.id}-visual-fade-out-start`,
        property: 'opacity',
        time: fadeOutStart,
        value: evaluateClipOpacityAt(clip, fadeOutStart),
        easing: 'linear',
      },
      {
        id: `kf-${clip.id}-visual-fade-out-end`,
        property: 'opacity',
        time: roundTime(clip.duration),
        value: 0,
        easing: 'linear',
      },
    );
  }

  return dedupeClipKeyframesByPropertyTime(sortClipKeyframes([
    ...preservedKeyframes,
    ...generated,
  ]));
}

function buildMotionPresetKeyframes(
  clip: TimelineClip,
  preset: typeof MOTION_PRESETS[number],
): ClipKeyframe[] {
  const properties: Array<keyof typeof preset.start> = ['positionX', 'positionY', 'scale'];
  const preservedKeyframes = clip.keyframes.filter((keyframe) => (
    keyframe.property !== 'positionX' &&
    keyframe.property !== 'positionY' &&
    keyframe.property !== 'scale'
  ));
  const endTime = roundTime(clip.duration);
  const generated = properties.flatMap((property) => ([
    {
      id: `kf-${clip.id}-motion-${preset.id}-${property}-start`,
      property,
      time: 0,
      value: normalizeKeyframeValue(property, preset.start[property]),
      easing: 'smooth' as const,
    },
    {
      id: `kf-${clip.id}-motion-${preset.id}-${property}-end`,
      property,
      time: endTime,
      value: normalizeKeyframeValue(property, preset.end[property]),
      easing: 'smooth' as const,
    },
  ]));

  return dedupeClipKeyframesByPropertyTime(sortClipKeyframes([
    ...preservedKeyframes,
    ...generated,
  ]));
}

function evaluateClipVolumeAt(clip: TimelineClip, time: number): number {
  const volumeKeyframes = sortClipKeyframes(clip.keyframes.filter((keyframe) => (
    keyframe.property === 'volume' && typeof keyframe.value === 'number' && Number.isFinite(keyframe.value)
  )));

  if (volumeKeyframes.length === 0) {
    return normalizeKeyframeValue('volume', clip.volume);
  }

  return normalizeKeyframeValue('volume', evaluateNumericKeyframeAt(volumeKeyframes, time));
}

function evaluateClipOpacityAt(clip: TimelineClip, time: number): number {
  const opacityKeyframes = sortClipKeyframes(clip.keyframes.filter((keyframe) => (
    keyframe.property === 'opacity' && typeof keyframe.value === 'number' && Number.isFinite(keyframe.value)
  )));

  if (opacityKeyframes.length === 0) {
    return normalizeKeyframeValue('opacity', clip.opacity);
  }

  return normalizeKeyframeValue('opacity', evaluateNumericKeyframeAt(opacityKeyframes, time));
}

function dedupeClipKeyframesByPropertyTime(keyframes: ClipKeyframe[]): ClipKeyframe[] {
  const byKey = new Map<string, ClipKeyframe>();
  for (const keyframe of keyframes) {
    byKey.set(`${keyframe.property}:${roundTime(keyframe.time)}`, keyframe);
  }

  return sortClipKeyframes(Array.from(byKey.values()));
}

function getClipGroupIds(clip: TimelineClip): string[] {
  return clip.automationTags
    .filter((tag) => tag.startsWith(CLIP_GROUP_TAG_PREFIX))
    .map((tag) => tag.slice(CLIP_GROUP_TAG_PREFIX.length))
    .filter(Boolean);
}

function buildClipGroupTag(groupId: string): string {
  return `${CLIP_GROUP_TAG_PREFIX}${normalizeClipGroupId(groupId)}`;
}

function normalizeClipGroupId(groupId: string): string {
  const rawGroupId = groupId.startsWith(CLIP_GROUP_TAG_PREFIX)
    ? groupId.slice(CLIP_GROUP_TAG_PREFIX.length)
    : groupId;
  const normalized = rawGroupId.trim().replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || `group-${Date.now()}`;
}

function withoutClipGroupTags(tags: string[]): string[] {
  return tags.filter((tag) => !tag.startsWith(CLIP_GROUP_TAG_PREFIX));
}

function cloneClipEffects(effects: ClipEffect[]): ClipEffect[] {
  return effects.map((effect) => ({
    ...effect,
    parameters: { ...effect.parameters },
  }));
}

function cloneClipKeyframes(keyframes: ClipKeyframe[]): ClipKeyframe[] {
  return sortClipKeyframes(keyframes.map((keyframe) => ({ ...keyframe })));
}

function clonePastedEffects(effects: ClipEffect[], targetClipId: string): ClipEffect[] {
  return effects.map((effect, index) => ({
    ...effect,
    id: `${effect.id}-attr-${targetClipId}-${index + 1}`,
    parameters: { ...effect.parameters },
  }));
}

function clonePastedKeyframes(
  attributes: ClipAttributeClipboard,
  targetClip: TimelineClip,
  options: PasteClipAttributesOptions,
): ClipKeyframe[] {
  const scale = options.scaleKeyframes === false || attributes.sourceDuration <= 0
    ? 1
    : targetClip.duration / attributes.sourceDuration;

  return dedupeClipKeyframesByPropertyTime(attributes.keyframes.map((keyframe, index) => ({
    ...keyframe,
    id: `${keyframe.id}-attr-${targetClip.id}-${index + 1}`,
    time: roundTime(clamp(keyframe.time * scale, 0, targetClip.duration)),
  })));
}

function clipHasVisualLayer(clip: TimelineClip, asset?: EditorAsset): boolean {
  return clip.kind === 'video' ||
    clip.kind === 'image' ||
    clip.kind === 'text' ||
    isRenderableVisualMediaAsset(asset) ||
    asset?.kind === 'text';
}

function reconcileKeyframesForClipUpdate(
  clip: TimelineClip,
  nextClip: TimelineClip,
  patch: EditableClipPatch,
): ClipKeyframe[] {
  const oldEnd = roundTime(clip.start + clip.duration);
  const nextEnd = roundTime(nextClip.start + nextClip.duration);
  const startChanged = patch.start !== undefined && Math.abs(nextClip.start - clip.start) > 0.001;
  const durationChanged = patch.duration !== undefined && Math.abs(nextClip.duration - clip.duration) > 0.001;
  const sourceChanged = patch.sourceIn !== undefined && Math.abs(nextClip.sourceIn - clip.sourceIn) > 0.001;
  const preservesTail = Math.abs(oldEnd - nextEnd) <= 0.002;
  const looksLikeHeadTrim = startChanged && durationChanged && sourceChanged && preservesTail;

  if (looksLikeHeadTrim) {
    return sliceClipKeyframes(clip, roundTime(nextClip.start - clip.start), nextClip.duration, '-trim-head');
  }

  if (durationChanged) {
    return sliceClipKeyframes(clip, 0, nextClip.duration, '-trim-tail');
  }

  return clip.keyframes;
}

function splitTimelineClip(clip: TimelineClip, offsetSeconds: number): { left: TimelineClip; right: TimelineClip } {
  const splitKeyframes = splitClipKeyframes(clip, offsetSeconds);
  const leftDuration = roundTime(offsetSeconds);
  const rightDuration = roundTime(clip.duration - offsetSeconds);

  return {
    left: {
      ...clip,
      duration: leftDuration,
      sourceIn: sourceInForClipSegment(clip, 0, leftDuration),
      freezeFrameTime: sliceClipFreezeFrameTime(clip, 0, leftDuration),
      keyframes: splitKeyframes.left,
    },
    right: {
      ...clip,
      id: `${clip.id}-split-${Date.now()}-${Math.round(offsetSeconds * 1000)}`,
      name: `${clip.name} cut`,
      start: roundTime(clip.start + offsetSeconds),
      duration: rightDuration,
      sourceIn: sourceInForClipSegment(clip, offsetSeconds, rightDuration),
      freezeFrameTime: sliceClipFreezeFrameTime(clip, offsetSeconds, rightDuration),
      keyframes: splitKeyframes.right,
    },
  };
}

function relinkSplitClipPair(
  split: { left: TimelineClip; right: TimelineClip },
  splitByOriginalId: Map<string, { left: TimelineClip; right: TimelineClip }>,
): { left: TimelineClip; right: TimelineClip } {
  const detachedAudioId = getDetachedAudioClipId(split.left);
  const linkedVideoId = getLinkedVideoClipId(split.left);

  const leftDetachedAudioId = detachedAudioId ? splitByOriginalId.get(detachedAudioId)?.left.id ?? detachedAudioId : undefined;
  const rightDetachedAudioId = detachedAudioId ? splitByOriginalId.get(detachedAudioId)?.right.id ?? detachedAudioId : undefined;
  const leftLinkedVideoId = linkedVideoId ? splitByOriginalId.get(linkedVideoId)?.left.id ?? linkedVideoId : undefined;
  const rightLinkedVideoId = linkedVideoId ? splitByOriginalId.get(linkedVideoId)?.right.id ?? linkedVideoId : undefined;

  return {
    left: {
      ...split.left,
      automationTags: replaceClipLinkReferenceTags(split.left.automationTags, {
        detachedAudioId: leftDetachedAudioId,
        linkedVideoId: leftLinkedVideoId,
      }),
    },
    right: {
      ...split.right,
      automationTags: replaceClipLinkReferenceTags(split.right.automationTags, {
        detachedAudioId: rightDetachedAudioId,
        linkedVideoId: rightLinkedVideoId,
      }),
    },
  };
}

function replaceClipLinkReferenceTags(
  tags: string[],
  replacements: { detachedAudioId?: string; linkedVideoId?: string },
): string[] {
  const stripped = tags.filter((tag) => (
    !tag.startsWith(DETACHED_AUDIO_TAG_PREFIX) &&
    !tag.startsWith(LINKED_VIDEO_TAG_PREFIX)
  ));

  return withUniqueTags(stripped, [
    ...(replacements.detachedAudioId ? [buildDetachedAudioTag(replacements.detachedAudioId)] : []),
    ...(replacements.linkedVideoId ? [buildLinkedVideoTag(replacements.linkedVideoId)] : []),
  ]);
}

function stripClipLinkTags(
  tags: string[],
  options: { preserveEmbeddedAudioDisabled: boolean },
): string[] {
  return tags.filter((tag) => (
    tag !== 'detached-audio' &&
    !tag.startsWith(DETACHED_AUDIO_TAG_PREFIX) &&
    !tag.startsWith(LINKED_VIDEO_TAG_PREFIX) &&
    (options.preserveEmbeddedAudioDisabled || tag !== EMBEDDED_AUDIO_DISABLED_TAG)
  ));
}

function relinkCopiedClipsInPlace(entries: Array<{ sourceId: string; clip: TimelineClip }>): void {
  const copiedIdBySourceId = new Map(entries.map((entry) => [entry.sourceId, entry.clip.id]));

  for (const entry of entries) {
    entry.clip.automationTags = relinkCopiedClipReferences(entry.clip, copiedIdBySourceId).automationTags;
  }
}

function relinkCopiedClipReferences(clip: TimelineClip, copiedIdBySourceId: Map<string, string>): TimelineClip {
  const detachedAudioId = getDetachedAudioClipId(clip);
  const linkedVideoId = getLinkedVideoClipId(clip);

  if (!detachedAudioId && !linkedVideoId) {
    return clip;
  }

  return {
    ...clip,
    automationTags: replaceClipLinkReferenceTags(clip.automationTags, {
      detachedAudioId: detachedAudioId ? copiedIdBySourceId.get(detachedAudioId) : undefined,
      linkedVideoId: linkedVideoId ? copiedIdBySourceId.get(linkedVideoId) : undefined,
    }),
  };
}

function relinkGeneratedTailClips(tracks: TimelineTrack[], tailIdByOriginalId: Map<string, string>): TimelineTrack[] {
  if (tailIdByOriginalId.size === 0) {
    return tracks;
  }

  const tailIds = new Set(tailIdByOriginalId.values());

  return tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (!tailIds.has(clip.id)) {
        return clip;
      }

      const detachedAudioId = getDetachedAudioClipId(clip);
      const linkedVideoId = getLinkedVideoClipId(clip);

      return {
        ...clip,
        automationTags: replaceClipLinkReferenceTags(clip.automationTags, {
          detachedAudioId: detachedAudioId ? tailIdByOriginalId.get(detachedAudioId) : undefined,
          linkedVideoId: linkedVideoId ? tailIdByOriginalId.get(linkedVideoId) : undefined,
        }),
      };
    }),
  }));
}

function findLinkedAudioPair(
  project: EditorProject,
  clipId: string,
): { videoTrack: TimelineTrack; audioTrack: TimelineTrack; videoClip: TimelineClip; audioClip: TimelineClip } {
  const selectedClip = findClip(project, clipId);
  if (!selectedClip) {
    throw new Error('Clip not found.');
  }

  const linkedVideoId = getLinkedVideoClipId(selectedClip);
  const videoClip = linkedVideoId ? findClip(project, linkedVideoId) : selectedClip;
  const audioClipId = linkedVideoId ? selectedClip.id : getDetachedAudioClipId(selectedClip);
  const audioClip = audioClipId ? findClip(project, audioClipId) : undefined;
  const videoTrack = videoClip ? findTrackForClip(project, videoClip.id) : undefined;
  const audioTrack = audioClip ? findTrackForClip(project, audioClip.id) : undefined;
  const videoAsset = videoClip ? assetForTimelineClip(project, videoClip) : undefined;
  const audioAsset = audioClip ? assetForTimelineClip(project, audioClip) : undefined;
  const videoClipIsAudio = videoClip?.kind === 'audio' || resolveRenderableAssetMediaKind(videoAsset) === 'audio';
  const videoClipIsVisual = videoClip?.kind === 'video' || videoClip?.kind === 'image' || isRenderableVisualMediaAsset(videoAsset);
  const audioClipIsAudio = audioClip?.kind === 'audio' || resolveRenderableAssetMediaKind(audioAsset) === 'audio';

  if (!videoTrack || !audioTrack || !videoClip || !audioClip || videoClipIsAudio || !videoClipIsVisual || !audioClipIsAudio) {
    throw new Error('Selected clip has no linked detached audio pair.');
  }

  return { videoTrack, audioTrack, videoClip, audioClip };
}

function applyLinkedAudioHeadSplitEdit(track: TimelineTrack, clip: TimelineClip, deltaSeconds: number): TimelineClip {
  const sortedClips = [...track.clips].sort((a, b) => a.start - b.start);
  const clipIndex = sortedClips.findIndex((item) => item.id === clip.id);
  const previousClip = sortedClips[clipIndex - 1];
  const clipEnd = roundTime(clip.start + clip.duration);
  const previousEnd = previousClip ? roundTime(previousClip.start + previousClip.duration) : 0;
  const minDelta = Math.max(
    previousEnd - clip.start,
    -clip.start,
    -clip.sourceIn / getClipPlaybackSpeed(clip),
  );
  const maxDelta = clip.duration - MIN_CLIP_DURATION;
  const appliedDelta = roundTime(clamp(deltaSeconds, minDelta, maxDelta));
  const nextStart = roundTime(clip.start + appliedDelta);
  const nextDuration = roundTime(clipEnd - nextStart);

  return {
    ...clip,
    start: nextStart,
    sourceIn: sourceInForClipSegment(clip, appliedDelta, nextDuration),
    duration: nextDuration,
    keyframes: sliceClipKeyframes(clip, appliedDelta, nextDuration, '-split-audio-head'),
  };
}

function applyLinkedAudioTailSplitEdit(
  track: TimelineTrack,
  clip: TimelineClip,
  asset: EditorAsset | undefined,
  deltaSeconds: number,
): TimelineClip {
  const sortedClips = [...track.clips].sort((a, b) => a.start - b.start);
  const clipIndex = sortedClips.findIndex((item) => item.id === clip.id);
  const nextClip = sortedClips[clipIndex + 1];
  const clipEnd = roundTime(clip.start + clip.duration);
  const nextStart = nextClip ? nextClip.start : Number.POSITIVE_INFINITY;
  const minDelta = MIN_CLIP_DURATION - clip.duration;
  const maxDelta = Math.min(
    nextStart - clipEnd,
    maxAudioTailExtension(clip, asset),
  );
  const appliedDelta = roundTime(clamp(deltaSeconds, minDelta, maxDelta));
  const nextDuration = roundTime(clip.duration + appliedDelta);

  return {
    ...clip,
    duration: nextDuration,
    keyframes: sliceClipKeyframes(clip, 0, nextDuration, '-split-audio-tail'),
  };
}

function maxAudioTailExtension(clip: TimelineClip, asset?: EditorAsset): number {
  if (!asset || asset.duration <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  const playbackSpeed = getClipPlaybackSpeed(clip);
  const sourceEnd = roundTime(clip.sourceIn + getClipSourceDuration(clip));
  return roundTime(Math.max(0, (asset.duration - sourceEnd) / playbackSpeed));
}

function trimTimelineClip(clip: TimelineClip, edge: 'start' | 'end', deltaSeconds: number): TimelineClip {
  if (edge === 'start') {
    const maxDelta = clip.duration - MIN_CLIP_DURATION;
    const minDelta = Math.max(-clip.start, -clip.sourceIn / getClipPlaybackSpeed(clip));
    const appliedDelta = Math.min(Math.max(deltaSeconds, minDelta), maxDelta);
    const nextDuration = roundTime(clip.duration - appliedDelta);

    return {
      ...clip,
      start: roundTime(clip.start + appliedDelta),
      sourceIn: sourceInForClipSegment(clip, appliedDelta, nextDuration),
      duration: nextDuration,
      freezeFrameTime: sliceClipFreezeFrameTime(clip, appliedDelta, nextDuration),
      keyframes: sliceClipKeyframes(clip, appliedDelta, nextDuration, '-trim-head'),
    };
  }

  const nextDuration = roundTime(Math.max(MIN_CLIP_DURATION, clip.duration + deltaSeconds));
  return {
    ...clip,
    sourceIn: sourceInForClipSegment(clip, 0, nextDuration),
    duration: nextDuration,
    freezeFrameTime: sliceClipFreezeFrameTime(clip, 0, nextDuration),
    keyframes: sliceClipKeyframes(clip, 0, nextDuration, '-trim-tail'),
  };
}

function sourceInForClipSegment(clip: TimelineClip, segmentStart: number, segmentDuration: number): number {
  const speed = getClipPlaybackSpeed(clip);
  const start = roundTime(segmentStart);
  const duration = roundTime(Math.max(MIN_CLIP_DURATION, segmentDuration));
  if (clip.reversed) {
    return roundTime(Math.max(0, clip.sourceIn + Math.max(0, clip.duration - start - duration) * speed));
  }

  return roundTime(Math.max(0, clip.sourceIn + start * speed));
}

function buildSlideContext(
  project: EditorProject,
  clipId: string,
): {
  track: TimelineTrack;
  previousClip: TimelineClip;
  clip: TimelineClip;
  nextClip: TimelineClip;
  minDelta: number;
  maxDelta: number;
} {
  const track = findTrackForClip(project, clipId);
  if (!track) {
    throw new Error('Clip not found.');
  }

  const sortedClips = [...track.clips].sort((a, b) => a.start - b.start);
  const clipIndex = sortedClips.findIndex((clip) => clip.id === clipId);
  const previousClip = sortedClips[clipIndex - 1];
  const clip = sortedClips[clipIndex];
  const nextClip = sortedClips[clipIndex + 1];
  if (!clip) {
    throw new Error('Clip not found.');
  }

  if (!previousClip || !nextClip) {
    throw new Error('Slide edit requires previous and next clips on the same track.');
  }

  return {
    track,
    previousClip,
    clip,
    nextClip,
    minDelta: Math.max(
      MIN_CLIP_DURATION - previousClip.duration,
      -nextClip.sourceIn / getClipPlaybackSpeed(nextClip),
      -clip.start,
    ),
    maxDelta: nextClip.duration - MIN_CLIP_DURATION,
  };
}

function buildRollTrimContext(
  project: EditorProject,
  clipId: string,
  edge: 'start' | 'end',
): {
  track: TimelineTrack;
  clip: TimelineClip;
  neighborClip: TimelineClip;
  minDelta: number;
  maxDelta: number;
} {
  const track = findTrackForClip(project, clipId);
  if (!track) {
    throw new Error('Clip not found.');
  }

  const sortedClips = [...track.clips].sort((a, b) => a.start - b.start);
  const clipIndex = sortedClips.findIndex((clip) => clip.id === clipId);
  const clip = sortedClips[clipIndex];
  if (!clip) {
    throw new Error('Clip not found.');
  }

  if (edge === 'start') {
    const previousClip = sortedClips[clipIndex - 1];
    if (!previousClip) {
      throw new Error('Roll trim start requires a previous clip on the same track.');
    }

    return {
      track,
      clip,
      neighborClip: previousClip,
      minDelta: Math.max(MIN_CLIP_DURATION - previousClip.duration, -clip.sourceIn / getClipPlaybackSpeed(clip), -clip.start),
      maxDelta: clip.duration - MIN_CLIP_DURATION,
    };
  }

  const nextClip = sortedClips[clipIndex + 1];
  if (!nextClip) {
    throw new Error('Roll trim end requires a next clip on the same track.');
  }

  return {
    track,
    clip,
    neighborClip: nextClip,
    minDelta: Math.max(MIN_CLIP_DURATION - clip.duration, -nextClip.sourceIn / getClipPlaybackSpeed(nextClip)),
    maxDelta: nextClip.duration - MIN_CLIP_DURATION,
  };
}

function sliceClipKeyframes(
  clip: TimelineClip,
  startOffset: number,
  duration: number,
  generatedIdSuffix: string,
): ClipKeyframe[] {
  const sliceStart = roundTime(startOffset);
  const sliceDuration = roundTime(Math.max(MIN_CLIP_DURATION, duration));
  const sliceEnd = roundTime(sliceStart + sliceDuration);
  const result: ClipKeyframe[] = [];
  const properties = Array.from(new Set(clip.keyframes.map((keyframe) => keyframe.property)))
    .sort((a, b) => keyframePropertyOrder(a) - keyframePropertyOrder(b));

  for (const property of properties) {
    const frames = clip.keyframes
      .filter((keyframe) => keyframe.property === property)
      .sort((a, b) => a.time - b.time);

    for (const keyframe of frames) {
      if (keyframe.time < sliceStart - 0.001 || keyframe.time > sliceEnd + 0.001) {
        continue;
      }

      result.push({
        ...keyframe,
        id: generatedIdSuffix ? `${keyframe.id}${generatedIdSuffix}` : keyframe.id,
        time: roundTime(clamp(keyframe.time - sliceStart, 0, sliceDuration)),
      });
    }

    const hasStartFrame = result.some((keyframe) => keyframe.property === property && Math.abs(keyframe.time) <= 0.001);
    if (!hasStartFrame && shouldAddSliceBoundary(frames, sliceStart, sliceEnd)) {
      result.push(buildSliceBoundaryKeyframe(clip, property, frames, sliceStart, 0, generatedIdSuffix));
    }

    const hasEndFrame = result.some((keyframe) => (
      keyframe.property === property &&
      Math.abs(keyframe.time - sliceDuration) <= 0.001
    ));
    if (!hasEndFrame && shouldAddSliceEndBoundary(frames, sliceEnd)) {
      result.push(buildSliceBoundaryKeyframe(clip, property, frames, sliceEnd, sliceDuration, generatedIdSuffix));
    }
  }

  return sortClipKeyframes(result);
}

function shouldAddSliceBoundary(frames: ClipKeyframe[], sliceStart: number, sliceEnd: number): boolean {
  if (frames.length === 0) {
    return false;
  }

  const first = frames[0];
  const last = frames[frames.length - 1];
  return sliceStart < first.time - 0.001 || sliceStart > first.time + 0.001 || sliceEnd < first.time - 0.001 || sliceStart > last.time + 0.001;
}

function shouldAddSliceEndBoundary(frames: ClipKeyframe[], sliceEnd: number): boolean {
  if (frames.length === 0) {
    return false;
  }

  const last = frames[frames.length - 1];
  return sliceEnd < last.time - 0.001;
}

function buildSliceBoundaryKeyframe(
  clip: TimelineClip,
  property: ClipKeyframe['property'],
  frames: ClipKeyframe[],
  sourceTime: number,
  targetTime: number,
  generatedIdSuffix: string,
): ClipKeyframe {
  const numericFrames = frames
    .filter((keyframe) => typeof keyframe.value === 'number' && Number.isFinite(keyframe.value))
    .sort((a, b) => a.time - b.time);
  const value = normalizeKeyframeValue(property, evaluateNumericKeyframeAt(numericFrames, sourceTime));
  const previous = numericFrames.filter((keyframe) => keyframe.time <= sourceTime).at(-1);

  return {
    id: `kf-${clip.id}-${property}-slice-${Math.round(sourceTime * 1000)}-${Math.round(targetTime * 1000)}${generatedIdSuffix}`,
    property,
    time: roundTime(targetTime),
    value,
    easing: previous?.easing ?? numericFrames[0]?.easing ?? 'smooth',
  };
}

function splitClipKeyframes(clip: TimelineClip, offsetSeconds: number): { left: ClipKeyframe[]; right: ClipKeyframe[] } {
  const splitTime = normalizeKeyframeTime(clip, offsetSeconds);
  const rightDuration = roundTime(Math.max(0, clip.duration - splitTime));
  const left: ClipKeyframe[] = [];
  const right: ClipKeyframe[] = [];
  const properties = Array.from(new Set(clip.keyframes.map((keyframe) => keyframe.property)))
    .sort((a, b) => keyframePropertyOrder(a) - keyframePropertyOrder(b));

  for (const property of properties) {
    const frames = clip.keyframes.filter((keyframe) => keyframe.property === property);
    const hasBoundaryFrame = frames.some((keyframe) => Math.abs(keyframe.time - splitTime) <= 0.001);
    const boundary = hasBoundaryFrame ? undefined : buildSplitBoundaryKeyframe(clip, property, splitTime, frames);

    for (const keyframe of frames) {
      if (keyframe.time < splitTime - 0.001) {
        left.push({
          ...keyframe,
          time: roundTime(clamp(keyframe.time, 0, splitTime)),
        });
        continue;
      }

      if (keyframe.time > splitTime + 0.001) {
        right.push({
          ...keyframe,
          id: `${keyframe.id}-split-right`,
          time: roundTime(clamp(keyframe.time - splitTime, 0, rightDuration)),
        });
        continue;
      }

      left.push({
        ...keyframe,
        time: splitTime,
      });
      right.push({
        ...keyframe,
        id: `${keyframe.id}-split-right`,
        time: 0,
      });
    }

    if (boundary) {
      left.push(boundary.left);
      right.push(boundary.right);
    }
  }

  return {
    left: sortClipKeyframes(left),
    right: sortClipKeyframes(right),
  };
}

function buildSplitBoundaryKeyframe(
  clip: TimelineClip,
  property: ClipKeyframe['property'],
  splitTime: number,
  frames: ClipKeyframe[],
): { left: ClipKeyframe; right: ClipKeyframe } | undefined {
  const numericFrames = frames
    .filter((keyframe) => typeof keyframe.value === 'number' && Number.isFinite(keyframe.value))
    .sort((a, b) => a.time - b.time);

  if (numericFrames.length === 0) {
    return undefined;
  }

  const value = normalizeKeyframeValue(property, evaluateNumericKeyframeAt(numericFrames, splitTime));
  const previous = numericFrames.filter((keyframe) => keyframe.time <= splitTime).at(-1);
  const easing = previous?.easing ?? numericFrames[0]?.easing ?? 'smooth';
  const boundaryId = `kf-${clip.id}-${property}-split-${Date.now()}`;

  return {
    left: {
      id: `${boundaryId}-left`,
      property,
      time: splitTime,
      value,
      easing,
    },
    right: {
      id: `${boundaryId}-right`,
      property,
      time: 0,
      value,
      easing,
    },
  };
}

function evaluateNumericKeyframeAt(keyframes: ClipKeyframe[], time: number): number {
  const samples = toNumericKeyframeSamples(keyframes);
  return interpolateNumericKeyframes(samples, time, samples[0]?.value ?? 0);
}

export function generateCaptionDraft(project: EditorProject): EditorProject {
  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const speechClips = getAllClips(project)
    .filter((clip) => isCaptionDraftSpeechClip(clip, assetById.get(clip.assetId ?? '')))
    .sort((a, b) => a.start - b.start)
    .slice(0, 8);

  const captions: CaptionSegment[] = speechClips.map((clip, index) => ({
    id: `caption-draft-${clip.id}`,
    start: roundTime(clip.start + 0.35),
    end: roundTime(Math.min(clip.start + clip.duration, clip.start + 4.2)),
    text: index === 0
      ? 'AI caption draft is ready for review.'
      : `${clip.name} caption draft`,
    speaker: resolveCaptionDraftSpeaker(clip, assetById.get(clip.assetId ?? '')),
    confidence: 0.9,
    style: defaultCaptionStyle(),
  }));

  return touchProject({
    ...project,
    captions,
  });
}

function isCaptionDraftSpeechClip(clip: TimelineClip, asset?: EditorAsset): boolean {
  return clip.kind === 'video' || clip.kind === 'audio' || clipHasTimelineAudio(clip, asset);
}

function resolveCaptionDraftSpeaker(clip: TimelineClip, asset?: EditorAsset): string {
  return clip.kind === 'audio' || resolveRenderableAssetMediaKind(asset) === 'audio' ? 'Music/Voice' : 'Speaker';
}

export function updateCaption(project: EditorProject, captionId: string, patch: EditableCaptionPatch): EditorProject {
  let updated = false;

  const captions = project.captions.map((caption) => {
    if (caption.id !== captionId) {
      return caption;
    }

    updated = true;
    const start = patch.start === undefined ? caption.start : roundTime(Math.max(0, patch.start));
    const rawEnd = patch.end === undefined ? caption.end : patch.end;
    const end = roundTime(Math.max(start + 0.1, rawEnd));
    const style = patch.style === undefined
      ? caption.style
      : { ...caption.style, ...patch.style };

    return {
      ...caption,
      ...patch,
      start,
      end,
      text: patch.text === undefined ? caption.text : patch.text,
      style,
    };
  }).sort((a, b) => a.start - b.start);

  if (!updated) {
    throw new Error('Caption not found.');
  }

  return touchProject({
    ...project,
    captions,
  });
}

export function updateCaptionsStyle(
  project: EditorProject,
  captionIds: string[],
  patch: CaptionStyle,
): EditorProject {
  const targetIds = new Set(captionIds.filter(Boolean));
  if (targetIds.size === 0) {
    throw new Error('Select at least one caption.');
  }

  let found = false;
  let updated = false;
  const captions = project.captions.map((caption) => {
    if (!targetIds.has(caption.id)) {
      return caption;
    }

    found = true;
    const nextStyle = { ...caption.style, ...patch };
    const changed = Object.entries(patch).some(([key, value]) => (
      caption.style?.[key as keyof CaptionStyle] !== value
    ));
    if (!changed) {
      return caption;
    }

    updated = true;
    return {
      ...caption,
      style: nextStyle,
    };
  });

  if (!found) {
    throw new Error('Caption not found.');
  }

  if (!updated) {
    return project;
  }

  return touchProject({
    ...project,
    captions,
  });
}

export function updateCaptionsSpeaker(
  project: EditorProject,
  captionIds: string[],
  speaker: string,
): EditorProject {
  const targetIds = new Set(captionIds.filter(Boolean));
  if (targetIds.size === 0) {
    throw new Error('Select at least one caption.');
  }

  const nextSpeaker = speaker.trim() || undefined;
  let found = false;
  let updated = false;
  const captions = project.captions.map((caption) => {
    if (!targetIds.has(caption.id)) {
      return caption;
    }

    found = true;
    if ((caption.speaker?.trim() || undefined) === nextSpeaker) {
      return caption;
    }

    updated = true;
    return {
      ...caption,
      speaker: nextSpeaker,
    };
  });

  if (!found) {
    throw new Error('Caption not found.');
  }

  if (!updated) {
    return project;
  }

  return touchProject({
    ...project,
    captions,
  });
}

export function moveCaptionToTime(project: EditorProject, captionId: string, start: number): EditorProject {
  return moveCaptionsToTime(project, [captionId], start);
}

export function moveCaptionsToTime(project: EditorProject, captionIds: string[], start: number): EditorProject {
  const ids = new Set(captionIds);
  if (ids.size === 0) {
    throw new Error('Select at least one caption.');
  }

  const selectedCaptions = project.captions.filter((caption) => ids.has(caption.id));
  if (selectedCaptions.length === 0) {
    throw new Error('Caption not found.');
  }

  const earliestStart = Math.min(...selectedCaptions.map((caption) => caption.start));
  const targetStart = roundTime(Math.max(0, start));
  const delta = roundTime(targetStart - earliestStart);

  if (Math.abs(delta) < 0.001) {
    return project;
  }

  return touchProject({
    ...project,
    captions: project.captions
      .map((caption) => (ids.has(caption.id) ? shiftCaption(caption, delta) : caption))
      .sort((a, b) => a.start - b.start),
  });
}

export function nudgeCaptions(project: EditorProject, captionIds: string[], deltaSeconds: number): EditorProject {
  const ids = new Set(captionIds.filter(Boolean));
  if (ids.size === 0) {
    throw new Error('Select at least one caption.');
  }

  if (!Number.isFinite(deltaSeconds)) {
    throw new Error('Caption nudge must be finite.');
  }

  const selectedCaptions = project.captions.filter((caption) => ids.has(caption.id));
  if (selectedCaptions.length === 0) {
    throw new Error('Caption not found.');
  }

  const earliestStart = Math.min(...selectedCaptions.map((caption) => caption.start));
  const delta = roundTime(Math.max(-earliestStart, deltaSeconds));

  if (Math.abs(delta) < 0.001) {
    return project;
  }

  return touchProject({
    ...project,
    captions: project.captions
      .map((caption) => (ids.has(caption.id) ? shiftCaption(caption, delta) : caption))
      .sort((a, b) => a.start - b.start),
  });
}

export function compactCaptionGaps(
  project: EditorProject,
  captionIds: string[],
  gapSeconds = 0.05,
): EditorProject {
  const ids = new Set(captionIds.filter(Boolean));
  if (ids.size < 2) {
    throw new Error('Select at least two captions to tighten spacing.');
  }

  const selectedCaptions = project.captions
    .filter((caption) => ids.has(caption.id))
    .sort((a, b) => a.start - b.start);
  if (selectedCaptions.length < 2) {
    throw new Error('Select at least two captions to tighten spacing.');
  }

  const gap = roundTime(clamp(gapSeconds, 0, 10));
  let cursor = roundTime(Math.max(0, selectedCaptions[0].start));
  const shiftedCaptions = new Map<string, CaptionSegment>();
  let changed = false;

  for (const caption of selectedCaptions) {
    const duration = roundTime(Math.max(0.1, caption.end - caption.start));
    const targetStart = cursor;
    const delta = roundTime(targetStart - caption.start);
    const nextCaption = Math.abs(delta) < 0.001 ? caption : shiftCaption(caption, delta);
    shiftedCaptions.set(caption.id, nextCaption);
    changed = changed || nextCaption !== caption;
    cursor = roundTime(targetStart + duration + gap);
  }

  if (!changed) {
    return project;
  }

  return touchProject({
    ...project,
    captions: project.captions
      .map((caption) => shiftedCaptions.get(caption.id) ?? caption)
      .sort((a, b) => a.start - b.start),
  });
}

export function splitCaptionAtTime(project: EditorProject, captionId: string, time: number): EditorProject {
  const caption = project.captions.find((item) => item.id === captionId);
  if (!caption) {
    throw new Error('Caption not found.');
  }

  const splitTime = roundTime(time);
  if (splitTime <= caption.start || splitTime >= caption.end) {
    throw new Error('Split time must be inside the caption.');
  }

  const [leftText, rightText] = splitCaptionText(caption.text);
  const leftCaption: CaptionSegment = {
    ...caption,
    end: splitTime,
    text: leftText,
  };
  const rightCaption: CaptionSegment = {
    ...caption,
    id: `${caption.id}-split-${Date.now()}`,
    start: splitTime,
    text: rightText,
  };

  return touchProject({
    ...project,
    captions: project.captions
      .flatMap((item) => (item.id === captionId ? [leftCaption, rightCaption] : [item]))
      .sort((a, b) => a.start - b.start),
  });
}

export function mergeCaptions(project: EditorProject, captionIds: string[]): EditorProject {
  const ids = new Set(captionIds);
  if (ids.size < 2) {
    throw new Error('Select at least two captions to merge.');
  }

  const selectedCaptions = project.captions
    .filter((caption) => ids.has(caption.id))
    .sort((a, b) => a.start - b.start);
  if (selectedCaptions.length < 2) {
    throw new Error('Select at least two captions to merge.');
  }

  const mergedCaption: CaptionSegment = {
    ...selectedCaptions[0],
    id: `caption-merge-${Date.now()}`,
    start: selectedCaptions[0].start,
    end: Math.max(...selectedCaptions.map((caption) => caption.end)),
    text: selectedCaptions.map((caption) => caption.text.trim()).filter(Boolean).join(' '),
    speaker: selectedCaptions.find((caption) => caption.speaker)?.speaker,
    confidence: Math.min(...selectedCaptions.map((caption) => caption.confidence ?? 1)),
  };

  return touchProject({
    ...project,
    captions: [
      ...project.captions.filter((caption) => !ids.has(caption.id)),
      mergedCaption,
    ].sort((a, b) => a.start - b.start),
  });
}

export function findCaptionAtTime(project: EditorProject, time: number): CaptionSegment | undefined {
  const targetTime = roundTime(Math.max(0, time));
  return project.captions
    .slice()
    .sort((a, b) => a.start - b.start)
    .find((caption) => targetTime >= caption.start && targetTime <= caption.end);
}

export function addCaption(project: EditorProject, start: number, text = 'New caption'): EditorProject {
  const startTime = roundTime(Math.max(0, start));

  return touchProject({
    ...project,
    captions: [
      ...project.captions,
      {
        id: `caption-${Date.now()}`,
        start: startTime,
        end: roundTime(startTime + 2.5),
        text,
        speaker: 'Speaker',
        confidence: 1,
        style: defaultCaptionStyle(),
      },
    ].sort((a, b) => a.start - b.start),
  });
}

export function importCaptionSegments(
  project: EditorProject,
  captions: CaptionSegment[],
  mode: 'replace' | 'append' = 'replace',
): EditorProject {
  const existingIds = new Set(mode === 'append' ? project.captions.map((caption) => caption.id) : []);
  const importedCaptions = captions
    .filter((caption) => caption.end > caption.start && caption.text.trim().length > 0)
    .map((caption, index) => {
      const baseId = caption.id || `caption-import-${index + 1}`;
      const id = uniqueCaptionId(baseId, existingIds);
      existingIds.add(id);

      return {
        ...caption,
        id,
        start: roundTime(Math.max(0, caption.start)),
        end: roundTime(Math.max(Math.max(0, caption.start) + 0.1, caption.end)),
        text: caption.text.trim() || 'Caption',
        confidence: caption.confidence ?? 1,
      };
    });

  return touchProject({
    ...project,
    captions: [
      ...(mode === 'append' ? project.captions : []),
      ...importedCaptions,
    ].sort((a, b) => a.start - b.start),
  });
}

export function deleteCaption(project: EditorProject, captionId: string): EditorProject {
  const captions = project.captions.filter((caption) => caption.id !== captionId);
  if (captions.length === project.captions.length) {
    throw new Error('Caption not found.');
  }

  return touchProject({
    ...project,
    captions,
  });
}

export function deleteCaptions(project: EditorProject, captionIds: string[]): EditorProject {
  const targetIds = new Set(captionIds.filter(Boolean));
  if (targetIds.size === 0) {
    throw new Error('Select at least one caption.');
  }

  const captions = project.captions.filter((caption) => !targetIds.has(caption.id));
  if (captions.length === project.captions.length) {
    throw new Error('Caption not found.');
  }

  return touchProject({
    ...project,
    captions,
  });
}

export function addMarker(project: EditorProject, time: number, label: string): EditorProject {
  return touchProject({
    ...project,
    markers: [
      ...project.markers,
      {
        id: `marker-${Date.now()}`,
        time: Math.max(0, roundTime(time)),
        label: label.trim() || 'Marker',
        color: '#14b8a6',
        kind: 'todo' as const,
      },
    ].sort((a, b) => a.time - b.time),
  });
}

export function updateMarker(project: EditorProject, markerId: string, patch: EditableMarkerPatch): EditorProject {
  let updated = false;
  const markers = project.markers.map((marker) => {
    if (marker.id !== markerId) {
      return marker;
    }

    updated = true;
    return {
      ...marker,
      ...patch,
      time: patch.time === undefined ? marker.time : roundTime(Math.max(0, patch.time)),
      label: patch.label === undefined ? marker.label : patch.label.trim() || 'Marker',
      duration: normalizeMarkerDurationPatch(patch.duration, marker.duration),
      note: normalizeMarkerNotePatch(patch.note, marker.note),
    };
  }).sort((a, b) => a.time - b.time);

  if (!updated) {
    throw new Error('Marker not found.');
  }

  return touchProject({
    ...project,
    markers,
  });
}

function normalizeMarkerDurationPatch(nextDuration: number | undefined, currentDuration: number | undefined): number | undefined {
  if (nextDuration === undefined) {
    return currentDuration;
  }

  if (!Number.isFinite(nextDuration) || nextDuration <= 0) {
    return undefined;
  }

  return roundTime(nextDuration);
}

function normalizeMarkerNotePatch(nextNote: string | undefined, currentNote: string | undefined): string | undefined {
  if (nextNote === undefined) {
    return currentNote;
  }

  const note = nextNote.trim();
  return note ? note : undefined;
}

export function deleteMarker(project: EditorProject, markerId: string): EditorProject {
  const markers = project.markers.filter((marker) => marker.id !== markerId);
  if (markers.length === project.markers.length) {
    throw new Error('Marker not found.');
  }

  return touchProject({
    ...project,
    markers,
  });
}

export function findAdjacentMarker(
  project: EditorProject,
  time: number,
  direction: 'previous' | 'next',
): TimelineMarker | undefined {
  const targetTime = roundTime(Math.max(0, time));
  const markers = project.markers.slice().sort((a, b) => a.time - b.time);

  if (direction === 'previous') {
    return markers.filter((marker) => marker.time < targetTime - 0.001).at(-1);
  }

  return markers.find((marker) => marker.time > targetTime + 0.001);
}

export function toggleClipEffect(project: EditorProject, clipId: string, effectId: string): EditorProject {
  let clipFound = false;
  let updated = false;

  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (clip.id !== clipId) {
        return clip;
      }

      clipFound = true;
      if (track.locked || clip.locked) {
        throw new Error('Cannot toggle an effect on a locked track or clip.');
      }

      const effects = clip.effects.map((effect) => {
        if (effect.id !== effectId) {
          return effect;
        }

        updated = true;
        return { ...effect, enabled: !effect.enabled };
      });

      return {
        ...clip,
        effects,
      };
    }),
  }));

  if (!clipFound) {
    throw new Error('Clip not found.');
  }

  if (!updated) {
    throw new Error('Clip effect not found.');
  }

  return touchProject({
    ...project,
    tracks,
  });
}

export function setClipEffectsEnabledInClips(
  project: EditorProject,
  clipIds: string[],
  matchesEffect: (effect: ClipEffect, clip: TimelineClip) => boolean,
  enabled: boolean,
): ClipBatchEditResult {
  const requestedIds = Array.from(new Set(clipIds.filter(Boolean)));
  if (requestedIds.length === 0) {
    throw new Error('No target clips selected.');
  }

  let nextProject = project;
  const updatedClipIds: string[] = [];
  const skipped: ClipBatchEditSkippedClip[] = [];

  for (const clipId of requestedIds) {
    const clip = findClip(nextProject, clipId);
    if (!clip) {
      skipped.push({ clipId, reason: 'Clip not found.' });
      continue;
    }

    const effectIds = clip.effects
      .filter((effect) => matchesEffect(effect, clip))
      .map((effect) => effect.id);
    if (effectIds.length === 0) {
      skipped.push({ clipId: clip.id, reason: 'Clip has no matching effect.' });
      continue;
    }

    const track = findTrackForClip(nextProject, clip.id);
    if (track?.locked || clip.locked) {
      throw new Error('Cannot toggle an effect on a locked track or clip.');
    }

    let clipChanged = false;
    for (const effectId of effectIds) {
      const currentClip = findClip(nextProject, clip.id);
      const effect = currentClip?.effects.find((item) => item.id === effectId);
      if (!effect || effect.enabled === enabled) {
        continue;
      }

      nextProject = toggleClipEffect(nextProject, clip.id, effectId);
      clipChanged = true;
    }

    if (clipChanged) {
      updatedClipIds.push(clip.id);
    } else {
      skipped.push({ clipId: clip.id, reason: 'Matching effects already had the requested enabled state.' });
    }
  }

  if (updatedClipIds.length === 0) {
    const reason = skipped[0]?.reason;
    throw new Error(reason ? `No selected clips could toggle matching effects: ${reason}` : 'No selected clips could toggle matching effects.');
  }

  return {
    project: nextProject,
    updatedClipIds,
    skipped,
  };
}

export function addClipEffect(project: EditorProject, clipId: string, effect: ClipEffect): EditorProject {
  let updated = false;

  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (clip.id !== clipId) {
        return clip;
      }

      if (track.locked || clip.locked) {
        throw new Error('Cannot add an effect to a locked track or clip.');
      }

      if (clip.effects.some((item) => item.id === effect.id)) {
        throw new Error('Effect already exists on this clip.');
      }

      updated = true;
      return {
        ...clip,
        effects: [...clip.effects, effect],
      };
    }),
  }));

  if (!updated) {
    throw new Error('Clip not found.');
  }

  return touchProject({
    ...project,
    tracks,
  });
}

export function addClipEffectToClips(
  project: EditorProject,
  clipIds: string[],
  buildEffect: (clip: TimelineClip, index: number) => ClipEffect,
): ClipBatchEditResult {
  const requestedIds = Array.from(new Set(clipIds.filter(Boolean)));
  if (requestedIds.length === 0) {
    throw new Error('No target clips selected.');
  }

  let nextProject = project;
  const updatedClipIds: string[] = [];
  const skipped: ClipBatchEditSkippedClip[] = [];

  requestedIds.forEach((clipId, index) => {
    const clip = findClip(nextProject, clipId);
    if (!clip) {
      skipped.push({ clipId, reason: 'Clip not found.' });
      return;
    }

    try {
      nextProject = addClipEffect(nextProject, clip.id, buildEffect(clip, index));
      updatedClipIds.push(clip.id);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('locked track') || message.includes('locked clip') || message.includes('locked track or clip')) {
        throw error;
      }

      skipped.push({ clipId: clip.id, reason: message });
    }
  });

  if (updatedClipIds.length === 0) {
    const reason = skipped[0]?.reason;
    throw new Error(reason ? `No selected clips could receive effect: ${reason}` : 'No selected clips could receive effect.');
  }

  return {
    project: nextProject,
    updatedClipIds,
    skipped,
  };
}

export function removeClipEffect(project: EditorProject, clipId: string, effectId: string): EditorProject {
  let clipFound = false;
  let updated = false;

  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (clip.id !== clipId) {
        return clip;
      }

      clipFound = true;
      if (track.locked || clip.locked) {
        throw new Error('Cannot remove an effect from a locked track or clip.');
      }

      const effects = clip.effects.filter((effect) => effect.id !== effectId);
      if (effects.length === clip.effects.length) {
        return clip;
      }

      updated = true;
      return {
        ...clip,
        effects,
      };
    }),
  }));

  if (!clipFound) {
    throw new Error('Clip not found.');
  }

  if (!updated) {
    throw new Error('Clip effect not found.');
  }

  return touchProject({
    ...project,
    tracks,
  });
}

export function removeClipEffectsFromClips(
  project: EditorProject,
  clipIds: string[],
  matchesEffect: (effect: ClipEffect, clip: TimelineClip) => boolean,
): ClipBatchEditResult {
  const requestedIds = Array.from(new Set(clipIds.filter(Boolean)));
  if (requestedIds.length === 0) {
    throw new Error('No target clips selected.');
  }

  let nextProject = project;
  const updatedClipIds: string[] = [];
  const skipped: ClipBatchEditSkippedClip[] = [];

  for (const clipId of requestedIds) {
    const clip = findClip(nextProject, clipId);
    if (!clip) {
      skipped.push({ clipId, reason: 'Clip not found.' });
      continue;
    }

    const effectIds = clip.effects
      .filter((effect) => matchesEffect(effect, clip))
      .map((effect) => effect.id);
    if (effectIds.length === 0) {
      skipped.push({ clipId: clip.id, reason: 'Clip has no matching effect.' });
      continue;
    }

    try {
      for (const effectId of effectIds) {
        nextProject = removeClipEffect(nextProject, clip.id, effectId);
      }
      updatedClipIds.push(clip.id);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('locked track') || message.includes('locked clip') || message.includes('locked track or clip')) {
        throw error;
      }

      skipped.push({ clipId: clip.id, reason: message });
    }
  }

  if (updatedClipIds.length === 0) {
    const reason = skipped[0]?.reason;
    throw new Error(reason ? `No selected clips had matching effects: ${reason}` : 'No selected clips had matching effects.');
  }

  return {
    project: nextProject,
    updatedClipIds,
    skipped,
  };
}

export function moveClipEffect(
  project: EditorProject,
  clipId: string,
  effectId: string,
  direction: 'up' | 'down',
): EditorProject {
  let clipFound = false;
  let effectFound = false;
  let moved = false;

  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (clip.id !== clipId) {
        return clip;
      }

      clipFound = true;
      if (track.locked || clip.locked) {
        throw new Error('Cannot move an effect on a locked track or clip.');
      }

      const effectIndex = clip.effects.findIndex((effect) => effect.id === effectId);
      if (effectIndex === -1) {
        return clip;
      }

      effectFound = true;
      const nextIndex = direction === 'up' ? effectIndex - 1 : effectIndex + 1;
      if (nextIndex < 0 || nextIndex >= clip.effects.length) {
        return clip;
      }

      const effects = clip.effects.slice();
      const [effect] = effects.splice(effectIndex, 1);
      effects.splice(nextIndex, 0, effect);
      moved = true;

      return {
        ...clip,
        effects,
      };
    }),
  }));

  if (!clipFound) {
    throw new Error('Clip not found.');
  }

  if (!effectFound) {
    throw new Error('Clip effect not found.');
  }

  if (!moved) {
    return project;
  }

  return touchProject({
    ...project,
    tracks,
  });
}

export function applyCanvasLayout(
  project: EditorProject,
  clipId: string,
  mode: CanvasLayoutMode,
): EditorProject {
  const layoutMode = normalizeCanvasLayoutMode(mode);
  let updated = false;

  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (clip.id !== clipId) {
        return clip;
      }

      if (track.locked || clip.locked) {
        throw new Error('Cannot edit canvas layout on a locked track or clip.');
      }

      const asset = clip.assetId ? project.assets.find((item) => item.id === clip.assetId) : undefined;
      if (!clipHasVisualLayer(clip, asset)) {
        throw new Error('Canvas layout is available for visual clips.');
      }

      updated = true;
      const nonLayoutEffects = clip.effects.filter((effect) => effect.type !== 'layout');
      if (layoutMode === 'fit') {
        return {
          ...clip,
          effects: nonLayoutEffects,
        };
      }

      const effect: ClipEffect = {
        id: `effect-canvas-layout-${clip.id}`,
        type: 'layout',
        label: `${CANVAS_LAYOUT_EFFECT_LABEL}: ${canvasLayoutLabel(layoutMode)}`,
        enabled: true,
        parameters: { mode: layoutMode },
      };

      return {
        ...clip,
        effects: [...nonLayoutEffects, effect],
      };
    }),
  }));

  if (!updated) {
    throw new Error('Clip not found.');
  }

  return touchProject({
    ...project,
    tracks,
  });
}

export function applyCanvasLayoutToClips(
  project: EditorProject,
  clipIds: string[],
  mode: CanvasLayoutMode,
): ClipBatchEditResult {
  const requestedIds = clipIds.filter(Boolean);
  if (requestedIds.length === 0) {
    throw new Error('No target clips selected.');
  }

  const targetIds = expandClipIdsWithLinkedAndGroupedClips(project, requestedIds);
  if (targetIds.length === 0) {
    throw new Error('Target clip not found.');
  }

  let nextProject = project;
  const updatedClipIds: string[] = [];
  const skipped: ClipBatchEditSkippedClip[] = [];

  for (const clipId of targetIds) {
    const clip = findClip(nextProject, clipId);
    if (!clip) {
      skipped.push({ clipId, reason: 'Clip not found.' });
      continue;
    }

    try {
      nextProject = applyCanvasLayout(nextProject, clip.id, mode);
      updatedClipIds.push(clip.id);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('locked track') || message.includes('locked clip') || message.includes('locked track or clip')) {
        throw error;
      }

      skipped.push({ clipId: clip.id, reason: message });
    }
  }

  if (updatedClipIds.length === 0) {
    const reason = skipped[0]?.reason;
    throw new Error(reason ? `No selected clips could receive canvas layout: ${reason}` : 'No selected clips could receive canvas layout.');
  }

  return {
    project: nextProject,
    updatedClipIds,
    skipped,
  };
}

export function applyCropMaskPreset(
  project: EditorProject,
  clipId: string,
  presetId: CropMaskPresetId,
): EditorProject {
  const preset = findCropMaskPreset(presetId);
  if (!preset) {
    throw new Error('Crop preset not found.');
  }

  let updated = false;
  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (clip.id !== clipId) {
        return clip;
      }

      if (track.locked || clip.locked) {
        throw new Error('Cannot edit an effect on a locked track or clip.');
      }

      const asset = clip.assetId ? project.assets.find((item) => item.id === clip.assetId) : undefined;
      if (!isColorGradeableClip(clip, asset)) {
        throw new Error('Crop presets are available for video and image clips.');
      }

      updated = true;
      const existingCropEffect = findCropMaskEffect(clip);
      const nonCropEffects = clip.effects.filter((effect) => !isCropMaskEffect(effect));
      if (preset.id === 'reset') {
        return {
          ...clip,
          effects: nonCropEffects,
        };
      }

      const effect: ClipEffect = {
        id: existingCropEffect?.id ?? `effect-crop-mask-${clip.id}`,
        type: 'mask',
        label: `${CROP_MASK_EFFECT_LABEL}: ${preset.label}`,
        enabled: true,
        parameters: { ...preset.parameters },
      };

      return {
        ...clip,
        effects: [...nonCropEffects, effect],
      };
    }),
  }));

  if (!updated) {
    throw new Error('Clip not found.');
  }

  return touchProject({
    ...project,
    tracks,
  });
}

export function applyCropMaskPresetToClips(
  project: EditorProject,
  clipIds: string[],
  presetId: CropMaskPresetId,
): ClipBatchEditResult {
  const preset = findCropMaskPreset(presetId);
  if (!preset) {
    throw new Error('Crop preset not found.');
  }

  const requestedIds = clipIds.filter(Boolean);
  if (requestedIds.length === 0) {
    throw new Error('No target clips selected.');
  }

  const targetIds = expandClipIdsWithLinkedAndGroupedClips(project, requestedIds);
  if (targetIds.length === 0) {
    throw new Error('Target clip not found.');
  }

  let nextProject = project;
  const updatedClipIds: string[] = [];
  const skipped: ClipBatchEditSkippedClip[] = [];

  for (const clipId of targetIds) {
    const clip = findClip(nextProject, clipId);
    if (!clip) {
      skipped.push({ clipId, reason: 'Clip not found.' });
      continue;
    }

    try {
      nextProject = applyCropMaskPreset(nextProject, clip.id, preset.id);
      updatedClipIds.push(clip.id);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('locked track') || message.includes('locked clip') || message.includes('locked track or clip')) {
        throw error;
      }

      skipped.push({ clipId: clip.id, reason: message });
    }
  }

  if (updatedClipIds.length === 0) {
    const reason = skipped[0]?.reason;
    throw new Error(reason ? `No selected clips could receive crop preset: ${reason}` : 'No selected clips could receive crop preset.');
  }

  return {
    project: nextProject,
    updatedClipIds,
    skipped,
  };
}

export function applyColorGradingPreset(
  project: EditorProject,
  clipId: string,
  presetId: ColorGradingPresetId,
): EditorProject {
  const preset = COLOR_GRADING_PRESETS.find((item) => item.id === presetId);
  if (!preset) {
    throw new Error('Color preset not found.');
  }

  let updated = false;
  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (clip.id !== clipId) {
        return clip;
      }

      if (track.locked || clip.locked) {
        throw new Error('Cannot edit an effect on a locked track or clip.');
      }

      const asset = clip.assetId ? project.assets.find((item) => item.id === clip.assetId) : undefined;
      if (!isColorGradeableClip(clip, asset)) {
        throw new Error('Color presets are available for video and image clips.');
      }

      updated = true;
      const existingColorEffect = clip.effects.find((effect) => effect.type === 'color');
      const nextParameters = { ...preset.parameters };
      if (existingColorEffect) {
        return {
          ...clip,
          effects: clip.effects.map((effect) => (
            effect.id === existingColorEffect.id
              ? {
                ...effect,
                label: `Color grade: ${preset.label}`,
                enabled: true,
                parameters: nextParameters,
              }
              : effect
          )),
        };
      }

      const effect: ClipEffect = {
        id: `effect-color-grade-${Date.now()}`,
        type: 'color',
        label: `Color grade: ${preset.label}`,
        enabled: true,
        parameters: nextParameters,
      };

      return {
        ...clip,
        effects: [...clip.effects, effect],
      };
    }),
  }));

  if (!updated) {
    throw new Error('Clip not found.');
  }

  return touchProject({
    ...project,
    tracks,
  });
}

export function applyColorGradingPresetToClips(
  project: EditorProject,
  clipIds: string[],
  presetId: ColorGradingPresetId,
): ClipBatchEditResult {
  const preset = COLOR_GRADING_PRESETS.find((item) => item.id === presetId);
  if (!preset) {
    throw new Error('Color preset not found.');
  }

  const requestedIds = clipIds.filter(Boolean);
  if (requestedIds.length === 0) {
    throw new Error('No target clips selected.');
  }

  const targetIds = expandClipIdsWithLinkedAndGroupedClips(project, requestedIds);
  if (targetIds.length === 0) {
    throw new Error('Target clip not found.');
  }

  let nextProject = project;
  const updatedClipIds: string[] = [];
  const skipped: ClipBatchEditSkippedClip[] = [];

  for (const clipId of targetIds) {
    const clip = findClip(nextProject, clipId);
    if (!clip) {
      skipped.push({ clipId, reason: 'Clip not found.' });
      continue;
    }

    try {
      nextProject = applyColorGradingPreset(nextProject, clip.id, preset.id);
      updatedClipIds.push(clip.id);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('locked track') || message.includes('locked clip') || message.includes('locked track or clip')) {
        throw error;
      }

      skipped.push({ clipId: clip.id, reason: message });
    }
  }

  if (updatedClipIds.length === 0) {
    const reason = skipped[0]?.reason;
    throw new Error(reason ? `No selected clips could receive color preset: ${reason}` : 'No selected clips could receive color preset.');
  }

  return {
    project: nextProject,
    updatedClipIds,
    skipped,
  };
}

export function updateClipEffectParameters(
  project: EditorProject,
  clipId: string,
  effectId: string,
  parameters: ClipEffect['parameters'],
): EditorProject {
  let updated = false;

  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (clip.id !== clipId) {
        return clip;
      }

      if (track.locked || clip.locked) {
        throw new Error('Cannot edit an effect on a locked track or clip.');
      }

      const effects = clip.effects.map((effect) => {
        if (effect.id !== effectId) {
          return effect;
        }

        const nextParameters = {
          ...effect.parameters,
          ...parameters,
        };
        const effectWithNextParameters = {
          ...effect,
          parameters: nextParameters,
        };
        const trackingQualityPatch = buildTrackingQualityParameterPatch(effectWithNextParameters, clip.duration);

        updated = true;
        return {
          ...effect,
          parameters: {
            ...nextParameters,
            ...trackingQualityPatch,
          },
        };
      });

      return {
        ...clip,
        effects,
      };
    }),
  }));

  if (!updated) {
    throw new Error('Clip effect not found.');
  }

  return touchProject({
    ...project,
    tracks,
  });
}

export function updateClipEffectParametersInClips(
  project: EditorProject,
  clipIds: string[],
  matchesEffect: (effect: ClipEffect, clip: TimelineClip) => boolean,
  parameters: ClipEffect['parameters'],
): ClipBatchEditResult {
  const requestedIds = Array.from(new Set(clipIds.filter(Boolean)));
  if (requestedIds.length === 0) {
    throw new Error('No target clips selected.');
  }

  let nextProject = project;
  const updatedClipIds: string[] = [];
  const skipped: ClipBatchEditSkippedClip[] = [];

  for (const clipId of requestedIds) {
    const clip = findClip(nextProject, clipId);
    if (!clip) {
      skipped.push({ clipId, reason: 'Clip not found.' });
      continue;
    }

    const effectIds = clip.effects
      .filter((effect) => matchesEffect(effect, clip))
      .map((effect) => effect.id);
    if (effectIds.length === 0) {
      skipped.push({ clipId: clip.id, reason: 'Clip has no matching effect.' });
      continue;
    }

    try {
      for (const effectId of effectIds) {
        nextProject = updateClipEffectParameters(nextProject, clip.id, effectId, parameters);
      }
      updatedClipIds.push(clip.id);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('locked track') || message.includes('locked clip') || message.includes('locked track or clip')) {
        throw error;
      }

      skipped.push({ clipId: clip.id, reason: message });
    }
  }

  if (updatedClipIds.length === 0) {
    const reason = skipped[0]?.reason;
    throw new Error(reason ? `No selected clips could update matching effects: ${reason}` : 'No selected clips could update matching effects.');
  }

  return {
    project: nextProject,
    updatedClipIds,
    skipped,
  };
}

function isColorGradeableClip(clip: TimelineClip, asset?: EditorAsset): boolean {
  return clip.kind === 'video' ||
    clip.kind === 'image' ||
    isRenderableVisualMediaAsset(asset) ||
    isAdjustmentLayerClip(clip, asset);
}

function findNextOpenStart(track: TimelineTrack, duration: number): number {
  if (track.clips.length === 0) {
    return 0;
  }

  const sortedClips = [...track.clips].sort((a, b) => a.start - b.start);
  let cursor = 0;

  for (const clip of sortedClips) {
    if (clip.start - cursor >= duration) {
      return cursor;
    }

    cursor = Math.max(cursor, clip.start + clip.duration);
  }

  return roundTime(cursor + 1);
}

function findTrackForClip(project: EditorProject, clipId: string): TimelineTrack | undefined {
  return project.tracks.find((track) => track.clips.some((clip) => clip.id === clipId));
}

function replaceClipsById(project: EditorProject, replacements: Map<string, TimelineClip>): EditorProject {
  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => replacements.get(clip.id) ?? clip).sort((a, b) => a.start - b.start),
  }));

  return touchProject({
    ...project,
    tracks,
    duration: durationForTracks(tracks, project.duration),
  });
}

function normalizeReplacementRange(
  asset: EditorAsset,
  clip: TimelineClip,
  options: ReplaceClipSourceOptions,
): { sourceIn: number; duration: number } {
  const assetDuration = roundTime(Math.max(0, asset.duration));
  const sourceIn = roundTime(clamp(options.sourceIn ?? clip.sourceIn, 0, assetDuration));
  const maxDuration = roundTime(Math.max(0, assetDuration - sourceIn));
  if (assetDuration <= 0 || maxDuration < MIN_CLIP_DURATION) {
    throw new Error('Replacement asset has no usable source range.');
  }

  const duration = roundTime(Math.min(
    Math.max(MIN_CLIP_DURATION, options.duration ?? clip.duration),
    maxDuration,
  ));

  return { sourceIn, duration };
}

function createPastedClip(
  sourceClip: TimelineClip,
  trackId: string,
  start: number,
  idPrefix: string,
): TimelineClip {
  return {
    ...sourceClip,
    id: `${idPrefix}-${Date.now()}-${sourceClip.id}`,
    trackId,
    start: roundTime(Math.max(0, start)),
    locked: false,
    automationTags: [...sourceClip.automationTags],
    effects: cloneClipEffects(sourceClip.effects),
    keyframes: cloneClipKeyframes(sourceClip.keyframes),
    speedRamp: sourceClip.speedRamp?.map((point) => ({ ...point })),
    transitionIn: sourceClip.transitionIn
      ? { ...sourceClip.transitionIn, parameters: { ...sourceClip.transitionIn.parameters } }
      : undefined,
    transitionOut: sourceClip.transitionOut
      ? { ...sourceClip.transitionOut, parameters: { ...sourceClip.transitionOut.parameters } }
      : undefined,
    generation: sourceClip.generation ? { ...sourceClip.generation } : undefined,
  };
}

function createAssetRangeClip(
  asset: EditorAsset,
  trackId: string,
  options: AssetRangeEditOptions,
  idPrefix: string,
): TimelineClip {
  return createAssetRangeClipFromRange(asset, trackId, normalizeAssetRangeEdit(asset, options), idPrefix);
}

function createAssetRangeClipFromRange(
  asset: EditorAsset,
  trackId: string,
  range: { start: number; sourceIn: number; duration: number },
  idPrefix: string,
): TimelineClip {
  return createClip({
    id: `${idPrefix}-${Date.now()}-${asset.id}`,
    assetId: asset.id,
    trackId,
    name: asset.name,
    kind: asset.kind,
    start: range.start,
    sourceIn: range.sourceIn,
    duration: range.duration,
    color: colorForAsset(asset),
    automationTags: automationTagsForAsset(asset),
  });
}

function createAssetAudioPatchClip(
  asset: EditorAsset,
  trackId: string,
  range: { start: number; sourceIn: number; duration: number },
  linkedVideoClipId?: string,
): TimelineClip {
  const assetMediaKind = resolveRenderableAssetMediaKind(asset);
  return createClip({
    id: `clip-patch-audio-${Date.now()}-${asset.id}`,
    assetId: asset.id,
    trackId,
    name: assetMediaKind === 'audio' ? asset.name : `${asset.name} audio`,
    kind: 'audio',
    start: range.start,
    sourceIn: range.sourceIn,
    duration: range.duration,
    color: '#84cc16',
    automationTags: withUniqueTags(
      assetMediaKind === 'audio' ? automationTagsForAsset(asset) : ['loudness'],
      linkedVideoClipId ? ['detached-audio', buildLinkedVideoTag(linkedVideoClipId)] : [],
    ),
  });
}

function normalizeAssetRangeEdit(asset: EditorAsset, options: AssetRangeEditOptions): { start: number; sourceIn: number; duration: number } {
  const assetDuration = roundTime(Math.max(0, asset.duration));
  const sourceIn = roundTime(clamp(options.sourceIn ?? 0, 0, assetDuration));
  const maxDuration = roundTime(Math.max(0, assetDuration - sourceIn));
  const requestedDuration = options.duration === undefined
    ? maxDuration
    : roundTime(options.duration);

  if (maxDuration <= 0 || requestedDuration <= 0) {
    throw new Error('Source range must be longer than 0 seconds.');
  }

  const duration = roundTime(Math.min(requestedDuration, maxDuration));
  const start = roundTime(Math.max(0, options.start));

  return { start, sourceIn, duration };
}

function insertGapIntoTrack(track: TimelineTrack, start: number, duration: number): TimelineClip[] {
  const gapStart = roundTime(Math.max(0, start));
  const gapDuration = roundTime(Math.max(0, duration));
  if (gapDuration <= 0) {
    return track.clips;
  }

  if (track.locked && track.clips.some((clip) => clip.start + clip.duration > gapStart)) {
    throw new Error('Cannot insert through locked tracks in the target range.');
  }

  return track.clips.flatMap((clip) => {
    const clipStart = clip.start;
    const clipEnd = roundTime(clip.start + clip.duration);

    if (clipEnd <= gapStart) {
      return [clip];
    }

    if (clip.locked) {
      throw new Error('Cannot insert through locked clips in the target range.');
    }

    if (clipStart >= gapStart) {
      return [{
        ...clip,
        start: roundTime(clip.start + gapDuration),
      }];
    }

    const leftDuration = roundTime(gapStart - clipStart);
    const rightDuration = roundTime(clipEnd - gapStart);
    const pieces: TimelineClip[] = [];

    if (leftDuration > 0) {
      pieces.push({
        ...clip,
        duration: leftDuration,
        keyframes: sliceClipKeyframes(clip, 0, leftDuration, '-gap-left'),
      });
    }

    if (rightDuration > 0) {
      const tailOffset = roundTime(gapStart - clipStart);
      pieces.push({
        ...clip,
        id: `${clip.id}-tail-${Date.now()}`,
        start: roundTime(gapStart + gapDuration),
        sourceIn: roundTime(clip.sourceIn + timelineDeltaToSourceDelta(clip, tailOffset)),
        duration: rightDuration,
        keyframes: sliceClipKeyframes(clip, tailOffset, rightDuration, '-gap-tail'),
      });
    }

    return pieces;
  });
}

function buildRippleTrimAnnotationEdit(
  clipStart: number,
  originalEnd: number,
  nextEnd: number,
  edge: 'start' | 'end',
  appliedDelta: number,
): AnnotationTimeEdit | undefined {
  if (appliedDelta === 0) {
    return undefined;
  }

  if (edge === 'start') {
    return appliedDelta > 0
      ? { mode: 'remove', start: clipStart, end: roundTime(clipStart + appliedDelta) }
      : { mode: 'insert', start: clipStart, end: roundTime(clipStart - appliedDelta) };
  }

  return appliedDelta > 0
    ? { mode: 'insert', start: originalEnd, end: nextEnd }
    : { mode: 'remove', start: nextEnd, end: originalEnd };
}

function applyRippleTrimAnnotationEdits(
  project: AnnotationEditState,
  contexts: RippleTrimContext[],
): Partial<AnnotationEditState> {
  const edits = uniqueAnnotationTimeEdits(contexts.flatMap((context) => (
    context.annotationEdit ? [context.annotationEdit] : []
  )));

  if (edits.length === 0) {
    return {};
  }

  let annotations: AnnotationEditState = {
    markers: project.markers,
    captions: project.captions,
  };

  for (const edit of edits) {
    if (edit.mode === 'insert') {
      annotations = shiftAnnotationsForInsertedRange(annotations, edit.start, roundTime(edit.end - edit.start));
      continue;
    }

    annotations = removeAnnotationsForTimeSpans(annotations, [edit]);
  }

  return annotations;
}

function uniqueAnnotationTimeEdits(edits: AnnotationTimeEdit[]): AnnotationTimeEdit[] {
  const seen = new Set<string>();
  return edits
    .map((edit) => ({
      ...edit,
      start: roundTime(Math.max(0, Math.min(edit.start, edit.end))),
      end: roundTime(Math.max(edit.start, edit.end)),
    }))
    .filter((edit) => edit.end > edit.start)
    .sort((a, b) => a.start - b.start || a.end - b.end || a.mode.localeCompare(b.mode))
    .filter((edit) => {
      const key = `${edit.mode}:${edit.start}:${edit.end}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

function shiftAnnotationsForInsertedRange(
  project: AnnotationEditState,
  start: number,
  duration: number,
): AnnotationEditState {
  const startTime = roundTime(Math.max(0, start));
  const insertDuration = roundTime(Math.max(0, duration));

  if (insertDuration <= 0) {
    return {
      markers: project.markers,
      captions: project.captions,
    };
  }

  return {
    markers: project.markers
      .map((marker) => (
        marker.time >= startTime
          ? { ...marker, time: roundTime(marker.time + insertDuration) }
          : marker
      ))
      .sort((a, b) => a.time - b.time),
    captions: project.captions
      .map((caption) => shiftCaptionForInsertedRange(caption, startTime, insertDuration))
      .sort((a, b) => a.start - b.start),
  };
}

function shiftCaptionForInsertedRange(
  caption: CaptionSegment,
  startTime: number,
  duration: number,
): CaptionSegment {
  if (caption.start >= startTime) {
    return shiftCaption(caption, duration);
  }

  if (caption.start < startTime && caption.end > startTime) {
    return {
      ...caption,
      end: roundTime(caption.end + duration),
      words: caption.words?.map((word) => {
        if (word.start >= startTime) {
          return shiftCaptionWord(word, duration);
        }

        if (word.start < startTime && word.end > startTime) {
          return {
            ...word,
            end: roundTime(word.end + duration),
          };
        }

        return word;
      }),
    };
  }

  return caption;
}

function removeAnnotationsForTimeSpans(
  project: AnnotationEditState,
  spans: Array<{ start: number; end: number }>,
): AnnotationEditState {
  let annotations: AnnotationEditState = {
    markers: project.markers,
    captions: project.captions,
  };
  let accumulatedShift = 0;

  for (const span of mergeTimeSpans(spans)) {
    const duration = roundTime(span.end - span.start);
    const adjustedStart = roundTime(Math.max(0, span.start - accumulatedShift));
    const adjustedEnd = roundTime(Math.max(adjustedStart, span.end - accumulatedShift));
    annotations = removeAnnotationsInRange(annotations, adjustedStart, adjustedEnd);
    accumulatedShift = roundTime(accumulatedShift + duration);
  }

  return annotations;
}

function removeAnnotationsInRange(
  project: AnnotationEditState,
  start: number,
  end: number,
): AnnotationEditState {
  const startTime = roundTime(Math.max(0, Math.min(start, end)));
  const endTime = roundTime(Math.max(startTime, Math.max(start, end)));
  const rangeDuration = roundTime(endTime - startTime);

  if (rangeDuration <= 0) {
    return {
      markers: project.markers,
      captions: project.captions,
    };
  }

  return {
    markers: project.markers
      .flatMap((marker) => {
        if (marker.time >= startTime && marker.time < endTime) {
          return [];
        }

        return marker.time >= endTime
          ? [{ ...marker, time: roundTime(Math.max(0, marker.time - rangeDuration)) }]
          : [marker];
      })
      .sort((a, b) => a.time - b.time),
    captions: project.captions
      .flatMap((caption) => {
        const editedCaption = removeCaptionRange(caption, startTime, endTime);
        return editedCaption ? [editedCaption] : [];
      })
      .sort((a, b) => a.start - b.start),
  };
}

function removeCaptionRange(
  caption: CaptionSegment,
  startTime: number,
  endTime: number,
): CaptionSegment | undefined {
  const rangeDuration = roundTime(endTime - startTime);

  if (caption.end <= startTime) {
    return caption;
  }

  if (caption.start >= endTime) {
    return shiftCaption(caption, -rangeDuration);
  }

  if (caption.start >= startTime && caption.end <= endTime) {
    return undefined;
  }

  const words = caption.words
    ?.flatMap((word) => {
      const editedWord = removeCaptionWordRange(word, startTime, endTime);
      return editedWord ? [editedWord] : [];
    })
    .filter((word) => word.end - word.start >= MIN_CAPTION_DURATION);

  if (caption.start < startTime && caption.end > endTime) {
    return keepCaptionDuration({
      ...caption,
      end: roundTime(caption.end - rangeDuration),
      words,
    });
  }

  if (caption.start < startTime && caption.end > startTime) {
    return keepCaptionDuration({
      ...caption,
      end: startTime,
      words,
    });
  }

  if (caption.start < endTime && caption.end > endTime) {
    return keepCaptionDuration({
      ...caption,
      start: startTime,
      end: roundTime(caption.end - rangeDuration),
      words,
    });
  }

  return caption;
}

function removeCaptionWordRange(
  word: NonNullable<CaptionSegment['words']>[number],
  startTime: number,
  endTime: number,
): NonNullable<CaptionSegment['words']>[number] | undefined {
  const rangeDuration = roundTime(endTime - startTime);

  if (word.end <= startTime) {
    return word;
  }

  if (word.start >= endTime) {
    return shiftCaptionWord(word, -rangeDuration);
  }

  if (word.start >= startTime && word.end <= endTime) {
    return undefined;
  }

  if (word.start < startTime && word.end > endTime) {
    return {
      ...word,
      end: roundTime(word.end - rangeDuration),
    };
  }

  if (word.start < startTime && word.end > startTime) {
    return {
      ...word,
      end: startTime,
    };
  }

  if (word.start < endTime && word.end > endTime) {
    return {
      ...word,
      start: startTime,
      end: roundTime(word.end - rangeDuration),
    };
  }

  return word;
}

function shiftCaption(caption: CaptionSegment, delta: number): CaptionSegment {
  return {
    ...caption,
    start: roundTime(Math.max(0, caption.start + delta)),
    end: roundTime(Math.max(0, caption.end + delta)),
    words: caption.words?.map((word) => shiftCaptionWord(word, delta)),
  };
}

function shiftCaptionWord(
  word: NonNullable<CaptionSegment['words']>[number],
  delta: number,
): NonNullable<CaptionSegment['words']>[number] {
  return {
    ...word,
    start: roundTime(Math.max(0, word.start + delta)),
    end: roundTime(Math.max(0, word.end + delta)),
  };
}

function keepCaptionDuration(caption: CaptionSegment): CaptionSegment | undefined {
  return caption.end - caption.start >= MIN_CAPTION_DURATION ? caption : undefined;
}

function rippleEditTrackIds(tracks: TimelineTrack[], baseTrackIds: string[]): Set<string> {
  const ids = new Set(baseTrackIds);
  for (const track of tracks) {
    if (track.syncLocked) {
      ids.add(track.id);
    }
  }

  return ids;
}

function mergeTimeSpans(spans: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  const sortedSpans = spans
    .map((span) => ({
      start: roundTime(Math.max(0, Math.min(span.start, span.end))),
      end: roundTime(Math.max(span.start, span.end)),
    }))
    .filter((span) => span.end > span.start)
    .sort((a, b) => a.start - b.start);

  const merged: Array<{ start: number; end: number }> = [];
  for (const span of sortedSpans) {
    const previous = merged[merged.length - 1];
    if (!previous || span.start > previous.end) {
      merged.push(span);
      continue;
    }

    previous.end = Math.max(previous.end, span.end);
  }

  return merged;
}

function removeTimeRangeFromTrack(
  track: TimelineTrack,
  start: number,
  end: number,
  tailIdByOriginalId?: Map<string, string>,
): TimelineClip[] {
  return track.clips.flatMap((clip) => {
    const clipStart = clip.start;
    const clipEnd = clip.start + clip.duration;

    if (clipEnd <= start || clipStart >= end) {
      return [clip];
    }

    if (clip.locked) {
      throw new Error('Cannot edit locked clips in the target range.');
    }

    const pieces: TimelineClip[] = [];
    if (clipStart < start) {
      const leftDuration = roundTime(start - clipStart);
      pieces.push({
        ...clip,
        duration: leftDuration,
        keyframes: sliceClipKeyframes(clip, 0, leftDuration, '-range-left'),
      });
    }

    if (clipEnd > end) {
      const tailId = `${clip.id}-tail-${Date.now()}`;
      const tailOffset = roundTime(end - clipStart);
      const tailDuration = roundTime(clipEnd - end);
      tailIdByOriginalId?.set(clip.id, tailId);
      pieces.push({
        ...clip,
        id: tailId,
        start: end,
        sourceIn: roundTime(clip.sourceIn + timelineDeltaToSourceDelta(clip, tailOffset)),
        duration: tailDuration,
        keyframes: sliceClipKeyframes(clip, tailOffset, tailDuration, '-range-tail'),
      });
    }

    return pieces;
  });
}

function ensureEditableTrack(
  tracks: TimelineTrack[],
  kind: TrackKind,
  targetTrackId?: string,
): { tracks: TimelineTrack[]; targetTrack: TimelineTrack } {
  const preferredTrack = tracks.find((track) => track.id === targetTrackId && track.kind === kind && !track.locked);
  if (preferredTrack) {
    return { tracks, targetTrack: preferredTrack };
  }

  const openTrack = tracks.find((track) => track.kind === kind && !track.locked);
  if (openTrack) {
    return { tracks, targetTrack: openTrack };
  }

  const createdTrack: TimelineTrack = {
    id: `track-${kind}-${Date.now()}`,
    name: `${kind[0].toUpperCase()}${kind.slice(1)} ${tracks.filter((track) => track.kind === kind).length + 1}`,
    kind,
    muted: false,
    solo: false,
    syncLocked: false,
    volumeDb: 0,
    pan: 0,
    locked: false,
    clips: [],
  };

  return {
    tracks: [...tracks, createdTrack],
    targetTrack: createdTrack,
  };
}

function ensureTextTrackForRange(
  tracks: TimelineTrack[],
  targetTrackId: string,
  start: number,
  duration: number,
): { tracks: TimelineTrack[]; targetTrack: TimelineTrack } {
  const preferredTrack = tracks.find((track) => track.id === targetTrackId && track.kind === 'text' && !track.locked);
  const candidateTracks = [
    ...(preferredTrack ? [preferredTrack] : []),
    ...tracks.filter((track) => track.id !== targetTrackId && track.kind === 'text' && !track.locked),
  ];
  const openTrack = candidateTracks.find((track) => !trackHasRangeOverlap(track, start, duration));
  if (openTrack) {
    return { tracks, targetTrack: openTrack };
  }

  const createdTrack: TimelineTrack = {
    id: `track-text-${Date.now()}`,
    name: `Title ${tracks.filter((track) => track.kind === 'text').length + 1}`,
    kind: 'text',
    muted: false,
    solo: false,
    syncLocked: false,
    volumeDb: 0,
    pan: 0,
    locked: false,
    clips: [],
  };

  return {
    tracks: [...tracks, createdTrack],
    targetTrack: createdTrack,
  };
}

function trackHasRangeOverlap(track: TimelineTrack, start: number, duration: number): boolean {
  const end = roundTime(start + duration);
  return track.clips.some((clip) => (
    start < clip.start + clip.duration - 0.001 &&
    clip.start < end - 0.001
  ));
}

function trackKindForAsset(asset: EditorAsset): TrackKind {
  if (resolveRenderableAssetMediaKind(asset) === 'audio') {
    return 'audio';
  }

  if (asset.kind === 'text') {
    return 'text';
  }

  if (asset.kind === 'effect') {
    return 'effect';
  }

  return 'video';
}

function trackKindForClip(clip: TimelineClip, asset?: EditorAsset): TrackKind {
  if (resolveRenderableAssetMediaKind(asset) === 'audio') {
    return 'audio';
  }

  if (clip.kind === 'audio') {
    return 'audio';
  }

  if (clip.kind === 'text') {
    return 'text';
  }

  if (clip.kind === 'effect') {
    return 'effect';
  }

  return 'video';
}

function assetForTimelineClip(project: EditorProject, clip: TimelineClip): EditorAsset | undefined {
  return clip.assetId ? project.assets.find((asset) => asset.id === clip.assetId) : undefined;
}

function colorForAsset(asset: EditorAsset): string {
  switch (resolveRenderableAssetMediaKind(asset) ?? asset.kind) {
    case 'audio':
      return '#84cc16';
    case 'image':
      return '#06b6d4';
    case 'text':
      return '#eab308';
    default:
      return '#60a5fa';
  }
}

function automationTagsForAsset(asset: EditorAsset): string[] {
  const mediaKind = resolveRenderableAssetMediaKind(asset);
  if (mediaKind === 'audio') {
    return asset.metadata?.voiceover === true ? ['loudness', 'voice'] : ['loudness'];
  }

  if (asset.kind === 'text') {
    return ['caption'];
  }

  if (asset.kind === 'effect') {
    return ['effect'];
  }

  return ['analyze'];
}

function normalizeTitleText(text: string): string {
  const normalized = normalizeMultilineText(text);
  if (!normalized) {
    throw new Error('Title text cannot be empty.');
  }

  return normalized;
}

function titleClipName(text: string): string {
  const flattened = text.replace(/\s+/g, ' ').trim();
  const title = flattened.length > 36 ? `${flattened.slice(0, 33)}...` : flattened;
  return `Title: ${title}`;
}

function normalizeMultilineText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/[ \t]+/g, ' '))
    .filter(Boolean)
    .join('\n');
}

function touchProject(project: EditorProject): EditorProject {
  return {
    ...project,
    updatedAt: new Date().toISOString(),
  };
}

function durationForTracks(tracks: TimelineTrack[], minimumDuration: number): number {
  const trackDuration = tracks.reduce((maxDuration, track) => (
    Math.max(maxDuration, ...track.clips.map((clip) => clip.start + clip.duration))
  ), 0);

  return roundTime(Math.max(minimumDuration, trackDuration));
}

function splitCaptionText(text: string): [string, string] {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return ['Caption', 'Caption'];
  }

  const words = normalizedText.split(/\s+/);
  if (words.length < 2) {
    return [normalizedText, normalizedText];
  }

  const midpoint = Math.ceil(words.length / 2);
  return [
    words.slice(0, midpoint).join(' '),
    words.slice(midpoint).join(' '),
  ];
}

function uniqueCaptionId(baseId: string, existingIds: Set<string>): string {
  const safeBaseId = baseId.replace(/[^a-zA-Z0-9_-]+/g, '-') || 'caption-import';
  if (!existingIds.has(safeBaseId)) {
    return safeBaseId;
  }

  let suffix = 2;
  while (existingIds.has(`${safeBaseId}-${suffix}`)) {
    suffix += 1;
  }

  return `${safeBaseId}-${suffix}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function normalizeClipColor(value: string, fallback: string): string {
  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : fallback;
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(Number.isFinite(value) ? value : min)));
}
