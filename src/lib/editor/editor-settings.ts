import { normalizeEditorShortcut, type EditorCommandId } from './command-registry';

export type LinkedClipEditMode = 'separate' | 'linked';

export interface EditorCustomShortcut {
  id: string;
  commandId: EditorCommandId;
  shortcut: string;
  enabled: boolean;
}

export interface EditorInteractionSettings {
  stickyTimelineControls: boolean;
  linkedClipEditMode: LinkedClipEditMode;
  wheelZoomEnabled: boolean;
  customShortcuts: EditorCustomShortcut[];
}

export const EDITOR_SETTINGS_STORAGE_KEY = 'danbi.editor.settings.v1';

const EDITOR_SETTINGS_CHANGE_EVENT = 'danbi-editor-settings-change';

export const DEFAULT_EDITOR_INTERACTION_SETTINGS: EditorInteractionSettings = {
  stickyTimelineControls: true,
  linkedClipEditMode: 'separate',
  wheelZoomEnabled: true,
  customShortcuts: [],
};

export function normalizeEditorInteractionSettings(value: unknown): EditorInteractionSettings {
  if (!value || typeof value !== 'object') {
    return DEFAULT_EDITOR_INTERACTION_SETTINGS;
  }

  const candidate = value as Partial<EditorInteractionSettings>;
  return {
    stickyTimelineControls: candidate.stickyTimelineControls !== false,
    linkedClipEditMode: candidate.linkedClipEditMode === 'linked' ? 'linked' : 'separate',
    wheelZoomEnabled: candidate.wheelZoomEnabled !== false,
    customShortcuts: normalizeCustomShortcuts(candidate.customShortcuts),
  };
}

export function readStoredEditorInteractionSettings(): EditorInteractionSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_EDITOR_INTERACTION_SETTINGS;
  }

  try {
    return normalizeEditorInteractionSettings(JSON.parse(window.localStorage.getItem(EDITOR_SETTINGS_STORAGE_KEY) ?? 'null'));
  } catch {
    return DEFAULT_EDITOR_INTERACTION_SETTINGS;
  }
}

export function setStoredEditorInteractionSettings(settings: EditorInteractionSettings): void {
  if (typeof window === 'undefined') {
    return;
  }

  const normalized = normalizeEditorInteractionSettings(settings);
  window.localStorage.setItem(EDITOR_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(EDITOR_SETTINGS_CHANGE_EVENT, {
    detail: normalized,
  }));
}

export function patchStoredEditorInteractionSettings(patch: Partial<EditorInteractionSettings>): EditorInteractionSettings {
  const nextSettings = normalizeEditorInteractionSettings({
    ...readStoredEditorInteractionSettings(),
    ...patch,
  });
  setStoredEditorInteractionSettings(nextSettings);
  return nextSettings;
}

export function subscribeEditorInteractionSettings(listener: (settings: EditorInteractionSettings) => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === EDITOR_SETTINGS_STORAGE_KEY) {
      try {
        listener(normalizeEditorInteractionSettings(JSON.parse(event.newValue ?? 'null')));
      } catch {
        listener(DEFAULT_EDITOR_INTERACTION_SETTINGS);
      }
    }
  };

  const handleCustom = (event: Event) => {
    listener(normalizeEditorInteractionSettings((event as CustomEvent<unknown>).detail));
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener(EDITOR_SETTINGS_CHANGE_EVENT, handleCustom);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(EDITOR_SETTINGS_CHANGE_EVENT, handleCustom);
  };
}

function normalizeCustomShortcuts(value: unknown): EditorCustomShortcut[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item): EditorCustomShortcut[] => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const candidate = item as Partial<EditorCustomShortcut>;
    const commandId = typeof candidate.commandId === 'string' ? candidate.commandId as EditorCommandId : null;
    const shortcut = typeof candidate.shortcut === 'string' ? normalizeEditorShortcut(candidate.shortcut) : '';
    if (!commandId || !shortcut) {
      return [];
    }

    return [{
      id: typeof candidate.id === 'string' && candidate.id ? candidate.id : `${commandId}:${shortcut}`,
      commandId,
      shortcut,
      enabled: candidate.enabled !== false,
    }];
  });
}
