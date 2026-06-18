import type { ProgramPreviewStack } from '../../lib/editor/preview';
import { resolvePreviewMediaSource } from '../../lib/editor/preview-source';
import { isRenderableVisualMediaAsset, resolveRenderableAssetMediaKind } from '../../lib/editor/renderable-media-kind';
import { resolvePreviewWorkerCacheAssetIds, type PreviewWorkerSourceLayer } from '../../lib/editor/preview-worker';

export function buildProgramPreviewWorkerSourceLayers(stack: ProgramPreviewStack): PreviewWorkerSourceLayer[] {
  return stack.mediaLayers
    .filter((layer) => isRenderableVisualMediaAsset(layer.asset))
    .flatMap((layer) => {
      const asset = layer.asset;
      const mediaKind = resolveRenderableAssetMediaKind(asset);
      if (!asset) {
        return [];
      }
      if (mediaKind !== 'video' && mediaKind !== 'image') {
        return [];
      }

      const previewSource = resolvePreviewMediaSource(asset);
      const workerSource = mediaKind === 'video'
        ? resolvePreviewWorkerVideoSource(asset.source, previewSource.source)
        : previewSource.source;
      return [{
        assetId: asset.id,
        kind: mediaKind,
        mode: previewSource.mode,
        width: asset.width,
        height: asset.height,
        source: workerSource,
        frameSource: mediaKind === 'video'
          ? asset.mediaCache?.thumbnailSource
          : previewSource.source,
        time: layer.mediaTime,
      }];
    });
}

function resolvePreviewWorkerVideoSource(source: string | undefined, fallbackSource: string): string {
  return source && isFetchablePreviewWorkerVideoSource(source) ? source : fallbackSource;
}

function isFetchablePreviewWorkerVideoSource(source: string): boolean {
  const normalized = source.trim();
  return normalized.startsWith('/')
    || normalized.startsWith('data:')
    || /^https?:\/\//i.test(normalized);
}

export function resolveProgramPreviewCacheCandidateAssetIds(stack: ProgramPreviewStack): string[] {
  return resolvePreviewWorkerCacheAssetIds(buildProgramPreviewWorkerSourceLayers(stack));
}

export function filterQueueableProgramPreviewCacheAssetIds(
  candidateAssetIds: string[],
  activeCacheJobAssetIds?: Set<string>,
): string[] {
  if (!activeCacheJobAssetIds) {
    return candidateAssetIds;
  }

  return candidateAssetIds.filter((assetId) => !activeCacheJobAssetIds.has(assetId));
}
