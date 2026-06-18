import { resolveComfyUIResultSource } from '../../lib/editor/comfyui-results';
import type { SttCaptionCleanupResult, SttCaptionReviewReport } from '../../lib/editor/stt-caption-review';
import type { SpeakerDiarizationApplyResult } from '../../lib/editor/stt-speaker-diarization';
import type { EditorProject, TimelineClip } from '../../lib/editor/types';
import type { ComfyUIQueueJobView, SttJobView } from './editor-view-model';

type QueueJobStatus = ComfyUIQueueJobView['status'] | SttJobView['status'];

export interface QueueStartState {
  status: string;
}

export interface ComfyUIQueueStartState extends QueueStartState {
  isQueueingComfyUI: true;
}

export interface ComfyUIQueueFailureState extends QueueStartState {
  isQueueingComfyUI: false;
}

export interface ComfyUIQueueJobState {
  job: ComfyUIQueueJobView;
  isQueueingComfyUI: boolean;
  status?: string;
}

export interface ComfyUIResultActionPlan {
  canApply: boolean;
  results: ComfyUIQueueJobView['results'];
  resultCount: number;
  commitLabel?: string;
  status?: string;
}

export interface ComfyUIClipCommandPlan {
  canCommit: boolean;
  clipId?: string;
  commitLabel?: string;
  status: string;
}

export interface ComfyUIPresetChangePlan extends ComfyUIClipCommandPlan {
  presetId?: string;
}

export interface SttQueueStartState extends QueueStartState {
  isRunningStt: true;
}

export interface SttQueueFailureState extends QueueStartState {
  isRunningStt: false;
}

export interface SttQueueJobState {
  job: SttJobView;
  isRunningStt: boolean;
  status?: string;
}

export interface SttImportCaptionPlan {
  canImport: boolean;
  captions: SttJobView['captions'];
  selectedCaptionIds: string[];
  commitLabel?: string;
  status?: string;
}

export interface SttIssueSelectionPlan {
  canSelect: boolean;
  selectedCaptionIds: string[];
  playhead?: number;
  status: string;
}

export interface SttCleanupReadiness {
  canClean: boolean;
  status?: string;
}

export interface SttCleanupResultState {
  selectedCaptionIds: string[];
  status: string;
}

export interface SpeakerDiarizationPlan {
  canApply: boolean;
  includeNonStt: boolean;
  targetCaptionIds?: string[];
  status?: string;
}

export interface SpeakerDiarizationResultState {
  selectedCaptionIds: string[];
  playhead?: number;
  status: string;
}

export function isQueueJobActive(status: QueueJobStatus): boolean {
  return status === 'queued' || status === 'running';
}

export function shouldPollComfyUIJob(
  job: ComfyUIQueueJobView | null | undefined,
): job is ComfyUIQueueJobView {
  return Boolean(job && isQueueJobActive(job.status));
}

export function shouldPollSttJob(
  job: SttJobView | null | undefined,
): job is SttJobView {
  return Boolean(job && isQueueJobActive(job.status));
}

export function resolveComfyUIQueueStartState(): ComfyUIQueueStartState {
  return {
    isQueueingComfyUI: true,
    status: 'Queueing ComfyUI batch...',
  };
}

export function resolveComfyUIRetryStartState(): ComfyUIQueueStartState {
  return {
    isQueueingComfyUI: true,
    status: 'Retrying ComfyUI batch...',
  };
}

export function resolveQueuedComfyUIJobState(job: ComfyUIQueueJobView): ComfyUIQueueJobState {
  return {
    job,
    isQueueingComfyUI: isQueueJobActive(job.status),
    status: job.status === 'completed'
      ? formatComfyUIBatchPreparedStatus(job)
      : formatComfyUIBatchQueuedStatus(job, 'batch'),
  };
}

export function resolveRetriedComfyUIJobState(job: ComfyUIQueueJobView): ComfyUIQueueJobState {
  return {
    job,
    isQueueingComfyUI: isQueueJobActive(job.status),
    status: job.status === 'completed'
      ? formatComfyUIBatchPreparedStatus(job)
      : formatComfyUIBatchQueuedStatus(job, 'retry'),
  };
}

export function resolveCancelledComfyUIJobState(job: ComfyUIQueueJobView): ComfyUIQueueJobState {
  return {
    job,
    isQueueingComfyUI: false,
    status: 'ComfyUI batch cancelled',
  };
}

export function resolveComfyUIQueueFailureState(error: unknown): ComfyUIQueueFailureState {
  return {
    isQueueingComfyUI: false,
    status: formatQueueFailureMessage(error),
  };
}

