import { createClip } from './project';
import { applyAiModelEffectPass, type AiModelEffectPresetId, type AiModelPassBlendMode } from './ai-effects';
import type { MediaAnalysis } from './media-analyzer';
import { inferSupportedMediaFileKind, inferSupportedMediaMimeType, readExplicitUnsupportedMediaMimeType } from './media-file-support';
import type { ClipKind, EditorAsset, EditorProject, GenerationBinding, MediaCacheManifest, TimelineClip, TimelineTrack, TrackKind } from './types';

export type ComfyUIResultStatus = 'prepared' | 'queued' | 'completed' | 'failed';

export interface ComfyUIResultReference {
  automationJobId: string;
  clipId: string;
  status: ComfyUIResultStatus;
  promptId?: string;
  modelName?: string;
  workflowName?: string;
  prompt?: string;
  negativePrompt?: string;
  seed?: number;
  parameters?: Record<string, string | number | boolean>;
  source?: string;
  renderPath?: string;
  filename?: string;
  mimeType?: string;
  media?: MediaAnalysis;
  mediaCache?: MediaCacheManifest;
  error?: string;
}

export interface ComfyUIResultReviewReport {
  automationJobId: string;
  clipId: string;
  resultLabel: string;
  sourceResolution?: string;
  resultResolution?: string;
  durationDelta?: number;
  hasPromptMetadata: boolean;
  hasWaveform: boolean;
  hasProxy: boolean;
  lineage: ComfyUIPromptLineageReport;
  issues: string[];
  warnings: string[];
}

export type ComfyUIPromptLineageField = 'prompt' | 'negativePrompt' | 'workflowName' | 'seed';
export type ComfyUIPromptLineageVersion = 'same' | 'changed' | 'missing-source' | 'missing-result';

export interface ComfyUIPromptLineageChange {
  field: ComfyUIPromptLineageField;
  label: string;
  before?: string | number;
  after?: string | number;
}

export interface ComfyUIPromptLineageReport {
  sourcePrompt?: string;
  resultPrompt?: string;
  sourceNegativePrompt?: string;
  resultNegativePrompt?: string;
  sourceWorkflowName?: string;
  resultWorkflowName?: string;
  sourceSeed?: number;
  resultSeed?: number;
  promptChanged: boolean;
  negativePromptChanged: boolean;
  workflowChanged: boolean;
  seedChanged: boolean;
  versionLabel: ComfyUIPromptLineageVersion;
  changes: ComfyUIPromptLineageChange[];
  warnings: string[];
}

export interface ApplyComfyUIResultOptions {
  mode?: 'candidate-track' | 'replace-source';
  targetTrackId?: string;
}

export interface ApplyComfyUIResultAsAiEffectPassOptions {
  presetId?: AiModelEffectPresetId;
  blendMode?: AiModelPassBlendMode;
  opacity?: number;
  strength?: number;
}

export function createInitialComfyUIResults(
  jobs: Array<{
    id: string;
    clipId: string;
    workflowName?: string;
    parameters?: Record<string, string | number | boolean>;
  }>,
  status: ComfyUIResultStatus = 'prepared',
  modelName?: string,
): ComfyUIResultReference[] {
  return jobs.map((job) => ({
    automationJobId: job.id,
    clipId: job.clipId,
    status,
    modelName,
    workflowName: job.workflowName,
    prompt: readPrompt(job.parameters),
    negativePrompt: readNegativePrompt(job.parameters),
    seed: readSeed(job.parameters),
    parameters: job.parameters ? { ...job.parameters } : undefined,
  }));
}

