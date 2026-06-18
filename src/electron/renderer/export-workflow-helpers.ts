import { buildExportManifest } from '../../lib/editor/automation';
import type { CaptionSidecarOptions } from '../../lib/editor/caption-sidecar';
import { buildFfmpegRenderPlan, type FfmpegRenderPlan } from '../../lib/editor/ffmpeg-renderer';
import type { MarkerInterchangeFormat } from '../../lib/editor/marker-interchange';
import { resolveMasterAudioSettings, type MasterAudioSettings } from '../../lib/editor/master-audio';
import { buildMediaCacheBatchPlan, type MediaCacheBatchPlan } from '../../lib/editor/media-cache-targets';
import { createDefaultEditorProject, DEFAULT_EXPORT_PROFILE_ID } from '../../lib/editor/project';
import { buildBatchRenderOutputFilename } from '../../lib/editor/render-output';
import { buildRenderPreflightReport, type RenderPreflightReport } from '../../lib/editor/render-preflight';
import type { EditorAsset, EditorProject, ExportManifest, ExportProfile } from '../../lib/editor/types';
import type { RenderJobView } from './editor-view-model';

export type ExportRangeRequest = { start: number; end: number } | undefined;
export type MarkedExportRange = { start: number; end: number } | null;
export type ExportRangeMode = 'timeline' | 'marked';

const RENDERER_COMMAND_PREVIEW_FFMPEG_PATH = 'ffmpeg';

export interface ActiveExportProfileState {
  activeExportProfileId: string;
  selectedExportProfile?: ExportProfile;
}

export interface ActiveExportRangeState {
  activeExportRange: MarkedExportRange;
  exportRangeRequest: ExportRangeRequest;
}

export interface ExportPreflightState {
  renderPreflight: RenderPreflightReport;
  preflightRenderPlan?: FfmpegRenderPlan;
  renderBlockedByPreflight: boolean;
}

export interface ExportWorkspaceState extends ActiveExportProfileState, ActiveExportRangeState, ExportPreflightState {
  masterAudioSettings: MasterAudioSettings;
  previewRenderParity: RenderPreflightReport['previewRenderParity'];
  preflightMediaCachePlan: MediaCacheBatchPlan;
}

export interface ExportDraft {
  manifest: ExportManifest;
  plan: FfmpegRenderPlan;
  preflight: RenderPreflightReport;
  status: string;
}

export interface ExportPlanSyncState {
  activeExportProfileId: string;
  selectedExportProfileId: string;
  shouldUpdateSelectedExportProfile: boolean;
  manifest: ExportManifest;
  plan: FfmpegRenderPlan;
}

export function buildInitialExportPlanSyncState(): ExportPlanSyncState {
  return resolveExportPlanSyncState({
    project: createDefaultEditorProject(),
    selectedExportProfileId: DEFAULT_EXPORT_PROFILE_ID,
    exportRange: undefined,
  });
}

export interface RenderQueuePreflightPlan {
  canQueue: boolean;
  preflight: RenderPreflightReport;
  status?: string;
}

export interface RenderBatchQueueStartState {
  isRendering: true;
  status: string;
}

export interface ImmediateRenderRequestPlan {
  project: EditorProject;
  profileId: string;
  outputPath?: string;
  encoderPreference: 'auto';
  exportRange: ExportRangeRequest;
}

export interface ServerRenderPlanRequestPlan {
  project: EditorProject;
  profileId: string;
  encoderPreference: 'auto';
  exportRange: ExportRangeRequest;
}

export interface CaptionSidecarDownloadRequestPlan {
  project: EditorProject;
  format: 'srt' | 'vtt';
  options: Required<CaptionSidecarOptions>;
  exportRange: ExportRangeRequest;
}

export interface EdlDownloadRequestPlan {
  project: EditorProject;
  title: string;
  exportRange: ExportRangeRequest;
}

export interface FcpxmlDownloadRequestPlan {
  project: EditorProject;
  title: string;
  exportRange: ExportRangeRequest;
}

export interface MarkerInterchangeDownloadRequestPlan {
  project: EditorProject;
  format: MarkerInterchangeFormat;
  exportRange: ExportRangeRequest;
}

export type RenderQueueRequestPlan =
  | {
    canQueue: false;
    preflight: RenderPreflightReport;
    isRendering: false;
    status: string;
  }
  | {
    canQueue: true;
    preflight: RenderPreflightReport;
    request: {
      project: EditorProject;
      profileId: string;
      outputPath?: string;
      priority: number;
      encoderPreference: 'auto';
      exportRange: ExportRangeRequest;
    };
  };

