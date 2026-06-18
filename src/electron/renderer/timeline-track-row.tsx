import type { DragEvent, MouseEvent, ReactNode } from 'react';
import {
  formatTrackPan,
  formatTrackVolumeDb,
  normalizeTrackPan,
  normalizeTrackVolumeDb,
  TRACK_PAN_MAX,
  TRACK_PAN_MIN,
  TRACK_VOLUME_MAX_DB,
  TRACK_VOLUME_MIN_DB,
} from '../../lib/editor/audio-mixer';
import type { TimelineTrack } from '../../lib/editor/types';
import type { TimelineAssetDropPreview, TimelineClipDropPreview, TimelineEditGuide } from './editor-view-model';

type TrackStateKey = 'muted' | 'solo' | 'locked' | 'syncLocked';
type TrackMixPatch = Partial<Pick<TimelineTrack, 'volumeDb' | 'pan'>>;

export function TimelineTrackRow({
  track,
  trackIndex,
  trackCount,
  selected,
  pixelsPerSecond,
  playhead,
  fps,
  markedRange,
  timelineEditGuide,
  boxSelection,
  clipDragPreview,
  assetDropPreview,
  clipDragTargetTrackId,
  sourcePrimaryPatchEnabled,
  sourceAudioPatchEnabled,
  activeSourcePrimaryPatchTrackId,
  activeSourceAudioPatchTrackId,
  children,
  onTrackSelect,
  onTrackRename,
  onMoveTrack,
  onRemoveTrack,
  onSetPrimaryPatchTrack,
  onSetAudioPatchTrack,
  onTrackToggle,
  onTrackMixerChange,
  onLaneRef,
  onLanePointerDown,
  onLaneDragOver,
  onLaneDrop,
  onLaneDragLeave,
}: {
  track: TimelineTrack;
  trackIndex: number;
  trackCount: number;
  selected: boolean;
  pixelsPerSecond: number;
  playhead: number;
  fps: number;
  markedRange: { start: number; end: number } | null;
  timelineEditGuide: TimelineEditGuide | null;
  boxSelection: { trackIds: string[]; start: number; end: number } | null;
  clipDragPreview: TimelineClipDropPreview | null;
  assetDropPreview: TimelineAssetDropPreview | null;
  clipDragTargetTrackId: string | null;
  sourcePrimaryPatchEnabled: boolean;
  sourceAudioPatchEnabled: boolean;
  activeSourcePrimaryPatchTrackId?: string;
  activeSourceAudioPatchTrackId?: string;
  children: ReactNode;
  onTrackSelect: (track: TimelineTrack) => void;
  onTrackRename: (track: TimelineTrack, name: string) => void;
  onMoveTrack: (trackId: string, direction: 'up' | 'down') => void;
  onRemoveTrack: (track: TimelineTrack) => void;
  onSetPrimaryPatchTrack: (trackId: string) => void;
  onSetAudioPatchTrack: (trackId: string) => void;
  onTrackToggle: (trackId: string, state: TrackStateKey) => void;
  onTrackMixerChange: (trackId: string, patch: TrackMixPatch) => void;
  onLaneRef: (trackId: string, node: HTMLDivElement | null) => void;
  onLanePointerDown: (event: MouseEvent<HTMLDivElement>, track: TimelineTrack) => void;
  onLaneDragOver: (event: DragEvent<HTMLDivElement>, track: TimelineTrack) => void;
  onLaneDrop: (event: DragEvent<HTMLDivElement>, track: TimelineTrack) => void;
  onLaneDragLeave: (event: DragEvent<HTMLDivElement>, track: TimelineTrack) => void;
}) {
  return (
    <div
      className="grid grid-cols-[178px_minmax(0,1fr)] border-b border-zinc-900 last:border-b-0"
      data-testid={`timeline-track-${track.id}`}
    >
      <TimelineTrackHeader
        track={track}
        trackIndex={trackIndex}
        trackCount={trackCount}
        selected={selected}
        sourcePrimaryPatchEnabled={sourcePrimaryPatchEnabled}
        sourceAudioPatchEnabled={sourceAudioPatchEnabled}
        activeSourcePrimaryPatchTrackId={activeSourcePrimaryPatchTrackId}
        activeSourceAudioPatchTrackId={activeSourceAudioPatchTrackId}
        onTrackSelect={onTrackSelect}
        onTrackRename={onTrackRename}
        onMoveTrack={onMoveTrack}
        onRemoveTrack={onRemoveTrack}
        onSetPrimaryPatchTrack={onSetPrimaryPatchTrack}
        onSetAudioPatchTrack={onSetAudioPatchTrack}
        onTrackToggle={onTrackToggle}
        onTrackMixerChange={onTrackMixerChange}
      />
      <div
        ref={(node) => onLaneRef(track.id, node)}
        data-testid={`timeline-lane-${track.id}`}
        className={`relative h-20 bg-[linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] ${
          clipDragTargetTrackId === track.id ? 'outline outline-2 outline-emerald-400/80' : ''
        }`}
        style={{ backgroundSize: `${pixelsPerSecond * 5}px 100%` }}
        onPointerDown={(event) => onLanePointerDown(event, track)}
        onDragOver={(event) => onLaneDragOver(event, track)}
        onDrop={(event) => onLaneDrop(event, track)}
        onDragLeave={(event) => onLaneDragLeave(event, track)}
      >
        <TimelineTrackLaneOverlays
          trackId={track.id}
          pixelsPerSecond={pixelsPerSecond}
          playhead={playhead}
          fps={fps}
          markedRange={markedRange}
          timelineEditGuide={timelineEditGuide}
          boxSelection={boxSelection}
          clipDragPreview={clipDragPreview}
          assetDropPreview={assetDropPreview}
        />
        {children}
      </div>
    </div>
  );
}

