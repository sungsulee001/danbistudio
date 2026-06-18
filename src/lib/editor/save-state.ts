export type ProjectSaveState = 'saved' | 'autosaved' | 'dirty';

export function resolveProjectSaveState(
  currentProjectText: string,
  savedProjectText?: string | null,
  autosavedProjectText?: string | null,
): ProjectSaveState {
  if (savedProjectText && currentProjectText === savedProjectText) {
    return 'saved';
  }

  if (autosavedProjectText && currentProjectText === autosavedProjectText) {
    return 'autosaved';
  }

  return 'dirty';
}

export function getProjectSaveStateLabel(state: ProjectSaveState): string {
  switch (state) {
    case 'saved':
      return 'Saved';
    case 'autosaved':
      return 'Autosaved';
    case 'dirty':
      return 'Unsaved changes';
  }
}