export type RenderBatchQueueRequestPlan =
  | {
    canQueue: false;
    isRendering: false;
    preflights: RenderPreflightReport[];
    status: string;
  }
  | {
    canQueue: true;
    preflights: RenderPreflightReport[];
    requests: Array<{
      project: EditorProject;
      profileId: string;
      outputFilename: string;
      priority: number;
      encoderPreference: 'auto';
      exportRange: ExportRangeRequest;
    }>;
    status: string;
  };

export interface RenderBatchJobWorkflowState {
  renderJob: RenderJobView | null;
  renderPlan?: FfmpegRenderPlan;
  renderOutputPath: string | null;
  status: string;
}

export interface RenderJobWorkflowState {
  renderJob: RenderJobView;
  renderPlan?: FfmpegRenderPlan;
  renderOutputPath: string | null;
  status: string;
}

export interface RenderPollingWorkflowState {
  isRendering: boolean;
  renderOutputPath?: string | null;
  status?: string;
}

export interface RenderJobPollingWorkflowState extends RenderPollingWorkflowState {
  renderJob: RenderJobView;
}

export interface RenderCancellationWorkflowState {
  renderJob: RenderJobView;
  isRendering: false;
  status: string;
}

export interface RenderStartWorkflowState {
  isRendering: boolean;
  status: string;
}

export interface ImmediateRenderCompletionState {
  isRendering: false;
  renderOutputPath: string;
  renderPlan: FfmpegRenderPlan;
  status: string;
}

export interface RenderFailureState {
  isRendering: false;
  status: string;
}

export interface ServerRenderPlanState {
  renderPlan?: FfmpegRenderPlan;
}

export function resolveActiveExportProfile(
  project: EditorProject,
  selectedExportProfileId: string,
): ActiveExportProfileState {
  const activeExportProfileId = project.exportProfiles.some((profile) => profile.id === selectedExportProfileId)
    ? selectedExportProfileId
    : project.exportProfiles[0]?.id ?? DEFAULT_EXPORT_PROFILE_ID;

  return {
    activeExportProfileId,
    selectedExportProfile: project.exportProfiles.find((profile) => profile.id === activeExportProfileId) ?? project.exportProfiles[0],
  };
}

export function resolveBatchExportProfileIds(
  project: EditorProject,
  selectedProfileIds: string[],
  activeExportProfileId: string,
): string[] {
  const validIds = new Set(project.exportProfiles.map((profile) => profile.id));
  const selectedIds = selectedProfileIds.filter((profileId, index, ids) => (
    validIds.has(profileId) && ids.indexOf(profileId) === index
  ));

  if (selectedIds.length > 0) {
    return selectedIds;
  }

  if (validIds.has(activeExportProfileId)) {
    return [activeExportProfileId];
  }

  return project.exportProfiles[0] ? [project.exportProfiles[0].id] : [];
}

export function resolveBatchExportProfileToggle({
  project,
  selectedProfileIds,
  activeExportProfileId,
  toggledProfileId,
}: {
  project: EditorProject;
  selectedProfileIds: string[];
  activeExportProfileId: string;
  toggledProfileId: string;
}): string[] {
  const current = resolveBatchExportProfileIds(project, selectedProfileIds, activeExportProfileId);
  const hasProfile = current.includes(toggledProfileId);

  if (hasProfile && current.length > 1) {
    return current.filter((profileId) => profileId !== toggledProfileId);
  }

  if (hasProfile) {
    return current;
  }

  const validProfile = project.exportProfiles.some((profile) => profile.id === toggledProfileId);
  return validProfile ? [...current, toggledProfileId] : current;
}

export function resolveActiveExportRange(
  exportRangeMode: ExportRangeMode,
  markedRange: MarkedExportRange,
): ActiveExportRangeState {
  const activeExportRange = exportRangeMode === 'marked' ? markedRange : null;

  return {
    activeExportRange,
    exportRangeRequest: activeExportRange
      ? { start: activeExportRange.start, end: activeExportRange.end }
      : undefined,
  };
}

export function resolveValidatedExportRangeMode({
  exportRangeMode,
  markedRange,
}: {
  exportRangeMode: ExportRangeMode;
  markedRange: MarkedExportRange;
}): ExportRangeMode {
  return exportRangeMode === 'marked' && !markedRange ? 'timeline' : exportRangeMode;
}

