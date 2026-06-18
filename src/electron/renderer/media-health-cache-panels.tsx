import type { MediaAssetHealth, MediaHealthReport } from '../../lib/editor/media-health';
import type { EditorAsset } from '../../lib/editor/types';
import type { MediaCacheJobView } from './editor-view-model';
import { buildVisibleIssueListSummary } from './issue-list-summary';

export function MediaHealthPanel({
  report,
  assetById,
  onSelectAsset,
  onRelinkAsset,
  onCacheAsset,
}: {
  report: MediaHealthReport;
  assetById: Map<string, EditorAsset>;
  onSelectAsset: (assetId: string) => void;
  onRelinkAsset: (assetId: string) => void;
  onCacheAsset: (asset: EditorAsset) => void;
}) {
  const issueSummary = buildVisibleIssueListSummary(report.issues, 3, 'media issue');

  return (
    <div className="mt-6 rounded-md border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Media Health</h2>
        <span className={`text-xs ${report.blockedCount > 0 ? 'text-rose-300' : report.warningCount > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
          {report.blockedCount > 0 ? `${report.blockedCount} blocked` : report.warningCount > 0 ? `${report.warningCount} warnings` : 'ready'}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-zinc-400">
        <div>
          <div className="uppercase text-zinc-500">Assets</div>
          <div className="mt-1 font-semibold text-zinc-100">{report.assetCount}</div>
        </div>
        <div>
          <div className="uppercase text-zinc-500">Render</div>
          <div className="mt-1 font-semibold text-zinc-100">{report.renderReadyCount}/{report.assetCount}</div>
        </div>
        <div>
          <div className="uppercase text-zinc-500">Cache</div>
          <div className="mt-1 font-semibold text-zinc-100">{report.cacheReadyCount}/{report.assetCount}</div>
        </div>
      </div>
      {issueSummary.visibleItems.length > 0 ? (
        <div className="mt-3 space-y-2">
          {issueSummary.visibleItems.map((issue) => {
            const asset = issue.assetId ? assetById.get(issue.assetId) : undefined;

            return (
              <div
                key={issue.id}
                className={`rounded border p-2 text-[11px] ${issue.severity === 'blocked' ? 'border-rose-500/30 bg-rose-500/10 text-rose-100' : 'border-amber-500/30 bg-amber-500/10 text-amber-100'}`}
              >
                <div className="line-clamp-2">{issue.message}</div>
                {asset ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className="text-zinc-100 hover:text-white" onClick={() => onSelectAsset(asset.id)}>
                      Select
                    </button>
                    {issue.action === 'relink' ? (
                      <button type="button" className="text-rose-100 hover:text-white" onClick={() => onRelinkAsset(asset.id)}>
                        Relink
                      </button>
                    ) : null}
                    {issue.action === 'cache' ? (
                      <button type="button" className="text-sky-100 hover:text-white" onClick={() => onCacheAsset(asset)}>
                        Cache
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          {issueSummary.hiddenLabel ? (
            <div className="rounded border border-zinc-800 bg-zinc-950/40 p-2 text-[11px] text-zinc-400">
              {issueSummary.hiddenLabel}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 rounded border border-emerald-500/20 bg-emerald-500/10 p-2 text-[11px] text-emerald-200">
          Preview, render paths, and cache metadata are ready.
        </div>
      )}
    </div>
  );
}

export function AssetHealthBadge({ health }: { health?: MediaAssetHealth }) {
  if (!health) {
    return null;
  }

  const tone = health.severity === 'blocked'
    ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
    : health.severity === 'warning'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';

  return (
    <div className={`mt-2 rounded border px-2 py-1 text-[11px] ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <span>{health.severity === 'ok' ? 'ready' : `${health.issueCount} issue${health.issueCount === 1 ? '' : 's'}`}</span>
        <span>{health.renderReady ? 'render' : 'no render'} / {health.cacheReady ? 'cache' : 'cache gap'}</span>
      </div>
      {health.issues[0] ? (
        <div className="mt-1 truncate opacity-85">{health.issues[0].message}</div>
      ) : null}
    </div>
  );
}

export function CacheJobStatus({
  job,
  onCancel,
  onRetry,
}: {
  job: MediaCacheJobView;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const tone = job.status === 'failed'
    ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
    : job.status === 'completed'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      : job.status === 'cancelled'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
        : 'border-sky-500/30 bg-sky-500/10 text-sky-200';

  return (
    <div className={`mt-2 rounded border p-2 text-[11px] ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <span>Cache {job.status}</span>
        <span>{job.progress}% / P{job.priority ?? 0}</span>
      </div>
      {job.status === 'queued' || job.status === 'running' ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded bg-zinc-800">
          <div className="h-full bg-sky-300" style={{ width: `${Math.max(4, Math.min(100, job.progress))}%` }} />
        </div>
      ) : null}
      <div className="mt-2 flex justify-end gap-2">
        {job.status === 'queued' || job.status === 'running' ? (
          <button type="button" className="text-rose-200 hover:text-rose-100" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        {job.status === 'failed' || job.status === 'cancelled' ? (
          <button type="button" className="text-sky-100 hover:text-white" onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </div>
      {job.error ? (
        <div className="mt-1 truncate text-rose-100/80">{job.error}</div>
      ) : null}
    </div>
  );
}
