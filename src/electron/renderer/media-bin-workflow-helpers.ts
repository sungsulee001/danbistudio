import { addImportedMediaAsset, type ImportedMediaInput } from '../../lib/editor/media-import';
import type { MediaBinSmartCollection } from '../../lib/editor/media-bin';
import {
  isRenderableMediaAsset,
  resolveRenderableAssetMediaKind,
  type RenderableAssetMediaKind,
} from '../../lib/editor/renderable-media-kind';
import type { EditorAsset, EditorProject } from '../../lib/editor/types';
import { inferSupportedMediaFileKind, readExplicitUnsupportedMediaMimeType } from '../../lib/editor/media-file-support';
import type { PreparedImportedMedia, UploadedMediaFile } from './editor-view-model';
import { isMediaFileReference } from './import-file-routing-helpers';
import type { MediaCacheJobEntry } from './media-cache-workflow-helpers';

export interface ImportedMediaBinResult {
  importedAssetIds: string[];
  cacheJobEntries: MediaCacheJobEntry[];
  status: string;
}

export interface PreparedMediaBinImportResult extends ImportedMediaBinResult {
  nextProject: EditorProject;
}

export interface RemoveMediaAssetPlan {
  assetIds: string[];
  nextSourceAssetId: string;
  commitLabel: string;
  status: string;
  canRemove: boolean;
}

export interface SourceAssetBinUpdatePlan {
  canUpdate: boolean;
  assetId?: string;
  binName?: string;
  commitLabel?: string;
  nextMediaBinFilter: string;
  status: string;
}

export interface RelinkMediaFileReference {
  name: string;
  type?: string;
  size: number;
}

export interface RelinkUploadedMediaPlan {
  canRelink: boolean;
  assetIds: string[];
  input?: ImportedMediaInput;
  cacheJobEntry?: MediaCacheJobEntry;
  selectedSourceAssetId?: string;
  commitLabel?: string;
  status: string;
}

export interface BulkRelinkUploadedMediaMatch {
  assetId: string;
  fileName: string;
  input: ImportedMediaInput;
  cacheJobEntry?: MediaCacheJobEntry;
}

export interface BulkRelinkUploadedMediaSkippedItem {
  kind: 'asset' | 'file';
  assetId?: string;
  assetName?: string;
  fileName?: string;
  reason: string;
}

export interface BulkRelinkUploadedMediaPlan {
  canRelink: boolean;
  assetIds: string[];
  matches: BulkRelinkUploadedMediaMatch[];
  cacheJobEntries: MediaCacheJobEntry[];
  selectedSourceAssetId?: string;
  commitLabel?: string;
  status: string;
  skipped: BulkRelinkUploadedMediaSkippedItem[];
}

export interface BulkRelinkCompletionViewState {
  nextMediaSmartFilter: MediaBinSmartCollection;
  remainingCandidateAssetIds: string[];
  status: string;
}

export function resolveBulkRelinkCandidateAssetIds(assets: EditorAsset[]): string[] {
  return assets.filter(isBulkRelinkCandidateAsset).map((asset) => asset.id);
}

export function resolveImportedMediaBinResult({
  previousProject,
  nextProject,
  preparedMedia,
  fileCount,
}: {
  previousProject: EditorProject;
  nextProject: EditorProject;
  preparedMedia: PreparedImportedMedia[];
  fileCount: number;
}): ImportedMediaBinResult {
  const previousAssetIds = new Set(previousProject.assets.map((asset) => asset.id));
  const importedAssets = nextProject.assets.filter((asset) => !previousAssetIds.has(asset.id));
  const cacheJobEntries = preparedMedia
    .map((record, index) => {
      const asset = importedAssets[index];
      return asset && record.cacheJob ? { assetId: asset.id, job: record.cacheJob } : undefined;
    })
    .filter((entry): entry is MediaCacheJobEntry => Boolean(entry));

  return {
    importedAssetIds: importedAssets.map((asset) => asset.id),
    cacheJobEntries,
    status: `Imported ${fileCount} media file${fileCount > 1 ? 's' : ''}; queued ${cacheJobEntries.length} cache job${cacheJobEntries.length === 1 ? '' : 's'}`,
  };
}

