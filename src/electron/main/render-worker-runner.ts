import { spawn } from 'node:child_process';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  RENDER_WORKER_HANDOFF_KIND,
  RENDER_WORKER_HANDOFF_SCHEMA_VERSION,
  RENDER_WORKER_RUN_REPORT_KIND,
  type RenderWorkerHandoffCommand,
  type RenderWorkerHandoffJob,
  type RenderWorkerHandoffManifest,
  type RenderWorkerJobReport,
  type RenderWorkerRunProgress,
  type RenderWorkerRunReport,
} from '../shared/render-worker-contract';

export interface RenderWorkerCliOptions {
  manifestPath?: string;
  reportPath?: string;
  jobIds: string[];
  workerId: string;
  dryRun: boolean;
  executeBlocked: boolean;
  help: boolean;
}

export type { RenderWorkerJobReport, RenderWorkerJobStatus, RenderWorkerRunReport } from '../shared/render-worker-contract';

export type RenderWorkerCommandExecutor = (command: RenderWorkerHandoffCommand) => Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>;

export type RenderWorkerProgressCallback = (progress: RenderWorkerRunProgress) => void | Promise<void>;

export function parseRenderWorkerCliArgs(argv: string[], cwd = process.cwd()): RenderWorkerCliOptions {
  const options: RenderWorkerCliOptions = {
    jobIds: [],
    workerId: `worker-${process.env.COMPUTERNAME || process.env.HOSTNAME || 'local'}`,
    dryRun: false,
    executeBlocked: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--manifest':
      case '-m':
        options.manifestPath = resolveCliPath(readRequiredValue(argv, index, arg), cwd);
        index += 1;
        break;
      case '--report':
      case '-r':
        options.reportPath = resolveCliPath(readRequiredValue(argv, index, arg), cwd);
        index += 1;
        break;
      case '--job':
        options.jobIds.push(...readRequiredValue(argv, index, arg).split(',').map((value) => value.trim()).filter(Boolean));
        index += 1;
        break;
      case '--worker-id':
        options.workerId = readRequiredValue(argv, index, arg).trim() || options.workerId;
        index += 1;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--execute-blocked':
        options.executeBlocked = true;
        break;
      default:
        throw new Error(`Unknown render worker argument: ${arg}`);
    }
  }

  return options;
}

export function formatRenderWorkerHelp(): string {
  return [
    'Usage: npm run editor:render-worker -- --manifest <handoff.json> [options]',
    '',
    'Options:',
    '  --manifest <path>      Render worker handoff manifest to claim.',
    '  --report <path>        Write a JSON run report. Defaults to stdout only.',
    '  --job <id[,id]>        Run only selected handoff job ids.',
    '  --worker-id <id>       Worker identifier for the report.',
    '  --dry-run              Validate and report planned worker commands without executing.',
    '  --execute-blocked      Execute jobs even when handoff preflight is blocked.',
  ].join('\n');
}

export async function loadRenderWorkerHandoffManifest(manifestPath: string): Promise<RenderWorkerHandoffManifest> {
  const text = await readFile(manifestPath, 'utf8');
  return parseRenderWorkerHandoffManifest(text);
}

export function parseRenderWorkerHandoffManifest(text: string): RenderWorkerHandoffManifest {
  const data = JSON.parse(text) as Partial<RenderWorkerHandoffManifest>;

  if (data.kind !== RENDER_WORKER_HANDOFF_KIND || data.schemaVersion !== RENDER_WORKER_HANDOFF_SCHEMA_VERSION) {
    throw new Error('Invalid Danbi render worker handoff manifest.');
  }

  if (!Array.isArray(data.jobs)) {
    throw new Error('Render worker handoff manifest is missing jobs.');
  }

  return data as RenderWorkerHandoffManifest;
}

export async function runRenderWorkerHandoffManifest({
  manifest,
  workerId,
  jobIds = [],
  dryRun = false,
  executeBlocked = false,
  now = () => new Date().toISOString(),
  executeCommand = executeRenderWorkerCommand,
  onProgress,
}: {
  manifest: RenderWorkerHandoffManifest;
  workerId: string;
  jobIds?: string[];
  dryRun?: boolean;
  executeBlocked?: boolean;
  now?: () => string;
  executeCommand?: RenderWorkerCommandExecutor;
  onProgress?: RenderWorkerProgressCallback;
}): Promise<RenderWorkerRunReport> {
  const startedAt = now();
  const selectedIds = new Set(jobIds);
  const reports: RenderWorkerJobReport[] = [];

  await publishRenderWorkerProgress({ manifest, reports, now, onProgress });

  for (const job of manifest.jobs) {
    if (selectedIds.size > 0 && !selectedIds.has(job.id)) {
      reports.push(buildSkippedJobReport(job, 'Job not selected.'));
      await publishRenderWorkerProgress({ manifest, reports, now, onProgress });
      continue;
    }

    if (job.blocked && !executeBlocked) {
      reports.push(buildBlockedJobReport(job));
      await publishRenderWorkerProgress({ manifest, reports, now, onProgress });
      continue;
    }

    if (dryRun) {
      reports.push(buildPlannedJobReport(job));
      await publishRenderWorkerProgress({ manifest, reports, now, onProgress });
      continue;
    }

    const runningJob = buildRunningJobReport(job, now());
    await publishRenderWorkerProgress({ manifest, reports, currentJob: runningJob, now, onProgress });
    reports.push(await executeRenderWorkerJob(job, runningJob.startedAt ?? now(), now, executeCommand));
    await publishRenderWorkerProgress({ manifest, reports, now, onProgress });
  }

  const finishedAt = now();

  return {
    schemaVersion: 1,
    kind: RENDER_WORKER_RUN_REPORT_KIND,
    workerId,
    sourceManifestKind: manifest.kind,
    sourceBatchId: manifest.batchId,
    dryRun,
    startedAt,
    finishedAt,
    summary: {
      totalJobs: reports.length,
      plannedJobs: reports.filter((job) => job.status === 'planned').length,
      completedJobs: reports.filter((job) => job.status === 'completed').length,
      blockedJobs: reports.filter((job) => job.status === 'blocked').length,
      skippedJobs: reports.filter((job) => job.status === 'skipped').length,
      failedJobs: reports.filter((job) => job.status === 'failed').length,
    },
    jobs: reports,
  };
}

