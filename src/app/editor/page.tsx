'use client';

import type { CSSProperties, ChangeEvent, DragEvent, MouseEvent, PointerEvent as ReactPointerEvent, WheelEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDanbiTheme } from '../theme';
import { addAdjustmentLayerAtTime } from '@/lib/editor/adjustment-layer';
import { AI_ENHANCEMENT_PRESETS, applyAiEnhancementPresetToClips, type AiEnhancementPresetId } from '@/lib/editor/ai-effects';
import { fillAiBrollGaps, findVisualTimelineGaps } from '@/lib/editor/ai-broll-gap-fill';
import { isSameProgramAudioFftSample, type ProgramAudioFftSample } from '@/lib/editor/audio-analyzer';
import { AUDIO_CLEANUP_PRESETS, applyAudioCleanupPresetToClips, type AudioCleanupPresetId } from '@/lib/editor/audio-cleanup-effects';
import { applyAudioPeakNormalizeToClips, DEFAULT_NORMALIZE_TARGET_PEAK } from '@/lib/editor/audio-normalize';
import { normalizeClipVolume } from '@/lib/editor/audio-mixer';
import { applyWaveformSync, applyWaveformSyncAndLink, type WaveformSyncPlan } from '@/lib/editor/audio-sync';
import { addBeatMarkers, buildBeatDetectionPlan, splitClipAtDetectedBeats, type BeatDetectionPlan } from '@/lib/editor/beat-detection';
import { parseCaptionSidecar, type CaptionSidecarOptions } from '@/lib/editor/caption-sidecar';
import { applyColorLutToClips } from '@/lib/editor/color-lut';
import { applyComfyUIResultAsAiEffectPass, applyComfyUIResultAssets } from '@/lib/editor/comfyui-results';
import { applyComfyUIWorkflowPresetToClip, listComfyUIWorkflowPresets, updateClipComfyUIBinding, type ComfyUIWorkflowBindingPatch } from '@/lib/editor/comfyui-workflows';
import type { EditorCommandId } from '@/lib/editor/command-registry';
import { applyCreatorTemplatePreset, type CreatorTemplateApplyResult, type CreatorTemplatePresetId } from '@/lib/editor/creator-template-presets';
import { CROP_MASK_EFFECT_LABEL, CROP_MASK_PRESETS, normalizeCropMaskParameters, type CropMaskPresetId } from '@/lib/editor/crop-mask';
import { applyExtensionEffectPlans, readExtensionEffectPlansFromRuntimeResult } from '@/lib/editor/extension-effect-plan';
import { assertExtensionEffectPlansMatchManifest, assertExtensionTransitionPlansMatchManifest } from '@/lib/editor/extension-parameter-schema';
import { applyExtensionTransitionPlans, readExtensionTransitionPlansFromRuntimeResult } from '@/lib/editor/extension-transition-plan';
import type { ExportProfilePatch } from '@/lib/editor/export-profiles';
import type { FfmpegRenderPlan } from '@/lib/editor/ffmpeg-renderer';
import type { MasterAudioSettings } from '@/lib/editor/master-audio';
import { applyImportedTimelineMarkers, type MarkerInterchangeFormat } from '@/lib/editor/marker-interchange';
import { updateMediaAssetBin, type MediaBinKindFilter, type MediaBinSmartCollection, type MediaBinSortKey } from '@/lib/editor/media-bin';
import { buildMediaCacheBatchPlan } from '@/lib/editor/media-cache-targets';
import { relinkMediaAsset, removeMediaAsset, removeUnusedMediaAssets } from '@/lib/editor/media-import';
import { buildDefaultMotionTransformParameters, findMotionTransformEffect, MOTION_TRANSFORM_EFFECT_LABEL, normalizeMotionTransformPatch, readClipMotionTransform, type ClipMotionTransform } from '@/lib/editor/motion-transform';
import { applyTrackedObjectMask } from '@/lib/editor/object-mask';
import { updatePluginExporterWriterTrust } from '@/lib/editor/plugin-trust';
import { createBlankEditorProject, createDefaultEditorProject, DEFAULT_EXPORT_PROFILE_ID } from '@/lib/editor/project';
import type { ProjectSettingsPatch } from '@/lib/editor/project-settings';
import { serializeProject, type ProjectPackageImport } from '@/lib/editor/project-store';
import type { RenderPreflightIssue } from '@/lib/editor/render-preflight';
import { buildSilenceRemovalPlan, removeDetectedSilence, type SilenceRemovalPlan } from '@/lib/editor/silence-removal';
import { addSharedAssetLibraryItemToProject, SHARED_ASSET_LIBRARY_BIN, type SharedAssetLibraryAddResult, type SharedAssetLibraryItemId } from '@/lib/editor/shared-asset-library';
import { type SpeedRampPresetId } from '@/lib/editor/speed-ramp';
import { cleanSttCaptions, type SttCaptionCleanupResult } from '@/lib/editor/stt-caption-review';
import { applySpeakerDiarization, type SpeakerDiarizationApplyResult } from '@/lib/editor/stt-speaker-diarization';
import { applyStabilizePresetToClips, STABILIZE_PRESETS, type StabilizePresetId } from '@/lib/editor/stabilize-effects';
import { createMediaSubclip } from '@/lib/editor/subclip';
import { isTrackPlayable } from '@/lib/editor/track-playback';
import { applySubjectTrackingReframe } from '@/lib/editor/subject-tracking-reframe';
import { canvasLayoutLabel, type CanvasLayoutMode } from '@/lib/editor/canvas-layout';
import { VISUAL_FILTER_PRESETS, applyVisualFilterPresetToClips, type VisualFilterPresetId } from '@/lib/editor/visual-effects';
import type { VideoScopeReadout } from '@/lib/editor/video-scopes';
import {
  addCaption,
  addClipEffect,
  addClipEffectToClips,
  addClipKeyframe,
  addMarker,
  addTitleClip,
  addTrack,
  arrangeClipsOnTrack,
  applyLinkedAudioSplitEdit,
  applyCropMaskPresetToClips,
  applySpeedRampPresetToClips,
  applyTitleStyle,
  applyCanvasLayoutToClips,
  applyAudioFadeToClips,
  applyColorGradingPresetToClips,
  applyFreezeFrameAtTimelineTimeToClips,
  applyMotionPresetToClips,
  applyTransitionToClips,
  applyVisualFadeToClips,
  COLOR_GRADING_PRESETS,
  closeAllGapsOnTrack,
  compactCaptionGaps,
  copyClipAttributes,
  clearFreezeFrameFromClips,
  clearSpeedRampFromClips,
  deleteCaptions,
  deleteClips,
  deleteClipKeyframe,
  deleteMarker,
  deleteRange,
  detachEmbeddedAudio,
  duplicateClips,
  closeGapAtTime,
  findClip,
  getLinkedClipIds,
  generateCaptionDraft,
  groupClips,
  insertAssetPatchOnTimeline,
  insertTimelineGap,
  importCaptionSegments,
  linkAudioVideoClips,
  mergeCaptions,
  moveCaptionsToTime,
  moveClipEffect,
  moveClips,
  moveClipsToNewTrackAtTime,
  moveClipsToTime,
  moveClipsToTrack,
  moveClipsToTrackAtTime,
  moveTrack,
  MOTION_PRESETS,
  nudgeCaptions,
  overwriteClipsAtTime,
  overwriteAssetPatchOnTimeline,
  pasteClipsAtTime,
  pasteClipAttributes,
  relinkDetachedAudio,
  replaceClipSource,
  removeTrack,
  removeClipEffectsFromClips,
  removeClipTransitionFromClips,
  retimeLinkedClipToSpeed,
  rollTrimLinkedClip,
  slideLinkedClip,
  slipLinkedClip,
  splitClipAtTime,
  splitAllClipsAtTime,
  splitCaptionAtTime,
  splitClipsAtTime,
  splitLinkedClipAtTime,
  setClipEffectsEnabledInClips,
  toggleClipEffect,
  toggleClipsState,
  toggleTrackState,
  trimClip,
  trimLinkedClipToTime,
  ungroupClips,
  unlinkLinkedClips,
  updateCaption,
  updateCaptionsStyle,
  updateCaptionsSpeaker,
  updateClip,
  updateClips,
  updateClipEffectParametersInClips,
  updateClipKeyframe,
  updateClipTransition,
  updateClipTransitionForClips,
  updateClipEffectParameters,
  updateTitleClipText,
  updateMarker,
  updateTrack,
  type ClipAttributeClipboard,
  type ColorGradingPresetId,
  type MotionPresetId,
} from '@/lib/editor/timeline';
import type { CaptionSegment, CaptionStyle, ClipEffect, ClipKeyframe, EditorAsset, EditorPluginExporterWriterTrust, EditorProject, ExportManifest, TimelineClip, TimelineMarker, TimelineTrack, TimelineTransition } from '@/lib/editor/types';
import type { DanbiMenuLanguage } from '@/lib/editor/menu-language';
import { DEFAULT_EDITOR_INTERACTION_SETTINGS, readStoredEditorInteractionSettings, subscribeEditorInteractionSettings, type EditorInteractionSettings } from '@/lib/editor/editor-settings';
import { resolveCancelledComfyUIJobState, resolveCancelledSttJobState, resolveComfyUIBindingPatchPlan, resolveComfyUIPresetChangePlan, resolveComfyUIQueueFailureState, resolveComfyUIQueueStartState, resolveComfyUIResultActionPlan, resolveComfyUIRetryStartState, resolvePolledComfyUIJobState, resolvePolledSttJobState, resolveQueuedComfyUIJobState, resolveQueuedSttJobState, resolveRetriedComfyUIJobState, resolveRetriedSttJobState, resolveSpeakerDiarizationFailureStatus, resolveSpeakerDiarizationPlan, resolveSpeakerDiarizationResultState, resolveSttCleanupReadiness, resolveSttCleanupResultState, resolveSttImportCaptionPlan, resolveSttIssueSelectionPlan, resolveSttQueueFailureState, resolveSttQueueStartState, resolveSttRetryStartState, shouldPollComfyUIJob, shouldPollSttJob } from '@/electron/renderer/ai-queue-workflow-helpers';
import { applyRuntimeWaveformToProject, applyRuntimeWaveformsToProject, formatAudioAnalysisFailureStatus, formatBeatCutStatus, formatBeatDetectionStatus, formatBeatMarkerStatus, formatSilenceAnalysisStatus, formatSilenceRemovalStatus, mergeRuntimeAudioPeakEntries, resolveAudioAnalysisTargetPlan, resolveBeatActionPlan, resolveReusableBeatPlan, resolveRuntimeAudioPeakReadRequests, type RuntimeAudioPeakEntry } from '@/electron/renderer/audio-analysis-workflow-helpers';
import { runAutomationHooks } from '@/electron/renderer/automation-hooks-client';
import { resolveAutomationHookFailureStatus, resolveAutomationHookWorkflowState, resolveBeforeExportHookRequest, resolvePreparedExportProject } from '@/electron/renderer/automation-hooks-workflow-helpers';
import { formatCaptionImportFailureStatus, resolveApplyCaptionSpeakerPlan, resolveCaptionSelection, resolveCaptionSidecarImportPlan, resolveCaptionSpeakerDraft, resolveCaptionStylePatchPlan, resolveDeleteCaptionPlan, resolveDeleteSelectedCaptionsPlan, resolveJumpToCaptionPlan, resolveMergeSelectedCaptionsPlan, resolveMoveCaptionsToPlayheadPlan, resolveNudgeSelectedCaptionsPlan, resolveSplitActiveCaptionPlan, resolveTightenSelectedCaptionsPlan, resolveValidCaptionSelection } from '@/electron/renderer/caption-workflow-helpers';
import { formatWaveformSyncFailureStatus, formatWaveformSyncStatus, resolveDetachSelectedAudioPlan, resolveLinkSelectedAudioPlan, resolveRelinkSelectedAudioPlan, resolveUnlinkSelectedAudioPlan, resolveWaveformSyncSelectedAudioPlan } from '@/electron/renderer/clip-audio-link-workflow-helpers';
import { formatCopiedClipAttributesStatus, resolveAppendClipboardPlan, resolveCopyClipAttributesPlan, resolveCopySelectedClipsPlan, resolveCutSelectedClipsPlan, resolvePasteClipboardAtInPlan, resolvePasteClipboardPlan, resolvePasteClipAttributesPlan } from '@/electron/renderer/clip-clipboard-workflow-helpers';
import { resolveAddAdjustmentLayerPlan, resolveAddTitleClipPlan, resolveCreatedClipSelection, resolveCreatedTimelineClipSelection, resolveTitleStylePatchPlan, resolveTitleTextPatchPlan } from '@/electron/renderer/clip-create-workflow-helpers';
import { resolveArrangeSelectedClipsPlan, resolveDeleteSelectedClipsPlan, resolveDuplicatedClipSelectionState, resolveDuplicateSelectedClipsPlan, resolveGroupSelectedClipsPlan, resolveSelectedClipEditPlan, resolveSelectedClipsPatchPlan, resolveUngroupSelectedClipsPlan } from '@/electron/renderer/clip-edit-workflow-helpers';
import { resolveMoveSelectedClipsPlan, resolveMoveSelectedClipsToTrackPlan, resolveMoveSelectionToPlayheadPlan, resolveTimelineClipGroupMoveCommitPlan } from '@/electron/renderer/clip-move-workflow-helpers';
import { resolveInspectorClipDurationChangePlan, resolveInspectorClipDurationChangeResult, resolveInspectorClipStartChangePlan, resolveInspectorClipStartChangeResult, resolveLinkedAudioSplitEditPlan, resolvePrecisionEditStepFrames, resolveRollTrimSelectedClipPlan, resolveSlideSelectedClipPlan, resolveSlipSelectedClipPlan, resolveTimelineRollTrimDragPlan, resolveTimelineRollTrimDragResult, resolveTimelineSlideDragPlan, resolveTimelineSlideDragResult, resolveTimelineSlipDragPlan, resolveToggleSelectedClipStatePlan } from '@/electron/renderer/clip-precision-edit-workflow-helpers';
import { resolveDeleteClipSidePlan, resolveSplitAllClipsAtPlayheadPlan, resolveSplitClipAtPlayheadPlan, resolveTimelineClipTrimDragCommitPlan, resolveTrimClipToPlayheadPlan } from '@/electron/renderer/clip-split-trim-workflow-helpers';
import { CommandPalette } from '@/electron/renderer/command-palette';
import { resolveCommandPaletteState, type CommandPaletteItemPayload } from '@/electron/renderer/command-palette-helpers';
import { runEditorPaletteCommand } from '@/electron/renderer/editor-command-dispatcher';
import {
  DEFAULT_BEAT_DETECTION_SETTINGS,
  DEFAULT_CAPTION_SIDECAR_SETTINGS,
  DEFAULT_KEYFRAME_DRAFT,
  DEFAULT_PIXELS_PER_SECOND,
  DEFAULT_QUEUE_SETTINGS,
  DEFAULT_SILENCE_REMOVAL_SETTINGS,
  MEDIA_ASSET_DRAG_MIME,
  type AutosaveSummary,
  type BeatDetectionSettings,
  type ComfyUIQueueJobView,
  type EditorHookEvent,
  type EditorHookPlanView,
  type EditorQueueSettingsView,
  type FfmpegCapabilitiesView,
  type KeyframeDraft,
  type MediaCacheJobView,
  type PreparedImportedMedia,
  type ProgramCropPatch,
  type ProgramMotionPatch,
  type RenderJobView,
  type SavedProjectSummary,
  type SilenceRemovalSettings,
  type SourceRange,
  type SttJobView,
  type TimelineAssetDropPreview,
  type TimelineClipDropPreview,
  type TimelineClipEditPreview,
  type TimelineEditGuide,
  type TimelineGroupMovePreview,
  type TimelineGroupTrimPreview,
  type TimelineNeighborImpactPreview,
  type TimelineRippleTrimPreview,
} from '@/electron/renderer/editor-view-model';
import { cancelComfyUIQueueJob, fetchComfyUIQueueJob, queueComfyUIBatchJob, retryComfyUIQueueJob } from '@/electron/renderer/comfyui-client';
import { prepareBrowserMediaRecord, prepareUploadedMediaRecord, pruneRetainedBrowserMediaObjectUrls, readAudioPeaks, revokeRetainedBrowserMediaObjectUrls, selectAndImportNativeMediaFiles, uploadLutFile, uploadMediaFiles } from '@/electron/renderer/editor-media-client';
import { ExportWorkspacePanel } from '@/electron/renderer/export-workspace-panel';
import { buildExportDraft, buildInitialExportPlanSyncState, formatCaptionSidecarDownloadStatus, formatCaptionSidecarFailureStatus, formatEdlDownloadStatus, formatEdlFailureStatus, formatEdlImportFailureStatus, formatEdlImportStatus, formatFcpxmlDownloadStatus, formatFcpxmlFailureStatus, formatFcpxmlImportFailureStatus, formatFcpxmlImportStatus, formatMarkerInterchangeDownloadStatus, formatMarkerInterchangeFailureStatus, formatMarkerInterchangeImportStatus, resolveBatchExportProfileIds, resolveBatchExportProfileToggle, resolveCancelledRenderJobState, resolveCaptionSidecarDownloadRequestPlan, resolveEdlDownloadRequestPlan, resolveExportPlanSyncState, resolveExportWorkspaceState, resolveFcpxmlDownloadRequestPlan, resolveImmediateRenderCompletedState, resolveImmediateRenderRequestPlan, resolveImmediateRenderStartState, resolveMarkerInterchangeDownloadRequestPlan, resolveQueuedRenderBatchState, resolveQueuedRenderJobState, resolveRenderBatchQueueRequestPlan, resolveRenderBatchQueueStartState, resolveRenderFailureState, resolveRenderJobPollingWorkflowState, resolveRenderQueueRequestPlan, resolveRenderQueueStartState, resolveRenderRetryStartState, resolveRetriedRenderJobState, resolveServerRenderPlanRequestPlan, resolveServerRenderPlanState, resolveValidatedExportRangeMode, shouldPollRenderJob } from '@/electron/renderer/export-workflow-helpers';
import { buildJobHistorySummary, mergeRenderJobHistory } from '@/electron/renderer/job-history-workflow-helpers';
import { NumberField } from '@/electron/renderer/editor-form-controls';
import { dispatchEditorKeyboardShortcut } from '@/electron/renderer/editor-keyboard-dispatcher';
import { getWindowEditorIpcClient } from '@/electron/renderer/editor-ipc-client';
import { EditorTopToolbar } from '@/electron/renderer/editor-top-toolbar';
import { formatAddClipEffectStatus, formatAudioPeakNormalizeFailureStatus, formatAudioPeakNormalizeStatus, formatClipBatchStatus, formatLutImportFailureStatus, formatLutImportStatus, isMatchingClipEffectBatchTarget, resolveAddClipEffectPlan, resolveAudioFadeClipBatchPlan, resolveAudioPeakNormalizeCommandPlan, resolveAudioPeakNormalizeCommitLabel, resolveCanvasLayoutClipBatchPlan, resolveClearFreezeFrameClipBatchPlan, resolveClipBatchCommandPlan, resolveClipEffectBatchEditPlan, resolveFreezeFrameClipBatchPlan, resolveLutImportPlan, resolveMotionTransformPatchPlan, resolveMoveClipEffectPlan, resolveNamedPresetClipBatchPlan, resolveProgramMonitorCropPatchPlan, resolveProgramMonitorMotionPatchPlan, resolveSubjectTrackingReframePlan, resolveTrackedObjectMaskPlan, resolveVisualFadeClipBatchPlan } from '@/electron/renderer/effect-workflow-helpers';
import { PanelTitle } from '@/electron/renderer/editor-panel-title';
import { applyQueueSettings, fetchFfmpegCapabilities, fetchQueueSettings, readElectronRuntimeDiagnostics } from '@/electron/renderer/editor-system-client';
import { resolveEditorEscapeClearState, resolveQueueSettingsApplyFailureStatus, resolveQueueSettingsApplySuccessState } from '@/electron/renderer/editor-system-workflow-helpers';
import { clampNumber, formatSignedEditDelta, formatTimecode, roundTime } from '@/electron/renderer/editor-time-helpers';
import { InspectorAudioAnalysisPanels } from '@/electron/renderer/inspector-analysis-panels';
import { InspectorCommandPanels } from '@/electron/renderer/inspector-command-panels';
import { InspectorEffectsPanel } from '@/electron/renderer/inspector-effects-panel';
import { InspectorAudioPanel, InspectorClipMediaPanel, InspectorVisualPanel } from '@/electron/renderer/inspector-media-panels';
import { defaultKeyframeValue, InspectorKeyframesPanel, InspectorMotionPanel, InspectorTransitionPanel, transitionTypeLabel } from '@/electron/renderer/inspector-motion-panels';
import { CaptionEditorPanel, InspectorTechnicalPanel, MarkerPanel } from '@/electron/renderer/inspector-sidebar-panels';
import { inferCaptionSidecarFormat, partitionImportFileReferences } from '@/electron/renderer/import-file-routing-helpers';
import { cancelMediaCacheJob, fetchMediaCacheJob, queueMediaCacheJob, retryMediaCacheJob } from '@/electron/renderer/media-cache-client';
import { omitAssetScopedRecords, resolveBulkRelinkCandidateAssetIds, resolveBulkRelinkCompletionViewState, resolveBulkRelinkUploadedMediaPlan, resolvePreparedMediaBinImportResult, resolveRelinkMediaFailureStatus, resolveRelinkUploadedMediaPlan, resolveRemoveMediaAssetPlan, resolveRemoveUnusedMediaAssetsPlan, resolveSourceAssetBinUpdatePlan } from '@/electron/renderer/media-bin-workflow-helpers';
import { applyCompletedMediaCacheJobsToProject, applyQueuedMediaCacheJobsToProject, mergeMediaCacheJobsByAssetId, resolveCompletedMediaCacheStatus, resolveMediaCacheAssetQueueFailure, resolveMediaCacheCancelFailureStatus, resolveMediaCacheCancelStatus, resolveMediaCachePollingState, resolveMediaCacheQueueEmptyStatus, resolveMediaCacheQueueResultStatus, resolveMediaCacheRebuildFailureStatus, resolveMediaCacheRebuildQueuedStatus, resolveMediaCacheRetryFailureStatus, resolveMediaCacheRetryStatus, type MediaCacheJobEntry } from '@/electron/renderer/media-cache-workflow-helpers';
import { appendSkippedNonMediaDropStatus, countNonMediaDraggedFiles, getDraggedMediaFiles, hasDraggedFiles, hasImportableDraggedFiles, readDraggedAssetId, readDraggedMediaFilePreview, resolveAssetTimelineDropCommitPlan, resolveAssetTimelineDropFailureStatus, resolveAssetTimelineDropPreviewPlan, resolveMediaBinDropFailureStatus, resolveMediaFileTimelineDropFailureStatus, resolveMediaFileTimelineDropPreviewPlan, resolvePreparedMediaTimelineDropResult, resolveUnsupportedMediaDropStatus, resolveUnsupportedTimelineMediaDropStatus } from '@/electron/renderer/media-drop-helpers';
import { MediaBinPanel } from '@/electron/renderer/media-bin-panel';
import { MediaHealthPanel } from '@/electron/renderer/media-health-cache-panels';
import { resolvePlaybackFrameElapsedSeconds, resolvePlaybackFrameState, resolveProgramPlaybackRateState, resolveProgramPlaybackToggleRate, resolveShuttlePlaybackRate, type ShuttleDirection } from '@/electron/renderer/playback-workflow-helpers';
import { resolveAddTimelineMarkerPlan, resolveDeleteTimelineMarkerPlan, resolveDraggedTimelineMarkerCommitPlan, resolveJumpAdjacentTimelineMarkerPlan, resolveJumpToTimelineMarkerPlan, resolveMoveTimelineMarkerToPlayheadPlan, resolveTimelineMarkerDragMovePlan, resolveTimelineMarkerDragStartPlan, resolveUpdateTimelineMarkerPlan, type MarkerDragSessionState } from '@/electron/renderer/marker-workflow-helpers';
import { resolveMediaWorkspaceState } from '@/electron/renderer/media-workspace-helpers';
import { resolveProgramPreviewCacheCandidateAssetIds } from '@/electron/renderer/program-preview-cache-helpers';
import { PreviewStage } from '@/electron/renderer/program-preview-stage';
import { installPluginPackageFolder, selectPluginPackageDirectory } from '@/electron/renderer/plugin-package-client';
import { formatExternalCustomCommandStatus, type ExternalPluginCustomCommandParameters } from '@/electron/renderer/plugin-custom-command-helpers';
import { resolveComfyUIReviewSelectionId, resolveProgramPreviewClipSelection, resolveProgramReviewWorkspaceState } from '@/electron/renderer/program-review-workspace-helpers';
import { resolvePreflightIssueFocusPlan, resolvePreflightIssuePrimaryAction, resolvePreflightIssueRelinkPlan } from '@/electron/renderer/preflight-issue-helpers';
import { resolveProjectRedo, resolveProjectReplacementCommit, resolveProjectUndo, resolveProjectUpdateCommit, type ProjectCommitResult } from '@/electron/renderer/project-history-controller';
import { downloadCmx3600Edl, downloadFcpxml, downloadTimelineMarkers, importCmx3600EdlFile, importFcpxmlFile, importTimelineMarkersFile } from '@/electron/renderer/interchange-client';
import { deleteAutosaveSnapshot, deleteProjectFromDatabase, exportProjectPackageBestAvailable, fetchAutosaveSummaries, fetchSampleProjectPackageMetadata, fetchSavedProjectSummaries, loadProjectFromDatabase, readBestLocalProjectFallback, readCloudSyncProjectBestAvailable, readElectronProjectPackageFolder, readProjectPackageFile, readSampleProjectPackageBestAvailable, restoreAutosaveProject, saveAutosaveSnapshot as saveRemoteAutosaveSnapshot, saveProjectToDatabase, selectProjectPackageDirectory, syncProjectToCloudFolderBestAvailable, writeLocalAutosaveSnapshot, writeLocalProjectFallback } from '@/electron/renderer/project-persistence-client';
import { buildProjectCloudSyncConflictState, buildProjectSaveCopy, resolveAutosaveDeleteState, resolveAutosaveSaveSuccessState, resolveEdlProjectImportSession, resolveFcpxmlProjectImportSession, resolveLocalAutosaveFallbackState, resolveLocalFallbackProjectLoadSession, resolveLocalProjectSaveFallbackState, resolveProjectAutosaveEffectState, resolveProjectCloudSyncForcePlan, resolveProjectDeleteState, resolveProjectLoadTargetId, resolveProjectPackageExportPlan, resolveProjectPackageImportSession, resolveProjectPersistenceConsistencyState, resolveProjectPersistenceErrorMessage, resolveProjectPersistenceFailureStatus, resolveProjectPersistenceFallbackFailureStatus, resolveProjectPersistenceSession, resolveProjectRecoveryIndexState, resolveProjectSaveCopySuccessState, resolveProjectSaveSuccessState, shouldWriteProjectReplacementFallback, type ProjectCloudSyncConflictState, type ProjectPersistenceSessionState } from '@/electron/renderer/project-persistence-workflow-helpers';
import { resolveProjectSessionWorkspaceState } from '@/electron/renderer/project-session-workspace-helpers';
import { resolveDuplicateExportProfilePlan, resolveExportProfilePatchPlan, resolveMasterAudioSettingsChangePlan, resolveProjectSettingsChangePlan, resolveRemoveExportProfilePlan, type ProjectSettingsMutationPlan } from '@/electron/renderer/project-settings-workflow-helpers';
import { AutosavePanel, CreatorTemplatesPanel, EditorApiTokenPanel, ProjectOverviewPanel, ProjectRecoveryPanel, ProjectSettingsPanel, SavedProjectsPanel } from '@/electron/renderer/project-workspace-panels';
import { cancelRenderJob, downloadCaptionSidecar, fetchRenderJob, fetchRenderJobs, fetchServerRenderPlan, openNativeRenderOutputPath, queueRenderJob, renderProjectNow, retryRenderJob, revealNativeRenderOutputPath, selectRenderOutputPath } from '@/electron/renderer/render-client';
import { canRetryRenderDiagnostic, formatRenderRetryBlockedStatus, resolveRenderDiagnosticActionPlan, type RenderDiagnosticActionView } from '@/electron/renderer/render-diagnostic-view';
import {
  discoverRenderWorkerDaemons,
  discoverRenderWorkerDaemonLanCandidates,
  fetchRenderWorkerDaemonHealth,
  fetchRenderWorkerDaemonRun,
  fetchRenderWorkerDaemonStatus,
  submitRenderWorkerDaemonRun,
  subscribeRenderWorkerDaemonFleetEvents,
  subscribeRenderWorkerDaemonRunEvents,
} from '@/electron/renderer/render-worker-client';
import { buildRenderWorkerControllerHandoff, buildRenderWorkerDaemonDiscoveryCandidates, buildRenderWorkerTrustedCandidateUrls, evaluateRenderWorkerCentralTrustPolicy, forgetTrustedRenderWorkerDaemon, isRenderWorkerDaemonTrusted, normalizeRenderWorkerDaemonUrl, parseRenderWorkerRemoteDaemonUrls, readTrustedRenderWorkers, selectRenderWorkerDaemonForHandoff, shouldPollRenderWorkerRun, trustRenderWorkerDaemon, writeTrustedRenderWorkers, type RenderWorkerControllerSettings, type RenderWorkerTrustedDaemon } from '@/electron/renderer/render-worker-controller-helpers';
import { SceneReadoutPanel } from '@/electron/renderer/scene-readout-panel';
import { resolveSelectedClipCapabilities } from '@/electron/renderer/selected-clip-capabilities';
import { resolveSelectedClipWorkspaceState } from '@/electron/renderer/selected-clip-workspace-helpers';
import { AutomationHooksPanel, PluginsPanel, QueueSettingsPanel, ShortcutsPanel, type ExternalEffectPresetId, type ExternalPluginPlanParameters, type ExternalTransitionPresetId } from '@/electron/renderer/sidebar-workflow-panels';
import { SourceAssetRangePanel } from '@/electron/renderer/source-asset-range-panel';
import { resolveDirectMediaInsertPatchSettings, resolveGoToSourceMarkPlan, resolveInsertedSourceAssetPatchSelection, resolveInsertSourceAssetAtPlayheadPlan, resolveMatchFrameToSourcePlan, resolveMatchSourceRangeToMarkedRange, resolveOverwriteSourceAssetAtPlayheadPlan, resolveReplaceSelectedFromSourcePlan, resolveSourceMarkPatch, resolveSourceRangeHandlePatch, resolveSourceRangePatchPlan, resolveSourceRangeResetPlan, resolveSourceSubclipFailureStatus, resolveSourceSubclipReadinessPlan, resolveSourceSubclipResultPlan, resolveThreePointAssetEditPlan, type SourceRangeHandle } from '@/electron/renderer/source-edit-workflow-helpers';
import { cancelSttCaptionJob, fetchSttJob, queueSttCaptionJob, retrySttCaptionJob } from '@/electron/renderer/stt-client';
import { SourceMonitor } from '@/electron/renderer/source-monitor';
import { useMenuLanguage } from '@/electron/renderer/use-menu-language';
import { TimelineClipList } from '@/electron/renderer/timeline-clip-list';
import { TimelineContextMenu } from '@/electron/renderer/timeline-context-menu';
import { resolveClearTimelineMarks, resolveCopyMarkedTimelineRangePlan, resolveCutMarkedTimelineRangePlan, resolveDeleteMarkedTimelineRangePlan, resolveGoToTimelineMark, resolveMarkSelectedTimelineClips, resolveSetTimelineMark } from '@/electron/renderer/timeline-mark-workflow-helpers';
import { auditSourceMonitorConsistency, readWorkflowNumber, resolveSourceAssetSelection, resolveSourceMonitorLoopPlaybackToggle, resolveSourceMonitorNudgePlayhead, resolveSourceMonitorPlaybackRateState, resolveSourceMonitorPlaybackToggleRate, resolveSourceMonitorPlayhead, resolveSourceMonitorShuttlePlaybackState, resolveSourceWorkspaceState } from '@/electron/renderer/timeline-source-helpers';
import { buildTimelineClipEditGuide, readTimelineLaneBounds, resolveTimelineClipDragCommitState, resolveTimelineClipDragPointerPlan, resolveTimelineClipDragPreviewState, resolveTimelineClipMoveEdit, resolveTimelineClipRollTrimPreview, resolveTimelineClipSlidePreview, resolveTimelineClipSlipPreview, resolveTimelineClipTrimEdit, resolveTimelineClipTrimPreview, resolveTimelineTrackIdsInDragRange, type TimelineClipMoveEdit, type TimelineClipTrimEdit } from '@/electron/renderer/timeline-edit-preview-helpers';
import { resolveCloseAllTimelineGapsOnTrackPlan, resolveCloseTimelineGapAtPlayheadPlan, resolveInsertTimelineGapAtPlayheadPlan } from '@/electron/renderer/timeline-gap-workflow-helpers';
import { resolveAdjacentTimelineEdit, resolveMarkedTimelineRangeSelection, resolvePrimarySelection, resolveRelativeTimelineClipSelection, resolveSelectAllTimelineClips, resolveTimelineClipSelection, resolveTimelineClipSelectionAtPlayhead, resolveTimelineLaneDragEndPlan, resolveTimelineLaneDragMovePlan, resolveTimelineLaneDragStartPlan, type ClipSelectionMode, type TimelineBoxSelectionState } from '@/electron/renderer/timeline-selection-helpers';
import { TimelineTrackRow } from '@/electron/renderer/timeline-track-row';
import { TimelineTransportRulerPanel } from '@/electron/renderer/timeline-transport-ruler';
import { resolveTimelineEdgeAutoScrollLeft, resolveTimelineEditGuide, resolveTimelineFitZoom, resolveTimelinePlayheadNudgePlan, resolveTimelinePlayheadTime, resolveTimelineVisibleScrollLeft } from '@/electron/renderer/timeline-viewport-helpers';
import { beginTimelineScrubInteraction, resolveTimelineClipSelectInteraction, resolveTimelineImportDropStart, resolveTimelineScrubInteractionEnd, resolveTimelineScrubInteractionMove, resolveTimelineWheelZoomInteraction } from '@/electron/renderer/timeline-interaction-adapter';
import { TIMELINE_TRACK_HEADER_WIDTH } from '@/electron/renderer/timeline-layout-constants';
import { resolveTimelineClipRenderWindow, resolveTimelineLoopPlaybackToggle, resolveTimelineWorkspaceState, resolveValidatedLoopPlaybackEnabled, type TimelineViewportState } from '@/electron/renderer/timeline-workspace-helpers';
import { resolveMoveTrackPlan, resolveRemoveTrackPlan, resolveSourcePatchTrackOptions, resolveSourcePatchTrackSelectionPlan, resolveTrackMixerChangePlan, resolveTrackRenamePlan, resolveTrackSelectionPlan, resolveTrackTogglePlan, type TrackSelectionPlan } from '@/electron/renderer/track-workflow-helpers';
import { buildVoiceoverRecordedFile, cancelVoiceoverRecording, formatVoiceoverFailureStatus, markPreparedMediaAsVoiceover, readVoiceoverRecorderEnvironment, resolveVoiceoverRecorderSupport, resolveVoiceoverTimelineImportResult, startVoiceoverRecording, stopVoiceoverRecording, type VoiceoverRecorderSupport, type VoiceoverRecordingSession, type VoiceoverRecordingState } from '@/electron/renderer/voiceover-workflow-helpers';
import type { RenderWorkerDaemonRunRecord, RenderWorkerDaemonStatus } from '@/electron/shared/render-worker-contract';
import { EXTENSION_SANDBOX_PLAN_EFFECTS_COMMAND, EXTENSION_SANDBOX_PLAN_TRANSITIONS_COMMAND, EXTENSION_SANDBOX_RUN_CUSTOM_COMMAND, type ExtensionInvocationResult } from '@/electron/shared/extension-api';

type EditorAssetPanelId = 'media' | 'project' | 'templates' | 'health';
type EditorDockPanelId = 'clip' | 'video' | 'audio' | 'speed' | 'animation' | 'tracking' | 'adjust' | 'effects' | 'text' | 'jobs' | 'export' | 'plugins';
type EditorPrimaryModeId = 'media' | 'audio' | 'text' | 'effects' | 'transitions' | 'captions' | 'adjust' | 'templates' | 'ai';

const EDITOR_ASSET_PANELS: Array<{ id: EditorAssetPanelId; label: string; shortLabel: string }> = [
  { id: 'media', label: 'Media', shortLabel: 'M' },
  { id: 'project', label: 'Project', shortLabel: 'P' },
  { id: 'templates', label: 'Templates', shortLabel: 'T' },
  { id: 'health', label: 'Health', shortLabel: 'H' },
];

const EDITOR_DOCK_PANELS: Array<{ id: EditorDockPanelId; label: string; shortLabel: string }> = [
  { id: 'clip', label: 'Clip', shortLabel: 'C' },
  { id: 'video', label: 'Video', shortLabel: 'V' },
  { id: 'audio', label: 'Audio', shortLabel: 'A' },
  { id: 'speed', label: 'Speed', shortLabel: 'Sp' },
  { id: 'animation', label: 'Animation', shortLabel: 'An' },
  { id: 'tracking', label: 'Tracking', shortLabel: 'Tr' },
  { id: 'adjust', label: 'Adjust', shortLabel: 'Ad' },
  { id: 'effects', label: 'Effects', shortLabel: 'Fx' },
  { id: 'text', label: 'Text', shortLabel: 'T' },
  { id: 'jobs', label: 'Jobs', shortLabel: 'J' },
  { id: 'export', label: 'Export', shortLabel: 'E' },
  { id: 'plugins', label: 'Plugins', shortLabel: 'P' },
];

const EDITOR_EDIT_DOCK_PANEL_IDS: readonly EditorDockPanelId[] = ['clip', 'video', 'audio', 'speed', 'animation', 'tracking', 'adjust', 'effects', 'text'];
const EDITOR_SELECTED_CLIP_DOCK_PANEL_IDS: readonly EditorDockPanelId[] = ['clip', 'video', 'audio', 'speed', 'animation', 'tracking', 'adjust', 'effects'];
const EDITOR_WORKFLOW_DOCK_PANEL_IDS: readonly EditorDockPanelId[] = ['jobs', 'export', 'plugins'];

const EDITOR_PRIMARY_MODES: Array<{
  id: EditorPrimaryModeId;
  label: string;
  shortLabel: string;
  assetPanel: EditorAssetPanelId;
  dockPanel: EditorDockPanelId;
}> = [
  { id: 'media', label: 'Media', shortLabel: 'M', assetPanel: 'media', dockPanel: 'clip' },
  { id: 'audio', label: 'Audio', shortLabel: 'A', assetPanel: 'media', dockPanel: 'audio' },
  { id: 'text', label: 'Text', shortLabel: 'T', assetPanel: 'templates', dockPanel: 'text' },
  { id: 'effects', label: 'Effects', shortLabel: 'Fx', assetPanel: 'templates', dockPanel: 'effects' },
  { id: 'transitions', label: 'Transitions', shortLabel: 'Tr', assetPanel: 'templates', dockPanel: 'video' },
  { id: 'captions', label: 'Captions', shortLabel: 'CC', assetPanel: 'project', dockPanel: 'text' },
  { id: 'adjust', label: 'Adjust', shortLabel: 'Ad', assetPanel: 'media', dockPanel: 'adjust' },
  { id: 'templates', label: 'Templates', shortLabel: 'Te', assetPanel: 'templates', dockPanel: 'clip' },
  { id: 'ai', label: 'AI', shortLabel: 'AI', assetPanel: 'project', dockPanel: 'jobs' },
];

const editorPageText: Record<DanbiMenuLanguage, {
  assetPanels: Record<EditorAssetPanelId, string>;
  dockPanels: Record<EditorDockPanelId, string>;
  primaryModes: Record<EditorPrimaryModeId, string>;
  chrome: {
    activeMonitor: string;
    assetBay: string;
    assetPanels: string;
    comfyBinding: string;
    comfyCfg: string;
    comfyHeight: string;
    comfyNegativePrompt: string;
    comfyPreset: string;
    comfyPrompt: string;
    comfySeed: string;
    comfySteps: string;
    comfyWidth: string;
    customWorkspace: string;
    importToBay: string;
    edit: string;
    editWorkspace: string;
    emptySelection: string;
    hideSource: string;
    import: string;
    info: string;
    inspector: string;
    inspectorPanels: string;
    program: string;
    selectClip: string;
    showSource: string;
    showSourceMonitor: string;
    source: string;
    themeDark: string;
    themeLight: string;
    themeToDark: string;
    themeToLight: string;
    workflow: string;
  };
}> = {
  en: {
    assetPanels: {
      media: 'Media',
      project: 'Project',
      templates: 'Templates',
      health: 'Health',
    },
    dockPanels: {
      clip: 'Clip',
      video: 'Video',
      audio: 'Audio',
      speed: 'Speed',
      animation: 'Animation',
      tracking: 'Tracking',
      adjust: 'Adjust',
      effects: 'Effects',
      text: 'Text',
      jobs: 'Jobs',
      export: 'Export',
      plugins: 'Plugins',
    },
    primaryModes: {
      media: 'Media',
      audio: 'Audio',
      text: 'Text',
      effects: 'Effects',
      transitions: 'Transitions',
      captions: 'Captions',
      adjust: 'Adjust',
      templates: 'Templates',
      ai: 'AI',
    },
    chrome: {
      activeMonitor: 'Active monitor',
      assetBay: 'Asset Bay',
      assetPanels: 'Asset panels',
      comfyBinding: 'ComfyUI Binding',
      comfyCfg: 'CFG',
      comfyHeight: 'Height',
      comfyNegativePrompt: 'Negative prompt',
      comfyPreset: 'Preset',
      comfyPrompt: 'Prompt',
      comfySeed: 'Seed',
      comfySteps: 'Steps',
      comfyWidth: 'Width',
      customWorkspace: 'Custom',
      importToBay: 'Import media into the bay',
      edit: 'Edit',
      editWorkspace: 'Edit Workspace',
      emptySelection: 'Select a timeline clip to edit these properties.',
      hideSource: 'Hide Source',
      import: 'Import',
      info: 'Info',
      inspector: 'Inspector',
      inspectorPanels: 'inspector panels',
      program: 'Program',
      selectClip: 'Select a clip',
      showSource: 'Show Source',
      showSourceMonitor: 'Show the source monitor',
      source: 'Source',
      themeDark: 'Dark',
      themeLight: 'Light',
      themeToDark: 'Switch to the dark ground',
      themeToLight: 'Switch to the paper ground',
      workflow: 'Workflow',
    },
  },
  ko: {
    assetPanels: {
      media: '미디어',
      project: '프로젝트',
      templates: '템플릿',
      health: '상태',
    },
    dockPanels: {
      clip: '클립',
      video: '동영상',
      audio: '오디오',
      speed: '속도',
      animation: '애니메이션',
      tracking: '트래킹',
      adjust: '조정',
      effects: '효과',
      text: '텍스트',
      jobs: '작업',
      export: '내보내기',
      plugins: '플러그인',
    },
    primaryModes: {
      media: '미디어',
      audio: '오디오',
      text: '텍스트',
      effects: '효과',
      transitions: '전환',
      captions: '자막',
      adjust: '조정',
      templates: '템플릿',
      ai: 'AI',
    },
    chrome: {
      activeMonitor: '활성 모니터',
      assetBay: '에셋 보관함',
      assetPanels: '에셋 패널',
      comfyBinding: 'ComfyUI 바인딩',
      comfyCfg: 'CFG',
      comfyHeight: '높이',
      comfyNegativePrompt: '네거티브 프롬프트',
      comfyPreset: '프리셋',
      comfyPrompt: '프롬프트',
      comfySeed: '시드',
      comfySteps: '스텝',
      comfyWidth: '너비',
      customWorkspace: '사용자 설정',
      importToBay: '에셋 보관함으로 미디어 가져오기',
      edit: '편집',
      editWorkspace: '편집 작업공간',
      emptySelection: '타임라인 클립을 선택하면 속성을 편집할 수 있습니다.',
      hideSource: '소스 닫기',
      import: '가져오기',
      info: '정보',
      inspector: '인스펙터',
      inspectorPanels: '인스펙터 패널',
      program: '프로그램',
      selectClip: '클립 선택',
      showSource: '소스 열기',
      showSourceMonitor: '소스 모니터 표시',
      source: '소스',
      themeDark: '다크',
      themeLight: '라이트',
      themeToDark: '어두운 바탕으로 전환',
      themeToLight: '종이 바탕으로 전환',
      workflow: '워크플로',
    },
  },
};

function readEditorAssetPanelLabel(id: EditorAssetPanelId, language: DanbiMenuLanguage): string {
  return editorPageText[language].assetPanels[id];
}

function readEditorDockPanelLabel(id: EditorDockPanelId, language: DanbiMenuLanguage): string {
  return editorPageText[language].dockPanels[id];
}

function readEditorPrimaryModeLabel(id: EditorPrimaryModeId, language: DanbiMenuLanguage): string {
  return editorPageText[language].primaryModes[id];
}

function readEditorDockPanel(id: EditorDockPanelId, language: DanbiMenuLanguage = 'en'): { id: EditorDockPanelId; label: string; shortLabel: string } {
  const panel = EDITOR_DOCK_PANELS.find((item) => item.id === id) ?? EDITOR_DOCK_PANELS[0];
  return {
    ...panel,
    label: readEditorDockPanelLabel(panel.id, language),
  };
}

function listEditorDockPanels(ids: readonly EditorDockPanelId[], language: DanbiMenuLanguage = 'en'): Array<{ id: EditorDockPanelId; label: string; shortLabel: string }> {
  return ids.map((id) => readEditorDockPanel(id, language));
}

function readEditorPrimaryMode(id: EditorPrimaryModeId): { id: EditorPrimaryModeId; label: string; shortLabel: string; assetPanel: EditorAssetPanelId; dockPanel: EditorDockPanelId } {
  return EDITOR_PRIMARY_MODES.find((mode) => mode.id === id) ?? EDITOR_PRIMARY_MODES[0];
}

function readEditorAssetPanel(id: EditorAssetPanelId): { id: EditorAssetPanelId; label: string; shortLabel: string } {
  return EDITOR_ASSET_PANELS.find((panel) => panel.id === id) ?? EDITOR_ASSET_PANELS[0];
}

/*
 * Keep the original English labels on EDITOR_* constants for stable tests,
 * status messages, and data attributes. Visible chrome is localized through
 * the helpers above.
 */
function readEditorAssetPanelDisplay(id: EditorAssetPanelId, language: DanbiMenuLanguage): { id: EditorAssetPanelId; label: string; shortLabel: string } {
  const panel = readEditorAssetPanel(id);
  return {
    ...panel,
    label: readEditorAssetPanelLabel(id, language),
  };
}

function readEditorPrimaryModeDisplay(id: EditorPrimaryModeId, language: DanbiMenuLanguage): { id: EditorPrimaryModeId; label: string; shortLabel: string; assetPanel: EditorAssetPanelId; dockPanel: EditorDockPanelId } {
  const mode = readEditorPrimaryMode(id);
  return {
    ...mode,
    label: readEditorPrimaryModeLabel(id, language),
  };
}


function InspectorDockTabList({
  label,
  testId,
  panels,
  activeDockPanel,
  onSelect,
}: {
  label: string;
  testId: string;
  panels: Array<{ id: EditorDockPanelId; label: string; shortLabel: string }>;
  activeDockPanel: EditorDockPanelId;
  onSelect: (panelId: EditorDockPanelId) => void;
}) {
  /* Broadsheet's tab: a serif word with a 2px accent rule under the active one.
     These were 78px two-line boxed buttons, which cost the inspector a third of
     its height before any content appeared — twelve of them wrapped to a
     742px-wide scroll strip. As words they wrap into two tidy rows. */
  return (
    <div>
      <div className="mb-0.5 text-micro font-semibold uppercase tracking-[0.1em] text-ds-500">{label}</div>
      <div
        role="tablist"
        aria-label={`${label} inspector panels`}
        data-testid={testId}
        className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
      >
        {panels.map((panel) => (
          <button
            key={panel.id}
            type="button"
            role="tab"
            title={panel.label}
            data-testid={`inspector-dock-tab-${panel.id}`}
            aria-selected={activeDockPanel === panel.id}
            onClick={() => onSelect(panel.id)}
            className={`shrink-0 border-b-2 pb-0.5 font-heading text-sm font-semibold leading-tight transition ${
              activeDockPanel === panel.id
                ? 'border-accent text-ink'
                : 'border-transparent text-ds-600 hover:text-ink'
            }`}
          >
            {panel.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function InspectorEmptySelectionPanel({ panelLabel, message }: { panelLabel: string; message: string }) {
  return (
    <div
      data-testid="inspector-empty-selection"
      className="rounded-md border border-ds-200 bg-surface p-4 text-sm text-ds-700"
    >
      <div className="text-kicker font-heading font-semibold uppercase text-ds-600">{panelLabel}</div>
      <div className="mt-2 text-ds-800">{message}</div>
    </div>
  );
}

function resolveEditorMonitorGridClass(sourceMonitorVisible: boolean, sceneReadoutVisible: boolean): string {
  if (sourceMonitorVisible && sceneReadoutVisible) {
    return 'lg:grid-cols-[220px_minmax(620px,1fr)] 2xl:grid-cols-[220px_minmax(680px,1fr)_220px]';
  }

  if (sourceMonitorVisible) {
    return 'lg:grid-cols-[220px_minmax(620px,1fr)]';
  }

  if (sceneReadoutVisible) {
    return 'lg:grid-cols-[minmax(560px,1fr)_220px]';
  }

  return 'lg:grid-cols-[minmax(560px,1fr)]';
}

function formatSourcePlaybackStatus(rate: number): string {
  if (rate === 0) {
    return 'source paused';
  }

  return `source ${rate > 0 ? '+' : '-'}${Math.abs(rate)}x`;
}

function timelineClipContainsPlayhead(clip: TimelineClip | null | undefined, playhead: number): clip is TimelineClip {
  return Boolean(clip && playhead > clip.start && playhead < clip.start + clip.duration);
}

interface CaptionSidecarImportSource {
  filename: string;
  mimeType?: string;
  content: string;
}

interface CaptionSidecarImportResult {
  nextProject: EditorProject;
  importedCaptionCount: number;
  selectedCaptionIds: string[];
  statuses: string[];
}

const RENDER_WORKER_DISCOVERY_TIMEOUT_MS = 1200;
const RENDER_WORKER_REQUEST_TIMEOUT_MS = 5000;
const RENDER_WORKER_STREAM_OPEN_TIMEOUT_MS = 5000;
const RENDER_WORKER_SUBMIT_TIMEOUT_MS = 10000;

function readLocalProjectFallbackSnapshot(): ProjectPackageImport | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return readBestLocalProjectFallback();
  } catch {
    return null;
  }
}

export default function EditorPage() {
  const menuLanguage = useMenuLanguage();
  const editorText = editorPageText[menuLanguage];
  const { theme, toggleTheme } = useDanbiTheme();
  const [editorSettings, setEditorSettings] = useState<EditorInteractionSettings>(DEFAULT_EDITOR_INTERACTION_SETTINGS);
  const [project, setProject] = useState<EditorProject>(() => createDefaultEditorProject());
  const [history, setHistory] = useState<EditorProject[]>([]);
  const [future, setFuture] = useState<EditorProject[]>([]);
  const [selectedClipId, setSelectedClipId] = useState('clip-ai-city');
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>(['clip-ai-city']);
  const [selectedCaptionIds, setSelectedCaptionIds] = useState<string[]>([]);
  const [selectedExportProfileId, setSelectedExportProfileId] = useState(DEFAULT_EXPORT_PROFILE_ID);
  const [batchExportProfileIds, setBatchExportProfileIds] = useState<string[]>([DEFAULT_EXPORT_PROFILE_ID, 'profile-short-vertical']);
  const [exportManifest, setExportManifest] = useState<ExportManifest>(() => buildInitialExportPlanSyncState().manifest);
  const [renderPlan, setRenderPlan] = useState<FfmpegRenderPlan>(() => buildInitialExportPlanSyncState().plan);
  const [editorHydrated, setEditorHydrated] = useState(false);
  const [renderOutputPath, setRenderOutputPath] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [renderJob, setRenderJob] = useState<RenderJobView | null>(null);
  const [renderJobs, setRenderJobs] = useState<RenderJobView[]>([]);
  const [renderWorkerSettings, setRenderWorkerSettings] = useState<RenderWorkerControllerSettings>(() => ({
    daemonUrl: 'http://127.0.0.1:47683',
    remoteDaemonUrls: '',
    authToken: '',
    workerCwd: '.',
    workerExecutable: typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent) ? 'npm.cmd' : 'npm',
    dryRun: true,
    executeBlocked: false,
    autoRoute: true,
  }));
  const [renderWorkerDaemonStatus, setRenderWorkerDaemonStatus] = useState<RenderWorkerDaemonStatus | null>(null);
  const [renderWorkerRun, setRenderWorkerRun] = useState<RenderWorkerDaemonRunRecord | null>(null);
  const [renderWorkerFleet, setRenderWorkerFleet] = useState<RenderWorkerDaemonStatus[]>([]);
  const [trustedRenderWorkers, setTrustedRenderWorkers] = useState<RenderWorkerTrustedDaemon[]>(() => readTrustedRenderWorkers());
  const [renderWorkerStatus, setRenderWorkerStatus] = useState('Render worker not checked');
  const [isSubmittingRenderWorker, setIsSubmittingRenderWorker] = useState(false);
  const [isDiscoveringRenderWorker, setIsDiscoveringRenderWorker] = useState(false);
  const [ffmpegCapabilities, setFfmpegCapabilities] = useState<FfmpegCapabilitiesView | null>(null);
  const [sampleProjectPackageDirectory, setSampleProjectPackageDirectory] = useState<string | null>(null);
  const [sampleProjectAvailable, setSampleProjectAvailable] = useState(false);
  const [comfyUIJob, setComfyUIJob] = useState<ComfyUIQueueJobView | null>(null);
  const [isQueueingComfyUI, setIsQueueingComfyUI] = useState(false);
  const [selectedComfyUIReviewId, setSelectedComfyUIReviewId] = useState<string | null>(null);
  const [sttJob, setSttJob] = useState<SttJobView | null>(null);
  const [isRunningStt, setIsRunningStt] = useState(false);
  const [cacheJobsByAssetId, setCacheJobsByAssetId] = useState<Record<string, MediaCacheJobView>>({});
  const [lastHookPlan, setLastHookPlan] = useState<EditorHookPlanView | null>(null);
  const [queueSettings, setQueueSettings] = useState<EditorQueueSettingsView>(DEFAULT_QUEUE_SETTINGS);
  const [captionSidecarSettings, setCaptionSidecarSettings] = useState<Required<CaptionSidecarOptions>>(DEFAULT_CAPTION_SIDECAR_SETTINGS);
  const [captionTightenGap, setCaptionTightenGap] = useState(0.05);
  const [captionSpeakerDraft, setCaptionSpeakerDraft] = useState('');
  const [silenceSettings, setSilenceSettings] = useState<SilenceRemovalSettings>(DEFAULT_SILENCE_REMOVAL_SETTINGS);
  const [silencePlan, setSilencePlan] = useState<SilenceRemovalPlan | null>(null);
  const [beatSettings, setBeatSettings] = useState<BeatDetectionSettings>(DEFAULT_BEAT_DETECTION_SETTINGS);
  const [beatPlan, setBeatPlan] = useState<BeatDetectionPlan | null>(null);
  const [lastAudioSyncPlan, setLastAudioSyncPlan] = useState<WaveformSyncPlan | null>(null);
  const [programAudioFftSample, setProgramAudioFftSample] = useState<ProgramAudioFftSample | null>(null);
  const [programVideoScopeReadout, setProgramVideoScopeReadout] = useState<VideoScopeReadout | null>(null);
  const [keyframeDraft, setKeyframeDraft] = useState<KeyframeDraft>(DEFAULT_KEYFRAME_DRAFT);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState('');
  const [commandPaletteActiveIndex, setCommandPaletteActiveIndex] = useState(0);
  const [titleTextDraft, setTitleTextDraft] = useState('New title');
  const [visualFadeDuration, setVisualFadeDuration] = useState(1);
  const [audioFadeDuration, setAudioFadeDuration] = useState(1);
  const [audioNormalizeTargetPeak, setAudioNormalizeTargetPeak] = useState(DEFAULT_NORMALIZE_TARGET_PEAK);
  const [status, setStatus] = useState('Ready');
  const [autosaveStatus, setAutosaveStatus] = useState('Autosave pending');
  const [lastSavedProjectText, setLastSavedProjectText] = useState(() => serializeProject(createDefaultEditorProject()));
  const [lastAutosavedProjectText, setLastAutosavedProjectText] = useState(() => serializeProject(createDefaultEditorProject()));
  const [markerLabel, setMarkerLabel] = useState('Review');
  const [savedProjects, setSavedProjects] = useState<SavedProjectSummary[]>([]);
  const [autosaves, setAutosaves] = useState<AutosaveSummary[]>([]);
  const [localProjectFallback, setLocalProjectFallback] = useState<ProjectPackageImport | null>(null);
  const [lastImportedProjectPackage, setLastImportedProjectPackage] = useState<ProjectPackageImport | null>(null);
  const [pendingCloudSyncConflict, setPendingCloudSyncConflict] = useState<ProjectCloudSyncConflictState | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timelinePlaybackRate, setTimelinePlaybackRate] = useState(0);
  const [sourcePlayhead, setSourcePlayhead] = useState(0);
  const [sourcePlaybackRate, setSourcePlaybackRate] = useState(0);
  const [sourceLoopPlaybackEnabled, setSourceLoopPlaybackEnabled] = useState(false);
  const [activeMonitor, setActiveMonitor] = useState<'source' | 'program'>('program');
  const [sourceMonitorPinned, setSourceMonitorPinned] = useState(false);
  const [sceneReadoutVisible, setSceneReadoutVisible] = useState(false);
  const [activeAssetPanel, setActiveAssetPanel] = useState<EditorAssetPanelId>('media');
  const [activeDockPanel, setActiveDockPanel] = useState<EditorDockPanelId>('clip');
  const [preferredPrimaryModeId, setPreferredPrimaryModeId] = useState<EditorPrimaryModeId>('media');
  const activePrimaryModeId = EDITOR_PRIMARY_MODES.find((mode) => (
    mode.id === preferredPrimaryModeId &&
    mode.assetPanel === activeAssetPanel &&
    mode.dockPanel === activeDockPanel
  ))?.id ?? EDITOR_PRIMARY_MODES.find((mode) => (
    mode.assetPanel === activeAssetPanel && mode.dockPanel === activeDockPanel
  ))?.id ?? null;
  const sourceMonitorVisible = sourceMonitorPinned || activeMonitor === 'source';
  const editorMonitorGridClass = resolveEditorMonitorGridClass(sourceMonitorVisible, sceneReadoutVisible);
  const handlePrimaryModeSelect = (mode: (typeof EDITOR_PRIMARY_MODES)[number]) => {
    setPreferredPrimaryModeId(mode.id);
    setActiveAssetPanel(mode.assetPanel);
    setActiveDockPanel(mode.dockPanel);
    setStatus(`${mode.label} workspace selected`);
  };
  const handleActivateProgramMonitor = () => {
    setActiveMonitor('program');
    setStatus('Program Monitor active');
  };
  const handleActivateSourceMonitor = () => {
    setSourceMonitorPinned(true);
    setActiveMonitor('source');
    setStatus('Source Monitor active');
  };
  const handleToggleSourceMonitorPanel = () => {
    if (sourceMonitorVisible) {
      if (activeMonitor === 'source') {
        setActiveMonitor('program');
        setStatus('Program Monitor active');
      }
      setSourceMonitorPinned(false);
      return;
    }

    setSourceMonitorPinned(true);
  };
  const [clipDragTargetTrackId, setClipDragTargetTrackId] = useState<string | null>(null);
  const [clipDragPreview, setClipDragPreview] = useState<TimelineClipDropPreview | null>(null);
  const [groupMovePreview, setGroupMovePreview] = useState<TimelineGroupMovePreview | null>(null);
  const [groupTrimPreview, setGroupTrimPreview] = useState<TimelineGroupTrimPreview | null>(null);
  const [neighborImpactPreview, setNeighborImpactPreview] = useState<TimelineNeighborImpactPreview | null>(null);
  const [rippleTrimPreview, setRippleTrimPreview] = useState<TimelineRippleTrimPreview | null>(null);
  const [assetDropPreview, setAssetDropPreview] = useState<TimelineAssetDropPreview | null>(null);
  const [timelineEditGuide, setTimelineEditGuide] = useState<TimelineEditGuide | null>(null);
  const [markerTimePreview, setMarkerTimePreview] = useState<{ id: string; time: number } | null>(null);
  const [mediaFileDropActive, setMediaFileDropActive] = useState(false);
  const [draggingAssetId, setDraggingAssetId] = useState<string | null>(null);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(DEFAULT_PIXELS_PER_SECOND);
  const [timelineShowWaveforms, setTimelineShowWaveforms] = useState(true);
  const [timelineShowThumbnails, setTimelineShowThumbnails] = useState(true);
  const [timelineTrackHeight, setTimelineTrackHeight] = useState(80);
  const [timelinePanelHeight, setTimelinePanelHeight] = useState(300);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [rippleMode, setRippleMode] = useState(false);
  const [gapInsertDuration, setGapInsertDuration] = useState(1);
  const [clipArrangeGap, setClipArrangeGap] = useState(0);
  const [precisionEditStepFrames, setPrecisionEditStepFrames] = useState(1);
  const [selectedTrackId, setSelectedTrackId] = useState('track-v1');
  const [sourcePrimaryPatchTrackId, setSourcePrimaryPatchTrackId] = useState('track-v1');
  const [sourceAudioPatchTrackId, setSourceAudioPatchTrackId] = useState('track-a1');
  const [sourcePrimaryPatchEnabled, setSourcePrimaryPatchEnabled] = useState(true);
  const [sourceAudioPatchEnabled, setSourceAudioPatchEnabled] = useState(true);
  const [clipboardClips, setClipboardClips] = useState<TimelineClip[]>([]);
  const [attributeClipboard, setAttributeClipboard] = useState<ClipAttributeClipboard | null>(null);
  const [editMode, setEditMode] = useState<'insert' | 'overwrite'>('insert');
  const [selectedSourceAssetId, setSelectedSourceAssetId] = useState('asset-interview');
  const [sourceRangesByAssetId, setSourceRangesByAssetId] = useState<Record<string, SourceRange>>({});
  const [mediaSearchQuery, setMediaSearchQuery] = useState('');
  const [mediaKindFilter, setMediaKindFilter] = useState<MediaBinKindFilter>('all');
  const [mediaSortKey, setMediaSortKey] = useState<MediaBinSortKey>('name');
  const [mediaBinFilter, setMediaBinFilter] = useState('all');
  const [mediaSmartFilter, setMediaSmartFilter] = useState<MediaBinSmartCollection>('all');
  const [markIn, setMarkIn] = useState<number | null>(null);
  const [markOut, setMarkOut] = useState<number | null>(null);
  const [exportRangeMode, setExportRangeMode] = useState<'timeline' | 'marked'>('timeline');
  const [loopPlaybackEnabled, setLoopPlaybackEnabled] = useState(false);
  const [boxSelection, setBoxSelection] = useState<TimelineBoxSelectionState | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId?: string } | null>(null);
  const [audioPeaksByAssetId, setAudioPeaksByAssetId] = useState<Record<string, number[]>>({});
  const [voiceoverState, setVoiceoverState] = useState<VoiceoverRecordingState>('idle');
  const [voiceoverRecorderSupport, setVoiceoverRecorderSupport] = useState<VoiceoverRecorderSupport>(() => (
    resolveVoiceoverRecorderSupport({ hasGetUserMedia: false, hasMediaRecorder: false })
  ));
  const [voiceoverTake, setVoiceoverTake] = useState(1);
  const [timelineViewport, setTimelineViewport] = useState<TimelineViewportState>({ scrollLeft: 0, viewportWidth: 920 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lutFileInputRef = useRef<HTMLInputElement>(null);
  const captionFileInputRef = useRef<HTMLInputElement>(null);
  const projectPackageFileInputRef = useRef<HTMLInputElement>(null);
  const edlFileInputRef = useRef<HTMLInputElement>(null);
  const fcpxmlFileInputRef = useRef<HTMLInputElement>(null);
  const markerFileInputRef = useRef<HTMLInputElement>(null);
  const relinkFileInputRef = useRef<HTMLInputElement>(null);
  const bulkRelinkFileInputRef = useRef<HTMLInputElement>(null);
  const relinkAssetIdRef = useRef<string | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const suppressNextTimelineVisibleScrollRef = useRef(false);
  const timelineLaneRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const importedObjectUrlsRef = useRef<string[]>([]);
  const markerDragRef = useRef<MarkerDragSessionState | null>(null);
  const projectReplacementGenerationRef = useRef(0);
  const voiceoverSessionRef = useRef<VoiceoverRecordingSession | null>(null);
  const voiceoverRequestIdRef = useRef(0);
  const linkedClipEditsEnabled = editorSettings.linkedClipEditMode === 'linked';

  useEffect(() => {
    setEditorSettings(readStoredEditorInteractionSettings());
    return subscribeEditorInteractionSettings(setEditorSettings);
  }, []);

  const beginProjectReplacementRequest = useCallback(() => {
    projectReplacementGenerationRef.current += 1;
    return projectReplacementGenerationRef.current;
  }, []);
  const isProjectReplacementRequestCurrent = useCallback((requestGeneration: number) => (
    projectReplacementGenerationRef.current === requestGeneration
  ), []);
  const cancelActiveVoiceoverSession = useCallback(() => {
    voiceoverRequestIdRef.current += 1;
    const session = voiceoverSessionRef.current;
    voiceoverSessionRef.current = null;
    if (session) {
      cancelVoiceoverRecording(session);
    }
  }, []);

  const commandPaletteState = useMemo(() => resolveCommandPaletteState({
    query: commandPaletteQuery,
    activeIndex: commandPaletteActiveIndex,
  }), [commandPaletteActiveIndex, commandPaletteQuery]);
  const openCommandPalette = useCallback(() => {
    setCommandPaletteOpen(true);
    setCommandPaletteActiveIndex(0);
  }, []);

  const {
    projectSaveState,
    projectSaveStateLabel,
    projectSaveStateClassName,
    assetById,
    assetReferenceCounts,
    unusedAssetCount,
  } = useMemo(() => resolveProjectSessionWorkspaceState({
    project,
    lastSavedProjectText,
    lastAutosavedProjectText,
  }), [lastAutosavedProjectText, lastSavedProjectText, project]);
  const projectAutosaveEffects = useMemo(
    () => resolveProjectAutosaveEffectState(projectSaveState),
    [projectSaveState],
  );
  const projectRecoveryState = useMemo(() => resolveProjectRecoveryIndexState({
    savedProjects,
    autosaves,
    localFallback: localProjectFallback,
    packageImport: lastImportedProjectPackage,
    currentProjectId: project.id,
  }), [autosaves, lastImportedProjectPackage, localProjectFallback, project.id, savedProjects]);
  const projectCloudSyncForcePlan = useMemo(() => resolveProjectCloudSyncForcePlan({
    conflict: pendingCloudSyncConflict,
    project,
  }), [pendingCloudSyncConflict, project]);

  useEffect(() => {
    const consistency = resolveProjectPersistenceConsistencyState({
      project,
      history,
      future,
      saveMarkers: {
        lastSavedProjectText,
        lastAutosavedProjectText,
      },
    });

    if (consistency.shouldUpdateHistory) {
      setHistory(consistency.history);
    }

    if (consistency.shouldUpdateFuture) {
      setFuture(consistency.future);
    }

    if (consistency.shouldUpdateSaveMarkers) {
      setLastSavedProjectText(consistency.saveMarkers.lastSavedProjectText);
      setLastAutosavedProjectText(consistency.saveMarkers.lastAutosavedProjectText);
    }
  }, [future, history, lastAutosavedProjectText, lastSavedProjectText, project]);

  useEffect(() => {
    if (projectCloudSyncForcePlan.status === 'blocked' && projectCloudSyncForcePlan.clearConflict) {
      setPendingCloudSyncConflict(null);
    }
  }, [projectCloudSyncForcePlan]);

  const {
    allClips,
    selectedClip,
    selectedClips,
    selectedClipTrack,
    selectedCaptions,
    selectedClipSummary,
    selectedClipAsset,
    selectedComfyUIBinding,
    selectedCanEditComfyUIBinding,
    selectedClipAnalysisAsset,
    selectedClipKeyframes,
    selectedSpeedRampPoints,
    selectedHasSpeedRamp,
    selectedAnyHasSpeedRamp,
    selectedMotionEffect,
    selectedMotionTransform,
    selectedCanvasLayoutMode,
    selectedIsTitleClip,
    selectedTitleText,
    selectedClipLocalTime,
  } = useMemo(() => resolveSelectedClipWorkspaceState({
    project,
    selectedClipId,
    selectedClipIds,
    selectedCaptionIds,
    assetById,
    audioPeaksByAssetId,
    playhead,
  }), [
    assetById,
    audioPeaksByAssetId,
    playhead,
    project,
    selectedCaptionIds,
    selectedClipId,
    selectedClipIds,
  ]);
  const visualTimelineGaps = useMemo(() => (
    findVisualTimelineGaps(project, { minGapDuration: Math.max(0.5, 1 / project.fps) })
  ), [project]);
  const {
    selectedCanUseMotion,
    selectedCanUseProgramMonitorMotion,
    selectedVisualFadeClipIds,
    selectedCanApplyVisualFade,
    selectedCanApplyCanvasLayout,
    selectedCanApplyMotionPreset,
    selectedCanApplyFreezeFrame,
    selectedCanClearFreezeFrame,
    selectedCanDetachAudio,
    selectedCanRelinkAudio,
    selectedCanUnlinkAudio,
    selectedLinkPair,
    selectedCanLinkAudio,
    selectedAudioSyncPair,
    selectedCanSyncByWaveform,
    selectedCanApplyCropPreset,
    selectedCropMaskAddClipIds,
    selectedCanAddCropMask,
    selectedColorPresetClipIds,
    selectedCanApplyColorPreset,
    selectedColorEffectAddClipIds,
    selectedCanAddColorEffect,
    selectedCanAddColorMatch,
    selectedCanApplyColorLut,
    selectedVisualFilterClipIds,
    selectedCanApplyVisualFilter,
    selectedAiEnhancementClipIds,
    selectedCanApplyAiEnhancement,
    selectedSmartReframeAddClipIds,
    selectedCanAddSmartReframe,
    selectedSubjectTrackingClipIds,
    selectedCanTrackSubject,
    selectedObjectMaskClipIds,
    selectedCanApplyObjectMask,
    selectedCanApplyStabilize,
    selectedAudioGainAddClipIds,
    selectedCanAddAudioGain,
    selectedAudioCleanupClipIds,
    selectedCanApplyAudioCleanup,
    selectedAudioFadeClipIds,
    selectedCanApplyAudioFade,
    selectedNormalizeClipIds,
    selectedCanNormalizeAudio,
    selectedPeakNormalizePlan,
    selectedCanRemoveSilence,
    selectedCanDetectBeats,
  } = useMemo(() => resolveSelectedClipCapabilities({
    selectedClip,
    selectedClips,
    selectedClipTrack,
    selectedClipAsset,
    selectedClipAnalysisAsset,
    assetById,
    audioPeaksByAssetId,
    audioNormalizeTargetPeak,
  }), [
    assetById,
    audioNormalizeTargetPeak,
    audioPeaksByAssetId,
    selectedClip,
    selectedClipAnalysisAsset,
    selectedClipAsset,
    selectedClipTrack,
    selectedClips,
  ]);
  const {
    mediaHealth,
    mediaHealthByAssetId,
    filteredMediaAssets,
    activeCacheJobAssetIds,
    filteredMediaCachePlan,
    mediaBinCollections,
    mediaSmartCollections,
  } = useMemo(() => resolveMediaWorkspaceState({
    project,
    assetReferenceCounts,
    cacheJobsByAssetId,
    filters: {
      query: mediaSearchQuery,
      kind: mediaKindFilter,
      sort: mediaSortKey,
      bin: mediaBinFilter,
      smart: mediaSmartFilter,
    },
  }), [
    assetReferenceCounts,
    cacheJobsByAssetId,
    mediaBinFilter,
    mediaKindFilter,
    mediaSearchQuery,
    mediaSmartFilter,
    mediaSortKey,
    project,
  ]);
  const bulkRelinkCandidateCount = useMemo(() => (
    resolveBulkRelinkCandidateAssetIds(project.assets).length
  ), [project.assets]);
  const {
    selectedSourceAsset,
    selectedSourceRange,
    selectedSourceDuration,
    selectedSourceAssetBin,
    selectedSourcePrimaryKind,
    selectedSourceHasPrimaryPatch,
    selectedSourceHasAudioPatch,
    activeSourcePrimaryPatchTrackId,
    activeSourceAudioPatchTrackId,
    activeSourcePrimaryPatchTrack,
    activeSourceAudioPatchTrack,
  } = useMemo(() => resolveSourceWorkspaceState({
    project,
    assetById,
    selectedSourceAssetId,
    sourceRangesByAssetId,
    sourcePrimaryPatchTrackId,
    sourceAudioPatchTrackId,
    selectedTrackId,
  }), [
    assetById,
    project,
    selectedSourceAssetId,
    sourceRangesByAssetId,
    sourcePrimaryPatchTrackId,
    sourceAudioPatchTrackId,
    selectedTrackId,
  ]);
  const sourcePrimaryPatchTrackOptions = useMemo(() => resolveSourcePatchTrackOptions({
    tracks: project.tracks,
    targetKind: selectedSourcePrimaryKind,
  }), [project.tracks, selectedSourcePrimaryKind]);
  const sourceAudioPatchTrackOptions = useMemo(() => resolveSourcePatchTrackOptions({
    tracks: project.tracks,
    targetKind: 'audio',
  }), [project.tracks]);
  const {
    timelineWidth,
    selectedClipMoveTrackOptions,
    activeTimelineClip,
    markedRange,
    activeLoopRange,
    timelineEditSnapPoints,
  } = useMemo(() => resolveTimelineWorkspaceState({
    project,
    selectedClips,
    allClips,
    assetById,
    pixelsPerSecond,
    playhead,
    markIn,
    markOut,
    loopPlaybackEnabled,
  }), [
    allClips,
    assetById,
    loopPlaybackEnabled,
    markIn,
    markOut,
    pixelsPerSecond,
    playhead,
    project,
    selectedClips,
  ]);
  const timelinePlayheadEditTargetClip = timelineClipContainsPlayhead(selectedClip, playhead)
    ? selectedClip
    : activeTimelineClip ?? null;
  const canEditTimelinePlayheadTarget = Boolean(timelinePlayheadEditTargetClip);
  const canDeleteTimelineToolbarTarget = selectedClips.length > 0 || canEditTimelinePlayheadTarget;
  const timelineClipRenderWindow = useMemo(() => resolveTimelineClipRenderWindow({
    scrollLeft: timelineViewport.scrollLeft,
    viewportWidth: timelineViewport.viewportWidth,
    pixelsPerSecond,
    projectDuration: project.duration,
    timelineStartOffsetPixels: TIMELINE_TRACK_HEADER_WIDTH,
  }), [pixelsPerSecond, project.duration, timelineViewport.scrollLeft, timelineViewport.viewportWidth]);
  const handleTimelineViewportChange = useCallback((viewport: TimelineViewportState) => {
    setTimelineViewport((current) => (
      current.scrollLeft === viewport.scrollLeft && current.viewportWidth === viewport.viewportWidth
        ? current
        : viewport
    ));
  }, []);
  const {
    comfyUIReviewItems,
    selectedComfyUIReviewItem,
    sttCaptionReview,
    speakerDiarizationReport,
    programPreviewStack,
    programAudioMeter,
    programAudioAnalysis,
  } = useMemo(() => resolveProgramReviewWorkspaceState({
    project,
    playhead,
    allClips,
    assetById,
    audioPeaksByAssetId,
    comfyUIJob,
    selectedComfyUIReviewId,
  }), [
    allClips,
    assetById,
    audioPeaksByAssetId,
    comfyUIJob,
    playhead,
    project,
    selectedComfyUIReviewId,
  ]);
  const activePreviewCacheAssetIds = useMemo(() => (
    resolveProgramPreviewCacheCandidateAssetIds(programPreviewStack)
  ), [programPreviewStack]);
  const programAudioLayerSignature = useMemo(() => (
    programPreviewStack.audioLayers.map((layer) => `${layer.trackId}:${layer.clip.id}`).join('|')
  ), [programPreviewStack.audioLayers]);
  const programVideoScopeLayerSignature = useMemo(() => (
    programPreviewStack.mediaLayers
      .filter((layer) => layer.asset?.kind === 'video' || layer.asset?.kind === 'image')
      .map((layer) => `${layer.trackId}:${layer.clip.id}:${layer.asset?.id ?? ''}`)
      .join('|')
  ), [programPreviewStack.mediaLayers]);
  const programAudioAnalysisWithFft = useMemo(() => (
    programAudioFftSample && programAudioFftSample.capturedLayerCount > 0
      ? { ...programAudioAnalysis, fft: programAudioFftSample }
      : programAudioAnalysis
  ), [programAudioAnalysis, programAudioFftSample]);
  const handleProgramAudioFftSample = useCallback((sample: ProgramAudioFftSample) => {
    setProgramAudioFftSample((current) => {
      const next = sample.capturedLayerCount > 0 ? sample : null;
      return isSameProgramAudioFftSample(current, next) ? current : next;
    });
  }, []);
  const handleProgramVideoScopeReadout = useCallback((readout: VideoScopeReadout | null) => {
    setProgramVideoScopeReadout((current) => (
      videoScopeReadoutSignature(current) === videoScopeReadoutSignature(readout)
        ? current
        : readout ? { ...readout } : null
    ));
  }, []);

  useEffect(() => {
    setProgramAudioFftSample(null);
  }, [programAudioLayerSignature]);

  useEffect(() => {
    setProgramVideoScopeReadout(null);
  }, [programVideoScopeLayerSignature]);

  const {
    activeExportProfileId,
    selectedExportProfile,
    activeExportRange,
    exportRangeRequest,
    renderPreflight,
    renderBlockedByPreflight,
    masterAudioSettings,
    previewRenderParity,
    preflightMediaCachePlan,
  } = useMemo(() => resolveExportWorkspaceState({
    project,
    selectedExportProfileId,
    exportRangeMode,
    markedRange,
    playhead,
    renderPlan,
    activeCacheJobAssetIds,
  }), [
    activeCacheJobAssetIds,
    exportRangeMode,
    markedRange,
    playhead,
    project,
    renderPlan,
    selectedExportProfileId,
  ]);
  const jobHistorySummary = useMemo(() => buildJobHistorySummary({
    renderJobs,
    renderJob,
    mediaCacheJobsByAssetId: cacheJobsByAssetId,
    comfyUIJob,
    sttJob,
  }), [
    cacheJobsByAssetId,
    comfyUIJob,
    renderJob,
    renderJobs,
    sttJob,
  ]);

  const setTimelinePlayhead = (time: number) => {
    setPlayhead(resolveTimelinePlayheadTime({ project, time, snapEnabled }));
  };

  const handleProgramMonitorPlayheadChange = (time: number) => {
    setActiveMonitor('program');
    setTimelinePlayhead(time);
  };

  const handleEditModeChange = (mode: 'insert' | 'overwrite') => {
    setEditMode(mode);
    setStatus(`Edit mode: ${mode === 'overwrite' ? 'Overwrite' : 'Insert'}`);
  };

  const applyTimelineEdgeAutoScroll = (clientX: number): number => {
    const scrollContainer = timelineScrollRef.current;
    if (!scrollContainer) {
      return 0;
    }

    const rect = scrollContainer.getBoundingClientRect();
    const nextScrollLeft = resolveTimelineEdgeAutoScrollLeft({
      clientX,
      viewportLeft: rect.left,
      viewportWidth: rect.width,
      currentScrollLeft: scrollContainer.scrollLeft,
      maxScrollLeft: scrollContainer.scrollWidth - scrollContainer.clientWidth,
    });
    scrollContainer.scrollLeft = nextScrollLeft;

    return nextScrollLeft;
  };

  const showTimelineEditGuide = (guide: TimelineEditGuide | null) => {
    setTimelineEditGuide(resolveTimelineEditGuide(guide));
  };

  useEffect(() => {
    setVoiceoverRecorderSupport(resolveVoiceoverRecorderSupport(readVoiceoverRecorderEnvironment()));
  }, []);

  useEffect(() => {
    const scrollContainer = timelineScrollRef.current;
    if (!scrollContainer) {
      return;
    }

    if (suppressNextTimelineVisibleScrollRef.current) {
      suppressNextTimelineVisibleScrollRef.current = false;
      return;
    }

    scrollContainer.scrollLeft = resolveTimelineVisibleScrollLeft({
      playhead,
      viewportWidth: scrollContainer.clientWidth,
      currentScrollLeft: scrollContainer.scrollLeft,
      pixelsPerSecond,
      timelineStartOffsetPixels: TIMELINE_TRACK_HEADER_WIDTH,
    });
  }, [pixelsPerSecond, playhead]);

  const setProgramPlaybackRate = (rate: number) => {
    const playbackState = resolveProgramPlaybackRateState(rate);
    setTimelinePlaybackRate(playbackState.timelinePlaybackRate);
    setIsPlaying(playbackState.isPlaying);
    setActiveMonitor(playbackState.activeMonitor);
  };

  const handleFitTimelineZoom = (mode: 'timeline' | 'selection' = 'timeline') => {
    const viewportWidth = timelineScrollRef.current?.clientWidth ?? 920;
    const fitState = resolveTimelineFitZoom({
      project,
      selectedClipIds,
      viewportWidth,
      mode,
      timelineStartOffsetPixels: TIMELINE_TRACK_HEADER_WIDTH,
    });

    if (fitState.nextPixelsPerSecond !== pixelsPerSecond) {
      suppressNextTimelineVisibleScrollRef.current = true;
    }
    setPixelsPerSecond(fitState.nextPixelsPerSecond);
    if (timelineScrollRef.current) {
      timelineScrollRef.current.scrollLeft = fitState.nextScrollLeft;
    }

    setStatus(fitState.status);
  };

  const handleTimelinePanelResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startHeight = timelinePanelHeight;
    const maxHeight = Math.max(260, Math.round(window.innerHeight * 0.62));

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const nextHeight = clampNumber(startHeight + (startY - moveEvent.clientY), 220, maxHeight);
      setTimelinePanelHeight(Math.round(nextHeight));
    };
    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  };

  const handleTimelineWheelZoom = (event: WheelEvent<HTMLDivElement>) => {
    if (!editorSettings.wheelZoomEnabled) {
      return;
    }

    const isZoomGesture = event.ctrlKey || event.metaKey;
    const isHorizontalScrollGesture = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
    if (!isZoomGesture || isHorizontalScrollGesture) {
      return;
    }

    event.preventDefault();
    const scrollContainer = timelineScrollRef.current;
    if (!scrollContainer) {
      return;
    }

    const rect = scrollContainer.getBoundingClientRect();
    const plan = resolveTimelineWheelZoomInteraction({
      clientX: event.clientX,
      viewportLeft: rect.left,
      viewportWidth: scrollContainer.clientWidth,
      scrollLeft: scrollContainer.scrollLeft,
      currentPixelsPerSecond: pixelsPerSecond,
      deltaY: event.deltaY,
      deltaMode: event.deltaMode,
      duration: project.duration,
      timelineStartOffsetPixels: TIMELINE_TRACK_HEADER_WIDTH,
    });

    if (!plan.shouldZoom) {
      return;
    }

    suppressNextTimelineVisibleScrollRef.current = true;
    setPixelsPerSecond(plan.nextPixelsPerSecond);
    window.requestAnimationFrame(() => {
      scrollContainer.scrollLeft = plan.nextScrollLeft;
      setTimelineViewport({
        scrollLeft: plan.nextScrollLeft,
        viewportWidth: scrollContainer.clientWidth,
      });
    });
    setStatus(`Timeline zoom ${plan.nextPixelsPerSecond}px/s at ${formatTimecode(plan.anchorTime, project.fps)}`);
  };

  const handleTimelineRulerPointerDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    const requestGeneration = projectReplacementGenerationRef.current;
    const rect = event.currentTarget.getBoundingClientRect();
    const scrubStartPlan = beginTimelineScrubInteraction({
      rulerLeft: rect.left,
      startScrollLeft: timelineScrollRef.current?.scrollLeft ?? 0,
      playhead,
    });
    let scrubSession = scrubStartPlan.session;
    setActiveMonitor(scrubStartPlan.activeMonitor);

    const seekFromClientX = (clientX: number) => {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      const currentScrollLeft = applyTimelineEdgeAutoScroll(clientX);
      const movePlan = resolveTimelineScrubInteractionMove({
        session: scrubSession,
        clientX,
        currentScrollLeft,
        pixelsPerSecond,
        duration: project.duration,
        frameRate: project.fps,
      });
      scrubSession = movePlan.session;
      setTimelinePlayhead(movePlan.playhead);
    };

    seekFromClientX(event.clientX);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      seekFromClientX(moveEvent.clientX);
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      const currentScrollLeft = applyTimelineEdgeAutoScroll(upEvent.clientX);
      const endPlan = resolveTimelineScrubInteractionEnd({
        session: scrubSession,
        clientX: upEvent.clientX,
        currentScrollLeft,
        pixelsPerSecond,
        duration: project.duration,
        frameRate: project.fps,
      });
      scrubSession = endPlan.session;
      setTimelinePlayhead(endPlan.playhead);
      setStatus(endPlan.status);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const toggleProgramPlayback = () => {
    setProgramPlaybackRate(resolveProgramPlaybackToggleRate(timelinePlaybackRate));
  };

  const toggleSourcePlayback = () => {
    const playbackState = resolveSourceMonitorPlaybackRateState(
      resolveSourceMonitorPlaybackToggleRate(sourcePlaybackRate),
    );
    setActiveMonitor(playbackState.activeMonitor);
    setSourcePlaybackRate(playbackState.sourcePlaybackRate);
    setStatus(formatSourcePlaybackStatus(playbackState.sourcePlaybackRate));
  };

  const toggleActiveMonitorPlayback = () => {
    if (activeMonitor === 'source') {
      toggleSourcePlayback();
      return;
    }

    toggleProgramPlayback();
  };

  const handleToggleSourceLoopPlayback = () => {
    const plan = resolveSourceMonitorLoopPlaybackToggle({
      sourceLoopPlaybackEnabled,
      asset: selectedSourceAsset,
      sourceRange: selectedSourceRange,
      sourcePlayhead,
    });
    setSourceLoopPlaybackEnabled(plan.sourceLoopPlaybackEnabled);
    if (plan.activeMonitor) {
      setActiveMonitor(plan.activeMonitor);
    }
    if (plan.nextSourcePlayhead !== undefined) {
      setSourcePlayhead(plan.nextSourcePlayhead);
    }
    setStatus(plan.status);
  };

  const handleToggleLoopPlayback = () => {
    if (activeMonitor === 'source') {
      handleToggleSourceLoopPlayback();
      return;
    }

    const plan = resolveTimelineLoopPlaybackToggle({
      loopPlaybackEnabled,
      markedRange,
      playhead,
    });
    setLoopPlaybackEnabled(plan.loopPlaybackEnabled);
    if (plan.nextPlayhead !== undefined) {
      setPlayhead(plan.nextPlayhead);
    }
    setStatus(plan.status);
  };

  const handleShuttlePlayback = (direction: ShuttleDirection) => {
    if (activeMonitor === 'source') {
      setSourcePlaybackRate((current) => resolveSourceMonitorShuttlePlaybackState({
        currentRate: current,
        direction,
      }).sourcePlaybackRate);
      return;
    }

    const nextRate = resolveShuttlePlaybackRate(timelinePlaybackRate, direction);
    setProgramPlaybackRate(nextRate);
  };

  const setSourceMonitorPlayhead = (time: number) => {
    setSourcePlayhead(resolveSourceMonitorPlayhead({ asset: selectedSourceAsset, time }));
  };

  const handleGoToSourceBoundary = (edge: 'start' | 'end') => {
    if (!selectedSourceAsset) {
      setStatus('Select a source asset first');
      return;
    }

    const sourcePlayhead = resolveSourceMonitorPlayhead({
      asset: selectedSourceAsset,
      time: edge === 'start' ? 0 : selectedSourceAsset.duration,
    });
    setActiveMonitor('source');
    setSourcePlayhead(sourcePlayhead);
    setStatus(`Source ${edge} ${formatTimecode(sourcePlayhead, project.fps)}`);
  };

  const handleNudgeSourcePlayhead = (deltaSeconds: number) => {
    setActiveMonitor('source');
    setSourcePlayhead((currentPlayhead) => resolveSourceMonitorNudgePlayhead({
      asset: selectedSourceAsset,
      currentPlayhead,
      deltaSeconds,
    }));
  };

  const handleSelectSourceAsset = (assetId: string) => {
    const plan = resolveSourceAssetSelection({
      assetId,
      asset: assetById.get(assetId),
      currentRange: sourceRangesByAssetId[assetId],
    });
    setSelectedSourceAssetId(plan.selectedSourceAssetId);
    setActiveMonitor(plan.activeMonitor);
    setSourcePlaybackRate(plan.sourcePlaybackRate);

    if (plan.sourcePlayhead !== undefined) {
      setSourcePlayhead(plan.sourcePlayhead);
    }
  };

  const revealImportedMediaAssets = (assetIds: string[]) => {
    const selectedImportedAssetId = assetIds[assetIds.length - 1];
    if (!selectedImportedAssetId) {
      return;
    }

    setSelectedSourceAssetId(selectedImportedAssetId);
    setSourcePlayhead(0);
    setSourcePlaybackRate(0);
    setSourceMonitorPinned(true);
    setActiveMonitor('source');
    setPreferredPrimaryModeId('media');
    setActiveAssetPanel('media');
    setActiveDockPanel('clip');
    setMediaSearchQuery('');
    setMediaKindFilter('all');
    setMediaSmartFilter('all');
    setMediaBinFilter('all');
  };

  const handleUpdateSelectedSourceBin = (binName: string) => {
    const plan = resolveSourceAssetBinUpdatePlan({
      selectedSourceAsset,
      selectedSourceAssetBin,
      requestedBinName: binName,
      currentMediaBinFilter: mediaBinFilter,
    });
    if (!plan.canUpdate || !plan.assetId || !plan.commitLabel) {
      setStatus(plan.status);
      return;
    }

    const committed = commitProject(plan.commitLabel, (current) => (
      updateMediaAssetBin(current, [plan.assetId!], plan.binName ?? '')
    ));

    if (committed) {
      setMediaBinFilter(plan.nextMediaBinFilter);
      setStatus(plan.status);
    }
  };

  const setPrimarySelection = (clipId: string) => {
    const nextSelection = resolvePrimarySelection(clipId);
    setSelectedClipId(nextSelection.selectedClipId);
    setSelectedClipIds(nextSelection.selectedClipIds);
  };

  const handleFocusPreflightIssue = (issue: RenderPreflightIssue) => {
    const plan = resolvePreflightIssueFocusPlan({ issue, project, assetById });

    if (plan.sourceAssetId) {
      handleSelectSourceAsset(plan.sourceAssetId);
    }
    if (plan.mediaBinFilter) {
      setMediaBinFilter(plan.mediaBinFilter);
    }
    if (plan.mediaSmartFilter) {
      setMediaSmartFilter(plan.mediaSmartFilter);
    }
    if (plan.selectedClipId) {
      setPrimarySelection(plan.selectedClipId);
    }
    if (plan.selectedCaptionIds) {
      setSelectedCaptionIds(plan.selectedCaptionIds);
    }
    if (plan.selectedTrackId) {
      setSelectedTrackId(plan.selectedTrackId);
    }
    if (plan.playhead !== undefined) {
      setTimelinePlayhead(plan.playhead);
    }
    if (plan.status) {
      setStatus(plan.status);
    }
  };

  const handleRelinkPreflightIssueAsset = (issue: RenderPreflightIssue) => {
    const plan = resolvePreflightIssueRelinkPlan({ issue, assetById });
    if (!plan.canRelink) {
      setStatus(plan.status ?? 'This preflight issue is not tied to a relinkable asset');
      return;
    }

    handleSelectSourceAsset(plan.sourceAssetId!);
    handleRelinkAsset(plan.relinkAssetId!);
  };

  const handleResolvePreflightIssue = async (issue: RenderPreflightIssue) => {
    const action = resolvePreflightIssuePrimaryAction(issue);

    switch (action.kind) {
      case 'cache':
        await handleRebuildPreflightMediaCache();
        return;
      case 'relink':
        handleRelinkPreflightIssueAsset(issue);
        return;
      case 'output':
        await handleRenderProject();
        return;
      case 'profile':
        setSelectedExportProfileId(activeExportProfileId);
        setStatus(action.detail);
        return;
      case 'focus':
      case 'render':
      case 'review':
      default:
        handleFocusPreflightIssue(issue);
    }
  };

  const handleSelectAllClips = () => {
    const selection = resolveSelectAllTimelineClips(project);
    setSelectedClipIds(selection.selectedClipIds);
    setSelectedClipId(selection.selectedClipId);
    setStatus(selection.status);
  };

  const handleSelectClipsRelativeToPlayhead = (direction: 'left' | 'right', allTracks = false) => {
    const selection = resolveRelativeTimelineClipSelection({
      project,
      playhead,
      direction,
      selectedTrackId,
      allTracks,
    });
    setSelectedClipIds(selection.selectedClipIds);
    setSelectedClipId(selection.selectedClipId);
    setStatus(selection.status);
  };

  const handleSelectClipAtPlayhead = (allTracks = false) => {
    const selection = resolveTimelineClipSelectionAtPlayhead({
      project,
      playhead,
      selectedTrackId,
      allTracks,
    });
    setSelectedClipIds(selection.selectedClipIds);
    setSelectedClipId(selection.selectedClipId);
    setStatus(selection.status);
  };

  const handleJumpAdjacentEdit = (direction: 'previous' | 'next', allTracks = false) => {
    const result = resolveAdjacentTimelineEdit({
      project,
      playhead,
      direction,
      selectedTrackId,
      allTracks,
    });

    if (result.editPoint === undefined) {
      setStatus(result.status);
      return;
    }

    setTimelinePlayhead(result.editPoint);
    setStatus(result.status);
  };

  const handleEscape = () => {
    const clearState = resolveEditorEscapeClearState();
    setContextMenu(clearState.contextMenu);
    setProgramPlaybackRate(clearState.programPlaybackRate);
    setSourcePlaybackRate(clearState.sourcePlaybackRate);
    setSelectedClipIds(clearState.selectedClipIds);
    setSelectedClipId(clearState.selectedClipId);
    setSelectedCaptionIds(clearState.selectedCaptionIds);
    setStatus(clearState.status);
  };

  useEffect(() => {
    const controller = new AbortController();

    setEditorHydrated(true);
    setLocalProjectFallback(readLocalProjectFallbackSnapshot());
    void refreshProjects(controller.signal);
    void refreshAutosaves(controller.signal);
    void refreshQueueSettings(controller.signal);
    void refreshFfmpegCapabilities(controller.signal);
    void refreshRuntimeDiagnostics(controller.signal);
    window.addEventListener('pagehide', cancelActiveVoiceoverSession);

    return () => {
      controller.abort();
      window.removeEventListener('pagehide', cancelActiveVoiceoverSession);
      cancelActiveVoiceoverSession();
      revokeRetainedBrowserMediaObjectUrls(importedObjectUrlsRef.current);
      importedObjectUrlsRef.current = [];
    };
  }, [cancelActiveVoiceoverSession]);

  useEffect(() => {
    importedObjectUrlsRef.current = pruneRetainedBrowserMediaObjectUrls(
      importedObjectUrlsRef.current,
      project.assets.flatMap((asset) => [asset.source, asset.renderPath]),
    );
  }, [project.assets]);

  useEffect(() => {
    const exportSyncState = resolveExportPlanSyncState({
      project,
      selectedExportProfileId,
      exportRange: exportRangeRequest,
    });

    if (exportSyncState.shouldUpdateSelectedExportProfile) {
      setSelectedExportProfileId(exportSyncState.selectedExportProfileId);
    }

    setExportManifest(exportSyncState.manifest);
    setRenderPlan(exportSyncState.plan);
  }, [exportRangeRequest, project, selectedExportProfileId]);

  useEffect(() => {
    if (!projectAutosaveEffects.autosaveStatus) {
      return;
    }

    setAutosaveStatus(projectAutosaveEffects.autosaveStatus);
  }, [projectAutosaveEffects]);

  useEffect(() => {
    if (!projectAutosaveEffects.shouldWarnBeforeUnload) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (projectAutosaveEffects.shouldWriteEmergencyLocalAutosave) {
        try {
          writeLocalAutosaveSnapshot(project);
        } catch {
          // The page is closing; scheduled autosave and pagehide handlers cover normal reporting.
        }
      }

      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [project, projectAutosaveEffects]);

  useEffect(() => {
    if (!projectAutosaveEffects.shouldWriteEmergencyLocalAutosave) {
      return;
    }

    const writeEmergencyLocalAutosave = () => {
      try {
        const savedAt = writeLocalAutosaveSnapshot(project);
        const fallback = resolveLocalAutosaveFallbackState({ project, savedAt });
        setLastAutosavedProjectText(fallback.autosavedProjectText);
        setAutosaveStatus(fallback.autosaveStatus);
        setLocalProjectFallback(readLocalProjectFallbackSnapshot());
      } catch {
        // The normal scheduled autosave path still reports local fallback failures.
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        writeEmergencyLocalAutosave();
      }
    };

    window.addEventListener('pagehide', writeEmergencyLocalAutosave);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', writeEmergencyLocalAutosave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [project, projectAutosaveEffects.shouldWriteEmergencyLocalAutosave]);

  useEffect(() => {
    const nextExportRangeMode = resolveValidatedExportRangeMode({
      exportRangeMode,
      markedRange,
    });
    if (nextExportRangeMode !== exportRangeMode) {
      setExportRangeMode(nextExportRangeMode);
    }
  }, [exportRangeMode, markedRange]);

  useEffect(() => {
    const nextLoopPlaybackEnabled = resolveValidatedLoopPlaybackEnabled({
      loopPlaybackEnabled,
      markedRange,
    });
    if (nextLoopPlaybackEnabled !== loopPlaybackEnabled) {
      setLoopPlaybackEnabled(nextLoopPlaybackEnabled);
    }
  }, [loopPlaybackEnabled, markedRange]);

  useEffect(() => {
    const sourceAudit = auditSourceMonitorConsistency({
      project,
      assetById,
      selectedSourceAssetId,
      sourceRangesByAssetId,
      sourcePlayhead,
      sourceLoopPlaybackEnabled,
      sourcePrimaryPatchTrackId,
      sourceAudioPatchTrackId,
      selectedTrackId,
      sourcePrimaryPatchEnabled,
      sourceAudioPatchEnabled,
    });

    if (sourceAudit.shouldUpdateSelectedSourceAssetId) {
      setSelectedSourceAssetId(sourceAudit.selectedSourceAssetId);
    }

    if (sourceAudit.shouldUpdateSourceRange && sourceAudit.workspace.selectedSourceAsset && sourceAudit.sourceRange) {
      setSourceRangesByAssetId((current) => ({
        ...current,
        [sourceAudit.workspace.selectedSourceAsset!.id]: sourceAudit.sourceRange!,
      }));
    }

    if (sourceAudit.shouldUpdateSourcePlayhead) {
      setSourcePlayhead(sourceAudit.sourcePlayhead);
    }

    if (sourceAudit.shouldDisableSourceLoopPlayback) {
      setSourceLoopPlaybackEnabled(false);
    }

    if (sourceAudit.status === 'failed') {
      setSourcePlaybackRate(0);
    }

    if (sourceAudit.sourcePrimaryPatchTrackId && sourceAudit.sourcePrimaryPatchTrackId !== sourcePrimaryPatchTrackId) {
      setSourcePrimaryPatchTrackId(sourceAudit.sourcePrimaryPatchTrackId);
    }

    if (sourceAudit.sourceAudioPatchTrackId && sourceAudit.sourceAudioPatchTrackId !== sourceAudioPatchTrackId) {
      setSourceAudioPatchTrackId(sourceAudit.sourceAudioPatchTrackId);
    }
  }, [
    assetById,
    project,
    selectedSourceAssetId,
    selectedTrackId,
    sourceAudioPatchEnabled,
    sourceAudioPatchTrackId,
    sourceLoopPlaybackEnabled,
    sourcePlayhead,
    sourcePrimaryPatchEnabled,
    sourcePrimaryPatchTrackId,
    sourceRangesByAssetId,
  ]);

  useEffect(() => {
    const nextReviewId = resolveComfyUIReviewSelectionId({
      comfyUIReviewItems,
      selectedComfyUIReviewId,
    });
    if (nextReviewId !== selectedComfyUIReviewId) {
      setSelectedComfyUIReviewId(nextReviewId);
    }
  }, [comfyUIReviewItems, selectedComfyUIReviewId]);

  useEffect(() => {
    setSelectedCaptionIds((current) => resolveValidCaptionSelection({
      captions: project.captions,
      currentSelectedCaptionIds: current,
    }));
  }, [project.captions]);

  useEffect(() => {
    setCaptionSpeakerDraft(resolveCaptionSpeakerDraft(selectedCaptions));
  }, [selectedCaptions]);

  useEffect(() => {
    if (timelinePlaybackRate === 0) {
      return;
    }

    let animationFrame = 0;
    let previousTimestamp: number | undefined;
    const tick = (timestamp: number) => {
      const elapsedSeconds = resolvePlaybackFrameElapsedSeconds(previousTimestamp, timestamp);
      previousTimestamp = timestamp;

      // 다음 프레임을 먼저 예약해야 상태 갱신이 던지더라도 재생 루프가 죽지 않는다.
      animationFrame = window.requestAnimationFrame(tick);

      setPlayhead((current) => {
        const frameState = resolvePlaybackFrameState({
          currentPlayhead: current,
          duration: project.duration,
          playbackRate: timelinePlaybackRate,
          elapsedSeconds,
          loopRange: activeLoopRange,
        });
        if (frameState.shouldStop) {
          setTimelinePlaybackRate(frameState.playbackRate);
          setIsPlaying(frameState.isPlaying);
        }

        return frameState.playhead;
      });
    };

    animationFrame = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(animationFrame);
  }, [activeLoopRange, timelinePlaybackRate, project.duration]);

  useEffect(() => {
    if (!selectedSourceAsset || sourcePlaybackRate === 0) {
      return;
    }

    let animationFrame = 0;
    let previousTimestamp: number | undefined;
    const tick = (timestamp: number) => {
      const elapsedSeconds = resolvePlaybackFrameElapsedSeconds(previousTimestamp, timestamp);
      previousTimestamp = timestamp;

      // 다음 프레임을 먼저 예약해야 상태 갱신이 던지더라도 재생 루프가 죽지 않는다.
      animationFrame = window.requestAnimationFrame(tick);

      setSourcePlayhead((current) => {
        const frameState = resolvePlaybackFrameState({
          currentPlayhead: current,
          duration: selectedSourceAsset.duration,
          playbackRate: sourcePlaybackRate,
          elapsedSeconds,
          loopRange: sourceLoopPlaybackEnabled && selectedSourceRange
            ? { start: selectedSourceRange.in, end: selectedSourceRange.out }
            : null,
        });
        if (frameState.shouldStop) {
          setSourcePlaybackRate(frameState.playbackRate);
        }

        return frameState.playhead;
      });
    };

    animationFrame = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(animationFrame);
  }, [selectedSourceAsset, selectedSourceRange, sourceLoopPlaybackEnabled, sourcePlaybackRate]);

  useEffect(() => {
    const audioPeakRequests = resolveRuntimeAudioPeakReadRequests({
      assets: project.assets,
      audioPeaksByAssetId,
    });

    if (audioPeakRequests.length === 0) {
      return;
    }

    let cancelled = false;
    const requestGeneration = projectReplacementGenerationRef.current;
    const peakReadController = typeof AbortController !== 'undefined' ? new AbortController() : undefined;

    void Promise.all(audioPeakRequests.map(async (request) => {
      const peaks = await readAudioPeaks(request.source, 64, {
        signal: peakReadController?.signal,
      }).catch(() => undefined);
      return peaks ? { assetId: request.assetId, peaks } : undefined;
    })).then((results) => {
      if (cancelled || projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      const nextEntries = results.filter((result): result is RuntimeAudioPeakEntry => Boolean(result));
      if (nextEntries.length === 0) {
        return;
      }

      setAudioPeaksByAssetId((current) => mergeRuntimeAudioPeakEntries(current, nextEntries));
    });

    return () => {
      cancelled = true;
      peakReadController?.abort();
    };
  }, [audioPeaksByAssetId, project.assets]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      dispatchEditorKeyboardShortcut(event, {
        fps: project.fps,
        duration: project.duration,
        rippleMode,
        editMode,
        activeMonitor,
        selectedCanUseProgramMonitorMotion,
        selectedCaptionCount: selectedCaptionIds.length,
        selectedClipCount: selectedClipIds.length,
        onOpenCommandPalette: openCommandPalette,
        onUndo: handleUndo,
        onRedo: handleRedo,
        onSaveProject: handleSaveProject,
        onSelectAllClips: handleSelectAllClips,
        onDuplicateSelectedClips: handleDuplicateSelectedClips,
        onGroupSelectedClips: handleGroupSelectedClips,
        onUngroupSelectedClips: handleUngroupSelectedClips,
        onCloseGapAtPlayhead: handleCloseGapAtPlayhead,
        onCloseAllGapsOnTrack: handleCloseAllGapsOnTrack,
        onArrangeSelectedClips: handleArrangeSelectedClips,
        onInsertGapAtPlayhead: handleInsertGapAtPlayhead,
        onSelectClipsRelativeToPlayhead: handleSelectClipsRelativeToPlayhead,
        onSelectMarkedRange: handleSelectMarkedRange,
        onSelectClipAtPlayhead: handleSelectClipAtPlayhead,
        onCopyClipAttributes: handleCopyClipAttributes,
        onCopySelected: handleCopySelected,
        onCutSelected: handleCutSelected,
        onPasteClipAttributes: handlePasteClipAttributes,
        onPasteClipboard: handlePasteClipboard,
        onPasteClipboardAtIn: handlePasteClipboardAtIn,
        onBuildExport: handleBuildExport,
        onQueueRenderProject: handleQueueRenderProject,
        onEscape: handleEscape,
        onToggleProgramPlayback: toggleProgramPlayback,
        onToggleSourcePlayback: toggleSourcePlayback,
        onShuttlePlayback: handleShuttlePlayback,
        onToggleLoopPlayback: handleToggleLoopPlayback,
        onSplit: handleSplit,
        onTrimToPlayhead: (edge) => handleTrimToPlayhead(edge, timelinePlayheadEditTargetClip, true),
        onCopyMarkedRange: handleCopyMarkedRange,
        onSplitActiveCaption: handleSplitActiveCaption,
        onDeleteSelectedCaptions: handleDeleteSelectedCaptions,
        onDeleteSelected: (ripple) => handleDeleteSelected(ripple, timelinePlayheadEditTargetClip),
        onSetTimelinePlayhead: setTimelinePlayhead,
        onGoToSourceBoundary: handleGoToSourceBoundary,
        onProgramMotionNudge: handleProgramMotionNudge,
        onSlideSelected: handleSlideSelected,
        onMoveSelected: handleMoveSelected,
        onNudgePlayhead: handleNudgePlayhead,
        onNudgeSourcePlayhead: handleNudgeSourcePlayhead,
        onJumpAdjacentEdit: handleJumpAdjacentEdit,
        onToggleRippleMode: () => setRippleMode((current) => !current),
        onToggleSnapEnabled: () => setSnapEnabled((current) => !current),
        onFitTimelineZoom: handleFitTimelineZoom,
        onJumpAdjacentMarker: handleJumpAdjacentMarker,
        onMoveSelectionToPlayhead: handleMoveSelectionToPlayhead,
        onMergeSelectedCaptions: handleMergeSelectedCaptions,
        onAddMarkerAtPlayhead: handleAddMarkerAtPlayhead,
        onThreePointAssetEdit: handleThreePointAssetEdit,
        onSetEditMode: handleEditModeChange,
        onGoToMark: handleGoToMark,
        onSetMark: handleSetMark,
        onGoToSourceMark: handleGoToSourceMark,
        onSetSourceMark: handleSetSourceMark,
        onClearSourceMarks: handleClearSourceMarks,
        customShortcuts: editorSettings.customShortcuts,
        onRunCommand: (commandId) => handleRunPaletteCommand(commandId),
        onCutMarkedRange: handleCutMarkedRange,
        onDeleteMarkedRange: handleDeleteMarkedRange,
        onClearMarks: handleClearMarks,
        onMarkSelectedClips: handleMarkSelectedClips,
      });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const refreshRenderJobs = async () => {
      try {
        const jobs = await fetchRenderJobs({ signal: controller.signal });
        if (!cancelled) {
          setRenderJobs((current) => mergeRenderJobHistory(current, jobs));
        }
      } catch {
        // Keep local render history while the queue list recovers.
      }
    };

    void refreshRenderJobs();
    const interval = window.setInterval(refreshRenderJobs, 5000);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!shouldPollRenderJob(renderJob)) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const interval = window.setInterval(async () => {
      try {
        const nextJob = await fetchRenderJob(renderJob.id, { signal: controller.signal });
        if (cancelled || !nextJob) {
          return;
        }

        const renderState = resolveRenderJobPollingWorkflowState(nextJob);
        setRenderJob(renderState.renderJob);
        setRenderJobs((current) => mergeRenderJobHistory(current, nextJob));
        setIsRendering(renderState.isRendering);
        if (renderState.renderOutputPath !== undefined) {
          setRenderOutputPath(renderState.renderOutputPath);
        }
        if (renderState.status) {
          setStatus(renderState.status);
        }
      } catch {
        // Keep the existing status while polling recovers.
      }
    }, 1000);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [renderJob]);

  const activeRenderWorkerRunId = shouldPollRenderWorkerRun(renderWorkerRun) ? renderWorkerRun.id : '';
  const renderWorkerFleetUrlSignature = useMemo(() => (
    renderWorkerFleet
      .map((worker) => normalizeRenderWorkerDaemonUrl(worker.url))
      .sort()
      .join('|')
  ), [renderWorkerFleet]);

  useEffect(() => {
    if (!renderWorkerFleetUrlSignature) {
      return;
    }

    let disposed = false;
    const selectedDaemonUrl = normalizeRenderWorkerDaemonUrl(renderWorkerSettings.daemonUrl);
    const closeStreams = renderWorkerFleetUrlSignature
      .split('|')
      .filter(Boolean)
      .map((daemonUrl) => subscribeRenderWorkerDaemonFleetEvents(daemonUrl, {
        onEvent: (event) => {
          if (disposed) {
            return;
          }

          setRenderWorkerFleet((current) => upsertRenderWorkerFleetStatus(current, event.status));
          if (normalizeRenderWorkerDaemonUrl(event.status.url) === selectedDaemonUrl) {
            setRenderWorkerDaemonStatus(event.status);
            if (event.type !== 'snapshot') {
              setRenderWorkerStatus(`Render worker live: ${event.status.workerId} ${event.type}`);
            }
          }
        },
        onError: () => {
          if (!disposed) {
            setRenderWorkerStatus('Render worker fleet stream reconnecting; polling fallback active');
          }
        },
      }, {
        authToken: renderWorkerSettings.authToken,
        timeoutMs: RENDER_WORKER_STREAM_OPEN_TIMEOUT_MS,
      }))
      .filter((closeStream): closeStream is () => void => Boolean(closeStream));

    return () => {
      disposed = true;
      for (const closeStream of closeStreams) {
        closeStream();
      }
    };
  }, [renderWorkerFleetUrlSignature, renderWorkerSettings.authToken, renderWorkerSettings.daemonUrl]);

  useEffect(() => {
    if (!activeRenderWorkerRunId) {
      return;
    }

    let disposed = false;
    const controller = new AbortController();
    const runId = activeRenderWorkerRunId;
    const applyRunUpdate = (nextRun: RenderWorkerDaemonRunRecord) => {
      if (disposed) {
        return;
      }

      setRenderWorkerRun(nextRun);
      setRenderWorkerStatus(`Render worker ${nextRun.status}`);
      if (nextRun.status === 'completed' || nextRun.status === 'failed') {
        setStatus(`Render worker ${nextRun.status}: ${nextRun.id}`);
      }
    };
    const closeEventStream = subscribeRenderWorkerDaemonRunEvents(renderWorkerSettings.daemonUrl, runId, {
      onEvent: (event) => applyRunUpdate(event.run),
      onError: () => {
        if (!disposed) {
          setRenderWorkerStatus('Render worker event stream reconnecting; polling fallback active');
        }
      },
    }, {
      authToken: renderWorkerSettings.authToken,
      timeoutMs: RENDER_WORKER_STREAM_OPEN_TIMEOUT_MS,
      signal: controller.signal,
    });
    const interval = window.setInterval(async () => {
      try {
        const nextRun = await fetchRenderWorkerDaemonRun(renderWorkerSettings.daemonUrl, runId, {
          authToken: renderWorkerSettings.authToken,
          timeoutMs: RENDER_WORKER_REQUEST_TIMEOUT_MS,
          signal: controller.signal,
        });
        applyRunUpdate(nextRun);
      } catch {
        // Keep the existing worker status while polling recovers.
      }
    }, closeEventStream ? 5000 : 1500);

    return () => {
      disposed = true;
      controller.abort();
      closeEventStream?.();
      window.clearInterval(interval);
    };
  }, [activeRenderWorkerRunId, renderWorkerSettings.authToken, renderWorkerSettings.daemonUrl]);

  useEffect(() => {
    if (!shouldPollComfyUIJob(comfyUIJob)) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const interval = window.setInterval(async () => {
      try {
        const nextJob = await fetchComfyUIQueueJob(comfyUIJob.id, { signal: controller.signal });
        if (cancelled || !nextJob) {
          return;
        }

        const queueState = resolvePolledComfyUIJobState(nextJob);
        setComfyUIJob(queueState.job);
        setIsQueueingComfyUI(queueState.isQueueingComfyUI);
        if (queueState.status) {
          setStatus(queueState.status);
        }
      } catch {
        // Keep the existing status while polling recovers.
      }
    }, 1000);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [comfyUIJob]);

  useEffect(() => {
    if (!shouldPollSttJob(sttJob)) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const interval = window.setInterval(async () => {
      try {
        const nextJob = await fetchSttJob(sttJob.id, { signal: controller.signal });
        if (cancelled || !nextJob) {
          return;
        }

        const queueState = resolvePolledSttJobState(nextJob);
        setSttJob(queueState.job);
        setIsRunningStt(queueState.isRunningStt);
        if (queueState.status) {
          setStatus(queueState.status);
        }
      } catch {
        // Keep current status while polling recovers.
      }
    }, 1000);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [sttJob]);

  useEffect(() => {
    const pollingState = resolveMediaCachePollingState(cacheJobsByAssetId);
    const { activeEntries } = pollingState;

    if (!pollingState.shouldPoll) {
      return;
    }

    let cancelled = false;
    const requestGeneration = projectReplacementGenerationRef.current;
    const controller = new AbortController();
    const pollJobs = async () => {
      try {
        const results = await Promise.all(activeEntries.map(async ({ assetId, job }) => {
          const nextJob = await fetchMediaCacheJob(job.id, { signal: controller.signal });
          return nextJob ? { assetId, job: nextJob } : undefined;
        }));
        if (cancelled || projectReplacementGenerationRef.current !== requestGeneration) {
          return;
        }

        const completedEntries = results.filter((result): result is MediaCacheJobEntry => Boolean(result));
        if (completedEntries.length === 0) {
          return;
        }

        setCacheJobsByAssetId((current) => mergeMediaCacheJobsByAssetId(current, completedEntries));
        setProject((current) => applyCompletedMediaCacheJobsToProject({
          project: current,
          entries: completedEntries,
          updatedAt: new Date().toISOString(),
        }));

        const status = resolveCompletedMediaCacheStatus(completedEntries, assetById);
        if (status) {
          setStatus(status);
        }
      } catch {
        // Keep current cache state while polling recovers.
      }
    };

    void pollJobs();
    const interval = window.setInterval(() => {
      void pollJobs();
    }, pollingState.intervalMs);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [assetById, cacheJobsByAssetId]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const closeMenu = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };

    window.addEventListener('click', closeMenu);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenu]);

  const applyProjectPersistenceSession = (session: ProjectPersistenceSessionState) => {
    const nextSelectedTrackId = session.project.tracks[0]?.id ?? '';
    const nextSourcePrimaryPatchTrackId = session.project.tracks.find((track) => track.kind === 'video')?.id ?? '';
    const nextSourceAudioPatchTrackId = session.project.tracks.find((track) => track.kind === 'audio')?.id ?? '';
    const nextSelectedSourceAssetId = session.project.assets[0]?.id ?? '';
    const nextExportPlanState = resolveExportPlanSyncState({
      project: session.project,
      selectedExportProfileId: session.selectedExportProfileId,
      exportRange: undefined,
    });

    projectReplacementGenerationRef.current += 1;
    setHistory(session.history);
    setFuture(session.future);
    setProject(session.project);
    setPrimarySelection(session.selectedClipId);
    setSelectedTrackId(nextSelectedTrackId);
    setSourcePrimaryPatchTrackId(nextSourcePrimaryPatchTrackId);
    setSourceAudioPatchTrackId(nextSourceAudioPatchTrackId);
    setSelectedSourceAssetId(nextSelectedSourceAssetId);
    setPlayhead(session.playhead);
    setTimelineViewport((current) => ({ ...current, scrollLeft: 0 }));
    if (timelineScrollRef.current) {
      timelineScrollRef.current.scrollLeft = 0;
    }
    setSourcePlayhead(0);
    setClipboardClips([]);
    setAttributeClipboard(null);
    relinkAssetIdRef.current = null;
    if (relinkFileInputRef.current) {
      relinkFileInputRef.current.value = '';
    }
    if (bulkRelinkFileInputRef.current) {
      bulkRelinkFileInputRef.current.value = '';
    }
    setCacheJobsByAssetId({});
    setSourceRangesByAssetId({});
    setAudioPeaksByAssetId({});
    setMediaSearchQuery('');
    setMediaKindFilter('all');
    setMediaBinFilter('all');
    setMediaSmartFilter('all');
    cancelActiveVoiceoverSession();
    setVoiceoverState('idle');
    setVoiceoverTake(1);
    setRenderJob(null);
    setRenderWorkerRun(null);
    setIsSubmittingRenderWorker(false);
    setComfyUIJob(null);
    setIsQueueingComfyUI(false);
    setSelectedComfyUIReviewId(null);
    setSttJob(null);
    setIsRunningStt(false);
    setLastHookPlan(null);
    setSilencePlan(null);
    setBeatPlan(null);
    setLastAudioSyncPlan(null);
    setProgramAudioFftSample(null);
    setProgramVideoScopeReadout(null);
    setKeyframeDraft(DEFAULT_KEYFRAME_DRAFT);
    setCommandPaletteOpen(false);
    setCommandPaletteQuery('');
    setCommandPaletteActiveIndex(0);
    setSelectedCaptionIds([]);
    setExportManifest(nextExportPlanState.manifest);
    setRenderPlan(nextExportPlanState.plan);
    setRenderOutputPath(null);
    setMarkIn(null);
    setMarkOut(null);
    setExportRangeMode('timeline');
    setIsPlaying(false);
    setTimelinePlaybackRate(0);
    setSourcePlaybackRate(0);
    setLoopPlaybackEnabled(false);
    setSourceLoopPlaybackEnabled(false);
    setSourcePrimaryPatchEnabled(true);
    setSourceAudioPatchEnabled(true);
    setClipDragTargetTrackId(null);
    setClipDragPreview(null);
    setAssetDropPreview(null);
    setTimelineEditGuide(null);
    setMarkerTimePreview(null);
    setMediaFileDropActive(false);
    markerDragRef.current = null;
    setBoxSelection(null);
    setContextMenu(null);
    setPendingCloudSyncConflict(null);
    setLastSavedProjectText(session.saveMarkers.lastSavedProjectText);
    setLastAutosavedProjectText(session.saveMarkers.lastAutosavedProjectText);
    setSelectedExportProfileId(nextExportPlanState.selectedExportProfileId);
    setBatchExportProfileIds([nextExportPlanState.activeExportProfileId]);
    setStatus(session.status);
  };

  const commitProjectResult = (label: string, update: (current: EditorProject) => EditorProject): ProjectCommitResult => {
    const result = resolveProjectUpdateCommit({ project, history, future, label, update });
    if (result.committed) {
      setHistory(result.history);
      setFuture(result.future);
      setProject(result.project);
    }

    setStatus(result.status);
    return result;
  };

  const commitProject = (label: string, update: (current: EditorProject) => EditorProject) => {
    return commitProjectResult(label, update).committed;
  };

  const commitResolvedProject = (label: string, nextProject: EditorProject) => {
    const result = resolveProjectReplacementCommit({ project, history, future, label, nextProject });
    if (result.committed) {
      setHistory(result.history);
      setFuture(result.future);
      setProject(result.project);
    }

    setStatus(result.status);
    return result.committed;
  };

  const commitProjectSettingsMutationPlan = (plan: ProjectSettingsMutationPlan) => {
    if (!plan.canCommit || !plan.apply || !plan.commitLabel) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return false;
    }

    let nextSelectedExportProfileId: string | undefined;
    const committed = commitProject(plan.commitLabel, (current) => {
      const result = plan.apply!(current);
      nextSelectedExportProfileId = result.nextSelectedExportProfileId;
      return result.project;
    });

    if (committed && nextSelectedExportProfileId) {
      setSelectedExportProfileId(nextSelectedExportProfileId);
    }

    return committed;
  };

  const handleProjectSettingsChange = (patch: ProjectSettingsPatch) => {
    commitProjectSettingsMutationPlan(resolveProjectSettingsChangePlan(patch));
  };

  const handleApplyCreatorTemplate = (templateId: CreatorTemplatePresetId) => {
    let templateResult: CreatorTemplateApplyResult | undefined;
    const committed = commitProject(`Template applied: ${templateId}`, (current) => {
      templateResult = applyCreatorTemplatePreset(current, templateId, { start: playhead });
      return templateResult.project;
    });

    if (!committed || !templateResult) {
      return;
    }

    const primaryClipId = templateResult.createdClipIds[0];
    if (primaryClipId) {
      setSelectedClipId(primaryClipId);
      setSelectedClipIds(templateResult.createdClipIds);
    }
    setSelectedCaptionIds(templateResult.createdCaptionIds);
    setPlayhead(templateResult.appliedRange.start);
    setStatus(templateResult.status);
  };

  const handleExportProfilePatch = (patch: ExportProfilePatch) => {
    commitProjectSettingsMutationPlan(resolveExportProfilePatchPlan({
      selectedExportProfile,
      patch,
    }));
  };

  const handleDuplicateExportProfile = () => {
    commitProjectSettingsMutationPlan(resolveDuplicateExportProfilePlan(selectedExportProfile));
  };

  const handleRemoveExportProfile = () => {
    commitProjectSettingsMutationPlan(resolveRemoveExportProfilePlan({
      project,
      selectedExportProfile,
    }));
  };

  const handleMasterAudioSettingsChange = (patch: MasterAudioSettings) => {
    commitProjectSettingsMutationPlan(resolveMasterAudioSettingsChangePlan(patch));
  };

  const handleUndo = () => {
    const result = resolveProjectUndo({ project, history, future, selectedClipId });
    if (!result.changed) {
      setStatus(result.status);
      return;
    }

    setHistory(result.history);
    setFuture(result.future);
    setProject(result.project);
    setPrimarySelection(result.selectedClipId);
    setStatus(result.status);
  };

  const handleRedo = () => {
    const result = resolveProjectRedo({ project, history, future, selectedClipId });
    if (!result.changed) {
      setStatus(result.status);
      return;
    }

    setFuture(result.future);
    setHistory(result.history);
    setProject(result.project);
    setPrimarySelection(result.selectedClipId);
    setStatus(result.status);
  };

  const refreshProjects = async (signal?: AbortSignal) => {
    try {
      const projects = await fetchSavedProjectSummaries({ signal });
      if (!signal?.aborted) {
        setSavedProjects(projects);
      }
    } catch {
      // Project listing is optional while the local DB is being initialized.
    }
  };

  const refreshAutosaves = async (signal?: AbortSignal) => {
    try {
      const summaries = await fetchAutosaveSummaries({ signal });
      if (!signal?.aborted) {
        setAutosaves(summaries);
      }
    } catch {
      // Autosave recovery is optional while the local filesystem is unavailable.
    }
  };

  const saveAutosaveSnapshot = async (reason = 'autosave') => {
    const requestGeneration = projectReplacementGenerationRef.current;
    try {
      const summary = await saveRemoteAutosaveSnapshot(project, reason);
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      const success = resolveAutosaveSaveSuccessState({
        currentAutosaves: [],
        summary,
        project,
      });
      setAutosaves((current) => resolveAutosaveSaveSuccessState({
        currentAutosaves: current,
        summary,
        project,
      }).autosaves);
      setLastAutosavedProjectText(success.autosavedProjectText);
      setAutosaveStatus(success.autosaveStatus);
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      try {
        const savedAt = writeLocalAutosaveSnapshot(project);
        if (projectReplacementGenerationRef.current !== requestGeneration) {
          return;
        }

        const fallback = resolveLocalAutosaveFallbackState({ project, savedAt });
        setLocalProjectFallback(readLocalProjectFallbackSnapshot());
        setLastAutosavedProjectText(fallback.autosavedProjectText);
        setAutosaveStatus(fallback.autosaveStatus);
      } catch (fallbackError) {
        if (projectReplacementGenerationRef.current !== requestGeneration) {
          return;
        }

        setAutosaveStatus(resolveProjectPersistenceFallbackFailureStatus({
          kind: 'autosave',
          primaryError: error,
          fallbackLabel: 'local autosave fallback',
          fallbackError,
        }));
      }
    }
  };

  const preserveCurrentProjectBeforeReplacement = (actionLabel: string): 'blocked' | 'preserved' | 'skipped' => {
    if (!shouldWriteProjectReplacementFallback(projectSaveState)) {
      return 'skipped';
    }

    try {
      writeLocalProjectFallback(project);
      setLocalProjectFallback(readLocalProjectFallbackSnapshot());
      return 'preserved';
    } catch (error) {
      setStatus(`${actionLabel} blocked: could not preserve unsaved current project: ${resolveProjectPersistenceErrorMessage(error)}`);
      return 'blocked';
    }
  };

  useEffect(() => {
    if (!projectAutosaveEffects.shouldScheduleAutosave) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void saveAutosaveSnapshot('autosave');
    }, projectAutosaveEffects.autosaveDelayMs);

    return () => window.clearTimeout(timeout);
  });

  const handleRestoreAutosave = async (projectId: string) => {
    const preservationState = preserveCurrentProjectBeforeReplacement('Autosave restore');
    if (preservationState === 'blocked') {
      return;
    }

    const requestGeneration = beginProjectReplacementRequest();
    try {
      const restored = await restoreAutosaveProject(projectId);
      if (!isProjectReplacementRequestCurrent(requestGeneration)) {
        return;
      }

      applyProjectPersistenceSession(resolveProjectPersistenceSession({
        currentProject: project,
        history,
        nextProject: restored,
        kind: 'autosave-restore',
      }));
    } catch (error) {
      if (!isProjectReplacementRequestCurrent(requestGeneration)) {
        return;
      }

      setStatus(resolveProjectPersistenceFailureStatus('autosave-restore', error));
    }
  };

  const handleDeleteAutosave = async (projectId: string) => {
    const requestGeneration = projectReplacementGenerationRef.current;
    try {
      await deleteAutosaveSnapshot(projectId);
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      const deleteState = resolveAutosaveDeleteState({
        autosaves,
        deletedProjectId: projectId,
        currentProjectId: project.id,
      });
      setAutosaves((current) => resolveAutosaveDeleteState({
        autosaves: current,
        deletedProjectId: projectId,
        currentProjectId: project.id,
      }).autosaves);
      if (deleteState.clearLastAutosavedProjectText) {
        setLastAutosavedProjectText('');
      }
      setStatus(deleteState.status);
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setStatus(resolveProjectPersistenceFailureStatus('autosave-delete', error));
    }
  };

  const refreshQueueSettings = async (signal?: AbortSignal) => {
    try {
      const settings = await fetchQueueSettings({ signal });
      if (settings && !signal?.aborted) {
        setQueueSettings(settings);
      }
    } catch {
      // Queue settings fall back to local defaults when the API is unavailable.
    }
  };

  const refreshFfmpegCapabilities = async (signal?: AbortSignal) => {
    try {
      const capabilities = await fetchFfmpegCapabilities({ signal });
      if (capabilities && !signal?.aborted) {
        setFfmpegCapabilities(capabilities);
      }
    } catch {
      // Encoder detection is optional; render planning falls back to software encoding.
    }
  };

  const refreshRuntimeDiagnostics = async (signal?: AbortSignal) => {
    try {
      const diagnostics = await readElectronRuntimeDiagnostics();
      if (signal?.aborted) {
        return;
      }
      const sampleDirectory = diagnostics?.samples.available
        ? diagnostics.samples.gettingStartedPackagePath ?? null
        : null;
      setSampleProjectPackageDirectory(sampleDirectory);
      if (sampleDirectory) {
        setSampleProjectAvailable(true);
        return;
      }
    } catch {
      if (signal?.aborted) {
        return;
      }
      setSampleProjectPackageDirectory(null);
    }

    try {
      const sample = await fetchSampleProjectPackageMetadata({ signal });
      if (!signal?.aborted) {
        setSampleProjectAvailable(sample.available);
      }
    } catch {
      if (!signal?.aborted) {
        setSampleProjectAvailable(false);
      }
    }
  };

  const handleApplyQueueSettings = async () => {
    try {
      const applyState = resolveQueueSettingsApplySuccessState(await applyQueueSettings(queueSettings));
      setQueueSettings(applyState.queueSettings);
      setStatus(applyState.status);
    } catch (error) {
      setStatus(resolveQueueSettingsApplyFailureStatus(error));
    }
  };

  const handleSaveProject = async () => {
    const requestGeneration = projectReplacementGenerationRef.current;
    try {
      const saveState = resolveProjectSaveSuccessState(await saveProjectToDatabase(project));
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setProject(saveState.project);
      setLastSavedProjectText(saveState.saveMarkers.lastSavedProjectText);
      setLastAutosavedProjectText(saveState.saveMarkers.lastAutosavedProjectText);
      setStatus(saveState.status);
      await refreshProjects();
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      try {
        writeLocalProjectFallback(project);
        setLocalProjectFallback(readLocalProjectFallbackSnapshot());
        const fallback = resolveLocalProjectSaveFallbackState({
          project,
          errorMessage: resolveProjectPersistenceErrorMessage(error),
        });
        setLastAutosavedProjectText(fallback.autosavedProjectText);
        setStatus(fallback.status);
      } catch (fallbackError) {
        if (projectReplacementGenerationRef.current !== requestGeneration) {
          return;
        }

        setStatus(resolveProjectPersistenceFallbackFailureStatus({
          kind: 'project-save',
          primaryError: error,
          fallbackLabel: 'local project fallback',
          fallbackError,
        }));
      }
    }
  };

  const handleCreateNewProject = () => {
    const preservationState = preserveCurrentProjectBeforeReplacement('New project');
    if (preservationState === 'blocked') {
      return;
    }

    const nextProject = createBlankEditorProject();
    applyProjectPersistenceSession(resolveProjectPersistenceSession({
      currentProject: project,
      history,
      nextProject,
      kind: 'new-project',
    }));
    if (preservationState === 'preserved') {
      setStatus('New project created; previous unsaved project saved to local fallback');
    }
  };

  const handleSaveProjectCopy = async () => {
    const requestGeneration = projectReplacementGenerationRef.current;
    const projectCopy = buildProjectSaveCopy(project);
    try {
      const saveState = resolveProjectSaveCopySuccessState(await saveProjectToDatabase(projectCopy));
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setProject(saveState.project);
      setHistory([]);
      setFuture([]);
      setLastSavedProjectText(saveState.saveMarkers.lastSavedProjectText);
      setLastAutosavedProjectText(saveState.saveMarkers.lastAutosavedProjectText);
      setStatus(saveState.status);
      await refreshProjects();
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      try {
        writeLocalProjectFallback(projectCopy);
        if (projectReplacementGenerationRef.current !== requestGeneration) {
          return;
        }

        setProject(projectCopy);
        setHistory([]);
        setFuture([]);
        setLocalProjectFallback(readLocalProjectFallbackSnapshot());
        const fallback = resolveLocalProjectSaveFallbackState({
          project: projectCopy,
          errorMessage: resolveProjectPersistenceErrorMessage(error),
        });
        setLastAutosavedProjectText(fallback.autosavedProjectText);
        setStatus(fallback.status);
      } catch (fallbackError) {
        if (projectReplacementGenerationRef.current !== requestGeneration) {
          return;
        }

        setStatus(resolveProjectPersistenceFallbackFailureStatus({
          kind: 'project-save',
          primaryError: error,
          fallbackLabel: 'local project fallback',
          fallbackError,
        }));
      }
    }
  };

  const handleDeleteSavedProject = async (projectId: string) => {
    const requestGeneration = projectReplacementGenerationRef.current;
    try {
      const deleted = await deleteProjectFromDatabase(projectId);
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      const deleteState = resolveProjectDeleteState({
        projects: savedProjects,
        deletedProjectId: deleted.id,
        currentProjectId: project.id,
      });
      setSavedProjects(deleteState.projects);
      if (deleteState.saveMarkers) {
        setLastSavedProjectText(deleteState.saveMarkers.lastSavedProjectText);
        setLastAutosavedProjectText(deleteState.saveMarkers.lastAutosavedProjectText);
      }
      setStatus(deleteState.status);
      await refreshProjects();
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setStatus(resolveProjectPersistenceFailureStatus('project-delete', error));
    }
  };

  const handleLoadProject = async (projectId?: string) => {
    const id = resolveProjectLoadTargetId({
      requestedProjectId: projectId,
      savedProjects,
      currentProjectId: project.id,
    });
    const preservationState = preserveCurrentProjectBeforeReplacement('Project load');
    if (preservationState === 'blocked') {
      return;
    }

    const requestGeneration = beginProjectReplacementRequest();
    try {
      const loadedProject = await loadProjectFromDatabase(id);
      if (!isProjectReplacementRequestCurrent(requestGeneration)) {
        return;
      }

      applyProjectPersistenceSession(resolveProjectPersistenceSession({
        currentProject: project,
        history,
        nextProject: loadedProject,
        kind: 'database-load',
      }));
      if (preservationState === 'preserved') {
        setStatus('Project loaded from database; previous unsaved project saved to local fallback');
      }
    } catch (error) {
      if (!isProjectReplacementRequestCurrent(requestGeneration)) {
        return;
      }

      let restoredPackage: ProjectPackageImport | null = null;
      try {
        restoredPackage = readBestLocalProjectFallback();
        setLocalProjectFallback(restoredPackage);
      } catch (fallbackError) {
        setLocalProjectFallback(null);
        setStatus(resolveProjectPersistenceErrorMessage(fallbackError));
        return;
      }

      if (!restoredPackage) {
        setStatus(resolveProjectPersistenceErrorMessage(error));
        return;
      }

      if (!isProjectReplacementRequestCurrent(requestGeneration)) {
        return;
      }

      applyProjectPersistenceSession(resolveLocalFallbackProjectLoadSession({
        currentProject: project,
        history,
        restoredPackage,
      }));
    }
  };

  const handleRestoreLocalProjectFallback = () => {
    try {
      const restoredPackage = readBestLocalProjectFallback();
      setLocalProjectFallback(restoredPackage);

      if (!restoredPackage) {
        setStatus('No local project fallback is available');
        return;
      }
      const preservationState = preserveCurrentProjectBeforeReplacement('Local fallback restore');
      if (preservationState === 'blocked') {
        return;
      }

      applyProjectPersistenceSession(resolveLocalFallbackProjectLoadSession({
        currentProject: project,
        history,
        restoredPackage,
      }));
    } catch (error) {
      setLocalProjectFallback(null);
      setStatus(resolveProjectPersistenceErrorMessage(error));
    }
  };

  const handleRestoreImportedProjectPackage = () => {
    if (!lastImportedProjectPackage) {
      setStatus('No imported project package is available');
      return;
    }
    const preservationState = preserveCurrentProjectBeforeReplacement('Imported package restore');
    if (preservationState === 'blocked') {
      return;
    }

    applyProjectPersistenceSession(resolveProjectPackageImportSession({
      currentProject: project,
      history,
      importedPackage: lastImportedProjectPackage,
    }));
  };

  const handleDownloadProjectPackage = async () => {
    const requestGeneration = projectReplacementGenerationRef.current;
    try {
      const plan = resolveProjectPackageExportPlan(project);
      const directorySelection = await selectProjectPackageDirectory({
        mode: 'export',
        defaultPath: plan.packageDirectory,
      });
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      if (directorySelection.available && directorySelection.canceled) {
        setStatus('Project package export canceled');
        return;
      }

      const result = await exportProjectPackageBestAvailable(project, {
        ...plan,
        packageDirectory: directorySelection.directory ?? plan.packageDirectory,
      });
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setStatus(result.status);
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setStatus(resolveProjectPersistenceFailureStatus('project-package-export', error));
    }
  };

  const handleImportProjectPackage = async () => {
    const preservationState = preserveCurrentProjectBeforeReplacement('Project package import');
    if (preservationState === 'blocked') {
      return;
    }

    const requestGeneration = beginProjectReplacementRequest();
    const plan = resolveProjectPackageExportPlan(project);
    const directorySelection = await selectProjectPackageDirectory({
      mode: 'import',
      defaultPath: plan.packageDirectory,
    });
    if (!isProjectReplacementRequestCurrent(requestGeneration)) {
      return;
    }

    if (directorySelection.available && directorySelection.canceled) {
      setStatus('Project package import canceled');
      return;
    }

    const packageDirectory = directorySelection.directory;

    if (packageDirectory) {
      try {
        const importedPackage = await readElectronProjectPackageFolder(packageDirectory);
        if (!isProjectReplacementRequestCurrent(requestGeneration)) {
          return;
        }

        if (importedPackage) {
          setLastImportedProjectPackage(importedPackage);
          applyProjectPersistenceSession(resolveProjectPackageImportSession({
            currentProject: project,
            history,
            importedPackage,
          }));
          if (preservationState === 'preserved') {
            setStatus('Project package imported; previous unsaved project saved to local fallback');
          }
          return;
        }
      } catch (error) {
        if (!isProjectReplacementRequestCurrent(requestGeneration)) {
          return;
        }

        setStatus(resolveProjectPersistenceFailureStatus('project-package-import', error));
        return;
      }
    }

    projectPackageFileInputRef.current?.click();
  };

  const handleSyncProjectCloudFolder = async (force = false) => {
    const requestGeneration = projectReplacementGenerationRef.current;
    try {
      let syncDirectory: string | undefined;

      if (force) {
        if (projectCloudSyncForcePlan.status === 'blocked') {
          if (projectCloudSyncForcePlan.clearConflict) {
            setPendingCloudSyncConflict(null);
          }
          setStatus(projectCloudSyncForcePlan.message);
          return;
        }

        syncDirectory = projectCloudSyncForcePlan.directory;
      } else {
        const directorySelection = await selectProjectPackageDirectory({
          mode: 'cloud-sync',
          defaultPath: '.danbi/cloud-sync',
        });
        if (projectReplacementGenerationRef.current !== requestGeneration) {
          return;
        }

        if (!directorySelection.available) {
          setStatus('Cloud sync requires the Electron desktop runtime.');
          return;
        }

        if (directorySelection.canceled || !directorySelection.directory) {
          setStatus('Cloud sync canceled');
          return;
        }

        syncDirectory = directorySelection.directory;
        setPendingCloudSyncConflict(null);
      }

      const result = await syncProjectToCloudFolderBestAvailable(project, syncDirectory, { force });
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      if (result.response?.status === 'conflict') {
        setPendingCloudSyncConflict(buildProjectCloudSyncConflictState({
          directory: syncDirectory,
          project,
          ...(result.response.previousProjectUpdatedAt ? { previousProjectUpdatedAt: result.response.previousProjectUpdatedAt } : {}),
        }));
      } else {
        setPendingCloudSyncConflict(null);
      }
      setStatus(result.status);
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setStatus(`Cloud sync failed: ${(error as Error).message}`);
    }
  };

  const handleImportCloudSyncProject = async () => {
    let requestGeneration = projectReplacementGenerationRef.current;
    try {
      if (projectCloudSyncForcePlan.status === 'blocked') {
        if (projectCloudSyncForcePlan.clearConflict) {
          setPendingCloudSyncConflict(null);
        }
        setStatus(projectCloudSyncForcePlan.message);
        return;
      }

      const preservationState = preserveCurrentProjectBeforeReplacement('Cloud sync import');
      if (preservationState === 'blocked') {
        return;
      }

      requestGeneration = beginProjectReplacementRequest();
      const importedPackage = await readCloudSyncProjectBestAvailable(projectCloudSyncForcePlan.directory, project.id);
      if (!isProjectReplacementRequestCurrent(requestGeneration)) {
        return;
      }

      if (!importedPackage) {
        setStatus('Cloud sync import requires the Electron desktop runtime.');
        return;
      }

      setLastImportedProjectPackage(importedPackage);
      applyProjectPersistenceSession(resolveProjectPackageImportSession({
        currentProject: project,
        history,
        importedPackage,
      }));
      setPendingCloudSyncConflict(null);
      setStatus(preservationState === 'preserved'
        ? 'Cloud sync project imported; previous unsaved project saved to local fallback'
        : `Cloud sync project imported from ${importedPackage.projectSyncDirectory}`);
    } catch (error) {
      if (!isProjectReplacementRequestCurrent(requestGeneration)) {
        return;
      }

      setStatus(`Cloud sync import failed: ${(error as Error).message}`);
    }
  };

  const handleOpenSampleProject = async () => {
    if (!sampleProjectAvailable) {
      setStatus('Sample project package is not available in this runtime');
      return;
    }
    const preservationState = preserveCurrentProjectBeforeReplacement('Sample project open');
    if (preservationState === 'blocked') {
      return;
    }

    const requestGeneration = beginProjectReplacementRequest();
    try {
      const importedPackage = await readSampleProjectPackageBestAvailable(sampleProjectPackageDirectory ?? undefined);
      if (!isProjectReplacementRequestCurrent(requestGeneration)) {
        return;
      }

      if (!importedPackage) {
        setStatus('Sample project package is not available in this runtime');
        return;
      }

      setLastImportedProjectPackage(importedPackage);
      applyProjectPersistenceSession(resolveProjectPackageImportSession({
        currentProject: project,
        history,
        importedPackage,
      }));
      if (preservationState === 'preserved') {
        setStatus('Sample project opened; previous unsaved project saved to local fallback');
      }
    } catch (error) {
      if (!isProjectReplacementRequestCurrent(requestGeneration)) {
        return;
      }

      setStatus(resolveProjectPersistenceFailureStatus('project-package-import', error));
    }
  };

  const handleProjectPackageFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) {
      return;
    }
    const preservationState = preserveCurrentProjectBeforeReplacement('Project package import');
    if (preservationState === 'blocked') {
      return;
    }

    const requestGeneration = beginProjectReplacementRequest();
    try {
      const importedPackage = await readProjectPackageFile(file);
      if (!isProjectReplacementRequestCurrent(requestGeneration)) {
        return;
      }

      setLastImportedProjectPackage(importedPackage);
      applyProjectPersistenceSession(resolveProjectPackageImportSession({
        currentProject: project,
        history,
        importedPackage,
      }));
      if (preservationState === 'preserved') {
        setStatus('Project package imported; previous unsaved project saved to local fallback');
      }
    } catch (error) {
      if (!isProjectReplacementRequestCurrent(requestGeneration)) {
        return;
      }

      setStatus(resolveProjectPersistenceFailureStatus('project-package-import', error));
    }
  };

  const prepareImportedMediaInputs = async (files: File[]): Promise<PreparedImportedMedia[]> => {
    const uploadedFiles = await uploadMediaFiles(files).catch(() => []);

    return Promise.all(files.map(async (file, index) => {
      const objectUrl = URL.createObjectURL(file);
      const uploaded = uploadedFiles[index];
      let retainObjectUrl = false;

      try {
        const prepared = await prepareBrowserMediaRecord(file, objectUrl, uploaded);
        retainObjectUrl = prepared.retainObjectUrl;
        if (retainObjectUrl) {
          importedObjectUrlsRef.current.push(objectUrl);
        }
        return prepared.media;
      } finally {
        if (!retainObjectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      }
    }));
  };

  const readCaptionSidecarFiles = async (files: File[]): Promise<CaptionSidecarImportSource[]> => (
    Promise.all(files.map(async (file) => ({
      filename: file.name,
      mimeType: file.type,
      content: await file.text(),
    })))
  );

  const resolveCaptionSidecarImports = (
    baseProject: EditorProject,
    sidecars: CaptionSidecarImportSource[],
  ): CaptionSidecarImportResult => {
    let nextProject = baseProject;
    let importedSidecarCount = 0;
    let importedCaptionCount = 0;
    let selectedImportedCaptionIds: string[] = [];
    const statuses: string[] = [];

    for (const sidecar of sidecars) {
      try {
        const parsed = parseCaptionSidecar(sidecar.content, inferCaptionSidecarFormat(sidecar.filename, sidecar.mimeType));
        const plan = resolveCaptionSidecarImportPlan({ parsed, filename: sidecar.filename });

        if (!plan.canImport || !plan.captions) {
          statuses.push(plan.status);
          continue;
        }

        const mode = importedSidecarCount === 0 ? 'replace' : 'append';
        const previousCaptionIds = new Set(nextProject.captions.map((caption) => caption.id));
        nextProject = importCaptionSegments(nextProject, plan.captions, mode);
        const importedIds = mode === 'replace'
          ? nextProject.captions.map((caption) => caption.id)
          : nextProject.captions
            .filter((caption) => !previousCaptionIds.has(caption.id))
            .map((caption) => caption.id);

        importedSidecarCount += 1;
        importedCaptionCount += plan.captions.length;
        selectedImportedCaptionIds = importedIds.slice(0, 1);
        statuses.push(plan.status);
      } catch (error) {
        statuses.push(formatCaptionImportFailureStatus(error));
      }
    }

    return {
      nextProject,
      importedCaptionCount,
      selectedCaptionIds: selectedImportedCaptionIds,
      statuses,
    };
  };

  const commitImportedMediaAndCaptionSidecars = ({
    preparedMedia = [],
    mediaFileCount = preparedMedia.length,
    captionSidecars = [],
    unsupportedFileCount = 0,
    nativeWarnings = [],
  }: {
    preparedMedia?: PreparedImportedMedia[];
    mediaFileCount?: number;
    captionSidecars?: CaptionSidecarImportSource[];
    unsupportedFileCount?: number;
    nativeWarnings?: string[];
  }) => {
    let nextProject = project;
    const statusParts: string[] = [];
    const importedAssetIds: string[] = [];
    let cacheJobEntries: MediaCacheJobEntry[] = [];
    let selectedImportedCaptionIds: string[] = [];

    if (captionSidecars.length > 0) {
      const captionResult = resolveCaptionSidecarImports(nextProject, captionSidecars);
      nextProject = captionResult.nextProject;
      selectedImportedCaptionIds = captionResult.selectedCaptionIds;
      statusParts.push(...captionResult.statuses);
    }

    if (preparedMedia.length > 0) {
      const importResult = resolvePreparedMediaBinImportResult({
        project: nextProject,
        preparedMedia,
        fileCount: mediaFileCount,
      });

      nextProject = importResult.nextProject;
      importedAssetIds.push(...importResult.importedAssetIds);
      cacheJobEntries = importResult.cacheJobEntries;
      statusParts.push(importResult.status);
    }

    if (unsupportedFileCount > 0) {
      statusParts.push(`Skipped ${unsupportedFileCount} unsupported file${unsupportedFileCount === 1 ? '' : 's'}`);
    }

    statusParts.push(...nativeWarnings);

    if (nextProject === project) {
      setStatus(statusParts[0] ?? resolveUnsupportedMediaDropStatus());
      return null;
    }

    setHistory((current) => [...current.slice(-49), project]);
    setFuture([]);
    setProject(nextProject);
    if (selectedImportedCaptionIds.length > 0) {
      setSelectedCaptionIds(selectedImportedCaptionIds);
    }
    if (cacheJobEntries.length > 0) {
      setCacheJobsByAssetId((current) => mergeMediaCacheJobsByAssetId(current, cacheJobEntries));
    }
    if (importedAssetIds.length > 0) {
      revealImportedMediaAssets(importedAssetIds);
    }
    setStatus(statusParts.join(' / '));
    if (importedAssetIds.length > 0) {
      void runEditorHooks('on-import', nextProject, { assetIds: importedAssetIds });
    }
    return nextProject;
  };

  const importFilesToEditor = async (files: File[]) => {
    if (files.length === 0) {
      return null;
    }

    const requestGeneration = projectReplacementGenerationRef.current;
    const partitionedFiles = partitionImportFileReferences(files);
    const [preparedMedia, captionSidecars] = await Promise.all([
      partitionedFiles.mediaFiles.length > 0
        ? prepareImportedMediaInputs(partitionedFiles.mediaFiles)
        : Promise.resolve([]),
      readCaptionSidecarFiles(partitionedFiles.captionSidecarFiles),
    ]);
    if (projectReplacementGenerationRef.current !== requestGeneration) {
      setStatus('File import ignored because the project changed');
      return null;
    }

    return commitImportedMediaAndCaptionSidecars({
      preparedMedia,
      mediaFileCount: partitionedFiles.mediaFiles.length,
      captionSidecars,
      unsupportedFileCount: partitionedFiles.unsupportedFiles.length,
    });
  };

  const handleImportMediaRequest = async () => {
    const requestGeneration = projectReplacementGenerationRef.current;
    try {
      const nativeImport = await selectAndImportNativeMediaFiles();
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        setStatus('Media import ignored because the project changed');
        return;
      }

      if (nativeImport.available) {
        if (nativeImport.canceled) {
          setStatus('Media import canceled');
          return;
        }

        if (nativeImport.files.length === 0 && nativeImport.sidecars.length === 0) {
          setStatus(nativeImport.warnings[0] ?? 'No media or subtitle sidecar files were imported');
          return;
        }

        const preparedMedia = nativeImport.files.map((file) => prepareUploadedMediaRecord(file));
        const captionSidecars = nativeImport.sidecars.map((sidecar) => ({
          filename: sidecar.originalName,
          mimeType: sidecar.mimeType,
          content: sidecar.content,
        }));
        commitImportedMediaAndCaptionSidecars({
          preparedMedia,
          mediaFileCount: nativeImport.files.length,
          captionSidecars,
          nativeWarnings: nativeImport.warnings,
        });
        return;
      }
    } catch (error) {
      setStatus((error as Error).message);
      return;
    }

    fileInputRef.current?.click();
  };

  const handleAddSharedLibraryAsset = (itemId: SharedAssetLibraryItemId) => {
    let result: SharedAssetLibraryAddResult;
    try {
      result = addSharedAssetLibraryItemToProject(project, itemId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Shared library asset failed');
      return;
    }

    if (result.added) {
      commitResolvedProject(`Shared asset added: ${result.item.label}`, result.project);
    }

    setSelectedSourceAssetId(result.assetId);
    setMediaBinFilter(SHARED_ASSET_LIBRARY_BIN);
    setMediaKindFilter('text');
    setMediaSmartFilter('all');
    setMediaSearchQuery('');
    setStatus(result.status);
  };

  const handleImportFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    try {
      await importFilesToEditor(files);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      event.target.value = '';
    }
  };

  const handleStartVoiceoverRecording = async () => {
    if (voiceoverState !== 'idle') {
      return;
    }

    const support = resolveVoiceoverRecorderSupport(readVoiceoverRecorderEnvironment());
    if (!support.supported) {
      setStatus(`Voiceover unavailable: ${support.reason ?? 'Recorder is not available.'}`);
      return;
    }

    const requestId = voiceoverRequestIdRef.current + 1;
    voiceoverRequestIdRef.current = requestId;

    try {
      setVoiceoverState('requesting');
      setStatus('Opening microphone for voiceover');
      const session = await startVoiceoverRecording({ mimeType: support.mimeType });
      if (voiceoverRequestIdRef.current !== requestId) {
        cancelVoiceoverRecording(session);
        return;
      }

      voiceoverSessionRef.current = session;
      setVoiceoverState('recording');
      setStatus('Recording voiceover');
    } catch (error) {
      if (voiceoverRequestIdRef.current !== requestId) {
        return;
      }

      setVoiceoverState('idle');
      voiceoverSessionRef.current = null;
      setStatus(formatVoiceoverFailureStatus(error));
    }
  };

  const handleStopVoiceoverRecording = async () => {
    const session = voiceoverSessionRef.current;
    if (!session) {
      setVoiceoverState('idle');
      return;
    }

    const requestId = voiceoverRequestIdRef.current;
    voiceoverSessionRef.current = null;
    setVoiceoverState('processing');
    setStatus('Processing voiceover');

    try {
      const blob = await stopVoiceoverRecording(session);
      if (voiceoverRequestIdRef.current !== requestId) {
        return;
      }

      if (blob.size === 0) {
        throw new Error('No audio was captured.');
      }

      const take = voiceoverTake;
      const file = buildVoiceoverRecordedFile({
        blob,
        projectName: project.name,
        take,
        mimeType: session.mimeType,
      });
      const preparedMedia = markPreparedMediaAsVoiceover(await prepareImportedMediaInputs([file]), { take });
      if (voiceoverRequestIdRef.current !== requestId) {
        return;
      }

      const importResult = resolveVoiceoverTimelineImportResult({
        project,
        preparedMedia,
        playhead,
        audioTargetTrackId: activeSourceAudioPatchTrackId,
      });
      if (!importResult.canImport) {
        setStatus(importResult.status);
        return;
      }

      setVoiceoverTake((current) => current + 1);
      setHistory((current) => [...current.slice(-49), project]);
      setFuture([]);
      setProject(importResult.nextProject);
      setSelectedSourceAssetId(importResult.selectedSourceAssetId);
      if (importResult.selectedTrackId) {
        setSelectedTrackId(importResult.selectedTrackId);
      }
      if (importResult.selection.canSelect) {
        setSelectedClipId(importResult.selection.selectedClipId);
        setSelectedClipIds(importResult.selection.selectedClipIds);
        setPlayhead(importResult.selection.nextPlayhead);
      }
      if (importResult.cacheJobEntries.length > 0) {
        setCacheJobsByAssetId((current) => mergeMediaCacheJobsByAssetId(current, importResult.cacheJobEntries));
      }
      setStatus(importResult.status);
      void runEditorHooks('on-import', importResult.nextProject, { assetIds: importResult.importedAssetIds });
    } catch (error) {
      if (voiceoverRequestIdRef.current !== requestId) {
        return;
      }

      cancelVoiceoverRecording(session);
      setStatus(formatVoiceoverFailureStatus(error));
    } finally {
      if (voiceoverRequestIdRef.current === requestId) {
        setVoiceoverState('idle');
      }
    }
  };

  const applyRelinkUploadedMedia = (
    assetId: string,
    file: { name: string; type?: string; size: number },
    uploaded: Parameters<typeof resolveRelinkUploadedMediaPlan>[0]['uploaded'],
  ) => {
    const plan = resolveRelinkUploadedMediaPlan({
      assetId,
      file,
      uploaded,
    });
    if (!plan.canRelink || !plan.input) {
      setStatus(plan.status);
      return;
    }

    const committed = commitProject(plan.commitLabel ?? 'Asset relinked', (current) => relinkMediaAsset(current, assetId, plan.input!));
    if (!committed) {
      return;
    }
    setSelectedSourceAssetId(plan.selectedSourceAssetId ?? assetId);
    setSourceRangesByAssetId((current) => omitAssetScopedRecords(current, plan.assetIds));
    setCacheJobsByAssetId((current) => omitAssetScopedRecords(current, plan.assetIds));
    setAudioPeaksByAssetId((current) => omitAssetScopedRecords(current, plan.assetIds));

    if (plan.cacheJobEntry) {
      setCacheJobsByAssetId((current) => mergeMediaCacheJobsByAssetId(current, [plan.cacheJobEntry!]));
    }

    setStatus(plan.status);
  };

  const applyBulkRelinkUploadedMedia = (
    files: Array<{ name: string; type?: string; size: number }>,
    uploaded: Parameters<typeof resolveBulkRelinkUploadedMediaPlan>[0]['uploaded'],
  ) => {
    const plan = resolveBulkRelinkUploadedMediaPlan({
      assets: project.assets,
      files,
      uploaded,
    });
    if (!plan.canRelink) {
      setStatus(plan.status);
      return;
    }

    let relinkedAssets = project.assets;
    const committed = commitProject(plan.commitLabel ?? 'Media assets relinked', (current) => {
      const nextProject = plan.matches.reduce(
        (candidateProject, match) => relinkMediaAsset(candidateProject, match.assetId, match.input),
        current,
      );
      relinkedAssets = nextProject.assets;
      return nextProject;
    });

    if (!committed) {
      return;
    }

    if (plan.selectedSourceAssetId) {
      setSelectedSourceAssetId(plan.selectedSourceAssetId);
    }

    setSourceRangesByAssetId((current) => omitAssetScopedRecords(current, plan.assetIds));
    setCacheJobsByAssetId((current) => omitAssetScopedRecords(current, plan.assetIds));
    setAudioPeaksByAssetId((current) => omitAssetScopedRecords(current, plan.assetIds));

    if (plan.cacheJobEntries.length > 0) {
      setCacheJobsByAssetId((current) => mergeMediaCacheJobsByAssetId(current, plan.cacheJobEntries));
    }

    const completionViewState = resolveBulkRelinkCompletionViewState({
      nextAssets: relinkedAssets,
      plan,
      currentMediaSmartFilter: mediaSmartFilter,
    });
    setMediaSmartFilter(completionViewState.nextMediaSmartFilter);
    setStatus(completionViewState.status);
  };

  const handleRelinkAsset = async (assetId: string) => {
    const requestGeneration = projectReplacementGenerationRef.current;
    try {
      const nativeImport = await selectAndImportNativeMediaFiles({
        title: 'Relink media',
        buttonLabel: 'Relink media',
        allowMultiple: false,
      });
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        setStatus('Media relink ignored because the project changed');
        return;
      }

      if (nativeImport.available) {
        if (nativeImport.canceled) {
          setStatus('Media relink canceled');
          return;
        }

        const uploaded = nativeImport.files[0];
        if (!uploaded) {
          setStatus(nativeImport.warnings[0] ?? 'No media file was selected for relink');
          return;
        }

        applyRelinkUploadedMedia(assetId, {
          name: uploaded.originalName,
          type: uploaded.mimeType,
          size: uploaded.size ?? 0,
        }, uploaded);
        return;
      }
    } catch (error) {
      setStatus(resolveRelinkMediaFailureStatus(error));
      return;
    }

    relinkAssetIdRef.current = assetId;
    relinkFileInputRef.current?.click();
  };

  const handleBulkRelinkMissingMedia = async () => {
    if (bulkRelinkCandidateCount === 0) {
      setStatus('No missing media assets need relinking.');
      return;
    }

    const requestGeneration = projectReplacementGenerationRef.current;
    try {
      const nativeImport = await selectAndImportNativeMediaFiles({
        title: 'Relink missing media',
        buttonLabel: 'Relink missing',
        allowMultiple: true,
      });
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        setStatus('Bulk media relink ignored because the project changed');
        return;
      }

      if (nativeImport.available) {
        if (nativeImport.canceled) {
          setStatus('Bulk media relink canceled');
          return;
        }

        if (nativeImport.files.length === 0) {
          setStatus(nativeImport.warnings[0] ?? 'No media files were selected for relink');
          return;
        }

        applyBulkRelinkUploadedMedia(
          nativeImport.files.map((file) => ({
            name: file.originalName,
            type: file.mimeType,
            size: file.size ?? 0,
          })),
          nativeImport.files,
        );
        return;
      }
    } catch (error) {
      setStatus(resolveRelinkMediaFailureStatus(error));
      return;
    }

    bulkRelinkFileInputRef.current?.click();
  };

  const handleRemoveAsset = (assetId: string) => {
    const plan = resolveRemoveMediaAssetPlan({
      project,
      assetId,
      selectedSourceAssetId,
      assetById,
    });
    const committed = commitProject(plan.commitLabel, (current) => removeMediaAsset(current, assetId));

    if (!committed) {
      return;
    }

    setSelectedSourceAssetId(plan.nextSourceAssetId);
    setCacheJobsByAssetId((current) => omitAssetScopedRecords(current, plan.assetIds));
    setSourceRangesByAssetId((current) => omitAssetScopedRecords(current, plan.assetIds));
    setAudioPeaksByAssetId((current) => omitAssetScopedRecords(current, plan.assetIds));
    setStatus(plan.status);
  };

  const handleRemoveUnusedAssets = () => {
    const plan = resolveRemoveUnusedMediaAssetsPlan({
      project,
      assetReferenceCounts,
      selectedSourceAssetId,
    });

    if (!plan.canRemove) {
      setStatus(plan.status);
      return;
    }

    const committed = commitProject(
      plan.commitLabel,
      (current) => removeUnusedMediaAssets(current),
    );

    if (!committed) {
      return;
    }

    setSelectedSourceAssetId(plan.nextSourceAssetId);
    setCacheJobsByAssetId((current) => omitAssetScopedRecords(current, plan.assetIds));
    setSourceRangesByAssetId((current) => omitAssetScopedRecords(current, plan.assetIds));
    setAudioPeaksByAssetId((current) => omitAssetScopedRecords(current, plan.assetIds));
    setStatus(plan.status);
  };

  const handleRelinkAssetFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    const assetId = relinkAssetIdRef.current;
    relinkAssetIdRef.current = null;
    if (!file || !assetId) {
      return;
    }

    try {
      const uploaded = (await uploadMediaFiles([file]))[0];
      applyRelinkUploadedMedia(assetId, file, uploaded);
    } catch (error) {
      setStatus(resolveRelinkMediaFailureStatus(error));
    }
  };

  const handleBulkRelinkAssetFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (files.length === 0) {
      return;
    }

    try {
      const uploaded = await uploadMediaFiles(files);
      applyBulkRelinkUploadedMedia(files, uploaded);
    } catch (error) {
      setStatus(resolveRelinkMediaFailureStatus(error));
    }
  };

  const runEditorHooks = async (
    event: EditorHookEvent,
    targetProject = project,
    context: { selectedClipIds?: string[]; assetIds?: string[] } = {},
    options: { queueComfyUI?: boolean; executeComfyUI?: boolean; applyLocalActions?: boolean; executeWebhooks?: boolean } = {},
  ) => {
    try {
      const plan = await runAutomationHooks({
        project: targetProject,
        event,
        selectedClipIds: context.selectedClipIds ?? selectedClipIds,
        assetIds: context.assetIds ?? [],
        queueComfyUI: options.queueComfyUI === true,
        executeComfyUI: options.executeComfyUI === true,
        applyLocalActions: options.applyLocalActions === true,
        executeWebhooks: options.executeWebhooks === true,
        priority: queueSettings.defaultComfyUIPriority,
      });
      setLastHookPlan(plan);
      const hookState = resolveAutomationHookWorkflowState(plan);
      if (hookState.appliedProject && hookState.localCommitLabel) {
        commitResolvedProject(hookState.localCommitLabel, hookState.appliedProject);
      }
      if (hookState.queuedJob) {
        setComfyUIJob(hookState.queuedJob);
        setIsQueueingComfyUI(hookState.isQueueingComfyUI ?? false);
      }
      setStatus(hookState.status);
      return plan;
    } catch (error) {
      setStatus(resolveAutomationHookFailureStatus(error));
      return null;
    }
  };

  const prepareProjectForExport = async (targetProject = project): Promise<EditorProject> => {
    const waveformReadyProject = applyRuntimeWaveformsToProject({
      project: targetProject,
      assetIds: targetProject.assets.map((asset) => asset.id),
      audioPeaksByAssetId,
    });
    const hookRequest = resolveBeforeExportHookRequest();
    const hookPlan = await runEditorHooks(
      hookRequest.event,
      waveformReadyProject,
      hookRequest.context,
      hookRequest.options,
    );

    return resolvePreparedExportProject({ targetProject: waveformReadyProject, hookPlan });
  };

  const applyQueuedMediaCacheJobs = (entries: MediaCacheJobEntry[]) => {
    if (entries.length === 0) {
      return;
    }

    setCacheJobsByAssetId((current) => mergeMediaCacheJobsByAssetId(current, entries));
    setProject((current) => applyQueuedMediaCacheJobsToProject(current, entries));
  };

  const handleRebuildMediaCache = async (asset: EditorAsset) => {
    const requestGeneration = projectReplacementGenerationRef.current;

    try {
      const job = await queueMediaCacheJob(asset, queueSettings.defaultMediaCachePriority);
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      applyQueuedMediaCacheJobs([{ assetId: asset.id, job }]);
      setStatus(resolveMediaCacheRebuildQueuedStatus(asset));
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setStatus(resolveMediaCacheRebuildFailureStatus(error));
    }
  };

  const handleRebuildSelectedMediaCache = async () => {
    if (!selectedClipAsset) {
      setStatus(resolveMediaCacheQueueEmptyStatus('selected', {
        requestedCount: 0,
        targets: [],
        skipped: [],
      }));
      return;
    }

    const selectedMediaCachePlan = buildMediaCacheBatchPlan(project.assets, {
      targetAssetIds: [selectedClipAsset.id],
      activeJobAssetIds: activeCacheJobAssetIds,
    });

    if (selectedMediaCachePlan.targets.length === 0) {
      setStatus(resolveMediaCacheQueueEmptyStatus('selected', selectedMediaCachePlan));
      return;
    }

    const queuedEntries: MediaCacheJobEntry[] = [];
    const failed: string[] = [];
    const requestGeneration = projectReplacementGenerationRef.current;

    for (const asset of selectedMediaCachePlan.targets) {
      try {
        const job = await queueMediaCacheJob(asset, queueSettings.defaultMediaCachePriority);
        if (projectReplacementGenerationRef.current !== requestGeneration) {
          return;
        }

        queuedEntries.push({ assetId: asset.id, job });
      } catch (error) {
        if (projectReplacementGenerationRef.current !== requestGeneration) {
          return;
        }

        failed.push(resolveMediaCacheAssetQueueFailure(asset, error));
      }
    }

    applyQueuedMediaCacheJobs(queuedEntries);
    setStatus(resolveMediaCacheQueueResultStatus({
      scope: 'selected',
      queuedCount: queuedEntries.length,
      skippedCount: selectedMediaCachePlan.skipped.length,
      failures: failed,
    }));
  };

  const handleRebuildFilteredMediaCache = async () => {
    if (filteredMediaCachePlan.targets.length === 0) {
      setStatus(resolveMediaCacheQueueEmptyStatus('filtered', filteredMediaCachePlan));
      return;
    }

    const queuedEntries: MediaCacheJobEntry[] = [];
    const failed: string[] = [];
    const requestGeneration = projectReplacementGenerationRef.current;

    for (const asset of filteredMediaCachePlan.targets) {
      try {
        const job = await queueMediaCacheJob(asset, queueSettings.defaultMediaCachePriority);
        if (projectReplacementGenerationRef.current !== requestGeneration) {
          return;
        }

        queuedEntries.push({ assetId: asset.id, job });
      } catch (error) {
        if (projectReplacementGenerationRef.current !== requestGeneration) {
          return;
        }

        failed.push(resolveMediaCacheAssetQueueFailure(asset, error));
      }
    }

    applyQueuedMediaCacheJobs(queuedEntries);
    setStatus(resolveMediaCacheQueueResultStatus({
      scope: 'filtered',
      queuedCount: queuedEntries.length,
      skippedCount: filteredMediaCachePlan.skipped.length,
      failures: failed,
    }));
  };

  const handleRebuildPreflightMediaCache = async () => {
    if (preflightMediaCachePlan.targets.length === 0) {
      setStatus(resolveMediaCacheQueueEmptyStatus('preflight', preflightMediaCachePlan));
      return;
    }

    const queuedEntries: MediaCacheJobEntry[] = [];
    const failed: string[] = [];
    const requestGeneration = projectReplacementGenerationRef.current;

    for (const asset of preflightMediaCachePlan.targets) {
      try {
        const job = await queueMediaCacheJob(asset, queueSettings.defaultMediaCachePriority);
        if (projectReplacementGenerationRef.current !== requestGeneration) {
          return;
        }

        queuedEntries.push({ assetId: asset.id, job });
      } catch (error) {
        if (projectReplacementGenerationRef.current !== requestGeneration) {
          return;
        }

        failed.push(resolveMediaCacheAssetQueueFailure(asset, error));
      }
    }

    applyQueuedMediaCacheJobs(queuedEntries);
    setStatus(resolveMediaCacheQueueResultStatus({
      scope: 'preflight',
      queuedCount: queuedEntries.length,
      skippedCount: preflightMediaCachePlan.skipped.length,
      failures: failed,
    }));
  };

  const handleRebuildPreviewMediaCache = async (assetIds: string[]) => {
    const previewMediaCachePlan = buildMediaCacheBatchPlan(project.assets, {
      targetAssetIds: assetIds,
      activeJobAssetIds: activeCacheJobAssetIds,
    });

    if (previewMediaCachePlan.targets.length === 0) {
      setStatus(resolveMediaCacheQueueEmptyStatus('preview', previewMediaCachePlan));
      return;
    }

    const queuedEntries: MediaCacheJobEntry[] = [];
    const failed: string[] = [];
    const requestGeneration = projectReplacementGenerationRef.current;

    for (const asset of previewMediaCachePlan.targets) {
      try {
        const job = await queueMediaCacheJob(asset, queueSettings.defaultMediaCachePriority);
        if (projectReplacementGenerationRef.current !== requestGeneration) {
          return;
        }

        queuedEntries.push({ assetId: asset.id, job });
      } catch (error) {
        if (projectReplacementGenerationRef.current !== requestGeneration) {
          return;
        }

        failed.push(resolveMediaCacheAssetQueueFailure(asset, error));
      }
    }

    applyQueuedMediaCacheJobs(queuedEntries);
    setStatus(resolveMediaCacheQueueResultStatus({
      scope: 'preview',
      queuedCount: queuedEntries.length,
      skippedCount: previewMediaCachePlan.skipped.length,
      failures: failed,
    }));
  };

  const handleCancelMediaCache = async (assetId: string) => {
    const job = cacheJobsByAssetId[assetId];
    if (!job) {
      return;
    }

    const requestGeneration = projectReplacementGenerationRef.current;
    try {
      const nextJob = await cancelMediaCacheJob(job.id);
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setCacheJobsByAssetId((current) => mergeMediaCacheJobsByAssetId(current, [{ assetId, job: nextJob }]));
      setStatus(resolveMediaCacheCancelStatus());
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setStatus(resolveMediaCacheCancelFailureStatus(error));
    }
  };

  const handleRetryMediaCache = async (assetId: string) => {
    const job = cacheJobsByAssetId[assetId];
    if (!job) {
      return;
    }

    const requestGeneration = projectReplacementGenerationRef.current;
    try {
      const nextJob = await retryMediaCacheJob(job.id, queueSettings.defaultMediaCachePriority);
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setCacheJobsByAssetId((current) => mergeMediaCacheJobsByAssetId(current, [{ assetId, job: nextJob }]));
      setStatus(resolveMediaCacheRetryStatus());
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setStatus(resolveMediaCacheRetryFailureStatus(error));
    }
  };

  const selectClip = (clip: TimelineClip, shouldSeek = true, mode: ClipSelectionMode = 'replace') => {
    setSelectedClipId(clip.id);
    setSelectedTrackId(clip.trackId);
    setSelectedClipIds((current) => resolveTimelineClipSelection({
      project,
      currentSelectedClipIds: current,
      clip,
      shouldSeek,
      mode,
      includeLinked: linkedClipEditsEnabled,
    }).selectedClipIds);

    if (shouldSeek) {
      setTimelinePlayhead(clip.start);
    }
  };

  const handleTimelineClipSelect = (clip: TimelineClip, event: MouseEvent<HTMLButtonElement>) => {
    const selection = resolveTimelineClipSelectInteraction({
      project,
      currentSelectedClipIds: selectedClipIds,
      clip,
      modifiers: {
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
      },
      includeLinked: linkedClipEditsEnabled,
    });
    setSelectedClipId(selection.selectedClipId);
    setSelectedTrackId(selection.selectedTrackId);
    setSelectedClipIds(selection.selectedClipIds);

    if (selection.seekTime !== undefined) {
      setTimelinePlayhead(selection.seekTime);
    }
  };

  const applyTrackSelectionPlan = (plan: TrackSelectionPlan) => {
    setSelectedTrackId(plan.selectedTrackId);
    if (plan.sourcePrimaryPatchTrackId !== undefined) {
      setSourcePrimaryPatchTrackId(plan.sourcePrimaryPatchTrackId);
    }
    if (plan.sourcePrimaryPatchEnabled !== undefined) {
      setSourcePrimaryPatchEnabled(plan.sourcePrimaryPatchEnabled);
    }
    if (plan.sourceAudioPatchTrackId !== undefined) {
      setSourceAudioPatchTrackId(plan.sourceAudioPatchTrackId);
    }
    if (plan.sourceAudioPatchEnabled !== undefined) {
      setSourceAudioPatchEnabled(plan.sourceAudioPatchEnabled);
    }
  };

  const handleTrackSelect = (track: TimelineTrack) => {
    applyTrackSelectionPlan(resolveTrackSelectionPlan(track));
  };

  const applyInsertedAssetPatchSelection = ({
    previousProject,
    nextProject,
    assetId,
    start,
  }: {
    previousProject: EditorProject;
    nextProject: EditorProject;
    assetId: string;
    start: number;
  }): boolean => {
    const selection = resolveInsertedSourceAssetPatchSelection({
      previousProject,
      nextProject,
      assetId,
      start,
    });
    if (selection.canSelect) {
      setSelectedClipId(selection.selectedClipId);
      setSelectedClipIds(selection.selectedClipIds);
      setSelectedTrackId(selection.selectedTrackId);
      setPlayhead(selection.nextPlayhead);
      setActiveMonitor('program');
      return true;
    }

    return false;
  };

  const handleProgramPreviewClipSelect = (clipId: string) => {
    const plan = resolveProgramPreviewClipSelection({ allClips, clipId });
    if (!plan.canSelect) {
      setStatus(plan.status);
      return;
    }

    selectClip(plan.clip, false);
    setActiveMonitor(plan.activeMonitor);
    setStatus(plan.status);
  };

  const handleInsertAsset = (assetId: string) => {
    const plan = resolveInsertSourceAssetAtPlayheadPlan({
      project,
      asset: assetById.get(assetId),
      start: playhead,
      settings: resolveDirectMediaInsertPatchSettings({
        selectedTrackId,
        sourcePrimaryPatchTrackId,
        sourceAudioPatchTrackId,
        sourcePrimaryPatchEnabled,
        sourceAudioPatchEnabled,
      }),
    });
    if (!plan.canInsert) {
      setStatus(plan.status);
      return;
    }

    const result = commitProjectResult(plan.commitLabel, (current) => (
      insertAssetPatchOnTimeline(current, plan.assetId, plan.options)
    ));
    if (!result.committed) {
      return;
    }

    applyInsertedAssetPatchSelection({
      previousProject: project,
      nextProject: result.project,
      assetId: plan.assetId,
      start: plan.options.start,
    });
  };

  const handleOverwriteAsset = (assetId: string) => {
    const plan = resolveOverwriteSourceAssetAtPlayheadPlan({
      project,
      asset: assetById.get(assetId),
      start: playhead,
      settings: resolveDirectMediaInsertPatchSettings({
        selectedTrackId,
        sourcePrimaryPatchTrackId,
        sourceAudioPatchTrackId,
        sourcePrimaryPatchEnabled,
        sourceAudioPatchEnabled,
      }),
    });
    if (!plan.canOverwrite) {
      setStatus(plan.status);
      return;
    }

    const result = commitProjectResult(plan.commitLabel, (current) => (
      overwriteAssetPatchOnTimeline(current, plan.assetId, plan.options)
    ));
    if (!result.committed) {
      return;
    }

    applyInsertedAssetPatchSelection({
      previousProject: project,
      nextProject: result.project,
      assetId: plan.assetId,
      start: plan.options.start,
    });
  };

  const resolveAssetDropStart = (event: DragEvent<HTMLDivElement>): number => {
    applyTimelineEdgeAutoScroll(event.clientX);
    const rect = event.currentTarget.getBoundingClientRect();
    return resolveTimelineImportDropStart({
      project,
      clientX: event.clientX,
      laneLeft: rect.left,
      pixelsPerSecond,
      snapEnabled,
      snapExtraPoints: timelineEditSnapPoints,
    });
  };

  const resolveAssetPointerDropStart = (clientX: number, laneNode: HTMLDivElement): number => {
    applyTimelineEdgeAutoScroll(clientX);
    const rect = laneNode.getBoundingClientRect();
    return resolveTimelineImportDropStart({
      project,
      clientX,
      laneLeft: rect.left,
      pixelsPerSecond,
      snapEnabled,
      snapExtraPoints: timelineEditSnapPoints,
    });
  };

  const resolveTimelineLaneAtPoint = (clientX: number, clientY: number): { track: TimelineTrack; node: HTMLDivElement } | null => {
    for (const track of project.tracks) {
      const node = timelineLaneRefs.current[track.id];
      if (!node) {
        continue;
      }

      const rect = node.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return { track, node };
      }
    }

    return null;
  };

  const handleAssetDragStart = (event: DragEvent<HTMLDivElement>, asset: EditorAsset) => {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(MEDIA_ASSET_DRAG_MIME, asset.id);
    event.dataTransfer.setData('text/plain', asset.id);
    setSelectedSourceAssetId(asset.id);
    setDraggingAssetId(asset.id);
    setAssetDropPreview(null);
    showTimelineEditGuide(null);
    setStatus(`Drag ${asset.name} to a timeline lane`);
  };

  const handleAssetPointerDragStart = (event: MouseEvent<HTMLElement>, asset: EditorAsset) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const dragStartClientX = event.clientX;
    const dragStartClientY = event.clientY;
    const requestGeneration = projectReplacementGenerationRef.current;
    let hasStartedDrag = false;
    setSelectedSourceAssetId(asset.id);
    setAssetDropPreview(null);
    showTimelineEditGuide(null);

    const previewAssetDrop = (clientX: number, clientY: number) => {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return null;
      }

      const target = resolveTimelineLaneAtPoint(clientX, clientY);
      if (!target) {
        setAssetDropPreview(null);
        showTimelineEditGuide(null);
        return null;
      }

      const start = resolveAssetPointerDropStart(clientX, target.node);
      const previewPlan = resolveAssetTimelineDropPreviewPlan({
        project,
        asset,
        track: target.track,
        start,
        sourceRange: sourceRangesByAssetId[asset.id],
        settings: {
          selectedTrackId,
          sourceAudioPatchTrackId,
          sourceAudioPatchEnabled,
          editMode,
        },
      });
      setAssetDropPreview(previewPlan.assetDropPreview);
      showTimelineEditGuide(previewPlan.editGuide);
      return { ...target, start };
    };

    const handlePointerMove = (moveEvent: globalThis.MouseEvent) => {
      moveEvent.preventDefault();
      if (!hasStartedDrag) {
        const dragDistance = Math.hypot(moveEvent.clientX - dragStartClientX, moveEvent.clientY - dragStartClientY);
        if (dragDistance < 4) {
          return;
        }

        hasStartedDrag = true;
        setDraggingAssetId(asset.id);
        setStatus(`Drag ${asset.name} to a timeline lane`);
      }

      previewAssetDrop(moveEvent.clientX, moveEvent.clientY);
    };

    const handlePointerUp = (upEvent: globalThis.MouseEvent) => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      setAssetDropPreview(null);
      showTimelineEditGuide(null);
      setDraggingAssetId(null);

      if (!hasStartedDrag) {
        return;
      }

      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      const target = previewAssetDrop(upEvent.clientX, upEvent.clientY);
      setAssetDropPreview(null);
      showTimelineEditGuide(null);
      if (!target) {
        setStatus('Drop media on a timeline track');
        return;
      }

      try {
        const dropPlan = resolveAssetTimelineDropCommitPlan({
          project,
          asset,
          track: target.track,
          start: target.start,
          sourceRange: sourceRangesByAssetId[asset.id],
          settings: {
            selectedTrackId,
            sourceAudioPatchTrackId,
            sourceAudioPatchEnabled,
            editMode,
          },
        });
        const result = commitProjectResult(
          dropPlan.commitLabel,
          (current) => (
            editMode === 'overwrite'
              ? overwriteAssetPatchOnTimeline(current, asset.id, dropPlan.options)
              : insertAssetPatchOnTimeline(current, asset.id, dropPlan.options)
          ),
        );

        if (result.committed) {
          setSelectedSourceAssetId(dropPlan.selectedSourceAssetId);
          const selectedInsertedClip = applyInsertedAssetPatchSelection({
            previousProject: project,
            nextProject: result.project,
            assetId: asset.id,
            start: dropPlan.options.start,
          });
          if (!selectedInsertedClip) {
            setSelectedTrackId(dropPlan.selectedTrackId);
            setPlayhead(dropPlan.nextPlayhead);
            setActiveMonitor('program');
          }
          setStatus(dropPlan.status);
        }
      } catch (error) {
        setStatus(resolveAssetTimelineDropFailureStatus(error));
      }
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
  };

  const handleAssetDragOverTimeline = (event: DragEvent<HTMLDivElement>, track: TimelineTrack) => {
    const assetId = readDraggedAssetId(event.dataTransfer);
    const asset = assetById.get(assetId);
    if (!asset) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    const start = resolveAssetDropStart(event);
    const previewPlan = resolveAssetTimelineDropPreviewPlan({
      project,
      asset,
      track,
      start,
      sourceRange: sourceRangesByAssetId[asset.id],
      settings: {
        selectedTrackId,
        sourceAudioPatchTrackId,
        sourceAudioPatchEnabled,
        editMode,
      },
    });
    setAssetDropPreview(previewPlan.assetDropPreview);
    showTimelineEditGuide(previewPlan.editGuide);
  };

  const handleAssetDropOnTimeline = (event: DragEvent<HTMLDivElement>, track: TimelineTrack) => {
    const assetId = readDraggedAssetId(event.dataTransfer);
    const asset = assetById.get(assetId);
    if (!asset) {
      return;
    }

    event.preventDefault();
    setAssetDropPreview(null);
    showTimelineEditGuide(null);
    setDraggingAssetId(null);
    const start = resolveAssetDropStart(event);
    try {
      const dropPlan = resolveAssetTimelineDropCommitPlan({
        project,
        asset,
        track,
        start,
        sourceRange: sourceRangesByAssetId[asset.id],
        settings: {
          selectedTrackId,
          sourceAudioPatchTrackId,
          sourceAudioPatchEnabled,
          editMode,
        },
      });
      const result = commitProjectResult(
        dropPlan.commitLabel,
        (current) => (
          editMode === 'overwrite'
            ? overwriteAssetPatchOnTimeline(current, asset.id, dropPlan.options)
            : insertAssetPatchOnTimeline(current, asset.id, dropPlan.options)
        ),
      );

      if (result.committed) {
        setSelectedSourceAssetId(dropPlan.selectedSourceAssetId);
        const selectedInsertedClip = applyInsertedAssetPatchSelection({
          previousProject: project,
          nextProject: result.project,
          assetId: asset.id,
          start: dropPlan.options.start,
        });
        if (!selectedInsertedClip) {
          setSelectedTrackId(dropPlan.selectedTrackId);
          setPlayhead(dropPlan.nextPlayhead);
          setActiveMonitor('program');
        }
        setStatus(dropPlan.status);
      }
    } catch (error) {
      setStatus(resolveAssetTimelineDropFailureStatus(error));
    }
  };

  const handleMediaFileDragOverTimeline = (event: DragEvent<HTMLDivElement>, track: TimelineTrack): boolean => {
    const preview = readDraggedMediaFilePreview(event.dataTransfer);
    if (!preview) {
      return false;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    const start = resolveAssetDropStart(event);
    const previewPlan = resolveMediaFileTimelineDropPreviewPlan({
      preview,
      project,
      track,
      start,
      editMode,
      settings: {
        selectedTrackId,
        sourceAudioPatchTrackId,
        sourceAudioPatchEnabled,
        editMode,
      },
    });
    setAssetDropPreview(previewPlan.assetDropPreview);
    showTimelineEditGuide(previewPlan.editGuide);
    return true;
  };

  const handleTimelineDragOver = (event: DragEvent<HTMLDivElement>, track: TimelineTrack) => {
    if (handleMediaFileDragOverTimeline(event, track)) {
      return;
    }

    handleAssetDragOverTimeline(event, track);
  };

  const handleMediaFileDropOnTimeline = async (event: DragEvent<HTMLDivElement>, track: TimelineTrack): Promise<boolean> => {
    if (!hasDraggedFiles(event.dataTransfer)) {
      return false;
    }

    const droppedFiles = getDraggedMediaFiles(event.dataTransfer);
    const skippedFileCount = countNonMediaDraggedFiles(event.dataTransfer);
    event.preventDefault();
    setAssetDropPreview(null);
    showTimelineEditGuide(null);

    if (droppedFiles.length === 0) {
      setStatus(resolveUnsupportedTimelineMediaDropStatus());
      return true;
    }

    const start = resolveAssetDropStart(event);
    const targetTrackId = track.id;
    const targetTrackName = track.name;

    try {
      const preparedMedia = await prepareImportedMediaInputs(droppedFiles);
      const dropResult = resolvePreparedMediaTimelineDropResult({
        project,
        preparedMedia,
        start,
        targetTrackId,
        targetTrackName,
        selectedSourceAssetId,
        settings: {
          selectedTrackId,
          sourceAudioPatchTrackId,
          sourceAudioPatchEnabled,
          editMode,
        },
        sourceRangesByAssetId,
      });

      setHistory((current) => [...current.slice(-49), project]);
      setFuture([]);
      setProject(dropResult.nextProject);
      if (dropResult.cacheJobEntries.length > 0) {
        setCacheJobsByAssetId((current) => mergeMediaCacheJobsByAssetId(current, dropResult.cacheJobEntries));
      }
      setSelectedSourceAssetId(dropResult.selectedSourceAssetId);
      const selectedInsertedClip = applyInsertedAssetPatchSelection({
        previousProject: project,
        nextProject: dropResult.nextProject,
        assetId: dropResult.selectedSourceAssetId,
        start,
      });
      if (!selectedInsertedClip) {
        setSelectedTrackId(dropResult.selectedTrackId);
        setPlayhead(dropResult.nextPlayhead);
        setActiveMonitor('program');
      }
      setStatus(appendSkippedNonMediaDropStatus(dropResult.status, skippedFileCount));
      void runEditorHooks('on-import', dropResult.nextProject, { assetIds: dropResult.importedAssetIds });
    } catch (error) {
      setStatus(resolveMediaFileTimelineDropFailureStatus(error));
    }

    return true;
  };

  const handleTimelineDrop = (event: DragEvent<HTMLDivElement>, track: TimelineTrack) => {
    if (hasDraggedFiles(event.dataTransfer)) {
      void handleMediaFileDropOnTimeline(event, track);
      return;
    }

    handleAssetDropOnTimeline(event, track);
  };

  const handleMediaBinDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!hasImportableDraggedFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setMediaFileDropActive(true);
  };

  const handleMediaBinDrop = async (event: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event.dataTransfer)) {
      return;
    }

    const droppedFiles = Array.from(event.dataTransfer.files);
    event.preventDefault();
    setMediaFileDropActive(false);

    if (droppedFiles.length === 0) {
      setStatus(resolveUnsupportedMediaDropStatus());
      return;
    }

    try {
      await importFilesToEditor(droppedFiles);
    } catch (error) {
      setStatus(resolveMediaBinDropFailureStatus(error));
    }
  };

  const handleSourceRangePatch = (assetId: string, patch: Partial<SourceRange>) => {
    setSourceRangesByAssetId((current) => {
      const plan = resolveSourceRangePatchPlan({
        asset: assetById.get(assetId),
        currentRange: current[assetId],
        patch,
      });
      if (!plan.canApply) {
        return current;
      }

      return {
        ...current,
        [plan.assetId]: plan.range,
      };
    });
  };

  const handleSourceRangeHandleDrag = (handle: SourceRangeHandle, time: number) => {
    const plan = resolveSourceRangeHandlePatch({
      asset: selectedSourceAsset,
      currentRange: selectedSourceAsset ? sourceRangesByAssetId[selectedSourceAsset.id] : undefined,
      handle,
      time,
      fps: project.fps,
    });
    if (!plan.canApply) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    setSourceRangesByAssetId((current) => ({
      ...current,
      [plan.assetId]: plan.range,
    }));
    setSourcePlayhead(handle === 'in' ? plan.range.in : plan.range.out);
    if (plan.status) {
      setStatus(plan.status);
    }
  };

  const handleResetSourceRange = (assetId: string) => {
    const plan = resolveSourceRangeResetPlan(assetById.get(assetId));
    if (!plan.canReset) {
      setStatus(plan.status);
      return;
    }

    setSourceRangesByAssetId((current) => ({
      ...current,
      [plan.assetId]: plan.range,
    }));
    if (plan.status) {
      setStatus(plan.status);
    }
  };

  const handleClearSourceMarks = () => {
    if (!selectedSourceAsset) {
      setStatus('Select a source asset first');
      return;
    }

    setActiveMonitor('source');
    handleResetSourceRange(selectedSourceAsset.id);
  };

  const handleCreateSourceSubclip = () => {
    const readiness = resolveSourceSubclipReadinessPlan({
      selectedSourceAsset,
      selectedSourceRange,
      selectedSourceAssetBin,
    });
    if (!readiness.canCreate) {
      setStatus(readiness.status);
      return;
    }

    try {
      const result = createMediaSubclip(project, readiness.assetId, readiness.options);
      const resultPlan = resolveSourceSubclipResultPlan(result.asset);
      const committed = commitResolvedProject(resultPlan.commitLabel, result.project);
      if (!committed) {
        return;
      }

      setSelectedSourceAssetId(resultPlan.selectedSourceAssetId);
      setSourceRangesByAssetId((current) => ({
        ...current,
        [resultPlan.selectedSourceAssetId]: resultPlan.sourceRange,
      }));
      setSourcePlayhead(resultPlan.sourcePlayhead);
      setMediaBinFilter(resultPlan.mediaBinFilter);
      setStatus(resultPlan.status);
    } catch (error) {
      setStatus(resolveSourceSubclipFailureStatus(error));
    }
  };

  const handleSetSourceMark = (type: 'in' | 'out') => {
    const plan = resolveSourceMarkPatch({
      asset: selectedSourceAsset,
      currentRange: selectedSourceAsset ? sourceRangesByAssetId[selectedSourceAsset.id] : undefined,
      type,
      sourcePlayhead,
      fps: project.fps,
    });
    if (!plan.canApply) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    setSourceRangesByAssetId((current) => ({
      ...current,
      [plan.assetId]: plan.range,
    }));
    if (plan.status) {
      setStatus(plan.status);
    }
  };

  const handleGoToSourceMark = (type: 'in' | 'out') => {
    const plan = resolveGoToSourceMarkPlan({
      asset: selectedSourceAsset,
      currentRange: selectedSourceAsset ? sourceRangesByAssetId[selectedSourceAsset.id] : undefined,
      type,
      fps: project.fps,
    });
    if (!plan.canSeek) {
      setStatus(plan.status);
      return;
    }

    setSourcePlayhead(plan.sourcePlayhead);
    setActiveMonitor('source');
    setStatus(plan.status);
  };

  const handleMatchSourceRangeToMarkedRange = (assetId: string) => {
    const asset = assetById.get(assetId);
    const plan = resolveMatchSourceRangeToMarkedRange({
      asset,
      currentRange: asset ? sourceRangesByAssetId[assetId] : undefined,
      markedRange,
    });
    if (!plan.canApply) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    setSourceRangesByAssetId((current) => ({
      ...current,
      [plan.assetId]: plan.range,
    }));
    if (plan.status) {
      setStatus(plan.status);
    }
  };

  const handleThreePointAssetEdit = (mode: 'insert' | 'overwrite', assetId = selectedSourceAsset?.id) => {
    const plan = resolveThreePointAssetEditPlan({
      project,
      assetId,
      assetById,
      sourceRangesByAssetId,
      markedRange,
      playhead,
      mode,
      settings: {
        selectedTrackId,
        sourcePrimaryPatchTrackId,
        sourceAudioPatchTrackId,
        sourcePrimaryPatchEnabled,
        sourceAudioPatchEnabled,
      },
    });
    if (!plan.canEdit) {
      setStatus(plan.status);
      return;
    }

    const result = commitProjectResult(plan.commitLabel, (current) => (
      plan.operation === 'overwrite'
        ? overwriteAssetPatchOnTimeline(current, plan.assetId, plan.options)
        : insertAssetPatchOnTimeline(current, plan.assetId, plan.options)
    ));
    if (!result.committed) {
      return;
    }

    applyInsertedAssetPatchSelection({
      previousProject: project,
      nextProject: result.project,
      assetId: plan.assetId,
      start: plan.options.start,
    });
    setPlayhead(plan.nextPlayhead);
  };

  const handleMatchFrameToSource = () => {
    const plan = resolveMatchFrameToSourcePlan({
      selectedClip,
      assetById,
      playhead,
      fps: project.fps,
    });
    if (!plan.canMatch || !plan.selectedSourceAssetId || plan.sourcePlayhead === undefined) {
      setStatus(plan.status);
      return;
    }

    setSelectedSourceAssetId(plan.selectedSourceAssetId);
    setSourcePlayhead(plan.sourcePlayhead);
    setActiveMonitor(plan.activeMonitor);
    setStatus(plan.status);
  };

  const handleReplaceSelectedFromSource = () => {
    const plan = resolveReplaceSelectedFromSourcePlan({
      selectedClip,
      selectedClipAsset,
      selectedSourceAsset,
      selectedSourceRange,
    });
    if (!plan.canReplace) {
      setStatus(plan.status);
      return;
    }

    commitProject(plan.commitLabel, (current) => (
      replaceClipSource(current, plan.targetClipId, plan.sourceAssetId, plan.options)
    ));
  };

  const handleDeleteSelected = (ripple = rippleMode, fallbackClip?: TimelineClip | null) => {
    const targetClips = selectedClips.length > 0
      ? selectedClips
      : fallbackClip ? [fallbackClip] : [];
    const plan = resolveDeleteSelectedClipsPlan({
      project,
      selectedClips: targetClips,
      ripple,
    });
    if (!plan.canCommit) {
      setStatus(plan.status);
      return;
    }

    commitProject(plan.commitLabel, (current) => deleteClips(current, plan.targetClipIds, ripple));
    setPrimarySelection(plan.nextPrimarySelection ?? '');
  };

  const handleGroupSelectedClips = () => {
    const plan = resolveGroupSelectedClipsPlan({
      project,
      selectedClips,
    });
    if (!plan.canCommit) {
      setStatus(plan.status);
      return;
    }

    const committed = commitProject(plan.commitLabel, (current) => groupClips(current, plan.targetClipIds));
    if (committed) {
      setSelectedClipIds(plan.nextSelectedClipIds ?? []);
      setSelectedClipId(plan.nextSelectedClipId ?? '');
    }
  };

  const handleUngroupSelectedClips = () => {
    const plan = resolveUngroupSelectedClipsPlan({
      project,
      selectedClips,
    });
    if (!plan.canCommit) {
      setStatus(plan.status);
      return;
    }

    const committed = commitProject(plan.commitLabel, (current) => ungroupClips(current, plan.targetClipIds));
    if (committed) {
      setSelectedClipIds(plan.nextSelectedClipIds ?? []);
      setSelectedClipId(plan.nextSelectedClipId ?? '');
    }
  };

  const handleCopySelected = () => {
    const plan = resolveCopySelectedClipsPlan(selectedClips);
    if (!plan.canCopy) {
      setStatus(plan.status);
      return;
    }

    setClipboardClips(plan.clips);
    setStatus(plan.status);
  };

  const handleCopyClipAttributes = () => {
    const plan = resolveCopyClipAttributesPlan(selectedClip);
    if (!plan.canCopy) {
      setStatus(plan.status);
      return;
    }

    const attributes = copyClipAttributes(project, plan.clipId);
    setAttributeClipboard(attributes);
    setStatus(formatCopiedClipAttributesStatus(attributes));
  };

  const handlePasteClipAttributes = () => {
    const plan = resolvePasteClipAttributesPlan({
      attributeClipboard,
      selectedClips,
    });
    if (!plan.canPaste) {
      setStatus(plan.status);
      return;
    }

    commitProject(plan.commitLabel, (current) => (
      pasteClipAttributes(current, attributeClipboard!, plan.targetClipIds)
    ));
  };

  const handleCutSelected = () => {
    const plan = resolveCutSelectedClipsPlan(selectedClips);
    if (!plan.canCopy) {
      setStatus(plan.status);
      return;
    }

    setClipboardClips(plan.clips);
    handleDeleteSelected(false);
    setStatus(plan.status);
  };

  const handleCopyMarkedRange = (allTracks = false) => {
    const plan = resolveCopyMarkedTimelineRangePlan({
      project,
      markedRange,
      selectedTrackId,
      allTracks,
    });
    if (!plan.canCopy) {
      setStatus(plan.status);
      return;
    }

    setClipboardClips(plan.clips);
    setStatus(plan.status);
  };

  const handleCutMarkedRange = (allTracks = false, ripple = false) => {
    const plan = resolveCutMarkedTimelineRangePlan({
      project,
      markedRange,
      selectedTrackId,
      allTracks,
      ripple,
    });
    if (!plan.canCut || !plan.project || !plan.commitLabel || plan.nextPlayhead === undefined) {
      setStatus(plan.status);
      return;
    }

    const committed = commitResolvedProject(plan.commitLabel, plan.project);
    if (!committed) {
      return;
    }

    setClipboardClips(plan.clips);
    setTimelinePlayhead(plan.nextPlayhead);
    setSelectedClipIds(plan.selectedClipIds ?? []);
    setSelectedClipId(plan.selectedClipId ?? '');
    setStatus(plan.status);
  };

  const handlePasteClipboardAtTime = (targetTime: number, label: string) => {
    const plan = resolvePasteClipboardPlan({
      clipboardClips,
      targetTime,
      label,
      selectedTrackId,
      editMode,
    });
    if (!plan.canPaste) {
      setStatus(plan.status);
      return;
    }

    commitProject(plan.commitLabel, (current) => {
      if (editMode === 'overwrite') {
        return overwriteClipsAtTime(current, plan.clips, plan.targetTime, plan.selectedTrackId);
      }

      return pasteClipsAtTime(current, plan.clips, plan.targetTime, plan.selectedTrackId, { ripple: true });
    });
  };

  const handlePasteClipboard = () => {
    handlePasteClipboardAtTime(playhead, 'playhead');
  };

  const handlePasteClipboardAtIn = () => {
    const plan = resolvePasteClipboardAtInPlan({
      clipboardClips,
      markIn,
      selectedTrackId,
      editMode,
    });
    if (!plan.canPaste) {
      setStatus(plan.status);
      return;
    }

    commitProject(plan.commitLabel, (current) => {
      if (editMode === 'overwrite') {
        return overwriteClipsAtTime(current, plan.clips, plan.targetTime, plan.selectedTrackId);
      }

      return pasteClipsAtTime(current, plan.clips, plan.targetTime, plan.selectedTrackId, { ripple: true });
    });
    setTimelinePlayhead(plan.nextPlayhead ?? plan.targetTime);
  };

  const handleAppendClipboard = () => {
    const plan = resolveAppendClipboardPlan({
      clipboardClips,
      tracks: project.tracks,
      selectedTrackId,
    });
    if (!plan.canPaste) {
      setStatus(plan.status);
      return;
    }

    commitProject(plan.commitLabel, (current) => pasteClipsAtTime(current, plan.clips, plan.targetTime, plan.selectedTrackId));
    setTimelinePlayhead(plan.nextPlayhead ?? plan.targetTime);
  };

  const handleSetMark = (type: 'in' | 'out') => {
    const plan = resolveSetTimelineMark({ type, playhead, fps: project.fps });
    if (plan.type === 'in') {
      setMarkIn(plan.time);
    } else {
      setMarkOut(plan.time);
    }
    setStatus(plan.status);
  };

  const handleGoToMark = (type: 'in' | 'out') => {
    const plan = resolveGoToTimelineMark({
      type,
      markIn,
      markOut,
      fps: project.fps,
    });
    if (!plan.canSeek || plan.playhead === undefined) {
      setStatus(plan.status);
      return;
    }

    setTimelinePlayhead(plan.playhead);
    setStatus(plan.status);
  };

  const handleClearMarks = () => {
    const plan = resolveClearTimelineMarks();
    setMarkIn(plan.markIn);
    setMarkOut(plan.markOut);
    setLoopPlaybackEnabled(plan.loopPlaybackEnabled);
    setExportRangeMode(plan.exportRangeMode);
    setStatus(plan.status);
  };

  const handleMarkSelectedClips = () => {
    const plan = resolveMarkSelectedTimelineClips({
      project,
      selectedClipIds,
    });
    if (!plan.canMark || plan.markIn === undefined || plan.markOut === undefined) {
      setStatus(plan.status);
      return;
    }

    setMarkIn(plan.markIn);
    setMarkOut(plan.markOut);
    setStatus(plan.status);
  };

  const handleSelectMarkedRange = (allTracks = false) => {
    const selection = resolveMarkedTimelineRangeSelection({
      project,
      markedRange,
      selectedTrackId,
      allTracks,
    });
    setSelectedClipIds(selection.selectedClipIds);
    setSelectedClipId(selection.selectedClipId);
    setStatus(selection.status);
  };

  const handleDeleteMarkedRange = (ripple: boolean) => {
    const plan = resolveDeleteMarkedTimelineRangePlan({
      project,
      markedRange,
      selectedClips,
      selectedTrackId,
      ripple,
    });
    if (!plan.canDelete || !markedRange || !plan.trackIds || !plan.commitLabel || plan.nextPlayhead === undefined) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    commitProject(plan.commitLabel, (current) => (
      deleteRange(current, markedRange.start, markedRange.end, { trackIds: plan.trackIds!, ripple })
    ));
    setTimelinePlayhead(plan.nextPlayhead);
    setSelectedClipIds(plan.selectedClipIds ?? []);
    setSelectedClipId(plan.selectedClipId ?? '');
  };

  const handleInsertGapAtPlayhead = () => {
    const plan = resolveInsertTimelineGapAtPlayheadPlan({
      projectDuration: project.duration,
      gapInsertDuration,
      playhead,
      selectedTrackId,
    });
    const committed = commitProject(plan.commitLabel, (current) => (
      insertTimelineGap(current, plan.playhead, plan.duration, { trackIds: plan.trackIds })
    ));

    if (committed) {
      setTimelinePlayhead(plan.nextPlayhead);
    }
  };

  const handleFillAiBrollGaps = () => {
    let filledClipIds: string[] = [];
    let firstClipStart = playhead;
    const committed = commitProject('AI B-roll gaps filled', (current) => {
      const result = fillAiBrollGaps(current, {
        minGapDuration: Math.max(0.5, 1 / current.fps),
        maxClipDuration: 8,
        limit: 8,
      });
      filledClipIds = result.clipIds;
      const firstClip = result.project.tracks.flatMap((track) => track.clips).find((clip) => clip.id === filledClipIds[0]);
      firstClipStart = firstClip?.start ?? firstClipStart;
      return result.project;
    });

    if (committed && filledClipIds.length > 0) {
      setSelectedClipIds(filledClipIds);
      setSelectedClipId(filledClipIds[0]);
      setTimelinePlayhead(firstClipStart);
      setStatus(`Filled ${filledClipIds.length} visual gap${filledClipIds.length === 1 ? '' : 's'} with AI B-roll drafts`);
    }
  };

  const handleCloseGapAtPlayhead = () => {
    const plan = resolveCloseTimelineGapAtPlayheadPlan({ selectedTrackId, playhead });
    commitProject(plan.commitLabel, (current) => closeGapAtTime(current, plan.trackId, plan.playhead));
  };

  const handleCloseAllGapsOnTrack = () => {
    const plan = resolveCloseAllTimelineGapsOnTrackPlan({ selectedTrackId });
    commitProject(plan.commitLabel, (current) => closeAllGapsOnTrack(current, plan.trackId));
  };

  const handleArrangeSelectedClips = (gapSeconds = clipArrangeGap) => {
    const plan = resolveArrangeSelectedClipsPlan({
      selectedClips,
      gapSeconds,
    });
    if (!plan.canCommit) {
      setStatus(plan.status);
      return;
    }

    let nextPlayhead = playhead;
    const committed = commitProject(plan.commitLabel, (current) => {
      const nextProject = arrangeClipsOnTrack(current, plan.targetClipIds, { gapSeconds: plan.gapSeconds });
      const firstSelectedClip = selectedClip ? findClip(nextProject, selectedClip.id) : undefined;
      nextPlayhead = firstSelectedClip?.start ?? nextPlayhead;
      return nextProject;
    });

    if (committed) {
      setTimelinePlayhead(nextPlayhead);
      setStatus(plan.status ?? '');
    }
  };

  const handleAddCaption = () => {
    commitProject('Caption added', (current) => addCaption(current, playhead));
  };

  const handleCaptionPatch = (captionId: string, patch: Partial<CaptionSegment>) => {
    commitProject('Caption updated', (current) => updateCaption(current, captionId, patch));
  };

  const handleApplyCaptionSpeaker = () => {
    const plan = resolveApplyCaptionSpeakerPlan(selectedCaptionIds);
    if (!plan.canApply || !plan.captionIds || !plan.commitLabel) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    const committed = commitProject(plan.commitLabel, (current) => (
      updateCaptionsSpeaker(current, plan.captionIds!, captionSpeakerDraft)
    ));

    if (committed && plan.status) {
      setStatus(plan.status);
    }
  };

  const handleMoveCaptionsToPlayhead = (captionIds = selectedCaptionIds) => {
    const plan = resolveMoveCaptionsToPlayheadPlan({ captionIds, playhead });
    if (!plan.canApply || !plan.captionIds || !plan.commitLabel || plan.playhead === undefined) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    commitProject(plan.commitLabel, (current) => (
      moveCaptionsToTime(current, plan.captionIds!, plan.playhead!)
    ));
    setSelectedCaptionIds(plan.selectedCaptionIds ?? plan.captionIds);
  };

  const handleNudgeSelectedCaptions = (deltaSeconds: number) => {
    const plan = resolveNudgeSelectedCaptionsPlan({ selectedCaptionIds, deltaSeconds });
    if (!plan.canApply || !plan.captionIds || !plan.commitLabel || plan.deltaSeconds === undefined) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    const committed = commitProject(plan.commitLabel, (current) => (
      nudgeCaptions(current, plan.captionIds!, plan.deltaSeconds!)
    ));

    if (committed && plan.status) {
      setStatus(plan.status);
    }
  };

  const handleTightenSelectedCaptions = () => {
    const plan = resolveTightenSelectedCaptionsPlan({
      selectedCaptionIds,
      gapSeconds: captionTightenGap,
    });
    if (!plan.canApply || !plan.captionIds || !plan.commitLabel || plan.gapSeconds === undefined) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    const committed = commitProject(plan.commitLabel, (current) => (
      compactCaptionGaps(current, plan.captionIds!, plan.gapSeconds!)
    ));

    if (committed && plan.status) {
      setStatus(plan.status);
    }
  };

  const handleCaptionStylePatch = (caption: CaptionSegment, patch: CaptionStyle) => {
    const plan = resolveCaptionStylePatchPlan({ caption, selectedCaptionIds });
    commitProject(plan.commitLabel, (current) => (
      updateCaptionsStyle(current, plan.targetCaptionIds, patch)
    ));
  };

  const handleSelectCaption = (captionId: string, append = false) => {
    setSelectedCaptionIds((current) => resolveCaptionSelection({
      currentCaptionIds: current,
      captionId,
      append,
    }));
  };

  const handleJumpToCaption = (captionId: string) => {
    const plan = resolveJumpToCaptionPlan({ project, captionId });
    if (!plan.canJump || plan.playhead === undefined || !plan.selectedCaptionIds) {
      setStatus(plan.status);
      return;
    }

    setTimelinePlayhead(plan.playhead);
    setSelectedCaptionIds(plan.selectedCaptionIds);
    setStatus(plan.status);
  };

  const handleSplitActiveCaption = () => {
    const plan = resolveSplitActiveCaptionPlan({ project, playhead, selectedCaptionIds });
    if (!plan.canSplit || !plan.captionId || plan.splitTime === undefined || !plan.commitLabel) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    setTimelinePlayhead(plan.playhead ?? plan.splitTime);
    setSelectedCaptionIds(plan.selectedCaptionIds ?? [plan.captionId]);
    commitProject(plan.commitLabel, (current) => splitCaptionAtTime(current, plan.captionId!, plan.splitTime!));
  };

  const handleMergeSelectedCaptions = () => {
    const plan = resolveMergeSelectedCaptionsPlan(selectedCaptionIds);
    if (!plan.canApply || !plan.captionIds || !plan.commitLabel) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    commitProject(plan.commitLabel, (current) => mergeCaptions(current, plan.captionIds!));
    setSelectedCaptionIds(plan.selectedCaptionIds ?? []);
  };

  const handleDeleteCaption = (captionId: string) => {
    const plan = resolveDeleteCaptionPlan({
      captionId,
      currentSelectedCaptionIds: selectedCaptionIds,
    });
    if (!plan.captionIds || !plan.commitLabel) {
      return;
    }

    commitProject(plan.commitLabel, (current) => deleteCaptions(current, plan.captionIds!));
    setSelectedCaptionIds(plan.selectedCaptionIds ?? []);
  };

  const handleDeleteSelectedCaptions = () => {
    const plan = resolveDeleteSelectedCaptionsPlan(selectedCaptionIds);
    if (!plan.canApply || !plan.captionIds || !plan.commitLabel) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    const committed = commitProject(plan.commitLabel, (current) => (
      deleteCaptions(current, plan.captionIds!)
    ));

    if (committed) {
      setSelectedCaptionIds(plan.selectedCaptionIds ?? []);
      if (plan.status) {
        setStatus(plan.status);
      }
    }
  };

  const handleImportCaptionSidecar = () => {
    captionFileInputRef.current?.click();
  };

  const handleCaptionSidecarFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) {
      return;
    }

    const requestGeneration = projectReplacementGenerationRef.current;
    try {
      const content = await file.text();
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        setStatus('Caption sidecar import ignored because the project changed');
        return;
      }

      const filename = file.name.toLowerCase();
      const format = filename.endsWith('.vtt') ? 'vtt' : filename.endsWith('.srt') ? 'srt' : 'auto';
      const parsed = parseCaptionSidecar(content, format);
      const plan = resolveCaptionSidecarImportPlan({ parsed, filename: file.name });

      if (!plan.canImport) {
        setStatus(plan.status);
        return;
      }

      commitProject(plan.commitLabel, (current) => importCaptionSegments(current, plan.captions, 'replace'));
      setSelectedCaptionIds(plan.selectedCaptionIds);
      setStatus(plan.status);
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setStatus(formatCaptionImportFailureStatus(error));
    }
  };

  const handleAddMarkerAtPlayhead = () => {
    const plan = resolveAddTimelineMarkerPlan({ time: playhead, label: markerLabel });
    commitProject(plan.commitLabel, (current) => addMarker(current, plan.time!, plan.label!));
  };

  const handleMarkerPatch = (markerId: string, patch: Parameters<typeof updateMarker>[2]) => {
    const plan = resolveUpdateTimelineMarkerPlan({ markerId, patch });
    commitProject(plan.commitLabel, (current) => updateMarker(current, plan.markerId!, plan.patch!));
  };

  const handleTimelineMarkerPointerDown = (event: ReactPointerEvent<HTMLSpanElement>, marker: TimelineMarker) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const requestGeneration = projectReplacementGenerationRef.current;
    const dragStartPlan = resolveTimelineMarkerDragStartPlan({
      marker,
      pointerX: event.clientX,
      scrollLeft: timelineScrollRef.current?.scrollLeft ?? 0,
    });
    setActiveMonitor(dragStartPlan.activeMonitor);

    markerDragRef.current = dragStartPlan.dragState;
    setMarkerTimePreview(dragStartPlan.markerTimePreview);
    showTimelineEditGuide(dragStartPlan.editGuide);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      const drag = markerDragRef.current;
      if (!drag) {
        return;
      }

      const currentScrollLeft = applyTimelineEdgeAutoScroll(moveEvent.clientX);
      const movePlan = resolveTimelineMarkerDragMovePlan({
        dragState: drag,
        currentClientX: moveEvent.clientX,
        currentScrollLeft,
        pixelsPerSecond,
        duration: project.duration,
        fps: project.fps,
      });
      markerDragRef.current = movePlan.dragState;
      setMarkerTimePreview(movePlan.markerTimePreview);
      showTimelineEditGuide(movePlan.editGuide);
    };

    const handlePointerUp = () => {
      const drag = markerDragRef.current;
      markerDragRef.current = null;
      setMarkerTimePreview(null);
      showTimelineEditGuide(null);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);

      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      if (drag) {
        const plan = resolveDraggedTimelineMarkerCommitPlan({
          markerId: drag.markerId,
          moved: drag.moved,
          nextTime: drag.nextTime,
          duration: project.duration,
        });
        if (!plan.canCommit) {
          return;
        }

        const committed = commitProject(plan.commitLabel, (current) => updateMarker(current, plan.markerId, plan.patch));
        if (committed) {
          setPlayhead(plan.nextPlayhead);
        }
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleMoveMarkerToPlayhead = (markerId: string) => {
    const plan = resolveMoveTimelineMarkerToPlayheadPlan({ markerId, playhead });
    commitProject(plan.commitLabel, (current) => updateMarker(current, plan.markerId!, plan.patch!));
  };

  const handleDeleteMarker = (markerId: string) => {
    const plan = resolveDeleteTimelineMarkerPlan(markerId);
    commitProject(plan.commitLabel, (current) => deleteMarker(current, plan.markerId!));
  };

  const handleJumpToMarker = (markerId: string) => {
    const plan = resolveJumpToTimelineMarkerPlan({ markers: project.markers, markerId });
    if (!plan.canJump) {
      setStatus(plan.status);
      return;
    }

    setTimelinePlayhead(plan.time);
    setStatus(plan.status);
  };

  const handleJumpAdjacentMarker = (direction: 'previous' | 'next') => {
    const plan = resolveJumpAdjacentTimelineMarkerPlan({ project, playhead, direction });
    if (!plan.canJump) {
      setStatus(plan.status);
      return;
    }

    setTimelinePlayhead(plan.time);
    setStatus(plan.status);
  };

  const handleDeleteSide = (side: 'left' | 'right') => {
    const plan = resolveDeleteClipSidePlan({
      selectedClip,
      playhead,
      side,
    });
    if (!plan.canCommit) {
      setStatus(plan.status);
      return;
    }

    commitProject(plan.commitLabel, (current) => {
      if (linkedClipEditsEnabled) {
        return trimLinkedClipToTime(current, plan.clipId, plan.edge, playhead);
      }

      const currentClip = findClip(current, plan.clipId);
      if (!currentClip) {
        throw new Error('Clip not found.');
      }
      const delta = plan.edge === 'start'
        ? playhead - currentClip.start
        : playhead - (currentClip.start + currentClip.duration);
      return trimClip(current, plan.clipId, plan.edge, delta);
    });
  };

  // One source of truth for "can I split here". The button used to be enabled
  // whenever anything was selected, while the plan additionally requires the
  // playhead to sit inside a clip — so Split looked available, and clicking it
  // only produced "Move the playhead inside a clip before splitting". The
  // control and the command now read the same plan.
  const splitAtPlayheadPlan = useMemo(() => resolveSplitClipAtPlayheadPlan({
    selectedClip,
    selectedClips,
    selectedClipIds,
    activeTimelineClip,
    playhead,
    fps: project.fps,
  }), [activeTimelineClip, playhead, project.fps, selectedClip, selectedClipIds, selectedClips]);

  const handleSplit = () => {
    const plan = splitAtPlayheadPlan;
    if (!plan.canSplit) {
      setStatus(plan.status);
      return;
    }

    setSelectedClipId(plan.nextSelectedClipId);
    setSelectedTrackId(plan.nextSelectedTrackId);
    if (plan.mode === 'selected') {
      commitProject(plan.commitLabel, (current) => (
        linkedClipEditsEnabled
          ? splitClipsAtTime(current, plan.targetClipIds, playhead)
          : plan.targetClipIds.reduce((nextProject, clipId) => splitClipAtTime(nextProject, clipId, playhead), current)
      ));
      return;
    }

    commitProject(plan.commitLabel, (current) => (
      linkedClipEditsEnabled
        ? splitLinkedClipAtTime(current, plan.targetClipId!, playhead)
        : splitClipAtTime(current, plan.targetClipId!, playhead)
    ));
  };

  const handleSplitAll = () => {
    const plan = resolveSplitAllClipsAtPlayheadPlan({
      playhead,
      fps: project.fps,
    });
    commitProject(plan.commitLabel, (current) => (
      splitAllClipsAtTime(current, playhead)
    ));
  };

  const handleClipEdit = (label: string, edit: (project: EditorProject, clipId: string) => EditorProject) => {
    const plan = resolveSelectedClipEditPlan({ selectedClip, label });
    if (!plan.canCommit) {
      setStatus(plan.status);
      return;
    }

    commitProject(plan.commitLabel, (current) => edit(current, plan.targetClipIds[0]));
  };

  const handleDuplicateSelectedClips = () => {
    const plan = resolveDuplicateSelectedClipsPlan(selectedClips);
    if (!plan.canCommit) {
      setStatus(plan.status);
      return;
    }

    let duplicateState = resolveDuplicatedClipSelectionState({
      previousProject: project,
      nextProject: project,
      fallbackPrimaryClipId: selectedClipId,
      fallbackTrackId: selectedTrackId,
      fallbackPlayhead: playhead,
    });
    const committed = commitProject(plan.commitLabel, (current) => {
      const nextProject = duplicateClips(current, plan.targetClipIds);
      duplicateState = resolveDuplicatedClipSelectionState({
        previousProject: current,
        nextProject,
        fallbackPrimaryClipId: selectedClipId,
        fallbackTrackId: selectedTrackId,
        fallbackPlayhead: playhead,
      });
      return nextProject;
    });

    if (committed && duplicateState.duplicatedClipIds.length > 0) {
      setSelectedClipIds(duplicateState.duplicatedClipIds);
      setSelectedClipId(duplicateState.nextPrimaryClipId);
      setSelectedTrackId(duplicateState.nextTrackId);
      setTimelinePlayhead(duplicateState.nextPlayhead);
      setStatus(duplicateState.status);
    }
  };

  const handleClipPatch = (label: string, patch: Parameters<typeof updateClip>[2]) => {
    handleClipEdit(label, (current, id) => updateClip(current, id, patch));
  };

  const handleComfyUIBindingPatch = (patch: ComfyUIWorkflowBindingPatch) => {
    const plan = resolveComfyUIBindingPatchPlan(selectedClip);
    if (!plan.canCommit || !plan.clipId || !plan.commitLabel) {
      setStatus(plan.status);
      return;
    }

    const committed = commitProject(plan.commitLabel, (current) => (
      updateClipComfyUIBinding(current, plan.clipId!, patch)
    ));
    if (committed) {
      setStatus(plan.status);
    }
  };

  const handleComfyUIPresetChange = (presetId: string) => {
    const preset = listComfyUIWorkflowPresets(project).find((item) => item.id === presetId);
    const plan = resolveComfyUIPresetChangePlan({
      selectedClip,
      presetId,
      presetLabel: preset?.label,
    });
    if (!plan.canCommit || !plan.clipId || !plan.commitLabel || !plan.presetId) {
      setStatus(plan.status);
      return;
    }

    const committed = commitProject(plan.commitLabel, (current) => (
      applyComfyUIWorkflowPresetToClip(current, plan.clipId!, plan.presetId!)
    ));
    if (committed) {
      setStatus(plan.status);
    }
  };

  const handleSelectedClipsPatch = (label: string, patch: Parameters<typeof updateClips>[2]) => {
    const plan = resolveSelectedClipsPatchPlan({ selectedClips, label });
    if (!plan.canCommit) {
      setStatus(plan.status);
      return;
    }

    commitProject(plan.commitLabel, (current) => (
      updateClips(current, plan.targetClipIds, patch)
    ));
  };

  const handleAddTitleAtPlayhead = () => {
    let nextSelection = null as ReturnType<typeof resolveCreatedTimelineClipSelection>;
    const committed = commitProject('Title clip added', (current) => {
      const plan = resolveAddTitleClipPlan({
        project: current,
        selectedTrackId,
        fallbackTrackId: sourcePrimaryPatchTrackId,
      });
      const nextProject = addTitleClip(current, {
        text: titleTextDraft,
        start: playhead,
        duration: 5,
        targetTrackId: plan.targetTrackId,
      });
      nextSelection = resolveCreatedTimelineClipSelection({
        previousProject: current,
        nextProject,
        kind: 'text',
      });

      return nextProject;
    });

    if (committed && nextSelection) {
      setPrimarySelection(nextSelection.clipId);
      setSelectedTrackId(nextSelection.trackId);
      setActiveMonitor(nextSelection.activeMonitor);
    }
  };

  const handleAddAdjustmentLayerAtPlayhead = () => {
    let nextSelection = null as ReturnType<typeof resolveCreatedClipSelection>;
    let nextStatus = '';
    const committed = commitProject('Adjustment layer added', (current) => {
      const plan = resolveAddAdjustmentLayerPlan({ project: current, playhead });
      const result = addAdjustmentLayerAtTime(current, {
        start: plan.start,
        duration: plan.duration,
      });
      nextSelection = resolveCreatedClipSelection({ clip: result.clip });
      nextStatus = plan.status;
      return result.project;
    });

    if (committed && nextSelection) {
      setPrimarySelection(nextSelection.clipId);
      setSelectedTrackId(nextSelection.trackId);
      setActiveMonitor(nextSelection.activeMonitor);
      setStatus(nextStatus);
    }
  };

  const handleTitleTextPatch = (text: string) => {
    const plan = resolveTitleTextPatchPlan({ selectedClip });
    if (!plan.canCommit) {
      setStatus(plan.status);
      return;
    }

    commitProject(plan.commitLabel, (current) => updateTitleClipText(current, plan.clipId, text));
  };

  const handleTitleStylePatch = (patch: CaptionStyle) => {
    const plan = resolveTitleStylePatchPlan({ selectedClip, selectedIsTitleClip });
    if (!plan.canCommit) {
      setStatus(plan.status);
      return;
    }

    commitProject(plan.commitLabel, (current) => applyTitleStyle(current, plan.clipId, patch));
  };

  const handleRetimeSpeedChange = (value: number) => {
    if (!selectedClip) {
      setStatus('Select a clip first');
      return;
    }

    let nextPlayhead = playhead;
    const committed = commitProject('Clip retimed', (current) => {
      const currentClip = findClip(current, selectedClip.id);
      if (!currentClip) {
        throw new Error('Clip not found.');
      }

      const nextProject = retimeLinkedClipToSpeed(current, currentClip.id, value, {
        ripple: rippleMode,
        preventOverlap: !rippleMode,
      });
      const nextClip = findClip(nextProject, currentClip.id);
      if (nextClip) {
        nextPlayhead = roundTime(clampNumber(playhead, nextClip.start, nextClip.start + nextClip.duration));
      }

      return nextProject;
    });

    if (committed) {
      setTimelinePlayhead(nextPlayhead);
    }
  };

  const handleApplySpeedRamp = (presetId: SpeedRampPresetId) => {
    const plan = resolveClipBatchCommandPlan({
      selectedClipCount: selectedClips.length,
      targetClipIds: selectedClips.map((clip) => clip.id),
      commitLabel: 'Speed ramp applied',
      statusAction: 'Speed ramp applied',
    });
    if (!plan.canApply || !plan.commitLabel) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    let updatedCount = 0;
    const committed = commitProject(plan.commitLabel, (current) => {
      const result = applySpeedRampPresetToClips(current, plan.targetClipIds, presetId);
      updatedCount = result.updatedClipIds.length;
      return result.project;
    });
    if (committed) {
      setStatus(formatClipBatchStatus(plan.statusAction ?? 'Speed ramp applied', { updatedCount, skippedCount: 0 }));
    }
  };

  const handleClearSpeedRamp = () => {
    const plan = resolveClipBatchCommandPlan({
      selectedClipCount: selectedClips.length,
      targetClipIds: selectedClips.map((clip) => clip.id),
      commitLabel: 'Speed ramp cleared',
      statusAction: 'Speed ramp cleared',
    });
    if (!plan.canApply || !plan.commitLabel) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    let updatedCount = 0;
    const committed = commitProject(plan.commitLabel, (current) => {
      const result = clearSpeedRampFromClips(current, plan.targetClipIds);
      updatedCount = result.updatedClipIds.length;
      return result.project;
    });
    if (committed) {
      setStatus(formatClipBatchStatus(plan.statusAction ?? 'Speed ramp cleared', { updatedCount, skippedCount: 0 }, 'on'));
    }
  };

  const handleInspectorStartChange = (value: number) => {
    const plan = resolveInspectorClipStartChangePlan({ selectedClip });
    if (!plan.canCommit) {
      setStatus(plan.status);
      return;
    }

    let nextPlayhead = playhead;
    const committed = commitProject(plan.commitLabel, (current) => {
      const result = resolveInspectorClipStartChangeResult({
        project: current,
        clipId: plan.clipId,
        value,
        snapEnabled,
        includeLinked: linkedClipEditsEnabled,
      });
      nextPlayhead = result.nextPlayhead;

      return moveClips(current, result.targetClipIds, result.appliedDelta, { preventOverlap: true });
    });

    if (committed) {
      setTimelinePlayhead(nextPlayhead);
    }
  };

  const handleInspectorDurationChange = (value: number) => {
    const plan = resolveInspectorClipDurationChangePlan({ selectedClip });
    if (!plan.canCommit) {
      setStatus(plan.status);
      return;
    }

    let nextPlayhead = playhead;
    const committed = commitProject(plan.commitLabel, (current) => {
      const result = resolveInspectorClipDurationChangeResult({
        project: current,
        clipId: plan.clipId,
        value,
        rippleMode,
        includeLinked: linkedClipEditsEnabled,
      });
      nextPlayhead = result.nextPlayhead;

      if (linkedClipEditsEnabled) {
        return trimLinkedClipToTime(current, plan.clipId, 'end', result.nextEnd, result.trimOptions);
      }

      const currentClip = findClip(current, plan.clipId);
      if (!currentClip) {
        throw new Error('Clip not found.');
      }
      return trimClip(current, plan.clipId, 'end', result.nextEnd - (currentClip.start + currentClip.duration));
    });

    if (committed) {
      setTimelinePlayhead(nextPlayhead);
    }
  };

  const handleApplyTransition = (type: Exclude<TimelineTransition['type'], 'cut' | 'match-cut'>) => {
    const transitionLabel = transitionTypeLabel(type);
    const plan = resolveClipBatchCommandPlan({
      selectedClipCount: selectedClips.length,
      targetClipIds: selectedClips.map((clip) => clip.id),
      commitLabel: `${transitionLabel} applied`,
      statusAction: `${transitionLabel} applied`,
    });
    if (!plan.canApply || !plan.commitLabel) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    let updatedCount = 0;
    let skippedCount = 0;
    const committed = commitProject(plan.commitLabel, (current) => {
      const result = applyTransitionToClips(current, plan.targetClipIds, type, { autoOverlap: true });
      updatedCount = result.updatedClipIds.length;
      skippedCount = result.skipped.length;
      return result.project;
    });
    if (committed) {
      setStatus(formatClipBatchStatus(plan.statusAction ?? `${transitionLabel} applied`, { updatedCount, skippedCount }));
    }
  };

  const handleTransitionPatch = (patch: Parameters<typeof updateClipTransition>[2]) => {
    const plan = resolveClipBatchCommandPlan({
      selectedClipCount: selectedClips.length,
      targetClipIds: selectedClips.map((clip) => clip.id),
      commitLabel: 'Transition updated',
      statusAction: 'Transition updated',
    });
    if (!plan.canApply || !plan.commitLabel) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    let updatedCount = 0;
    let skippedCount = 0;
    const committed = commitProject(plan.commitLabel, (current) => {
      const result = updateClipTransitionForClips(current, plan.targetClipIds, patch, { autoOverlap: true });
      updatedCount = result.updatedClipIds.length;
      skippedCount = result.skipped.length;
      return result.project;
    });
    if (committed) {
      setStatus(formatClipBatchStatus(plan.statusAction ?? 'Transition updated', { updatedCount, skippedCount }, 'on'));
    }
  };

  const handleTimelineTransitionDurationDrag = (clip: TimelineClip, duration: number) => {
    const nextDuration = roundTime(Math.max(0.05, duration));
    const committed = commitProject('Transition duration dragged', (current) => (
      updateClipTransition(current, clip.id, { duration: nextDuration }, { autoOverlap: true })
    ));

    if (committed) {
      setPrimarySelection(clip.id);
      setSelectedTrackId(clip.trackId);
      setTimelinePlayhead(roundTime(clip.start + Math.max(0, clip.duration - nextDuration)));
    }
  };

  const handleRemoveTransition = () => {
    const plan = resolveClipBatchCommandPlan({
      selectedClipCount: selectedClips.length,
      targetClipIds: selectedClips.map((clip) => clip.id),
      commitLabel: 'Transition removed',
      statusAction: 'Transition removed',
    });
    if (!plan.canApply || !plan.commitLabel) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    let updatedCount = 0;
    let skippedCount = 0;
    const committed = commitProject(plan.commitLabel, (current) => {
      const result = removeClipTransitionFromClips(current, plan.targetClipIds);
      updatedCount = result.updatedClipIds.length;
      skippedCount = result.skipped.length;
      return result.project;
    });
    if (committed) {
      setStatus(formatClipBatchStatus(plan.statusAction ?? 'Transition removed', { updatedCount, skippedCount }, 'from'));
    }
  };

  const handleMotionTransformPatch = (patch: Partial<ClipMotionTransform>) => {
    const plan = resolveMotionTransformPatchPlan({
      selectedClip,
      canUseMotion: selectedCanUseMotion,
      motionEffect: selectedMotionEffect,
    });
    if (!plan.canApply || !plan.clipId || !plan.commitLabel) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    const parameters = normalizeMotionTransformPatch(patch);
    commitProject(plan.commitLabel, (current) => {
      const currentClip = findClip(current, plan.clipId!);
      if (!currentClip) {
        throw new Error('Clip not found.');
      }

      const currentMotionEffect = findMotionTransformEffect(currentClip);
      if (currentMotionEffect) {
        return updateClipEffectParameters(
          currentMotionEffect.enabled ? current : toggleClipEffect(current, plan.clipId!, currentMotionEffect.id),
          plan.clipId!,
          currentMotionEffect.id,
          { ...parameters },
        );
      }

      const effect: ClipEffect = {
        id: `effect-motion-transform-${Date.now()}`,
        type: 'motion',
        label: MOTION_TRANSFORM_EFFECT_LABEL,
        enabled: true,
        parameters: {
          ...buildDefaultMotionTransformParameters(),
          ...parameters,
        },
      };

      return addClipEffect(current, plan.clipId!, effect);
    });
  };

  const handleProgramMotionDragCommit = (clipId: string, patch: ProgramMotionPatch) => {
    const targetClip = allClips.find((clip) => clip.id === clipId);
    const targetAsset = targetClip?.assetId ? assetById.get(targetClip.assetId) : undefined;
    const plan = resolveProgramMonitorMotionPatchPlan({
      clip: targetClip,
      asset: targetAsset,
    });
    if (!plan.canApply || !plan.clipId || !plan.trackId || !plan.commitLabel) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    const parameters = normalizeMotionTransformPatch(patch);
    const committed = commitProject(plan.commitLabel, (current) => {
      const currentClip = findClip(current, plan.clipId!);
      if (!currentClip) {
        throw new Error('Clip not found.');
      }

      if (plan.mode === 'update' && plan.effectId) {
        return updateClipEffectParameters(
          plan.effectEnabled ? current : toggleClipEffect(current, plan.clipId!, plan.effectId!),
          plan.clipId!,
          plan.effectId!,
          { ...parameters },
        );
      }

      const effect: ClipEffect = {
        id: `effect-motion-transform-${Date.now()}`,
        type: 'motion',
        label: MOTION_TRANSFORM_EFFECT_LABEL,
        enabled: true,
        parameters: {
          ...buildDefaultMotionTransformParameters(),
          ...parameters,
        },
      };

      return addClipEffect(current, plan.clipId!, effect);
    });

    if (committed) {
      setSelectedClipId(plan.clipId);
      setSelectedTrackId(plan.trackId);
      setStatus(plan.status ?? 'Program monitor motion adjusted');
    }
  };

  const handleProgramCropDragCommit = (clipId: string, patch: ProgramCropPatch) => {
    const targetClip = allClips.find((clip) => clip.id === clipId);
    const targetAsset = targetClip?.assetId ? assetById.get(targetClip.assetId) : undefined;
    const plan = resolveProgramMonitorCropPatchPlan({
      clip: targetClip,
      asset: targetAsset,
      trackLocked: targetClip ? Boolean(project.tracks.find((track) => track.id === targetClip.trackId)?.locked) : false,
    });
    if (!plan.canApply || !plan.clipId || !plan.trackId || !plan.commitLabel) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    const parameters = normalizeCropMaskParameters(patch);
    const committed = commitProject(plan.commitLabel, (current) => {
      const currentClip = findClip(current, plan.clipId!);
      if (!currentClip) {
        throw new Error('Clip not found.');
      }

      if (plan.mode === 'update' && plan.effectId) {
        return updateClipEffectParameters(
          plan.effectEnabled ? current : toggleClipEffect(current, plan.clipId!, plan.effectId!),
          plan.clipId!,
          plan.effectId!,
          { ...parameters },
        );
      }

      const effect: ClipEffect = {
        id: `effect-crop-mask-${Date.now()}`,
        type: 'mask',
        label: CROP_MASK_EFFECT_LABEL,
        enabled: true,
        parameters: { ...parameters },
      };

      return addClipEffect(current, plan.clipId!, effect);
    });

    if (committed) {
      setSelectedClipId(plan.clipId);
      setSelectedTrackId(plan.trackId);
      setStatus(plan.status ?? 'Program monitor crop adjusted');
    }
  };

  const handleProgramMotionNudge = (deltaX: number, deltaY: number) => {
    if (!selectedClip || !selectedCanUseProgramMonitorMotion) {
      return false;
    }

    const currentMotion = readClipMotionTransform(selectedClip);
    handleProgramMotionDragCommit(selectedClip.id, {
      positionX: roundTime(currentMotion.positionX + deltaX),
      positionY: roundTime(currentMotion.positionY + deltaY),
    });
    return true;
  };

  const handleResetMotionTransform = () => {
    handleMotionTransformPatch(buildDefaultMotionTransformParameters());
  };

  const handleApplyMotionPreset = (presetId: MotionPresetId) => {
    const preset = MOTION_PRESETS.find((item) => item.id === presetId);
    const plan = resolveNamedPresetClipBatchPlan({
      selectedClipCount: selectedClips.length,
      canApply: selectedCanApplyMotionPreset,
      unavailableStatus: 'Motion presets are available for visual clips',
      targetClipIds: selectedClips.map((clip) => clip.id),
      presetLabel: preset?.label,
      commitPrefix: 'Motion preset',
      fallbackCommitLabel: 'Motion preset applied',
      statusAction: 'Motion preset applied',
    });
    if (!plan.canApply || !plan.commitLabel) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    let updatedCount = 0;
    let skippedCount = 0;
    const committed = commitProject(
      plan.commitLabel,
      (current) => {
        const result = applyMotionPresetToClips(current, plan.targetClipIds, presetId);
        updatedCount = result.updatedClipIds.length;
        skippedCount = result.skipped.length;
        return result.project;
      },
    );
    if (committed) {
      setStatus(formatClipBatchStatus(plan.statusAction ?? 'Motion preset applied', { updatedCount, skippedCount }));
    }
  };

  const handleKeyframeDraftPropertyChange = (property: ClipKeyframe['property']) => {
    setKeyframeDraft((current) => ({
      ...current,
      property,
      value: defaultKeyframeValue(property, selectedClip),
    }));
  };

  const handleAddKeyframeAtPlayhead = () => {
    handleClipEdit('Keyframe added', (current, id) => (
      addClipKeyframe(current, id, keyframeDraft.property, selectedClipLocalTime, keyframeDraft.value, keyframeDraft.easing)
    ));
  };

  const handleKeyframePatch = (keyframeId: string, patch: Parameters<typeof updateClipKeyframe>[3]) => {
    handleClipEdit('Keyframe updated', (current, id) => updateClipKeyframe(current, id, keyframeId, patch));
  };

  const handleTimelineKeyframeTimeDrag = (clip: TimelineClip, keyframeId: string, time: number) => {
    const nextTime = roundTime(clampNumber(time, 0, clip.duration));
    const committed = commitProject('Timeline keyframe moved', (current) => (
      updateClipKeyframe(current, clip.id, keyframeId, { time: nextTime })
    ));

    if (committed) {
      setPrimarySelection(clip.id);
      setSelectedTrackId(clip.trackId);
      setTimelinePlayhead(roundTime(clip.start + nextTime));
    }
  };

  const handleTimelineClipVolumeDrag = (clip: TimelineClip, volume: number) => {
    const nextVolume = normalizeClipVolume(volume);
    const committed = commitProject('Timeline clip volume adjusted', (current) => (
      updateClip(current, clip.id, { volume: nextVolume })
    ));

    if (committed) {
      setPrimarySelection(clip.id);
      setSelectedTrackId(clip.trackId);
      setStatus(`Timeline clip volume ${nextVolume.toFixed(2)}`);
    }
  };

  const handleDeleteKeyframe = (keyframeId: string) => {
    handleClipEdit('Keyframe deleted', (current, id) => deleteClipKeyframe(current, id, keyframeId));
  };

  const handleTrimToPlayhead = (
    edge: 'start' | 'end',
    targetClip: TimelineClip | null | undefined = timelinePlayheadEditTargetClip,
    forceRipple = false,
  ) => {
    const plan = resolveTrimClipToPlayheadPlan({
      selectedClip: targetClip,
      playhead,
      edge,
    });
    if (!plan.canCommit) {
      setStatus(plan.status);
      return;
    }

    commitProject(plan.commitLabel, (current) => {
      if (linkedClipEditsEnabled) {
        return trimLinkedClipToTime(current, plan.clipId, plan.edge, playhead, { ripple: forceRipple || rippleMode });
      }

      const currentClip = findClip(current, plan.clipId);
      if (!currentClip) {
        throw new Error('Clip not found.');
      }
      const delta = plan.edge === 'start'
        ? playhead - currentClip.start
        : playhead - (currentClip.start + currentClip.duration);
      return trimClip(current, plan.clipId, plan.edge, delta);
    });
    if (targetClip && selectedClipIds.length === 0) {
      setSelectedClipId(targetClip.id);
      setSelectedClipIds([targetClip.id]);
      setSelectedTrackId(targetClip.trackId);
    }
  };

  const handleMoveSelected = (deltaSeconds: number) => {
    const plan = resolveMoveSelectedClipsPlan({
      project,
      selectedClip,
      selectedClips,
      deltaSeconds,
      snapEnabled,
      includeLinked: linkedClipEditsEnabled,
    });
    if (!plan.canCommit) {
      setStatus(plan.status);
      return;
    }

    const committed = commitProject(plan.commitLabel, (current) => (
      moveClips(current, plan.targetClipIds, plan.appliedDelta ?? 0, { preventOverlap: true })
    ));

    if (committed) {
      setTimelinePlayhead(plan.nextPlayhead);
    }
  };

  const handleMoveSelectionToPlayhead = () => {
    const plan = resolveMoveSelectionToPlayheadPlan({
      project,
      selectedClips,
      playhead,
      includeLinked: linkedClipEditsEnabled,
    });
    if (!plan.canCommit) {
      setStatus(plan.status);
      return;
    }

    const committed = commitProject(plan.commitLabel, (current) => (
      moveClipsToTime(current, plan.targetClipIds, plan.nextPlayhead, { preventOverlap: true })
    ));

    if (committed) {
      setTimelinePlayhead(plan.nextPlayhead);
    }
  };

  const handleMoveSelectedClipsToTrack = (targetTrackId: string) => {
    const plan = resolveMoveSelectedClipsToTrackPlan({
      selectedClips,
      tracks: project.tracks,
      targetTrackId,
    });
    if (!plan.canCommit) {
      setStatus(plan.status);
      return;
    }

    const committed = commitProject(
      plan.commitLabel,
      (current) => moveClipsToTrack(current, plan.targetClipIds, plan.targetTrackId!),
    );

    if (committed) {
      setSelectedTrackId(plan.targetTrackId!);
      if (plan.status) {
        setStatus(plan.status);
      }
    }
  };

  const handleSlipSelected = (deltaSeconds: number) => {
    const plan = resolveSlipSelectedClipPlan({ selectedClip, deltaSeconds });
    if (!plan.canCommit) {
      setStatus(plan.status);
      return;
    }

    commitProject(plan.commitLabel, (current) => slipLinkedClip(current, plan.clipId, plan.deltaSeconds ?? 0));
  };

  const handleTimelineSlipDrag = (clip: TimelineClip, deltaSeconds: number) => {
    const plan = resolveTimelineSlipDragPlan({ clip, deltaSeconds });
    if (!plan.canCommit) {
      setStatus(plan.status);
      return;
    }

    const committed = commitProject(plan.commitLabel, (current) => slipLinkedClip(current, plan.clipId, plan.deltaSeconds ?? 0));
    if (committed) {
      setPrimarySelection(plan.nextSelectedClipId ?? plan.clipId);
      setSelectedTrackId(plan.nextSelectedTrackId ?? clip.trackId);
    }
  };

  const handleRollTrimSelected = (edge: 'start' | 'end', deltaSeconds: number) => {
    const plan = resolveRollTrimSelectedClipPlan({
      selectedClip,
      edge,
      deltaSeconds,
    });
    if (!plan.canCommit) {
      setStatus(plan.status);
      return;
    }

    commitProject(plan.commitLabel, (current) => (
      rollTrimLinkedClip(current, plan.clipId, plan.edge!, plan.deltaSeconds ?? 0)
    ));
  };

  const handleTimelineRollTrimDrag = (clip: TimelineClip, edge: 'start' | 'end', deltaSeconds: number) => {
    const plan = resolveTimelineRollTrimDragPlan({ clip, edge, deltaSeconds });
    if (!plan.canCommit) {
      setStatus(plan.status);
      return;
    }

    let nextPlayhead = plan.nextPlayhead ?? clip.start;
    const committed = commitProject(plan.commitLabel, (current) => {
      const nextProject = rollTrimLinkedClip(current, plan.clipId, plan.edge!, plan.deltaSeconds ?? 0);
      nextPlayhead = resolveTimelineRollTrimDragResult({
        project: nextProject,
        clipId: plan.clipId,
        edge: plan.edge!,
        fallbackPlayhead: nextPlayhead,
      });
      return nextProject;
    });

    if (committed) {
      setPrimarySelection(plan.nextSelectedClipId ?? plan.clipId);
      setSelectedTrackId(plan.nextSelectedTrackId ?? clip.trackId);
      setTimelinePlayhead(nextPlayhead);
    }
  };

  const handleSlideSelected = (deltaSeconds: number) => {
    const plan = resolveSlideSelectedClipPlan({ selectedClip, deltaSeconds });
    if (!plan.canCommit) {
      setStatus(plan.status);
      return;
    }

    commitProject(plan.commitLabel, (current) => slideLinkedClip(current, plan.clipId, plan.deltaSeconds ?? 0));
  };

  const handleTimelineSlideDrag = (clip: TimelineClip, deltaSeconds: number) => {
    const plan = resolveTimelineSlideDragPlan({ clip, deltaSeconds });
    if (!plan.canCommit) {
      setStatus(plan.status);
      return;
    }

    let nextStart = plan.nextPlayhead ?? clip.start;
    const committed = commitProject(plan.commitLabel, (current) => {
      const nextProject = slideLinkedClip(current, plan.clipId, plan.deltaSeconds ?? 0);
      nextStart = resolveTimelineSlideDragResult({
        project: nextProject,
        clipId: plan.clipId,
        fallbackPlayhead: nextStart,
      });
      return nextProject;
    });
    if (committed) {
      setPrimarySelection(plan.nextSelectedClipId ?? plan.clipId);
      setSelectedTrackId(plan.nextSelectedTrackId ?? clip.trackId);
      setTimelinePlayhead(nextStart);
    }
  };

  const handleLinkedAudioSplitEdit = (edge: 'start' | 'end', deltaSeconds: number) => {
    const plan = resolveLinkedAudioSplitEditPlan({
      selectedClip,
      selectedCanRelinkAudio,
      edge,
      deltaSeconds,
    });
    if (!plan.canCommit) {
      setStatus(plan.status);
      return;
    }

    commitProject(plan.commitLabel, (current) => applyLinkedAudioSplitEdit(current, plan.clipId, plan.edge!, plan.deltaSeconds ?? 0));
  };

  const handleToggleSelectedClipState = (state: 'muted' | 'locked') => {
    const plan = resolveToggleSelectedClipStatePlan({ selectedClips, state });
    if (!plan.canCommit) {
      setStatus(plan.status);
      return;
    }

    commitProject(plan.commitLabel, (current) => toggleClipsState(current, plan.targetClipIds, plan.state));
  };

  const handleDetachSelectedAudio = () => {
    const plan = resolveDetachSelectedAudioPlan({ selectedClip });
    if (!plan.canCommit) {
      setStatus(plan.status);
      return;
    }

    commitProject(plan.commitLabel, (current) => detachEmbeddedAudio(current, plan.clipId!));
    setPrimarySelection(plan.nextSelectedClipId);
  };

  const handleRelinkSelectedAudio = () => {
    const plan = resolveRelinkSelectedAudioPlan({ selectedClip });
    if (!plan.canCommit) {
      setStatus(plan.status);
      return;
    }

    commitProject(plan.commitLabel, (current) => relinkDetachedAudio(current, plan.clipId!));
    setPrimarySelection(plan.nextSelectedClipId);
  };

  const handleUnlinkSelectedAudio = () => {
    const plan = resolveUnlinkSelectedAudioPlan({ selectedClip });
    if (!plan.canCommit) {
      setStatus(plan.status);
      return;
    }

    commitProject(plan.commitLabel, (current) => unlinkLinkedClips(current, plan.clipId!));
    setPrimarySelection(plan.nextSelectedClipId);
  };

  const handleLinkSelectedAudio = () => {
    const plan = resolveLinkSelectedAudioPlan({ selectedLinkPair });
    if (!plan.canCommit) {
      setStatus(plan.status);
      return;
    }

    commitProject(plan.commitLabel, (current) => (
      linkAudioVideoClips(current, plan.videoClipId!, plan.audioClipId!)
    ));
    setSelectedClipId(plan.nextSelectedClipId);
    setSelectedClipIds(plan.nextSelectedClipIds ?? [plan.nextSelectedClipId]);
  };

  const handleSyncSelectedAudioByWaveform = (linkAfterSync = false) => {
    const plan = resolveWaveformSyncSelectedAudioPlan({ selectedAudioSyncPair, linkAfterSync });
    if (!plan.canCommit) {
      setStatus(plan.status);
      return;
    }

    const projectForSync = applyRuntimeWaveformsToProject({
      project,
      assetIds: [plan.videoClipId, plan.audioClipId]
        .map((clipId) => findClip(project, clipId)?.assetId),
      audioPeaksByAssetId,
    });

    try {
      const result = linkAfterSync
        ? applyWaveformSyncAndLink(
          projectForSync,
          plan.videoClipId,
          plan.audioClipId,
          plan.options,
        )
        : applyWaveformSync(
          projectForSync,
          plan.videoClipId,
          plan.audioClipId,
          plan.options,
        );
      const committed = commitResolvedProject(plan.commitLabel, result.project);
      setLastAudioSyncPlan(result.plan);

      if (committed) {
        setSelectedClipId(plan.nextSelectedClipId);
        setSelectedClipIds(plan.nextSelectedClipIds);
        setPlayhead(Math.max(0, result.plan.targetStart));
      }

      setStatus(formatWaveformSyncStatus({ plan: result.plan, linkAfterSync }));
    } catch (error) {
      setLastAudioSyncPlan(null);
      setStatus(formatWaveformSyncFailureStatus(error));
    }
  };

  const handleAddEffectToSelectedClips = (
    label: string,
    targetClipIds: string[],
    buildEffect: (clip: TimelineClip, index: number, stamp: number) => ClipEffect,
  ) => {
    const plan = resolveAddClipEffectPlan({
      label,
      selectedClipCount: selectedClips.length,
      targetClipIds,
      stamp: Date.now(),
    });
    if (!plan.canApply || !plan.commitLabel || plan.stamp === undefined) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    let updatedCount = 0;
    let skippedCount = 0;
    const committed = commitProject(plan.commitLabel, (current) => {
      const result = addClipEffectToClips(
        current,
        plan.targetClipIds,
        (clip, index) => buildEffect(clip, index, plan.stamp!),
      );
      updatedCount = result.updatedClipIds.length;
      skippedCount = result.skipped.length;
      return result.project;
    });

    if (committed) {
      setStatus(formatAddClipEffectStatus(label, { updatedCount, skippedCount }));
    }
  };

  const handleAddCropMaskEffect = () => {
    handleAddEffectToSelectedClips('Crop mask', selectedCropMaskAddClipIds, (clip, index, stamp) => ({
      id: `effect-crop-mask-${stamp}-${clip.id}-${index}`,
      type: 'mask',
      label: 'Crop mask',
      enabled: true,
      parameters: { left: 0.05, right: 0.05, top: 0, bottom: 0 },
    }));
  };

  const handleApplyCropPreset = (presetId: CropMaskPresetId) => {
    const preset = CROP_MASK_PRESETS.find((item) => item.id === presetId);
    const plan = resolveNamedPresetClipBatchPlan({
      selectedClipCount: selectedClips.length,
      canApply: selectedCanApplyCropPreset,
      unavailableStatus: 'Crop presets are available for video and image clips',
      targetClipIds: selectedClips.map((clip) => clip.id),
      presetLabel: preset?.label,
      commitPrefix: 'Crop preset',
      fallbackCommitLabel: 'Crop preset applied',
      statusAction: 'Crop preset applied',
    });
    if (!plan.canApply || !plan.commitLabel) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    let updatedCount = 0;
    let skippedCount = 0;
    const committed = commitProject(
      plan.commitLabel,
      (current) => {
        const result = applyCropMaskPresetToClips(current, plan.targetClipIds, presetId);
        updatedCount = result.updatedClipIds.length;
        skippedCount = result.skipped.length;
        return result.project;
      },
    );
    if (committed) {
      setStatus(formatClipBatchStatus(plan.statusAction ?? 'Crop preset applied', { updatedCount, skippedCount }));
    }
  };

  const handleApplyStabilizePreset = (presetId: StabilizePresetId) => {
    const preset = STABILIZE_PRESETS.find((item) => item.id === presetId);
    const plan = resolveNamedPresetClipBatchPlan({
      selectedClipCount: selectedClips.length,
      canApply: selectedCanApplyStabilize,
      unavailableStatus: 'Stabilize presets are available for video clips',
      targetClipIds: selectedClips.map((clip) => clip.id),
      presetLabel: preset?.label,
      commitPrefix: 'Stabilize',
      fallbackCommitLabel: 'Stabilize preset applied',
      statusAction: 'Stabilize preset applied',
    });
    if (!plan.canApply || !plan.commitLabel) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    let updatedCount = 0;
    let skippedCount = 0;
    const committed = commitProject(
      plan.commitLabel,
      (current) => {
        const result = applyStabilizePresetToClips(current, plan.targetClipIds, presetId);
        updatedCount = result.updatedClipIds.length;
        skippedCount = result.skipped.length;
        return result.project;
      },
    );

    if (committed) {
      setStatus(formatClipBatchStatus(plan.statusAction ?? 'Stabilize preset applied', { updatedCount, skippedCount }));
    }
  };

  const handleAddColorEffect = () => {
    handleAddEffectToSelectedClips('Color correction', selectedColorEffectAddClipIds, (clip, index, stamp) => ({
      id: `effect-color-${stamp}-${clip.id}-${index}`,
      type: 'color',
      label: 'Color correction',
      enabled: true,
      parameters: { brightness: 0, contrast: 1, saturation: 1, gamma: 1 },
    }));
  };

  const handleAddColorMatchEffect = () => {
    handleAddEffectToSelectedClips('Color match', selectedColorPresetClipIds, (clip, index, stamp) => ({
      id: `effect-color-match-${stamp}-${clip.id}-${index}`,
      type: 'color',
      label: 'Color match',
      enabled: true,
      parameters: {
        brightness: 0.02,
        contrast: 1.06,
        saturation: 1.08,
        gamma: 1,
        temperature: 0,
        tint: 0,
      },
    }));
  };

  const handleApplyColorPreset = (presetId: ColorGradingPresetId) => {
    const preset = COLOR_GRADING_PRESETS.find((item) => item.id === presetId);
    const plan = resolveNamedPresetClipBatchPlan({
      selectedClipCount: selectedClips.length,
      canApply: selectedCanApplyColorPreset,
      unavailableStatus: 'Color presets are available for video and image clips',
      targetClipIds: selectedClips.map((clip) => clip.id),
      presetLabel: preset?.label,
      commitPrefix: 'Color preset',
      fallbackCommitLabel: 'Color preset applied',
      statusAction: 'Color preset applied',
    });
    if (!plan.canApply || !plan.commitLabel) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    let updatedCount = 0;
    let skippedCount = 0;
    const committed = commitProject(
      plan.commitLabel,
      (current) => {
        const result = applyColorGradingPresetToClips(current, plan.targetClipIds, presetId);
        updatedCount = result.updatedClipIds.length;
        skippedCount = result.skipped.length;
        return result.project;
      },
    );
    if (committed) {
      setStatus(formatClipBatchStatus(plan.statusAction ?? 'Color preset applied', { updatedCount, skippedCount }));
    }
  };

  const handleImportLutFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) {
      return;
    }

    const plan = resolveLutImportPlan({
      selectedClipCount: selectedClips.length,
      canApply: selectedCanApplyColorLut,
      targetClipIds: selectedColorPresetClipIds,
      fileName: file.name,
    });
    if (!plan.canApply || !plan.commitLabel) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    const requestGeneration = projectReplacementGenerationRef.current;
    try {
      const lut = await uploadLutFile(file);
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      let updatedCount = 0;
      let skippedCount = 0;
      const committed = commitProject(plan.commitLabel, (current) => {
        const result = applyColorLutToClips(current, plan.targetClipIds, {
          name: lut.originalName || file.name,
          source: lut.source,
          renderPath: lut.renderPath,
          interpolation: 'tetrahedral',
        });
        updatedCount = result.updatedClipIds.length;
        skippedCount = result.skipped.length;
        return result.project;
      });

      if (committed) {
        setStatus(formatLutImportStatus({ updatedCount, skippedCount }));
      }
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setStatus(formatLutImportFailureStatus(error));
    }
  };

  const handleApplyVisualFilterPreset = (presetId: VisualFilterPresetId) => {
    const preset = VISUAL_FILTER_PRESETS.find((item) => item.id === presetId);
    const plan = resolveNamedPresetClipBatchPlan({
      selectedClipCount: selectedClips.length,
      canApply: selectedCanApplyVisualFilter,
      unavailableStatus: 'Visual FX presets are available for video and image clips',
      targetClipIds: selectedVisualFilterClipIds,
      presetLabel: preset?.label,
      commitPrefix: 'Visual FX',
      fallbackCommitLabel: 'Visual FX applied',
      statusAction: 'Visual FX applied',
    });
    if (!plan.canApply || !plan.commitLabel) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    let updatedCount = 0;
    let skippedCount = 0;
    const committed = commitProject(
      plan.commitLabel,
      (current) => {
        const result = applyVisualFilterPresetToClips(current, plan.targetClipIds, presetId);
        updatedCount = result.updatedClipIds.length;
        skippedCount = result.skipped.length;
        return result.project;
      },
    );
    if (committed) {
      setStatus(formatClipBatchStatus(plan.statusAction ?? 'Visual FX applied', { updatedCount, skippedCount }));
    }
  };

  const handleApplyExternalEffectPlan = async (
    pluginId: string,
    presetId: ExternalEffectPresetId,
    parameters: ExternalPluginPlanParameters = {},
  ) => {
    const targetClipIds = selectedVisualFilterClipIds;
    if (selectedClips.length === 0) {
      setStatus('Select a clip first');
      return;
    }

    if (targetClipIds.length === 0) {
      setStatus('External effect plans are available for video and image clips');
      return;
    }

    const client = getWindowEditorIpcClient();
    if (!client) {
      setStatus('External plugin sandbox commands are available in the Electron app.');
      return;
    }

    const requestGeneration = projectReplacementGenerationRef.current;
    try {
      const response = await client.extensions.invoke(project, pluginId, EXTENSION_SANDBOX_PLAN_EFFECTS_COMMAND, {
        presetId,
        selectedClipIds: targetClipIds,
        parameters,
      }) as ExtensionInvocationResult;
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      if (!response.handled) {
        setStatus(response.warnings[0] ?? 'External effect plan was not handled.');
        return;
      }

      const effectPlans = readExtensionEffectPlansFromRuntimeResult(response.result);
      if (effectPlans.length === 0) {
        setStatus('External effect plan found no applicable clips.');
        return;
      }

      let updatedCount = 0;
      let skippedCount = 0;
      let appliedPlanCount = 0;
      const committed = commitProject('External effect plan applied', (current) => {
        const pluginManifest = current.plugins.find((plugin) => plugin.id === pluginId);
        if (pluginManifest) {
          assertExtensionEffectPlansMatchManifest(pluginManifest, effectPlans);
        }
        const result = applyExtensionEffectPlans(current, effectPlans);
        updatedCount = result.updatedClipIds.length;
        skippedCount = result.skipped.length;
        appliedPlanCount = result.appliedPlanCount;
        return result.project;
      });

      if (committed && appliedPlanCount > 0) {
        setStatus(formatClipBatchStatus('External effect plan applied', { updatedCount, skippedCount }));
        return;
      }

      setStatus(skippedCount > 0
        ? 'External effect plan had no new applicable changes.'
        : 'External effect plan already matches the selected clips.');
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setStatus((error as Error).message);
    }
  };

  const handleApplyExternalTransitionPlan = async (
    pluginId: string,
    presetId: ExternalTransitionPresetId,
    parameters: ExternalPluginPlanParameters = {},
  ) => {
    const targetClipIds = selectedClips.map((clip) => clip.id);
    if (targetClipIds.length === 0) {
      setStatus('Select a clip first');
      return;
    }

    const client = getWindowEditorIpcClient();
    if (!client) {
      setStatus('External plugin sandbox commands are available in the Electron app.');
      return;
    }

    const requestGeneration = projectReplacementGenerationRef.current;
    try {
      const response = await client.extensions.invoke(project, pluginId, EXTENSION_SANDBOX_PLAN_TRANSITIONS_COMMAND, {
        presetId,
        selectedClipIds: targetClipIds,
        parameters,
      }) as ExtensionInvocationResult;
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      if (!response.handled) {
        setStatus(response.warnings[0] ?? 'External transition plan was not handled.');
        return;
      }

      const transitionPlans = readExtensionTransitionPlansFromRuntimeResult(response.result);
      if (transitionPlans.length === 0) {
        setStatus('External transition plan found no adjacent applicable clips.');
        return;
      }

      let updatedCount = 0;
      let skippedCount = 0;
      let appliedPlanCount = 0;
      const committed = commitProject('External transition plan applied', (current) => {
        const pluginManifest = current.plugins.find((plugin) => plugin.id === pluginId);
        if (pluginManifest) {
          assertExtensionTransitionPlansMatchManifest(pluginManifest, transitionPlans);
        }
        const result = applyExtensionTransitionPlans(current, transitionPlans);
        updatedCount = result.updatedClipIds.length;
        skippedCount = result.skipped.length;
        appliedPlanCount = result.appliedPlanCount;
        return result.project;
      });

      if (committed && appliedPlanCount > 0) {
        setStatus(formatClipBatchStatus('External transition plan applied', { updatedCount, skippedCount }));
        return;
      }

      setStatus(skippedCount > 0
        ? 'External transition plan had no new applicable changes.'
        : 'External transition plan already matches the selected clips.');
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setStatus((error as Error).message);
    }
  };

  const handleRunExternalCustomCommand = async (
    pluginId: string,
    commandId: string,
    parameters: ExternalPluginCustomCommandParameters = {},
  ) => {
    const client = getWindowEditorIpcClient();
    if (!client) {
      setStatus('External plugin sandbox commands are available in the Electron app.');
      return;
    }

    const requestGeneration = projectReplacementGenerationRef.current;
    try {
      const payload = Object.keys(parameters).length > 0
        ? { commandId, parameters }
        : { commandId };
      const response = await client.extensions.invoke(
        project,
        pluginId,
        EXTENSION_SANDBOX_RUN_CUSTOM_COMMAND,
        payload,
      ) as ExtensionInvocationResult;
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      if (!response.handled) {
        setStatus(response.warnings[0] ?? 'External custom command was not handled.');
        return;
      }

      setStatus(formatExternalCustomCommandStatus(response.result, commandId));
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setStatus(`External custom command failed: ${(error as Error).message}`);
    }
  };

  const handleInstallPluginPackage = async () => {
    const requestGeneration = projectReplacementGenerationRef.current;
    try {
      const directorySelection = await selectPluginPackageDirectory({
        defaultPath: '.danbi/plugin-packages',
      });
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      if (directorySelection.available && directorySelection.canceled) {
        setStatus('Plugin package install canceled');
        return;
      }

      if (!directorySelection.directory) {
        setStatus('Plugin package installation requires the Electron desktop runtime.');
        return;
      }

      const result = await installPluginPackageFolder(project, directorySelection.directory, {
        mode: 'replace',
      });
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      commitResolvedProject(`Plugin package ${result.status}`, result.project);
      const savedProjectText = serializeProject(result.project);
      setLastSavedProjectText(savedProjectText);
      setLastAutosavedProjectText(savedProjectText);
      const warningText = result.warnings.length > 0 ? ` (${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'})` : '';
      setStatus(`Plugin package ${result.status}: ${result.pluginName} ${result.pluginVersion}, ${result.copiedFiles.length} file${result.copiedFiles.length === 1 ? '' : 's'}${warningText}`);
      await refreshProjects();
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setStatus(`Plugin package install failed: ${resolveProjectPersistenceErrorMessage(error)}`);
    }
  };

  const handleSetExporterWriterTrust = (
    pluginId: string,
    writerId: string,
    trust: EditorPluginExporterWriterTrust,
  ) => {
    let trustUpdate: ReturnType<typeof updatePluginExporterWriterTrust> | undefined;
    const action = trust === 'trusted' ? 'approved' : trust === 'blocked' ? 'blocked' : 'set for review';
    const committed = commitProject(`Exporter writer ${action}`, (current) => {
      trustUpdate = updatePluginExporterWriterTrust(current, pluginId, writerId, trust, {
        source: 'plugins-panel',
      });
      return trustUpdate.project;
    });

    if (!trustUpdate) {
      setStatus('Exporter writer trust update failed.');
      return;
    }

    if (trustUpdate.status === 'plugin-not-found') {
      setStatus('Plugin was not found.');
      return;
    }

    if (trustUpdate.status === 'writer-not-found') {
      setStatus('Exporter writer was not found.');
      return;
    }

    if (trustUpdate.status === 'unchanged') {
      setStatus(`Exporter writer already ${action}.`);
      return;
    }

    if (committed) {
      setStatus(`Exporter writer ${action} for this project.`);
    }
  };

  const handleApplyAiEnhancementPreset = (presetId: AiEnhancementPresetId) => {
    const preset = AI_ENHANCEMENT_PRESETS.find((item) => item.id === presetId);
    const plan = resolveNamedPresetClipBatchPlan({
      selectedClipCount: selectedClips.length,
      canApply: selectedCanApplyAiEnhancement,
      unavailableStatus: 'AI enhancement presets are available for video and image clips',
      targetClipIds: selectedAiEnhancementClipIds,
      presetLabel: preset?.label,
      commitPrefix: 'AI enhancement',
      fallbackCommitLabel: 'AI enhancement applied',
      statusAction: 'AI enhancement applied',
    });
    if (!plan.canApply || !plan.commitLabel) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    let updatedCount = 0;
    let skippedCount = 0;
    const committed = commitProject(
      plan.commitLabel,
      (current) => {
        const result = applyAiEnhancementPresetToClips(current, plan.targetClipIds, presetId);
        updatedCount = result.updatedClipIds.length;
        skippedCount = result.skipped.length;
        return result.project;
      },
    );
    if (committed) {
      setStatus(formatClipBatchStatus(plan.statusAction ?? 'AI enhancement applied', { updatedCount, skippedCount }));
    }
  };

  const handleAddSmartReframeEffect = () => {
    const targetWidth = selectedExportProfile?.width ?? project.width;
    const targetHeight = selectedExportProfile?.height ?? project.height;
    handleAddEffectToSelectedClips('Smart reframe', selectedSmartReframeAddClipIds, (clip, index, stamp) => ({
      id: `effect-smart-reframe-${stamp}-${clip.id}-${index}`,
      type: 'reframe',
      label: 'Smart reframe',
      enabled: true,
      parameters: {
        targetAspect: targetWidth / targetHeight,
        focalX: 0.5,
        focalY: 0.42,
        zoom: 1.08,
      },
    }));
  };

  const handleTrackSubjectReframe = () => {
    const plan = resolveSubjectTrackingReframePlan({
      canApply: selectedCanTrackSubject,
      targetClipIds: selectedSubjectTrackingClipIds,
    });
    if (!plan.canApply || !plan.commitLabel) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    const targetWidth = selectedExportProfile?.width ?? project.width;
    const targetHeight = selectedExportProfile?.height ?? project.height;
    let updatedCount = 0;
    let skippedCount = 0;
    const committed = commitProject(plan.commitLabel, (current) => {
      const result = applySubjectTrackingReframe(current, plan.targetClipIds, {
        targetAspect: targetWidth / targetHeight,
        zoom: 1.16,
      });
      updatedCount = result.updatedClipIds.length;
      skippedCount = result.skipped.length;
      return result.project;
    });

    if (committed) {
      setStatus(formatClipBatchStatus(plan.statusAction ?? 'Subject tracking reframe applied', { updatedCount, skippedCount }));
    }
  };

  const handleApplyTrackedObjectMask = () => {
    const plan = resolveTrackedObjectMaskPlan({
      canApply: selectedCanApplyObjectMask,
      targetClipIds: selectedObjectMaskClipIds,
    });
    if (!plan.canApply || !plan.commitLabel) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    let updatedCount = 0;
    let skippedCount = 0;
    const committed = commitProject(plan.commitLabel, (current) => {
      const result = applyTrackedObjectMask(current, plan.targetClipIds, {
        shape: 'ellipse',
        width: 0.36,
        height: 0.52,
        feather: 0.05,
      });
      updatedCount = result.updatedClipIds.length;
      skippedCount = result.skipped.length;
      return result.project;
    });

    if (committed) {
      setStatus(formatClipBatchStatus(plan.statusAction ?? 'Object mask applied', { updatedCount, skippedCount }));
    }
  };

  const handleAddAudioGainEffect = () => {
    handleAddEffectToSelectedClips('Audio gain', selectedAudioGainAddClipIds, (clip, index, stamp) => ({
      id: `effect-audio-gain-${stamp}-${clip.id}-${index}`,
      type: 'audio',
      label: 'Audio gain',
      enabled: true,
      parameters: { gainDb: 0 },
    }));
  };

  const handleApplyAudioCleanupPreset = (presetId: AudioCleanupPresetId) => {
    const preset = AUDIO_CLEANUP_PRESETS.find((item) => item.id === presetId);
    const plan = resolveNamedPresetClipBatchPlan({
      selectedClipCount: selectedClips.length,
      canApply: selectedCanApplyAudioCleanup,
      unavailableStatus: 'Audio cleanup presets are available for audio clips and video clips with audio',
      targetClipIds: selectedAudioCleanupClipIds,
      presetLabel: preset?.label,
      commitPrefix: 'Audio cleanup',
      fallbackCommitLabel: 'Audio cleanup applied',
      statusAction: 'Audio cleanup applied',
    });
    if (!plan.canApply || !plan.commitLabel) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    let updatedCount = 0;
    let skippedCount = 0;
    const committed = commitProject(
      plan.commitLabel,
      (current) => {
        const result = applyAudioCleanupPresetToClips(current, plan.targetClipIds, presetId);
        updatedCount = result.updatedClipIds.length;
        skippedCount = result.skipped.length;
        return result.project;
      },
    );
    if (committed) {
      setStatus(formatClipBatchStatus(plan.statusAction ?? 'Audio cleanup applied', { updatedCount, skippedCount }));
    }
  };

  const handleNormalizeAudioPeak = () => {
    const plan = resolveAudioPeakNormalizeCommandPlan({ selectedClips });
    if (!plan.canApply) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    try {
      const projectForEdit = applyRuntimeWaveformsToProject({
        project,
        assetIds: plan.assetIds,
        audioPeaksByAssetId,
      });
      const result = applyAudioPeakNormalizeToClips(
        projectForEdit,
        plan.targetClipIds,
        audioNormalizeTargetPeak,
      );
      const clipCount = result.plans.length;

      commitProject(
        resolveAudioPeakNormalizeCommitLabel(clipCount),
        () => result.project,
      );
      setStatus(formatAudioPeakNormalizeStatus({
        clipCount,
        skippedCount: result.skipped.length,
        limitedCount: result.limitedCount,
      }));
    } catch (error) {
      setStatus(formatAudioPeakNormalizeFailureStatus(error));
    }
  };

  const handleApplyAudioFade = (edge: 'in' | 'out' | 'both') => {
    const plan = resolveAudioFadeClipBatchPlan({
      selectedClipIds: selectedClips.map((clip) => clip.id),
      canApply: selectedCanApplyAudioFade,
      edge,
    });
    if (!plan.canApply || !plan.commitLabel || !plan.statusAction) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    let updatedCount = 0;
    let skippedCount = 0;
    const committed = commitProject(
      plan.commitLabel,
      (current) => {
        const result = applyAudioFadeToClips(current, plan.targetClipIds, edge, audioFadeDuration);
        updatedCount = result.updatedClipIds.length;
        skippedCount = result.skipped.length;
        return result.project;
      },
    );
    if (committed) {
      setStatus(formatClipBatchStatus(plan.statusAction, { updatedCount, skippedCount }, plan.statusPreposition));
    }
  };

  const handleApplyVisualFade = (edge: 'in' | 'out' | 'both') => {
    const plan = resolveVisualFadeClipBatchPlan({
      selectedClipIds: selectedClips.map((clip) => clip.id),
      canApply: selectedCanApplyVisualFade,
      edge,
    });
    if (!plan.canApply || !plan.commitLabel || !plan.statusAction) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    let updatedCount = 0;
    let skippedCount = 0;
    const committed = commitProject(
      plan.commitLabel,
      (current) => {
        const result = applyVisualFadeToClips(current, plan.targetClipIds, edge, visualFadeDuration);
        updatedCount = result.updatedClipIds.length;
        skippedCount = result.skipped.length;
        return result.project;
      },
    );
    if (committed) {
      setStatus(formatClipBatchStatus(plan.statusAction, { updatedCount, skippedCount }, plan.statusPreposition));
    }
  };

  const handleApplyCanvasLayout = (mode: CanvasLayoutMode) => {
    const plan = resolveCanvasLayoutClipBatchPlan({
      selectedClipIds: selectedClips.map((clip) => clip.id),
      canApply: selectedCanApplyCanvasLayout,
      modeLabel: canvasLayoutLabel(mode),
    });
    if (!plan.canApply || !plan.commitLabel || !plan.statusAction) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    let updatedCount = 0;
    let skippedCount = 0;
    const committed = commitProject(
      plan.commitLabel,
      (current) => {
        const result = applyCanvasLayoutToClips(current, plan.targetClipIds, mode);
        updatedCount = result.updatedClipIds.length;
        skippedCount = result.skipped.length;
        return result.project;
      },
    );
    if (committed) {
      setStatus(formatClipBatchStatus(plan.statusAction, { updatedCount, skippedCount }, plan.statusPreposition));
    }
  };

  const handleApplyFreezeFrame = () => {
    const plan = resolveFreezeFrameClipBatchPlan({
      selectedClipIds: selectedClips.map((clip) => clip.id),
      canApply: selectedCanApplyFreezeFrame,
    });
    if (!plan.canApply || !plan.commitLabel || !plan.statusAction) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    let updatedCount = 0;
    let skippedCount = 0;
    const committed = commitProject(
      plan.commitLabel,
      (current) => {
        const result = applyFreezeFrameAtTimelineTimeToClips(current, plan.targetClipIds, playhead);
        updatedCount = result.updatedClipIds.length;
        skippedCount = result.skipped.length;
        return result.project;
      },
    );
    if (committed) {
      setStatus(formatClipBatchStatus(plan.statusAction, { updatedCount, skippedCount }, plan.statusPreposition));
    }
  };

  const handleClearFreezeFrame = () => {
    const plan = resolveClearFreezeFrameClipBatchPlan({
      selectedClipIds: selectedClips.map((clip) => clip.id),
    });
    if (!plan.canApply || !plan.commitLabel || !plan.statusAction) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    let updatedCount = 0;
    let skippedCount = 0;
    const committed = commitProject(plan.commitLabel, (current) => {
      const result = clearFreezeFrameFromClips(current, plan.targetClipIds);
      updatedCount = result.updatedClipIds.length;
      skippedCount = result.skipped.length;
      return result.project;
    });
    if (committed) {
      setStatus(formatClipBatchStatus(plan.statusAction, { updatedCount, skippedCount }, plan.statusPreposition));
    }
  };

  const handleAnalyzeSilence = () => {
    const targetPlan = resolveAudioAnalysisTargetPlan(selectedClip);
    if (!targetPlan.canAnalyze) {
      setStatus(targetPlan.status);
      return;
    }

    try {
      const projectForAnalysis = applyRuntimeWaveformToProject({
        project,
        assetId: targetPlan.assetId,
        audioPeaksByAssetId,
      });
      const plan = buildSilenceRemovalPlan(projectForAnalysis, targetPlan.clipId, silenceSettings);
      setSilencePlan(plan);
      setStatus(formatSilenceAnalysisStatus(plan));
    } catch (error) {
      setSilencePlan(null);
      setStatus(formatAudioAnalysisFailureStatus('silence-analysis', error));
    }
  };

  const handleRemoveSilence = () => {
    const targetPlan = resolveAudioAnalysisTargetPlan(selectedClip);
    if (!targetPlan.canAnalyze) {
      setStatus(targetPlan.status);
      return;
    }

    try {
      const projectForEdit = applyRuntimeWaveformToProject({
        project,
        assetId: targetPlan.assetId,
        audioPeaksByAssetId,
      });
      const result = removeDetectedSilence(projectForEdit, targetPlan.clipId, silenceSettings);
      setSilencePlan(result.plan);
      commitProject('Silence removed', () => result.project);
      setStatus(formatSilenceRemovalStatus(result.plan));
    } catch (error) {
      setStatus(formatAudioAnalysisFailureStatus('silence-removal', error));
    }
  };

  const handleAnalyzeBeats = () => {
    const targetPlan = resolveAudioAnalysisTargetPlan(selectedClip);
    if (!targetPlan.canAnalyze) {
      setStatus(targetPlan.status);
      return;
    }

    try {
      const projectForAnalysis = applyRuntimeWaveformToProject({
        project,
        assetId: targetPlan.assetId,
        audioPeaksByAssetId,
      });
      const plan = buildBeatDetectionPlan(projectForAnalysis, targetPlan.clipId, beatSettings);
      setBeatPlan(plan);
      setStatus(formatBeatDetectionStatus(plan));
    } catch (error) {
      setBeatPlan(null);
      setStatus(formatAudioAnalysisFailureStatus('beat-analysis', error));
    }
  };

  const handleAddBeatMarkers = () => {
    const targetPlan = resolveAudioAnalysisTargetPlan(selectedClip);
    if (!targetPlan.canAnalyze) {
      setStatus(targetPlan.status);
      return;
    }

    try {
      const projectForAnalysis = applyRuntimeWaveformToProject({
        project,
        assetId: targetPlan.assetId,
        audioPeaksByAssetId,
      });
      const plan = resolveReusableBeatPlan({
        selectedClipId: targetPlan.clipId,
        beatPlan,
      }) ?? buildBeatDetectionPlan(projectForAnalysis, targetPlan.clipId, beatSettings);
      const actionPlan = resolveBeatActionPlan(plan);

      if (!actionPlan.canApply) {
        setStatus(actionPlan.status);
        return;
      }

      setBeatPlan(plan);
      commitProject('Beat markers added', (current) => addBeatMarkers(applyRuntimeWaveformToProject({
        project: current,
        assetId: targetPlan.assetId,
        audioPeaksByAssetId,
      }), actionPlan.plan));
      setStatus(formatBeatMarkerStatus(actionPlan.plan));
    } catch (error) {
      setStatus(formatAudioAnalysisFailureStatus('beat-markers', error));
    }
  };

  const handleBeatCut = () => {
    const targetPlan = resolveAudioAnalysisTargetPlan(selectedClip);
    if (!targetPlan.canAnalyze) {
      setStatus(targetPlan.status);
      return;
    }

    try {
      const projectForEdit = applyRuntimeWaveformToProject({
        project,
        assetId: targetPlan.assetId,
        audioPeaksByAssetId,
      });
      const plan = resolveReusableBeatPlan({
        selectedClipId: targetPlan.clipId,
        beatPlan,
      }) ?? buildBeatDetectionPlan(projectForEdit, targetPlan.clipId, beatSettings);
      const actionPlan = resolveBeatActionPlan(plan);

      if (!actionPlan.canApply) {
        setStatus(actionPlan.status);
        return;
      }

      setBeatPlan(plan);
      commitProject('Beat cut applied', () => splitClipAtDetectedBeats(projectForEdit, actionPlan.plan));
      setStatus(formatBeatCutStatus(actionPlan.plan));
    } catch (error) {
      setStatus(formatAudioAnalysisFailureStatus('beat-cut', error));
    }
  };

  const handleEffectParameterChange = (
    effectId: string,
    key: string,
    value: string | number | boolean,
  ) => {
    const plan = resolveClipEffectBatchEditPlan({
      selectedClip,
      selectedClips,
      effectId,
      commitLabel: 'Effect parameter updated',
      statusAction: 'Effect parameter updated',
    });
    if (!plan.canApply || !plan.commitLabel || !plan.selectedClipId || !plan.effectId || !plan.targetEffect) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    let updatedCount = 0;
    let skippedCount = 0;
    const committed = commitProject(plan.commitLabel, (current) => {
      const result = updateClipEffectParametersInClips(
        current,
        plan.targetClipIds,
        (effect, clip) => isMatchingClipEffectBatchTarget({
          effect,
          clip,
          selectedClipId: plan.selectedClipId!,
          effectId: plan.effectId!,
          targetEffect: plan.targetEffect!,
        }),
        { [key]: value },
      );
      updatedCount = result.updatedClipIds.length;
      skippedCount = result.skipped.length;
      return result.project;
    });

    if (committed) {
      setStatus(formatClipBatchStatus(plan.statusAction ?? 'Effect parameter updated', { updatedCount, skippedCount }, 'on'));
    }
  };

  const handleToggleClipEffect = (effectId: string) => {
    const plan = resolveClipEffectBatchEditPlan({
      selectedClip,
      selectedClips,
      effectId,
      commitLabel: 'Effect toggled',
      statusAction: 'Effect toggled',
    });
    if (!plan.canApply || !plan.commitLabel || !plan.selectedClipId || !plan.effectId || !plan.targetEffect) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    let updatedCount = 0;
    let skippedCount = 0;
    const nextEnabled = !plan.targetEffect.enabled;
    const committed = commitProject(plan.commitLabel, (current) => {
      const result = setClipEffectsEnabledInClips(
        current,
        plan.targetClipIds,
        (effect, clip) => isMatchingClipEffectBatchTarget({
          effect,
          clip,
          selectedClipId: plan.selectedClipId!,
          effectId: plan.effectId!,
          targetEffect: plan.targetEffect!,
        }),
        nextEnabled,
      );
      updatedCount = result.updatedClipIds.length;
      skippedCount = result.skipped.length;
      return result.project;
    });

    if (committed) {
      setStatus(formatClipBatchStatus(`Effect ${nextEnabled ? 'enabled' : 'disabled'}`, { updatedCount, skippedCount }, 'on'));
    }
  };

  const handleRemoveClipEffect = (effectId: string) => {
    const plan = resolveClipEffectBatchEditPlan({
      selectedClip,
      selectedClips,
      effectId,
      commitLabel: 'Effect removed',
      statusAction: 'Effect removed',
    });
    if (!plan.canApply || !plan.commitLabel || !plan.selectedClipId || !plan.effectId || !plan.targetEffect) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    let updatedCount = 0;
    let skippedCount = 0;
    const committed = commitProject(plan.commitLabel, (current) => {
      const result = removeClipEffectsFromClips(
        current,
        plan.targetClipIds,
        (effect, clip) => isMatchingClipEffectBatchTarget({
          effect,
          clip,
          selectedClipId: plan.selectedClipId!,
          effectId: plan.effectId!,
          targetEffect: plan.targetEffect!,
        }),
      );
      updatedCount = result.updatedClipIds.length;
      skippedCount = result.skipped.length;
      return result.project;
    });

    if (committed) {
      setStatus(formatClipBatchStatus(plan.statusAction ?? 'Effect removed', { updatedCount, skippedCount }, 'from'));
    }
  };

  const handleMoveClipEffect = (effectId: string, direction: 'up' | 'down') => {
    const plan = resolveMoveClipEffectPlan({ selectedClip, effectId, direction });
    if (!plan.canApply || !plan.clipId || !plan.effectId || !plan.direction || !plan.commitLabel) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    commitProject(plan.commitLabel, (current) => (
      moveClipEffect(current, plan.clipId!, plan.effectId!, plan.direction!)
    ));
  };

  const readCurrentTimelineLaneBounds = () => readTimelineLaneBounds(project.tracks, timelineLaneRefs.current);

  const buildTimelinePreviewOptions = () => ({
    project,
    selectedClipIds,
    snapEnabled,
    snapExtraPoints: timelineEditSnapPoints,
    includeLinked: linkedClipEditsEnabled,
  });

  const resolveClipMoveEdit = (anchorClip: TimelineClip, nextStart: number) => (
    resolveTimelineClipMoveEdit({
      ...buildTimelinePreviewOptions(),
      anchorClip,
      nextStart,
    })
  );

  const buildGroupMovePreview = (
    anchorClip: TimelineClip,
    moveEdit: TimelineClipMoveEdit,
  ): TimelineGroupMovePreview | null => {
    if (moveEdit.group.length <= 1 || Math.abs(moveEdit.appliedDelta) < 0.001) {
      return null;
    }

    return {
      anchorClipId: anchorClip.id,
      operation: 'group-move',
      groupCount: moveEdit.group.length,
      delta: moveEdit.appliedDelta,
      clips: moveEdit.group.map((clip) => ({
        id: clip.id,
        trackId: clip.trackId,
        start: roundTime(Math.max(0, clip.start + moveEdit.appliedDelta)),
        duration: clip.duration,
        label: clip.name,
      })),
    };
  };

  const buildGroupTrimPreview = (
    anchorClip: TimelineClip,
    trimEdit: TimelineClipTrimEdit,
  ): TimelineGroupTrimPreview | null => {
    if (trimEdit.group.length <= 1 || trimEdit.preview.ripple || Math.abs(trimEdit.appliedDelta) < 0.001) {
      return null;
    }

    const updateByClipId = new Map(trimEdit.updates.map((update) => [update.clipId, update]));
    const clips = trimEdit.group.flatMap((clip) => {
      const update = updateByClipId.get(clip.id);
      if (!update) {
        return [];
      }

      const currentEnd = roundTime(clip.start + clip.duration);
      const nextStart = trimEdit.edge === 'start'
        ? update.appliedTimelineTime
        : clip.start;
      const nextDuration = trimEdit.edge === 'start'
        ? roundTime(Math.max(0.25, currentEnd - update.appliedTimelineTime))
        : roundTime(Math.max(0.25, update.appliedTimelineTime - clip.start));

      return [{
        id: clip.id,
        trackId: clip.trackId,
        start: clip.start,
        nextStart,
        duration: clip.duration,
        nextDuration,
        label: clip.name,
      }];
    });

    if (clips.length <= 1) {
      return null;
    }

    return {
      anchorClipId: anchorClip.id,
      operation: 'group-trim',
      edge: trimEdit.edge,
      groupCount: trimEdit.group.length,
      delta: trimEdit.appliedDelta,
      clips,
    };
  };

  const buildNeighborImpactPreview = (
    anchorClip: TimelineClip,
    preview: TimelineClipEditPreview | null,
    edge?: 'start' | 'end',
  ): TimelineNeighborImpactPreview | null => {
    if (!preview || preview.delta === undefined || Math.abs(preview.delta) < 0.001) {
      return null;
    }

    const operation = preview.operation;
    if (operation !== 'roll' && operation !== 'slide') {
      return null;
    }
    if (operation === 'roll' && !edge) {
      return null;
    }

    let previewProject = project;
    try {
      previewProject = operation === 'roll'
        ? rollTrimLinkedClip(project, anchorClip.id, edge!, preview.delta)
        : slideLinkedClip(project, anchorClip.id, preview.delta);
    } catch {
      return null;
    }

    const nextClipById = new Map(previewProject.tracks.flatMap((track) => (
      track.clips.map((clip) => [clip.id, clip] as const)
    )));
    const clips = project.tracks.flatMap((track) => (
      track.clips.flatMap((clip) => {
        const nextClip = nextClipById.get(clip.id);
        if (!nextClip) {
          return [];
        }

        const startChanged = Math.abs(nextClip.start - clip.start) > 0.001;
        const durationChanged = Math.abs(nextClip.duration - clip.duration) > 0.001;
        const sourceChanged = Math.abs(nextClip.sourceIn - clip.sourceIn) > 0.001;
        if (!startChanged && !durationChanged && !sourceChanged) {
          return [];
        }

        return [{
          id: clip.id,
          trackId: track.id,
          role: clip.id === anchorClip.id ? 'anchor' as const : 'neighbor' as const,
          start: clip.start,
          duration: clip.duration,
          nextStart: nextClip.start,
          nextDuration: nextClip.duration,
          sourceIn: clip.sourceIn,
          nextSourceIn: nextClip.sourceIn,
          label: clip.name,
        }];
      })
    ));

    if (clips.length <= 1) {
      return null;
    }

    return {
      anchorClipId: anchorClip.id,
      operation,
      edge: operation === 'roll' ? edge : undefined,
      delta: preview.delta,
      affectedCount: clips.length,
      clips,
    };
  };

  const buildRippleTrimPreview = (
    anchorClip: TimelineClip,
    preview: TimelineClipEditPreview | null,
    edge?: 'start' | 'end',
  ): TimelineRippleTrimPreview | null => {
    if (!preview || !preview.ripple || preview.operation !== 'trim' || !edge || preview.delta === undefined || Math.abs(preview.delta) < 0.001) {
      return null;
    }

    const delta = preview.delta;
    const linkedIds = getLinkedClipIds(project, anchorClip.id);
    const linkedIdSet = new Set(linkedIds);
    const affectedClips = project.tracks.flatMap((track) => {
      const sortedClips = [...track.clips].sort((a, b) => a.start - b.start);
      const linkedClip = sortedClips.find((clip) => linkedIdSet.has(clip.id));
      if (!linkedClip) {
        return [];
      }

      const linkedIndex = sortedClips.findIndex((clip) => clip.id === linkedClip.id);
      const shift = edge === 'start' ? -delta : delta;
      const affectedIds = new Set(sortedClips.slice(linkedIndex + 1).map((clip) => clip.id));
      if (edge === 'start') {
        affectedIds.add(linkedClip.id);
      }

      return sortedClips.flatMap((clip) => {
        if (!affectedIds.has(clip.id)) {
          return [];
        }

        const nextStart = roundTime(Math.max(0, clip.start + shift));
        if (Math.abs(nextStart - clip.start) < 0.001) {
          return [];
        }

        return [{
          id: clip.id,
          trackId: track.id,
          start: clip.start,
          nextStart,
          duration: clip.id === linkedClip.id && edge === 'start' ? preview.duration : clip.duration,
          label: clip.name,
        }];
      });
    });

    if (affectedClips.length === 0) {
      return null;
    }

    return {
      anchorClipId: anchorClip.id,
      operation: 'ripple-trim',
      edge,
      delta,
      affectedCount: affectedClips.length,
      clips: affectedClips,
    };
  };

  const resolveTrackIdsInDragRange = (startClientY: number, endClientY: number): string[] => (
    resolveTimelineTrackIdsInDragRange(readCurrentTimelineLaneBounds(), startClientY, endClientY)
  );

  const handleClipDragPointer = (anchorClip: TimelineClip, clientX: number | null, clientY?: number) => {
    if (clientX === null || clientY === undefined) {
      const pointerPlan = resolveTimelineClipDragPointerPlan({
        project,
        selectedClipIds,
        anchorClip,
        laneBounds: [],
      });
      setClipDragTargetTrackId(pointerPlan.targetTrackId);
      setClipDragPreview(pointerPlan.clipDragPreview ?? null);
      setGroupMovePreview(null);
      setGroupTrimPreview(null);
      setNeighborImpactPreview(null);
      setRippleTrimPreview(null);
      showTimelineEditGuide(pointerPlan.editGuide ?? null);
      return;
    }

    applyTimelineEdgeAutoScroll(clientX);
    const pointerPlan = resolveTimelineClipDragPointerPlan({
      project,
      selectedClipIds,
      anchorClip,
      clientY,
      laneBounds: readCurrentTimelineLaneBounds(),
    });
    setClipDragTargetTrackId(pointerPlan.targetTrackId);
  };

  const handleClipDragPreview = (anchorClip: TimelineClip, nextStart: number, clientY: number) => {
    const previewState = resolveTimelineClipDragPreviewState({
      ...buildTimelinePreviewOptions(),
      anchorClip,
      nextStart,
      clientY,
      laneBounds: readCurrentTimelineLaneBounds(),
    });
    setClipDragPreview(previewState.dropPreview);
    setGroupMovePreview(buildGroupMovePreview(anchorClip, previewState.moveEdit));
    setGroupTrimPreview(null);
    setNeighborImpactPreview(null);
    setRippleTrimPreview(null);
    showTimelineEditGuide(previewState.editGuide);
  };

  const handleClipEditPreviewGuide = (
    clip: TimelineClip,
    preview: TimelineClipEditPreview | null,
    edge?: 'start' | 'end',
  ) => {
    const trimEdit = preview?.operation === 'trim' && edge && preview.delta !== undefined
      ? resolveTimelineClipTrimEdit({
        ...buildTimelinePreviewOptions(),
        rippleMode,
        clip,
        edge,
        deltaSeconds: preview.delta,
      })
      : null;
    setGroupMovePreview(null);
    setGroupTrimPreview(trimEdit ? buildGroupTrimPreview(clip, trimEdit) : null);
    setNeighborImpactPreview(buildNeighborImpactPreview(clip, preview, edge));
    setRippleTrimPreview(buildRippleTrimPreview(clip, preview, edge));
    showTimelineEditGuide(buildTimelineClipEditGuide(clip, preview, edge));
  };

  const resolveClipTrimPreview = (
    clip: TimelineClip,
    edge: 'start' | 'end',
    deltaSeconds: number,
  ): TimelineClipEditPreview => (
    resolveTimelineClipTrimPreview({
      ...buildTimelinePreviewOptions(),
      rippleMode,
      clip,
      edge,
      deltaSeconds,
    })
  );

  const handleTimelineClipTrimDrag = (
    clip: TimelineClip,
    edge: 'start' | 'end',
    deltaSeconds: number,
  ) => {
    const trimEdit = resolveTimelineClipTrimEdit({
      ...buildTimelinePreviewOptions(),
      rippleMode,
      clip,
      edge,
      deltaSeconds,
    });

    if (!rippleMode && trimEdit.group.length > 1 && trimEdit.updates.length > 1) {
      const committed = commitProject('Selected clip edges trimmed', (current) => (
        trimEdit.updates.reduce((nextProject, update) => (
          trimLinkedClipToTime(nextProject, update.clipId, edge, update.appliedTimelineTime, { ripple: false, preventOverlap: false })
        ), current)
      ));
      if (committed) {
        const anchorUpdate = trimEdit.updates.find((update) => update.clipId === clip.id);
        setSelectedClipId(clip.id);
        setSelectedClipIds(trimEdit.group.map((item) => item.id));
        setSelectedTrackId(clip.trackId);
        setActiveMonitor('program');
        setTimelinePlayhead(anchorUpdate?.appliedTimelineTime ?? (edge === 'start' ? trimEdit.preview.start : roundTime(trimEdit.preview.start + trimEdit.preview.duration)));
      }
      return;
    }

    const plan = resolveTimelineClipTrimDragCommitPlan({
      project,
      clip,
      edge,
      deltaSeconds,
      rippleMode,
      snapEnabled,
      snapExtraPoints: timelineEditSnapPoints,
    });
    const committed = commitProject(plan.commitLabel, (current) => {
      if (linkedClipEditsEnabled) {
        return trimLinkedClipToTime(current, plan.clipId, plan.edge, plan.nextTimelineTime, plan.trimOptions);
      }

      const currentClip = findClip(current, plan.clipId);
      if (!currentClip) {
        throw new Error('Clip not found.');
      }
      const separateTimelineTime = trimEdit.updates.find((update) => update.clipId === plan.clipId)?.appliedTimelineTime ?? plan.nextTimelineTime;
      const delta = plan.edge === 'start'
        ? separateTimelineTime - currentClip.start
        : separateTimelineTime - (currentClip.start + currentClip.duration);
      return trimClip(current, plan.clipId, plan.edge, delta);
    });
    if (committed) {
      setPrimarySelection(plan.clipId);
      setSelectedTrackId(clip.trackId);
      setActiveMonitor('program');
      setTimelinePlayhead(plan.nextTimelineTime);
    }
  };

  const resolveClipSlipPreview = (
    clip: TimelineClip,
    deltaSeconds: number,
  ): TimelineClipEditPreview => resolveTimelineClipSlipPreview(project, clip, deltaSeconds);

  const resolveClipSlidePreview = (
    clip: TimelineClip,
    deltaSeconds: number,
  ): TimelineClipEditPreview => resolveTimelineClipSlidePreview(project, clip, deltaSeconds);

  const resolveClipRollTrimPreview = (
    clip: TimelineClip,
    edge: 'start' | 'end',
    deltaSeconds: number,
  ): TimelineClipEditPreview => resolveTimelineClipRollTrimPreview(project, clip, edge, deltaSeconds);

  const handleMoveClipGroup = (anchorClip: TimelineClip, nextStart: number, clientY?: number) => {
    const dragState = resolveTimelineClipDragCommitState({
      ...buildTimelinePreviewOptions(),
      anchorClip,
      nextStart,
      clientY,
      laneBounds: readCurrentTimelineLaneBounds(),
    });
    const plan = resolveTimelineClipGroupMoveCommitPlan({
      anchorClip,
      edit: dragState.edit,
      targetTrack: dragState.targetTrack,
      newTrack: dragState.newTrack,
      nextStart,
    });

    const committed = commitProject(
      plan.commitLabel,
      (current) => {
        if (plan.shouldMoveTracks && plan.newTrackPosition) {
          return moveClipsToNewTrackAtTime(current, plan.clipIds, plan.newTrackPosition, plan.nextStart, {
            anchorClipId: plan.anchorClipId,
          });
        }

        if (plan.shouldMoveTracks && plan.targetTrackId) {
          return moveClipsToTrackAtTime(current, plan.clipIds, plan.targetTrackId, plan.nextStart, {
            anchorClipId: plan.anchorClipId,
          });
        }

        return moveClips(current, plan.clipIds, plan.appliedDelta, { preventOverlap: plan.preventOverlap });
      },
    );
    if (committed) {
      setSelectedClipId(plan.anchorClipId);
      setActiveMonitor('program');
      setTimelinePlayhead(plan.nextPlayhead);
      if (plan.nextSelectedTrackId) {
        setSelectedTrackId(plan.nextSelectedTrackId);
      } else {
        setSelectedTrackId(anchorClip.trackId);
      }
    }
  };

  const handleNudgePlayhead = (deltaSeconds: number) => {
    const plan = resolveTimelinePlayheadNudgePlan({
      playhead,
      deltaSeconds,
      duration: project.duration,
    });
    setTimelinePlayhead(plan.playhead);
  };

  const handleTrackToggle = (trackId: string, state: 'muted' | 'solo' | 'locked' | 'syncLocked') => {
    const plan = resolveTrackTogglePlan({ trackId, state });
    if (plan.canCommit) {
      commitProject(plan.commitLabel, (current) => toggleTrackState(current, plan.trackId, state));
    }
  };

  const handleTrackMixerChange = (trackId: string, patch: { volumeDb?: number; pan?: number }) => {
    const plan = resolveTrackMixerChangePlan({ trackId, patch });
    if (plan.canCommit) {
      commitProject(plan.commitLabel, (current) => updateTrack(current, plan.trackId, plan.patch!));
    }
  };

  const handleTrackRename = (track: TimelineTrack, name: string) => {
    const plan = resolveTrackRenamePlan({ track, name });
    if (!plan.canCommit) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    commitProject(plan.commitLabel, (current) => updateTrack(current, plan.trackId, plan.patch!));
  };

  const handleMoveTrack = (trackId: string, direction: 'up' | 'down') => {
    const plan = resolveMoveTrackPlan({ trackId, direction });
    if (!plan.canCommit) {
      return;
    }

    const committed = commitProject(plan.commitLabel, (current) => moveTrack(current, plan.trackId, plan.direction!));
    if (committed) {
      setSelectedTrackId(plan.nextSelectedTrackId ?? plan.trackId);
    }
  };

  const handleRemoveTrack = (track: TimelineTrack) => {
    const plan = resolveRemoveTrackPlan({ track, tracks: project.tracks });
    if (!plan.canCommit) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    const committed = commitProject(plan.commitLabel, (current) => removeTrack(current, plan.trackId));
    if (committed) {
      setSelectedTrackId(plan.nextSelectedTrackId ?? '');
    }
  };

  const handleLanePointerDown = (event: MouseEvent<HTMLDivElement>, track: TimelineTrack) => {
    if (event.button !== 0) {
      return;
    }

    const requestGeneration = projectReplacementGenerationRef.current;
    const rect = event.currentTarget.getBoundingClientRect();
    let dragSession = resolveTimelineLaneDragStartPlan({
      trackId: track.id,
      laneLeft: rect.left,
      startScrollLeft: timelineScrollRef.current?.scrollLeft ?? 0,
      clientX: event.clientX,
      clientY: event.clientY,
      pixelsPerSecond,
      appendSelection: event.shiftKey || event.ctrlKey || event.metaKey,
    }).session;

    handleTrackSelect(track);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      const currentScrollLeft = applyTimelineEdgeAutoScroll(moveEvent.clientX);
      const movePlan = resolveTimelineLaneDragMovePlan({
        session: dragSession,
        clientX: moveEvent.clientX,
        clientY: moveEvent.clientY,
        currentScrollLeft,
        pixelsPerSecond,
        scopedTrackIds: resolveTrackIdsInDragRange(dragSession.startClientY, moveEvent.clientY),
      });
      dragSession = movePlan.session;
      setBoxSelection(movePlan.boxSelection);
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        setBoxSelection(null);
        return;
      }

      const currentScrollLeft = applyTimelineEdgeAutoScroll(upEvent.clientX);
      const endPlan = resolveTimelineLaneDragEndPlan({
        project,
        session: dragSession,
        clientX: upEvent.clientX,
        currentScrollLeft,
        pixelsPerSecond,
        scopedTrackIds: resolveTrackIdsInDragRange(dragSession.startClientY, upEvent.clientY),
        currentSelectedClipIds: selectedClipIds,
      });
      setBoxSelection(endPlan.boxSelection);

      if (endPlan.kind === 'seek') {
        setTimelinePlayhead(endPlan.playhead);
        if (endPlan.shouldClearSelection) {
          setSelectedClipIds([]);
        }
        return;
      }

      if (!endPlan.shouldUpdateSelection) {
        return;
      }

      setSelectedClipIds(endPlan.selectedClipIds);
      setSelectedClipId(endPlan.selectedClipId);
      if (endPlan.status) {
        setStatus(endPlan.status);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleBuildExport = async () => {
    const requestGeneration = projectReplacementGenerationRef.current;
    const exportProject = await prepareProjectForExport(project);
    if (projectReplacementGenerationRef.current !== requestGeneration) {
      return;
    }

    const draft = buildExportDraft({
      project: exportProject,
      profileId: activeExportProfileId,
      exportRange: exportRangeRequest,
      playhead,
    });
    setExportManifest(draft.manifest);
    setRenderPlan(draft.plan);
    setStatus(draft.status);

    void fetchServerRenderPlan(resolveServerRenderPlanRequestPlan({
      project: exportProject,
      profileId: activeExportProfileId,
      exportRange: exportRangeRequest,
    }))
      .then((serverPlan) => {
        if (projectReplacementGenerationRef.current !== requestGeneration) {
          return;
        }

        const serverPlanState = resolveServerRenderPlanState(serverPlan);
        if (serverPlanState.renderPlan) {
          setRenderPlan(serverPlanState.renderPlan);
        }
      })
      .catch(() => undefined);
  };

  const handleDownloadCaptionSidecar = async (format: 'srt' | 'vtt') => {
    const requestGeneration = projectReplacementGenerationRef.current;
    try {
      const sidecar = await downloadCaptionSidecar(resolveCaptionSidecarDownloadRequestPlan({
        project,
        format,
        options: captionSidecarSettings,
        exportRange: exportRangeRequest,
      }));
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setStatus(formatCaptionSidecarDownloadStatus(sidecar.captionCount, format));
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setStatus(formatCaptionSidecarFailureStatus(error));
    }
  };

  const handleDownloadEdl = async () => {
    const requestGeneration = projectReplacementGenerationRef.current;
    try {
      const edl = await downloadCmx3600Edl(resolveEdlDownloadRequestPlan({
        project,
        exportRange: exportRangeRequest,
      }));
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setStatus(formatEdlDownloadStatus(edl.eventCount, edl.warningCount));
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setStatus(formatEdlFailureStatus(error));
    }
  };

  const handleImportEdl = () => {
    edlFileInputRef.current?.click();
  };

  const handleEdlFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) {
      return;
    }
    const preservationState = preserveCurrentProjectBeforeReplacement('EDL import');
    if (preservationState === 'blocked') {
      return;
    }

    const requestGeneration = beginProjectReplacementRequest();
    try {
      const imported = await importCmx3600EdlFile(file);
      if (!isProjectReplacementRequestCurrent(requestGeneration)) {
        return;
      }

      applyProjectPersistenceSession(resolveEdlProjectImportSession({
        currentProject: project,
        history,
        imported,
      }));
      setStatus(preservationState === 'preserved'
        ? `${formatEdlImportStatus(imported.events.length, imported.warnings.length)}; previous unsaved project saved to local fallback`
        : formatEdlImportStatus(imported.events.length, imported.warnings.length));
    } catch (error) {
      if (!isProjectReplacementRequestCurrent(requestGeneration)) {
        return;
      }

      setStatus(formatEdlImportFailureStatus(error));
    }
  };

  const handleDownloadFcpxml = async () => {
    const requestGeneration = projectReplacementGenerationRef.current;
    try {
      const fcpxml = await downloadFcpxml(resolveFcpxmlDownloadRequestPlan({
        project,
        exportRange: exportRangeRequest,
      }));
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setStatus(formatFcpxmlDownloadStatus(fcpxml.clipCount, fcpxml.markerCount, fcpxml.warningCount));
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setStatus(formatFcpxmlFailureStatus(error));
    }
  };

  const handleImportFcpxml = () => {
    fcpxmlFileInputRef.current?.click();
  };

  const handleFcpxmlFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) {
      return;
    }
    const preservationState = preserveCurrentProjectBeforeReplacement('FCPXML import');
    if (preservationState === 'blocked') {
      return;
    }

    const requestGeneration = beginProjectReplacementRequest();
    try {
      const imported = await importFcpxmlFile(file);
      if (!isProjectReplacementRequestCurrent(requestGeneration)) {
        return;
      }

      applyProjectPersistenceSession(resolveFcpxmlProjectImportSession({
        currentProject: project,
        history,
        imported,
      }));
      setStatus(preservationState === 'preserved'
        ? `${formatFcpxmlImportStatus(imported.clips.length, imported.markers.length, imported.warnings.length)}; previous unsaved project saved to local fallback`
        : formatFcpxmlImportStatus(imported.clips.length, imported.markers.length, imported.warnings.length));
    } catch (error) {
      if (!isProjectReplacementRequestCurrent(requestGeneration)) {
        return;
      }

      setStatus(formatFcpxmlImportFailureStatus(error));
    }
  };

  const handleDownloadMarkers = async (format: MarkerInterchangeFormat) => {
    const requestGeneration = projectReplacementGenerationRef.current;
    try {
      const markers = await downloadTimelineMarkers(resolveMarkerInterchangeDownloadRequestPlan({
        project,
        format,
        exportRange: exportRangeRequest,
      }));
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setStatus(formatMarkerInterchangeDownloadStatus(format, markers.markerCount, markers.warningCount));
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setStatus(formatMarkerInterchangeFailureStatus(error));
    }
  };

  const handleImportMarkers = () => {
    markerFileInputRef.current?.click();
  };

  const handleMarkerFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) {
      return;
    }

    const requestGeneration = projectReplacementGenerationRef.current;
    try {
      const imported = await importTimelineMarkersFile(file);
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        setStatus('Marker import ignored because the project changed');
        return;
      }

      let mergeResult: ReturnType<typeof applyImportedTimelineMarkers> | undefined;
      const commitResult = commitProjectResult('Markers imported', (current) => {
        mergeResult = applyImportedTimelineMarkers(current, imported.markers, { mode: 'merge' });
        return mergeResult.project;
      });
      const warningCount = imported.warnings.length + (mergeResult?.warnings.length ?? 0);

      if (!commitResult.committed && (mergeResult?.importedCount ?? 0) > 0) {
        setStatus('Marker import produced no project changes');
        return;
      }

      setStatus(formatMarkerInterchangeImportStatus({
        importedCount: mergeResult?.importedCount ?? 0,
        skippedDuplicateCount: mergeResult?.skippedDuplicateCount ?? 0,
        warningCount,
      }));
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setStatus(formatMarkerInterchangeFailureStatus(error));
    }
  };

  const runContextAction = (action: () => void) => {
    action();
    setContextMenu(null);
  };

  const handleToggleBatchExportProfile = (profileId: string) => {
    setBatchExportProfileIds((current) => resolveBatchExportProfileToggle({
      project,
      selectedProfileIds: current,
      activeExportProfileId,
      toggledProfileId: profileId,
    }));
  };

  const handleRenderWorkerSettingsChange = (patch: Partial<RenderWorkerControllerSettings>) => {
    setRenderWorkerSettings((current) => ({
      ...current,
      ...patch,
      ...(patch.daemonUrl !== undefined ? { daemonUrl: patch.daemonUrl } : {}),
    }));
  };

  const saveTrustedRenderWorkers = (workers: RenderWorkerTrustedDaemon[]) => {
    const saved = writeTrustedRenderWorkers(workers);
    setTrustedRenderWorkers(saved);
    return saved;
  };

  const handleDiscoverRenderWorkerDaemon = async () => {
    setIsDiscoveringRenderWorker(true);
    try {
      const baseCandidates = buildRenderWorkerDaemonDiscoveryCandidates({
        daemonUrl: renderWorkerSettings.daemonUrl,
        remoteDaemonUrls: renderWorkerSettings.remoteDaemonUrls,
        pageOrigin: typeof window !== 'undefined' ? window.location.origin : undefined,
      });
      setRenderWorkerStatus('Discovering render worker daemon across manual and LAN candidates...');
      const lanDiscovery = await discoverRenderWorkerDaemonLanCandidates({
        timeoutMs: 700,
      }).catch((error) => ({
        kind: 'danbi.render-worker.lan-discovery' as const,
        candidates: [],
        announcements: [],
        warnings: [error instanceof Error ? error.message : String(error)],
      }));
      const trustedCandidates = buildRenderWorkerTrustedCandidateUrls(trustedRenderWorkers);
      const candidates = Array.from(new Set([
        ...lanDiscovery.candidates,
        ...trustedCandidates,
        ...baseCandidates,
      ]));
      const sourceText = [
        lanDiscovery.announcements.length > 0 ? `LAN ${lanDiscovery.announcements.length}` : '',
        trustedCandidates.length > 0 ? `trusted ${trustedCandidates.length}` : '',
      ].filter(Boolean).join(', ');
      setRenderWorkerStatus(`Discovering render worker daemon across ${candidates.length} candidate${candidates.length === 1 ? '' : 's'}${sourceText ? ` (${sourceText})` : ''}...`);
      const discovery = await discoverRenderWorkerDaemons({
        candidates,
        authToken: renderWorkerSettings.authToken,
        timeoutMs: RENDER_WORKER_DISCOVERY_TIMEOUT_MS,
      });

      if (!discovery.found) {
        const failedCount = discovery.attempts.filter((attempt) => !attempt.ok).length;
        const warningText = lanDiscovery.warnings.length > 0 && lanDiscovery.announcements.length > 0
          ? ` LAN warnings: ${lanDiscovery.warnings.join('; ')}`
          : '';
        setRenderWorkerDaemonStatus(null);
        setRenderWorkerFleet([]);
        setRenderWorkerStatus(`Render worker discovery failed: ${failedCount} candidate${failedCount === 1 ? '' : 's'} checked.`);
        setStatus(`Render worker discovery failed: start daemon with npm run editor:render-worker-daemon -- --discovery.${warningText}`);
        return;
      }

      const currentUrl = normalizeRenderWorkerDaemonUrl(renderWorkerSettings.daemonUrl);
      let refreshedTrustedWorkers = discovery.statuses.reduce((current, daemon) => (
        isRenderWorkerDaemonTrusted(current, daemon) ? trustRenderWorkerDaemon(current, daemon) : current
      ), trustedRenderWorkers);
      if (refreshedTrustedWorkers !== trustedRenderWorkers) {
        refreshedTrustedWorkers = saveTrustedRenderWorkers(refreshedTrustedWorkers);
      }
      const selectedDaemon = selectRenderWorkerDaemonForHandoff(discovery.statuses, currentUrl, {
        trustedWorkers: refreshedTrustedWorkers,
      }) ?? discovery.statuses[0];
      const selectedDecision = evaluateRenderWorkerCentralTrustPolicy(selectedDaemon, refreshedTrustedWorkers);
      setRenderWorkerFleet(discovery.statuses);
      setRenderWorkerDaemonStatus(selectedDaemon);
      setRenderWorkerSettings((current) => ({
        ...current,
        daemonUrl: selectedDaemon.url,
      }));
      const governanceText = selectedDecision.allowed
        ? `selected ${selectedDaemon.workerId}`
        : `no trusted submit target; selected ${selectedDaemon.workerId} for review`;
      setRenderWorkerStatus(`Render worker fleet discovered: ${discovery.statuses.length} worker${discovery.statuses.length === 1 ? '' : 's'}; ${governanceText}`);
      setStatus(selectedDecision.allowed
        ? `Render worker fleet discovered: ${selectedDaemon.workerId}`
        : `Render worker fleet needs trust review: ${selectedDecision.reason}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRenderWorkerStatus(`Render worker discovery failed: ${message}`);
      setStatus(`Render worker discovery failed: ${message}`);
    } finally {
      setIsDiscoveringRenderWorker(false);
    }
  };

  const handleTrustRenderWorkerDaemon = async (daemonUrl: string) => {
    const normalizedUrl = normalizeRenderWorkerDaemonUrl(daemonUrl);
    const daemon = renderWorkerFleet.find((worker) => normalizeRenderWorkerDaemonUrl(worker.url) === normalizedUrl)
      ?? (renderWorkerDaemonStatus && normalizeRenderWorkerDaemonUrl(renderWorkerDaemonStatus.url) === normalizedUrl ? renderWorkerDaemonStatus : null);
    if (!daemon) {
      setRenderWorkerStatus(`Render worker trust failed: check ${normalizedUrl} first`);
      setStatus(`Render worker trust failed: check ${normalizedUrl} first`);
      return;
    }

    const nextTrustedWorkers = saveTrustedRenderWorkers(trustRenderWorkerDaemon(trustedRenderWorkers, daemon));
    const trustDecision = evaluateRenderWorkerCentralTrustPolicy(daemon, nextTrustedWorkers);
    setRenderWorkerStatus(trustDecision.allowed
      ? `Render worker trusted: ${daemon.workerId}`
      : `Render worker trusted but still blocked: ${trustDecision.reason}`);
    setStatus(trustDecision.allowed
      ? `Render worker trusted: ${daemon.workerId}`
      : `Render worker trust policy still blocks ${daemon.workerId}: ${trustDecision.reason}`);
  };

  const handleForgetTrustedRenderWorkerDaemon = async (daemonUrl: string) => {
    const normalizedUrl = normalizeRenderWorkerDaemonUrl(daemonUrl);
    saveTrustedRenderWorkers(forgetTrustedRenderWorkerDaemon(trustedRenderWorkers, normalizedUrl));
    setRenderWorkerStatus(`Render worker forgotten: ${normalizedUrl}`);
    setStatus(`Render worker forgotten: ${normalizedUrl}`);
  };

  const handleSelectRenderWorkerDaemon = async (daemonUrl: string) => {
    const normalizedUrl = normalizeRenderWorkerDaemonUrl(daemonUrl);
    setRenderWorkerSettings((current) => ({
      ...current,
      daemonUrl: normalizedUrl,
    }));
    const knownDaemon = renderWorkerFleet.find((daemon) => normalizeRenderWorkerDaemonUrl(daemon.url) === normalizedUrl);
    if (knownDaemon) {
      setRenderWorkerDaemonStatus(knownDaemon);
      setRenderWorkerStatus(`Render worker selected: ${knownDaemon.workerId}`);
      setStatus(`Render worker selected: ${knownDaemon.workerId}`);
    } else {
      setRenderWorkerStatus(`Render worker selected: ${normalizedUrl}`);
      setStatus(`Render worker selected: ${normalizedUrl}`);
    }
  };

  const handleCheckRenderWorkerDaemon = async () => {
    try {
      const health = await fetchRenderWorkerDaemonHealth(renderWorkerSettings.daemonUrl, {
        authToken: renderWorkerSettings.authToken,
        timeoutMs: RENDER_WORKER_REQUEST_TIMEOUT_MS,
      });
      const daemonStatus = await fetchRenderWorkerDaemonStatus(renderWorkerSettings.daemonUrl, {
        authToken: renderWorkerSettings.authToken,
        timeoutMs: RENDER_WORKER_REQUEST_TIMEOUT_MS,
      });
      setRenderWorkerDaemonStatus(daemonStatus);
      setRenderWorkerFleet((current) => upsertRenderWorkerFleetStatus(current, daemonStatus));
      let currentTrustedWorkers = trustedRenderWorkers;
      if (isRenderWorkerDaemonTrusted(trustedRenderWorkers, daemonStatus)) {
        currentTrustedWorkers = saveTrustedRenderWorkers(trustRenderWorkerDaemon(trustedRenderWorkers, daemonStatus));
      }
      setRenderWorkerSettings((current) => ({
        ...current,
        daemonUrl: normalizeRenderWorkerDaemonUrl(current.daemonUrl),
      }));
      const trustDecision = evaluateRenderWorkerCentralTrustPolicy(daemonStatus, currentTrustedWorkers);
      setRenderWorkerStatus(trustDecision.allowed
        ? `Render worker ready: ${health.workerId}`
        : `Render worker blocked by trust policy: ${trustDecision.reason}`);
      setStatus(trustDecision.allowed
        ? `Render worker ready: ${health.workerId}`
        : `Render worker trust review required: ${trustDecision.reason}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRenderWorkerStatus(`Render worker check failed: ${message}`);
      setStatus(`Render worker check failed: ${message}`);
    }
  };

  const handleSubmitRenderWorkerHandoff = async () => {
    const requestGeneration = projectReplacementGenerationRef.current;
    const isStaleSubmit = () => projectReplacementGenerationRef.current !== requestGeneration;
    const profileIds = resolveBatchExportProfileIds(project, batchExportProfileIds, activeExportProfileId);
    setBatchExportProfileIds(profileIds);
    setIsSubmittingRenderWorker(true);
    setRenderWorkerStatus(`Preparing ${profileIds.length} render worker job${profileIds.length === 1 ? '' : 's'}...`);

    try {
      const currentDaemonUrl = normalizeRenderWorkerDaemonUrl(renderWorkerSettings.daemonUrl);
      let targetDaemonUrl = currentDaemonUrl;
      let routedDaemon: RenderWorkerDaemonStatus | undefined;
      let targetDaemonStatus = renderWorkerDaemonStatus && normalizeRenderWorkerDaemonUrl(renderWorkerDaemonStatus.url) === currentDaemonUrl
        ? renderWorkerDaemonStatus
        : undefined;
      const enrolledDaemonUrls = parseRenderWorkerRemoteDaemonUrls(renderWorkerSettings.remoteDaemonUrls);
      if (renderWorkerSettings.autoRoute && (renderWorkerFleet.length > 0 || enrolledDaemonUrls.length > 0)) {
        const candidateUrls = Array.from(new Set([
          currentDaemonUrl,
          ...enrolledDaemonUrls,
          ...renderWorkerFleet.map((worker) => normalizeRenderWorkerDaemonUrl(worker.url)),
        ]));
        const refreshedFleet = (await Promise.all(candidateUrls.map(async (daemonUrl) => {
          try {
            return await fetchRenderWorkerDaemonStatus(daemonUrl, {
              authToken: renderWorkerSettings.authToken,
              timeoutMs: RENDER_WORKER_DISCOVERY_TIMEOUT_MS,
            });
          } catch {
            return undefined;
          }
        }))).filter((status): status is RenderWorkerDaemonStatus => Boolean(status));
        if (isStaleSubmit()) {
          return;
        }

        if (refreshedFleet.length > 0) {
          routedDaemon = selectRenderWorkerDaemonForHandoff(refreshedFleet, currentDaemonUrl, {
            trustedWorkers: trustedRenderWorkers,
          });
          setRenderWorkerFleet(sortRenderWorkerFleet(refreshedFleet));
          if (routedDaemon) {
            targetDaemonUrl = normalizeRenderWorkerDaemonUrl(routedDaemon.url);
            targetDaemonStatus = routedDaemon;
            setRenderWorkerDaemonStatus(routedDaemon);
            setRenderWorkerSettings((current) => ({
              ...current,
              daemonUrl: targetDaemonUrl,
            }));
            setRenderWorkerStatus(`Render worker auto-routed to ${routedDaemon.workerId}; preparing handoff...`);
          }
        }
      }

      if (!targetDaemonStatus || normalizeRenderWorkerDaemonUrl(targetDaemonStatus.url) !== targetDaemonUrl) {
        targetDaemonStatus = await fetchRenderWorkerDaemonStatus(targetDaemonUrl, {
          authToken: renderWorkerSettings.authToken,
          timeoutMs: RENDER_WORKER_REQUEST_TIMEOUT_MS,
        });
        if (isStaleSubmit()) {
          return;
        }

        setRenderWorkerDaemonStatus(targetDaemonStatus);
        setRenderWorkerFleet((current) => upsertRenderWorkerFleetStatus(current, targetDaemonStatus!));
      }

      const trustDecision = evaluateRenderWorkerCentralTrustPolicy(targetDaemonStatus, trustedRenderWorkers);
      if (!trustDecision.allowed) {
        const message = `Render worker submit blocked by trust policy: ${trustDecision.reason}`;
        setRenderWorkerStatus(message);
        setStatus(message);
        return;
      }

      const exportProject = await prepareProjectForExport(project);
      if (isStaleSubmit()) {
        return;
      }

      const packagePlan = resolveProjectPackageExportPlan(exportProject);
      const directorySelection = await selectProjectPackageDirectory({
        mode: 'export',
        defaultPath: packagePlan.packageDirectory,
      });
      if (isStaleSubmit()) {
        return;
      }

      if (directorySelection.available && directorySelection.canceled) {
        setRenderWorkerStatus('Render worker handoff canceled');
        setStatus('Render worker handoff canceled');
        return;
      }

      const packageResult = await exportProjectPackageBestAvailable(exportProject, {
        ...packagePlan,
        packageDirectory: directorySelection.directory ?? packagePlan.packageDirectory,
      });
      if (isStaleSubmit()) {
        return;
      }

      if (!packageResult.response?.projectFilePath) {
        throw new Error('Render worker handoff requires Electron project package export with a local project file path.');
      }

      const batchId = `worker-${Date.now()}`;
      const handoffPlan = buildRenderWorkerControllerHandoff({
        project: exportProject,
        profileIds,
        projectFilePath: packageResult.response.projectFilePath,
        exportRange: exportRangeRequest,
        playhead,
        batchId,
        workerCwd: renderWorkerSettings.workerCwd,
        workerExecutable: renderWorkerSettings.workerExecutable,
      });

      if (!handoffPlan.canSubmit || !handoffPlan.manifest) {
        setRenderWorkerStatus(handoffPlan.status);
        setStatus(handoffPlan.status);
        return;
      }

      const accepted = await submitRenderWorkerDaemonRun(targetDaemonUrl, {
        manifest: handoffPlan.manifest,
        runId: batchId,
        dryRun: renderWorkerSettings.dryRun,
        executeBlocked: renderWorkerSettings.executeBlocked,
      }, {
        authToken: renderWorkerSettings.authToken,
        timeoutMs: RENDER_WORKER_SUBMIT_TIMEOUT_MS,
      });
      if (isStaleSubmit()) {
        return;
      }

      const nextRun = await fetchRenderWorkerDaemonRun(targetDaemonUrl, accepted.runId, {
        authToken: renderWorkerSettings.authToken,
        timeoutMs: RENDER_WORKER_REQUEST_TIMEOUT_MS,
      });
      if (isStaleSubmit()) {
        return;
      }

      const daemonStatus = await fetchRenderWorkerDaemonStatus(targetDaemonUrl, {
        authToken: renderWorkerSettings.authToken,
        timeoutMs: RENDER_WORKER_REQUEST_TIMEOUT_MS,
      });
      if (isStaleSubmit()) {
        return;
      }

      setRenderWorkerRun(nextRun);
      setRenderWorkerDaemonStatus(daemonStatus);
      setRenderWorkerFleet((current) => upsertRenderWorkerFleetStatus(current, daemonStatus));
      setRenderWorkerSettings((current) => ({
        ...current,
        daemonUrl: normalizeRenderWorkerDaemonUrl(targetDaemonUrl),
      }));
      const routedText = routedDaemon ? ` via ${routedDaemon.workerId}` : '';
      setRenderWorkerStatus(`Render worker run submitted${routedText}: ${accepted.runId}`);
      setStatus(`Render worker run submitted${routedText}: ${accepted.runId}`);
    } catch (error) {
      if (isStaleSubmit()) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      setRenderWorkerStatus(`Render worker submit failed: ${message}`);
      setStatus(`Render worker submit failed: ${message}`);
    } finally {
      if (!isStaleSubmit()) {
        setIsSubmittingRenderWorker(false);
      }
    }
  };

  const handleQueueRenderProject = async () => {
    const requestGeneration = projectReplacementGenerationRef.current;
    const startState = resolveRenderQueueStartState();
    setIsRendering(startState.isRendering);
    setStatus(startState.status);

    try {
      const outputSelection = await selectRenderOutputPath({
        project,
        profileId: activeExportProfileId,
        title: 'Queue render output',
        buttonLabel: 'Queue render',
      });
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        setIsRendering(false);
        return;
      }

      if (outputSelection.available && outputSelection.canceled) {
        setIsRendering(false);
        setStatus('Render queue canceled');
        return;
      }

      const exportProject = await prepareProjectForExport(project);
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        setIsRendering(false);
        return;
      }

      const requestPlan = resolveRenderQueueRequestPlan({
        project: exportProject,
        profileId: activeExportProfileId,
        exportRange: exportRangeRequest,
        playhead,
        priority: queueSettings.defaultRenderPriority,
        outputPath: outputSelection.filePath,
      });

      if (!requestPlan.canQueue) {
        setStatus(requestPlan.status);
        setIsRendering(requestPlan.isRendering);
        return;
      }

      const job = await queueRenderJob(requestPlan.request);
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        setIsRendering(false);
        return;
      }

      const renderState = resolveQueuedRenderJobState(job);
      setRenderJob(renderState.renderJob);
      setRenderJobs((current) => mergeRenderJobHistory(current, job));
      if (renderState.renderPlan) {
        setRenderPlan(renderState.renderPlan);
      }
      setRenderOutputPath(renderState.renderOutputPath);
      setStatus(renderState.status);
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        setIsRendering(false);
        return;
      }

      const failureState = resolveRenderFailureState(error);
      setStatus(failureState.status);
      setIsRendering(failureState.isRendering);
    }
  };

  const handleQueueBatchRenderProject = async () => {
    const requestGeneration = projectReplacementGenerationRef.current;
    const profileIds = resolveBatchExportProfileIds(project, batchExportProfileIds, activeExportProfileId);
    setBatchExportProfileIds(profileIds);

    const startState = resolveRenderBatchQueueStartState(profileIds.length);
    setIsRendering(startState.isRendering);
    setStatus(startState.status);

    try {
      const exportProject = await prepareProjectForExport(project);
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        setIsRendering(false);
        return;
      }

      const requestPlan = resolveRenderBatchQueueRequestPlan({
        project: exportProject,
        profileIds,
        exportRange: exportRangeRequest,
        playhead,
        priority: queueSettings.defaultRenderPriority,
      });

      if (!requestPlan.canQueue) {
        setStatus(requestPlan.status);
        setIsRendering(requestPlan.isRendering);
        return;
      }

      const jobs: RenderJobView[] = [];
      for (const request of requestPlan.requests) {
        jobs.push(await queueRenderJob(request));
        if (projectReplacementGenerationRef.current !== requestGeneration) {
          setIsRendering(false);
          return;
        }
      }

      const renderState = resolveQueuedRenderBatchState(jobs);
      setRenderJob(renderState.renderJob);
      setRenderJobs((current) => mergeRenderJobHistory(current, jobs));
      if (renderState.renderPlan) {
        setRenderPlan(renderState.renderPlan);
      }
      setRenderOutputPath(renderState.renderOutputPath);
      setStatus(renderState.status);
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        setIsRendering(false);
        return;
      }

      const failureState = resolveRenderFailureState(error);
      setStatus(failureState.status);
      setIsRendering(failureState.isRendering);
    }
  };

  const handleCancelRender = async () => {
    if (!renderJob) {
      return;
    }

    try {
      const cancelledJob = await cancelRenderJob(renderJob.id);
      const renderState = resolveCancelledRenderJobState(cancelledJob);
      setRenderJob(renderState.renderJob);
      setRenderJobs((current) => mergeRenderJobHistory(current, cancelledJob));
      setIsRendering(renderState.isRendering);
      setStatus(renderState.status);
    } catch (error) {
      setStatus(resolveRenderFailureState(error).status);
    }
  };

  const handleRetryRender = async () => {
    if (!renderJob) {
      return;
    }

    if (!canRetryRenderDiagnostic(renderJob.diagnostic)) {
      setIsRendering(false);
      setStatus(formatRenderRetryBlockedStatus(renderJob.diagnostic) ?? 'Resolve the render diagnostic before retrying');
      return;
    }

    const startState = resolveRenderRetryStartState();
    const requestGeneration = projectReplacementGenerationRef.current;
    setIsRendering(startState.isRendering);
    setStatus(startState.status);

    try {
      const exportProject = await prepareProjectForExport(project);
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        setIsRendering(false);
        return;
      }

      const job = await retryRenderJob(renderJob.id, {
        project: exportProject,
        profileId: activeExportProfileId,
        exportRange: exportRangeRequest,
        outputPath: renderJob.outputPath,
        priority: queueSettings.defaultRenderPriority,
        encoderPreference: 'auto',
      });
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        setIsRendering(false);
        return;
      }

      const renderState = resolveRetriedRenderJobState(job);
      setRenderJob(renderState.renderJob);
      setRenderJobs((current) => mergeRenderJobHistory(current, job));
      if (renderState.renderPlan) {
        setRenderPlan(renderState.renderPlan);
      }
      setRenderOutputPath(renderState.renderOutputPath);
      setStatus(renderState.status);
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        setIsRendering(false);
        return;
      }

      const failureState = resolveRenderFailureState(error);
      setStatus(failureState.status);
      setIsRendering(failureState.isRendering);
    }
  };

  const handleOpenRenderOutput = async () => {
    if (!renderOutputPath) {
      return;
    }

    const requestGeneration = projectReplacementGenerationRef.current;
    const result = await openNativeRenderOutputPath(renderOutputPath);
    if (projectReplacementGenerationRef.current !== requestGeneration) {
      return;
    }

    if (!result.available) {
      setStatus(`Use the output link to open ${renderOutputPath}`);
      return;
    }

    setStatus(result.ok ? `Opened rendered file: ${result.path}` : `Open rendered file failed: ${result.error ?? result.path}`);
  };

  const handleRevealRenderOutput = async () => {
    if (!renderOutputPath) {
      return;
    }

    const requestGeneration = projectReplacementGenerationRef.current;
    const result = await revealNativeRenderOutputPath(renderOutputPath);
    if (projectReplacementGenerationRef.current !== requestGeneration) {
      return;
    }

    if (!result.available) {
      setStatus(`Use the output link to locate ${renderOutputPath}`);
      return;
    }

    setStatus(result.ok ? `Showing rendered file: ${result.path}` : `Show rendered file failed: ${result.error ?? result.path}`);
  };

  const handleResolveRenderDiagnosticAction = async (action: RenderDiagnosticActionView) => {
    const resolution = resolveRenderDiagnosticActionPlan({
      action,
      evidence: renderJob?.diagnostic?.evidence,
      plan: renderJob?.plan ?? renderPlan,
      availableAssetIds: assetById,
      exportProfiles: project.exportProfiles,
    });

    switch (resolution.kind) {
      case 'relink': {
        handleSelectSourceAsset(resolution.assetId);
        await handleRelinkAsset(resolution.assetId);
        return;
      }
      case 'profile':
        setSelectedExportProfileId(resolution.profileId);
        setStatus(resolution.status);
        return;
      case 'output':
        await handleRenderProject();
        return;
      case 'retry':
        await handleRetryRender();
        return;
      case 'timeline':
        setTimelinePlayhead(resolution.playhead);
        setStatus(resolution.status);
        return;
      case 'status':
      default:
        setStatus(resolution.status);
    }
  };

  const handleQueueComfyUIBatch = async () => {
    const startState = resolveComfyUIQueueStartState();
    const requestGeneration = projectReplacementGenerationRef.current;
    setIsQueueingComfyUI(startState.isQueueingComfyUI);
    setStatus(startState.status);

    try {
      const nextJob = await queueComfyUIBatchJob({
        project,
        selectedClipIds,
        priority: queueSettings.defaultComfyUIPriority,
        execute: false,
      });
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      const queueState = resolveQueuedComfyUIJobState(nextJob);
      setComfyUIJob(queueState.job);
      setIsQueueingComfyUI(queueState.isQueueingComfyUI);
      if (queueState.status) {
        setStatus(queueState.status);
      }
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      const failureState = resolveComfyUIQueueFailureState(error);
      setStatus(failureState.status);
      setIsQueueingComfyUI(failureState.isQueueingComfyUI);
    }
  };

  const handleCancelComfyUIBatch = async () => {
    if (!comfyUIJob) {
      return;
    }

    const requestGeneration = projectReplacementGenerationRef.current;
    try {
      const queueState = resolveCancelledComfyUIJobState(await cancelComfyUIQueueJob(comfyUIJob.id));
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setComfyUIJob(queueState.job);
      setIsQueueingComfyUI(queueState.isQueueingComfyUI);
      if (queueState.status) {
        setStatus(queueState.status);
      }
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setStatus(resolveComfyUIQueueFailureState(error).status);
    }
  };

  const handleRetryComfyUIBatch = async () => {
    if (!comfyUIJob) {
      return;
    }

    const startState = resolveComfyUIRetryStartState();
    const requestGeneration = projectReplacementGenerationRef.current;
    setIsQueueingComfyUI(startState.isQueueingComfyUI);
    setStatus(startState.status);

    try {
      const nextJob = await retryComfyUIQueueJob({
        jobId: comfyUIJob.id,
        priority: queueSettings.defaultComfyUIPriority,
        execute: comfyUIJob.execute,
      });
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      const queueState = resolveRetriedComfyUIJobState(nextJob);
      setComfyUIJob(queueState.job);
      setIsQueueingComfyUI(queueState.isQueueingComfyUI);
      if (queueState.status) {
        setStatus(queueState.status);
      }
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      const failureState = resolveComfyUIQueueFailureState(error);
      setStatus(failureState.status);
      setIsQueueingComfyUI(failureState.isQueueingComfyUI);
    }
  };

  const handleImportComfyUIResults = () => {
    const plan = resolveComfyUIResultActionPlan(comfyUIJob, 'import');
    if (!plan.canApply) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    commitProject(plan.commitLabel!, (current) => (
      applyComfyUIResultAssets(current, plan.results, { mode: 'candidate-track' })
    ));
    setStatus(plan.status!);
  };

  const handleReplaceWithComfyUIResults = () => {
    const plan = resolveComfyUIResultActionPlan(comfyUIJob, 'replace');
    if (!plan.canApply) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    commitProject(plan.commitLabel!, (current) => (
      applyComfyUIResultAssets(current, plan.results, { mode: 'replace-source' })
    ));
    setStatus(plan.status!);
  };

  const handleApplyComfyUIResultsAsAiEffectPass = () => {
    const plan = resolveComfyUIResultActionPlan(comfyUIJob, 'effect-pass');
    if (!plan.canApply) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    commitProject(plan.commitLabel!, (current) => (
      plan.results.reduce((nextProject, result) => (
        result.status === 'completed' && (result.source || result.renderPath)
          ? applyComfyUIResultAsAiEffectPass(nextProject, result, { presetId: 'restoration-detail' })
          : nextProject
      ), current)
    ));
    setStatus(plan.status!);
  };

  const handleQueueSttCaptions = async () => {
    const startState = resolveSttQueueStartState();
    const requestGeneration = projectReplacementGenerationRef.current;
    setIsRunningStt(startState.isRunningStt);
    setStatus(startState.status);

    try {
      const sttWaveformAssetIds = (selectedClipIds.length > 0 ? selectedClips : allClips)
        .map((clip) => clip.assetId);
      const projectForStt = applyRuntimeWaveformsToProject({
        project,
        assetIds: sttWaveformAssetIds,
        audioPeaksByAssetId,
      });
      const nextJob = await queueSttCaptionJob({
        project: projectForStt,
        selectedClipIds,
        priority: queueSettings.defaultSttPriority,
        execute: true,
      });
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      const queueState = resolveQueuedSttJobState(nextJob);
      setSttJob(queueState.job);
      setIsRunningStt(queueState.isRunningStt);
      if (queueState.status) {
        setStatus(queueState.status);
      }
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      const failureState = resolveSttQueueFailureState(error);
      setStatus(failureState.status);
      setIsRunningStt(failureState.isRunningStt);
    }
  };

  const handleCancelStt = async () => {
    if (!sttJob) {
      return;
    }

    const requestGeneration = projectReplacementGenerationRef.current;
    try {
      const queueState = resolveCancelledSttJobState(await cancelSttCaptionJob(sttJob.id));
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setSttJob(queueState.job);
      setIsRunningStt(queueState.isRunningStt);
      if (queueState.status) {
        setStatus(queueState.status);
      }
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      setStatus(resolveSttQueueFailureState(error).status);
    }
  };

  const handleRetryStt = async () => {
    if (!sttJob) {
      return;
    }

    const startState = resolveSttRetryStartState();
    const requestGeneration = projectReplacementGenerationRef.current;
    setIsRunningStt(startState.isRunningStt);
    setStatus(startState.status);

    try {
      const nextJob = await retrySttCaptionJob({
        jobId: sttJob.id,
        priority: queueSettings.defaultSttPriority,
        execute: sttJob.execute,
        language: sttJob.language,
        engine: sttJob.engine,
      });
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      const queueState = resolveRetriedSttJobState(nextJob);
      setSttJob(queueState.job);
      setIsRunningStt(queueState.isRunningStt);
      if (queueState.status) {
        setStatus(queueState.status);
      }
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        return;
      }

      const failureState = resolveSttQueueFailureState(error);
      setStatus(failureState.status);
      setIsRunningStt(failureState.isRunningStt);
    }
  };

  const handleImportSttCaptions = () => {
    const plan = resolveSttImportCaptionPlan(sttJob);
    if (!plan.canImport) {
      if (plan.status) {
        setStatus(plan.status);
      }
      return;
    }

    commitProject(plan.commitLabel!, (current) => importCaptionSegments(current, plan.captions, 'append'));
    setSelectedCaptionIds(plan.selectedCaptionIds);
    setStatus(plan.status!);
  };

  const handleSelectSttCaptionIssues = () => {
    const plan = resolveSttIssueSelectionPlan({ project, review: sttCaptionReview });
    if (!plan.canSelect) {
      setStatus(plan.status);
      return;
    }

    setSelectedCaptionIds(plan.selectedCaptionIds);
    if (plan.playhead !== undefined) {
      setTimelinePlayhead(plan.playhead);
    }
    setStatus(plan.status);
  };

  const handleCleanSttCaptions = () => {
    const readiness = resolveSttCleanupReadiness(sttCaptionReview);
    if (!readiness.canClean) {
      setStatus(readiness.status ?? 'No STT captions to clean');
      return;
    }

    let cleanupResult: SttCaptionCleanupResult | undefined;
    commitProject('STT captions cleaned', (current) => {
      cleanupResult = cleanSttCaptions(current);
      return cleanupResult.project;
    });

    if (!cleanupResult) {
      return;
    }

    const resultState = resolveSttCleanupResultState(cleanupResult);
    setSelectedCaptionIds(resultState.selectedCaptionIds);
    setStatus(resultState.status);
  };

  const handleDiarizeSpeakers = () => {
    const plan = resolveSpeakerDiarizationPlan({
      project,
      selectedCaptionIds,
      review: sttCaptionReview,
    });
    if (!plan.canApply) {
      setStatus(plan.status ?? 'No captions to diarize');
      return;
    }

    let diarizationResult: SpeakerDiarizationApplyResult | undefined;

    try {
      const committed = commitProject('Speaker diarization applied', (current) => {
        diarizationResult = applySpeakerDiarization(current, {
          targetCaptionIds: plan.targetCaptionIds,
          includeNonStt: plan.includeNonStt,
        });
        return diarizationResult.project;
      });

      if (!diarizationResult) {
        return;
      }

      const resultState = resolveSpeakerDiarizationResultState({ result: diarizationResult, committed });
      setSelectedCaptionIds(resultState.selectedCaptionIds);
      if (resultState.playhead !== undefined) {
        setTimelinePlayhead(resultState.playhead);
      }
      setStatus(resultState.status);
    } catch (error) {
      setStatus(resolveSpeakerDiarizationFailureStatus(error));
    }
  };

  const handleRenderProject = async () => {
    const requestGeneration = projectReplacementGenerationRef.current;
    const startState = resolveImmediateRenderStartState();
    setIsRendering(startState.isRendering);
    setStatus(startState.status);

    try {
      const outputSelection = await selectRenderOutputPath({
        project,
        profileId: activeExportProfileId,
        title: 'Render video output',
        buttonLabel: 'Render',
      });
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        setIsRendering(false);
        return;
      }

      if (outputSelection.available && outputSelection.canceled) {
        setStatus('Render canceled');
        return;
      }

      const exportProject = await prepareProjectForExport(project);
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        setIsRendering(false);
        return;
      }

      const result = await renderProjectNow(resolveImmediateRenderRequestPlan({
        project: exportProject,
        profileId: activeExportProfileId,
        exportRange: exportRangeRequest,
        outputPath: outputSelection.filePath,
      }));
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        setIsRendering(false);
        return;
      }

      const renderState = resolveImmediateRenderCompletedState(result);
      setRenderOutputPath(renderState.renderOutputPath);
      setRenderPlan(renderState.renderPlan);
      setIsRendering(renderState.isRendering);
      setStatus(renderState.status);
    } catch (error) {
      if (projectReplacementGenerationRef.current !== requestGeneration) {
        setIsRendering(false);
        return;
      }

      const failureState = resolveRenderFailureState(error);
      setStatus(failureState.status);
      setIsRendering(failureState.isRendering);
    } finally {
      if (projectReplacementGenerationRef.current === requestGeneration) {
        setIsRendering(false);
      }
    }
  };

  const handleRunPaletteCommand = (commandId: EditorCommandId, payload?: CommandPaletteItemPayload) => {
    runEditorPaletteCommand(commandId, {
      state: {
        editMode,
        playhead,
        projectDuration: project.duration,
        projectFps: project.fps,
        rippleMode,
        activePreviewCacheAssetIds,
      },
      actions: {
        resetCommandPalette: () => {
          setCommandPaletteOpen(false);
          setCommandPaletteQuery('');
          setCommandPaletteActiveIndex(0);
        },
        saveProject: handleSaveProject,
        openCommandPalette,
        toggleActiveMonitorPlayback,
        shuttlePlayback: handleShuttlePlayback,
        toggleLoopPlayback: handleToggleLoopPlayback,
        setTimelinePlayhead,
        nudgePlayhead: handleNudgePlayhead,
        nudgeProgramLayer: handleProgramMotionNudge,
        jumpAdjacentEdit: handleJumpAdjacentEdit,
        split: handleSplit,
        undo: handleUndo,
        redo: handleRedo,
        selectAllClips: handleSelectAllClips,
        duplicateSelection: handleDuplicateSelectedClips,
        groupSelection: handleGroupSelectedClips,
        ungroupSelection: handleUngroupSelectedClips,
        selectClipAtPlayhead: handleSelectClipAtPlayhead,
        selectMarkedRange: handleSelectMarkedRange,
        selectClipsRelativeToPlayhead: handleSelectClipsRelativeToPlayhead,
        copySelected: handleCopySelected,
        cutSelected: handleCutSelected,
        pasteClipboard: handlePasteClipboard,
        copyClipAttributes: handleCopyClipAttributes,
        pasteClipAttributes: handlePasteClipAttributes,
        pasteClipboardAtIn: handlePasteClipboardAtIn,
        appendClipboard: handleAppendClipboard,
        arrangeSelectedClips: handleArrangeSelectedClips,
        copyMarkedRange: handleCopyMarkedRange,
        cutMarkedRange: handleCutMarkedRange,
        deleteMarkedRange: handleDeleteMarkedRange,
        escape: handleEscape,
        deleteSelected: handleDeleteSelected,
        deleteSide: handleDeleteSide,
        trimToPlayhead: (edge) => handleTrimToPlayhead(edge, timelinePlayheadEditTargetClip, true),
        setStatus,
        moveSelected: handleMoveSelected,
        slideSelected: handleSlideSelected,
        applyTransition: handleApplyTransition,
        moveSelectionToPlayhead: handleMoveSelectionToPlayhead,
        setMark: handleSetMark,
        goToMark: handleGoToMark,
        markSelectedClips: handleMarkSelectedClips,
        clearMarks: handleClearMarks,
        addMarkerAtPlayhead: handleAddMarkerAtPlayhead,
        jumpAdjacentMarker: handleJumpAdjacentMarker,
        splitActiveCaption: handleSplitActiveCaption,
        mergeSelectedCaptions: handleMergeSelectedCaptions,
        nudgeSourcePlayhead: handleNudgeSourcePlayhead,
        toggleSourceLoopPlayback: handleToggleSourceLoopPlayback,
        goToSourceBoundary: handleGoToSourceBoundary,
        setSourceMark: handleSetSourceMark,
        goToSourceMark: handleGoToSourceMark,
        clearSourceMarks: handleClearSourceMarks,
        matchFrameToSource: handleMatchFrameToSource,
        replaceSelectedFromSource: handleReplaceSelectedFromSource,
        threePointAssetEdit: handleThreePointAssetEdit,
        editModeChange: handleEditModeChange,
        insertGapAtPlayhead: handleInsertGapAtPlayhead,
        closeGapAtPlayhead: handleCloseGapAtPlayhead,
        closeAllGapsOnTrack: handleCloseAllGapsOnTrack,
        toggleSnapRipple: () => setSnapEnabled((current) => !current),
        fitTimelineZoom: handleFitTimelineZoom,
        relinkMissingMedia: handleBulkRelinkMissingMedia,
        rebuildSelectedMediaCache: handleRebuildSelectedMediaCache,
        rebuildPreviewMediaCache: handleRebuildPreviewMediaCache,
        buildExport: handleBuildExport,
        queueRender: handleQueueRenderProject,
      },
    }, payload);
  };

  return (
    <main
      className="min-h-screen bg-paper text-ink"
      data-hydrated={editorHydrated ? 'true' : 'false'}
      data-testid="editor-shell"
      data-active-primary-mode={activePrimaryModeId ?? 'custom'}
      data-active-asset-panel={activeAssetPanel}
      data-active-dock-panel={activeDockPanel}
    >
      <CommandPalette
        open={commandPaletteOpen}
        query={commandPaletteQuery}
        items={commandPaletteState.items}
        activeIndex={commandPaletteState.activeIndex}
        resultCount={commandPaletteState.resultCount}
        hiddenCount={commandPaletteState.hiddenCount}
        hiddenLabel={commandPaletteState.hiddenLabel}
        onQueryChange={setCommandPaletteQuery}
        onActiveIndexChange={setCommandPaletteActiveIndex}
        onRunCommand={handleRunPaletteCommand}
        onClose={() => setCommandPaletteOpen(false)}
      />
      <EditorTopToolbar
        fileInputRef={fileInputRef}
        lutFileInputRef={lutFileInputRef}
        projectPackageFileInputRef={projectPackageFileInputRef}
        relinkFileInputRef={relinkFileInputRef}
        bulkRelinkFileInputRef={bulkRelinkFileInputRef}
        canUndo={history.length > 0}
        canRedo={future.length > 0}
        canPackSelection={selectedClips.length >= 2}
        canSplitAtPlayhead={splitAtPlayheadPlan.canSplit}
        canTrimSelectionToPlayhead={Boolean(selectedClip)}
        selectedClipCount={selectedClipIds.length}
        clipboardClipCount={clipboardClips.length}
        hasAttributeClipboard={Boolean(attributeClipboard)}
        hasInMark={markIn !== null}
        hasOutMark={markOut !== null}
        hasMarkedRange={Boolean(markedRange)}
        historyCount={history.length}
        futureCount={future.length}
        saveStateLabel={projectSaveStateLabel}
        saveStateClassName={projectSaveStateClassName}
        status={status}
        rippleMode={rippleMode}
        snapEnabled={snapEnabled}
        loopPlaybackEnabled={activeMonitor === 'source' ? sourceLoopPlaybackEnabled : loopPlaybackEnabled}
        editMode={editMode}
        isRendering={isRendering}
        renderBlockedByPreflight={renderBlockedByPreflight}
        isQueueingComfyUI={isQueueingComfyUI}
        isRunningStt={isRunningStt}
        onImportFiles={handleImportFiles}
        onImportLutFile={handleImportLutFile}
        onProjectPackageFileChange={handleProjectPackageFileChange}
        onRelinkAssetFileChange={handleRelinkAssetFileChange}
        onBulkRelinkAssetFileChange={handleBulkRelinkAssetFileChange}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onImportMedia={() => void handleImportMediaRequest()}
        onOpenCommandPalette={openCommandPalette}
        onSplit={handleSplit}
        onSplitAll={handleSplitAll}
        onTrimIn={() => handleTrimToPlayhead('start')}
        onTrimOut={() => handleTrimToPlayhead('end')}
        onPreviousEdit={() => handleJumpAdjacentEdit('previous')}
        onNextEdit={() => handleJumpAdjacentEdit('next')}
        onDeleteSelection={() => handleDeleteSelected(false)}
        onRippleDeleteSelection={() => handleDeleteSelected(true)}
        onGroupSelection={handleGroupSelectedClips}
        onUngroupSelection={handleUngroupSelectedClips}
        onCopySelection={handleCopySelected}
        onDuplicateSelection={handleDuplicateSelectedClips}
        onCopyAttributes={handleCopyClipAttributes}
        onPaste={handlePasteClipboard}
        onPasteAttributes={handlePasteClipAttributes}
        onPasteAtIn={handlePasteClipboardAtIn}
        onAppend={handleAppendClipboard}
        onMatchFrame={handleMatchFrameToSource}
        onReplaceSelectedFromSource={handleReplaceSelectedFromSource}
        onSelectAtPlayhead={() => handleSelectClipAtPlayhead()}
        onMoveSelectionToPlayhead={handleMoveSelectionToPlayhead}
        onPackSelection={() => handleArrangeSelectedClips(0)}
        onInsertGap={handleInsertGapAtPlayhead}
        onSelectLeft={() => handleSelectClipsRelativeToPlayhead('left')}
        onSelectRight={() => handleSelectClipsRelativeToPlayhead('right')}
        onSetInMark={() => handleSetMark('in')}
        onSetOutMark={() => handleSetMark('out')}
        onGoToInMark={() => handleGoToMark('in')}
        onGoToOutMark={() => handleGoToMark('out')}
        onMarkSelection={handleMarkSelectedClips}
        onClearMarks={handleClearMarks}
        onSelectMarkedRange={() => handleSelectMarkedRange()}
        onCopyMarkedRange={() => handleCopyMarkedRange()}
        onCutMarkedRange={() => handleCutMarkedRange(false, rippleMode)}
        onLiftMarkedRange={() => handleDeleteMarkedRange(false)}
        onExtractMarkedRange={() => handleDeleteMarkedRange(true)}
        onCloseGap={handleCloseGapAtPlayhead}
        onCloseAllGaps={handleCloseAllGapsOnTrack}
        onRippleModeChange={() => setRippleMode((current) => !current)}
        onSnapEnabledChange={() => setSnapEnabled((current) => !current)}
        onToggleLoopPlayback={handleToggleLoopPlayback}
        onEditModeChange={handleEditModeChange}
        onBuildExport={() => void handleBuildExport()}
        onQueueRender={() => void handleQueueRenderProject()}
        onQueueComfyUIBatch={() => void handleQueueComfyUIBatch()}
        onQueueSttCaptions={() => void handleQueueSttCaptions()}
      />

      <section
        data-testid="editor-workspace-layout"
        data-layout-density="commercial-compact"
        data-asset-column-width="420"
        data-inspector-column-width="300"
        data-timeline-row-height={timelinePanelHeight}
        data-resizable-layout="true"
        style={{ '--timeline-row-height': `${timelinePanelHeight}px` } as CSSProperties}
        // Column ladder: the side panels give way to the monitor as the window
        // narrows, rather than the whole workspace collapsing into one column.
        className="grid min-h-[calc(100vh-3.25rem)] grid-cols-1 bg-paper p-2 ed:h-[calc(100vh-3.25rem)] ed:grid-cols-[52px_360px_minmax(0,1fr)_270px] ed:grid-rows-[minmax(0,1fr)_var(--timeline-row-height)] ed:gap-2 ed:overflow-hidden xl:grid-cols-[52px_420px_minmax(0,1fr)_300px] 2xl:grid-cols-[52px_520px_minmax(0,1fr)_340px]"
      >
        <nav data-testid="editor-primary-modes" className="flex min-w-0 items-stretch gap-1 overflow-x-auto bg-surface px-2 py-2 ed:col-start-1 ed:row-span-2 ed:flex-col ed:items-center ed:overflow-y-auto ed:overflow-x-hidden ed:rounded-sm ed:px-1" aria-label={editorText.chrome.assetPanels}>
          {EDITOR_PRIMARY_MODES.map((mode) => {
            const displayMode = readEditorPrimaryModeDisplay(mode.id, menuLanguage);
            const displayAssetPanel = readEditorAssetPanelDisplay(mode.assetPanel, menuLanguage);
            const displayDockPanel = readEditorDockPanel(mode.dockPanel, menuLanguage);

            return (
            <button
              key={mode.id}
              type="button"
              data-testid={`editor-primary-mode-${mode.id}`}
              data-mode-asset-panel={mode.assetPanel}
              data-mode-dock-panel={mode.dockPanel}
              title={`${displayMode.label}: ${displayAssetPanel.label} / ${displayDockPanel.label}`}
              aria-pressed={activePrimaryModeId === mode.id}
              onClick={() => handlePrimaryModeSelect(mode)}
              // The rail is icon-only at desktop width, as the prototype has it:
              // a 34px square per mode, name in the tooltip. Below xl it lays
              // out as a horizontal strip and can afford the label.
              className={`flex h-12 w-[78px] shrink-0 flex-col items-center justify-center gap-1 rounded-md px-1 text-meta font-semibold transition ed:h-[34px] ed:w-[34px] ed:gap-0 ed:px-0 ${
                activePrimaryModeId === mode.id
                  ? 'bg-accent text-white'
                  : 'text-ds-700 hover:bg-ds-200 hover:text-ink'
              }`}
            >
              <span className={`grid h-5 min-w-5 place-items-center rounded px-1 text-micro leading-none ed:h-auto ed:min-w-0 ed:bg-transparent ed:px-0 ed:text-xs ${
                activePrimaryModeId === mode.id ? 'bg-white/20 text-white' : 'bg-ds-200 text-ds-700 ed:bg-transparent ed:text-inherit'
              }`}>
                {mode.shortLabel}
              </span>
              <span className="max-w-full truncate ed:hidden">{displayMode.label}</span>
            </button>
            );
          })}

          {/* The asset panels used to be a second 96px icon column inside the
              bay, sitting right beside this one and doing the same kind of job.
              They live here now, under a hairline, so the left edge carries one
              navigation instead of two — and the bay gets that width back. */}
          <div className="hidden shrink-0 self-stretch border-t border-ds-300 ed:block ed:my-1 ed:w-6" aria-hidden="true" />
          <div className="ml-1 hidden w-px shrink-0 self-stretch bg-ds-300 ed:hidden" aria-hidden="true" />

          {EDITOR_ASSET_PANELS.map((panel) => {
            const displayPanel = readEditorAssetPanelDisplay(panel.id, menuLanguage);

            return (
              <button
                key={panel.id}
                type="button"
                data-testid={`editor-asset-panel-${panel.id}`}
                title={displayPanel.label}
                aria-pressed={activeAssetPanel === panel.id}
                onClick={() => setActiveAssetPanel(panel.id)}
                className={`flex h-12 w-[78px] shrink-0 flex-col items-center justify-center gap-1 rounded-md px-1 text-meta font-semibold transition ed:h-[34px] ed:w-[34px] ed:gap-0 ed:px-0 ${
                  activeAssetPanel === panel.id
                    ? 'bg-accent2 text-white'
                    : 'text-ds-700 hover:bg-ds-200 hover:text-ink'
                }`}
              >
                <span className="text-micro leading-none ed:text-xs">{panel.shortLabel}</span>
                <span className="max-w-full truncate ed:hidden">{displayPanel.label}</span>
              </button>
            );
          })}

          {/* Broadsheet ships two grounds; the rail carries the switch, as in
              the prototype. The monitors stay dark either way. */}
          <button
            type="button"
            data-testid="editor-theme-toggle"
            aria-pressed={theme === 'light'}
            title={theme === 'light' ? editorText.chrome.themeToDark : editorText.chrome.themeToLight}
            onClick={toggleTheme}
            className="flex h-9 w-[78px] shrink-0 items-center justify-center gap-1 rounded-md text-meta font-semibold text-ds-700 transition hover:bg-ds-200 hover:text-ink ed:mt-auto ed:h-[30px] ed:w-[30px]"
          >
            <span aria-hidden="true">{theme === 'light' ? '☾' : '☀'}</span>
            <span className="max-w-full truncate ed:hidden">{theme === 'light' ? editorText.chrome.themeLight : editorText.chrome.themeDark}</span>
          </button>
        </nav>

        <aside
          data-testid="editor-asset-bay"
          data-panel-density="compact"
          className="flex max-h-[70vh] min-h-0 flex-col overflow-hidden bg-surface ed:max-h-none ed:col-start-2 ed:row-start-1 ed:h-full ed:rounded-sm"
        >
          {/* One line, not three: the bay names itself and the active panel on
              the same baseline. Broadsheet gives the 19px display size to the
              inspector, which names the selected clip — the bay only needs its
              kicker, and the height goes to the list instead. */}
          <div className="px-3 pb-2 pt-2">
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex min-w-0 items-baseline gap-2">
                <p className="shrink-0 text-micro font-semibold uppercase tracking-[0.1em] text-accent-700">{editorText.chrome.assetBay}</p>
                <h1 className="truncate font-heading text-sm font-semibold leading-tight text-ink">
                  {readEditorAssetPanelDisplay(activeAssetPanel, menuLanguage).label}
                </h1>
              </div>
              <button
                type="button"
                title={editorText.chrome.importToBay}
                onClick={() => void handleImportMediaRequest()}
                className="rounded border border-ds-300 px-2 py-1 text-xs font-medium text-ds-800 hover:border-ds-500 hover:bg-surface"
              >
                {editorText.chrome.import}
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1">

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className={activeAssetPanel === 'project' ? 'space-y-4' : 'hidden'}>
            <ProjectOverviewPanel
              name={project.name}
              fps={project.fps}
              width={project.width}
              clipCount={allClips.length}
            />

          <ProjectSettingsPanel
            project={project}
            onChange={handleProjectSettingsChange}
          />

          <EditorApiTokenPanel />

          <SavedProjectsPanel
            projects={savedProjects}
            onRefresh={() => void refreshProjects()}
            onCreateProject={handleCreateNewProject}
            onLoadProject={(projectId) => void handleLoadProject(projectId)}
            onDeleteProject={(projectId) => void handleDeleteSavedProject(projectId)}
            onSaveCopy={() => void handleSaveProjectCopy()}
            onExportPackage={handleDownloadProjectPackage}
            onImportPackage={handleImportProjectPackage}
            onSyncCloudFolder={() => void handleSyncProjectCloudFolder()}
            cloudSyncConflictPending={projectCloudSyncForcePlan.status === 'ready'}
            onImportCloudSyncProject={() => void handleImportCloudSyncProject()}
            onForceSyncCloudFolder={() => void handleSyncProjectCloudFolder(true)}
            sampleProjectAvailable={sampleProjectAvailable}
            onOpenSampleProject={handleOpenSampleProject}
          />

          <AutosavePanel
            autosaves={autosaves}
            autosaveStatus={autosaveStatus}
            saveStateLabel={projectSaveStateLabel}
            saveStateClassName={projectSaveStateClassName}
            onSaveNow={() => void saveAutosaveSnapshot('manual')}
            onRestoreAutosave={(projectId) => void handleRestoreAutosave(projectId)}
            onDeleteAutosave={(projectId) => void handleDeleteAutosave(projectId)}
          />

          <ProjectRecoveryPanel
            recoveryIndex={projectRecoveryState.index}
            recoveryStatus={projectRecoveryState.status}
            onLoadProject={(projectId) => void handleLoadProject(projectId)}
            onRestoreAutosave={(projectId) => void handleRestoreAutosave(projectId)}
            onRestoreLocalFallback={handleRestoreLocalProjectFallback}
            onRestorePackageImport={handleRestoreImportedProjectPackage}
          />
            </div>

            <div className={activeAssetPanel === 'templates' ? 'space-y-4' : 'hidden'}>
              <CreatorTemplatesPanel
                onApplyTemplate={handleApplyCreatorTemplate}
              />
            </div>

            <div className={activeAssetPanel === 'health' ? 'space-y-4' : 'hidden'}>
          <MediaHealthPanel
            report={mediaHealth}
            assetById={assetById}
            onSelectAsset={handleSelectSourceAsset}
            onRelinkAsset={handleRelinkAsset}
            onCacheAsset={(asset) => void handleRebuildMediaCache(asset)}
          />
            </div>

            <div className={activeAssetPanel === 'media' ? 'space-y-4' : 'hidden'}>
          <MediaBinPanel
            assets={filteredMediaAssets}
            totalAssetCount={project.assets.length}
            fps={project.fps}
            isDropActive={mediaFileDropActive}
            unusedAssetCount={unusedAssetCount}
            searchQuery={mediaSearchQuery}
            kindFilter={mediaKindFilter}
            smartFilter={mediaSmartFilter}
            binFilter={mediaBinFilter}
            sortKey={mediaSortKey}
            smartCollections={mediaSmartCollections}
            binCollections={mediaBinCollections}
            mediaCachePlan={filteredMediaCachePlan}
            bulkRelinkCandidateCount={bulkRelinkCandidateCount}
            selectedAssetId={selectedSourceAsset?.id}
            draggingAssetId={draggingAssetId ?? undefined}
            assetReferenceCounts={assetReferenceCounts}
            healthByAssetId={mediaHealthByAssetId}
            cacheJobsByAssetId={cacheJobsByAssetId}
            onDragOver={handleMediaBinDragOver}
            onDrop={handleMediaBinDrop}
            onDragLeave={(event) => {
              const nextTarget = event.relatedTarget as Node | null;
              if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
                setMediaFileDropActive(false);
              }
            }}
            onImportMedia={() => void handleImportMediaRequest()}
            onBulkRelinkAssets={() => void handleBulkRelinkMissingMedia()}
            onAddSharedLibraryAsset={handleAddSharedLibraryAsset}
            voiceoverState={voiceoverState}
            voiceoverSupported={voiceoverRecorderSupport.supported}
            voiceoverUnavailableReason={voiceoverRecorderSupport.reason}
            onStartVoiceover={() => void handleStartVoiceoverRecording()}
            onStopVoiceover={() => void handleStopVoiceoverRecording()}
            onRemoveUnusedAssets={handleRemoveUnusedAssets}
            onRebuildFilteredMediaCache={handleRebuildFilteredMediaCache}
            onSearchQueryChange={setMediaSearchQuery}
            onKindFilterChange={setMediaKindFilter}
            onSmartFilterChange={setMediaSmartFilter}
            onBinFilterChange={setMediaBinFilter}
            onSortKeyChange={setMediaSortKey}
            onAssetDragStart={handleAssetDragStart}
            onAssetDragEnd={() => {
              setDraggingAssetId(null);
              setAssetDropPreview(null);
              showTimelineEditGuide(null);
            }}
            onAssetPointerDragStart={handleAssetPointerDragStart}
            onSelectSourceAsset={handleSelectSourceAsset}
            onRebuildMediaCache={handleRebuildMediaCache}
            onRelinkAsset={handleRelinkAsset}
            onRemoveAsset={handleRemoveAsset}
            onInsertAsset={handleInsertAsset}
            onOverwriteAsset={handleOverwriteAsset}
            onCancelMediaCache={handleCancelMediaCache}
            onRetryMediaCache={handleRetryMediaCache}
            sourceControls={selectedSourceAsset && selectedSourceRange ? (
              <SourceAssetRangePanel
                asset={selectedSourceAsset}
                range={selectedSourceRange}
                assetBin={selectedSourceAssetBin}
                fps={project.fps}
                sourceDuration={selectedSourceDuration}
                markedRange={markedRange}
                playhead={playhead}
                hasPrimaryPatch={selectedSourceHasPrimaryPatch}
                hasAudioPatch={selectedSourceHasAudioPatch}
                primaryPatchEnabled={sourcePrimaryPatchEnabled}
                audioPatchEnabled={sourceAudioPatchEnabled}
                primaryPatchTrackId={activeSourcePrimaryPatchTrackId}
                audioPatchTrackId={activeSourceAudioPatchTrackId}
                primaryPatchTrackName={activeSourcePrimaryPatchTrack?.name}
                audioPatchTrackName={activeSourceAudioPatchTrack?.name}
                primaryPatchTrackOptions={sourcePrimaryPatchTrackOptions}
                audioPatchTrackOptions={sourceAudioPatchTrackOptions}
                canReplaceSelected={Boolean(selectedClip)}
                onAssetBinChange={handleUpdateSelectedSourceBin}
                onRangePatch={(patch) => handleSourceRangePatch(selectedSourceAsset.id, patch)}
                onTogglePrimaryPatch={() => setSourcePrimaryPatchEnabled((current) => !current)}
                onToggleAudioPatch={() => setSourceAudioPatchEnabled((current) => !current)}
                onPrimaryPatchTrackChange={(trackId) => applyTrackSelectionPlan(resolveSourcePatchTrackSelectionPlan({
                  trackId,
                  targetKind: 'primary',
                }))}
                onAudioPatchTrackChange={(trackId) => applyTrackSelectionPlan(resolveSourcePatchTrackSelectionPlan({
                  trackId,
                  targetKind: 'audio',
                }))}
                onResetRange={() => handleResetSourceRange(selectedSourceAsset.id)}
                onMatchMarkedRange={() => handleMatchSourceRangeToMarkedRange(selectedSourceAsset.id)}
                onCreateSubclip={handleCreateSourceSubclip}
                onInsert={() => handleThreePointAssetEdit('insert', selectedSourceAsset.id)}
                onOverwrite={() => handleThreePointAssetEdit('overwrite', selectedSourceAsset.id)}
                onReplaceSelected={handleReplaceSelectedFromSource}
              />
            ) : null}
          />
            </div>
          </div>
          </div>
        </aside>

        <section
          className="flex max-h-[70vh] min-h-0 min-w-0 flex-col overflow-hidden bg-surface ed:max-h-none ed:col-start-3 ed:row-start-1 ed:h-full ed:rounded-sm"
          data-testid="editor-monitor-workspace"
          data-active-monitor={activeMonitor}
          data-source-monitor-visible={sourceMonitorVisible ? 'true' : 'false'}
          data-scene-readout-visible={sceneReadoutVisible ? 'true' : 'false'}
        >
          <div className="px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ds-700">
              <div className="flex items-center gap-2">
                <span className="font-semibold uppercase tracking-wide text-ds-600">{editorText.chrome.editWorkspace}</span>
                <span className="rounded border border-ds-200 px-2 py-0.5 text-ds-700">
                  {activePrimaryModeId
                    ? readEditorPrimaryModeDisplay(activePrimaryModeId, menuLanguage).label
                    : editorText.chrome.customWorkspace}
                </span>
                <div
                  role="group"
                  aria-label={editorText.chrome.activeMonitor}
                  data-testid="editor-monitor-switcher"
                  className="flex shrink-0 rounded border border-ds-200 bg-paper"
                >
                  <button
                    type="button"
                    data-testid="editor-monitor-switch-program"
                    aria-pressed={activeMonitor === 'program'}
                    onClick={handleActivateProgramMonitor}
                    className={`px-2.5 py-1 text-meta font-medium ${
                      activeMonitor === 'program'
                        ? 'bg-accent-500/15 text-accent-900'
                        : 'text-ds-600 hover:bg-surface hover:text-ds-800'
                    }`}
                  >
                    {editorText.chrome.program}
                  </button>
                  <button
                    type="button"
                    data-testid="editor-monitor-switch-source"
                    title={editorText.chrome.showSourceMonitor}
                    aria-pressed={activeMonitor === 'source'}
                    onClick={handleActivateSourceMonitor}
                    className={`border-l border-ds-200 px-2.5 py-1 text-meta font-medium ${
                      activeMonitor === 'source'
                        ? 'bg-accent-500/15 text-accent-900'
                        : 'text-ds-600 hover:bg-surface hover:text-ds-800'
                    }`}
                  >
                    {editorText.chrome.source}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  data-testid="editor-source-monitor-toggle"
                  aria-pressed={sourceMonitorVisible}
                  onClick={handleToggleSourceMonitorPanel}
                  className={`rounded border px-2 py-1 text-meta font-medium ${
                    sourceMonitorVisible
                      ? 'border-info-500/60 bg-info-500/10 text-info-900'
                      : 'border-ds-200 text-ds-700 hover:border-ds-400 hover:text-ink'
                  }`}
                >
                  {sourceMonitorVisible ? editorText.chrome.hideSource : editorText.chrome.showSource}
                </button>
                <button
                  type="button"
                  data-testid="editor-scene-readout-toggle"
                  aria-pressed={sceneReadoutVisible}
                  onClick={() => setSceneReadoutVisible((current) => !current)}
                  className={`rounded border px-2 py-1 text-meta font-medium ${
                    sceneReadoutVisible
                      ? 'border-accent-500/60 bg-accent-500/10 text-accent-900'
                      : 'border-ds-200 text-ds-700 hover:border-ds-400 hover:text-ink'
                  }`}
                >
                  {editorText.chrome.info}
                </button>
              </div>
              <span className="tabular-nums text-ds-700">{formatTimecode(playhead, project.fps)}</span>
            </div>
          </div>
          <div className={`grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto border-b border-ds-200 p-3 ${editorMonitorGridClass}`}>
            {sourceMonitorVisible ? (
              <SourceMonitor
                asset={selectedSourceAsset}
                range={selectedSourceRange}
                playhead={sourcePlayhead}
                playbackRate={sourcePlaybackRate}
                loopPlaybackEnabled={sourceLoopPlaybackEnabled}
                audioPeaksByAssetId={audioPeaksByAssetId}
                fps={project.fps}
                active={activeMonitor === 'source'}
                onActivate={() => setActiveMonitor('source')}
                onPlayheadChange={setSourceMonitorPlayhead}
                onPlaybackRateChange={(rate) => {
                  const playbackState = resolveSourceMonitorPlaybackRateState(rate);
                  setActiveMonitor(playbackState.activeMonitor);
                  setSourcePlaybackRate(playbackState.sourcePlaybackRate);
                }}
                onToggleLoopPlayback={handleToggleLoopPlayback}
                onGoToStart={() => handleGoToSourceBoundary('start')}
                onGoToEnd={() => handleGoToSourceBoundary('end')}
                onSetIn={() => handleSetSourceMark('in')}
                onSetOut={() => handleSetSourceMark('out')}
                onGoToIn={() => handleGoToSourceMark('in')}
                onGoToOut={() => handleGoToSourceMark('out')}
                onClearMarks={handleClearSourceMarks}
                onRangeHandleDrag={handleSourceRangeHandleDrag}
                onInsert={() => handleThreePointAssetEdit('insert', selectedSourceAsset?.id)}
                onOverwrite={() => handleThreePointAssetEdit('overwrite', selectedSourceAsset?.id)}
                compact
                onClose={() => {
                  setSourceMonitorPinned(false);
                  setActiveMonitor('program');
                }}
              />
            ) : null}
            <PreviewStage
              stack={programPreviewStack}
              audioMeter={programAudioMeter}
              audioAnalysis={programAudioAnalysisWithFft}
              isPlaying={isPlaying}
              playbackRate={timelinePlaybackRate}
              playhead={playhead}
              duration={project.duration}
              fps={project.fps}
              active={activeMonitor === 'program'}
              onActivate={() => setActiveMonitor('program')}
              selectedClipId={selectedClipId}
              canEditSelectedMotion={selectedCanUseProgramMonitorMotion}
              canEditSelectedCrop={selectedCanApplyCropPreset}
              onMotionDragCommit={handleProgramMotionDragCommit}
              onCropDragCommit={handleProgramCropDragCommit}
              onSelectPreviewClip={handleProgramPreviewClipSelect}
              onTogglePlayback={toggleProgramPlayback}
              onPlayheadChange={handleProgramMonitorPlayheadChange}
              activeCacheJobAssetIds={activeCacheJobAssetIds}
              cacheJobsByAssetId={cacheJobsByAssetId}
              onQueuePreviewCache={(assetIds) => void handleRebuildPreviewMediaCache(assetIds)}
              onAudioFftSample={handleProgramAudioFftSample}
              onVideoScopeReadout={handleProgramVideoScopeReadout}
              audioAnalyzerVisible={sceneReadoutVisible}
            />
            {sceneReadoutVisible ? (
              <SceneReadoutPanel
                stack={programPreviewStack}
                audioMeter={programAudioMeter}
                audioAnalysis={programAudioAnalysisWithFft}
                videoScopeReadout={programVideoScopeReadout}
                selectedClip={selectedClip}
                selectedClipCount={selectedClipIds.length}
                activeMonitor={activeMonitor}
                sourcePlaybackRate={sourcePlaybackRate}
                timelinePlaybackRate={timelinePlaybackRate}
              />
            ) : null}
          </div>
        </section>

        <aside
          data-testid="editor-inspector-panel"
          data-panel-density="clustered"
          className="flex max-h-[70vh] min-h-0 flex-col overflow-hidden bg-surface ed:max-h-none ed:col-start-4 ed:row-start-1 ed:h-full ed:rounded-sm"
        >
          {/* The EDIT / WORKFLOW chip that used to sit here said the same thing
              as the group labels directly below it, so it is gone. The clip
              name holds one line instead of wrapping to two — the full name is
              in the tooltip. */}
          <div className="px-3 pb-2 pt-2">
            <div className="min-w-0">
              <PanelTitle
                eyebrow={editorText.chrome.inspector}
                title={activeDockPanel === 'clip' ? selectedClip?.name ?? editorText.chrome.selectClip : readEditorDockPanel(activeDockPanel, menuLanguage).label}
                titleClassName="mt-0.5 truncate font-heading text-lg font-semibold leading-tight text-ink"
              />
            </div>
            <div
              data-testid="inspector-dock-tabs"
              className="mt-2 space-y-1.5"
            >
              <InspectorDockTabList
                label={editorText.chrome.edit}
                testId="inspector-edit-dock-tabs"
                panels={listEditorDockPanels(EDITOR_EDIT_DOCK_PANEL_IDS, menuLanguage)}
                activeDockPanel={activeDockPanel}
                onSelect={setActiveDockPanel}
              />
              <InspectorDockTabList
                label={editorText.chrome.workflow}
                testId="inspector-workflow-dock-tabs"
                panels={listEditorDockPanels(EDITOR_WORKFLOW_DOCK_PANEL_IDS, menuLanguage)}
                activeDockPanel={activeDockPanel}
                onSelect={setActiveDockPanel}
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {selectedClip ? (
            <>
            <div className={activeDockPanel === 'clip' ? 'space-y-4' : 'hidden'}>
              <InspectorMotionPanel
                motionEffect={selectedMotionEffect}
                motionTransform={selectedMotionTransform}
                canApplyMotionPreset={selectedCanApplyMotionPreset}
                canUseMotion={selectedCanUseMotion}
                testIdPrefix="inspector-primary-transform"
                onMotionTransformPatch={handleMotionTransformPatch}
                onApplyMotionPreset={handleApplyMotionPreset}
                onResetMotionTransform={handleResetMotionTransform}
              />

              <InspectorKeyframesPanel
                clip={selectedClip}
                fps={project.fps}
                localTime={selectedClipLocalTime}
                keyframes={selectedClipKeyframes}
                keyframeDraft={keyframeDraft}
                onKeyframeDraftPropertyChange={handleKeyframeDraftPropertyChange}
                onKeyframeDraftChange={(patch) => setKeyframeDraft((current) => ({ ...current, ...patch }))}
                onAddKeyframeAtPlayhead={handleAddKeyframeAtPlayhead}
                onKeyframePatch={handleKeyframePatch}
                onDeleteKeyframe={handleDeleteKeyframe}
                formatTimecode={formatTimecode}
              />

              <InspectorCommandPanels
                fps={project.fps}
                clipArrangeGap={clipArrangeGap}
                precisionEditStepFrames={precisionEditStepFrames}
                selectedClipCount={selectedClips.length}
                clipboardClipCount={clipboardClips.length}
                hasAttributeClipboard={Boolean(attributeClipboard)}
                hasMarkedRange={Boolean(markedRange)}
                canSplitAtPlayhead={splitAtPlayheadPlan.canSplit}
                selectedCanRelinkAudio={selectedCanRelinkAudio}
                onSplit={handleSplit}
                onSplitAll={handleSplitAll}
                onTrimToPlayhead={handleTrimToPlayhead}
                onDeleteSide={handleDeleteSide}
                onDuplicateSelectedClips={handleDuplicateSelectedClips}
                onGroupSelectedClips={handleGroupSelectedClips}
                onUngroupSelectedClips={handleUngroupSelectedClips}
                onCopySelected={handleCopySelected}
                onCopyClipAttributes={handleCopyClipAttributes}
                onCutSelected={handleCutSelected}
                onPasteClipboard={handlePasteClipboard}
                onPasteClipAttributes={handlePasteClipAttributes}
                onAppendClipboard={handleAppendClipboard}
                onMatchFrameToSource={handleMatchFrameToSource}
                onSetMark={handleSetMark}
                onDeleteMarkedRange={handleDeleteMarkedRange}
                onDeleteSelected={handleDeleteSelected}
                onMoveSelected={handleMoveSelected}
                onApplyTransition={handleApplyTransition}
                onClipArrangeGapChange={setClipArrangeGap}
                onPrecisionEditStepFramesChange={(value) => setPrecisionEditStepFrames(resolvePrecisionEditStepFrames(value))}
                onArrangeSelectedClips={handleArrangeSelectedClips}
                onSlipSelected={handleSlipSelected}
                onRollTrimSelected={handleRollTrimSelected}
                onSlideSelected={handleSlideSelected}
                onLinkedAudioSplitEdit={handleLinkedAudioSplitEdit}
              />

              <InspectorClipMediaPanel
                clip={selectedClip}
                asset={selectedClipAsset}
                mediaHealth={selectedClipAsset ? mediaHealthByAssetId.get(selectedClipAsset.id) : undefined}
                cacheJob={selectedClipAsset ? cacheJobsByAssetId[selectedClipAsset.id] : undefined}
                tracks={project.tracks}
                fps={project.fps}
                projectHeight={project.height}
                summary={selectedClipSummary}
                moveTrackOptions={selectedClipMoveTrackOptions}
                isTitleClip={selectedIsTitleClip}
                titleText={selectedTitleText}
                selectedAnyHasSpeedRamp={selectedAnyHasSpeedRamp}
                selectedHasSpeedRamp={selectedHasSpeedRamp}
                selectedSpeedRampPoints={selectedSpeedRampPoints}
                canApplyFreezeFrame={selectedCanApplyFreezeFrame}
                canClearFreezeFrame={selectedCanClearFreezeFrame}
                canDetachAudio={selectedCanDetachAudio}
                canRelinkAudio={selectedCanRelinkAudio}
                canUnlinkAudio={selectedCanUnlinkAudio}
                canLinkAudio={selectedCanLinkAudio}
                onClipPatch={handleClipPatch}
                onSelectedClipsPatch={handleSelectedClipsPatch}
                onMoveSelectedClipsToTrack={handleMoveSelectedClipsToTrack}
                onTitleTextPatch={handleTitleTextPatch}
                onTitleStylePatch={handleTitleStylePatch}
                onInspectorStartChange={handleInspectorStartChange}
                onInspectorDurationChange={handleInspectorDurationChange}
                onRetimeSpeedChange={handleRetimeSpeedChange}
                onApplySpeedRamp={handleApplySpeedRamp}
                onClearSpeedRamp={handleClearSpeedRamp}
                onToggleSelectedClipState={handleToggleSelectedClipState}
                onApplyFreezeFrame={handleApplyFreezeFrame}
                onClearFreezeFrame={handleClearFreezeFrame}
                onDetachAudio={handleDetachSelectedAudio}
                onRelinkAudio={handleRelinkSelectedAudio}
                onUnlinkAudio={handleUnlinkSelectedAudio}
                onLinkAudio={handleLinkSelectedAudio}
                onRebuildMediaCache={handleRebuildMediaCache}
                onCancelMediaCache={handleCancelMediaCache}
                onRetryMediaCache={handleRetryMediaCache}
                onRelinkAsset={handleRelinkAsset}
                formatTimecode={formatTimecode}
              />

              {selectedComfyUIBinding ? (
                <details className="rounded-md border border-accent2-500/30 bg-surface p-3">
                  {/* Folded by default: this is integration setup, not a
                      property of the clip you are looking at. The status stays
                      on the summary so you can see it without opening. */}
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                    <h2 className="text-kicker font-heading font-semibold uppercase text-accent2-800">{editorText.chrome.comfyBinding}</h2>
                    <span className={`rounded px-2 py-0.5 text-meta ${
                      selectedComfyUIBinding.status === 'rendered'
                        ? 'bg-accent-500/10 text-accent-800'
                        : 'bg-accent2-500/10 text-accent2-900'
                    }`}>
                      {selectedComfyUIBinding.status}
                    </span>
                  </summary>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="block text-xs text-ds-600">
                      {editorText.chrome.comfyPreset}
                      <select
                        value={selectedComfyUIBinding.presetId}
                        disabled={!selectedCanEditComfyUIBinding}
                        onChange={(event) => handleComfyUIPresetChange(event.currentTarget.value)}
                        className="mt-1 w-full rounded-md border border-ds-200 bg-paper px-2 py-2 text-sm text-ink outline-none focus:border-accent2-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {listComfyUIWorkflowPresets(project).map((preset) => (
                          <option key={preset.id} value={preset.id}>{preset.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs text-ds-600">
                      {editorText.chrome.workflow}
                      <input
                        key={`${selectedClip.id}-${selectedComfyUIBinding.workflowName}-workflow`}
                        defaultValue={selectedComfyUIBinding.workflowName}
                        disabled={!selectedCanEditComfyUIBinding}
                        onBlur={(event) => {
                          if (event.currentTarget.value !== selectedComfyUIBinding.workflowName) {
                            handleComfyUIBindingPatch({ workflowName: event.currentTarget.value, status: 'draft' });
                          }
                        }}
                        className="mt-1 w-full rounded-md border border-ds-200 bg-paper px-2 py-2 text-sm text-ink outline-none focus:border-accent2-600 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </label>
                  </div>
                  <label className="mt-3 block text-xs text-ds-600">
                    {editorText.chrome.comfyPrompt}
                    <textarea
                      key={`${selectedClip.id}-${selectedComfyUIBinding.prompt}-prompt`}
                      defaultValue={selectedComfyUIBinding.prompt}
                      disabled={!selectedCanEditComfyUIBinding}
                      rows={3}
                      onBlur={(event) => {
                        if (event.currentTarget.value !== selectedComfyUIBinding.prompt) {
                          handleComfyUIBindingPatch({ prompt: event.currentTarget.value, status: 'draft' });
                        }
                      }}
                      className="mt-1 w-full resize-none rounded-md border border-ds-200 bg-paper px-2 py-2 text-sm text-ink outline-none focus:border-accent2-600 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </label>
                  <label className="mt-3 block text-xs text-ds-600">
                    {editorText.chrome.comfyNegativePrompt}
                    <textarea
                      key={`${selectedClip.id}-${selectedComfyUIBinding.negativePrompt}-negative`}
                      defaultValue={selectedComfyUIBinding.negativePrompt}
                      disabled={!selectedCanEditComfyUIBinding}
                      rows={2}
                      onBlur={(event) => {
                        if (event.currentTarget.value !== selectedComfyUIBinding.negativePrompt) {
                          handleComfyUIBindingPatch({ negativePrompt: event.currentTarget.value, status: 'draft' });
                        }
                      }}
                      className="mt-1 w-full resize-none rounded-md border border-ds-200 bg-paper px-2 py-2 text-sm text-ink outline-none focus:border-accent2-600 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </label>
                  <div className="mt-3 grid grid-cols-2 gap-2 2xl:grid-cols-5">
                    <NumberField
                      label={editorText.chrome.comfySeed}
                      value={selectedComfyUIBinding.seed}
                      step={1}
                      min={0}
                      disabled={!selectedCanEditComfyUIBinding}
                      onChange={(value) => handleComfyUIBindingPatch({ seed: Math.round(value), status: 'draft' })}
                    />
                    <NumberField
                      label={editorText.chrome.comfySteps}
                      value={readWorkflowNumber(selectedComfyUIBinding.parameters.steps, 24)}
                      step={1}
                      min={1}
                      max={150}
                      disabled={!selectedCanEditComfyUIBinding}
                      onChange={(value) => handleComfyUIBindingPatch({ parameters: { steps: Math.round(value) }, status: 'draft' })}
                    />
                    <NumberField
                      label={editorText.chrome.comfyCfg}
                      value={readWorkflowNumber(selectedComfyUIBinding.parameters.cfg, 6)}
                      step={0.1}
                      min={0}
                      max={30}
                      disabled={!selectedCanEditComfyUIBinding}
                      onChange={(value) => handleComfyUIBindingPatch({ parameters: { cfg: value }, status: 'draft' })}
                    />
                    <NumberField
                      label={editorText.chrome.comfyWidth}
                      value={readWorkflowNumber(selectedComfyUIBinding.parameters.width, project.width)}
                      step={2}
                      min={64}
                      max={8192}
                      disabled={!selectedCanEditComfyUIBinding}
                      onChange={(value) => handleComfyUIBindingPatch({ parameters: { width: Math.round(value) }, status: 'draft' })}
                    />
                    <NumberField
                      label={editorText.chrome.comfyHeight}
                      value={readWorkflowNumber(selectedComfyUIBinding.parameters.height, project.height)}
                      step={2}
                      min={64}
                      max={8192}
                      disabled={!selectedCanEditComfyUIBinding}
                      onChange={(value) => handleComfyUIBindingPatch({ parameters: { height: Math.round(value) }, status: 'draft' })}
                    />
                  </div>
                  <div className="mt-3 rounded border border-ds-200 bg-paper p-2 text-meta text-ds-700">
                    {selectedComfyUIBinding.preset.description}
                  </div>
                </details>
              ) : null}

              <InspectorTechnicalPanel clip={selectedClip} />
            </div>

            <div className={activeDockPanel === 'video' ? 'mt-4 space-y-4' : 'hidden'}>
              <InspectorVisualPanel
                clip={selectedClip}
                fps={project.fps}
                visualFadeDuration={visualFadeDuration}
                visualFadeClipCount={selectedVisualFadeClipIds.length}
                canApplyCanvasLayout={selectedCanApplyCanvasLayout}
                canApplyVisualFade={selectedCanApplyVisualFade}
                canvasLayoutMode={selectedCanvasLayoutMode}
                onVisualFadeDurationChange={setVisualFadeDuration}
                onApplyCanvasLayout={handleApplyCanvasLayout}
                onApplyVisualFade={handleApplyVisualFade}
              />
            </div>

            <div className={activeDockPanel === 'audio' ? 'mt-4 space-y-4' : 'hidden'}>
              <InspectorAudioPanel
                clip={selectedClip}
                fps={project.fps}
                audioFadeDuration={audioFadeDuration}
                audioFadeClipCount={selectedAudioFadeClipIds.length}
                canApplyAudioFade={selectedCanApplyAudioFade}
                hasAudioSyncPair={Boolean(selectedAudioSyncPair)}
                canSyncByWaveform={selectedCanSyncByWaveform}
                lastAudioSyncPlan={lastAudioSyncPlan}
                onAudioFadeDurationChange={setAudioFadeDuration}
                onApplyAudioFade={handleApplyAudioFade}
                onSyncByWaveform={handleSyncSelectedAudioByWaveform}
                formatSignedEditDelta={formatSignedEditDelta}
              />
            </div>

            <div className={activeDockPanel === 'video' ? 'space-y-4' : 'hidden'}>
              <InspectorMotionPanel
                motionEffect={selectedMotionEffect}
                motionTransform={selectedMotionTransform}
                canApplyMotionPreset={selectedCanApplyMotionPreset}
                canUseMotion={selectedCanUseMotion}
                onMotionTransformPatch={handleMotionTransformPatch}
                onApplyMotionPreset={handleApplyMotionPreset}
                onResetMotionTransform={handleResetMotionTransform}
              />

              <InspectorTransitionPanel
                clip={selectedClip}
                fps={project.fps}
                onApplyTransition={handleApplyTransition}
                onTransitionPatch={handleTransitionPatch}
                onRemoveTransition={handleRemoveTransition}
              />

              <InspectorKeyframesPanel
                clip={selectedClip}
                fps={project.fps}
                localTime={selectedClipLocalTime}
                keyframes={selectedClipKeyframes}
                keyframeDraft={keyframeDraft}
                onKeyframeDraftPropertyChange={handleKeyframeDraftPropertyChange}
                onKeyframeDraftChange={(patch) => setKeyframeDraft((current) => ({ ...current, ...patch }))}
                onAddKeyframeAtPlayhead={handleAddKeyframeAtPlayhead}
                onKeyframePatch={handleKeyframePatch}
                onDeleteKeyframe={handleDeleteKeyframe}
                formatTimecode={formatTimecode}
              />
            </div>

            <div className={activeDockPanel === 'audio' ? 'space-y-4' : 'hidden'}>
              <InspectorAudioAnalysisPanels
                clipId={selectedClip.id}
                fps={project.fps}
                normalizeTargetPeak={audioNormalizeTargetPeak}
                normalizeReadyCount={selectedNormalizeClipIds.length}
                canNormalizeAudio={selectedCanNormalizeAudio}
                peakNormalizePlan={selectedPeakNormalizePlan}
                silenceSettings={silenceSettings}
                silencePlan={silencePlan}
                canRemoveSilence={selectedCanRemoveSilence}
                beatSettings={beatSettings}
                beatPlan={beatPlan}
                canDetectBeats={selectedCanDetectBeats}
                onNormalizeTargetPeakChange={setAudioNormalizeTargetPeak}
                onNormalizeAudioPeak={handleNormalizeAudioPeak}
                onSilenceSettingsPatch={(patch) => setSilenceSettings((current) => ({ ...current, ...patch }))}
                onAnalyzeSilence={handleAnalyzeSilence}
                onRemoveSilence={handleRemoveSilence}
                onBeatSettingsPatch={(patch) => setBeatSettings((current) => ({ ...current, ...patch }))}
                onAnalyzeBeats={handleAnalyzeBeats}
                onAddBeatMarkers={handleAddBeatMarkers}
                onBeatCut={handleBeatCut}
                formatTimecode={formatTimecode}
              />
            </div>

            <div data-testid="inspector-speed-panel" className={activeDockPanel === 'speed' ? 'space-y-4' : 'hidden'}>
              <InspectorClipMediaPanel
                clip={selectedClip}
                asset={selectedClipAsset}
                mediaHealth={selectedClipAsset ? mediaHealthByAssetId.get(selectedClipAsset.id) : undefined}
                cacheJob={selectedClipAsset ? cacheJobsByAssetId[selectedClipAsset.id] : undefined}
                tracks={project.tracks}
                fps={project.fps}
                projectHeight={project.height}
                summary={selectedClipSummary}
                moveTrackOptions={selectedClipMoveTrackOptions}
                isTitleClip={selectedIsTitleClip}
                titleText={selectedTitleText}
                selectedAnyHasSpeedRamp={selectedAnyHasSpeedRamp}
                selectedHasSpeedRamp={selectedHasSpeedRamp}
                selectedSpeedRampPoints={selectedSpeedRampPoints}
                canApplyFreezeFrame={selectedCanApplyFreezeFrame}
                canClearFreezeFrame={selectedCanClearFreezeFrame}
                canDetachAudio={selectedCanDetachAudio}
                canRelinkAudio={selectedCanRelinkAudio}
                canUnlinkAudio={selectedCanUnlinkAudio}
                canLinkAudio={selectedCanLinkAudio}
                onClipPatch={handleClipPatch}
                onSelectedClipsPatch={handleSelectedClipsPatch}
                onMoveSelectedClipsToTrack={handleMoveSelectedClipsToTrack}
                onTitleTextPatch={handleTitleTextPatch}
                onTitleStylePatch={handleTitleStylePatch}
                onInspectorStartChange={handleInspectorStartChange}
                onInspectorDurationChange={handleInspectorDurationChange}
                onRetimeSpeedChange={handleRetimeSpeedChange}
                onApplySpeedRamp={handleApplySpeedRamp}
                onClearSpeedRamp={handleClearSpeedRamp}
                onToggleSelectedClipState={handleToggleSelectedClipState}
                onApplyFreezeFrame={handleApplyFreezeFrame}
                onClearFreezeFrame={handleClearFreezeFrame}
                onDetachAudio={handleDetachSelectedAudio}
                onRelinkAudio={handleRelinkSelectedAudio}
                onUnlinkAudio={handleUnlinkSelectedAudio}
                onLinkAudio={handleLinkSelectedAudio}
                onRebuildMediaCache={handleRebuildMediaCache}
                onCancelMediaCache={handleCancelMediaCache}
                onRetryMediaCache={handleRetryMediaCache}
                onRelinkAsset={handleRelinkAsset}
                formatTimecode={formatTimecode}
              />
            </div>

            <div data-testid="inspector-animation-panel" className={activeDockPanel === 'animation' ? 'space-y-4' : 'hidden'}>
              <InspectorMotionPanel
                motionEffect={selectedMotionEffect}
                motionTransform={selectedMotionTransform}
                canApplyMotionPreset={selectedCanApplyMotionPreset}
                canUseMotion={selectedCanUseMotion}
                testIdPrefix="inspector-animation-transform"
                onMotionTransformPatch={handleMotionTransformPatch}
                onApplyMotionPreset={handleApplyMotionPreset}
                onResetMotionTransform={handleResetMotionTransform}
              />

              <InspectorKeyframesPanel
                clip={selectedClip}
                fps={project.fps}
                localTime={selectedClipLocalTime}
                keyframes={selectedClipKeyframes}
                keyframeDraft={keyframeDraft}
                onKeyframeDraftPropertyChange={handleKeyframeDraftPropertyChange}
                onKeyframeDraftChange={(patch) => setKeyframeDraft((current) => ({ ...current, ...patch }))}
                onAddKeyframeAtPlayhead={handleAddKeyframeAtPlayhead}
                onKeyframePatch={handleKeyframePatch}
                onDeleteKeyframe={handleDeleteKeyframe}
                formatTimecode={formatTimecode}
              />
            </div>

            <div data-testid="inspector-tracking-panel" className={activeDockPanel === 'tracking' ? 'space-y-4' : 'hidden'}>
              <InspectorEffectsPanel
                clip={selectedClip}
                testIdPrefix="inspector-tracking-effects"
                canAddColorEffect={selectedCanAddColorEffect}
                canApplyColorLut={selectedCanApplyColorLut}
                canAddColorMatch={selectedCanAddColorMatch}
                canApplyAiEnhancement={selectedCanApplyAiEnhancement}
                canApplyVisualFilter={selectedCanApplyVisualFilter}
                canAddAudioGain={selectedCanAddAudioGain}
                canApplyAudioCleanup={selectedCanApplyAudioCleanup}
                canApplyStabilize={selectedCanApplyStabilize}
                canAddCropMask={selectedCanAddCropMask}
                canAddSmartReframe={selectedCanAddSmartReframe}
                canTrackSubject={selectedCanTrackSubject}
                canApplyObjectMask={selectedCanApplyObjectMask}
                canApplyCropPreset={selectedCanApplyCropPreset}
                canApplyColorPreset={selectedCanApplyColorPreset}
                onAddColorEffect={handleAddColorEffect}
                onRequestLutFile={() => lutFileInputRef.current?.click()}
                onAddColorMatchEffect={handleAddColorMatchEffect}
                onApplyAiEnhancementPreset={handleApplyAiEnhancementPreset}
                onApplyVisualFilterPreset={handleApplyVisualFilterPreset}
                onAddAudioGainEffect={handleAddAudioGainEffect}
                onApplyAudioCleanupPreset={handleApplyAudioCleanupPreset}
                onApplyStabilizePreset={handleApplyStabilizePreset}
                onAddCropMaskEffect={handleAddCropMaskEffect}
                onAddSmartReframeEffect={handleAddSmartReframeEffect}
                onTrackSubjectReframe={handleTrackSubjectReframe}
                onApplyTrackedObjectMask={handleApplyTrackedObjectMask}
                onApplyCropPreset={handleApplyCropPreset}
                onApplyColorPreset={handleApplyColorPreset}
                onToggleClipEffect={handleToggleClipEffect}
                onMoveClipEffect={handleMoveClipEffect}
                onRemoveClipEffect={handleRemoveClipEffect}
                onEffectParameterChange={handleEffectParameterChange}
              />
            </div>

            <div data-testid="inspector-adjust-panel" className={activeDockPanel === 'adjust' ? 'space-y-4' : 'hidden'}>
              <InspectorEffectsPanel
                clip={selectedClip}
                testIdPrefix="inspector-adjust-effects"
                canAddColorEffect={selectedCanAddColorEffect}
                canApplyColorLut={selectedCanApplyColorLut}
                canAddColorMatch={selectedCanAddColorMatch}
                canApplyAiEnhancement={selectedCanApplyAiEnhancement}
                canApplyVisualFilter={selectedCanApplyVisualFilter}
                canAddAudioGain={selectedCanAddAudioGain}
                canApplyAudioCleanup={selectedCanApplyAudioCleanup}
                canApplyStabilize={selectedCanApplyStabilize}
                canAddCropMask={selectedCanAddCropMask}
                canAddSmartReframe={selectedCanAddSmartReframe}
                canTrackSubject={selectedCanTrackSubject}
                canApplyObjectMask={selectedCanApplyObjectMask}
                canApplyCropPreset={selectedCanApplyCropPreset}
                canApplyColorPreset={selectedCanApplyColorPreset}
                onAddColorEffect={handleAddColorEffect}
                onRequestLutFile={() => lutFileInputRef.current?.click()}
                onAddColorMatchEffect={handleAddColorMatchEffect}
                onApplyAiEnhancementPreset={handleApplyAiEnhancementPreset}
                onApplyVisualFilterPreset={handleApplyVisualFilterPreset}
                onAddAudioGainEffect={handleAddAudioGainEffect}
                onApplyAudioCleanupPreset={handleApplyAudioCleanupPreset}
                onApplyStabilizePreset={handleApplyStabilizePreset}
                onAddCropMaskEffect={handleAddCropMaskEffect}
                onAddSmartReframeEffect={handleAddSmartReframeEffect}
                onTrackSubjectReframe={handleTrackSubjectReframe}
                onApplyTrackedObjectMask={handleApplyTrackedObjectMask}
                onApplyCropPreset={handleApplyCropPreset}
                onApplyColorPreset={handleApplyColorPreset}
                onToggleClipEffect={handleToggleClipEffect}
                onMoveClipEffect={handleMoveClipEffect}
                onRemoveClipEffect={handleRemoveClipEffect}
                onEffectParameterChange={handleEffectParameterChange}
              />
            </div>

            <div className={activeDockPanel === 'effects' ? 'space-y-4' : 'hidden'}>
              <InspectorEffectsPanel
                clip={selectedClip}
                testIdPrefix="inspector-effects"
                canAddColorEffect={selectedCanAddColorEffect}
                canApplyColorLut={selectedCanApplyColorLut}
                canAddColorMatch={selectedCanAddColorMatch}
                canApplyAiEnhancement={selectedCanApplyAiEnhancement}
                canApplyVisualFilter={selectedCanApplyVisualFilter}
                canAddAudioGain={selectedCanAddAudioGain}
                canApplyAudioCleanup={selectedCanApplyAudioCleanup}
                canApplyStabilize={selectedCanApplyStabilize}
                canAddCropMask={selectedCanAddCropMask}
                canAddSmartReframe={selectedCanAddSmartReframe}
                canTrackSubject={selectedCanTrackSubject}
                canApplyObjectMask={selectedCanApplyObjectMask}
                canApplyCropPreset={selectedCanApplyCropPreset}
                canApplyColorPreset={selectedCanApplyColorPreset}
                onAddColorEffect={handleAddColorEffect}
                onRequestLutFile={() => lutFileInputRef.current?.click()}
                onAddColorMatchEffect={handleAddColorMatchEffect}
                onApplyAiEnhancementPreset={handleApplyAiEnhancementPreset}
                onApplyVisualFilterPreset={handleApplyVisualFilterPreset}
                onAddAudioGainEffect={handleAddAudioGainEffect}
                onApplyAudioCleanupPreset={handleApplyAudioCleanupPreset}
                onApplyStabilizePreset={handleApplyStabilizePreset}
                onAddCropMaskEffect={handleAddCropMaskEffect}
                onAddSmartReframeEffect={handleAddSmartReframeEffect}
                onTrackSubjectReframe={handleTrackSubjectReframe}
                onApplyTrackedObjectMask={handleApplyTrackedObjectMask}
                onApplyCropPreset={handleApplyCropPreset}
                onApplyColorPreset={handleApplyColorPreset}
                onToggleClipEffect={handleToggleClipEffect}
                onMoveClipEffect={handleMoveClipEffect}
                onRemoveClipEffect={handleRemoveClipEffect}
                onEffectParameterChange={handleEffectParameterChange}
              />

            </div>
            </>
          ) : EDITOR_SELECTED_CLIP_DOCK_PANEL_IDS.includes(activeDockPanel) ? (
            <InspectorEmptySelectionPanel
              panelLabel={readEditorDockPanel(activeDockPanel, menuLanguage).label}
              message={editorText.chrome.emptySelection}
            />
          ) : null}

          <div className={activeDockPanel === 'text' ? 'space-y-4' : 'hidden'}>
          <MarkerPanel
            markers={project.markers}
            fps={project.fps}
            markerLabel={markerLabel}
            onMarkerLabelChange={setMarkerLabel}
            onAddMarkerAtPlayhead={handleAddMarkerAtPlayhead}
            onJumpAdjacentMarker={handleJumpAdjacentMarker}
            onJumpToMarker={handleJumpToMarker}
            onMoveMarkerToPlayhead={handleMoveMarkerToPlayhead}
            onDeleteMarker={handleDeleteMarker}
            onMarkerPatch={handleMarkerPatch}
            formatTimecode={formatTimecode}
          />

          <CaptionEditorPanel
            captions={project.captions}
            selectedCaptionIds={selectedCaptionIds}
            fps={project.fps}
            projectHeight={project.height}
            captionFileInputRef={captionFileInputRef}
            captionSpeakerDraft={captionSpeakerDraft}
            captionTightenGap={captionTightenGap}
            sttCaptionReview={sttCaptionReview}
            speakerDiarizationReport={speakerDiarizationReport}
            onAddCaption={handleAddCaption}
            onGenerateCaptionDraft={() => commitProject('Caption draft generated', (current) => generateCaptionDraft(current))}
            onImportCaptionSidecar={handleImportCaptionSidecar}
            onCaptionSidecarFileChange={(event) => void handleCaptionSidecarFileChange(event)}
            onSelectSttCaptionIssues={handleSelectSttCaptionIssues}
            onCleanSttCaptions={handleCleanSttCaptions}
            onDiarizeSpeakers={handleDiarizeSpeakers}
            onMoveCaptionsToPlayhead={handleMoveCaptionsToPlayhead}
            onSplitActiveCaption={handleSplitActiveCaption}
            onMergeSelectedCaptions={handleMergeSelectedCaptions}
            onDeleteSelectedCaptions={handleDeleteSelectedCaptions}
            onNudgeSelectedCaptions={handleNudgeSelectedCaptions}
            onCaptionSpeakerDraftChange={setCaptionSpeakerDraft}
            onApplyCaptionSpeaker={handleApplyCaptionSpeaker}
            onCaptionTightenGapChange={setCaptionTightenGap}
            onTightenSelectedCaptions={handleTightenSelectedCaptions}
            onJumpToCaption={handleJumpToCaption}
            onSelectCaption={handleSelectCaption}
            onDeleteCaption={handleDeleteCaption}
            onCaptionPatch={handleCaptionPatch}
            onCaptionStylePatch={handleCaptionStylePatch}
            formatTimecode={formatTimecode}
          />

          <ShortcutsPanel />
          </div>

          <div className={activeDockPanel === 'jobs' ? 'space-y-4' : 'hidden'}>
          <QueueSettingsPanel
            queueSettings={queueSettings}
            onPatchQueueSettings={(patch) => setQueueSettings((current) => ({ ...current, ...patch }))}
            onApplyQueueSettings={() => void handleApplyQueueSettings()}
          />

          <AutomationHooksPanel
            automationRuleCount={project.automation.length}
            lastHookPlan={lastHookPlan}
            selectedClipIds={selectedClipIds}
            isQueueingComfyUI={isQueueingComfyUI}
            onRunHooks={(event, context, options) => void runEditorHooks(event, project, context, options)}
          />
          </div>

          <div className={activeDockPanel === 'export' ? 'space-y-4' : 'hidden'}>
          <ExportWorkspacePanel
            renderInputCount={renderPlan.inputs.length}
            exportSettings={{
              exportProfiles: project.exportProfiles,
              activeExportProfileId,
              selectedExportProfile,
              exportManifest,
              renderPlan,
              ffmpegCapabilities,
              exportRangeMode,
              markedRange,
              activeExportRange,
              batchExportProfileIds: resolveBatchExportProfileIds(project, batchExportProfileIds, activeExportProfileId),
              timelineDuration: project.duration,
              fps: project.fps,
              isRendering,
              onSelectExportProfile: setSelectedExportProfileId,
              onToggleBatchExportProfile: handleToggleBatchExportProfile,
              onQueueBatchRender: () => void handleQueueBatchRenderProject(),
              onPatchExportProfile: handleExportProfilePatch,
              onDuplicateExportProfile: handleDuplicateExportProfile,
              onRemoveExportProfile: handleRemoveExportProfile,
              onExportRangeModeChange: setExportRangeMode,
              onMissingMarkedRange: () => setStatus('Set In and Out marks before range export'),
            }}
            exportPreflight={{
              report: renderPreflight,
              mediaCachePlan: preflightMediaCachePlan,
              bulkRelinkCandidateCount,
              fps: project.fps,
              onRebuildMediaCache: handleRebuildPreflightMediaCache,
              onRelinkMissingMedia: handleBulkRelinkMissingMedia,
              onFocusIssue: handleFocusPreflightIssue,
              onResolveIssue: handleResolvePreflightIssue,
              onRelinkIssueAsset: handleRelinkPreflightIssueAsset,
            }}
            masterAudio={{
              settings: masterAudioSettings,
              onChange: handleMasterAudioSettingsChange,
            }}
            captionSidecar={{
              settings: captionSidecarSettings,
              onChange: setCaptionSidecarSettings,
              onDownload: handleDownloadCaptionSidecar,
            }}
            interchange={{
              onDownloadEdl: handleDownloadEdl,
              edlFileInputRef,
              onImportEdl: handleImportEdl,
              onEdlFileChange: handleEdlFileChange,
              onDownloadFcpxml: handleDownloadFcpxml,
              fcpxmlFileInputRef,
              onImportFcpxml: handleImportFcpxml,
              onFcpxmlFileChange: handleFcpxmlFileChange,
              markerFileInputRef,
              onDownloadMarkers: handleDownloadMarkers,
              onImportMarkers: handleImportMarkers,
              onMarkerFileChange: handleMarkerFileChange,
            }}
            previewRenderParity={{
              report: previewRenderParity,
              fps: project.fps,
            }}
            comfyUIBatch={{
              job: comfyUIJob,
              onCancel: handleCancelComfyUIBatch,
              onRetry: handleRetryComfyUIBatch,
              onImportResults: handleImportComfyUIResults,
              onReplaceOriginals: handleReplaceWithComfyUIResults,
              onApplyAsAiEffectPass: handleApplyComfyUIResultsAsAiEffectPass,
            }}
            comfyUIReview={selectedComfyUIReviewItem ? {
              items: comfyUIReviewItems,
              selectedItem: selectedComfyUIReviewItem,
              playhead,
              fps: project.fps,
              onSelect: (automationJobId) => {
                const item = comfyUIReviewItems.find((candidate) => candidate.result.automationJobId === automationJobId);
                setSelectedComfyUIReviewId(automationJobId);
                if (item) {
                  setTimelinePlayhead(item.sourceClip.start);
                  setSelectedClipIds([item.sourceClip.id]);
                  setSelectedClipId(item.sourceClip.id);
                }
              },
              onImportAll: handleImportComfyUIResults,
              onReplaceAll: handleReplaceWithComfyUIResults,
              onApplyAllAsAiEffectPass: handleApplyComfyUIResultsAsAiEffectPass,
            } : null}
            sttJob={{
              job: sttJob,
              onCancel: handleCancelStt,
              onRetry: handleRetryStt,
              onImportCaptions: handleImportSttCaptions,
            }}
            sttReview={{
              review: sttCaptionReview,
              diarization: speakerDiarizationReport,
              onSelectIssues: handleSelectSttCaptionIssues,
              onCleanStt: handleCleanSttCaptions,
              onDiarizeSpeakers: handleDiarizeSpeakers,
            }}
            jobHistory={{
              summary: jobHistorySummary,
            }}
            renderWorker={{
              settings: renderWorkerSettings,
              daemonStatus: renderWorkerDaemonStatus,
              lastRun: renderWorkerRun,
              fleet: renderWorkerFleet,
              trustedWorkers: trustedRenderWorkers,
              status: renderWorkerStatus,
              isSubmitting: isSubmittingRenderWorker,
              isDiscovering: isDiscoveringRenderWorker,
              onSettingsChange: handleRenderWorkerSettingsChange,
              onDiscoverDaemon: handleDiscoverRenderWorkerDaemon,
              onSelectDaemon: handleSelectRenderWorkerDaemon,
              onTrustDaemon: handleTrustRenderWorkerDaemon,
              onForgetTrustedDaemon: handleForgetTrustedRenderWorkerDaemon,
              onCheckStatus: handleCheckRenderWorkerDaemon,
              onSubmitHandoff: handleSubmitRenderWorkerHandoff,
            }}
            renderStatus={{
              renderJob,
              renderPlan,
              renderOutputPath,
              onCancelRender: handleCancelRender,
              onRetryRender: handleRetryRender,
              onQueueCurrentRender: handleQueueRenderProject,
              onOpenRenderOutput: handleOpenRenderOutput,
              onRevealRenderOutput: handleRevealRenderOutput,
              onResolveDiagnosticAction: handleResolveRenderDiagnosticAction,
            }}
          />
          </div>

          <div className={activeDockPanel === 'plugins' ? 'space-y-4' : 'hidden'}>
          <PluginsPanel
            project={project}
            selectedClipIds={selectedClips.map((clip) => clip.id)}
            onInstallPluginPackage={handleInstallPluginPackage}
            onApplyExternalEffectPlan={handleApplyExternalEffectPlan}
            onApplyExternalTransitionPlan={handleApplyExternalTransitionPlan}
            onRunExternalCustomCommand={handleRunExternalCustomCommand}
            onSetExporterWriterTrust={handleSetExporterWriterTrust}
          />
          </div>
          </div>
        </aside>

        <section
          data-testid="editor-timeline-panel"
          data-panel-density="timeline-first"
          className="flex min-h-[300px] flex-col overflow-hidden bg-surface p-3 ed:col-start-2 ed:col-span-3 ed:row-start-2 ed:min-h-0 ed:rounded-sm"
        >
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize timeline panel"
            data-testid="editor-timeline-resize-handle"
            data-timeline-panel-height={timelinePanelHeight}
            className="-mx-3 -mt-3 mb-2 h-3 cursor-row-resize border-b border-ds-200 bg-surface/70 hover:bg-info-500/10"
            onPointerDown={handleTimelinePanelResizePointerDown}
          />
          <TimelineTransportRulerPanel
            scrollRef={timelineScrollRef}
            titleText={titleTextDraft}
            duration={project.duration}
            fps={project.fps}
            playhead={playhead}
            playbackRate={timelinePlaybackRate}
            pixelsPerSecond={pixelsPerSecond}
            timelineWidth={timelineWidth}
            markIn={markIn}
            markOut={markOut}
            markedRange={markedRange}
            loopPlaybackEnabled={loopPlaybackEnabled}
            rippleMode={rippleMode}
            snapEnabled={snapEnabled}
            editMode={editMode}
            showWaveforms={timelineShowWaveforms}
            showThumbnails={timelineShowThumbnails}
            trackHeight={timelineTrackHeight}
            gapInsertDuration={gapInsertDuration}
            visualGapCount={visualTimelineGaps.length}
            markers={project.markers}
            markerTimePreview={markerTimePreview}
            canUndo={history.length > 0}
            canRedo={future.length > 0}
            canSplitAtPlayhead={splitAtPlayheadPlan.canSplit}
            canTrimAtPlayhead={canEditTimelinePlayheadTarget}
            canDeleteTimelineTarget={canDeleteTimelineToolbarTarget}
            selectedClipCount={selectedClipIds.length}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onOpenCommandPalette={openCommandPalette}
            onSplit={handleSplit}
            onSplitAll={handleSplitAll}
            onTrimIn={() => handleTrimToPlayhead('start', timelinePlayheadEditTargetClip, true)}
            onTrimOut={() => handleTrimToPlayhead('end', timelinePlayheadEditTargetClip, true)}
            onDeleteSelection={() => handleDeleteSelected(false, timelinePlayheadEditTargetClip)}
            onRippleDeleteSelection={() => handleDeleteSelected(true, timelinePlayheadEditTargetClip)}
            onDuplicateSelection={handleDuplicateSelectedClips}
            onGroupSelection={handleGroupSelectedClips}
            onUngroupSelection={handleUngroupSelectedClips}
            onPreviousEdit={() => handleJumpAdjacentEdit('previous')}
            onNextEdit={() => handleJumpAdjacentEdit('next')}
            onRippleModeChange={() => setRippleMode((current) => !current)}
            onSnapEnabledChange={() => setSnapEnabled((current) => !current)}
            onToggleLoopPlayback={handleToggleLoopPlayback}
            onEditModeChange={handleEditModeChange}
            onTitleTextChange={setTitleTextDraft}
            onAddTitle={handleAddTitleAtPlayhead}
            onAddAdjustmentLayer={handleAddAdjustmentLayerAtPlayhead}
            onAddVideoTrack={() => commitProject('Video track added', (current) => addTrack(current, 'video'))}
            onAddAudioTrack={() => commitProject('Audio track added', (current) => addTrack(current, 'audio'))}
            onGenerateCaptions={() => commitProject('Caption draft generated', (current) => generateCaptionDraft(current))}
            onSaveProject={handleSaveProject}
            onLoadProject={handleLoadProject}
            onTogglePlayback={toggleProgramPlayback}
            onShuttlePlayback={handleShuttlePlayback}
            onNudgePlayhead={handleNudgePlayhead}
            onPlayheadChange={setTimelinePlayhead}
            onSelectLeft={() => handleSelectClipsRelativeToPlayhead('left')}
            onSelectRight={() => handleSelectClipsRelativeToPlayhead('right')}
            onSetInMark={() => handleSetMark('in')}
            onSetOutMark={() => handleSetMark('out')}
            onMarkSelection={handleMarkSelectedClips}
            onSelectMarkedRange={() => handleSelectMarkedRange()}
            onAddMarkerAtPlayhead={handleAddMarkerAtPlayhead}
            onClearMarks={handleClearMarks}
            onPixelsPerSecondChange={setPixelsPerSecond}
            onShowWaveformsChange={setTimelineShowWaveforms}
            onShowThumbnailsChange={setTimelineShowThumbnails}
            onTrackHeightChange={(nextHeight) => setTimelineTrackHeight(clampNumber(nextHeight, 56, 128))}
            onFitTimelineZoom={handleFitTimelineZoom}
            onGapInsertDurationChange={(nextValue) => setGapInsertDuration(clampNumber(nextValue, 0.1, Math.max(0.1, project.duration)))}
            onInsertGap={handleInsertGapAtPlayhead}
            onFillAiBrollGaps={handleFillAiBrollGaps}
            onRulerPointerDown={handleTimelineRulerPointerDown}
            onMarkerPointerDown={handleTimelineMarkerPointerDown}
            onWheelZoom={handleTimelineWheelZoom}
            onViewportChange={handleTimelineViewportChange}
            stickyControls={editorSettings.stickyTimelineControls}
          >
            {project.tracks.map((track, trackIndex) => (
              <TimelineTrackRow
                key={track.id}
                track={track}
                trackIndex={trackIndex}
                trackCount={project.tracks.length}
                selected={track.id === selectedTrackId}
                pixelsPerSecond={pixelsPerSecond}
                trackHeight={timelineTrackHeight}
                playhead={playhead}
                fps={project.fps}
                markedRange={markedRange}
                timelineEditGuide={timelineEditGuide}
                boxSelection={boxSelection}
                clipDragPreview={clipDragPreview}
                groupMovePreview={groupMovePreview}
                groupTrimPreview={groupTrimPreview}
                neighborImpactPreview={neighborImpactPreview}
                rippleTrimPreview={rippleTrimPreview}
                assetDropPreview={assetDropPreview}
                clipDragTargetTrackId={clipDragTargetTrackId}
                sourcePrimaryPatchEnabled={sourcePrimaryPatchEnabled}
                sourceAudioPatchEnabled={sourceAudioPatchEnabled}
                activeSourcePrimaryPatchTrackId={activeSourcePrimaryPatchTrackId}
                activeSourceAudioPatchTrackId={activeSourceAudioPatchTrackId}
                onTrackSelect={handleTrackSelect}
                onTrackRename={handleTrackRename}
                onMoveTrack={handleMoveTrack}
                onRemoveTrack={handleRemoveTrack}
                onSetPrimaryPatchTrack={(trackId) => applyTrackSelectionPlan(resolveSourcePatchTrackSelectionPlan({
                  trackId,
                  targetKind: 'primary',
                }))}
                onSetAudioPatchTrack={(trackId) => applyTrackSelectionPlan(resolveSourcePatchTrackSelectionPlan({
                  trackId,
                  targetKind: 'audio',
                }))}
                onTrackToggle={handleTrackToggle}
                onTrackMixerChange={handleTrackMixerChange}
                onLaneRef={(trackId, node) => {
                  timelineLaneRefs.current[trackId] = node;
                }}
                onLanePointerDown={handleLanePointerDown}
                onLaneDragOver={handleTimelineDragOver}
                onLaneDrop={handleTimelineDrop}
                onLaneDragLeave={(event, rowTrack) => {
                  const nextTarget = event.relatedTarget as Node | null;
                  if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
                    setAssetDropPreview((current) => (current?.trackId === rowTrack.id ? null : current));
                    setTimelineEditGuide((current) => (current?.trackId === rowTrack.id ? null : current));
                  }
                }}
              >
                <TimelineClipList
                  track={track}
                  tracks={project.tracks}
                  assetById={assetById}
                  audioPeaksByAssetId={audioPeaksByAssetId}
                  selectedClipIds={selectedClipIds}
                  visibleTimeRange={timelineClipRenderWindow}
                  showWaveforms={timelineShowWaveforms}
                  showThumbnails={timelineShowThumbnails}
                  trackHeight={timelineTrackHeight}
                  pixelsPerSecond={pixelsPerSecond}
                  getScrollLeft={() => timelineScrollRef.current?.scrollLeft ?? 0}
                  isTrackPlayable={isTrackPlayable}
                  onSelectClip={(event, clip) => handleTimelineClipSelect(clip, event)}
                  onContextMenuClip={(event, clip) => {
                    if (!selectedClipIds.includes(clip.id)) {
                      selectClip(clip, false);
                    }
                    setContextMenu({ x: event.clientX, y: event.clientY, clipId: clip.id });
                  }}
                  onMoveClip={handleMoveClipGroup}
                  onMoveClipDrop={handleMoveClipGroup}
                  onDragPointer={handleClipDragPointer}
                  onDragPreview={handleClipDragPreview}
                  onTrimPointer={(clientX) => {
                    if (clientX !== null) {
                      applyTimelineEdgeAutoScroll(clientX);
                    } else {
                      showTimelineEditGuide(null);
                    }
                  }}
                  onPreviewMove={(clip, nextStart) => resolveClipMoveEdit(clip, nextStart).preview}
                  onPreviewTrim={resolveClipTrimPreview}
                  onPreviewRollTrim={resolveClipRollTrimPreview}
                  onPreviewSlip={resolveClipSlipPreview}
                  onPreviewSlide={resolveClipSlidePreview}
                  onPreviewGuide={handleClipEditPreviewGuide}
                  onRollTrim={handleTimelineRollTrimDrag}
                  onSlip={handleTimelineSlipDrag}
                  onSlide={handleTimelineSlideDrag}
                  onTransitionDuration={handleTimelineTransitionDurationDrag}
                  onKeyframeTime={handleTimelineKeyframeTimeDrag}
                  onVolumeChange={handleTimelineClipVolumeDrag}
                  onTrim={handleTimelineClipTrimDrag}
                />
              </TimelineTrackRow>
            ))}
          </TimelineTransportRulerPanel>
        </section>
      </section>
      {contextMenu ? (
        <TimelineContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          anchorClipId={contextMenu.clipId}
          anchorClipName={allClips.find((clip) => clip.id === contextMenu.clipId)?.name}
          selectionCount={selectedClipIds.length}
          selectedCaptionCount={selectedCaptionIds.length}
          clipboardClipCount={clipboardClips.length}
          hasAttributeClipboard={Boolean(attributeClipboard)}
          hasInMark={markIn !== null}
          hasOutMark={markOut !== null}
          hasMarkedRange={Boolean(markedRange)}
          canSplitAtPlayhead={splitAtPlayheadPlan.canSplit}
          onCopy={() => runContextAction(handleCopySelected)}
          onCopyAttributes={() => runContextAction(handleCopyClipAttributes)}
          onCut={() => runContextAction(handleCutSelected)}
          onPaste={() => runContextAction(handlePasteClipboard)}
          onPasteAttributes={() => runContextAction(handlePasteClipAttributes)}
          onPasteAtIn={() => runContextAction(handlePasteClipboardAtIn)}
          onAppend={() => runContextAction(handleAppendClipboard)}
          onSelectAtPlayhead={() => runContextAction(() => handleSelectClipAtPlayhead())}
          onMoveSelectionToPlayhead={() => runContextAction(handleMoveSelectionToPlayhead)}
          onInsertGap={() => runContextAction(handleInsertGapAtPlayhead)}
          onGroup={() => runContextAction(handleGroupSelectedClips)}
          onUngroup={() => runContextAction(handleUngroupSelectedClips)}
          onSelectLeft={() => runContextAction(() => handleSelectClipsRelativeToPlayhead('left'))}
          onSelectRight={() => runContextAction(() => handleSelectClipsRelativeToPlayhead('right'))}
          onPreviousEdit={() => runContextAction(() => handleJumpAdjacentEdit('previous'))}
          onNextEdit={() => runContextAction(() => handleJumpAdjacentEdit('next'))}
          onSplit={() => runContextAction(handleSplit)}
          onSplitAll={() => runContextAction(handleSplitAll)}
          onTrimIn={() => runContextAction(() => handleTrimToPlayhead('start'))}
          onTrimOut={() => runContextAction(() => handleTrimToPlayhead('end'))}
          onDeleteLeft={() => runContextAction(() => handleDeleteSide('left'))}
          onDeleteRight={() => runContextAction(() => handleDeleteSide('right'))}
          onDuplicate={() => runContextAction(handleDuplicateSelectedClips)}
          onLift={() => runContextAction(() => handleDeleteMarkedRange(false))}
          onExtract={() => runContextAction(() => handleDeleteMarkedRange(true))}
          onGoToIn={() => runContextAction(() => handleGoToMark('in'))}
          onGoToOut={() => runContextAction(() => handleGoToMark('out'))}
          onClearMarks={() => runContextAction(handleClearMarks)}
          onMarkSelection={() => runContextAction(handleMarkSelectedClips)}
          onSelectMarkedRange={() => runContextAction(() => handleSelectMarkedRange())}
          onCopyMarkedRange={() => runContextAction(() => handleCopyMarkedRange())}
          onCutMarkedRange={() => runContextAction(() => handleCutMarkedRange(false, rippleMode))}
          onCloseGap={() => runContextAction(handleCloseGapAtPlayhead)}
          onMarker={() => runContextAction(handleAddMarkerAtPlayhead)}
          onSplitCaption={() => runContextAction(handleSplitActiveCaption)}
          onMergeCaptions={() => runContextAction(handleMergeSelectedCaptions)}
          onMute={() => runContextAction(() => handleToggleSelectedClipState('muted'))}
          onLock={() => runContextAction(() => handleToggleSelectedClipState('locked'))}
          canDetachAudio={selectedCanDetachAudio}
          canRelinkAudio={selectedCanRelinkAudio}
          canUnlinkAudio={selectedCanUnlinkAudio}
          canLinkAudio={selectedCanLinkAudio}
          onDetachAudio={() => runContextAction(handleDetachSelectedAudio)}
          onRelinkAudio={() => runContextAction(handleRelinkSelectedAudio)}
          onUnlinkAudio={() => runContextAction(handleUnlinkSelectedAudio)}
          onLinkAudio={() => runContextAction(handleLinkSelectedAudio)}
          onDelete={() => runContextAction(() => handleDeleteSelected(false))}
          onRippleDelete={() => runContextAction(() => handleDeleteSelected(true))}
          onCrossfade={() => runContextAction(() => handleApplyTransition('crossfade'))}
          onWipe={() => runContextAction(() => handleApplyTransition('wipe'))}
        />
      ) : null}
    </main>
  );
}

function videoScopeReadoutSignature(readout: VideoScopeReadout | null): string {
  if (!readout) {
    return 'none';
  }

  return [
    readout.status,
    readout.label,
    readout.warning ?? '',
    readout.detail,
    readout.averageLuma,
    readout.peakLuma,
    readout.lowLuma,
    readout.dynamicRange,
    readout.shadowShare,
    readout.highlightShare,
  ].join('|');
}

function upsertRenderWorkerFleetStatus(
  current: RenderWorkerDaemonStatus[],
  status: RenderWorkerDaemonStatus,
): RenderWorkerDaemonStatus[] {
  const normalizedUrl = normalizeRenderWorkerDaemonUrl(status.url);
  const withoutCurrent = current.filter((worker) => normalizeRenderWorkerDaemonUrl(worker.url) !== normalizedUrl);
  return sortRenderWorkerFleet([...withoutCurrent, status]);
}

function sortRenderWorkerFleet(statuses: RenderWorkerDaemonStatus[]): RenderWorkerDaemonStatus[] {
  return [...statuses].sort((a, b) => a.workerId.localeCompare(b.workerId));
}
