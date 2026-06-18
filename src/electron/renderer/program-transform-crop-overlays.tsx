import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  isCropMaskEffect,
  readCropMaskParameters,
  resolveCropMaskHandleDrag,
  type CropMaskHandle,
  type CropMaskParameters,
} from '../../lib/editor/crop-mask';
import { resolveMotionDragPatch } from '../../lib/editor/motion-transform';
import type { ProgramPreviewStack } from '../../lib/editor/preview';
import type { ProgramMonitorGuides, ProgramMotionPatch } from './editor-view-model';

export function ProgramLayerSelectionTargets({
  layers,
  selectedClipId,
  canvasScale,
  canvasWidth,
  canvasHeight,
  onSelect,
}: {
  layers: ProgramPreviewStack['layers'];
  selectedClipId?: string;
  canvasScale: number;
  canvasWidth: number;
  canvasHeight: number;
  onSelect: (clipId: string) => void;
}) {
  if (layers.length === 0) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-30">
      {layers.map((layer, index) => {
        if (!layer.asset) {
          return null;
        }

        const box = buildProgramLayerBox(layer, canvasScale, canvasWidth, canvasHeight);
        return (
          <button
            key={`select-${layer.trackId}-${layer.clip.id}`}
            type="button"
            aria-label={`Select ${layer.clip.name}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelect(layer.clip.id);
            }}
            className={`absolute left-1/2 top-1/2 border bg-transparent outline-none transition ${
              selectedClipId === layer.clip.id
                ? 'border-emerald-300/20 focus:border-emerald-200'
                : 'border-transparent hover:border-white/50 focus:border-emerald-200'
            }`}
            style={{
              zIndex: index + 1,
              width: box.width,
              height: box.height,
              transform: `translate(-50%, -50%) translate(${layer.style.positionX * box.scale}px, ${layer.style.positionY * box.scale}px) rotate(${layer.style.rotation}deg)`,
            }}
          />
        );
      })}
    </div>
  );
}

export function ProgramMonitorCenterGuides({
  guides,
  canvasScale,
  canvasWidth,
  canvasHeight,
}: {
  guides: ProgramMonitorGuides;
  canvasScale: number;
  canvasWidth: number;
  canvasHeight: number;
}) {
  const safeScale = canvasScale > 0.001 ? canvasScale : 1;

  return (
    <div
      className="pointer-events-none absolute left-1/2 top-1/2 z-[35] -translate-x-1/2 -translate-y-1/2"
      style={{
        width: canvasWidth * safeScale,
        height: canvasHeight * safeScale,
      }}
    >
      {guides.centerX ? (
        <span className="absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-amber-300/90 shadow-[0_0_8px_rgba(252,211,77,0.5)]" />
      ) : null}
      {guides.centerY ? (
        <span className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-amber-300/90 shadow-[0_0_8px_rgba(252,211,77,0.5)]" />
      ) : null}
    </div>
  );
}

export function ProgramCropOverlay({
  layer,
  canvasScale,
  canvasWidth,
  canvasHeight,
  onDraft,
  onCommit,
  onCancel,
}: {
  layer: ProgramPreviewStack['mediaLayers'][number];
  canvasScale: number;
  canvasWidth: number;
  canvasHeight: number;
  onDraft: (parameters: CropMaskParameters) => void;
  onCommit: (parameters: CropMaskParameters) => void;
  onCancel: () => void;
}) {
  const box = buildProgramLayerBox(layer, canvasScale, canvasWidth, canvasHeight);
  const safeScale = box.scale;
  const crop = readCropMaskParameters(layer.clip.effects.find((effect) => effect.enabled && isCropMaskEffect(effect)));
  const cropLeft = crop.left * box.width;
  const cropRight = crop.right * box.width;
  const cropTop = crop.top * box.height;
  const cropBottom = crop.bottom * box.height;
  const cropWidth = Math.max(12, box.width - cropLeft - cropRight);
  const cropHeight = Math.max(12, box.height - cropTop - cropBottom);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, handle: CropMaskHandle) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const originX = event.clientX;
    const originY = event.clientY;
    const startCrop = readCropMaskParameters(layer.clip.effects.find((effect) => effect.enabled && isCropMaskEffect(effect)));
    const rotation = -layer.style.rotation * Math.PI / 180;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    let moved = false;
    let nextParameters = startCrop;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const rawDeltaX = moveEvent.clientX - originX;
      const rawDeltaY = moveEvent.clientY - originY;
      const localDeltaX = (rawDeltaX * cos) - (rawDeltaY * sin);
      const localDeltaY = (rawDeltaX * sin) + (rawDeltaY * cos);
      moved = moved || Math.abs(localDeltaX) > 0.5 || Math.abs(localDeltaY) > 0.5;
      nextParameters = resolveCropMaskHandleDrag({
        parameters: startCrop,
        handle,
        deltaX: localDeltaX,
        deltaY: localDeltaY,
        boxWidth: box.width,
        boxHeight: box.height,
      });
      onDraft(nextParameters);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);

      if (moved) {
        onCommit(nextParameters);
        return;
      }

      onCancel();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  return (
    <div
      className="pointer-events-none absolute left-1/2 top-1/2 z-50 border border-amber-300/60"
      style={{
        width: box.width,
        height: box.height,
        transform: `translate(-50%, -50%) translate(${layer.style.positionX * safeScale}px, ${layer.style.positionY * safeScale}px) rotate(${layer.style.rotation}deg)`,
      }}
    >
      <div
        className="absolute border border-amber-300/95 bg-amber-300/5 shadow-[0_0_0_1px_rgba(0,0,0,0.7)]"
        style={{
          left: cropLeft,
          top: cropTop,
          width: cropWidth,
          height: cropHeight,
        }}
      />
      <button
        type="button"
        aria-label="Crop left edge"
        onPointerDown={(event) => handlePointerDown(event, 'left')}
        className="pointer-events-auto absolute h-8 w-3 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize border border-amber-200 bg-zinc-950"
        style={{ left: cropLeft, top: cropTop + cropHeight / 2 }}
      />
      <button
        type="button"
        aria-label="Crop right edge"
        onPointerDown={(event) => handlePointerDown(event, 'right')}
        className="pointer-events-auto absolute h-8 w-3 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize border border-amber-200 bg-zinc-950"
        style={{ left: cropLeft + cropWidth, top: cropTop + cropHeight / 2 }}
      />
      <button
        type="button"
        aria-label="Crop top edge"
        onPointerDown={(event) => handlePointerDown(event, 'top')}
        className="pointer-events-auto absolute h-3 w-8 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize border border-amber-200 bg-zinc-950"
        style={{ left: cropLeft + cropWidth / 2, top: cropTop }}
      />
      <button
        type="button"
        aria-label="Crop bottom edge"
        onPointerDown={(event) => handlePointerDown(event, 'bottom')}
        className="pointer-events-auto absolute h-3 w-8 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize border border-amber-200 bg-zinc-950"
        style={{ left: cropLeft + cropWidth / 2, top: cropTop + cropHeight }}
      />
    </div>
  );
}

export function ProgramTransformOverlay({
  layer,
  canvasScale,
  canvasWidth,
  canvasHeight,
  onDraft,
  onCommit,
  onCancel,
  onGuidesChange,
}: {
  layer: ProgramPreviewStack['layers'][number];
  canvasScale: number;
  canvasWidth: number;
  canvasHeight: number;
  onDraft: (patch: ProgramMotionPatch) => void;
  onCommit: (patch: ProgramMotionPatch) => void;
  onCancel: () => void;
  onGuidesChange: (guides: ProgramMonitorGuides | null) => void;
}) {
  const box = buildProgramLayerBox(layer, canvasScale, canvasWidth, canvasHeight);
  const safeScale = box.scale;
  const boxWidth = box.width;
  const boxHeight = box.height;

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const originX = event.clientX;
    const originY = event.clientY;
    const startX = layer.style.positionX;
    const startY = layer.style.positionY;
    let moved = false;
    let nextPatch: ProgramMotionPatch = {
      positionX: startX,
      positionY: startY,
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = (moveEvent.clientX - originX) / safeScale;
      const deltaY = (moveEvent.clientY - originY) / safeScale;
      const resolution = resolveMotionDragPatch({
        startX,
        startY,
        deltaX,
        deltaY,
        previewScale: safeScale,
      });
      moved = moved || Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5;
      nextPatch = resolution.patch;
      onGuidesChange(resolution.guides);
      onDraft(nextPatch);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);

      if (moved) {
        onGuidesChange(null);
        onCommit(nextPatch);
        return;
      }

      onGuidesChange(null);
      onCancel();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleScalePointerDown = (event: ReactPointerEvent<HTMLSpanElement>, handle: 'nw' | 'ne' | 'sw' | 'se') => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const originX = event.clientX;
    const originY = event.clientY;
    const startScale = layer.style.scale;
    const signX = handle.includes('e') ? 1 : -1;
    const signY = handle.includes('s') ? 1 : -1;
    const diagonalPixels = Math.max(96, Math.sqrt((boxWidth * boxWidth) + (boxHeight * boxHeight)));
    let moved = false;
    let nextPatch: ProgramMotionPatch = { scale: startScale };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const projectedPixels = ((moveEvent.clientX - originX) * signX) + ((moveEvent.clientY - originY) * signY);
      const scaleDelta = (projectedPixels / Math.max(1, diagonalPixels)) * startScale;
      const nextScale = clampNumber(roundTime(startScale + scaleDelta), 0.05, 8);
      moved = moved || Math.abs(nextScale - startScale) > 0.005;
      nextPatch = { scale: nextScale };
      onDraft(nextPatch);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);

      if (moved) {
        onCommit(nextPatch);
        return;
      }

      onCancel();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleRotationPointerDown = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget.parentElement;
    if (!target) {
      return;
    }

    const rect = target.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const startAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI;
    const startRotation = layer.style.rotation;
    let moved = false;
    let nextPatch: ProgramMotionPatch = { rotation: startRotation };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const currentAngle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX) * 180 / Math.PI;
      const delta = currentAngle - startAngle;
      const nextRotation = clampNumber(roundTime(startRotation + delta), -360, 360);
      moved = moved || Math.abs(nextRotation - startRotation) > 0.5;
      nextPatch = { rotation: nextRotation };
      onDraft(nextPatch);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);

      if (moved) {
        onCommit(nextPatch);
        return;
      }

      onCancel();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Selected visual transform"
      onPointerDown={handlePointerDown}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onCancel();
        }
      }}
      className="absolute left-1/2 top-1/2 z-40 cursor-move border border-emerald-300/90 bg-emerald-300/5 shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
      style={{
        width: boxWidth,
        height: boxHeight,
        transform: `translate(-50%, -50%) translate(${layer.style.positionX * safeScale}px, ${layer.style.positionY * safeScale}px) rotate(${layer.style.rotation}deg)`,
      }}
    >
      <span className="absolute left-1/2 top-[-30px] h-[30px] w-px -translate-x-1/2 bg-emerald-300/80" />
      <span
        role="button"
        tabIndex={-1}
        aria-label="Rotate selected visual"
        onPointerDown={handleRotationPointerDown}
        className="absolute left-1/2 top-[-42px] h-4 w-4 -translate-x-1/2 cursor-grab rounded-full border border-emerald-200 bg-zinc-950 active:cursor-grabbing"
      />
      <span
        role="button"
        tabIndex={-1}
        aria-label="Scale from top left"
        onPointerDown={(event) => handleScalePointerDown(event, 'nw')}
        className="absolute -left-1.5 -top-1.5 h-3 w-3 cursor-nwse-resize border border-emerald-200 bg-zinc-950"
      />
      <span
        role="button"
        tabIndex={-1}
        aria-label="Scale from top right"
        onPointerDown={(event) => handleScalePointerDown(event, 'ne')}
        className="absolute -right-1.5 -top-1.5 h-3 w-3 cursor-nesw-resize border border-emerald-200 bg-zinc-950"
      />
      <span
        role="button"
        tabIndex={-1}
        aria-label="Scale from bottom left"
        onPointerDown={(event) => handleScalePointerDown(event, 'sw')}
        className="absolute -bottom-1.5 -left-1.5 h-3 w-3 cursor-nesw-resize border border-emerald-200 bg-zinc-950"
      />
      <span
        role="button"
        tabIndex={-1}
        aria-label="Scale from bottom right"
        onPointerDown={(event) => handleScalePointerDown(event, 'se')}
        className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize border border-emerald-200 bg-zinc-950"
      />
      <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-200 bg-zinc-950" />
    </div>
  );
}

function buildProgramLayerBox(
  layer: ProgramPreviewStack['layers'][number],
  canvasScale: number,
  canvasWidth: number,
  canvasHeight: number,
): { width: number; height: number; scale: number } {
  const safeScale = canvasScale > 0.001 ? canvasScale : 1;
  const isTextLayer = layer.asset?.kind === 'text' || layer.clip.kind === 'text';
  const sourceWidth = isTextLayer ? Math.min(canvasWidth, 720) : layer.asset?.width ?? canvasWidth;
  const sourceHeight = isTextLayer ? Math.min(canvasHeight, 180) : layer.asset?.height ?? canvasHeight;
  const maxWidth = Math.max(96, canvasWidth * safeScale);
  const maxHeight = Math.max(54, canvasHeight * safeScale);

  return {
    width: clampNumber(sourceWidth * safeScale * layer.style.scale, 56, maxWidth),
    height: clampNumber(sourceHeight * safeScale * layer.style.scale, 36, maxHeight),
    scale: safeScale,
  };
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}
