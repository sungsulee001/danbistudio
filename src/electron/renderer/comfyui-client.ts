import type { EditorProject } from '../../lib/editor/types';
import { editorApiFetch } from './editor-api-client';
import type { ComfyUIQueueJobView } from './editor-view-model';

const COMFYUI_API_STATUS_TIMEOUT_MS = 5000;
const COMFYUI_API_ACTION_TIMEOUT_MS = 10000;

export interface ComfyUIStatusFetchOptions {
  signal?: AbortSignal;
}

export async function fetchComfyUIQueueJob(
  jobId: string,
  options: ComfyUIStatusFetchOptions = {},
): Promise<ComfyUIQueueJobView | null> {
  const response = await editorApiFetch(`/api/editor/comfyui-jobs/${jobId}`, {
    signal: options.signal,
    timeoutMs: COMFYUI_API_STATUS_TIMEOUT_MS,
  });
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data.job as ComfyUIQueueJobView;
}

export async function queueComfyUIBatchJob({
  project,
  selectedClipIds,
  priority,
  execute,
}: {
  project: EditorProject;
  selectedClipIds: string[];
  priority: number;
  execute: boolean;
}): Promise<ComfyUIQueueJobView> {
  const response = await editorApiFetch('/api/editor/comfyui-jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: COMFYUI_API_ACTION_TIMEOUT_MS,
    body: JSON.stringify({
      project,
      selectedClipIds,
      priority,
      execute,
    }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  return data.job as ComfyUIQueueJobView;
}

export async function cancelComfyUIQueueJob(jobId: string): Promise<ComfyUIQueueJobView> {
  const response = await editorApiFetch(`/api/editor/comfyui-jobs/${jobId}`, {
    method: 'DELETE',
    timeoutMs: COMFYUI_API_ACTION_TIMEOUT_MS,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  return data.job as ComfyUIQueueJobView;
}

export async function retryComfyUIQueueJob({
  jobId,
  priority,
  execute,
}: {
  jobId: string;
  priority: number;
  execute: boolean;
}): Promise<ComfyUIQueueJobView> {
  const response = await editorApiFetch(`/api/editor/comfyui-jobs/${jobId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: COMFYUI_API_ACTION_TIMEOUT_MS,
    body: JSON.stringify({
      priority,
      execute,
    }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  return data.job as ComfyUIQueueJobView;
}
