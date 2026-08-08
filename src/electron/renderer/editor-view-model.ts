import type { CaptionSidecarOptions } from '../../lib/editor/caption-sidecar';
import type { ComfyUIResultReference, ComfyUIResultReviewReport } from '../../lib/editor/comfyui-results';
import type { CropMaskParameters } from '../../lib/editor/crop-mask';
import type { ExtensionRenderHookRunResult } from '../../lib/editor/extension-runtime-types';
import type { FfmpegRenderPlan } from '../../lib/editor/ffmpeg-renderer';
import type { ImportedMediaInput } from '../../lib/editor/media-import';
import type { ClipMotionTransform, MotionCenterSnapGuides } from '../../lib/editor/motion-transform';
import type { CaptionSegment, ClipKeyframe, EditorAsset, EditorProject, MediaCacheManifest, TimelineClip } from '../../lib/editor/types';

export const DEFAULT_PIXELS_PER_SECOND = 12;
export const MEDIA_ASSET_DRAG_MIME = 'application/x-danbi-editor-asset-id';
export const KEYFRAME_PROPERTIES: ClipKeyframe['property'][] = ['positionX', 'positionY', 'scale', 'rotation', 'opacity', 'volume'];
export const CLIP_LABEL_COLORS = ['#38bdf8', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#f472b6', '#84cc16', '#14b8a6'];

export interface SavedProjectSummary {
  id: string;
  name: string;
  duration: number;
  clipCount: number;
  updatedAt: string;
}

export interface AutosaveSummary {
  id: string;
  projectId: string;
  name: string;
  duration: number;
  clipCount: number;
  savedAt: string;
  reason: string;
}

export interface UploadedMediaFile {
  originalName: string;
  name?: string;
  mimeType?: string;
  size?: number;
  source: string;
  renderPath: string;
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
  mediaCache?: MediaCacheManifest;
  cacheJob?: MediaCacheJobView;
  metadata?: Record<string, string | number | boolean | undefined>;
}

export interface UploadedLutFile {
  originalName: string;
  name: string;
  source: string;
  renderPath: string;
  size: number;
  interpolation?: string;
}

export interface PreparedImportedMedia {
  input: ImportedMediaInput;
  cacheJob?: MediaCacheJobView;
}

export interface RenderJobView {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  priority: number;
  stderrTail?: string;
  outputPath?: string;
  publicOutputPath?: string;
  error?: string;
  diagnostic?: RenderFailureDiagnosticView;
  extensionHooks?: ExtensionRenderHookRunResult;
  plan?: FfmpegRenderPlan;
}

export interface FfmpegCapabilitiesView {
  ffmpegPath: string;
  detectedAt: string;
  encoders: string[];
  hardwareEncoders: string[];
  warnings: string[];
}

export interface MediaCacheJobView {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  priority: number;
  manifest?: MediaCacheManifest;
  error?: string;
  warnings: string[];
}

export interface ComfyUIQueueJobView {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  priority: number;
  modelName: string;
  execute: boolean;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  results: ComfyUIResultReference[];
  currentClipId?: string;
  error?: string;
  warnings: string[];
}

export interface SttJobView {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  priority: number;
  execute: boolean;
  engine: string;
  language: string;
  totalClips: number;
  completedClips: number;
  failedClips: number;
  currentClipId?: string;
  captions: CaptionSegment[];
  error?: string;
  warnings: string[];
}

export interface ComfyUIReviewItem {
  result: ComfyUIResultReference;
  sourceClip: TimelineClip;
  sourceAsset: EditorAsset | undefined;
  resultAsset: EditorAsset;
  resultClip: TimelineClip;
  reviewReport: ComfyUIResultReviewReport;
}

export interface SourceRange {
  in: number;
  out: number;
}

export type EditorHookEvent = 'manual' | 'on-import' | 'before-export' | 'on-gap';

export interface EditorHookPlanView {
  event: EditorHookEvent;
  matchedRuleCount: number;
  actionCount: number;
  actions: Array<{
    id: string;
    ruleName: string;
    provider: 'local' | 'comfyui' | 'webhook';
    status: 'prepared' | 'skipped';
    description: string;
    localActions?: Array<{
      id: string;
      type: string;
      label: string;
      targetClipIds: string[];
    }>;
    jobs?: Array<{
      id: string;
      clipId: string;
      workflowName: string;
    }>;
    generatePayloads?: Array<{
      workflowName: string;
    }>;
    webhookPayloads?: Array<{
      targetUrl?: string;
      selectedClipIds: string[];
    }>;
    warnings: string[];
  }>;
  warnings: string[];
  queuedJob?: ComfyUIQueueJobView;
  appliedProject?: EditorProject;
  appliedLocalActions?: {
    changed: boolean;
    appliedActionIds: string[];
    appliedClipIds: string[];
    warnings: string[];
  };
  webhookExecution?: {
    requestedCount: number;
    sentCount: number;
    skippedCount: number;
    failedCount: number;
    results: Array<{
      id: string;
      ruleName: string;
      targetUrl?: string;
      status: 'sent' | 'skipped' | 'failed';
      httpStatus?: number;
      attemptCount?: number;
      durationMs: number;
      responsePreview?: string;
      error?: string;
      warnings: string[];
    }>;
    warnings: string[];
  };
}

export interface EditorQueueSettingsView {
  renderConcurrency: number;
  mediaCacheConcurrency: number;
  comfyuiConcurrency: number;
  sttConcurrency: number;
  defaultRenderPriority: number;
  defaultMediaCachePriority: number;
  defaultComfyUIPriority: number;
  defaultSttPriority: number;
}

export interface RenderFailureDiagnosticView {
  category: string;
  summary: string;
  retryable: boolean;
  actions: string[];
  evidence: string[];
}

export interface SilenceRemovalSettings {
  threshold: number;
  minSilenceDuration: number;
  padding: number;
  ripple: boolean;
}

export interface BeatDetectionSettings {
  threshold: number;
  minSpacing: number;
  maxBeats: number;
}

export interface KeyframeDraft {
  property: ClipKeyframe['property'];
  value: number;
  easing: ClipKeyframe['easing'];
}

export interface TimelineClipEditPreview {
  start: number;
  duration: number;
  snapped: boolean;
  constrained: boolean;
  operation?: 'move' | 'trim' | 'roll' | 'slip' | 'slide';
  ripple?: boolean;
  delta?: number;
  groupCount?: number;
  sourceIn?: number;
  sourceInDelta?: number;
  label?: string;
}

export interface TimelineGroupMovePreviewClip {
  id: string;
  trackId: string;
  start: number;
  duration: number;
  label: string;
}

export interface TimelineGroupMovePreview {
  anchorClipId: string;
  operation: 'group-move';
  groupCount: number;
  delta: number;
  clips: TimelineGroupMovePreviewClip[];
}

export interface TimelineGroupTrimPreviewClip {
  id: string;
  trackId: string;
  start: number;
  nextStart: number;
  duration: number;
  nextDuration: number;
  label: string;
}

export interface TimelineGroupTrimPreview {
  anchorClipId: string;
  operation: 'group-trim';
  edge: 'start' | 'end';
  groupCount: number;
  delta: number;
  clips: TimelineGroupTrimPreviewClip[];
}

export interface TimelineNeighborImpactPreviewClip {
  id: string;
  trackId: string;
  role: 'anchor' | 'neighbor';
  start: number;
  duration: number;
  nextStart: number;
  nextDuration: number;
  sourceIn: number;
  nextSourceIn: number;
  label: string;
}

export interface TimelineNeighborImpactPreview {
  anchorClipId: string;
  operation: 'roll' | 'slide';
  edge?: 'start' | 'end';
  delta: number;
  affectedCount: number;
  clips: TimelineNeighborImpactPreviewClip[];
}

export interface TimelineRippleTrimPreviewClip {
  id: string;
  trackId: string;
  start: number;
  nextStart: number;
  duration: number;
  label: string;
}

export interface TimelineRippleTrimPreview {
  anchorClipId: string;
  operation: 'ripple-trim';
  edge: 'start' | 'end';
  delta: number;
  affectedCount: number;
  clips: TimelineRippleTrimPreviewClip[];
}

export interface TimelineClipDropPreview {
  trackId: string;
  start: number;
  duration: number;
  label: string;
  valid: boolean;
  snapped?: boolean;
  constrained?: boolean;
  collision?: boolean;
  ripple?: boolean;
  operation?: 'clip-drop' | 'new-track';
  groupCount?: number;
  isNewTrack?: boolean;
}

export interface TimelineAssetDropPreview {
  trackId: string;
  start: number;
  duration: number;
  label: string;
  mode: 'insert' | 'overwrite';
  valid: boolean;
  operation?: 'asset-drop';
  snapped?: boolean;
  constrained?: boolean;
  ripple?: boolean;
  collision?: boolean;
}

export interface TimelineEditGuide {
  trackId?: string;
  time: number;
  label: string;
  tone: 'move' | 'snap' | 'limit' | 'drop';
  operation?: TimelineClipEditPreview['operation'] | TimelineClipDropPreview['operation'] | TimelineAssetDropPreview['operation'];
  delta?: number;
  duration?: number;
  groupCount?: number;
  snapped?: boolean;
  constrained?: boolean;
  ripple?: boolean;
}

export type TimelineClipBodyDragMode = 'move' | 'slip' | 'slide';
export type TimelineClipEdgeDragMode = 'trim' | 'roll';
export type ProgramMotionPatch = Partial<Pick<ClipMotionTransform, 'positionX' | 'positionY' | 'scale' | 'rotation'>>;
export type ProgramCropPatch = CropMaskParameters;
export type ProgramMonitorGuides = MotionCenterSnapGuides;

export const DEFAULT_QUEUE_SETTINGS: EditorQueueSettingsView = {
  renderConcurrency: 1,
  mediaCacheConcurrency: 2,
  comfyuiConcurrency: 1,
  sttConcurrency: 1,
  defaultRenderPriority: 0,
  defaultMediaCachePriority: 0,
  defaultComfyUIPriority: 0,
  defaultSttPriority: 0,
};

export const DEFAULT_SILENCE_REMOVAL_SETTINGS: SilenceRemovalSettings = {
  threshold: 0.04,
  minSilenceDuration: 0.45,
  padding: 0.08,
  ripple: true,
};

export const DEFAULT_BEAT_DETECTION_SETTINGS: BeatDetectionSettings = {
  threshold: 0.65,
  minSpacing: 0.35,
  maxBeats: 64,
};

export const DEFAULT_KEYFRAME_DRAFT: KeyframeDraft = {
  property: 'scale',
  value: 1,
  easing: 'smooth',
};

export const DEFAULT_CAPTION_SIDECAR_SETTINGS: Required<CaptionSidecarOptions> = {
  includeSpeaker: true,
  maxLineLength: 42,
  includeStyleMetadata: true,
  includeWordTiming: true,
};
