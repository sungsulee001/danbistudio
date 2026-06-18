import { buildExportManifest } from './automation';
import { buildFfmpegRenderPlan, isClipEffectRenderedByFfmpeg, type FfmpegRenderPlan } from './ffmpeg-renderer';
import { isAdjustmentLayerClip } from './adjustment-layer';
import { readAiModelEffectPass } from './ai-effects';
import { clipHasTimelineAudio } from './media-metadata';
import { buildProgramPreviewStack } from './preview';
import { resolvePreviewSourcePath } from './preview-source';
import { isRenderableVisualMediaAsset, resolveRenderableAssetMediaKind } from './renderable-media-kind';
import type { ClipEffect, EditorAsset, EditorProject, TimelineClip } from './types';
import { readVisualFilterPresetId } from './visual-effects';

export type PreviewRenderParitySeverity = 'blocked' | 'warning' | 'info';
export type PreviewRenderParityFeatureScope = 'media-source' | 'effect' | 'transition' | 'caption';
export type PreviewRenderParityFeatureStatus = 'matched' | 'warning' | 'blocked';
export type PreviewRenderParityFeatureSupport = 'supported' | 'partial' | 'unsupported' | 'not-applicable';

export interface PreviewRenderParityIssue {
  id: string;
  severity: PreviewRenderParitySeverity;
  time: number;
  assetId?: string;
  clipId?: string;
  trackId?: string;
  message: string;
  action: string;
}

export interface PreviewRenderParityFeatureCheck {
  id: string;
  scope: PreviewRenderParityFeatureScope;
  status: PreviewRenderParityFeatureStatus;
  preview: PreviewRenderParityFeatureSupport;
  render: PreviewRenderParityFeatureSupport;
  label: string;
  message: string;
  action: string;
  time: number;
  assetId?: string;
  clipId?: string;
  trackId?: string;
  effectId?: string;
}

export interface PreviewRenderParityReport {
  projectId: string;
  profileId: string;
  exportRange?: {
    start: number;
    end: number;
    duration: number;
  };
  sampleTimes: number[];
  blockedCount: number;
  warningCount: number;
  infoCount: number;
  issues: PreviewRenderParityIssue[];
  featureMatrix: PreviewRenderParityFeatureCheck[];
  plan: FfmpegRenderPlan;
}

export interface PreviewRenderParityOptions {
  playhead?: number;
  sampleTimes?: number[];
  exportRange?: {
    start: number;
    end: number;
  };
  plan?: FfmpegRenderPlan;
}

export function buildPreviewRenderParityReport(
  project: EditorProject,
  profileId: string,
  options: PreviewRenderParityOptions = {},
): PreviewRenderParityReport {
  const plan = options.plan ?? buildFfmpegRenderPlan(project, profileId, undefined, {
    exportRange: options.exportRange,
  });
  const exportRange = normalizeExportRange(project.duration, options.exportRange ?? plan.exportRange);
  const sampleTimes = normalizeSampleTimes(project.duration, options, exportRange);
  const featureMatrix = buildPreviewRenderParityFeatureMatrix(project, profileId, {
    exportRange,
    plan,
  });
  const issues: PreviewRenderParityIssue[] = featureMatrix
    .filter((item) => item.status !== 'matched')
    .map(buildFeatureMatrixIssue);

  for (const warning of plan.warnings) {
    const severity = classifyRenderPlanWarning(warning);
    issues.push({
      id: `plan-${hashText(warning)}`,
      severity,
      time: 0,
      message: warning,
      action: severity === 'blocked'
        ? 'Fix the render plan before queueing FFmpeg.'
        : severity === 'warning'
          ? 'Review the render warning before export.'
          : 'No action needed; FFmpeg render output already matches this preview behavior.',
    });
  }

  for (const time of sampleTimes) {
    const stack = buildProgramPreviewStack(project, time);

    for (const warning of stack.warnings) {
      issues.push({
        id: `preview-${time}-${hashText(warning)}`,
        severity: 'warning',
        time,
        message: warning,
        action: 'Check the active preview layer and source asset.',
      });
    }
  }

  const uniqueIssues = dedupeIssues(issues);

  return {
    projectId: project.id,
    profileId,
    ...(exportRange ? { exportRange } : {}),
    sampleTimes,
    blockedCount: uniqueIssues.filter((issue) => issue.severity === 'blocked').length,
    warningCount: uniqueIssues.filter((issue) => issue.severity === 'warning').length,
    infoCount: uniqueIssues.filter((issue) => issue.severity === 'info').length,
    issues: uniqueIssues,
    featureMatrix,
    plan,
  };
}

