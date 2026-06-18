import { useEffect, useState } from 'react';

import { listCreatorTemplatePresets, type CreatorTemplatePresetId } from '../../lib/editor/creator-template-presets';
import type { ProjectSettingsPatch } from '../../lib/editor/project-settings';
import type { ProjectRecoveryCandidate, ProjectRecoveryIndex } from '../../lib/editor/project-recovery';
import type { EditorProject } from '../../lib/editor/types';
import { clearStoredEditorApiToken, readStoredEditorApiToken, writeStoredEditorApiToken } from './editor-api-client';
import type { AutosaveSummary, SavedProjectSummary } from './editor-view-model';
import { NumberField } from './editor-form-controls';

export function ProjectOverviewPanel({
  name,
  fps,
  width,
  clipCount,
}: {
  name: string;
  fps: number;
  width: number;
  clipCount: number;
}) {
  return (
    <>
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-emerald-400">Project</p>
        <h1 className="mt-1 truncate text-lg font-semibold text-zinc-100">{name}</h1>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        <ProjectMetric label="FPS" value={fps.toString()} />
        <ProjectMetric label="Size" value={`${width / 1000}K`} />
        <ProjectMetric label="Clips" value={clipCount.toString()} />
      </div>
    </>
  );
}

export function ProjectSettingsPanel({
  project,
  onChange,
}: {
  project: Pick<EditorProject, 'id' | 'name' | 'width' | 'height' | 'fps' | 'duration'>;
  onChange: (patch: ProjectSettingsPatch) => void;
}) {
  return (
    <div className="mt-6 rounded-md border border-zinc-800 bg-zinc-900 p-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Project Settings</h2>
      <label className="mt-3 block text-xs text-zinc-400">
        Name
        <input
          key={`${project.id}-${project.name}`}
          defaultValue={project.name}
          onBlur={(event) => onChange({ name: event.currentTarget.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
          }}
          className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
        />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <NumberField label="Width" value={project.width} step={2} min={16} max={8192} onChange={(value) => onChange({ width: value })} />
        <NumberField label="Height" value={project.height} step={2} min={16} max={8192} onChange={(value) => onChange({ height: value })} />
        <NumberField label="FPS" value={project.fps} step={1} min={1} max={240} onChange={(value) => onChange({ fps: value })} />
        <NumberField label="Duration" value={project.duration} step={1} min={1} onChange={(value) => onChange({ duration: value })} />
      </div>
    </div>
  );
}

export function EditorApiTokenPanel() {
  const [tokenInput, setTokenInput] = useState('');
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    setHasToken(Boolean(readStoredEditorApiToken()));
  }, []);

  const handleSave = () => {
    if (!writeStoredEditorApiToken(tokenInput)) {
      return;
    }

    setHasToken(Boolean(readStoredEditorApiToken()));
    setTokenInput('');
  };

  const handleClear = () => {
    if (!clearStoredEditorApiToken()) {
      return;
    }

    setHasToken(false);
    setTokenInput('');
  };

  return (
    <div className="mt-6 rounded-md border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">API Token</h2>
        <span className={`rounded border px-2 py-0.5 text-[11px] ${hasToken ? 'border-emerald-800 text-emerald-300' : 'border-zinc-800 text-zinc-500'}`}>
          {hasToken ? 'Saved' : 'Unset'}
        </span>
      </div>
      <input
        type="password"
        value={tokenInput}
        onChange={(event) => setTokenInput(event.currentTarget.value)}
        placeholder={hasToken ? 'Replace token' : 'Token'}
        className="mt-3 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500"
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={tokenInput.trim().length === 0}
          className="rounded border border-emerald-800 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100 hover:border-emerald-400 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-zinc-950 disabled:text-zinc-600"
        >
          Save
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={!hasToken}
          className="rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 hover:border-rose-500 disabled:cursor-not-allowed disabled:text-zinc-600"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

export function SavedProjectsPanel({
  projects,
  onRefresh,
  onCreateProject,
  onLoadProject,
  onDeleteProject,
  onSaveCopy,
  onExportPackage,
  onImportPackage,
  onSyncCloudFolder,
  cloudSyncConflictPending = false,
  onImportCloudSyncProject,
  onForceSyncCloudFolder,
  sampleProjectAvailable = false,
  onOpenSampleProject,
}: {
  projects: SavedProjectSummary[];
  onRefresh: () => void;
  onCreateProject: () => void;
  onLoadProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onSaveCopy: () => void;
  onExportPackage: () => void;
  onImportPackage: () => void;
  onSyncCloudFolder: () => void;
  cloudSyncConflictPending?: boolean;
  onImportCloudSyncProject?: () => void;
  onForceSyncCloudFolder?: () => void;
  sampleProjectAvailable?: boolean;
  onOpenSampleProject?: () => void;
}) {
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState('');
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState<string | null>(null);
  const [pendingForceSyncConfirmation, setPendingForceSyncConfirmation] = useState(false);
  const normalizedProjectSearchQuery = projectSearchQuery.trim().toLowerCase();
  const filteredProjects = normalizedProjectSearchQuery
    ? projects.filter((project) => (
      project.name.toLowerCase().includes(normalizedProjectSearchQuery)
      || project.id.toLowerCase().includes(normalizedProjectSearchQuery)
    ))
    : projects;
  const visibleProjects = normalizedProjectSearchQuery || showAllProjects
    ? filteredProjects
    : filteredProjects.slice(0, 4);
  const hiddenProjectCount = Math.max(0, filteredProjects.length - visibleProjects.length);

  useEffect(() => {
    if (pendingDeleteProjectId && !projects.some((project) => project.id === pendingDeleteProjectId)) {
      setPendingDeleteProjectId(null);
    }
  }, [pendingDeleteProjectId, projects]);

  useEffect(() => {
    if (!cloudSyncConflictPending) {
      setPendingForceSyncConfirmation(false);
    }
  }, [cloudSyncConflictPending]);

  const handleLoadProject = (projectId: string) => {
    setPendingDeleteProjectId(null);
    onLoadProject(projectId);
  };

  const handleDeleteProject = (projectId: string) => {
    if (pendingDeleteProjectId !== projectId) {
      setPendingDeleteProjectId(projectId);
      return;
    }

    setPendingDeleteProjectId(null);
    onDeleteProject(projectId);
  };

  const handleSyncCloudFolder = () => {
    setPendingForceSyncConfirmation(false);
    onSyncCloudFolder();
  };

  const handleImportCloudSyncProject = () => {
    setPendingForceSyncConfirmation(false);
    onImportCloudSyncProject?.();
  };

  const handleForceSyncCloudFolder = () => {
    if (!onForceSyncCloudFolder) {
      return;
    }

    if (!pendingForceSyncConfirmation) {
      setPendingForceSyncConfirmation(true);
      return;
    }

    setPendingForceSyncConfirmation(false);
    onForceSyncCloudFolder();
  };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Projects</h2>
        <button className="text-xs text-emerald-300 hover:text-emerald-200" onClick={onRefresh}>
          Refresh
        </button>
      </div>
      {projects.length > 4 ? (
        <input
          type="search"
          value={projectSearchQuery}
          onChange={(event) => {
            setProjectSearchQuery(event.currentTarget.value);
            setPendingDeleteProjectId(null);
          }}
          placeholder="Search projects"
          className="mt-3 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-sky-500"
        />
      ) : null}
      <div className="mt-3 space-y-2">
        {projects.length === 0 ? (
          <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-500">
            No saved projects
          </div>
        ) : visibleProjects.length === 0 ? (
          <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-500">
            No matching projects
          </div>
        ) : visibleProjects.map((item) => (
          <div
            key={item.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-stretch rounded-md border border-zinc-800 bg-zinc-900 hover:border-emerald-500"
          >
            <button
              type="button"
              onClick={() => handleLoadProject(item.id)}
              className="min-w-0 p-3 text-left"
            >
              <span className="block truncate text-sm font-medium text-zinc-100">{item.name}</span>
              <span className="mt-1 block truncate text-xs text-zinc-500">
                {item.clipCount} clips / {item.duration}s / {formatProjectUpdatedAt(item.updatedAt)}
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleDeleteProject(item.id)}
              className={`border-l border-zinc-800 px-3 text-xs ${
                pendingDeleteProjectId === item.id
                  ? 'bg-rose-500/10 text-rose-200 hover:bg-rose-500/20'
                  : 'text-zinc-400 hover:bg-rose-500/10 hover:text-rose-200'
              }`}
            >
              {pendingDeleteProjectId === item.id ? 'Confirm' : 'Delete'}
            </button>
          </div>
        ))}
        {projects.length > 4 && !normalizedProjectSearchQuery ? (
          <button
            type="button"
            onClick={() => setShowAllProjects((current) => !current)}
            className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 hover:border-sky-500"
          >
            {showAllProjects ? 'Show recent projects' : `Show ${hiddenProjectCount} more`}
          </button>
        ) : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCreateProject}
          className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 hover:border-emerald-500"
        >
          New project
        </button>
        <button
          type="button"
          onClick={onSaveCopy}
          className="rounded border border-emerald-800 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100 hover:border-emerald-400"
        >
          Save copy
        </button>
        {onOpenSampleProject ? (
          <button
            type="button"
            onClick={onOpenSampleProject}
            disabled={!sampleProjectAvailable}
            className="col-span-2 rounded border border-emerald-700 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100 hover:border-emerald-400 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-zinc-900 disabled:text-zinc-600"
          >
            Open sample
          </button>
        ) : null}
        <button
          type="button"
          onClick={onExportPackage}
          className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 hover:border-emerald-500"
        >
          Export package
        </button>
        <button
          type="button"
          onClick={onImportPackage}
          className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 hover:border-sky-500"
        >
          Import package
        </button>
        <button
          type="button"
          onClick={handleSyncCloudFolder}
          className={`${cloudSyncConflictPending && (onForceSyncCloudFolder || onImportCloudSyncProject) ? '' : 'col-span-2'} rounded border border-violet-800 bg-violet-500/10 px-3 py-2 text-xs text-violet-100 hover:border-violet-400`}
        >
          Sync folder
        </button>
        {cloudSyncConflictPending && onImportCloudSyncProject ? (
          <button
            type="button"
            onClick={handleImportCloudSyncProject}
            className="rounded border border-sky-700 bg-sky-500/10 px-3 py-2 text-xs text-sky-100 hover:border-sky-400"
          >
            Import synced
          </button>
        ) : null}
        {cloudSyncConflictPending && onForceSyncCloudFolder ? (
          <button
            type="button"
            onClick={handleForceSyncCloudFolder}
            className={`col-span-2 rounded border px-3 py-2 text-xs ${
              pendingForceSyncConfirmation
                ? 'border-rose-600 bg-rose-500/10 text-rose-100 hover:border-rose-400'
                : 'border-amber-700 bg-amber-500/10 text-amber-100 hover:border-amber-400'
            }`}
          >
            {pendingForceSyncConfirmation ? 'Confirm force' : 'Force sync'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function CreatorTemplatesPanel({
  onApplyTemplate,
}: {
  onApplyTemplate: (templateId: CreatorTemplatePresetId) => void;
}) {
  const templates = listCreatorTemplatePresets();

  return (
    <div className="mt-6 rounded-md border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Templates</h2>
        <span className="text-xs text-sky-300">{templates.length} free</span>
      </div>
      <div className="mt-3 space-y-2">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            title={template.description}
            onClick={() => onApplyTemplate(template.id)}
            className="w-full rounded-md border border-zinc-800 bg-zinc-950 p-3 text-left hover:border-emerald-500 focus:border-emerald-500 focus:outline-none"
          >
            <span className="flex items-center justify-between gap-3">
              <span className="truncate text-sm font-medium text-zinc-100">{template.label}</span>
              <span className="shrink-0 rounded border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">{template.duration}s</span>
            </span>
            <span className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-zinc-500">
              <span>{template.titleItems.length} titles</span>
              <span>{template.captionItems.length} captions</span>
              <span>{template.markerItems.length} markers</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function AutosavePanel({
  autosaves,
  autosaveStatus,
  saveStateLabel,
  saveStateClassName,
  onSaveNow,
  onRestoreAutosave,
  onDeleteAutosave,
}: {
  autosaves: AutosaveSummary[];
  autosaveStatus: string;
  saveStateLabel: string;
  saveStateClassName: string;
  onSaveNow: () => void;
  onRestoreAutosave: (projectId: string) => void;
  onDeleteAutosave: (projectId: string) => void;
}) {
  return (
    <div className="mt-6 rounded-md border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Autosave</h2>
        <button className="text-xs text-emerald-300 hover:text-emerald-200" onClick={onSaveNow}>
          Save now
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
        <span className="truncate text-zinc-500">{autosaveStatus}</span>
        <span className={`shrink-0 rounded border px-2 py-1 ${saveStateClassName}`}>
          {saveStateLabel}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {autosaves.length === 0 ? (
          <div className="rounded border border-zinc-800 bg-zinc-950 p-2 text-xs text-zinc-500">
            No autosaves
          </div>
        ) : autosaves.slice(0, 3).map((item) => (
          <div key={item.projectId} className="rounded border border-zinc-800 bg-zinc-950 p-2">
            <button
              type="button"
              onClick={() => onRestoreAutosave(item.projectId)}
              className="block w-full text-left"
            >
              <span className="block truncate text-sm font-medium text-zinc-100">{item.name}</span>
              <span className="mt-1 block text-[11px] text-zinc-500">
                {item.clipCount} clips / {formatClockTime(item.savedAt)}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onDeleteAutosave(item.projectId)}
              className="mt-2 text-[11px] text-rose-300 hover:text-rose-200"
            >
              Delete autosave
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProjectRecoveryPanel({
  recoveryIndex,
  recoveryStatus,
  onLoadProject,
  onRestoreAutosave,
  onRestoreLocalFallback,
  onRestorePackageImport,
}: {
  recoveryIndex: ProjectRecoveryIndex;
  recoveryStatus: string;
  onLoadProject: (projectId: string) => void;
  onRestoreAutosave: (projectId: string) => void;
  onRestoreLocalFallback: () => void;
  onRestorePackageImport?: () => void;
}) {
  const candidates = recoveryIndex.candidates.slice(0, 4);
  const hiddenCandidateCount = Math.max(0, recoveryIndex.candidates.length - candidates.length);
  const warnings = recoveryIndex.warnings.slice(0, 2);
  const hiddenWarningCount = Math.max(0, recoveryIndex.warnings.length - warnings.length);

  return (
    <div data-testid="project-recovery-panel" className="mt-6 rounded-md border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Recovery</h2>
        <span className="shrink-0 rounded border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
          {recoveryIndex.candidates.length} candidates
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-[11px] text-zinc-500">{recoveryStatus}</p>
      {warnings.length > 0 ? (
        <div className="mt-3 space-y-1">
          {warnings.map((warning) => (
            <div key={warning} className="rounded border border-amber-900/70 bg-amber-950/30 px-2 py-1 text-[11px] text-amber-200">
              {warning}
            </div>
          ))}
          {hiddenWarningCount > 0 ? (
            <div className="text-[11px] text-zinc-500">
              +{hiddenWarningCount} more warning{hiddenWarningCount === 1 ? '' : 's'}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="mt-3 space-y-2">
        {candidates.length === 0 ? (
          <div className="rounded border border-zinc-800 bg-zinc-950 p-2 text-xs text-zinc-500">
            No recovery snapshots
          </div>
        ) : candidates.map((candidate) => (
          <ProjectRecoveryCandidateRow
            key={candidate.id}
            candidate={candidate}
            recommended={candidate.id === recoveryIndex.recommended?.id}
            onLoadProject={onLoadProject}
            onRestoreAutosave={onRestoreAutosave}
            onRestoreLocalFallback={onRestoreLocalFallback}
            onRestorePackageImport={onRestorePackageImport}
          />
        ))}
        {hiddenCandidateCount > 0 ? (
          <div className="text-[11px] text-zinc-500">
            +{hiddenCandidateCount} more candidate{hiddenCandidateCount === 1 ? '' : 's'}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ProjectRecoveryCandidateRow({
  candidate,
  recommended,
  onLoadProject,
  onRestoreAutosave,
  onRestoreLocalFallback,
  onRestorePackageImport,
}: {
  candidate: ProjectRecoveryCandidate;
  recommended: boolean;
  onLoadProject: (projectId: string) => void;
  onRestoreAutosave: (projectId: string) => void;
  onRestoreLocalFallback: () => void;
  onRestorePackageImport?: () => void;
}) {
  const action = resolveProjectRecoveryAction({
    candidate,
    onLoadProject,
    onRestoreAutosave,
    onRestoreLocalFallback,
    onRestorePackageImport,
  });

  return (
    <div
      data-testid={`project-recovery-candidate-${candidate.source}-${candidate.projectId}`}
      className={`rounded border p-2 ${recommended ? 'border-emerald-700 bg-emerald-950/30' : 'border-zinc-800 bg-zinc-950'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="block truncate text-sm font-medium text-zinc-100">{candidate.name}</span>
          <span className="mt-1 block text-[11px] text-zinc-500">
            {candidate.clipCount} clips / {candidate.duration}s / {formatClockTime(candidate.savedAt)}
          </span>
          {candidate.reason ? (
            <span className="mt-1 block truncate text-[11px] text-zinc-600">{candidate.reason}</span>
          ) : null}
        </div>
        <span className={`shrink-0 rounded border px-2 py-0.5 text-[11px] ${recoverySourceBadgeClassName(candidate.source)}`}>
          {recoverySourceLabel(candidate.source)}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {candidate.warningCount > 0 ? (
          <span className="text-[11px] text-amber-300">
            {candidate.warningCount} warning{candidate.warningCount === 1 ? '' : 's'}
          </span>
        ) : (
          <span className="text-[11px] text-zinc-600">Clean snapshot</span>
        )}
        <button
          type="button"
          onClick={action.onClick}
          disabled={!action.onClick}
          className="shrink-0 rounded border border-emerald-800 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-100 hover:border-emerald-400 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-zinc-900 disabled:text-zinc-600"
        >
          {action.label}
        </button>
      </div>
    </div>
  );
}

function resolveProjectRecoveryAction({
  candidate,
  onLoadProject,
  onRestoreAutosave,
  onRestoreLocalFallback,
  onRestorePackageImport,
}: {
  candidate: ProjectRecoveryCandidate;
  onLoadProject: (projectId: string) => void;
  onRestoreAutosave: (projectId: string) => void;
  onRestoreLocalFallback: () => void;
  onRestorePackageImport?: () => void;
}): { label: string; onClick?: () => void } {
  switch (candidate.source) {
    case 'autosave':
      return { label: 'Restore', onClick: () => onRestoreAutosave(candidate.projectId) };
    case 'database':
      return { label: 'Load', onClick: () => onLoadProject(candidate.projectId) };
    case 'local-fallback':
      return { label: 'Restore', onClick: onRestoreLocalFallback };
    case 'package-import':
      return { label: 'Reopen', onClick: onRestorePackageImport };
  }
}

function recoverySourceLabel(source: ProjectRecoveryCandidate['source']): string {
  switch (source) {
    case 'autosave':
      return 'Autosave';
    case 'database':
      return 'Saved';
    case 'local-fallback':
      return 'Fallback';
    case 'package-import':
      return 'Package';
  }
}

function recoverySourceBadgeClassName(source: ProjectRecoveryCandidate['source']): string {
  switch (source) {
    case 'autosave':
      return 'border-sky-800 text-sky-200';
    case 'database':
      return 'border-zinc-700 text-zinc-300';
    case 'local-fallback':
      return 'border-amber-800 text-amber-200';
    case 'package-import':
      return 'border-violet-800 text-violet-200';
  }
}

function ProjectMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900 p-2">
      <div className="text-zinc-500">{label}</div>
      <div className="mt-1 font-semibold text-zinc-100">{value}</div>
    </div>
  );
}

function formatProjectUpdatedAt(updatedAt: string): string {
  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp)) {
    return 'Updated time unknown';
  }

  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatClockTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
