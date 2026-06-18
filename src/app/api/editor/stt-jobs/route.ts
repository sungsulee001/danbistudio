import { NextRequest, NextResponse } from 'next/server';
import { cancelSttJob, createSttJob, listSttJobs } from '@/lib/editor/stt-queue';
import { createDefaultEditorProject } from '@/lib/editor/project';
import type { EditorProject } from '@/lib/editor/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ jobs: await listSttJobs() });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const project = (body.project ?? createDefaultEditorProject()) as EditorProject;
    const selectedClipIds = Array.isArray(body.selectedClipIds) ? body.selectedClipIds : [];
    const job = createSttJob(project, selectedClipIds, {
      priority: body.priority,
      execute: body.execute !== false,
      language: typeof body.language === 'string' ? body.language : undefined,
      engine: typeof body.engine === 'string' ? body.engine : undefined,
    });

    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const job = typeof body.id === 'string' ? await cancelSttJob(body.id) : undefined;
    if (!job) {
      return NextResponse.json({ error: 'STT job not found.' }, { status: 404 });
    }

    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