function TimelineTrackHeader({
  track,
  trackIndex,
  trackCount,
  selected,
  sourcePrimaryPatchEnabled,
  sourceAudioPatchEnabled,
  activeSourcePrimaryPatchTrackId,
  activeSourceAudioPatchTrackId,
  onTrackSelect,
  onTrackRename,
  onMoveTrack,
  onRemoveTrack,
  onSetPrimaryPatchTrack,
  onSetAudioPatchTrack,
  onTrackToggle,
  onTrackMixerChange,
}: {
  track: TimelineTrack;
  trackIndex: number;
  trackCount: number;
  selected: boolean;
  sourcePrimaryPatchEnabled: boolean;
  sourceAudioPatchEnabled: boolean;
  activeSourcePrimaryPatchTrackId?: string;
  activeSourceAudioPatchTrackId?: string;
  onTrackSelect: (track: TimelineTrack) => void;
  onTrackRename: (track: TimelineTrack, name: string) => void;
  onMoveTrack: (trackId: string, direction: 'up' | 'down') => void;
  onRemoveTrack: (track: TimelineTrack) => void;
  onSetPrimaryPatchTrack: (trackId: string) => void;
  onSetAudioPatchTrack: (trackId: string) => void;
  onTrackToggle: (trackId: string, state: TrackStateKey) => void;
  onTrackMixerChange: (trackId: string, patch: TrackMixPatch) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onTrackSelect(track)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          onTrackSelect(track);
        }
      }}
      className={`border-r border-zinc-800 px-3 py-3 text-left ${selected ? 'bg-zinc-800' : 'bg-zinc-900'}`}
    >
      <div className="flex items-center gap-1">
        <input
          defaultValue={track.name}
          onClick={(event) => event.stopPropagation()}
          onBlur={(event) => onTrackRename(track, event.currentTarget.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
            if (event.key === 'Escape') {
              event.currentTarget.value = track.name;
              event.currentTarget.blur();
            }
          }}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium text-zinc-200 outline-none hover:border-zinc-700 focus:border-emerald-500 focus:bg-zinc-950"
          aria-label="Track name"
        />
        <button
          type="button"
          disabled={trackIndex === 0}
          onClick={(event) => {
            event.stopPropagation();
            onMoveTrack(track.id, 'up');
          }}
          className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:border-emerald-500 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-30"
          title="Move track up"
        >
          Up
        </button>
        <button
          type="button"
          disabled={trackIndex === trackCount - 1}
          onClick={(event) => {
            event.stopPropagation();
            onMoveTrack(track.id, 'down');
          }}
          className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:border-emerald-500 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-30"
          title="Move track down"
        >
          Dn
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemoveTrack(track);
          }}
          className={`rounded border px-1.5 py-0.5 text-[10px] hover:border-rose-500 hover:text-rose-100 ${track.clips.length > 0 ? 'border-zinc-800 text-zinc-600' : 'border-zinc-700 text-zinc-400'}`}
          title={track.clips.length > 0 ? 'Empty the track before deleting it' : 'Delete empty track'}
        >
          Del
        </button>
      </div>
      <div className="mt-2 flex items-center gap-1 text-[11px] uppercase text-zinc-500">
        <span>{track.kind}</span>
        <span className={track.muted ? 'text-amber-300' : 'text-zinc-600'}>M</span>
        <span className={track.solo ? 'text-sky-300' : 'text-zinc-600'}>S</span>
        <span className={track.syncLocked ? 'text-emerald-300' : 'text-zinc-600'}>Y</span>
        <span className={track.locked ? 'text-rose-300' : 'text-zinc-600'}>L</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {track.kind !== 'audio' ? (
          <TrackTogglePill
            label="V"
            ariaLabel={`${track.name} source video patch`}
            active={sourcePrimaryPatchEnabled && activeSourcePrimaryPatchTrackId === track.id}
            activeClassName="border-emerald-500 text-emerald-200"
            title="Source video/primary patch target"
            onClick={() => onSetPrimaryPatchTrack(track.id)}
          />
        ) : null}
        {track.kind === 'audio' ? (
          <TrackTogglePill
            label="A"
            ariaLabel={`${track.name} source audio patch`}
            active={sourceAudioPatchEnabled && activeSourceAudioPatchTrackId === track.id}
            activeClassName="border-lime-500 text-lime-200"
            title="Source audio patch target"
            onClick={() => onSetAudioPatchTrack(track.id)}
          />
        ) : null}
        <TrackTogglePill
          label="Mute"
          ariaLabel={`${track.name} mute`}
          active={Boolean(track.muted)}
          activeClassName="border-amber-500 text-amber-200"
          onClick={() => onTrackToggle(track.id, 'muted')}
        />
        <TrackTogglePill
          label="Solo"
          ariaLabel={`${track.name} solo`}
          active={Boolean(track.solo)}
          activeClassName="border-sky-500 text-sky-200"
          onClick={() => onTrackToggle(track.id, 'solo')}
        />
        <TrackTogglePill
          label="Sync"
          ariaLabel={`${track.name} sync lock`}
          active={Boolean(track.syncLocked)}
          activeClassName="border-emerald-500 text-emerald-200"
          title="Sync-lock this track for ripple edits"
          onClick={() => onTrackToggle(track.id, 'syncLocked')}
        />
        <TrackTogglePill
          label="Lock"
          ariaLabel={`${track.name} lock`}
          active={Boolean(track.locked)}
          activeClassName="border-rose-500 text-rose-200"
          onClick={() => onTrackToggle(track.id, 'locked')}
        />
      </div>
      {track.kind === 'audio' ? (
        <TimelineTrackAudioMixer track={track} onTrackMixerChange={onTrackMixerChange} />
      ) : null}
    </div>
  );
}

