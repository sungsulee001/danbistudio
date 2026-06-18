import { useState } from 'react';
import type { FfmpegRenderPlan } from '../../lib/editor/ffmpeg-renderer';
import {
  buildRenderDiagnosticView,
  canRetryRenderDiagnostic,
  formatRenderRetryActionLabel,
  formatRenderRetryBlockedStatus,
  type RenderDiagnosticActionView,
} from './render-diagnostic-view';
import type { RenderJobView } from './editor-view-model';

const RENDER_COMMAND_PREVIEW_LIMIT = 1600;

export interface RenderCommandPreview {
  text: string;
  isTruncated: boolean;
  omittedCharacterCount: number;
}

export function buildRenderCommandPreview(
  commandText: string,
  limit = RENDER_COMMAND_PREVIEW_LIMIT,
): RenderCommandPreview {
  if (commandText.length <= limit) {
    return {
      text: commandText,
      isTruncated: false,
      omittedCharacterCount: 0,
    };
  }

  return {
    text: `${commandText.slice(0, Math.max(0, limit)).trimEnd()}\n...`,
    isTruncated: true,
    omittedCharacterCount: commandText.length - limit,
  };
}

export function shouldOfferCurrentExportRenderAction(renderJob: RenderJobView | null): boolean {
  return renderJob?.status === 'failed' || renderJob?.status === 'cancelled';
}

