import type { ImportedMediaInput } from '../../lib/editor/media-import';
import { inferSupportedMediaFileKind, readExplicitUnsupportedMediaMimeType } from '../../lib/editor/media-file-support';
import type { EditorNativeImportedCaptionSidecarFile, EditorNativeMediaImportResponse } from '../shared/ipc-contract';
import { editorApiFetch } from './editor-api-client';
import { getWindowEditorIpcClient } from './editor-ipc-client';
import { inferCaptionSidecarFormat, isCaptionSidecarFileReference, isMediaFileReference } from './import-file-routing-helpers';
import type { PreparedImportedMedia, UploadedLutFile, UploadedMediaFile } from './editor-view-model';

const DEFAULT_MEDIA_METADATA_TIMEOUT_MS = 5000;
const DEFAULT_MEDIA_UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_LUT_UPLOAD_TIMEOUT_MS = 10000;
const DEFAULT_AUDIO_PEAK_FETCH_TIMEOUT_MS = 15000;

export async function uploadMediaFiles(files: File[]): Promise<UploadedMediaFile[]> {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }

  const response = await editorApiFetch('/api/editor/media', {
    method: 'POST',
    timeoutMs: DEFAULT_MEDIA_UPLOAD_TIMEOUT_MS,
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Media upload failed: ${response.statusText}`);
  }

  const data = await response.json();
  return readUploadedMediaFilesResponse(data);
}

export function readUploadedMediaFilesResponse(data: unknown): UploadedMediaFile[] {
  if (!isRecord(data) || !Array.isArray(data.files)) {
    return [];
  }

  return data.files.map((file, index) => {
    if (!isUploadedMediaFile(file)) {
      throw new Error(`Media upload returned an unusable or unsupported file reference at index ${index}.`);
    }

    return file;
  });
}

export interface NativeMediaImportClientResult {
  available: boolean;
  canceled: boolean;
  files: UploadedMediaFile[];
  sidecars: EditorNativeImportedCaptionSidecarFile[];
  warnings: string[];
}

export async function selectAndImportNativeMediaFiles(
  request: {
    title?: string;
    buttonLabel?: string;
    allowMultiple?: boolean;
  } = {},
): Promise<NativeMediaImportClientResult> {
  const client = getWindowEditorIpcClient();
  if (!client?.media?.selectAndImport) {
    return {
      available: false,
      canceled: false,
      files: [],
      sidecars: [],
      warnings: [],
    };
  }

  const response = await client.media.selectAndImport({
    title: request.title ?? 'Import media',
    buttonLabel: request.buttonLabel ?? 'Import media',
    allowMultiple: request.allowMultiple,
  }) as EditorNativeMediaImportResponse;
  const validatedFiles = filterUploadedMediaFiles(response.files, 'Native media import');
  const validatedSidecars = filterNativeCaptionSidecars(response.sidecars, 'Native media import');

  return {
    available: true,
    canceled: response.canceled,
    files: validatedFiles.files,
    sidecars: validatedSidecars.sidecars,
    warnings: [
      ...(Array.isArray(response.warnings) ? response.warnings.filter((warning): warning is string => typeof warning === 'string') : []),
      ...validatedFiles.warnings,
      ...validatedSidecars.warnings,
    ],
  };
}

export function prepareUploadedMediaRecord(uploaded: UploadedMediaFile, fallback?: Partial<ImportedMediaInput>): PreparedImportedMedia {
  const mimeType = uploaded.mimeType
    ?? stringMetadata(uploaded.metadata?.mimeType)
    ?? fallback?.mimeType
    ?? 'application/octet-stream';
  const size = uploaded.size
    ?? numberMetadata(uploaded.metadata?.size)
    ?? fallback?.size
    ?? 0;

  return {
    input: {
      name: fallback?.name ?? uploaded.originalName,
      mimeType,
      size,
      source: uploaded.source,
      renderPath: uploaded.renderPath,
      duration: uploaded.duration ?? fallback?.duration,
      width: uploaded.width ?? fallback?.width,
      height: uploaded.height ?? fallback?.height,
      fps: uploaded.fps ?? fallback?.fps,
      mediaCache: uploaded.mediaCache ?? fallback?.mediaCache,
      metadata: {
        ...fallback?.metadata,
        ...uploaded.metadata,
        originalName: uploaded.originalName,
        importedFileName: uploaded.name,
      },
    },
    cacheJob: uploaded.cacheJob,
  };
}

export interface PreparedBrowserMediaRecord {
  media: PreparedImportedMedia;
  retainObjectUrl: boolean;
}

export function pruneRetainedBrowserMediaObjectUrls(
  objectUrls: string[],
  activeSources: Iterable<string | undefined>,
  revokeObjectUrl: (objectUrl: string) => void = (objectUrl) => URL.revokeObjectURL(objectUrl),
): string[] {
  const active = new Set(Array.from(activeSources).filter((source): source is string => Boolean(source)));
  const retained: string[] = [];

  for (const objectUrl of objectUrls) {
    if (active.has(objectUrl)) {
      retained.push(objectUrl);
    } else {
      revokeObjectUrl(objectUrl);
    }
  }

  return retained;
}

export function revokeRetainedBrowserMediaObjectUrls(
  objectUrls: Iterable<string>,
  revokeObjectUrl: (objectUrl: string) => void = (objectUrl) => URL.revokeObjectURL(objectUrl),
): void {
  for (const objectUrl of objectUrls) {
    revokeObjectUrl(objectUrl);
  }
}

export async function prepareBrowserMediaRecord(
  file: File,
  objectUrl: string,
  uploaded?: UploadedMediaFile,
  options: { metadataTimeoutMs?: number } = {},
): Promise<PreparedBrowserMediaRecord> {
  try {
    const input = await readMediaInput(file, objectUrl, options);

    if (uploaded) {
      return {
        media: prepareUploadedMediaRecord(uploaded, input),
        retainObjectUrl: false,
      };
    }

    return {
      media: { input },
      retainObjectUrl: true,
    };
  } catch (error) {
    if (!uploaded) {
      throw error;
    }

    return {
      media: prepareUploadedMediaRecord(uploaded, {
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        source: objectUrl,
      }),
      retainObjectUrl: false,
    };
  }
}

export async function uploadLutFile(file: File): Promise<UploadedLutFile> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await editorApiFetch('/api/editor/luts', {
    method: 'POST',
    timeoutMs: DEFAULT_LUT_UPLOAD_TIMEOUT_MS,
    body: formData,
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `LUT upload failed: ${response.statusText}`);
  }

  if (!data.lut?.source || !data.lut?.renderPath) {
    throw new Error('LUT upload did not return a usable file reference.');
  }

  return data.lut;
}

function stringMetadata(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function numberMetadata(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isUploadedMediaFile(value: unknown): value is UploadedMediaFile {
  if (!isRecord(value)) {
    return false;
  }

  const source = stringMetadata(value.source);
  const renderPath = stringMetadata(value.renderPath);
  const originalName = stringMetadata(value.originalName);
  const metadata = isRecord(value.metadata) ? value.metadata : undefined;
  const mimeType = stringMetadata(value.mimeType);
  const metadataMimeType = stringMetadata(metadata?.mimeType);

  if (readExplicitUnsupportedMediaMimeType(mimeType) || readExplicitUnsupportedMediaMimeType(metadataMimeType)) {
    return false;
  }

  return Boolean(source && renderPath && originalName && isMediaFileReference({
    name: originalName,
    type: mimeType,
    mimeType: metadataMimeType,
  }));
}

function filterUploadedMediaFiles(value: unknown, label: string): { files: UploadedMediaFile[]; warnings: string[] } {
  if (!Array.isArray(value)) {
    return {
      files: [],
      warnings: [`${label} returned no media file list.`],
    };
  }

  const files: UploadedMediaFile[] = [];
  const warnings: string[] = [];

  value.forEach((file, index) => {
    if (isUploadedMediaFile(file)) {
      files.push(file);
      return;
    }

    warnings.push(`${label} skipped unusable or unsupported media file reference at index ${index}.`);
  });

  return { files, warnings };
}

function filterNativeCaptionSidecars(
  value: unknown,
  label: string,
): { sidecars: EditorNativeImportedCaptionSidecarFile[]; warnings: string[] } {
  if (value === undefined) {
    return { sidecars: [], warnings: [] };
  }
  if (!Array.isArray(value)) {
    return {
      sidecars: [],
      warnings: [`${label} returned an unusable subtitle sidecar list.`],
    };
  }

  const sidecars: EditorNativeImportedCaptionSidecarFile[] = [];
  const warnings: string[] = [];

  value.forEach((sidecar, index) => {
    const normalized = normalizeNativeCaptionSidecar(sidecar);
    if (normalized) {
      sidecars.push(normalized);
      return;
    }

    warnings.push(`${label} skipped unusable subtitle sidecar reference at index ${index}.`);
  });

  return { sidecars, warnings };
}

function normalizeNativeCaptionSidecar(value: unknown): EditorNativeImportedCaptionSidecarFile | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const originalName = stringMetadata(value.originalName);
  const content = stringMetadata(value.content);
  if (!originalName || content === undefined) {
    return undefined;
  }
  const reportedMimeType = stringMetadata(value.mimeType);
  const metadata = isRecord(value.metadata) ? value.metadata as Record<string, string | number | boolean | undefined> : undefined;
  const metadataMimeType = stringMetadata(metadata?.mimeType);
  if (!isCaptionSidecarFileReference({
    name: originalName,
    type: reportedMimeType,
    mimeType: metadataMimeType,
  })) {
    return undefined;
  }
  const mimeType = resolveNativeCaptionSidecarMimeType(originalName, reportedMimeType, metadataMimeType);

  return {
    originalName,
    content,
    mimeType,
    size: numberMetadata(value.size) ?? content.length,
    metadata,
  };
}

function resolveNativeCaptionSidecarMimeType(
  originalName: string,
  reportedMimeType: string | undefined,
  metadataMimeType: string | undefined,
): string {
  const exactMimeType = [reportedMimeType, metadataMimeType].find((mimeType) => (
    mimeType && isCaptionSidecarFileReference({ name: '', type: mimeType })
  ));
  if (exactMimeType) {
    return exactMimeType;
  }

  const format = inferCaptionSidecarFormat(originalName, reportedMimeType ?? metadataMimeType);
  if (format === 'vtt') {
    return 'text/vtt';
  }
  if (format === 'srt') {
    return 'application/x-subrip';
  }

  return reportedMimeType ?? metadataMimeType ?? 'text/plain';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function readMediaInput(
  file: File,
  source: string,
  options: { metadataTimeoutMs?: number } = {},
): Promise<ImportedMediaInput> {
  const baseInput = {
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    source,
  };

  const mediaKind = inferSupportedMediaFileKind(file);
  if (mediaKind === 'video' || mediaKind === 'audio') {
    const metadata = await readTimedMediaMetadata(source, mediaKind, options.metadataTimeoutMs);
    return {
      ...baseInput,
      ...metadata,
    };
  }

  if (mediaKind === 'image') {
    const metadata = await readImageMetadata(source, options.metadataTimeoutMs);
    return {
      ...baseInput,
      ...metadata,
    };
  }

  return baseInput;
}

export async function readAudioPeaks(
  source: string,
  sampleCount = 64,
  options: { fetchTimeoutMs?: number; signal?: AbortSignal } = {},
): Promise<number[]> {
  if (source.startsWith('blob:')) {
    throw new Error('Object URLs are not persisted for waveform analysis.');
  }

  const timeout = createAudioPeakFetchTimeout(
    options.fetchTimeoutMs ?? DEFAULT_AUDIO_PEAK_FETCH_TIMEOUT_MS,
    options.signal,
  );

  try {
    const response = await fetch(source, {
      signal: timeout.signal,
    });
    if (!response.ok) {
      throw new Error(`Audio waveform fetch failed: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioContext = new AudioContext();

    try {
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      const channelData = audioBuffer.getChannelData(0);
      const bucketSize = Math.max(1, Math.floor(channelData.length / sampleCount));
      const peaks = Array.from({ length: sampleCount }).map((_, bucketIndex) => {
        const start = bucketIndex * bucketSize;
        const end = Math.min(channelData.length, start + bucketSize);
        let peak = 0;

        for (let index = start; index < end; index += 1) {
          peak = Math.max(peak, Math.abs(channelData[index]));
        }

        return peak;
      });
      const maxPeak = Math.max(...peaks, 0.001);

      return peaks.map((peak) => peak / maxPeak);
    } finally {
      await audioContext.close().catch(() => undefined);
    }
  } finally {
    timeout.clear();
  }
}

