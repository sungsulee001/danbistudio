import { isAdjustmentLayerClip } from '../../lib/editor/adjustment-layer';
import { buildAudioPeakNormalizePlan, type AudioPeakNormalizePlan } from '../../lib/editor/audio-normalize';
import { isCropMaskEffect } from '../../lib/editor/crop-mask';
import {
  clipHasTimelineAudio,
  getDetachedAudioClipId,
  getLinkedVideoClipId,
  hasEmbeddedAudio,
} from '../../lib/editor/media-metadata';
import { isRenderableVideoMediaAsset, isRenderableVisualMediaAsset } from '../../lib/editor/renderable-media-kind';
import type { EditorAsset, TimelineClip, TimelineTrack } from '../../lib/editor/types';
import { resolveAssetRuntimeWaveformPeaks, resolveWaveformPeaks } from '../../lib/editor/waveform-cache';
import { clipHasUsableWaveform, findSelectedAudioVideoPair } from './timeline-source-helpers';

export interface SelectedAudioVideoPair {
  videoClip: TimelineClip;
  audioClip: TimelineClip;
}

export interface SelectedClipCapabilities {
  selectedCanUseMotion: boolean;
  selectedCanUseProgramMonitorMotion: boolean;
  selectedVisualFadeClipIds: string[];
  selectedCanApplyVisualFade: boolean;
  selectedCanvasLayoutClipIds: string[];
  selectedCanApplyCanvasLayout: boolean;
  selectedMotionPresetClipIds: string[];
  selectedCanApplyMotionPreset: boolean;
  selectedFreezeFrameClipIds: string[];
  selectedCanApplyFreezeFrame: boolean;
  selectedCanClearFreezeFrame: boolean;
  selectedCanDetachAudio: boolean;
  selectedCanRelinkAudio: boolean;
  selectedCanUnlinkAudio: boolean;
  selectedLinkPair: SelectedAudioVideoPair | null;
  selectedCanLinkAudio: boolean;
  selectedAudioSyncPair: SelectedAudioVideoPair | null;
  selectedCanSyncByWaveform: boolean;
  selectedCropPresetClipIds: string[];
  selectedCanApplyCropPreset: boolean;
  selectedCropMaskAddClipIds: string[];
  selectedCanAddCropMask: boolean;
  selectedColorPresetClipIds: string[];
  selectedCanApplyColorPreset: boolean;
  selectedColorEffectAddClipIds: string[];
  selectedCanAddColorEffect: boolean;
  selectedCanAddColorMatch: boolean;
  selectedCanApplyColorLut: boolean;
  selectedVisualFilterClipIds: string[];
  selectedCanApplyVisualFilter: boolean;
  selectedAiEnhancementClipIds: string[];
  selectedCanApplyAiEnhancement: boolean;
  selectedSmartReframeAddClipIds: string[];
  selectedCanAddSmartReframe: boolean;
  selectedSubjectTrackingClipIds: string[];
  selectedCanTrackSubject: boolean;
  selectedObjectMaskClipIds: string[];
  selectedCanApplyObjectMask: boolean;
  selectedStabilizeClipIds: string[];
  selectedCanApplyStabilize: boolean;
  selectedAudioGainAddClipIds: string[];
  selectedCanAddAudioGain: boolean;
  selectedAudioCleanupClipIds: string[];
  selectedCanApplyAudioCleanup: boolean;
  selectedAudioFadeClipIds: string[];
  selectedCanApplyAudioFade: boolean;
  selectedNormalizeClipIds: string[];
  selectedCanNormalizeAudio: boolean;
  selectedPeakNormalizePlan: AudioPeakNormalizePlan | null;
  selectedCanRemoveSilence: boolean;
  selectedCanDetectBeats: boolean;
}