function TrackTogglePill({
  label,
  ariaLabel,
  active,
  activeClassName,
  title,
  onClick,
}: {
  label: string;
  ariaLabel?: string;
  active: boolean;
  activeClassName: string;
  title?: string;
  onClick: () => void;
}) {
  const handlePress = (event: MouseEvent<HTMLSpanElement>) => {
    event.stopPropagation();
    onClick();
  };

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={ariaLabel ?? label}
      aria-pressed={active}
      onClick={handlePress}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.stopPropagation();
          onClick();
        }
      }}
      className={`rounded border px-2 py-1 text-[11px] ${active ? activeClassName : 'border-zinc-700 text-zinc-400'}`}
      title={title}
    >
      {label}
    </span>
  );
}

function TimelineTrackAudioMixer({
  track,
  onTrackMixerChange,
}: {
  track: TimelineTrack;
  onTrackMixerChange: (trackId: string, patch: TrackMixPatch) => void;
}) {
  return (
    <div
      className="mt-3 space-y-2 rounded border border-zinc-800 bg-zinc-950/70 p-2"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="grid grid-cols-[34px_minmax(0,1fr)_52px] items-center gap-2 text-[11px] text-zinc-500">
        <span>Gain</span>
        <input
          aria-label={`${track.name} gain`}
          type="range"
          min={TRACK_VOLUME_MIN_DB}
          max={TRACK_VOLUME_MAX_DB}
          step={0.5}
          value={normalizeTrackVolumeDb(track.volumeDb)}
          onChange={(event) => onTrackMixerChange(track.id, { volumeDb: Number(event.currentTarget.value) })}
          className="min-w-0 accent-emerald-400"
        />
        <span className="text-right tabular-nums text-zinc-300">{formatTrackVolumeDb(track.volumeDb)}</span>
      </div>
      <div className="grid grid-cols-[34px_minmax(0,1fr)_52px] items-center gap-2 text-[11px] text-zinc-500">
        <span>Pan</span>
        <input
          aria-label={`${track.name} pan`}
          type="range"
          min={TRACK_PAN_MIN}
          max={TRACK_PAN_MAX}
          step={0.05}
          value={normalizeTrackPan(track.pan)}
          onChange={(event) => onTrackMixerChange(track.id, { pan: Number(event.currentTarget.value) })}
          className="min-w-0 accent-sky-400"
        />
        <span className="text-right tabular-nums text-zinc-300">{formatTrackPan(track.pan)}</span>
      </div>
      <button
        type="button"
        onClick={() => onTrackMixerChange(track.id, { volumeDb: 0, pan: 0 })}
        className="w-full rounded border border-zinc-800 px-2 py-1 text-[11px] text-zinc-400 hover:border-emerald-500 hover:text-zinc-100"
      >
        Reset mix
      </button>
    </div>
  );
}

