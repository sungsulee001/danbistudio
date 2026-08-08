export type SupportedMediaFileKind = 'video' | 'audio' | 'image';

export interface MediaFileReference {
  name: string;
  type?: string;
  mimeType?: string;
}

export const SUPPORTED_VIDEO_FILE_EXTENSIONS = ['mp4', 'mov', 'm4v', 'qt', 'mkv', 'webm', 'avi'] as const;
export const SUPPORTED_AUDIO_FILE_EXTENSIONS = ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'] as const;
export const SUPPORTED_IMAGE_FILE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff'] as const;
export const SUPPORTED_MEDIA_FILE_EXTENSIONS = [
  ...SUPPORTED_VIDEO_FILE_EXTENSIONS,
  ...SUPPORTED_AUDIO_FILE_EXTENSIONS,
  ...SUPPORTED_IMAGE_FILE_EXTENSIONS,
] as const;
export const SUPPORTED_CAPTION_SIDECAR_FILE_EXTENSIONS = ['srt', 'vtt'] as const;

const SUPPORTED_VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/x-m4v',
  'video/quicktime',
  'video/x-matroska',
  'video/matroska',
  'application/x-matroska',
  'video/webm',
  'video/x-msvideo',
  'video/avi',
] as const;

const SUPPORTED_AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/flac',
  'audio/x-flac',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/x-aac',
  'audio/ogg',
  'audio/webm',
  'application/ogg',
] as const;

const SUPPORTED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/x-png',
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
] as const;

export const SUPPORTED_MEDIA_FILE_ACCEPT = [
  ...SUPPORTED_MEDIA_FILE_EXTENSIONS.map((extension) => `.${extension}`),
  ...SUPPORTED_VIDEO_MIME_TYPES,
  ...SUPPORTED_AUDIO_MIME_TYPES,
  ...SUPPORTED_IMAGE_MIME_TYPES,
].join(',');

export const SUPPORTED_MEDIA_AND_CAPTION_FILE_ACCEPT = [
  SUPPORTED_MEDIA_FILE_ACCEPT,
  ...SUPPORTED_CAPTION_SIDECAR_FILE_EXTENSIONS.map((extension) => `.${extension}`),
  'text/vtt',
  'application/x-subrip',
  'application/srt',
].join(',');

const VIDEO_FILE_EXTENSIONS = /\.(mp4|mov|m4v|qt|mkv|webm|avi)(?:$|[?#\s])/i;
const AUDIO_FILE_EXTENSIONS = /\.(mp3|wav|flac|m4a|aac|ogg)(?:$|[?#\s])/i;
const IMAGE_FILE_EXTENSIONS = /\.(png|jpe?g|webp|gif|bmp|tiff?)(?:$|[?#\s])/i;

const SUPPORTED_VIDEO_MIME_TYPE_SET = new Set<string>(SUPPORTED_VIDEO_MIME_TYPES);
const SUPPORTED_AUDIO_MIME_TYPE_SET = new Set<string>(SUPPORTED_AUDIO_MIME_TYPES);
const SUPPORTED_IMAGE_MIME_TYPE_SET = new Set<string>(SUPPORTED_IMAGE_MIME_TYPES);
const GENERIC_MEDIA_MIME_TYPE_SET = new Set<string>([
  'application/octet-stream',
  'binary/octet-stream',
]);

export function isSupportedMediaFileReference(file: MediaFileReference): boolean {
  return Boolean(inferSupportedMediaFileKind(file));
}

export function inferSupportedMediaFileKind(file: MediaFileReference): SupportedMediaFileKind | undefined {
  const mimeTypes = readMediaFileMimeTypes(file);
  const mimeKind = inferSupportedMediaFileKindFromMimeTypes(mimeTypes);
  if (mimeKind) {
    return mimeKind;
  }

  if (!canInferSupportedMediaKindFromName(mimeTypes)) {
    return undefined;
  }

  return inferSupportedMediaFileKindFromName(file.name);
}

export function inferSupportedMediaMimeType(name: string): string {
  const extension = readLowercaseExtension(name);
  switch (extension) {
    case 'mp4':
      return 'video/mp4';
    case 'm4v':
      return 'video/x-m4v';
    case 'mov':
    case 'qt':
      return 'video/quicktime';
    case 'mkv':
      return 'video/x-matroska';
    case 'webm':
      return 'video/webm';
    case 'avi':
      return 'video/x-msvideo';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'flac':
      return 'audio/flac';
    case 'm4a':
      return 'audio/mp4';
    case 'aac':
      return 'audio/aac';
    case 'ogg':
      return 'audio/ogg';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'bmp':
      return 'image/bmp';
    case 'tif':
    case 'tiff':
      return 'image/tiff';
    default:
      return 'application/octet-stream';
  }
}

export function readExplicitUnsupportedMediaMimeType(value?: string): string | undefined {
  const mimeType = normalizeMediaFileMimeType(value);
  if (!mimeType || GENERIC_MEDIA_MIME_TYPE_SET.has(mimeType) || inferSupportedMediaFileKindFromMimeTypes([mimeType])) {
    return undefined;
  }

  return mimeType;
}

function inferSupportedMediaFileKindFromMimeTypes(mimeTypes: string[]): SupportedMediaFileKind | undefined {
  for (const mimeType of mimeTypes) {
    if (SUPPORTED_VIDEO_MIME_TYPE_SET.has(mimeType)) {
      return 'video';
    }

    if (SUPPORTED_AUDIO_MIME_TYPE_SET.has(mimeType)) {
      return 'audio';
    }

    if (SUPPORTED_IMAGE_MIME_TYPE_SET.has(mimeType)) {
      return 'image';
    }
  }

  return undefined;
}

function inferSupportedMediaFileKindFromName(name: string): SupportedMediaFileKind | undefined {
  if (AUDIO_FILE_EXTENSIONS.test(name)) {
    return 'audio';
  }

  if (IMAGE_FILE_EXTENSIONS.test(name)) {
    return 'image';
  }

  if (VIDEO_FILE_EXTENSIONS.test(name)) {
    return 'video';
  }

  return undefined;
}

function readMediaFileMimeTypes(file: MediaFileReference): string[] {
  return Array.from(new Set([file.type, file.mimeType]
    .map(normalizeMediaFileMimeType)
    .filter((value): value is string => Boolean(value))));
}

function canInferSupportedMediaKindFromName(mimeTypes: string[]): boolean {
  return mimeTypes.length === 0 || mimeTypes.every((mimeType) => GENERIC_MEDIA_MIME_TYPE_SET.has(mimeType));
}

export function normalizeMediaFileMimeType(value?: string): string | undefined {
  const normalized = value?.trim().toLowerCase().split(';', 1)[0].trim();
  return normalized || undefined;
}

function readLowercaseExtension(name: string): string {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)(?:$|[?#\s])/);
  return match?.[1] ?? '';
}
