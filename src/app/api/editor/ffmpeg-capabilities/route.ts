import { NextResponse } from 'next/server';
import { detectConfiguredFfmpegCapabilities } from '@/electron/main/ffmpeg-discovery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await detectConfiguredFfmpegCapabilities());
}
