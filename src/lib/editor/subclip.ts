import type { EditorAsset, EditorProject, MediaCacheManifest } from './types';

export interface CreateMediaSubclipOptions {
  sourceIn: number;
  sourceOut: number;
  name?: string;
  bin?: string;
}

export interface CreateMediaSubclipResult {
  project: EditorProject;
  asset: EditorAsset;
}

const MIN_SUBCLIP_DURATION = 0.05;
const SUBCLIP_SOURCE_IN_KEY = 'subclipSourceIn';
const SUBCLIP_SOURCE_OUT_KEY = 'subclipSourceOut';
const SUBCLIP_PARENT_ID_KEY = 'subclipParentAssetId';
const SUBCLIP_PARENT_NAME_KEY = 'subclipParentAssetName';
const SUBCLIP_PARENT_DURATION_KEY = 'subclipParentDuration';

export function createMediaSubclip(
  project: EditorProject,
  sourceAssetId: string,
  options: CreateMediaSubclipOptions,
): CreateMediaSubclipResult {
  const sourceAsset = project.assets.find((asset) => asset.id === sourceAssetId);
  if (!sourceAsset) {
    throw new Error('Source asset not found.');
  }

  const sourceIn = roundTime(clamp(options.sourceIn, 0, sourceAsset.duration));
  const sourceOut = roundTime(clamp(options.sourceOut, 0, sourceAsset.duration));
  const start = Math.min(sourceIn, sourceOut);
  const end = Math.max(sourceIn, sourceOut);
  const duration = roundTime(end - start);
  if (duration < MIN_SUBCLIP_DURATION) {
    throw new Error('Set a longer source range before creating a subclip.');
  }

  const name = options.name?.trim() || `${sourceAsset.name} ${formatRangeLabel(start, end)}`;
  const asset: EditorAsset = {
    ...sourceAsset,
    id: `asset-subclip-${Date.now()}-${slug(name)}`,
    name,
    duration,
    mediaCache: buildSubclipMediaCache(sourceAsset.mediaCache, sourceAsset.duration, start, end),
    metadata: {
      ...(sourceAsset.metadata ?? {}),
      imported: true,
      subclip: true,
      [SUBCLIP_PARENT_ID_KEY]: sourceAsset.id,
      [SUBCLIP_PARENT_NAME_KEY]: sourceAsset.name,
      [SUBCLIP_PARENT_DURATION_KEY]: sourceAsset.duration,
      [SUBCLIP_SOURCE_IN_KEY]: start,
      [SUBCLIP_SOURCE_OUT_KEY]: end,
      ...(options.bin !== undefined ? { bin: options.bin.trim() || 'Unsorted' } : {}),
    },
  };

  return {
    asset,
    project: {
      ...project,
      assets: [...project.assets, asset],
      updatedAt: new Date().toISOString(),
    },
  };
}

export function isMediaSubclipAsset(asset: EditorAsset | undefined): boolean {
  return asset?.metadata?.subclip === true;
}

export function readAssetSourceOffset(asset: EditorAsset | undefined): number {
  if (!asset) {
    return 0;
  }

  const value = asset.metadata?.[SUBCLIP_SOURCE_IN_KEY];
  return typeof value === 'number' && Number.isFinite(value)
    ? roundTime(Math.max(0, value))
    : 0;
}

export function readAssetOriginalSourceOut(asset: EditorAsset | undefined): number | undefined {
  const value = asset?.metadata?.[SUBCLIP_SOURCE_OUT_KEY];
  return typeof value === 'number' && Number.isFinite(value) ? roundTime(Math.max(0, value)) : undefined;
}

export function readAssetOriginalSourceDuration(asset: EditorAsset | undefined): number | undefined {
  const value = asset?.metadata?.[SUBCLIP_PARENT_DURATION_KEY];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? roundTime(value) : undefined;
}

export function readAssetParentAssetId(asset: EditorAsset | undefined): string | undefined {
  const value = asset?.metadata?.[SUBCLIP_PARENT_ID_KEY];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function getAssetMediaTime(asset: EditorAsset | undefined, assetRelativeTime: number): number {
  return roundTime(readAssetSourceOffset(asset) + Math.max(0, assetRelativeTime));
}

export function buildSubclipMediaCache(
  cache: MediaCacheManifest | undefined,
  sourceDuration: number,
  sourceIn: number,
  sourceOut: number,
): MediaCacheManifest | undefined {
  if (!cache) {
    return undefined;
  }

  return {
    ...cache,
    waveformPeaks: sliceWaveformPeaks(cache.waveformPeaks, sourceDuration, sourceIn, sourceOut),
    warnings: [
      ...cache.warnings,
      'Subclip reuses parent preview media; source offsets are applied during preview and render.',
    ],
  };
}

function sliceWaveformPeaks(
  peaks: number[] | undefined,
  sourceDuration: number,
  sourceIn: number,
  sourceOut: number,
): number[] | undefined {
  if (!peaks?.length || sourceDuration <= 0) {
    return peaks;
  }

  const startIndex = Math.floor((sourceIn / sourceDuration) * peaks.length);
  const endIndex = Math.ceil((sourceOut / sourceDuration) * peaks.length);
  return peaks.slice(
    clampInteger(startIndex, 0, peaks.length - 1),
    clampInteger(Math.max(startIndex + 1, endIndex), 1, peaks.length),
  );
}

function formatRangeLabel(start: number, end: number): string {
  return `[${start.toFixed(1)}-${end.toFixed(1)}s]`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 36) || 'subclip';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}
