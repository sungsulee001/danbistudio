import type { SourceRange } from './editor-view-model';
import { KEYFRAME_PROPERTIES } from './editor-view-model';
import { readAssetBin } from '../../lib/editor/media-bin';
import { hasTimelineAudio } from '../../lib/editor/media-metadata';
import { stepShuttleRate, type ShuttleDirection } from '../../lib/editor/playback';
import { isRenderableVisualMediaAsset, resolveRenderableAssetMediaKind } from '../../lib/editor/renderable-media-kind';
import { resolveAssetRuntimeWaveformPeaks, resolveWaveformPeaks } from '../../lib/editor/waveform-cache';
import { clampNumber, roundTime } from './editor-time-helpers';
import type { ClipKeyframe, EditorAsset, EditorProject, TimelineClip, TimelineTrack, TrackKind } from '../../lib/editor/types';

export interface SourceWorkspaceState {
  selectedSourceAsset?: EditorAsset;
  selectedSourceRange: SourceRange | null;
  selectedSourceDuration: number;
  selectedSourceAssetBin: string;
  selectedSourcePrimaryKind: TrackKind;
  selectedSourceHasPrimaryPatch: boolean;
  selectedSourceHasAudioPatch: boolean;
  activeSourcePrimaryPatchTrackId?: string;
  activeSourceAudioPatchTrackId?: string;
  activeSourcePrimaryPatchTrack?: TimelineTrack;
  activeSourceAudioPatchTrack?: TimelineTrack;
}

export interface SourceAssetSelectionPlan {
  selectedSourceAssetId: string;
  activeMonitor: 'source';
  sourcePlaybackRate: 0;
  sourcePlayhead?: number;
}

export interface SourceMonitorPlaybackGuardPlan {
  hasSource: boolean;
  sourcePlayhead: number;
  sourcePlaybackRate?: 0;
}

export interface SourceMonitorPlaybackRateState {
  activeMonitor: 'source';
  sourcePlaybackRate: number;
}

export interface SourceMonitorLoopPlaybackTogglePlan {
  sourceLoopPlaybackEnabled: boolean;
  activeMonitor?: 'source';
  nextSourcePlayhead?: number;
  status: string;
}

export type SourceMonitorConsistencyIssueType =
  | 'missing-selected-source-asset'
  | 'invalid-source-range'
  | 'source-playhead-normalized'
  | 'source-loop-disabled'
  | 'missing-primary-patch-track'
  | 'missing-audio-patch-track'
  | 'source-patch-disabled';

export interface SourceMonitorConsistencyIssue {
  type: SourceMonitorConsistencyIssueType;
  severity: 'warning' | 'error';
  message: string;
  assetId?: string;
  trackId?: string;
}

export interface SourceMonitorConsistencyAuditReport {
  status: 'passed' | 'warning' | 'failed';
  workspace: SourceWorkspaceState;
  selectedSourceAssetId: string;
  sourceRange: SourceRange | null;
  sourcePlayhead: number;
  sourceLoopPlaybackEnabled: boolean;
  sourcePrimaryPatchTrackId?: string;
  sourceAudioPatchTrackId?: string;
  sourcePrimaryPatchEnabled: boolean;
  sourceAudioPatchEnabled: boolean;
  shouldUpdateSelectedSourceAssetId: boolean;
  shouldUpdateSourceRange: boolean;
  shouldUpdateSourcePlayhead: boolean;
  shouldDisableSourceLoopPlayback: boolean;
  issues: SourceMonitorConsistencyIssue[];
}

export function findSelectedAudioVideoPair(
  clips: TimelineClip[],
  assetById?: Map<string, EditorAsset>,
): { videoClip: TimelineClip; audioClip: TimelineClip } | null {
  if (clips.length !== 2) {
    return null;
  }

  const audioClip = clips.find((clip) => isSelectedAudioClip(clip, assetById));
  const videoClip = clips.find((clip) => isSelectedVisualMediaClip(clip, assetById));

  return audioClip && videoClip ? { videoClip, audioClip } : null;
}

function isSelectedAudioClip(clip: TimelineClip, assetById?: Map<string, EditorAsset>): boolean {
  const asset = clip.assetId ? assetById?.get(clip.assetId) : undefined;
  return clip.kind === 'audio' || resolveRenderableAssetMediaKind(asset) === 'audio';
}

function isSelectedVisualMediaClip(clip: TimelineClip, assetById?: Map<string, EditorAsset>): boolean {
  const asset = clip.assetId ? assetById?.get(clip.assetId) : undefined;
  return clip.kind === 'video' || clip.kind === 'image' || isRenderableVisualMediaAsset(asset);
}

