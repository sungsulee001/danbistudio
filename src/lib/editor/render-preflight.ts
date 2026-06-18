import { buildExportManifest } from './automation';
import { buildProgramAudioAnalyzer, resolveAudioAnalyzerReadout } from './audio-analyzer';
import { buildCaptionPreflightReport, type CaptionPreflightIssue, type CaptionPreflightReport } from './caption-preflight';
import {
  buildExportProfileDimensionCompatibilityMessage,
  isExportProfileCodecContainerCompatible,
} from './export-profiles';
import { buildMediaHealthReport, type MediaHealthReport } from './media-health';
import { buildProgramPreviewStack } from './preview';
import { buildPreviewRenderParityReport, type PreviewRenderParityIssue, type PreviewRenderParityReport } from './preview-render-parity';
import type { FfmpegRenderPlan } from './ffmpeg-renderer';
import { validateRenderOutputPath, type RenderOutputValidationIssue } from './render-output';
import type { EditorProject, ExportManifest, ExportProfile } from './types';

export type RenderPreflightStatus = 'ready' | 'warning' | 'blocked';
export type RenderPreflightSeverity = 'blocked' | 'warning';
export type RenderPreflightSource = 'manifest' | 'media-health' | 'preview-render' | 'output' | 'caption' | 'profile' | 'audio';
export type RenderPreflightActionKind = 'cache' | 'output' | 'profile' | 'relink' | 'render' | 'review' | 'timeline';

export interface RenderPreflightIssue {
  id: string;
  severity: RenderPreflightSeverity;
  source: RenderPreflightSource;
  message: string;
  action: string;
  actionKind: RenderPreflightActionKind;
  assetId?: string;
  clipId?: string;
  captionId?: string;
  trackId?: string;
  time?: number;
}

export interface RenderPreflightOptions {
  exportRange?: {
    start: number;
    end: number;
  };
  outputPath?: string;
  playhead?: number;
  sampleTimes?: number[];
  plan?: FfmpegRenderPlan;
}

export interface RenderPreflightReport {
  projectId: string;
  profileId: string;
  status: RenderPreflightStatus;
  blockedCount: number;
  warningCount: number;
  issues: RenderPreflightIssue[];
  manifest: ExportManifest;
  mediaHealth: MediaHealthReport;
  previewRenderParity: PreviewRenderParityReport;
  captionPreflight: CaptionPreflightReport;
}

export function buildRenderPreflightReport(
  project: EditorProject,
  profileId: string,
  options: RenderPreflightOptions = {},
): RenderPreflightReport {
  const manifest = buildExportManifest(project, profileId, { exportRange: options.exportRange });
  const mediaHealth = buildMediaHealthReport(project);
  const captionPreflight = buildCaptionPreflightReport(project, manifest.exportRange);
  const previewRenderParity = buildPreviewRenderParityReport(project, profileId, {
    exportRange: options.exportRange,
    playhead: options.playhead,
    sampleTimes: options.sampleTimes,
    plan: options.plan,
  });
  const exportClipIds = new Set(manifest.renderGraph.map((item) => item.clipId));
  const exportAssetIds = collectExportAssetIds(project, exportClipIds);

  const issues = dedupePreflightIssues([
    ...manifest.issues.map((message, index) => buildManifestIssue(message, index)),
    ...buildProfileIssues(manifest.profile),
    ...validateRenderOutputPath(project, profileId, options.outputPath ?? options.plan?.outputPath).map(buildOutputIssue),
    ...captionPreflight.issues.map(buildCaptionIssue),
    ...buildAudioQualityIssues(project, manifest.exportRange, options),
    ...mediaHealth.issues
      .filter((issue) => (
        issue.assetId ? exportAssetIds.has(issue.assetId) : issue.clipId ? exportClipIds.has(issue.clipId) : true
      ))
      .map((issue) => ({
        id: `media-${issue.id}`,
        severity: issue.severity,
        source: 'media-health' as const,
        message: issue.message,
        action: actionForMediaIssue(issue.action),
        actionKind: issue.action,
        assetId: issue.assetId,
        clipId: issue.clipId,
      })),
    ...previewRenderParity.issues
      .filter(isBlockingOrWarningPreviewRenderIssue)
      .map(buildPreviewRenderIssue),
  ]);
  const blockedCount = issues.filter((issue) => issue.severity === 'blocked').length;
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;

  return {
    projectId: project.id,
    profileId,
    status: blockedCount > 0 ? 'blocked' : warningCount > 0 ? 'warning' : 'ready',
    blockedCount,
    warningCount,
    issues,
    manifest,
    mediaHealth,
    previewRenderParity,
    captionPreflight,
  };
}

