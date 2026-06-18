import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { EXTENSION_SANDBOX_WRITE_EXPORTS_COMMAND } from '../shared/extension-api';

const SAFE_EXPORT_PATH_SEGMENT = /^[a-z0-9._-]+$/i;
const MAX_REVIEWED_EXPORT_MANIFESTS = 50;

export interface ReviewedExternalExporterHandoffWriteOptions {
  rootDirectory?: string;
  now?: string;
  includeBlockedManifests?: boolean;
}

export interface ReviewedExternalExporterHandoffWriteEntry {
  profileId: string;
  status: 'written' | 'skipped' | 'blocked';
  outputPath?: string;
  outputAbsolutePath?: string;
  manifestRelativePath?: string;
  manifestPath?: string;
  reason?: string;
}

export interface ReviewedExternalExporterHandoffWriteResult {
  kind: 'danbi.external-exporter.handoff-write-result';
  status: 'completed' | 'blocked';
  rootDirectory: string;
  batchManifestRelativePath: string | null;
  batchManifestPath: string | null;
  writtenCount: number;
  skippedCount: number;
  blockedCount: number;
  writes: ReviewedExternalExporterHandoffWriteEntry[];
  warnings: string[];
}

export async function writeReviewedExternalExporterHandoff(
  result: unknown,
  options: ReviewedExternalExporterHandoffWriteOptions = {},
): Promise<ReviewedExternalExporterHandoffWriteResult> {
  if (!isRecord(result) || result.command !== EXTENSION_SANDBOX_WRITE_EXPORTS_COMMAND) {
    throw new Error('Reviewed external exporter handoff writer requires a danbi.external.writeExports sandbox result.');
  }

  const rootDirectory = resolve(options.rootDirectory ?? process.cwd());
  const writtenAt = options.now ?? new Date().toISOString();
  const warnings: string[] = [];
  const outputManifests = Array.isArray(result.outputManifests)
    ? result.outputManifests.filter(isRecord).slice(0, MAX_REVIEWED_EXPORT_MANIFESTS)
    : [];

  if (!Array.isArray(result.outputManifests)) {
    warnings.push('Reviewed external exporter result did not include outputManifests; no handoff files were written.');
  }
  if (Array.isArray(result.outputManifests) && result.outputManifests.length > MAX_REVIEWED_EXPORT_MANIFESTS) {
    warnings.push(`Reviewed external exporter handoff writer limited output manifests to ${MAX_REVIEWED_EXPORT_MANIFESTS}.`);
  }

  const writes: ReviewedExternalExporterHandoffWriteEntry[] = [];
  const usedManifestPaths = new Set<string>();
  for (const [index, manifest] of outputManifests.entries()) {
    const profileId = readString(manifest, 'profileId') ?? `profile-${index + 1}`;
    const outputStatus = readString(manifest, 'status') ?? 'unknown';

    if (outputStatus !== 'ready' && !options.includeBlockedManifests) {
      writes.push({
        profileId,
        status: 'skipped',
        reason: `Output manifest status is ${outputStatus}; only ready manifests are materialized by default.`,
      });
      continue;
    }

    const outputPath = readString(manifest, 'outputPath');
    if (!outputPath) {
      writes.push({
        profileId,
        status: 'blocked',
        reason: 'Output manifest is missing outputPath.',
      });
      continue;
    }

    try {
      const outputRelativePath = readSafeExporterRelativePath(outputPath);
      const manifestRelativePath = `${outputRelativePath}.danbi-export.json`;
      if (usedManifestPaths.has(manifestRelativePath)) {
        writes.push({
          profileId,
          status: 'skipped',
          outputPath: outputRelativePath,
          reason: `Duplicate output manifest path ${manifestRelativePath} was skipped.`,
        });
        continue;
      }

      const outputAbsolutePath = resolveSafeRelativePath(rootDirectory, outputRelativePath);
      const manifestPath = resolveSafeRelativePath(rootDirectory, manifestRelativePath);
      usedManifestPaths.add(manifestRelativePath);
      await mkdir(dirname(manifestPath), { recursive: true });
      await writeFileAtomically(manifestPath, `${JSON.stringify(buildOutputHandoffDocument({
        result,
        manifest,
        outputRelativePath,
        manifestRelativePath,
        writtenAt,
      }), null, 2)}\n`, 'utf8');

      writes.push({
        profileId,
        status: 'written',
        outputPath: outputRelativePath,
        outputAbsolutePath,
        manifestRelativePath,
        manifestPath,
      });
    } catch (error) {
      writes.push({
        profileId,
        status: 'blocked',
        outputPath,
        reason: (error as Error).message,
      });
    }
  }

  const batchManifestRelativePath = resolveBatchManifestRelativePath(result, writes, warnings);
  const batchManifestPath = batchManifestRelativePath
    ? resolveSafeRelativePath(rootDirectory, batchManifestRelativePath)
    : null;
  if (batchManifestPath) {
    await mkdir(dirname(batchManifestPath), { recursive: true });
    await writeFileAtomically(batchManifestPath, `${JSON.stringify(buildBatchHandoffDocument({
      result,
      writes,
      warnings,
      writtenAt,
    }), null, 2)}\n`);
  }

  const writtenCount = writes.filter((write) => write.status === 'written').length;
  const skippedCount = writes.filter((write) => write.status === 'skipped').length;
  const blockedCount = writes.filter((write) => write.status === 'blocked').length;
  if (writtenCount === 0) {
    warnings.push('Reviewed external exporter handoff writer did not materialize any ready output manifests.');
  }

  return {
    kind: 'danbi.external-exporter.handoff-write-result',
    status: writtenCount > 0 ? 'completed' : 'blocked',
    rootDirectory,
    batchManifestRelativePath,
    batchManifestPath,
    writtenCount,
    skippedCount,
    blockedCount,
    writes,
    warnings,
  };
}

