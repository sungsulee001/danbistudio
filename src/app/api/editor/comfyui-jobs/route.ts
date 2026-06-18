import { NextRequest, NextResponse } from 'next/server';
import { cancelComfyUIQueueJob, createComfyUIQueueJob, listComfyUIQueueJobs } from '@/lib/editor/comfyui-queue';
import { createDefaultEditorProject } from '@/lib/editor/project';
import type { EditorProject } from '@/lib/editor/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ jobs: await listComfyUIQueueJobs() });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const project = (body.project ?? createDefaultEditorProject()) as EditorProject;
    const selectedClipIds = Array.isArray(body.selectedClipIds) ? body.selectedClipIds : [];
    const job = createComfyUIQueueJob(project, selectedClipIds, {
      priority: body.priority,
      execute: body.execute === true,
      modelName: typeof body.modelName === 'string' ? body.modelName : undefined,
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
    const job = typeof body.id === 'string' ? await cancelComfyUIQueueJob(body.id) : undefined;
    if (!job) {
      return NextResponse.json({ error: 'ComfyUI job not found.' }, { status: 404 });
    }

    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
