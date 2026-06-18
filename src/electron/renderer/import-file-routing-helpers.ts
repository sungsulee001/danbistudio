import { inferSupportedMediaFileKind, isSupportedMediaFileReference, normalizeMediaFileMimeType, type MediaFileReference, type SupportedMediaFileKind } from '../../lib/editor/media-file-support';

export interface ImportFileReference extends MediaFileReference {}

export interface PartitionedImportFiles<T extends ImportFileReference> {
  mediaFiles: T[];
  captionSidecarFiles: T[];
  unsupportedFiles: T[];
}

const CAPTION_SIDECAR_EXTENSIONS = /\.(srt|vtt)$/i;
const CAPTION_SIDECAR_MIME_TYPES = new Set([
  'text/vtt',
  'application/x-subrip',
  'application/srt',
]);
const GENERIC_CAPTION_SIDECAR_FALLBACK_MIME_TYPES = new Set([
  'application/octet-stream',
  'binary/octet-stream',
  'text/plain',
]);

export function partitionImportFileReferences<T extends ImportFileReference>(files: T[]): PartitionedImportFiles<T> {
  return files.reduce<PartitionedImportFiles<T>>((groups, file) => {
    if (isCaptionSidecarFileReference(file)) {
      groups.captionSidecarFiles.push(file);
      return groups;
    }

    if (isMediaFileReference(file)) {
      groups.mediaFiles.push(file);
      return groups;
    }

    groups.unsupportedFiles.push(file);
    return groups;
  }, {
    mediaFiles: [],
    captionSidecarFiles: [],
    unsupportedFiles: [],
  });
}

export function isCaptionSidecarFileReference(file: ImportFileReference): boolean {
  const mimeTypes = readImportFileMimeTypes(file);
  if (mimeTypes.some((mimeType) => isCaptionSidecarMimeType(mimeType))) {
    return true;
  }

  if (mimeTypes.some((mimeType) => isExplicitUnsupportedCaptionSidecarMimeType(mimeType))) {
    return false;
  }

  return CAPTION_SIDECAR_EXTENSIONS.test(file.name);
}

export function isMediaFileReference(file: ImportFileReference): boolean {
  return isSupportedMediaFileReference(file);
}

export function inferMediaFileReferenceKind(file: ImportFileReference): SupportedMediaFileKind | undefined {
  return inferSupportedMediaFileKind(file);
}

export function inferCaptionSidecarFormat(filename: string, mimeType?: string): 'srt' | 'vtt' | 'auto' {
  const normalizedMimeType = normalizeMediaFileMimeType(mimeType);
  if (normalizedMimeType === 'text/vtt' || /\.vtt$/i.test(filename)) {
    return 'vtt';
  }

  if (
    normalizedMimeType === 'application/x-subrip'
    || normalizedMimeType === 'application/srt'
    || /\.srt$/i.test(filename)
  ) {
    return 'srt';
  }

  return 'auto';
}

function readImportFileMimeTypes(file: ImportFileReference): string[] {
  return Array.from(new Set([file.type, file.mimeType]
    .map(normalizeMediaFileMimeType)
    .filter((value): value is string => Boolean(value))));
}

function isCaptionSidecarMimeType(mimeType: string): boolean {
  return CAPTION_SIDECAR_MIME_TYPES.has(mimeType);
}

function isExplicitUnsupportedCaptionSidecarMimeType(mimeType: string): boolean {
  return !isCaptionSidecarMimeType(mimeType)
    && !GENERIC_CAPTION_SIDECAR_FALLBACK_MIME_TYPES.has(mimeType);
}
