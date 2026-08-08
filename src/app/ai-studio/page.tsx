'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { browserApiFetch } from '@/lib/browser-api-fetch';
import type { ComfyUIQueueJobView } from '@/electron/renderer/editor-view-model';
import {
  AppLink,
  DanbiAppShell,
  DataList,
  StatusPill,
  WorkspacePanel,
  type ShellStatusItem,
} from '../danbi-app-shell';

const AI_LOAD_TIMEOUT_MS = 10000;
const AI_ACTION_TIMEOUT_MS = 10000;

interface WorkflowSummary {
  name: string;
  label: string;
  nodeCount: number;
  parameters: string[];
  updatedAt: string | null;
}

interface LibraryJob {
  id: string;
  status: string;
  modelName: string;
  workflowName: string;
  resultPath?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

interface AiStudioState {
  queueJobs: ComfyUIQueueJobView[];
  libraryJobs: LibraryJob[];
  workflows: WorkflowSummary[];
}

const emptyState: AiStudioState = {
  queueJobs: [],
  libraryJobs: [],
  workflows: [],
};

export default function AiStudioPage() {
  const [state, setState] = useState<AiStudioState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('Loading AI Studio state');
  const [refreshToken, setRefreshToken] = useState(0);

  const loadAiStudioState = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const [queueResponse, libraryResponse, workflowsResponse] = await Promise.all([
        browserApiFetch('/api/editor/comfyui-jobs', { cache: 'no-store', signal, timeoutMs: AI_LOAD_TIMEOUT_MS }),
        browserApiFetch('/api/library?limit=50', { cache: 'no-store', signal, timeoutMs: AI_LOAD_TIMEOUT_MS }),
        browserApiFetch('/api/workflows', { cache: 'no-store', signal, timeoutMs: AI_LOAD_TIMEOUT_MS }),
      ]);

      const [queueData, libraryData, workflowsData] = await Promise.all([
        queueResponse.json().catch(() => ({})),
        libraryResponse.json().catch(() => ({})),
        workflowsResponse.json().catch(() => ({})),
      ]);

      if (signal?.aborted) {
        return;
      }

      setState({
        queueJobs: Array.isArray(queueData.jobs) ? queueData.jobs : [],
        libraryJobs: Array.isArray(libraryData.jobs) ? libraryData.jobs : [],
        workflows: Array.isArray(workflowsData.workflows) ? workflowsData.workflows : [],
      });
      setStatus('AI Studio state loaded');
    } catch (error) {
      if (!signal?.aborted) {
        setState(emptyState);
        setStatus(`AI Studio load failed: ${formatError(error)}`);
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadAiStudioState(controller.signal);
    return () => controller.abort();
  }, [loadAiStudioState, refreshToken]);

  const counts = useMemo(() => buildAiCounts(state.queueJobs, state.libraryJobs), [state.libraryJobs, state.queueJobs]);
  const statusItems = useMemo<ShellStatusItem[]>(() => [
    { label: 'AI pending', value: String(counts.pendingGeneration), tone: counts.pendingGeneration > 0 ? 'pending' : 'neutral' },
    { label: 'Generating', value: String(counts.generating), tone: counts.generating > 0 ? 'pending' : 'neutral' },
    { label: 'Generated', value: String(counts.generated), tone: counts.generated > 0 ? 'good' : 'neutral' },
    { label: 'Failed', value: String(counts.failed), tone: counts.failed > 0 ? 'warn' : 'neutral' },
    { label: 'External QA', value: 'EXTERNAL_PENDING', tone: 'pending' },
  ], [counts]);

