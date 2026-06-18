import { createClip } from './project';
import { resolveRenderableAssetMediaKind } from './renderable-media-kind';
import { inferSupportedMediaFileKind, readExplicitUnsupportedMediaMimeType } from './media-file-support';
import type { ClipKind, EditorAsset, EditorProject, MediaCacheManifest, TimelineTrack, TrackKind } from './types';

export interface ImportedMediaInput {
  name: string;
  mimeType: string;
  size: number;
  source: string;
  renderPath?: string;
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
  mediaCache?: MediaCacheManifest;
  metadata?: Record<string, string | number | boolean | undefined>;
}

let importedMediaIdSequence = 0;

const RELINK_FILE_SCOPED_METADATA_KEYS = [
  'analysisWarning',
  'analyzed',
  'audioChannels',
  'audioCodec',
  'bitrate',
  'cached',
  'cacheJobId',
  'cacheWarning',
  'codedHeight',
  'codedWidth',
  'displayAspectRatio',
  'displayHeight',
  'displayWidth',
  'exifOrientation',
  'hasAudio',
  'hasVideo',
  'importedFileName',
  'nativeImport',
  'originalName',
  'originalPath',
  'pixelAspectRatio',
  'rotation',
  'sampleAspectRatio',
  'sampleRate',
  'videoCodec',
] as const;

export function addImportedMediaAsset(project: EditorProject, input: ImportedMediaInput): EditorProject {
  const asset = buildImportedMediaAsset(input);

  return {
    ...project,
    assets: [...project.assets, asset],
    updatedAt: new Date().toISOString(),
  };
}

export function importMediaAsset(project: EditorProject, input: ImportedMediaInput): EditorProject {
  const asset = buildImportedMediaAsset(input);
  const trackKind = inferTrackKind(asset.kind);

  const { tracks, targetTrack } = ensureTrack(project.tracks, trackKind);
  const start = findTrackEnd(targetTrack);
  const clip = createClip({
    id: buildImportedMediaId('clip-import', input.name),
    assetId: asset.id,
    trackId: targetTrack.id,
    name: input.name,
    kind: asset.kind,
    start,
    duration: asset.duration,
    color: colorForKind(asset.kind),
    automationTags: asset.kind === 'video' || asset.kind === 'image' ? ['analyze'] : ['loudness'],
  });

  return {
    ...project,
    assets: [...project.assets, asset],
    tracks: tracks.map((track) => (
      track.id === targetTrack.id
        ? { ...track, clips: [...track.clips, clip].sort((a, b) => a.start - b.start) }
        : track
    )),
    duration: Math.max(project.duration, clip.start + clip.duration),
    updatedAt: new Date().toISOString(),
  };
}

function buildImportedMediaAsset(input: ImportedMediaInput): EditorAsset {
  const kind = inferClipKind(input);
  const duration = input.duration && input.duration > 0 ? roundTime(input.duration) : defaultDuration(kind);

  return {
    id: buildImportedMediaId('asset-import', input.name),
    name: input.name,
    kind,
    source: input.source,
    renderPath: input.renderPath,
    mediaCache: input.mediaCache,
    duration,
    width: input.width,
    height: input.height,
    fps: input.fps,
    metadata: {
      mimeType: input.mimeType,
      size: input.size,
      imported: true,
      ...stripUndefinedMetadata(input.metadata),
    },
  };
}

export function relinkMediaAsset(project: EditorProject, assetId: string, input: ImportedMediaInput): EditorProject {
  const existingAsset = project.assets.find((asset) => asset.id === assetId);
  if (!existingAsset) {
    throw new Error(`Asset ${assetId} was not found.`);
  }

  const kind = inferClipKind(input);
  if (!canRelinkAssetWithKind(existingAsset, kind)) {
    throw new Error(`Cannot relink ${existingAsset.kind} asset with ${kind} media.`);
  }

  const duration = input.duration && input.duration > 0 ? roundTime(input.duration) : existingAsset.duration;

  return {
    ...project,
    assets: project.assets.map((asset) => (
      asset.id === assetId
        ? {
          ...asset,
          name: input.name || asset.name,
          source: input.source,
          renderPath: input.renderPath,
          mediaCache: input.mediaCache,
          duration,
          width: input.width,
          height: input.height,
          fps: input.fps,
          metadata: {
            ...stripRelinkMediaAnalysisMetadata(asset.metadata),
            mimeType: input.mimeType,
            size: input.size,
            relinked: true,
            ...stripUndefinedMetadata(input.metadata),
            ...buildRelinkMetadataPatch(asset, input),
          },
        }
        : asset
    )),
    updatedAt: new Date().toISOString(),
  };
}

function canRelinkAssetWithKind(asset: EditorAsset, inputKind: ClipKind): boolean {
  const mediaKind = resolveRenderableAssetMediaKind(asset);
  if (asset.kind === 'ai' && !mediaKind) {
    return inputKind === 'video' || inputKind === 'audio' || inputKind === 'image';
  }

  return asset.kind === inputKind || mediaKind === inputKind;
}

export function removeMediaAsset(project: EditorProject, assetId: string): EditorProject {
  const existingAsset = project.assets.find((asset) => asset.id === assetId);
  if (!existingAsset) {
    throw new Error(`Asset ${assetId} was not found.`);
  }

  const referenceCount = countAssetReferences(project, assetId);
  if (referenceCount > 0) {
    throw new Error(`${existingAsset.name} is used by ${referenceCount} timeline clip${referenceCount === 1 ? '' : 's'}.`);
  }

  return {
    ...project,
    assets: project.assets.filter((asset) => asset.id !== assetId),
    updatedAt: new Date().toISOString(),
  };
}

