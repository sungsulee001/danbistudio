import { lstat, readdir, rmdir, unlink } from 'fs/promises';
import { isAbsolute, relative, resolve } from 'path';
import {
  getCacheStorageRoot,
  getLegacyPublicCacheRoot,
} from './cache-storage';
import {
  getLegacyPublicOutputRoot,
  getOutputStorageRoot,
} from './output-storage';
import { getSttStorageRoot } from './stt-storage';

export type StorageCleanupTargetId = 'cache' | 'outputs' | 'stt';

export interface StorageCleanupOptions {
  rootDir?: string;
  now?: Date;
  maxAgeDays?: number;
  dryRun?: boolean;
  targets?: StorageCleanupTargetId[];
}

export interface StorageCleanupTargetResult {
  id: StorageCleanupTargetId;
  label: string;
  rootPath: string;
  rootPaths: string[];
  scannedFiles: number;
  eligibleFiles: number;
  deletedFiles: number;
  skippedFiles: number;
  skippedSymlinks: number;
  eligibleBytes: number;
  deletedBytes: number;
  directoriesRemoved: number;
  errors: string[];
}

export interface StorageCleanupResult {
  dryRun: boolean;
  maxAgeDays: number;
  cutoffIso: string;
  scannedFiles: number;
  eligibleFiles: number;
  deletedFiles: number;
  skippedFiles: number;
  skippedSymlinks: number;
  eligibleBytes: number;
  deletedBytes: number;
  directoriesRemoved: number;
  targets: StorageCleanupTargetResult[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_AGE_DAYS = 30;
const CLEANUP_TARGETS: Record<StorageCleanupTargetId, {
  label: string;
  resolveRootPaths: (rootDir: string | undefined, workspaceRoot: string) => string[];
}> = {
  cache: {
    label: 'Preview cache',
    resolveRootPaths: (rootDir, workspaceRoot) => [
      getCacheStorageRoot(rootDir),
      getLegacyPublicCacheRoot(workspaceRoot),
    ],
  },
  outputs: {
    label: 'Rendered outputs',
    resolveRootPaths: (rootDir, workspaceRoot) => [
      getOutputStorageRoot(rootDir),
      getLegacyPublicOutputRoot(workspaceRoot),
    ],
  },
  stt: {
    label: 'Speech transcripts',
    resolveRootPaths: (rootDir) => [
      getSttStorageRoot(rootDir),
    ],
  },
};

export function normalizeStorageCleanupMaxAgeDays(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_MAX_AGE_DAYS;
  }

  return Math.max(1, Math.min(3650, Math.round(parsed)));
}

export function normalizeStorageCleanupTargets(value: unknown): StorageCleanupTargetId[] {
  if (!Array.isArray(value)) {
    return ['cache', 'outputs', 'stt'];
  }

  const seen = new Set<StorageCleanupTargetId>();
  for (const item of value) {
    if (item === 'cache' || item === 'outputs' || item === 'stt') {
      seen.add(item);
    }
  }

  return seen.size > 0 ? Array.from(seen) : ['cache', 'outputs', 'stt'];
}

export async function cleanupStorageFiles(options: StorageCleanupOptions = {}): Promise<StorageCleanupResult> {
  const rootDir = options.rootDir ? resolve(options.rootDir) : undefined;
  const workspaceRoot = rootDir ?? resolve(process.cwd());
  const maxAgeDays = normalizeStorageCleanupMaxAgeDays(options.maxAgeDays);
  const now = options.now ?? new Date();
  const cutoffMs = now.getTime() - maxAgeDays * DAY_MS;
  const dryRun = options.dryRun ?? true;
  const targets = normalizeStorageCleanupTargets(options.targets);
  const targetResults = await Promise.all(targets.map((targetId) => cleanupStorageTarget({
    targetId,
    rootDir,
    workspaceRoot,
    cutoffMs,
    dryRun,
  })));

  return targetResults.reduce<StorageCleanupResult>((summary, target) => ({
    ...summary,
    scannedFiles: summary.scannedFiles + target.scannedFiles,
    eligibleFiles: summary.eligibleFiles + target.eligibleFiles,
    deletedFiles: summary.deletedFiles + target.deletedFiles,
    skippedFiles: summary.skippedFiles + target.skippedFiles,
    skippedSymlinks: summary.skippedSymlinks + target.skippedSymlinks,
    eligibleBytes: summary.eligibleBytes + target.eligibleBytes,
    deletedBytes: summary.deletedBytes + target.deletedBytes,
    directoriesRemoved: summary.directoriesRemoved + target.directoriesRemoved,
    targets: [...summary.targets, target],
  }), {
    dryRun,
    maxAgeDays,
    cutoffIso: new Date(cutoffMs).toISOString(),
    scannedFiles: 0,
    eligibleFiles: 0,
    deletedFiles: 0,
    skippedFiles: 0,
    skippedSymlinks: 0,
    eligibleBytes: 0,
    deletedBytes: 0,
    directoriesRemoved: 0,
    targets: [],
  });
}

async function cleanupStorageTarget({
  targetId,
  rootDir,
  workspaceRoot,
  cutoffMs,
  dryRun,
}: {
  targetId: StorageCleanupTargetId;
  rootDir?: string;
  workspaceRoot: string;
  cutoffMs: number;
  dryRun: boolean;
}): Promise<StorageCleanupTargetResult> {
  const target = CLEANUP_TARGETS[targetId];
  const targetRoots = target.resolveRootPaths(rootDir, workspaceRoot);
  const result: StorageCleanupTargetResult = {
    id: targetId,
    label: target.label,
    rootPath: targetRoots[0],
    rootPaths: targetRoots,
    scannedFiles: 0,
    eligibleFiles: 0,
    deletedFiles: 0,
    skippedFiles: 0,
    skippedSymlinks: 0,
    eligibleBytes: 0,
    deletedBytes: 0,
    directoriesRemoved: 0,
    errors: [],
  };

  for (const targetRoot of targetRoots) {
    const visitedDirectories: string[] = [];

    await scanDirectory(targetRoot, targetRoot, cutoffMs, dryRun, result, visitedDirectories);

    if (!dryRun) {
      await removeEmptyVisitedDirectories(targetRoot, visitedDirectories, result);
    }
  }

  return result;
}

async function scanDirectory(
  targetRoot: string,
  currentDir: string,
  cutoffMs: number,
  dryRun: boolean,
  result: StorageCleanupTargetResult,
  visitedDirectories: string[],
): Promise<void> {
  if (!isPathInside(targetRoot, currentDir)) {
    result.errors.push(`Skipped unsafe directory: ${currentDir}`);
    return;
  }

  let entries: Array<{
    name: string;
    isSymbolicLink(): boolean;
    isDirectory(): boolean;
    isFile(): boolean;
  }>;
  try {
    entries = await readdir(currentDir, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return;
    }

    result.errors.push(`Cannot read ${currentDir}: ${formatError(error)}`);
    return;
  }

  visitedDirectories.push(currentDir);

  for (const entry of entries) {
    const entryPath = resolve(currentDir, entry.name);
    if (!isPathInside(targetRoot, entryPath)) {
      result.skippedFiles += 1;
      result.errors.push(`Skipped unsafe path: ${entryPath}`);
      continue;
    }

    if (entry.isSymbolicLink()) {
      result.skippedSymlinks += 1;
      continue;
    }

    if (entry.isDirectory()) {
      await scanDirectory(targetRoot, entryPath, cutoffMs, dryRun, result, visitedDirectories);
      continue;
    }

    if (!entry.isFile()) {
      result.skippedFiles += 1;
      continue;
    }

    result.scannedFiles += 1;

    let stats: { mtimeMs: number; size: number };
    try {
      stats = await entryStat(entryPath);
    } catch (error) {
      result.skippedFiles += 1;
      result.errors.push(`Cannot inspect ${entryPath}: ${formatError(error)}`);
      continue;
    }

    if (stats.mtimeMs > cutoffMs) {
      continue;
    }

    result.eligibleFiles += 1;
    result.eligibleBytes += stats.size;

    if (dryRun) {
      continue;
    }

    try {
      await unlink(entryPath);
      result.deletedFiles += 1;
      result.deletedBytes += stats.size;
    } catch (error) {
      result.skippedFiles += 1;
      result.errors.push(`Cannot delete ${entryPath}: ${formatError(error)}`);
    }
  }
}

async function entryStat(path: string): Promise<{ mtimeMs: number; size: number }> {
  const stats = await lstat(path);
  return {
    mtimeMs: stats.mtimeMs,
    size: stats.size,
  };
}

async function removeEmptyVisitedDirectories(
  targetRoot: string,
  visitedDirectories: string[],
  result: StorageCleanupTargetResult,
): Promise<void> {
  const sorted = [...visitedDirectories]
    .filter((directory) => directory !== targetRoot && isPathInside(targetRoot, directory))
    .sort((left, right) => right.length - left.length);

  for (const directory of sorted) {
    try {
      await rmdir(directory);
      result.directoriesRemoved += 1;
    } catch (error) {
      const code = isNodeError(error) ? error.code : undefined;
      if (code && ['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(code)) {
        continue;
      }

      result.errors.push(`Cannot remove empty directory ${directory}: ${formatError(error)}`);
    }
  }
}

function isPathInside(root: string, candidate: string): boolean {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(candidate);
  const pathFromRoot = relative(resolvedRoot, resolvedCandidate);
  return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
