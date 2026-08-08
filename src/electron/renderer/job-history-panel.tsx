import type { JobHistoryItem, JobHistorySummary } from './job-history-workflow-helpers';

export function JobHistoryPanel({ summary }: { summary: JobHistorySummary }) {
  if (summary.totalCount === 0) {
    return null;
  }

  return (
    <div className="rounded-md border border-ds-200 bg-paper p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-ds-700">Job History</div>
          <div className="mt-1 text-meta text-ds-600">
            {summary.totalCount} tracked / {summary.activeCount} active / {summary.failedCount} failed
          </div>
        </div>
        <span className={summary.failedCount > 0 ? 'text-xs text-danger-700' : 'text-xs text-accent-700'}>
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
        <div className="mt-2 text-meta text-ds-400">
          Showing {summary.items.length} of {summary.totalCount} jobs
        </div>
      ) : null}
    </div>
  );
}

function JobHistoryRow({ item }: { item: JobHistoryItem }) {
  return (
    <div className="rounded border border-ds-200 bg-surface/70 p-2">
      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="min-w-0">
          <div className="truncate text-ds-800">{item.label}</div>
          <div className="mt-1 truncate text-meta text-ds-600">{formatKind(item.kind)} / {item.detail}</div>
        </div>
        <span className={`shrink-0 ${statusClassName(item.status)}`}>{item.status}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded bg-ds-200">
          <div className={`h-full transition-all ${progressClassName(item.status)}`} style={{ width: `${item.progress}%` }} />
        </div>
        <span className="w-9 text-right text-meta text-ds-600">{item.progress}%</span>
      </div>
      {item.problem ? (
        <div className="mt-2 space-y-1 text-meta">
          <div className="truncate text-warn-800">{item.problem}</div>
          {item.action || item.retryable !== undefined ? (
            <div className="flex flex-wrap items-center gap-2 text-ds-600">
              {item.action ? <span>{item.action}</span> : null}
              {item.retryable !== undefined ? (
                <span className={item.retryable ? 'text-info-700' : 'text-danger-700'}>
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
      return 'text-accent-700';
    case 'queued':
      return 'text-info-700';
    case 'completed':
      return 'text-ds-700';
    case 'failed':
      return 'text-danger-700';
    case 'cancelled':
      return 'text-warn-700';
  }
}

function progressClassName(status: JobHistoryItem['status']): string {
  switch (status) {
    case 'running':
      return 'bg-accent-600';
    case 'queued':
      return 'bg-info-600';
    case 'completed':
      return 'bg-ds-500';
    case 'failed':
      return 'bg-danger-600';
    case 'cancelled':
      return 'bg-warn-600';
  }
}
