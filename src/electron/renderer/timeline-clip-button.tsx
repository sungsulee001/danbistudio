import { useRef, useState, type MouseEvent } from 'react';
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

export interface TimelineClipButtonProps {
  clip: TimelineClip;
  asset?: EditorAsset;
  assetKind: string;
  thumbnailSource?: string;
  audioPeaks?: number[];
  showAudioWaveform: boolean;
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
  onTrim: (edge: 'start' | 'end', deltaSeconds: number) => void;
}

export function TimelineClipButton({
  clip,
  asset,
  assetKind,
  thumbnailSource,
  audioPeaks,
  showAudioWaveform,
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
  onTrim,
}: TimelineClipButtonProps) {
  const dragRef = useRef<{ pointerX: number; scrollLeft: number; start: number; delta: number; moved: boolean; mode: TimelineClipBodyDragMode } | null>(null);
  const trimRef = useRef<{ pointerX: number; scrollLeft: number; delta: number; moved: boolean; edge: 'start' | 'end'; mode: TimelineClipEdgeDragMode } | null>(null);
  const transitionRef = useRef<{ pointerX: number; scrollLeft: number; duration: number; nextDuration: number; moved: boolean } | null>(null);
  const keyframeDragRef = useRef<{ keyframeId: string; pointerX: number; scrollLeft: number; startTime: number; nextTime: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const [dragDelta, setDragDelta] = useState(0);
  const [trimDelta, setTrimDelta] = useState(0);
  const [transitionDurationPreview, setTransitionDurationPreview] = useState<number | null>(null);
  const [keyframeTimePreview, setKeyframeTimePreview] = useState<{ id: string; time: number } | null>(null);

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

    dragRef.current = {
      pointerX: event.clientX,
      scrollLeft: getScrollLeft?.() ?? 0,
      start: clip.start,
      delta: 0,
      moved: false,
      mode,
    };
    if (mode === 'move') {
      onDragPointer?.(event.clientX, event.clientY);
      onDragPreview?.(clip.start, event.clientY);
    } else {
      onTrimPointer?.(event.clientX);
      onPreviewGuide?.(mode === 'slip'
        ? onPreviewSlip?.(0) ?? null
        : onPreviewSlide?.(0) ?? null);
    }

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }

      if (drag.mode === 'move') {
        onDragPointer?.(moveEvent.clientX, moveEvent.clientY);
      } else {
        onTrimPointer?.(moveEvent.clientX);
      }
      const deltaSeconds = timelinePointerDeltaSeconds({
        originClientXPixels: drag.pointerX,
        currentClientXPixels: moveEvent.clientX,
        originScrollLeftPixels: drag.scrollLeft,
        currentScrollLeftPixels: getScrollLeft?.() ?? drag.scrollLeft,
        pixelsPerSecond,
      });
      drag.delta = deltaSeconds;
      if (Math.abs(deltaSeconds) > 0.02) {
        drag.moved = true;
      }
      setDragDelta(deltaSeconds);
      if (drag.mode === 'move') {
        const nextStart = Math.max(0, drag.start + deltaSeconds);
        onPreviewGuide?.(onPreviewMove?.(nextStart) ?? null);
        onDragPreview?.(nextStart, moveEvent.clientY);
      } else {
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
      if (drag?.mode === 'move') {
        onDragPointer?.(null);
      } else {
        onTrimPointer?.(null);
      }
      onPreviewGuide?.(null);

      if (drag?.moved) {
        suppressClickRef.current = true;
        if (drag.mode === 'slip') {
          onSlip?.(drag.delta);
          return;
        }

        if (drag.mode === 'slide') {
          onSlide?.(drag.delta);
          return;
        }

        const nextStart = Math.max(0, drag.start + drag.delta);
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
    trimRef.current = {
      pointerX: event.clientX,
      scrollLeft: getScrollLeft?.() ?? 0,
      delta: 0,
      moved: false,
      edge,
      mode,
    };
    onTrimPointer?.(event.clientX);
    onPreviewGuide?.(mode === 'roll'
      ? onPreviewRollTrim?.(edge, 0) ?? null
      : onPreviewTrim?.(edge, 0) ?? null,
    edge);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const trim = trimRef.current;
      if (!trim) {
        return;
      }

      onTrimPointer?.(moveEvent.clientX);
      const deltaSeconds = timelinePointerDeltaSeconds({
        originClientXPixels: trim.pointerX,
        currentClientXPixels: moveEvent.clientX,
        originScrollLeftPixels: trim.scrollLeft,
        currentScrollLeftPixels: getScrollLeft?.() ?? trim.scrollLeft,
        pixelsPerSecond,
      });
      trim.delta = deltaSeconds;
      trim.moved = Math.abs(deltaSeconds) > 0.02;
      setTrimDelta(deltaSeconds);
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
      onTrimPointer?.(null);
      onPreviewGuide?.(null);

      if (trim?.moved) {
        suppressClickRef.current = true;
        if (trim.mode === 'roll') {
          onRollTrim?.(trim.edge, trim.delta);
          return;
        }

        onTrim(trim.edge, trim.delta);
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

  const activeTrimEdge = trimRef.current?.edge;
  const activeTrimMode = trimRef.current?.mode;
  const activeDragMode = dragRef.current?.mode;
  const movePreview = dragRef.current && activeDragMode === 'move'
    ? onPreviewMove?.(Math.max(0, clip.start + dragDelta))
    : undefined;
  const slipPreview = dragRef.current && activeDragMode === 'slip'
    ? onPreviewSlip?.(dragDelta)
    : undefined;
  const slidePreview = dragRef.current && activeDragMode === 'slide'
    ? onPreviewSlide?.(dragDelta)
    : undefined;
  const trimPreview = activeTrimEdge && activeTrimMode === 'trim'
    ? onPreviewTrim?.(activeTrimEdge, trimDelta)
    : undefined;
  const rollPreview = activeTrimEdge && activeTrimMode === 'roll'
    ? onPreviewRollTrim?.(activeTrimEdge, trimDelta)
    : undefined;
  const activePreview = rollPreview ?? trimPreview ?? slidePreview ?? slipPreview ?? movePreview;
  const fallbackPreviewStart = clip.start + dragDelta + (activeTrimEdge === 'start' ? trimDelta : 0);
  const fallbackPreviewDuration = activeTrimEdge === 'start'
    ? Math.max(0.25, clip.duration - trimDelta)
    : Math.max(0.25, clip.duration + (activeTrimEdge === 'end' ? trimDelta : 0));
  const previewStart = activePreview?.start ?? fallbackPreviewStart;
  const previewDuration = activePreview?.duration ?? fallbackPreviewDuration;
  const isPreviewing = Boolean(dragRef.current || activeTrimEdge);
  const previewAdjusted = Boolean(activePreview?.snapped || activePreview?.constrained);
  const previewLabel = activePreview?.label;
  const hasThumbnail = Boolean(thumbnailSource && assetKind !== 'audio');
  const transitionDuration = transitionDurationPreview ?? clip.transitionOut?.duration;
  const transitionWidthPixels = transitionDuration ? Math.max(22, Math.min(previewDuration * pixelsPerSecond, transitionDuration * pixelsPerSecond)) : 0;
  const volumeEnvelope = showAudioWaveform ? resolveTimelineClipVolumeEnvelope(clip) : [];
  const showOpacityEnvelope = assetKind !== 'audio' && shouldRenderTimelineOpacityEnvelope(clip, asset);
  const opacityEnvelope = showOpacityEnvelope ? resolveTimelineClipOpacityEnvelope(clip, asset) : [];

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
      className={`absolute top-3 h-14 overflow-hidden rounded-md border px-3 py-2 text-left shadow-sm transition ${
        selected ? 'border-white ring-2 ring-emerald-400' : 'border-white/20 hover:border-white/60'
      } ${isPreviewing ? 'ring-2 ring-cyan-300/70' : ''} ${previewAdjusted ? 'outline outline-2 outline-amber-300/80' : ''} ${muted ? 'opacity-50' : ''} ${locked ? 'border-dashed' : ''}`}
      style={{
        left: Math.max(0, previewStart) * pixelsPerSecond,
        width: Math.max(previewDuration * pixelsPerSecond, 58),
        backgroundColor: clip.color,
      }}
      title={`${clip.name} ${formatRulerTime(previewStart)} / ${formatRulerTime(previewDuration)}`}
      data-testid={`timeline-clip-${clip.id}`}
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
      <span
        aria-hidden="true"
        onPointerDown={(event) => handleTrimPointerDown(event, 'start')}
        className="absolute bottom-0 left-0 top-0 z-30 w-2 cursor-ew-resize bg-black/20 hover:bg-white/40"
      />
      <span
        aria-hidden="true"
        onPointerDown={(event) => handleTrimPointerDown(event, 'end')}
        className="absolute bottom-0 right-0 top-0 z-30 w-2 cursor-ew-resize bg-black/20 hover:bg-white/40"
      />
      {clip.transitionOut && transitionDuration ? (
        <span
          role="button"
          tabIndex={-1}
          aria-label={`${transitionTypeLabel(clip.transitionOut.type)} transition duration`}
          onPointerDown={handleTransitionPointerDown}
          className="absolute bottom-0 right-0 top-0 z-20 flex cursor-ew-resize items-center justify-center border-l border-amber-200/80 bg-amber-300/35 text-[10px] font-semibold text-zinc-950 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.25)] hover:bg-amber-200/70"
          style={{ width: transitionWidthPixels }}
        >
          <span className="truncate px-1">
            {transitionTypeLabel(clip.transitionOut.type)} {formatRulerTime(transitionDuration)}
          </span>
        </span>
      ) : null}
      {showAudioWaveform ? (
        <AudioWaveform clipId={clip.id} peaks={audioPeaks} envelope={volumeEnvelope} />
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
                className="absolute h-3 w-3 -translate-x-1/2 rotate-45 cursor-ew-resize rounded-[2px] border border-zinc-950/70 shadow-sm ring-1 ring-white/50 hover:ring-2 hover:ring-white"
                style={{
                  left: `${clampNumber((displayTime / Math.max(0.001, clip.duration)) * 100, 0, 100)}%`,
                  backgroundColor: keyframeDotColor(keyframe.property),
                }}
              />
            );
          })}
        </span>
      ) : null}
      <span className={`relative z-10 block truncate text-xs font-semibold ${hasThumbnail ? 'text-white drop-shadow' : 'text-zinc-950'}`}>{clip.name}</span>
      <span className={`relative z-10 mt-1 block text-[11px] ${hasThumbnail ? 'text-zinc-100 drop-shadow' : 'text-zinc-900'}`}>
        {previewLabel ?? `${formatRulerTime(previewStart)} / ${formatRulerTime(previewDuration)}`}
      </span>
    </button>
  );
}

function AudioWaveform({ clipId, peaks, envelope }: { clipId: string; peaks?: number[]; envelope: TimelineVolumeEnvelopePoint[] }) {
  const values = peaks && peaks.length > 0
    ? peaks
    : Array.from({ length: 32 }).map((_, index) => pseudoRandomWaveHeight(clipId, index));
  const envelopePoints = buildEnvelopeSvgPoints(envelope, TIMELINE_VOLUME_ENVELOPE_MAX_VALUE);

  return (
    <span className="pointer-events-none absolute inset-x-2 bottom-2 top-7 z-0 flex items-center gap-px opacity-55" data-testid={`timeline-waveform-${clipId}`}>
      {values.map((value, index) => {
        const height = roundStylePercent(18 + Math.min(1, Math.max(0, value)) * 54);

        return (
          <span
            key={index}
            className="flex-1 rounded-sm bg-zinc-950/70"
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
