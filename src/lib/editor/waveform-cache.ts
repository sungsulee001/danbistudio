// Adapted from OpenCut Classic services/waveform-cache.
// Source: https://github.com/opencut-app/opencut-classic
// Commit: cf5e79e919144200294fb9fed22a222592a0aeea
// License: MIT. See third_party/NOTICE.md and docs/THIRD_PARTY_SOURCE_REGISTER_KR.md.

import type { EditorAsset } from './types';
import { resolvePreviewSourcePath } from './preview-source';
import { resolveRenderableAssetMediaKind } from './renderable-media-kind';
import {
  isMediaSubclipAsset,
  readAssetParentAssetId,
  readAssetOriginalSourceDuration,
  readAssetOriginalSourceOut,
  readAssetSourceOffset,
} from './subclip';

export type WaveformPeakSource = 'persistent' | 'runtime' | 'none';

export interface WaveformPeakResolution {
  source: WaveformPeakSource;
  peaks?: number[];
}

export interface WaveformRuntimeReadRequest {
  assetId: string;
  source: string;
}

export interface WaveformPeakEntry {
  assetId: string;
  peaks: number[];
}

export class WaveformCache<TSummary> {
  private summaries = new Map<string, Promise<TSummary>>();

  getSourceSummary({
    sourceKey,
    buildSummary,
  }: {
    sourceKey: string;
    buildSummary: () => Promise<TSummary>;
  }): Promise<TSummary> {
    const existing = this.summaries.get(sourceKey);
    if (existing) {
      return existing;
    }

    const promise = buildSummary().catch((error) => {
      this.summaries.delete(sourceKey);
      throw error;
    });

    this.summaries.set(sourceKey, promise);
    return promise;
  }

  clearSource({ sourceKey }: { sourceKey: string }): void {
    this.summaries.delete(sourceKey);
  }

  clearAll(): void {
    this.summaries.clear();
  }

  get size(): number {
    return this.summaries.size;
  }
}

export function resolveAssetWaveformPeaks(
  asset: EditorAsset | undefined,
  runtimePeaks?: number[],
): WaveformPeakResolution {
  const persistentPeaks = normalizeWaveformPeaks(asset?.mediaCache?.waveformPeaks);
  if (persistentPeaks.length > 0) {
    return { source: 'persistent', peaks: persistentPeaks };
  }

  const normalizedRuntimePeaks = normalizeWaveformPeaks(runtimePeaks);
  if (normalizedRuntimePeaks.length > 0) {
    return { source: 'runtime', peaks: sliceRuntimeWaveformPeaksForAsset(asset, normalizedRuntimePeaks) };
  }

  return { source: 'none' };
}

export function resolveWaveformPeaks(
  asset: EditorAsset | undefined,
  runtimePeaks?: number[],
): number[] | undefined {
  return resolveAssetWaveformPeaks(asset, runtimePeaks).peaks;
}

export function resolveAssetRuntimeWaveformPeaks(
  asset: EditorAsset | undefined,
  runtimePeaksByAssetId: Record<string, number[]> | undefined,
): number[] | undefined {
  if (!asset || !runtimePeaksByAssetId) {
    return undefined;
  }

  const ownPeaks = runtimePeaksByAssetId[asset.id];
  if (normalizeWaveformPeaks(ownPeaks).length > 0) {
    return ownPeaks;
  }

  const parentAssetId = readAssetParentAssetId(asset);
  if (!parentAssetId) {
    return undefined;
  }

  const parentPeaks = runtimePeaksByAssetId[parentAssetId];
  return normalizeWaveformPeaks(parentPeaks).length > 0 ? parentPeaks : undefined;
}

export function assetHasPersistentWaveform(asset: EditorAsset | undefined): boolean {
  return Boolean(
    asset?.mediaCache?.waveformSource ||
    normalizeWaveformPeaks(asset?.mediaCache?.waveformPeaks).length > 0,
  );
}

export function assetCanHaveWaveform(asset: EditorAsset): boolean {
  const mediaKind = resolveRenderableAssetMediaKind(asset);
  if (mediaKind === 'audio') {
    return true;
  }

  if (mediaKind !== 'video') {
    return false;
  }

  return asset.metadata?.hasAudio !== false;
}

export function buildWaveformRuntimeReadRequests({
  assets,
  runtimePeaksByAssetId,
}: {
  assets: EditorAsset[];
  runtimePeaksByAssetId: Record<string, number[]>;
}): WaveformRuntimeReadRequest[] {
  return assets.flatMap((asset) => {
    if (
      !assetCanHaveWaveform(asset) ||
      assetHasPersistentWaveform(asset) ||
      normalizeWaveformPeaks(resolveAssetRuntimeWaveformPeaks(asset, runtimePeaksByAssetId)).length > 0
    ) {
      return [];
    }

    const source = resolveWaveformDecodeSource(asset);
    return source ? [{ assetId: asset.id, source }] : [];
  });
}

export function mergeWaveformPeakEntries(
  current: Record<string, number[]>,
  entries: WaveformPeakEntry[],
): Record<string, number[]> {
  const normalizedEntries = entries
    .map((entry) => [entry.assetId, normalizeWaveformPeaks(entry.peaks)] as const)
    .filter((entry): entry is readonly [string, number[]] => Boolean(entry[0] && entry[1].length > 0));

  if (normalizedEntries.length === 0) {
    return current;
  }

  return {
    ...current,
    ...Object.fromEntries(normalizedEntries),
  };
}

export function normalizeWaveformPeaks(peaks: number[] | undefined): number[] {
  if (!peaks?.length) {
    return [];
  }

  return peaks
    .map((peak) => roundPeak(peak))
    .filter((peak) => Number.isFinite(peak));
}

function resolveWaveformDecodeSource(asset: EditorAsset): string {
  if (resolveRenderableAssetMediaKind(asset) === 'video' && asset.mediaCache?.proxySource) {
    return asset.mediaCache.proxySource;
  }

  const previewPath = resolvePreviewSourcePath(asset.source, asset.renderPath);
  return previewPath.mode !== 'none' ? previewPath.source : '';
}

function sliceRuntimeWaveformPeaksForAsset(
  asset: EditorAsset | undefined,
  peaks: number[],
): number[] {
  if (!asset || !isMediaSubclipAsset(asset) || peaks.length === 0) {
    return peaks;
  }

  const parentDuration = readAssetOriginalSourceDuration(asset);
  const sourceIn = readAssetSourceOffset(asset);
  const sourceOut = readAssetOriginalSourceOut(asset);
  if (!parentDuration || sourceOut === undefined || sourceOut <= sourceIn) {
    return peaks;
  }

  const startIndex = Math.floor((sourceIn / parentDuration) * peaks.length);
  const endIndex = Math.ceil((sourceOut / parentDuration) * peaks.length);
  const sliced = peaks.slice(
    clampInteger(startIndex, 0, peaks.length - 1),
    clampInteger(Math.max(startIndex + 1, endIndex), 1, peaks.length),
  );

  return sliced.length > 0 ? sliced : peaks;
}

function roundPeak(value: number): number {
  return Math.round(Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 1000) / 1000;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}
