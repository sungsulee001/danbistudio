import type { EditorProject } from '../../lib/editor/types';
import { isQueueJobActive } from './ai-queue-workflow-helpers';
import type { ComfyUIQueueJobView, EditorHookPlanView } from './editor-view-model';

export interface AutomationHookWorkflowState {
  status: string;
  queuedJob?: ComfyUIQueueJobView;
  isQueueingComfyUI?: boolean;
  appliedProject?: EditorProject;
  localCommitLabel?: string;
}

export interface BeforeExportHookRequest {
  event: 'before-export';
  context: {
    selectedClipIds: string[];
  };
  options: {
    applyLocalActions: true;
  };
}

export function resolveBeforeExportHookRequest(): BeforeExportHookRequest {
  return {
    event: 'before-export',
    context: { selectedClipIds: [] },
    options: { applyLocalActions: true },
  };
}

export function resolvePreparedExportProject({
  targetProject,
  hookPlan,
}: {
  targetProject: EditorProject;
  hookPlan?: EditorHookPlanView | null;
}): EditorProject {
  return hookPlan?.appliedProject ?? targetProject;
}

export function resolveAutomationHookWorkflowState(plan: EditorHookPlanView): AutomationHookWorkflowState {
  const localCommit = plan.appliedProject && plan.appliedLocalActions?.changed
    ? {
      appliedProject: plan.appliedProject,
      localCommitLabel: `${plan.event} local hooks applied`,
    }
    : {};

  if (plan.queuedJob) {
    return {
      ...localCommit,
      queuedJob: plan.queuedJob,
      isQueueingComfyUI: isQueueJobActive(plan.queuedJob.status),
      status: `${plan.event} hook queued ${formatCount(plan.queuedJob.totalJobs, 'ComfyUI job')}`,
    };
  }

  if (plan.webhookExecution) {
    return {
      ...localCommit,
      status: `${plan.event} webhooks sent ${plan.webhookExecution.sentCount}/${plan.webhookExecution.requestedCount}, skipped ${plan.webhookExecution.skippedCount}, failed ${plan.webhookExecution.failedCount}`,
    };
  }

  if (plan.appliedLocalActions) {
    return {
      ...localCommit,
      status: `${plan.event} local hooks applied ${formatCount(plan.appliedLocalActions.appliedActionIds.length, 'action')}`,
    };
  }

  return {
    status: `${plan.event} hooks prepared ${formatCount(plan.actionCount, 'action')}`,
  };
}

export function resolveAutomationHookFailureStatus(error: unknown): string {
  return `Hook failed: ${(error as Error).message}`;
}

function formatCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}
