import type { JobHistoryItem, JobHistorySummary } from './job-history-workflow-helpers';

export function JobHistoryPanel({ summary }: { summary: JobHistorySummary }) {
  if (summary.totalCount === 0) {
    return null;
  }

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-zinc-300">Job History</div>
          <div className="mt-1 text-[11px] text-zinc-500">
            {summary.totalCount} tracked / {summary.activeCount} active / {summary.failedCount} failed
          </div>
        </div>
        <span className={summary.failedCount > 0 ? 'text-xs text-rose-300' : 'text-xs text-emerald-300'}>
          {summary.failedCount > 0
            ? `${summary.failedCount} needs attention`
            : summary.activeCount > 0
              ? `${summary.activeCount} active`
              : `${summary.completedCount} complete`}
        </span>
      </div>
      <div className="space-y-2">
        {summary.items.map((item) => (
          <JobHistoryRow key={`${item.kind}-${item.id}`} item={item} />
        ))}
      </div>
      {summary.items.length < summary.totalCount ? (
        <div className="mt-2 text-[11px] text-zinc-600">
          Showing {summary.items.length} of {summary.totalCount} jobs
        </div>
      ) : null}
    </div>
  );
}

function JobHistoryRow({ item }: { item: JobHistoryItem }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/70 p-2">
      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="min-w-0">
          <div className="truncate text-zinc-200">{item.label}</div>
          <div className="mt-1 truncate text-[11px] text-zinc-500">{formatKind(item.kind)} / {item.detail}</div>
        </div>
        <span className={`shrink-0 ${statusClassName(item.status)}`}>{item.status}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded bg-zinc-800">
          <div className={`h-full transition-all ${progressClassName(item.status)}`} style={{ width: `${item.progress}%` }} />
        </div>
        <span className="w-9 text-right text-[11px] text-zinc-500">{item.progress}%</span>
      </div>
      {item.problem ? (
        <div className="mt-2 space-y-1 text-[11px]">
          <div className="truncate text-amber-200">{item.problem}</div>
          {item.action || item.retryable !== undefined ? (
            <div className="flex flex-wrap items-center gap-2 text-zinc-500">
              {item.action ? <span>{item.action}</span> : null}
              {item.retryable !== undefined ? (
                <span className={item.retryable ? 'text-sky-300' : 'text-rose-300'}>
                  {item.retryable ? 'Retryable' : 'Fix first'}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatKind(kind: JobHistoryItem['kind']): string {
  switch (kind) {
    case 'render':
      return 'Render';
    case 'media-cache':
      return 'Cache';
    case 'comfyui':
      return 'ComfyUI';
    case 'stt':
      return 'STT';
  }
}

function statusClassName(status: JobHistoryItem['status']): string {
  switch (status) {
    case 'running':
      return 'text-emerald-300';
    case 'queued':
      return 'text-sky-300';
    case 'completed':
      return 'text-zinc-300';
    case 'failed':
      return 'text-rose-300';
    case 'cancelled':
      return 'text-amber-300';
  }
}

function progressClassName(status: JobHistoryItem['status']): string {
  switch (status) {
    case 'running':
      return 'bg-emerald-400';
    case 'queued':
      return 'bg-sky-400';
    case 'completed':
      return 'bg-zinc-500';
    case 'failed':
      return 'bg-rose-400';
    case 'cancelled':
      return 'bg-amber-400';
  }
}
