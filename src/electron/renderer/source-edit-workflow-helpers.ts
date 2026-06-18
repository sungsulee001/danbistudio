import { getClipSourceTime } from '../../lib/editor/clip-timing';
import { readAssetBin } from '../../lib/editor/media-bin';
import { hasEmbeddedAudio } from '../../lib/editor/media-metadata';
import { resolveRenderableAssetMediaKind } from '../../lib/editor/renderable-media-kind';
import type { CreateMediaSubclipOptions } from '../../lib/editor/subclip';
import type { AssetPatchEditOptions, ReplaceClipSourceOptions } from '../../lib/editor/timeline';
import type { EditorAsset, EditorProject, TimelineClip, TrackKind } from '../../lib/editor/types';
import { clampNumber, formatTimecode, roundTime } from './editor-time-helpers';
import type { SourceRange } from './editor-view-model';
import { normalizeSourceRange, resolveEditableTrackId, trackKindForSourceAsset } from './timeline-source-helpers';

export interface SourcePatchSettings {
  selectedTrackId: string;
  sourcePrimaryPatchTrackId: string;
  sourceAudioPatchTrackId: string;
  sourcePrimaryPatchEnabled: boolean;
  sourceAudioPatchEnabled: boolean;
}

export interface SourceMarkedRange {
  start: number;
  end: number;
}

export type SourceRangeHandle = 'in' | 'out';

export type SourceRangePatchPlan =
  | {
    canApply: false;
    status?: string;
    assetId?: undefined;
    range?: undefined;
  }
  | {
    canApply: true;
    assetId: string;
    range: SourceRange;
    status?: string;
  };

export type SourceRangeResetPlan =
  | {
    canReset: false;
    status: string;
    assetId?: undefined;
    range?: undefined;
  }
  | {
    canReset: true;
    assetId: string;
    range: SourceRange;
    status: string;
  };

export type SourceMarkSeekPlan =
  | {
    canSeek: false;
    status: string;
    sourcePlayhead?: undefined;
  }
  | {
    canSeek: true;
    sourcePlayhead: number;
    status: string;
  };

export type SourceAssetPatchPlan =
  | {
    canEdit: false;
    status: string;
    commitLabel?: undefined;
    assetId?: undefined;
    operation?: undefined;
    options?: undefined;
    nextPlayhead?: undefined;
  }
  | {
    canEdit: true;
    commitLabel: string;
    assetId: string;
    operation: 'insert' | 'overwrite';
    options: AssetPatchEditOptions;
    nextPlayhead: number;
  };

export type SourceAssetInsertAtPlayheadPlan =
  | {
    canInsert: false;
    status: string;
  }
  | {
    canInsert: true;
    commitLabel: string;
    assetId: string;
    options: AssetPatchEditOptions;
  };

export type SourceAssetOverwriteAtPlayheadPlan =
  | {
    canOverwrite: false;
    status: string;
  }
  | {
    canOverwrite: true;
    commitLabel: string;
    assetId: string;
    options: AssetPatchEditOptions;
  };

export type SourceAssetInsertedSelectionPlan =
  | {
    canSelect: false;
  }
  | {
    canSelect: true;
    selectedClipId: string;
    selectedClipIds: string[];
    selectedTrackId: string;
    nextPlayhead: number;
  };

export type MatchFrameToSourcePlan =
  | {
    canMatch: false;
    status: string;
  }
  | {
    canMatch: true;
    status: string;
    activeMonitor: 'source';
    selectedSourceAssetId: string;
    sourcePlayhead: number;
  };

export type ReplaceSelectedFromSourcePlan =
  | {
    canReplace: false;
    status: string;
    commitLabel?: undefined;
    targetClipId?: undefined;
    sourceAssetId?: undefined;
    options?: undefined;
  }
  | {
    canReplace: true;
    commitLabel: string;
    targetClipId: string;
    sourceAssetId: string;
    options: ReplaceClipSourceOptions;
  };

export type SourceSubclipReadinessPlan =
  | {
    canCreate: false;
    status: string;
    assetId?: undefined;
    options?: undefined;
  }
  | {
    canCreate: true;
    assetId: string;
    options: CreateMediaSubclipOptions;
    status?: undefined;
  };

