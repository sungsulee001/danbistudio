'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { browserApiFetch } from '@/lib/browser-api-fetch';
import type { RenderJobView } from '@/electron/renderer/editor-view-model';
import { openNativeRenderOutputPath, revealNativeRenderOutputPath } from '@/electron/renderer/render-client';
import { fetchRenderWorkerDaemonStatus } from '@/electron/renderer/render-worker-client';
import { normalizeRenderWorkerDaemonUrl } from '@/electron/renderer/render-worker-controller-helpers';
import type { RenderWorkerDaemonStatus } from '@/electron/shared/render-worker-contract';
import {
  AppLink,
  DanbiAppShell,
  DataList,
  StatusPill,
  WorkspacePanel,
  type ShellStatusItem,
} from '../danbi-app-shell';

const RENDER_QUEUE_LOAD_TIMEOUT_MS = 10000;
const RENDER_QUEUE_ACTION_TIMEOUT_MS = 10000;
const RENDER_WORKER_STATUS_TIMEOUT_MS = 1500;

export default function RenderQueuePage() {
  const [jobs, setJobs] = useState<RenderJobView[]>([]);
  const [daemonUrl, setDaemonUrl] = useState('http://127.0.0.1:47683');
  const [daemonStatus, setDaemonStatus] = useState<RenderWorkerDaemonStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('Loading render queue');
  const [refreshToken, setRefreshToken] = useState(0);

  const loadRenderJobs = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await browserApiFetch('/api/editor/render-jobs', {
        cache: 'no-store',
        signal,
        timeoutMs: RENDER_QUEUE_LOAD_TIMEOUT_MS,
      });
      const data = await response.json().catch(() => ({}));
      if (signal?.aborted) {
        return;
      }

      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
      setStatus('Render queue loaded');
    } catch (error) {
      if (!signal?.aborted) {
        setJobs([]);
        setStatus(`Render queue load failed: ${formatError(error)}`);
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadRenderJobs(controller.signal);
    return () => controller.abort();
  }, [loadRenderJobs, refreshToken]);

  const counts = useMemo(() => buildRenderCounts(jobs, daemonStatus), [daemonStatus, jobs]);
  const statusItems = useMemo<ShellStatusItem[]>(() => [
    { label: 'Queued', value: String(counts.queued), tone: counts.queued > 0 ? 'pending' : 'neutral' },
    { label: 'Rendering', value: String(counts.running), tone: counts.running > 0 ? 'pending' : 'neutral' },
    { label: 'Failed', value: String(counts.failed), tone: counts.failed > 0 ? 'warn' : 'neutral' },
    { label: 'Workers', value: daemonStatus ? `${daemonStatus.workerId}` : 'Not connected', tone: daemonStatus ? 'good' : 'pending' },
    { label: 'External QA', value: 'EXTERNAL_PENDING', tone: 'pending' },
  ], [counts, daemonStatus]);

  const handleCancelJob = async (jobId: string) => {
    await runRenderJobAction(`/api/editor/render-jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
  };

  const handleRetryJob = async (jobId: string) => {
    await runRenderJobAction(`/api/editor/render-jobs/${encodeURIComponent(jobId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority: 0 }),
    });
  };

  const runRenderJobAction = async (path: string, init: RequestInit) => {
    setStatus('Updating render job');
    try {
      const response = await browserApiFetch(path, {
        ...init,
        timeoutMs: RENDER_QUEUE_ACTION_TIMEOUT_MS,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || response.statusText);
      }

      setStatus('Render job updated');
      setRefreshToken((current) => current + 1);
    } catch (error) {
      setStatus(`Render job action failed: ${formatError(error)}`);
    }
  };

  const handleProbeDaemon = async () => {
    setStatus('Checking render worker daemon');
    try {
      const normalizedUrl = normalizeRenderWorkerDaemonUrl(daemonUrl);
      const nextStatus = await fetchRenderWorkerDaemonStatus(normalizedUrl, {
        timeoutMs: RENDER_WORKER_STATUS_TIMEOUT_MS,
      });
      setDaemonUrl(normalizedUrl);
      setDaemonStatus(nextStatus);
      setStatus(`Render worker ${nextStatus.workerId} connected`);
    } catch (error) {
      setDaemonStatus(null);
      setStatus(`Render worker unavailable: ${formatError(error)}`);
    }
  };

  const handleOpenOutput = async (path: string) => {
    const result = await openNativeRenderOutputPath(path);
    setStatus(result.ok ? `Opened ${path}` : result.error ?? `Could not open ${path}`);
  };

  const handleRevealOutput = async (path: string) => {
    const result = await revealNativeRenderOutputPath(path);
    setStatus(result.ok ? `Revealed ${path}` : result.error ?? `Could not reveal ${path}`);
  };

  return (
    <DanbiAppShell
      activeView="render"
      title="Render Queue"
      subtitle={loading ? 'Loading jobs, workers, outputs' : status}
      actions={(
        <>
          <AppLink href="/editor">Export</AppLink>
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
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <WorkspacePanel eyebrow="Jobs" title="Render Job List">
          <div className="space-y-2">
            {jobs.length === 0 ? (
              <div className="rounded border border-neutral-800 bg-neutral-950/60 p-4 text-sm text-neutral-500">
                {loading ? 'Loading render jobs...' : 'No render jobs are queued.'}
              </div>
            ) : jobs.map((job) => (
              <article key={job.id} className="rounded border border-neutral-800 bg-neutral-950/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-neutral-100">{job.id}</div>
                    <div className="mt-1 text-xs text-neutral-500">
                      priority {job.priority} / progress {Math.round(job.progress)}%
                    </div>
                  </div>
                  <StatusPill label="" value={job.status} tone={toneForRenderJob(job.status)} />
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded bg-neutral-800">
                  <div className="h-full bg-emerald-400" style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }} />
                </div>
                {job.outputPath ? (
                  <div className="mt-3 rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-400">
                    {job.outputPath}
                  </div>
                ) : null}
                {job.error ? <div className="mt-2 text-xs text-amber-200">{job.error}</div> : null}
                {job.diagnostic ? (
                  <div className="mt-2 text-xs text-neutral-500">{job.diagnostic.summary}</div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!canCancelRenderJob(job.status)}
                    onClick={() => void handleCancelJob(job.id)}
                    className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!canRetryRenderJob(job.status)}
                    onClick={() => void handleRetryJob(job.id)}
                    className="rounded border border-cyan-500/40 px-2 py-1 text-xs text-cyan-100 hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Retry
                  </button>
                  {job.outputPath ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleOpenOutput(job.outputPath!)}
                        className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-900"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRevealOutput(job.outputPath!)}
                        className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-900"
                      >
                        Reveal
                      </button>
                    </>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </WorkspacePanel>

        <div className="space-y-4">
          <WorkspacePanel eyebrow="Workers" title="Render Worker / Fleet">
            <div className="space-y-3">
              <div>
                <label className="mb-2 block text-xs font-medium uppercase text-neutral-500">
                  Daemon URL
                </label>
                <input
                  value={daemonUrl}
                  onChange={(event) => setDaemonUrl(event.currentTarget.value)}
                  className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-emerald-500"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleProbeDaemon()}
                className="inline-flex h-9 items-center rounded border border-emerald-400/50 bg-emerald-400/10 px-3 text-sm font-medium text-emerald-100 hover:bg-emerald-400/20"
              >
                Probe daemon
              </button>
              <DataList
                items={[
                  { label: 'Render Worker', value: daemonStatus ? 'Connected' : 'Not connected', tone: daemonStatus ? 'good' : 'pending' },
                  { label: 'Daemon', value: daemonStatus?.workerId ?? 'Unavailable', tone: daemonStatus ? 'good' : 'pending' },
                  { label: 'Fleet Discovery', value: daemonStatus?.discovery?.enabled ? 'Enabled' : 'Not detected', tone: daemonStatus?.discovery?.enabled ? 'good' : 'pending' },
                  { label: 'Headless Render', value: daemonStatus ? 'Available' : 'Pending daemon', tone: daemonStatus ? 'good' : 'pending' },
                ]}
              />
            </div>
          </WorkspacePanel>

          <WorkspacePanel eyebrow="Summary" title="Queue States">
            <DataList
              items={[
                { label: 'Current render', value: String(counts.running), tone: counts.running > 0 ? 'pending' : 'neutral' },
                { label: 'Queued renders', value: String(counts.queued), tone: counts.queued > 0 ? 'pending' : 'neutral' },
                { label: 'Completed renders', value: String(counts.completed), tone: counts.completed > 0 ? 'good' : 'neutral' },
                { label: 'Failed renders', value: String(counts.failed), tone: counts.failed > 0 ? 'warn' : 'neutral' },
                { label: 'Worker active runs', value: String(daemonStatus?.activeRuns ?? 0), tone: daemonStatus?.activeRuns ? 'pending' : 'neutral' },
              ]}
            />
          </WorkspacePanel>
        </div>
      </div>
    </DanbiAppShell>
  );
}

function buildRenderCounts(jobs: RenderJobView[], daemonStatus: RenderWorkerDaemonStatus | null) {
  return {
    queued: jobs.filter((job) => job.status === 'queued').length + (daemonStatus?.queuedRuns ?? 0),
    running: jobs.filter((job) => job.status === 'running').length + (daemonStatus?.runningRuns ?? 0),
    completed: jobs.filter((job) => job.status === 'completed').length + (daemonStatus?.completedRuns ?? 0),
    failed: jobs.filter((job) => job.status === 'failed').length + (daemonStatus?.failedRuns ?? 0),
  };
}

function toneForRenderJob(status: RenderJobView['status']): ShellStatusItem['tone'] {
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

function canCancelRenderJob(status: RenderJobView['status']): boolean {
  return status === 'queued' || status === 'running';
}

function canRetryRenderJob(status: RenderJobView['status']): boolean {
  return status === 'failed' || status === 'cancelled';
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