function createAudioPeakFetchTimeout(
  timeoutMs: number,
  parentSignal?: AbortSignal,
): { signal?: AbortSignal; clear: () => void } {
  if (timeoutMs <= 0 || typeof AbortController === 'undefined') {
    return {
      signal: parentSignal,
      clear: () => undefined,
    };
  }
  if (parentSignal?.aborted) {
    return {
      signal: parentSignal,
      clear: () => undefined,
    };
  }

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  const abortFromParent = () => controller.abort();
  parentSignal?.addEventListener('abort', abortFromParent, { once: true });

  return {
    signal: controller.signal,
    clear: () => {
      globalThis.clearTimeout(timeout);
      parentSignal?.removeEventListener('abort', abortFromParent);
    },
  };
}

function readTimedMediaMetadata(
  source: string,
  mediaKind: 'video' | 'audio',
  timeoutMs = DEFAULT_MEDIA_METADATA_TIMEOUT_MS,
): Promise<Pick<ImportedMediaInput, 'duration' | 'width' | 'height'>> {
  return new Promise((resolve) => {
    const element = document.createElement(mediaKind === 'audio' ? 'audio' : 'video');
    let settled = false;
    const finish = (metadata: Pick<ImportedMediaInput, 'duration' | 'width' | 'height'>) => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeout);
      element.onloadedmetadata = null;
      element.onerror = null;
      element.removeAttribute('src');
      element.load();
      resolve(metadata);
    };
    const timeout = window.setTimeout(() => finish({}), Math.max(1, timeoutMs));

    element.preload = 'metadata';
    element.onloadedmetadata = () => {
      const video = element as HTMLVideoElement;
      finish({
        duration: Number.isFinite(element.duration) ? element.duration : undefined,
        width: video.videoWidth || undefined,
        height: video.videoHeight || undefined,
      });
    };
    element.onerror = () => {
      finish({});
    };
    element.src = source;
  });
}

function readImageMetadata(
  source: string,
  timeoutMs = DEFAULT_MEDIA_METADATA_TIMEOUT_MS,
): Promise<Pick<ImportedMediaInput, 'width' | 'height'>> {
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (metadata: Pick<ImportedMediaInput, 'width' | 'height'>) => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      image.src = '';
      resolve(metadata);
    };
    const timeout = window.setTimeout(() => finish({}), Math.max(1, timeoutMs));

    image.onload = () => {
      finish({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };
    image.onerror = () => {
      finish({});
    };
    image.src = source;
  });
}
