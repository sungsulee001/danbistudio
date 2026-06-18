// Adapted from OpenCut Classic timeline update pipeline and command manager patterns.
// Source: https://github.com/opencut-app/opencut-classic
// Commit: cf5e79e919144200294fb9fed22a222592a0aeea
// License: MIT. See third_party/NOTICE.md and docs/THIRD_PARTY_SOURCE_REGISTER_KR.md.

import { serializeProject } from './project-store';
import { updateClip, type EditableClipPatch } from './timeline';
import type { EditorProject, TimelineClip } from './types';

const DEFAULT_HISTORY_LIMIT = 50;

export interface TimelineEditSelectionSnapshot {
  selectedClipId?: string;
  selectedClipIds?: string[];
  selectedTrackId?: string;
  playhead?: number;
}

export interface TimelineEditHistoryState {
  project: EditorProject;
  history: EditorProject[];
  future: EditorProject[];
}

export interface TimelineEditTransaction {
  label: string;
  update: (project: EditorProject) => EditorProject;
  selection?: TimelineEditSelectionSnapshot;
  historyLimit?: number;
}

export interface TimelineEditReplacementTransaction {
  label: string;
  nextProject: EditorProject;
  selection?: TimelineEditSelectionSnapshot;
  historyLimit?: number;
}

export interface TimelineClipPatchTransaction {
  label: string;
  clipId: string;
  patch: EditableClipPatch;
  selection?: TimelineEditSelectionSnapshot;
  historyLimit?: number;
}

export interface TimelineEditCommitResult extends TimelineEditHistoryState {
  committed: boolean;
  status: string;
  changedClipIds: string[];
  previousSelection?: TimelineEditSelectionSnapshot;
}

export interface TimelineEditStepResult extends TimelineEditHistoryState {
  changed: boolean;
  status: string;
  selectedClipId: string;
}

export function commitTimelineEditTransaction(
  state: TimelineEditHistoryState,
  transaction: TimelineEditTransaction,
): TimelineEditCommitResult {
  try {
    return replaceTimelineEditTransaction(state, {
      label: transaction.label,
      nextProject: transaction.update(state.project),
      selection: transaction.selection,
      historyLimit: transaction.historyLimit,
    });
  } catch (error) {
    return {
      ...state,
      committed: false,
      status: (error as Error).message,
      changedClipIds: [],
      previousSelection: transaction.selection,
    };
  }
}

export function replaceTimelineEditTransaction(
  state: TimelineEditHistoryState,
  transaction: TimelineEditReplacementTransaction,
): TimelineEditCommitResult {
  const changedClipIds = diffTimelineClipIds(state.project, transaction.nextProject);

  if (serializeProject(transaction.nextProject) === serializeProject(state.project)) {
    return {
      ...state,
      committed: false,
      status: transaction.label,
      changedClipIds: [],
      previousSelection: transaction.selection,
    };
  }

  return {
    committed: true,
    project: transaction.nextProject,
    history: appendTimelineUndoHistory(state.history, state.project, transaction.historyLimit),
    future: [],
    status: transaction.label,
    changedClipIds,
    previousSelection: transaction.selection,
  };
}

export function commitTimelineClipPatchTransaction(
  state: TimelineEditHistoryState,
  transaction: TimelineClipPatchTransaction,
): TimelineEditCommitResult {
  return commitTimelineEditTransaction(state, {
    label: transaction.label,
    update: (project) => updateClip(project, transaction.clipId, transaction.patch),
    selection: transaction.selection,
    historyLimit: transaction.historyLimit,
  });
}

export function undoTimelineEditTransaction(
  state: TimelineEditHistoryState,
  selection: TimelineEditSelectionSnapshot = {},
): TimelineEditStepResult {
  const previousProject = state.history[state.history.length - 1];
  if (!previousProject) {
    return {
      ...state,
      changed: false,
      status: 'Nothing to undo',
      selectedClipId: '',
    };
  }

  return {
    changed: true,
    project: previousProject,
    history: state.history.slice(0, -1),
    future: [state.project, ...state.future].slice(0, DEFAULT_HISTORY_LIMIT),
    status: 'Undo',
    selectedClipId: resolveTimelineStepSelection(previousProject, selection.selectedClipId),
  };
}

export function redoTimelineEditTransaction(
  state: TimelineEditHistoryState,
  selection: TimelineEditSelectionSnapshot = {},
): TimelineEditStepResult {
  const nextProject = state.future[0];
  if (!nextProject) {
    return {
      ...state,
      changed: false,
      status: 'Nothing to redo',
      selectedClipId: '',
    };
  }

  return {
    changed: true,
    project: nextProject,
    history: appendTimelineUndoHistory(state.history, state.project),
    future: state.future.slice(1),
    status: 'Redo',
    selectedClipId: resolveTimelineStepSelection(nextProject, selection.selectedClipId),
  };
}

export function clearTimelineEditHistory(project: EditorProject): TimelineEditHistoryState {
  return {
    project,
    history: [],
    future: [],
  };
}

export function diffTimelineClipIds(before: EditorProject, after: EditorProject): string[] {
  const beforeClips = buildClipFingerprintMap(before);
  const afterClips = buildClipFingerprintMap(after);
  const ids = new Set([...beforeClips.keys(), ...afterClips.keys()]);

  return Array.from(ids)
    .filter((clipId) => beforeClips.get(clipId) !== afterClips.get(clipId))
    .sort((a, b) => a.localeCompare(b));
}

function appendTimelineUndoHistory(
  history: EditorProject[],
  project: EditorProject,
  historyLimit = DEFAULT_HISTORY_LIMIT,
): EditorProject[] {
  const limit = Math.max(1, Math.floor(historyLimit));
  return [...history.slice(-(limit - 1)), project];
}

function buildClipFingerprintMap(project: EditorProject): Map<string, string> {
  const entries = project.tracks.flatMap((track) => track.clips.map((clip) => [
    clip.id,
    serializeClipFingerprint(track.id, clip),
  ] as const));

  return new Map(entries);
}

function serializeClipFingerprint(trackId: string, clip: TimelineClip): string {
  return JSON.stringify({
    trackId,
    clip,
  });
}

function firstTimelineClipId(project: EditorProject): string {
  return project.tracks.flatMap((track) => track.clips)[0]?.id ?? '';
}

function resolveTimelineStepSelection(project: EditorProject, preferredClipId?: string): string {
  if (preferredClipId && project.tracks.some((track) => track.clips.some((clip) => clip.id === preferredClipId))) {
    return preferredClipId;
  }

  return firstTimelineClipId(project);
}
