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
        ? 'border-rose-500/30 bg-rose-500/10'
        : report.status === 'warning'
          ? 'border-amber-500/30 bg-amber-500/10'
          : 'border-emerald-500/30 bg-emerald-500/10'
    }`}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold uppercase tracking-wide text-zinc-300">Preflight</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void onRebuildMediaCache()}
            disabled={mediaCachePlan.targets.length === 0}
            title={`${mediaCachePlan.skipped.length} preflight cache asset${mediaCachePlan.skipped.length === 1 ? '' : 's'} skipped`}
            className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-200 hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cache {mediaCachePlan.targets.length}
          </button>
          <button
            type="button"
            onClick={() => void onRelinkMissingMedia()}
            disabled={bulkRelinkCandidateCount === 0}
            title={bulkRelinkCandidateCount > 0 ? 'Select replacement files for all relinkable preflight media' : 'No missing media assets need relinking'}
            className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-200 hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Relink {bulkRelinkCandidateCount}
          </button>
          <span className={
            report.status === 'blocked'
              ? 'text-rose-200'
              : report.status === 'warning'
                ? 'text-amber-100'
                : 'text-emerald-200'
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
              <div key={issue.id} className="rounded border border-white/10 bg-zinc-950/60 p-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className={issue.severity === 'blocked' ? 'text-rose-100' : 'text-amber-100'}>
                    {issue.message}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onFocusIssue(issue)}
                      className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-200 hover:border-sky-400"
                    >
                      Focus
                    </button>
                    <button
                      type="button"
                      onClick={() => void onResolveIssue(issue)}
                      title={primaryAction.detail}
                      className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-200 hover:border-amber-400"
                    >
                      {primaryAction.label}
                    </button>
                    {showSecondaryRelink ? (
                      <button
                        type="button"
                        onClick={() => onRelinkIssueAsset(issue)}
                        className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-200 hover:border-amber-400"
                      >
                        Relink
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-1 text-[11px] text-zinc-400">
                  {issue.source}{issue.time !== undefined ? ` / ${formatTimecode(issue.time, fps)}` : ''} / {primaryAction.label}: {issue.action}
                </div>
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
        <div className="mt-2 text-xs text-emerald-100">Ready for render queue</div>
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
