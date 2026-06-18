import type { EditorProject, ExportProfile } from './types';

export type RenderOutputValidationCode =
  | 'missing-output-path'
  | 'directory-output-path'
  | 'missing-output-extension'
  | 'container-extension-mismatch'
  | 'null-byte-output-path'
  | 'unsupported-output-protocol'
  | 'windows-device-output-path'
  | 'windows-invalid-output-name'
  | 'windows-reserved-output-name';

export interface RenderOutputValidationIssue {
  code: RenderOutputValidationCode;
  message: string;
  action: string;
}

const MAX_RENDER_OUTPUT_NAME_PART_LENGTH = 80;

export function buildDefaultRenderOutputPath(project: EditorProject, profileId: string): string {
  const profile = findExportProfile(project, profileId);
  return `renders/${safeName(project.id)}.${extensionForContainer(profile.container)}`;
}

export function buildRenderOutputFilename(
  project: EditorProject,
  profileId: string,
  timestamp: number | string = Date.now(),
): string {
  const profile = findExportProfile(project, profileId);
  return `${safeName(project.id)}-${safeName(String(timestamp))}.${extensionForContainer(profile.container)}`;
}

export function buildBatchRenderOutputFilename(
  project: EditorProject,
  profileId: string,
  batchId: number | string = Date.now(),
): string {
  const profile = findExportProfile(project, profileId);
  return `${safeName(project.id)}-${safeName(profile.id)}-${safeName(String(batchId))}.${extensionForContainer(profile.container)}`;
}

export function buildBatchRenderOutputPath(
  project: EditorProject,
  profileId: string,
  batchId: number | string = Date.now(),
): string {
  return `renders/${buildBatchRenderOutputFilename(project, profileId, batchId)}`;
}

export function extensionForContainer(container: ExportProfile['container']): string {
  switch (container) {
    case 'mov':
      return 'mov';
    case 'webm':
      return 'webm';
    case 'mp4':
    default:
      return 'mp4';
  }
}

export function expectedRenderOutputExtension(project: EditorProject, profileId: string): string {
  return extensionForContainer(findExportProfile(project, profileId).container);
}

export function readRenderOutputExtension(outputPath: string): string | undefined {
  const leaf = outputPath.trim().split(/[\\/]/).pop() ?? '';
  const match = /\.([a-zA-Z0-9]+)$/.exec(leaf);
  return match?.[1]?.toLowerCase();
}

export function validateRenderOutputPath(
  project: EditorProject,
  profileId: string,
  outputPath: string | undefined,
): RenderOutputValidationIssue[] {
  const resolvedOutputPath = (outputPath ?? buildDefaultRenderOutputPath(project, profileId)).trim();
  const expectedExtension = expectedRenderOutputExtension(project, profileId);
  const safetyIssue = validateRenderOutputPathSafety(resolvedOutputPath, expectedExtension);

  if (safetyIssue) {
    return [safetyIssue];
  }

  if (!resolvedOutputPath) {
    return [{
      code: 'missing-output-path',
      message: 'Render output path is empty.',
      action: `Choose a writable .${expectedExtension} output file before rendering.`,
    }];
  }

  if (/[\\/]$/.test(resolvedOutputPath)) {
    return [{
      code: 'directory-output-path',
      message: 'Render output path points to a directory, not a file.',
      action: `Choose a filename ending in .${expectedExtension}.`,
    }];
  }

  const extension = readRenderOutputExtension(resolvedOutputPath);
  if (!extension) {
    return [{
      code: 'missing-output-extension',
      message: 'Render output path has no file extension.',
      action: `Choose a filename ending in .${expectedExtension}.`,
    }];
  }

  if (extension !== expectedExtension) {
    return [{
      code: 'container-extension-mismatch',
      message: `Output extension .${extension} does not match the ${expectedExtension.toUpperCase()} export container.`,
      action: `Use a .${expectedExtension} output file or change the export profile container.`,
    }];
  }

  return [];
}

