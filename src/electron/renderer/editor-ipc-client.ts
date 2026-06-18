import { createEditorPreloadApi, type EditorPreloadApi } from '../shared/editor-api';
import type { EditorInvoke } from '../shared/ipc-contract';

export function createEditorIpcClient(invoke: EditorInvoke): EditorPreloadApi {
  return createEditorPreloadApi(invoke);
}

export function getWindowEditorIpcClient(): EditorPreloadApi | undefined {
  return typeof window === 'undefined' ? undefined : window.danbiEditor;
}

export function requireWindowEditorIpcClient(): EditorPreloadApi {
  const client = getWindowEditorIpcClient();
  if (!client) {
    throw new Error('Danbi editor IPC client is not available on window.danbiEditor.');
  }

  return client;
}
