import { NextRequest, NextResponse } from 'next/server';
import { applyEditorHookPlan, buildEditorHookPlan, type EditorHookEvent } from '@/lib/editor/hooks';
import { createComfyUIQueueJobFromPlan } from '@/lib/editor/comfyui-queue';
import { createDefaultEditorProject } from '@/lib/editor/project';
import { executeEditorWebhookPayloads, readEditorWebhookExecutionConfig } from '@/lib/editor/webhook-runner';
import type { AutomationPlan, EditorProject } from '@/lib/editor/types';

const hookEvents: EditorHookEvent[] = ['manual', 'on-import', 'before-export', 'on-gap'];

export async function GET() {
  const webhookConfig = readEditorWebhookExecutionConfig();

  return NextResponse.json({
    events: hookEvents,
    queueComfyUI: true,
    applyLocalActions: true,
    executeWebhooks: true,
    webhookAllowLocalhost: webhookConfig.allowLocalhost,
    webhookAllowlistCount: webhookConfig.allowedUrls.length,
    webhookTimeoutMs: webhookConfig.timeoutMs,
    webhookRetryCount: webhookConfig.retryCount,
    webhookRetryDelayMs: webhookConfig.retryDelayMs,
    webhookSecretPrefix: webhookConfig.secretPrefix,
    note: 'POST prepares hook actions; set applyLocalActions=true for local caption/loudness/color/object-mask edits, queueComfyUI=true for ComfyUI jobs, or executeWebhooks=true to send allowed webhook payloads. Public webhook targets must be listed in DANBI_EDITOR_WEBHOOK_ALLOWLIST.',
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const project = (body.project ?? createDefaultEditorProject()) as EditorProject;
    const event = readHookEvent(body.event);
    const selectedClipIds = readStringArray(body.selectedClipIds);
    const assetIds = readStringArray(body.assetIds);
    const plan = buildEditorHookPlan(project, {
      event,
      selectedClipIds,
      assetIds,
      executeWebhooks: false,
    });
    const localApplyResult = body.applyLocalActions === true
      ? applyEditorHookPlan(project, plan)
      : undefined;
    const queuedJob = body.queueComfyUI === true
      ? createComfyUIQueueJobFromPlan(buildHookAutomationPlan(project.id, plan), {
        priority: body.priority,
        execute: body.executeComfyUI === true,
        modelName: typeof body.modelName === 'string' ? body.modelName : undefined,
      })
      : undefined;
    const webhookExecution = body.executeWebhooks === true
      ? await executeEditorWebhookPayloads(plan, readEditorWebhookExecutionConfig())
      : undefined;

    return NextResponse.json({
      ...plan,
      ...(localApplyResult ? {
        appliedLocalActions: {
          changed: localApplyResult.changed,
          appliedActionIds: localApplyResult.appliedActionIds,
          appliedClipIds: localApplyResult.appliedClipIds,
          warnings: localApplyResult.warnings,
        },
        appliedProject: localApplyResult.project,
      } : {}),
      ...(queuedJob ? { queuedJob } : {}),
      ...(webhookExecution ? { webhookExecution } : {}),
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}

function readHookEvent(value: unknown): EditorHookEvent {
  if (typeof value === 'string' && hookEvents.includes(value as EditorHookEvent)) {
    return value as EditorHookEvent;
  }

  throw new Error(`Hook event must be one of: ${hookEvents.join(', ')}`);
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function buildHookAutomationPlan(projectId: string, plan: ReturnType<typeof buildEditorHookPlan>): AutomationPlan {
  return {
    projectId,
    generatedAt: plan.generatedAt,
    jobs: plan.actions.flatMap((action) => action.jobs),
    warnings: [
      ...plan.warnings,
      ...plan.actions.flatMap((action) => action.warnings.map((warning) => `${action.ruleName}: ${warning}`)),
    ],
  };
}
