import { NextRequest, NextResponse } from 'next/server';
import { buildComfyUIAutomationPlan } from '@/lib/editor/automation';
import { buildGeneratePayloads, buildAutomationWebhookPayloads } from '@/lib/editor/comfyui-bridge';
import { createDefaultEditorProject } from '@/lib/editor/project';
import type { EditorProject } from '@/lib/editor/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const project = (body.project ?? createDefaultEditorProject()) as EditorProject;
    const selectedClipIds = Array.isArray(body.selectedClipIds) ? body.selectedClipIds : [];
    const plan = buildComfyUIAutomationPlan(project, selectedClipIds);

    return NextResponse.json({
      ...plan,
      generatePayloads: buildGeneratePayloads(plan),
      webhookPayloads: buildAutomationWebhookPayloads(plan),
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
