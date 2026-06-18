import { serializeProject } from '../../lib/editor/project-store';
import {
  commitTimelineEditTransaction,
  redoTimelineEditTransaction,
  replaceTimelineEditTransaction,
  type TimelineEditCommitResult,
  undoTimelineEditTransaction,
} from '../../lib/editor/timeline-transaction';
import type { EditorProject } from '../../lib/editor/types';

export interface ProjectSaveMarkers {
  lastSavedProjectText: string;
  lastAutosavedProjectText: string;
}

export type ProjectCommitResult = TimelineEditCommitResult;

export interface ProjectHistoryStepResult {
  changed: boolean;
  project: EditorProject;
  history: EditorProject[];
  future: EditorProject[];
  status: string;
  selectedClipId: string;
}

export function buildSavedProjectMarkers(project: EditorProject): ProjectSaveMarkers {
  const projectText = serializeProject(project);
  return {
    lastSavedProjectText: projectText,
    lastAutosavedProjectText: projectText,
  };
}

export function buildAutosavedProjectText(project: EditorProject): string {
  return serializeProject(project);
}

export function buildUnsavedProjectMarkers(): ProjectSaveMarkers {
  return {
    lastSavedProjectText: '',
    lastAutosavedProjectText: '',
  };
}

export function resolveProjectUpdateCommit({
  project,
  history,
  future,
  label,
  update,
}: {
  project: EditorProject;
  history: EditorProject[];
  future: EditorProject[];
  label: string;
  update: (current: EditorProject) => EditorProject;
}): ProjectCommitResult {
  return commitTimelineEditTransaction({ project, history, future }, { label, update });
}

export function resolveProjectReplacementCommit({
  project,
  history,
  future,
  label,
  nextProject,
}: {
  project: EditorProject;
  history: EditorProject[];
  future: EditorProject[];
  label: string;
  nextProject: EditorProject;
}): ProjectCommitResult {
  return replaceTimelineEditTransaction({ project, history, future }, { label, nextProject });
}

export function resolveProjectUndo({
  project,
  history,
  future,
  selectedClipId,
}: {
  project: EditorProject;
  history: EditorProject[];
  future: EditorProject[];
  selectedClipId?: string;
}): ProjectHistoryStepResult {
  return undoTimelineEditTransaction({ project, history, future }, { selectedClipId });
}

export function resolveProjectRedo({
  project,
  history,
  future,
  selectedClipId,
}: {
  project: EditorProject;
  history: EditorProject[];
  future: EditorProject[];
  selectedClipId?: string;
}): ProjectHistoryStepResult {
  return redoTimelineEditTransaction({ project, history, future }, { selectedClipId });
}
