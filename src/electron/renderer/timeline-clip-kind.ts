import { resolveRenderableAssetMediaKind } from '../../lib/editor/renderable-media-kind';
import type { EditorAsset, TimelineClip } from '../../lib/editor/types';

export function resolveTimelineClipDisplayAssetKind(clip: TimelineClip, asset?: EditorAsset): string {
  const mediaKind = resolveRenderableAssetMediaKind(asset);
  if (mediaKind) {
    return mediaKind;
  }

  return clip.kind === 'audio' ? 'audio' : asset?.kind ?? clip.kind;
}
