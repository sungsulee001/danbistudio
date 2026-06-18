import type { EditorQueueSettingsView, FfmpegCapabilitiesView } from './editor-view-model';
import type { EditorFilePathResponse } from '../shared/ipc-contract';
import type { DanbiRuntimeDiagnosticsSnapshot } from '../shared/runtime-diagnostics';
import { editorApiFetch } from './editor-api-client';
import { getWindowEditorIpcClient } from './editor-ipc-client';

const EDITOR_SYSTEM_API_STATUS_TIMEOUT_MS = 5000;
const EDITOR_SYSTEM_API_ACTION_TIMEOUT_MS = 10000;

export interface NativeRuntimePathActionResult {
  available: boolean;
  ok: boolean;
  path: string;
  error?: string;
}

export interface EditorSystemFetchOptions {
  signal?: AbortSignal;
}

export async function fetchQueueSettings(options: EditorSystemFetchOptions = {}): Promise<EditorQueueSettingsView | null> {
  const response = await editorApiFetch('/api/editor/queue-settings', {
    signal: options.signal,
    timeoutMs: EDITOR_SYSTEM_API_STATUS_TIMEOUT_MS,
  });
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data.settings ? data.settings as EditorQueueSettingsView : null;
}

export async function fetchFfmpegCapabilities(options: EditorSystemFetchOptions = {}): Promise<FfmpegCapabilitiesView | null> {
  const response = await editorApiFetch('/api/editor/ffmpeg-capabilities', {
    signal: options.signal,
    timeoutMs: EDITOR_SYSTEM_API_STATUS_TIMEOUT_MS,
  });
  if (!response.ok) {
    return null;
  }

  return await response.json() as FfmpegCapabilitiesView;
}

export async function applyQueueSettings(settings: EditorQueueSettingsView): Promise<EditorQueueSettingsView> {
  const response = await editorApiFetch('/api/editor/queue-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: EDITOR_SYSTEM_API_ACTION_TIMEOUT_MS,
    body: JSON.stringify(settings),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  return data.settings as EditorQueueSettingsView;
}

export async function readElectronRuntimeDiagnostics(): Promise<DanbiRuntimeDiagnosticsSnapshot | null> {
  const client = getWindowEditorIpcClient();
  if (!client?.system?.diagnostics) {
    return null;
  }

  return client.system.diagnostics() as Promise<DanbiRuntimeDiagnosticsSnapshot>;
}

export async function openNativeRuntimePath(path: string): Promise<NativeRuntimePathActionResult> {
  const client = getWindowEditorIpcClient();
  if (!client?.files?.openPath) {
    return {
      available: false,
      ok: false,
      path,
      error: 'Native file open is not available.',
    };
  }

  const response = await client.files.openPath(path) as EditorFilePathResponse;
  return {
    available: true,
    ...response,
  };
}

export async function revealNativeRuntimePath(path: string): Promise<NativeRuntimePathActionResult> {
  const client = getWindowEditorIpcClient();
  if (!client?.files?.revealInFolder) {
    return {
      available: false,
      ok: false,
      path,
      error: 'Native file reveal is not available.',
    };
  }

  const response = await client.files.revealInFolder(path) as EditorFilePathResponse;
  return {
    available: true,
    ...response,
  };
}
