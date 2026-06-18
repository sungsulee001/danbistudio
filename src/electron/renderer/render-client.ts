import type { CaptionSidecarOptions } from '../../lib/editor/caption-sidecar';
import type { FfmpegRenderPlan } from '../../lib/editor/ffmpeg-renderer';
import { buildDefaultRenderOutputPath } from '../../lib/editor/render-output';
import type { EditorProject } from '../../lib/editor/types';
import type { EditorFilePathResponse, EditorSaveFileDialogRequest, EditorSaveFileDialogResponse } from '../shared/ipc-contract';
import { editorApiFetch } from './editor-api-client';
import { getWindowEditorIpcClient } from './editor-ipc-client';
import type { RenderJobView } from './editor-view-model';

type ExportRangeRequest = { start: number; end: number } | undefined;

interface RenderRequest {
  project: EditorProject;
  profileId: string;
  outputPath?: string;
  outputFilename?: string;
  encoderPreference?: string;
  exportRange?: ExportRangeRequest;
}

type RenderRetryRequest = Partial<RenderRequest> & {
  priority?: number;
};

export interface RenderStatusFetchOptions {
  signal?: AbortSignal;
}

const RENDER_API_STATUS_TIMEOUT_MS = 5000;
const RENDER_API_ACTION_TIMEOUT_MS = 10000;
const RENDER_API_DIRECT_TIMEOUT_MS = 30 * 60 * 1000;

export interface RenderOutputPathSelectionResult {
  available: boolean;
  canceled: boolean;
  filePath?: string;
}

export interface NativeRenderOutputActionResult {
  available: boolean;
  ok: boolean;
  path: string;
  error?: string;
}

export async function fetchRenderJob(
  jobId: string,
  options: RenderStatusFetchOptions = {},
): Promise<RenderJobView | null> {
  const client = getWindowEditorIpcClient();
  if (client?.render?.getJob) {
    const response = await client.render.getJob(jobId) as { job?: RenderJobView };
    return response.job ?? null;
  }

  const response = await editorApiFetch(`/api/editor/render-jobs/${jobId}`, {
    signal: options.signal,
    timeoutMs: RENDER_API_STATUS_TIMEOUT_MS,
  });
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data.job as RenderJobView;
}

export async function fetchRenderJobs(options: RenderStatusFetchOptions = {}): Promise<RenderJobView[]> {
  const client = getWindowEditorIpcClient();
  if (client?.render?.jobs) {
    const response = await client.render.jobs() as { jobs?: RenderJobView[] };
    return response.jobs ?? [];
  }

  const response = await editorApiFetch('/api/editor/render-jobs', {
    signal: options.signal,
    timeoutMs: RENDER_API_STATUS_TIMEOUT_MS,
  });
  if (!response.ok) {
    return [];
  }

  const data = await response.json().catch(() => ({}));
  return Array.isArray(data.jobs) ? data.jobs as RenderJobView[] : [];
}

export async function fetchServerRenderPlan(request: RenderRequest): Promise<FfmpegRenderPlan | null> {
  const client = getWindowEditorIpcClient();
  if (client?.render?.plan) {
    return client.render.plan({
      ...request,
      encoderPreference: request.encoderPreference ?? 'auto',
    }) as Promise<FfmpegRenderPlan>;
  }

  const response = await editorApiFetch('/api/editor/render-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: RENDER_API_ACTION_TIMEOUT_MS,
    body: JSON.stringify({
      ...request,
      encoderPreference: request.encoderPreference ?? 'auto',
    }),
  });

  if (!response.ok) {
    return null;
  }

  return await response.json() as FfmpegRenderPlan;
}