export function getRenderPreflightBlockingMessage(report: RenderPreflightReport): string | undefined {
  const issue = report.issues.find((item) => item.severity === 'blocked');
  return issue ? `${issue.message} ${issue.action}` : undefined;
}

export function appendRenderPreflightIssues(
  report: RenderPreflightReport,
  extraIssues: RenderPreflightIssue[],
): RenderPreflightReport {
  if (extraIssues.length === 0) {
    return report;
  }

  const issues = dedupePreflightIssues([...report.issues, ...extraIssues]);
  const blockedCount = issues.filter((issue) => issue.severity === 'blocked').length;
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;

  return {
    ...report,
    status: blockedCount > 0 ? 'blocked' : warningCount > 0 ? 'warning' : 'ready',
    blockedCount,
    warningCount,
    issues,
  };
}

function collectExportAssetIds(project: EditorProject, exportClipIds: Set<string>): Set<string> {
  return new Set(project.tracks
    .flatMap((track) => track.clips)
    .filter((clip) => exportClipIds.has(clip.id))
    .map((clip) => clip.assetId)
    .filter((assetId): assetId is string => Boolean(assetId)));
}

function buildAudioQualityIssues(
  project: EditorProject,
  exportRange: ExportManifest['exportRange'],
  options: RenderPreflightOptions,
): RenderPreflightIssue[] {
  const sampleTimes = normalizeAudioSampleTimes(project.duration, exportRange, options);
  const seenWarnings = new Set<string>();
  const issues: RenderPreflightIssue[] = [];

  for (const time of sampleTimes) {
    const stack = buildProgramPreviewStack(project, time);
    const analyzer = buildProgramAudioAnalyzer(stack.audioLayers);
    if (analyzer.analyzedLayerCount === 0) {
      continue;
    }

    const readout = resolveAudioAnalyzerReadout(analyzer);
    if (!readout.warning || readout.status === 'pending' || readout.status === 'silent' || readout.status === 'live') {
      continue;
    }

    const warningKey = `${readout.status}:${readout.warning}`;
    if (seenWarnings.has(warningKey)) {
      continue;
    }
    seenWarnings.add(warningKey);

    issues.push({
      id: `audio-${readout.status}-${hashText(readout.warning)}-${Math.round(time * 1000)}`,
      severity: 'warning',
      source: 'audio',
      message: `${readout.warning} Sampled at ${time.toFixed(2)}s.`,
      action: buildAudioQualityAction(readout.status, readout.monoCompatibility),
      actionKind: 'review',
      time,
    });
  }

  return issues;
}

function buildAudioQualityAction(status: string, monoCompatibility: number | null): string {
  if (status === 'wide') {
    const monoPercent = monoCompatibility === null ? 'unknown' : `${Math.round(monoCompatibility * 100)}%`;
    return `Review the stereo width or pan automation before rendering; mono compatibility is ${monoPercent}.`;
  }

  if (status === 'dense') {
    return 'Review compression, limiting, or loudness automation before rendering.';
  }

  return 'Review track pan, clip gain, or source channel balance before rendering.';
}

function normalizeAudioSampleTimes(
  duration: number,
  exportRange: ExportManifest['exportRange'],
  options: RenderPreflightOptions,
): number[] {
  const windowStart = exportRange?.start ?? 0;
  const windowEnd = exportRange?.end ?? duration;
  const windowDuration = Math.max(0, windowEnd - windowStart);
  const explicitSamples = (options.sampleTimes ?? [])
    .filter((time) => time >= windowStart && time <= windowEnd);
  const playheadSample = typeof options.playhead === 'number' && options.playhead >= windowStart && options.playhead <= windowEnd
    ? options.playhead
    : undefined;
  const firstSample = exportRange ? Math.min(windowEnd, windowStart + 0.001) : 0;
  const lastSample = exportRange ? Math.max(windowStart, windowEnd - 0.001) : Math.max(0, duration - 0.001);
  const candidates = [
    playheadSample,
    ...explicitSamples,
    firstSample,
    windowStart + windowDuration * 0.25,
    windowStart + windowDuration * 0.5,
    windowStart + windowDuration * 0.75,
    lastSample,
  ];

  return Array.from(new Set(
    candidates
      .filter((time): time is number => typeof time === 'number' && Number.isFinite(time))
      .map((time) => roundTime(clampNumber(time, windowStart, windowEnd))),
  ));
}

