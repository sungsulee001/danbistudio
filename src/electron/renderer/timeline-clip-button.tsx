import { useRef, useState, type MouseEvent } from 'react';
import { normalizeClipVolume } from '../../lib/editor/audio-mixer';
import {
  timelineKeyframeTimeFromDrag,
  timelinePointerDeltaSeconds,
  timelineTransitionDurationFromDrag,
} from '../../lib/editor/timeline-view';
import {
  resolveTimelineClipOpacityEnvelope,
  resolveTimelineClipVolumeEnvelope,
  shouldRenderTimelineOpacityEnvelope,
  TIMELINE_OPACITY_ENVELOPE_MAX_VALUE,
  TIMELINE_VOLUME_ENVELOPE_MAX_VALUE,
  type TimelineOpacityEnvelopePoint,
  type TimelineVolumeEnvelopePoint,
} from '../../lib/editor/timeline-waveform';
import type { ClipKeyframe, EditorAsset, TimelineClip, TimelineTransition } from '../../lib/editor/types';
import type {
  TimelineClipBodyDragMode,
  TimelineClipEdgeDragMode,
  TimelineClipEditPreview,
} from './editor-view-model';
import {
  beginTimelineClipBodyInteraction,
  beginTimelineClipEdgeInteraction,
  resolveTimelineClipBodyInteractionMove,
  resolveTimelineClipEdgeInteractionMove,
  type TimelineClipBodyInteractionSession,
  type TimelineClipEdgeInteractionSession,
} from './timeline-interaction-adapter';
import { formatSignedEditDelta } from './editor-time-helpers';

export interface TimelineClipButtonProps {
  clip: TimelineClip;
  asset?: EditorAsset;
  assetKind: string;
  thumbnailSource?: string;
  audioPeaks?: number[];
  showAudioWaveform: boolean;
  trackHeight: number;
  pixelsPerSecond: number;
  selected: boolean;
  muted: boolean;
  locked: boolean;
  getScrollLeft?: () => number;
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
  onContextMenu: (event: MouseEvent<HTMLButtonElement>) => void;
  onMove: (start: number) => void;
  onMoveDrop?: (start: number, clientY: number) => void;
  onDragPointer?: (clientX: number | null, clientY?: number) => void;
  onDragPreview?: (start: number, clientY: number) => void;
  onTrimPointer?: (clientX: number | null) => void;
  onPreviewMove?: (start: number) => TimelineClipEditPreview;
  onPreviewTrim?: (edge: 'start' | 'end', deltaSeconds: number) => TimelineClipEditPreview;
  onPreviewRollTrim?: (edge: 'start' | 'end', deltaSeconds: number) => TimelineClipEditPreview;
  onPreviewSlip?: (deltaSeconds: number) => TimelineClipEditPreview;
  onPreviewSlide?: (deltaSeconds: number) => TimelineClipEditPreview;
  onPreviewGuide?: (preview: TimelineClipEditPreview | null, edge?: 'start' | 'end') => void;
  onRollTrim?: (edge: 'start' | 'end', deltaSeconds: number) => void;
  onSlip?: (deltaSeconds: number) => void;
  onSlide?: (deltaSeconds: number) => void;
  onTransitionDuration?: (duration: number) => void;
  onKeyframeTime?: (keyframeId: string, time: number) => void;
  onVolumeChange?: (volume: number) => void;
  onTrim: (edge: 'start' | 'end', deltaSeconds: number) => void;
}

