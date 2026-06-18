import { NextRequest, NextResponse } from 'next/server';
import { analyzeMediaFile } from '@/server/editor/media-analyzer';
import { clearCompletedMediaCacheJobs, createMediaCacheJob, listMediaCacheJobs } from '@/lib/editor/media-cache-queue';
import { isSupportedMediaFileReference } from '@/lib/editor/media-file-support';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    jobs: await listMediaCacheJobs(),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const filePath = typeof body.filePath === 'string' ? body.filePath.trim() : '';
    const source = typeof body.source === 'string' && body.source.trim().length > 0 ? body.source.trim() : filePath;
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType : 'application/octet-stream';
    const originalName = typeof body.originalName === 'string' ? body.originalName : 'media';
    const priority = typeof body.priority === 'number' ? body.priority : undefined;

    if (!filePath) {
      return NextResponse.json(
        { error: 'filePath is required.' },
        { status: 400 },
      );
    }

    const filePathSafetyError = validateMediaCacheFilePath(filePath);
    if (filePathSafetyError) {
      return NextResponse.json(
        { error: filePathSafetyError },
        { status: 400 },
      );
    }

    if (!isSupportedMediaCacheRequest(mimeType, [originalName, filePath, source])) {
      return NextResponse.json(
        { error: `Unsupported media cache file: ${originalName || filePath}.` },
        { status: 400 },
      );
    }

    const analysis = await analyzeMediaFile(filePath, mimeType);
    const job = createMediaCacheJob({
      filePath,
      source,
      mimeType,
      originalName,
      analysis,
    }, {
      priority,
    });

    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}

function validateMediaCacheFilePath(filePath: string): string | undefined {
  if (filePath.includes('\0')) {
    return 'Media cache filePath cannot contain null bytes.';
  }
  if (hasBlockedMediaCacheFileProtocol(filePath)) {
    return 'Media cache filePath must be a local filesystem path, not a URL or shell protocol.';
  }
  if (hasBlockedWindowsDevicePath(filePath)) {
    return 'Media cache filePath cannot use a Windows device namespace path.';
  }
  if (!isAbsoluteFilesystemPath(filePath)) {
    return 'Media cache filePath must be a local absolute filesystem path.';
  }

  return undefined;
}

function isSupportedMediaCacheRequest(mimeType: string, filenameCandidates: string[]): boolean {
  return filenameCandidates.some((filename) => (
    filename.trim().length > 0 &&
    isSupportedMediaFileReference({ name: filename, mimeType })
  ));
}

function hasBlockedMediaCacheFileProtocol(value: string): boolean {
  if (/^[a-zA-Z]:[\\/]/.test(value)) {
    return false;
  }

  return /^(?:file|https?|data|javascript|mailto|shell|cmd|powershell|pipe|crypto|concat|subfile|tcp|udp):/i.test(value)
    || /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value);
}

function hasBlockedWindowsDevicePath(value: string): boolean {
  const normalized = value.replace(/\//g, '\\').toLowerCase();
  return normalized.startsWith('\\\\.\\') ||
    normalized.startsWith('\\\\?\\') ||
    normalized.startsWith('\\??\\') ||
    normalized.startsWith('\\device\\');
}

function isAbsoluteFilesystemPath(value: string): boolean {
  return /^[/\\]/.test(value) || /^[a-zA-Z]:[\\/]/.test(value);
}

export async function DELETE() {
  return NextResponse.json({
    deleted: await clearCompletedMediaCacheJobs(),
  });
}
