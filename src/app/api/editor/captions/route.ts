import { NextRequest, NextResponse } from 'next/server';
import { buildCaptionSidecar, type CaptionSidecarBuildOptions, type CaptionSidecarFormat, type CaptionSidecarOptions } from '@/lib/editor/caption-sidecar';
import type { EditorProject } from '@/lib/editor/types';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const project = body.project as EditorProject | undefined;
    const format = body.format === 'vtt' ? 'vtt' : 'srt';
    const options = body.options as CaptionSidecarOptions | undefined;
    const exportRange = parseExportRange(body.exportRange);

    if (!project) {
      return NextResponse.json(
        { error: 'project is required.' },
        { status: 400 },
      );
    }

    const sidecarOptions: CaptionSidecarBuildOptions = {
      ...options,
      exportRange,
    };
    const sidecar = buildCaptionSidecar(project, format as CaptionSidecarFormat, sidecarOptions);
    return NextResponse.json({ sidecar });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
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
