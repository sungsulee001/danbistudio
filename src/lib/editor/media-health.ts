import type { EditorAsset, EditorProject, TimelineClip } from './types';
import { readExplicitUnsupportedMediaMimeType as readUnsupportedMediaMimeType } from './media-file-support';
import { resolvePreviewMediaSource, resolvePreviewSourcePath } from './preview-source';
import { resolveRenderableAssetMediaKind } from './renderable-media-kind';
import { assetCanHaveWaveform, assetHasPersistentWaveform } from './waveform-cache';

export type MediaHealthSeverity = 'blocked' | 'warning' | 'ok';
export type MediaHealthAction = 'relink' | 'cache' | 'review';

export interface MediaHealthIssue {
  id: string;
  assetId?: string;
  clipId?: string;
  severity: Exclude<MediaHealthSeverity, 'ok'>;
  action: MediaHealthAction;
  message: string;
}

export interface MediaAssetHealth {
  assetId: string;
  severity: MediaHealthSeverity;
  issueCount: number;
  renderReady: boolean;
  previewReady: boolean;
  cacheReady: boolean;
  hasProxy: boolean;
  hasThumbnail: boolean;
  hasWaveform: boolean;
  issues: MediaHealthIssue[];
}

export interface MediaHealthReport {
  assetCount: number;
  blockedCount: number;
  warningCount: number;
  renderReadyCount: number;
  cacheReadyCount: number;
  assets: MediaAssetHealth[];
  orphanClipIssues: MediaHealthIssue[];
  issues: MediaHealthIssue[];
}

export function buildMediaHealthReport(project: EditorProject): MediaHealthReport {
  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const referencedAssetIds = new Set(project.tracks
    .flatMap((track) => track.clips)
    .map((clip) => clip.assetId)
    .filter((assetId): assetId is string => Boolean(assetId)));

  const assets = project.assets.map((asset) => buildAssetHealth(asset, referencedAssetIds.has(asset.id)));
  const orphanClipIssues = project.tracks
    .flatMap((track) => track.clips)
    .filter((clip) => clip.assetId && !assetById.has(clip.assetId))
    .map((clip) => buildOrphanClipIssue(clip));
  const issues = [
    ...assets.flatMap((asset) => asset.issues),
    ...orphanClipIssues,
  ];

  return {
    assetCount: project.assets.length,
    blockedCount: issues.filter((issue) => issue.severity === 'blocked').length,
    warningCount: issues.filter((issue) => issue.severity === 'warning').length,
    renderReadyCount: assets.filter((asset) => asset.renderReady).length,
    cacheReadyCount: assets.filter((asset) => asset.cacheReady).length,
    assets,
    orphanClipIssues,
    issues,
  };
}

function buildAssetHealth(asset: EditorAsset, isReferenced: boolean): MediaAssetHealth {
  const issues: MediaHealthIssue[] = [];
  const renderableKind = resolveRenderableAssetMediaKind(asset);
  const unsupportedMimeType = readAssetExplicitUnsupportedMediaMimeType(asset, renderableKind);
  const unsupportedMedia = Boolean(unsupportedMimeType);
  const mediaAsset = Boolean(renderableKind) || unsupportedMedia;
  const visualAsset = renderableKind === 'video' || renderableKind === 'image';
  const renderPath = asset.renderPath ?? '';
  const hasProxy = Boolean(asset.mediaCache?.proxySource);
  const hasThumbnail = Boolean(asset.mediaCache?.thumbnailSource);
  const needsWaveform = assetCanHaveWaveform(asset);
  const hasWaveform = assetHasPersistentWaveform(asset);
  const previewSource = resolvePreviewMediaSource(asset);
  const previewPath = resolvePreviewSourcePath(asset.source, asset.renderPath);
  const previewReady = previewSource.mode === 'proxy' || previewPath.mode !== 'none';
  const renderReady = !mediaAsset || (!unsupportedMedia && Boolean(renderPath));
  const previewUsesVolatileSource = previewPath.mode === 'source' && isVolatilePreviewSource(previewPath.source);

  if (unsupportedMimeType) {
    issues.push(buildIssue(
      asset.id,
      'unsupported-media-type',
      isReferenced ? 'blocked' : 'warning',
      isReferenced ? 'relink' : 'review',
      formatUnsupportedMediaTypeMessage(asset, unsupportedMimeType, isReferenced),
    ));
  }

  if (mediaAsset && !previewReady) {
    issues.push(buildIssue(
      asset.id,
      'missing-source',
      renderReady && mediaAsset ? 'warning' : 'blocked',
      renderReady && mediaAsset ? 'cache' : 'relink',
      formatMissingPreviewSourceMessage(asset),
    ));
  } else if (mediaAsset && previewSource.mode !== 'proxy' && previewUsesVolatileSource) {
    const hasRenderPath = Boolean(renderPath);
    issues.push(buildIssue(
      asset.id,
      'volatile-source',
      hasRenderPath ? 'warning' : 'blocked',
      hasRenderPath ? 'cache' : 'relink',
      formatVolatilePreviewSourceMessage(asset, hasRenderPath),
    ));
  }

  if (mediaAsset && !unsupportedMedia && !renderPath) {
    issues.push(buildIssue(asset.id, 'missing-render-path', 'blocked', 'relink', formatMissingRenderPathMessage(asset)));
  }

  if (visualAsset && !hasThumbnail) {
    issues.push(buildIssue(asset.id, 'missing-thumbnail', 'warning', 'cache', `${asset.name} has no thumbnail cache.`));
  }

  if (renderableKind === 'video' && !hasProxy) {
    issues.push(buildIssue(asset.id, 'missing-proxy', 'warning', 'cache', `${asset.name} has no proxy cache for smooth preview.`));
  }

  if (needsWaveform && !hasWaveform) {
    issues.push(buildIssue(asset.id, 'missing-waveform', 'warning', 'cache', `${asset.name} has no waveform cache.`));
  }

  if (typeof asset.metadata?.analysisWarning === 'string') {
    issues.push(buildIssue(asset.id, 'analysis-warning', 'warning', 'review', `${asset.name}: ${asset.metadata.analysisWarning}`));
  }

  if (typeof asset.metadata?.cacheWarning === 'string') {
    issues.push(buildIssue(asset.id, 'cache-warning', 'warning', 'cache', `${asset.name}: ${asset.metadata.cacheWarning}`));
  }

  if (!isReferenced && mediaAsset) {
    issues.push(buildIssue(asset.id, 'unused-media', 'warning', 'review', `${asset.name} is in the bin but not used on the timeline.`));
  }

  const severity = issues.some((issue) => issue.severity === 'blocked')
    ? 'blocked'
    : issues.some((issue) => issue.severity === 'warning')
      ? 'warning'
      : 'ok';

  return {
    assetId: asset.id,
    severity,
    issueCount: issues.length,
    renderReady,
    previewReady,
    cacheReady: !unsupportedMedia && (!mediaAsset || (visualAsset ? hasThumbnail : true) && (renderableKind === 'video' ? hasProxy && (!needsWaveform || hasWaveform) : renderableKind === 'audio' ? hasWaveform : true)),
    hasProxy,
    hasThumbnail,
    hasWaveform,
    issues,
  };
}

