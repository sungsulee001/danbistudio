import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { deserializeProjectPackage } from '../../lib/editor/project-store';
import { buildBatchRenderOutputFilename } from '../../lib/editor/render-output';
import { getRenderPreflightBlockingMessage } from '../../lib/editor/render-preflight';
import type { ExtensionRenderHookRunResult } from '../../lib/editor/extension-runtime-types';
import { buildRenderPreflightReportWithOutputAccess } from '../../server/editor/render-output-access';
import { getOutputStorageRoot } from '../../server/output-storage';
import { parseProjectJson } from '../shared/project-schema';
import type { EditorProject } from '../../lib/editor/types';
import { buildFfmpegEnginePlan, runFfmpegEngineRender } from './ffmpeg-render-engine';
import { runExtensionRenderHooks } from '../shared/extension-api';
import {
  buildRenderWorkerHandoffManifest,
  writeRenderWorkerHandoffManifest,
  type RenderWorkerHandoffManifest,
} from './render-worker-handoff';

export type HeadlessExportRange = { start: number; end: number } | undefined;

export interface HeadlessRenderCliOptions {
  projectPath?: string;
  profileIds: string[];
  allProfiles: boolean;
  outputDir: string;
  batchId: string;
  exportRange?: HeadlessExportRange;
  encoderPreference: string;
  dryRun: boolean;
  handoffPath?: string;
  help: boolean;
}

export interface HeadlessRenderRequest {
  project: EditorProject;
  profileId: string;
  profileLabel: string;
  outputFilename: string;
  outputPath: string;
  encoderPreference: string;
  exportRange?: HeadlessExportRange;
}

export interface HeadlessRenderResult {
  profileId: string;
  profileLabel: string;
  outputPath: string;
  status: 'planned' | 'completed';
  preflightStatus: string;
  commandText: string;
  extensionHooks?: ExtensionRenderHookRunResult;
  stderr?: string;
}

export interface HeadlessRenderBatchResult {
  dryRun: boolean;
  results: HeadlessRenderResult[];
}

export function parseHeadlessRenderCliArgs(argv: string[], cwd = process.cwd()): HeadlessRenderCliOptions {
  const options: HeadlessRenderCliOptions = {
    profileIds: [],
    allProfiles: false,
    outputDir: getDefaultHeadlessOutputDir(),
    batchId: String(Date.now()),
    encoderPreference: 'auto',
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--project':
      case '-p':
        options.projectPath = resolveCliPath(readRequiredValue(argv, index, arg), cwd);
        index += 1;
        break;
      case '--profile':
        options.profileIds.push(...readRequiredValue(argv, index, arg).split(',').map((value) => value.trim()).filter(Boolean));
        index += 1;
        break;
      case '--all-profiles':
        options.allProfiles = true;
        break;
      case '--out-dir':
      case '-o':
        options.outputDir = resolveCliPath(readRequiredValue(argv, index, arg), cwd);
        index += 1;
        break;
      case '--batch-id':
        options.batchId = readRequiredValue(argv, index, arg).trim() || options.batchId;
        index += 1;
        break;
      case '--range':
        options.exportRange = parseHeadlessExportRange(readRequiredValue(argv, index, arg));
        index += 1;
        break;
      case '--encoder':
        options.encoderPreference = readRequiredValue(argv, index, arg).trim() || 'auto';
        index += 1;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--handoff':
      case '--handoff-manifest':
        options.handoffPath = resolveCliPath(readRequiredValue(argv, index, arg), cwd);
        index += 1;
        break;
      default:
        throw new Error(`Unknown headless render argument: ${arg}`);
    }
  }

  return options;
}

