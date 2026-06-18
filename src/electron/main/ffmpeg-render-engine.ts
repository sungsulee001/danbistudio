import { spawn } from 'child_process';
import { mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import type { FfmpegCapabilities } from '../../lib/editor/ffmpeg-capabilities';
import { buildFfmpegRenderPlan, type FfmpegRenderPlan } from '../../lib/editor/ffmpeg-renderer';
import { buildRenderOutputFilename, validateRenderOutputPathSafety } from '../../lib/editor/render-output';
import { prepareFfmpegRenderPlanSidecarFiles } from '../../server/editor/render-sidecar-files';
import {
  getRenderPreflightBlockingMessage,
  type RenderPreflightReport,
} from '../../lib/editor/render-preflight';
import {
  cancelRenderJob,
  createRenderJob,
  getRenderJob,
  listRenderJobs,
  retryRenderJob,
  type RenderJobOptions,
  type RenderJobSnapshot,
} from '../../lib/editor/render-queue';
import type { EditorDirectRenderResponse, EditorExportRange, EditorRenderRequest } from '../shared/ipc-contract';
import { runExtensionRenderHooks } from '../shared/extension-api';
import type { EditorProject } from '../../lib/editor/types';
import { buildRenderPreflightReportWithOutputAccess } from '../../server/editor/render-output-access';
import { getOutputStorageRoot, toOutputSourcePath } from '../../server/output-storage';
import { applyFfmpegSetupToProcessEnv, discoverFfmpegSetup } from './ffmpeg-discovery';

export interface FfmpegEngineRequest extends EditorRenderRequest {
  capabilities?: FfmpegCapabilities;
}

export interface FfmpegEnginePreflightRequest extends FfmpegEngineRequest {
  sampleTimes?: number[];
}

export interface FfmpegEngineRetryRequest extends Partial<FfmpegEngineRequest> {
  priority?: number;
}

export async function buildFfmpegEnginePlan(request: FfmpegEngineRequest): Promise<FfmpegRenderPlan> {
  const capabilities = await resolveCapabilities(request.capabilities);

  return buildFfmpegRenderPlan(request.project, request.profileId, request.outputPath, {
    encoderPreference: request.encoderPreference ?? 'auto',
    capabilities,
    exportRange: request.exportRange,
  });
}

export async function buildFfmpegEnginePreflight(request: FfmpegEnginePreflightRequest): Promise<RenderPreflightReport> {
  const defaultOutput = request.outputPath ? undefined : await resolveRenderOutput(request.project, request.profileId);
  const outputPath = request.outputPath ?? defaultOutput?.outputPath;
  const plan = await buildFfmpegEnginePlan({
    ...request,
    outputPath,
  });

  return buildRenderPreflightReportWithOutputAccess(request.project, request.profileId, {
    exportRange: request.exportRange,
    outputPath,
    playhead: request.playhead,
    sampleTimes: request.sampleTimes,
    plan,
  });
}

export async function runFfmpegEngineRender(request: FfmpegEngineRequest): Promise<EditorDirectRenderResponse> {
  const defaultOutput = await resolveRenderOutput(request.project, request.profileId);
  const selectedOutputPath = request.outputPath ?? defaultOutput.outputPath;
  assertSafeMainRenderOutputPath(selectedOutputPath);
  const extensionHooks = runExtensionRenderHooks({
    project: request.project,
    profileId: request.profileId,
    outputPath: selectedOutputPath,
    outputFilename: request.outputFilename ?? defaultOutput.filename,
    encoderPreference: request.encoderPreference ?? 'auto',
    exportRange: request.exportRange,
  });

  const plan = await buildFfmpegEnginePlan({
    ...request,
    outputPath: selectedOutputPath,
  });
  const preflight = await buildRenderPreflightReportWithOutputAccess(request.project, request.profileId, {
    exportRange: request.exportRange,
    outputPath: selectedOutputPath,
    playhead: request.playhead,
    sampleTimes: request.sampleTimes,
    plan,
  });
  const blockingWarning = getRenderPreflightBlockingMessage(preflight);

  if (blockingWarning) {
    throw new Error(blockingWarning);
  }

  await mkdir(dirname(selectedOutputPath), { recursive: true });
  await prepareFfmpegRenderPlanSidecarFiles(plan);
  const result = await runFfmpegProcess(plan.command[0], plan.command.slice(1));

  return {
    status: 'completed',
    outputPath: request.outputPath ?? toOutputSourcePath(defaultOutput.filename),
    plan,
    preflight,
    extensionHooks,
    stderr: result.stderr.slice(-4000),
  };
}

export async function queueFfmpegEngineRender(request: FfmpegEngineRequest): Promise<RenderJobSnapshot> {
  const queueOutput = resolveQueuedRenderOutput(request.project, request.profileId, request.outputPath, request.outputFilename);
  assertSafeMainRenderOutputPath(queueOutput.outputPath);
  const extensionHooks = runExtensionRenderHooks({
    project: request.project,
    profileId: request.profileId,
    outputPath: queueOutput.outputPath,
    outputFilename: queueOutput.outputFilename,
    encoderPreference: request.encoderPreference ?? 'auto',
    exportRange: request.exportRange,
  });
  const options: RenderJobOptions = {
    priority: request.priority,
    outputPath: request.outputPath,
    outputFilename: queueOutput.outputFilename,
    encoderPreference: request.encoderPreference ?? 'auto',
    extensionHooks,
    exportRange: request.exportRange,
  };

  return createRenderJob(request.project, request.profileId, options);
}

export function listFfmpegEngineJobs(): Promise<RenderJobSnapshot[]> {
  return listRenderJobs();
}

export function getFfmpegEngineJob(id: string): Promise<RenderJobSnapshot | undefined> {
  return getRenderJob(id);
}

export function cancelFfmpegEngineJob(id: string): Promise<RenderJobSnapshot | undefined> {
  return cancelRenderJob(id);
}

export async function retryFfmpegEngineJob(id: string, options: FfmpegEngineRetryRequest = {}): Promise<RenderJobSnapshot | undefined> {
  if (options.project && options.profileId) {
    const sourceJob = await getRenderJob(id);
    if (!sourceJob || sourceJob.status === 'queued' || sourceJob.status === 'running') {
      return undefined;
    }

    const retryOutput = resolveRetryRenderOutput(sourceJob, options);
    return queueFfmpegEngineRender({
      project: options.project,
      profileId: options.profileId,
      outputPath: retryOutput.outputPath,
      outputFilename: retryOutput.outputFilename,
      priority: options.priority,
      encoderPreference: options.encoderPreference ?? 'auto',
      exportRange: options.exportRange,
      playhead: options.playhead,
      sampleTimes: options.sampleTimes,
    });
  }

  const retryOptions: RenderJobOptions = {
    priority: options.priority,
    outputPath: options.outputPath,
    outputFilename: options.outputFilename,
    encoderPreference: options.encoderPreference,
    exportRange: options.exportRange,
  };

  return retryRenderJob(id, retryOptions);
}

export function resolveRetryRenderOutput(
  sourceJob: RenderJobSnapshot,
  options: FfmpegEngineRetryRequest,
): Pick<FfmpegEngineRequest, 'outputPath' | 'outputFilename'> {
  if (options.outputFilename) {
    return {
      outputPath: options.outputPath,
      outputFilename: options.outputFilename,
    };
  }

  const publicOutputFilename = readPublicOutputsFilename(sourceJob.publicOutputPath);
  if (
    publicOutputFilename
    && (!options.outputPath || options.outputPath === sourceJob.outputPath)
  ) {
    return {
      outputFilename: publicOutputFilename,
    };
  }

  return {
    outputPath: options.outputPath ?? sourceJob.outputPath,
  };
}

function readPublicOutputsFilename(publicOutputPath: string | undefined): string | undefined {
  if (!publicOutputPath?.startsWith('/outputs/')) {
    return undefined;
  }

  const filename = publicOutputPath.slice('/outputs/'.length).split(/[\\/]/).filter(Boolean).at(-1);
  return filename && !filename.includes('\0') ? filename : undefined;
}

async function resolveCapabilities(capabilities?: FfmpegCapabilities): Promise<FfmpegCapabilities> {
  if (capabilities) {
    return capabilities;
  }

  const setup = await discoverFfmpegSetup({ includeCapabilities: true });
  applyFfmpegSetupToProcessEnv(setup);
  return setup.capabilities ?? {
    ffmpegPath: setup.ffmpegPath ?? 'ffmpeg',
    detectedAt: setup.checkedAt,
    encoders: [],
    hardwareEncoders: [],
    warnings: setup.warnings,
  };
}

async function resolveRenderOutput(project: EditorProject, profileId: string): Promise<{ filename: string; outputPath: string }> {
  const outputDir = getOutputStorageRoot();
  await mkdir(outputDir, { recursive: true });

  const filename = buildRenderOutputFilename(project, profileId);
  return {
    filename,
    outputPath: join(outputDir, filename),
  };
}

function resolveQueuedRenderOutput(
  project: EditorProject,
  profileId: string,
  outputPath?: string,
  requestedOutputFilename?: string,
): { outputFilename?: string; outputPath: string } {
  const outputFilename = requestedOutputFilename ?? (outputPath ? undefined : buildRenderOutputFilename(project, profileId));

  return {
    outputFilename,
    outputPath: outputPath ?? join(getOutputStorageRoot(), outputFilename ?? buildRenderOutputFilename(project, profileId)),
  };
}

function assertSafeMainRenderOutputPath(outputPath: string): void {
  const safetyIssue = validateRenderOutputPathSafety(outputPath);
  if (safetyIssue) {
    throw new Error(`${safetyIssue.message} ${safetyIssue.action}`);
  }
}

function runFfmpegProcess(command: string, args: string[]): Promise<{ stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
    });
    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-4000);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stderr });
        return;
      }

      reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

export type { EditorExportRange };