export function buildComfyUIResultReviewReport(
  result: ComfyUIResultReference,
  sourceClip: TimelineClip,
  sourceAsset?: EditorAsset,
): ComfyUIResultReviewReport {
  const resultSource = resolveComfyUIResultSource(result);
  const resultDuration = result.media?.duration;
  const durationDelta = resultDuration === undefined
    ? undefined
    : roundTime(resultDuration - sourceClip.duration);
  const issues: string[] = [];
  const warnings = [
    ...(result.media?.warnings ?? []),
    ...(result.mediaCache?.warnings ?? []),
  ];
  const sourceResolution = formatResolution(sourceAsset?.width, sourceAsset?.height);
  const resultResolution = formatResolution(result.media?.width, result.media?.height);
  const unsupportedMimeType = readExplicitUnsupportedMediaMimeType(result.mimeType);
  const resultKind = inferComfyUIResultKind(result.mimeType, result.filename ?? resultSource ?? '', result.media);
  const hasAudio = resultKind === 'audio';
  const lineage = buildComfyUIPromptLineageReport(result, sourceClip);
  const hasPromptMetadata = Boolean(result.prompt || result.workflowName || result.promptId || result.negativePrompt || result.seed !== undefined);

  if (!resultSource) {
    issues.push('Result source is missing.');
  }

  if (unsupportedMimeType) {
    issues.push(`Result media type is unsupported: ${unsupportedMimeType}.`);
  }

  if (resultResolution && sourceResolution && resultResolution !== sourceResolution) {
    issues.push(`Resolution differs: ${sourceResolution} -> ${resultResolution}.`);
  }

  if (durationDelta !== undefined && Math.abs(durationDelta) > 0.5) {
    issues.push(`Duration differs by ${durationDelta.toFixed(2)}s.`);
  }

  if (hasAudio && !(result.mediaCache?.waveformPeaks?.length)) {
    issues.push('Waveform cache is missing for audio review.');
  }

  if (!hasPromptMetadata) {
    issues.push('Prompt metadata is missing.');
  }

  return {
    automationJobId: result.automationJobId,
    clipId: result.clipId,
    resultLabel: result.filename ?? resultSource ?? result.automationJobId,
    sourceResolution,
    resultResolution,
    durationDelta,
    hasPromptMetadata,
    hasWaveform: Boolean(result.mediaCache?.waveformPeaks?.length),
    hasProxy: Boolean(result.mediaCache?.proxySource),
    lineage,
    issues,
    warnings: [...warnings, ...lineage.warnings],
  };
}

export function buildComfyUIPromptLineageReport(
  result: ComfyUIResultReference,
  sourceClip: TimelineClip,
): ComfyUIPromptLineageReport {
  const sourceGeneration = sourceClip.generation;
  const sourcePrompt = readText(sourceGeneration?.prompt);
  const resultPrompt = readText(result.prompt);
  const sourceNegativePrompt = readText(sourceGeneration?.negativePrompt);
  const resultNegativePrompt = readText(result.negativePrompt);
  const sourceWorkflowName = readText(sourceGeneration?.workflowName);
  const resultWorkflowName = readText(result.workflowName);
  const sourceSeed = sourceGeneration?.seed;
  const resultSeed = result.seed;
  const warnings: string[] = [];
  const changes: ComfyUIPromptLineageChange[] = [];

  if (!sourceGeneration) {
    warnings.push('Source clip has no generation metadata to compare.');
  }

  const hasComparableResultMetadata = Boolean(
    resultPrompt
      || resultNegativePrompt
      || resultWorkflowName
      || resultSeed !== undefined,
  );
  if (!hasComparableResultMetadata) {
    warnings.push('Result has no prompt, workflow, negative prompt, or seed metadata to compare.');
  }

  const promptChanged = hasFieldChange(sourcePrompt, resultPrompt);
  const negativePromptChanged = hasFieldChange(sourceNegativePrompt, resultNegativePrompt);
  const workflowChanged = hasFieldChange(sourceWorkflowName, resultWorkflowName);
  const seedChanged = hasSeedChange(sourceSeed, resultSeed);

  if (promptChanged) {
    changes.push({ field: 'prompt', label: 'Prompt', before: sourcePrompt, after: resultPrompt });
  }
  if (negativePromptChanged) {
    changes.push({ field: 'negativePrompt', label: 'Negative prompt', before: sourceNegativePrompt, after: resultNegativePrompt });
  }
  if (workflowChanged) {
    changes.push({ field: 'workflowName', label: 'Workflow', before: sourceWorkflowName, after: resultWorkflowName });
  }
  if (seedChanged) {
    changes.push({ field: 'seed', label: 'Seed', before: sourceSeed, after: resultSeed });
  }

  const versionLabel: ComfyUIPromptLineageVersion = !sourceGeneration
    ? 'missing-source'
    : !hasComparableResultMetadata
      ? 'missing-result'
      : changes.length > 0
        ? 'changed'
        : 'same';

  return {
    sourcePrompt,
    resultPrompt,
    sourceNegativePrompt,
    resultNegativePrompt,
    sourceWorkflowName,
    resultWorkflowName,
    sourceSeed,
    resultSeed,
    promptChanged,
    negativePromptChanged,
    workflowChanged,
    seedChanged,
    versionLabel,
    changes,
    warnings,
  };
}

