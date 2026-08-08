import { createReadStream, existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { basename, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { NextRequest, NextResponse } from 'next/server';

import { inferSupportedMediaMimeType } from '@/lib/editor/media-file-support';
import { resolveSampleProjectPackageCandidates } from '@/server/editor/sample-project-package';

export const runtime = 'nodejs';

type ParsedRange =
  | { status: 'full' }
  | { status: 'invalid' }
  | { status: 'partial'; start: number; end: number };

const CACHE_ROLE_PREFIX_BY_DIRECTORY: Record<string, string> = {
  proxies: 'proxy-',
  thumbnails: 'thumbnail-',
  waveforms: 'waveform-',
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  try {
    const params = await context.params;
    const relativePath = (params.path ?? []).join('/');
    const filePath = await resolveSamplePackFilePath(relativePath);
    if (!filePath) {
      return NextResponse.json({ error: 'Sample pack file was not found.' }, { status: 404 });
    }

    const stats = await stat(filePath);
    if (!stats.isFile()) {
      return NextResponse.json({ error: 'Sample pack file was not found.' }, { status: 404 });
    }

    const range = parseRangeHeader(request.headers.get('range'), stats.size);
    const headers = new Headers({
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Content-Type': inferSupportedMediaMimeType(filePath),
    });

    if (range.status === 'invalid') {
      headers.set('Content-Range', `bytes */${stats.size}`);
      return new NextResponse(null, { status: 416, headers });
    }

    const start = range.status === 'partial' ? range.start : 0;
    const end = range.status === 'partial' ? range.end : Math.max(0, stats.size - 1);
    const contentLength = stats.size === 0 ? 0 : end - start + 1;

    headers.set('Content-Length', String(contentLength));
    if (range.status === 'partial') {
      headers.set('Content-Range', `bytes ${start}-${end}/${stats.size}`);
    }

    const stream = stats.size === 0
      ? null
      : Readable.toWeb(createReadStream(filePath, { start, end })) as unknown as BodyInit;

    return new NextResponse(stream, {
      status: range.status === 'partial' ? 206 : 200,
      headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('unsafe') || message.includes('empty') ? 400 : 404;
    return NextResponse.json({ error: message }, { status });
  }
}

async function resolveSamplePackFilePath(relativePath: string): Promise<string | undefined> {
  const normalized = normalizeSamplePackRelativePath(relativePath);
  const samplePackageDirectories = resolveSampleProjectPackageCandidates();
  for (const samplePackageDirectory of samplePackageDirectories) {
    const directPath = resolve(samplePackageDirectory, normalized);
    if (isPathInside(samplePackageDirectory, directPath) && existsSync(directPath)) {
      return directPath;
    }

    const legacyPath = await resolveLegacySampleCachePath(samplePackageDirectory, normalized);
    if (legacyPath) {
      return legacyPath;
    }
  }

  return undefined;
}

async function resolveLegacySampleCachePath(samplePackageDirectory: string, normalizedPath: string): Promise<string | undefined> {
  const parts = normalizedPath.split('/');
  if (parts.length !== 4 || parts[0] !== 'cache' || parts[1] !== 'media') {
    return undefined;
  }

  const rolePrefix = CACHE_ROLE_PREFIX_BY_DIRECTORY[parts[2]];
  if (!rolePrefix) {
    return undefined;
  }

  const targetName = `${rolePrefix}${basename(parts[3])}`;
  const mediaRoot = resolve(samplePackageDirectory, 'media');
  if (!isPathInside(samplePackageDirectory, mediaRoot) || !existsSync(mediaRoot)) {
    return undefined;
  }

  const assetDirectories = await readdir(mediaRoot, { withFileTypes: true });
  for (const assetDirectory of assetDirectories) {
    if (!assetDirectory.isDirectory()) {
      continue;
    }

    const candidate = resolve(mediaRoot, assetDirectory.name, targetName);
    if (isPathInside(mediaRoot, candidate) && existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function normalizeSamplePackRelativePath(value: string): string {
  const normalized = value.trim().replace(/\\/g, '/');
  if (!normalized || normalized.includes('\0') || normalized.startsWith('/') || normalized.split('/').some((part) => part === '..')) {
    throw new Error('Sample pack path is unsafe or empty.');
  }

  return normalized;
}

function parseRangeHeader(header: string | null, size: number): ParsedRange {
  if (!header) {
    return { status: 'full' };
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size < 0) {
    return { status: 'invalid' };
  }

  const [, startText, endText] = match;
  if (!startText && !endText) {
    return { status: 'invalid' };
  }

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return { status: 'invalid' };
    }
    return {
      status: 'partial',
      start: Math.max(0, size - suffixLength),
      end: Math.max(0, size - 1),
    };
  }

  const start = Number(startText);
  const end = endText ? Number(endText) : Math.max(0, size - 1);
  if (
    !Number.isSafeInteger(start)
    || !Number.isSafeInteger(end)
    || start < 0
    || end < start
    || start >= size
  ) {
    return { status: 'invalid' };
  }

  return {
    status: 'partial',
    start,
    end: Math.min(end, Math.max(0, size - 1)),
  };
}

function isPathInside(parent: string, child: string): boolean {
  const normalizedParent = resolve(parent);
  const normalizedChild = resolve(child);
  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}${sep}`);
}
