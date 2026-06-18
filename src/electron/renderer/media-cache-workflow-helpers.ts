import type { MediaCacheBatchPlan } from '../../lib/editor/media-cache-targets';
import {
  buildSubclipMediaCache,
  isMediaSubclipAsset,
  readAssetOriginalSourceDuration,
  readAssetOriginalSourceOut,
  readAssetParentAssetId,
  readAssetSourceOffset,
} from '../../lib/editor/subclip';
import type { EditorAsset, EditorProject } from '../../lib/editor/types';
import type { MediaCacheJobView } from './editor-view-model';

export type MediaCacheQueueScope = 'filtered' | 'preflight' | 'preview' | 'selected';

export interface MediaCacheJobEntry {
  assetId: string;
  job: MediaCacheJobView;
}

export interface MediaCachePollingState {
  activeEntries: MediaCacheJobEntry[];
  shouldPoll: boolean;
  intervalMs: number;
}

export interface MediaCacheProgressSummary {
  activeEntries: MediaCacheJobEntry[];
  activeCount: number;
  queuedCount: number;
  runningCount: number;
  averageProgress: number;
  label: string;
}

export function resolveActiveMediaCacheEntries(
  jobsByAssetId: Record<string, MediaCacheJobView>,
): MediaCacheJobEntry[] {
  return Object.entries(jobsByAssetId)
    .filter(([, job]) => job.status === 'queued' || job.status === 'running')
    .map(([assetId, job]) => ({ assetId, job }));
}

export function resolveMediaCachePollingState(
  jobsByAssetId: Record<string, MediaCacheJobView>,
  intervalMs = 1500,
): MediaCachePollingState {
  const activeEntries = resolveActiveMediaCacheEntries(jobsByAssetId);

  return {
    activeEntries,
    shouldPoll: activeEntries.length > 0,
    intervalMs,
  };
}

export function resolveMediaCacheProgressSummary(
  jobsByAssetId: Record<string, MediaCacheJobView>,
  targetAssetIds: Iterable<string>,
): MediaCacheProgressSummary {
  const targetIds = new Set(Array.from(targetAssetIds).filter(Boolean));
  const activeEntries = resolveActiveMediaCacheEntries(jobsByAssetId)
    .filter((entry) => targetIds.has(entry.assetId));
  const activeCount = activeEntries.length;
  const queuedCount = activeEntries.filter((entry) => entry.job.status === 'queued').length;
  const runningCount = activeEntries.filter((entry) => entry.job.status === 'running').length;
  const averageProgress = activeCount > 0
    ? Math.round(activeEntries.reduce((total, entry) => total + normalizeJobProgressPercent(entry.job.progress), 0) / activeCount)
    : 0;

  return {
    activeEntries,
    activeCount,
    queuedCount,
    runningCount,
    averageProgress,
    label: formatMediaCacheProgressLabel({ activeCount, queuedCount, runningCount, averageProgress }),
  };
}

export function mergeMediaCacheJobsByAssetId(
  current: Record<string, MediaCacheJobView>,
  entries: MediaCacheJobEntry[],
): Record<string, MediaCacheJobView> {
  return {
    ...current,
    ...Object.fromEntries(entries.map((entry) => [entry.assetId, entry.job])),
  };
}

export function applyQueuedMediaCacheJobsToProject(
  project: EditorProject,
  entries: MediaCacheJobEntry[],
): EditorProject {
  if (entries.length === 0) {
    return project;
  }

  const jobByAssetId = new Map(entries.map((entry) => [entry.assetId, entry.job]));

  return {
    ...project,
    assets: project.assets.map((asset) => {
      const job = jobByAssetId.get(asset.id);
      if (!job) {
        return asset;
      }

      return {
        ...asset,
        metadata: {
          ...asset.metadata,
          cached: false,
          cacheJobId: job.id,
        },
      };
    }),
  };
}

export function applyCompletedMediaCacheJobsToProject({
  project,
  entries,
  updatedAt,
}: {
  project: EditorProject;
  entries: MediaCacheJobEntry[];
  updatedAt: string;
}): EditorProject {
  if (entries.length === 0) {
    return project;
  }

  const completedByAssetId = new Map(entries.map((entry) => [entry.assetId, entry.job]));

  const directAssets = project.assets.map((asset) => {
    const completed = completedByAssetId.get(asset.id);
    if (!completed) {
      return asset;
    }

    if (completed.status === 'failed') {
      return {
        ...asset,
        metadata: {
          ...asset.metadata,
          cached: false,
          cacheWarning: completed.error ?? completed.warnings[0] ?? 'media cache failed',
        },
      };
    }

    if (completed.status !== 'completed' || !completed.manifest) {
      return asset;
    }

    return {
      ...asset,
      mediaCache: completed.manifest,
      metadata: {
        ...asset.metadata,
        cached: completed.manifest.warnings.length === 0,
        cacheWarning: completed.manifest.warnings[0],
      },
    };
  });
  const assetById = new Map(directAssets.map((asset) => [asset.id, asset]));

  return {
    ...project,
    assets: directAssets.map((asset) => applyParentCacheToSubclip(asset, assetById)),
    updatedAt,
  };
}

