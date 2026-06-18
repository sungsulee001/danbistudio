import { NextRequest, NextResponse } from 'next/server';
import {
  cancelFfmpegEngineJob,
  getFfmpegEngineJob,
  retryFfmpegEngineJob,
} from '@/electron/main/ffmpeg-render-engine';
import type { EditorProject } from '@/lib/editor/types';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getFfmpegEngineJob(id);

  if (!job) {
    return NextResponse.json(
      { error: 'Render job not found' },
      { status: 404 },
    );
  }

  return NextResponse.json({ job });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await cancelFfmpegEngineJob(id);

  if (!job) {
    return NextResponse.json(
      { error: 'Render job not found' },
      { status: 404 },
    );
  }

  return NextResponse.json({ job });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const priority = typeof body.priority === 'number' ? body.priority : undefined;
  const project = body.project as EditorProject | undefined;
  const profileId = typeof body.profileId === 'string' ? body.profileId : undefined;
  const outputPath = typeof body.outputPath === 'string' ? body.outputPath : undefined;
  const outputFilename = typeof body.outputFilename === 'string' ? body.outputFilename : undefined;
  const encoderPreference = typeof body.encoderPreference === 'string' ? body.encoderPreference : undefined;
  const exportRange = parseExportRange(body.exportRange);
  const playhead = typeof body.playhead === 'number' ? body.playhead : undefined;
  const sampleTimes = Array.isArray(body.sampleTimes)
    ? body.sampleTimes.filter((time: unknown): time is number => typeof time === 'number' && Number.isFinite(time))
    : undefined;
  const job = await retryFfmpegEngineJob(id, {
    priority,
    project,
    profileId,
    outputPath,
    outputFilename,
    encoderPreference,
    exportRange,
    playhead,
    sampleTimes,
  });

  if (!job) {
    return NextResponse.json(
      { error: 'Render job not found or cannot be retried' },
      { status: 404 },
    );
  }

  return NextResponse.json({ job }, { status: 202 });
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
