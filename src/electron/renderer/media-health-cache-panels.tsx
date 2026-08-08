import type { MediaAssetHealth, MediaHealthReport } from '../../lib/editor/media-health';
import type { EditorAsset } from '../../lib/editor/types';
import type { DanbiMenuLanguage } from '../../lib/editor/menu-language';
import type { MediaCacheJobView } from './editor-view-model';
import { buildVisibleIssueListSummary } from './issue-list-summary';
import { useMenuLanguage } from './use-menu-language';

const mediaHealthText: Record<DanbiMenuLanguage, {
  assets: string;
  blocked: string;
  cache: string;
  cacheGap: string;
  cancel: string;
  details: string;
  issue: (count: number) => string;
  mediaHealth: string;
  noRender: string;
  previewReady: string;
  ready: string;
  relink: string;
  render: string;
  retry: string;
  select: string;
  warnings: string;
}> = {
  en: {
    assets: 'Assets',
    blocked: 'blocked',
    cache: 'Cache',
    cacheGap: 'cache gap',
    cancel: 'Cancel',
    details: 'Details',
    issue: (count) => `${count} issue${count === 1 ? '' : 's'}`,
    mediaHealth: 'Media Health',
    noRender: 'no render',
    previewReady: 'Preview, render paths, and cache metadata are ready.',
    ready: 'ready',
    relink: 'Relink',
    render: 'Render',
    retry: 'Retry',
    select: 'Select',
    warnings: 'warnings',
  },
  ko: {
    assets: '에셋',
    blocked: '차단',
    cache: '캐시',
    cacheGap: '캐시 부족',
    cancel: '취소',
    details: '자세히',
    issue: (count) => `${count}개 문제`,
    mediaHealth: '미디어 상태',
    noRender: '렌더 없음',
    previewReady: '프리뷰, 렌더 경로, 캐시 메타데이터가 준비되었습니다.',
    ready: '준비됨',
    relink: '다시 연결',
    render: '렌더',
    retry: '재시도',
    select: '선택',
    warnings: '경고',
  },
};

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
  const language = useMenuLanguage();
  const text = mediaHealthText[language];
  const issueSummary = buildVisibleIssueListSummary(report.issues, 3, 'media issue');

  return (
    <div className="mt-6 rounded-md border border-ds-200 bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-kicker font-heading font-semibold uppercase text-ds-600">{text.mediaHealth}</h2>
        <span className={`text-xs ${report.blockedCount > 0 ? 'text-danger-700' : report.warningCount > 0 ? 'text-warn-700' : 'text-accent-700'}`}>
          {report.blockedCount > 0 ? `${report.blockedCount} ${text.blocked}` : report.warningCount > 0 ? `${report.warningCount} ${text.warnings}` : text.ready}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-meta text-ds-700">
        <div>
          <div className="uppercase text-ds-600">{text.assets}</div>
          <div className="mt-1 font-semibold text-ink">{report.assetCount}</div>
        </div>
        <div>
          <div className="uppercase text-ds-600">{text.render}</div>
          <div className="mt-1 font-semibold text-ink">{report.renderReadyCount}/{report.assetCount}</div>
        </div>
        <div>
          <div className="uppercase text-ds-600">{text.cache}</div>
          <div className="mt-1 font-semibold text-ink">{report.cacheReadyCount}/{report.assetCount}</div>
        </div>
      </div>
      {issueSummary.visibleItems.length > 0 ? (
        <div className="mt-3 space-y-2">
          {issueSummary.visibleItems.map((issue) => {
            const asset = issue.assetId ? assetById.get(issue.assetId) : undefined;

            return (
              <div
                key={issue.id}
                className={`rounded border p-2 text-meta ${issue.severity === 'blocked' ? 'border-danger-500/30 bg-danger-500/10 text-danger-900' : 'border-warn-500/30 bg-warn-500/10 text-warn-900'}`}
              >
                <div className="line-clamp-2">{issue.message}</div>
                {asset ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className="text-ink hover:text-ink" onClick={() => onSelectAsset(asset.id)}>
                      {text.select}
                    </button>
                    {issue.action === 'relink' ? (
                      <button type="button" className="text-danger-900 hover:text-ink" onClick={() => onRelinkAsset(asset.id)}>
                        {text.relink}
                      </button>
                    ) : null}
                    {issue.action === 'cache' ? (
                      <button type="button" className="text-info-900 hover:text-ink" onClick={() => onCacheAsset(asset)}>
                        {text.cache}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          {issueSummary.hiddenLabel ? (
            <div className="rounded border border-ds-200 bg-paper/40 p-2 text-meta text-ds-700">
              {issueSummary.hiddenLabel}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 rounded border border-accent-500/20 bg-accent-500/10 p-2 text-meta text-accent-800">
          {text.previewReady}
        </div>
      )}
    </div>
  );
}

export function AssetHealthBadge({ health }: { health?: MediaAssetHealth }) {
  const language = useMenuLanguage();
  const text = mediaHealthText[language];

  if (!health) {
    return null;
  }

  const tone = health.severity === 'blocked'
    ? 'border-danger-500/30 bg-danger-500/10 text-danger-800'
    : health.severity === 'warning'
      ? 'border-warn-500/30 bg-warn-500/10 text-warn-800'
      : 'border-accent-500/30 bg-accent-500/10 text-accent-800';

  return (
    <div className={`mt-2 rounded border px-2 py-1 text-meta ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <span>{health.severity === 'ok' ? text.ready : text.issue(health.issueCount)}</span>
        <span>{health.renderReady ? text.render : text.noRender} / {health.cacheReady ? text.cache : text.cacheGap}</span>
      </div>
      {health.issues[0] ? (
        <details className="mt-1">
          <summary className="cursor-pointer list-none text-micro uppercase tracking-wide opacity-75">
            {text.details}
          </summary>
          <div className="mt-1 line-clamp-2 opacity-85">{health.issues[0].message}</div>
        </details>
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
  const language = useMenuLanguage();
  const text = mediaHealthText[language];
  const tone = job.status === 'failed'
    ? 'border-danger-500/30 bg-danger-500/10 text-danger-800'
    : job.status === 'completed'
      ? 'border-accent-500/30 bg-accent-500/10 text-accent-800'
      : job.status === 'cancelled'
        ? 'border-warn-500/30 bg-warn-500/10 text-warn-800'
        : 'border-info-500/30 bg-info-500/10 text-info-800';

  return (
    <div className={`mt-2 rounded border p-2 text-meta ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <span>{text.cache} {job.status}</span>
        <span>{job.progress}% / P{job.priority ?? 0}</span>
      </div>
      {job.status === 'queued' || job.status === 'running' ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded bg-ds-200">
          <div className="h-full bg-info-700" style={{ width: `${Math.max(4, Math.min(100, job.progress))}%` }} />
        </div>
      ) : null}
      <div className="mt-2 flex justify-end gap-2">
        {job.status === 'queued' || job.status === 'running' ? (
          <button type="button" className="text-danger-800 hover:text-danger-900" onClick={onCancel}>
            {text.cancel}
          </button>
        ) : null}
        {job.status === 'failed' || job.status === 'cancelled' ? (
          <button type="button" className="text-info-900 hover:text-ink" onClick={onRetry}>
            {text.retry}
          </button>
        ) : null}
      </div>
      {job.error ? (
        <div className="mt-1 truncate text-danger-900/80">{job.error}</div>
      ) : null}
    </div>
  );
}