export function removeUnusedMediaAssets(project: EditorProject): EditorProject {
  const referencedAssetIds = collectReferencedAssetIds(project);
  const nextAssets = project.assets.filter((asset) => referencedAssetIds.has(asset.id));
  if (nextAssets.length === project.assets.length) {
    return project;
  }

  return {
    ...project,
    assets: nextAssets,
    updatedAt: new Date().toISOString(),
  };
}

export function countAssetReferences(project: EditorProject, assetId: string): number {
  return project.tracks.reduce((total, track) => (
    total + track.clips.filter((clip) => clip.assetId === assetId).length
  ), 0);
}

function collectReferencedAssetIds(project: EditorProject): Set<string> {
  return new Set(project.tracks.flatMap((track) => (
    track.clips
      .map((clip) => clip.assetId)
      .filter((assetId): assetId is string => Boolean(assetId))
  )));
}

function inferClipKind(input: Pick<ImportedMediaInput, 'mimeType' | 'name' | 'metadata'>): ClipKind {
  const metadataMimeType = readImportedMediaMetadataMimeType(input);
  const unsupportedMimeType = readExplicitUnsupportedMediaMimeType(input.mimeType)
    ?? readExplicitUnsupportedMediaMimeType(metadataMimeType);
  if (unsupportedMimeType) {
    throw new Error(`Unsupported media type for ${input.name}: ${unsupportedMimeType}.`);
  }

  const kind = inferSupportedMediaFileKind({
    name: input.name,
    type: input.mimeType,
    mimeType: metadataMimeType,
  });
  if (kind === 'video' && input.metadata?.hasVideo === false && input.metadata?.hasAudio === true) {
    return 'audio';
  }

  if (kind) {
    return kind;
  }

  if (input.metadata?.hasVideo === true) {
    return 'video';
  }

  if (input.metadata?.hasAudio === true) {
    return 'audio';
  }

  throw new Error(`Unsupported media type for ${input.name}: ${input.mimeType || 'unknown'}.`);
}

function readImportedMediaMetadataMimeType(input: Pick<ImportedMediaInput, 'metadata'>): string | undefined {
  return typeof input.metadata?.mimeType === 'string' ? input.metadata.mimeType : undefined;
}

function inferTrackKind(kind: ClipKind): TrackKind {
  if (kind === 'audio') {
    return 'audio';
  }

  if (kind === 'text') {
    return 'text';
  }

  if (kind === 'effect') {
    return 'effect';
  }

  return 'video';
}

function ensureTrack(tracks: TimelineTrack[], kind: TrackKind): { tracks: TimelineTrack[]; targetTrack: TimelineTrack } {
  const targetTrack = tracks.find((track) => track.kind === kind && !track.locked);
  if (targetTrack) {
    return { tracks, targetTrack };
  }

  const createdTrack: TimelineTrack = {
    id: `track-import-${kind}-${Date.now()}`,
    name: `${kind[0].toUpperCase()}${kind.slice(1)} import`,
    kind,
    muted: false,
    solo: false,
    locked: false,
    clips: [],
  };

  return {
    tracks: [...tracks, createdTrack],
    targetTrack: createdTrack,
  };
}

function findTrackEnd(track: TimelineTrack): number {
  if (track.clips.length === 0) {
    return 0;
  }

  return roundTime(Math.max(...track.clips.map((clip) => clip.start + clip.duration)) + 0.5);
}

function defaultDuration(kind: ClipKind): number {
  if (kind === 'image') {
    return 5;
  }

  if (kind === 'audio') {
    return 30;
  }

  return 10;
}

function colorForKind(kind: ClipKind): string {
  switch (kind) {
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

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 32) || 'media';
}

function buildImportedMediaId(prefix: string, name: string): string {
  importedMediaIdSequence = (importedMediaIdSequence + 1) % Number.MAX_SAFE_INTEGER;
  return `${prefix}-${Date.now()}-${importedMediaIdSequence.toString(36)}-${slug(name)}`;
}

function stripUndefinedMetadata(metadata?: Record<string, string | number | boolean | undefined>): Record<string, string | number | boolean> {
  if (!metadata) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(metadata).filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined),
  );
}

function stripRelinkMediaAnalysisMetadata(
  metadata?: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  if (!metadata) {
    return {};
  }

  const nextMetadata = { ...metadata };
  for (const key of RELINK_FILE_SCOPED_METADATA_KEYS) {
    delete nextMetadata[key];
  }
  return nextMetadata;
}

function buildRelinkMetadataPatch(
  asset: EditorAsset,
  input: ImportedMediaInput,
): Record<string, string | boolean> {
  const relinkSource = input.renderPath?.trim() || input.source.trim();
  if (asset.metadata?.importedFromEdl !== true) {
    if (asset.metadata?.importedFromFcpxml !== true) {
      return {};
    }

    return {
      ...(relinkSource ? { fcpxmlSourceFile: relinkSource } : {}),
      fcpxmlRelinkHint: input.name || filenameFromPath(relinkSource) || 'the source media',
    };
  }

  return {
    offlinePlaceholder: false,
    ...(relinkSource ? { edlSourceFile: relinkSource } : {}),
    edlRelinkHint: input.name || filenameFromPath(relinkSource) || 'the source media',
  };
}

function filenameFromPath(value: string): string {
  const normalized = value.trim().replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).at(-1) ?? '';
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}