export function resolvePreparedMediaBinImportResult({
  project,
  preparedMedia,
  fileCount,
}: {
  project: EditorProject;
  preparedMedia: PreparedImportedMedia[];
  fileCount: number;
}): PreparedMediaBinImportResult {
  const nextProject = preparedMedia.reduce(
    (current, record) => addImportedMediaAsset(current, record.input),
    project,
  );
  const result = resolveImportedMediaBinResult({
    previousProject: project,
    nextProject,
    preparedMedia,
    fileCount,
  });

  return {
    ...result,
    nextProject,
  };
}

export function resolveSourceAssetBinUpdatePlan({
  selectedSourceAsset,
  selectedSourceAssetBin,
  requestedBinName,
  currentMediaBinFilter,
}: {
  selectedSourceAsset?: EditorAsset;
  selectedSourceAssetBin: string;
  requestedBinName: string;
  currentMediaBinFilter: string;
}): SourceAssetBinUpdatePlan {
  if (!selectedSourceAsset) {
    return {
      canUpdate: false,
      nextMediaBinFilter: currentMediaBinFilter,
      status: 'Select an asset first',
    };
  }

  return {
    canUpdate: true,
    assetId: selectedSourceAsset.id,
    binName: requestedBinName,
    commitLabel: 'Asset bin updated',
    nextMediaBinFilter: currentMediaBinFilter === 'all' || currentMediaBinFilter === selectedSourceAssetBin
      ? currentMediaBinFilter
      : 'all',
    status: `${selectedSourceAsset.name} moved to ${requestedBinName.trim() || 'Unsorted'}`,
  };
}

export function resolveRelinkUploadedMediaPlan({
  assetId,
  file,
  uploaded,
}: {
  assetId: string;
  file: RelinkMediaFileReference;
  uploaded?: UploadedMediaFile;
}): RelinkUploadedMediaPlan {
  if (!uploaded) {
    return {
      canRelink: false,
      assetIds: [],
      status: 'Relink failed: Media upload did not return a file record.',
    };
  }

  if (!isRelinkUploadedMediaFileReference(file, uploaded)) {
    return {
      canRelink: false,
      assetIds: [],
      status: `Relink failed: ${file.name} is not a supported media file.`,
    };
  }

  const input = buildRelinkInputFromUploaded(file, uploaded);

  return {
    canRelink: true,
    assetIds: [assetId],
    input,
    cacheJobEntry: uploaded.cacheJob ? { assetId, job: uploaded.cacheJob } : undefined,
    selectedSourceAssetId: assetId,
    commitLabel: 'Asset relinked',
    status: `Relinked asset to ${file.name}`,
  };
}

