import { deserializeProjectPackage, serializeProjectPackage, type ProjectPackageImport } from '../../lib/editor/project-store';
import type { EditorProject } from '../../lib/editor/types';
import type { EditorCloudSyncProjectImportResponse, EditorCloudSyncProjectResponse, EditorDirectoryDialogResponse, EditorProjectPackageExportResponse, EditorProjectPackageImportResponse } from '../shared/ipc-contract';
import { assertValidProjectJson } from '../shared/project-schema';
import { editorApiFetch } from './editor-api-client';
import { getWindowEditorIpcClient } from './editor-ipc-client';
import type { AutosaveSummary, SavedProjectSummary } from './editor-view-model';
import type { ProjectPackageExportPlan } from './project-persistence-workflow-helpers';

const LOCAL_PROJECT_KEY = 'danbi-editor-project';
const LOCAL_AUTOSAVE_KEY = 'danbi-editor-autosave';
const PROJECT_API_STATUS_TIMEOUT_MS = 5000;
const PROJECT_API_ACTION_TIMEOUT_MS = 10000;
const PROJECT_SAMPLE_PACKAGE_TIMEOUT_MS = 30000;

export interface ProjectPersistenceFetchOptions {
  signal?: AbortSignal;
}

export async function fetchSavedProjectSummaries(
  options: ProjectPersistenceFetchOptions = {},
): Promise<SavedProjectSummary[]> {
  const response = await editorApiFetch('/api/editor/projects', {
    signal: options.signal,
    timeoutMs: PROJECT_API_STATUS_TIMEOUT_MS,
  });
  if (!response.ok) {
    throw new Error(response.statusText);
  }

  const data = await response.json();
  return Array.isArray(data.projects) ? data.projects : [];
}

export async function fetchAutosaveSummaries(
  options: ProjectPersistenceFetchOptions = {},
): Promise<AutosaveSummary[]> {
  const response = await editorApiFetch('/api/editor/autosave', {
    signal: options.signal,
    timeoutMs: PROJECT_API_STATUS_TIMEOUT_MS,
  });
  if (!response.ok) {
    throw new Error(response.statusText);
  }

  const data = await response.json();
  return Array.isArray(data.autosaves) ? data.autosaves : [];
}

