import { existsSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { inferSupportedMediaMimeType } from '../lib/editor/media-file-support';
import { getLocalDataRoot } from './local-data-root';
import { normalizeStorageRelativePath } from './storage-path-safety';

export function getOutputStorageRoot(rootDir?: string): string {
  return resolve(getLocalDataRoot(rootDir), 'outputs');
}

export function getLegacyPublicOutputRoot(rootDir?: string): string {
  return resolve(rootDir ?? process.cwd(), 'public', 'outputs');
}

export function resolveOutputStoragePath(relativePath: string, rootDir?: string): string {
  return resolveSafeOutputPath(getOutputStorageRoot(rootDir), relativePath);
}

export function resolveLegacyPublicOutputPath(relativePath: string, rootDir?: string): string {
  return resolveSafeOutputPath(getLegacyPublicOutputRoot(rootDir), relativePath);
}

export function resolveReadableOutputPath(relativePath: string, rootDir?: string): string {
  const durablePath = resolveOutputStoragePath(relativePath, rootDir);
  if (existsSync(durablePath)) {
    return durablePath;
  }

  const legacyPath = resolveLegacyPublicOutputPath(relativePath, rootDir);
  return existsSync(legacyPath) ? legacyPath : durablePath;
}

export function toOutputSourcePath(relativePath: string): string {
  return `/outputs/${normalizeOutputStorageRelativePath(relativePath).split(sep).join('/')}`;
}

export function inferOutputStorageMimeType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.vtt':
      return 'text/vtt; charset=utf-8';
    case '.srt':
      return 'application/x-subrip; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    default:
      return inferSupportedMediaMimeType(filePath);
  }
}

function resolveSafeOutputPath(root: string, relativePath: string): string {
  const normalized = normalizeOutputStorageRelativePath(relativePath);
  const filePath = resolve(root, normalized);

  if (!isPathInside(root, filePath)) {
    throw new Error('Output storage path is unsafe.');
  }

  return filePath;
}

function normalizeOutputStorageRelativePath(value: string): string {
  return normalizeStorageRelativePath(value, 'Output storage');
}

function isPathInside(parent: string, child: string): boolean {
  const normalizedParent = resolve(parent);
  const normalizedChild = resolve(child);
  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}${sep}`);
}