export function TimelineClipButton({
  clip,
  asset,
  assetKind,
  thumbnailSource,
  audioPeaks,
  showAudioWaveform,
  trackHeight,
  pixelsPerSecond,
  selected,
  muted,
  locked,
  getScrollLeft,
  onSelect,
  onContextMenu,
  onMove,
  onMoveDrop,
  onDragPointer,
  onDragPreview,
  onTrimPointer,
  onPreviewMove,
  onPreviewTrim,
  onPreviewRollTrim,
  onPreviewSlip,
  onPreviewSlide,
  onPreviewGuide,
  onRollTrim,
  onSlip,
  onSlide,
  onTransitionDuration,
  onKeyframeTime,
  onVolumeChange,
  onTrim,
}: TimelineClipButtonProps) {
  const dragRef = useRef<TimelineClipBodyInteractionSession | null>(null);
  const trimRef = useRef<TimelineClipEdgeInteractionSession | null>(null);
  const transitionRef = useRef<{ pointerX: number; scrollLeft: number; duration: number; nextDuration: number; moved: boolean } | null>(null);
  const keyframeDragRef = useRef<{ keyframeId: string; pointerX: number; scrollLeft: number; startTime: number; nextTime: number; moved: boolean } | null>(null);
  const volumeDragRef = useRef<{ bounds: DOMRect; startVolume: number; nextVolume: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const [dragDelta, setDragDelta] = useState(0);
  const [trimDelta, setTrimDelta] = useState(0);
  const [transitionDurationPreview, setTransitionDurationPreview] = useState<number | null>(null);
  const [keyframeTimePreview, setKeyframeTimePreview] = useState<{ id: string; time: number } | null>(null);
  const [volumePreview, setVolumePreview] = useState<number | null>(null);

  const handlePointerDown = (event: MouseEvent<HTMLButtonElement>) => {
    onSelect(event);

    if (locked || event.button !== 0) {
      return;
    }

    const mode: TimelineClipBodyDragMode = event.altKey
      ? event.shiftKey ? 'slide' : 'slip'
      : 'move';
    if (mode !== 'move') {
      event.preventDefault();
    }
    const clipBounds = event.currentTarget.getBoundingClientRect();
    const clickOffsetSeconds = clampNumber(
      (event.clientX - clipBounds.left) / Math.max(1, pixelsPerSecond),
      0,
      clip.duration,
    );

    dragRef.current = beginTimelineClipBodyInteraction({
      clientX: event.clientX,
      clientY: event.clientY,
      scrollLeft: getScrollLeft?.() ?? 0,
      start: clip.start,
      clickOffsetSeconds,
      mode,
    });
    suppressClickRef.current = false;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }

      const move = resolveTimelineClipBodyInteractionMove({
        session: drag,
        clientX: moveEvent.clientX,
        clientY: moveEvent.clientY,
        currentScrollLeft: getScrollLeft?.() ?? drag.scrollLeft,
        pixelsPerSecond,
      });
      dragRef.current = move.session;
      const deltaSeconds = move.deltaSeconds;
      setDragDelta(deltaSeconds);
      if (!move.session.moved) {
        return;
      }

      if (drag.mode === 'move') {
        onDragPointer?.(moveEvent.clientX, moveEvent.clientY);
        const nextStart = move.nextStart;
        onPreviewGuide?.(onPreviewMove?.(nextStart) ?? null);
        onDragPreview?.(nextStart, moveEvent.clientY);
      } else {
        onTrimPointer?.(moveEvent.clientX);
        onPreviewGuide?.(drag.mode === 'slip'
          ? onPreviewSlip?.(deltaSeconds) ?? null
          : onPreviewSlide?.(deltaSeconds) ?? null);
      }
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      const drag = dragRef.current;
      dragRef.current = null;
      setDragDelta(0);

      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      if (drag?.moved && drag.mode === 'move') {
        onDragPointer?.(null);
      } else if (drag?.moved) {
        onTrimPointer?.(null);
      }
      if (drag?.moved) {
        onPreviewGuide?.(null);
      }

      if (drag?.moved) {
        suppressClickRef.current = true;
        if (drag.mode === 'slip') {
          onSlip?.(drag.deltaSeconds);
          return;
        }

        if (drag.mode === 'slide') {
          onSlide?.(drag.deltaSeconds);
          return;
        }

        const nextStart = Math.max(0, drag.start + drag.deltaSeconds);
        if (onMoveDrop) {
          onMoveDrop(nextStart, upEvent.clientY);
          return;
        }

        onMove(nextStart);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleTrimPointerDown = (event: MouseEvent<HTMLSpanElement>, edge: 'start' | 'end') => {
    event.preventDefault();
    event.stopPropagation();

    if (locked || event.button !== 0) {
      return;
    }

    const mode: TimelineClipEdgeDragMode = event.altKey ? 'roll' : 'trim';
    trimRef.current = beginTimelineClipEdgeInteraction({
      clientX: event.clientX,
      scrollLeft: getScrollLeft?.() ?? 0,
      clipStart: clip.start,
      clipDuration: clip.duration,
      minDuration: 0.25,
      edge,
      mode,
    });

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const trim = trimRef.current;
      if (!trim) {
        return;
      }

      onTrimPointer?.(moveEvent.clientX);
      const move = resolveTimelineClipEdgeInteractionMove({
        session: trim,
        clientX: moveEvent.clientX,
        currentScrollLeft: getScrollLeft?.() ?? trim.scrollLeft,
        pixelsPerSecond,
      });
      trimRef.current = move.session;
      const deltaSeconds = move.deltaSeconds;
      setTrimDelta(deltaSeconds);
      if (!move.session.moved) {
        return;
      }

      onTrimPointer?.(moveEvent.clientX);
      onPreviewGuide?.(trim.mode === 'roll'
        ? onPreviewRollTrim?.(trim.edge, deltaSeconds) ?? null
        : onPreviewTrim?.(trim.edge, deltaSeconds) ?? null,
      trim.edge);
    };

    const handlePointerUp = () => {
      const trim = trimRef.current;
      trimRef.current = null;
      setTrimDelta(0);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      if (trim?.moved) {
        onTrimPointer?.(null);
        onPreviewGuide?.(null);
      }

      if (trim?.moved) {
        suppressClickRef.current = true;
        if (trim.mode === 'roll') {
          onRollTrim?.(trim.edge, trim.deltaSeconds);
          return;
        }

        onTrim(trim.edge, trim.deltaSeconds);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleTransitionPointerDown = (event: MouseEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (locked || event.button !== 0 || !clip.transitionOut) {
      return;
    }

    transitionRef.current = {
      pointerX: event.clientX,
      scrollLeft: getScrollLeft?.() ?? 0,
      duration: clip.transitionOut.duration,
      nextDuration: clip.transitionOut.duration,
      moved: false,
    };
    setTransitionDurationPreview(clip.transitionOut.duration);
    onTrimPointer?.(event.clientX);
    onPreviewGuide?.({
      start: roundTime(Math.max(0, clip.start + clip.duration - clip.transitionOut.duration)),
      duration: clip.transitionOut.duration,
      snapped: false,
      constrained: false,
      label: `Transition ${formatRulerTime(clip.transitionOut.duration)}`,
    });

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const transition = transitionRef.current;
      if (!transition) {
        return;
      }

      onTrimPointer?.(moveEvent.clientX);
      const deltaSeconds = timelinePointerDeltaSeconds({
        originClientXPixels: transition.pointerX,
        currentClientXPixels: moveEvent.clientX,
        originScrollLeftPixels: transition.scrollLeft,
        currentScrollLeftPixels: getScrollLeft?.() ?? transition.scrollLeft,
        pixelsPerSecond,
      });
      const duration = timelineTransitionDurationFromDrag({
        startDurationSeconds: transition.duration,
        deltaSeconds,
        minDurationSeconds: 0.05,
        maxDurationSeconds: Math.max(0.05, clip.duration),
      });
      transition.nextDuration = duration;
      transition.moved = Math.abs(duration - transition.duration) > 0.001;
      setTransitionDurationPreview(duration);
      onPreviewGuide?.({
        start: roundTime(Math.max(0, clip.start + clip.duration - duration)),
        duration,
        snapped: false,
        constrained: Math.abs(duration - (transition.duration + deltaSeconds)) > 0.001,
        label: `Transition ${formatRulerTime(duration)}`,
      });
    };

    const handlePointerUp = () => {
      const transition = transitionRef.current;
      transitionRef.current = null;
      const duration = transition?.nextDuration ?? clip.transitionOut?.duration ?? 0.5;
      setTransitionDurationPreview(null);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      onTrimPointer?.(null);
      onPreviewGuide?.(null);

      if (transition?.moved) {
        suppressClickRef.current = true;
        onTransitionDuration?.(duration);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleVolumePointerDown = (event: MouseEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (locked || event.button !== 0) {
      return;
    }

    const bounds = (event.currentTarget.parentElement ?? event.currentTarget).getBoundingClientRect();
    const startVolume = normalizeClipVolume(clip.volume);
    const nextVolume = timelineVolumeFromClientY(event.clientY, bounds);
    volumeDragRef.current = {
      bounds,
      startVolume,
      nextVolume,
      moved: Math.abs(nextVolume - startVolume) > 0.01,
    };
    setVolumePreview(nextVolume);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const drag = volumeDragRef.current;
      if (!drag) {
        return;
      }

      const volume = timelineVolumeFromClientY(moveEvent.clientY, drag.bounds);
      drag.nextVolume = volume;
      drag.moved ||= Math.abs(volume - drag.startVolume) > 0.01;
      setVolumePreview(volume);
    };

    const handlePointerUp = () => {
      const drag = volumeDragRef.current;
      volumeDragRef.current = null;
      setVolumePreview(null);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);

      if (drag?.moved) {
        suppressClickRef.current = true;
        onVolumeChange?.(drag.nextVolume);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleKeyframePointerDown = (event: MouseEvent<HTMLSpanElement>, keyframe: ClipKeyframe) => {
    event.preventDefault();
    event.stopPropagation();

    if (locked || event.button !== 0) {
      return;
    }

    keyframeDragRef.current = {
      keyframeId: keyframe.id,
      pointerX: event.clientX,
      scrollLeft: getScrollLeft?.() ?? 0,
      startTime: keyframe.time,
      nextTime: keyframe.time,
      moved: false,
    };
    setKeyframeTimePreview({ id: keyframe.id, time: keyframe.time });
    onTrimPointer?.(event.clientX);
    onPreviewGuide?.({
      start: roundTime(clip.start + keyframe.time),
      duration: 0.05,
      snapped: false,
      constrained: false,
      label: `${keyframePropertyLabel(keyframe.property)} KF ${formatRulerTime(keyframe.time)}`,
    });

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const drag = keyframeDragRef.current;
      if (!drag) {
        return;
      }

      onTrimPointer?.(moveEvent.clientX);
      const deltaSeconds = timelinePointerDeltaSeconds({
        originClientXPixels: drag.pointerX,
        currentClientXPixels: moveEvent.clientX,
        originScrollLeftPixels: drag.scrollLeft,
        currentScrollLeftPixels: getScrollLeft?.() ?? drag.scrollLeft,
        pixelsPerSecond,
      });
      const nextTime = timelineKeyframeTimeFromDrag({
        startTimeSeconds: drag.startTime,
        deltaSeconds,
        clipDurationSeconds: clip.duration,
      });
      drag.nextTime = nextTime;
      drag.moved = Math.abs(nextTime - drag.startTime) > 0.001;
      setKeyframeTimePreview({ id: drag.keyframeId, time: nextTime });
      onPreviewGuide?.({
        start: roundTime(clip.start + nextTime),
        duration: 0.05,
        snapped: false,
        constrained: Math.abs(nextTime - (drag.startTime + deltaSeconds)) > 0.001,
        label: `${keyframePropertyLabel(keyframe.property)} KF ${formatRulerTime(nextTime)}`,
      });
    };

    const handlePointerUp = () => {
      const drag = keyframeDragRef.current;
      keyframeDragRef.current = null;
      setKeyframeTimePreview(null);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      onTrimPointer?.(null);
      onPreviewGuide?.(null);

      if (drag?.moved) {
        suppressClickRef.current = true;
        onKeyframeTime?.(drag.keyframeId, drag.nextTime);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const activeDragSession = dragRef.current;
  const activeTrimSession = trimRef.current;
  const isPreviewing = Boolean(activeDragSession?.moved || activeTrimSession?.moved);
  const activeTrimEdge = activeTrimSession?.moved ? activeTrimSession.edge : undefined;
  const activeTrimMode = activeTrimSession?.moved ? activeTrimSession.mode : undefined;
  const activeDragMode = activeDragSession?.moved ? activeDragSession.mode : undefined;
  const movePreview = isPreviewing && activeDragMode === 'move'
    ? onPreviewMove?.(Math.max(0, clip.start + dragDelta))
    : undefined;
  const slipPreview = isPreviewing && activeDragMode === 'slip'
    ? onPreviewSlip?.(dragDelta)
    : undefined;
  const slidePreview = isPreviewing && activeDragMode === 'slide'
    ? onPreviewSlide?.(dragDelta)
    : undefined;
  const trimPreview = activeTrimEdge && activeTrimMode === 'trim'
    ? onPreviewTrim?.(activeTrimEdge, trimDelta)
    : undefined;
  const rollPreview = activeTrimEdge && activeTrimMode === 'roll'
    ? onPreviewRollTrim?.(activeTrimEdge, trimDelta)
    : undefined;
  const activePreview = rollPreview ?? trimPreview ?? slidePreview ?? slipPreview ?? movePreview;
  const fallbackPreviewStart = isPreviewing
    ? clip.start + dragDelta + (activeTrimEdge === 'start' ? trimDelta : 0)
    : clip.start;
  const fallbackPreviewDuration = isPreviewing
    ? activeTrimEdge === 'start'
      ? Math.max(0.25, clip.duration - trimDelta)
      : Math.max(0.25, clip.duration + (activeTrimEdge === 'end' ? trimDelta : 0))
    : clip.duration;
  const previewStart = activePreview?.start ?? fallbackPreviewStart;
  const previewDuration = activePreview?.duration ?? fallbackPreviewDuration;
  const previewSourceIn = activePreview?.sourceIn ?? clip.sourceIn;
  const previewAdjusted = Boolean(activePreview?.snapped || activePreview?.constrained);
  const previewLabel = activePreview?.label;
  const previewTone = resolveTimelineClipPreviewTone({
    preview: activePreview,
    isPreviewing,
    activeDragMode,
    activeTrimMode,
    activeTrimEdge,
  });
  const previewDeltaLabel = activePreview?.delta !== undefined ? formatSignedEditDelta(activePreview.delta) : '';
  const previewHudSummary = formatTimelineClipEditHudSummary({
    operation: previewTone.operation,
    deltaLabel: previewDeltaLabel,
    duration: previewDuration,
    groupCount: activePreview?.groupCount,
    snapped: Boolean(activePreview?.snapped),
    constrained: Boolean(activePreview?.constrained),
    ripple: Boolean(activePreview?.ripple),
  });
  const hasThumbnail = Boolean(thumbnailSource && assetKind !== 'audio');
  const transitionDuration = transitionDurationPreview ?? clip.transitionOut?.duration;
  const transitionWidthPixels = transitionDuration ? Math.max(22, Math.min(previewDuration * pixelsPerSecond, transitionDuration * pixelsPerSecond)) : 0;
  const volumeEnvelope = showAudioWaveform ? resolveTimelineClipVolumeEnvelope(clip) : [];
  const showOpacityEnvelope = assetKind !== 'audio' && shouldRenderTimelineOpacityEnvelope(clip, asset);
  const opacityEnvelope = showOpacityEnvelope ? resolveTimelineClipOpacityEnvelope(clip, asset) : [];
  const clipInsetY = Math.max(4, Math.min(8, Math.round(trackHeight * 0.12)));
  const clipHeight = Math.max(34, trackHeight - (clipInsetY * 2));

  return (
    <button
      type="button"
      onClick={(event) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          event.preventDefault();
          return;
        }

        onSelect(event);
      }}
      onPointerDown={handlePointerDown}
      onContextMenu={onContextMenu}
      // Tight inset — a clip is a lane-height block, so its label sits close to
      // the edge the way the prototype's does rather than taking panel padding.
      className={`absolute overflow-hidden rounded-md border px-2 py-1 text-left shadow-sm transition ${
        selected ? 'border-white ring-2 ring-accent-600' : 'border-white/20 hover:border-white/60'
      } ${isPreviewing ? 'ring-2 ring-info-700/70' : ''} ${previewAdjusted ? previewTone.outlineClassName : ''} ${muted ? 'opacity-50' : ''} ${locked ? 'border-dashed' : ''}`}
      style={{
        top: clipInsetY,
        height: clipHeight,
        left: Math.max(0, previewStart) * pixelsPerSecond,
        width: Math.max(previewDuration * pixelsPerSecond, 58),
        backgroundColor: clip.color,
      }}
      title={`${clip.name} ${formatRulerTime(previewStart)} / ${formatRulerTime(previewDuration)}`}
      data-testid={`timeline-clip-${clip.id}`}
      data-clip-id={clip.id}
      data-asset-id={clip.assetId}
      data-track-id={clip.trackId}
      data-clip-kind={clip.kind}
      data-source-in={clip.sourceIn}
      data-selected={selected ? 'true' : 'false'}
      data-edit-start={previewStart}
      data-edit-end={previewStart + previewDuration}
      data-edit-duration={previewDuration}
      data-preview-label={previewLabel ?? ''}
      data-preview-start={previewStart}
      data-preview-duration={previewDuration}
      data-preview-source-in={previewSourceIn}
      data-preview-source-delta={activePreview?.sourceInDelta ?? ''}
      data-preview-state={previewTone.value}
      data-preview-operation={previewTone.operation}
      data-preview-snapped={activePreview?.snapped ? 'true' : 'false'}
      data-preview-constrained={activePreview?.constrained ? 'true' : 'false'}
      data-preview-ripple={activePreview?.ripple ? 'true' : 'false'}
      data-preview-delta={activePreview?.delta ?? ''}
      data-preview-group-count={activePreview?.groupCount ?? ''}
      data-preview-delta-label={previewDeltaLabel}
      data-preview-hud-summary={previewHudSummary}
      aria-label={`Timeline clip ${clip.name}`}
      aria-pressed={selected}
      aria-grabbed={isPreviewing}
    >
      {hasThumbnail ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 opacity-90"
          style={{
            backgroundImage: `linear-gradient(90deg, rgba(0,0,0,0.18), rgba(0,0,0,0.02)), url("${escapeCssUrl(thumbnailSource ?? '')}")`,
            backgroundPosition: 'left center',
            backgroundRepeat: 'repeat-x',
            backgroundSize: 'auto 100%',
          }}
        />
      ) : null}
      {isPreviewing ? (
        <span
          data-testid={`timeline-clip-preview-badge-${clip.id}`}
          className={`absolute right-2 top-2 z-50 rounded px-1.5 py-0.5 text-micro font-semibold uppercase shadow ${previewTone.badgeClassName}`}
        >
          {previewTone.label}
        </span>
      ) : null}
      {isPreviewing ? (
        <span
          data-testid={`timeline-clip-edit-hud-${clip.id}`}
          data-hud-operation={previewTone.operation}
          data-hud-delta={activePreview?.delta ?? ''}
          data-hud-delta-label={previewDeltaLabel}
          data-hud-duration={previewDuration}
          data-hud-source-in={previewSourceIn}
          data-hud-source-delta={activePreview?.sourceInDelta ?? ''}
          data-hud-group-count={activePreview?.groupCount ?? ''}
          data-hud-snapped={activePreview?.snapped ? 'true' : 'false'}
          data-hud-constrained={activePreview?.constrained ? 'true' : 'false'}
          data-hud-ripple={activePreview?.ripple ? 'true' : 'false'}
          className={`pointer-events-none absolute bottom-2 left-2 z-50 max-w-[calc(100%-1rem)] rounded px-2 py-1 text-micro font-semibold shadow ${previewTone.badgeClassName}`}
        >
          <span className="block truncate uppercase tracking-wide">{previewTone.label}</span>
          <span className="block truncate tabular-nums text-micro normal-case tracking-normal">
            {previewHudSummary}
          </span>
        </span>
      ) : null}
      {isPreviewing && (activePreview?.snapped || activePreview?.constrained) ? (
        <span
          data-testid={`timeline-clip-preview-impact-${clip.id}`}
          data-impact={activePreview.constrained ? 'limit' : 'snap'}
          data-impact-operation={previewTone.operation}
          data-impact-delta={activePreview.delta ?? ''}
          className={`pointer-events-none absolute left-2 top-2 z-50 rounded px-1.5 py-0.5 text-micro font-semibold uppercase shadow ${
            activePreview.constrained ? 'bg-danger-700 text-paper' : 'bg-warn-700 text-paper'
          }`}
        >
          {activePreview.constrained ? 'Blocked' : 'Snap'}
        </span>
      ) : null}
      {selected && !isPreviewing ? (
        <span
          data-testid={`timeline-clip-selected-readout-${clip.id}`}
          data-readout-start={previewStart}
          data-readout-end={previewStart + previewDuration}
          data-readout-duration={previewDuration}
          data-readout-source-in={previewSourceIn}
          data-readout-source-out={previewSourceIn + previewDuration}
          className="pointer-events-none absolute bottom-2 right-2 z-40 max-w-[calc(100%-1rem)] rounded on-dark bg-black/75 px-1.5 py-0.5 tabular-nums text-micro leading-tight text-info-900 shadow"
        >
          <span className="block">T {formatRulerTime(previewStart)} - {formatRulerTime(previewStart + previewDuration)}</span>
          <span className="block text-info-800/80">S {formatRulerTime(previewSourceIn)} - {formatRulerTime(previewSourceIn + previewDuration)}</span>
        </span>
      ) : null}
      <span
        role="button"
        tabIndex={-1}
        aria-label={`Trim head ${clip.name}`}
        data-testid={`timeline-trim-start-${clip.id}`}
        data-trim-edge="start"
        onPointerDown={(event) => handleTrimPointerDown(event, 'start')}
        className="absolute bottom-0 left-0 top-0 z-30 w-3 cursor-ew-resize on-dark bg-black/20 hover:bg-white/40"
      />
      <span
        role="button"
        tabIndex={-1}
        aria-label={`Trim tail ${clip.name}`}
        data-testid={`timeline-trim-end-${clip.id}`}
        data-trim-edge="end"
        onPointerDown={(event) => handleTrimPointerDown(event, 'end')}
        className="absolute bottom-0 right-0 top-0 z-30 w-3 cursor-ew-resize on-dark bg-black/20 hover:bg-white/40"
      />
      {clip.transitionOut && transitionDuration ? (
        <span
          role="button"
          tabIndex={-1}
          aria-label={`${transitionTypeLabel(clip.transitionOut.type)} transition duration`}
          onPointerDown={handleTransitionPointerDown}
          className="absolute bottom-0 right-0 top-0 z-20 flex cursor-ew-resize items-center justify-center border-l border-warn-800/80 bg-warn-700/35 text-micro font-semibold text-paper shadow-[inset_0_0_0_1px_rgba(0,0,0,0.25)] hover:bg-warn-800/70"
          style={{ width: transitionWidthPixels }}
        >
          <span className="truncate px-1">
            {transitionTypeLabel(clip.transitionOut.type)} {formatRulerTime(transitionDuration)}
          </span>
        </span>
      ) : null}
      {showAudioWaveform ? (
        <AudioWaveform
          clipId={clip.id}
          clipName={clip.name}
          peaks={audioPeaks}
          envelope={volumeEnvelope}
          volume={volumePreview ?? clip.volume}
          onVolumePointerDown={handleVolumePointerDown}
        />
      ) : null}
      {showOpacityEnvelope ? (
        <OpacityEnvelope clipId={clip.id} envelope={opacityEnvelope} />
      ) : null}
      {clip.keyframes.length > 0 ? (
        <span className="absolute inset-x-3 bottom-1 z-40 h-3">
          {clip.keyframes.slice(0, 32).map((keyframe) => {
            const displayTime = keyframeTimePreview?.id === keyframe.id
              ? keyframeTimePreview.time
              : keyframe.time;

            return (
              <span
                key={keyframe.id}
                role="button"
                tabIndex={-1}
                aria-label={`${keyframePropertyLabel(keyframe.property)} keyframe at ${formatRulerTime(displayTime)}`}
                onPointerDown={(event) => handleKeyframePointerDown(event, keyframe)}
                className="absolute h-3 w-3 -translate-x-1/2 rotate-45 cursor-ew-resize rounded-[2px] border border-paper/70 shadow-sm ring-1 ring-white/50 hover:ring-2 hover:ring-white"
                style={{
                  left: `${clampNumber((displayTime / Math.max(0.001, clip.duration)) * 100, 0, 100)}%`,
                  backgroundColor: keyframeDotColor(keyframe.property),
                }}
              />
            );
          })}
        </span>
      ) : null}
      <span className={`relative z-10 block truncate text-xs font-semibold ${hasThumbnail ? 'text-white drop-shadow' : 'text-onbright'}`}>{clip.name}</span>
      <span className={`relative z-10 mt-1 block text-meta ${hasThumbnail ? 'text-ink drop-shadow' : 'text-onbright/75'}`}>
        {previewLabel ?? `${formatRulerTime(previewStart)} / ${formatRulerTime(previewDuration)}`}
      </span>
    </button>
  );
}

function resolveTimelineClipPreviewTone({
  preview,
  isPreviewing,
  activeDragMode,
  activeTrimMode,
  activeTrimEdge,
}: {
  preview?: TimelineClipEditPreview;
  isPreviewing: boolean;
  activeDragMode?: TimelineClipBodyDragMode;
  activeTrimMode?: TimelineClipEdgeDragMode;
  activeTrimEdge?: 'start' | 'end';
}): { value: string; label: string; operation: string; badgeClassName: string; outlineClassName: string } {
  const operation = preview?.operation ?? activeTrimMode ?? activeDragMode ?? (activeTrimEdge ? 'trim' : 'idle');
  if (!isPreviewing) {
    return {
      value: 'idle',
      label: 'Idle',
      operation,
      badgeClassName: 'bg-surface text-ds-800',
      outlineClassName: '',
    };
  }

  if (preview?.constrained) {
    return {
      value: 'limit',
      label: 'Limit',
      operation,
      badgeClassName: 'bg-danger-700 text-paper',
      outlineClassName: 'outline outline-2 outline-danger-700/80',
    };
  }

  if (preview?.snapped) {
    return {
      value: 'snap',
      label: 'Snap',
      operation,
      badgeClassName: 'bg-warn-700 text-paper',
      outlineClassName: 'outline outline-2 outline-warn-700/80',
    };
  }

  if (preview?.ripple) {
    return {
      value: 'ripple',
      label: 'Ripple',
      operation,
      badgeClassName: 'bg-accent-700 text-paper',
      outlineClassName: 'outline outline-2 outline-accent-700/80',
    };
  }

  return {
    value: operation,
    label: operation === 'trim'
      ? 'Trim'
      : operation === 'roll'
        ? 'Roll'
        : operation === 'slip'
          ? 'Slip'
          : operation === 'slide'
            ? 'Slide'
            : 'Move',
    operation,
    badgeClassName: 'bg-info-700 text-paper',
    outlineClassName: 'outline outline-2 outline-info-700/80',
  };
}

function formatTimelineClipEditHudSummary({
  operation,
  deltaLabel,
  duration,
  groupCount,
  snapped,
  constrained,
  ripple,
}: {
  operation: string;
  deltaLabel: string;
  duration: number;
  groupCount?: number;
  snapped: boolean;
  constrained: boolean;
  ripple: boolean;
}): string {
  const parts = [operation];
  if (groupCount !== undefined && groupCount > 1) {
    parts.push(`${groupCount} clips`);
  }
  if (deltaLabel) {
    parts.push(deltaLabel);
  }
  parts.push(formatRulerTime(duration));
  if (constrained) {
    parts.push('limit');
  } else if (snapped) {
    parts.push('snap');
  }
  if (ripple) {
    parts.push('ripple');
  }

  return parts.join(' / ');
}

function AudioWaveform({
  clipId,
  clipName,
  peaks,
  envelope,
  volume,
  onVolumePointerDown,
}: {
  clipId: string;
  clipName: string;
  peaks?: number[];
  envelope: TimelineVolumeEnvelopePoint[];
  volume: number;
  onVolumePointerDown: (event: MouseEvent<HTMLSpanElement>) => void;
}) {
  const values = peaks && peaks.length > 0
    ? peaks
    : Array.from({ length: 32 }).map((_, index) => pseudoRandomWaveHeight(clipId, index));
  const envelopePoints = buildEnvelopeSvgPoints(envelope, TIMELINE_VOLUME_ENVELOPE_MAX_VALUE);
  const displayVolume = normalizeClipVolume(volume);
  const volumeTop = timelineVolumeToTopPercent(displayVolume);

  return (
    <>
      <span className="pointer-events-none absolute inset-x-2 bottom-2 top-7 z-0 flex items-center gap-px opacity-55" data-testid={`timeline-waveform-${clipId}`}>
        {values.map((value, index) => {
          const height = roundStylePercent(18 + Math.min(1, Math.max(0, value)) * 54);

          return (
            <span
              key={index}
              className="flex-1 rounded-sm bg-paper/70"
              style={{ height: `${height}%` }}
            />
          );
        })}
        {envelopePoints ? (
          <svg
            aria-hidden="true"
            className="absolute inset-0 h-full w-full overflow-visible"
            data-testid={`timeline-volume-envelope-${clipId}`}
            preserveAspectRatio="none"
            viewBox="0 0 100 100"
          >
            <polyline
              points={envelopePoints}
              fill="none"
              stroke="rgba(255,255,255,0.88)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="5"
            />
          </svg>
        ) : null}
      </span>
      <span className="pointer-events-none absolute inset-x-2 bottom-2 top-7 z-30">
        <span
          role="slider"
          tabIndex={-1}
          aria-label={`Timeline volume ${clipName}`}
          aria-valuemin={0}
          aria-valuemax={TIMELINE_VOLUME_ENVELOPE_MAX_VALUE}
          aria-valuenow={displayVolume}
          data-testid={`timeline-volume-control-${clipId}`}
          data-volume-value={displayVolume}
          onPointerDown={onVolumePointerDown}
          className="pointer-events-auto absolute left-0 right-0 h-3 -translate-y-1/2 cursor-ns-resize"
          style={{ top: `${volumeTop}%` }}
        >
          <span className="pointer-events-none absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 rounded bg-white/95 shadow-[0_0_0_1px_rgba(0,0,0,0.45)]" />
        </span>
      </span>
    </>
  );
}

function OpacityEnvelope({ clipId, envelope }: { clipId: string; envelope: TimelineOpacityEnvelopePoint[] }) {
  const envelopePoints = buildEnvelopeSvgPoints(envelope, TIMELINE_OPACITY_ENVELOPE_MAX_VALUE);
  if (!envelopePoints) {
    return null;
  }

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-2 bottom-2 top-7 z-20 h-auto w-auto overflow-visible opacity-95 drop-shadow"
      data-testid={`timeline-opacity-envelope-${clipId}`}
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      <polyline
        points={envelopePoints}
        fill="none"
        stroke="rgba(240,171,252,0.95)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5"
      />
    </svg>
  );
}

function buildEnvelopeSvgPoints(
  envelope: Array<TimelineVolumeEnvelopePoint | TimelineOpacityEnvelopePoint>,
  maxValue: number,
): string {
  if (envelope.length < 2) {
    return '';
  }

  return envelope.map((point) => {
    const x = roundStylePercent(point.position * 100);
    const normalizedValue = clampNumber(point.value / Math.max(0.001, maxValue), 0, 1);
    const y = roundStylePercent(92 - normalizedValue * 84);
    return `${x},${y}`;
  }).join(' ');
}

function timelineVolumeFromClientY(clientY: number, bounds: DOMRect): number {
  const y = clampNumber((clientY - bounds.top) / Math.max(1, bounds.height), 0, 1);
  return normalizeClipVolume((1 - y) * TIMELINE_VOLUME_ENVELOPE_MAX_VALUE);
}

function timelineVolumeToTopPercent(volume: number): number {
  return roundStylePercent(100 - (normalizeClipVolume(volume) / TIMELINE_VOLUME_ENVELOPE_MAX_VALUE) * 100);
}

function keyframePropertyLabel(property: ClipKeyframe['property']): string {
  switch (property) {
    case 'positionX':
      return 'Position X';
    case 'positionY':
      return 'Position Y';
    case 'scale':
      return 'Scale';
    case 'rotation':
      return 'Rotation';
    case 'opacity':
      return 'Opacity';
    case 'volume':
      return 'Volume';
    default:
      return property;
  }
}

function keyframeDotColor(property: ClipKeyframe['property']): string {
  switch (property) {
    case 'positionX':
    case 'positionY':
      return '#38bdf8';
    case 'scale':
      return '#a7f3d0';
    case 'rotation':
      return '#facc15';
    case 'opacity':
      return '#f0abfc';
    case 'volume':
      return '#fb7185';
    default:
      return '#f8fafc';
  }
}

function transitionTypeLabel(type: TimelineTransition['type']): string {
  switch (type) {
    case 'crossfade':
      return 'Crossfade';
    case 'dip':
      return 'Dip';
    case 'push':
      return 'Push';
    case 'wipe':
      return 'Wipe';
    case 'match-cut':
      return 'Match cut';
    case 'ai-morph':
      return 'AI morph';
    default:
      return 'Cut';
  }
}

function formatRulerTime(seconds: number): string {
  if (seconds < 60) {
    return `${Number(seconds.toFixed(2))}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${padTime(secs)}`;
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function escapeCssUrl(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function pseudoRandomWaveHeight(seed: string, index: number): number {
  let hash = 0;
  const input = `${seed}-${index}`;

  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }

  return Math.abs(Math.sin(hash) * 0.85 + Math.sin(index * 1.7) * 0.15);
}

function roundStylePercent(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function padTime(value: number): string {
  return Math.floor(value).toString().padStart(2, '0');
}
