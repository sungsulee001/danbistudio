'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { browserApiFetch } from '@/lib/browser-api-fetch';

const LIBRARY_LOAD_TIMEOUT_MS = 10000;

interface Job {
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

type LibraryStatusFilter = 'all' | 'completed' | 'running' | 'failed';
type LibrarySortOrder = 'newest' | 'oldest';

interface LibraryResponse {
  jobs: Job[];
  count: number;
}

const runningStatuses = new Set(['pending', 'running']);

export default function LibraryPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [statusFilter, setStatusFilter] = useState<LibraryStatusFilter>('all');
  const [sortOrder, setSortOrder] = useState<LibrarySortOrder>('newest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadLibrary() {
      setLoading(true);
      setError(null);

      try {
        const response = await browserApiFetch('/api/library', {
          cache: 'no-store',
          signal: controller.signal,
          timeoutMs: LIBRARY_LOAD_TIMEOUT_MS,
        });

        if (!response.ok) {
          throw new Error(`Library request failed with ${response.status}`);
        }

        const data = await response.json() as LibraryResponse;
        setJobs(Array.isArray(data.jobs) ? data.jobs : []);
      } catch (fetchError) {
        if (controller.signal.aborted) {
          return;
        }

        setError((fetchError as Error).message);
        setJobs([]);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadLibrary();

    return () => {
      controller.abort();
    };
  }, [refreshToken]);

  const visibleJobs = useMemo(() => {
    const filtered = jobs.filter((job) => {
      if (statusFilter === 'all') {
        return true;
      }

      if (statusFilter === 'running') {
        return runningStatuses.has(job.status);
      }

      return job.status === statusFilter;
    });

    return [...filtered].sort((a, b) => {
      const aTime = Date.parse(a.createdAt);
      const bTime = Date.parse(b.createdAt);
      return sortOrder === 'newest' ? bTime - aTime : aTime - bTime;
    });
  }, [jobs, sortOrder, statusFilter]);

  return (
    <main className="container mx-auto min-h-screen px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Link href="/" className="mb-4 inline-block text-primary transition-colors hover:text-primary/80">
              Back to Home
            </Link>
            <h1 className="text-3xl font-bold text-foreground">Library</h1>
            <p className="mt-2 text-sm text-foreground/70">
              {loading ? 'Loading generation history...' : `${visibleJobs.length} of ${jobs.length} jobs shown`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.currentTarget.value as LibraryStatusFilter)}
              className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-medium text-foreground outline-none transition-colors hover:bg-secondary/70 focus:border-primary"
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              <option value="completed">Completed</option>
              <option value="running">Running</option>
              <option value="failed">Failed</option>
            </select>
            <select
              value={sortOrder}
              onChange={(event) => setSortOrder(event.currentTarget.value as LibrarySortOrder)}
              className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-medium text-foreground outline-none transition-colors hover:bg-secondary/70 focus:border-primary"
              aria-label="Sort jobs"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
            <button
              type="button"
              onClick={() => setRefreshToken((current) => current + 1)}
              className="rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70 focus:border-primary focus:outline-none"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {loading && (
          <div className="rounded-lg border border-border bg-secondary/50 p-12 text-center text-foreground/70 shadow-lg">
            Loading library...
          </div>
        )}

        {visibleJobs.length === 0 && !loading && (
          <div className="rounded-lg border border-border bg-secondary/50 p-12 text-center shadow-lg backdrop-blur-sm">
            <h2 className="mb-2 text-2xl font-bold text-foreground">
              {jobs.length === 0 ? 'No generations yet' : 'No jobs match this filter'}
            </h2>
            <p className="mb-8 text-foreground/70">
              {jobs.length === 0
                ? 'Start creating AI-generated content to see it here.'
                : 'Adjust the filters to review the rest of your generation history.'}
            </p>
            <Link
              href="/generate"
              className="inline-block rounded-lg bg-primary px-6 py-3 font-medium text-white shadow-lg shadow-primary/20 transition-colors hover:bg-primary/80"
            >
              Create Generation
            </Link>
          </div>
        )}

        {visibleJobs.length > 0 && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {visibleJobs.map((job) => (
              <article
                key={job.id}
                className="overflow-hidden rounded-lg border border-border bg-secondary/50 shadow-lg backdrop-blur-sm transition-colors hover:border-primary/50"
              >
                <Link href={`/status/${job.id}`} className="block">
                  <LibraryPreview job={job} />
                  <div className="p-4">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <h2 className="line-clamp-2 text-sm font-semibold text-foreground">
                          {job.modelName}
                        </h2>
                        <p className="mt-1 text-xs text-foreground/60">
                          {job.workflowName}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded px-2 py-1 text-xs font-medium ${statusClassName(job.status)}`}>
                        {statusLabel(job.status)}
                      </span>
                    </div>
                    <p className="text-xs text-foreground/60">
                      {formatDate(job.createdAt)}
                    </p>
                    {job.error && (
                      <p className="mt-3 line-clamp-2 text-xs text-red-300">
                        {job.error}
                      </p>
                    )}
                  </div>
                </Link>
                {job.resultPath && (
                  <div className="border-t border-border px-4 py-3">
                    <a
                      href={job.resultPath}
                      download
                      className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
                    >
                      Download result
                    </a>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function LibraryPreview({ job }: { job: Job }) {
  if (job.resultPath && isVideoPath(job.resultPath)) {
    return (
      <div className="aspect-video bg-background/50">
        <video
          src={job.resultPath}
          className="h-full w-full object-cover"
          muted
          playsInline
          preload="metadata"
        />
      </div>
    );
  }

  if (job.resultPath) {
    return (
      <div className="aspect-video bg-background/50">
        <img
          src={job.resultPath}
          alt={`${job.modelName} result`}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className="flex aspect-video items-center justify-center bg-background/50 px-4 text-center text-sm text-foreground/60">
      {runningStatuses.has(job.status) ? 'Processing...' : statusLabel(job.status)}
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
  if (status === 'completed') {
    return 'bg-emerald-500/15 text-emerald-200';
  }

  if (status === 'failed') {
    return 'bg-red-500/15 text-red-200';
  }

  if (runningStatuses.has(status)) {
    return 'bg-amber-500/15 text-amber-200';
  }

  return 'bg-foreground/10 text-foreground/70';
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
