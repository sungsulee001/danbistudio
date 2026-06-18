import { resolve } from 'node:path';
import { getLocalDataRoot } from './local-data-root';

export function getAutosaveStorageRoot(rootDir?: string): string {
  return resolve(getLocalDataRoot(rootDir), 'autosave');
}