export function resolvePolledComfyUIJobState(job: ComfyUIQueueJobView): ComfyUIQueueJobState {
  if (job.status === 'completed') {
    return {
      job,
      isQueueingComfyUI: false,
      status: formatComfyUIBatchPreparedStatus(job),
    };
  }

  if (job.status === 'failed') {
    return {
      job,
      isQueueingComfyUI: false,
      status: job.error || 'ComfyUI batch failed',
    };
  }

  if (job.status === 'cancelled') {
    return resolveCancelledComfyUIJobState(job);
  }

  return {
    job,
    isQueueingComfyUI: isQueueJobActive(job.status),
  };
}

export function resolveComfyUIResultActionPlan(
  job: ComfyUIQueueJobView | null,
  mode: 'import' | 'replace' | 'effect-pass',
): ComfyUIResultActionPlan {
  if (!job) {
    return {
      canApply: false,
      results: [],
      resultCount: 0,
    };
  }

  const results = filterCompletedComfyUIResults(job.results ?? []);
  const resultCount = results.length;
  if (resultCount === 0) {
    return {
      canApply: false,
      results,
      resultCount,
      status: formatEmptyComfyUIResultActionStatus(mode),
    };
  }

  return {
    canApply: true,
    results,
    resultCount,
    commitLabel: formatComfyUIResultActionCommitLabel(mode),
    status: formatComfyUIResultActionStatus(mode, resultCount),
  };
}

export function resolveComfyUIBindingPatchPlan(selectedClip?: TimelineClip | null): ComfyUIClipCommandPlan {
  if (!selectedClip) {
    return {
      canCommit: false,
      status: 'Select a clip first',
    };
  }

  return {
    canCommit: true,
    clipId: selectedClip.id,
    commitLabel: 'ComfyUI binding updated',
    status: `ComfyUI binding updated for ${selectedClip.name}`,
  };
}

export function resolveComfyUIPresetChangePlan({
  selectedClip,
  presetId,
  presetLabel,
}: {
  selectedClip?: TimelineClip | null;
  presetId: string;
  presetLabel?: string;
}): ComfyUIPresetChangePlan {
  if (!selectedClip) {
    return {
      canCommit: false,
      status: 'Select a clip first',
    };
  }

  return {
    canCommit: true,
    clipId: selectedClip.id,
    presetId,
    commitLabel: 'ComfyUI workflow preset applied',
    status: `ComfyUI preset ${presetLabel ?? presetId} applied to ${selectedClip.name}`,
  };
}

export function resolveSttQueueStartState(): SttQueueStartState {
  return {
    isRunningStt: true,
    status: 'Queueing STT captions...',
  };
}

export function resolveSttRetryStartState(): SttQueueStartState {
  return {
    isRunningStt: true,
    status: 'Retrying STT...',
  };
}

export function resolveQueuedSttJobState(job: SttJobView): SttQueueJobState {
  return {
    job,
    isRunningStt: isQueueJobActive(job.status),
    status: `STT queued ${formatCount(job.totalClips, 'clip')}`,
  };
}

export function resolveRetriedSttJobState(job: SttJobView): SttQueueJobState {
  return {
    job,
    isRunningStt: isQueueJobActive(job.status),
    status: `STT retry queued ${formatCount(job.totalClips, 'clip')}`,
  };
}

export function resolveCancelledSttJobState(job: SttJobView): SttQueueJobState {
  return {
    job,
    isRunningStt: false,
    status: 'STT cancelled',
  };
}

export function resolveSttQueueFailureState(error: unknown): SttQueueFailureState {
  return {
    isRunningStt: false,
    status: formatQueueFailureMessage(error),
  };
}

export function resolvePolledSttJobState(job: SttJobView): SttQueueJobState {
  if (job.status === 'completed') {
    return {
      job,
      isRunningStt: false,
      status: `STT captions ready ${job.captions.length}`,
    };
  }

  if (job.status === 'failed') {
    return {
      job,
      isRunningStt: false,
      status: job.error || 'STT failed',
    };
  }

  if (job.status === 'cancelled') {
    return resolveCancelledSttJobState(job);
  }

  return {
    job,
    isRunningStt: isQueueJobActive(job.status),
  };
}

export function resolveSttImportCaptionPlan(job: SttJobView | null): SttImportCaptionPlan {
  if (!job || job.captions.length === 0) {
    return {
      canImport: false,
      captions: [],
      selectedCaptionIds: [],
      status: 'No STT captions to import yet',
    };
  }

  return {
    canImport: true,
    captions: job.captions,
    selectedCaptionIds: job.captions.map((caption) => caption.id),
    commitLabel: 'STT captions imported',
    status: `Imported ${formatCount(job.captions.length, 'STT caption')}`,
  };
}