export function resolveExportPlanSyncState({
  project,
  selectedExportProfileId,
  exportRange,
}: {
  project: EditorProject;
  selectedExportProfileId: string;
  exportRange: ExportRangeRequest;
}): ExportPlanSyncState {
  const { activeExportProfileId } = resolveActiveExportProfile(project, selectedExportProfileId);

  return {
    activeExportProfileId,
    selectedExportProfileId: activeExportProfileId,
    shouldUpdateSelectedExportProfile: activeExportProfileId !== selectedExportProfileId,
    manifest: buildExportManifest(project, activeExportProfileId, { exportRange }),
    plan: buildFfmpegRenderPlan(project, activeExportProfileId, undefined, {
      exportRange,
      ffmpegPath: RENDERER_COMMAND_PREVIEW_FFMPEG_PATH,
    }),
  };
}

export function renderPlanMatchesExportRequest(
  renderPlan: FfmpegRenderPlan,
  profileId: string,
  exportRange: ExportRangeRequest,
): boolean {
  if (renderPlan.profile.id !== profileId) {
    return false;
  }

  return exportRange
    ? Math.abs((renderPlan.exportRange?.start ?? -1) - exportRange.start) < 0.001 &&
      Math.abs((renderPlan.exportRange?.end ?? -1) - exportRange.end) < 0.001
    : !renderPlan.exportRange;
}

export function buildExportPreflightState({
  project,
  profileId,
  exportRange,
  playhead,
  renderPlan,
}: {
  project: EditorProject;
  profileId: string;
  exportRange: ExportRangeRequest;
  playhead: number;
  renderPlan: FfmpegRenderPlan;
}): ExportPreflightState {
  const preflightRenderPlan = renderPlanMatchesExportRequest(renderPlan, profileId, exportRange)
    ? renderPlan
    : undefined;
  const renderPreflight = buildRenderPreflightReport(project, profileId, {
    exportRange,
    playhead,
    plan: preflightRenderPlan,
  });

  return {
    renderPreflight,
    preflightRenderPlan,
    renderBlockedByPreflight: renderPreflight.blockedCount > 0,
  };
}

export function resolvePreflightCacheAssetIds(report: RenderPreflightReport): string[] {
  return Array.from(new Set(report.issues
    .filter((issue) => issue.actionKind === 'cache' && issue.assetId)
    .map((issue) => issue.assetId!)));
}

export function buildPreflightMediaCachePlan({
  assets,
  renderPreflight,
  activeJobAssetIds,
}: {
  assets: EditorAsset[];
  renderPreflight: RenderPreflightReport;
  activeJobAssetIds: Iterable<string>;
}): MediaCacheBatchPlan {
  return buildMediaCacheBatchPlan(assets, {
    targetAssetIds: resolvePreflightCacheAssetIds(renderPreflight),
    activeJobAssetIds,
  });
}

export function resolveExportWorkspaceState({
  project,
  selectedExportProfileId,
  exportRangeMode,
  markedRange,
  playhead,
  renderPlan,
  activeCacheJobAssetIds,
}: {
  project: EditorProject;
  selectedExportProfileId: string;
  exportRangeMode: ExportRangeMode;
  markedRange: MarkedExportRange;
  playhead: number;
  renderPlan: FfmpegRenderPlan;
  activeCacheJobAssetIds: Iterable<string>;
}): ExportWorkspaceState {
  const activeProfile = resolveActiveExportProfile(project, selectedExportProfileId);
  const activeRange = resolveActiveExportRange(exportRangeMode, markedRange);
  const preflight = buildExportPreflightState({
    project,
    profileId: activeProfile.activeExportProfileId,
    exportRange: activeRange.exportRangeRequest,
    playhead,
    renderPlan,
  });

  return {
    ...activeProfile,
    ...activeRange,
    ...preflight,
    masterAudioSettings: resolveMasterAudioSettings(project),
    previewRenderParity: preflight.renderPreflight.previewRenderParity,
    preflightMediaCachePlan: buildPreflightMediaCachePlan({
      assets: project.assets,
      renderPreflight: preflight.renderPreflight,
      activeJobAssetIds: activeCacheJobAssetIds,
    }),
  };
}