export async function writeRenderWorkerRunReport(report: RenderWorkerRunReport, reportPath: string): Promise<void> {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFileAtomically(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

export function formatRenderWorkerRunReport(report: RenderWorkerRunReport): string {
  return [
    report.dryRun ? 'Render worker dry-run completed.' : 'Render worker run completed.',
    `- worker: ${report.workerId}`,
    `- jobs: ${report.summary.totalJobs}`,
    `- planned: ${report.summary.plannedJobs}`,
    `- completed: ${report.summary.completedJobs}`,
    `- blocked: ${report.summary.blockedJobs}`,
    `- skipped: ${report.summary.skippedJobs}`,
    `- failed: ${report.summary.failedJobs}`,
  ].join('\n');
}

async function executeRenderWorkerJob(
  job: RenderWorkerHandoffJob,
  startedAt: string,
  now: () => string,
  executeCommand: RenderWorkerCommandExecutor,
): Promise<RenderWorkerJobReport> {
  if (!job.workerCommand) {
    return {
      ...buildBaseJobReport(job),
      status: 'failed',
      error: 'Handoff job has no workerCommand.',
    };
  }

  try {
    const result = await executeCommand(job.workerCommand);
    const finishedAt = now();
    return {
      ...buildBaseJobReport(job),
      status: result.exitCode === 0 ? 'completed' : 'failed',
      startedAt,
      finishedAt,
      exitCode: result.exitCode,
      stdoutTail: tailText(result.stdout),
      stderrTail: tailText(result.stderr),
      ...(result.exitCode === 0 ? {} : { error: `Worker command exited with code ${result.exitCode}.` }),
    };
  } catch (error) {
    return {
      ...buildBaseJobReport(job),
      status: 'failed',
      startedAt,
      finishedAt: now(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function executeRenderWorkerCommand(command: RenderWorkerHandoffCommand): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command.executable, command.args, {
      cwd: command.cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout = `${stdout}${chunk.toString()}`.slice(-4000);
    });
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-4000);
    });
    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
      });
    });
  });
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

function buildBaseJobReport(job: RenderWorkerHandoffJob): Omit<RenderWorkerJobReport, 'status'> {
  return {
    jobId: job.id,
    profileId: job.profileId,
    profileLabel: job.profileLabel,
    outputPath: job.outputPath,
    commandText: job.workerCommand
      ? `${job.workerCommand.executable} ${job.workerCommand.args.join(' ')}`
      : job.commandText,
  };
}

function buildPlannedJobReport(job: RenderWorkerHandoffJob): RenderWorkerJobReport {
  return {
    ...buildBaseJobReport(job),
    status: 'planned',
  };
}

function buildRunningJobReport(job: RenderWorkerHandoffJob, startedAt: string): RenderWorkerJobReport {
  return {
    ...buildBaseJobReport(job),
    status: 'running',
    startedAt,
  };
}

function buildBlockedJobReport(job: RenderWorkerHandoffJob): RenderWorkerJobReport {
  return {
    ...buildBaseJobReport(job),
    status: 'blocked',
    error: job.issues[0] ? `${job.issues[0].message} ${job.issues[0].action}` : 'Preflight blocked this job.',
  };
}

async function publishRenderWorkerProgress({
  manifest,
  reports,
  currentJob,
  now,
  onProgress,
}: {
  manifest: RenderWorkerHandoffManifest;
  reports: RenderWorkerJobReport[];
  currentJob?: RenderWorkerJobReport;
  now: () => string;
  onProgress?: RenderWorkerProgressCallback;
}): Promise<void> {
  if (!onProgress) {
    return;
  }

  await onProgress(buildRenderWorkerProgressSnapshot({
    totalJobs: manifest.jobs.length,
    reports,
    currentJob,
    updatedAt: now(),
  }));
}

function buildRenderWorkerProgressSnapshot({
  totalJobs,
  reports,
  currentJob,
  updatedAt,
}: {
  totalJobs: number;
  reports: RenderWorkerJobReport[];
  currentJob?: RenderWorkerJobReport;
  updatedAt: string;
}): RenderWorkerRunProgress {
  const jobs = currentJob ? [...reports, currentJob] : [...reports];
  const completedCount = reports.length;

  return {
    updatedAt,
    totalJobs,
    pendingJobs: Math.max(0, totalJobs - completedCount - (currentJob ? 1 : 0)),
    runningJobs: jobs.filter((job) => job.status === 'running').length,
    plannedJobs: jobs.filter((job) => job.status === 'planned').length,
    completedJobs: jobs.filter((job) => job.status === 'completed').length,
    blockedJobs: jobs.filter((job) => job.status === 'blocked').length,
    skippedJobs: jobs.filter((job) => job.status === 'skipped').length,
    failedJobs: jobs.filter((job) => job.status === 'failed').length,
    jobs,
  };
}

function buildSkippedJobReport(job: RenderWorkerHandoffJob, reason: string): RenderWorkerJobReport {
  return {
    ...buildBaseJobReport(job),
    status: 'skipped',
    error: reason,
  };
}

function tailText(value: string, maxLength = 4000): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.slice(-maxLength);
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