export function resolveSttIssueSelectionPlan({
  project,
  review,
}: {
  project: EditorProject;
  review: SttCaptionReviewReport;
}): SttIssueSelectionPlan {
  const selectedCaptionIds = Array.from(new Set(review.issues.map((issue) => issue.captionId)));
  if (selectedCaptionIds.length === 0) {
    return {
      canSelect: false,
      selectedCaptionIds: [],
      status: 'No STT caption issues',
    };
  }

  const firstCaption = project.captions.find((caption) => caption.id === selectedCaptionIds[0]);

  return {
    canSelect: true,
    selectedCaptionIds,
    playhead: firstCaption?.start,
    status: `Selected ${formatCount(selectedCaptionIds.length, 'STT caption issue')}`,
  };
}

export function resolveSttCleanupReadiness(review: SttCaptionReviewReport): SttCleanupReadiness {
  return review.captionCount === 0
    ? { canClean: false, status: 'No STT captions to clean' }
    : { canClean: true };
}

export function resolveSttCleanupResultState(result: SttCaptionCleanupResult): SttCleanupResultState {
  return {
    selectedCaptionIds: result.selectedCaptionIds,
    status: `Cleaned STT captions: ${result.changedCaptionCount} changed / ${result.mergedCaptionCount} merged`,
  };
}

export function resolveSpeakerDiarizationPlan({
  project,
  selectedCaptionIds,
  review,
}: {
  project: EditorProject;
  selectedCaptionIds: string[];
  review: SttCaptionReviewReport;
}): SpeakerDiarizationPlan {
  if (project.captions.length === 0) {
    return {
      canApply: false,
      includeNonStt: false,
      status: 'No captions to diarize',
    };
  }

  return {
    canApply: true,
    includeNonStt: selectedCaptionIds.length > 0 || review.captionCount === 0,
    targetCaptionIds: selectedCaptionIds.length > 0 ? selectedCaptionIds : undefined,
  };
}

export function resolveSpeakerDiarizationResultState({
  result,
  committed,
}: {
  result: SpeakerDiarizationApplyResult;
  committed: boolean;
}): SpeakerDiarizationResultState {
  const selectedCaptionIds = result.selectedCaptionIds.length > 0
    ? result.selectedCaptionIds
    : result.report.targetCaptionIds;
  const firstCaption = result.project.captions.find((caption) => caption.id === selectedCaptionIds[0]);

  return {
    selectedCaptionIds,
    playhead: firstCaption?.start,
    status: committed
      ? `Diarized ${formatCount(result.changedCaptionIds.length, 'caption')} / ${formatCount(result.report.speakerCount, 'speaker')}`
      : `Speaker diarization ready: ${formatCount(result.report.speakerCount, 'speaker')} / ${formatCount(result.report.turnCount, 'turn')}`,
  };
}

export function resolveSpeakerDiarizationFailureStatus(error: unknown): string {
  return `Speaker diarization failed: ${formatQueueFailureMessage(error)}`;
}

function formatComfyUIBatchPreparedStatus(job: ComfyUIQueueJobView): string {
  return `ComfyUI batch prepared ${job.completedJobs}/${job.totalJobs}`;
}

function formatComfyUIBatchQueuedStatus(job: ComfyUIQueueJobView, label: 'batch' | 'retry'): string {
  return `ComfyUI ${label} queued ${formatCount(job.totalJobs, 'job')}`;
}

function filterCompletedComfyUIResults(
  results: ComfyUIQueueJobView['results'],
): ComfyUIQueueJobView['results'] {
  return results.filter((result) => (
    result.status === 'completed' && Boolean(resolveComfyUIResultSource(result))
  ));
}

function formatEmptyComfyUIResultActionStatus(mode: 'import' | 'replace' | 'effect-pass'): string {
  switch (mode) {
    case 'import':
      return 'No ComfyUI result files to import yet';
    case 'replace':
      return 'No ComfyUI result files to replace with yet';
    case 'effect-pass':
      return 'No ComfyUI result files to apply as AI effect passes yet';
    default:
      return 'No ComfyUI result files ready yet';
  }
}

function formatComfyUIResultActionCommitLabel(mode: 'import' | 'replace' | 'effect-pass'): string {
  switch (mode) {
    case 'import':
      return 'ComfyUI results added to AI Results track';
    case 'replace':
      return 'ComfyUI results replaced original clips';
    case 'effect-pass':
      return 'ComfyUI results applied as AI effect passes';
    default:
      return 'ComfyUI results applied';
  }
}

function formatComfyUIResultActionStatus(mode: 'import' | 'replace' | 'effect-pass', resultCount: number): string {
  switch (mode) {
    case 'import':
      return `Imported ${formatCount(resultCount, 'ComfyUI result')} to AI Results`;
    case 'replace':
      return `Replaced ${formatCount(resultCount, 'original clip')} with ComfyUI results`;
    case 'effect-pass':
      return `Applied ${formatCount(resultCount, 'ComfyUI result')} as AI effect passes`;
    default:
      return `Applied ${formatCount(resultCount, 'ComfyUI result')}`;
  }
}

function formatQueueFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}