export function resolveBulkRelinkUploadedMediaPlan({
  assets,
  files,
  uploaded,
}: {
  assets: EditorAsset[];
  files: RelinkMediaFileReference[];
  uploaded: Array<UploadedMediaFile | undefined>;
}): BulkRelinkUploadedMediaPlan {
  const skipped: BulkRelinkUploadedMediaSkippedItem[] = [];
  const relinkCandidates = assets.filter(isBulkRelinkCandidateAsset);
  const fileRecords = files
    .map((file, index) => {
      const uploadedFile = uploaded[index];
      if (!uploadedFile) {
        skipped.push({
          kind: 'file',
          fileName: file.name,
          reason: 'Media upload did not return a file record.',
        });
        return undefined;
      }
      if (!isRelinkUploadedMediaFileReference(file, uploadedFile)) {
        skipped.push({
          kind: 'file',
          fileName: file.name,
          reason: 'Unsupported media file.',
        });
        return undefined;
      }

      const kind = inferRelinkInputKind(file, uploadedFile);
      if (!kind) {
        skipped.push({
          kind: 'file',
          fileName: file.name,
          reason: 'Unsupported media file.',
        });
        return undefined;
      }

      return {
        index,
        file,
        uploaded: uploadedFile,
        input: buildRelinkInputFromUploaded(file, uploadedFile),
        keys: buildFileRelinkMatchKeys(file, uploadedFile),
        kind,
      };
    })
    .filter((record): record is NonNullable<typeof record> => Boolean(record));

  if (relinkCandidates.length === 0) {
    return {
      canRelink: false,
      assetIds: [],
      matches: [],
      cacheJobEntries: [],
      status: 'No media assets need relinking.',
      skipped,
    };
  }

  if (fileRecords.length === 0) {
    return {
      canRelink: false,
      assetIds: [],
      matches: [],
      cacheJobEntries: [],
      status: 'No relinkable media files were prepared.',
      skipped,
    };
  }

  const assetMatches = new Map<string, number[]>();
  const fileMatches = new Map<number, string[]>();

  for (const asset of relinkCandidates) {
    const assetMediaKind = resolveRenderableAssetMediaKind(asset);
    const assetKeys = buildAssetRelinkMatchKeys(asset);
    for (const record of fileRecords) {
      if ((assetMediaKind && assetMediaKind !== record.kind) || !hasSharedRelinkKey(assetKeys, record.keys)) {
        continue;
      }

      assetMatches.set(asset.id, [...(assetMatches.get(asset.id) ?? []), record.index]);
      fileMatches.set(record.index, [...(fileMatches.get(record.index) ?? []), asset.id]);
    }
  }

  const recordByIndex = new Map(fileRecords.map((record) => [record.index, record]));
  const matchedFileIndexes = new Set<number>();
  const skippedAmbiguousFileIndexes = new Set<number>();
  const matches: BulkRelinkUploadedMediaMatch[] = [];

  for (const asset of relinkCandidates) {
    const matchingFileIndexes = assetMatches.get(asset.id) ?? [];
    if (matchingFileIndexes.length === 0) {
      skipped.push({
        kind: 'asset',
        assetId: asset.id,
        assetName: asset.name,
        reason: 'No selected file matched this asset relink hint.',
      });
      continue;
    }

    if (matchingFileIndexes.length > 1) {
      skipped.push({
        kind: 'asset',
        assetId: asset.id,
        assetName: asset.name,
        reason: 'Multiple selected files matched this asset.',
      });
      matchingFileIndexes.forEach((index) => matchedFileIndexes.add(index));
      continue;
    }

    const [fileIndex] = matchingFileIndexes;
    const fileAssetMatches = fileMatches.get(fileIndex) ?? [];
    if (fileAssetMatches.length > 1) {
      const record = recordByIndex.get(fileIndex);
      if (!skippedAmbiguousFileIndexes.has(fileIndex)) {
        skipped.push({
          kind: 'file',
          fileName: record?.file.name,
          reason: 'This file matched multiple offline assets.',
        });
        skippedAmbiguousFileIndexes.add(fileIndex);
      }
      matchedFileIndexes.add(fileIndex);
      continue;
    }

    const record = recordByIndex.get(fileIndex);
    if (!record) {
      continue;
    }

    matchedFileIndexes.add(fileIndex);
    matches.push({
      assetId: asset.id,
      fileName: record.file.name,
      input: record.input,
      cacheJobEntry: record.uploaded.cacheJob ? { assetId: asset.id, job: record.uploaded.cacheJob } : undefined,
    });
  }

  for (const record of fileRecords) {
    if (!matchedFileIndexes.has(record.index)) {
      skipped.push({
        kind: 'file',
        fileName: record.file.name,
        reason: 'No relinkable asset matched this file.',
      });
    }
  }

  const cacheJobEntries = matches
    .map((match) => match.cacheJobEntry)
    .filter((entry): entry is MediaCacheJobEntry => Boolean(entry));
  const matchCount = matches.length;
  const skippedCount = skipped.length;
  const status = matchCount > 0
    ? `Matched ${matchCount} media asset${matchCount === 1 ? '' : 's'} for relink${skippedCount > 0 ? `; skipped ${skippedCount}` : ''}.`
    : `No media assets matched the selected files${skippedCount > 0 ? `; skipped ${skippedCount}` : ''}.`;

  return {
    canRelink: matchCount > 0,
    assetIds: matches.map((match) => match.assetId),
    matches,
    cacheJobEntries,
    selectedSourceAssetId: matches[0]?.assetId,
    commitLabel: matchCount > 0 ? `Relinked ${matchCount} media asset${matchCount === 1 ? '' : 's'}` : undefined,
    status,
    skipped,
  };
}

