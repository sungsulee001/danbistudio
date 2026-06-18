import { buildMediaCacheBatchPlan, type MediaCacheBatchPlan } from '../../lib/editor/media-cache-targets';
import { buildMediaHealthReport, type MediaAssetHealth, type MediaHealthReport } from '../../lib/editor/media-health';
import {
  filterAndSortMediaAssets,
  listMediaBinCollections,
  listMediaBinSmartCollections,
  type MediaBinCollection,
  type MediaBinKindFilter,
  type MediaBinSmartCollection,
  type MediaBinSortKey,
} from '../../lib/editor/media-bin';
import type { EditorAsset, EditorProject } from '../../lib/editor/types';
import type { MediaCacheJobView } from './editor-view-model';

export interface MediaWorkspaceFilters {
  query: string;
  kind: MediaBinKindFilter;
  sort: MediaBinSortKey;
  bin: string;
  smart: MediaBinSmartCollection;
}

export interface MediaWorkspaceState {
  mediaHealth: MediaHealthReport;
  mediaHealthByAssetId: Map<string, MediaAssetHealth>;
  filteredMediaAssets: EditorAsset[];
  activeCacheJobAssetIds: Set<string>;
  filteredMediaCachePlan: MediaCacheBatchPlan;
  mediaBinCollections: MediaBinCollection[];
  mediaSmartCollections: MediaBinCollection[];
}

export function resolveMediaWorkspaceState({
  project,
  assetReferenceCounts,
  cacheJobsByAssetId,
  filters,
}: {
  project: EditorProject;
  assetReferenceCounts: Map<string, number>;
  cacheJobsByAssetId: Record<string, MediaCacheJobView>;
  filters: MediaWorkspaceFilters;
}): MediaWorkspaceState {
  const mediaHealth = buildMediaHealthReport(project);
  const mediaHealthByAssetId = new Map(mediaHealth.assets.map((asset) => [asset.assetId, asset]));
  const filteredMediaAssets = filterAndSortMediaAssets(project.assets, {
    query: filters.query,
    kind: filters.kind,
    sort: filters.sort,
    bin: filters.bin,
    smart: filters.smart,
    referenceCounts: assetReferenceCounts,
  });
  const activeCacheJobAssetIds = new Set(Object.entries(cacheJobsByAssetId)
    .filter(([, job]) => job.status === 'queued' || job.status === 'running')
    .map(([assetId]) => assetId));

  return {
    mediaHealth,
    mediaHealthByAssetId,
    filteredMediaAssets,
    activeCacheJobAssetIds,
    filteredMediaCachePlan: buildMediaCacheBatchPlan(filteredMediaAssets, { activeJobAssetIds: activeCacheJobAssetIds }),
    mediaBinCollections: listMediaBinCollections(project.assets),
    mediaSmartCollections: listMediaBinSmartCollections(project.assets, assetReferenceCounts),
  };
}
