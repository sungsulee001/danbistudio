import type { PreviewRenderParityReport } from '../../lib/editor/preview-render-parity';
import type { SpeakerDiarizationReport } from '../../lib/editor/stt-speaker-diarization';
import type { SttCaptionReviewReport } from '../../lib/editor/stt-caption-review';
import { resolveComfyUIResultSource } from '../../lib/editor/comfyui-results';
import type { ComfyUIQueueJobView, SttJobView } from './editor-view-model';
import { buildVisibleIssueListSummary } from './issue-list-summary';

export interface ComfyUIBatchResultStatus {
  completedResultCount: number;
  hasCompletedResults: boolean;
  hasRenderableEffectPassResults: boolean;
}

export function buildComfyUIBatchResultStatus(job: ComfyUIQueueJobView): ComfyUIBatchResultStatus {
  const completedResultCount = (job.results ?? []).filter((result) => result.status === 'completed' && resolveComfyUIResultSource(result)).length;

  return {
    completedResultCount,
    hasCompletedResults: completedResultCount > 0,
    hasRenderableEffectPassResults: completedResultCount > 0,
  };
}

export function PreviewRenderParityPanel({
  report,
  fps,
}: {
  report: PreviewRenderParityReport;
  fps: number;
}) {
  const matrixMatchedCount = report.featureMatrix.filter((item) => item.status === 'matched').length;
  const matrixWarningCount = report.featureMatrix.filter((item) => item.status === 'warning').length;
  const matrixBlockedCount = report.featureMatrix.filter((item) => item.status === 'blocked').length;
  const issueSummary = buildVisibleIssueListSummary(report.issues, 3, 'parity issue');

  return (
    <>
      <ExportStatusReadout
        label="Preview parity"
        value={`${report.blockedCount} blocked / ${report.warningCount} warnings / ${report.infoCount} info`}
      />
      <ExportStatusReadout
        label="Parity matrix"
        value={`${matrixMatchedCount} matched / ${matrixWarningCount} warnings / ${matrixBlockedCount} blocked`}
      />
      {report.issues.length > 0 ? (
        <div className="space-y-2">
          {issueSummary.visibleItems.map((issue) => (
            <div
              key={issue.id}
              className={`rounded-md border p-2 text-xs ${
                issue.severity === 'blocked'
                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                  : issue.severity === 'warning'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                    : 'border-sky-500/30 bg-sky-500/10 text-sky-100'
              }`}
            >
              <div className="font-medium">{issue.message}</div>
              <div className="mt-1 text-[11px] opacity-80">
                {formatTimecode(issue.time, fps)} / {issue.action}
              </div>
            </div>
          ))}
          {issueSummary.hiddenLabel ? (
            <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-2 text-xs text-zinc-400">
              {issueSummary.hiddenLabel}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function ComfyUIBatchStatusPanel({
  job,
  onCancel,
  onRetry,
  onImportResults,
  onReplaceOriginals,
  onApplyAsAiEffectPass,
}: {
  job: ComfyUIQueueJobView | null;
  onCancel: () => void | Promise<void>;
  onRetry: () => void | Promise<void>;
  onImportResults: () => void;
  onReplaceOriginals: () => void;
  onApplyAsAiEffectPass: () => void;
}) {
  if (!job) {
    return null;
  }

  const {
    completedResultCount,
    hasCompletedResults,
    hasRenderableEffectPassResults,
  } = buildComfyUIBatchResultStatus(job);

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="text-zinc-400">ComfyUI batch</span>
        <span className="text-amber-300">{job.status}</span>
      </div>
      <div className="mb-2 text-[11px] text-zinc-500">
        {job.completedJobs}/{job.totalJobs} jobs / P{job.priority ?? 0} / {job.execute ? 'execute' : 'prepare'}
      </div>
      <div className="mb-2 text-[11px] text-zinc-500">
        {completedResultCount} result files ready
      </div>
      <JobProgressBar value={job.progress} tone="amber" />
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-zinc-500">
        <span>{job.progress}%</span>
        {job.status === 'queued' || job.status === 'running' ? (
          <button type="button" className="text-rose-300 hover:text-rose-200" onClick={() => void onCancel()}>
            Cancel
          </button>
        ) : null}
        {job.status === 'failed' || job.status === 'cancelled' ? (
          <button type="button" className="text-sky-300 hover:text-sky-200" onClick={() => void onRetry()}>
            Retry
          </button>
        ) : null}
        {hasCompletedResults ? (
          <>
            <button type="button" className="text-emerald-300 hover:text-emerald-200" onClick={onImportResults}>
              Import results
            </button>
            <button type="button" className="text-violet-300 hover:text-violet-200" onClick={onReplaceOriginals}>
              Replace originals
            </button>
          </>
        ) : null}
        {hasRenderableEffectPassResults ? (
          <button type="button" className="text-cyan-300 hover:text-cyan-200" onClick={onApplyAsAiEffectPass}>
            AI effect pass
          </button>
        ) : null}
      </div>
      {job.currentClipId ? (
        <div className="mt-2 text-[11px] text-zinc-500">
          Current {job.currentClipId}
        </div>
      ) : null}
      {job.error ? (
        <div className="mt-2 rounded border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">
          {job.error}
        </div>
      ) : null}
      {job.warnings[0] ? (
        <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">
          {job.warnings[0]}
        </div>
      ) : null}
    </div>
  );
}

export function SttJobStatusPanel({
  job,
  onCancel,
  onRetry,
  onImportCaptions,
}: {
  job: SttJobView | null;
  onCancel: () => void | Promise<void>;
  onRetry: () => void | Promise<void>;
  onImportCaptions: () => void;
}) {
  if (!job) {
    return null;
  }

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="text-zinc-400">STT captions</span>
        <span className="text-sky-300">{job.status}</span>
      </div>
      <div className="mb-2 text-[11px] text-zinc-500">
        {job.completedClips}/{job.totalClips} clips / {job.captions.length} captions / {job.engine} / {job.language}
      </div>
      <JobProgressBar value={job.progress} tone="sky" />
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-zinc-500">
        <span>{job.progress}%</span>
        {job.status === 'queued' || job.status === 'running' ? (
          <button type="button" className="text-rose-300 hover:text-rose-200" onClick={() => void onCancel()}>
            Cancel
          </button>
        ) : null}
        {job.status === 'failed' || job.status === 'cancelled' ? (
          <button type="button" className="text-sky-300 hover:text-sky-200" onClick={() => void onRetry()}>
            Retry
          </button>
        ) : null}
        {job.captions.length > 0 ? (
          <button type="button" className="text-emerald-300 hover:text-emerald-200" onClick={onImportCaptions}>
            Import captions
          </button>
        ) : null}
      </div>
      {job.currentClipId ? (
        <div className="mt-2 text-[11px] text-zinc-500">
          Current {job.currentClipId}
        </div>
      ) : null}
      {job.error ? (
        <div className="mt-2 rounded border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">
          {job.error}
        </div>
      ) : null}
      {job.warnings[0] ? (
        <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">
          {job.warnings[0]}
        </div>
      ) : null}
    </div>
  );
}

export function SttReviewStatusPanel({
  review,
  diarization,
  onSelectIssues,
  onCleanStt,
  onDiarizeSpeakers,
}: {
  review: SttCaptionReviewReport;
  diarization: SpeakerDiarizationReport;
  onSelectIssues: () => void;
  onCleanStt: () => void;
  onDiarizeSpeakers: () => void;
}) {
  if (review.captionCount === 0) {
    return null;
  }

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="text-zinc-400">STT review</span>
        <span className={review.issueCount > 0 ? 'text-amber-300' : 'text-emerald-300'}>
          {review.issueCount > 0 ? `${review.issueCount} issues` : 'clean'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-500">
        <span>{review.captionCount} captions</span>
        <span>{review.wordTimedCaptionCount} word-timed</span>
        <span>{review.lowConfidenceCount} low confidence</span>
        <span>{review.readabilityIssueCount} readability</span>
      </div>
      {diarization.captionCount > 0 ? (
        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-zinc-500">
          <span>{diarization.speakerCount} speakers</span>
          <span>{diarization.turnCount} turns</span>
          <span>{diarization.missingSpeakerCount} missing speakers</span>
          <span>{diarization.changedCaptionCount} draft labels</span>
          <span>{diarization.embeddingCaptionCount} embeddings</span>
          <span>{diarization.embeddingAmbiguousCaptionCount + diarization.embeddingLowSimilarityCaptionCount} embedding review</span>
        </div>
      ) : null}
      <div className="mt-2 flex items-center justify-between gap-3 text-xs">
        <button type="button" className="text-sky-300 hover:text-sky-200" onClick={onSelectIssues}>
          Select issues
        </button>
        <button type="button" className="text-emerald-300 hover:text-emerald-200" onClick={onCleanStt}>
          Clean STT
        </button>
        <button type="button" className="text-cyan-300 hover:text-cyan-200" onClick={onDiarizeSpeakers}>
          Diarize
        </button>
      </div>
      {diarization.turns[0] ? (
        <div className="mt-2 rounded border border-cyan-500/20 bg-cyan-500/10 p-2 text-xs text-cyan-100">
          {diarization.turns[0].speaker} / {diarization.turns[0].captionCount} caption{diarization.turns[0].captionCount === 1 ? '' : 's'} / {diarization.turns[0].duration.toFixed(1)}s
        </div>
      ) : null}
      {review.issues[0] ? (
        <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">
          {review.issues[0].message} / {review.issues[0].action}
        </div>
      ) : null}
    </div>
  );
}

function ExportStatusReadout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-800 py-2 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-100">{value}</span>
    </div>
  );
}

function JobProgressBar({ value, tone }: { value: number; tone: 'amber' | 'sky' }) {
  return (
    <div className="h-2 overflow-hidden rounded bg-zinc-800">
      <div
        className={`h-full transition-all ${tone === 'amber' ? 'bg-amber-400' : 'bg-sky-400'}`}
        style={{ width: `${Math.max(0, Math.min(value, 100))}%` }}
      />
    </div>
  );
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
