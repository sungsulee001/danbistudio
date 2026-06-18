import { buildProgramAudioAnalyzer, type ProgramAudioAnalyzerSample } from '../../lib/editor/audio-analyzer';
import { buildProgramAudioMeter, type AudioMeterSample } from '../../lib/editor/audio-meter';
import { buildProgramPreviewStack, type ProgramPreviewStack } from '../../lib/editor/preview';
import { buildSttCaptionReview, type SttCaptionReviewReport } from '../../lib/editor/stt-caption-review';
import { buildSpeakerDiarizationReport, type SpeakerDiarizationReport } from '../../lib/editor/stt-speaker-diarization';
import type { EditorAsset, EditorProject, TimelineClip } from '../../lib/editor/types';
import { buildComfyUIReviewItems } from './comfyui-review-helpers';
import type { ComfyUIQueueJobView, ComfyUIReviewItem } from './editor-view-model';

export interface ProgramReviewWorkspaceState {
  comfyUIReviewItems: ComfyUIReviewItem[];
  selectedComfyUIReviewItem?: ComfyUIReviewItem;
  sttCaptionReview: SttCaptionReviewReport;
  speakerDiarizationReport: SpeakerDiarizationReport;
  programPreviewStack: ProgramPreviewStack;
  programAudioMeter: AudioMeterSample;
  programAudioAnalysis: ProgramAudioAnalyzerSample;
}

export type ProgramPreviewClipSelectionPlan =
  | {
    canSelect: false;
    status: string;
  }
  | {
    canSelect: true;
    clip: TimelineClip;
    activeMonitor: 'program';
    selectedClipId: string;
    selectedTrackId: string;
    status: string;
  };

export function resolveComfyUIReviewSelectionId({
  comfyUIReviewItems,
  selectedComfyUIReviewId,
}: {
  comfyUIReviewItems: ComfyUIReviewItem[];
  selectedComfyUIReviewId: string | null;
}): string | null {
  if (comfyUIReviewItems.length === 0) {
    return null;
  }

  return selectedComfyUIReviewId && comfyUIReviewItems.some((item) => item.result.automationJobId === selectedComfyUIReviewId)
    ? selectedComfyUIReviewId
    : comfyUIReviewItems[0].result.automationJobId;
}

export function resolveProgramReviewWorkspaceState({
  project,
  playhead,
  allClips,
  assetById,
  audioPeaksByAssetId = {},
  comfyUIJob,
  selectedComfyUIReviewId,
}: {
  project: EditorProject;
  playhead: number;
  allClips: TimelineClip[];
  assetById: Map<string, EditorAsset>;
  audioPeaksByAssetId?: Record<string, number[]>;
  comfyUIJob: ComfyUIQueueJobView | null;
  selectedComfyUIReviewId: string | null;
}): ProgramReviewWorkspaceState {
  const comfyUIReviewItems = buildComfyUIReviewItems(comfyUIJob?.results ?? [], allClips, assetById, project);
  const programPreviewStack = buildProgramPreviewStack(project, playhead);

  return {
    comfyUIReviewItems,
    selectedComfyUIReviewItem: comfyUIReviewItems.find((item) => item.result.automationJobId === selectedComfyUIReviewId)
      ?? comfyUIReviewItems[0],
    sttCaptionReview: buildSttCaptionReview(project),
    speakerDiarizationReport: buildSpeakerDiarizationReport(project, { includeNonStt: true }),
    programPreviewStack,
    programAudioMeter: buildProgramAudioMeter(programPreviewStack.audioLayers, { audioPeaksByAssetId }),
    programAudioAnalysis: buildProgramAudioAnalyzer(programPreviewStack.audioLayers, { audioPeaksByAssetId }),
  };
}

export function resolveProgramPreviewClipSelection({
  allClips,
  clipId,
}: {
  allClips: TimelineClip[];
  clipId: string;
}): ProgramPreviewClipSelectionPlan {
  const clip = allClips.find((item) => item.id === clipId);
  if (!clip) {
    return {
      canSelect: false,
      status: 'Preview clip not found',
    };
  }

  return {
    canSelect: true,
    clip,
    activeMonitor: 'program',
    selectedClipId: clip.id,
    selectedTrackId: clip.trackId,
    status: `Selected ${clip.name} from Program Monitor`,
  };
}
