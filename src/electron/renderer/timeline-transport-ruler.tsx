import { useMemo, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import { formatRulerTime, formatTimecode } from './editor-time-helpers';
import type { TimelineMarker } from '../../lib/editor/types';

export function TimelineTransportRulerPanel({
  scrollRef,
  titleText,
  duration,
  fps,
  playhead,
  playbackRate,
  pixelsPerSecond,
  timelineWidth,
  markIn,
  markOut,
  markedRange,
  loopPlaybackEnabled,
  gapInsertDuration,
  visualGapCount,
  markers,
  markerTimePreview,
  children,
  onTitleTextChange,
  onAddTitle,
  onAddAdjustmentLayer,
  onAddVideoTrack,
  onAddAudioTrack,
  onGenerateCaptions,
  onSaveProject,
  onLoadProject,
  onTogglePlayback,
  onNudgePlayhead,
  onPlayheadChange,
  onClearMarks,
  onPixelsPerSecondChange,
  onFitTimelineZoom,
  onGapInsertDurationChange,
  onInsertGap,
  onFillAiBrollGaps,
  onRulerPointerDown,
  onMarkerPointerDown,
  onViewportChange,
}: {
  scrollRef: RefObject<HTMLDivElement>;
  titleText: string;
  duration: number;
  fps: number;
  playhead: number;
  playbackRate: number;
  pixelsPerSecond: number;
  timelineWidth: number;
  markIn: number | null;
  markOut: number | null;
  markedRange: { start: number; end: number } | null;
  loopPlaybackEnabled: boolean;
  gapInsertDuration: number;
  visualGapCount: number;
  markers: TimelineMarker[];
  markerTimePreview: { id: string; time: number } | null;
  children: ReactNode;
  onTitleTextChange: (value: string) => void;
  onAddTitle: () => void;
  onAddAdjustmentLayer: () => void;
  onAddVideoTrack: () => void;
  onAddAudioTrack: () => void;
  onGenerateCaptions: () => void;
  onSaveProject: () => void | Promise<void>;
  onLoadProject: () => void | Promise<void>;
  onTogglePlayback: () => void;
  onNudgePlayhead: (deltaSeconds: number) => void;
  onPlayheadChange: (time: number) => void;
  onClearMarks: () => void;
  onPixelsPerSecondChange: (pixelsPerSecond: number) => void;
  onFitTimelineZoom: (mode: 'timeline' | 'selection') => void;
  onGapInsertDurationChange: (duration: number) => void;
  onInsertGap: () => void;
  onFillAiBrollGaps: () => void;
  onRulerPointerDown: (event: MouseEvent<HTMLDivElement>) => void;
  onMarkerPointerDown: (event: ReactPointerEvent<HTMLSpanElement>, marker: TimelineMarker) => void;
  onViewportChange?: (viewport: { scrollLeft: number; viewportWidth: number }) => void;
}) {
  const rulerTicks = useMemo(() => buildRulerTicks(duration, pixelsPerSecond), [duration, pixelsPerSecond]);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Timeline</h2>
        <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
          <input
            value={titleText}
            onChange={(event) => onTitleTextChange(event.target.value)}
            className="w-36 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-200 outline-none focus:border-emerald-500"
            aria-label="New title text"
          />
          <button className="rounded border border-zinc-800 px-2 py-1 hover:border-emerald-500" onClick={onAddTitle}>Add title</button>
          <button className="rounded border border-violet-500/40 bg-violet-500/10 px-2 py-1 text-violet-100 hover:border-violet-300" onClick={onAddAdjustmentLayer}>Add adjustment</button>
          <button className="rounded border border-zinc-800 px-2 py-1 hover:border-emerald-500" onClick={onAddVideoTrack}>Add video</button>
          <button className="rounded border border-zinc-800 px-2 py-1 hover:border-emerald-500" onClick={onAddAudioTrack}>Add audio</button>
          <button className="rounded border border-zinc-800 px-2 py-1 hover:border-emerald-500" onClick={onGenerateCaptions}>Captions</button>
          <button className="rounded border border-zinc-800 px-2 py-1 hover:border-emerald-500" onClick={() => void onSaveProject()}>Save</button>
          <button className="rounded border border-zinc-800 px-2 py-1 hover:border-emerald-500" onClick={() => void onLoadProject()}>Load</button>
          <span>{formatTimecode(duration, fps)}</span>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2">
        <button
          className="rounded border border-zinc-700 px-3 py-1 text-sm text-zinc-200 hover:border-emerald-500"
          onClick={onTogglePlayback}
        >
          {playbackRate === 0 ? 'Play' : `Pause ${formatPlaybackRate(playbackRate)}`}
        </button>
        <button className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:border-emerald-500" onClick={() => onNudgePlayhead(-1 / fps)}>-1f</button>
        <button className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:border-emerald-500" onClick={() => onNudgePlayhead(1 / fps)}>+1f</button>
        <input
          type="range"
          aria-label="Timeline playhead"
          min={0}
          max={duration}
          step={0.1}
          value={Math.min(playhead, duration)}
          onChange={(event) => onPlayheadChange(Number(event.target.value))}
          className="min-w-0 flex-1"
        />
        <span className="w-24 text-right text-xs tabular-nums text-zinc-400">{formatTimecode(playhead, fps)}</span>
        <div className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-400">
          <span className="tabular-nums">I {markIn === null ? '--:--' : formatTimecode(markIn, fps)}</span>
          <span className="tabular-nums">O {markOut === null ? '--:--' : formatTimecode(markOut, fps)}</span>
          {loopPlaybackEnabled && markedRange ? (
            <span className="text-emerald-300">Loop {formatTimecode(markedRange.end - markedRange.start, fps)}</span>
          ) : null}
          <button type="button" className="text-zinc-500 hover:text-zinc-200" onClick={onClearMarks}>Clear</button>
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          Zoom
          <input
            type="range"
            min={8}
            max={52}
            step={2}
            value={pixelsPerSecond}
            onChange={(event) => onPixelsPerSecondChange(Number(event.target.value))}
            className="w-28"
          />
        </label>
        <button
          type="button"
          className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:border-emerald-500"
          onClick={() => onFitTimelineZoom('timeline')}
        >
          Fit
        </button>
        <button
          type="button"
          className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:border-emerald-500"
          onClick={() => onFitTimelineZoom('selection')}
        >
          Fit Sel
        </button>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          Gap s
          <input
            type="number"
            min={0.1}
            max={duration}
            step={0.1}
            value={Number.isFinite(gapInsertDuration) ? Number(gapInsertDuration.toFixed(2)) : 1}
            onChange={(event) => {
              const nextValue = Number(event.target.value);
              if (Number.isFinite(nextValue)) {
                onGapInsertDurationChange(nextValue);
              }
            }}
            className="w-20 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-emerald-500"
          />
        </label>
        <button
          type="button"
          className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:border-emerald-500"
          onClick={onInsertGap}
        >
          Insert Gap
        </button>
        <button
          type="button"
          disabled={visualGapCount === 0}
          className="rounded border border-violet-500/40 bg-violet-500/10 px-2 py-1 text-xs text-violet-100 hover:border-violet-300 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={onFillAiBrollGaps}
        >
          AI Fill {visualGapCount}
        </button>
      </div>
      <div
        ref={scrollRef}
        data-testid="timeline-scroll-container"
        className="overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950"
        onScroll={(event) => onViewportChange?.({
          scrollLeft: event.currentTarget.scrollLeft,
          viewportWidth: event.currentTarget.clientWidth,
        })}
      >
        <div style={{ width: timelineWidth }} className="border-b border-zinc-800 bg-zinc-900 py-2">
          <div
            role="slider"
            tabIndex={0}
            aria-label="Timeline ruler scrubber"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={Number(playhead.toFixed(3))}
            className="relative h-6 cursor-col-resize select-none"
            onPointerDown={onRulerPointerDown}
          >
            {rulerTicks.map((tick) => (
              <span
                key={tick}
                className="pointer-events-none absolute top-0 text-[11px] text-zinc-500"
                style={{ left: tick * pixelsPerSecond }}
              >
                {formatRulerTime(tick)}
              </span>
            ))}
            {markedRange ? (
              <span
                className="pointer-events-none absolute bottom-0 top-0 rounded-sm bg-sky-400/15"
                style={{
                  left: markedRange.start * pixelsPerSecond,
                  width: Math.max(2, (markedRange.end - markedRange.start) * pixelsPerSecond),
                }}
              />
            ) : null}
            {markIn !== null ? (
              <span
                className="pointer-events-none absolute top-0 h-6 border-l border-sky-300 pl-1 text-[10px] leading-6 text-sky-200"
                style={{ left: markIn * pixelsPerSecond }}
              >
                In
              </span>
            ) : null}
            {markOut !== null ? (
              <span
                className="pointer-events-none absolute top-0 h-6 border-l border-amber-300 pl-1 text-[10px] leading-6 text-amber-200"
                style={{ left: markOut * pixelsPerSecond }}
              >
                Out
              </span>
            ) : null}
            {markers.map((marker) => {
              const displayTime = markerTimePreview?.id === marker.id
                ? markerTimePreview.time
                : marker.time;

              const markerDuration = marker.duration && marker.duration > 0 ? marker.duration : 0;

              return (
                <span
                  key={marker.id}
                  role="button"
                  tabIndex={-1}
                  aria-label={`Move marker ${marker.label} at ${formatTimecode(displayTime, fps)}`}
                  onPointerDown={(event) => onMarkerPointerDown(event, marker)}
                  className="absolute top-0 z-30 h-6 cursor-ew-resize border-l text-[10px] leading-6"
                  style={{ left: displayTime * pixelsPerSecond, borderColor: marker.color, color: marker.color }}
                  title={`${marker.label} ${formatTimecode(displayTime, fps)}${markerDuration ? ` +${markerDuration}s` : ''}${marker.note ? ` - ${marker.note}` : ''}`}
                >
                  {markerDuration ? (
                    <span
                      className="pointer-events-none absolute left-0 top-5 h-1 rounded-full opacity-60"
                      style={{
                        width: Math.max(2, markerDuration * pixelsPerSecond),
                        backgroundColor: marker.color,
                      }}
                    />
                  ) : null}
                  <span className="ml-1 rounded bg-zinc-900/80 px-1">{marker.label}</span>
                </span>
              );
            })}
            <span
              className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-rose-400"
              style={{ left: playhead * pixelsPerSecond }}
            />
          </div>
        </div>
        {children}
      </div>
    </>
  );
}

function formatPlaybackRate(rate: number): string {
  if (rate === 0) {
    return 'stopped';
  }

  return `${rate > 0 ? 'x' : '-x'}${Math.abs(rate)}`;
}

function buildRulerTicks(duration: number, pixelsPerSecond: number): number[] {
  const targetSpacing = 90;
  const roughStep = targetSpacing / pixelsPerSecond;
  const step = roughStep <= 1 ? 1 : roughStep <= 2 ? 2 : roughStep <= 5 ? 5 : roughStep <= 10 ? 10 : 30;
  const count = Math.floor(duration / step) + 1;

  return Array.from({ length: count }, (_, index) => index * step);
}
