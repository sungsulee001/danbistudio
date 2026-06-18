import { resolveProjectSaveState, type ProjectSaveState } from '../../lib/editor/save-state';
import type { ProjectPackageImport } from '../../lib/editor/project-store';
import type { Cmx3600EdlProjectImport } from '../../lib/editor/edl';
import type { FcpxmlProjectImport } from '../../lib/editor/fcpxml';
import { buildProjectRecoveryCandidateFromProject, buildProjectRecoveryIndex, type ProjectRecoveryCandidate, type ProjectRecoveryIndex } from '../../lib/editor/project-recovery';
import { DEFAULT_EXPORT_PROFILE_ID } from '../../lib/editor/project';
import type { EditorProject } from '../../lib/editor/types';
import { formatClockTime } from './editor-time-helpers';
import { safeDownloadName } from './timeline-source-helpers';
import type { AutosaveSummary, SavedProjectSummary } from './editor-view-model';
import {
  buildAutosavedProjectText,
  buildSavedProjectMarkers,
  buildUnsavedProjectMarkers,
  type ProjectSaveMarkers,
} from './project-history-controller';

export type ProjectPersistenceSessionKind =
  | 'new-project'
  | 'autosave-restore'
  | 'database-load'
  | 'local-fallback-load'
  | 'package-import'
  | 'edl-import'
  | 'fcpxml-import';

export interface ProjectPersistenceSessionState {
  project: EditorProject;
  history: EditorProject[];
  future: EditorProject[];
  selectedClipId: string;
  playhead: number;
  saveMarkers: ProjectSaveMarkers;
  selectedExportProfileId: string;
  status: string;
}

export interface AutosaveSaveSuccessState {
  autosaves: AutosaveSummary[];
  autosaveStatus: string;
  autosavedProjectText: string;
}

export interface AutosaveDeleteState {
  autosaves: AutosaveSummary[];
  clearLastAutosavedProjectText: boolean;
  status: string;
}

export interface ProjectSaveSuccessState {
  project: EditorProject;
  saveMarkers: ProjectSaveMarkers;
  status: string;
}

export interface ProjectDeleteState {
  projects: SavedProjectSummary[];
  saveMarkers?: ProjectSaveMarkers;
  shouldClearCurrentSaveMarkers: boolean;
  status: string;
}

export interface ProjectCloudSyncConflictState {
  directory: string;
  projectId: string;
  projectUpdatedAt: string;
  projectText: string;
  previousProjectUpdatedAt?: string;
}

export type ProjectCloudSyncForcePlan =
  | {
    status: 'ready';
    directory: string;
  }
  | {
    status: 'blocked';
    clearConflict: boolean;
    message: string;
  };

export interface ProjectSaveCopyOptions {
  id?: string;
  name?: string;
  savedAt?: string;
}

export interface LocalAutosaveFallbackState {
  autosavedProjectText: string;
  autosaveStatus: string;
}

export interface LocalProjectSaveFallbackState {
  autosavedProjectText: string;
  status: string;
}

export interface ProjectAutosaveEffectState {
  shouldScheduleAutosave: boolean;
  autosaveDelayMs: number;
  shouldWarnBeforeUnload: boolean;
  shouldWriteEmergencyLocalAutosave: boolean;
  autosaveStatus?: string;
}

export type ProjectPersistenceConsistencyIssueType =
  | 'history-limit-exceeded'
  | 'future-limit-exceeded'
  | 'history-current-duplicate'
  | 'future-current-duplicate'
  | 'invalid-saved-marker'
  | 'invalid-autosaved-marker';

export interface ProjectPersistenceConsistencyIssue {
  type: ProjectPersistenceConsistencyIssueType;
  message: string;
}

export interface ProjectPersistenceConsistencyAuditReport {
  status: 'passed' | 'failed';
  saveState: ProjectSaveState;
  historyCount: number;
  futureCount: number;
  historyLimit: number;
  shouldScheduleAutosave: boolean;
  shouldWarnBeforeUnload: boolean;
  savedMarkerPresent: boolean;
  autosavedMarkerPresent: boolean;
  issues: ProjectPersistenceConsistencyIssue[];
}

