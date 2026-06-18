import type { ClipEffect, TimelineClip } from './types';

export type CanvasLayoutMode = 'fit' | 'fill' | 'stretch';

export const CANVAS_LAYOUT_EFFECT_LABEL = 'Canvas layout';

export function isCanvasLayoutEffect(effect: ClipEffect): boolean {
  return effect.type === 'layout' && effect.parameters.mode !== undefined;
}

export function findCanvasLayoutEffect(clip: TimelineClip): ClipEffect | undefined {
  return clip.effects.find(isCanvasLayoutEffect);
}

export function findEnabledCanvasLayoutEffect(clip: TimelineClip): ClipEffect | undefined {
  return clip.effects.find((effect) => effect.enabled && isCanvasLayoutEffect(effect));
}

export function readClipCanvasLayoutMode(clip: TimelineClip): CanvasLayoutMode {
  const effect = findEnabledCanvasLayoutEffect(clip);
  return normalizeCanvasLayoutMode(effect?.parameters.mode);
}

export function normalizeCanvasLayoutMode(value: unknown): CanvasLayoutMode {
  return value === 'fill' || value === 'stretch' ? value : 'fit';
}

export function canvasLayoutLabel(mode: CanvasLayoutMode): string {
  switch (mode) {
    case 'fill':
      return 'Fill';
    case 'stretch':
      return 'Stretch';
    default:
      return 'Fit';
  }
}
