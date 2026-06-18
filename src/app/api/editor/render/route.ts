import { NextRequest, NextResponse } from 'next/server';
import { runFfmpegEngineRender } from '@/electron/main/ffmpeg-render-engine';
import type { EditorProject } from '@/lib/editor/types';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const project = body.project as EditorProject | undefined;
    const profileId = typeof body.profileId === 'string' ? body.profileId : project?.exportProfiles[0]?.id;
    const outputPath = typeof body.outputPath === 'string' ? body.outputPath : undefined;
    const encoderPreference = typeof body.encoderPreference === 'string' ? body.encoderPreference : 'auto';
    const exportRange = parseExportRange(body.exportRange);

    if (!project || !profileId) {
      return NextResponse.json(
        { error: 'project and profileId are required.' },
        { status: 400 },
      );
    }

    const result = await runFfmpegEngineRender({
      project,
      profileId,
      outputPath,
      encoderPreference,
      exportRange,
    });

    return NextResponse.json(result);
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
