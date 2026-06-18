import { expandClipIdsWithLinkedAndGroupedClips, findClip } from './timeline';
import type { ClipBatchEditResult, ClipBatchEditSkippedClip } from './timeline';
import { isAdjustmentLayerClip } from './adjustment-layer';
import { inferSupportedMediaFileKind } from './media-file-support';
import { isRenderableVisualMediaAsset } from './renderable-media-kind';
import type { ClipEffect, EditorAsset, EditorProject, TimelineClip } from './types';

export type AiEnhancementPresetId = 'denoise-sharpen' | 'cinematic-pop' | 'portrait-focus' | 'deband-clean';
export type AiModelPassBlendMode = 'normal' | 'screen' | 'multiply' | 'overlay' | 'add';
export type AiModelPassKind = 'video' | 'image';
export type AiModelPassPurpose = 'generic' | 'restoration' | 'segmentation-matte' | 'beauty-retouch';
export type AiModelEffectPresetId = 'restoration-detail' | 'segmentation-matte' | 'beauty-retouch';

export interface AiEnhancementPreset {
  id: AiEnhancementPresetId;
  label: string;
  parameters: Record<string, string | number | boolean>;
}

export interface AiModelEffectPreset {
  id: AiModelEffectPresetId;
  label: string;
  purpose: AiModelPassPurpose;
  blendMode: AiModelPassBlendMode;
  opacity: number;
  strength: number;
  parameters: Record<string, string | number | boolean>;
}

export interface AiModelEffectPass {
  path: string;
  source?: string;
  kind: AiModelPassKind;
  purpose: AiModelPassPurpose;
  blendMode: AiModelPassBlendMode;
  opacity: number;
  strength: number;
  duration?: number;
  restorationDetail?: number;
  restorationTextureGuard?: number;
  segmentationEdgeFeather?: number;
  segmentationForegroundMix?: number;
  segmentationSpillCleanup?: number;
}

export interface AiModelEffectPassOptions {
  source?: string;
  renderPath?: string;
  filename?: string;
  mimeType?: string;
  duration?: number;
  width?: number;
  height?: number;
  presetId?: AiModelEffectPresetId;
  purpose?: AiModelPassPurpose;
  blendMode?: AiModelPassBlendMode;
  opacity?: number;
  strength?: number;
  restorationDetail?: number;
  restorationTextureGuard?: number;
  segmentationEdgeFeather?: number;
  segmentationForegroundMix?: number;
  segmentationSpillCleanup?: number;
  automationJobId?: string;
  promptId?: string;
  modelName?: string;
  workflowName?: string;
  prompt?: string;
  seed?: number;
}

export const AI_ENHANCEMENT_EFFECT_LABEL = 'AI enhance';
export const AI_MODEL_PASS_EFFECT_LABEL = 'AI model pass';
export const AI_MODEL_PASS_EFFECT_ID = 'model-effect-pass';

export const AI_MODEL_EFFECT_PASS_PRESETS: AiModelEffectPreset[] = [
  {
    id: 'restoration-detail',
    label: 'Restoration detail',
    purpose: 'restoration',
    blendMode: 'screen',
    opacity: 0.65,
    strength: 0.9,
    parameters: {
      restorationDetail: 0.7,
      restorationTextureGuard: 0.6,
    },
  },
  {
    id: 'segmentation-matte',
    label: 'Segmentation matte',
    purpose: 'segmentation-matte',
    blendMode: 'normal',
    opacity: 0.85,
    strength: 0.9,
    parameters: {
      segmentationEdgeFeather: 2,
      segmentationForegroundMix: 1,
      segmentationSpillCleanup: 0.35,
    },
  },
  {
    id: 'beauty-retouch',
    label: 'Beauty retouch',
    purpose: 'beauty-retouch',
    blendMode: 'screen',
    opacity: 0.42,
    strength: 0.75,
    parameters: {
      restorationDetail: 0.35,
      restorationTextureGuard: 0.85,
    },
  },
];

