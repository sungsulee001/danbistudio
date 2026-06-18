import type { ClipKind, EditorAsset, EditorProject } from './types';
import { resolvePreviewMediaSource, resolvePreviewSourcePath } from './preview-source';
import { isRenderableMediaAsset, isRenderableVideoMediaAsset, resolveRenderableAssetMediaKind } from './renderable-media-kind';
import { assetCanHaveWaveform, assetHasPersistentWaveform } from './waveform-cache';

export type MediaBinKindFilter = 'all' | ClipKind;

export type MediaBinSortKey =
  | 'name'
  | 'kind'
  | 'duration-asc'
  | 'duration-desc'
  | 'used-desc'
  | 'used-asc';

export type MediaBinSmartCollection =
  | 'all'
  | 'used'
  | 'unused'
  | 'missing-render'
  | 'needs-proxy'
  | 'needs-waveform'
  | 'volatile-source'
  | 'generated'
  | 'subclips';

export type MediaBinReferenceCounts = ReadonlyMap<string, number> | Readonly<Record<string, number>>;

export interface MediaBinCollection {
  id: string;
  label: string;
  count: number;
}

export interface MediaBinFilterOptions {
  query?: string;
  kind?: MediaBinKindFilter;
  sort?: MediaBinSortKey;
  bin?: string;
  smart?: MediaBinSmartCollection;
  referenceCounts?: MediaBinReferenceCounts;
}

const SMART_COLLECTION_LABELS: Record<MediaBinSmartCollection, string> = {
  all: 'All status',
  used: 'Used',
  unused: 'Unused',
  'missing-render': 'Missing render',
  'needs-proxy': 'Needs proxy',
  'needs-waveform': 'Needs waveform',
  'volatile-source': 'Volatile source',
  generated: 'Generated',
  subclips: 'Subclips',
};

const SMART_COLLECTION_ORDER: MediaBinSmartCollection[] = [
  'all',
  'used',
  'unused',
  'missing-render',
  'needs-proxy',
  'needs-waveform',
  'volatile-source',
  'generated',
  'subclips',
];

export function filterAndSortMediaAssets(
  assets: EditorAsset[],
  options: MediaBinFilterOptions = {},
): EditorAsset[] {
  const queryTokens = normalizeSearchTokens(options.query);
  const kind = options.kind ?? 'all';
  const sort = options.sort ?? 'name';
  const bin = normalizeBinFilter(options.bin);
  const smart = options.smart ?? 'all';

  return assets
    .map((asset, index) => ({ asset, index }))
    .filter(({ asset }) => (
      mediaAssetMatchesKindFilter(asset, kind) &&
      (bin === 'all' || readAssetBin(asset) === bin) &&
      mediaAssetMatchesSmartCollection(asset, smart, options.referenceCounts) &&
      queryTokens.every((token) => searchableAssetText(asset).includes(token))
    ))
    .sort((left, right) => compareMediaAssets(left.asset, right.asset, sort, options.referenceCounts) || left.index - right.index)
    .map(({ asset }) => asset);
}

