import type { EditorQueueSettingsView } from './editor-view-model';

export interface EditorEscapeClearState {
  contextMenu: null;
  programPlaybackRate: 0;
  sourcePlaybackRate: 0;
  selectedClipIds: [];
  selectedClipId: '';
  selectedCaptionIds: [];
  status: string;
}

export interface QueueSettingsApplySuccessState {
  queueSettings: EditorQueueSettingsView;
  status: string;
}

export function resolveEditorEscapeClearState(): EditorEscapeClearState {
  return {
    contextMenu: null,
    programPlaybackRate: 0,
    sourcePlaybackRate: 0,
    selectedClipIds: [],
    selectedClipId: '',
    selectedCaptionIds: [],
    status: 'Selection cleared',
  };
}

export function resolveQueueSettingsApplySuccessState(
  queueSettings: EditorQueueSettingsView,
): QueueSettingsApplySuccessState {
  return {
    queueSettings,
    status: 'Queue settings applied',
  };
}

export function resolveQueueSettingsApplyFailureStatus(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Queue settings failed: ${message}`;
}
