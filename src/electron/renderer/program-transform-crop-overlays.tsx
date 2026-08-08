import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  isCropMaskEffect,
  readCropMaskParameters,
  resolveCropMaskHandleDrag,
  type CropMaskHandle,
  type CropMaskParameters,
} from '../../lib/editor/crop-mask';
import type { ProgramPreviewStack } from '../../lib/editor/preview';
import type { ProgramMonitorGuides, ProgramMotionPatch } from './editor-view-model';
import {
  beginProgramMonitorMoveInteraction,
  beginProgramMonitorRotationInteraction,
  beginProgramMonitorScaleInteraction,
  resolveProgramMonitorMoveInteractionMove,
  resolveProgramMonitorRotationInteractionMove,
  resolveProgramMonitorScaleInteractionMove,
} from './program-monitor-interaction-adapter';

const PROGRAM_TRANSFORM_HANDLE_SIZE = 28;
const PROGRAM_TRANSFORM_ROTATE_HANDLE_SIZE = 30;
const PROGRAM_CROP_EDGE_HANDLE_SIZE = 24;
const PROGRAM_CROP_CORNER_HANDLE_SIZE = 28;

export function ProgramLayerSelectionTargets({
  layers,
  selectedClipId,
  canvasScale,
  canvasWidth,
  canvasHeight,
  onSelect,
  onMotionDraft,
  onMotionCommit,
  onMotionCancel,
  onGuidesChange,
}: {
  layers: ProgramPreviewStack['layers'];
  selectedClipId?: string;
  canvasScale: number;
  canvasWidth: number;
  canvasHeight: number;
  onSelect: (clipId: string) => void;
  onMotionDraft?: (clipId: string, patch: ProgramMotionPatch) => void;
  onMotionCommit?: (clipId: string, patch: ProgramMotionPatch) => void;
  onMotionCancel?: (clipId: string) => void;
  onGuidesChange?: (guides: ProgramMonitorGuides | null) => void;
}) {
  if (layers.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="program-layer-selection-targets"
      data-layer-count={layers.filter((layer) => layer.asset).length}
      data-selected-clip-id={selectedClipId ?? ''}
      className="absolute inset-0 z-30"
    >
      {layers.map((layer, index) => {
        if (!layer.asset) {
          return null;
        }

        const box = buildProgramLayerBox(layer, canvasScale, canvasWidth, canvasHeight);
        const selected = selectedClipId === layer.clip.id;
        const layerKind = layer.asset.kind ?? layer.clip.kind;
        const hasMotionKeyframes = layer.clip.keyframes.some((keyframe) => (
          keyframe.property === 'positionX' ||
          keyframe.property === 'positionY' ||
          keyframe.property === 'scale' ||
          keyframe.property === 'rotation'
        ));
        const motionEditable = !layer.clip.locked && !hasMotionKeyframes;
        const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
          if (event.button !== 0) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          onSelect(layer.clip.id);

          if (!onMotionDraft || !onMotionCommit) {
            return;
          }

          let moveSession = beginProgramMonitorMoveInteraction({
            clientX: event.clientX,
            clientY: event.clientY,
            startX: layer.style.positionX,
            startY: layer.style.positionY,
            previewScale: box.scale,
          });
          let moved = false;
          let nextPatch: ProgramMotionPatch = {
            positionX: layer.style.positionX,
            positionY: layer.style.positionY,
          };

          const handlePointerMove = (moveEvent: PointerEvent) => {
            const move = resolveProgramMonitorMoveInteractionMove({
              session: moveSession,
              clientX: moveEvent.clientX,
              clientY: moveEvent.clientY,
            });
            moveSession = move.session;
            if (!move.session.moved) {
              return;
            }

            moved = move.session.moved;
            nextPatch = move.patch;
            onGuidesChange?.(move.guides);
            onMotionDraft(layer.clip.id, nextPatch);
          };

          const handlePointerUp = () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            onGuidesChange?.(null);

            if (moved) {
              onMotionCommit(layer.clip.id, nextPatch);
              return;
            }

            onMotionCancel?.(layer.clip.id);
          };

          window.addEventListener('pointermove', handlePointerMove);
          window.addEventListener('pointerup', handlePointerUp);
        };

        return (
          <button
            key={`select-${layer.trackId}-${layer.clip.id}`}
            type="button"
            aria-label={`Select ${layer.clip.name}`}
            data-testid={`program-layer-select-${layer.clip.id}`}
            data-layer-clip-id={layer.clip.id}
            data-layer-name={layer.clip.name}
            data-layer-kind={layerKind}
            data-layer-track-id={layer.trackId}
            data-layer-track-name={layer.trackName}
            data-layer-stack-index={index}
            data-layer-selected={selected ? 'true' : 'false'}
            data-layer-width={Math.round(box.width)}
            data-layer-height={Math.round(box.height)}
            data-layer-locked={layer.clip.locked ? 'true' : 'false'}
            data-layer-motion-keyframed={hasMotionKeyframes ? 'true' : 'false'}
            data-layer-motion-editable={motionEditable ? 'true' : 'false'}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelect(layer.clip.id);
            }}
            onPointerDown={handlePointerDown}
            className={`group absolute left-1/2 top-1/2 border bg-transparent outline-none transition ${
              selected
                ? 'border-accent-700/20 focus:border-accent-800'
                : 'border-transparent hover:border-white/50 focus:border-accent-800'
            } ${onMotionDraft && onMotionCommit ? 'cursor-move' : 'cursor-default'}`}
            style={{
              zIndex: index + 1,
              width: box.width,
              height: box.height,
              transform: `translate(-50%, -50%) translate(${layer.style.positionX * box.scale}px, ${layer.style.positionY * box.scale}px) rotate(${layer.style.rotation}deg)`,
            }}
          >
            <span
              data-testid={`program-layer-select-label-${layer.clip.id}`}
              className={`pointer-events-none absolute left-1 top-1 max-w-[calc(100%-8px)] truncate rounded px-1.5 py-0.5 text-micro font-semibold shadow ${
                selected
                  ? 'bg-accent-700 text-paper opacity-100'
                  : 'bg-paper/85 text-ink opacity-0 group-hover:opacity-100 group-focus:opacity-100'
              }`}
            >
              {layer.clip.name}
            </span>
          </button>
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
        <span className="absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-warn-700/90 shadow-[0_0_8px_rgba(252,211,77,0.5)]" />
      ) : null}
      {guides.centerY ? (
        <span className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-warn-700/90 shadow-[0_0_8px_rgba(252,211,77,0.5)]" />
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
  const [activeHandle, setActiveHandle] = useState<CropMaskHandle | 'idle'>('idle');
  const [draftCrop, setDraftCrop] = useState<CropMaskParameters | null>(null);
  const box = buildProgramLayerBox(layer, canvasScale, canvasWidth, canvasHeight);
  const safeScale = box.scale;
  const crop = readCropMaskParameters(layer.clip.effects.find((effect) => effect.enabled && isCropMaskEffect(effect)));
  const displayCrop = draftCrop ?? crop;
  const cropLeft = displayCrop.left * box.width;
  const cropRight = displayCrop.right * box.width;
  const cropTop = displayCrop.top * box.height;
  const cropBottom = displayCrop.bottom * box.height;
  const cropWidth = Math.max(12, box.width - cropLeft - cropRight);
  const cropHeight = Math.max(12, box.height - cropTop - cropBottom);
  const cropCornerInset = Math.min(20, cropWidth / 3, cropHeight / 3);
  const boxOriginX = -box.width / 2;
  const boxOriginY = -box.height / 2;

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, handle: CropMaskHandle) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setActiveHandle(handle);
    const originX = event.clientX;
    const originY = event.clientY;
    const startCrop = readCropMaskParameters(layer.clip.effects.find((effect) => effect.enabled && isCropMaskEffect(effect)));
    setDraftCrop(startCrop);
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
      setDraftCrop(nextParameters);
      onDraft(nextParameters);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      setActiveHandle('idle');
      setDraftCrop(null);

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
      className="absolute left-1/2 top-1/2 z-50 h-0 w-0 overflow-visible"
      data-testid={`program-crop-overlay-${layer.clip.id}`}
      data-crop-active-handle={activeHandle}
      data-crop-handle-size={PROGRAM_CROP_CORNER_HANDLE_SIZE}
      data-crop-draft-left={displayCrop.left}
      data-crop-draft-right={displayCrop.right}
      data-crop-draft-top={displayCrop.top}
      data-crop-draft-bottom={displayCrop.bottom}
      style={{
        transform: `translate(${layer.style.positionX * safeScale}px, ${layer.style.positionY * safeScale}px) rotate(${layer.style.rotation}deg)`,
      }}
    >
      <div
        data-testid={`program-crop-box-${layer.clip.id}`}
        data-crop-left={displayCrop.left}
        data-crop-right={displayCrop.right}
        data-crop-top={displayCrop.top}
        data-crop-bottom={displayCrop.bottom}
        data-crop-active-handle={activeHandle}
        data-crop-handle-size={PROGRAM_CROP_CORNER_HANDLE_SIZE}
        className="pointer-events-none absolute border border-warn-700/95 bg-warn-700/5 shadow-[0_0_0_1px_rgba(0,0,0,0.7)]"
        style={{
          left: boxOriginX + cropLeft,
          top: boxOriginY + cropTop,
          width: cropWidth,
          height: cropHeight,
        }}
      />
      {activeHandle !== 'idle' ? (
        <span
          data-testid={`program-crop-operation-hud-${layer.clip.id}`}
          data-crop-active-handle={activeHandle}
          data-crop-draft-left={displayCrop.left}
          data-crop-draft-right={displayCrop.right}
          data-crop-draft-top={displayCrop.top}
          data-crop-draft-bottom={displayCrop.bottom}
          className="pointer-events-none absolute left-0 top-0 z-30 -translate-y-[calc(100%+8px)] rounded bg-warn-700 px-2 py-1 text-micro font-semibold text-paper shadow"
        >
          <span className="block uppercase tracking-wide">Crop {activeHandle}</span>
          <span className="block tabular-nums text-micro">
            L {formatPercent(displayCrop.left)} / T {formatPercent(displayCrop.top)}
          </span>
        </span>
      ) : null}
      <button
        type="button"
        aria-label="Crop left edge"
        data-testid={`program-crop-handle-${layer.clip.id}-left`}
        data-crop-handle="left"
        data-handle-size={PROGRAM_CROP_EDGE_HANDLE_SIZE}
        onPointerDown={(event) => handlePointerDown(event, 'left')}
        className="pointer-events-auto absolute h-10 w-6 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-sm border border-warn-800 bg-paper/95 shadow-[0_0_0_1px_rgba(0,0,0,0.65)] hover:bg-warn-800 hover:text-paper"
        style={{ left: boxOriginX + cropLeft, top: boxOriginY + cropTop + cropHeight / 2 }}
      />
      <button
        type="button"
        aria-label="Crop right edge"
        data-testid={`program-crop-handle-${layer.clip.id}-right`}
        data-crop-handle="right"
        data-handle-size={PROGRAM_CROP_EDGE_HANDLE_SIZE}
        onPointerDown={(event) => handlePointerDown(event, 'right')}
        className="pointer-events-auto absolute h-10 w-6 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-sm border border-warn-800 bg-paper/95 shadow-[0_0_0_1px_rgba(0,0,0,0.65)] hover:bg-warn-800 hover:text-paper"
        style={{ left: boxOriginX + cropLeft + cropWidth, top: boxOriginY + cropTop + cropHeight / 2 }}
      />
      <button
        type="button"
        aria-label="Crop top edge"
        data-testid={`program-crop-handle-${layer.clip.id}-top`}
        data-crop-handle="top"
        data-handle-size={PROGRAM_CROP_EDGE_HANDLE_SIZE}
        onPointerDown={(event) => handlePointerDown(event, 'top')}
        className="pointer-events-auto absolute h-6 w-10 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize rounded-sm border border-warn-800 bg-paper/95 shadow-[0_0_0_1px_rgba(0,0,0,0.65)] hover:bg-warn-800 hover:text-paper"
        style={{ left: boxOriginX + cropLeft + cropWidth / 2, top: boxOriginY + cropTop }}
      />
      <button
        type="button"
        aria-label="Crop bottom edge"
        data-testid={`program-crop-handle-${layer.clip.id}-bottom`}
        data-crop-handle="bottom"
        data-handle-size={PROGRAM_CROP_EDGE_HANDLE_SIZE}
        onPointerDown={(event) => handlePointerDown(event, 'bottom')}
        className="pointer-events-auto absolute h-6 w-10 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize rounded-sm border border-warn-800 bg-paper/95 shadow-[0_0_0_1px_rgba(0,0,0,0.65)] hover:bg-warn-800 hover:text-paper"
        style={{ left: boxOriginX + cropLeft + cropWidth / 2, top: boxOriginY + cropTop + cropHeight }}
      />
      <button
        type="button"
        aria-label="Crop top left corner"
        data-testid={`program-crop-handle-${layer.clip.id}-top-left`}
        data-crop-handle="top-left"
        data-handle-size={PROGRAM_CROP_CORNER_HANDLE_SIZE}
        onPointerDown={(event) => handlePointerDown(event, 'top-left')}
        className="pointer-events-auto absolute z-20 h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-sm border border-warn-800 bg-paper/95 shadow-[0_0_0_1px_rgba(0,0,0,0.65)] hover:bg-warn-800 hover:text-paper"
        style={{ left: boxOriginX + cropLeft + cropCornerInset, top: boxOriginY + cropTop + cropCornerInset, pointerEvents: 'auto' }}
      />
      <button
        type="button"
        aria-label="Crop top right corner"
        data-testid={`program-crop-handle-${layer.clip.id}-top-right`}
        data-crop-handle="top-right"
        data-handle-size={PROGRAM_CROP_CORNER_HANDLE_SIZE}
        onPointerDown={(event) => handlePointerDown(event, 'top-right')}
        className="pointer-events-auto absolute z-20 h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-nesw-resize rounded-sm border border-warn-800 bg-paper/95 shadow-[0_0_0_1px_rgba(0,0,0,0.65)] hover:bg-warn-800 hover:text-paper"
        style={{ left: boxOriginX + cropLeft + cropWidth - cropCornerInset, top: boxOriginY + cropTop + cropCornerInset, pointerEvents: 'auto' }}
      />
      <button
        type="button"
        aria-label="Crop bottom left corner"
        data-testid={`program-crop-handle-${layer.clip.id}-bottom-left`}
        data-crop-handle="bottom-left"
        data-handle-size={PROGRAM_CROP_CORNER_HANDLE_SIZE}
        onPointerDown={(event) => handlePointerDown(event, 'bottom-left')}
        className="pointer-events-auto absolute z-20 h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-nesw-resize rounded-sm border border-warn-800 bg-paper/95 shadow-[0_0_0_1px_rgba(0,0,0,0.65)] hover:bg-warn-800 hover:text-paper"
        style={{ left: boxOriginX + cropLeft + cropCornerInset, top: boxOriginY + cropTop + cropHeight - cropCornerInset, pointerEvents: 'auto' }}
      />
      <button
        type="button"
        aria-label="Crop bottom right corner"
        data-testid={`program-crop-handle-${layer.clip.id}-bottom-right`}
        data-crop-handle="bottom-right"
        data-handle-size={PROGRAM_CROP_CORNER_HANDLE_SIZE}
        onPointerDown={(event) => handlePointerDown(event, 'bottom-right')}
        className="pointer-events-auto absolute z-20 h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-sm border border-warn-800 bg-paper/95 shadow-[0_0_0_1px_rgba(0,0,0,0.65)] hover:bg-warn-800 hover:text-paper"
        style={{ left: boxOriginX + cropLeft + cropWidth - cropCornerInset, top: boxOriginY + cropTop + cropHeight - cropCornerInset, pointerEvents: 'auto' }}
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
  const [activeOperation, setActiveOperation] = useState<'idle' | 'move' | 'scale' | 'rotate'>('idle');
  const [draftPatch, setDraftPatch] = useState<ProgramMotionPatch | null>(null);
  const box = buildProgramLayerBox(layer, canvasScale, canvasWidth, canvasHeight);
  const safeScale = box.scale;
  const boxWidth = box.width;
  const boxHeight = box.height;
  const boxTop = ((canvasHeight * safeScale) - boxHeight) / 2 + (layer.style.positionY * safeScale);
  const rotateHandleTop = Math.max(-42, 6 - boxTop);
  const rotateStemTop = rotateHandleTop + 12;
  const rotateStemHeight = Math.max(0, -rotateStemTop);
  const draftPositionX = draftPatch?.positionX ?? layer.style.positionX;
  const draftPositionY = draftPatch?.positionY ?? layer.style.positionY;
  const draftScale = draftPatch?.scale ?? layer.style.scale;
  const draftRotation = draftPatch?.rotation ?? layer.style.rotation;

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setActiveOperation('move');
    setDraftPatch({
      positionX: layer.style.positionX,
      positionY: layer.style.positionY,
    });
    let moveSession = beginProgramMonitorMoveInteraction({
      clientX: event.clientX,
      clientY: event.clientY,
      startX: layer.style.positionX,
      startY: layer.style.positionY,
      previewScale: safeScale,
    });
    let moved = false;
    let nextPatch: ProgramMotionPatch = {
      positionX: layer.style.positionX,
      positionY: layer.style.positionY,
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const move = resolveProgramMonitorMoveInteractionMove({
        session: moveSession,
        clientX: moveEvent.clientX,
        clientY: moveEvent.clientY,
      });
      moveSession = move.session;
      if (!move.session.moved) {
        return;
      }

      moved = move.session.moved;
      nextPatch = move.patch;
      setDraftPatch(nextPatch);
      onGuidesChange(move.guides);
      onDraft(nextPatch);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      setActiveOperation('idle');
      setDraftPatch(null);

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
    setActiveOperation('scale');
    setDraftPatch({ scale: layer.style.scale });
    let scaleSession = beginProgramMonitorScaleInteraction({
      clientX: event.clientX,
      clientY: event.clientY,
      startScale: layer.style.scale,
      handle,
      boxWidth,
      boxHeight,
    });
    let moved = false;
    let nextPatch: ProgramMotionPatch = { scale: layer.style.scale };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const move = resolveProgramMonitorScaleInteractionMove({
        session: scaleSession,
        clientX: moveEvent.clientX,
        clientY: moveEvent.clientY,
      });
      scaleSession = move.session;
      moved = move.session.moved;
      nextPatch = move.patch;
      setDraftPatch(nextPatch);
      onDraft(nextPatch);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      setActiveOperation('idle');
      setDraftPatch(null);

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
    setActiveOperation('rotate');
    setDraftPatch({ rotation: layer.style.rotation });
    const target = event.currentTarget.parentElement;
    if (!target) {
      return;
    }

    const rect = target.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let rotationSession = beginProgramMonitorRotationInteraction({
      clientX: event.clientX,
      clientY: event.clientY,
      centerX,
      centerY,
      startRotation: layer.style.rotation,
    });
    let moved = false;
    let nextPatch: ProgramMotionPatch = { rotation: layer.style.rotation };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const move = resolveProgramMonitorRotationInteractionMove({
        session: rotationSession,
        clientX: moveEvent.clientX,
        clientY: moveEvent.clientY,
      });
      rotationSession = move.session;
      moved = move.session.moved;
      nextPatch = move.patch;
      setDraftPatch(nextPatch);
      onDraft(nextPatch);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      setActiveOperation('idle');
      setDraftPatch(null);

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
      data-testid={`program-transform-overlay-${layer.clip.id}`}
      data-selected-clip-id={layer.clip.id}
      data-selected-clip-name={layer.clip.name}
      data-selected-track-id={layer.trackId}
      data-selected-track-name={layer.trackName}
      data-selected-layer-kind={layer.asset?.kind ?? layer.clip.kind}
      data-motion-position-x={layer.style.positionX}
      data-motion-position-y={layer.style.positionY}
      data-motion-render-x={layer.style.positionX * safeScale}
      data-motion-render-y={layer.style.positionY * safeScale}
      data-motion-scale={layer.style.scale}
      data-motion-rotation={layer.style.rotation}
      data-transform-active-operation={activeOperation}
      data-transform-draft-position-x={draftPositionX}
      data-transform-draft-position-y={draftPositionY}
      data-transform-draft-scale={draftScale}
      data-transform-draft-rotation={draftRotation}
      data-transform-handle-size={PROGRAM_TRANSFORM_HANDLE_SIZE}
      data-transform-rotate-handle-size={PROGRAM_TRANSFORM_ROTATE_HANDLE_SIZE}
      onPointerDown={handlePointerDown}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onCancel();
        }
      }}
      className={`absolute left-1/2 top-1/2 z-40 cursor-move border border-accent-700/90 bg-accent-700/5 shadow-[0_0_0_1px_rgba(0,0,0,0.6)] ${
        activeOperation === 'move' ? 'ring-2 ring-info-700/90' : activeOperation === 'scale' ? 'ring-2 ring-accent-700/90' : activeOperation === 'rotate' ? 'ring-2 ring-warn-700/90' : ''
      }`}
      style={{
        width: boxWidth,
        height: boxHeight,
        transform: `translate(-50%, -50%) translate(${layer.style.positionX * safeScale}px, ${layer.style.positionY * safeScale}px) rotate(${layer.style.rotation}deg)`,
      }}
    >
      {rotateStemHeight > 0 ? (
        <span
          className="absolute left-1/2 w-px -translate-x-1/2 bg-accent-700/80"
          style={{ top: rotateStemTop, height: rotateStemHeight }}
        />
      ) : null}
      <span
        data-testid={`program-transform-selection-label-${layer.clip.id}`}
        className="pointer-events-none absolute left-0 top-0 max-w-[calc(100%-8px)] translate-x-1 translate-y-1 truncate rounded bg-accent-700 px-1.5 py-0.5 text-micro font-semibold text-paper shadow"
      >
        {layer.clip.name}
      </span>
      <span
        data-testid={`program-transform-readout-${layer.clip.id}`}
        data-readout-position-x={draftPositionX}
        data-readout-position-y={draftPositionY}
        data-readout-scale={draftScale}
        data-readout-rotation={draftRotation}
        data-readout-width={Math.round(boxWidth)}
        data-readout-height={Math.round(boxHeight)}
        className="pointer-events-none absolute bottom-1 right-1 z-50 rounded bg-paper/85 px-1.5 py-0.5 tabular-nums text-micro font-semibold text-accent-900 shadow"
      >
        X {formatNumber(draftPositionX)} / Y {formatNumber(draftPositionY)} / S {formatNumber(draftScale * 100)}% / R{' '}
        {formatNumber(draftRotation)}deg
      </span>
      {activeOperation !== 'idle' ? (
        <span
          data-testid={`program-transform-operation-hud-${layer.clip.id}`}
          data-operation={activeOperation}
          data-draft-position-x={draftPositionX}
          data-draft-position-y={draftPositionY}
          data-draft-scale={draftScale}
          data-draft-rotation={draftRotation}
          className="pointer-events-none absolute left-0 top-0 z-50 -translate-y-[calc(100%+8px)] rounded bg-info-700 px-2 py-1 text-micro font-semibold text-paper shadow"
        >
          <span className="block uppercase tracking-wide">{activeOperation}</span>
          <span className="block tabular-nums text-micro">
            {formatTransformHudValue(activeOperation, draftPositionX, draftPositionY, draftScale, draftRotation)}
          </span>
        </span>
      ) : null}
      <span
        role="button"
        tabIndex={-1}
        aria-label="Rotate selected visual"
        data-testid={`program-transform-rotate-handle-${layer.clip.id}`}
        data-transform-handle="rotate"
        data-handle-size={PROGRAM_TRANSFORM_ROTATE_HANDLE_SIZE}
        onPointerDown={handleRotationPointerDown}
        className="absolute left-1/2 top-[-42px] grid h-[30px] w-[30px] -translate-x-1/2 cursor-grab place-items-center rounded-full border border-accent-800 bg-paper/95 text-micro text-accent-900 shadow-[0_0_0_1px_rgba(0,0,0,0.65)] hover:bg-accent-800 hover:text-paper active:cursor-grabbing"
        style={{ top: rotateHandleTop }}
      >
        R
      </span>
      <span
        role="button"
        tabIndex={-1}
        aria-label="Scale from top left"
        data-testid={`program-transform-scale-handle-${layer.clip.id}-nw`}
        data-transform-handle="scale-nw"
        data-handle-size={PROGRAM_TRANSFORM_HANDLE_SIZE}
        onPointerDown={(event) => handleScalePointerDown(event, 'nw')}
        className="absolute -left-3.5 -top-3.5 h-7 w-7 cursor-nwse-resize rounded-sm border border-accent-800 bg-paper/95 shadow-[0_0_0_1px_rgba(0,0,0,0.65)] hover:bg-accent-800 hover:text-paper"
      />
      <span
        role="button"
        tabIndex={-1}
        aria-label="Scale from top right"
        data-testid={`program-transform-scale-handle-${layer.clip.id}-ne`}
        data-transform-handle="scale-ne"
        data-handle-size={PROGRAM_TRANSFORM_HANDLE_SIZE}
        onPointerDown={(event) => handleScalePointerDown(event, 'ne')}
        className="absolute -right-3.5 -top-3.5 h-7 w-7 cursor-nesw-resize rounded-sm border border-accent-800 bg-paper/95 shadow-[0_0_0_1px_rgba(0,0,0,0.65)] hover:bg-accent-800 hover:text-paper"
      />
      <span
        role="button"
        tabIndex={-1}
        aria-label="Scale from bottom left"
        data-testid={`program-transform-scale-handle-${layer.clip.id}-sw`}
        data-transform-handle="scale-sw"
        data-handle-size={PROGRAM_TRANSFORM_HANDLE_SIZE}
        onPointerDown={(event) => handleScalePointerDown(event, 'sw')}
        className="absolute -bottom-3.5 -left-3.5 h-7 w-7 cursor-nesw-resize rounded-sm border border-accent-800 bg-paper/95 shadow-[0_0_0_1px_rgba(0,0,0,0.65)] hover:bg-accent-800 hover:text-paper"
      />
      <span
        role="button"
        tabIndex={-1}
        aria-label="Scale from bottom right"
        data-testid={`program-transform-scale-handle-${layer.clip.id}-se`}
        data-transform-handle="scale-se"
        data-handle-size={PROGRAM_TRANSFORM_HANDLE_SIZE}
        onPointerDown={(event) => handleScalePointerDown(event, 'se')}
        className="absolute -bottom-3.5 -right-3.5 h-7 w-7 cursor-nwse-resize rounded-sm border border-accent-800 bg-paper/95 shadow-[0_0_0_1px_rgba(0,0,0,0.65)] hover:bg-accent-800 hover:text-paper"
      />
      <span
        data-testid={`program-transform-center-${layer.clip.id}`}
        data-transform-handle="center"
        className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent-800 bg-paper shadow-[0_0_0_1px_rgba(0,0,0,0.65)]"
      />
      {activeOperation !== 'idle' ? (
        <span
          data-testid={`program-transform-active-crosshair-${layer.clip.id}`}
          data-operation={activeOperation}
          className="pointer-events-none absolute left-1/2 top-1/2 z-40 h-16 w-16 -translate-x-1/2 -translate-y-1/2"
        >
          <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-info-800/80" />
          <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-info-800/80" />
        </span>
      ) : null}
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
  const motionScale = clampNumber(layer.style.scale, 0.05, 8);
  const maxWidth = Math.max(96, canvasWidth * safeScale * motionScale);
  const maxHeight = Math.max(54, canvasHeight * safeScale * motionScale);

  return {
    width: clampNumber(sourceWidth * safeScale * motionScale, 56, maxWidth),
    height: clampNumber(sourceHeight * safeScale * motionScale, 36, maxHeight),
    scale: safeScale,
  };
}

function formatTransformHudValue(
  operation: 'move' | 'scale' | 'rotate',
  positionX: number,
  positionY: number,
  scale: number,
  rotation: number,
): string {
  switch (operation) {
    case 'move':
      return `X ${formatNumber(positionX)} / Y ${formatNumber(positionY)}`;
    case 'scale':
      return `${formatNumber(scale * 100)}%`;
    case 'rotate':
      return `${formatNumber(rotation)}deg`;
    default:
      return '';
  }
}

function formatPercent(value: number): string {
  return `${formatNumber(value * 100)}%`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }

  return Number(value.toFixed(1)).toString();
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}
