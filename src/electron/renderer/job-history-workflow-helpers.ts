import { resolveComfyUIResultSource } from '../../lib/editor/comfyui-results';
import type { ComfyUIQueueJobView, MediaCacheJobView, RenderJobView, SttJobView } from './editor-view-model';
import { buildRenderDiagnosticView, formatRenderDiagnosticProblem } from './render-diagnostic-view';

export type JobHistoryKind = 'render' | 'media-cache' | 'comfyui' | 'stt';
export type JobHistoryStatus = RenderJobView['status'];

export interface JobHistoryItem {
  id: string;
  kind: JobHistoryKind;
  label: string;
  detail: string;
  status: JobHistoryStatus;
  progress: number;
  priority: number;
  problem?: string;
  action?: string;
  retryable?: boolean;
  active: boolean;
}

export interface JobHistorySummary {
  totalCount: number;
  activeCount: number;
  failedCount: number;
  completedCount: number;
  cancelledCount: number;
  items: JobHistoryItem[];
}

export interface JobHistoryInput {
  renderJobs: RenderJobView[];
  renderJob?: RenderJobView | null;
  mediaCacheJobsByAssetId: Record<string, MediaCacheJobView>;
  comfyUIJob?: ComfyUIQueueJobView | null;
  sttJob?: SttJobView | null;
  limit?: number;
}

const ACTIVE_STATUSES = new Set<JobHistoryStatus>(['queued', 'running']);

export function mergeRenderJobHistory(
  currentJobs: RenderJobView[],
  incomingJobs: RenderJobView | RenderJobView[],
  limit = 100,
): RenderJobView[] {
  const incoming = Array.isArray(incomingJobs) ? incomingJobs : [incomingJobs];
  const byId = new Map<string, RenderJobView>();

  for (const job of incoming) {
    byId.set(job.id, job);
  }

  for (const job of currentJobs) {
    if (!byId.has(job.id)) {
      byId.set(job.id, job);
    }
  }

  return Array.from(byId.values()).slice(0, Math.max(1, limit));
}

export function buildJobHistorySummary(input: JobHistoryInput): JobHistorySummary {
  const renderJobs = mergeRenderJobHistory(input.renderJobs, input.renderJob ? [input.renderJob] : []);
  const items: JobHistoryItem[] = [
    ...renderJobs.map(buildRenderJobItem),
    ...Object.entries(input.mediaCacheJobsByAssetId).map(([assetId, job]) => buildMediaCacheJobItem(assetId, job)),
  ];

  if (input.comfyUIJob) {
    items.push(buildComfyUIJobItem(input.comfyUIJob));
  }

  if (input.sttJob) {
    items.push(buildSttJobItem(input.sttJob));
  }

  const sortedItems = items
    .sort((a, b) => scoreJobHistoryItem(b) - scoreJobHistoryItem(a))
    .slice(0, Math.max(1, input.limit ?? 10));

  return {
    totalCount: items.length,
    activeCount: items.filter((item) => item.active).length,
    failedCount: items.filter((item) => item.status === 'failed').length,
    completedCount: items.filter((item) => item.status === 'completed').length,
    cancelledCount: items.filter((item) => item.status === 'cancelled').length,
    items: sortedItems,
  };
}

function buildRenderJobItem(job: RenderJobView): JobHistoryItem {
  const outputName = job.outputPath ? readFileName(job.outputPath) : job.publicOutputPath ? readFileName(job.publicOutputPath) : job.id.slice(0, 8);
  const diagnosticView = job.diagnostic ? buildRenderDiagnosticView(job.diagnostic) : undefined;

  return {
    id: job.id,
    kind: 'render',
    label: `Render ${outputName}`,
    detail: job.plan?.profile.label ? `${job.plan.profile.label} / P${job.priority}` : `FFmpeg export / P${job.priority}`,
    status: job.status,
    progress: normalizeProgress(job.progress),
    priority: job.priority ?? 0,
    problem: job.diagnostic ? formatRenderDiagnosticProblem(job.diagnostic) : job.error,
    action: diagnosticView?.primaryAction?.label,
    retryable: job.diagnostic?.retryable,
    active: ACTIVE_STATUSES.has(job.status),
  };
}

function buildMediaCacheJobItem(assetId: string, job: MediaCacheJobView): JobHistoryItem {
  return {
    id: job.id,
    kind: 'media-cache',
    label: `Media cache ${assetId}`,
    detail: job.manifest ? `${job.manifest.proxyPath || job.manifest.proxySource ? 'proxy' : 'no proxy'} / ${job.manifest.waveformPeaks?.length ? 'waveform' : 'no waveform'}` : `Proxy and waveform / P${job.priority}`,
    status: job.status,
    progress: normalizeProgress(job.progress),
    priority: job.priority ?? 0,
    problem: job.error ?? job.warnings[0],
    active: ACTIVE_STATUSES.has(job.status),
  };
}

function buildComfyUIJobItem(job: ComfyUIQueueJobView): JobHistoryItem {
  const resultCount = job.results.filter((result) => result.status === 'completed' && resolveComfyUIResultSource(result)).length;

  return {
    id: job.id,
    kind: 'comfyui',
    label: `ComfyUI ${job.modelName}`,
    detail: `${job.completedJobs}/${job.totalJobs} jobs / ${resultCount} results / ${job.execute ? 'execute' : 'prepare'}`,
    status: job.status,
    progress: normalizeProgress(job.progress),
    priority: job.priority ?? 0,
    problem: job.error ?? job.warnings[0],
    active: ACTIVE_STATUSES.has(job.status),
  };
}

function buildSttJobItem(job: SttJobView): JobHistoryItem {
  return {
    id: job.id,
    kind: 'stt',
    label: `STT ${job.engine}`,
    detail: `${job.completedClips}/${job.totalClips} clips / ${job.captions.length} captions / ${job.language}`,
    status: job.status,
    progress: normalizeProgress(job.progress),
    priority: job.priority ?? 0,
    problem: job.error ?? job.warnings[0],
    active: ACTIVE_STATUSES.has(job.status),
  };
}

function scoreJobHistoryItem(item: JobHistoryItem): number {
  const statusScore = item.status === 'running'
    ? 500
    : item.status === 'queued'
      ? 400
      : item.status === 'failed'
        ? 300
        : item.status === 'cancelled'
          ? 200
          : 100;

  return statusScore + item.priority + item.progress / 100;
}

function normalizeProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function readFileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}