export interface ProjectPersistenceConsistencyResolutionState {
  audit: ProjectPersistenceConsistencyAuditReport;
  history: EditorProject[];
  future: EditorProject[];
  saveMarkers: ProjectSaveMarkers;
  shouldUpdateHistory: boolean;
  shouldUpdateFuture: boolean;
  shouldUpdateSaveMarkers: boolean;
}

export interface ProjectPackageExportPlan {
  downloadName: string;
  packageDirectory: string;
  status: string;
}

export interface ProjectRecoveryIndexState {
  index: ProjectRecoveryIndex;
  status: string;
}

export type ProjectPersistenceFailureKind =
  | 'autosave'
  | 'autosave-restore'
  | 'autosave-delete'
  | 'project-save'
  | 'project-delete'
  | 'project-package-export'
  | 'project-package-import';

export function resolveProjectPersistenceSession({
  currentProject,
  history,
  nextProject,
  kind,
  warningCount = 0,
}: {
  currentProject: EditorProject;
  history: EditorProject[];
  nextProject: EditorProject;
  kind: ProjectPersistenceSessionKind;
  warningCount?: number;
}): ProjectPersistenceSessionState {
  const nextProjectText = buildAutosavedProjectText(nextProject);
  const currentProjectText = buildAutosavedProjectText(currentProject);
  const shouldResetUndoState = kind === 'new-project';

  return {
    project: nextProject,
    history: shouldResetUndoState || currentProjectText === nextProjectText ? [] : appendUndoHistory(history, currentProject),
    future: [],
    selectedClipId: firstTimelineClipId(nextProject),
    playhead: 0,
    saveMarkers: resolvePersistenceSaveMarkers(nextProject, kind),
    selectedExportProfileId: nextProject.exportProfiles[0]?.id ?? DEFAULT_EXPORT_PROFILE_ID,
    status: resolvePersistenceStatus(kind, warningCount),
  };
}

export function resolveLocalFallbackProjectLoadSession({
  currentProject,
  history,
  restoredPackage,
}: {
  currentProject: EditorProject;
  history: EditorProject[];
  restoredPackage: ProjectPackageImport;
}): ProjectPersistenceSessionState {
  return resolveProjectPersistenceSession({
    currentProject,
    history,
    nextProject: restoredPackage.project,
    kind: 'local-fallback-load',
    warningCount: restoredPackage.warnings.length,
  });
}

export function resolveProjectPackageImportSession({
  currentProject,
  history,
  importedPackage,
}: {
  currentProject: EditorProject;
  history: EditorProject[];
  importedPackage: ProjectPackageImport;
}): ProjectPersistenceSessionState {
  return resolveProjectPersistenceSession({
    currentProject,
    history,
    nextProject: importedPackage.project,
    kind: 'package-import',
    warningCount: importedPackage.warnings.length,
  });
}

export function resolveEdlProjectImportSession({
  currentProject,
  history,
  imported,
}: {
  currentProject: EditorProject;
  history: EditorProject[];
  imported: Cmx3600EdlProjectImport;
}): ProjectPersistenceSessionState {
  return resolveProjectPersistenceSession({
    currentProject,
    history,
    nextProject: imported.project,
    kind: 'edl-import',
    warningCount: imported.warnings.length,
  });
}

export function resolveFcpxmlProjectImportSession({
  currentProject,
  history,
  imported,
}: {
  currentProject: EditorProject;
  history: EditorProject[];
  imported: FcpxmlProjectImport;
}): ProjectPersistenceSessionState {
  return resolveProjectPersistenceSession({
    currentProject,
    history,
    nextProject: imported.project,
    kind: 'fcpxml-import',
    warningCount: imported.warnings.length,
  });
}

export function resolveProjectSaveSuccessState(savedProject: EditorProject): ProjectSaveSuccessState {
  return {
    project: savedProject,
    saveMarkers: buildSavedProjectMarkers(savedProject),
    status: 'Project saved to database',
  };
}

export function buildProjectSaveCopy(
  project: EditorProject,
  options: ProjectSaveCopyOptions = {},
): EditorProject {
  const savedAt = options.savedAt ?? new Date().toISOString();
  return {
    ...project,
    id: options.id ?? buildProjectCopyId(project, savedAt),
    name: options.name ?? buildProjectCopyName(project.name),
    updatedAt: savedAt,
  };
}

export function resolveProjectSaveCopySuccessState(savedProject: EditorProject): ProjectSaveSuccessState {
  return {
    project: savedProject,
    saveMarkers: buildSavedProjectMarkers(savedProject),
    status: 'Project saved as copy',
  };
}

