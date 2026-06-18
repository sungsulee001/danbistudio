import { NextRequest, NextResponse } from 'next/server';
import { buildFfmpegEnginePreflight } from '@/electron/main/ffmpeg-render-engine';
import { createDefaultEditorProject } from '@/lib/editor/project';
import type { EditorProject } from '@/lib/editor/types';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const project = (body.project ?? createDefaultEditorProject()) as EditorProject;
    const profileId = typeof body.profileId === 'string' ? body.profileId : project.exportProfiles[0]?.id;
    const outputPath = typeof body.outputPath === 'string' ? body.outputPath : undefined;
    const encoderPreference = typeof body.encoderPreference === 'string' ? body.encoderPreference : 'auto';
    const exportRange = parseExportRange(body.exportRange);
    const playhead = typeof body.playhead === 'number' ? body.playhead : undefined;

    if (!profileId) {
      return NextResponse.json(
        { error: 'At least one export profile is required.' },
        { status: 400 },
      );
    }

    return NextResponse.json(await buildFfmpegEnginePreflight({
      project,
      profileId,
      outputPath,
      encoderPreference,
      exportRange,
      playhead,
    }));
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