export function clipHasUsableWaveform(
  clip: TimelineClip,
  assetById: Map<string, EditorAsset>,
  runtimePeaksByAssetId: Record<string, number[]>,
): boolean {
  if (!clip.assetId) {
    return false;
  }

  const asset = assetById.get(clip.assetId);
  return Boolean(resolveWaveformPeaks(
    asset,
    resolveAssetRuntimeWaveformPeaks(asset, runtimePeaksByAssetId),
  )?.length);
}

export function safeDownloadName(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'danbi-project';
}

export function compareKeyframes(a: ClipKeyframe, b: ClipKeyframe): number {
  const propertyDelta = KEYFRAME_PROPERTIES.indexOf(a.property) - KEYFRAME_PROPERTIES.indexOf(b.property);
  if (propertyDelta !== 0) {
    return propertyDelta;
  }

  return a.time - b.time;
}

export function readWorkflowNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function trackKindForSourceAsset(asset: EditorAsset): TrackKind {
  if (resolveRenderableAssetMediaKind(asset) === 'audio') {
    return 'audio';
  }

  if (asset.kind === 'text') {
    return 'text';
  }

  if (asset.kind === 'effect') {
    return 'effect';
  }

  return 'video';
}

export function trackKindForTimelineClip(clip: TimelineClip, asset?: EditorAsset): TrackKind {
  if (resolveRenderableAssetMediaKind(asset) === 'audio') {
    return 'audio';
  }

  if (clip.kind === 'audio') {
    return 'audio';
  }

  if (clip.kind === 'text') {
    return 'text';
  }

  if (clip.kind === 'effect') {
    return 'effect';
  }

  return 'video';
}

export function clipsOverlapForPreview(
  first: Pick<TimelineClip, 'start' | 'duration'>,
  second: Pick<TimelineClip, 'start' | 'duration'>,
): boolean {
  return first.start < second.start + second.duration - 0.001
    && second.start < first.start + first.duration - 0.001;
}

export function resolveEditableTrackId(
  project: EditorProject,
  kind: TrackKind,
  preferredTrackId?: string,
  fallbackTrackId?: string,
): string | undefined {
  const preferred = project.tracks.find((track) => track.id === preferredTrackId && track.kind === kind && !track.locked);
  if (preferred) {
    return preferred.id;
  }

  const fallback = project.tracks.find((track) => track.id === fallbackTrackId && track.kind === kind && !track.locked);
  if (fallback) {
    return fallback.id;
  }

  return project.tracks.find((track) => track.kind === kind && !track.locked)?.id;
}

export function normalizeSourceRange(asset: EditorAsset, range?: SourceRange): SourceRange {
  const duration = roundTime(Math.max(0, asset.duration));
  const sourceIn = roundTime(clampNumber(range?.in ?? 0, 0, duration));
  const sourceOut = roundTime(clampNumber(range?.out ?? duration, 0, duration));

  return {
    in: Math.min(sourceIn, sourceOut),
    out: Math.max(sourceIn, sourceOut),
  };
}

export function resolveSourceMonitorPlayhead({
  asset,
  time,
}: {
  asset?: EditorAsset;
  time: number;
}): number {
  if (!asset) {
    return 0;
  }

  return roundTime(clampNumber(time, 0, asset.duration));
}

export function resolveSourceMonitorNudgePlayhead({
  asset,
  currentPlayhead,
  deltaSeconds,
}: {
  asset?: EditorAsset;
  currentPlayhead: number;
  deltaSeconds: number;
}): number {
  return resolveSourceMonitorPlayhead({
    asset,
    time: currentPlayhead + deltaSeconds,
  });
}

export function resolveSourceMonitorPlaybackRateState(rate: number): SourceMonitorPlaybackRateState {
  return {
    activeMonitor: 'source',
    sourcePlaybackRate: rate,
  };
}

export function resolveSourceMonitorPlaybackToggleRate(currentRate: number): number {
  return currentRate === 0 ? 1 : 0;
}

export function resolveSourceMonitorShuttlePlaybackState({
  currentRate,
  direction,
}: {
  currentRate: number;
  direction: ShuttleDirection;
}): SourceMonitorPlaybackRateState {
  return resolveSourceMonitorPlaybackRateState(stepShuttleRate(currentRate, direction));
}

