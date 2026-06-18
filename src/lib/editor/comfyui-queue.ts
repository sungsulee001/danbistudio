import { randomUUID } from 'crypto';
import { buildComfyUIAutomationPlan } from './automation';
import { buildGeneratePayloads, type GenerateApiPayload } from './comfyui-bridge';
import { createInitialComfyUIResults, type ComfyUIResultReference } from './comfyui-results';
import { getPersistedJob, listPersistedJobs, savePersistedJob } from '../../server/editor/job-store';
import { createMediaCache } from './media-cache';
import { analyzeMediaFile } from '../../server/editor/media-analyzer';
import { getEditorQueueSettings, normalizeJobPriority } from './queue-settings';
import { inferSupportedMediaMimeType } from './media-file-support';
import type { AutomationPlan, EditorProject } from './types';
import { comfyuiClient } from '../comfyui-client';
import { extractOutputPath, getComfyUIOutputPath, saveResultFile } from '../result-handler';
import { injectParameters, loadWorkflow } from '../workflow-loader';

export type ComfyUIQueueJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ComfyUIQueueJobSnapshot {
  id: string;
  projectId: string;
  status: ComfyUIQueueJobStatus;
  progress: number;
  priority: number;
  modelName: string;
  execute: boolean;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  promptIds: Record<string, string>;
  results: ComfyUIResultReference[];
  currentClipId?: string;
  error?: string;
  warnings: string[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  plan: AutomationPlan;
  payloads: GenerateApiPayload[];
}

interface ComfyUIQueueJobRecord extends ComfyUIQueueJobSnapshot {
  abortController?: AbortController;
}

export interface ComfyUIQueueJobOptions {
  priority?: number;
  execute?: boolean;
  modelName?: string;
}

const globalForComfyUIQueue = globalThis as unknown as {
  danbiComfyUIJobs?: Map<string, ComfyUIQueueJobRecord>;
  danbiComfyUIPending?: string[];
  danbiComfyUIRunningCount?: number;
};

const jobs = globalForComfyUIQueue.danbiComfyUIJobs ?? new Map<string, ComfyUIQueueJobRecord>();
const pending = globalForComfyUIQueue.danbiComfyUIPending ?? [];
globalForComfyUIQueue.danbiComfyUIJobs = jobs;
globalForComfyUIQueue.danbiComfyUIPending = pending;
globalForComfyUIQueue.danbiComfyUIRunningCount ??= 0;

export function createComfyUIQueueJob(
  project: EditorProject,
  selectedClipIds: string[] = [],
  options: ComfyUIQueueJobOptions = {},
): ComfyUIQueueJobSnapshot {
  const plan = buildComfyUIAutomationPlan(project, selectedClipIds);
  return createComfyUIQueueJobFromPlan(plan, options);
}

export function createComfyUIQueueJobFromPlan(
  plan: AutomationPlan,
  options: ComfyUIQueueJobOptions = {},
): ComfyUIQueueJobSnapshot {
  const modelName = options.modelName ?? 'wan_i2v';
  const payloads = buildGeneratePayloads(plan, modelName);
  if (plan.jobs.length === 0) {
    throw new Error('No ComfyUI-ready clips were found.');
  }

  const job: ComfyUIQueueJobRecord = {
    id: randomUUID(),
    projectId: plan.projectId,
    status: 'queued',
    progress: 0,
    priority: normalizeJobPriority(options.priority, getEditorQueueSettings().defaultComfyUIPriority),
    modelName,
    execute: options.execute ?? false,
    totalJobs: plan.jobs.length,
    completedJobs: 0,
    failedJobs: 0,
    promptIds: {},
    results: createInitialComfyUIResults(plan.jobs, options.execute === true ? 'queued' : 'prepared', modelName),
    warnings: [...plan.warnings],
    createdAt: new Date().toISOString(),
    plan,
    payloads,
  };

  jobs.set(job.id, job);
  enqueueJob(job.id);
  persistJob(job);
  pumpQueue();

  return snapshot(job);
}

export async function getComfyUIQueueJob(id: string): Promise<ComfyUIQueueJobSnapshot | undefined> {
  const job = jobs.get(id);
  if (job) {
    return snapshot(job);
  }

  const persisted = await getPersistedJob<ComfyUIQueueJobSnapshot>('comfyui', id);
  return persisted ? normalizeOrphanedJob(persisted) : undefined;
}

export async function listComfyUIQueueJobs(): Promise<ComfyUIQueueJobSnapshot[]> {
  const memorySnapshots = Array.from(jobs.values()).map(snapshot);
  const memoryIds = new Set(memorySnapshots.map((job) => job.id));
  const persistedSnapshots = (await listPersistedJobs<ComfyUIQueueJobSnapshot>('comfyui'))
    .filter((job) => !memoryIds.has(job.id))
    .map(normalizeOrphanedJob);

  return [
    ...memorySnapshots,
    ...persistedSnapshots,
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100);
}

export async function cancelComfyUIQueueJob(id: string): Promise<ComfyUIQueueJobSnapshot | undefined> {
  const job = jobs.get(id);
  if (!job) {
    const persisted = await getPersistedJob<ComfyUIQueueJobSnapshot>('comfyui', id);
    return persisted ? normalizeOrphanedJob(persisted) : undefined;
  }

  if (job.status === 'queued') {
    removePendingJob(id);
  }

  if (job.status === 'running') {
    job.abortController?.abort();
  }

  job.status = 'cancelled';
  job.progress = 100;
  job.completedAt = new Date().toISOString();
  persistJob(job);
  pumpQueue();
  return snapshot(job);
}

export async function retryComfyUIQueueJob(id: string, options: ComfyUIQueueJobOptions = {}): Promise<ComfyUIQueueJobSnapshot | undefined> {
  const source = await getComfyUIQueueJob(id);
  if (!source || source.status === 'queued' || source.status === 'running') {
    return undefined;
  }

  const job: ComfyUIQueueJobRecord = {
    ...source,
    id: randomUUID(),
    status: 'queued',
    progress: 0,
    priority: normalizeJobPriority(options.priority, source.priority),
    execute: options.execute ?? source.execute,
    modelName: options.modelName ?? source.modelName,
    completedJobs: 0,
    failedJobs: 0,
    promptIds: {},
    results: createInitialComfyUIResults(source.plan.jobs, options.execute ?? source.execute ? 'queued' : 'prepared', options.modelName ?? source.modelName),
    currentClipId: undefined,
    error: undefined,
    createdAt: new Date().toISOString(),
    startedAt: undefined,
    completedAt: undefined,
  };

  jobs.set(job.id, job);
  enqueueJob(job.id);
  persistJob(job);
  pumpQueue();

  return snapshot(job);
}

function pumpQueue(): void {
  const settings = getEditorQueueSettings();

  while ((globalForComfyUIQueue.danbiComfyUIRunningCount ?? 0) < settings.comfyuiConcurrency) {
    const nextId = takeNextPendingJob();
    if (!nextId) {
      return;
    }

    const job = jobs.get(nextId);
    if (!job || job.status !== 'queued') {
      continue;
    }

    globalForComfyUIQueue.danbiComfyUIRunningCount = (globalForComfyUIQueue.danbiComfyUIRunningCount ?? 0) + 1;
    void runJob(job).finally(() => {
      globalForComfyUIQueue.danbiComfyUIRunningCount = Math.max(
        0,
        (globalForComfyUIQueue.danbiComfyUIRunningCount ?? 1) - 1,
      );
      pumpQueue();
    });
  }
}

async function runJob(job: ComfyUIQueueJobRecord): Promise<void> {
  job.status = 'running';
  job.startedAt = new Date().toISOString();
  job.abortController = new AbortController();
  job.progress = 1;
  persistJob(job);

  try {
    for (let index = 0; index < job.plan.jobs.length; index += 1) {
      if (job.abortController.signal.aborted) {
        throw new Error('ComfyUI batch job cancelled.');
      }

      const automationJob = job.plan.jobs[index];
      const payload = job.payloads[index];
      const result = job.results.find((item) => item.automationJobId === automationJob.id);
      job.currentClipId = automationJob.clipId;

      if (job.execute) {
        const workflow = injectParameters(loadWorkflow(payload.workflowName), payload.parameters);
        const queued = await comfyuiClient.queuePrompt(workflow, `danbistudio-${job.id}`, {
          signal: job.abortController.signal,
        });
        job.promptIds[automationJob.id] = queued.prompt_id;
        if (result) {
          result.status = 'queued';
          result.promptId = queued.prompt_id;
        }
        persistJob(job);

        const promptStatus = await waitForPromptCompletion(queued.prompt_id, job.abortController.signal);
        if (promptStatus.status !== 'success') {
          if (result) {
            result.status = 'failed';
            result.error = `ComfyUI prompt ${queued.prompt_id} ended with ${promptStatus.status}.`;
          }
          throw new Error(`ComfyUI prompt ${queued.prompt_id} ended with ${promptStatus.status}.`);
        }

        const outputFilename = extractOutputPath(promptStatus.outputs);
        if (!outputFilename) {
          if (result) {
            result.status = 'failed';
            result.error = `ComfyUI prompt ${queued.prompt_id} completed without an output file.`;
          }
          throw new Error(`ComfyUI prompt ${queued.prompt_id} completed without an output file.`);
        }

        const savedResult = await saveResultFile(getComfyUIOutputPath(outputFilename), `${job.id}-${automationJob.id}`);
        if (result) {
          const mimeType = inferComfyUIQueueResultMimeType(savedResult.filename);
          result.status = 'completed';
          result.source = savedResult.savedPath;
          result.renderPath = savedResult.filePath;
          result.filename = savedResult.filename;
          result.mimeType = mimeType;
          await attachCompletedResultMetadata(result, savedResult.filePath, mimeType, job);
        }
      } else if (result) {
        result.status = 'prepared';
      }

      job.completedJobs += 1;
      job.progress = Math.round((job.completedJobs / job.totalJobs) * 100);
      persistJob(job);
    }

    job.status = 'completed';
    job.progress = 100;
    job.completedAt = new Date().toISOString();
  } catch (error) {
    job.status = job.abortController.signal.aborted ? 'cancelled' : 'failed';
    job.error = (error as Error).message;
    job.failedJobs = Math.max(1, job.totalJobs - job.completedJobs);
    job.progress = 100;
    job.completedAt = new Date().toISOString();
  } finally {
    persistJob(job);
  }
}

async function attachCompletedResultMetadata(
  result: ComfyUIResultReference,
  filePath: string,
  mimeType: string,
  job: ComfyUIQueueJobRecord,
): Promise<void> {
  const analysis = await analyzeMediaFile(filePath, mimeType);
  result.media = analysis;
  if (analysis.warnings.length > 0) {
    job.warnings.push(...analysis.warnings.map((warning) => `${result.clipId}: ${warning}`));
  }

  try {
    const mediaCache = await createMediaCache({
      filePath,
      mimeType,
      analysis,
      waveformSampleCount: 96,
      signal: job.abortController?.signal,
    });
    result.mediaCache = mediaCache;
    if (mediaCache.warnings.length > 0) {
      job.warnings.push(...mediaCache.warnings.map((warning) => `${result.clipId}: ${warning}`));
    }
  } catch (error) {
    job.warnings.push(`${result.clipId}: media cache failed: ${(error as Error).message}`);
  }
}

function enqueueJob(id: string): void {
  if (!pending.includes(id)) {
    pending.push(id);
  }
}

function removePendingJob(id: string): void {
  const index = pending.indexOf(id);
  if (index !== -1) {
    pending.splice(index, 1);
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

function snapshot(job: ComfyUIQueueJobRecord): ComfyUIQueueJobSnapshot {
  return {
    id: job.id,
    projectId: job.projectId,
    status: job.status,
    progress: job.progress,
    priority: job.priority,
    modelName: job.modelName,
    execute: job.execute,
    totalJobs: job.totalJobs,
    completedJobs: job.completedJobs,
    failedJobs: job.failedJobs,
    promptIds: { ...job.promptIds },
    results: normalizeResults(job).map((result) => ({ ...result })),
    currentClipId: job.currentClipId,
    error: job.error,
    warnings: [...job.warnings],
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    plan: job.plan,
    payloads: job.payloads,
  };
}

function normalizeOrphanedJob(job: ComfyUIQueueJobSnapshot): ComfyUIQueueJobSnapshot {
  const normalizedJob = {
    ...job,
    results: normalizeResults(job),
  };

  if (job.status === 'queued' || job.status === 'running') {
    return {
      ...normalizedJob,
      status: 'failed',
      progress: 100,
      error: 'ComfyUI queue job was interrupted while the server was offline.',
      completedAt: job.completedAt ?? new Date().toISOString(),
    };
  }

  return normalizedJob;
}

function persistJob(job: ComfyUIQueueJobRecord): void {
  void savePersistedJob('comfyui', snapshot(job)).catch(() => undefined);
}

function normalizeResults(job: Pick<ComfyUIQueueJobSnapshot, 'plan' | 'results' | 'modelName'>): ComfyUIResultReference[] {
  const defaults = createInitialComfyUIResults(job.plan.jobs, 'prepared', job.modelName);
  if (!Array.isArray(job.results)) {
    return defaults;
  }

  const defaultById = new Map(defaults.map((result) => [result.automationJobId, result]));
  return job.results.map((result) => ({
    ...defaultById.get(result.automationJobId),
    ...result,
    modelName: result.modelName ?? job.modelName,
    workflowName: result.workflowName ?? defaultById.get(result.automationJobId)?.workflowName,
    prompt: result.prompt ?? defaultById.get(result.automationJobId)?.prompt,
    negativePrompt: result.negativePrompt ?? defaultById.get(result.automationJobId)?.negativePrompt,
    seed: result.seed ?? defaultById.get(result.automationJobId)?.seed,
    parameters: result.parameters ?? defaultById.get(result.automationJobId)?.parameters,
  }));
}

async function waitForPromptCompletion(promptId: string, signal: AbortSignal): Promise<{ status: string; outputs?: unknown }> {
  let lastError: string | undefined;
  for (let attempt = 0; attempt < 360; attempt += 1) {
    if (signal.aborted) {
      throw new Error('ComfyUI batch job cancelled.');
    }

    try {
      const status = await comfyuiClient.getPromptStatus(promptId, { signal });
      if (status.status === 'success' || status.status === 'error') {
        return status;
      }
    } catch (error) {
      lastError = (error as Error).message;
    }

    await delay(1000, signal);
  }

  throw new Error(`Timed out waiting for ComfyUI prompt ${promptId}${lastError ? `: ${lastError}` : ''}.`);
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timeout);
      reject(new Error('ComfyUI batch job cancelled.'));
    }, { once: true });
  });
}

export function inferComfyUIQueueResultMimeType(filename: string): string {
  return inferSupportedMediaMimeType(filename);
}