export function buildExportDraft({
  project,
  profileId,
  exportRange,
  playhead,
}: {
  project: EditorProject;
  profileId: string;
  exportRange: ExportRangeRequest;
  playhead: number;
}): ExportDraft {
  const manifest = buildExportManifest(project, profileId, { exportRange });
  const plan = buildFfmpegRenderPlan(project, profileId, undefined, { exportRange });
  const preflight = buildRenderPreflightReport(project, profileId, {
    exportRange,
    playhead,
    plan,
  });

  return {
    manifest,
    plan,
    preflight,
    status: `${plan.inputs.length} FFmpeg inputs prepared for ${manifest.profile.label}${manifest.exportRange ? ` / ${manifest.exportRange.duration.toFixed(2)}s range` : ''} / preflight ${preflight.status}`,
  };
}

export function resolveRenderQueueStartState(): RenderStartWorkflowState {
  return {
    isRendering: true,
    status: 'Queueing FFmpeg render...',
  };
}

export function resolveRenderBatchQueueStartState(profileCount: number): RenderBatchQueueStartState {
  return {
    isRendering: true,
    status: `Queueing ${Math.max(0, profileCount)} FFmpeg render jobs...`,
  };
}

export function resolveRenderRetryStartState(): RenderStartWorkflowState {
  return {
    isRendering: true,
    status: 'Retrying FFmpeg render...',
  };
}

export function resolveImmediateRenderStartState(): RenderStartWorkflowState {
  return {
    isRendering: true,
    status: 'Rendering with FFmpeg...',
  };
}

export function resolveImmediateRenderRequestPlan({
  project,
  profileId,
  exportRange,
  outputPath,
}: {
  project: EditorProject;
  profileId: string;
  exportRange: ExportRangeRequest;
  outputPath?: string;
}): ImmediateRenderRequestPlan {
  return {
    project,
    profileId,
    ...(outputPath ? { outputPath } : {}),
    encoderPreference: 'auto',
    exportRange,
  };
}

export function resolveServerRenderPlanRequestPlan({
  project,
  profileId,
  exportRange,
}: {
  project: EditorProject;
  profileId: string;
  exportRange: ExportRangeRequest;
}): ServerRenderPlanRequestPlan {
  return {
    project,
    profileId,
    encoderPreference: 'auto',
    exportRange,
  };
}

export function resolveCaptionSidecarDownloadRequestPlan({
  project,
  format,
  options,
  exportRange,
}: {
  project: EditorProject;
  format: 'srt' | 'vtt';
  options: Required<CaptionSidecarOptions>;
  exportRange: ExportRangeRequest;
}): CaptionSidecarDownloadRequestPlan {
  return {
    project,
    format,
    options,
    exportRange,
  };
}

export function resolveEdlDownloadRequestPlan({
  project,
  exportRange,
}: {
  project: EditorProject;
  exportRange: ExportRangeRequest;
}): EdlDownloadRequestPlan {
  return {
    project,
    title: project.name,
    exportRange,
  };
}

export function resolveFcpxmlDownloadRequestPlan({
  project,
  exportRange,
}: {
  project: EditorProject;
  exportRange: ExportRangeRequest;
}): FcpxmlDownloadRequestPlan {
  return {
    project,
    title: project.name,
    exportRange,
  };
}

export function resolveMarkerInterchangeDownloadRequestPlan({
  project,
  format,
  exportRange,
}: {
  project: EditorProject;
  format: MarkerInterchangeFormat;
  exportRange: ExportRangeRequest;
}): MarkerInterchangeDownloadRequestPlan {
  return {
    project,
    format,
    exportRange,
  };
}

export function resolveRenderQueuePreflightPlan({
  project,
  profileId,
  exportRange,
  playhead,
  outputPath,
}: {
  project: EditorProject;
  profileId: string;
  exportRange: ExportRangeRequest;
  playhead: number;
  outputPath?: string;
}): RenderQueuePreflightPlan {
  const preflight = buildRenderPreflightReport(project, profileId, {
    exportRange,
    outputPath,
    playhead,
  });
  const blockingIssue = preflight.issues.find((issue) => issue.severity === 'blocked');

  return {
    canQueue: !blockingIssue,
    preflight,
    status: blockingIssue ? `Preflight blocked: ${blockingIssue.message}` : undefined,
  };
}

