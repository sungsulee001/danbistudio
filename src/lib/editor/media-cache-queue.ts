import { randomUUID } from 'crypto';
import { createMediaCache, type MediaCacheOptions } from './media-cache';
import { clearTerminalPersistedJobs, getPersistedJob, listPersistedJobs, savePersistedJob } from '../../server/editor/job-store';
import type { MediaAnalysis } from './media-analyzer';
import { getEditorQueueSettings, normalizeJobPriority } from './queue-settings';
import type { MediaCacheManifest } from './types';

export type MediaCacheJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface MediaCacheJobInput {
  filePath: string;
  source: string;
  mimeType: string;
  originalName: string;
  analysis: MediaAnalysis;
}

export interface MediaCacheJobSnapshot {
  id: string;
  status: MediaCacheJobStatus;
  progress: number;
  priority: number;
  source: string;
  originalName: string;
  mimeType: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  manifest?: MediaCacheManifest;
  error?: string;
  warnings: string[];
  input?: MediaCacheJobInput;
}

interface MediaCacheJobRecord extends MediaCacheJobSnapshot {
  input: MediaCacheJobInput;
  abortController?: AbortController;
}

export interface MediaCacheJobOptions {
  priority?: number;
}

const globalForMediaCacheQueue = globalThis as unknown as {
  danbiMediaCacheJobs?: Map<string, MediaCacheJobRecord>;
  danbiMediaCachePending?: string[];
  danbiMediaCacheRunningCount?: number;
};

const jobs = globalForMediaCacheQueue.danbiMediaCacheJobs ?? new Map<string, MediaCacheJobRecord>();
const pending = globalForMediaCacheQueue.danbiMediaCachePending ?? [];
globalForMediaCacheQueue.danbiMediaCacheJobs = jobs;
globalForMediaCacheQueue.danbiMediaCachePending = pending;
globalForMediaCacheQueue.danbiMediaCacheRunningCount ??= 0;

export function createMediaCacheJob(input: MediaCacheJobInput, options: MediaCacheJobOptions = {}): MediaCacheJobSnapshot {
  const job: MediaCacheJobRecord = {
    id: randomUUID(),
    status: 'queued',
    progress: 0,
    priority: normalizeJobPriority(options.priority, getEditorQueueSettings().defaultMediaCachePriority),
    source: input.source,
    originalName: input.originalName,
    mimeType: input.mimeType,
    createdAt: new Date().toISOString(),
    warnings: [],
    input,
  };

  jobs.set(job.id, job);
  pending.push(job.id);
  persistJob(job);
  pumpQueue();

  return snapshot(job);
}

export async function getMediaCacheJob(id: string): Promise<MediaCacheJobSnapshot | undefined> {
  const job = jobs.get(id);
  if (job) {
    return snapshot(job);
  }

  const persisted = await getPersistedJob<MediaCacheJobSnapshot>('media-cache', id);
  return persisted ? normalizeOrphanedJob(persisted) : undefined;
}

export async function listMediaCacheJobs(): Promise<MediaCacheJobSnapshot[]> {
  const memorySnapshots = Array.from(jobs.values()).map(snapshot);
  const memoryIds = new Set(memorySnapshots.map((job) => job.id));
  const persistedSnapshots = (await listPersistedJobs<MediaCacheJobSnapshot>('media-cache'))
    .filter((job) => !memoryIds.has(job.id))
    .map(normalizeOrphanedJob);

  return [
    ...memorySnapshots,
    ...persistedSnapshots,
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100);
}

export async function clearCompletedMediaCacheJobs(): Promise<number> {
  let deleted = 0;
  for (const [id, job] of jobs.entries()) {
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      jobs.delete(id);
      deleted += 1;
    }
  }

  return deleted + await clearTerminalPersistedJobs('media-cache');
}

export async function cancelMediaCacheJob(id: string): Promise<MediaCacheJobSnapshot | undefined> {
  const job = jobs.get(id);
  if (!job) {
    const persisted = await getPersistedJob<MediaCacheJobSnapshot>('media-cache', id);
    return persisted ? normalizeOrphanedJob(persisted) : undefined;
  }

  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
    return snapshot(job);
  }

  if (job.status === 'queued') {
    const pendingIndex = pending.indexOf(id);
    if (pendingIndex !== -1) {
      pending.splice(pendingIndex, 1);
    }
  }

  if (job.status === 'running') {
    job.abortController?.abort();
  }

  job.status = 'cancelled';
  job.progress = 100;
  job.completedAt = new Date().toISOString();
  job.warnings = ['Media cache job cancelled.'];
  persistJob(job);
  pumpQueue();
  return snapshot(job);
}