  const handleCancelJob = async (jobId: string) => {
    await runAiAction(`/api/editor/comfyui-jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
  };

  const handleRetryJob = async (job: ComfyUIQueueJobView, execute: boolean) => {
    await runAiAction(`/api/editor/comfyui-jobs/${encodeURIComponent(job.id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority: job.priority, execute }),
    });
  };

  const runAiAction = async (path: string, init: RequestInit) => {
    setStatus('Updating ComfyUI queue');
    try {
      const response = await browserApiFetch(path, {
        ...init,
        timeoutMs: AI_ACTION_TIMEOUT_MS,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || response.statusText);
      }

      setStatus('ComfyUI queue updated');
      setRefreshToken((current) => current + 1);
    } catch (error) {
      setStatus(`ComfyUI queue action failed: ${formatError(error)}`);
    }
  };

  return (
    <DanbiAppShell
      activeView="ai"
      title="AI Studio"
      subtitle={loading ? 'Loading ComfyUI operations and AI Results' : status}
      actions={(
        <>
          <AppLink href="/generate">Generate now</AppLink>
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
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <WorkspacePanel eyebrow="ComfyUI" title="Workflow Browser">
          <div className="space-y-3">
            {state.workflows.length === 0 ? (
              <EmptyPanelText text={loading ? 'Loading workflows...' : 'No workflows were found.'} />
            ) : state.workflows.slice(0, 8).map((workflow) => (
              <div key={workflow.name} className="rounded border border-neutral-800 bg-neutral-950/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-neutral-100">{workflow.label}</div>
                    <div className="mt-1 text-xs text-neutral-500">{workflow.name}</div>
                  </div>
                  <StatusPill label="" value={`${workflow.nodeCount} nodes`} tone="neutral" />
                </div>
                <div className="mt-2 line-clamp-1 text-xs text-neutral-500">
                  {workflow.parameters.slice(0, 8).join(', ') || 'No exposed parameters'}
                </div>
              </div>
            ))}
          </div>
        </WorkspacePanel>

        <WorkspacePanel eyebrow="Generation Queue" title="ComfyUI Batch Queue">
          <div className="grid gap-3">
            <DataList
              items={[
                { label: 'Pending generation', value: String(counts.pendingGeneration), tone: counts.pendingGeneration > 0 ? 'pending' : 'neutral' },
                { label: 'Generating', value: String(counts.generating), tone: counts.generating > 0 ? 'pending' : 'neutral' },
                { label: 'Generated', value: String(counts.generated), tone: counts.generated > 0 ? 'good' : 'neutral' },
                { label: 'Failed', value: String(counts.failed), tone: counts.failed > 0 ? 'warn' : 'neutral' },
              ]}
            />
            <div className="space-y-2">
              {state.queueJobs.length === 0 ? (
                <EmptyPanelText text={loading ? 'Loading queue...' : 'No ComfyUI batch jobs are queued.'} />
              ) : state.queueJobs.map((job) => (
                <article key={job.id} className="rounded border border-neutral-800 bg-neutral-950/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-neutral-100">{job.modelName}</div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {job.completedJobs}/{job.totalJobs} done
                        {job.failedJobs > 0 ? ` / ${job.failedJobs} failed` : ''}
                      </div>
                    </div>
                    <StatusPill label="" value={labelQueueStatus(job.status)} tone={toneForJobStatus(job.status)} />
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded bg-neutral-800">
                    <div className="h-full bg-emerald-400" style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }} />
                  </div>
                  {job.error ? <div className="mt-2 text-xs text-amber-200">{job.error}</div> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!canCancelJob(job.status)}
                      onClick={() => void handleCancelJob(job.id)}
                      className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!canRetryJob(job.status)}
                      onClick={() => void handleRetryJob(job, false)}
                      className="rounded border border-cyan-500/40 px-2 py-1 text-xs text-cyan-100 hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Retry queue
                    </button>
                    <button
                      type="button"
                      disabled={!canRetryJob(job.status)}
                      onClick={() => void handleRetryJob(job, true)}
                      className="rounded border border-emerald-500/40 px-2 py-1 text-xs text-emerald-100 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Retry execute
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </WorkspacePanel>

        <div className="space-y-4">
          <WorkspacePanel eyebrow="AI Results" title="Generated Asset History" action={<AppLink href="/library" variant="secondary">Open Library</AppLink>}>
            <div className="space-y-2">
              {state.libraryJobs.length === 0 ? (
                <EmptyPanelText text={loading ? 'Loading AI Results...' : 'No AI Results are available yet.'} />
              ) : state.libraryJobs.slice(0, 6).map((job) => (
                <a
                  key={job.id}
                  href={`/status/${encodeURIComponent(job.id)}`}
                  className="block rounded border border-neutral-800 bg-neutral-950/60 p-3 hover:border-neutral-700"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-neutral-100">{job.modelName}</div>
                      <div className="mt-1 truncate text-xs text-neutral-500">{job.workflowName}</div>
                    </div>
                    <StatusPill label="" value={job.status} tone={toneForLibraryStatus(job.status)} />
                  </div>
                  {job.error ? <div className="mt-2 line-clamp-2 text-xs text-amber-200">{job.error}</div> : null}
                </a>
              ))}
            </div>
          </WorkspacePanel>

          <WorkspacePanel eyebrow="Pending Assets" title="Asset State Actions">
            <div className="grid gap-2 text-sm text-neutral-300">
              <AppLink href="/generate" variant="secondary">Generate now</AppLink>
              <AppLink href="/editor" variant="secondary">Skip this asset</AppLink>
              <AppLink href="/editor" variant="secondary">Replace with local media</AppLink>
              <AppLink href="/editor" variant="secondary">Exclude from current export</AppLink>
            </div>
          </WorkspacePanel>
        </div>
      </div>
    </DanbiAppShell>
  );
}

function buildAiCounts(queueJobs: ComfyUIQueueJobView[], libraryJobs: LibraryJob[]) {
  return {
    pendingGeneration: queueJobs.filter((job) => job.status === 'queued').length,
    generating: queueJobs.filter((job) => job.status === 'running').length,
    generated: queueJobs.filter((job) => job.status === 'completed').length + libraryJobs.filter((job) => job.status === 'completed').length,
    failed: queueJobs.filter((job) => job.status === 'failed').length + libraryJobs.filter((job) => job.status === 'failed').length,
  };
}

function labelQueueStatus(status: ComfyUIQueueJobView['status']): string {
  return status === 'queued' ? 'pending generation' : status;
}

function toneForJobStatus(status: ComfyUIQueueJobView['status']): ShellStatusItem['tone'] {
  if (status === 'completed') {
    return 'good';
  }
  if (status === 'failed' || status === 'cancelled') {
    return 'warn';
  }
  if (status === 'queued' || status === 'running') {
    return 'pending';
  }
  return 'neutral';
}

function toneForLibraryStatus(status: string): ShellStatusItem['tone'] {
  if (status === 'completed') {
    return 'good';
  }
  if (status === 'failed') {
    return 'warn';
  }
  if (status === 'pending' || status === 'running') {
    return 'pending';
  }
  return 'neutral';
}

function canCancelJob(status: ComfyUIQueueJobView['status']): boolean {
  return status === 'queued' || status === 'running';
}

function canRetryJob(status: ComfyUIQueueJobView['status']): boolean {
  return status === 'failed' || status === 'cancelled';
}

function EmptyPanelText({ text }: { text: string }) {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-950/60 p-4 text-sm text-neutral-500">
      {text}
    </div>
  );
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