export function resolveProjectAutosaveEffectState(
  projectSaveState: ProjectSaveState,
  autosaveDelayMs = 4000,
): ProjectAutosaveEffectState {
  const isDirty = projectSaveState === 'dirty';

  return {
    shouldScheduleAutosave: isDirty,
    autosaveDelayMs,
    shouldWarnBeforeUnload: isDirty,
    shouldWriteEmergencyLocalAutosave: isDirty,
    ...(isDirty ? { autosaveStatus: 'Unsaved changes pending autosave' } : {}),
  };
}

export function shouldWriteProjectReplacementFallback(projectSaveState: ProjectSaveState): boolean {
  return projectSaveState === 'dirty';
}

export function buildProjectCloudSyncConflictState({
  directory,
  project,
  previousProjectUpdatedAt,
}: {
  directory: string;
  project: EditorProject;
  previousProjectUpdatedAt?: string;
}): ProjectCloudSyncConflictState {
  return {
    directory,
    projectId: project.id,
    projectUpdatedAt: project.updatedAt,
    projectText: buildAutosavedProjectText(project),
    ...(previousProjectUpdatedAt ? { previousProjectUpdatedAt } : {}),
  };
}

export function resolveProjectCloudSyncForcePlan({
  conflict,
  project,
}: {
  conflict: ProjectCloudSyncConflictState | null;
  project: EditorProject;
}): ProjectCloudSyncForcePlan {
  if (!conflict) {
    return {
      status: 'blocked',
      clearConflict: false,
      message: 'No cloud sync conflict to force.',
    };
  }

  if (
    conflict.projectId !== project.id ||
    conflict.projectUpdatedAt !== project.updatedAt ||
    conflict.projectText !== buildAutosavedProjectText(project)
  ) {
    return {
      status: 'blocked',
      clearConflict: true,
      message: 'Cloud sync conflict expired because the current project changed. Sync folder again before forcing.',
    };
  }

  return {
    status: 'ready',
    directory: conflict.directory,
  };
}

export function resolveProjectDeleteState({
  projects,
  deletedProjectId,
  currentProjectId,
}: {
  projects: SavedProjectSummary[];
  deletedProjectId: string;
  currentProjectId: string;
}): ProjectDeleteState {
  const shouldClearCurrentSaveMarkers = deletedProjectId === currentProjectId;

  return {
    projects: projects.filter((project) => project.id !== deletedProjectId),
    shouldClearCurrentSaveMarkers,
    saveMarkers: shouldClearCurrentSaveMarkers ? buildUnsavedProjectMarkers() : undefined,
    status: shouldClearCurrentSaveMarkers
      ? 'Project deleted; current project remains open as unsaved'
      : 'Project deleted',
  };
}