export function resolveSourceMonitorLoopPlaybackToggle({
  sourceLoopPlaybackEnabled,
  asset,
  sourceRange,
  sourcePlayhead,
}: {
  sourceLoopPlaybackEnabled: boolean;
  asset?: EditorAsset;
  sourceRange: SourceRange | null;
  sourcePlayhead: number;
}): SourceMonitorLoopPlaybackTogglePlan {
  if (sourceLoopPlaybackEnabled) {
    return {
      sourceLoopPlaybackEnabled: false,
      activeMonitor: 'source',
      status: 'Source loop off',
    };
  }

  if (!asset || !sourceRange) {
    return {
      sourceLoopPlaybackEnabled: false,
      activeMonitor: 'source',
      status: 'Select a source range before source loop playback',
    };
  }

  const normalizedRange = normalizeSourceRange(asset, sourceRange);
  if (normalizedRange.out - normalizedRange.in <= 0.001) {
    return {
      sourceLoopPlaybackEnabled: false,
      activeMonitor: 'source',
      status: 'Set a longer source range before source loop playback',
    };
  }

  const nextSourcePlayhead = !Number.isFinite(sourcePlayhead) || sourcePlayhead < normalizedRange.in || sourcePlayhead > normalizedRange.out
    ? normalizedRange.in
    : undefined;

  return {
    sourceLoopPlaybackEnabled: true,
    activeMonitor: 'source',
    ...(nextSourcePlayhead === undefined ? {} : { nextSourcePlayhead }),
    status: 'Source loop on',
  };
}

export function resolveValidatedSourceLoopPlaybackEnabled({
  sourceLoopPlaybackEnabled,
  asset,
  sourceRange,
}: {
  sourceLoopPlaybackEnabled: boolean;
  asset?: EditorAsset;
  sourceRange: SourceRange | null;
}): boolean {
  if (!sourceLoopPlaybackEnabled || !asset || !sourceRange) {
    return false;
  }

  const normalizedRange = normalizeSourceRange(asset, sourceRange);
  return normalizedRange.out - normalizedRange.in > 0.001;
}

export function resolveSourceAssetSelection({
  assetId,
  asset,
  currentRange,
}: {
  assetId: string;
  asset?: EditorAsset;
  currentRange?: SourceRange;
}): SourceAssetSelectionPlan {
  const sourcePlayhead = asset
    ? normalizeSourceRange(asset, currentRange).in
    : undefined;

  return {
    selectedSourceAssetId: assetId,
    activeMonitor: 'source',
    sourcePlaybackRate: 0,
    ...(sourcePlayhead === undefined ? {} : { sourcePlayhead }),
  };
}

export function resolveValidatedSourceAssetId({
  assets,
  selectedSourceAssetId,
}: {
  assets: EditorAsset[];
  selectedSourceAssetId: string;
}): string {
  if (assets.length === 0) {
    return '';
  }

  return assets.some((asset) => asset.id === selectedSourceAssetId)
    ? selectedSourceAssetId
    : assets[0].id;
}

export function resolveSourceMonitorPlaybackGuard({
  asset,
  selectedSourceRange,
  currentPlayhead,
}: {
  asset?: EditorAsset;
  selectedSourceRange: SourceRange | null;
  currentPlayhead: number;
}): SourceMonitorPlaybackGuardPlan {
  if (!asset || !selectedSourceRange) {
    return {
      hasSource: false,
      sourcePlayhead: 0,
      sourcePlaybackRate: 0,
    };
  }

  if (currentPlayhead > 0 && currentPlayhead <= asset.duration) {
    return {
      hasSource: true,
      sourcePlayhead: currentPlayhead,
    };
  }

  return {
    hasSource: true,
    sourcePlayhead: selectedSourceRange.in,
  };
}