export function resolveSelectedClipCapabilities({
  selectedClip,
  selectedClips,
  selectedClipTrack,
  selectedClipAsset,
  selectedClipAnalysisAsset,
  assetById,
  audioPeaksByAssetId,
  audioNormalizeTargetPeak,
}: {
  selectedClip?: TimelineClip;
  selectedClips: TimelineClip[];
  selectedClipTrack?: TimelineTrack;
  selectedClipAsset?: EditorAsset;
  selectedClipAnalysisAsset?: EditorAsset;
  assetById: Map<string, EditorAsset>;
  audioPeaksByAssetId: Record<string, number[]>;
  audioNormalizeTargetPeak: number;
}): SelectedClipCapabilities {
  const selectedVisualFadeClipIds = selectedClips.filter((clip) => (
    isVisualTimelineClip(clip, assetForClip(clip, assetById), { includeText: true })
  )).map((clip) => clip.id);
  const selectedCanvasLayoutClipIds = selectedVisualFadeClipIds;
  const selectedMotionPresetClipIds = selectedVisualFadeClipIds;
  const selectedFreezeFrameClipIds = selectedClips.filter((clip) => (
    isRenderableVideoMediaAsset(assetForClip(clip, assetById))
  )).map((clip) => clip.id);
  const selectedCropPresetClipIds = selectedClips.filter((clip) => (
    isVisualTimelineClip(clip, assetForClip(clip, assetById), { includeText: false })
  )).map((clip) => clip.id);
  const selectedCropMaskAddClipIds = selectedClips.filter((clip) => (
    isVisualTimelineClip(clip, assetForClip(clip, assetById), { includeText: false }) &&
    !clip.effects.some(isCropMaskEffect)
  )).map((clip) => clip.id);
  const selectedColorPresetClipIds = selectedClips.filter((clip) => {
    const asset = assetForClip(clip, assetById);
    return isVisualTimelineClip(clip, asset, { includeText: false }) || isAdjustmentLayerClip(clip, asset);
  }).map((clip) => clip.id);
  const selectedColorEffectAddClipIds = selectedClips.filter((clip) => {
    const asset = assetForClip(clip, assetById);
    return (
      isVisualTimelineClip(clip, asset, { includeText: false }) ||
      isAdjustmentLayerClip(clip, asset)
    ) && !clip.effects.some((effect) => effect.type === 'color');
  }).map((clip) => clip.id);
  const selectedSmartReframeAddClipIds = selectedClips.filter((clip) => (
    isVisualTimelineClip(clip, assetForClip(clip, assetById), { includeText: false }) &&
    !clip.effects.some((effect) => effect.type === 'reframe')
  )).map((clip) => clip.id);
  const selectedSubjectTrackingClipIds = selectedClips.filter((clip) => (
    isVisualTimelineClip(clip, assetForClip(clip, assetById), { includeText: false })
  )).map((clip) => clip.id);
  const selectedStabilizeClipIds = selectedClips.filter((clip) => {
    const asset = assetForClip(clip, assetById);
    return clip.kind === 'video' || isRenderableVideoMediaAsset(asset);
  }).map((clip) => clip.id);
  const selectedAudioGainAddClipIds = selectedClips.filter((clip) => {
    const asset = assetForClip(clip, assetById);
    return clipHasTimelineAudio(clip, asset) &&
      !clip.effects.some((effect) => effect.type === 'audio' && effect.parameters.gainDb !== undefined);
  }).map((clip) => clip.id);
  const selectedAudioCleanupClipIds = selectedClips.filter((clip) => (
    clipHasTimelineAudio(clip, assetForClip(clip, assetById))
  )).map((clip) => clip.id);
  const selectedAudioFadeClipIds = selectedAudioCleanupClipIds;
  const selectedLinkPair = findSelectedAudioVideoPair(selectedClips, assetById);
  const selectedAudioSyncPair = resolveSelectedAudioSyncPair(selectedLinkPair, assetById);
  const selectedCanSyncByWaveform = Boolean(
    selectedAudioSyncPair &&
    clipHasUsableWaveform(selectedAudioSyncPair.videoClip, assetById, audioPeaksByAssetId) &&
    clipHasUsableWaveform(selectedAudioSyncPair.audioClip, assetById, audioPeaksByAssetId),
  );
  const selectedNormalizeClipIds = selectedClips.filter((clip) => {
    const asset = assetForClip(clip, assetById);
    if (!asset || !clipHasTimelineAudio(clip, asset)) {
      return false;
    }

    return Boolean(resolveWaveformPeaks(
      asset,
      resolveAssetRuntimeWaveformPeaks(asset, audioPeaksByAssetId),
    )?.length);
  }).map((clip) => clip.id);
  const selectedCanNormalizeAudio = selectedNormalizeClipIds.length > 0;

  return {
    selectedCanUseMotion: canUseMotion(selectedClip, selectedClipAsset),
    selectedCanUseProgramMonitorMotion: canUseProgramMonitorMotion(selectedClip, selectedClipAsset, selectedClipTrack),
    selectedVisualFadeClipIds,
    selectedCanApplyVisualFade: selectedVisualFadeClipIds.length > 0,
    selectedCanvasLayoutClipIds,
    selectedCanApplyCanvasLayout: selectedCanvasLayoutClipIds.length > 0,
    selectedMotionPresetClipIds,
    selectedCanApplyMotionPreset: selectedMotionPresetClipIds.length > 0,
    selectedFreezeFrameClipIds,
    selectedCanApplyFreezeFrame: selectedFreezeFrameClipIds.length > 0,
    selectedCanClearFreezeFrame: selectedClips.some((clip) => (
      selectedFreezeFrameClipIds.includes(clip.id) &&
      typeof clip.freezeFrameTime === 'number' &&
      Number.isFinite(clip.freezeFrameTime)
    )),
    selectedCanDetachAudio: Boolean(
      selectedClip &&
      selectedClip.kind !== 'audio' &&
      hasEmbeddedAudio(selectedClipAsset) &&
      !getDetachedAudioClipId(selectedClip),
    ),
    selectedCanRelinkAudio: Boolean(
      selectedClip &&
      (getDetachedAudioClipId(selectedClip) || getLinkedVideoClipId(selectedClip)),
    ),
    selectedCanUnlinkAudio: Boolean(
      selectedClip &&
      (getDetachedAudioClipId(selectedClip) || getLinkedVideoClipId(selectedClip)),
    ),
    selectedLinkPair,
    selectedCanLinkAudio: Boolean(selectedLinkPair),
    selectedAudioSyncPair,
    selectedCanSyncByWaveform,
    selectedCropPresetClipIds,
    selectedCanApplyCropPreset: selectedCropPresetClipIds.length > 0,
    selectedCropMaskAddClipIds,
    selectedCanAddCropMask: selectedCropMaskAddClipIds.length > 0,
    selectedColorPresetClipIds,
    selectedCanApplyColorPreset: selectedColorPresetClipIds.length > 0,
    selectedColorEffectAddClipIds,
    selectedCanAddColorEffect: selectedColorEffectAddClipIds.length > 0,
    selectedCanAddColorMatch: selectedColorPresetClipIds.length > 0,
    selectedCanApplyColorLut: selectedColorPresetClipIds.length > 0,
    selectedVisualFilterClipIds: selectedColorPresetClipIds,
    selectedCanApplyVisualFilter: selectedColorPresetClipIds.length > 0,
    selectedAiEnhancementClipIds: selectedColorPresetClipIds,
    selectedCanApplyAiEnhancement: selectedColorPresetClipIds.length > 0,
    selectedSmartReframeAddClipIds,
    selectedCanAddSmartReframe: selectedSmartReframeAddClipIds.length > 0,
    selectedSubjectTrackingClipIds,
    selectedCanTrackSubject: selectedSubjectTrackingClipIds.length > 0,
    selectedObjectMaskClipIds: selectedSubjectTrackingClipIds,
    selectedCanApplyObjectMask: selectedSubjectTrackingClipIds.length > 0,
    selectedStabilizeClipIds,
    selectedCanApplyStabilize: selectedStabilizeClipIds.length > 0,
    selectedAudioGainAddClipIds,
    selectedCanAddAudioGain: selectedAudioGainAddClipIds.length > 0,
    selectedAudioCleanupClipIds,
    selectedCanApplyAudioCleanup: selectedAudioCleanupClipIds.length > 0,
    selectedAudioFadeClipIds,
    selectedCanApplyAudioFade: selectedAudioFadeClipIds.length > 0,
    selectedNormalizeClipIds,
    selectedCanNormalizeAudio,
    selectedPeakNormalizePlan: resolvePeakNormalizePlan(
      selectedClip,
      selectedClipAnalysisAsset,
      selectedCanNormalizeAudio,
      audioNormalizeTargetPeak,
    ),
    selectedCanRemoveSilence: Boolean(
      selectedClip &&
      selectedClipAnalysisAsset &&
      clipHasTimelineAudio(selectedClip, selectedClipAnalysisAsset) &&
      resolveWaveformPeaks(selectedClipAnalysisAsset)?.length,
    ),
    selectedCanDetectBeats: Boolean(
      selectedClip &&
      selectedClipAnalysisAsset &&
      clipHasTimelineAudio(selectedClip, selectedClipAnalysisAsset) &&
      resolveWaveformPeaks(selectedClipAnalysisAsset)?.length,
    ),
  };
}