export function applyComfyUIResultAssets(
  project: EditorProject,
  results: ComfyUIResultReference[],
  options: ApplyComfyUIResultOptions = {},
): EditorProject {
  const usableResults = results.filter((result) => result.status === 'completed' && Boolean(resolveComfyUIResultSource(result)));
  if (usableResults.length === 0) {
    return project;
  }

  const mode = options.mode ?? 'candidate-track';
  const existingAssetIds = new Set(project.assets.map((asset) => asset.id));
  const existingClipIds = new Set(project.tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
  const addedAssets: EditorAsset[] = [];
  const addedClipByTrackId = new Map<string, TimelineClip[]>();
  const replacementClipById = new Map<string, TimelineClip>();

  let tracks = cloneTracks(project.tracks);

  usableResults.forEach((result, index) => {
    const sourceMatch = findClip(project, result.clipId);
    if (!sourceMatch) {
      return;
    }

    const { clip: sourceClip } = sourceMatch;
    const lineage = buildComfyUIPromptLineageReport(result, sourceClip);
    const sourceAsset = sourceClip.assetId
      ? project.assets.find((asset) => asset.id === sourceClip.assetId)
      : undefined;
    const resultSource = resolveComfyUIResultSource(result)!;
    const kind = inferComfyUIResultKind(result.mimeType, result.filename ?? resultSource, result.media);
    if (!kind) {
      return;
    }
    const filename = result.filename ?? filenameFromPath(resultSource);
    const assetId = uniqueId(`asset-comfy-${safeId(result.clipId)}-${index + 1}`, existingAssetIds);
    const assetDuration = Math.max(0.25, result.media?.duration ?? sourceClip.duration);
    const metadata: Record<string, string | number | boolean> = {
      generated: true,
      provider: 'comfyui',
      sourceClipId: sourceClip.id,
      automationJobId: result.automationJobId,
      mimeType: resolveComfyUIResultMimeType(result, kind),
      promptLineage: lineage.versionLabel,
    };
    if (result.promptId) {
      metadata.promptId = result.promptId;
    }
    if (result.workflowName) {
      metadata.workflowName = result.workflowName;
    }
    if (result.modelName) {
      metadata.modelName = result.modelName;
    }
    if (result.prompt) {
      metadata.prompt = result.prompt;
    }
    if (result.negativePrompt) {
      metadata.negativePrompt = result.negativePrompt;
    }
    if (result.seed !== undefined) {
      metadata.seed = result.seed;
    }
    if (result.media?.bitrate !== undefined) {
      metadata.bitrate = result.media.bitrate;
    }
    if (result.media?.videoCodec) {
      metadata.videoCodec = result.media.videoCodec;
    }
    if (result.media?.audioCodec) {
      metadata.audioCodec = result.media.audioCodec;
    }
    if (result.media?.audioChannels !== undefined) {
      metadata.audioChannels = result.media.audioChannels;
    }
    if (result.media?.sampleRate !== undefined) {
      metadata.sampleRate = result.media.sampleRate;
    }
    if (result.media?.rotation !== undefined) {
      metadata.rotation = result.media.rotation;
    }
    if (result.media?.codedWidth !== undefined) {
      metadata.codedWidth = result.media.codedWidth;
    }
    if (result.media?.codedHeight !== undefined) {
      metadata.codedHeight = result.media.codedHeight;
    }
    if (result.media?.sampleAspectRatio !== undefined) {
      metadata.sampleAspectRatio = result.media.sampleAspectRatio;
    }
    if (result.media?.displayAspectRatio !== undefined) {
      metadata.displayAspectRatio = result.media.displayAspectRatio;
    }
    if (result.media?.pixelAspectRatio !== undefined) {
      metadata.pixelAspectRatio = result.media.pixelAspectRatio;
    }
    if (result.media?.exifOrientation !== undefined) {
      metadata.exifOrientation = result.media.exifOrientation;
    }
    if (result.media?.width !== undefined) {
      metadata.displayWidth = result.media.width;
    }
    if (result.media?.height !== undefined) {
      metadata.displayHeight = result.media.height;
    }
    if (result.media) {
      metadata.hasVideo = result.media.hasVideo;
      metadata.hasAudio = result.media.hasAudio;
    }

    const asset: EditorAsset = {
      id: assetId,
      name: filename || `${sourceClip.name} AI result`,
      kind,
      source: resultSource,
      renderPath: result.renderPath,
      duration: assetDuration,
      width: result.media?.width ?? sourceAsset?.width ?? project.width,
      height: result.media?.height ?? sourceAsset?.height ?? project.height,
      fps: result.media?.fps ?? sourceAsset?.fps ?? project.fps,
      mediaCache: result.mediaCache,
      metadata,
    };

    addedAssets.push(asset);

    if (mode === 'replace-source') {
      replacementClipById.set(sourceClip.id, {
        ...sourceClip,
        assetId,
        kind,
        name: asset.name,
        sourceIn: 0,
        generation: renderedBinding(sourceClip),
      });
      return;
    }

    const resultTrack = ensureResultTrack(tracks, resultTrackKindForClipKind(kind), options.targetTrackId);
    tracks = resultTrack.tracks;
    const trackId = resultTrack.trackId;
    const clipId = uniqueId(`clip-comfy-${safeId(result.clipId)}-${index + 1}`, existingClipIds);
    const clip = createClip({
      id: clipId,
      assetId,
      trackId,
      name: asset.name,
      kind,
      start: sourceClip.start,
      duration: assetDuration,
      color: colorForKind(kind),
      generation: renderedBinding(sourceClip),
      automationTags: ['comfyui-result'],
    });
    addedClipByTrackId.set(trackId, [...(addedClipByTrackId.get(trackId) ?? []), clip]);
  });

  if (addedAssets.length === 0) {
    return project;
  }

  tracks = tracks.map((track) => {
    const addedClips = addedClipByTrackId.get(track.id) ?? [];
    const replacedClips = track.clips.map((clip) => replacementClipById.get(clip.id) ?? clip);
    return {
      ...track,
      clips: [...replacedClips, ...addedClips].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id)),
    };
  });

  const duration = Math.max(
    project.duration,
    ...tracks.flatMap((track) => track.clips.map((clip) => clip.start + clip.duration)),
  );

  return {
    ...project,
    assets: [...project.assets, ...addedAssets],
    tracks,
    duration: roundTime(duration),
    updatedAt: new Date().toISOString(),
  };
}

