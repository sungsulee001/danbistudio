import { resolve } from 'node:path';
import { getLocalDataRoot } from './local-data-root';

export function getJobStorageRoot(rootDir?: string): string {
  return resolve(getLocalDataRoot(rootDir), 'jobs');
}