function assetForClip(clip: TimelineClip, assetById: Map<string, EditorAsset>): EditorAsset | undefined {
  return clip.assetId ? assetById.get(clip.assetId) : undefined;
}

function resolveSelectedAudioSyncPair(
  selectedLinkPair: SelectedAudioVideoPair | null,
  assetById: Map<string, EditorAsset>,
): SelectedAudioVideoPair | null {
  if (!selectedLinkPair) {
    return null;
  }

  const videoAsset = assetForClip(selectedLinkPair.videoClip, assetById);
  const audioAsset = assetForClip(selectedLinkPair.audioClip, assetById);
  return videoAsset &&
    audioAsset &&
    clipHasTimelineAudio(selectedLinkPair.videoClip, videoAsset) &&
    clipHasTimelineAudio(selectedLinkPair.audioClip, audioAsset)
    ? selectedLinkPair
    : null;
}

function isVisualTimelineClip(
  clip: TimelineClip,
  asset: EditorAsset | undefined,
  { includeText }: { includeText: boolean },
): boolean {
  return clip.kind === 'video' ||
    clip.kind === 'image' ||
    isRenderableVisualMediaAsset(asset) ||
    (includeText && (clip.kind === 'text' || asset?.kind === 'text'));
}

function canUseMotion(clip: TimelineClip | undefined, asset: EditorAsset | undefined): boolean {
  return Boolean(
    clip &&
    (
      clip.kind === 'video' ||
      clip.kind === 'image' ||
      clip.kind === 'text' ||
      isRenderableVisualMediaAsset(asset) ||
      asset?.kind === 'text'
    ),
  );
}

function canUseProgramMonitorMotion(
  clip: TimelineClip | undefined,
  asset: EditorAsset | undefined,
  track: TimelineTrack | undefined,
): boolean {
  return Boolean(
    clip &&
    (
      clip.kind === 'video' ||
      clip.kind === 'image' ||
      clip.kind === 'text' ||
      isRenderableVisualMediaAsset(asset) ||
      asset?.kind === 'text'
    ) &&
    !clip.locked &&
    !track?.locked &&
    !clip.keyframes.some((keyframe) => (
      keyframe.property === 'positionX' ||
      keyframe.property === 'positionY' ||
      keyframe.property === 'scale' ||
      keyframe.property === 'rotation'
    )),
  );
}

function resolvePeakNormalizePlan(
  clip: TimelineClip | undefined,
  asset: EditorAsset | undefined,
  canNormalizeAudio: boolean,
  targetPeak: number,
): AudioPeakNormalizePlan | null {
  if (!clip || !asset || !canNormalizeAudio) {
    return null;
  }

  try {
    return buildAudioPeakNormalizePlan(clip, asset, targetPeak);
  } catch {
    return null;
  }
}