export const AI_ENHANCEMENT_PRESETS: AiEnhancementPreset[] = [
  {
    id: 'denoise-sharpen',
    label: 'Denoise + sharp',
    parameters: {
      aiEffect: 'denoise-sharpen',
      denoiseStrength: 3,
      sharpenAmount: 0.75,
      sharpenRadius: 5,
    },
  },
  {
    id: 'cinematic-pop',
    label: 'Cinematic pop',
    parameters: {
      aiEffect: 'cinematic-pop',
      brightness: 0.01,
      contrast: 1.12,
      saturation: 1.08,
      gamma: 0.98,
      sharpenAmount: 0.25,
      vignetteStrength: 0.22,
    },
  },
  {
    id: 'portrait-focus',
    label: 'Portrait focus',
    parameters: {
      aiEffect: 'portrait-focus',
      focusStrength: 0.32,
      contrast: 1.05,
      saturation: 1.03,
      sharpenAmount: 0.35,
      vignetteStrength: 0.18,
    },
  },
  {
    id: 'deband-clean',
    label: 'Deband clean',
    parameters: {
      aiEffect: 'deband-clean',
      debandStrength: 0.018,
      debandRange: 16,
      denoiseStrength: 1.5,
      sharpenAmount: 0.2,
    },
  },
];

export function findAiEnhancementPreset(presetId: AiEnhancementPresetId): AiEnhancementPreset | undefined {
  return AI_ENHANCEMENT_PRESETS.find((preset) => preset.id === presetId);
}

export function findAiModelEffectPreset(presetId: AiModelEffectPresetId): AiModelEffectPreset | undefined {
  return AI_MODEL_EFFECT_PASS_PRESETS.find((preset) => preset.id === presetId);
}

export function readAiEnhancementPresetId(effect: ClipEffect): AiEnhancementPresetId | undefined {
  const value = effect.parameters.aiEffect;
  return typeof value === 'string' && isAiEnhancementPresetId(value) ? value : undefined;
}

export function isAiEnhancementEffect(effect: ClipEffect): boolean {
  return effect.type === 'ai' && (
    readAiEnhancementPresetId(effect) !== undefined ||
    readAiModelEffectPass(effect) !== undefined
  );
}

export function hasSupportedAiEnhancementEffect(effect: ClipEffect): boolean {
  return isAiEnhancementEffect(effect);
}

export function findAiEnhancementEffect(clip: TimelineClip): ClipEffect | undefined {
  return clip.effects.find((effect) => effect.type === 'ai');
}

export function isAiModelEffectPass(effect: ClipEffect): boolean {
  return readAiModelEffectPass(effect) !== undefined;
}

export function readAiModelEffectPass(effect: ClipEffect): AiModelEffectPass | undefined {
  if (effect.type !== 'ai' || effect.parameters.aiEffect !== AI_MODEL_PASS_EFFECT_ID) {
    return undefined;
  }

  const path = readText(effect.parameters.passRenderPath) ?? readText(effect.parameters.passSource);
  if (!path || !isRenderableModelPassPath(path)) {
    return undefined;
  }

  return {
    path,
    source: readText(effect.parameters.passSource),
    kind: normalizeModelPassKind(readText(effect.parameters.passKind) ?? readText(effect.parameters.mimeType)),
    purpose: normalizeModelPassPurpose(readText(effect.parameters.passPurpose)),
    blendMode: normalizeModelPassBlendMode(readText(effect.parameters.passBlendMode)),
    opacity: clampNumber(readNumber(effect.parameters.passOpacity, 0.65), 0, 1),
    strength: clampNumber(readNumber(effect.parameters.passStrength, 1), 0, 1),
    duration: readOptionalNumber(effect.parameters.passDuration),
    restorationDetail: readOptionalClampedNumber(effect.parameters.restorationDetail, 0, 1),
    restorationTextureGuard: readOptionalClampedNumber(effect.parameters.restorationTextureGuard, 0, 1),
    segmentationEdgeFeather: readOptionalClampedNumber(effect.parameters.segmentationEdgeFeather, 0, 32),
    segmentationForegroundMix: readOptionalClampedNumber(effect.parameters.segmentationForegroundMix, 0, 1),
    segmentationSpillCleanup: readOptionalClampedNumber(effect.parameters.segmentationSpillCleanup, 0, 1),
  };
}