export function buildPreviewRenderParityFeatureMatrix(
  project: EditorProject,
  profileId: string,
  options: PreviewRenderParityOptions = {},
): PreviewRenderParityFeatureCheck[] {
  const exportRange = normalizeExportRange(project.duration, options.exportRange);
  const manifest = buildExportManifest(project, profileId, { exportRange });
  const plan = options.plan ?? buildFfmpegRenderPlan(project, profileId, undefined, {
    exportRange,
  });
  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const trackById = new Map(project.tracks.map((track) => [track.id, track]));
  const renderedInputClipIds = new Set(plan.inputs.map((input) => input.clipId));
  const checks: PreviewRenderParityFeatureCheck[] = [];

  for (const node of manifest.renderGraph) {
    const track = trackById.get(node.trackId);
    const clip = track?.clips.find((candidate) => candidate.id === node.clipId);
    if (!track || !clip) {
      continue;
    }

    const asset = clip.assetId ? assetById.get(clip.assetId) : undefined;
    checks.push(buildMediaSourceFeatureCheck(clip, asset, renderedInputClipIds.has(clip.id)));

    for (const effect of clip.effects.filter((item) => item.enabled)) {
      checks.push(buildEffectFeatureCheck(clip, asset, effect));
    }

    if (clip.transitionOut && clip.transitionOut.type !== 'cut') {
      checks.push(buildTransitionFeatureCheck(clip));
    }
  }

  if (manifest.captions.length > 0) {
    checks.push({
      id: 'caption-burn-in',
      scope: 'caption',
      status: 'matched',
      preview: 'supported',
      render: 'supported',
      label: 'Caption burn-in',
      message: `${manifest.captions.length} caption ${manifest.captions.length === 1 ? 'segment is' : 'segments are'} covered by preview text state and FFmpeg burn-in.`,
      action: 'No action needed.',
      time: manifest.captions[0]?.start ?? exportRange?.start ?? 0,
    });
  }

  return dedupeFeatureChecks(checks);
}

export function classifyRenderPlanWarning(warning: string): PreviewRenderParitySeverity {
  if (warning.includes('blob:') || warning.includes('local://') || warning.includes('No visual clips')) {
    return 'blocked';
  }

  if (
    warning.includes('Timeline gaps are rendered as black frames') ||
    warning.includes('Multi-track video is composited by project track order')
  ) {
    return 'info';
  }

  return 'warning';
}

function buildFeatureMatrixIssue(check: PreviewRenderParityFeatureCheck): PreviewRenderParityIssue {
  return {
    id: `matrix-${check.id}`,
    severity: check.status === 'blocked' ? 'blocked' : 'warning',
    time: check.time,
    assetId: check.assetId,
    clipId: check.clipId,
    trackId: check.trackId,
    message: check.message,
    action: check.action,
  };
}

function buildMediaSourceFeatureCheck(
  clip: TimelineClip,
  asset: EditorAsset | undefined,
  renderedByFfmpeg: boolean,
): PreviewRenderParityFeatureCheck {
  const base = buildFeatureBase('media-source', `media-${clip.id}`, clip, asset);
  if (!clip.assetId && clip.kind !== 'text') {
    return {
      ...base,
      status: 'blocked',
      preview: 'unsupported',
      render: 'unsupported',
      label: `${clip.name} media source`,
      message: `${clip.name} has no media asset for preview or FFmpeg render.`,
      action: 'Attach, relink, or remove the clip before rendering.',
    };
  }

  if (!asset && clip.kind !== 'text') {
    return {
      ...base,
      status: 'blocked',
      preview: 'unsupported',
      render: 'unsupported',
      label: `${clip.name} media source`,
      message: `${clip.name} references a missing media asset.`,
      action: 'Reimport the source asset and attach it to the clip before rendering.',
    };
  }

  if (clip.kind === 'text' || asset?.kind === 'text') {
    return {
      ...base,
      status: 'matched',
      preview: 'supported',
      render: 'supported',
      label: `${clip.name} title/text`,
      message: `${clip.name} previews as text and renders through FFmpeg drawtext.`,
      action: 'No action needed.',
    };
  }

  if (asset && isBrowserOnlyRenderSource(asset)) {
    return {
      ...base,
      status: 'blocked',
      preview: 'supported',
      render: 'unsupported',
      label: `${clip.name} media source`,
      message: `${clip.name} previews from ${asset.source}, but FFmpeg cannot render it without a filesystem path.`,
      action: 'Import the file through /api/editor/media so renderPath is available.',
    };
  }

  if (asset && (asset.kind === 'effect' || clip.kind === 'effect') && !isAdjustmentLayerClip(clip, asset)) {
    return {
      ...base,
      status: 'warning',
      preview: 'partial',
      render: 'unsupported',
      label: `${clip.name} effect layer`,
      message: `${clip.name} is visible in preview metadata but is not rendered by FFmpeg yet.`,
      action: 'Implement the effect in the FFmpeg filter graph or pre-render the effect asset.',
    };
  }

  if (asset && !resolveRenderableAssetMediaKind(asset) && !isAdjustmentLayerClip(clip, asset)) {
    return {
      ...base,
      status: 'warning',
      preview: 'partial',
      render: 'unsupported',
      label: `${clip.name} ${asset.kind} asset`,
      message: `${clip.name} uses a ${asset.kind} asset that is not rendered by FFmpeg yet.`,
      action: 'Convert the asset to video, image, audio, or text before export.',
    };
  }

  const adjustmentLayer = isAdjustmentLayerClip(clip, asset);
  const sourceStatus = renderedByFfmpeg || adjustmentLayer ? 'matched' : 'warning';

  return {
    ...base,
    status: sourceStatus,
    preview: 'supported',
    render: renderedByFfmpeg ? 'supported' : 'partial',
    label: `${clip.name} media source`,
    message: renderedByFfmpeg
      ? `${clip.name} has a preview source and FFmpeg render input.`
      : adjustmentLayer
        ? `${clip.name} is an adjustment layer whose effects render through overlapping lower clips.`
        : `${clip.name} is in the export graph but does not require a direct FFmpeg input for the active track domain.`,
    action: 'No action needed.',
  };
}

