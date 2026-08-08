import type { ClipEffect, TimelineClip } from './types';

export interface CropMaskParameters {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export type CropMaskPresetId = 'reset' | 'soft-center' | 'square-center' | 'vertical-center' | 'cinematic-letterbox';

export interface CropMaskPreset {
  id: CropMaskPresetId;
  label: string;
  parameters: CropMaskParameters;
}

export type CropMaskHandle = 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export const CROP_MASK_EFFECT_LABEL = 'Crop';

export const DEFAULT_CROP_MASK_PARAMETERS: CropMaskParameters = {
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};

export const CROP_MASK_PRESETS: CropMaskPreset[] = [
  { id: 'reset', label: 'No crop', parameters: DEFAULT_CROP_MASK_PARAMETERS },
  { id: 'soft-center', label: 'Soft center', parameters: { left: 0.05, right: 0.05, top: 0, bottom: 0 } },
  { id: 'square-center', label: 'Square', parameters: { left: 0.219, right: 0.219, top: 0, bottom: 0 } },
  { id: 'vertical-center', label: '9:16', parameters: { left: 0.342, right: 0.342, top: 0, bottom: 0 } },
  { id: 'cinematic-letterbox', label: 'Letterbox', parameters: { left: 0, right: 0, top: 0.12, bottom: 0.12 } },
];

export function findCropMaskPreset(presetId: CropMaskPresetId): CropMaskPreset | undefined {
  return CROP_MASK_PRESETS.find((preset) => preset.id === presetId);
}

export function isCropMaskEffect(effect: ClipEffect): boolean {
  return effect.type === 'mask' && (
    effect.parameters.left !== undefined ||
    effect.parameters.right !== undefined ||
    effect.parameters.top !== undefined ||
    effect.parameters.bottom !== undefined
  );
}

export function hasSupportedCropMaskEffect(effect: ClipEffect): boolean {
  return isCropMaskEffect(effect);
}

export function findCropMaskEffect(clip: TimelineClip): ClipEffect | undefined {
  return clip.effects.find(isCropMaskEffect);
}

export function normalizeCropMaskParameters(parameters: Partial<CropMaskParameters>): CropMaskParameters {
  return {
    left: normalizeCropRatio(parameters.left),
    right: normalizeCropRatio(parameters.right),
    top: normalizeCropRatio(parameters.top),
    bottom: normalizeCropRatio(parameters.bottom),
  };
}

export function resolveCropMaskHandleDrag({
  parameters,
  handle,
  deltaX,
  deltaY,
  boxWidth,
  boxHeight,
}: {
  parameters: Partial<CropMaskParameters>;
  handle: CropMaskHandle;
  deltaX: number;
  deltaY: number;
  boxWidth: number;
  boxHeight: number;
}): CropMaskParameters {
  const current = normalizeCropMaskParameters(parameters);
  const horizontalDelta = boxWidth > 1 ? deltaX / boxWidth : 0;
  const verticalDelta = boxHeight > 1 ? deltaY / boxHeight : 0;

  return normalizeCropMaskParameters({
    ...current,
    left: handle.includes('left') ? current.left + horizontalDelta : current.left,
    right: handle.includes('right') ? current.right - horizontalDelta : current.right,
    top: handle.includes('top') ? current.top + verticalDelta : current.top,
    bottom: handle.includes('bottom') ? current.bottom - verticalDelta : current.bottom,
  });
}

export function readCropMaskParameters(effect?: ClipEffect): CropMaskParameters {
  if (!effect) {
    return { ...DEFAULT_CROP_MASK_PARAMETERS };
  }

  return normalizeCropMaskParameters({
    left: readNumber(effect.parameters.left, DEFAULT_CROP_MASK_PARAMETERS.left),
    right: readNumber(effect.parameters.right, DEFAULT_CROP_MASK_PARAMETERS.right),
    top: readNumber(effect.parameters.top, DEFAULT_CROP_MASK_PARAMETERS.top),
    bottom: readNumber(effect.parameters.bottom, DEFAULT_CROP_MASK_PARAMETERS.bottom),
  });
}

function normalizeCropRatio(value: number | undefined): number {
  const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.round(Math.min(0.45, Math.max(0, safeValue)) * 1000) / 1000;
}

function readNumber(value: string | number | boolean | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
