import { NextRequest, NextResponse } from 'next/server';
import {
  buildFcpxml,
  importFcpxmlProject,
  type FcpxmlBuildOptions,
  type FcpxmlImportOptions,
} from '@/lib/editor/fcpxml';
import type { EditorProject } from '@/lib/editor/types';
import { formatProjectJsonValidationFailure, validateProjectJson } from '@/electron/shared/project-schema';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const mode = body.mode === 'import' ? 'import' : 'export';

    if (mode === 'import') {
      const content = typeof body.content === 'string' ? body.content : '';
      if (!content.trim()) {
        return NextResponse.json(
          { error: 'FCPXML content is required.' },
          { status: 400 },
        );
      }

      const imported = importFcpxmlProject(content, parseImportOptions(body.options));
      const validation = validateProjectJson(imported.project);
      if (!validation.ok || !validation.project) {
        return NextResponse.json(
          {
            error: formatProjectJsonValidationFailure(validation, 'Cannot import FCPXML because the generated project JSON is invalid'),
            errors: validation.errors,
            warnings: validation.warnings,
          },
          { status: 400 },
        );
      }

      return NextResponse.json({
        imported: {
          ...imported,
          project: validation.project,
          warnings: uniqueStrings([
            ...imported.warnings,
            ...validation.warnings,
          ]),
        },
      });
    }

    const validation = validateProjectJson(body.project as EditorProject | undefined);
    if (!validation.ok || !validation.project) {
      return NextResponse.json(
        {
          error: formatProjectJsonValidationFailure(validation, 'Cannot export FCPXML because the project JSON is invalid'),
          errors: validation.errors,
          warnings: validation.warnings,
        },
        { status: 400 },
      );
    }

    const fcpxml = buildFcpxml(validation.project, {
      ...parseBuildOptions(body.options),
      exportRange: parseExportRange(body.exportRange),
    });

    return NextResponse.json({
      fcpxml: {
        filename: `${safeDownloadName(fcpxml.title)}.fcpxml`,
        mimeType: 'application/xml;charset=utf-8',
        title: fcpxml.title,
        version: fcpxml.version,
        clipCount: fcpxml.clipCount,
        markerCount: fcpxml.markerCount,
        warnings: fcpxml.warnings,
        content: fcpxml.content,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}

function parseBuildOptions(value: unknown): FcpxmlBuildOptions {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const options = value as {
    title?: unknown;
    version?: unknown;
    includeMuted?: unknown;
    includeLockedTracks?: unknown;
  };

  return {
    ...(typeof options.title === 'string' ? { title: options.title } : {}),
    ...(typeof options.version === 'string' ? { version: options.version } : {}),
    ...(typeof options.includeMuted === 'boolean' ? { includeMuted: options.includeMuted } : {}),
    ...(typeof options.includeLockedTracks === 'boolean' ? { includeLockedTracks: options.includeLockedTracks } : {}),
  };
}

function parseImportOptions(value: unknown): FcpxmlImportOptions {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const options = value as {
    id?: unknown;
    name?: unknown;
    updatedAt?: unknown;
  };

  return {
    ...(typeof options.id === 'string' ? { id: options.id } : {}),
    ...(typeof options.name === 'string' ? { name: options.name } : {}),
    ...(typeof options.updatedAt === 'string' ? { updatedAt: options.updatedAt } : {}),
  };
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

function safeDownloadName(value: string): string {
  const name = value
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '') || 'danbi-fcpxml';

  return isWindowsReservedPathName(name) ? `fcpxml-${name}` : name;
}

function isWindowsReservedPathName(value: string): boolean {
  const baseName = value.split('.')[0]?.toLowerCase();
  return Boolean(baseName) && WINDOWS_RESERVED_PATH_NAMES.has(baseName);
}

const WINDOWS_RESERVED_PATH_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
]);

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