function applyParentCacheToSubclip(
  asset: EditorAsset,
  assetById: Map<string, EditorAsset>,
): EditorAsset {
  if (!isMediaSubclipAsset(asset)) {
    return asset;
  }

  const parentAssetId = readAssetParentAssetId(asset);
  const parentAsset = parentAssetId ? assetById.get(parentAssetId) : undefined;
  if (!parentAsset?.mediaCache) {
    return asset;
  }

  const sourceIn = readAssetSourceOffset(asset);
  const sourceOut = readAssetOriginalSourceOut(asset) ?? sourceIn + asset.duration;
  const parentDuration = readAssetOriginalSourceDuration(asset) ?? parentAsset.duration;
  const mediaCache = buildSubclipMediaCache(parentAsset.mediaCache, parentDuration, sourceIn, sourceOut);
  if (!mediaCache) {
    return asset;
  }

  return {
    ...asset,
    mediaCache,
  };
}

export function resolveCompletedMediaCacheStatus(
  entries: MediaCacheJobEntry[],
  assetById: Map<string, EditorAsset>,
): string | undefined {
  const latestCompleted = entries.find((entry) => entry.job.status === 'completed');
  return latestCompleted
    ? `Media cache ready for ${assetById.get(latestCompleted.assetId)?.name ?? 'asset'}`
    : undefined;
}

export function resolveMediaCacheQueueEmptyStatus(
  scope: MediaCacheQueueScope,
  plan: MediaCacheBatchPlan,
): string {
  if (scope === 'filtered') {
    return plan.skipped.length > 0
      ? `No cacheable filtered assets; ${plan.skipped.length} skipped`
      : 'No filtered assets to cache';
  }

  if (scope === 'preview') {
    return plan.skipped.length > 0
      ? `No cacheable preview assets; ${plan.skipped.length} skipped`
      : 'No active preview assets to cache';
  }

  if (scope === 'selected') {
    return plan.skipped.length > 0
      ? `No cacheable selected media; ${plan.skipped.length} skipped`
      : 'Select a media clip to cache';
  }

  return plan.skipped.length > 0
    ? `No cacheable preflight assets; ${plan.skipped.length} skipped`
    : 'No preflight cache warnings to queue';
}

export function resolveMediaCacheQueueResultStatus({
  scope,
  queuedCount,
  skippedCount,
  failures,
}: {
  scope: MediaCacheQueueScope;
  queuedCount: number;
  skippedCount: number;
  failures: string[];
}): string {
  const title = scope === 'filtered'
    ? 'Filtered'
    : scope === 'preview'
      ? 'Preview'
      : scope === 'selected'
        ? 'Selected'
        : 'Preflight';
  if (queuedCount === 0) {
    return `${title} cache queue failed: ${failures[0] ?? 'no jobs queued'}`;
  }

  const skippedText = skippedCount > 0 ? `, ${skippedCount} skipped` : '';
  const failedText = failures.length > 0 ? `, ${failures.length} failed` : '';
  return `Queued cache for ${queuedCount} ${scope} asset${queuedCount === 1 ? '' : 's'}${skippedText}${failedText}`;
}

export function resolveMediaCacheRebuildQueuedStatus(asset: EditorAsset): string {
  return `Cache rebuild queued for ${asset.name}`;
}

export function resolveMediaCacheFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function resolveMediaCacheAssetQueueFailure(asset: EditorAsset, error: unknown): string {
  return `${asset.name}: ${resolveMediaCacheFailureMessage(error)}`;
}

export function resolveMediaCacheRebuildFailureStatus(error: unknown): string {
  return `Cache rebuild failed: ${resolveMediaCacheFailureMessage(error)}`;
}

export function resolveMediaCacheCancelStatus(): string {
  return 'Media cache job cancelled';
}

export function resolveMediaCacheCancelFailureStatus(error: unknown): string {
  return `Cache cancel failed: ${resolveMediaCacheFailureMessage(error)}`;
}

export function resolveMediaCacheRetryStatus(): string {
  return 'Media cache retry queued';
}

export function resolveMediaCacheRetryFailureStatus(error: unknown): string {
  return `Cache retry failed: ${resolveMediaCacheFailureMessage(error)}`;
}

function normalizeJobProgressPercent(progress: number): number {
  const value = Number.isFinite(progress) ? progress : 0;
  const normalized = value > 0 && value <= 1 ? value * 100 : value;
  return Math.round(Math.min(100, Math.max(0, normalized)));
}

function formatMediaCacheProgressLabel({
  activeCount,
  queuedCount,
  runningCount,
  averageProgress,
}: Pick<MediaCacheProgressSummary, 'activeCount' | 'queuedCount' | 'runningCount' | 'averageProgress'>): string {
  if (activeCount === 0) {
    return 'No active cache jobs';
  }

  const runningText = runningCount > 0 ? `${runningCount} running` : '';
  const queuedText = queuedCount > 0 ? `${queuedCount} queued` : '';
  const stateText = [runningText, queuedText].filter(Boolean).join(' / ');
  return `${stateText} / ${averageProgress}%`;
}