export function auditProjectPersistenceConsistency({
  project,
  history,
  future,
  saveMarkers,
  autosaveDelayMs = 4000,
  historyLimit = 50,
}: {
  project: EditorProject;
  history: EditorProject[];
  future: EditorProject[];
  saveMarkers: ProjectSaveMarkers;
  autosaveDelayMs?: number;
  historyLimit?: number;
}): ProjectPersistenceConsistencyAuditReport {
  const currentProjectText = buildAutosavedProjectText(project);
  const normalizedHistoryLimit = Math.max(1, Math.floor(historyLimit));
  const saveState = resolveProjectSaveState(
    currentProjectText,
    saveMarkers.lastSavedProjectText,
    saveMarkers.lastAutosavedProjectText,
  );
  const autosaveEffect = resolveProjectAutosaveEffectState(saveState, autosaveDelayMs);
  const issues: ProjectPersistenceConsistencyIssue[] = [];

  if (history.length > normalizedHistoryLimit) {
    issues.push({
      type: 'history-limit-exceeded',
      message: `Undo history has ${history.length} item(s), exceeding the ${normalizedHistoryLimit} item limit.`,
    });
  }

  if (future.length > normalizedHistoryLimit) {
    issues.push({
      type: 'future-limit-exceeded',
      message: `Redo history has ${future.length} item(s), exceeding the ${normalizedHistoryLimit} item limit.`,
    });
  }

  if (history.length > 0 && buildAutosavedProjectText(history[history.length - 1]) === currentProjectText) {
    issues.push({
      type: 'history-current-duplicate',
      message: 'Undo history top matches the current project; a no-op edit was recorded.',
    });
  }

  if (future.length > 0 && buildAutosavedProjectText(future[0]) === currentProjectText) {
    issues.push({
      type: 'future-current-duplicate',
      message: 'Redo history top matches the current project; redo would be a no-op.',
    });
  }

  if (saveMarkers.lastSavedProjectText && !looksLikeSerializedEditorProject(saveMarkers.lastSavedProjectText)) {
    issues.push({
      type: 'invalid-saved-marker',
      message: 'Saved project marker is not a serialized editor project.',
    });
  }

  if (saveMarkers.lastAutosavedProjectText && !looksLikeSerializedEditorProject(saveMarkers.lastAutosavedProjectText)) {
    issues.push({
      type: 'invalid-autosaved-marker',
      message: 'Autosaved project marker is not a serialized editor project.',
    });
  }

  return {
    status: issues.length === 0 ? 'passed' : 'failed',
    saveState,
    historyCount: history.length,
    futureCount: future.length,
    historyLimit: normalizedHistoryLimit,
    shouldScheduleAutosave: autosaveEffect.shouldScheduleAutosave,
    shouldWarnBeforeUnload: autosaveEffect.shouldWarnBeforeUnload,
    savedMarkerPresent: Boolean(saveMarkers.lastSavedProjectText),
    autosavedMarkerPresent: Boolean(saveMarkers.lastAutosavedProjectText),
    issues,
  };
}

export function resolveProjectPersistenceConsistencyState({
  project,
  history,
  future,
  saveMarkers,
  autosaveDelayMs = 4000,
  historyLimit = 50,
}: {
  project: EditorProject;
  history: EditorProject[];
  future: EditorProject[];
  saveMarkers: ProjectSaveMarkers;
  autosaveDelayMs?: number;
  historyLimit?: number;
}): ProjectPersistenceConsistencyResolutionState {
  const audit = auditProjectPersistenceConsistency({
    project,
    history,
    future,
    saveMarkers,
    autosaveDelayMs,
    historyLimit,
  });
  const currentProjectText = buildAutosavedProjectText(project);
  const normalizedHistoryLimit = Math.max(1, Math.floor(historyLimit));
  const normalizedHistory = removeCurrentProjectDuplicatesFromHistory(
    history.slice(-normalizedHistoryLimit),
    currentProjectText,
  );
  const normalizedFuture = removeCurrentProjectDuplicatesFromFuture(
    future.slice(0, normalizedHistoryLimit),
    currentProjectText,
  );
  const normalizedSaveMarkers = {
    lastSavedProjectText: saveMarkers.lastSavedProjectText && looksLikeSerializedEditorProject(saveMarkers.lastSavedProjectText)
      ? saveMarkers.lastSavedProjectText
      : '',
    lastAutosavedProjectText: saveMarkers.lastAutosavedProjectText && looksLikeSerializedEditorProject(saveMarkers.lastAutosavedProjectText)
      ? saveMarkers.lastAutosavedProjectText
      : '',
  };

  return {
    audit,
    history: normalizedHistory,
    future: normalizedFuture,
    saveMarkers: normalizedSaveMarkers,
    shouldUpdateHistory: normalizedHistory.length !== history.length
      || normalizedHistory.some((entry, index) => entry !== history[index + history.length - normalizedHistory.length]),
    shouldUpdateFuture: normalizedFuture.length !== future.length
      || normalizedFuture.some((entry, index) => entry !== future[index]),
    shouldUpdateSaveMarkers: normalizedSaveMarkers.lastSavedProjectText !== saveMarkers.lastSavedProjectText
      || normalizedSaveMarkers.lastAutosavedProjectText !== saveMarkers.lastAutosavedProjectText,
  };
}

export function resolveAutosaveSaveSuccessState({
  currentAutosaves,
  summary,
  project,
}: {
  currentAutosaves: AutosaveSummary[];
  summary: AutosaveSummary;
  project: EditorProject;
}): AutosaveSaveSuccessState {
  return {
    autosaves: [
      summary,
      ...currentAutosaves.filter((item) => item.projectId !== summary.projectId),
    ].sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
    autosaveStatus: `Autosaved ${formatClockTime(summary.savedAt)}`,
    autosavedProjectText: buildAutosavedProjectText(project),
  };
}

