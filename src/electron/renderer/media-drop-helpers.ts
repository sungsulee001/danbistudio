import { hasEmbeddedAudio, hasTimelineAudio } from '../../lib/editor/media-metadata';
import { addImportedMediaAsset } from '../../lib/editor/media-import';
import { resolveRenderableAssetMediaKind } from '../../lib/editor/renderable-media-kind';
import {
  insertAssetPatchOnTimeline,
  overwriteAssetPatchOnTimeline,
  snapTimeToEditPoints,
  type AssetPatchEditOptions,
} from '../../lib/editor/timeline';
import { canPlaceClipKindOnTrack } from '../../lib/editor/timeline-placement';
import type { EditorAsset, EditorProject, TimelineTrack } from '../../lib/editor/types';
import type { PreparedImportedMedia, TimelineAssetDropPreview, TimelineEditGuide } from './editor-view-model';
import { MEDIA_ASSET_DRAG_MIME } from './editor-view-model';
import type { MediaCacheJobEntry } from './media-cache-workflow-helpers';
import type { SourceRange } from './editor-view-model';
import { inferMediaFileReferenceKind, isCaptionSidecarFileReference, isMediaFileReference } from './import-file-routing-helpers';
import { roundTime } from './editor-time-helpers';
import { normalizeSourceRange, resolveEditableTrackId } from './timeline-source-helpers';

export interface AssetTimelineDropSettings {
  selectedTrackId: string;
  sourceAudioPatchTrackId: string;
  sourceAudioPatchEnabled: boolean;
  editMode: 'insert' | 'overwrite';
}

export interface AssetTimelineDropOptions extends AssetPatchEditOptions {
  start: number;
  targetTrackId: string;
  sourceIn: number;
  duration: number;
  includePrimary: boolean;
  includeAudio: boolean;
  ripple: boolean;
}

export interface TimelineDropStartPlan {
  start: number;
}

export interface TimelineAssetDropPreviewPlan {
  assetDropPreview: TimelineAssetDropPreview;
  editGuide: TimelineEditGuide;
}

export interface AssetTimelineDropCommitPlan {
  commitLabel: string;
  options: AssetTimelineDropOptions;
  selectedSourceAssetId: string;
  selectedTrackId: string;
  nextPlayhead: number;
  status: string;
}

export interface PreparedMediaTimelineDropResult {
  nextProject: EditorProject;
  importedAssetIds: string[];
  cacheJobEntries: MediaCacheJobEntry[];
  nextPlayhead: number;
  selectedSourceAssetId: string;
  selectedTrackId: string;
  status: string;
}

interface AssetTimelineDropTrackResolution {
  track: TimelineTrack;
  routed: boolean;
}

export function readDraggedAssetId(dataTransfer: DataTransfer): string {
  return dataTransfer.getData(MEDIA_ASSET_DRAG_MIME) || dataTransfer.getData('text/plain');
}

export function hasDraggedFiles(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes('Files');
}

export function getDraggedMediaFiles(dataTransfer: DataTransfer): File[] {
  return Array.from(dataTransfer.files).filter(isSupportedMediaFile);
}

export function countNonMediaDraggedFiles(dataTransfer: DataTransfer): number {
  return Array.from(dataTransfer.files).filter((file) => !isSupportedMediaFile(file)).length;
}

export function hasImportableDraggedFiles(dataTransfer: DataTransfer): boolean {
  if (!hasDraggedFiles(dataTransfer)) {
    return false;
  }

  const files = Array.from(dataTransfer.files);
  if (files.length > 0) {
    return files.some(isImportableDropFile);
  }

  const items = Array.from(dataTransfer.items).filter((item) => item.kind === 'file');
  if (items.length === 0) {
    return true;
  }

  return items.some((item) => {
    const type = item.type.trim();
    return type.length === 0
      || isMediaFileReference({ name: '', type })
      || isCaptionSidecarFileReference({ name: '', type });
  });
}

export function readDraggedMediaFilePreview(dataTransfer: DataTransfer): { label: string; kinds: EditorAsset['kind'][]; duration: number } | undefined {
  if (!hasDraggedFiles(dataTransfer)) {
    return undefined;
  }

  const files = getDraggedMediaFiles(dataTransfer);
  if (files.length > 0) {
    const kinds = files.map(inferDroppedMediaKind);
    return {
      label: files.length === 1 ? files[0].name : `${files.length} media files`,
      kinds,
      duration: files.reduce((total, file) => total + defaultDropPreviewDuration(inferDroppedMediaKind(file)), 0),
    };
  }

  const items = Array.from(dataTransfer.items).filter((item) => item.kind === 'file');
  const supportedItems = items
    .map((item) => inferMediaFileReferenceKind({ name: '', type: item.type }))
    .filter((kind): kind is EditorAsset['kind'] => Boolean(kind));
  if (supportedItems.length === 0) {
    return undefined;
  }

  return {
    label: supportedItems.length === 1 ? 'Media file' : `${supportedItems.length} media files`,
    kinds: supportedItems,
    duration: supportedItems.reduce((total, kind) => total + defaultDropPreviewDuration(kind), 0),
  };
}