export interface SourceSubclipResultPlan {
  selectedSourceAssetId: string;
  sourceRange: SourceRange;
  sourcePlayhead: number;
  mediaBinFilter: string;
  commitLabel: string;
  status: string;
}

export function resolveSourceRangePatch({
  asset,
  currentRange,
  patch,
}: {
  asset: EditorAsset;
  currentRange?: SourceRange;
  patch: Partial<SourceRange>;
}): SourceRange {
  const normalizedCurrentRange = normalizeSourceRange(asset, currentRange);
  return normalizeSourceRange(asset, { ...normalizedCurrentRange, ...patch });
}

export function resolveSourceRangePatchPlan({
  asset,
  currentRange,
  patch,
}: {
  asset?: EditorAsset;
  currentRange?: SourceRange;
  patch: Partial<SourceRange>;
}): SourceRangePatchPlan {
  if (!asset) {
    return { canApply: false };
  }

  return {
    canApply: true,
    assetId: asset.id,
    range: resolveSourceRangePatch({
      asset,
      currentRange,
      patch,
    }),
  };
}

export function resolveSourceRangePointerTime({
  clientX,
  railLeft,
  railWidth,
  duration,
  fps,
}: {
  clientX: number;
  railLeft: number;
  railWidth: number;
  duration: number;
  fps: number;
}): number {
  if (railWidth <= 0 || duration <= 0) {
    return 0;
  }

  const percent = clampNumber((clientX - railLeft) / railWidth, 0, 1);
  const rawTime = percent * duration;
  const frameDuration = fps > 0 ? 1 / fps : 0;
  const snappedTime = frameDuration > 0
    ? Math.round(rawTime / frameDuration) * frameDuration
    : rawTime;

  return roundTime(clampNumber(snappedTime, 0, duration));
}

export function resolveSourceRangeHandlePatch({
  asset,
  currentRange,
  handle,
  time,
  fps,
}: {
  asset?: EditorAsset;
  currentRange?: SourceRange;
  handle: SourceRangeHandle;
  time: number;
  fps: number;
}): SourceRangePatchPlan {
  if (!asset) {
    return { canApply: false, status: 'Select a source asset first' };
  }

  const normalizedRange = normalizeSourceRange(asset, currentRange);
  const duration = roundTime(Math.max(0, asset.duration));
  const safeTime = roundTime(clampNumber(time, 0, duration));
  const minimumDuration = roundTime(Math.min(duration, Math.max(0.001, fps > 0 ? 1 / fps : 0.001)));

  if (handle === 'in') {
    const nextIn = roundTime(clampNumber(safeTime, 0, Math.max(0, normalizedRange.out - minimumDuration)));
    return {
      canApply: true,
      assetId: asset.id,
      range: { in: nextIn, out: normalizedRange.out },
      status: `Source in trimmed to ${formatTimecode(nextIn, fps)}`,
    };
  }

  const nextOut = roundTime(clampNumber(safeTime, Math.min(duration, normalizedRange.in + minimumDuration), duration));
  return {
    canApply: true,
    assetId: asset.id,
    range: { in: normalizedRange.in, out: nextOut },
    status: `Source out trimmed to ${formatTimecode(nextOut, fps)}`,
  };
}

export function resolveSourceRangeReset(asset: EditorAsset): SourceRange {
  return { in: 0, out: roundTime(asset.duration) };
}

export function resolveSourceRangeResetPlan(asset?: EditorAsset): SourceRangeResetPlan {
  if (!asset) {
    return {
      canReset: false,
      status: 'Select a source asset first',
    };
  }

  return {
    canReset: true,
    assetId: asset.id,
    range: resolveSourceRangeReset(asset),
    status: 'Source range reset',
  };
}

export function resolveSourceSubclipReadinessPlan({
  selectedSourceAsset,
  selectedSourceRange,
  selectedSourceAssetBin,
}: {
  selectedSourceAsset?: EditorAsset;
  selectedSourceRange: SourceRange | null;
  selectedSourceAssetBin?: string;
}): SourceSubclipReadinessPlan {
  if (!selectedSourceAsset || !selectedSourceRange) {
    return { canCreate: false, status: 'Select a source range first' };
  }

  return {
    canCreate: true,
    assetId: selectedSourceAsset.id,
    options: {
      sourceIn: selectedSourceRange.in,
      sourceOut: selectedSourceRange.out,
      bin: selectedSourceAssetBin,
    },
  };
}