function buildManifestIssue(message: string, index: number): RenderPreflightIssue {
  const warning = message.includes('Export FPS');
  return {
    id: `manifest-${index}-${hashText(message)}`,
    severity: warning ? 'warning' : 'blocked',
    source: 'manifest',
    message,
    action: warning
      ? 'Confirm the profile FPS or switch to a matching export profile.'
      : 'Fix the timeline issue before rendering.',
    actionKind: warning ? 'profile' : 'timeline',
  };
}

function buildOutputIssue(issue: RenderOutputValidationIssue): RenderPreflightIssue {
  return {
    id: `output-${issue.code}`,
    severity: 'blocked',
    source: 'output',
    message: issue.message,
    action: issue.action,
    actionKind: 'output',
  };
}

function buildProfileIssues(profile: ExportProfile): RenderPreflightIssue[] {
  const issues: RenderPreflightIssue[] = [];

  if (!isExportProfileCodecContainerCompatible(profile)) {
    issues.push({
      id: `profile-codec-container-${profile.id}`,
      severity: 'blocked',
      source: 'profile',
      message: `Codec "${profile.codec}" is not compatible with ${profile.container.toUpperCase()} export container.`,
      action: 'Choose a codec supported by the selected export container before rendering.',
      actionKind: 'profile',
    });
  }

  const dimensionMessage = buildExportProfileDimensionCompatibilityMessage(profile);
  if (dimensionMessage) {
    issues.push({
      id: `profile-dimensions-${profile.id}`,
      severity: 'blocked',
      source: 'profile',
      message: dimensionMessage,
      action: 'Use an even export width and height before rendering.',
      actionKind: 'profile',
    });
  }

  return issues;
}

function buildPreviewRenderIssue(issue: PreviewRenderParityIssue & { severity: RenderPreflightSeverity }): RenderPreflightIssue {
  return {
    id: `parity-${issue.id}`,
    severity: issue.severity,
    source: 'preview-render',
    message: issue.message,
    action: issue.action,
    actionKind: actionKindForPreviewRenderIssue(issue),
    assetId: issue.assetId,
    clipId: issue.clipId,
    trackId: issue.trackId,
    time: issue.time,
  };
}

function actionKindForPreviewRenderIssue(issue: PreviewRenderParityIssue): RenderPreflightActionKind {
  const detail = `${issue.message} ${issue.action}`.toLowerCase();
  if (
    detail.includes('filesystem path') ||
    detail.includes('relink') ||
    detail.includes('reimport') ||
    detail.includes('import the file')
  ) {
    return issue.assetId ? 'relink' : 'timeline';
  }

  if (detail.includes('attach') || detail.includes('remove the clip')) {
    return 'timeline';
  }

  if (
    detail.includes('review a short export') ||
    detail.includes('final visual review') ||
    detail.includes('program monitor preview is approximate') ||
    detail.includes('cannot be previewed accurately')
  ) {
    return 'review';
  }

  return 'render';
}

function buildCaptionIssue(issue: CaptionPreflightIssue): RenderPreflightIssue {
  return {
    id: `caption-${issue.id}`,
    severity: issue.severity,
    source: 'caption',
    message: issue.message,
    action: issue.action,
    actionKind: 'timeline',
    captionId: issue.captionId,
    time: issue.time,
  };
}

function isBlockingOrWarningPreviewRenderIssue(issue: PreviewRenderParityIssue): issue is PreviewRenderParityIssue & { severity: RenderPreflightSeverity } {
  return issue.severity === 'blocked' || issue.severity === 'warning';
}

function actionForMediaIssue(action: string): string {
  switch (action) {
    case 'relink':
      return 'Relink or reimport the source asset before rendering.';
    case 'cache':
      return 'Rebuild media cache for smoother preview and review.';
    case 'review':
      return 'Review whether the asset should be used or removed.';
    default:
      return 'Review the media health issue.';
  }
}

function dedupePreflightIssues(issues: RenderPreflightIssue[]): RenderPreflightIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.severity}:${issue.source}:${issue.assetId ?? ''}:${issue.clipId ?? ''}:${issue.message}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function hashText(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