export function listMediaBinCollections(assets: EditorAsset[]): MediaBinCollection[] {
  const counts = new Map<string, number>();

  for (const asset of assets) {
    const bin = readAssetBin(asset);
    counts.set(bin, (counts.get(bin) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({ id: label, label, count }))
    .sort((left, right) => (
      left.label === DEFAULT_MEDIA_BIN
        ? -1
        : right.label === DEFAULT_MEDIA_BIN
          ? 1
          : left.label.localeCompare(right.label)
    ));
}

export function listMediaBinSmartCollections(
  assets: EditorAsset[],
  referenceCounts?: MediaBinReferenceCounts,
): MediaBinCollection[] {
  return SMART_COLLECTION_ORDER.map((id) => ({
    id,
    label: SMART_COLLECTION_LABELS[id],
    count: assets.filter((asset) => mediaAssetMatchesSmartCollection(asset, id, referenceCounts)).length,
  }));
}

export function mediaAssetMatchesSmartCollection(
  asset: EditorAsset,
  smart: MediaBinSmartCollection,
  referenceCounts?: MediaBinReferenceCounts,
): boolean {
  const referenceCount = readAssetReferenceCount(referenceCounts, asset.id);

  switch (smart) {
    case 'used':
      return referenceCount > 0;
    case 'unused':
      return referenceCount === 0;
    case 'missing-render':
      return isRenderMediaAsset(asset) && !asset.renderPath;
    case 'needs-proxy':
      return isRenderableVideoMediaAsset(asset) && !asset.mediaCache?.proxySource;
    case 'needs-waveform':
      return assetCanHaveWaveform(asset) && !assetHasPersistentWaveform(asset);
    case 'volatile-source': {
      const previewSource = resolvePreviewMediaSource(asset);
      const previewPath = resolvePreviewSourcePath(asset.source, asset.renderPath);
      return previewSource.mode !== 'proxy' && previewPath.mode === 'source' && isVolatilePreviewSource(previewPath.source);
    }
    case 'generated':
      return asset.kind === 'ai' || asset.metadata?.generated === true || asset.metadata?.comfyui === true;
    case 'subclips':
      return asset.metadata?.subclip === true || typeof asset.metadata?.subclipParentAssetId === 'string';
    case 'all':
    default:
      return true;
  }
}

export function resolveMediaBinAssetKindLabel(asset: EditorAsset): string {
  const mediaKind = resolveRenderableAssetMediaKind(asset);
  return asset.kind === 'ai' && mediaKind ? `ai/${mediaKind}` : asset.kind;
}

function mediaAssetMatchesKindFilter(asset: EditorAsset, kind: MediaBinKindFilter): boolean {
  if (kind === 'all' || asset.kind === kind) {
    return true;
  }

  if (kind === 'video' || kind === 'audio' || kind === 'image') {
    return resolveRenderableAssetMediaKind(asset) === kind;
  }

  return false;
}

function isVolatilePreviewSource(source: string): boolean {
  return source.startsWith('blob:') || source.startsWith('local://') || source.startsWith('offline://');
}

export function updateMediaAssetBin(
  project: EditorProject,
  assetIds: string[],
  binName: string,
): EditorProject {
  const targetIds = new Set(assetIds.filter(Boolean));
  if (targetIds.size === 0) {
    throw new Error('Select at least one asset.');
  }

  const nextBin = normalizeAssetBin(binName);
  let changed = false;
  const assets = project.assets.map((asset) => {
    if (!targetIds.has(asset.id)) {
      return asset;
    }

    if (readAssetBin(asset) === nextBin) {
      return asset;
    }

    changed = true;
    return {
      ...asset,
      metadata: {
        ...(asset.metadata ?? {}),
        bin: nextBin,
      },
    };
  });

  if (!changed) {
    return project;
  }

  return {
    ...project,
    assets,
    updatedAt: new Date().toISOString(),
  };
}

export function readAssetBin(asset: EditorAsset): string {
  return normalizeAssetBin(asset.metadata?.bin);
}

const DEFAULT_MEDIA_BIN = 'Unsorted';

function normalizeSearchTokens(query: string | undefined): string[] {
  return (query ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function searchableAssetText(asset: EditorAsset): string {
  return [
    asset.id,
    asset.name,
    asset.kind,
    resolveRenderableAssetMediaKind(asset),
    resolveMediaBinAssetKindLabel(asset),
    readAssetBin(asset),
    asset.source,
    asset.renderPath,
    asset.width,
    asset.height,
    asset.fps,
    asset.duration,
    ...Object.entries(asset.metadata ?? {}).flatMap(([key, value]) => [key, value]),
  ]
    .filter((value) => value !== undefined && value !== null)
    .join(' ')
    .toLowerCase();
}

function normalizeBinFilter(value: string | undefined): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : 'all';
}

function normalizeAssetBin(value: unknown): string {
  if (typeof value !== 'string') {
    return DEFAULT_MEDIA_BIN;
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : DEFAULT_MEDIA_BIN;
}

function readAssetReferenceCount(referenceCounts: MediaBinReferenceCounts | undefined, assetId: string): number {
  if (!referenceCounts) {
    return 0;
  }

  if ('get' in referenceCounts && typeof referenceCounts.get === 'function') {
    return referenceCounts.get(assetId) ?? 0;
  }

  return (referenceCounts as Readonly<Record<string, number>>)[assetId] ?? 0;
}

function isRenderMediaAsset(asset: EditorAsset): boolean {
  return isRenderableMediaAsset(asset);
}

function compareMediaAssets(
  left: EditorAsset,
  right: EditorAsset,
  sort: MediaBinSortKey,
  referenceCounts?: MediaBinReferenceCounts,
): number {
  switch (sort) {
    case 'kind':
      return left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name);
    case 'duration-asc':
      return left.duration - right.duration || left.name.localeCompare(right.name);
    case 'duration-desc':
      return right.duration - left.duration || left.name.localeCompare(right.name);
    case 'used-asc':
      return readAssetReferenceCount(referenceCounts, left.id) - readAssetReferenceCount(referenceCounts, right.id)
        || left.name.localeCompare(right.name);
    case 'used-desc':
      return readAssetReferenceCount(referenceCounts, right.id) - readAssetReferenceCount(referenceCounts, left.id)
        || left.name.localeCompare(right.name);
    case 'name':
    default:
      return left.name.localeCompare(right.name);
  }
}
