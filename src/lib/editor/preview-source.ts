import type { ClipKind, EditorAsset } from './types';
import { resolveRenderableAssetMediaKind } from './renderable-media-kind';
import { assetHasPersistentWaveform, resolveWaveformPeaks as resolveCachedWaveformPeaks } from './waveform-cache';

export type PreviewMediaSourceMode = 'proxy' | 'source' | 'none';
export type PreviewSourcePathMode = 'source' | 'public-render-path' | 'none';

export interface PreviewMediaSource {
  source: string;
  mode: PreviewMediaSourceMode;
  hasProxy: boolean;
  hasThumbnail: boolean;
  hasWaveform: boolean;
}

export interface PreviewSourcePath {
  source: string;
  mode: PreviewSourcePathMode;
  reason?: string;
}

export function resolvePreviewMediaSource(asset: EditorAsset | undefined): PreviewMediaSource {
  const hasProxy = Boolean(asset?.mediaCache?.proxySource);
  const hasThumbnail = Boolean(asset?.mediaCache?.thumbnailSource);
  const hasWaveform = assetHasPersistentWaveform(asset);

  if (!asset) {
    return { source: '', mode: 'none', hasProxy, hasThumbnail, hasWaveform };
  }

  if (resolveRenderableAssetMediaKind(asset) === 'video' && asset.mediaCache?.proxySource) {
    const proxyPath = resolvePreviewSourcePath(asset.mediaCache.proxySource, asset.mediaCache.proxyPath);
    if (proxyPath.mode !== 'none') {
      return { source: proxyPath.source, mode: 'proxy', hasProxy, hasThumbnail, hasWaveform };
    }
  }

  const previewPath = resolvePreviewSourcePath(asset.source, asset.renderPath);
  if (previewPath.mode !== 'none') {
    return { source: previewPath.source, mode: 'source', hasProxy, hasThumbnail, hasWaveform };
  }

  return { source: '', mode: 'none', hasProxy, hasThumbnail, hasWaveform };
}

export function resolvePreviewSourcePath(source?: string, renderPath?: string): PreviewSourcePath {
  const directSource = normalizeOptionalPath(source);
  if (directSource && isBrowserPreviewSource(directSource)) {
    return { source: directSource, mode: 'source' };
  }

  const samplePackSource = resolveSamplePackPreviewPath(renderPath) || resolveSamplePackPreviewPath(directSource);
  if (samplePackSource) {
    return { source: samplePackSource, mode: 'public-render-path' };
  }

  const publicRenderSource = resolvePublicPreviewPath(renderPath ?? directSource);
  if (publicRenderSource) {
    return { source: publicRenderSource, mode: 'public-render-path' };
  }

  if (directSource || normalizeOptionalPath(renderPath)) {
    return {
      source: '',
      mode: 'none',
      reason: 'Preview source is a local filesystem path outside the browser-served public media roots.',
    };
  }

  return { source: '', mode: 'none', reason: 'Preview source is missing.' };
}

export function resolveTimelineThumbnailSource(asset: EditorAsset | undefined, clipKind?: ClipKind): string | undefined {
  if (asset?.mediaCache?.thumbnailSource) {
    return asset.mediaCache.thumbnailSource;
  }

  if (resolveRenderableAssetMediaKind(asset) === 'image' || clipKind === 'image') {
    const previewPath = resolvePreviewSourcePath(asset?.source, asset?.renderPath);
    return previewPath.mode !== 'none' ? previewPath.source : undefined;
  }

  return undefined;
}

export function resolveWaveformPeaks(asset: EditorAsset | undefined, runtimePeaks?: number[]): number[] | undefined {
  return resolveCachedWaveformPeaks(asset, runtimePeaks);
}

export function formatPreviewSourceMode(source: PreviewMediaSource): string {
  if (source.mode === 'proxy') {
    return 'proxy';
  }

  if (source.mode === 'source') {
    return 'source';
  }

  return 'missing';
}

function normalizeOptionalPath(value?: string): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isBrowserPreviewSource(value: string): boolean {
  return (
    value.startsWith('/') ||
    value.startsWith('blob:') ||
    value.startsWith('data:') ||
    /^https?:\/\//i.test(value)
  );
}

function resolvePublicPreviewPath(value?: string): string {
  const path = normalizeOptionalPath(value).replace(/\\/g, '/');
  if (!path) {
    return '';
  }

  if (/^\/(?:outputs|imports|cache|luts)\//.test(path)) {
    return path;
  }

  const publicIndex = path.toLowerCase().lastIndexOf('/public/');
  if (publicIndex < 0) {
    return '';
  }

  const relative = path.slice(publicIndex + '/public'.length);
  return relative.startsWith('/') ? relative : `/${relative}`;
}

function resolveSamplePackPreviewPath(value?: string): string {
  const path = normalizeOptionalPath(value).replace(/\\/g, '/');
  if (!path) {
    return '';
  }

  const lower = path.toLowerCase();
  const markers = [
    '/samples/getting-started/',
    '/sample-project-pack/getting-started/',
  ];
  const marker = markers.find((item) => lower.includes(item));
  if (!marker) {
    return '';
  }

  const markerIndex = lower.lastIndexOf(marker);
  const relative = path.slice(markerIndex + marker.length);
  return relative ? `/sample-pack/${relative}` : '';
}
