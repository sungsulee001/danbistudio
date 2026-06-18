import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const EXTERNAL_EXPORTER_HANDOFF_KIND = 'danbi.external-exporter.handoff';
export const EXTERNAL_EXPORTER_OUTPUT_MANIFEST_KIND = 'danbi.external-exporter.output-manifest';
export const EXTERNAL_EXPORTER_RUN_REPORT_KIND = 'danbi.external-exporter-run-report';

const SAFE_EXPORT_PATH_SEGMENT = /^[a-z0-9._-]+$/i;
const DEFAULT_EXTERNAL_EXPORTER_TIMEOUT_MS = 60_000;
const MAX_WRITER_OUTPUT_BYTES = 1024 * 1024;

export interface ExternalExporterCliOptions {
  handoffPath?: string;
  rootDirectory?: string;
  reportPath?: string;
  profileIds: string[];
  workerId: string;
  dryRun: boolean;
  writerExecutable?: string;
  writerArgs: string[];
  writerCwd?: string;
  timeoutMs: number;
  help: boolean;
}

export interface ExternalExporterWriterCommand {
  executable: string;
  args: string[];
  cwd: string;
}

export interface ExternalExporterHandoffEntry {
  profileId: string;
  status: 'written' | 'skipped' | 'blocked';
  outputPath?: string;
  manifestPath?: string;
  reason?: string;
}

export interface ExternalExporterDeclaredWriter {
  writerId: string;
  label: string;
  executable: string;
  args: string[];
  cwd?: string | null;
  trust: 'trusted' | 'prompt' | 'blocked';
  status: 'trusted' | 'approval-required' | 'blocked';
  runtimePackage?: ExternalExporterDeclaredWriterRuntimePackage | null;
  packageStatus?: 'packaged' | 'not-packaged';
  timeoutMs?: number | null;
}

export interface ExternalExporterDeclaredWriterRuntimePackageFile {
  path: string;
  sha256?: string | null;
  bytes?: number | null;
}

export interface ExternalExporterDeclaredWriterRuntimePackage {
  packageId: string;
  runtime: 'native' | 'node';
  root: string;
  entry: string;
  packagedAt?: string | null;
  files: ExternalExporterDeclaredWriterRuntimePackageFile[];
}

export interface ExternalExporterHandoffManifest {
  kind: typeof EXTERNAL_EXPORTER_HANDOFF_KIND;
  version: 1;
  command: string;
  pluginId: string;
  project: Record<string, unknown>;
  exporterWriters: ExternalExporterDeclaredWriter[];
  entries: ExternalExporterHandoffEntry[];
  warnings?: string[];
}

export type ExternalExporterJobStatus = 'planned' | 'completed' | 'blocked' | 'skipped' | 'failed';

export interface ExternalExporterJobReport {
  profileId: string;
  outputPath?: string;
  manifestPath?: string;
  status: ExternalExporterJobStatus;
  commandText?: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
  stdoutTail?: string;
  stderrTail?: string;
  outputBytes?: number;
  error?: string;
}

export interface ExternalExporterRunReport {
  version: 1;
  kind: typeof EXTERNAL_EXPORTER_RUN_REPORT_KIND;
  workerId: string;
  pluginId: string;
  sourceManifestKind: string;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  summary: {
    totalJobs: number;
    plannedJobs: number;
    completedJobs: number;
    blockedJobs: number;
    skippedJobs: number;
    failedJobs: number;
  };
  jobs: ExternalExporterJobReport[];
  warnings: string[];
}

export type ExternalExporterCommandExecutor = (command: ExternalExporterWriterCommand, timeoutMs: number) => Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>;

