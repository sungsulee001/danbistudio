import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { randomUUID } from 'crypto';
import { mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { buildFfmpegRenderPlan, type FfmpegRenderPlan } from './ffmpeg-renderer';
import { detectFfmpegCapabilities, type FfmpegEncoderPreference } from './ffmpeg-capabilities';
import { getPersistedJob, listPersistedJobs, savePersistedJob } from '../../server/editor/job-store';
import { getEditorQueueSettings, normalizeJobPriority } from './queue-settings';
import { analyzeRenderFailure, type RenderFailureDiagnostic } from './render-diagnostics';
import { getRenderPreflightBlockingMessage } from './render-preflight';
import { buildRenderOutputFilename } from './render-output';
import { prepareFfmpegRenderPlanSidecarFiles } from '../../server/editor/render-sidecar-files';
import { buildRenderPreflightReportWithOutputAccess } from '../../server/editor/render-output-access';
import { getOutputStorageRoot, toOutputSourcePath } from '../../server/output-storage';
import type { ExtensionRenderHookRunResult } from './extension-runtime-types';
import type { EditorProject } from './types';

export type RenderJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface RenderJobSnapshot {
  id: string;
  projectId: string;
  status: RenderJobStatus;
  progress: number;
  priority: number;
  outputPath?: string;
  publicOutputPath?: string;
  error?: string;
  diagnostic?: RenderFailureDiagnostic;
  extensionHooks?: ExtensionRenderHookRunResult;
  stderrTail: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  plan: FfmpegRenderPlan;
}

interface RenderJobRecord extends RenderJobSnapshot {
  process?: ChildProcessWithoutNullStreams;
}

export interface RenderJobOptions {
  priority?: number;
  outputPath?: string;
  outputFilename?: string;
  encoderPreference?: FfmpegEncoderPreference;
  extensionHooks?: ExtensionRenderHookRunResult;
  exportRange?: {
    start: number;
    end: number;
  };
}

const globalForRenderQueue = globalThis as unknown as {
  danbiRenderJobs?: Map<string, RenderJobRecord>;
  danbiRenderPending?: string[];
};

const jobs = globalForRenderQueue.danbiRenderJobs ?? new Map<string, RenderJobRecord>();
const pending = globalForRenderQueue.danbiRenderPending ?? [];
globalForRenderQueue.danbiRenderJobs = jobs;
globalForRenderQueue.danbiRenderPending = pending;

export async function createRenderJob(project: EditorProject, profileId: string, options: RenderJobOptions = {}): Promise<RenderJobSnapshot> {
  const outputDir = getOutputStorageRoot();
  await mkdir(outputDir, { recursive: true });

  const filename = options.outputFilename ?? buildRenderOutputFilename(project, profileId);
  const outputPath = options.outputPath ?? join(outputDir, filename);
  const capabilities = await detectFfmpegCapabilities();
  const plan = buildFfmpegRenderPlan(project, profileId, outputPath, {
    encoderPreference: options.encoderPreference ?? 'auto',
    capabilities,
    exportRange: options.exportRange,
  });
  const preflight = await buildRenderPreflightReportWithOutputAccess(project, profileId, {
    exportRange: options.exportRange,
    outputPath,
    plan,
  });
  const blockingWarning = getRenderPreflightBlockingMessage(preflight);

  if (blockingWarning) {
    throw new Error(blockingWarning);
  }

  await mkdir(dirname(outputPath), { recursive: true });
  const job: RenderJobRecord = {
    id: randomUUID(),
    projectId: project.id,
    status: 'queued',
    progress: 0,
    priority: normalizeJobPriority(options.priority, getEditorQueueSettings().defaultRenderPriority),
    outputPath,
    publicOutputPath: options.outputPath ? undefined : toOutputSourcePath(filename),
    extensionHooks: options.extensionHooks,
    stderrTail: '',
    createdAt: new Date().toISOString(),
    plan,
  };

  jobs.set(job.id, job);
  enqueueRenderJob(job.id);
  persistRenderJob(job);
  pumpRenderQueue();

  return snapshot(job);
}

export async function getRenderJob(id: string): Promise<RenderJobSnapshot | undefined> {
  const job = jobs.get(id);
  if (job) {
    return snapshot(job);
  }

  const persisted = await getPersistedJob<RenderJobSnapshot>('render', id);
  return persisted ? normalizeOrphanedRenderJob(persisted) : undefined;
}

export async function listRenderJobs(): Promise<RenderJobSnapshot[]> {
  const memorySnapshots = Array.from(jobs.values()).map(snapshot);
  const memoryIds = new Set(memorySnapshots.map((job) => job.id));
  const persistedSnapshots = (await listPersistedJobs<RenderJobSnapshot>('render'))
    .filter((job) => !memoryIds.has(job.id))
    .map(normalizeOrphanedRenderJob);

  return [
    ...memorySnapshots,
    ...persistedSnapshots,
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100);
}

export async function cancelRenderJob(id: string): Promise<RenderJobSnapshot | undefined> {
  const job = jobs.get(id);
  if (!job) {
    const persisted = await getPersistedJob<RenderJobSnapshot>('render', id);
    return persisted ? normalizeOrphanedRenderJob(persisted) : undefined;
  }

  if (job.process && job.status === 'running') {
    job.process.kill('SIGTERM');
  }

  if (job.status === 'queued') {
    removePendingRenderJob(id);
  }

  job.status = 'cancelled';
  job.progress = 100;
  job.completedAt = new Date().toISOString();
  persistRenderJob(job);
  pumpRenderQueue();
  return snapshot(job);
}

export async function retryRenderJob(id: string, options: RenderJobOptions = {}): Promise<RenderJobSnapshot | undefined> {
  const source = await getRenderJob(id);
  if (!source || source.status === 'queued' || source.status === 'running') {
    return undefined;
  }

  const job: RenderJobRecord = {
    id: randomUUID(),
    projectId: source.projectId,
    status: 'queued',
    progress: 0,
    priority: normalizeJobPriority(options.priority, source.priority),
    outputPath: source.outputPath,
    publicOutputPath: source.publicOutputPath,
    extensionHooks: source.extensionHooks,
    stderrTail: '',
    createdAt: new Date().toISOString(),
    plan: source.plan,
  };

  jobs.set(job.id, job);
  enqueueRenderJob(job.id);
  persistRenderJob(job);
  pumpRenderQueue();

  return snapshot(job);
}

function enqueueRenderJob(id: string): void {
  if (!pending.includes(id)) {
    pending.push(id);
  }
}

function removePendingRenderJob(id: string): void {
  const index = pending.indexOf(id);
  if (index !== -1) {
    pending.splice(index, 1);
  }
}

function pumpRenderQueue(): void {
  const settings = getEditorQueueSettings();

  while (countRunningRenderJobs() < settings.renderConcurrency) {
    const nextId = takeNextPendingRenderJob();
    if (!nextId) {
      return;
    }

    const job = jobs.get(nextId);
    if (!job || job.status !== 'queued') {
      continue;
    }

    startRenderJob(job);
  }
}

function countRunningRenderJobs(): number {
  return Array.from(jobs.values()).filter((job) => job.status === 'running').length;
}

function takeNextPendingRenderJob(): string | undefined {
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

function startRenderJob(job: RenderJobRecord): void {
  job.status = 'running';
  job.startedAt = new Date().toISOString();
  persistRenderJob(job);

  void prepareFfmpegRenderPlanSidecarFiles(job.plan)
    .then(() => {
      if (job.status === 'cancelled') {
        pumpRenderQueue();
        return;
      }

      spawnRenderJobProcess(job);
    })
    .catch((error: Error) => {
      if (job.status === 'cancelled') {
        pumpRenderQueue();
        return;
      }

      job.status = 'failed';
      job.error = error.message;
      job.stderrTail = error.message;
      job.completedAt = new Date().toISOString();
      persistRenderJob(job);
      pumpRenderQueue();
    });
}

function spawnRenderJobProcess(job: RenderJobRecord): void {
  const child = spawn(job.plan.command[0], job.plan.command.slice(1), {
    windowsHide: true,
  });
  job.process = child;

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    job.stderrTail = `${job.stderrTail}${text}`.slice(-4000);
    const renderedSeconds = parseRenderedSeconds(text);
    if (renderedSeconds !== null) {
      job.progress = Math.max(job.progress, Math.min(99, Math.round((renderedSeconds / getPlanDuration(job.plan)) * 100)));
      persistRenderJob(job);
    }
  });

  child.on('error', (error) => {
    if (job.status === 'cancelled') {
      pumpRenderQueue();
      return;
    }

    job.status = 'failed';
    job.error = error.message;
    job.completedAt = new Date().toISOString();
    persistRenderJob(job);
    pumpRenderQueue();
  });

  child.on('close', (code) => {
    if (job.status === 'cancelled') {
      pumpRenderQueue();
      return;
    }

    if (code === 0) {
      job.status = 'completed';
      job.progress = 100;
      job.completedAt = new Date().toISOString();
      persistRenderJob(job);
      pumpRenderQueue();
      return;
    }

    job.status = 'failed';
    job.error = `FFmpeg exited with code ${code}`;
    job.completedAt = new Date().toISOString();
    persistRenderJob(job);
    pumpRenderQueue();
  });
}

