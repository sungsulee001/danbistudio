import { readClipCanvasLayoutMode, type CanvasLayoutMode } from '../../lib/editor/canvas-layout';
import {
  resolveComfyUIWorkflowBinding,
  resolveProjectDefaultComfyUIWorkflowName,
  type ComfyUIWorkflowBinding,
} from '../../lib/editor/comfyui-workflows';
import {
  buildDefaultMotionTransformParameters,
  findMotionTransformEffect,
  readClipMotionTransform,
  type ClipMotionTransform,
} from '../../lib/editor/motion-transform';
import { resolveWaveformPeaks } from '../../lib/editor/preview-source';
import { summarizeClipSelectionProperties, type ClipSelectionPropertySummary } from '../../lib/editor/selection-summary';
import { hasSpeedRamp, normalizeSpeedRampPoints } from '../../lib/editor/speed-ramp';
import { findClip } from '../../lib/editor/timeline';
import type { CaptionSegment, ClipEffect, ClipKeyframe, EditorAsset, EditorProject, TimelineClip, TimelineTrack } from '../../lib/editor/types';
import { resolveAssetRuntimeWaveformPeaks } from '../../lib/editor/waveform-cache';
import { clampNumber, roundTime } from './editor-time-helpers';
import { compareKeyframes } from './timeline-source-helpers';

export interface SelectedClipWorkspaceState {
  allClips: TimelineClip[];
  selectedClip?: TimelineClip;
  selectedClips: TimelineClip[];
  selectedClipTrack?: TimelineTrack;
  selectedCaptions: CaptionSegment[];
  selectedClipSummary: ClipSelectionPropertySummary;
  selectedClipAsset?: EditorAsset;
  selectedClipWaveform?: number[];
  defaultComfyUIWorkflowName: string;
  selectedComfyUIBinding: ComfyUIWorkflowBinding | null;
  selectedCanEditComfyUIBinding: boolean;
  selectedClipAnalysisAsset?: EditorAsset;
  selectedClipKeyframes: ClipKeyframe[];
  selectedSpeedRampPoints: ReturnType<typeof normalizeSpeedRampPoints>;
  selectedHasSpeedRamp: boolean;
  selectedAnyHasSpeedRamp: boolean;
  selectedMotionEffect?: ClipEffect;
  selectedMotionTransform: ClipMotionTransform;
  selectedCanvasLayoutMode: CanvasLayoutMode;
  selectedIsTitleClip: boolean;
  selectedTitleText: string;
  selectedClipLocalTime: number;
}

export function resolveSelectedClipWorkspaceState({
  project,
  selectedClipId,
  selectedClipIds,
  selectedCaptionIds,
  assetById,
  audioPeaksByAssetId,
  playhead,
}: {
  project: EditorProject;
  selectedClipId: string;
  selectedClipIds: string[];
  selectedCaptionIds: string[];
  assetById: Map<string, EditorAsset>;
  audioPeaksByAssetId: Record<string, number[]>;
  playhead: number;
}): SelectedClipWorkspaceState {
  const allClips = project.tracks.flatMap((track) => track.clips);
  const selectedClip = findClip(project, selectedClipId);
  const selectedClips = allClips.filter((clip) => selectedClipIds.includes(clip.id));
  const selectedClipTrack = selectedClip
    ? project.tracks.find((track) => track.id === selectedClip.trackId)
    : undefined;
  const selectedCaptions = project.captions.filter((caption) => selectedCaptionIds.includes(caption.id));
  const selectedClipSummary = summarizeClipSelectionProperties(selectedClips);
  const selectedClipAsset = selectedClip?.assetId ? assetById.get(selectedClip.assetId) : undefined;
  const selectedClipRuntimeWaveform = resolveAssetRuntimeWaveformPeaks(selectedClipAsset, audioPeaksByAssetId);
  const selectedClipWaveform = resolveWaveformPeaks(selectedClipAsset, selectedClipRuntimeWaveform);
  const defaultComfyUIWorkflowName = resolveProjectDefaultComfyUIWorkflowName(project);
  const selectedComfyUIBinding = selectedClip
    ? resolveComfyUIWorkflowBinding(selectedClip, {
      defaultWorkflowName: defaultComfyUIWorkflowName,
      projectWidth: project.width,
      projectHeight: project.height,
      project,
    })
    : null;
  const selectedCanEditComfyUIBinding = Boolean(selectedClip && !selectedClip.locked && !selectedClipTrack?.locked);
  const selectedClipAnalysisAsset = resolveSelectedClipAnalysisAsset(selectedClipAsset, selectedClipWaveform);
  const selectedIsTitleClip = Boolean(selectedClip && (selectedClip.kind === 'text' || selectedClipAsset?.kind === 'text'));

  return {
    allClips,
    selectedClip,
    selectedClips,
    selectedClipTrack,
    selectedCaptions,
    selectedClipSummary,
    selectedClipAsset,
    selectedClipWaveform,
    defaultComfyUIWorkflowName,
    selectedComfyUIBinding,
    selectedCanEditComfyUIBinding,
    selectedClipAnalysisAsset,
    selectedClipKeyframes: (selectedClip?.keyframes ?? []).slice().sort(compareKeyframes),
    selectedSpeedRampPoints: selectedClip
      ? normalizeSpeedRampPoints(selectedClip.speedRamp, selectedClip.duration)
      : [],
    selectedHasSpeedRamp: Boolean(selectedClip && hasSpeedRamp(selectedClip)),
    selectedAnyHasSpeedRamp: selectedClips.some((clip) => hasSpeedRamp(clip)),
    selectedMotionEffect: selectedClip ? findMotionTransformEffect(selectedClip) : undefined,
    selectedMotionTransform: selectedClip ? readClipMotionTransform(selectedClip) : buildDefaultMotionTransformParameters(),
    selectedCanvasLayoutMode: selectedClip ? readClipCanvasLayoutMode(selectedClip) : 'fit',
    selectedIsTitleClip,
    selectedTitleText: selectedIsTitleClip
      ? selectedClipAsset?.kind === 'text'
        ? selectedClipAsset.source
        : selectedClip?.name ?? ''
      : '',
    selectedClipLocalTime: selectedClip
      ? roundTime(clampNumber(playhead - selectedClip.start, 0, selectedClip.duration))
      : 0,
  };
}

function resolveSelectedClipAnalysisAsset(
  selectedClipAsset: EditorAsset | undefined,
  selectedClipWaveform: number[] | undefined,
): EditorAsset | undefined {
  if (!selectedClipAsset) {
    return undefined;
  }

  if (!selectedClipWaveform?.length || selectedClipAsset.mediaCache?.waveformPeaks?.length) {
    return selectedClipAsset;
  }

  return {
    ...selectedClipAsset,
    mediaCache: {
      generatedAt: new Date().toISOString(),
      warnings: [],
      ...selectedClipAsset.mediaCache,
      waveformPeaks: selectedClipWaveform,
    },
  };
}
