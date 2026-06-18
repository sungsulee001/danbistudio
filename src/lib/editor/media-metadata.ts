import type { EditorAsset, TimelineClip } from './types';
import { resolveRenderableAssetMediaKind } from './renderable-media-kind';

export const EMBEDDED_AUDIO_DISABLED_TAG = 'embedded-audio:disabled';
export const DETACHED_AUDIO_TAG_PREFIX = 'detached-audio:';
export const LINKED_VIDEO_TAG_PREFIX = 'linked-video:';

export function hasEmbeddedAudio(asset?: EditorAsset): boolean {
  return resolveRenderableAssetMediaKind(asset) === 'video' && asset?.metadata?.hasAudio === true;
}

export function hasTimelineAudio(asset?: EditorAsset): boolean {
  return resolveRenderableAssetMediaKind(asset) === 'audio' || hasEmbeddedAudio(asset);
}

export function clipHasTimelineAudio(clip: TimelineClip, asset?: EditorAsset): boolean {
  if (resolveRenderableAssetMediaKind(asset) === 'audio') {
    return true;
  }

  if (!hasEmbeddedAudio(asset)) {
    return false;
  }

  return clip.kind === 'audio' || !isEmbeddedAudioDisabled(clip);
}

export function isEmbeddedAudioDisabled(clip: TimelineClip): boolean {
  return clip.automationTags.includes(EMBEDDED_AUDIO_DISABLED_TAG);
}

export function getDetachedAudioClipId(clip: TimelineClip): string | undefined {
  return clip.automationTags
    .find((tag) => tag.startsWith(DETACHED_AUDIO_TAG_PREFIX))
    ?.slice(DETACHED_AUDIO_TAG_PREFIX.length);
}

export function getLinkedVideoClipId(clip: TimelineClip): string | undefined {
  return clip.automationTags
    .find((tag) => tag.startsWith(LINKED_VIDEO_TAG_PREFIX))
    ?.slice(LINKED_VIDEO_TAG_PREFIX.length);
}

export function buildDetachedAudioTag(audioClipId: string): string {
  return `${DETACHED_AUDIO_TAG_PREFIX}${audioClipId}`;
}

export function buildLinkedVideoTag(videoClipId: string): string {
  return `${LINKED_VIDEO_TAG_PREFIX}${videoClipId}`;
}

export function withoutEmbeddedAudioLinkTags(tags: string[]): string[] {
  return tags.filter((tag) => (
    tag !== EMBEDDED_AUDIO_DISABLED_TAG &&
    !tag.startsWith(DETACHED_AUDIO_TAG_PREFIX) &&
    !tag.startsWith(LINKED_VIDEO_TAG_PREFIX)
  ));
}

export function withUniqueTags(tags: string[], additions: string[]): string[] {
  return Array.from(new Set([...tags, ...additions]));
}
