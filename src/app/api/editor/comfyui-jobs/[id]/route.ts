import { NextRequest, NextResponse } from 'next/server';
import { cancelComfyUIQueueJob, getComfyUIQueueJob, retryComfyUIQueueJob } from '@/lib/editor/comfyui-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getComfyUIQueueJob(id);
  if (!job) {
    return NextResponse.json({ error: 'ComfyUI job not found.' }, { status: 404 });
  }

  return NextResponse.json({ job });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await cancelComfyUIQueueJob(id);
  if (!job) {
    return NextResponse.json({ error: 'ComfyUI job not found.' }, { status: 404 });
  }

  return NextResponse.json({ job });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const job = await retryComfyUIQueueJob(id, {
      priority: body.priority,
      execute: body.execute === true ? true : undefined,
      modelName: typeof body.modelName === 'string' ? body.modelName : undefined,
    });
    if (!job) {
      return NextResponse.json({ error: 'ComfyUI job cannot be retried.' }, { status: 400 });
    }

    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