export function parseExternalExporterCliArgs(argv: string[], cwd = process.cwd()): ExternalExporterCliOptions {
  const options: ExternalExporterCliOptions = {
    profileIds: [],
    workerId: `external-exporter-${process.env.COMPUTERNAME || process.env.HOSTNAME || 'local'}`,
    dryRun: false,
    writerArgs: [],
    timeoutMs: DEFAULT_EXTERNAL_EXPORTER_TIMEOUT_MS,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--handoff':
      case '--manifest':
      case '-m':
        options.handoffPath = resolveCliPath(readRequiredValue(argv, index, arg), cwd);
        index += 1;
        break;
      case '--root':
        options.rootDirectory = resolveCliPath(readRequiredValue(argv, index, arg), cwd);
        index += 1;
        break;
      case '--report':
      case '-r':
        options.reportPath = resolveCliPath(readRequiredValue(argv, index, arg), cwd);
        index += 1;
        break;
      case '--profile':
        options.profileIds.push(...readRequiredValue(argv, index, arg).split(',').map((value) => value.trim()).filter(Boolean));
        index += 1;
        break;
      case '--worker-id':
        options.workerId = readRequiredValue(argv, index, arg).trim() || options.workerId;
        index += 1;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--writer':
        options.writerExecutable = readRequiredValue(argv, index, arg);
        index += 1;
        break;
      case '--writer-arg':
        options.writerArgs.push(readRequiredAnyValue(argv, index, arg));
        index += 1;
        break;
      case '--writer-cwd':
        options.writerCwd = resolveCliPath(readRequiredValue(argv, index, arg), cwd);
        index += 1;
        break;
      case '--timeout-ms':
        options.timeoutMs = readPositiveInteger(readRequiredValue(argv, index, arg), DEFAULT_EXTERNAL_EXPORTER_TIMEOUT_MS);
        index += 1;
        break;
      default:
        throw new Error(`Unknown external exporter argument: ${arg}`);
    }
  }

  options.profileIds = Array.from(new Set(options.profileIds));
  return options;
}

export function formatExternalExporterHelp(): string {
  return [
    'Usage: npm run editor:external-exporter -- --handoff <danbi-external-export-handoff.json> [options]',
    '',
    'Options:',
    '  --handoff <path>       Reviewed external exporter batch handoff JSON.',
    '  --root <path>          Root directory that contains the exports/ folder. Defaults to inferred handoff root.',
    '  --report <path>        Write a JSON run report.',
    '  --profile <id[,id]>    Run only selected profile ids.',
    '  --worker-id <id>       Worker identifier for the report.',
    '  --dry-run              Validate handoff and planned writer commands without executing.',
    '  --writer <executable>  External writer executable for non-dry-run execution.',
    '  --writer-arg <value>   Writer arg. Tokens: {manifest}, {output}, {profileId}, {pluginId}, {handoff}.',
    '  --writer-cwd <path>    Writer working directory. Defaults to --root.',
    '  --timeout-ms <ms>      Per-profile writer timeout. Defaults to 60000.',
  ].join('\n');
}

export async function loadExternalExporterHandoffManifest(handoffPath: string): Promise<ExternalExporterHandoffManifest> {
  return parseExternalExporterHandoffManifest(await readFile(handoffPath, 'utf8'));
}

export function parseExternalExporterHandoffManifest(text: string): ExternalExporterHandoffManifest {
  const data = JSON.parse(text) as unknown;
  if (!isRecord(data) || data.kind !== EXTERNAL_EXPORTER_HANDOFF_KIND || data.version !== 1) {
    throw new Error('Invalid Danbi external exporter handoff manifest.');
  }
  if (typeof data.pluginId !== 'string' || !data.pluginId.trim()) {
    throw new Error('External exporter handoff manifest is missing pluginId.');
  }
  if (!Array.isArray(data.entries)) {
    throw new Error('External exporter handoff manifest is missing entries.');
  }

  return {
    kind: EXTERNAL_EXPORTER_HANDOFF_KIND,
    version: 1,
    command: typeof data.command === 'string' ? data.command : '',
    pluginId: data.pluginId.trim(),
    project: isRecord(data.project) ? data.project : {},
    exporterWriters: Array.isArray(data.exporterWriters)
      ? data.exporterWriters.map(readDeclaredWriter).filter((writer): writer is ExternalExporterDeclaredWriter => Boolean(writer))
      : [],
    entries: data.entries.map(readHandoffEntry),
    warnings: Array.isArray(data.warnings)
      ? data.warnings.filter((warning): warning is string => typeof warning === 'string')
      : [],
  };
}

