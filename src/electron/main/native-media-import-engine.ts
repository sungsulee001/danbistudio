import { constants } from 'fs';
import { copyFile, mkdir, readFile, stat } from 'fs/promises';
import path from 'path';
import { analyzeMediaFile } from '../../server/editor/media-analyzer';
import { getImportStorageRoot, toImportSourcePath } from '../../server/import-storage';
import { createMediaCacheJob } from '../../lib/editor/media-cache-queue';
import {
  inferSupportedMediaMimeType,
  isSupportedMediaFileReference,
  SUPPORTED_MEDIA_FILE_EXTENSIONS,
} from '../../lib/editor/media-file-support';
import type {
  EditorNativeImportedCaptionSidecarFile,
  EditorNativeImportedMediaFile,
  EditorNativeMediaImportRequest,
  EditorNativeMediaImportResponse,
} from '../shared/ipc-contract';

const MAX_UNIQUE_IMPORT_FILENAME_ATTEMPTS = 10000;

export interface ElectronMediaDialogLike {
  showOpenDialog(options: {
    title?: string;
    defaultPath?: string;
    buttonLabel?: string;
    properties: Array<'openFile' | 'multiSelections'>;
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<{
    canceled: boolean;
    filePaths: string[];
  }>;
}

export interface NativeMediaImportOptions {
  sourceRoot?: string;
  queueCache?: boolean;
}

export interface NativeMediaImportAutomationEnv {
  DANBI_ELECTRON_AUTOMATION_MEDIA_FILE_PATHS?: string;
}

export function selectAndImportNativeMediaFiles(
  dialog: ElectronMediaDialogLike,
  request: EditorNativeMediaImportRequest = {},
  options: NativeMediaImportOptions = {},
): Promise<EditorNativeMediaImportResponse> {
  const automatedFilePaths = resolveNativeMediaImportAutomationFilePaths();
  if (automatedFilePaths.length > 0) {
    return importNativeMediaFilePaths(automatedFilePaths, options);
  }

  return dialog.showOpenDialog({
    title: request.title ?? 'Import media',
    defaultPath: request.defaultPath,
    buttonLabel: request.buttonLabel ?? 'Import media',
    properties: request.allowMultiple === false ? ['openFile'] : ['openFile', 'multiSelections'],
    filters: [
      { name: 'Media files', extensions: [...SUPPORTED_MEDIA_FILE_EXTENSIONS] },
      { name: 'Subtitle sidecars', extensions: ['srt', 'vtt'] },
      { name: 'All files', extensions: ['*'] },
    ],
  }).then((result) => (
    result.canceled || result.filePaths.length === 0
      ? { canceled: true, files: [], warnings: [] }
      : importNativeMediaFilePaths(result.filePaths, options)
  ));
}

export function resolveNativeMediaImportAutomationFilePaths(
  env: NativeMediaImportAutomationEnv = process.env as NativeMediaImportAutomationEnv,
): string[] {
  const value = env.DANBI_ELECTRON_AUTOMATION_MEDIA_FILE_PATHS?.trim();
  if (!value) {
    return [];
  }

  if (value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
        : [];
    } catch {
      return [];
    }
  }

  return value.split(path.delimiter).map((item) => item.trim()).filter(Boolean);
}

export async function importNativeMediaFilePaths(
  filePaths: string[],
  options: NativeMediaImportOptions = {},
): Promise<EditorNativeMediaImportResponse> {
  const importDir = getImportStorageRoot(options.sourceRoot);
  const warnings: string[] = [];
  const importedMedia: EditorNativeImportedMediaFile[] = [];
  const importedSidecars: EditorNativeImportedCaptionSidecarFile[] = [];

  await mkdir(importDir, { recursive: true });

  const imports = await Promise.all(filePaths.map(async (filePath, index) => {
    try {
      const validation = validateNativeImportFilePath(filePath);
      if (!validation.ok) {
        return {
          index,
          warning: `${readNativeImportDisplayName(filePath)} import skipped: ${validation.error}`,
        };
      }

      if (isCaptionSidecarPath(validation.path)) {
        return { index, sidecar: await importOneNativeCaptionSidecarFile(validation.path) };
      }
      if (!isSupportedNativeMediaPath(validation.path)) {
        return {
          index,
          warning: `${path.basename(validation.path)} import skipped: Unsupported media file.`,
        };
      }

      return {
        index,
        media: await importOneNativeMediaFile({
          filePath: validation.path,
          importDir,
          index,
          queueCache: options.queueCache ?? true,
        }),
      };
    } catch (error) {
      return {
        index,
        warning: `${path.basename(filePath)} import failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }));

  for (const result of imports.sort((left, right) => left.index - right.index)) {
    if ('media' in result && result.media) {
      importedMedia.push(result.media);
      continue;
    }

    if ('sidecar' in result && result.sidecar) {
      importedSidecars.push(result.sidecar);
      continue;
    }

    if ('warning' in result && result.warning) {
      warnings.push(result.warning);
    }
  }

  return {
    canceled: false,
    files: importedMedia,
    sidecars: importedSidecars,
    warnings,
  };
}

async function importOneNativeMediaFile({
  filePath,
  importDir,
  index,
  queueCache,
}: {
  filePath: string;
  importDir: string;
  index: number;
  queueCache: boolean;
}): Promise<EditorNativeImportedMediaFile> {
  const absolutePath = path.resolve(filePath);
  const stats = await stat(absolutePath);
  const originalName = path.basename(absolutePath);
  const mimeType = inferMimeType(originalName);
  const requestedName = `${Date.now()}-${index}-${sanitizeFilename(originalName)}`;
  const imported = await copyNativeMediaFileToUniqueImport(absolutePath, importDir, requestedName);
  const source = toImportSourcePath(imported.name);

  const analysis = await analyzeMediaFile(imported.filePath, mimeType);
  const cacheJob = queueCache
    ? createMediaCacheJob({
      filePath: imported.filePath,
      source,
      mimeType,
      originalName,
      analysis,
    })
    : undefined;

  return {
    originalName,
    name: imported.name,
    mimeType,
    size: stats.size,
    source,
    renderPath: imported.filePath,
    duration: analysis.duration,
    width: analysis.width,
    height: analysis.height,
    fps: analysis.fps,
    cacheJob,
    metadata: {
      mimeType,
      size: stats.size,
      analyzed: analysis.warnings.length === 0,
      cached: false,
      cacheJobId: cacheJob?.id,
      hasVideo: analysis.hasVideo,
      hasAudio: analysis.hasAudio,
      videoCodec: analysis.videoCodec,
      audioCodec: analysis.audioCodec,
      audioChannels: analysis.audioChannels,
      sampleRate: analysis.sampleRate,
      bitrate: analysis.bitrate,
      rotation: analysis.rotation,
      codedWidth: analysis.codedWidth,
      codedHeight: analysis.codedHeight,
      sampleAspectRatio: analysis.sampleAspectRatio,
      displayAspectRatio: analysis.displayAspectRatio,
      pixelAspectRatio: analysis.pixelAspectRatio,
      exifOrientation: analysis.exifOrientation,
      displayWidth: analysis.width,
      displayHeight: analysis.height,
      analysisWarning: analysis.warnings[0],
      nativeImport: true,
      originalPath: absolutePath,
    },
  };
}

async function importOneNativeCaptionSidecarFile(filePath: string): Promise<EditorNativeImportedCaptionSidecarFile> {
  const absolutePath = path.resolve(filePath);
  const stats = await stat(absolutePath);
  const originalName = path.basename(absolutePath);
  const mimeType = inferMimeType(originalName);
  const content = await readFile(absolutePath, 'utf8');

  return {
    originalName,
    mimeType,
    size: stats.size,
    content,
    metadata: {
      nativeImport: true,
      originalPath: absolutePath,
    },
  };
}

function inferMimeType(filename: string): string {
  const extension = path.extname(filename).toLowerCase().replace('.', '');
  if (extension === 'srt') {
    return 'application/x-subrip';
  }

  if (extension === 'vtt') {
    return 'text/vtt';
  }

  return inferSupportedMediaMimeType(filename);
}

function isCaptionSidecarPath(filePath: string): boolean {
  return /\.(srt|vtt)$/i.test(filePath);
}

function isSupportedNativeMediaPath(filePath: string): boolean {
  return isSupportedMediaFileReference({ name: filePath });
}

function validateNativeImportFilePath(filePath: string): { ok: true; path: string } | { ok: false; error: string } {
  const requestedPath = filePath.trim();
  if (!requestedPath) {
    return { ok: false, error: 'Native import requires a local absolute file path.' };
  }
  if (requestedPath.includes('\0')) {
    return { ok: false, error: 'Native import path cannot contain null bytes.' };
  }
  if (hasBlockedNativeImportProtocol(requestedPath)) {
    return { ok: false, error: 'Native import only accepts filesystem paths, not URLs or shell protocols.' };
  }
  if (hasBlockedWindowsDevicePath(requestedPath)) {
    return { ok: false, error: 'Native import cannot read Windows device namespace paths.' };
  }
  if (!isAbsoluteFilesystemPath(requestedPath)) {
    return { ok: false, error: 'Native import requires a local absolute file path.' };
  }

  return { ok: true, path: requestedPath };
}

function readNativeImportDisplayName(filePath: string): string {
  const leaf = path.basename(filePath.replace(/\0/g, ''));
  return leaf || 'media';
}

function hasBlockedNativeImportProtocol(value: string): boolean {
  if (/^[a-zA-Z]:[\\/]/.test(value)) {
    return false;
  }

  return /^(?:file|https?|data|javascript|mailto|shell|cmd|powershell|pipe|crypto|concat|subfile|tcp|udp):/i.test(value)
    || /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value);
}

function hasBlockedWindowsDevicePath(value: string): boolean {
  const normalized = value.replace(/\//g, '\\').toLowerCase();
  return normalized.startsWith('\\\\.\\') ||
    normalized.startsWith('\\\\?\\') ||
    normalized.startsWith('\\??\\') ||
    normalized.startsWith('\\device\\');
}

function isAbsoluteFilesystemPath(value: string): boolean {
  return path.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value);
}

function sanitizeFilename(value: string): string {
  const extension = sanitizeFilenameExtension(value);
  const stemSource = extension ? value.slice(0, -extension.length) : value;
  const stem = stemSource
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '');
  return `${stem || 'media'}${extension}`;
}

function sanitizeFilenameExtension(value: string): string {
  const extension = path.extname(value).toLowerCase();
  return /^\.[a-z0-9]{1,16}$/.test(extension) ? extension : '';
}

async function copyNativeMediaFileToUniqueImport(
  sourcePath: string,
  importDir: string,
  requestedName: string,
): Promise<{ filePath: string; name: string }> {
  const parsed = path.parse(requestedName);
  const stem = parsed.name || 'media';
  const extension = parsed.ext;

  for (let attempt = 0; attempt < MAX_UNIQUE_IMPORT_FILENAME_ATTEMPTS; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${attempt}`;
    const name = `${stem}${suffix}${extension}`;
    const filePath = path.join(importDir, name);

    try {
      await copyFile(sourcePath, filePath, constants.COPYFILE_EXCL);
      return { filePath, name };
    } catch (error) {
      if (isFileAlreadyExistsError(error)) {
        continue;
      }

      throw error;
    }
  }

  throw new Error(`Could not reserve a unique imported media filename for ${requestedName}.`);
}

function isFileAlreadyExistsError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === 'EEXIST';
}
