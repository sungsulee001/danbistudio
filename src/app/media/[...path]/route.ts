import { createReadStream, existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { NextRequest, NextResponse } from 'next/server';

import { inferSupportedMediaMimeType } from '@/lib/editor/media-file-support';
import { findSampleProjectPackageDirectory } from '@/server/editor/sample-project-package';

export const runtime = 'nodejs';

type ParsedRange =
  | { status: 'full' }
  | { status: 'invalid' }
  | { status: 'partial'; start: number; end: number };

const DEFAULT_MEDIA_FALLBACKS: Record<string, { assetDirectory: string; rolePrefixes: string[] }> = {
  'interview-master.mp4': {
    assetDirectory: 'asset-sample-intro',
    rolePrefixes: ['proxy-', 'source-', 'render-'],
  },
  'soft-pulse.wav': {
    assetDirectory: 'asset-sample-music',
    rolePrefixes: ['source-', 'render-'],
  },
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  try {
    const params = await context.params;
    const relativePath = (params.path ?? []).join('/');
    const filePath = await resolveMediaFilePath(relativePath);
    if (!filePath) {
      return NextResponse.json({ error: 'Media file was not found.' }, { status: 404 });
    }

    const stats = await stat(filePath);
    if (!stats.isFile()) {
      return NextResponse.json({ error: 'Media file was not found.' }, { status: 404 });
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

async function resolveMediaFilePath(relativePath: string): Promise<string | undefined> {
  const normalized = normalizeMediaRelativePath(relativePath);
  const publicMediaRoot = resolve(process.cwd(), 'public', 'media');
  const publicMediaPath = resolve(publicMediaRoot, normalized);
  if (isPathInside(publicMediaRoot, publicMediaPath) && existsSync(publicMediaPath)) {
    return publicMediaPath;
  }

  const fallback = DEFAULT_MEDIA_FALLBACKS[basename(normalized).toLowerCase()];
  if (!fallback) {
    return undefined;
  }

  const samplePackageDirectory = findSampleProjectPackageDirectory();
  if (!samplePackageDirectory) {
    return undefined;
  }

  const fallbackDirectory = resolve(samplePackageDirectory, 'media', fallback.assetDirectory);
  if (!isPathInside(samplePackageDirectory, fallbackDirectory) || !existsSync(fallbackDirectory)) {
    return undefined;
  }

  const fileNames = await readdir(fallbackDirectory);
  const fallbackName = fallback.rolePrefixes
    .flatMap((prefix) => fileNames.filter((fileName) => fileName.startsWith(prefix)))
    .find((fileName) => fileName.toLowerCase().endsWith(basename(normalized).toLowerCase().split('.').pop() ? `.${basename(normalized).toLowerCase().split('.').pop()}` : ''));

  return fallbackName ? resolve(fallbackDirectory, fallbackName) : undefined;
}

function normalizeMediaRelativePath(value: string): string {
  const normalized = value.trim().replace(/\\/g, '/');
  if (!normalized || normalized.includes('\0') || normalized.startsWith('/') || normalized.split('/').some((part) => part === '..')) {
    throw new Error('Media path is unsafe or empty.');
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