export async function runExternalExporterHandoffManifest({
  manifest,
  handoffPath,
  rootDirectory,
  workerId,
  profileIds = [],
  dryRun = false,
  writerCommand,
  timeoutMs = DEFAULT_EXTERNAL_EXPORTER_TIMEOUT_MS,
  executeCommand = executeExternalExporterCommand,
  now = () => new Date().toISOString(),
}: {
  manifest: ExternalExporterHandoffManifest;
  handoffPath?: string;
  rootDirectory?: string;
  workerId: string;
  profileIds?: string[];
  dryRun?: boolean;
  writerCommand?: ExternalExporterWriterCommand;
  timeoutMs?: number;
  executeCommand?: ExternalExporterCommandExecutor;
  now?: () => string;
}): Promise<ExternalExporterRunReport> {
  const startedAt = now();
  const root = path.resolve(rootDirectory ?? inferExternalExporterRootDirectory(handoffPath) ?? process.cwd());
  const selectedProfileIds = new Set(profileIds);
  const jobs: ExternalExporterJobReport[] = [];

  for (const entry of manifest.entries) {
    if (selectedProfileIds.size > 0 && !selectedProfileIds.has(entry.profileId)) {
      jobs.push({
        profileId: entry.profileId,
        outputPath: entry.outputPath,
        manifestPath: entry.manifestPath,
        status: 'skipped',
        error: 'Profile not selected.',
      });
      continue;
    }

    if (entry.status !== 'written') {
      jobs.push({
        profileId: entry.profileId,
        outputPath: entry.outputPath,
        manifestPath: entry.manifestPath,
        status: entry.status === 'blocked' ? 'blocked' : 'skipped',
        error: entry.reason ?? `Handoff entry status is ${entry.status}.`,
      });
      continue;
    }

    jobs.push(await runExternalExporterEntry({
      manifest,
      entry,
      root,
      handoffPath,
      dryRun,
      writerCommand,
      timeoutMs,
      executeCommand,
      now,
    }));
  }

  const finishedAt = now();
  return {
    version: 1,
    kind: EXTERNAL_EXPORTER_RUN_REPORT_KIND,
    workerId,
    pluginId: manifest.pluginId,
    sourceManifestKind: manifest.kind,
    dryRun,
    startedAt,
    finishedAt,
    summary: {
      totalJobs: jobs.length,
      plannedJobs: jobs.filter((job) => job.status === 'planned').length,
      completedJobs: jobs.filter((job) => job.status === 'completed').length,
      blockedJobs: jobs.filter((job) => job.status === 'blocked').length,
      skippedJobs: jobs.filter((job) => job.status === 'skipped').length,
      failedJobs: jobs.filter((job) => job.status === 'failed').length,
    },
    jobs,
    warnings: manifest.warnings ?? [],
  };
}

