import { NextRequest, NextResponse } from 'next/server';
import { getEditorQueueSettings, updateEditorQueueSettings } from '@/lib/editor/queue-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ settings: getEditorQueueSettings() });
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const settings = updateEditorQueueSettings({
      renderConcurrency: body.renderConcurrency,
      mediaCacheConcurrency: body.mediaCacheConcurrency,
      comfyuiConcurrency: body.comfyuiConcurrency,
      sttConcurrency: body.sttConcurrency,
      defaultRenderPriority: body.defaultRenderPriority,
      defaultMediaCachePriority: body.defaultMediaCachePriority,
      defaultComfyUIPriority: body.defaultComfyUIPriority,
      defaultSttPriority: body.defaultSttPriority,
    });

    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
