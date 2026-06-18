import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FfmpegRenderPlan } from '../../lib/editor/ffmpeg-renderer';
import type { RenderPreflightReport } from '../../lib/editor/render-preflight';
import type { ExtensionRenderHookRunResult } from '../../lib/editor/extension-runtime-types';
import type { EditorProject } from '../../lib/editor/types';
import {
  RENDER_WORKER_HANDOFF_KIND,
  RENDER_WORKER_HANDOFF_SCHEMA_VERSION,
  type RenderWorkerHandoffCommand,
  type RenderWorkerHandoffJob,
  type RenderWorkerHandoffManifest,
} from '../shared/render-worker-contract';
import type { HeadlessRenderRequest } from './headless-render-engine';

export {
  RENDER_WORKER_HANDOFF_KIND,
  RENDER_WORKER_HANDOFF_SCHEMA_VERSION,
  type RenderWorkerHandoffCommand,
  type RenderWorkerHandoffJob,
  type RenderWorkerHandoffManifest,
} from '../shared/render-worker-contract';

export interface RenderWorkerHandoffJobInput {
  request: HeadlessRenderRequest;
  plan: FfmpegRenderPlan;
  preflight: RenderPreflightReport;
  extensionHooks?: ExtensionRenderHookRunResult;
}

export function buildRenderWorkerHandoffManifest({
  project,
  jobs,
  batchId,
  projectPath,
  createdAt = new Date().toISOString(),
  cwd = process.cwd(),
}: {
  project: EditorProject;
  jobs: RenderWorkerHandoffJobInput[];
  batchId: string;
  projectPath?: string;
  createdAt?: string;
  cwd?: string;
}): RenderWorkerHandoffManifest {
  const handoffJobs = jobs.map((job) => buildRenderWorkerHandoffJob({
    ...job,
    batchId,
    projectPath,
    cwd,
  }));
  const blockedJobs = handoffJobs.filter((job) => job.blocked).length;
  const warningJobs = handoffJobs.filter((job) => !job.blocked && job.warningCount > 0).length;

  return {
    schemaVersion: RENDER_WORKER_HANDOFF_SCHEMA_VERSION,
    kind: RENDER_WORKER_HANDOFF_KIND,
    createdAt,
    batchId,
    controller: {
      protocol: 'headless-render-v1',
      mode: 'local-network-handoff',
    },
    project: {
      id: project.id,
      name: project.name,
      schemaVersion: project.schemaVersion,
      duration: project.duration,
      fps: project.fps,
      width: project.width,
      height: project.height,
      ...(projectPath ? { projectPath } : {}),
    },
    summary: {
      totalJobs: handoffJobs.length,
      blockedJobs,
      warningJobs,
      readyJobs: handoffJobs.length - blockedJobs - warningJobs,
    },
    jobs: handoffJobs,
  };
}

export async function writeRenderWorkerHandoffManifest(
  manifest: RenderWorkerHandoffManifest,
  outputPath: string,
): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFileAtomically(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function buildRenderWorkerHandoffJob({
  request,
  plan,
  preflight,
  extensionHooks,
  batchId,
  projectPath,
  cwd,
}: RenderWorkerHandoffJobInput & {
  batchId: string;
  projectPath?: string;
  cwd: string;
}): RenderWorkerHandoffJob {
  return {
    id: `${sanitizeId(batchId)}-${sanitizeId(request.profileId)}`,
    profileId: request.profileId,
    profileLabel: request.profileLabel,
    outputFilename: request.outputFilename,
    outputPath: request.outputPath,
    encoderPreference: request.encoderPreference,
    ...(request.exportRange ? { exportRange: request.exportRange } : {}),
    preflightStatus: preflight.status,
    blocked: preflight.blockedCount > 0,
    warningCount: preflight.warningCount,
    blockedCount: preflight.blockedCount,
    issues: preflight.issues.map((issue) => ({
      severity: issue.severity,
      source: issue.source,
      message: issue.message,
      action: issue.action,
    })),
    commandText: plan.commandText,
    ffmpegCommand: plan.command,
    ...(projectPath ? { workerCommand: buildHeadlessWorkerCommand(request, projectPath, batchId, cwd) } : {}),
    ...(extensionHooks ? { extensionHooks } : {}),
  };
}

function buildHeadlessWorkerCommand(
  request: HeadlessRenderRequest,
  projectPath: string,
  batchId: string,
  cwd: string,
): RenderWorkerHandoffCommand {
  const args = [
    'run',
    'editor:headless-render',
    '--',
    '--project',
    projectPath,
    '--profile',
    request.profileId,
    '--out-dir',
    path.dirname(request.outputPath),
    '--batch-id',
    batchId,
    '--encoder',
    request.encoderPreference,
  ];

  if (request.exportRange) {
    args.push('--range', `${request.exportRange.start}:${request.exportRange.end}`);
  }

  return {
    executable: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args,
    cwd,
  };
}

function sanitizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'job';
}

async function writeFileAtomically(filePath: string, contents: string): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  try {
    await writeFile(tempPath, contents, 'utf8');
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