export function resolveBulkRelinkCompletionViewState({
  nextAssets,
  plan,
  currentMediaSmartFilter,
}: {
  nextAssets: EditorAsset[];
  plan: BulkRelinkUploadedMediaPlan;
  currentMediaSmartFilter: MediaBinSmartCollection;
}): BulkRelinkCompletionViewState {
  const remainingCandidates = nextAssets.filter(isBulkRelinkCandidateAsset);
  const remainingCandidateAssetIds = remainingCandidates.map((asset) => asset.id);
  const remainingCount = remainingCandidateAssetIds.length;

  if (remainingCount === 0) {
    return {
      nextMediaSmartFilter: 'all',
      remainingCandidateAssetIds,
      status: appendBulkRelinkStatus(plan.status, 'All relinkable media is resolved.'),
    };
  }

  return {
    nextMediaSmartFilter: resolveBulkRelinkRemainingSmartFilter(remainingCandidates, currentMediaSmartFilter),
    remainingCandidateAssetIds,
    status: appendBulkRelinkStatus(
      plan.status,
      `${remainingCount} relinkable media asset${remainingCount === 1 ? '' : 's'} remain.`,
    ),
  };
}

export function resolveRelinkMediaFailureStatus(error: unknown): string {
  return `Relink failed: ${(error as Error).message}`;
}

export function resolveRemoveMediaAssetPlan({
  project,
  assetId,
  selectedSourceAssetId,
  assetById,
}: {
  project: EditorProject;
  assetId: string;
  selectedSourceAssetId: string;
  assetById: Map<string, EditorAsset>;
}): RemoveMediaAssetPlan {
  return {
    assetIds: [assetId],
    nextSourceAssetId: selectedSourceAssetId === assetId
      ? project.assets.find((asset) => asset.id !== assetId)?.id ?? ''
      : selectedSourceAssetId,
    commitLabel: 'Asset removed from bin',
    status: `${assetById.get(assetId)?.name ?? 'Asset'} removed`,
    canRemove: true,
  };
}

export function resolveRemoveUnusedMediaAssetsPlan({
  project,
  assetReferenceCounts,
  selectedSourceAssetId,
}: {
  project: EditorProject;
  assetReferenceCounts: Map<string, number>;
  selectedSourceAssetId: string;
}): RemoveMediaAssetPlan {
  const assetIds = project.assets
    .filter((asset) => (assetReferenceCounts.get(asset.id) ?? 0) === 0)
    .map((asset) => asset.id);

  if (assetIds.length === 0) {
    return {
      assetIds: [],
      nextSourceAssetId: selectedSourceAssetId,
      commitLabel: '',
      status: 'No unused assets to remove',
      canRemove: false,
    };
  }

  const unusedAssetIdSet = new Set(assetIds);
  const countLabel = `${assetIds.length} unused asset${assetIds.length === 1 ? '' : 's'}`;

  return {
    assetIds,
    nextSourceAssetId: unusedAssetIdSet.has(selectedSourceAssetId)
      ? project.assets.find((asset) => !unusedAssetIdSet.has(asset.id))?.id ?? ''
      : selectedSourceAssetId,
    commitLabel: `Removed ${countLabel}`,
    status: `Removed ${countLabel}`,
    canRemove: true,
  };
}

export function omitAssetScopedRecords<T>(
  records: Record<string, T>,
  assetIds: Iterable<string>,
): Record<string, T> {
  const assetIdSet = new Set(assetIds);
  return Object.fromEntries(
    Object.entries(records).filter(([assetId]) => !assetIdSet.has(assetId)),
  );
}

function buildRelinkInputFromUploaded(
  file: RelinkMediaFileReference,
  uploaded: UploadedMediaFile,
): ImportedMediaInput {
  return {
    name: file.name,
    mimeType: file.type || uploaded.mimeType || uploaded.metadata?.mimeType?.toString() || 'application/octet-stream',
    size: file.size || uploaded.size || 0,
    source: uploaded.source,
    renderPath: uploaded.renderPath,
    duration: uploaded.duration,
    width: uploaded.width,
    height: uploaded.height,
    fps: uploaded.fps,
    mediaCache: uploaded.mediaCache,
    metadata: {
      ...uploaded.metadata,
      originalName: uploaded.originalName,
      importedFileName: uploaded.name,
    },
  };
}

function isRelinkUploadedMediaFileReference(file: RelinkMediaFileReference, uploaded: UploadedMediaFile): boolean {
  if (readRelinkExplicitUnsupportedMimeType(file, uploaded)) {
    return false;
  }

  return isMediaFileReference({
    name: file.name || uploaded.originalName || uploaded.name || '',
    type: file.type,
    mimeType: file.type || uploaded.mimeType || uploaded.metadata?.mimeType?.toString(),
  });
}

