import type { EditorProject } from '../../lib/editor/types';
import { editorApiFetch } from './editor-api-client';
import type { EditorHookEvent, EditorHookPlanView } from './editor-view-model';

interface RunAutomationHooksRequest {
  project: EditorProject;
  event: EditorHookEvent;
  selectedClipIds: string[];
  assetIds: string[];
  priority: number;
  queueComfyUI: boolean;
  executeComfyUI: boolean;
  applyLocalActions: boolean;
  executeWebhooks: boolean;
}

const AUTOMATION_HOOKS_API_TIMEOUT_MS = 30000;

export async function runAutomationHooks(request: RunAutomationHooksRequest): Promise<EditorHookPlanView> {
  const response = await editorApiFetch('/api/editor/hooks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: AUTOMATION_HOOKS_API_TIMEOUT_MS,
    body: JSON.stringify(request),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  return data as EditorHookPlanView;
}