export function resolveRenderQueueRequestPlan({
  project,
  profileId,
  exportRange,
  playhead,
  priority,
  outputPath,
}: {
  project: EditorProject;
  profileId: string;
  exportRange: ExportRangeRequest;
  playhead: number;
  priority: number;
  outputPath?: string;
}): RenderQueueRequestPlan {
  const preflightPlan = resolveRenderQueuePreflightPlan({
    project,
    profileId,
    exportRange,
    playhead,
    outputPath,
  });

  if (!preflightPlan.canQueue) {
    return {
      canQueue: false,
      preflight: preflightPlan.preflight,
      isRendering: false,
      status: preflightPlan.status ?? 'Preflight blocked',
    };
  }

  return {
    canQueue: true,
    preflight: preflightPlan.preflight,
    request: {
      project,
      profileId,
      ...(outputPath ? { outputPath } : {}),
      priority,
      encoderPreference: 'auto',
      exportRange,
    },
  };
}

export function resolveRenderBatchQueueRequestPlan({
  project,
  profileIds,
  exportRange,
  playhead,
  priority,
  batchId = Date.now(),
}: {
  project: EditorProject;
  profileIds: string[];
  exportRange: ExportRangeRequest;
  playhead: number;
  priority: number;
  batchId?: number | string;
}): RenderBatchQueueRequestPlan {
  const validProfileIds = resolveBatchExportProfileIds(
    project,
    profileIds,
    project.exportProfiles[0]?.id ?? DEFAULT_EXPORT_PROFILE_ID,
  );

  if (validProfileIds.length === 0) {
    return {
      canQueue: false,
      isRendering: false,
      preflights: [],
      status: 'Batch render blocked: no export profiles available.',
    };
  }

  const preflights = validProfileIds.map((profileId) => buildRenderPreflightReport(project, profileId, {
    exportRange,
    playhead,
  }));
  const blockedIndex = preflights.findIndex((preflight) => preflight.blockedCount > 0);

  if (blockedIndex >= 0) {
    const profile = project.exportProfiles.find((item) => item.id === validProfileIds[blockedIndex]);
    const issue = preflights[blockedIndex].issues.find((candidate) => candidate.severity === 'blocked');

    return {
      canQueue: false,
      isRendering: false,
      preflights,
      status: `Batch render blocked${profile ? ` for ${profile.label}` : ''}: ${issue?.message ?? 'preflight failed'}`,
    };
  }

  return {
    canQueue: true,
    preflights,
    requests: validProfileIds.map((profileId) => ({
      project,
      profileId,
      outputFilename: buildBatchRenderOutputFilename(project, profileId, batchId),
      priority,
      encoderPreference: 'auto',
      exportRange,
    })),
    status: `Queued ${validProfileIds.length} export profile${validProfileIds.length === 1 ? '' : 's'}`,
  };
}

export function resolveQueuedRenderJobState(job: RenderJobView): RenderJobWorkflowState {
  return {
    renderJob: job,
    renderPlan: job.plan,
    renderOutputPath: job.publicOutputPath ?? job.outputPath ?? null,
    status: 'Render job queued',
  };
}

export function resolveQueuedRenderBatchState(jobs: RenderJobView[]): RenderBatchJobWorkflowState {
  const firstJob = jobs[0] ?? null;
  const outputPaths = jobs
    .map((job) => job.publicOutputPath ?? job.outputPath)
    .filter((path): path is string => Boolean(path));

  return {
    renderJob: firstJob,
    renderPlan: firstJob?.plan,
    renderOutputPath: outputPaths[0] ?? null,
    status: `Queued ${jobs.length} render job${jobs.length === 1 ? '' : 's'}${outputPaths.length > 0 ? `: ${outputPaths.join(', ')}` : ''}`,
  };
}

export function resolveRetriedRenderJobState(job: RenderJobView): RenderJobWorkflowState {
  return {
    renderJob: job,
    renderPlan: job.plan,
    renderOutputPath: job.publicOutputPath ?? job.outputPath ?? null,
    status: 'Render retry queued',
  };
}

export function resolveCancelledRenderJobState(job: RenderJobView): RenderCancellationWorkflowState {
  return {
    renderJob: job,
    isRendering: false,
    status: 'Render cancelled',
  };
}

export function resolvePolledRenderJobState(job: RenderJobView): RenderPollingWorkflowState {
  const isRendering = job.status === 'queued' || job.status === 'running';

  if (job.status === 'completed') {
    return {
      isRendering,
      renderOutputPath: job.publicOutputPath ?? job.outputPath ?? null,
      status: 'Render completed',
    };
  }

  if (job.status === 'failed') {
    return {
      isRendering,
      status: job.error || 'Render failed',
    };
  }

  if (job.status === 'cancelled') {
    return {
      isRendering,
      status: 'Render cancelled',
    };
  }

  return { isRendering };
}

