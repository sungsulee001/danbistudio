import { NextRequest, NextResponse } from 'next/server';
import {
  cleanupStorageFiles,
  normalizeStorageCleanupMaxAgeDays,
  normalizeStorageCleanupTargets,
} from '@/server/storage-cleanup';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const result = await cleanupStorageFiles({
    dryRun: true,
    maxAgeDays: normalizeStorageCleanupMaxAgeDays(searchParams.get('maxAgeDays')),
    targets: normalizeStorageCleanupTargets(searchParams.getAll('targets')),
  });

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as {
    dryRun?: unknown;
    maxAgeDays?: unknown;
    targets?: unknown;
  };
  const result = await cleanupStorageFiles({
    dryRun: body.dryRun !== false,
    maxAgeDays: normalizeStorageCleanupMaxAgeDays(body.maxAgeDays),
    targets: normalizeStorageCleanupTargets(body.targets),
  });

  return NextResponse.json(result);
}
