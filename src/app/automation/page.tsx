'use client';

import { useEffect, useMemo, useState } from 'react';
import { browserApiFetch } from '@/lib/browser-api-fetch';
import { createDefaultEditorProject } from '@/lib/editor/project';
import type { EditorProject } from '@/lib/editor/types';
import {
  DEFAULT_QUEUE_SETTINGS,
  type EditorHookEvent,
  type EditorHookPlanView,
  type EditorQueueSettingsView,
} from '@/electron/renderer/editor-view-model';
import { readBestLocalProjectFallback } from '@/electron/renderer/project-persistence-client';
import { QueueSettingsPanel } from '@/electron/renderer/sidebar-workflow-panels';
import {
  AppLink,
  DanbiAppShell,
  DataList,
  StatusPill,
  WorkspacePanel,
  type ShellStatusItem,
} from '../danbi-app-shell';

const AUTOMATION_LOAD_TIMEOUT_MS = 10000;
const AUTOMATION_ACTION_TIMEOUT_MS = 10000;

interface HooksConfig {
  events: EditorHookEvent[];
  queueComfyUI: boolean;
  applyLocalActions: boolean;
  executeWebhooks: boolean;
  webhookAllowLocalhost: boolean;
  webhookAllowlistCount: number;
  webhookTimeoutMs: number;
  webhookRetryCount: number;
  webhookRetryDelayMs: number;
  webhookSecretPrefix: string;
  note: string;
}

const defaultHooksConfig: HooksConfig = {
  events: ['manual', 'on-import', 'before-export', 'on-gap'],
  queueComfyUI: true,
  applyLocalActions: true,
  executeWebhooks: true,
  webhookAllowLocalhost: false,
  webhookAllowlistCount: 0,
  webhookTimeoutMs: 0,
  webhookRetryCount: 0,
  webhookRetryDelayMs: 0,
  webhookSecretPrefix: '',
  note: '',
};

