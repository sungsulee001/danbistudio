/**
 * Result Handler
 *
 * Handles copying and managing generated files from ComfyUI output directory
 */

import { constants, copyFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { getOutputStorageRoot, toOutputSourcePath } from '@/server/output-storage';

const MAX_UNIQUE_OUTPUT_FILENAME_ATTEMPTS = 10000;
const MAX_RESULT_FILENAME_PART_LENGTH = 80;

export interface ResultInfo {
  originalPath: string;
  savedPath: string;
  filePath: string;
  filename: string;
}

export interface ComfyUIOutputReference {
  filename: string;
  subfolder?: string;
  type?: string;
}

export interface SaveResultFileOptions {
  rootDir?: string;
}

/**
 * Copy result file from ComfyUI output to durable local output storage.
 */
export async function saveResultFile(
  comfyuiOutputPath: string,
  jobId: string,
  options: SaveResultFileOptions = {},
): Promise<ResultInfo> {
  // Ensure output directory exists
  const outputDir = getOutputStorageRoot(options.rootDir);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Check if source file exists
  if (!existsSync(comfyuiOutputPath)) {
    throw new Error(`Source file not found: ${comfyuiOutputPath}`);
  }

  // Generate filename with job ID
  const originalFilename = path.basename(comfyuiOutputPath);
  const extension = sanitizeOutputExtension(originalFilename);
  const filenameStem = `${sanitizeOutputFilenamePart(jobId)}_${Date.now()}`;
  const saved = copyResultFileToUniqueOutput(comfyuiOutputPath, outputDir, filenameStem, extension);

  return {
    originalPath: comfyuiOutputPath,
    savedPath: toOutputSourcePath(saved.filename),
    filePath: saved.filePath,
    filename: saved.filename
  };
}

/**
 * Extract output file path from ComfyUI prompt outputs
 */
export function extractOutputPath(outputs: any): string | null {
  const reference = extractOutputReference(outputs);
  return reference ? buildComfyUIOutputReferencePath(reference) : null;
}

export function extractOutputReference(outputs: any): ComfyUIOutputReference | null {
  if (!outputs) return null;

  // ComfyUI outputs structure: { "node_id": { "images": [...], "videos": [...] } }
  for (const nodeId in outputs) {
    const nodeOutput = outputs[nodeId];

    // Check for videos first (for WAN I2V)
    if (nodeOutput.videos && nodeOutput.videos.length > 0) {
      const video = readComfyUIOutputReference(nodeOutput.videos[0]);
      if (video) {
        return video;
      }
    }

    // Check for images
    if (nodeOutput.images && nodeOutput.images.length > 0) {
      const image = readComfyUIOutputReference(nodeOutput.images[0]);
      if (image) {
        return image;
      }
    }
  }

  return null;
}

/**
 * Get full path to ComfyUI output file
 */
export function getComfyUIOutputPath(filename: string): string {
  const comfyuiOutput = process.env.COMFYUI_OUTPUT || 'E:/ai_tool/StabilityMatrix/Data/Packages/DanbiStudio-ComfyUI/output';
  return resolveComfyUIOutputPath(filename, comfyuiOutput);
}

export function resolveComfyUIOutputPath(filename: string, outputRoot: string): string {
  const root = path.resolve(/*turbopackIgnore: true*/ outputRoot);
  const requestedFilename = filename.trim();

  if (!requestedFilename) {
    throw new Error('ComfyUI output filename is missing.');
  }

  if (requestedFilename.includes('\0')) {
    throw new Error('ComfyUI output filename cannot contain null bytes.');
  }

  if (hasBlockedOutputProtocol(requestedFilename)) {
    throw new Error('ComfyUI output filename must be a local relative file path, not a URL or protocol target.');
  }

  if (path.isAbsolute(requestedFilename) || path.win32.isAbsolute(requestedFilename) || path.posix.isAbsolute(requestedFilename)) {
    throw new Error(`ComfyUI output filename must be relative to the output directory: ${requestedFilename}`);
  }

  const resolvedPath = path.resolve(root, requestedFilename.replace(/\\/g, path.sep));
  const relativePath = path.relative(root, resolvedPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`ComfyUI output filename escapes the output directory: ${requestedFilename}`);
  }

  return resolvedPath;
}

function readComfyUIOutputReference(value: unknown): ComfyUIOutputReference | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.filename !== 'string' || !candidate.filename.trim()) {
    return null;
  }

  return {
    filename: candidate.filename,
    ...(typeof candidate.subfolder === 'string' && candidate.subfolder.trim()
      ? { subfolder: candidate.subfolder }
      : {}),
    ...(typeof candidate.type === 'string' && candidate.type.trim()
      ? { type: candidate.type }
      : {}),
  };
}

function buildComfyUIOutputReferencePath(reference: ComfyUIOutputReference): string {
  const filename = reference.filename.trim().replace(/\\/g, '/');
  const subfolder = reference.subfolder?.trim().replace(/\\/g, '/');
  if (!subfolder) {
    return filename;
  }

  const normalizedSubfolder = subfolder.replace(/^\/+|\/+$/g, '');
  if (!normalizedSubfolder) {
    return filename;
  }

  return filename === normalizedSubfolder || filename.startsWith(`${normalizedSubfolder}/`)
    ? filename
    : `${normalizedSubfolder}/${filename}`;
}

function hasBlockedOutputProtocol(value: string): boolean {
  if (/^[a-zA-Z]:[\\/]/.test(value)) {
    return false;
  }

  return /^(?:file|https?|data|javascript|mailto|shell|cmd|powershell):/i.test(value)
    || /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value);
}

function sanitizeOutputFilenamePart(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '');

  return boundOutputFilenamePart(sanitized || 'job');
}

function boundOutputFilenamePart(value: string): string {
  if (value.length <= MAX_RESULT_FILENAME_PART_LENGTH) {
    return value;
  }

  const hash = shortStableHash(value);
  const prefix = value
    .slice(0, MAX_RESULT_FILENAME_PART_LENGTH - hash.length - 1)
    .replace(/[._-]+$/g, '');
  return `${prefix || 'job'}-${hash}`;
}

function shortStableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

function sanitizeOutputExtension(filename: string): string {
  const extension = path.extname(filename).toLowerCase();
  return /^\.[a-z0-9]{1,16}$/.test(extension) ? extension : '.bin';
}

function copyResultFileToUniqueOutput(
  sourcePath: string,
  outputDir: string,
  filenameStem: string,
  extension: string,
): { filePath: string; filename: string } {
  for (let attempt = 0; attempt < MAX_UNIQUE_OUTPUT_FILENAME_ATTEMPTS; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${attempt}`;
    const filename = `${filenameStem}${suffix}${extension}`;
    const filePath = path.join(/*turbopackIgnore: true*/ outputDir, filename);

    try {
      copyFileSync(sourcePath, filePath, constants.COPYFILE_EXCL);
      return { filePath, filename };
    } catch (error) {
      if (isFileAlreadyExistsError(error)) {
        continue;
      }

      throw error;
    }
  }

  throw new Error(`Could not reserve a unique output filename for ${filenameStem}${extension}.`);
}

function isFileAlreadyExistsError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === 'EEXIST';
}
