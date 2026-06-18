'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import { browserApiFetch } from '@/lib/browser-api-fetch';

const STATUS_POLL_TIMEOUT_MS = 8000;

interface JobStatus {
  id: string;
  status: string;
  modelName: string;
  workflowName: string;
  parameters: unknown;
  promptId?: string;
  resultPath?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

const activeStatuses = new Set(['pending', 'running']);

export default function StatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async (signal?: AbortSignal): Promise<JobStatus | null> => {
    setRefreshing(true);
    setError(null);

    try {
      const response = await browserApiFetch(`/api/status/${id}`, {
        cache: 'no-store',
        signal,
        timeoutMs: STATUS_POLL_TIMEOUT_MS,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch job status: ${response.status}`);
      }

      const data = await response.json() as JobStatus;
      setJob(data);
      return data;
    } catch (fetchError) {
      if (signal?.aborted) {
        return null;
      }

      setError((fetchError as Error).message);
      return null;
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [id]);

  useEffect(() => {
    const controller = new AbortController();
    let interval: ReturnType<typeof setInterval> | null = null;
    let polling = false;

    const pollStatus = async () => {
      if (polling || controller.signal.aborted) {
        return;
      }

      polling = true;
      try {
        const nextJob = await fetchStatus(controller.signal);
        if (nextJob && !activeStatuses.has(nextJob.status) && interval) {
          clearInterval(interval);
          interval = null;
        }
      } finally {
        polling = false;
      }
    };

    void pollStatus();
    interval = setInterval(() => void pollStatus(), 3000);

    return () => {
      controller.abort();
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [fetchStatus]);

  if (loading) {
    return (
      <main className="container mx-auto min-h-screen px-4 py-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-b-2 border-primary" />
          <p className="text-foreground/70">Loading job status...</p>
        </div>
      </main>
    );
  }

  if (error || !job) {
    return (
      <main className="container mx-auto min-h-screen px-4 py-8">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-8 text-center">
            <h2 className="mb-4 text-2xl font-bold text-red-400">Error</h2>
            <p className="mb-6 text-red-400/80">{error || 'Job not found'}</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => void fetchStatus()}
                className="rounded-lg bg-primary px-6 py-3 font-medium text-white shadow-lg shadow-primary/20 transition-colors hover:bg-primary/80"
              >
                Retry
              </button>
              <Link
                href="/library"
                className="rounded-lg border border-border bg-secondary px-6 py-3 font-medium text-foreground transition-colors hover:bg-secondary/70"
              >
                View Library
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const isActive = activeStatuses.has(job.status);

  return (
    <main className="container mx-auto min-h-screen px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/" className="mb-4 inline-block text-primary transition-colors hover:text-primary/80">
              Back to Home
            </Link>
            <h1 className="mb-2 text-3xl font-bold text-foreground">Job Status</h1>
            <p className="font-mono text-sm text-foreground/60">{job.id}</p>
          </div>
          <button
            type="button"
            onClick={() => void fetchStatus()}
            disabled={refreshing}
            className="rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className="mb-6 rounded-lg border border-border bg-secondary/50 p-8 shadow-lg backdrop-blur-sm">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h2 className="text-2xl font-semibold text-foreground">Current Status</h2>
            <span className={`rounded-full border px-4 py-2 text-sm font-medium uppercase ${statusClassName(job.status)}`}>
              {statusLabel(job.status)}
            </span>
          </div>

          {isActive && (
            <div className="mb-6">
              <div className="h-2 w-full overflow-hidden rounded-full bg-background/50">
                <div className="h-2 w-1/2 animate-pulse rounded-full bg-primary" />
              </div>
              <p className="mt-2 text-sm text-foreground/70">
                {job.status === 'pending' ? 'Queued in ComfyUI...' : 'Processing in ComfyUI...'}
              </p>
            </div>
          )}

          {job.error && (
            <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <p className="font-medium text-red-400">Error</p>
              <p className="text-red-400/80">{job.error}</p>
            </div>
          )}

          <div className="space-y-3">
            <InfoRow label="Model" value={job.modelName} />
            <InfoRow label="Workflow" value={job.workflowName} />
            {job.promptId && <InfoRow label="Prompt ID" value={job.promptId} />}
            <InfoRow label="Created" value={formatDate(job.createdAt)} />
            <InfoRow label="Updated" value={formatDate(job.updatedAt)} />
          </div>
        </div>

        {job.status === 'completed' && (
          <div className="rounded-lg border border-border bg-secondary/50 p-8 shadow-lg backdrop-blur-sm">
            <h2 className="mb-4 text-2xl font-semibold text-foreground">Result</h2>
            {job.resultPath ? (
              <>
                <div className="mb-4 rounded-lg border border-border bg-background/50 p-4">
                  <ResultPreview job={job} />
                </div>
                <a
                  href={job.resultPath}
                  download
                  className="block w-full rounded-lg bg-primary px-6 py-3 text-center font-medium text-white shadow-lg shadow-primary/20 transition-colors hover:bg-primary/80"
                >
                  Download Result
                </a>
              </>
            ) : (
              <p className="text-foreground/70">
                The job completed, but no output file was captured.
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-4 sm:flex-row">
          <Link
            href="/generate"
            className="flex-1 rounded-lg bg-primary px-6 py-3 text-center font-medium text-white shadow-lg shadow-primary/20 transition-colors hover:bg-primary/80"
          >
            Generate Another
          </Link>
          <Link
            href="/library"
            className="flex-1 rounded-lg border border-border bg-secondary px-6 py-3 text-center font-medium text-foreground transition-colors hover:bg-secondary/70"
          >
            View Library
          </Link>
        </div>
      </div>
    </main>
  );
}

function ResultPreview({ job }: { job: JobStatus }) {
  if (!job.resultPath) {
    return null;
  }

  if (isVideoPath(job.resultPath)) {
    return (
      <video
        src={job.resultPath}
        controls
        className="mx-auto max-h-[70vh] max-w-full rounded"
      />
    );
  }

  return (
    <img
      src={job.resultPath}
      alt={`${job.modelName} result`}
      className="mx-auto max-h-[70vh] max-w-full rounded"
    />
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/30 py-2">
      <span className="font-medium text-foreground/70">{label}</span>
      <span className="min-w-0 truncate text-right text-foreground" title={value}>
        {value}
      </span>
    </div>
  );
}

function statusLabel(status: string): string {
  if (status === 'pending') {
    return 'Pending';
  }

  if (status === 'running') {
    return 'Running';
  }

  if (status === 'completed') {
    return 'Completed';
  }

  if (status === 'failed') {
    return 'Failed';
  }

  return status || 'Unknown';
}

function statusClassName(status: string): string {
  if (status === 'pending') {
    return 'border-yellow-500/30 bg-yellow-500/20 text-yellow-300';
  }

  if (status === 'running') {
    return 'border-primary/30 bg-primary/20 text-primary';
  }

  if (status === 'completed') {
    return 'border-green-500/30 bg-green-500/20 text-green-300';
  }

  if (status === 'failed') {
    return 'border-red-500/30 bg-red-500/20 text-red-300';
  }

  return 'border-border bg-foreground/10 text-foreground/80';
}

function isVideoPath(path: string): boolean {
  return /\.(?:mp4|webm|mov|m4v|mkv)$/i.test(path);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
