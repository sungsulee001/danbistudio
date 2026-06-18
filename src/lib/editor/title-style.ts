import type { CaptionStyle, ClipEffect, TimelineClip } from './types';
import { normalizeCaptionStyle } from './caption-style';

export const TITLE_STYLE_EFFECT_LABEL = 'Title style';

export const DEFAULT_TITLE_STYLE: Required<CaptionStyle> = {
  fontSize: 72,
  fontColor: '#ffffff',
  boxEnabled: false,
  boxColor: '#000000',
  boxOpacity: 0.55,
  shadowEnabled: true,
  shadowColor: '#000000',
  shadowOpacity: 0.72,
  shadowOffset: 3,
  position: 'middle',
  align: 'center',
};

export function defaultTitleStyle(): Required<CaptionStyle> {
  return { ...DEFAULT_TITLE_STYLE };
}

export function normalizeTitleStyle(
  style: CaptionStyle | undefined,
  fallbackFontSize = DEFAULT_TITLE_STYLE.fontSize,
): Required<CaptionStyle> {
  return normalizeCaptionStyle({
    ...DEFAULT_TITLE_STYLE,
    ...style,
  }, fallbackFontSize);
}

export function findTitleStyleEffect(clip: TimelineClip): ClipEffect | undefined {
  return clip.effects.find((effect) => effect.type === 'caption' && isTitleStyleEffect(effect));
}

export function isTitleStyleEffect(effect: ClipEffect): boolean {
  return effect.label === TITLE_STYLE_EFFECT_LABEL || effect.parameters.titleStyle === true;
}

export function readTitleStyle(clip: TimelineClip, fallbackFontSize = DEFAULT_TITLE_STYLE.fontSize): Required<CaptionStyle> {
  const effect = findTitleStyleEffect(clip);
  return normalizeTitleStyle(effect?.enabled === false ? undefined : effect?.parameters as CaptionStyle | undefined, fallbackFontSize);
}
