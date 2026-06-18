import { existsSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { inferSupportedMediaMimeType } from '../lib/editor/media-file-support';
import { getLocalDataRoot } from './local-data-root';
import { normalizeStorageRelativePath } from './storage-path-safety';

export function getCacheStorageRoot(rootDir?: string): string {
  return resolve(getLocalDataRoot(rootDir), 'cache');
}

export function getLegacyPublicCacheRoot(rootDir?: string): string {
  return resolve(rootDir ?? process.cwd(), 'public', 'cache');
}

export function resolveCacheStoragePath(relativePath: string, rootDir?: string): string {
  return resolveSafeCachePath(getCacheStorageRoot(rootDir), relativePath);
}

export function resolveLegacyPublicCachePath(relativePath: string, rootDir?: string): string {
  return resolveSafeCachePath(getLegacyPublicCacheRoot(rootDir), relativePath);
}

export function resolveReadableCachePath(relativePath: string, rootDir?: string): string {
  const durablePath = resolveCacheStoragePath(relativePath, rootDir);
  if (existsSync(durablePath)) {
    return durablePath;
  }

  const legacyPath = resolveLegacyPublicCachePath(relativePath, rootDir);
  return existsSync(legacyPath) ? legacyPath : durablePath;
}

export function toCacheSourcePath(relativePath: string): string {
  return `/cache/${normalizeCacheStorageRelativePath(relativePath).split(sep).join('/')}`;
}

export function inferCacheStorageMimeType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.json':
      return 'application/json; charset=utf-8';
    default:
      return inferSupportedMediaMimeType(filePath);
  }
}

function resolveSafeCachePath(root: string, relativePath: string): string {
  const normalized = normalizeCacheStorageRelativePath(relativePath);
  const filePath = resolve(root, normalized);

  if (!isPathInside(root, filePath)) {
    throw new Error('Cache storage path is unsafe.');
  }

  return filePath;
}

function normalizeCacheStorageRelativePath(value: string): string {
  return normalizeStorageRelativePath(value, 'Cache storage');
}

function isPathInside(parent: string, child: string): boolean {
  const normalizedParent = resolve(parent);
  const normalizedChild = resolve(child);
  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}${sep}`);
}