function buildOutputHandoffDocument({
  result,
  manifest,
  outputRelativePath,
  manifestRelativePath,
  writtenAt,
}: {
  result: Record<string, unknown>;
  manifest: Record<string, unknown>;
  outputRelativePath: string;
  manifestRelativePath: string;
  writtenAt: string;
}): Record<string, unknown> {
  return {
    kind: 'danbi.external-exporter.output-manifest',
    version: 1,
    writtenAt,
    command: EXTENSION_SANDBOX_WRITE_EXPORTS_COMMAND,
    pluginId: readString(result, 'pluginId') ?? readString(manifest, 'pluginId') ?? 'unknown',
    profileId: readString(manifest, 'profileId') ?? 'unknown',
    project: readProjectSummary(result.project),
    outputPath: outputRelativePath,
    manifestPath: manifestRelativePath,
    manifest: readPortableOutputManifest(manifest, outputRelativePath),
    exporterWriters: readPortableExporterWriters(result),
    safeguards: {
      codeExecution: 'disabled',
      writeBoundary: 'electron-main-reviewed-handoff',
      filesystemScope: 'exports-relative',
    },
  };
}

function buildBatchHandoffDocument({
  result,
  writes,
  warnings,
  writtenAt,
}: {
  result: Record<string, unknown>;
  writes: ReviewedExternalExporterHandoffWriteEntry[];
  warnings: string[];
  writtenAt: string;
}): Record<string, unknown> {
  return {
    kind: 'danbi.external-exporter.handoff',
    version: 1,
    writtenAt,
    command: EXTENSION_SANDBOX_WRITE_EXPORTS_COMMAND,
    pluginId: readString(result, 'pluginId') ?? 'unknown',
    project: readProjectSummary(result.project),
    exporterWriters: readPortableExporterWriters(result),
    entries: writes.map((write) => ({
      profileId: write.profileId,
      status: write.status,
      outputPath: write.outputPath,
      manifestPath: write.manifestRelativePath,
      reason: write.reason,
    })),
    warnings,
    safeguards: {
      codeExecution: 'disabled',
      writeBoundary: 'electron-main-reviewed-handoff',
      filesystemScope: 'exports-relative',
    },
  };
}

function readPortableExporterWriters(result: Record<string, unknown>): Record<string, unknown>[] {
  const writers = Array.isArray(result.exporterWriters)
    ? result.exporterWriters.filter(isRecord).slice(0, 16)
    : [];
  return writers.map((writer, index) => ({
    writerId: readString(writer, 'writerId') ?? `writer-${index + 1}`,
    label: readString(writer, 'label') ?? readString(writer, 'writerId') ?? `Writer ${index + 1}`,
    executable: readString(writer, 'executable') ?? '',
    args: readStringArray(writer, 'args'),
    cwd: readString(writer, 'cwd') ?? null,
    trust: readString(writer, 'trust') ?? 'prompt',
    status: readString(writer, 'status') ?? 'approval-required',
    fingerprint: readString(writer, 'fingerprint') ?? null,
    trustFingerprint: readString(writer, 'trustFingerprint') ?? null,
    approvalStatus: readString(writer, 'approvalStatus') ?? 'not-required',
    latestTrustDecision: readPortableTrustDecision(writer.latestTrustDecision),
    trustHistoryCount: readNumber(writer, 'trustHistoryCount') ?? 0,
    runtimePackage: readPortableRuntimePackage(writer.runtimePackage),
    packageStatus: readString(writer, 'packageStatus') ?? 'not-packaged',
    timeoutMs: readNumber(writer, 'timeoutMs') ?? null,
  }));
}