export function isBulkRelinkCandidateAsset(asset: EditorAsset): boolean {
  const isUnresolvedAiAsset = asset.kind === 'ai' && !resolveRenderableAssetMediaKind(asset);
  if (!isRenderableMediaAsset(asset) && !isUnresolvedAiAsset) {
    return false;
  }

  if (!asset.renderPath || asset.metadata?.offlinePlaceholder === true) {
    return true;
  }

  return false;
}

function resolveBulkRelinkRemainingSmartFilter(
  remainingCandidates: EditorAsset[],
  fallback: MediaBinSmartCollection,
): MediaBinSmartCollection {
  if (remainingCandidates.some((asset) => !asset.renderPath)) {
    return 'missing-render';
  }

  return fallback;
}

function appendBulkRelinkStatus(status: string, sentence: string): string {
  const trimmedStatus = status.trim();
  return trimmedStatus ? `${trimmedStatus} ${sentence}` : sentence;
}

function buildAssetRelinkMatchKeys(asset: EditorAsset): Set<string> {
  return buildRelinkMatchKeys([
    asset.name,
    asset.source,
    asset.renderPath,
    readStringMetadata(asset.metadata?.originalName),
    readStringMetadata(asset.metadata?.importedFileName),
    readStringMetadata(asset.metadata?.edlRelinkHint),
    readStringMetadata(asset.metadata?.edlSourceFile),
    readStringMetadata(asset.metadata?.fcpxmlRelinkHint),
    readStringMetadata(asset.metadata?.fcpxmlSourceFile),
  ]);
}

function buildFileRelinkMatchKeys(file: RelinkMediaFileReference, uploaded: UploadedMediaFile): Set<string> {
  return buildRelinkMatchKeys([
    file.name,
    uploaded.originalName,
    uploaded.name,
    uploaded.source,
    uploaded.renderPath,
  ]);
}

function buildRelinkMatchKeys(values: Array<string | undefined>): Set<string> {
  const keys = new Set<string>();
  for (const value of values) {
    const rawBasename = readRelinkBasename(value);
    const basename = normalizeRelinkName(rawBasename);
    if (!basename) {
      continue;
    }

    keys.add(basename);
    const stem = normalizeRelinkName(stripExtension(rawBasename));
    if (stem) {
      keys.add(stem);
    }
  }

  return keys;
}

function hasSharedRelinkKey(left: Set<string>, right: Set<string>): boolean {
  for (const key of left) {
    if (right.has(key)) {
      return true;
    }
  }

  return false;
}

function inferRelinkInputKind(file: RelinkMediaFileReference, uploaded: UploadedMediaFile): RenderableAssetMediaKind | undefined {
  if (readRelinkExplicitUnsupportedMimeType(file, uploaded)) {
    return undefined;
  }

  const kind = inferSupportedMediaFileKind({
    name: file.name || uploaded.originalName || uploaded.name || '',
    type: file.type,
    mimeType: uploaded.mimeType || uploaded.metadata?.mimeType?.toString(),
  });
  if (kind === 'video' && uploaded.metadata?.hasVideo === false && uploaded.metadata?.hasAudio === true) {
    return 'audio';
  }

  if (kind) {
    return kind;
  }

  if (uploaded.metadata?.hasVideo === true) {
    return 'video';
  }

  if (uploaded.metadata?.hasAudio === true) {
    return 'audio';
  }

  return 'video';
}

function readRelinkExplicitUnsupportedMimeType(file: RelinkMediaFileReference, uploaded: UploadedMediaFile): string | undefined {
  for (const value of [
    file.type,
    uploaded.mimeType,
    uploaded.metadata?.mimeType?.toString(),
  ]) {
    const unsupportedMimeType = readExplicitUnsupportedMediaMimeType(value);
    if (unsupportedMimeType) {
      return unsupportedMimeType;
    }
  }

  return undefined;
}

function readStringMetadata(value: string | number | boolean | undefined): string | undefined {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

function normalizeRelinkName(value: string | undefined): string {
  return readRelinkBasename(value)
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readRelinkBasename(value: string | undefined): string {
  const decoded = decodeRelinkName(value ?? '');
  const withoutQuery = decoded.split(/[?#]/)[0] ?? '';
  return withoutQuery.split(/[\\/]/).filter(Boolean).at(-1) ?? withoutQuery;
}

function decodeRelinkName(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function stripExtension(value: string): string {
  return value.replace(/\.[a-z0-9]{1,8}$/i, '');
}
