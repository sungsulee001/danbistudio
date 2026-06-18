import { createHash } from 'crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'fs/promises';
import { join } from 'path';
import {
  assertValidProjectJson,
  parseProjectJson,
  stringifyProjectJson,
  summarizeProjectJson,
  type ProjectSummary,
} from '../shared/project-schema';
import type { EditorProjectRepository } from './project-store-adapter';

export interface NativeProjectRepositoryOptions {
  rootDir: string;
}

interface NativeProjectSummaryEntry {
  summary: ProjectSummary;
  filename: string;
  filenameRank: number;
}

export function createNativeProjectRepository({
  rootDir,
}: NativeProjectRepositoryOptions): EditorProjectRepository {
  return {
    async list() {
      await ensureProjectRoot(rootDir);
      const entries = await readdir(rootDir, { withFileTypes: true });
      const projectSummaries = await Promise.all(entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => readProjectSummaryFile(rootDir, entry.name)));
      const projects = dedupeProjectSummariesById(projectSummaries.filter((entry): entry is NativeProjectSummaryEntry => Boolean(entry)));

      return {
        projects: projects.map((entry) => entry.summary).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      };
    },
    async load(id) {
      for (const filePath of projectFilePathCandidates(rootDir, id)) {
        const loadedProject = await readProjectFileById(filePath, id);
        if (loadedProject) {
          return loadedProject;
        }
      }

      return undefined;
    },
    async save(project) {
      await ensureProjectRoot(rootDir);
      const updatedProject = assertValidProjectJson({
        ...project,
        updatedAt: new Date().toISOString(),
      }, 'Cannot save native editor project because its JSON is invalid');
      const filePath = await writableProjectFilePath(rootDir, updatedProject.id);
      await writeProjectFileAtomically(filePath, stringifyProjectJson(updatedProject, true));
      await removeLegacyProjectFiles(rootDir, updatedProject.id, filePath);
      const fileStat = await stat(filePath);

      return {
        project: updatedProject,
        summary: summarizeProjectJson(updatedProject, fileStat.birthtime, fileStat.mtime),
      };
    },
    async delete(id) {
      await Promise.all(projectFilePathCandidates(rootDir, id).map((filePath) => removeProjectFileIfItMatchesId(filePath, id)));
      return { deleted: true, id };
    },
  };
}

async function readProjectFileById(
  filePath: string,
  projectId: string,
): Promise<{ project: ReturnType<typeof parseProjectJson>; summary: ProjectSummary } | undefined> {
  try {
    const [data, fileStat] = await Promise.all([
      readFile(filePath, 'utf8'),
      stat(filePath),
    ]);
    const project = parseProjectJson(data);
    if (project.id !== projectId) {
      return undefined;
    }

    return {
      project,
      summary: summarizeProjectJson(project, fileStat.birthtime, fileStat.mtime),
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }

    throw error;
  }
}

async function readProjectSummaryFile(rootDir: string, filename: string): Promise<NativeProjectSummaryEntry | undefined> {
  const filePath = join(rootDir, filename);
  let data: string;
  let fileStat: Awaited<ReturnType<typeof stat>>;

  try {
    [data, fileStat] = await Promise.all([
      readFile(filePath, 'utf8'),
      stat(filePath),
    ]);
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }

    throw error;
  }

  try {
    const project = parseProjectJson(data);
    return {
      summary: summarizeProjectJson(project, fileStat.birthtime, fileStat.mtime),
      filename,
      filenameRank: rankProjectSummaryFilename(filename, project.id),
    };
  } catch {
    return undefined;
  }
}

function dedupeProjectSummariesById(projects: NativeProjectSummaryEntry[]): NativeProjectSummaryEntry[] {
  const projectsById = new Map<string, NativeProjectSummaryEntry>();

  for (const project of projects) {
    const previousProject = projectsById.get(project.summary.id);
    if (!previousProject || compareProjectSummaryEntries(project, previousProject) > 0) {
      projectsById.set(project.summary.id, project);
    }
  }

  return Array.from(projectsById.values());
}

function compareProjectSummaryEntries(left: NativeProjectSummaryEntry, right: NativeProjectSummaryEntry): number {
  const rankDelta = left.filenameRank - right.filenameRank;
  if (rankDelta !== 0) {
    return rankDelta;
  }

  return left.summary.updatedAt.localeCompare(right.summary.updatedAt);
}

function rankProjectSummaryFilename(filename: string, projectId: string): number {
  if (filename === `${normalizeNativeProjectFileStem(projectId)}.json`) {
    return 3;
  }

  if (filename === `${normalizeHashedNativeProjectFileStem(projectId)}.json`) {
    return 2;
  }

  if (filename === `${normalizeLegacyNativeProjectFileStem(projectId)}.json`) {
    return 1;
  }

  return 0;
}

function ensureProjectRoot(rootDir: string): Promise<void> {
  return mkdir(rootDir, { recursive: true }).then(() => undefined);
}

function projectFilePath(rootDir: string, projectId: string): string {
  return join(rootDir, `${normalizeNativeProjectFileStem(projectId)}.json`);
}