export function RenderStatusPanel({
  renderJob,
  renderPlan,
  renderOutputPath,
  onCancelRender,
  onRetryRender,
  onQueueCurrentRender,
  onOpenRenderOutput,
  onRevealRenderOutput,
  onResolveDiagnosticAction,
}: {
  renderJob: RenderJobView | null;
  renderPlan: FfmpegRenderPlan;
  renderOutputPath: string | null;
  onCancelRender: () => void | Promise<void>;
  onRetryRender: () => void | Promise<void>;
  onQueueCurrentRender?: () => void | Promise<void>;
  onOpenRenderOutput?: () => void | Promise<void>;
  onRevealRenderOutput?: () => void | Promise<void>;
  onResolveDiagnosticAction?: (action: RenderDiagnosticActionView) => void | Promise<void>;
}) {
  const diagnosticView = renderJob?.diagnostic ? buildRenderDiagnosticView(renderJob.diagnostic) : undefined;
  const canRetryRenderJob = canRetryRenderDiagnostic(renderJob?.diagnostic);
  const retryLabel = formatRenderRetryActionLabel(renderJob?.diagnostic);
  const retryBlockedStatus = formatRenderRetryBlockedStatus(renderJob?.diagnostic);
  const canQueueCurrentRender = Boolean(onQueueCurrentRender) && shouldOfferCurrentExportRenderAction(renderJob) && !canRetryRenderJob;
  const [showFullCommand, setShowFullCommand] = useState(false);
  const commandPreview = buildRenderCommandPreview(renderPlan.commandText);

  return (
    <>
      {renderJob ? (
        <div data-testid="render-job-panel" className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-zinc-400">Render job</span>
            <span data-testid="render-job-status" className="text-emerald-300">{renderJob.status}</span>
          </div>
          <div className="mb-2 text-[11px] text-zinc-500">
            Priority {renderJob.priority ?? 0}
          </div>
          <div className="h-2 overflow-hidden rounded bg-zinc-800">
            <div
              className="h-full bg-emerald-400 transition-all"
              style={{ width: `${Math.max(0, Math.min(renderJob.progress, 100))}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-zinc-500">
            <span data-testid="render-job-progress">{renderJob.progress}%</span>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {renderJob.status === 'queued' || renderJob.status === 'running' ? (
                <button type="button" className="text-rose-300 hover:text-rose-200" onClick={() => void onCancelRender()}>
                  Cancel
                </button>
              ) : null}
              {renderJob.status === 'failed' || renderJob.status === 'cancelled' ? (
                <button
                  type="button"
                  className={canRetryRenderJob
                    ? 'text-sky-300 hover:text-sky-200'
                    : 'cursor-not-allowed text-zinc-500'}
                  disabled={!canRetryRenderJob}
                  title={retryBlockedStatus ?? 'Rebuilds preflight and queues a new job from the current project, export profile, range, and output path.'}
                  onClick={() => void onRetryRender()}
                >
                  {retryLabel}
                </button>
              ) : null}
              {canQueueCurrentRender ? (
                <button
                  type="button"
                  className="text-emerald-300 hover:text-emerald-200"
                  title="Rebuilds preflight and the FFmpeg plan from the current project, export profile, range, and output path."
                  onClick={() => void onQueueCurrentRender?.()}
                >
                  Queue current export
                </button>
              ) : null}
            </div>
          </div>
          {diagnosticView ? (
            <div className={`mt-3 rounded border p-2 text-xs ${
              diagnosticView.tone === 'blocked'
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-100'
                : diagnosticView.tone === 'retry'
                  ? 'border-sky-500/30 bg-sky-500/10 text-sky-100'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-100'
            }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{diagnosticView.title}</div>
                  <div className="mt-1 text-[11px] opacity-80">{diagnosticView.summary}</div>
                </div>
                <span className="shrink-0 rounded border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/70">
                  {diagnosticView.categoryLabel}
                </span>
              </div>
              <div className="mt-2 text-[11px] uppercase tracking-wide text-white/60">
                {diagnosticView.retryLabel}
              </div>
              {diagnosticView.primaryAction ? (
                <div className="mt-2 rounded border border-white/10 bg-black/20 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
                      {diagnosticView.primaryAction.label}
                    </div>
                    {onResolveDiagnosticAction ? (
                      <button
                        type="button"
                        className="rounded border border-white/20 px-2 py-1 text-[11px] text-white/80 hover:bg-white/10"
                        onClick={() => void onResolveDiagnosticAction(diagnosticView.primaryAction!)}
                      >
                        Resolve
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-1 text-[11px] text-white/75">{diagnosticView.primaryAction.detail}</div>
                </div>
              ) : null}
              <ul className="mt-2 space-y-1 text-[11px] text-white/75">
                {diagnosticView.actions.slice(1, 3).map((action) => (
                  <li key={action.detail}>{action.detail}</li>
                ))}
              </ul>
              {diagnosticView.evidence.length > 0 ? (
                <details className="mt-2 text-[11px] text-white/60">
                  <summary className="cursor-pointer text-white/70">Evidence</summary>
                  <ul className="mt-1 space-y-1">
                    {diagnosticView.evidence.map((line) => (
                      <li key={line} className="break-words">{line}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : null}
          {renderJob.stderrTail && (renderJob.status === 'failed' || renderJob.status === 'cancelled') ? (
            <pre className="mt-3 max-h-24 overflow-auto whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-950 p-2 text-[11px] leading-5 text-zinc-400 custom-scrollbar">
              {renderJob.stderrTail}
            </pre>
          ) : null}
        </div>
      ) : null}
      <div className="rounded-md border border-zinc-800 bg-zinc-950 p-2">
        <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
          <span>Render command</span>
          {commandPreview.isTruncated ? (
            <button
              type="button"
              className="text-sky-300 hover:text-sky-200"
              onClick={() => setShowFullCommand((value) => !value)}
            >
              {showFullCommand ? 'Show preview' : 'Show full command'}
            </button>
          ) : null}
        </div>
        <pre
          data-testid="render-command-preview"
          className="max-h-28 overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-zinc-400 custom-scrollbar"
        >
          {showFullCommand ? renderPlan.commandText : commandPreview.text}
        </pre>
        {commandPreview.isTruncated && !showFullCommand ? (
          <div className="mt-1 text-[10px] text-zinc-600">
            {commandPreview.omittedCharacterCount} command characters hidden until expanded.
          </div>
        ) : null}
      </div>
      {renderOutputPath ? (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs text-emerald-200">
          <div data-testid="render-output-path" className="break-all">Rendered file: {renderOutputPath}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {onOpenRenderOutput ? (
              <button
                type="button"
                className="rounded border border-emerald-400/40 px-2 py-1 text-[11px] text-emerald-100 hover:bg-emerald-500/20"
                onClick={() => void onOpenRenderOutput()}
              >
                Open
              </button>
            ) : null}
            {onRevealRenderOutput ? (
              <button
                type="button"
                className="rounded border border-emerald-400/40 px-2 py-1 text-[11px] text-emerald-100 hover:bg-emerald-500/20"
                onClick={() => void onRevealRenderOutput()}
              >
                Show in folder
              </button>
            ) : null}
            <a
              href={renderOutputPath}
              className="rounded border border-emerald-400/40 px-2 py-1 text-[11px] text-emerald-100 hover:bg-emerald-500/20"
              target="_blank"
              rel="noreferrer"
            >
              Open link
            </a>
          </div>
        </div>
      ) : null}
      {renderPlan.warnings.slice(0, 4).map((issue) => (
        <div key={issue} className="rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">
          {issue}
        </div>
      ))}
    </>
  );
}
