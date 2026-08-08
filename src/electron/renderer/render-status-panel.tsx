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
        <div data-testid="render-job-panel" className="rounded-md border border-ds-200 bg-paper p-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-ds-700">Render job</span>
            <span data-testid="render-job-status" className="text-accent-700">{renderJob.status}</span>
          </div>
          <div className="mb-2 text-meta text-ds-600">
            Priority {renderJob.priority ?? 0}
          </div>
          <div className="h-2 overflow-hidden rounded bg-ds-200">
            <div
              className="h-full bg-accent-600 transition-all"
              style={{ width: `${Math.max(0, Math.min(renderJob.progress, 100))}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-ds-600">
            <span data-testid="render-job-progress">{renderJob.progress}%</span>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {renderJob.status === 'queued' || renderJob.status === 'running' ? (
                <button type="button" className="text-danger-700 hover:text-danger-800" onClick={() => void onCancelRender()}>
                  Cancel
                </button>
              ) : null}
              {renderJob.status === 'failed' || renderJob.status === 'cancelled' ? (
                <button
                  type="button"
                  className={canRetryRenderJob
                    ? 'text-info-700 hover:text-info-800'
                    : 'cursor-not-allowed text-ds-600'}
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
                  className="text-accent-700 hover:text-accent-800"
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
                ? 'border-danger-500/30 bg-danger-500/10 text-danger-900'
                : diagnosticView.tone === 'retry'
                  ? 'border-info-500/30 bg-info-500/10 text-info-900'
                  : 'border-warn-500/30 bg-warn-500/10 text-warn-900'
            }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{diagnosticView.title}</div>
                  <div className="mt-1 text-meta opacity-80">{diagnosticView.summary}</div>
                </div>
                <span className="shrink-0 rounded border border-ds-300 px-2 py-0.5 text-micro uppercase tracking-wide text-ds-700">
                  {diagnosticView.categoryLabel}
                </span>
              </div>
              <div className="mt-2 text-meta uppercase tracking-wide text-ds-700">
                {diagnosticView.retryLabel}
              </div>
              {diagnosticView.primaryAction ? (
                <div className="mt-2 rounded border border-ds-200 bg-ds-100 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-meta font-semibold uppercase tracking-wide text-ds-700">
                      {diagnosticView.primaryAction.label}
                    </div>
                    {onResolveDiagnosticAction ? (
                      <button
                        type="button"
                        className="rounded border border-ds-300 px-2 py-1 text-meta text-ds-800 hover:bg-ds-200"
                        onClick={() => void onResolveDiagnosticAction(diagnosticView.primaryAction!)}
                      >
                        Resolve
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-1 text-meta text-ds-700">{diagnosticView.primaryAction.detail}</div>
                </div>
              ) : null}
              <ul className="mt-2 space-y-1 text-meta text-ds-700">
                {diagnosticView.actions.slice(1, 3).map((action) => (
                  <li key={action.detail}>{action.detail}</li>
                ))}
              </ul>
              {diagnosticView.evidence.length > 0 ? (
                <details className="mt-2 text-meta text-ds-700">
                  <summary className="cursor-pointer text-ds-700">Evidence</summary>
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
            <pre className="mt-3 max-h-24 overflow-auto whitespace-pre-wrap rounded border border-ds-200 bg-paper p-2 text-meta leading-5 text-ds-700 custom-scrollbar">
              {renderJob.stderrTail}
            </pre>
          ) : null}
        </div>
      ) : null}
      <div className="rounded-md border border-ds-200 bg-paper p-2">
        <div className="mb-2 flex items-center justify-between gap-2 text-meta text-ds-600">
          <span>Render command</span>
          {commandPreview.isTruncated ? (
            <button
              type="button"
              className="text-info-700 hover:text-info-800"
              onClick={() => setShowFullCommand((value) => !value)}
            >
              {showFullCommand ? 'Show preview' : 'Show full command'}
            </button>
          ) : null}
        </div>
        <pre
          data-testid="render-command-preview"
          className="max-h-28 overflow-auto whitespace-pre-wrap text-meta leading-5 text-ds-700 custom-scrollbar"
        >
          {showFullCommand ? renderPlan.commandText : commandPreview.text}
        </pre>
        {commandPreview.isTruncated && !showFullCommand ? (
          <div className="mt-1 text-micro text-ds-400">
            {commandPreview.omittedCharacterCount} command characters hidden until expanded.
          </div>
        ) : null}
      </div>
      {renderOutputPath ? (
        <div className="rounded-md border border-accent-500/40 bg-accent-500/10 p-2 text-xs text-accent-800">
          <div data-testid="render-output-path" className="break-all">Rendered file: {renderOutputPath}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {onOpenRenderOutput ? (
              <button
                type="button"
                className="rounded border border-accent-600/40 px-2 py-1 text-meta text-accent-900 hover:bg-accent-500/20"
                onClick={() => void onOpenRenderOutput()}
              >
                Open
              </button>
            ) : null}
            {onRevealRenderOutput ? (
              <button
                type="button"
                className="rounded border border-accent-600/40 px-2 py-1 text-meta text-accent-900 hover:bg-accent-500/20"
                onClick={() => void onRevealRenderOutput()}
              >
                Show in folder
              </button>
            ) : null}
            <a
              href={renderOutputPath}
              className="rounded border border-accent-600/40 px-2 py-1 text-meta text-accent-900 hover:bg-accent-500/20"
              target="_blank"
              rel="noreferrer"
            >
              Open link
            </a>
          </div>
        </div>
      ) : null}
      {renderPlan.warnings.slice(0, 4).map((issue) => (
        <div key={issue} className="rounded-md border border-danger-500/30 bg-danger-500/10 p-2 text-xs text-danger-800">
          {issue}
        </div>
      ))}
    </>
  );
}