function buildEffectFeatureCheck(
  clip: TimelineClip,
  asset: EditorAsset | undefined,
  effect: ClipEffect,
): PreviewRenderParityFeatureCheck {
  const render = isClipEffectRenderedByFfmpeg(clip, asset, effect) ? 'supported' : 'unsupported';
  const preview = resolveEffectPreviewSupport(clip, asset, effect);
  const status = resolveFeatureStatus(preview, render);
  const label = `${clip.name}: ${effect.label}`;
  const message = status === 'matched'
    ? `${effect.label} has preview/render parity.`
    : render === 'unsupported'
      ? `Unsupported enabled effect is not rendered by FFmpeg yet: ${effect.label}.`
      : preview === 'partial'
        ? `${effect.label} renders in FFmpeg, but Program Monitor preview is approximate.`
      : `${effect.label} renders in FFmpeg but cannot be previewed in Program Monitor.`;
  const action = status === 'matched'
    ? 'No action needed.'
    : render === 'unsupported'
      ? 'Implement the effect in the FFmpeg filter graph or pre-render the clip.'
      : preview === 'partial'
        ? 'Review a short export before final delivery when this effect drives the shot.'
      : 'Move or cache generated media under a browser-served public media path before final visual review.';

  return {
    ...buildFeatureBase('effect', `effect-${clip.id}-${effect.id}`, clip, asset),
    status,
    preview,
    render,
    label,
    message,
    action,
    effectId: effect.id,
  };
}

function buildTransitionFeatureCheck(clip: TimelineClip): PreviewRenderParityFeatureCheck {
  const transition = clip.transitionOut!;
  const renderSupported = transition.type === 'crossfade' ||
    transition.type === 'dip' ||
    transition.type === 'push' ||
    transition.type === 'wipe';
  const status = renderSupported ? 'matched' : 'warning';

  return {
    ...buildFeatureBase('transition', `transition-${clip.id}-${transition.id}`, clip, undefined),
    status,
    preview: 'supported',
    render: renderSupported ? 'supported' : 'partial',
    label: `${clip.name}: ${transition.type}`,
    message: renderSupported
      ? `${transition.type} transition has preview/render parity.`
      : `${clip.name} uses ${transition.type}, which requires generated media for exact FFmpeg parity.`,
    action: renderSupported
      ? 'No action needed.'
      : 'Generate or replace the transition media before final export, or switch to crossfade, dip, push, or wipe.',
  };
}

function buildFeatureBase(
  scope: PreviewRenderParityFeatureScope,
  id: string,
  clip: TimelineClip,
  asset: EditorAsset | undefined,
): Pick<PreviewRenderParityFeatureCheck, 'id' | 'scope' | 'time' | 'assetId' | 'clipId' | 'trackId'> {
  return {
    id,
    scope,
    time: clip.start,
    assetId: asset?.id,
    clipId: clip.id,
    trackId: clip.trackId,
  };
}