function readPortableRuntimePackage(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    packageId: readString(value, 'packageId') ?? '',
    runtime: readString(value, 'runtime') ?? '',
    root: readString(value, 'root') ?? '',
    entry: readString(value, 'entry') ?? '',
    packagedAt: readString(value, 'packagedAt') ?? null,
    files: Array.isArray(value.files)
      ? value.files.filter(isRecord).slice(0, 64).map((file) => ({
          path: readString(file, 'path') ?? '',
          sha256: readString(file, 'sha256') ?? null,
          bytes: readNumber(file, 'bytes') ?? null,
        }))
      : [],
  };
}

function readPortableTrustDecision(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    at: readString(value, 'at') ?? '',
    action: readString(value, 'action') ?? '',
    previousTrust: readString(value, 'previousTrust') ?? '',
    nextTrust: readString(value, 'nextTrust') ?? '',
    fingerprint: readString(value, 'fingerprint') ?? '',
    commandPreview: readString(value, 'commandPreview') ?? '',
    source: readString(value, 'source') ?? null,
  };
}

function readPortableOutputManifest(
  manifest: Record<string, unknown>,
  outputRelativePath: string,
): Record<string, unknown> {
  return {
    manifestVersion: readNumber(manifest, 'manifestVersion') ?? 1,
    pluginId: readString(manifest, 'pluginId') ?? 'unknown',
    profileId: readString(manifest, 'profileId') ?? 'unknown',
    label: readString(manifest, 'label') ?? '',
    purpose: readString(manifest, 'purpose'),
    container: readString(manifest, 'container') ?? '',
    codec: readString(manifest, 'codec') ?? '',
    width: readNumber(manifest, 'width') ?? 0,
    height: readNumber(manifest, 'height') ?? 0,
    fps: readNumber(manifest, 'fps') ?? 0,
    videoBitrateMbps: readNumber(manifest, 'videoBitrateMbps') ?? 0,
    audioBitrateKbps: readNumber(manifest, 'audioBitrateKbps') ?? 0,
    duration: readNumber(manifest, 'duration') ?? 0,
    estimatedPixelCount: readNumber(manifest, 'estimatedPixelCount') ?? 0,
    outputDirectory: readString(manifest, 'outputDirectory') ?? dirname(outputRelativePath).replace(/\\/g, '/'),
    outputFilename: readString(manifest, 'outputFilename') ?? outputRelativePath.split('/').at(-1) ?? '',
    outputPath: outputRelativePath,
    dryRun: readBoolean(manifest, 'dryRun') ?? false,
    status: readString(manifest, 'status') ?? 'unknown',
    issueCount: readNumber(manifest, 'issueCount') ?? 0,
    issues: readStringArray(manifest, 'issues'),
    priority: readNumber(manifest, 'priority') ?? 0,
  };
}

function resolveBatchManifestRelativePath(
  result: Record<string, unknown>,
  writes: ReviewedExternalExporterHandoffWriteEntry[],
  warnings: string[],
): string | null {
  const request = isRecord(result.request) ? result.request : {};
  const requestedDirectory = readString(request, 'outputDirectory');
  if (requestedDirectory) {
    try {
      return `${readSafeExporterRelativePath(requestedDirectory)}/danbi-external-export-handoff.json`;
    } catch (error) {
      warnings.push(`Reviewed external exporter handoff batch directory was rejected: ${(error as Error).message}`);
    }
  }

  const firstWritten = writes.find((write) => write.status === 'written' && write.manifestRelativePath);
  if (!firstWritten?.manifestRelativePath) {
    return null;
  }

  return `${firstWritten.manifestRelativePath.split('/').slice(0, -1).join('/')}/danbi-external-export-handoff.json`;
}

function readProjectSummary(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return {
    projectId: readString(value, 'projectId') ?? 'unknown',
    name: readString(value, 'name') ?? 'Unknown project',
    duration: readNumber(value, 'duration') ?? 0,
    fps: readNumber(value, 'fps') ?? 0,
    width: readNumber(value, 'width') ?? 0,
    height: readNumber(value, 'height') ?? 0,
    exportProfileCount: readNumber(value, 'exportProfileCount') ?? 0,
  };
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
  const targetPath = resolve(rootDirectory, ...relativePath.split('/'));
  const rootRelativePath = relative(rootDirectory, targetPath);
  if (rootRelativePath.startsWith('..') || isAbsolute(rootRelativePath)) {
    throw new Error(`External exporter path escapes the output root: ${relativePath}`);
  }

  return targetPath;
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

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === 'boolean' ? value : undefined;
}

function readStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