export function resolveLocalAutosaveFallbackState({
  project,
  savedAt,
}: {
  project: EditorProject;
  savedAt: string;
}): LocalAutosaveFallbackState {
  return {
    autosavedProjectText: buildAutosavedProjectText(project),
    autosaveStatus: resolveLocalAutosaveStatus(savedAt),
  };
}

export function resolveLocalAutosaveStatus(savedAt: string): string {
  return `Local autosave ${formatClockTime(savedAt)}`;
}

export function resolveLocalProjectSaveFallbackState({
  project,
  errorMessage,
}: {
  project: EditorProject;
  errorMessage: string;
}): LocalProjectSaveFallbackState {
  return {
    autosavedProjectText: buildAutosavedProjectText(project),
    status: `Saved locally: ${errorMessage}`,
  };
}

export function resolveProjectPersistenceErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function resolveProjectPersistenceFailureStatus(
  kind: ProjectPersistenceFailureKind,
  error: unknown,
): string {
  const message = resolveProjectPersistenceErrorMessage(error);

  switch (kind) {
    case 'autosave':
      return `Autosave failed: ${message}`;
    case 'autosave-restore':
      return `Autosave restore failed: ${message}`;
    case 'autosave-delete':
      return `Autosave delete failed: ${message}`;
    case 'project-save':
      return `Project save failed: ${message}`;
    case 'project-delete':
      return `Project delete failed: ${message}`;
    case 'project-package-export':
      return `Project package export failed: ${message}`;
    case 'project-package-import':
      return `Project package import failed: ${message}`;
  }
}

export function resolveProjectPersistenceFallbackFailureStatus({
  kind,
  primaryError,
  fallbackLabel,
  fallbackError,
}: {
  kind: ProjectPersistenceFailureKind;
  primaryError: unknown;
  fallbackLabel: string;
  fallbackError: unknown;
}): string {
  return `${resolveProjectPersistenceFailureStatus(kind, primaryError)}; ${fallbackLabel} failed: ${resolveProjectPersistenceErrorMessage(fallbackError)}`;
}

export function resolveAutosaveDeleteState({
  autosaves,
  deletedProjectId,
  currentProjectId,
}: {
  autosaves: AutosaveSummary[];
  deletedProjectId: string;
  currentProjectId: string;
}): AutosaveDeleteState {
  return {
    autosaves: autosaves.filter((item) => item.projectId !== deletedProjectId),
    clearLastAutosavedProjectText: deletedProjectId === currentProjectId,
    status: 'Autosave deleted',
  };
}

export function resolveProjectLoadTargetId({
  requestedProjectId,
  savedProjects,
  currentProjectId,
}: {
  requestedProjectId?: string;
  savedProjects: SavedProjectSummary[];
  currentProjectId: string;
}): string {
  return requestedProjectId ?? savedProjects[0]?.id ?? currentProjectId;
}

export function resolveProjectPackageExportPlan(project: EditorProject): ProjectPackageExportPlan {
  const safeName = safeDownloadName(project.name || project.id);

  return {
    downloadName: `${safeName}.danbi-project.json`,
    packageDirectory: `.danbi/packages/${safeName}`,
    status: 'Project package exported',
  };
}

export function resolveProjectRecoveryIndexState({
  savedProjects,
  autosaves,
  localFallback,
  packageImport,
  currentProjectId,
}: {
  savedProjects: SavedProjectSummary[];
  autosaves: AutosaveSummary[];
  localFallback?: ProjectPackageImport | null;
  packageImport?: ProjectPackageImport | null;
  currentProjectId?: string;
}): ProjectRecoveryIndexState {
  const candidates: ProjectRecoveryCandidate[] = [
    ...savedProjects.map((project) => ({
      id: `database:${project.id}`,
      projectId: project.id,
      name: project.name,
      source: 'database' as const,
      savedAt: project.updatedAt,
      duration: project.duration,
      clipCount: project.clipCount,
      warningCount: 0,
    })),
    ...autosaves.map((autosave) => ({
      id: `autosave:${autosave.projectId}`,
      projectId: autosave.projectId,
      name: autosave.name,
      source: 'autosave' as const,
      savedAt: autosave.savedAt,
      duration: autosave.duration,
      clipCount: autosave.clipCount,
      warningCount: 0,
      reason: autosave.reason,
    })),
  ];

  if (localFallback) {
    candidates.push(buildProjectRecoveryCandidateFromProject({
      source: 'local-fallback',
      project: localFallback.project,
      savedAt: readProjectPackageImportSavedAt(localFallback),
      warningCount: localFallback.warnings.length,
    }));
  }

  if (packageImport) {
    candidates.push(buildProjectRecoveryCandidateFromProject({
      source: 'package-import',
      project: packageImport.project,
      savedAt: readProjectPackageImportSavedAt(packageImport),
      warningCount: packageImport.warnings.length,
    }));
  }

  const index = buildProjectRecoveryIndex(candidates, { currentProjectId });
  return {
    index,
    status: index.recommended
      ? `Recovery candidate: ${index.recommended.name} from ${index.recommended.source}`
      : 'No project recovery snapshots are available',
  };
}