function normalizeExportRange(
  projectDuration: number,
  range?: { start: number; end: number },
): PreviewRenderParityReport['exportRange'] {
  if (!range) {
    return undefined;
  }

  const start = roundTime(clamp(Math.min(range.start, range.end), 0, projectDuration));
  const end = roundTime(clamp(Math.max(range.start, range.end), 0, projectDuration));
  const duration = roundTime(end - start);
  if (duration <= 0.001) {
    throw new Error('Preview/render parity range must be longer than 0 seconds.');
  }

  return { start, end, duration };
}

function normalizeSampleTimes(
  duration: number,
  options: PreviewRenderParityOptions,
  exportRange?: PreviewRenderParityReport['exportRange'],
): number[] {
  const windowStart = exportRange?.start ?? 0;
  const windowEnd = exportRange?.end ?? duration;
  const windowDuration = Math.max(0, windowEnd - windowStart);
  const firstSample = exportRange
    ? Math.min(windowEnd, windowStart + 0.001)
    : 0;
  const lastSample = exportRange
    ? Math.max(windowStart, windowEnd - 0.001)
    : Math.max(0, duration - 0.001);
  const explicitSamples = (options.sampleTimes ?? [])
    .filter((time) => time >= windowStart && time <= windowEnd);
  const playheadSample = typeof options.playhead === 'number' && options.playhead >= windowStart && options.playhead <= windowEnd
    ? options.playhead
    : undefined;
  const candidates = [
    firstSample,
    playheadSample,
    ...explicitSamples,
    windowStart + (windowDuration * 0.25),
    windowStart + (windowDuration * 0.5),
    windowStart + (windowDuration * 0.75),
    lastSample,
  ];

  return Array.from(new Set(
    candidates
      .filter((time): time is number => typeof time === 'number' && Number.isFinite(time))
      .map((time) => roundTime(clamp(time, windowStart, windowEnd))),
  )).sort((a, b) => a - b);
}

function isBrowserOnlySource(asset: EditorAsset): boolean {
  const source = asset.source;
  return source.startsWith('blob:') || source.startsWith('local://') || source.length === 0;
}

function isBrowserOnlyRenderSource(asset: EditorAsset): boolean {
  if (asset.renderPath) {
    return false;
  }

  return isBrowserOnlySource(asset);
}

function resolveEffectPreviewSupport(
  clip: TimelineClip,
  asset: EditorAsset | undefined,
  effect: ClipEffect,
): PreviewRenderParityFeatureSupport {
  if (!effect.enabled) {
    return 'not-applicable';
  }

  if (effect.type === 'ai') {
    const pass = readAiModelEffectPass(effect);
    if (pass && resolvePreviewSourcePath(pass.source, pass.path).mode === 'none') {
      return 'unsupported';
    }
  }

  if (effect.type === 'audio') {
    return clip.kind === 'audio' || clipHasTimelineAudio(clip, asset)
      ? 'supported'
      : 'unsupported';
  }

  if (effect.type === 'caption') {
    return clip.kind === 'text' || asset?.kind === 'text' ? 'supported' : 'unsupported';
  }

  if (effect.type === 'stabilize') {
    return 'partial';
  }

  if (effect.type === 'filter' && readVisualFilterPresetId(effect)) {
    return clip.kind === 'video' || clip.kind === 'image' ||
      isRenderableVisualMediaAsset(asset) ||
      isAdjustmentLayerClip(clip, asset)
      ? 'partial'
      : 'unsupported';
  }

  if (
    effect.type === 'color' ||
    effect.type === 'motion' ||
    effect.type === 'mask' ||
    effect.type === 'reframe' ||
    effect.type === 'layout' ||
    effect.type === 'ai'
  ) {
    return clip.kind === 'video' || clip.kind === 'image' || clip.kind === 'text' ||
      isRenderableVisualMediaAsset(asset) || asset?.kind === 'text' ||
      isAdjustmentLayerClip(clip, asset)
      ? 'supported'
      : 'unsupported';
  }

  return 'unsupported';
}

function resolveFeatureStatus(
  preview: PreviewRenderParityFeatureSupport,
  render: PreviewRenderParityFeatureSupport,
): PreviewRenderParityFeatureStatus {
  if (preview === 'supported' && render === 'supported') {
    return 'matched';
  }

  if (preview === 'not-applicable' && render === 'not-applicable') {
    return 'matched';
  }

  return 'warning';
}

function dedupeFeatureChecks(checks: PreviewRenderParityFeatureCheck[]): PreviewRenderParityFeatureCheck[] {
  const seen = new Set<string>();
  return checks.filter((check) => {
    const key = `${check.scope}:${check.clipId ?? ''}:${check.effectId ?? ''}:${check.message}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function dedupeIssues(issues: PreviewRenderParityIssue[]): PreviewRenderParityIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.severity}:${issue.clipId ?? ''}:${issue.message}`;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}