export function resolveSourceSubclipResultPlan(asset: EditorAsset): SourceSubclipResultPlan {
  return {
    selectedSourceAssetId: asset.id,
    sourceRange: { in: 0, out: roundTime(asset.duration) },
    sourcePlayhead: 0,
    mediaBinFilter: readAssetBin(asset),
    commitLabel: 'Subclip created',
    status: `Subclip created: ${asset.name}`,
  };
}

export function resolveSourceSubclipFailureStatus(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Subclip failed: ${message}`;
}

export function resolveSourceMarkPatch({
  asset,
  currentRange,
  type,
  sourcePlayhead,
  fps,
}: {
  asset?: EditorAsset;
  currentRange?: SourceRange;
  type: 'in' | 'out';
  sourcePlayhead: number;
  fps: number;
}): SourceRangePatchPlan {
  if (!asset) {
    return { canApply: false, status: 'Select a source asset first' };
  }

  return {
    canApply: true,
    assetId: asset.id,
    range: resolveSourceRangePatch({
      asset,
      currentRange,
      patch: { [type]: sourcePlayhead },
    }),
    status: `Source ${type} set at ${formatTimecode(sourcePlayhead, fps)}`,
  };
}

export function resolveGoToSourceMarkPlan({
  asset,
  currentRange,
  type,
  fps,
}: {
  asset?: EditorAsset;
  currentRange?: SourceRange;
  type: 'in' | 'out';
  fps: number;
}): SourceMarkSeekPlan {
  if (!asset) {
    return { canSeek: false, status: 'Select a source asset first' };
  }

  const range = normalizeSourceRange(asset, currentRange);
  const sourcePlayhead = type === 'in' ? range.in : range.out;

  return {
    canSeek: true,
    sourcePlayhead,
    status: `Source ${type} ${formatTimecode(sourcePlayhead, fps)}`,
  };
}

export function resolveMatchSourceRangeToMarkedRange({
  asset,
  currentRange,
  markedRange,
}: {
  asset?: EditorAsset;
  currentRange?: SourceRange;
  markedRange: SourceMarkedRange | null;
}): SourceRangePatchPlan {
  if (!asset) {
    return { canApply: false };
  }

  if (!markedRange) {
    return { canApply: false, status: 'Set timeline in/out points first' };
  }

  const normalizedRange = normalizeSourceRange(asset, currentRange);
  const targetDuration = roundTime(markedRange.end - markedRange.start);

  return {
    canApply: true,
    assetId: asset.id,
    range: resolveSourceRangePatch({
      asset,
      currentRange,
      patch: { out: Math.min(asset.duration, normalizedRange.in + targetDuration) },
    }),
    status: 'Source range matched to timeline marks',
  };
}

export function buildSourceAssetPatchOptions({
  project,
  asset,
  start,
  sourceIn,
  duration,
  settings,
}: {
  project: EditorProject;
  asset: EditorAsset;
  start: number;
  sourceIn?: number;
  duration?: number;
  settings: SourcePatchSettings;
}): AssetPatchEditOptions {
  const mediaKind = resolveRenderableAssetMediaKind(asset);
  const includePrimary = settings.sourcePrimaryPatchEnabled && mediaKind !== 'audio';
  const includeAudio = settings.sourceAudioPatchEnabled && (mediaKind === 'audio' || hasEmbeddedAudio(asset));
  const primaryTargetTrackId = includePrimary
    ? resolveEditableTrackId(
      project,
      trackKindForSourceAsset(asset),
      settings.sourcePrimaryPatchTrackId,
      settings.selectedTrackId,
    )
    : undefined;
  const audioTargetTrackId = includeAudio
    ? resolveEditableTrackId(
      project,
      'audio',
      settings.sourceAudioPatchTrackId,
      settings.selectedTrackId,
    )
    : undefined;

  return {
    start,
    targetTrackId: settings.selectedTrackId,
    primaryTargetTrackId,
    audioTargetTrackId,
    sourceIn,
    duration,
    includePrimary,
    includeAudio,
  };
}

export function resolveInsertSourceAssetAtPlayheadPlan({
  project,
  asset,
  start,
  settings,
}: {
  project: EditorProject;
  asset?: EditorAsset;
  start: number;
  settings: SourcePatchSettings;
}): SourceAssetInsertAtPlayheadPlan {
  if (!asset) {
    return { canInsert: false, status: 'Select a source asset first' };
  }

  const options = buildSourceAssetPatchOptions({
    project,
    asset,
    start,
    settings,
  });
  if (!options.includePrimary && !options.includeAudio) {
    return { canInsert: false, status: 'Enable a V or A source patch target first' };
  }

  return {
    canInsert: true,
    commitLabel: 'Asset inserted at playhead',
    assetId: asset.id,
    options: { ...options, ripple: true },
  };
}

export function resolveOverwriteSourceAssetAtPlayheadPlan({
  project,
  asset,
  start,
  settings,
}: {
  project: EditorProject;
  asset?: EditorAsset;
  start: number;
  settings: SourcePatchSettings;
}): SourceAssetOverwriteAtPlayheadPlan {
  if (!asset) {
    return { canOverwrite: false, status: 'Select a source asset first' };
  }

  const options = buildSourceAssetPatchOptions({
    project,
    asset,
    start,
    settings,
  });
  if (!options.includePrimary && !options.includeAudio) {
    return { canOverwrite: false, status: 'Enable a V or A source patch target first' };
  }

  return {
    canOverwrite: true,
    commitLabel: 'Asset overwritten at playhead',
    assetId: asset.id,
    options,
  };
}

export function resolveInsertedSourceAssetPatchSelection({
  previousProject,
  nextProject,
  assetId,
  start,
}: {
  previousProject: EditorProject;
  nextProject: EditorProject;
  assetId: string;
  start: number;
}): SourceAssetInsertedSelectionPlan {
  const previousClipIds = new Set(previousProject.tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
  const insertedClips = nextProject.tracks
    .flatMap((track, trackIndex) => track.clips.map((clip, clipIndex) => ({
      clip,
      track,
      trackIndex,
      clipIndex,
    })))
    .filter(({ clip }) => (
      !previousClipIds.has(clip.id)
      && clip.assetId === assetId
      && Math.abs(clip.start - start) < 0.001
    ))
    .sort((a, b) => a.trackIndex - b.trackIndex || a.clipIndex - b.clipIndex);

  if (insertedClips.length === 0) {
    return { canSelect: false };
  }

  const primaryInsertedClip = insertedClips.find(({ clip }) => clip.kind !== 'audio') ?? insertedClips[0];
  const selectedClipIds = [
    primaryInsertedClip.clip.id,
    ...insertedClips
      .filter(({ clip }) => clip.id !== primaryInsertedClip.clip.id)
      .map(({ clip }) => clip.id),
  ];

  return {
    canSelect: true,
    selectedClipId: primaryInsertedClip.clip.id,
    selectedClipIds,
    selectedTrackId: primaryInsertedClip.track.id,
    nextPlayhead: roundTime(Math.max(...insertedClips.map(({ clip }) => clip.start + clip.duration))),
  };
}

export function resolveThreePointAssetEditPlan({
  project,
  assetId,
  assetById,
  sourceRangesByAssetId,
  markedRange,
  playhead,
  mode,
  settings,
}: {
  project: EditorProject;
  assetId?: string;
  assetById: Map<string, EditorAsset>;
  sourceRangesByAssetId: Record<string, SourceRange>;
  markedRange: SourceMarkedRange | null;
  playhead: number;
  mode: 'insert' | 'overwrite';
  settings: SourcePatchSettings;
}): SourceAssetPatchPlan {
  if (!assetId) {
    return { canEdit: false, status: 'Select a source asset first' };
  }

  const asset = assetById.get(assetId);
  if (!asset) {
    return { canEdit: false, status: 'Select a source asset first' };
  }

  const sourceRange = normalizeSourceRange(asset, sourceRangesByAssetId[asset.id]);
  const sourceDuration = roundTime(sourceRange.out - sourceRange.in);
  if (sourceDuration <= 0) {
    return { canEdit: false, status: 'Set a longer source range' };
  }

  const targetStart = markedRange ? markedRange.start : playhead;
  const targetDuration = markedRange ? roundTime(markedRange.end - markedRange.start) : sourceDuration;
  const duration = roundTime(Math.min(sourceDuration, targetDuration));
  if (duration <= 0) {
    return { canEdit: false, status: 'Set a longer timeline range' };
  }

  const options = buildSourceAssetPatchOptions({
    project,
    asset,
    start: targetStart,
    sourceIn: sourceRange.in,
    duration,
    settings,
  });
  if (!options.includePrimary && !options.includeAudio) {
    return { canEdit: false, status: 'Enable a V or A source patch target first' };
  }

  return {
    canEdit: true,
    commitLabel: mode === 'overwrite' ? '3-point overwrite edit' : '3-point insert edit',
    assetId,
    operation: mode,
    options: mode === 'insert' ? { ...options, ripple: true } : options,
    nextPlayhead: roundTime(targetStart + duration),
  };
}

export function resolveMatchFrameToSourcePlan({
  selectedClip,
  assetById,
  playhead,
  fps,
}: {
  selectedClip?: TimelineClip;
  assetById: Map<string, EditorAsset>;
  playhead: number;
  fps: number;
}): MatchFrameToSourcePlan {
  if (!selectedClip?.assetId) {
    return { canMatch: false, status: 'Select a timeline media clip first' };
  }

  const asset = assetById.get(selectedClip.assetId);
  if (!asset) {
    return { canMatch: false, status: 'Selected clip source asset is missing' };
  }

  const localTime = roundTime(clampNumber(playhead - selectedClip.start, 0, selectedClip.duration));
  const sourceTime = roundTime(clampNumber(getClipSourceTime(selectedClip, localTime), 0, asset.duration));

  return {
    canMatch: true,
    activeMonitor: 'source',
    selectedSourceAssetId: asset.id,
    sourcePlayhead: sourceTime,
    status: `Matched ${selectedClip.name} at ${formatTimecode(sourceTime, fps)}`,
  };
}

export function resolveReplaceSelectedFromSourcePlan({
  selectedClip,
  selectedClipAsset,
  selectedSourceAsset,
  selectedSourceRange,
}: {
  selectedClip?: TimelineClip;
  selectedClipAsset?: EditorAsset;
  selectedSourceAsset?: EditorAsset;
  selectedSourceRange: SourceRange | null;
}): ReplaceSelectedFromSourcePlan {
  if (!selectedClip) {
    return { canReplace: false, status: 'Select a timeline clip first' };
  }

  if (!selectedSourceAsset || !selectedSourceRange) {
    return { canReplace: false, status: 'Select a source asset first' };
  }

  const selectedClipTrackKind = trackKindForReplaceTarget(selectedClip, selectedClipAsset);
  const sourceTrackKind = trackKindForSourceAsset(selectedSourceAsset);
  if (sourceTrackKind === 'audio' && selectedClipTrackKind !== 'audio') {
    return { canReplace: false, status: 'Audio assets can only replace audio clips.' };
  }

  if (sourceTrackKind !== selectedClipTrackKind) {
    return { canReplace: false, status: 'Replacement asset kind does not match the selected clip track.' };
  }

  const duration = roundTime(Math.min(
    selectedClip.duration,
    Math.max(0, selectedSourceRange.out - selectedSourceRange.in),
  ));
  if (duration <= 0) {
    return { canReplace: false, status: 'Set a longer source range' };
  }

  return {
    canReplace: true,
    commitLabel: 'Replace edit applied',
    targetClipId: selectedClip.id,
    sourceAssetId: selectedSourceAsset.id,
    options: {
      sourceIn: selectedSourceRange.in,
      duration,
    },
  };
}

function trackKindForReplaceTarget(clip: TimelineClip, asset?: EditorAsset): TrackKind {
  if (clip.kind === 'audio' || resolveRenderableAssetMediaKind(asset) === 'audio') {
    return 'audio';
  }

  if (clip.kind === 'text' || asset?.kind === 'text') {
    return 'text';
  }

  if (clip.kind === 'effect' || asset?.kind === 'effect') {
    return 'effect';
  }

  return 'video';
}