export async function downloadCaptionSidecar({
  project,
  format,
  options,
  exportRange,
}: {
  project: EditorProject;
  format: 'srt' | 'vtt';
  options: Required<CaptionSidecarOptions>;
  exportRange?: ExportRangeRequest;
}): Promise<{ captionCount: number }> {
  const response = await editorApiFetch('/api/editor/captions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: RENDER_API_ACTION_TIMEOUT_MS,
    body: JSON.stringify({ project, format, options, exportRange }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  const sidecar = data.sidecar as { filename: string; mimeType: string; content: string; captionCount: number };
  const blob = new Blob([sidecar.content], { type: sidecar.mimeType });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  try {
    anchor.href = href;
    anchor.download = sidecar.filename;
    anchor.click();
  } finally {
    URL.revokeObjectURL(href);
  }

  return { captionCount: sidecar.captionCount };
}

export async function queueRenderJob(request: RenderRequest & { priority: number }): Promise<RenderJobView> {
  const client = getWindowEditorIpcClient();
  if (client?.render?.queue) {
    const response = await client.render.queue(request) as { job: RenderJobView };
    return response.job;
  }

  const response = await editorApiFetch('/api/editor/render-jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: RENDER_API_ACTION_TIMEOUT_MS,
    body: JSON.stringify({
      ...request,
      encoderPreference: request.encoderPreference ?? 'auto',
    }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  return data.job as RenderJobView;
}

export async function cancelRenderJob(jobId: string): Promise<RenderJobView> {
  const client = getWindowEditorIpcClient();
  if (client?.render?.cancelJob) {
    const response = await client.render.cancelJob(jobId) as { job?: RenderJobView };
    if (!response.job) {
      throw new Error('Render job not found');
    }

    return response.job;
  }

  const response = await editorApiFetch(`/api/editor/render-jobs/${jobId}`, {
    method: 'DELETE',
    timeoutMs: RENDER_API_ACTION_TIMEOUT_MS,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  return data.job as RenderJobView;
}

export async function retryRenderJob(jobId: string, retry: number | RenderRetryRequest): Promise<RenderJobView> {
  const retryRequest = typeof retry === 'number' ? { priority: retry } : retry;
  const client = getWindowEditorIpcClient();
  if (client?.render?.retryJob) {
    const response = await client.render.retryJob(jobId, retryRequest) as { job?: RenderJobView };
    if (!response.job) {
      throw new Error('Render job not found or cannot be retried');
    }

    return response.job;
  }

  const response = await editorApiFetch(`/api/editor/render-jobs/${jobId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: RENDER_API_ACTION_TIMEOUT_MS,
    body: JSON.stringify(retryRequest),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  return data.job as RenderJobView;
}

export async function renderProjectNow(request: RenderRequest): Promise<{ outputPath: string; plan: FfmpegRenderPlan }> {
  const client = getWindowEditorIpcClient();
  if (client?.render?.direct) {
    const response = await client.render.direct(request) as { outputPath: string; plan: FfmpegRenderPlan };
    return {
      outputPath: response.outputPath,
      plan: response.plan,
    };
  }

  const response = await editorApiFetch('/api/editor/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: RENDER_API_DIRECT_TIMEOUT_MS,
    body: JSON.stringify({
      ...request,
      encoderPreference: request.encoderPreference ?? 'auto',
    }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  return data as { outputPath: string; plan: FfmpegRenderPlan };
}

export function buildRenderOutputSaveDialogRequest({
  project,
  profileId,
  title = 'Render video',
  buttonLabel = 'Render',
}: {
  project: EditorProject;
  profileId: string;
  title?: string;
  buttonLabel?: string;
}): EditorSaveFileDialogRequest {
  const defaultPath = buildDefaultRenderOutputPath(project, profileId);
  const extension = readOutputExtension(defaultPath);

  return {
    title,
    defaultPath,
    buttonLabel,
    filters: [
      {
        name: `${extension.toUpperCase()} video`,
        extensions: [extension],
      },
      {
        name: 'All files',
        extensions: ['*'],
      },
    ],
  };
}

export async function selectRenderOutputPath({
  project,
  profileId,
  title,
  buttonLabel,
}: {
  project: EditorProject;
  profileId: string;
  title?: string;
  buttonLabel?: string;
}): Promise<RenderOutputPathSelectionResult> {
  const client = getWindowEditorIpcClient();
  if (!client?.dialogs?.saveFile) {
    return {
      available: false,
      canceled: false,
    };
  }

  const response = await client.dialogs.saveFile(buildRenderOutputSaveDialogRequest({
    project,
    profileId,
    title,
    buttonLabel,
  })) as EditorSaveFileDialogResponse;

  return {
    available: true,
    canceled: response.canceled,
    ...(response.filePath ? { filePath: response.filePath } : {}),
  };
}

export async function openNativeRenderOutputPath(path: string): Promise<NativeRenderOutputActionResult> {
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

export async function revealNativeRenderOutputPath(path: string): Promise<NativeRenderOutputActionResult> {
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

function readOutputExtension(outputPath: string): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(outputPath);
  return match?.[1]?.toLowerCase() ?? 'mp4';
}