export function formatHeadlessRenderHelp(): string {
  return [
    'Usage: npm run editor:headless-render -- --project <project.json> [options]',
    '',
    'Options:',
    '  --profile <id[,id]>     Render one or more export profiles. Defaults to the first profile.',
    '  --all-profiles          Render every profile in the project.',
    '  --out-dir <path>        Output directory. Defaults to local output storage.',
    '  --batch-id <id>         Stable suffix used in output filenames.',
    '  --range <start:end>     Render only a marked range in seconds.',
    '  --encoder <value>       auto, software, or explicit FFmpeg encoder.',
    '  --dry-run               Build plans and run preflight without writing video files.',
    '  --handoff <path>        Write a local network render worker handoff manifest instead of rendering.',
  ].join('\n');
}

export async function loadHeadlessRenderProject(projectPath: string): Promise<EditorProject> {
  const data = await readFile(projectPath, 'utf8');

  try {
    return parseProjectJson(data);
  } catch (rawProjectError) {
    try {
      return deserializeProjectPackage(data, {
        rewriteBundledMedia: true,
        packageRoot: path.dirname(projectPath),
      }).project;
    } catch {
      throw rawProjectError;
    }
  }
}

export function buildHeadlessRenderRequests({
  project,
  profileIds,
  allProfiles = false,
  outputDir = getDefaultHeadlessOutputDir(),
  batchId = String(Date.now()),
  exportRange,
  encoderPreference = 'auto',
}: {
  project: EditorProject;
  profileIds?: string[];
  allProfiles?: boolean;
  outputDir?: string;
  batchId?: string | number;
  exportRange?: HeadlessExportRange;
  encoderPreference?: string;
}): HeadlessRenderRequest[] {
  const selectedProfileIds = resolveHeadlessRenderProfileIds(project, {
    profileIds: profileIds ?? [],
    allProfiles,
  });

  return selectedProfileIds.map((profileId) => {
    const profile = project.exportProfiles.find((candidate) => candidate.id === profileId);
    if (!profile) {
      throw new Error(`Export profile not found: ${profileId}`);
    }

    const outputFilename = buildBatchRenderOutputFilename(project, profileId, batchId);

    return {
      project,
      profileId,
      profileLabel: profile.label,
      outputFilename,
      outputPath: path.join(outputDir, outputFilename),
      encoderPreference,
      ...(exportRange ? { exportRange } : {}),
    };
  });
}

export function getDefaultHeadlessOutputDir(): string {
  return getOutputStorageRoot();
}

export async function runHeadlessRenderBatch({
  requests,
  dryRun = false,
}: {
  requests: HeadlessRenderRequest[];
  dryRun?: boolean;
}): Promise<HeadlessRenderBatchResult> {
  const results: HeadlessRenderResult[] = [];

  for (const request of requests) {
    const plan = await buildFfmpegEnginePlan({
      project: request.project,
      profileId: request.profileId,
      outputPath: request.outputPath,
      encoderPreference: request.encoderPreference,
      exportRange: request.exportRange,
    });
    const preflight = await buildRenderPreflightReportWithOutputAccess(request.project, request.profileId, {
      exportRange: request.exportRange,
      outputPath: request.outputPath,
      plan,
    });
    const blockingMessage = getRenderPreflightBlockingMessage(preflight);

    if (blockingMessage) {
      throw new Error(`Headless render blocked for ${request.profileLabel}: ${blockingMessage}`);
    }

    if (dryRun) {
      const extensionHooks = runExtensionRenderHooks({
        project: request.project,
        profileId: request.profileId,
        outputPath: request.outputPath,
        outputFilename: request.outputFilename,
        encoderPreference: request.encoderPreference,
        exportRange: request.exportRange,
        dryRun: true,
      });

      results.push({
        profileId: request.profileId,
        profileLabel: request.profileLabel,
        outputPath: request.outputPath,
        status: 'planned',
        preflightStatus: preflight.status,
        commandText: plan.commandText,
        extensionHooks,
      });
      continue;
    }

    const response = await runFfmpegEngineRender({
      project: request.project,
      profileId: request.profileId,
      outputPath: request.outputPath,
      encoderPreference: request.encoderPreference,
      exportRange: request.exportRange,
    });

    results.push({
      profileId: request.profileId,
      profileLabel: request.profileLabel,
      outputPath: response.outputPath,
      status: 'completed',
      preflightStatus: response.preflight.status,
      commandText: response.plan.commandText,
      extensionHooks: response.extensionHooks,
      stderr: response.stderr,
    });
  }

  return {
    dryRun,
    results,
  };
}