export function resolveRenderJobPollingWorkflowState(job: RenderJobView): RenderJobPollingWorkflowState {
  return {
    renderJob: job,
    ...resolvePolledRenderJobState(job),
  };
}

export function shouldPollRenderJob(job: RenderJobView | null | undefined): job is RenderJobView {
  return Boolean(job && (job.status === 'queued' || job.status === 'running'));
}

export function resolveImmediateRenderCompletedState(result: {
  outputPath: string;
  plan: FfmpegRenderPlan;
}): ImmediateRenderCompletionState {
  return {
    isRendering: false,
    renderOutputPath: result.outputPath,
    renderPlan: result.plan,
    status: 'Render completed',
  };
}

export function resolveServerRenderPlanState(plan: FfmpegRenderPlan | null | undefined): ServerRenderPlanState {
  return plan ? { renderPlan: plan } : {};
}

export function resolveRenderFailureState(error: unknown): RenderFailureState {
  return {
    isRendering: false,
    status: error instanceof Error ? error.message : String(error),
  };
}

export function formatCaptionSidecarDownloadStatus(captionCount: number, format: 'srt' | 'vtt'): string {
  return `Downloaded ${captionCount} ${format.toUpperCase()} captions`;
}

export function formatCaptionSidecarFailureStatus(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Caption export failed: ${message}`;
}

export function formatEdlDownloadStatus(eventCount: number, warningCount = 0): string {
  const warningText = warningCount > 0 ? ` (${warningCount} warnings)` : '';
  return `Downloaded EDL with ${eventCount} event${eventCount === 1 ? '' : 's'}${warningText}`;
}

export function formatEdlFailureStatus(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `EDL export failed: ${message}`;
}

export function formatEdlImportStatus(eventCount: number, warningCount = 0): string {
  const warningText = warningCount > 0 ? ` (${warningCount} warnings)` : '';
  return `Imported EDL with ${eventCount} event${eventCount === 1 ? '' : 's'}${warningText}`;
}

export function formatEdlImportFailureStatus(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `EDL import failed: ${message}`;
}

export function formatFcpxmlDownloadStatus(clipCount: number, markerCount: number, warningCount = 0): string {
  const warningText = warningCount > 0 ? ` (${warningCount} warnings)` : '';
  return `Downloaded FCPXML with ${clipCount} clip${clipCount === 1 ? '' : 's'} and ${markerCount} marker${markerCount === 1 ? '' : 's'}${warningText}`;
}

export function formatFcpxmlFailureStatus(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `FCPXML export failed: ${message}`;
}

export function formatFcpxmlImportStatus(clipCount: number, markerCount: number, warningCount = 0): string {
  const warningText = warningCount > 0 ? ` (${warningCount} warnings)` : '';
  return `Imported FCPXML with ${clipCount} clip${clipCount === 1 ? '' : 's'} and ${markerCount} marker${markerCount === 1 ? '' : 's'}${warningText}`;
}

export function formatFcpxmlImportFailureStatus(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `FCPXML import failed: ${message}`;
}

export function formatMarkerInterchangeDownloadStatus(
  format: MarkerInterchangeFormat,
  markerCount: number,
  warningCount = 0,
): string {
  const warningText = warningCount > 0 ? ` (${warningCount} warnings)` : '';
  const label = format === 'youtube-chapters' ? 'YouTube chapters' : 'marker CSV';
  return `Downloaded ${label} with ${markerCount} marker${markerCount === 1 ? '' : 's'}${warningText}`;
}

export function formatMarkerInterchangeImportStatus({
  importedCount,
  warningCount = 0,
  skippedDuplicateCount = 0,
}: {
  importedCount: number;
  warningCount?: number;
  skippedDuplicateCount?: number;
}): string {
  const warningText = warningCount > 0 ? ` (${warningCount} warnings)` : '';
  const duplicateText = skippedDuplicateCount > 0 ? `, skipped ${skippedDuplicateCount} duplicate${skippedDuplicateCount === 1 ? '' : 's'}` : '';
  return `Imported ${importedCount} marker${importedCount === 1 ? '' : 's'}${duplicateText}${warningText}`;
}

export function formatMarkerInterchangeFailureStatus(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Marker interchange failed: ${message}`;
}