export function buildAiModelEffectPass(
  existingEffect: ClipEffect | undefined,
  options: AiModelEffectPassOptions,
): ClipEffect {
  const path = options.renderPath || options.source;
  if (!path || !isRenderableModelPassPath(path)) {
    throw new Error('AI model effect pass requires a filesystem render path.');
  }

  const preset = options.presetId ? findAiModelEffectPreset(options.presetId) : undefined;
  const kind = normalizeModelPassKind(options.mimeType ?? path);
  const purpose = normalizeModelPassPurpose(
    options.purpose ??
    preset?.purpose ??
    readText(existingEffect?.parameters.passPurpose),
  );
  const presetParameters = preset?.parameters ?? {};
  const label = options.filename
    ? `${AI_MODEL_PASS_EFFECT_LABEL}: ${options.filename}`
    : AI_MODEL_PASS_EFFECT_LABEL;
  const parameters: ClipEffect['parameters'] = {
    ...(existingEffect?.parameters ?? {}),
    ...(preset ? presetParameters : {}),
    aiEffect: AI_MODEL_PASS_EFFECT_ID,
    ...(preset ? { modelPassPresetId: preset.id, modelPassPresetLabel: preset.label } : {}),
    passRenderPath: path,
    ...(options.source ? { passSource: options.source } : {}),
    passKind: kind,
    passPurpose: purpose,
    passBlendMode: normalizeModelPassBlendMode(options.blendMode ?? preset?.blendMode),
    passOpacity: clampNumber(options.opacity ?? preset?.opacity ?? 0.65, 0, 1),
    passStrength: clampNumber(options.strength ?? preset?.strength ?? 1, 0, 1),
    ...(options.duration !== undefined ? { passDuration: roundNumber(Math.max(0, options.duration)) } : {}),
    ...(options.width !== undefined ? { passWidth: Math.max(1, Math.round(options.width)) } : {}),
    ...(options.height !== undefined ? { passHeight: Math.max(1, Math.round(options.height)) } : {}),
    ...(options.restorationDetail !== undefined ? { restorationDetail: clampNumber(options.restorationDetail, 0, 1) } : {}),
    ...(options.restorationTextureGuard !== undefined ? { restorationTextureGuard: clampNumber(options.restorationTextureGuard, 0, 1) } : {}),
    ...(options.segmentationEdgeFeather !== undefined ? { segmentationEdgeFeather: clampNumber(options.segmentationEdgeFeather, 0, 32) } : {}),
    ...(options.segmentationForegroundMix !== undefined ? { segmentationForegroundMix: clampNumber(options.segmentationForegroundMix, 0, 1) } : {}),
    ...(options.segmentationSpillCleanup !== undefined ? { segmentationSpillCleanup: clampNumber(options.segmentationSpillCleanup, 0, 1) } : {}),
    ...(options.automationJobId ? { automationJobId: options.automationJobId } : {}),
    ...(options.promptId ? { promptId: options.promptId } : {}),
    ...(options.modelName ? { modelName: options.modelName } : {}),
    ...(options.workflowName ? { workflowName: options.workflowName } : {}),
    ...(options.prompt ? { prompt: options.prompt } : {}),
    ...(options.seed !== undefined ? { seed: options.seed } : {}),
  };

  return {
    id: existingEffect?.id ?? `effect-ai-model-pass-${Date.now()}`,
    type: 'ai',
    label,
    enabled: true,
    parameters,
  };
}

export function applyAiModelEffectPass(
  project: EditorProject,
  clipId: string,
  options: AiModelEffectPassOptions,
): EditorProject {
  let updated = false;
  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (clip.id !== clipId) {
        return clip;
      }

      if (track.locked || clip.locked) {
        throw new Error('Cannot edit an effect on a locked track or clip.');
      }

      const asset = clip.assetId ? project.assets.find((item) => item.id === clip.assetId) : undefined;
      if (!isVisualMediaClip(clip, asset)) {
        throw new Error('AI model effect passes are available for video and image clips.');
      }

      const existingEffect = clip.effects.find((effect) => effect.type === 'ai' && effect.parameters.aiEffect === AI_MODEL_PASS_EFFECT_ID);
      const nextEffect = buildAiModelEffectPass(existingEffect, options);
      updated = true;
      return {
        ...clip,
        effects: existingEffect
          ? clip.effects.map((effect) => (effect.id === existingEffect.id ? nextEffect : effect))
          : [...clip.effects, nextEffect],
      };
    }),
  }));

  if (!updated) {
    throw new Error('Clip not found.');
  }

  return {
    ...project,
    tracks,
    updatedAt: new Date().toISOString(),
  };
}

