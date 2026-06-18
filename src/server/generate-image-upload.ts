import { mkdir, readFile, writeFile } from 'fs/promises';
import { basename, extname, isAbsolute, parse, relative, resolve } from 'path';
import { getImportStorageRoot } from './import-storage';

export interface GenerateImageUploadRecord {
  originalName: string;
  name: string;
  mimeType: string;
  size: number;
  source: string;
}

export interface GenerateImageUploadFile extends GenerateImageUploadRecord {
  filePath: string;
  bytes: Uint8Array;
}

const MAX_GENERATE_IMAGE_BYTES = 32 * 1024 * 1024;
const MAX_UNIQUE_GENERATE_IMAGE_UPLOAD_ATTEMPTS = 10000;
const SUPPORTED_GENERATE_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);
const SUPPORTED_GENERATE_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

export async function saveGenerateImageUpload(file: File, rootDir?: string): Promise<GenerateImageUploadRecord> {
  validateGenerateImageFile(file);

  const uploadDir = getGenerateImageUploadDir(rootDir);
  await mkdir(uploadDir, { recursive: true });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const saved = await writeGenerateImageFileToUniquePath(
    bytes,
    uploadDir,
    `${Date.now()}-${sanitizeGenerateImageFilename(file.name, file.type)}`,
  );

  return {
    originalName: file.name,
    name: saved.filename,
    mimeType: normalizeGenerateImageMimeType(file.type, file.name),
    size: file.size,
    source: `/imports/generate/${saved.filename}`,
  };
}

export async function readGenerateImageUpload(name: string, rootDir?: string): Promise<GenerateImageUploadFile> {
  const filename = normalizeStoredGenerateImageName(name);
  const uploadDir = getGenerateImageUploadDir(rootDir);
  const filePath = resolve(uploadDir, filename);
  if (!isPathInside(uploadDir, filePath)) {
    throw new Error('Generated image upload path is unsafe.');
  }

  const bytes = await readFile(filePath);
  return {
    originalName: stripTimestampPrefix(filename),
    name: filename,
    mimeType: normalizeGenerateImageMimeType('', filename),
    size: bytes.byteLength,
    source: `/imports/generate/${filename}`,
    filePath,
    bytes,
  };
}

export function normalizeGenerateImageUploadName(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object' && 'name' in value) {
    const name = (value as { name?: unknown }).name;
    return typeof name === 'string' ? name : undefined;
  }

  return undefined;
}

function validateGenerateImageFile(file: File): void {
  if (file.size <= 0 || file.size > MAX_GENERATE_IMAGE_BYTES) {
    throw new Error('Image file size is invalid or too large.');
  }

  const mimeType = file.type.toLowerCase();
  const extension = extname(file.name).toLowerCase();
  const hasSupportedMimeType = SUPPORTED_GENERATE_IMAGE_TYPES.has(mimeType);
  const canUseExtensionFallback = (mimeType === '' || mimeType === 'application/octet-stream')
    && SUPPORTED_GENERATE_IMAGE_EXTENSIONS.has(extension);

  if (!hasSupportedMimeType && !canUseExtensionFallback) {
    throw new Error('Unsupported image format. Use PNG, JPEG, WebP, or GIF.');
  }
}

function getGenerateImageUploadDir(rootDir?: string): string {
  return resolve(getImportStorageRoot(rootDir), 'generate');
}

function normalizeStoredGenerateImageName(value: string): string {
  if (value !== basename(value)) {
    throw new Error('Image upload name must not include path separators.');
  }

  if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new Error('Image upload name is invalid.');
  }

  const extension = extname(value).toLowerCase();
  if (!SUPPORTED_GENERATE_IMAGE_EXTENSIONS.has(extension)) {
    throw new Error('Image upload extension is unsupported.');
  }

  return value;
}

function sanitizeGenerateImageFilename(value: string, mimeType: string): string {
  const extension = chooseGenerateImageExtension(value, mimeType);
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[._-]+|[._-]+$/g, '');
  const baseName = cleaned
    ? cleaned.slice(0, cleaned.length - extname(cleaned).length).replace(/^[._-]+|[._-]+$/g, '')
    : '';

  return `${baseName && baseName.toLowerCase() !== extension.slice(1) ? baseName : 'image'}${extension}`;
}

function normalizeGenerateImageMimeType(mimeType: string, filename: string): string {
  const normalized = mimeType.toLowerCase();
  if (SUPPORTED_GENERATE_IMAGE_TYPES.has(normalized)) {
    return normalized === 'image/jpg' ? 'image/jpeg' : normalized;
  }

  switch (extname(filename).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.png':
    default:
      return 'image/png';
  }
}

function stripTimestampPrefix(filename: string): string {
  return filename.replace(/^\d+-/, '');
}

function chooseGenerateImageExtension(filename: string, mimeType: string): string {
  const extension = extname(filename).toLowerCase();
  if (SUPPORTED_GENERATE_IMAGE_EXTENSIONS.has(extension)) {
    return extension;
  }

  switch (normalizeGenerateImageMimeType(mimeType, filename)) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    case 'image/png':
    default:
      return '.png';
  }
}

async function writeGenerateImageFileToUniquePath(
  bytes: Uint8Array,
  uploadDir: string,
  requestedFilename: string,
): Promise<{ filePath: string; filename: string }> {
  const parsed = parse(requestedFilename);
  const stem = parsed.name || 'image';
  const extension = parsed.ext;

  for (let attempt = 0; attempt < MAX_UNIQUE_GENERATE_IMAGE_UPLOAD_ATTEMPTS; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${attempt}`;
    const filename = `${stem}${suffix}${extension}`;
    const filePath = resolve(uploadDir, filename);
    if (!isPathInside(uploadDir, filePath)) {
      throw new Error('Generated image upload path is unsafe.');
    }

    try {
      await writeFile(filePath, bytes, { flag: 'wx' });
      return { filePath, filename };
    } catch (error) {
      if (isFileAlreadyExistsError(error)) {
        continue;
      }

      throw error;
    }
  }

  throw new Error(`Could not reserve a unique generated image upload filename for ${requestedFilename}.`);
}

function isFileAlreadyExistsError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === 'EEXIST';
}

function isPathInside(root: string, candidate: string): boolean {
  const pathFromRoot = relative(resolve(root), resolve(candidate));
  return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot));
}
