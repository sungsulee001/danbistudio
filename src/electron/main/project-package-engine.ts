import { copyFile, mkdir, open, readFile, rename, rm, stat, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import {
  deserializeProjectPackage,
  serializeProjectPackage,
} from '../../lib/editor/project-store';
import {
  buildProjectPackageMediaWarnings,
  validateProjectPackageMediaEntry,
  type ProjectPackageMediaEntry,
  type ProjectPackageMediaManifest,
} from '../../lib/editor/project-media-package';
import { resolveImportStoragePath } from '../../server/import-storage';
import type {
  EditorProjectPackageExportRequest,
  EditorProjectPackageExportResponse,
  EditorProjectPackageImportRequest,
  EditorProjectPackageImportResponse,
  ProjectPackageMediaCopyResult,
} from '../shared/ipc-contract';
import { assertValidProjectJson } from '../shared/project-schema';

export const DEFAULT_PROJECT_PACKAGE_FILE_NAME = 'project.danbi-project.json';

export async function exportProjectPackageFolder(
  request: EditorProjectPackageExportRequest,
): Promise<EditorProjectPackageExportResponse> {
  const { packageDirectory, projectFilePath } = resolveProjectPackageFilePath(
    request.packageDirectory,
    request.packageFileName,
  );
  const packageText = serializeProjectPackage(request.project, request.exportedAt);
  const parsedPackage = JSON.parse(packageText) as { mediaManifest?: ProjectPackageMediaManifest; warnings?: string[] };
  const mediaManifest = parsedPackage.mediaManifest;
  const warnings = [...(parsedPackage.warnings ?? [])];
  const copiedMedia: ProjectPackageMediaCopyResult[] = [];

  await mkdir(packageDirectory, { recursive: true });

  for (const entry of mediaManifest?.entries ?? []) {
    if (entry.status !== 'bundle-ready') {
      continue;
    }

    const copyResult = await copyPackageMediaEntry({
      entry,
      packageDirectory,
      sourceRoot: request.sourceRoot,
    });
    copiedMedia.push(copyResult);

    if (copyResult.status !== 'copied') {
      warnings.push(`${entry.assetName} ${entry.role} media could not be copied: ${copyResult.error ?? copyResult.sourcePath}`);
    }
  }

  const updatedMediaManifest = mediaManifest
    ? applyCopyResultsToMediaManifest(mediaManifest, copiedMedia)
    : undefined;
  const packageWarnings = uniqueStrings([
    ...warnings,
    ...(updatedMediaManifest?.warnings ?? []),
  ]);

  if (updatedMediaManifest) {
    parsedPackage.mediaManifest = updatedMediaManifest;
  }
  parsedPackage.warnings = packageWarnings;

  await writeFileAtomically(projectFilePath, JSON.stringify(parsedPackage, null, 2));

  return {
    packageDirectory,
    projectFilePath,
    mediaManifest: updatedMediaManifest,
    copiedMedia,
    warnings: packageWarnings,
  };
}

export async function importProjectPackageFolder(
  request: EditorProjectPackageImportRequest,
): Promise<EditorProjectPackageImportResponse> {
  const { packageDirectory, projectFilePath } = resolveProjectPackageFilePath(
    request.packageDirectory,
    request.packageFileName,
  );
  const packageText = await readFile(projectFilePath, 'utf8');
  const verifiedPackageText = await verifyProjectPackageMediaFilesForImport(packageText, packageDirectory);
  const imported = deserializeProjectPackage(verifiedPackageText, {
    rewriteBundledMedia: true,
    packageRoot: packageDirectory,
  });

  return {
    ...imported,
    project: assertValidProjectJson(imported.project, 'Cannot import project package because its JSON is invalid'),
    packageDirectory,
    projectFilePath,
  };
}

export function resolveProjectPackageFilePath(
  packageDirectory: string,
  packageFileName = DEFAULT_PROJECT_PACKAGE_FILE_NAME,
): { packageDirectory: string; projectFilePath: string } {
  const resolvedPackageDirectory = path.resolve(packageDirectory);
  const safePackageFileName = normalizeProjectPackageFileName(packageFileName);
  const projectFilePath = path.resolve(resolvedPackageDirectory, safePackageFileName);

  assertPathInsideDirectory(projectFilePath, resolvedPackageDirectory);

  return {
    packageDirectory: resolvedPackageDirectory,
    projectFilePath,
  };
}

async function copyPackageMediaEntry({
  entry,
  packageDirectory,
  sourceRoot,
}: {
  entry: ProjectPackageMediaEntry;
  packageDirectory: string;
  sourceRoot?: string;
}): Promise<ProjectPackageMediaCopyResult> {
  const sourcePath = resolvePackageMediaSourcePath(entry.originalPath, sourceRoot);
  const targetPath = path.resolve(packageDirectory, entry.packagePath);

  assertPathInsideDirectory(targetPath, packageDirectory);
  await mkdir(path.dirname(targetPath), { recursive: true });

  try {
    await copyFile(sourcePath, targetPath);
    const copiedStats = await stat(targetPath);

    return {
      assetId: entry.assetId,
      role: entry.role,
      originalPath: entry.originalPath,
      sourcePath,
      packagePath: entry.packagePath,
      targetPath,
      status: 'copied',
      bytes: copiedStats.size,
    };
  } catch (error) {
    return {
      assetId: entry.assetId,
      role: entry.role,
      originalPath: entry.originalPath,
      sourcePath,
      packagePath: entry.packagePath,
      targetPath,
      status: isMissingFileError(error) ? 'missing' : 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function verifyProjectPackageMediaFilesForImport(
  packageText: string,
  packageDirectory: string,
): Promise<string> {
  const parsedPackage = JSON.parse(packageText) as { mediaManifest?: ProjectPackageMediaManifest };
  if (!isProjectPackageMediaManifestLike(parsedPackage.mediaManifest)) {
    return packageText;
  }

  const verifiedManifest = await verifyImportedPackageMediaManifest(
    parsedPackage.mediaManifest,
    packageDirectory,
  );
  parsedPackage.mediaManifest = verifiedManifest;

  return JSON.stringify(parsedPackage);
}

async function verifyImportedPackageMediaManifest(
  manifest: ProjectPackageMediaManifest,
  packageDirectory: string,
): Promise<ProjectPackageMediaManifest> {
  const validEntries: ProjectPackageMediaEntry[] = [];
  const invalidWarnings: string[] = [];

  for (const entry of manifest.entries as unknown[]) {
    const invalidReason = validateProjectPackageMediaEntry(entry);
    if (invalidReason) {
      invalidWarnings.push(`Skipped invalid package media manifest entry: ${invalidReason}`);
      continue;
    }

    validEntries.push(entry as ProjectPackageMediaEntry);
  }

  const entries = await Promise.all(validEntries.map(async (entry) => {
    if (entry.status !== 'bundle-ready') {
      return entry;
    }

    const targetPath = path.resolve(packageDirectory, entry.packagePath);
    try {
      assertPathInsideDirectory(targetPath, packageDirectory);
      const targetStats = await stat(targetPath);
      if (!targetStats.isFile()) {
        return {
          ...entry,
          status: 'copy-failed' as const,
        };
      }

      const handle = await open(targetPath, 'r');
      await handle.close();
      return entry;
    } catch (error) {
      return {
        ...entry,
        status: isMissingFileError(error) ? 'missing' as const : 'copy-failed' as const,
      };
    }
  }));

  return {
    ...manifest,
    entries,
    bundleReadyCount: entries.filter((entry) => entry.status === 'bundle-ready').length,
    missingCount: entries.filter((entry) => entry.status === 'missing').length,
    volatileCount: entries.filter((entry) => entry.status === 'volatile-source').length,
    externalCount: entries.filter((entry) => entry.status === 'external-reference').length,
    copyFailedCount: entries.filter((entry) => entry.status === 'copy-failed').length,
    warnings: uniqueStrings([
      ...readStringArray(manifest.warnings),
      ...buildProjectPackageMediaWarnings(entries),
      ...invalidWarnings,
    ]),
  };
}

function isProjectPackageMediaManifestLike(value: unknown): value is ProjectPackageMediaManifest {
  return Boolean(value)
    && typeof value === 'object'
    && typeof (value as Partial<ProjectPackageMediaManifest>).projectId === 'string'
    && Array.isArray((value as Partial<ProjectPackageMediaManifest>).entries);
}

export function resolvePackageMediaSourcePath(originalPath: string, sourceRoot?: string): string {
  const packagePath = stripUrlSuffix(originalPath);
  const baseRoot = sourceRoot ?? process.cwd();

  if (/^file:\/\//i.test(originalPath)) {
    const uncPath = resolveFileUrlUncPath(originalPath);
    if (uncPath) {
      return uncPath;
    }

    return fileURLToPath(originalPath);
  }

  if (packagePath.startsWith('/imports/')) {
    return resolveImportStoragePath(packagePath.slice('/imports/'.length), sourceRoot);
  }

  if (packagePath.startsWith('/')) {
    return path.resolve(baseRoot, 'public', packagePath.slice(1));
  }

  const normalized = packagePath.replace(/\\/g, path.sep);
  if (path.isAbsolute(normalized)) {
    return path.resolve(normalized);
  }

  return path.resolve(baseRoot, normalized);
}

function stripUrlSuffix(value: string): string {
  return value.split(/[?#]/, 1)[0] ?? '';
}

function resolveFileUrlUncPath(originalPath: string): string | undefined {
  try {
    const url = new URL(originalPath);
    if (url.protocol !== 'file:' || url.hostname) {
      return undefined;
    }

    const decodedPath = decodeURIComponent(url.pathname);
    const normalized = decodedPath.replace(/\//g, '\\');
    return /^\\\\[^\\]+\\[^\\]+/.test(normalized) ? normalized : undefined;
  } catch {
    return undefined;
  }
}

function assertPathInsideDirectory(targetPath: string, directory: string): void {
  const resolvedDirectory = path.resolve(directory);
  const relativePath = path.relative(resolvedDirectory, path.resolve(targetPath));

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Package media target escapes package directory: ${targetPath}`);
  }
}

function normalizeProjectPackageFileName(value: string): string {
  const fileName = value.trim();

  if (!fileName) {
    throw new Error('Project package file name is required.');
  }

  if (fileName.includes('\0')) {
    throw new Error('Project package file name cannot contain null bytes.');
  }

  if (path.isAbsolute(fileName) || path.win32.isAbsolute(fileName) || path.posix.isAbsolute(fileName)) {
    throw new Error(`Project package file name must be relative to the package directory: ${fileName}`);
  }

  if (fileName.includes('/') || fileName.includes('\\') || fileName === '.' || fileName === '..') {
    throw new Error(`Project package file name cannot include path separators: ${fileName}`);
  }

  if (fileName.endsWith('.')) {
    throw new Error(`Project package file name cannot end with a dot: ${fileName}`);
  }

  if (isWindowsReservedPathName(fileName)) {
    throw new Error(`Project package file name cannot use a Windows reserved device name: ${fileName}`);
  }

  return fileName;
}

function isWindowsReservedPathName(value: string): boolean {
  const baseName = value.split('.')[0]?.toLowerCase();
  return Boolean(baseName) && WINDOWS_RESERVED_PATH_NAMES.has(baseName);
}

const WINDOWS_RESERVED_PATH_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
]);

function isMissingFileError(error: unknown): boolean {
  return error !== null
    && typeof error === 'object'
    && 'code' in error
    && (error as { code?: string }).code === 'ENOENT';
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

function applyCopyResultsToMediaManifest(
  manifest: ProjectPackageMediaManifest,
  copiedMedia: ProjectPackageMediaCopyResult[],
): ProjectPackageMediaManifest {
  const copyResultsByEntry = new Map(copiedMedia.map((result) => [
    packageMediaEntryKey(result),
    result,
  ]));
  const entries: ProjectPackageMediaEntry[] = manifest.entries.map((entry) => {
    const copyResult = copyResultsByEntry.get(packageMediaEntryKey(entry));
    if (!copyResult || copyResult.status === 'copied') {
      return entry;
    }
    const status = copyResult.status === 'missing' ? 'missing' : 'copy-failed';

    return {
      ...entry,
      status,
    };
  });

  return {
    ...manifest,
    entries,
    bundleReadyCount: entries.filter((entry) => entry.status === 'bundle-ready').length,
    missingCount: entries.filter((entry) => entry.status === 'missing').length,
    volatileCount: entries.filter((entry) => entry.status === 'volatile-source').length,
    externalCount: entries.filter((entry) => entry.status === 'external-reference').length,
    copyFailedCount: entries.filter((entry) => entry.status === 'copy-failed').length,
    warnings: buildProjectPackageMediaWarnings(entries),
  };
}

function packageMediaEntryKey(entry: Pick<ProjectPackageMediaEntry, 'assetId' | 'role' | 'originalPath' | 'packagePath'>): string {
  return `${entry.assetId}:${entry.role}:${entry.originalPath}:${entry.packagePath}`;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
