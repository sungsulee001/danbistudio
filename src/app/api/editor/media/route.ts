import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { analyzeMediaFile } from '@/server/editor/media-analyzer';
import { createMediaCacheJob } from '@/lib/editor/media-cache-queue';
import { isSupportedMediaFileReference } from '@/lib/editor/media-file-support';
import { getImportStorageRoot, toImportSourcePath } from '@/server/import-storage';

export const runtime = 'nodejs';

const MAX_UNIQUE_UPLOAD_FILENAME_ATTEMPTS = 10000;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files').filter((item): item is File => item instanceof File);

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No files were uploaded.' },
        { status: 400 },
      );
    }
    const mediaFiles = files
      .map((file, index) => ({ file, index }))
      .filter(({ file }) => isSupportedMediaUpload(file));
    const skippedFiles = files.length - mediaFiles.length;

    if (mediaFiles.length === 0) {
      return NextResponse.json(
        { error: 'No supported media files were uploaded.' },
        { status: 400 },
      );
    }

    const importDir = getImportStorageRoot();
    await mkdir(importDir, { recursive: true });

    const uploaded = await Promise.all(mediaFiles.map(async ({ file, index }) => {
      const bytes = Buffer.from(await file.arrayBuffer());
      const uploadedFile = await writeUploadedFileToUniqueImport(
        bytes,
        importDir,
        `${Date.now()}-${index}-${sanitizeFilename(file.name)}`,
      );
      const source = toImportSourcePath(uploadedFile.filename);

      const analysis = await analyzeMediaFile(uploadedFile.filePath, file.type || 'application/octet-stream');
      const cacheJob = createMediaCacheJob({
        filePath: uploadedFile.filePath,
        source,
        mimeType: file.type || 'application/octet-stream',
        originalName: file.name,
        analysis,
      });

      return {
        originalName: file.name,
        name: uploadedFile.filename,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        source,
        renderPath: uploadedFile.filePath,
        duration: analysis.duration,
        width: analysis.width,
        height: analysis.height,
        fps: analysis.fps,
        cacheJob,
        metadata: {
          analyzed: analysis.warnings.length === 0,
          cached: false,
          cacheJobId: cacheJob.id,
          hasVideo: analysis.hasVideo,
          hasAudio: analysis.hasAudio,
          videoCodec: analysis.videoCodec,
          audioCodec: analysis.audioCodec,
          audioChannels: analysis.audioChannels,
          sampleRate: analysis.sampleRate,
          bitrate: analysis.bitrate,
          rotation: analysis.rotation,
          codedWidth: analysis.codedWidth,
          codedHeight: analysis.codedHeight,
          sampleAspectRatio: analysis.sampleAspectRatio,
          displayAspectRatio: analysis.displayAspectRatio,
          pixelAspectRatio: analysis.pixelAspectRatio,
          exifOrientation: analysis.exifOrientation,
          displayWidth: analysis.width,
          displayHeight: analysis.height,
          analysisWarning: analysis.warnings[0],
        },
      };
    }));

    return NextResponse.json({
      files: uploaded,
      warnings: skippedFiles > 0
        ? [`Skipped ${skippedFiles} unsupported media upload${skippedFiles === 1 ? '' : 's'}.`]
        : [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

function isSupportedMediaUpload(file: File): boolean {
  return isSupportedMediaFileReference(file);
}

function sanitizeFilename(value: string): string {
  const extension = sanitizeFilenameExtension(value);
  const stemSource = extension ? value.slice(0, -extension.length) : value;
  const stem = stemSource
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '');
  return `${stem || 'media'}${extension}`;
}

function sanitizeFilenameExtension(value: string): string {
  const extension = path.extname(value).toLowerCase();
  return /^\.[a-z0-9]{1,16}$/.test(extension) ? extension : '';
}

async function writeUploadedFileToUniqueImport(
  bytes: Buffer,
  importDir: string,
  requestedFilename: string,
): Promise<{ filePath: string; filename: string }> {
  const parsed = path.parse(requestedFilename);
  const stem = parsed.name || 'media';
  const extension = parsed.ext;

  for (let attempt = 0; attempt < MAX_UNIQUE_UPLOAD_FILENAME_ATTEMPTS; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${attempt}`;
    const filename = `${stem}${suffix}${extension}`;
    const filePath = path.join(importDir, filename);

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

  throw new Error(`Could not reserve a unique uploaded media filename for ${requestedFilename}.`);
}

function isFileAlreadyExistsError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === 'EEXIST';
}