function readProjectPackageImportSavedAt(imported: ProjectPackageImport): string {
  return imported.exportedAt && Number.isFinite(Date.parse(imported.exportedAt))
    ? imported.exportedAt
    : imported.project.updatedAt;
}

function buildProjectCopyId(project: EditorProject, savedAt: string): string {
  const timestamp = savedAt.replace(/\D/g, '').slice(0, 17) || Date.now().toString();
  return `${safeDownloadName(project.id || project.name).toLowerCase()}-${timestamp}`;
}

function buildProjectCopyName(name: string): string {
  const trimmedName = name.trim() || 'Danbi Project';
  return /\bcopy\b/i.test(trimmedName) ? trimmedName : `${trimmedName} Copy`;
}

function resolvePersistenceSaveMarkers(
  project: EditorProject,
  kind: ProjectPersistenceSessionKind,
): ProjectSaveMarkers {
  switch (kind) {
    case 'new-project':
      return buildUnsavedProjectMarkers();
    case 'database-load':
      return buildSavedProjectMarkers(project);
    case 'autosave-restore':
    case 'local-fallback-load':
      return {
        lastSavedProjectText: '',
        lastAutosavedProjectText: buildAutosavedProjectText(project),
      };
    case 'package-import':
    case 'edl-import':
    case 'fcpxml-import':
      return buildUnsavedProjectMarkers();
  }
}

function resolvePersistenceStatus(kind: ProjectPersistenceSessionKind, warningCount: number): string {
  const warningText = warningCount > 0 ? ` (${warningCount} warnings)` : '';

  switch (kind) {
    case 'new-project':
      return 'New project created';
    case 'autosave-restore':
      return 'Autosave restored';
    case 'database-load':
      return 'Project loaded from database';
    case 'local-fallback-load':
      return `Project loaded from local fallback${warningText}`;
    case 'package-import':
      return `Project package imported${warningText}`;
    case 'edl-import':
      return `EDL imported${warningText}`;
    case 'fcpxml-import':
      return `FCPXML imported${warningText}`;
  }
}

function appendUndoHistory(history: EditorProject[], project: EditorProject): EditorProject[] {
  return [...history.slice(-49), project];
}

function removeCurrentProjectDuplicatesFromHistory(history: EditorProject[], currentProjectText: string): EditorProject[] {
  let end = history.length;
  while (end > 0 && buildAutosavedProjectText(history[end - 1]) === currentProjectText) {
    end -= 1;
  }

  return history.slice(0, end);
}

function removeCurrentProjectDuplicatesFromFuture(future: EditorProject[], currentProjectText: string): EditorProject[] {
  let start = 0;
  while (start < future.length && buildAutosavedProjectText(future[start]) === currentProjectText) {
    start += 1;
  }

  return future.slice(start);
}

function firstTimelineClipId(project: EditorProject): string {
  return project.tracks.flatMap((track) => track.clips)[0]?.id ?? '';
}

function looksLikeSerializedEditorProject(projectText: string): boolean {
  try {
    const parsed = JSON.parse(projectText) as Partial<EditorProject>;
    return Boolean(
      parsed
      && typeof parsed.id === 'string'
      && typeof parsed.name === 'string'
      && typeof parsed.schemaVersion === 'number'
      && Array.isArray(parsed.tracks)
      && Array.isArray(parsed.assets)
    );
  } catch {
    return false;
  }
}