function snapshot(job: RenderJobRecord): RenderJobSnapshot {
  return {
    id: job.id,
    projectId: job.projectId,
    status: job.status,
    progress: job.progress,
    priority: job.priority,
    outputPath: job.outputPath,
    publicOutputPath: job.publicOutputPath,
    error: job.error,
    diagnostic: job.status === 'failed' || job.status === 'cancelled'
      ? analyzeRenderFailure(job.plan, job.stderrTail, job.error)
      : undefined,
    extensionHooks: job.extensionHooks,
    stderrTail: job.stderrTail,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    plan: job.plan,
  };
}

function parseRenderedSeconds(text: string): number | null {
  const matches = Array.from(text.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g));
  const match = matches[matches.length - 1];
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  return hours * 3600 + minutes * 60 + seconds;
}

function getPlanDuration(plan: FfmpegRenderPlan): number {
  const visualDuration = plan.inputs
    .filter((input) => input.kind !== 'audio')
    .reduce((total, input) => total + input.durationSeconds, 0);

  if (visualDuration > 0) {
    return visualDuration;
  }

  return Math.max(
    1,
    plan.inputs.reduce((total, input) => Math.max(total, input.durationSeconds), 0),
  );
}


function persistRenderJob(job: RenderJobRecord): void {
  void savePersistedJob('render', snapshot(job)).catch(() => undefined);
}

function normalizeOrphanedRenderJob(job: RenderJobSnapshot): RenderJobSnapshot {
  const normalizedJob = {
    ...job,
    priority: normalizeJobPriority(job.priority, getEditorQueueSettings().defaultRenderPriority),
  };

  if (normalizedJob.status !== 'queued' && normalizedJob.status !== 'running') {
    return normalizedJob;
  }

  return {
    ...normalizedJob,
    status: 'failed',
    progress: 100,
    completedAt: normalizedJob.completedAt ?? new Date().toISOString(),
    error: normalizedJob.error ?? 'Render job was interrupted by an app restart.',
    stderrTail: normalizedJob.stderrTail || 'Render job was interrupted by an app restart.',
  };
}
