import { NextRequest, NextResponse } from 'next/server';
import { cancelMediaCacheJob, getMediaCacheJob, retryMediaCacheJob } from '@/lib/editor/media-cache-queue';

export const runtime = 'nodejs';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getMediaCacheJob(id);

  if (!job) {
    return NextResponse.json(
      { error: 'Media cache job not found.' },
      { status: 404 },
    );
  }

  return NextResponse.json({ job });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const priority = typeof body.priority === 'number' ? body.priority : undefined;
  const job = await retryMediaCacheJob(id, { priority });

  if (!job) {
    return NextResponse.json(
      { error: 'Media cache job not found or cannot be retried.' },
      { status: 404 },
    );
  }

  return NextResponse.json({ job }, { status: 202 });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await cancelMediaCacheJob(id);

  if (!job) {
    return NextResponse.json(
      { error: 'Media cache job not found.' },
      { status: 404 },
    );
  }

  return NextResponse.json({ job });
}