function readAssetExplicitUnsupportedMediaMimeType(asset: EditorAsset, renderableKind: ReturnType<typeof resolveRenderableAssetMediaKind>): string | undefined {
  if (asset.kind !== 'ai' || renderableKind) {
    return undefined;
  }

  return readUnsupportedMediaMimeType(typeof asset.metadata?.mimeType === 'string' ? asset.metadata.mimeType : undefined);
}

function formatUnsupportedMediaTypeMessage(asset: EditorAsset, mimeType: string, isReferenced: boolean): string {
  const action = isReferenced
    ? 'Relink or replace it with a supported video, audio, or image file before export.'
    : 'Review or remove it before using it on the timeline.';
  return `${asset.name} has unsupported media type ${mimeType}. ${action}`;
}

function formatMissingPreviewSourceMessage(asset: EditorAsset): string {
  if (asset.metadata?.importedFromEdl === true) {
    if (asset.renderPath) {
      return `${asset.name} has a local EDL render path but needs cache media for browser preview.`;
    }

    return `${asset.name} is an offline EDL placeholder; relink ${formatRelinkHint(asset)} for preview.`;
  }

  if (asset.metadata?.importedFromFcpxml === true) {
    if (asset.renderPath) {
      return `${asset.name} has a local FCPXML render path but needs cache media for browser preview.`;
    }

    return `${asset.name} is offline FCPXML media; relink ${formatRelinkHint(asset)} for preview.`;
  }

  return `${asset.name} has no browser-previewable source.`;
}

function formatMissingRenderPathMessage(asset: EditorAsset): string {
  if (asset.metadata?.importedFromEdl === true) {
    return `${asset.name} is an offline EDL placeholder; relink ${formatRelinkHint(asset)} before FFmpeg export.`;
  }

  if (asset.metadata?.importedFromFcpxml === true) {
    return `${asset.name} is offline FCPXML media; relink ${formatRelinkHint(asset)} before FFmpeg export.`;
  }

  return `${asset.name} needs a filesystem renderPath for FFmpeg.`;
}

function formatVolatilePreviewSourceMessage(asset: EditorAsset, hasRenderPath: boolean): string {
  if (hasRenderPath) {
    return `${asset.name} uses a non-persistent preview source; FFmpeg export can use its renderPath, but rebuild preview cache for stable browser preview.`;
  }

  return `${asset.name} uses a non-persistent preview source.`;
}

function formatRelinkHint(asset: EditorAsset): string {
  const hint = asset.metadata?.edlRelinkHint ?? asset.metadata?.fcpxmlRelinkHint ?? asset.metadata?.fcpxmlResourceId;
  return typeof hint === 'string' && hint.trim() ? hint.trim() : 'the source media';
}

function isVolatilePreviewSource(source: string): boolean {
  return source.startsWith('blob:') || source.startsWith('local://') || source.startsWith('offline://');
}

function buildIssue(
  assetId: string,
  code: string,
  severity: Exclude<MediaHealthSeverity, 'ok'>,
  action: MediaHealthAction,
  message: string,
): MediaHealthIssue {
  return {
    id: `${assetId}-${code}`,
    assetId,
    severity,
    action,
    message,
  };
}

function buildOrphanClipIssue(clip: TimelineClip): MediaHealthIssue {
  return {
    id: `${clip.id}-missing-asset`,
    clipId: clip.id,
    severity: 'blocked',
    action: 'relink',
    message: `${clip.name} references missing asset ${clip.assetId}.`,
  };
}
