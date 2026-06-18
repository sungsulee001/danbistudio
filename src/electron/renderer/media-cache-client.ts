import type { EditorAsset } from '../../lib/editor/types';
import { isSupportedMediaFileReference } from '../../lib/editor/media-file-support';
import { editorApiFetch } from './editor-api-client';
import type { MediaCacheJobView } from './editor-view-model';

const MEDIA_CACHE_API_STATUS_TIMEOUT_MS = 5000;
const MEDIA_CACHE_API_ACTION_TIMEOUT_MS = 10000;

export interface MediaCacheStatusFetchOptions {
  signal?: AbortSignal;
}

export function resolveMediaCacheJobSource(asset: EditorAsset): string {
  return asset.source.trim() || asset.renderPath?.trim() || '';
}

export async function fetchMediaCacheJob(
  jobId: string,
  options: MediaCacheStatusFetchOptions = {},
): Promise<MediaCacheJobView | null> {
  const response = await editorApiFetch(`/api/editor/media-cache/${jobId}`, {
    signal: options.signal,
    timeoutMs: MEDIA_CACHE_API_STATUS_TIMEOUT_MS,
  });
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data.job as MediaCacheJobView;
}

export async function queueMediaCacheJob(asset: EditorAsset, priority: number): Promise<MediaCacheJobView> {
  const filePath = asset.renderPath?.trim();
  if (!filePath) {
    throw new Error('Imported file path is required before rebuilding cache');
  }

  const source = resolveMediaCacheJobSource(asset);
  const mimeType = typeof asset.metadata?.mimeType === 'string' ? asset.metadata.mimeType : 'application/octet-stream';
  if (!isSupportedMediaCacheAsset([asset.name, filePath, source], mimeType)) {
    throw new Error(`Unsupported media cache file: ${asset.name || filePath}.`);
  }

  const response = await editorApiFetch('/api/editor/media-cache', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: MEDIA_CACHE_API_ACTION_TIMEOUT_MS,
    body: JSON.stringify({
      filePath,
      source,
      mimeType,
      originalName: asset.name,
      priority,
    }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  return data.job as MediaCacheJobView;
}

function isSupportedMediaCacheAsset(nameCandidates: Array<string | undefined>, mimeType: string): boolean {
  return nameCandidates.some((name) => (
    typeof name === 'string' &&
    name.trim().length > 0 &&
    isSupportedMediaFileReference({ name, mimeType })
  ));
}

export async function cancelMediaCacheJob(jobId: string): Promise<MediaCacheJobView> {
  const response = await editorApiFetch(`/api/editor/media-cache/${jobId}`, {
    method: 'DELETE',
    timeoutMs: MEDIA_CACHE_API_ACTION_TIMEOUT_MS,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  return data.job as MediaCacheJobView;
}

export async function retryMediaCacheJob(jobId: string, priority: number): Promise<MediaCacheJobView> {
  const response = await editorApiFetch(`/api/editor/media-cache/${jobId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: MEDIA_CACHE_API_ACTION_TIMEOUT_MS,
    body: JSON.stringify({ priority }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  return data.job as MediaCacheJobView;
}
