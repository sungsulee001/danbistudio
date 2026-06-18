import type { CaptionSegment, CaptionStyle, ExportProfile } from './types';

export const DEFAULT_CAPTION_STYLE: Required<CaptionStyle> = {
  fontSize: 52,
  fontColor: '#ffffff',
  boxEnabled: true,
  boxColor: '#000000',
  boxOpacity: 0.58,
  shadowEnabled: true,
  shadowColor: '#000000',
  shadowOpacity: 0.65,
  shadowOffset: 2,
  position: 'bottom',
  align: 'center',
};

export function defaultCaptionStyle(): Required<CaptionStyle> {
  return { ...DEFAULT_CAPTION_STYLE };
}

export function normalizeCaptionStyle(
  style: CaptionStyle | undefined,
  fallbackFontSize = DEFAULT_CAPTION_STYLE.fontSize,
): Required<CaptionStyle> {
  return {
    fontSize: clampNumber(readNumber(style?.fontSize, fallbackFontSize), 12, 180),
    fontColor: normalizeHexColor(style?.fontColor, DEFAULT_CAPTION_STYLE.fontColor),
    boxEnabled: style?.boxEnabled ?? DEFAULT_CAPTION_STYLE.boxEnabled,
    boxColor: normalizeHexColor(style?.boxColor, DEFAULT_CAPTION_STYLE.boxColor),
    boxOpacity: clampNumber(readNumber(style?.boxOpacity, DEFAULT_CAPTION_STYLE.boxOpacity), 0, 1),
    shadowEnabled: style?.shadowEnabled ?? DEFAULT_CAPTION_STYLE.shadowEnabled,
    shadowColor: normalizeHexColor(style?.shadowColor, DEFAULT_CAPTION_STYLE.shadowColor),
    shadowOpacity: clampNumber(readNumber(style?.shadowOpacity, DEFAULT_CAPTION_STYLE.shadowOpacity), 0, 1),
    shadowOffset: clampNumber(readNumber(style?.shadowOffset, DEFAULT_CAPTION_STYLE.shadowOffset), 0, 32),
    position: isCaptionPosition(style?.position) ? style.position : DEFAULT_CAPTION_STYLE.position,
    align: isCaptionAlign(style?.align) ? style.align : DEFAULT_CAPTION_STYLE.align,
  };
}

export function normalizeCaptionRenderStyle(caption: CaptionSegment, profile: Pick<ExportProfile, 'height'>): Required<CaptionStyle> {
  const fallbackFontSize = Math.max(18, Math.round(profile.height * 0.045));
  return normalizeCaptionStyle(caption.style, fallbackFontSize);
}

export function captionColorToFfmpeg(value: string): string {
  return `0x${normalizeHexColor(value).slice(1).toUpperCase()}`;
}

export function normalizeHexColor(value: string | undefined, fallback = DEFAULT_CAPTION_STYLE.fontColor): string {
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  return fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function isCaptionPosition(value: unknown): value is Required<CaptionStyle>['position'] {
  return value === 'top' || value === 'middle' || value === 'bottom';
}

function isCaptionAlign(value: unknown): value is Required<CaptionStyle>['align'] {
  return value === 'left' || value === 'center' || value === 'right';
}
