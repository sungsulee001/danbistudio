import { NextRequest, NextResponse } from 'next/server';
import { cancelSttJob, getSttJob, retrySttJob } from '@/lib/editor/stt-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getSttJob(id);
  if (!job) {
    return NextResponse.json({ error: 'STT job not found.' }, { status: 404 });
  }

  return NextResponse.json({ job });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await cancelSttJob(id);
  if (!job) {
    return NextResponse.json({ error: 'STT job not found.' }, { status: 404 });
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
    const job = await retrySttJob(id, {
      priority: body.priority,
      execute: body.execute === false ? false : undefined,
      language: typeof body.language === 'string' ? body.language : undefined,
      engine: typeof body.engine === 'string' ? body.engine : undefined,
    });
    if (!job) {
      return NextResponse.json({ error: 'STT job cannot be retried.' }, { status: 400 });
    }

    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