export function canDropImportedMediaKindOnTrack(kind: EditorAsset['kind'], track: TimelineTrack): boolean {
  if (track.locked) {
    return false;
  }

  if (track.kind === 'audio') {
    return canPlaceClipKindOnTrack(kind, 'audio') || kind === 'video';
  }

  return canPlaceClipKindOnTrack(kind, track.kind) && kind !== 'audio';
}

export function canDropSourceAssetOnTrack(asset: EditorAsset, track: TimelineTrack): boolean {
  if (track.locked) {
    return false;
  }

  const mediaKind = resolveRenderableAssetMediaKind(asset);
  if (track.kind === 'audio') {
    return canPlaceClipKindOnTrack(asset.kind, 'audio') || hasTimelineAudio(asset);
  }

  return canPlaceClipKindOnTrack(asset.kind, track.kind) && mediaKind !== 'audio';
}

export function resolveAssetTimelineDropTrack({
  project,
  asset,
  requestedTrack,
  settings,
}: {
  project: EditorProject;
  asset: EditorAsset;
  requestedTrack: TimelineTrack;
  settings: AssetTimelineDropSettings;
}): AssetTimelineDropTrackResolution | undefined {
  if (canDropSourceAssetOnTrack(asset, requestedTrack)) {
    return { track: requestedTrack, routed: false };
  }

  if (resolveRenderableAssetMediaKind(asset) === 'audio' && requestedTrack.kind !== 'audio') {
    const audioTrackId = resolveEditableTrackId(project, 'audio', settings.sourceAudioPatchTrackId, settings.selectedTrackId);
    const audioTrack = audioTrackId
      ? project.tracks.find((track) => track.id === audioTrackId)
      : undefined;
    if (audioTrack && canDropSourceAssetOnTrack(asset, audioTrack)) {
      return { track: audioTrack, routed: true };
    }
  }

  return undefined;
}

export function resolveTimelineDropStartPlan({
  project,
  clientX,
  laneLeft,
  pixelsPerSecond,
  snapEnabled,
  snapExtraPoints,
}: {
  project: EditorProject;
  clientX: number;
  laneLeft: number;
  pixelsPerSecond: number;
  snapEnabled: boolean;
  snapExtraPoints: number[];
}): TimelineDropStartPlan {
  const rawTime = Math.max(0, (clientX - laneLeft) / pixelsPerSecond);
  return {
    start: snapEnabled
      ? snapTimeToEditPoints(project, rawTime, { threshold: 0.18, extraPoints: snapExtraPoints })
      : roundTime(rawTime),
  };
}

export function buildAssetTimelineDropOptions({
  project,
  asset,
  track,
  start,
  sourceRange,
  settings,
}: {
  project: EditorProject;
  asset: EditorAsset;
  track: TimelineTrack;
  start: number;
  sourceRange?: SourceRange;
  settings: AssetTimelineDropSettings;
}): AssetTimelineDropOptions {
  const normalizedSourceRange = normalizeSourceRange(asset, sourceRange);
  const sourceDuration = roundTime(normalizedSourceRange.out - normalizedSourceRange.in);
  if (sourceDuration <= 0) {
    throw new Error('Set a longer source range before dropping this asset.');
  }

  if (!canDropSourceAssetOnTrack(asset, track)) {
    throw new Error('Asset type does not match this track.');
  }

  const mediaKind = resolveRenderableAssetMediaKind(asset);
  const includePrimary = track.kind !== 'audio' && mediaKind !== 'audio';
  const includeAudio = track.kind === 'audio'
    ? mediaKind === 'audio' || hasEmbeddedAudio(asset)
    : settings.sourceAudioPatchEnabled && hasEmbeddedAudio(asset);

  return {
    start,
    targetTrackId: track.id,
    primaryTargetTrackId: includePrimary ? track.id : undefined,
    audioTargetTrackId: track.kind === 'audio'
      ? track.id
      : includeAudio ? resolveEditableTrackId(project, 'audio', settings.sourceAudioPatchTrackId, settings.selectedTrackId) : undefined,
    sourceIn: normalizedSourceRange.in,
    duration: sourceDuration,
    includePrimary,
    includeAudio,
    ripple: settings.editMode === 'insert',
  };
}