export function resolveSourceWorkspaceState({
  project,
  assetById,
  selectedSourceAssetId,
  sourceRangesByAssetId,
  sourcePrimaryPatchTrackId,
  sourceAudioPatchTrackId,
  selectedTrackId,
}: {
  project: EditorProject;
  assetById: Map<string, EditorAsset>;
  selectedSourceAssetId: string;
  sourceRangesByAssetId: Record<string, SourceRange>;
  sourcePrimaryPatchTrackId: string;
  sourceAudioPatchTrackId: string;
  selectedTrackId: string;
}): SourceWorkspaceState {
  const selectedSourceAsset = assetById.get(selectedSourceAssetId) ?? project.assets[0];
  const selectedSourceRange = selectedSourceAsset
    ? normalizeSourceRange(selectedSourceAsset, sourceRangesByAssetId[selectedSourceAsset.id])
    : null;
  const selectedSourcePrimaryKind = selectedSourceAsset ? trackKindForSourceAsset(selectedSourceAsset) : 'video';
  const selectedSourceMediaKind = resolveRenderableAssetMediaKind(selectedSourceAsset);
  const selectedSourceHasPrimaryPatch = Boolean(selectedSourceAsset && selectedSourceMediaKind !== 'audio');
  const selectedSourceHasAudioPatch = Boolean(selectedSourceAsset && hasTimelineAudio(selectedSourceAsset));
  const activeSourcePrimaryPatchTrackId = selectedSourceHasPrimaryPatch
    ? resolveEditableTrackId(project, selectedSourcePrimaryKind, sourcePrimaryPatchTrackId, selectedTrackId)
    : undefined;
  const activeSourceAudioPatchTrackId = selectedSourceHasAudioPatch
    ? resolveEditableTrackId(project, 'audio', sourceAudioPatchTrackId, selectedTrackId)
    : undefined;

  return {
    selectedSourceAsset,
    selectedSourceRange,
    selectedSourceDuration: selectedSourceRange
      ? roundTime(Math.max(0, selectedSourceRange.out - selectedSourceRange.in))
      : 0,
    selectedSourceAssetBin: selectedSourceAsset ? readAssetBin(selectedSourceAsset) : 'Unsorted',
    selectedSourcePrimaryKind,
    selectedSourceHasPrimaryPatch,
    selectedSourceHasAudioPatch,
    activeSourcePrimaryPatchTrackId,
    activeSourceAudioPatchTrackId,
    activeSourcePrimaryPatchTrack: activeSourcePrimaryPatchTrackId
      ? project.tracks.find((track) => track.id === activeSourcePrimaryPatchTrackId)
      : undefined,
    activeSourceAudioPatchTrack: activeSourceAudioPatchTrackId
      ? project.tracks.find((track) => track.id === activeSourceAudioPatchTrackId)
      : undefined,
  };
}

