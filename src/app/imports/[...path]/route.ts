import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { NextRequest, NextResponse } from 'next/server';
import {
  inferImportStorageMimeType,
  resolveImportStoragePath,
} from '@/server/import-storage';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  try {
    const params = await context.params;
    const relativePath = (params.path ?? []).join('/');
    const filePath = resolveImportStoragePath(relativePath);
    const stats = await stat(filePath);

    if (!stats.isFile()) {
      return NextResponse.json({ error: 'Import file was not found.' }, { status: 404 });
    }

    const range = parseRangeHeader(request.headers.get('range'), stats.size);
    const contentType = inferImportStorageMimeType(filePath);
    const headers = new Headers({
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Content-Type': contentType,
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

type ParsedRange =
  | { status: 'full' }
  | { status: 'invalid' }
  | { status: 'partial'; start: number; end: number };

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