export function resolveAssetTimelineDropPreviewPlan({
  project,
  asset,
  track,
  start,
  sourceRange,
  settings,
}: {
  project: EditorProject;
  asset: EditorAsset;
  track: TimelineTrack;
  start: number;
  sourceRange?: SourceRange;
  settings: AssetTimelineDropSettings;
}): TimelineAssetDropPreviewPlan {
  let valid = true;
  let duration = Math.max(0.1, asset.duration);

  try {
    duration = buildAssetTimelineDropOptions({
      project,
      asset,
      track,
      start,
      sourceRange,
      settings,
    }).duration;
  } catch {
    valid = false;
  }

  return buildDropPreviewPlan({
    trackId: track.id,
    start,
    duration,
    label: asset.name,
    editMode: settings.editMode,
    valid,
  });
}

export function resolveMediaFileTimelineDropPreviewPlan({
  preview,
  project,
  track,
  start,
  editMode,
  settings,
}: {
  preview: { label: string; kinds: EditorAsset['kind'][]; duration: number };
  project?: EditorProject;
  track: TimelineTrack;
  start: number;
  editMode: AssetTimelineDropSettings['editMode'];
  settings?: AssetTimelineDropSettings;
}): TimelineAssetDropPreviewPlan {
  return buildDropPreviewPlan({
    trackId: track.id,
    start,
    duration: preview.duration,
    label: preview.label,
    editMode,
    valid: preview.kinds.every((kind) => canResolveImportedMediaKindDrop({
      kind,
      project,
      track,
      settings,
    })),
  });
}

export function resolveAssetTimelineDropCommitPlan({
  project,
  asset,
  track,
  start,
  sourceRange,
  settings,
}: {
  project: EditorProject;
  asset: EditorAsset;
  track: TimelineTrack;
  start: number;
  sourceRange?: SourceRange;
  settings: AssetTimelineDropSettings;
}): AssetTimelineDropCommitPlan {
  const options = buildAssetTimelineDropOptions({
    project,
    asset,
    track,
    start,
    sourceRange,
    settings,
  });

  return {
    commitLabel: resolveAssetTimelineDropCommitLabel(settings.editMode),
    options,
    selectedSourceAssetId: asset.id,
    selectedTrackId: track.id,
    nextPlayhead: roundTime(start + options.duration),
    status: resolveAssetTimelineDropStatus(asset, track),
  };
}

export function resolveAssetTimelineDropCommitLabel(editMode: 'insert' | 'overwrite'): string {
  return editMode === 'overwrite' ? 'Asset dropped as overwrite edit' : 'Asset dropped as insert edit';
}

export function resolvePreparedMediaTimelineDropResult({
  project,
  preparedMedia,
  start,
  targetTrackId,
  targetTrackName,
  selectedSourceAssetId,
  settings,
  sourceRangesByAssetId,
}: {
  project: EditorProject;
  preparedMedia: PreparedImportedMedia[];
  start: number;
  targetTrackId: string;
  targetTrackName: string;
  selectedSourceAssetId: string;
  settings: AssetTimelineDropSettings;
  sourceRangesByAssetId: Record<string, SourceRange>;
}): PreparedMediaTimelineDropResult {
  const importedAssetIds: string[] = [];
  const routedTrackNames = new Set<string>();
  let firstResolvedTrackId = targetTrackId;
  let cursor = start;

  const nextProject = preparedMedia.reduce((current, record) => {
    const previousAssetIds = new Set(current.assets.map((asset) => asset.id));
    const withAsset = addImportedMediaAsset(current, record.input);
    const importedAsset = withAsset.assets.find((asset) => !previousAssetIds.has(asset.id));
    const targetTrack = withAsset.tracks.find((item) => item.id === targetTrackId);

    if (!importedAsset) {
      throw new Error('Imported asset was not added.');
    }

    if (!targetTrack) {
      throw new Error('Target track was not found.');
    }

    const resolvedTrack = resolveAssetTimelineDropTrack({
      project: withAsset,
      asset: importedAsset,
      requestedTrack: targetTrack,
      settings,
    });
    if (!resolvedTrack) {
      throw new Error('Asset type does not match this track.');
    }

    const options = buildAssetTimelineDropOptions({
      project: withAsset,
      asset: importedAsset,
      track: resolvedTrack.track,
      start: cursor,
      sourceRange: sourceRangesByAssetId[importedAsset.id],
      settings,
    });
    const editedProject = settings.editMode === 'overwrite'
      ? overwriteAssetPatchOnTimeline(withAsset, importedAsset.id, options)
      : insertAssetPatchOnTimeline(withAsset, importedAsset.id, options);

    importedAssetIds.push(importedAsset.id);
    routedTrackNames.add(resolvedTrack.track.name);
    if (importedAssetIds.length === 1) {
      firstResolvedTrackId = resolvedTrack.track.id;
    }
    cursor = roundTime(cursor + options.duration);
    return editedProject;
  }, project);
  const cacheJobEntries = resolveDroppedMediaCacheJobEntries({
    importedAssetIds,
    preparedMedia,
  });

  return {
    nextProject,
    importedAssetIds,
    cacheJobEntries,
    nextPlayhead: Math.min(nextProject.duration, cursor),
    selectedSourceAssetId: importedAssetIds[0] ?? selectedSourceAssetId,
    selectedTrackId: firstResolvedTrackId,
    status: resolveMediaFileTimelineDropStatus(preparedMedia.length, targetTrackName, Array.from(routedTrackNames)),
  };
}

