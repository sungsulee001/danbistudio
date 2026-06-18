import { sep } from 'node:path';

const WINDOWS_INVALID_PATH_SEGMENT_CHARACTERS = /[<>:"|?*]/;
const WINDOWS_RESERVED_PATH_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
]);

export function normalizeStorageRelativePath(value: string, label: string): string {
  const parts = value.split(/[\\/]+/).filter(Boolean);
  if (parts.length === 0) {
    throw new Error(`${label} path is empty.`);
  }

  for (const part of parts) {
    if (isUnsafeStoragePathSegment(part)) {
      throw new Error(`${label} path is unsafe.`);
    }
  }

  return parts.join(sep);
}

function isUnsafeStoragePathSegment(part: string): boolean {
  return part === '.' ||
    part === '..' ||
    part.includes('\0') ||
    WINDOWS_INVALID_PATH_SEGMENT_CHARACTERS.test(part) ||
    isWindowsReservedPathName(part);
}

function isWindowsReservedPathName(value: string): boolean {
  const baseName = value.split('.')[0]?.toLowerCase();
  return Boolean(baseName) && WINDOWS_RESERVED_PATH_NAMES.has(baseName);
}