export async function saveAutosaveSnapshot(project: EditorProject, reason: string): Promise<AutosaveSummary> {
  const response = await editorApiFetch('/api/editor/autosave', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: PROJECT_API_ACTION_TIMEOUT_MS,
    body: JSON.stringify({ project, reason }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  return data.autosave as AutosaveSummary;
}

export function writeLocalAutosaveSnapshot(project: EditorProject): string {
  const savedAt = new Date().toISOString();
  localStorage.setItem(LOCAL_AUTOSAVE_KEY, serializeProjectPackage(project, savedAt));
  return savedAt;
}

export async function restoreAutosaveProject(projectId: string): Promise<EditorProject> {
  const response = await editorApiFetch(`/api/editor/autosave/${projectId}`, {
    timeoutMs: PROJECT_API_ACTION_TIMEOUT_MS,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  return data.project as EditorProject;
}

export async function deleteAutosaveSnapshot(projectId: string): Promise<void> {
  const response = await editorApiFetch(`/api/editor/autosave/${projectId}`, {
    method: 'DELETE',
    timeoutMs: PROJECT_API_ACTION_TIMEOUT_MS,
  });
  if (!response.ok) {
    throw new Error(response.statusText);
  }
}

export async function saveProjectToDatabase(project: EditorProject): Promise<EditorProject> {
  const response = await editorApiFetch('/api/editor/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: PROJECT_API_ACTION_TIMEOUT_MS,
    body: JSON.stringify({ project }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Save failed: ${readProjectPersistenceResponseError(data, response.statusText)}`);
  }

  return data.project as EditorProject;
}

export async function deleteProjectFromDatabase(projectId: string): Promise<{ deleted: true; id: string }> {
  const response = await editorApiFetch(`/api/editor/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
    timeoutMs: PROJECT_API_ACTION_TIMEOUT_MS,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Delete failed: ${readProjectPersistenceResponseError(data, response.statusText)}`);
  }

  return {
    deleted: true,
    id: typeof data.id === 'string' ? data.id : projectId,
  };
}

export function writeLocalProjectFallback(project: EditorProject): void {
  localStorage.setItem(LOCAL_PROJECT_KEY, serializeProjectPackage(project));
}

export async function loadProjectFromDatabase(projectId: string): Promise<EditorProject> {
  const response = await editorApiFetch(`/api/editor/projects/${projectId}`, {
    timeoutMs: PROJECT_API_ACTION_TIMEOUT_MS,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Load failed: ${readProjectPersistenceResponseError(data, response.statusText)}`);
  }

  return data.project as EditorProject;
}

export function readLocalProjectFallback(): ProjectPackageImport | null {
  const saved = localStorage.getItem(LOCAL_PROJECT_KEY);
  return saved ? validateProjectPackageImport(deserializeProjectPackage(saved), 'Cannot load local project fallback because its JSON is invalid') : null;
}

export function readLocalAutosaveFallback(): ProjectPackageImport | null {
  const saved = localStorage.getItem(LOCAL_AUTOSAVE_KEY);
  return saved ? validateProjectPackageImport(deserializeProjectPackage(saved), 'Cannot load local autosave fallback because its JSON is invalid') : null;
}

export function readBestLocalProjectFallback(): ProjectPackageImport | null {
  const candidates: ProjectPackageImport[] = [];
  const errors: unknown[] = [];

  for (const readCandidate of [readLocalProjectFallback, readLocalAutosaveFallback]) {
    try {
      const candidate = readCandidate();
      if (candidate) {
        candidates.push(candidate);
      }
    } catch (error) {
      errors.push(error);
    }
  }

  if (candidates.length === 0) {
    if (errors.length > 0) {
      throw errors[0];
    }

    return null;
  }

  return candidates.sort((a, b) => (
    readProjectPackageSavedAtMs(b) - readProjectPackageSavedAtMs(a)
  ))[0];
}

export function downloadProjectPackage(project: EditorProject, downloadName: string): void {
  const packageJson = serializeProjectPackage(project);
  const href = URL.createObjectURL(new Blob([packageJson], { type: 'application/json' }));
  const anchor = document.createElement('a');

  try {
    anchor.href = href;
    anchor.download = downloadName;
    anchor.click();
  } finally {
    URL.revokeObjectURL(href);
  }
}

export async function readProjectPackageFile(file: File): Promise<ProjectPackageImport> {
  return validateProjectPackageImport(
    deserializeProjectPackage(await file.text()),
    'Cannot import project package because its JSON is invalid',
  );
}

export interface ProjectPackageExportClientResult {
  mode: 'electron-folder' | 'browser-json';
  status: string;
  response?: EditorProjectPackageExportResponse;
}

export interface ProjectPackageDirectorySelectionRequest {
  mode: 'export' | 'import' | 'cloud-sync';
  defaultPath?: string;
}

export interface ProjectPackageDirectorySelectionResult {
  available: boolean;
  canceled: boolean;
  directory?: string;
}

export async function selectProjectPackageDirectory(
  request: ProjectPackageDirectorySelectionRequest,
): Promise<ProjectPackageDirectorySelectionResult> {
  const client = getWindowEditorIpcClient();
  if (!client?.dialogs?.selectDirectory) {
    return { available: false, canceled: false };
  }

  const result = await client.dialogs.selectDirectory({
    title: request.mode === 'export'
      ? 'Export project package folder'
      : request.mode === 'import'
        ? 'Import project package folder'
        : 'Select cloud sync folder',
    defaultPath: request.defaultPath,
    buttonLabel: request.mode === 'export'
      ? 'Export package'
      : request.mode === 'import'
        ? 'Import package'
        : 'Sync project',
    mode: request.mode === 'import' ? 'open' : 'save',
    allowCreate: request.mode !== 'import',
  }) as EditorDirectoryDialogResponse;

  return {
    available: true,
    canceled: result.canceled,
    ...(result.directory ? { directory: result.directory } : {}),
  };
}

export interface ProjectCloudSyncClientResult {
  available: boolean;
  status: string;
  response?: EditorCloudSyncProjectResponse;
}

export async function syncProjectToCloudFolderBestAvailable(
  project: EditorProject,
  syncDirectory: string,
  options: { force?: boolean } = {},
): Promise<ProjectCloudSyncClientResult> {
  const client = getWindowEditorIpcClient();
  if (!client?.projects.syncCloudFolder) {
    return {
      available: false,
      status: 'Cloud sync requires the Electron desktop runtime.',
    };
  }

  const response = await client.projects.syncCloudFolder({
    project,
    syncDirectory,
    ...(options.force ? { force: true } : {}),
  }) as EditorCloudSyncProjectResponse;
  const copiedCount = response.copiedMedia.filter((item) => item.status === 'copied').length;
  const warningText = response.warnings.length > 0 ? ` (${response.warnings.length} warnings)` : '';

  return {
    available: true,
    response,
    status: response.status === 'conflict'
      ? `Cloud sync conflict: ${response.warnings[0] ?? 'target has a newer project snapshot'} Use Import synced to load it or Force sync to overwrite the sync folder.`
      : `Project synced to ${response.projectSyncDirectory} with ${copiedCount} media file${copiedCount === 1 ? '' : 's'}${warningText}`,
  };
}

export async function exportProjectPackageBestAvailable(
  project: EditorProject,
  plan: ProjectPackageExportPlan,
): Promise<ProjectPackageExportClientResult> {
  const client = getWindowEditorIpcClient();

  if (client?.projects.exportPackage) {
    const response = await client.projects.exportPackage({
      project,
      packageDirectory: plan.packageDirectory,
    }) as EditorProjectPackageExportResponse;
    const copiedCount = response.copiedMedia.filter((item) => item.status === 'copied').length;
    const warningText = response.warnings.length > 0 ? ` (${response.warnings.length} warnings)` : '';

    return {
      mode: 'electron-folder',
      response,
      status: `Project package exported to ${response.packageDirectory} with ${copiedCount} media file${copiedCount === 1 ? '' : 's'}${warningText}`,
    };
  }

  downloadProjectPackage(project, plan.downloadName);
  return {
    mode: 'browser-json',
    status: plan.status,
  };
}

export async function readElectronProjectPackageFolder(packageDirectory: string): Promise<EditorProjectPackageImportResponse | null> {
  const client = getWindowEditorIpcClient();
  if (!client?.projects.importPackage) {
    return null;
  }

  return client.projects.importPackage({ packageDirectory }) as Promise<EditorProjectPackageImportResponse>;
}

export async function readCloudSyncProjectBestAvailable(
  syncDirectory: string,
  projectId: string,
): Promise<EditorCloudSyncProjectImportResponse | null> {
  const client = getWindowEditorIpcClient();
  if (!client?.projects.importCloudSyncProject) {
    return null;
  }

  return client.projects.importCloudSyncProject({ syncDirectory, projectId }) as Promise<EditorCloudSyncProjectImportResponse>;
}

export async function fetchSampleProjectPackageMetadata(
  options: ProjectPersistenceFetchOptions = {},
): Promise<{
  available: boolean;
  packageDirectory?: string;
  projectFilePath?: string;
  candidates?: string[];
}> {
  const response = await editorApiFetch('/api/editor/sample?metadata=1', {
    signal: options.signal,
    timeoutMs: PROJECT_API_STATUS_TIMEOUT_MS,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(readProjectPersistenceResponseError(data, response.statusText));
  }

  return {
    available: Boolean((data as { available?: unknown }).available),
    ...readOptionalTextProperty(data, 'packageDirectory'),
    ...readOptionalTextProperty(data, 'projectFilePath'),
    candidates: Array.isArray((data as { candidates?: unknown }).candidates)
      ? (data as { candidates: unknown[] }).candidates.filter((item): item is string => typeof item === 'string')
      : undefined,
  };
}

export async function readSampleProjectPackageBestAvailable(
  packageDirectory?: string,
): Promise<EditorProjectPackageImportResponse | null> {
  if (packageDirectory) {
    const importedFolder = await readElectronProjectPackageFolder(packageDirectory);
    if (importedFolder) {
      return importedFolder;
    }
  }

  const response = await editorApiFetch('/api/editor/sample', {
    timeoutMs: PROJECT_SAMPLE_PACKAGE_TIMEOUT_MS,
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(readProjectPersistenceResponseError(data, response.statusText));
  }

  return data as EditorProjectPackageImportResponse;
}

function readProjectPersistenceResponseError(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') {
    return fallback;
  }

  const response = data as { error?: unknown; errors?: unknown };
  const baseMessage = typeof response.error === 'string' && response.error.length > 0
    ? response.error
    : fallback;
  const validationErrors = Array.isArray(response.errors)
    ? response.errors.filter((item): item is string => typeof item === 'string')
    : [];

  return validationErrors.length > 0
    ? `${baseMessage}\n${validationErrors.join('\n')}`
    : baseMessage;
}

function readOptionalTextProperty(data: unknown, key: 'packageDirectory' | 'projectFilePath'): { [K in typeof key]?: string } {
  if (!data || typeof data !== 'object') {
    return {};
  }

  const value = (data as Record<string, unknown>)[key];
  return typeof value === 'string' && value ? { [key]: value } : {};
}

function validateProjectPackageImport(imported: ProjectPackageImport, heading: string): ProjectPackageImport {
  return {
    ...imported,
    project: assertValidProjectJson(imported.project, heading),
  };
}

function readProjectPackageSavedAtMs(imported: ProjectPackageImport): number {
  const exportedAtTimestamp = imported.exportedAt ? Date.parse(imported.exportedAt) : Number.NaN;
  const timestamp = Number.isFinite(exportedAtTimestamp)
    ? exportedAtTimestamp
    : Date.parse(imported.project.updatedAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