export function auditSourceMonitorConsistency({
  project,
  assetById,
  selectedSourceAssetId,
  sourceRangesByAssetId,
  sourcePlayhead,
  sourceLoopPlaybackEnabled,
  sourcePrimaryPatchTrackId,
  sourceAudioPatchTrackId,
  selectedTrackId,
  sourcePrimaryPatchEnabled = true,
  sourceAudioPatchEnabled = true,
}: {
  project: EditorProject;
  assetById?: Map<string, EditorAsset>;
  selectedSourceAssetId: string;
  sourceRangesByAssetId: Record<string, SourceRange>;
  sourcePlayhead: number;
  sourceLoopPlaybackEnabled: boolean;
  sourcePrimaryPatchTrackId: string;
  sourceAudioPatchTrackId: string;
  selectedTrackId: string;
  sourcePrimaryPatchEnabled?: boolean;
  sourceAudioPatchEnabled?: boolean;
}): SourceMonitorConsistencyAuditReport {
  const issues: SourceMonitorConsistencyIssue[] = [];
  const effectiveAssetById = assetById ?? new Map(project.assets.map((asset) => [asset.id, asset]));
  const normalizedSelectedSourceAssetId = resolveValidatedSourceAssetId({
    assets: project.assets,
    selectedSourceAssetId,
  });

  if (project.assets.length === 0) {
    issues.push({
      type: 'missing-selected-source-asset',
      severity: 'error',
      message: 'Source Monitor has no media asset to select.',
    });
  } else if (normalizedSelectedSourceAssetId !== selectedSourceAssetId) {
    issues.push({
      type: 'missing-selected-source-asset',
      severity: 'warning',
      message: `Selected source asset "${selectedSourceAssetId}" is missing; falling back to "${normalizedSelectedSourceAssetId}".`,
      assetId: selectedSourceAssetId,
    });
  }

  const workspace = resolveSourceWorkspaceState({
    project,
    assetById: effectiveAssetById,
    selectedSourceAssetId: normalizedSelectedSourceAssetId,
    sourceRangesByAssetId,
    sourcePrimaryPatchTrackId,
    sourceAudioPatchTrackId,
    selectedTrackId,
  });
  const selectedSourceAsset = workspace.selectedSourceAsset;
  const rawRange = selectedSourceAsset ? sourceRangesByAssetId[selectedSourceAsset.id] : undefined;
  const rangeChanged = Boolean(rawRange && workspace.selectedSourceRange && (
    rawRange.in !== workspace.selectedSourceRange.in
    || rawRange.out !== workspace.selectedSourceRange.out
  ));

  if (rangeChanged && selectedSourceAsset && workspace.selectedSourceRange) {
    issues.push({
      type: 'invalid-source-range',
      severity: 'warning',
      message: `Source range for "${selectedSourceAsset.id}" was clamped to asset duration.`,
      assetId: selectedSourceAsset.id,
    });
  }

  const validLoopPlaybackEnabled = resolveValidatedSourceLoopPlaybackEnabled({
    sourceLoopPlaybackEnabled,
    asset: selectedSourceAsset,
    sourceRange: workspace.selectedSourceRange,
  });
  const normalizedSourcePlayhead = resolveAuditedSourcePlayhead({
    asset: selectedSourceAsset,
    sourceRange: workspace.selectedSourceRange,
    sourcePlayhead,
    sourceLoopPlaybackEnabled: validLoopPlaybackEnabled,
  });
  const shouldUpdateSourcePlayhead = !numbersEqual(sourcePlayhead, normalizedSourcePlayhead);

  if (shouldUpdateSourcePlayhead) {
    issues.push({
      type: 'source-playhead-normalized',
      severity: 'warning',
      message: 'Source Monitor playhead was normalized to the active source bounds.',
      assetId: selectedSourceAsset?.id,
    });
  }

  if (sourceLoopPlaybackEnabled && !validLoopPlaybackEnabled) {
    issues.push({
      type: 'source-loop-disabled',
      severity: 'warning',
      message: 'Source loop playback was disabled because the active source range is not playable.',
      assetId: selectedSourceAsset?.id,
    });
  }

  if (workspace.selectedSourceHasPrimaryPatch && !workspace.activeSourcePrimaryPatchTrackId) {
    issues.push({
      type: 'missing-primary-patch-track',
      severity: 'warning',
      message: 'Source primary patch has no editable target track.',
      assetId: selectedSourceAsset?.id,
      trackId: sourcePrimaryPatchTrackId,
    });
  }

  if (workspace.selectedSourceHasAudioPatch && !workspace.activeSourceAudioPatchTrackId) {
    issues.push({
      type: 'missing-audio-patch-track',
      severity: 'warning',
      message: 'Source audio patch has no editable target track.',
      assetId: selectedSourceAsset?.id,
      trackId: sourceAudioPatchTrackId,
    });
  }

  const hasEnabledPrimaryPatch = sourcePrimaryPatchEnabled
    && workspace.selectedSourceHasPrimaryPatch
    && Boolean(workspace.activeSourcePrimaryPatchTrackId);
  const hasEnabledAudioPatch = sourceAudioPatchEnabled
    && workspace.selectedSourceHasAudioPatch
    && Boolean(workspace.activeSourceAudioPatchTrackId);

  if (selectedSourceAsset && !hasEnabledPrimaryPatch && !hasEnabledAudioPatch) {
    issues.push({
      type: 'source-patch-disabled',
      severity: 'warning',
      message: 'No enabled source patch target can receive the selected asset.',
      assetId: selectedSourceAsset.id,
    });
  }

  const status = issues.some((issue) => issue.severity === 'error')
    ? 'failed'
    : issues.length > 0
      ? 'warning'
      : 'passed';

  return {
    status,
    workspace,
    selectedSourceAssetId: normalizedSelectedSourceAssetId,
    sourceRange: workspace.selectedSourceRange,
    sourcePlayhead: normalizedSourcePlayhead,
    sourceLoopPlaybackEnabled: validLoopPlaybackEnabled,
    sourcePrimaryPatchTrackId: workspace.activeSourcePrimaryPatchTrackId,
    sourceAudioPatchTrackId: workspace.activeSourceAudioPatchTrackId,
    sourcePrimaryPatchEnabled,
    sourceAudioPatchEnabled,
    shouldUpdateSelectedSourceAssetId: normalizedSelectedSourceAssetId !== selectedSourceAssetId,
    shouldUpdateSourceRange: rangeChanged,
    shouldUpdateSourcePlayhead,
    shouldDisableSourceLoopPlayback: sourceLoopPlaybackEnabled && !validLoopPlaybackEnabled,
    issues,
  };
}

function resolveAuditedSourcePlayhead({
  asset,
  sourceRange,
  sourcePlayhead,
  sourceLoopPlaybackEnabled,
}: {
  asset?: EditorAsset;
  sourceRange: SourceRange | null;
  sourcePlayhead: number;
  sourceLoopPlaybackEnabled: boolean;
}): number {
  if (!asset) {
    return 0;
  }

  if (sourceLoopPlaybackEnabled && sourceRange) {
    return roundTime(clampNumber(sourcePlayhead, sourceRange.in, sourceRange.out));
  }

  if (!Number.isFinite(sourcePlayhead) && sourceRange) {
    return sourceRange.in;
  }

  return resolveSourceMonitorPlayhead({ asset, time: sourcePlayhead });
}

function numbersEqual(first: number, second: number): boolean {
  return Math.abs(first - second) < 0.001;
}
