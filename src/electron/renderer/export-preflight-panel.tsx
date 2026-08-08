import type { MediaCacheBatchPlan } from '../../lib/editor/media-cache-targets';
import type { RenderPreflightIssue, RenderPreflightReport } from '../../lib/editor/render-preflight';
import { buildVisibleIssueListSummary } from './issue-list-summary';
import { resolvePreflightIssuePrimaryAction, type PreflightIssuePrimaryAction } from './preflight-issue-helpers';

export function ExportPreflightPanel({
  report,
  mediaCachePlan,
  bulkRelinkCandidateCount,
  fps,
  onRebuildMediaCache,
  onRelinkMissingMedia,
  onFocusIssue,
  onResolveIssue,
  onRelinkIssueAsset,
}: {
  report: RenderPreflightReport;
  mediaCachePlan: MediaCacheBatchPlan;
  bulkRelinkCandidateCount: number;
  fps: number;
  onRebuildMediaCache: () => void | Promise<void>;
  onRelinkMissingMedia: () => void | Promise<void>;
  onFocusIssue: (issue: RenderPreflightIssue) => void;
  onResolveIssue: (issue: RenderPreflightIssue) => void | Promise<void>;
  onRelinkIssueAsset: (issue: RenderPreflightIssue) => void;
}) {
  const issueSummary = buildVisibleIssueListSummary(report.issues, 4, 'preflight issue');

  return (
    <div className={`rounded-md border p-3 ${
      report.status === 'blocked'
        ? 'border-danger-500/30 bg-danger-500/10'
        : report.status === 'warning'
          ? 'border-warn-500/30 bg-warn-500/10'
          : 'border-accent-500/30 bg-accent-500/10'
    }`}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold uppercase tracking-wide text-ds-700">Preflight</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void onRebuildMediaCache()}
            disabled={mediaCachePlan.targets.length === 0}
            title={`${mediaCachePlan.skipped.length} preflight cache asset${mediaCachePlan.skipped.length === 1 ? '' : 's'} skipped`}
            className="rounded border border-ds-300 px-2 py-1 text-meta text-ds-800 hover:border-info-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cache {mediaCachePlan.targets.length}
          </button>
          <button
            type="button"
            onClick={() => void onRelinkMissingMedia()}
            disabled={bulkRelinkCandidateCount === 0}
            title={bulkRelinkCandidateCount > 0 ? 'Select replacement files for all relinkable preflight media' : 'No missing media assets need relinking'}
            className="rounded border border-ds-300 px-2 py-1 text-meta text-ds-800 hover:border-warn-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Relink {bulkRelinkCandidateCount}
          </button>
          <span className={
            report.status === 'blocked'
              ? 'text-danger-800'
              : report.status === 'warning'
                ? 'text-warn-900'
                : 'text-accent-800'
          }
          >
            {report.status} / {report.blockedCount} blocked / {report.warningCount} warnings
          </span>
        </div>
      </div>
      {report.issues.length > 0 ? (
        <div className="mt-2 space-y-2">
          {issueSummary.visibleItems.map((issue) => {
            const primaryAction = resolvePreflightIssuePrimaryAction(issue);
            const showSecondaryRelink = shouldShowSecondaryPreflightRelinkAction(issue, primaryAction);

            return (
              <div key={issue.id} className="rounded border border-white/10 bg-paper/60 p-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className={issue.severity === 'blocked' ? 'text-danger-900' : 'text-warn-900'}>
                    {issue.message}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onFocusIssue(issue)}
                      className="rounded border border-ds-300 px-2 py-1 text-meta text-ds-800 hover:border-info-600"
                    >
                      Focus
                    </button>
                    <button
                      type="button"
                      onClick={() => void onResolveIssue(issue)}
                      title={primaryAction.detail}
                      className="rounded border border-ds-300 px-2 py-1 text-meta text-ds-800 hover:border-warn-600"
                    >
                      {primaryAction.label}
                    </button>
                    {showSecondaryRelink ? (
                      <button
                        type="button"
                        onClick={() => onRelinkIssueAsset(issue)}
                        className="rounded border border-ds-300 px-2 py-1 text-meta text-ds-800 hover:border-warn-600"
                      >
                        Relink
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-1 text-meta text-ds-700">
                  {issue.source}{issue.time !== undefined ? ` / ${formatTimecode(issue.time, fps)}` : ''} / {primaryAction.label}: {issue.action}
                </div>
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
        <div className="mt-2 text-xs text-accent-900">Ready for render queue</div>
      )}
    </div>
  );
}

export function shouldShowSecondaryPreflightRelinkAction(
  issue: RenderPreflightIssue,
  primaryAction: PreflightIssuePrimaryAction,
): boolean {
  return issue.actionKind === 'relink' && Boolean(issue.assetId) && primaryAction.kind !== 'relink';
}

function formatTimecode(seconds: number, fps: number): string {
  const safeSeconds = Math.max(0, seconds);
  const wholeSeconds = Math.floor(safeSeconds);
  const frames = Math.round((safeSeconds - wholeSeconds) * fps);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const secs = wholeSeconds % 60;

  return `${padTime(hours)}:${padTime(minutes)}:${padTime(secs)}:${padTime(frames)}`;
}

function padTime(value: number): string {
  return String(value).padStart(2, '0');
}