export async function writeExternalExporterRunReport(report: ExternalExporterRunReport, reportPath: string): Promise<void> {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFileAtomically(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

export function formatExternalExporterRunReport(report: ExternalExporterRunReport): string {
  return [
    report.dryRun ? 'External exporter dry-run completed.' : 'External exporter run completed.',
    `- worker: ${report.workerId}`,
    `- plugin: ${report.pluginId}`,
    `- jobs: ${report.summary.totalJobs}`,
    `- planned: ${report.summary.plannedJobs}`,
    `- completed: ${report.summary.completedJobs}`,
    `- blocked: ${report.summary.blockedJobs}`,
    `- skipped: ${report.summary.skippedJobs}`,
    `- failed: ${report.summary.failedJobs}`,
  ].join('\n');
}

export function buildExternalExporterWriterCommand({
  executable,
  args,
  cwd,
  profileId,
  pluginId,
  handoffPath,
  manifestPath,
  outputPath,
}: {
  executable: string;
  args: string[];
  cwd: string;
  profileId: string;
  pluginId: string;
  handoffPath?: string;
  manifestPath: string;
  outputPath: string;
}): ExternalExporterWriterCommand {
  const replacements: Record<string, string> = {
    '{manifest}': manifestPath,
    '{output}': outputPath,
    '{profileId}': profileId,
    '{pluginId}': pluginId,
    '{handoff}': handoffPath ?? '',
  };
  const expandedArgs = (args.length > 0 ? args : ['{manifest}', '{output}']).map((arg) => (
    Object.entries(replacements).reduce((next, [token, replacement]) => next.split(token).join(replacement), arg)
  ));

  return {
    executable,
    args: expandedArgs,
    cwd,
  };
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

async function runExternalExporterEntry({
  manifest,
  entry,
  root,
  handoffPath,
  dryRun,
  writerCommand,
  timeoutMs,
  executeCommand,
  now,
}: {
  manifest: ExternalExporterHandoffManifest;
  entry: ExternalExporterHandoffEntry;
  root: string;
  handoffPath?: string;
  dryRun: boolean;
  writerCommand?: ExternalExporterWriterCommand;
  timeoutMs: number;
  executeCommand: ExternalExporterCommandExecutor;
  now: () => string;
}): Promise<ExternalExporterJobReport> {
  if (!entry.outputPath || !entry.manifestPath) {
    return {
      profileId: entry.profileId,
      outputPath: entry.outputPath,
      manifestPath: entry.manifestPath,
      status: 'blocked',
      error: 'Written handoff entry must include outputPath and manifestPath.',
    };
  }

  try {
    const outputRelativePath = readSafeExporterRelativePath(entry.outputPath);
    const manifestRelativePath = readSafeExporterRelativePath(entry.manifestPath);
    const outputPath = resolveSafeRelativePath(root, outputRelativePath);
    const outputManifestPath = resolveSafeRelativePath(root, manifestRelativePath);
    const outputManifest = await loadExternalExporterOutputManifest(outputManifestPath);
    if (outputManifest.pluginId !== manifest.pluginId || outputManifest.profileId !== entry.profileId) {
      return {
        profileId: entry.profileId,
        outputPath: outputRelativePath,
        manifestPath: manifestRelativePath,
        status: 'blocked',
        error: 'Output manifest plugin/profile identity does not match the batch handoff entry.',
      };
    }
    if (outputManifest.outputPath !== outputRelativePath) {
      return {
        profileId: entry.profileId,
        outputPath: outputRelativePath,
        manifestPath: manifestRelativePath,
        status: 'blocked',
        error: 'Output manifest path does not match the batch handoff entry.',
      };
    }

    const declaredWriter = writerCommand ? undefined : selectTrustedDeclaredWriter(manifest);
    if (declaredWriter?.runtimePackage) {
      await validateDeclaredWriterRuntimePackage(root, declaredWriter);
    }
    const plannedCommand = writerCommand || declaredWriter
      ? buildExternalExporterWriterCommand({
          executable: writerCommand?.executable ?? resolveDeclaredWriterExecutable(root, declaredWriter?.executable ?? ''),
          args: writerCommand?.args ?? declaredWriter?.args ?? [],
          cwd: writerCommand?.cwd || resolveDeclaredWriterCwd(root, declaredWriter?.cwd ?? undefined),
          profileId: entry.profileId,
          pluginId: manifest.pluginId,
          handoffPath,
          manifestPath: outputManifestPath,
          outputPath,
        })
      : undefined;
    const effectiveTimeoutMs = writerCommand ? timeoutMs : declaredWriter?.timeoutMs ?? timeoutMs;
    const commandText = plannedCommand
      ? `${plannedCommand.executable} ${plannedCommand.args.join(' ')}`
      : undefined;

    if (dryRun) {
      return {
        profileId: entry.profileId,
        outputPath: outputRelativePath,
        manifestPath: manifestRelativePath,
        status: 'planned',
        commandText,
      };
    }

    if (!plannedCommand) {
      return {
        profileId: entry.profileId,
        outputPath: outputRelativePath,
        manifestPath: manifestRelativePath,
        status: 'blocked',
        error: 'External exporter execution requires --writer <executable> or a trusted packaged writer declaration.',
      };
    }

    await mkdir(path.dirname(outputPath), { recursive: true });
    const startedAt = now();
    const result = await executeCommand(plannedCommand, effectiveTimeoutMs);
    const finishedAt = now();
    const outputBytes = result.exitCode === 0 ? await readOutputSize(outputPath) : undefined;
    const missingOutput = result.exitCode === 0 && outputBytes === undefined;

    return {
      profileId: entry.profileId,
      outputPath: outputRelativePath,
      manifestPath: manifestRelativePath,
      status: result.exitCode === 0 && !missingOutput ? 'completed' : 'failed',
      commandText,
      startedAt,
      finishedAt,
      exitCode: result.exitCode,
      stdoutTail: tailText(result.stdout),
      stderrTail: tailText(result.stderr),
      outputBytes,
      ...(result.exitCode !== 0
        ? { error: `External exporter writer exited with code ${result.exitCode}.` }
        : missingOutput
          ? { error: 'External exporter writer completed but did not create the declared output file.' }
          : {}),
    };
  } catch (error) {
    return {
      profileId: entry.profileId,
      outputPath: entry.outputPath,
      manifestPath: entry.manifestPath,
      status: 'blocked',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function loadExternalExporterOutputManifest(manifestPath: string): Promise<{
  pluginId: string;
  profileId: string;
  outputPath: string;
}> {
  const data = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown;
  if (!isRecord(data) || data.kind !== EXTERNAL_EXPORTER_OUTPUT_MANIFEST_KIND || data.version !== 1) {
    throw new Error('Invalid Danbi external exporter output manifest.');
  }

  const pluginId = readString(data, 'pluginId');
  const profileId = readString(data, 'profileId');
  const outputPath = readString(data, 'outputPath');
  if (!pluginId || !profileId || !outputPath) {
    throw new Error('External exporter output manifest is missing pluginId, profileId, or outputPath.');
  }

  return {
    pluginId,
    profileId,
    outputPath: readSafeExporterRelativePath(outputPath),
  };
}

function executeExternalExporterCommand(command: ExternalExporterWriterCommand, timeoutMs: number): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(command.executable, command.args, {
      cwd: command.cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeout = timeoutMs > 0
      ? setTimeout(() => {
          if (settled) {
            return;
          }

          settled = true;
          child.kill();
          reject(new Error(`External exporter writer timed out after ${timeoutMs}ms.`));
        }, timeoutMs)
      : undefined;

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      if (Buffer.byteLength(stdout, 'utf8') > MAX_WRITER_OUTPUT_BYTES && !settled) {
        settled = true;
        child.kill();
        reject(new Error('External exporter writer stdout exceeded the output limit.'));
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
      if (Buffer.byteLength(stderr, 'utf8') > MAX_WRITER_OUTPUT_BYTES && !settled) {
        settled = true;
        child.kill();
        reject(new Error('External exporter writer stderr exceeded the output limit.'));
      }
    });
    child.on('error', (error) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      reject(error);
    });
    child.on('close', (exitCode) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      resolve({
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

function readHandoffEntry(value: unknown): ExternalExporterHandoffEntry {
  if (!isRecord(value)) {
    throw new Error('External exporter handoff entry must be an object.');
  }
  const profileId = readString(value, 'profileId');
  const status = readString(value, 'status');
  if (!profileId) {
    throw new Error('External exporter handoff entry is missing profileId.');
  }
  if (status !== 'written' && status !== 'skipped' && status !== 'blocked') {
    throw new Error(`External exporter handoff entry ${profileId} has invalid status.`);
  }

  return {
    profileId,
    status,
    outputPath: readString(value, 'outputPath'),
    manifestPath: readString(value, 'manifestPath'),
    reason: readString(value, 'reason'),
  };
}

function readDeclaredWriter(value: unknown): ExternalExporterDeclaredWriter | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const writerId = readString(value, 'writerId') ?? readString(value, 'id');
  const label = readString(value, 'label') ?? writerId;
  const executable = readString(value, 'executable');
  const trust = readString(value, 'trust');
  const status = readString(value, 'status');
  if (!writerId || !label || !executable) {
    return undefined;
  }

  return {
    writerId,
    label,
    executable,
    args: Array.isArray(value.args)
      ? value.args.filter((arg): arg is string => typeof arg === 'string' && !arg.includes('\0'))
      : [],
    cwd: readString(value, 'cwd') ?? null,
    trust: trust === 'trusted' || trust === 'blocked' || trust === 'prompt' ? trust : 'prompt',
    status: status === 'trusted' || status === 'blocked' || status === 'approval-required' ? status : 'approval-required',
    runtimePackage: readDeclaredWriterRuntimePackage(value.runtimePackage),
    packageStatus: readString(value, 'packageStatus') === 'packaged' ? 'packaged' : 'not-packaged',
    timeoutMs: typeof value.timeoutMs === 'number' && Number.isInteger(value.timeoutMs)
      ? Math.max(1000, Math.min(10 * 60 * 1000, value.timeoutMs))
      : null,
  };
}

function selectTrustedDeclaredWriter(manifest: ExternalExporterHandoffManifest): ExternalExporterDeclaredWriter | undefined {
  return manifest.exporterWriters.find((writer) => (
    writer.trust === 'trusted' &&
    writer.status === 'trusted' &&
    isSafeDeclaredWriterPath(writer.executable, { allowBareCommand: true }) &&
    (writer.cwd ? isSafeDeclaredWriterPath(writer.cwd, { allowBareCommand: false }) : true) &&
    (writer.runtimePackage ? isSafeDeclaredWriterRuntimePackage(writer) : true)
  ));
}

function readDeclaredWriterRuntimePackage(value: unknown): ExternalExporterDeclaredWriterRuntimePackage | null {
  if (!isRecord(value)) {
    return null;
  }

  const packageId = readString(value, 'packageId');
  const runtime = readString(value, 'runtime');
  const root = readString(value, 'root');
  const entry = readString(value, 'entry');
  if (!packageId || !(runtime === 'native' || runtime === 'node') || !root || !entry) {
    return null;
  }

  return {
    packageId,
    runtime,
    root,
    entry,
    packagedAt: readString(value, 'packagedAt') ?? null,
    files: Array.isArray(value.files)
      ? value.files.filter(isRecord).slice(0, 64).map((file): ExternalExporterDeclaredWriterRuntimePackageFile | null => {
          const filePath = readString(file, 'path');
          if (!filePath) {
            return null;
          }
          return {
            path: filePath,
            sha256: readString(file, 'sha256') ?? null,
            bytes: typeof file.bytes === 'number' && Number.isInteger(file.bytes) ? file.bytes : null,
          };
        }).filter((file): file is ExternalExporterDeclaredWriterRuntimePackageFile => Boolean(file))
      : [],
  };
}

function isSafeDeclaredWriterRuntimePackage(writer: ExternalExporterDeclaredWriter): boolean {
  const runtimePackage = writer.runtimePackage;
  if (!runtimePackage) {
    return true;
  }
  if (!isSafeDeclaredWriterPath(runtimePackage.root, { allowBareCommand: false })) {
    return false;
  }
  if (!isSafePackageRelativePath(runtimePackage.entry)) {
    return false;
  }
  if (runtimePackage.runtime === 'native' && writer.executable.replace(/\\/g, '/') !== `${runtimePackage.root.replace(/\\/g, '/')}/${runtimePackage.entry.replace(/\\/g, '/')}`) {
    return false;
  }
  return runtimePackage.files.length > 0 &&
    runtimePackage.files.every((file) => (
      isSafePackageRelativePath(file.path) &&
      (file.sha256 === undefined || file.sha256 === null || /^sha256-[a-f0-9]{64}$/.test(file.sha256)) &&
      (file.bytes === undefined || file.bytes === null || (Number.isInteger(file.bytes) && file.bytes >= 0))
    ));
}

function resolveDeclaredWriterExecutable(rootDirectory: string, executable: string): string {
  const normalized = executable.trim().replace(/\\/g, '/');
  if (!normalized.includes('/')) {
    return normalized;
  }

  return resolveSafeRelativePath(rootDirectory, readSafeDeclaredWriterPath(normalized, { allowBareCommand: false }));
}

function resolveDeclaredWriterCwd(rootDirectory: string, cwd: string | undefined): string {
  if (!cwd) {
    return rootDirectory;
  }

  return resolveSafeRelativePath(rootDirectory, readSafeDeclaredWriterPath(cwd, { allowBareCommand: false }));
}

async function validateDeclaredWriterRuntimePackage(
  rootDirectory: string,
  writer: ExternalExporterDeclaredWriter,
): Promise<void> {
  const runtimePackage = writer.runtimePackage;
  if (!runtimePackage) {
    return;
  }
  if (!isSafeDeclaredWriterRuntimePackage(writer)) {
    throw new Error(`External exporter writer package ${runtimePackage.packageId} is unsafe or does not match the declared writer command.`);
  }

  const packageRootRelative = readSafeDeclaredWriterPath(runtimePackage.root, { allowBareCommand: false });
  const packageRoot = resolveSafeRelativePath(rootDirectory, packageRootRelative);
  const entryPath = readSafePackageRelativePath(runtimePackage.entry);
  if (!runtimePackage.files.some((file) => readSafePackageRelativePath(file.path) === entryPath)) {
    throw new Error(`External exporter writer package ${runtimePackage.packageId} does not list entry file ${entryPath}.`);
  }

  for (const file of runtimePackage.files) {
    const fileRelativePath = readSafePackageRelativePath(file.path);
    const filePath = resolveSafePathWithinDirectory(packageRoot, fileRelativePath);
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new Error(`External exporter writer package file is not a regular file: ${fileRelativePath}`);
    }
    if (typeof file.bytes === 'number' && fileStat.size !== file.bytes) {
      throw new Error(`External exporter writer package file size mismatch for ${fileRelativePath}.`);
    }
    if (file.sha256) {
      const digest = `sha256-${createHash('sha256').update(await readFile(filePath)).digest('hex')}`;
      if (digest !== file.sha256) {
        throw new Error(`External exporter writer package file sha256 mismatch for ${fileRelativePath}.`);
      }
    }
  }
}

function inferExternalExporterRootDirectory(handoffPath: string | undefined): string | undefined {
  if (!handoffPath) {
    return undefined;
  }

  const normalized = path.resolve(handoffPath).split(path.sep).join('/');
  const exportsIndex = normalized.lastIndexOf('/exports/');
  if (exportsIndex <= 0) {
    return path.dirname(path.resolve(handoffPath));
  }

  return normalized.slice(0, exportsIndex).split('/').join(path.sep);
}

function readSafeDeclaredWriterPath(value: string, options: { allowBareCommand: boolean }): string {
  if (!isSafeDeclaredWriterPath(value, options)) {
    throw new Error(`Unsafe external exporter writer path: ${value}`);
  }

  return value.trim().replace(/\\/g, '/');
}

function readSafePackageRelativePath(value: string): string {
  if (!isSafePackageRelativePath(value)) {
    throw new Error(`Unsafe external exporter writer package path: ${value}`);
  }
  return value.trim().replace(/\\/g, '/');
}

function isSafeDeclaredWriterPath(value: string | null | undefined, options: { allowBareCommand: boolean }): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().replace(/\\/g, '/');
  if (
    !normalized ||
    normalized.includes('\0') ||
    /^[a-z][a-z0-9+.-]*:/i.test(normalized) ||
    normalized.startsWith('/') ||
    normalized.startsWith('//') ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.split('/').includes('..')
  ) {
    return false;
  }
  if (!normalized.includes('/')) {
    return options.allowBareCommand && /^[a-zA-Z0-9._-]+$/.test(normalized);
  }

  return (normalized.startsWith('plugins/') || normalized.startsWith('tools/')) &&
    normalized.split('/').every((segment) => /^[a-zA-Z0-9._-]+$/.test(segment));
}

function isSafePackageRelativePath(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }
  const normalized = value.trim().replace(/\\/g, '/');
  if (
    !normalized ||
    normalized.includes('\0') ||
    /^[a-z][a-z0-9+.-]*:/i.test(normalized) ||
    normalized.startsWith('/') ||
    normalized.startsWith('//') ||
    /^[a-zA-Z]:\//.test(normalized)
  ) {
    return false;
  }

  return normalized.split('/').every((segment) => (
    segment &&
    segment !== '.' &&
    segment !== '..' &&
    SAFE_EXPORT_PATH_SEGMENT.test(segment)
  ));
}

function readSafeExporterRelativePath(value: string): string {
  const normalized = value.trim().replace(/\\/g, '/');
  if (
    !normalized ||
    normalized.includes('\0') ||
    /^[a-z][a-z0-9+.-]*:/i.test(normalized) ||
    normalized.startsWith('/') ||
    normalized.startsWith('//') ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.split('/').includes('..')
  ) {
    throw new Error(`Unsafe external exporter path: ${value}`);
  }

  const parts = normalized.split('/').filter((part) => part && part !== '.');
  if (parts.length < 2 || parts[0] !== 'exports') {
    throw new Error(`External exporter path must be relative and under exports/: ${value}`);
  }
  for (const part of parts) {
    if (!SAFE_EXPORT_PATH_SEGMENT.test(part)) {
      throw new Error(`External exporter path contains an unsafe segment: ${part}`);
    }
  }

  return parts.join('/');
}

function resolveSafeRelativePath(rootDirectory: string, relativePath: string): string {
  const targetPath = path.resolve(rootDirectory, ...relativePath.split('/'));
  const rootRelativePath = path.relative(rootDirectory, targetPath);
  if (rootRelativePath.startsWith('..') || path.isAbsolute(rootRelativePath)) {
    throw new Error(`External exporter path escapes the output root: ${relativePath}`);
  }

  return targetPath;
}

function resolveSafePathWithinDirectory(rootDirectory: string, relativePath: string): string {
  const targetPath = path.resolve(rootDirectory, ...relativePath.split('/'));
  const rootRelativePath = path.relative(rootDirectory, targetPath);
  if (rootRelativePath.startsWith('..') || path.isAbsolute(rootRelativePath)) {
    throw new Error(`External exporter writer package file escapes package root: ${relativePath}`);
  }
  return targetPath;
}

async function readOutputSize(outputPath: string): Promise<number | undefined> {
  try {
    const stats = await stat(outputPath);
    return stats.isFile() ? stats.size : undefined;
  } catch {
    return undefined;
  }
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readPositiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readRequiredValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('-')) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}

function readRequiredAnyValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value === '') {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}

function resolveCliPath(value: string, cwd: string): string {
  return path.isAbsolute(value) ? value : path.resolve(cwd, value);
}

function tailText(value: string, maxLength = 4000): string | undefined {
  return value ? value.slice(-maxLength) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
