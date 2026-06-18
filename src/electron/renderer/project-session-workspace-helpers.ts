import { serializeProject } from '../../lib/editor/project-store';
import {
  getProjectSaveStateLabel,
  resolveProjectSaveState,
  type ProjectSaveState,
} from '../../lib/editor/save-state';
import type { EditorAsset, EditorProject } from '../../lib/editor/types';

const PROJECT_SAVE_STATE_CLASS_NAMES: Record<ProjectSaveState, string> = {
  dirty: 'border-amber-700 bg-amber-950/40 text-amber-200',
  autosaved: 'border-sky-700 bg-sky-950/40 text-sky-200',
  saved: 'border-emerald-700 bg-emerald-950/40 text-emerald-200',
};

export interface ProjectSessionWorkspaceState {
  serializedProject: string;
  projectSaveState: ProjectSaveState;
  projectSaveStateLabel: string;
  projectSaveStateClassName: string;
  assetById: Map<string, EditorAsset>;
  assetReferenceCounts: Map<string, number>;
  unusedAssetCount: number;
}

export function resolveProjectSessionWorkspaceState({
  project,
  lastSavedProjectText,
  lastAutosavedProjectText,
}: {
  project: EditorProject;
  lastSavedProjectText?: string | null;
  lastAutosavedProjectText?: string | null;
}): ProjectSessionWorkspaceState {
  const serializedProject = serializeProject(project);
  const projectSaveState = resolveProjectSaveState(
    serializedProject,
    lastSavedProjectText,
    lastAutosavedProjectText,
  );
  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const assetReferenceCounts = buildAssetReferenceCounts(project);

  return {
    serializedProject,
    projectSaveState,
    projectSaveStateLabel: getProjectSaveStateLabel(projectSaveState),
    projectSaveStateClassName: PROJECT_SAVE_STATE_CLASS_NAMES[projectSaveState],
    assetById,
    assetReferenceCounts,
    unusedAssetCount: project.assets.filter((asset) => (assetReferenceCounts.get(asset.id) ?? 0) === 0).length,
  };
}

export function buildAssetReferenceCounts(project: EditorProject): Map<string, number> {
  const counts = new Map<string, number>();

  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.assetId) {
        counts.set(clip.assetId, (counts.get(clip.assetId) ?? 0) + 1);
      }
    }
  }

  return counts;
}
