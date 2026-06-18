import { resolve } from 'node:path';
import { getLocalDataRoot } from './local-data-root';

export function getSttStorageRoot(rootDir?: string): string {
  return resolve(getLocalDataRoot(rootDir), 'stt');
}
