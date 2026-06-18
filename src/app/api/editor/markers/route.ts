import { NextRequest, NextResponse } from 'next/server';
import {
  buildMarkerInterchange,
  parseMarkerInterchange,
  type MarkerInterchangeFormat,
} from '@/lib/editor/marker-interchange';
import type { EditorProject } from '@/lib/editor/types';
import { formatProjectJsonValidationFailure, validateProjectJson } from '@/electron/shared/project-schema';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const mode = body.mode === 'import' ? 'import' : 'export';

    if (mode === 'import') {
      const content = typeof body.content === 'string' ? body.content : '';
      const imported = parseMarkerInterchange(content, {
        format: parseMarkerFormat(body.format),
        fps: parseNumber(body.fps),
      });
      return NextResponse.json({
        imported: {
          format: imported.format,
          markerCount: imported.markers.length,
          markers: imported.markers,
          warnings: imported.warnings,
        },
      });
    }

    const validation = validateProjectJson(body.project as EditorProject | undefined);
    if (!validation.ok || !validation.project) {
      return NextResponse.json(
        {
          error: formatProjectJsonValidationFailure(validation, 'Cannot export markers because the project JSON is invalid'),
          errors: validation.errors,
          warnings: validation.warnings,
        },
        { status: 400 },
      );
    }

    const markers = buildMarkerInterchange(validation.project, {
      format: parseExportMarkerFormat(body.format),
      exportRange: parseExportRange(body.exportRange),
    });

    return NextResponse.json({ markers });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}

function parseMarkerFormat(value: unknown): MarkerInterchangeFormat | 'auto' | undefined {
  return value === 'youtube-chapters' || value === 'csv' || value === 'auto'
    ? value
    : undefined;
}

function parseExportMarkerFormat(value: unknown): MarkerInterchangeFormat {
  return value === 'youtube-chapters' ? 'youtube-chapters' : 'csv';
}

function parseNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseExportRange(value: unknown): { start: number; end: number } | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const range = value as { start?: unknown; end?: unknown };
  if (typeof range.start !== 'number' || typeof range.end !== 'number') {
    return undefined;
  }

  return { start: range.start, end: range.end };
}