export function applyAiEnhancementPreset(
  project: EditorProject,
  clipId: string,
  presetId: AiEnhancementPresetId,
): EditorProject {
  const preset = findAiEnhancementPreset(presetId);
  if (!preset) {
    throw new Error('AI enhancement preset not found.');
  }

  let updated = false;
  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (clip.id !== clipId) {
        return clip;
      }

      if (track.locked || clip.locked) {
        throw new Error('Cannot edit an effect on a locked track or clip.');
      }

      const asset = clip.assetId ? project.assets.find((item) => item.id === clip.assetId) : undefined;
      if (!isVisualMediaClip(clip, asset)) {
        throw new Error('AI enhancement presets are available for video and image clips.');
      }

      const existingEffect = findAiEnhancementEffect(clip);
      const nextEffect: ClipEffect = {
        id: existingEffect?.id ?? `effect-ai-enhance-${Date.now()}-${clip.id}`,
        type: 'ai',
        label: `${AI_ENHANCEMENT_EFFECT_LABEL}: ${preset.label}`,
        enabled: true,
        parameters: { ...preset.parameters },
      };

      updated = true;
      return {
        ...clip,
        effects: existingEffect
          ? clip.effects.map((effect) => (effect.id === existingEffect.id ? nextEffect : effect))
          : [...clip.effects, nextEffect],
      };
    }),
  }));

  if (!updated) {
    throw new Error('Clip not found.');
  }

  return {
    ...project,
    tracks,
    updatedAt: new Date().toISOString(),
  };
}

export function applyAiEnhancementPresetToClips(
  project: EditorProject,
  clipIds: string[],
  presetId: AiEnhancementPresetId,
): ClipBatchEditResult {
  const preset = findAiEnhancementPreset(presetId);
  if (!preset) {
    throw new Error('AI enhancement preset not found.');
  }

  const requestedIds = clipIds.filter(Boolean);
  if (requestedIds.length === 0) {
    throw new Error('No target clips selected.');
  }

  const targetIds = expandClipIdsWithLinkedAndGroupedClips(project, requestedIds);
  if (targetIds.length === 0) {
    throw new Error('Target clip not found.');
  }

  let nextProject = project;
  const updatedClipIds: string[] = [];
  const skipped: ClipBatchEditSkippedClip[] = [];

  for (const clipId of targetIds) {
    const clip = findClip(nextProject, clipId);
    if (!clip) {
      skipped.push({ clipId, reason: 'Clip not found.' });
      continue;
    }

    try {
      nextProject = applyAiEnhancementPreset(nextProject, clip.id, preset.id);
      updatedClipIds.push(clip.id);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('locked track') || message.includes('locked clip') || message.includes('locked track or clip')) {
        throw error;
      }

      skipped.push({ clipId: clip.id, reason: message });
    }
  }

  if (updatedClipIds.length === 0) {
    const reason = skipped[0]?.reason;
    throw new Error(reason ? `No selected clips could receive AI enhancement preset: ${reason}` : 'No selected clips could receive AI enhancement preset.');
  }

  return {
    project: nextProject,
    updatedClipIds,
    skipped,
  };
}

function isAiEnhancementPresetId(value: string): value is AiEnhancementPresetId {
  return AI_ENHANCEMENT_PRESETS.some((preset) => preset.id === value);
}

function normalizeModelPassBlendMode(value: string | undefined): AiModelPassBlendMode {
  return value === 'screen' ||
    value === 'multiply' ||
    value === 'overlay' ||
    value === 'add'
    ? value
    : 'normal';
}

function normalizeModelPassPurpose(value: string | undefined): AiModelPassPurpose {
  return value === 'restoration' ||
    value === 'segmentation-matte' ||
    value === 'beauty-retouch'
    ? value
    : 'generic';
}

function normalizeModelPassKind(value: string | undefined): AiModelPassKind {
  const lower = value?.trim().toLowerCase() ?? '';
  const mediaKind = inferSupportedMediaFileKind({
    name: lower,
    mimeType: isMimeTypeText(lower) ? lower : undefined,
  });
  if (mediaKind === 'image') {
    return 'image';
  }

  if (mediaKind === 'video') {
    return 'video';
  }

  return lower.includes('image') ? 'image' : 'video';
}

function isMimeTypeText(value: string): boolean {
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+(?:\s*;.*)?$/i.test(value);
}

function isRenderableModelPassPath(value: string): boolean {
  return value.trim().length > 0 &&
    !/^https?:\/\//i.test(value) &&
    !value.startsWith('blob:') &&
    !value.startsWith('local://');
}

function readText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readOptionalClampedNumber(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? clampNumber(value, min, max) : undefined;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundNumber(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isVisualMediaClip(clip: TimelineClip, asset?: EditorAsset): boolean {
  return clip.kind === 'video' ||
    clip.kind === 'image' ||
    isRenderableVisualMediaAsset(asset) ||
    isAdjustmentLayerClip(clip, asset);
}
