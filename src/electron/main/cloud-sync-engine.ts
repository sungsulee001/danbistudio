import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  DEFAULT_PROJECT_PACKAGE_FILE_NAME,
  exportProjectPackageFolder,
  importProjectPackageFolder,
} from './project-package-engine';
import type {
  EditorCloudSyncManifest,
  EditorCloudSyncProjectImportRequest,
  EditorCloudSyncProjectImportResponse,
  EditorCloudSyncProjectRequest,
  EditorCloudSyncProjectResponse,
} from '../shared/ipc-contract';

const CLOUD_SYNC_MANIFEST_FILE_NAME = 'danbi-cloud-sync.json';
const CLOUD_SYNC_INDEX_FILE_NAME = 'danbi-cloud-sync-index.json';

interface CloudSyncSnapshot {
  manifest: EditorCloudSyncManifest;
  projectSyncDirectory: string;
  manifestPath: string;
}

export async function syncProjectToCloudFolder(
  request: EditorCloudSyncProjectRequest,
): Promise<EditorCloudSyncProjectResponse> {
  const exportedAt = request.exportedAt ?? new Date().toISOString();
  const syncDirectory = path.resolve(request.syncDirectory);
  const projectSyncDirectory = path.resolve(syncDirectory, buildProjectSyncFolderName(request.project.id, request.project.name));
  const manifestPath = path.resolve(projectSyncDirectory, CLOUD_SYNC_MANIFEST_FILE_NAME);
  const existingManifest = await readExistingCloudSyncManifest(syncDirectory, request.project.id, manifestPath);

  if (existingManifest && !request.force && isRemoteNewer(existingManifest.projectUpdatedAt, request.project.updatedAt)) {
    return {
      kind: 'danbi.cloud-sync.result',
      status: 'conflict',
      syncDirectory,
      projectSyncDirectory,
      packageDirectory: projectSyncDirectory,
      projectFilePath: path.resolve(projectSyncDirectory, DEFAULT_PROJECT_PACKAGE_FILE_NAME),
      manifestPath,
      exportedAt,
      projectId: request.project.id,
      projectName: request.project.name,
      projectUpdatedAt: request.project.updatedAt,
      previousProjectUpdatedAt: existingManifest.projectUpdatedAt,
      copiedMedia: [],
      warnings: [
        `Cloud sync target has a newer project snapshot from ${existingManifest.projectUpdatedAt}. Import it or retry with force.`,
      ],
    };
  }

  await mkdir(projectSyncDirectory, { recursive: true });
  const packageResult = await exportProjectPackageFolder({
    project: request.project,
    packageDirectory: projectSyncDirectory,
    packageFileName: DEFAULT_PROJECT_PACKAGE_FILE_NAME,
    exportedAt,
    sourceRoot: request.sourceRoot,
  });
  const manifest: EditorCloudSyncManifest = {
    kind: 'danbi.cloud-sync.manifest',
    version: 1,
    projectId: request.project.id,
    projectName: request.project.name,
    projectUpdatedAt: request.project.updatedAt,
    exportedAt,
    packageFileName: DEFAULT_PROJECT_PACKAGE_FILE_NAME,
    mediaEntryCount: packageResult.mediaManifest?.entries.length ?? 0,
    copiedMediaCount: packageResult.copiedMedia.filter((item) => item.status === 'copied').length,
    warningCount: packageResult.warnings.length,
  };

  await writeFileAtomically(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeCloudSyncIndex(syncDirectory, manifest, path.relative(syncDirectory, projectSyncDirectory));

  return {
    kind: 'danbi.cloud-sync.result',
    status: 'synced',
    syncDirectory,
    projectSyncDirectory,
    packageDirectory: packageResult.packageDirectory,
    projectFilePath: packageResult.projectFilePath,
    manifestPath,
    exportedAt,
    projectId: request.project.id,
    projectName: request.project.name,
    projectUpdatedAt: request.project.updatedAt,
    previousProjectUpdatedAt: existingManifest?.projectUpdatedAt,
    copiedMedia: packageResult.copiedMedia,
    warnings: packageResult.warnings,
  };
}

export async function importProjectFromCloudFolder(
  request: EditorCloudSyncProjectImportRequest,
): Promise<EditorCloudSyncProjectImportResponse> {
  const syncDirectory = path.resolve(request.syncDirectory);
  const snapshot = await readLatestCloudSyncSnapshot(syncDirectory, request.projectId);

  if (!snapshot) {
    throw new Error(`Cloud sync snapshot for project ${request.projectId} was not found.`);
  }

  const imported = await importProjectPackageFolder({
    packageDirectory: snapshot.projectSyncDirectory,
    packageFileName: snapshot.manifest.packageFileName,
  });

  return {
    ...imported,
    syncDirectory,
    projectSyncDirectory: snapshot.projectSyncDirectory,
    manifestPath: snapshot.manifestPath,
    projectUpdatedAt: snapshot.manifest.projectUpdatedAt,
    exportedAt: snapshot.manifest.exportedAt,
  };
}

export function buildProjectSyncFolderName(projectId: string, projectName: string): string {
  const baseName = normalizeSyncPathSegment(projectName) || normalizeSyncPathSegment(projectId) || 'project';
  const idHash = createHash('sha256').update(projectId).digest('hex').slice(0, 8);
  return `${baseName}-${idHash}`;
}

async function readCloudSyncManifest(manifestPath: string): Promise<EditorCloudSyncManifest | undefined> {
  try {
    const value = JSON.parse(await readFile(manifestPath, 'utf8')) as Partial<EditorCloudSyncManifest>;
    if (
      value.kind !== 'danbi.cloud-sync.manifest'
      || value.version !== 1
      || typeof value.projectId !== 'string'
      || typeof value.projectUpdatedAt !== 'string'
    ) {
      return undefined;
    }

    return {
      kind: 'danbi.cloud-sync.manifest',
      version: 1,
      projectId: value.projectId,
      projectName: typeof value.projectName === 'string' ? value.projectName : value.projectId,
      projectUpdatedAt: value.projectUpdatedAt,
      exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : value.projectUpdatedAt,
      packageFileName: typeof value.packageFileName === 'string' ? value.packageFileName : DEFAULT_PROJECT_PACKAGE_FILE_NAME,
      mediaEntryCount: readNonNegativeCount(value.mediaEntryCount),
      copiedMediaCount: readNonNegativeCount(value.copiedMediaCount),
      warningCount: readNonNegativeCount(value.warningCount),
    };
  } catch {
    return undefined;
  }
}

async function readExistingCloudSyncManifest(
  syncDirectory: string,
  projectId: string,
  preferredManifestPath: string,
): Promise<EditorCloudSyncManifest | undefined> {
  return (await readLatestCloudSyncSnapshot(syncDirectory, projectId, preferredManifestPath))?.manifest;
}

async function readLatestCloudSyncSnapshot(
  syncDirectory: string,
  projectId: string,
  preferredManifestPath?: string,
): Promise<CloudSyncSnapshot | undefined> {
  const snapshots: CloudSyncSnapshot[] = [];
  const resolvedSyncDirectory = path.resolve(syncDirectory);
  const normalizedDirectManifestPath = preferredManifestPath
    ? path.resolve(preferredManifestPath)
    : path.resolve(resolvedSyncDirectory, buildProjectSyncFolderName(projectId, projectId), CLOUD_SYNC_MANIFEST_FILE_NAME);
  if (!preferredManifestPath) {
    await addCloudSyncSnapshotIfPresent(
      snapshots,
      path.resolve(resolvedSyncDirectory, CLOUD_SYNC_MANIFEST_FILE_NAME),
      projectId,
      resolvedSyncDirectory,
    );
  }
  await addCloudSyncSnapshotIfPresent(snapshots, normalizedDirectManifestPath, projectId, resolvedSyncDirectory);

  const index = await readCloudSyncIndex(path.resolve(resolvedSyncDirectory, CLOUD_SYNC_INDEX_FILE_NAME));
  const seenManifestPaths = new Set(snapshots.map((snapshot) => snapshot.manifestPath));

  for (const indexedProject of index.projects.filter((project) => project.projectId === projectId)) {
    const safeIndexedProject = normalizeSafeCloudSyncIndexProject(indexedProject, resolvedSyncDirectory);
    if (!safeIndexedProject) {
      continue;
    }

    const indexedProjectDirectory = path.resolve(resolvedSyncDirectory, safeIndexedProject.relativeProjectDirectory);
    const indexedManifestPath = path.resolve(indexedProjectDirectory, CLOUD_SYNC_MANIFEST_FILE_NAME);
    if (seenManifestPaths.has(indexedManifestPath)) {
      continue;
    }
    seenManifestPaths.add(indexedManifestPath);

    await addCloudSyncSnapshotIfPresent(snapshots, indexedManifestPath, projectId, resolvedSyncDirectory);
  }

  if (!preferredManifestPath) {
    const scannedManifestPaths = await listDirectCloudSyncManifestPaths(resolvedSyncDirectory);
    const seenAfterIndex = new Set(snapshots.map((snapshot) => snapshot.manifestPath));
    for (const scannedManifestPath of scannedManifestPaths) {
      if (seenAfterIndex.has(scannedManifestPath)) {
        continue;
      }
      seenAfterIndex.add(scannedManifestPath);
      await addCloudSyncSnapshotIfPresent(snapshots, scannedManifestPath, projectId, resolvedSyncDirectory);
    }
  }

  return newestCloudSyncSnapshot(snapshots);
}

async function addCloudSyncSnapshotIfPresent(
  snapshots: CloudSyncSnapshot[],
  manifestPath: string,
  projectId: string,
  syncDirectory: string,
): Promise<void> {
  const normalizedManifestPath = path.resolve(manifestPath);
  const manifest = await readCloudSyncManifest(normalizedManifestPath);
  if (manifest?.projectId !== projectId) {
    return;
  }

  const projectSyncDirectory = path.dirname(normalizedManifestPath);
  if (!isPathInsideDirectory(projectSyncDirectory, syncDirectory)) {
    return;
  }

  snapshots.push({
    manifest,
    projectSyncDirectory,
    manifestPath: normalizedManifestPath,
  });
}

async function listDirectCloudSyncManifestPaths(syncDirectory: string): Promise<string[]> {
  try {
    const entries = await readdir(syncDirectory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.resolve(syncDirectory, entry.name, CLOUD_SYNC_MANIFEST_FILE_NAME));
  } catch {
    return [];
  }
}

async function writeCloudSyncIndex(
  syncDirectory: string,
  manifest: EditorCloudSyncManifest,
  relativeProjectDirectory: string,
): Promise<void> {
  const indexPath = path.resolve(syncDirectory, CLOUD_SYNC_INDEX_FILE_NAME);
  const existing = await readCloudSyncIndex(indexPath);
  const preservedProjects = existing.projects
    .filter((item) => item.projectId !== manifest.projectId)
    .map((item) => normalizeSafeCloudSyncIndexProject(item, syncDirectory))
    .filter((item): item is CloudSyncIndexProject => Boolean(item));
  const projects = [
    ...preservedProjects,
    {
      projectId: manifest.projectId,
      projectName: manifest.projectName,
      projectUpdatedAt: manifest.projectUpdatedAt,
      exportedAt: manifest.exportedAt,
      relativeProjectDirectory: relativeProjectDirectory.replace(/\\/g, '/'),
      packageFileName: manifest.packageFileName,
      warningCount: manifest.warningCount,
    },
  ].sort((left, right) => left.projectName.localeCompare(right.projectName));

  await mkdir(syncDirectory, { recursive: true });
  await writeFileAtomically(indexPath, `${JSON.stringify({
    kind: 'danbi.cloud-sync.index',
    version: 1,
    updatedAt: manifest.exportedAt,
    projects,
  }, null, 2)}\n`);
}

async function readCloudSyncIndex(indexPath: string): Promise<{
  projects: Array<{
    projectId: string;
    projectName: string;
    projectUpdatedAt: string;
    exportedAt: string;
    relativeProjectDirectory: string;
    packageFileName: string;
    warningCount: number;
  }>;
}> {
  try {
    const value = JSON.parse(await readFile(indexPath, 'utf8')) as { projects?: unknown };
    return {
      projects: Array.isArray(value.projects)
        ? value.projects.map(readCloudSyncIndexProject).filter((project): project is CloudSyncIndexProject => Boolean(project))
        : [],
    };
  } catch {
    return { projects: [] };
  }
}

interface CloudSyncIndexProject {
  projectId: string;
  projectName: string;
  projectUpdatedAt: string;
  exportedAt: string;
  relativeProjectDirectory: string;
  packageFileName: string;
  warningCount: number;
}

function readCloudSyncIndexProject(value: unknown): CloudSyncIndexProject | undefined {
  const candidate = value as {
    projectId?: unknown;
    projectName?: unknown;
    projectUpdatedAt?: unknown;
    exportedAt?: unknown;
    relativeProjectDirectory?: unknown;
    packageFileName?: unknown;
    warningCount?: unknown;
  };

  if (!(
    Boolean(value)
    && typeof value === 'object'
    && typeof candidate.projectId === 'string'
    && typeof candidate.relativeProjectDirectory === 'string'
  )) {
    return undefined;
  }

  return {
    projectId: candidate.projectId,
    projectName: typeof candidate.projectName === 'string' ? candidate.projectName : candidate.projectId,
    projectUpdatedAt: typeof candidate.projectUpdatedAt === 'string' ? candidate.projectUpdatedAt : '',
    exportedAt: typeof candidate.exportedAt === 'string' ? candidate.exportedAt : '',
    relativeProjectDirectory: candidate.relativeProjectDirectory,
    packageFileName: typeof candidate.packageFileName === 'string' ? candidate.packageFileName : DEFAULT_PROJECT_PACKAGE_FILE_NAME,
    warningCount: readNonNegativeCount(candidate.warningCount),
  };
}

function normalizeSafeCloudSyncIndexProject(
  project: CloudSyncIndexProject,
  syncDirectory: string,
): CloudSyncIndexProject | undefined {
  const projectDirectory = path.resolve(syncDirectory, project.relativeProjectDirectory);
  if (!isPathInsideDirectory(projectDirectory, syncDirectory)) {
    return undefined;
  }

  const relativeProjectDirectory = path.relative(path.resolve(syncDirectory), projectDirectory).replace(/\\/g, '/');
  if (!relativeProjectDirectory) {
    return undefined;
  }

  return {
    ...project,
    relativeProjectDirectory,
  };
}

function isRemoteNewer(remoteUpdatedAt: string, localUpdatedAt: string): boolean {
  return toTimestamp(remoteUpdatedAt) > toTimestamp(localUpdatedAt);
}

function toTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function readNonNegativeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function newestCloudSyncSnapshot(snapshots: CloudSyncSnapshot[]): CloudSyncSnapshot | undefined {
  return snapshots.reduce<CloudSyncSnapshot | undefined>((newest, snapshot) => {
    if (!newest) {
      return snapshot;
    }

    const projectUpdatedAtDelta = toTimestamp(snapshot.manifest.projectUpdatedAt) - toTimestamp(newest.manifest.projectUpdatedAt);
    if (projectUpdatedAtDelta !== 0) {
      return projectUpdatedAtDelta > 0 ? snapshot : newest;
    }

    return toTimestamp(snapshot.manifest.exportedAt) > toTimestamp(newest.manifest.exportedAt) ? snapshot : newest;
  }, undefined);
}

function normalizeSyncPathSegment(value: string): string {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72);
}

function isPathInsideDirectory(targetPath: string, directory: string): boolean {
  const relativePath = path.relative(path.resolve(directory), path.resolve(targetPath));
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
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