export function resolveDroppedMediaCacheJobEntries({
  importedAssetIds,
  preparedMedia,
}: {
  importedAssetIds: string[];
  preparedMedia: PreparedImportedMedia[];
}): MediaCacheJobEntry[] {
  return preparedMedia
    .map((record, index) => {
      const assetId = importedAssetIds[index];
      return assetId && record.cacheJob ? { assetId, job: record.cacheJob } : undefined;
    })
    .filter((entry): entry is MediaCacheJobEntry => Boolean(entry));
}

export function resolveUnsupportedMediaDropStatus(): string {
  return 'Import supported video, audio, image, or subtitle sidecar files.';
}

export function resolveUnsupportedTimelineMediaDropStatus(): string {
  return 'Drop supported video, audio, or image files on the timeline. Import subtitle sidecars in the Media Bin.';
}

export function resolveAssetTimelineDropStatus(asset: EditorAsset, track: TimelineTrack): string {
  return `${asset.name} dropped on ${track.name}`;
}

export function resolveAssetTimelineDropFailureStatus(error: unknown): string {
  return `Asset drop failed: ${(error as Error).message}`;
}

export function resolveMediaFileTimelineDropStatus(fileCount: number, targetTrackName: string, routedTrackNames: string[] = []): string {
  if (routedTrackNames.length > 1) {
    return `Dropped ${fileCount} media file${fileCount === 1 ? '' : 's'} across ${routedTrackNames.join(', ')}`;
  }

  return `Dropped ${fileCount} media file${fileCount === 1 ? '' : 's'} on ${targetTrackName}`;
}

export function appendSkippedNonMediaDropStatus(status: string, skippedFileCount: number): string {
  if (skippedFileCount <= 0) {
    return status;
  }

  return `${status} / Skipped ${skippedFileCount} non-media file${skippedFileCount === 1 ? '' : 's'}`;
}

export function resolveMediaFileTimelineDropFailureStatus(error: unknown): string {
  return `File drop failed: ${(error as Error).message}`;
}

export function resolveMediaBinDropFailureStatus(error: unknown): string {
  return `Media drop failed: ${(error as Error).message}`;
}

function buildDropPreviewPlan({
  trackId,
  start,
  duration,
  label,
  editMode,
  valid,
}: {
  trackId: string;
  start: number;
  duration: number;
  label: string;
  editMode: AssetTimelineDropSettings['editMode'];
  valid: boolean;
}): TimelineAssetDropPreviewPlan {
  return {
    assetDropPreview: {
      trackId,
      start,
      duration,
      label,
      mode: editMode,
      valid,
    },
    editGuide: {
      trackId,
      time: start,
      label: valid ? editMode : 'Invalid',
      tone: valid ? 'drop' : 'limit',
    },
  };
}

function isSupportedMediaFile(file: File): boolean {
  return isMediaFileReference(file);
}

function isImportableDropFile(file: File): boolean {
  return isMediaFileReference(file) || isCaptionSidecarFileReference(file);
}

function inferDroppedMediaKind(file: File): EditorAsset['kind'] {
  return inferMediaFileReferenceKind(file) ?? 'video';
}

function canResolveImportedMediaKindDrop({
  kind,
  project,
  track,
  settings,
}: {
  kind: EditorAsset['kind'];
  project?: EditorProject;
  track: TimelineTrack;
  settings?: AssetTimelineDropSettings;
}): boolean {
  if (canDropImportedMediaKindOnTrack(kind, track)) {
    return true;
  }

  return Boolean(project && settings && kind === 'audio' && track.kind !== 'audio' && resolveEditableTrackId(
    project,
    'audio',
    settings.sourceAudioPatchTrackId,
    settings.selectedTrackId,
  ));
}

function defaultDropPreviewDuration(kind: EditorAsset['kind']): number {
  if (kind === 'audio') {
    return 30;
  }

  if (kind === 'image') {
    return 5;
  }

  return 10;
}
