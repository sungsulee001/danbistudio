import type { CSSProperties } from 'react';
import { DEFAULT_CAPTION_STYLE, normalizeCaptionStyle, normalizeHexColor } from '../../lib/editor/caption-style';
import type { ProgramPreviewStack } from '../../lib/editor/preview';
import { readTitleStyle } from '../../lib/editor/title-style';
import type { CaptionSegment, CaptionStyle } from '../../lib/editor/types';
import type { ProgramMotionPatch } from './editor-view-model';

export function ProgramTextOverlays({
  stack,
  canvasScale,
  motionDraft,
}: {
  stack: ProgramPreviewStack;
  canvasScale: number;
  motionDraft: { clipId: string; patch: ProgramMotionPatch } | null;
}) {
  if (stack.textLayers.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0">
      {stack.textLayers.map((layer) => {
        const titleStyle = readTitleStyle(layer.clip);
        const displayLayerStyle = motionDraft?.clipId === layer.clip.id
          ? {
            ...layer.style,
            ...motionDraft.patch,
          }
          : layer.style;
        return (
          <div
            key={`${layer.trackId}-${layer.clip.id}`}
            className="absolute max-w-[82%] rounded px-5 py-3 font-semibold"
            style={buildTitlePreviewStyle(titleStyle, displayLayerStyle, canvasScale)}
          >
            {layer.text ?? layer.clip.name}
            {layer.enabledEffects.length > 0 ? (
              <div className="mt-1 text-xs font-medium uppercase tracking-wide text-emerald-200">
                {layer.enabledEffects.join(', ')}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function ProgramCaptionOverlays({ stack }: { stack: ProgramPreviewStack }) {
  if (stack.activeCaptions.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0">
      {stack.activeCaptions.map((caption) => {
        const style = normalizeCaptionStyle(caption.style);
        return (
          <div
            key={caption.id}
            className="absolute max-w-[84%] rounded px-4 py-2 font-semibold"
            style={buildCaptionPreviewStyle(style)}
          >
            {formatCaptionOverlayText(caption)}
          </div>
        );
      })}
    </div>
  );
}

export function ProgramEffectOverlay({ stack }: { stack: ProgramPreviewStack }) {
  const effectNames = [
    ...stack.effectLayers.map((layer) => layer.text ?? layer.clip.name),
    ...stack.layers.flatMap((layer) => layer.enabledEffects.map((effect) => `${layer.clip.name}: ${effect}`)),
  ];

  if (effectNames.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 max-w-[50%] space-y-1">
      {effectNames.slice(0, 4).map((effect) => (
        <div key={effect} className="rounded bg-emerald-950/80 px-3 py-1 text-[11px] font-medium text-emerald-100">
          {effect}
        </div>
      ))}
    </div>
  );
}

function buildCaptionPreviewStyle(style: Required<CaptionStyle>): CSSProperties {
  const positionStyle = buildCaptionPreviewPosition(style.position, style.align);

  return {
    ...positionStyle,
    color: style.fontColor,
    backgroundColor: style.boxEnabled ? hexToRgba(style.boxColor, style.boxOpacity) : 'transparent',
    fontSize: `${Math.max(12, Math.round(style.fontSize * 0.55))}px`,
    lineHeight: 1.2,
    textAlign: style.align,
    textShadow: buildTextShadow(style, 0.55),
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  };
}

function buildTitlePreviewStyle(style: Required<CaptionStyle>, layerStyle: ProgramPreviewStack['textLayers'][number]['style'], canvasScale = 1): CSSProperties {
  const positionStyle = buildCaptionPreviewPosition(style.position, style.align);
  const baseTransform = typeof positionStyle.transform === 'string' ? positionStyle.transform : '';
  const motionTransform = `translate(${layerStyle.positionX * canvasScale}px, ${layerStyle.positionY * canvasScale}px) scale(${layerStyle.scale}) rotate(${layerStyle.rotation}deg)`;

  return {
    ...positionStyle,
    color: style.fontColor,
    backgroundColor: style.boxEnabled ? hexToRgba(style.boxColor, style.boxOpacity) : 'transparent',
    fontSize: `${Math.max(12, Math.round(style.fontSize * 0.55))}px`,
    lineHeight: 1.12,
    textAlign: style.align,
    opacity: layerStyle.opacity,
    transform: baseTransform ? `${baseTransform} ${motionTransform}` : motionTransform,
    textShadow: buildTextShadow(style, 0.55),
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  };
}

function buildTextShadow(style: Required<CaptionStyle>, scale = 1): string | undefined {
  if (!style.shadowEnabled || style.shadowOpacity <= 0 || style.shadowOffset <= 0) {
    return undefined;
  }

  const offset = Math.max(1, Math.round(style.shadowOffset * scale));
  return `${offset}px ${offset}px 0 ${hexToRgba(style.shadowColor, style.shadowOpacity)}`;
}

function buildCaptionPreviewPosition(
  position: Required<CaptionStyle>['position'],
  align: Required<CaptionStyle>['align'],
): CSSProperties {
  const style: CSSProperties = {};

  if (position === 'top') {
    style.top = '12%';
  } else if (position === 'middle') {
    style.top = '50%';
    style.transform = 'translateY(-50%)';
  } else {
    style.bottom = '8%';
  }

  if (align === 'left') {
    style.left = '8%';
  } else if (align === 'right') {
    style.right = '8%';
  } else {
    style.left = '50%';
    style.transform = style.transform ? `${style.transform} translateX(-50%)` : 'translateX(-50%)';
  }

  return style;
}

function formatCaptionOverlayText(caption: CaptionSegment): string {
  const text = normalizeMultilineText(caption.text) || 'Caption';
  const speaker = caption.speaker?.trim();
  return speaker ? `${speaker}: ${text}` : text;
}

function normalizeMultilineText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/[ \t]+/g, ' '))
    .filter(Boolean)
    .join('\n');
}

function hexToRgba(hex: string, alpha: number): string {
  const color = normalizeHexColor(hex, DEFAULT_CAPTION_STYLE.boxColor);
  const value = Number.parseInt(color.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${clampNumber(alpha, 0, 1)})`;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}
