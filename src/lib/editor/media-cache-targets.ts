import type { EditorAsset } from './types';
import { isRenderableMediaAsset } from './renderable-media-kind';

export type MediaCacheBatchSkipReason = 'unsupported-kind' | 'missing-render-path' | 'active-job';

export interface MediaCacheBatchSkip {
  assetId: string;
  reason: MediaCacheBatchSkipReason;
}

export interface MediaCacheBatchPlan {
  requestedCount: number;
  targets: EditorAsset[];
  skipped: MediaCacheBatchSkip[];
}

export interface MediaCacheBatchPlanOptions {
  targetAssetIds?: Iterable<string>;
  activeJobAssetIds?: Iterable<string>;
}

export function buildMediaCacheBatchPlan(
  assets: EditorAsset[],
  options: MediaCacheBatchPlanOptions = {},
): MediaCacheBatchPlan {
  const targetAssetIds = options.targetAssetIds ? new Set(options.targetAssetIds) : undefined;
  const activeJobAssetIds = new Set(options.activeJobAssetIds ?? []);
  const requestedAssets = targetAssetIds
    ? assets.filter((asset) => targetAssetIds.has(asset.id))
    : assets;
  const targets: EditorAsset[] = [];
  const skipped: MediaCacheBatchSkip[] = [];

  for (const asset of requestedAssets) {
    if (!isMediaCacheSupported(asset)) {
      skipped.push({ assetId: asset.id, reason: 'unsupported-kind' });
      continue;
    }

    if (!asset.renderPath) {
      skipped.push({ assetId: asset.id, reason: 'missing-render-path' });
      continue;
    }

    if (activeJobAssetIds.has(asset.id)) {
      skipped.push({ assetId: asset.id, reason: 'active-job' });
      continue;
    }

    targets.push(asset);
  }

  return {
    requestedCount: requestedAssets.length,
    targets,
    skipped,
  };
}

function isMediaCacheSupported(asset: EditorAsset): boolean {
  return isRenderableMediaAsset(asset);
}