function projectFilePathCandidates(rootDir: string, projectId: string): string[] {
  return uniqueStrings([
    projectFilePath(rootDir, projectId),
    caseCollisionSafeProjectFilePath(rootDir, projectId),
    legacyProjectFilePath(rootDir, projectId),
  ]);
}

async function writableProjectFilePath(rootDir: string, projectId: string): Promise<string> {
  const canonicalFilePath = projectFilePath(rootDir, projectId);
  const canonicalProjectId = await readProjectIdFromExistingFile(canonicalFilePath);
  if (!canonicalProjectId || canonicalProjectId === projectId) {
    return canonicalFilePath;
  }

  return caseCollisionSafeProjectFilePath(rootDir, projectId);
}

function legacyProjectFilePath(rootDir: string, projectId: string): string {
  return join(rootDir, `${normalizeLegacyNativeProjectFileStem(projectId)}.json`);
}

function caseCollisionSafeProjectFilePath(rootDir: string, projectId: string): string {
  return join(rootDir, `${normalizeHashedNativeProjectFileStem(projectId)}.json`);
}

async function readProjectIdFromExistingFile(filePath: string): Promise<string | undefined> {
  let data: string;
  try {
    data = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }

    throw error;
  }

  try {
    return parseProjectJson(data).id;
  } catch {
    return undefined;
  }
}

async function removeLegacyProjectFiles(rootDir: string, projectId: string, canonicalFilePath: string): Promise<void> {
  const legacyFilePaths = projectFilePathCandidates(rootDir, projectId).filter((filePath) => filePath !== canonicalFilePath);
  await Promise.all(legacyFilePaths.map((filePath) => removeProjectFileIfItMatchesId(filePath, projectId)));
}

async function removeProjectFileIfItMatchesId(filePath: string, projectId: string): Promise<void> {
  let data: string;
  try {
    data = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isMissingFileError(error)) {
      return;
    }

    throw error;
  }

  try {
    const project = parseProjectJson(data);
    if (project.id === projectId) {
      await rm(filePath, { force: true });
    }
  } catch {
    return;
  }
}

async function writeProjectFileAtomically(filePath: string, contents: string): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  try {
    await writeFile(tempPath, contents, 'utf8');
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}

const WINDOWS_RESERVED_PROJECT_FILE_STEMS = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);
const MAX_NATIVE_PROJECT_FILE_STEM_LENGTH = 120;

function normalizeNativeProjectFileStem(projectId: string): string {
  const encoded = encodeNativeProjectFileStem(projectId);
  return normalizeProjectFileStemFromEncodedId(encoded, projectId, true);
}

function normalizeLegacyNativeProjectFileStem(projectId: string): string {
  return normalizeProjectFileStemFromEncodedId(encodeURIComponent(projectId), projectId, false);
}

function normalizeHashedNativeProjectFileStem(projectId: string): string {
  const encoded = encodeNativeProjectFileStem(projectId);
  const trimmed = encoded.replace(/^[.]+|[.]+$/g, '');
  const hash = shortProjectIdHash(projectId);

  if (!trimmed) {
    return `project-${hash}`;
  }

  const windowsStem = trimmed.replace(/[. ]+$/g, '').toUpperCase();
  if (WINDOWS_RESERVED_PROJECT_FILE_STEMS.has(windowsStem)) {
    return `project-${trimmed}-${hash}`;
  }

  const hashedStem = `${trimmed.toLowerCase()}-${hash}`;
  if (hashedStem.length > MAX_NATIVE_PROJECT_FILE_STEM_LENGTH) {
    return `${hashedStem.slice(0, MAX_NATIVE_PROJECT_FILE_STEM_LENGTH - hash.length - 1)}-${hash}`;
  }

  return hashedStem;
}

function normalizeProjectFileStemFromEncodedId(
  encoded: string,
  projectId: string,
  caseSafe: boolean,
): string {
  const trimmed = encoded.replace(/^[.]+|[.]+$/g, '');
  const hash = shortProjectIdHash(projectId);

  if (!trimmed) {
    return `project-${hash}`;
  }

  const windowsStem = trimmed.replace(/[. ]+$/g, '').toUpperCase();
  if (WINDOWS_RESERVED_PROJECT_FILE_STEMS.has(windowsStem)) {
    return `project-${trimmed}-${hash}`;
  }

  const caseSafeStem = caseSafe ? normalizeCaseSafeProjectFileStem(trimmed, hash) : trimmed;
  if (caseSafeStem.length > MAX_NATIVE_PROJECT_FILE_STEM_LENGTH) {
    return `${caseSafeStem.slice(0, MAX_NATIVE_PROJECT_FILE_STEM_LENGTH - hash.length - 1)}-${hash}`;
  }

  return caseSafeStem;
}

function encodeNativeProjectFileStem(projectId: string): string {
  return encodeURIComponent(projectId).replace(/\*/g, '%2A');
}

function normalizeCaseSafeProjectFileStem(stem: string, hash: string): string {
  const lowercaseStem = stem.toLowerCase();
  return lowercaseStem === stem ? stem : `${lowercaseStem}-${hash}`;
}

function shortProjectIdHash(projectId: string): string {
  return createHash('sha256').update(projectId).digest('hex').slice(0, 8);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