export function resolveComfyUIResultSource(result: ComfyUIResultReference): string | undefined {
  return result.source?.trim() || result.renderPath?.trim() || undefined;
}

export function applyComfyUIResultAsAiEffectPass(
  project: EditorProject,
  result: ComfyUIResultReference,
  options: ApplyComfyUIResultAsAiEffectPassOptions = {},
): EditorProject {
  if (result.status !== 'completed') {
    throw new Error('Only completed ComfyUI results can be applied as AI effect passes.');
  }

  const renderPath = normalizeOptionalPath(result.renderPath);
  const source = normalizeOptionalPath(result.source);
  if (!renderPath && !source) {
    throw new Error('ComfyUI result has no renderable source for an AI effect pass.');
  }

  const sourceMatch = findClip(project, result.clipId);
  if (!sourceMatch) {
    throw new Error('Source clip for ComfyUI result was not found.');
  }

  return applyAiModelEffectPass(project, sourceMatch.clip.id, {
    source,
    renderPath,
    filename: result.filename,
    mimeType: result.mimeType,
    duration: result.media?.duration,
    width: result.media?.width,
    height: result.media?.height,
    presetId: options.presetId,
    blendMode: options.blendMode,
    opacity: options.opacity,
    strength: options.strength,
    automationJobId: result.automationJobId,
    promptId: result.promptId,
    modelName: result.modelName,
    workflowName: result.workflowName,
    prompt: result.prompt,
    seed: result.seed,
  });
}

