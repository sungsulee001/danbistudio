import { duplicateExportProfile, removeExportProfile, updateExportProfile, type ExportProfilePatch } from '../../lib/editor/export-profiles';
import { updateMasterAudioSettings, type MasterAudioSettings } from '../../lib/editor/master-audio';
import { updateProjectSettings, type ProjectSettingsPatch } from '../../lib/editor/project-settings';
import type { EditorProject, ExportProfile } from '../../lib/editor/types';

export interface ProjectMutationResult {
  project: EditorProject;
  nextSelectedExportProfileId?: string;
}

export interface ProjectSettingsMutationPlan {
  canCommit: boolean;
  commitLabel?: string;
  status?: string;
  apply?: (project: EditorProject) => ProjectMutationResult;
}

export function resolveProjectSettingsChangePlan(patch: ProjectSettingsPatch): ProjectSettingsMutationPlan {
  return {
    canCommit: true,
    commitLabel: 'Project settings updated',
    apply: (project) => ({
      project: updateProjectSettings(project, patch),
    }),
  };
}

export function resolveMasterAudioSettingsChangePlan(patch: MasterAudioSettings): ProjectSettingsMutationPlan {
  return {
    canCommit: true,
    commitLabel: 'Master audio updated',
    apply: (project) => ({
      project: updateMasterAudioSettings(project, patch),
    }),
  };
}

export function resolveExportProfilePatchPlan({
  selectedExportProfile,
  patch,
}: {
  selectedExportProfile?: ExportProfile;
  patch: ExportProfilePatch;
}): ProjectSettingsMutationPlan {
  if (!selectedExportProfile) {
    return {
      canCommit: false,
      status: 'Select an export profile first',
    };
  }

  return {
    canCommit: true,
    commitLabel: 'Export profile updated',
    apply: (project) => ({
      project: updateExportProfile(project, selectedExportProfile.id, patch),
    }),
  };
}

export function resolveDuplicateExportProfilePlan(
  selectedExportProfile?: ExportProfile,
): ProjectSettingsMutationPlan {
  if (!selectedExportProfile) {
    return {
      canCommit: false,
      status: 'Select an export profile first',
    };
  }

  return {
    canCommit: true,
    commitLabel: 'Export profile duplicated',
    apply: (project) => {
      const result = duplicateExportProfile(project, selectedExportProfile.id);
      return {
        project: result.project,
        nextSelectedExportProfileId: result.profile.id,
      };
    },
  };
}

export function resolveRemoveExportProfilePlan({
  project,
  selectedExportProfile,
}: {
  project: EditorProject;
  selectedExportProfile?: ExportProfile;
}): ProjectSettingsMutationPlan {
  if (!selectedExportProfile) {
    return {
      canCommit: false,
      status: 'Select an export profile first',
    };
  }

  const nextSelectedExportProfileId = project.exportProfiles.find((profile) => (
    profile.id !== selectedExportProfile.id
  ))?.id ?? selectedExportProfile.id;

  return {
    canCommit: true,
    commitLabel: 'Export profile removed',
    apply: (currentProject) => ({
      project: removeExportProfile(currentProject, selectedExportProfile.id),
      nextSelectedExportProfileId,
    }),
  };
}
