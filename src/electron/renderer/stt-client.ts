import type { EditorProject } from '../../lib/editor/types';
import { editorApiFetch } from './editor-api-client';
import type { SttJobView } from './editor-view-model';

const STT_API_STATUS_TIMEOUT_MS = 5000;
const STT_API_ACTION_TIMEOUT_MS = 10000;

export interface SttStatusFetchOptions {
  signal?: AbortSignal;
}

export async function fetchSttJob(
  jobId: string,
  options: SttStatusFetchOptions = {},
): Promise<SttJobView | null> {
  const response = await editorApiFetch(`/api/editor/stt-jobs/${jobId}`, {
    signal: options.signal,
    timeoutMs: STT_API_STATUS_TIMEOUT_MS,
  });
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data.job as SttJobView;
}

export async function queueSttCaptionJob({
  project,
  selectedClipIds,
  priority,
  execute,
  language,
  engine,
}: {
  project: EditorProject;
  selectedClipIds: string[];
  priority: number;
  execute: boolean;
  language?: string;
  engine?: string;
}): Promise<SttJobView> {
  const response = await editorApiFetch('/api/editor/stt-jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: STT_API_ACTION_TIMEOUT_MS,
    body: JSON.stringify({
      project,
      selectedClipIds,
      priority,
      execute,
      language,
      engine,
    }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  return data.job as SttJobView;
}

export async function cancelSttCaptionJob(jobId: string): Promise<SttJobView> {
  const response = await editorApiFetch(`/api/editor/stt-jobs/${jobId}`, {
    method: 'DELETE',
    timeoutMs: STT_API_ACTION_TIMEOUT_MS,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  return data.job as SttJobView;
}

export async function retrySttCaptionJob({
  jobId,
  priority,
  execute,
  language,
  engine,
}: {
  jobId: string;
  priority: number;
  execute: boolean;
  language?: string;
  engine?: string;
}): Promise<SttJobView> {
  const response = await editorApiFetch(`/api/editor/stt-jobs/${jobId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: STT_API_ACTION_TIMEOUT_MS,
    body: JSON.stringify({
      priority,
      execute,
      language,
      engine,
    }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  return data.job as SttJobView;
}
