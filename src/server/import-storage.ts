import { extname, resolve, sep } from 'node:path';
import { inferSupportedMediaMimeType } from '../lib/editor/media-file-support';
import { getLocalDataRoot } from './local-data-root';
import { normalizeStorageRelativePath } from './storage-path-safety';

export function getImportStorageRoot(rootDir?: string): string {
  return resolve(getLocalDataRoot(rootDir), 'imports');
}

export function resolveImportStoragePath(relativePath: string, rootDir?: string): string {
  const normalized = normalizeImportStorageRelativePath(relativePath);
  const storageRoot = getImportStorageRoot(rootDir);
  const filePath = resolve(storageRoot, normalized);

  if (!isPathInside(storageRoot, filePath)) {
    throw new Error('Import storage path is unsafe.');
  }

  return filePath;
}

export function toImportSourcePath(relativePath: string): string {
  return `/imports/${normalizeImportStorageRelativePath(relativePath).split(sep).join('/')}`;
}

export function inferImportStorageMimeType(filePath: string): string {
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

function normalizeImportStorageRelativePath(value: string): string {
  return normalizeStorageRelativePath(value, 'Import storage');
}

function isPathInside(parent: string, child: string): boolean {
  const normalizedParent = resolve(parent);
  const normalizedChild = resolve(child);
  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}${sep}`);
}