function normalizeOptionalPath(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function cloneTracks(tracks: TimelineTrack[]): TimelineTrack[] {
  return tracks.map((track) => ({
    ...track,
    clips: [...track.clips],
  }));
}

function ensureResultTrack(
  tracks: TimelineTrack[],
  trackKind: TrackKind,
  requestedTrackId?: string,
): { tracks: TimelineTrack[]; trackId: string } {
  if (requestedTrackId && tracks.some((track) => track.id === requestedTrackId && track.kind === trackKind && !track.locked)) {
    return { tracks, trackId: requestedTrackId };
  }

  const trackId = trackKind === 'audio' ? 'track-comfy-audio-results' : 'track-comfy-results';
  const existing = tracks.find((track) => track.id === trackId && track.kind === trackKind && !track.locked);
  if (existing) {
    return { tracks, trackId: existing.id };
  }

  const resultTrack: TimelineTrack = {
    id: trackId,
    name: trackKind === 'audio' ? 'AI Audio Results' : 'AI Results',
    kind: trackKind,
    muted: false,
    solo: false,
    locked: false,
    clips: [],
  };
  const lastSameKindIndex = tracks.reduce((lastIndex, track, index) => (track.kind === trackKind ? index : lastIndex), -1);
  const insertIndex = lastSameKindIndex === -1 ? tracks.length : lastSameKindIndex + 1;
  return {
    tracks: [
      ...tracks.slice(0, insertIndex),
      resultTrack,
      ...tracks.slice(insertIndex),
    ],
    trackId: resultTrack.id,
  };
}

function resultTrackKindForClipKind(kind: ClipKind): TrackKind {
  return kind === 'audio' ? 'audio' : 'video';
}

function findClip(project: EditorProject, clipId: string): { track: TimelineTrack; clip: TimelineClip } | undefined {
  for (const track of project.tracks) {
    const clip = track.clips.find((item) => item.id === clipId);
    if (clip) {
      return { track, clip };
    }
  }

  return undefined;
}

function renderedBinding(clip: TimelineClip): GenerationBinding | undefined {
  if (!clip.generation) {
    return undefined;
  }

  return {
    ...clip.generation,
    status: 'rendered',
  };
}

export function inferComfyUIResultKind(
  mimeType: string | undefined,
  path: string,
  media?: Pick<MediaAnalysis, 'hasVideo' | 'hasAudio'>,
): ClipKind | undefined {
  const normalizedMimeType = mimeType?.trim();
  if (readExplicitUnsupportedMediaMimeType(normalizedMimeType)) {
    return undefined;
  }

  if (media?.hasVideo === true) {
    return 'video';
  }

  if (media?.hasAudio === true) {
    return 'audio';
  }

  const kind = inferSupportedMediaFileKind({
    name: path,
    mimeType: normalizedMimeType,
  });
  if (kind) {
    return kind;
  }

  return normalizedMimeType ? undefined : 'video';
}

export function resolveComfyUIResultMimeType(
  result: Pick<ComfyUIResultReference, 'mimeType' | 'filename' | 'source' | 'renderPath'>,
  kind: ClipKind,
): string {
  const explicitMimeType = result.mimeType?.trim();
  if (explicitMimeType) {
    return explicitMimeType;
  }

  for (const candidate of [result.filename, result.source, result.renderPath]) {
    const path = candidate?.trim();
    if (path && inferSupportedMediaFileKind({ name: path })) {
      return inferSupportedMediaMimeType(path);
    }
  }

  return defaultMimeType(kind);
}

function colorForKind(kind: ClipKind): string {
  switch (kind) {
    case 'audio':
      return '#84cc16';
    case 'image':
      return '#06b6d4';
    default:
      return '#a78bfa';
  }
}

function defaultMimeType(kind: ClipKind): string {
  switch (kind) {
    case 'audio':
      return 'audio/wav';
    case 'image':
      return 'image/png';
    default:
      return 'video/mp4';
  }
}

function hasFieldChange(before?: string, after?: string): boolean {
  if (before === undefined && after === undefined) {
    return false;
  }

  return normalizeComparableText(before) !== normalizeComparableText(after);
}

function hasSeedChange(before?: number, after?: number): boolean {
  if (before === undefined && after === undefined) {
    return false;
  }

  return before !== after;
}

function normalizeComparableText(value?: string): string {
  return value?.trim().replace(/\s+/g, ' ') ?? '';
}

function readPrompt(parameters?: Record<string, string | number | boolean>): string | undefined {
  return readText(parameters?.prompt ?? parameters?.positivePrompt ?? parameters?.positive_prompt);
}

function readNegativePrompt(parameters?: Record<string, string | number | boolean>): string | undefined {
  return readText(parameters?.negativePrompt ?? parameters?.negative_prompt);
}

function readSeed(parameters?: Record<string, string | number | boolean>): number | undefined {
  const seed = parameters?.seed;
  return typeof seed === 'number' && Number.isFinite(seed) ? seed : undefined;
}

function readText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function formatResolution(width?: number, height?: number): string | undefined {
  return width && height ? `${width}x${height}` : undefined;
}

function filenameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? '';
}

function uniqueId(baseId: string, ids: Set<string>): string {
  let id = baseId;
  let suffix = 2;
  while (ids.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  ids.add(id);
  return id;
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/(^-|-$)/g, '') || 'result';
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}