function TimelineTrackLaneOverlays({
  trackId,
  pixelsPerSecond,
  playhead,
  fps,
  markedRange,
  timelineEditGuide,
  boxSelection,
  clipDragPreview,
  assetDropPreview,
}: {
  trackId: string;
  pixelsPerSecond: number;
  playhead: number;
  fps: number;
  markedRange: { start: number; end: number } | null;
  timelineEditGuide: TimelineEditGuide | null;
  boxSelection: { trackIds: string[]; start: number; end: number } | null;
  clipDragPreview: TimelineClipDropPreview | null;
  assetDropPreview: TimelineAssetDropPreview | null;
}) {
  return (
    <>
      {markedRange ? (
        <div
          className="pointer-events-none absolute bottom-0 top-0 z-0 bg-sky-400/10"
          style={{
            left: markedRange.start * pixelsPerSecond,
            width: Math.max(2, (markedRange.end - markedRange.start) * pixelsPerSecond),
          }}
        />
      ) : null}
      <div
        className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-rose-400"
        style={{ left: playhead * pixelsPerSecond }}
      />
      {timelineEditGuide ? (
        <div
          className={`pointer-events-none absolute bottom-0 top-0 z-40 w-px ${timelineEditGuideToneClassName(timelineEditGuide.tone)}`}
          style={{ left: timelineEditGuide.time * pixelsPerSecond }}
        >
          {timelineEditGuide.trackId === trackId ? (
            <span
              className={`absolute left-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-semibold shadow ${timelineEditGuideLabelClassName(timelineEditGuide.tone)}`}
            >
              {timelineEditGuide.label} {formatTimecode(timelineEditGuide.time, fps)}
            </span>
          ) : null}
        </div>
      ) : null}
      {boxSelection?.trackIds.includes(trackId) ? (
        <div
          className="pointer-events-none absolute bottom-2 top-2 z-10 rounded border border-emerald-300 bg-emerald-300/15"
          style={{
            left: boxSelection.start * pixelsPerSecond,
            width: Math.max(2, (boxSelection.end - boxSelection.start) * pixelsPerSecond),
          }}
        />
      ) : null}
      {clipDragPreview?.trackId === trackId ? (
        <TimelineTrackDropPreview preview={clipDragPreview} pixelsPerSecond={pixelsPerSecond} validLabel="Ready" invalidLabel="Overlap" validTone="clip" />
      ) : null}
      {assetDropPreview?.trackId === trackId ? (
        <TimelineTrackDropPreview preview={assetDropPreview} pixelsPerSecond={pixelsPerSecond} validLabel={assetDropPreview.mode} invalidLabel="Invalid" validTone="asset" />
      ) : null}
    </>
  );
}