export async function buildHeadlessRenderHandoffManifest({
  project,
  requests,
  projectPath,
  batchId,
  createdAt,
}: {
  project: EditorProject;
  requests: HeadlessRenderRequest[];
  projectPath?: string;
  batchId: string;
  createdAt?: string;
}): Promise<RenderWorkerHandoffManifest> {
  const jobs = [];

  for (const request of requests) {
    const plan = await buildFfmpegEnginePlan({
      project: request.project,
      profileId: request.profileId,
      outputPath: request.outputPath,
      encoderPreference: request.encoderPreference,
      exportRange: request.exportRange,
    });
    const preflight = await buildRenderPreflightReportWithOutputAccess(request.project, request.profileId, {
      exportRange: request.exportRange,
      outputPath: request.outputPath,
      plan,
    });
    const extensionHooks = runExtensionRenderHooks({
      project: request.project,
      profileId: request.profileId,
      outputPath: request.outputPath,
      outputFilename: request.outputFilename,
      encoderPreference: request.encoderPreference,
      exportRange: request.exportRange,
      dryRun: true,
    });

    jobs.push({
      request,
      plan,
      preflight,
      extensionHooks,
    });
  }

  return buildRenderWorkerHandoffManifest({
    project,
    jobs,
    batchId,
    projectPath,
    createdAt,
  });
}

export async function writeHeadlessRenderHandoffManifest({
  manifest,
  outputPath,
}: {
  manifest: RenderWorkerHandoffManifest;
  outputPath: string;
}): Promise<void> {
  await writeRenderWorkerHandoffManifest(manifest, outputPath);
}

export function formatHeadlessRenderHandoffResult(manifest: RenderWorkerHandoffManifest, outputPath: string): string {
  return [
    `Render worker handoff written: ${outputPath}`,
    `- jobs: ${manifest.summary.totalJobs}`,
    `- ready: ${manifest.summary.readyJobs}`,
    `- warnings: ${manifest.summary.warningJobs}`,
    `- blocked: ${manifest.summary.blockedJobs}`,
  ].join('\n');
}

export function formatHeadlessRenderBatchResult(result: HeadlessRenderBatchResult): string {
  const lines = [
    result.dryRun ? 'Headless render dry-run completed.' : 'Headless render completed.',
  ];

  for (const item of result.results) {
    lines.push(`- ${item.profileLabel}: ${item.status} -> ${item.outputPath} (${item.preflightStatus})`);
  }

  return lines.join('\n');
}

export function resolveHeadlessRenderProfileIds(
  project: EditorProject,
  { profileIds, allProfiles = false }: { profileIds: string[]; allProfiles?: boolean },
): string[] {
  if (allProfiles) {
    return project.exportProfiles.map((profile) => profile.id);
  }

  const validIds = new Set(project.exportProfiles.map((profile) => profile.id));
  const uniqueIds = profileIds.filter((profileId, index, ids) => ids.indexOf(profileId) === index);
  const missingIds = uniqueIds.filter((profileId) => !validIds.has(profileId));

  if (missingIds.length > 0) {
    throw new Error(`Unknown export profile${missingIds.length === 1 ? '' : 's'}: ${missingIds.join(', ')}`);
  }

  return uniqueIds.length > 0
    ? uniqueIds
    : project.exportProfiles[0]
      ? [project.exportProfiles[0].id]
      : [];
}

function parseHeadlessExportRange(value: string): HeadlessExportRange {
  const [startText, endText] = value.split(/[:,-]/);
  const start = Number(startText);
  const end = Number(endText);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error(`Invalid export range: ${value}. Use start:end seconds.`);
  }

  return { start, end };
}

function readRequiredValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('-')) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}

function resolveCliPath(value: string, cwd: string): string {
  return path.isAbsolute(value) ? value : path.resolve(cwd, value);
}