export default function AutomationPage() {
  const [project, setProject] = useState<EditorProject>(() => createDefaultEditorProject());
  const [hooksConfig, setHooksConfig] = useState<HooksConfig>(defaultHooksConfig);
  const [queueSettings, setQueueSettings] = useState<EditorQueueSettingsView>(DEFAULT_QUEUE_SETTINGS);
  const [lastHookPlan, setLastHookPlan] = useState<EditorHookPlanView | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('Loading automation state');
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    try {
      const fallback = readBestLocalProjectFallback();
      if (fallback?.project) {
        setProject(fallback.project);
      }
    } catch {
      setProject(createDefaultEditorProject());
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadAutomationState() {
      setLoading(true);
      try {
        const [hooksResponse, queueResponse] = await Promise.all([
          browserApiFetch('/api/editor/hooks', { cache: 'no-store', signal: controller.signal, timeoutMs: AUTOMATION_LOAD_TIMEOUT_MS }),
          browserApiFetch('/api/editor/queue-settings', { cache: 'no-store', signal: controller.signal, timeoutMs: AUTOMATION_LOAD_TIMEOUT_MS }),
        ]);
        const [hooksData, queueData] = await Promise.all([
          hooksResponse.json().catch(() => ({})),
          queueResponse.json().catch(() => ({})),
        ]);
        if (controller.signal.aborted) {
          return;
        }

        setHooksConfig({ ...defaultHooksConfig, ...hooksData });
        setQueueSettings(queueData.settings ?? DEFAULT_QUEUE_SETTINGS);
        setStatus('Automation state loaded');
      } catch (error) {
        if (!controller.signal.aborted) {
          setStatus(`Automation load failed: ${formatError(error)}`);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadAutomationState();
    return () => controller.abort();
  }, [refreshToken]);

  const hookCounts = useMemo(() => ({
    localActions: countLocalActions(lastHookPlan),
    comfyJobs: countComfyJobs(lastHookPlan),
    webhookPayloads: countWebhookPayloads(lastHookPlan),
  }), [lastHookPlan]);

  const statusItems = useMemo<ShellStatusItem[]>(() => [
    { label: 'Rules', value: String(project.automation.length), tone: project.automation.length > 0 ? 'good' : 'neutral' },
    { label: 'Prepared', value: String(lastHookPlan?.actionCount ?? 0), tone: lastHookPlan ? 'pending' : 'neutral' },
    { label: 'Comfy jobs', value: String(hookCounts.comfyJobs), tone: hookCounts.comfyJobs > 0 ? 'pending' : 'neutral' },
    { label: 'Webhooks', value: String(hookCounts.webhookPayloads), tone: hookCounts.webhookPayloads > 0 ? 'pending' : 'neutral' },
    { label: 'External QA', value: 'EXTERNAL_PENDING', tone: 'pending' },
  ], [hookCounts, lastHookPlan, project.automation.length]);

  const handlePrepareHook = async (event: EditorHookEvent, options: {
    queueComfyUI?: boolean;
    executeComfyUI?: boolean;
    executeWebhooks?: boolean;
  } = {}) => {
    setStatus(`${event} hook request running`);
    try {
      const response = await browserApiFetch('/api/editor/hooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeoutMs: AUTOMATION_ACTION_TIMEOUT_MS,
        body: JSON.stringify({
          project,
          event,
          selectedClipIds: [],
          queueComfyUI: options.queueComfyUI === true,
          executeComfyUI: options.executeComfyUI === true,
          applyLocalActions: false,
          executeWebhooks: options.executeWebhooks === true,
          priority: queueSettings.defaultComfyUIPriority,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || response.statusText);
      }

      setLastHookPlan(data as EditorHookPlanView);
      setStatus(`${event} hook plan ready`);
    } catch (error) {
      setStatus(`Hook request failed: ${formatError(error)}`);
    }
  };

  const handleApplyQueueSettings = async () => {
    setStatus('Applying queue settings');
    try {
      const response = await browserApiFetch('/api/editor/queue-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        timeoutMs: AUTOMATION_ACTION_TIMEOUT_MS,
        body: JSON.stringify(queueSettings),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || response.statusText);
      }

      setQueueSettings(data.settings ?? queueSettings);
      setStatus('Queue settings applied');
    } catch (error) {
      setStatus(`Queue settings failed: ${formatError(error)}`);
    }
  };

  return (
    <DanbiAppShell
      activeView="automation"
      title="Automation"
      subtitle={loading ? 'Loading hooks, jobs, webhooks' : status}
      actions={(
        <>
          <AppLink href="/editor">Open Editor</AppLink>
          <button
            type="button"
            onClick={() => setRefreshToken((current) => current + 1)}
            className="inline-flex h-9 items-center rounded border border-neutral-700 px-3 text-sm font-medium text-neutral-200 hover:bg-neutral-900"
          >
            Refresh
          </button>
        </>
      )}
      statusItems={statusItems}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <WorkspacePanel eyebrow="Hooks" title="Automation Hook Rules">
            <div className="grid gap-3">
              <DataList
                items={[
                  { label: 'Active project', value: project.name, tone: 'neutral' },
                  { label: 'Automation rules', value: String(project.automation.length), tone: project.automation.length > 0 ? 'good' : 'neutral' },
                  { label: 'Supported events', value: hooksConfig.events.join(', '), tone: 'good' },
                  { label: 'Webhook allowlist', value: String(hooksConfig.webhookAllowlistCount), tone: hooksConfig.webhookAllowlistCount > 0 ? 'good' : 'pending' },
                ]}
              />
              <div className="grid gap-2 md:grid-cols-4">
                {hooksConfig.events.map((event) => (
                  <button
                    key={event}
                    type="button"
                    onClick={() => void handlePrepareHook(event)}
                    className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm font-medium text-neutral-200 hover:border-cyan-500/50 hover:bg-cyan-500/10"
                  >
                    Prepare {event}
                  </button>
                ))}
              </div>
            </div>
          </WorkspacePanel>

          <WorkspacePanel eyebrow="Plan" title="Last Hook Plan">
            {lastHookPlan ? (
              <div className="space-y-3">
                <DataList
                  items={[
                    { label: 'Event', value: lastHookPlan.event, tone: 'pending' },
                    { label: 'Matched rules', value: String(lastHookPlan.matchedRuleCount), tone: lastHookPlan.matchedRuleCount > 0 ? 'good' : 'neutral' },
                    { label: 'Prepared actions', value: String(lastHookPlan.actionCount), tone: lastHookPlan.actionCount > 0 ? 'pending' : 'neutral' },
                    { label: 'Local actions', value: String(hookCounts.localActions), tone: hookCounts.localActions > 0 ? 'pending' : 'neutral' },
                    { label: 'ComfyUI jobs', value: String(hookCounts.comfyJobs), tone: hookCounts.comfyJobs > 0 ? 'pending' : 'neutral' },
                    { label: 'Webhook payloads', value: String(hookCounts.webhookPayloads), tone: hookCounts.webhookPayloads > 0 ? 'pending' : 'neutral' },
                  ]}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={hookCounts.comfyJobs === 0}
                    onClick={() => void handlePrepareHook(lastHookPlan.event, { queueComfyUI: true })}
                    className="rounded border border-cyan-500/40 px-3 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Queue ComfyUI
                  </button>
                  <button
                    type="button"
                    disabled={hookCounts.comfyJobs === 0}
                    onClick={() => void handlePrepareHook(lastHookPlan.event, { queueComfyUI: true, executeComfyUI: true })}
                    className="rounded border border-emerald-500/40 px-3 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Execute ComfyUI
                  </button>
                  <button
                    type="button"
                    disabled={hookCounts.webhookPayloads === 0}
                    onClick={() => void handlePrepareHook(lastHookPlan.event, { executeWebhooks: true })}
                    className="rounded border border-violet-500/40 px-3 py-2 text-sm font-medium text-violet-100 hover:bg-violet-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Run Webhooks
                  </button>
                </div>
                <div className="space-y-2">
                  {lastHookPlan.actions.map((action) => (
                    <div key={action.id} className="rounded border border-neutral-800 bg-neutral-950/60 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-neutral-100">{action.ruleName}</div>
                          <div className="mt-1 text-xs text-neutral-500">{action.description}</div>
                        </div>
                        <StatusPill label="" value={`${action.provider}/${action.status}`} tone={action.status === 'prepared' ? 'good' : 'warn'} />
                      </div>
                      {action.warnings[0] ? <div className="mt-2 text-xs text-amber-200">{action.warnings[0]}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded border border-neutral-800 bg-neutral-950/60 p-4 text-sm text-neutral-500">
                Prepare an automation event to inspect local actions, ComfyUI jobs, and webhook payloads.
              </div>
            )}
          </WorkspacePanel>
        </div>

        <div className="space-y-4">
          <WorkspacePanel eyebrow="Queue" title="Worker Concurrency">
            <QueueSettingsPanel
              queueSettings={queueSettings}
              onPatchQueueSettings={(patch) => setQueueSettings((current) => ({ ...current, ...patch }))}
              onApplyQueueSettings={() => void handleApplyQueueSettings()}
            />
          </WorkspacePanel>

          <WorkspacePanel eyebrow="Webhook" title="Execution Boundary">
            <DataList
              items={[
                { label: 'Localhost webhook', value: hooksConfig.webhookAllowLocalhost ? 'Allowed' : 'Blocked', tone: hooksConfig.webhookAllowLocalhost ? 'good' : 'warn' },
                { label: 'Allowlist URLs', value: String(hooksConfig.webhookAllowlistCount), tone: hooksConfig.webhookAllowlistCount > 0 ? 'good' : 'pending' },
                { label: 'Timeout', value: `${hooksConfig.webhookTimeoutMs}ms`, tone: 'neutral' },
                { label: 'Retries', value: String(hooksConfig.webhookRetryCount), tone: 'neutral' },
                { label: 'Secret prefix', value: hooksConfig.webhookSecretPrefix || 'Not set', tone: hooksConfig.webhookSecretPrefix ? 'good' : 'pending' },
              ]}
            />
          </WorkspacePanel>
        </div>
      </div>
    </DanbiAppShell>
  );
}

function countLocalActions(plan: EditorHookPlanView | null): number {
  return plan?.actions.reduce((total, action) => total + (action.localActions?.length ?? 0), 0) ?? 0;
}

function countComfyJobs(plan: EditorHookPlanView | null): number {
  return plan?.actions.reduce((total, action) => total + (action.jobs?.length ?? 0), 0) ?? 0;
}

function countWebhookPayloads(plan: EditorHookPlanView | null): number {
  return plan?.actions.reduce((total, action) => total + (action.webhookPayloads?.length ?? 0), 0) ?? 0;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