function TimelineTrackDropPreview({
  preview,
  pixelsPerSecond,
  validLabel,
  invalidLabel,
  validTone,
}: {
  preview: TimelineClipDropPreview | TimelineAssetDropPreview;
  pixelsPerSecond: number;
  validLabel: string;
  invalidLabel: string;
  validTone: 'clip' | 'asset';
}) {
  const validClassName = validTone === 'asset'
    ? 'border-sky-300 bg-sky-500/20 text-sky-100 ring-2 ring-sky-300/40'
    : 'border-emerald-300 bg-emerald-400/20 text-emerald-100 ring-2 ring-emerald-300/40';

  return (
    <div
      className={`pointer-events-none absolute top-3 z-30 h-14 overflow-hidden rounded-md border px-3 py-2 text-left text-xs font-semibold shadow-lg ${
        preview.valid ? validClassName : 'border-rose-300 bg-rose-500/20 text-rose-100 ring-2 ring-rose-300/50'
      }`}
      style={{
        left: preview.start * pixelsPerSecond,
        width: Math.max(preview.duration * pixelsPerSecond, 58),
      }}
    >
      <span className="block truncate">{preview.label}</span>
      <span className="mt-1 block text-[11px] font-normal opacity-80">
        {preview.valid ? validLabel : invalidLabel}
      </span>
    </div>
  );
}

function timelineEditGuideToneClassName(tone: TimelineEditGuide['tone']): string {
  switch (tone) {
    case 'snap':
      return 'bg-amber-300';
    case 'limit':
      return 'bg-rose-300';
    case 'drop':
      return 'bg-sky-300';
    case 'move':
    default:
      return 'bg-cyan-300';
  }
}

function timelineEditGuideLabelClassName(tone: TimelineEditGuide['tone']): string {
  switch (tone) {
    case 'snap':
      return 'bg-amber-300 text-zinc-950';
    case 'limit':
      return 'bg-rose-300 text-zinc-950';
    case 'drop':
      return 'bg-sky-300 text-zinc-950';
    case 'move':
    default:
      return 'bg-cyan-300 text-zinc-950';
  }
}

function formatTimecode(seconds: number, fps: number): string {
  const safeSeconds = Math.max(0, seconds);
  const wholeSeconds = Math.floor(safeSeconds);
  const frames = Math.round((safeSeconds - wholeSeconds) * fps);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const secs = wholeSeconds % 60;

  return `${padTime(hours)}:${padTime(minutes)}:${padTime(secs)}:${padTime(Math.min(frames, fps - 1))}`;
}

function padTime(value: number): string {
  return Math.floor(value).toString().padStart(2, '0');
}