export async function retryMediaCacheJob(id: string, options: MediaCacheJobOptions = {}): Promise<MediaCacheJobSnapshot | undefined> {
  const sourceJob = jobs.get(id) ?? await readPersistedRecordAsJob(id);
  if (!sourceJob) {
    return undefined;
  }

  return createMediaCacheJob(sourceJob.input, { priority: options.priority ?? sourceJob.priority });
}

function pumpQueue(): void {
  const settings = getEditorQueueSettings();

  while ((globalForMediaCacheQueue.danbiMediaCacheRunningCount ?? 0) < settings.mediaCacheConcurrency) {
    const nextId = takeNextPendingJob();
    if (!nextId) {
      return;
    }

    const job = jobs.get(nextId);
    if (!job || job.status !== 'queued') {
      continue;
    }

    globalForMediaCacheQueue.danbiMediaCacheRunningCount = (globalForMediaCacheQueue.danbiMediaCacheRunningCount ?? 0) + 1;
    void runJob(job).finally(() => {
      globalForMediaCacheQueue.danbiMediaCacheRunningCount = Math.max(
        0,
        (globalForMediaCacheQueue.danbiMediaCacheRunningCount ?? 1) - 1,
      );
      pumpQueue();
    });
  }
}

function takeNextPendingJob(): string | undefined {
  pending.sort((leftId, rightId) => {
    const left = jobs.get(leftId);
    const right = jobs.get(rightId);
    if (!left || !right) {
      return left ? -1 : 1;
    }

    if (left.priority !== right.priority) {
      return right.priority - left.priority;
    }

    return left.createdAt.localeCompare(right.createdAt);
  });

  return pending.shift();
}

async function runJob(job: MediaCacheJobRecord): Promise<void> {
  job.status = 'running';
  job.progress = 5;
  job.startedAt = new Date().toISOString();
  job.abortController = new AbortController();
  persistJob(job);

  try {
    const options: MediaCacheOptions = {
      filePath: job.input.filePath,
      mimeType: job.input.mimeType,
      analysis: job.input.analysis,
      signal: job.abortController.signal,
    };
    const manifest = await createMediaCache(options);

    if (isCancelled(job)) {
      persistJob(job);
      return;
    }

    job.status = 'completed';
    job.progress = 100;
    job.completedAt = new Date().toISOString();
    job.manifest = manifest;
    job.warnings = manifest.warnings;
    persistJob(job);
  } catch (error) {
    if (isCancelled(job) || job.abortController.signal.aborted) {
      job.status = 'cancelled';
      job.progress = 100;
      job.completedAt = new Date().toISOString();
      job.error = undefined;
      job.warnings = ['Media cache job cancelled.'];
      persistJob(job);
      return;
    }

    job.status = 'failed';
    job.progress = 100;
    job.completedAt = new Date().toISOString();
    job.error = (error as Error).message;
    job.warnings = [job.error];
    persistJob(job);
  }
}

function isCancelled(job: MediaCacheJobRecord): boolean {
  return job.status === 'cancelled';
}

function snapshot(job: MediaCacheJobRecord): MediaCacheJobSnapshot {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    priority: job.priority,
    source: job.source,
    originalName: job.originalName,
    mimeType: job.mimeType,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    manifest: job.manifest,
    error: job.error,
    warnings: job.warnings,
    input: job.input,
  };
}

function persistJob(job: MediaCacheJobRecord): void {
  void savePersistedJob('media-cache', snapshot(job)).catch(() => undefined);
}

function normalizeOrphanedJob(job: MediaCacheJobSnapshot): MediaCacheJobSnapshot {
  const normalizedJob = {
    ...job,
    priority: normalizeJobPriority(job.priority, getEditorQueueSettings().defaultMediaCachePriority),
    warnings: job.warnings ?? [],
  };

  if (normalizedJob.status !== 'queued' && normalizedJob.status !== 'running') {
    return normalizedJob;
  }

  return {
    ...normalizedJob,
    status: 'failed',
    progress: 100,
    completedAt: normalizedJob.completedAt ?? new Date().toISOString(),
    error: normalizedJob.error ?? 'Media cache job was interrupted by an app restart.',
    warnings: normalizedJob.warnings.length > 0 ? normalizedJob.warnings : ['Media cache job was interrupted by an app restart.'],
  };
}

async function readPersistedRecordAsJob(id: string): Promise<MediaCacheJobRecord | undefined> {
  const persisted = await getPersistedJob<MediaCacheJobSnapshot>('media-cache', id);
  if (!persisted?.input) {
    return undefined;
  }

  return {
    ...persisted,
    priority: normalizeJobPriority(persisted.priority, getEditorQueueSettings().defaultMediaCachePriority),
    warnings: persisted.warnings ?? [],
    input: persisted.input,
  };
}