export function validateRenderOutputPathSafety(
  outputPath: string,
  expectedExtension?: string,
): RenderOutputValidationIssue | undefined {
  const resolvedOutputPath = outputPath.trim();
  const extensionLabel = expectedExtension ? ` .${expectedExtension}` : '';

  if (!resolvedOutputPath) {
    return undefined;
  }

  if (resolvedOutputPath.includes('\0')) {
    return {
      code: 'null-byte-output-path',
      message: 'Render output path contains a null byte.',
      action: `Choose a writable local${extensionLabel} output file before rendering.`,
    };
  }

  if (hasBlockedRenderOutputProtocol(resolvedOutputPath)) {
    return {
      code: 'unsupported-output-protocol',
      message: 'Render output path uses a URL or shell protocol instead of a local filesystem path.',
      action: `Choose a writable local${extensionLabel} output file before rendering.`,
    };
  }

  if (hasBlockedWindowsDevicePath(resolvedOutputPath)) {
    return {
      code: 'windows-device-output-path',
      message: 'Render output path uses a Windows device namespace path.',
      action: `Choose a normal local${extensionLabel} output file before rendering.`,
    };
  }

  const outputName = readRenderOutputLeafName(resolvedOutputPath);
  if (outputName && hasWindowsInvalidFileNameCharacter(outputName)) {
    return {
      code: 'windows-invalid-output-name',
      message: 'Render output filename contains characters that are not valid on Windows.',
      action: `Choose a different local${extensionLabel} output filename before rendering.`,
    };
  }

  if (outputName && isWindowsReservedPathName(outputName)) {
    return {
      code: 'windows-reserved-output-name',
      message: 'Render output filename uses a Windows reserved device name.',
      action: `Choose a different local${extensionLabel} output filename before rendering.`,
    };
  }

  return undefined;
}

function findExportProfile(project: EditorProject, profileId: string): ExportProfile {
  const profile = project.exportProfiles.find((item) => item.id === profileId);
  if (!profile) {
    throw new Error(`Export profile not found: ${profileId}`);
  }

  return profile;
}

function safeName(value: string): string {
  const name = value
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '') || 'render';
  const boundedName = boundRenderOutputNamePart(name);

  return isWindowsReservedPathName(boundedName) ? `render-${boundedName}` : boundedName;
}

function boundRenderOutputNamePart(value: string): string {
  if (value.length <= MAX_RENDER_OUTPUT_NAME_PART_LENGTH) {
    return value;
  }

  const hash = shortStableHash(value);
  const prefix = value
    .slice(0, MAX_RENDER_OUTPUT_NAME_PART_LENGTH - hash.length - 1)
    .replace(/[._-]+$/g, '');
  return `${prefix || 'render'}-${hash}`;
}

function shortStableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

function readRenderOutputLeafName(outputPath: string): string {
  return outputPath.trim().split(/[\\/]/).pop() ?? '';
}

function isWindowsReservedPathName(value: string): boolean {
  const baseName = value.split('.')[0]?.toLowerCase();
  return Boolean(baseName) && WINDOWS_RESERVED_PATH_NAMES.has(baseName);
}

function hasWindowsInvalidFileNameCharacter(value: string): boolean {
  return /[<>:"|?*]/.test(value);
}

function hasBlockedWindowsDevicePath(value: string): boolean {
  const normalized = value.replace(/\//g, '\\').toLowerCase();
  return normalized.startsWith('\\\\.\\') ||
    normalized.startsWith('\\\\?\\') ||
    normalized.startsWith('\\??\\') ||
    normalized.startsWith('\\device\\');
}

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

function hasBlockedRenderOutputProtocol(value: string): boolean {
  if (/^[a-zA-Z]:[\\/]/.test(value)) {
    return false;
  }

  return /^(?:file|https?|data|javascript|mailto|shell|cmd|powershell|pipe|crypto|concat|subfile|tcp|udp):/i.test(value)
    || /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value);
}
