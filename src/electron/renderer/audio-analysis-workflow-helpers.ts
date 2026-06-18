import type { BeatDetectionPlan } from '../../lib/editor/beat-detection';
import type { SilenceRemovalPlan } from '../../lib/editor/silence-removal';
import type { EditorAsset, EditorProject, TimelineClip } from '../../lib/editor/types';
import {
  buildWaveformRuntimeReadRequests,
  mergeWaveformPeakEntries,
  normalizeWaveformPeaks,
  resolveAssetRuntimeWaveformPeaks,
  resolveAssetWaveformPeaks,
} from '../../lib/editor/waveform-cache';

export type RuntimeAudioPeakMap = Record<string, number[]>;

export interface RuntimeAudioPeakReadRequest {
  assetId: string;
  source: string;
}

export interface RuntimeAudioPeakEntry {
  assetId: string;
  peaks: number[];
}

export type AudioAnalysisTargetPlan =
  | {
    canAnalyze: false;
    status: string;
  }
  | {
    canAnalyze: true;
    clipId: string;
    assetId?: string;
  };

export type BeatActionPlan =
  | {
    canApply: false;
    status: string;
  }
  | {
    canApply: true;
    plan: BeatDetectionPlan;
  };

export type AudioAnalysisFailureKind =
  | 'silence-analysis'
  | 'silence-removal'
  | 'beat-analysis'
  | 'beat-markers'
  | 'beat-cut';

export function resolveAudioAnalysisTargetPlan(
  selectedClip?: TimelineClip | null,
): AudioAnalysisTargetPlan {
  if (!selectedClip) {
    return { canAnalyze: false, status: 'Select a clip first' };
  }

  return {
    canAnalyze: true,
    clipId: selectedClip.id,
    assetId: selectedClip.assetId,
  };
}

export function resolveReusableBeatPlan({
  selectedClipId,
  beatPlan,
}: {
  selectedClipId: string;
  beatPlan: BeatDetectionPlan | null;
}): BeatDetectionPlan | null {
  return beatPlan?.clipId === selectedClipId ? beatPlan : null;
}

export function resolveBeatActionPlan(plan: BeatDetectionPlan): BeatActionPlan {
  if (plan.beats.length === 0) {
    return { canApply: false, status: 'No beats detected' };
  }

  return { canApply: true, plan };
}

export function resolveRuntimeAudioPeakReadRequests({
  assets,
  audioPeaksByAssetId,
}: {
  assets: EditorAsset[];
  audioPeaksByAssetId: RuntimeAudioPeakMap;
}): RuntimeAudioPeakReadRequest[] {
  return buildWaveformRuntimeReadRequests({ assets, runtimePeaksByAssetId: audioPeaksByAssetId });
}

export function mergeRuntimeAudioPeakEntries(
  current: RuntimeAudioPeakMap,
  entries: RuntimeAudioPeakEntry[],
): RuntimeAudioPeakMap {
  return mergeWaveformPeakEntries(current, entries);
}

export function applyRuntimeWaveformToProject({
  project,
  assetId,
  audioPeaksByAssetId,
  generatedAt = new Date().toISOString(),
}: {
  project: EditorProject;
  assetId?: string;
  audioPeaksByAssetId: RuntimeAudioPeakMap;
  generatedAt?: string;
}): EditorProject {
  if (!assetId) {
    return project;
  }

  const targetAsset = project.assets.find((asset) => asset.id === assetId);
  const runtimePeaks = normalizeWaveformPeaks(resolveAssetRuntimeWaveformPeaks(targetAsset, audioPeaksByAssetId));
  if (!targetAsset || !runtimePeaks.length) {
    return project;
  }

  return {
    ...project,
    assets: project.assets.map((asset) => {
      if (asset.id !== assetId || asset.mediaCache?.waveformPeaks?.length) {
        return asset;
      }

      const resolvedPeaks = resolveAssetWaveformPeaks(asset, runtimePeaks).peaks ?? runtimePeaks;

      return {
        ...asset,
        mediaCache: {
          generatedAt,
          warnings: [],
          ...asset.mediaCache,
          waveformPeaks: resolvedPeaks,
        },
      };
    }),
  };
}

export function applyRuntimeWaveformsToProject({
  project,
  assetIds,
  audioPeaksByAssetId,
  generatedAt = new Date().toISOString(),
}: {
  project: EditorProject;
  assetIds: Array<string | undefined>;
  audioPeaksByAssetId: RuntimeAudioPeakMap;
  generatedAt?: string;
}): EditorProject {
  return Array.from(new Set(assetIds.filter((assetId): assetId is string => Boolean(assetId))))
    .reduce((current, assetId) => applyRuntimeWaveformToProject({
      project: current,
      assetId,
      audioPeaksByAssetId,
      generatedAt,
    }), project);
}

export function formatSilenceAnalysisStatus(plan: SilenceRemovalPlan): string {
  return `${formatCount(plan.ranges.length, 'silence range')} / ${plan.removedDuration.toFixed(2)}s`;
}

export function formatSilenceRemovalStatus(plan: SilenceRemovalPlan): string {
  return `Removed ${formatCount(plan.ranges.length, 'silence range')} / ${plan.removedDuration.toFixed(2)}s`;
}

export function formatBeatDetectionStatus(plan: BeatDetectionPlan): string {
  return `${formatCount(plan.beats.length, 'beat')} detected`;
}

export function formatBeatMarkerStatus(plan: BeatDetectionPlan): string {
  return `Added ${formatCount(plan.beats.length, 'beat marker')}`;
}

export function formatBeatCutStatus(plan: BeatDetectionPlan): string {
  return `Cut selected clip at ${formatCount(plan.beats.length, 'beat')}`;
}

export function formatAudioAnalysisFailureStatus(
  kind: AudioAnalysisFailureKind,
  error: unknown,
): string {
  const message = error instanceof Error ? error.message : String(error);

  switch (kind) {
    case 'silence-analysis':
      return `Silence analysis failed: ${message}`;
    case 'silence-removal':
      return `Silence removal failed: ${message}`;
    case 'beat-analysis':
      return `Beat analysis failed: ${message}`;
    case 'beat-markers':
      return `Beat markers failed: ${message}`;
    case 'beat-cut':
      return `Beat cut failed: ${message}`;
  }
}

function formatCount(count: number, singularLabel: string): string {
  return `${count} ${singularLabel}${count === 1 ? '' : 's'}`;
}
