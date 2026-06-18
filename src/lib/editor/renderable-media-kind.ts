import {
  inferSupportedMediaFileKind,
  readExplicitUnsupportedMediaMimeType,
  type SupportedMediaFileKind,
} from './media-file-support';
import type { EditorAsset } from './types';

export type RenderableAssetMediaKind = SupportedMediaFileKind;

export function resolveRenderableAssetMediaKind(asset?: EditorAsset): RenderableAssetMediaKind | undefined {
  if (!asset) {
    return undefined;
  }

  if (asset.kind === 'video' || asset.kind === 'image' || asset.kind === 'audio') {
    return asset.kind;
  }

  if (asset.kind !== 'ai') {
    return undefined;
  }

  const mimeType = readAssetMimeType(asset);
  const mimeKind = inferSupportedMediaFileKind({
    name: '',
    mimeType,
  });
  if (mimeKind) {
    return mimeKind;
  }

  if (readExplicitUnsupportedMediaMimeType(mimeType)) {
    return undefined;
  }

  if (asset.metadata?.hasVideo === true) {
    return 'video';
  }

  if (asset.metadata?.hasAudio === true) {
    return 'audio';
  }

  return inferRenderableMediaKindFromAssetReference(asset);
}

export function isRenderableMediaAsset(asset?: EditorAsset): boolean {
  return Boolean(resolveRenderableAssetMediaKind(asset));
}

export function isRenderableVisualMediaAsset(asset?: EditorAsset): boolean {
  const mediaKind = resolveRenderableAssetMediaKind(asset);
  return mediaKind === 'video' || mediaKind === 'image';
}

export function isRenderableVideoMediaAsset(asset?: EditorAsset): boolean {
  return resolveRenderableAssetMediaKind(asset) === 'video';
}

function readAssetMimeType(asset: EditorAsset): string | undefined {
  const mimeType = asset.metadata?.mimeType;
  return typeof mimeType === 'string' ? mimeType.toLowerCase() : undefined;
}

function inferRenderableMediaKindFromAssetReference(asset: EditorAsset): RenderableAssetMediaKind | undefined {
  const mimeType = readAssetMimeType(asset);
  for (const name of [asset.renderPath, asset.source, asset.name]) {
    const kind = inferSupportedMediaFileKind({
      name: name ?? '',
      mimeType,
    });
    if (kind) {
      return kind;
    }
  }

  return undefined;
}
