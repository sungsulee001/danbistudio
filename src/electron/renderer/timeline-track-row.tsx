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
import type { DanbiMenuLanguage } from '../../lib/editor/menu-language';
import type { TimelineAssetDropPreview, TimelineClipDropPreview, TimelineEditGuide, TimelineGroupMovePreview, TimelineGroupTrimPreview, TimelineNeighborImpactPreview, TimelineRippleTrimPreview } from './editor-view-model';
import { formatRulerTime, formatSignedEditDelta } from './editor-time-helpers';
import { TIMELINE_TRACK_HEADER_WIDTH } from './timeline-layout-constants';
import { useMenuLanguage } from './use-menu-language';

type TrackStateKey = 'muted' | 'solo' | 'locked' | 'syncLocked';
type TrackMixPatch = Partial<Pick<TimelineTrack, 'volumeDb' | 'pan'>>;

const timelineTrackText: Record<DanbiMenuLanguage, {
  audioPatch: string;
  delete: string;
  gain: string;
  lane: string;
  lock: string;
  lockedTrack: string;
  mix: string;
  moveDown: string;
  moveUp: string;
  mute: string;
  pan: string;
  resetMix: string;
  sourceAudioPatchTarget: string;
  sourceVideoPatchTarget: string;
  syncLock: string;
  syncLockTitle: string;
  trackName: string;
  videoPatch: string;
  solo: string;
}> = {
  en: {
    audioPatch: 'source audio patch',
    delete: 'Delete',
    gain: 'Gain',
    lane: 'Timeline lane',
    lock: 'lock',
    lockedTrack: 'Locked track',
    mix: 'Mix',
    moveDown: 'Move down',
    moveUp: 'Move up',
    mute: 'mute',
    pan: 'Pan',
    resetMix: 'Reset mix',
    sourceAudioPatchTarget: 'Source audio patch target',
    sourceVideoPatchTarget: 'Source video/primary patch target',
    syncLock: 'sync lock',
    syncLockTitle: 'Sync-lock this track for ripple edits',
    trackName: 'Track name',
    videoPatch: 'source video patch',
    solo: 'solo',
  },
  ko: {
    audioPatch: '소스 오디오 패치',
    delete: '삭제',
    gain: '게인',
    lane: '타임라인 레인',
    lock: '잠금',
    lockedTrack: '잠긴 트랙',
    mix: '믹스',
    moveDown: '아래로 이동',
    moveUp: '위로 이동',
    mute: '음소거',
    pan: '팬',
    resetMix: '믹스 초기화',
    sourceAudioPatchTarget: '소스 오디오 패치 대상',
    sourceVideoPatchTarget: '소스 비디오/기본 패치 대상',
    syncLock: '동기 잠금',
    syncLockTitle: '리플 편집용으로 이 트랙을 동기 잠금',
    trackName: '트랙 이름',
    videoPatch: '소스 비디오 패치',
    solo: '솔로',
  },
};

export function TimelineTrackRow({
  track,
  trackIndex,
  trackCount,
  selected,
  pixelsPerSecond,
  trackHeight,
  playhead,
  fps,
  markedRange,
  timelineEditGuide,
  boxSelection,
  clipDragPreview,
  groupMovePreview,
  groupTrimPreview,
  neighborImpactPreview,
  rippleTrimPreview,
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
  trackHeight: number;
  playhead: number;
  fps: number;
  markedRange: { start: number; end: number } | null;
  timelineEditGuide: TimelineEditGuide | null;
  boxSelection: { trackIds: string[]; start: number; end: number } | null;
  clipDragPreview: TimelineClipDropPreview | null;
  groupMovePreview: TimelineGroupMovePreview | null;
  groupTrimPreview: TimelineGroupTrimPreview | null;
  neighborImpactPreview: TimelineNeighborImpactPreview | null;
  rippleTrimPreview: TimelineRippleTrimPreview | null;
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
  const language = useMenuLanguage();
  const text = timelineTrackText[language];

  return (
    <div
      className="grid border-b border-surface last:border-b-0"
      data-testid={`timeline-track-${track.id}`}
      data-track-header-width={TIMELINE_TRACK_HEADER_WIDTH}
      style={{
        minHeight: trackHeight,
        gridTemplateColumns: `${TIMELINE_TRACK_HEADER_WIDTH}px minmax(0, 1fr)`,
      }}
    >
      <TimelineTrackHeader
        track={track}
        trackIndex={trackIndex}
        trackCount={trackCount}
        selected={selected}
        trackHeight={trackHeight}
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
        data-track-name={track.name}
        data-track-kind={track.kind}
        data-track-locked={track.locked ? 'true' : 'false'}
        aria-label={`${text.lane} ${track.name}`}
        className={`relative bg-[linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] ${
          clipDragTargetTrackId === track.id ? 'outline outline-2 outline-accent-600/80' : ''
        } ${track.locked ? 'opacity-70' : ''}`}
        style={{ height: trackHeight, backgroundSize: `${pixelsPerSecond * 5}px 100%` }}
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
          groupMovePreview={groupMovePreview}
          groupTrimPreview={groupTrimPreview}
          neighborImpactPreview={neighborImpactPreview}
          rippleTrimPreview={rippleTrimPreview}
          assetDropPreview={assetDropPreview}
          trackHeight={trackHeight}
        />
        {track.locked ? (
          <div
            data-testid={`timeline-track-locked-overlay-${track.id}`}
            className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-paper/35 text-meta font-semibold uppercase tracking-wide text-danger-800"
          >
            {text.lockedTrack}
          </div>
        ) : null}
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
  trackHeight,
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
  trackHeight: number;
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
  const language = useMenuLanguage();
  const text = timelineTrackText[language];

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
      className={`sticky left-0 z-30 border-r border-ds-200 px-2 py-2 text-left ${selected ? 'bg-ds-200' : 'bg-surface'}`}
      style={{ minHeight: trackHeight }}
    >
      <div className="flex items-center gap-1">
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded text-meta font-semibold ${
          track.kind === 'audio' ? 'bg-accent-500/15 text-accent-800' : 'bg-info-500/15 text-info-800'
        }`}>
          {track.kind === 'audio' ? 'A' : 'V'}
        </span>
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
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-medium text-ds-800 outline-none hover:border-ds-300 focus:border-accent-500 focus:bg-paper"
        aria-label={text.trackName}
        />
        <details className="relative shrink-0">
          <summary className="grid h-6 w-6 cursor-pointer list-none place-items-center rounded border border-ds-200 bg-paper text-xs text-ds-700 hover:border-ds-400 hover:text-ink">
            ...
          </summary>
          <div className="absolute left-0 top-7 z-50 grid w-32 gap-1 rounded-md border border-ds-300 bg-paper p-1 shadow-2xl">
            <TrackMenuButton disabled={trackIndex === 0} onClick={() => onMoveTrack(track.id, 'up')}>{text.moveUp}</TrackMenuButton>
            <TrackMenuButton disabled={trackIndex === trackCount - 1} onClick={() => onMoveTrack(track.id, 'down')}>{text.moveDown}</TrackMenuButton>
            <TrackMenuButton disabled={track.clips.length > 0} onClick={() => onRemoveTrack(track)}>{text.delete}</TrackMenuButton>
          </div>
        </details>
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1">
        {track.kind !== 'audio' ? (
          <TrackTogglePill
            label="V"
            ariaLabel={`${track.name} ${text.videoPatch}`}
            active={sourcePrimaryPatchEnabled && activeSourcePrimaryPatchTrackId === track.id}
            activeClassName="border-accent-500 text-accent-800"
            title={text.sourceVideoPatchTarget}
            onClick={() => onSetPrimaryPatchTrack(track.id)}
          />
        ) : null}
        {track.kind === 'audio' ? (
          <TrackTogglePill
            label="A"
            ariaLabel={`${track.name} ${text.audioPatch}`}
            active={sourceAudioPatchEnabled && activeSourceAudioPatchTrackId === track.id}
            activeClassName="border-accent-500 text-accent-800"
            title={text.sourceAudioPatchTarget}
            onClick={() => onSetAudioPatchTrack(track.id)}
          />
        ) : null}
        <TrackTogglePill
          label="M"
          ariaLabel={`${track.name} ${text.mute}`}
          active={Boolean(track.muted)}
          activeClassName="border-warn-500 text-warn-800"
          onClick={() => onTrackToggle(track.id, 'muted')}
        />
        <TrackTogglePill
          label="S"
          ariaLabel={`${track.name} ${text.solo}`}
          active={Boolean(track.solo)}
          activeClassName="border-info-500 text-info-800"
          onClick={() => onTrackToggle(track.id, 'solo')}
        />
        <TrackTogglePill
          label="Sy"
          ariaLabel={`${track.name} ${text.syncLock}`}
          active={Boolean(track.syncLocked)}
          activeClassName="border-accent-500 text-accent-800"
          title={text.syncLockTitle}
          onClick={() => onTrackToggle(track.id, 'syncLocked')}
        />
        <TrackTogglePill
          label={language === 'ko' ? '잠' : 'L'}
          testId={`timeline-track-lock-${track.id}`}
          ariaLabel={`${track.name} ${text.lock}`}
          active={Boolean(track.locked)}
          activeClassName="border-danger-500 text-danger-800"
          onClick={() => onTrackToggle(track.id, 'locked')}
        />
      </div>
      {track.kind === 'audio' ? (
        <details className="mt-2 rounded border border-ds-200 bg-paper/70">
          <summary className="cursor-pointer list-none px-2 py-1 text-micro uppercase tracking-wide text-ds-600">
            {text.mix}
          </summary>
          <div className="border-t border-ds-200 px-2 pb-2">
            <TimelineTrackAudioMixer track={track} onTrackMixerChange={onTrackMixerChange} />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function TrackMenuButton({
  children,
  disabled = false,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="rounded px-2 py-1.5 text-left text-meta text-ds-800 hover:bg-ds-200 disabled:cursor-not-allowed disabled:opacity-40"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

function TrackTogglePill({
  label,
  testId,
  ariaLabel,
  active,
  activeClassName,
  title,
  onClick,
}: {
  label: string;
  testId?: string;
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
      data-testid={testId}
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
      className={`grid h-6 min-w-0 place-items-center rounded border px-1 text-micro font-semibold ${active ? activeClassName : 'border-ds-300 text-ds-700'}`}
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
  const language = useMenuLanguage();
  const text = timelineTrackText[language];

  return (
    <div
      className="mt-3 space-y-2 rounded border border-ds-200 bg-paper/70 p-2"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="grid grid-cols-[34px_minmax(0,1fr)_52px] items-center gap-2 text-meta text-ds-600">
        <span>{text.gain}</span>
        <input
          aria-label={`${track.name} ${text.gain}`}
          type="range"
          min={TRACK_VOLUME_MIN_DB}
          max={TRACK_VOLUME_MAX_DB}
          step={0.5}
          value={normalizeTrackVolumeDb(track.volumeDb)}
          onChange={(event) => onTrackMixerChange(track.id, { volumeDb: Number(event.currentTarget.value) })}
          className="min-w-0 accent-accent-600"
        />
        <span className="text-right tabular-nums text-ds-700">{formatTrackVolumeDb(track.volumeDb)}</span>
      </div>
      <div className="grid grid-cols-[34px_minmax(0,1fr)_52px] items-center gap-2 text-meta text-ds-600">
        <span>{text.pan}</span>
        <input
          aria-label={`${track.name} ${text.pan}`}
          type="range"
          min={TRACK_PAN_MIN}
          max={TRACK_PAN_MAX}
          step={0.05}
          value={normalizeTrackPan(track.pan)}
          onChange={(event) => onTrackMixerChange(track.id, { pan: Number(event.currentTarget.value) })}
          className="min-w-0 accent-info-600"
        />
        <span className="text-right tabular-nums text-ds-700">{formatTrackPan(track.pan)}</span>
      </div>
      <button
        type="button"
        onClick={() => onTrackMixerChange(track.id, { volumeDb: 0, pan: 0 })}
        className="w-full rounded border border-ds-200 px-2 py-1 text-meta text-ds-700 hover:border-accent-500 hover:text-ink"
      >
        {text.resetMix}
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
  groupMovePreview,
  groupTrimPreview,
  neighborImpactPreview,
  rippleTrimPreview,
  assetDropPreview,
  trackHeight,
}: {
  trackId: string;
  pixelsPerSecond: number;
  playhead: number;
  fps: number;
  markedRange: { start: number; end: number } | null;
  timelineEditGuide: TimelineEditGuide | null;
  boxSelection: { trackIds: string[]; start: number; end: number } | null;
  clipDragPreview: TimelineClipDropPreview | null;
  groupMovePreview: TimelineGroupMovePreview | null;
  groupTrimPreview: TimelineGroupTrimPreview | null;
  neighborImpactPreview: TimelineNeighborImpactPreview | null;
  rippleTrimPreview: TimelineRippleTrimPreview | null;
  assetDropPreview: TimelineAssetDropPreview | null;
  trackHeight: number;
}) {
  return (
    <>
      {markedRange ? (
        <div
          className="pointer-events-none absolute bottom-0 top-0 z-0 bg-info-600/10"
          style={{
            left: markedRange.start * pixelsPerSecond,
            width: Math.max(2, (markedRange.end - markedRange.start) * pixelsPerSecond),
          }}
        />
      ) : null}
      <div
        className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-danger-600"
        style={{ left: playhead * pixelsPerSecond }}
      />
      {timelineEditGuide ? (
        <div
          data-testid={`timeline-edit-guide-line-${trackId}`}
          data-guide-active-track={timelineEditGuide.trackId === trackId ? 'true' : 'false'}
          data-guide-tone={timelineEditGuide.tone}
          data-guide-label={timelineEditGuide.label}
          data-guide-time={timelineEditGuide.time}
          data-guide-operation={timelineEditGuide.operation ?? ''}
          data-guide-delta={timelineEditGuide.delta ?? ''}
          data-guide-duration={timelineEditGuide.duration ?? ''}
          data-guide-group-count={timelineEditGuide.groupCount ?? ''}
          data-guide-snapped={timelineEditGuide.snapped ? 'true' : 'false'}
          data-guide-constrained={timelineEditGuide.constrained ? 'true' : 'false'}
          data-guide-ripple={timelineEditGuide.ripple ? 'true' : 'false'}
          className={`pointer-events-none absolute bottom-0 top-0 z-40 w-px ${timelineEditGuideToneClassName(timelineEditGuide.tone)}`}
          style={{ left: timelineEditGuide.time * pixelsPerSecond }}
        >
          {timelineEditGuide.trackId === trackId ? (
            <TimelineEditGuideCallout guide={timelineEditGuide} fps={fps} />
          ) : null}
        </div>
      ) : null}
      {boxSelection?.trackIds.includes(trackId) ? (
        <div
          data-testid={`timeline-box-selection-${trackId}`}
          data-selection-start={boxSelection.start}
          data-selection-end={boxSelection.end}
          className="pointer-events-none absolute bottom-2 top-2 z-10 rounded border border-accent-700 bg-accent-700/15"
          style={{
            left: boxSelection.start * pixelsPerSecond,
            width: Math.max(2, (boxSelection.end - boxSelection.start) * pixelsPerSecond),
          }}
        />
      ) : null}
      {groupMovePreview ? (
        <TimelineGroupMovePreviewOverlay
          preview={groupMovePreview}
          trackId={trackId}
          pixelsPerSecond={pixelsPerSecond}
          trackHeight={trackHeight}
        />
      ) : null}
      {groupTrimPreview ? (
        <TimelineGroupTrimPreviewOverlay
          preview={groupTrimPreview}
          trackId={trackId}
          pixelsPerSecond={pixelsPerSecond}
          trackHeight={trackHeight}
        />
      ) : null}
      {neighborImpactPreview ? (
        <TimelineNeighborImpactPreviewOverlay
          preview={neighborImpactPreview}
          trackId={trackId}
          pixelsPerSecond={pixelsPerSecond}
          trackHeight={trackHeight}
        />
      ) : null}
      {rippleTrimPreview ? (
        <TimelineRippleTrimPreviewOverlay
          preview={rippleTrimPreview}
          trackId={trackId}
          pixelsPerSecond={pixelsPerSecond}
          trackHeight={trackHeight}
        />
      ) : null}
      {clipDragPreview?.trackId === trackId ? (
        <TimelineTrackDropPreview preview={clipDragPreview} pixelsPerSecond={pixelsPerSecond} trackHeight={trackHeight} validLabel="Ready" invalidLabel="Overlap" validTone="clip" />
      ) : null}
      {assetDropPreview?.trackId === trackId ? (
        <TimelineTrackDropPreview preview={assetDropPreview} pixelsPerSecond={pixelsPerSecond} trackHeight={trackHeight} validLabel={assetDropPreview.mode} invalidLabel="Invalid" validTone="asset" />
      ) : null}
    </>
  );
}

function TimelineGroupMovePreviewOverlay({
  preview,
  trackId,
  pixelsPerSecond,
  trackHeight,
}: {
  preview: TimelineGroupMovePreview;
  trackId: string;
  pixelsPerSecond: number;
  trackHeight: number;
}) {
  const clips = preview.clips.filter((clip) => clip.trackId === trackId);
  if (clips.length === 0) {
    return null;
  }

  const insetY = Math.max(4, Math.min(8, Math.round(trackHeight * 0.12)));
  const height = Math.max(34, trackHeight - (insetY * 2));
  const start = Math.min(...clips.map((clip) => clip.start));
  const end = Math.max(...clips.map((clip) => clip.start + clip.duration));

  return (
    <div
      data-testid={`timeline-group-move-preview-${trackId}`}
      data-preview-operation={preview.operation}
      data-preview-group-count={preview.groupCount}
      data-preview-delta={preview.delta}
      data-preview-start={start}
      data-preview-end={Number(end.toFixed(3))}
      className="pointer-events-none absolute z-[25]"
      style={{
        top: insetY,
        height,
        left: start * pixelsPerSecond,
        width: Math.max(2, (end - start) * pixelsPerSecond),
      }}
    >
      <span className="absolute inset-0 rounded-md border border-dashed border-info-800/70 bg-info-700/5" />
      <span className="absolute left-1 top-1 z-10 rounded bg-info-800 px-1.5 py-0.5 text-micro font-semibold uppercase text-paper shadow">
        {preview.groupCount} clips
      </span>
      {clips.map((clip) => (
        <span
          key={clip.id}
          data-testid={`timeline-group-move-preview-clip-${clip.id}`}
          data-preview-clip-id={clip.id}
          data-preview-start={clip.start}
          data-preview-duration={clip.duration}
          className="absolute bottom-1 top-1 rounded border border-info-800/80 bg-info-700/20 shadow-[inset_0_0_0_1px_rgba(8,145,178,0.45)]"
          style={{
            left: (clip.start - start) * pixelsPerSecond,
            width: Math.max(20, clip.duration * pixelsPerSecond),
          }}
          title={clip.label}
        />
      ))}
    </div>
  );
}

function TimelineGroupTrimPreviewOverlay({
  preview,
  trackId,
  pixelsPerSecond,
  trackHeight,
}: {
  preview: TimelineGroupTrimPreview;
  trackId: string;
  pixelsPerSecond: number;
  trackHeight: number;
}) {
  const clips = preview.clips.filter((clip) => clip.trackId === trackId);
  if (clips.length === 0) {
    return null;
  }

  const insetY = Math.max(4, Math.min(8, Math.round(trackHeight * 0.12)));
  const height = Math.max(34, trackHeight - (insetY * 2));
  const start = Math.min(...clips.map((clip) => Math.min(clip.start, clip.nextStart)));
  const end = Math.max(...clips.map((clip) => Math.max(clip.start + clip.duration, clip.nextStart + clip.nextDuration)));

  return (
    <div
      data-testid={`timeline-group-trim-preview-${trackId}`}
      data-preview-operation={preview.operation}
      data-preview-edge={preview.edge}
      data-preview-group-count={preview.groupCount}
      data-preview-delta={preview.delta}
      data-preview-start={start}
      data-preview-end={Number(end.toFixed(3))}
      className="pointer-events-none absolute z-[26]"
      style={{
        top: insetY,
        height,
        left: start * pixelsPerSecond,
        width: Math.max(2, (end - start) * pixelsPerSecond),
      }}
    >
      <span className="absolute inset-0 rounded-md border border-dashed border-accent2-800/70 bg-accent2-700/5" />
      <span className="absolute left-1 top-1 z-10 rounded bg-accent2-800 px-1.5 py-0.5 text-micro font-semibold uppercase text-paper shadow">
        Trim {preview.groupCount}
      </span>
      {clips.map((clip) => (
        <span
          key={clip.id}
          data-testid={`timeline-group-trim-preview-clip-${clip.id}`}
          data-preview-clip-id={clip.id}
          data-preview-start={clip.start}
          data-preview-next-start={clip.nextStart}
          data-preview-duration={clip.duration}
          data-preview-next-duration={clip.nextDuration}
          data-preview-delta={Number((preview.edge === 'start' ? clip.nextStart - clip.start : clip.nextDuration - clip.duration).toFixed(3))}
          className="absolute bottom-1 top-1 rounded border border-accent2-800/80 bg-accent2-700/20 shadow-[inset_0_0_0_1px_rgba(167,139,250,0.45)]"
          style={{
            left: (clip.nextStart - start) * pixelsPerSecond,
            width: Math.max(20, clip.nextDuration * pixelsPerSecond),
          }}
          title={clip.label}
        />
      ))}
    </div>
  );
}

function TimelineNeighborImpactPreviewOverlay({
  preview,
  trackId,
  pixelsPerSecond,
  trackHeight,
}: {
  preview: TimelineNeighborImpactPreview;
  trackId: string;
  pixelsPerSecond: number;
  trackHeight: number;
}) {
  const clips = preview.clips.filter((clip) => clip.trackId === trackId);
  if (clips.length === 0) {
    return null;
  }

  const insetY = Math.max(4, Math.min(8, Math.round(trackHeight * 0.12)));
  const height = Math.max(34, trackHeight - (insetY * 2));
  const start = Math.min(...clips.map((clip) => Math.min(clip.start, clip.nextStart)));
  const end = Math.max(...clips.map((clip) => Math.max(clip.start + clip.duration, clip.nextStart + clip.nextDuration)));
  const label = preview.operation === 'roll'
    ? `Roll ${preview.edge ?? ''}`.trim()
    : 'Slide';

  return (
    <div
      data-testid={`timeline-neighbor-impact-preview-${trackId}`}
      data-preview-operation={preview.operation}
      data-preview-edge={preview.edge ?? ''}
      data-preview-delta={preview.delta}
      data-preview-affected-count={preview.affectedCount}
      data-preview-start={start}
      data-preview-end={Number(end.toFixed(3))}
      className="pointer-events-none absolute z-[27]"
      style={{
        top: insetY,
        height,
        left: start * pixelsPerSecond,
        width: Math.max(2, (end - start) * pixelsPerSecond),
      }}
    >
      <span className="absolute inset-0 rounded-md border border-dashed border-warn-800/70 bg-warn-700/5" />
      <span className="absolute left-1 top-1 z-10 rounded bg-warn-800 px-1.5 py-0.5 text-micro font-semibold uppercase text-paper shadow">
        {label} {preview.affectedCount}
      </span>
      {clips.map((clip) => (
        <span
          key={clip.id}
          data-testid={`timeline-neighbor-impact-preview-clip-${clip.id}`}
          data-preview-clip-id={clip.id}
          data-preview-role={clip.role}
          data-preview-start={clip.start}
          data-preview-next-start={clip.nextStart}
          data-preview-duration={clip.duration}
          data-preview-next-duration={clip.nextDuration}
          data-preview-source-in={clip.sourceIn}
          data-preview-next-source-in={clip.nextSourceIn}
          data-preview-start-delta={Number((clip.nextStart - clip.start).toFixed(3))}
          data-preview-duration-delta={Number((clip.nextDuration - clip.duration).toFixed(3))}
          data-preview-source-delta={Number((clip.nextSourceIn - clip.sourceIn).toFixed(3))}
          className={`absolute bottom-1 top-1 rounded border shadow-[inset_0_0_0_1px_rgba(251,146,60,0.45)] ${
            clip.role === 'anchor'
              ? 'border-warn-900/90 bg-warn-700/25'
              : 'border-warn-800/70 bg-warn-700/15'
          }`}
          style={{
            left: (clip.nextStart - start) * pixelsPerSecond,
            width: Math.max(20, clip.nextDuration * pixelsPerSecond),
          }}
          title={clip.label}
        />
      ))}
    </div>
  );
}

function TimelineRippleTrimPreviewOverlay({
  preview,
  trackId,
  pixelsPerSecond,
  trackHeight,
}: {
  preview: TimelineRippleTrimPreview;
  trackId: string;
  pixelsPerSecond: number;
  trackHeight: number;
}) {
  const clips = preview.clips.filter((clip) => clip.trackId === trackId);
  if (clips.length === 0) {
    return null;
  }

  const insetY = Math.max(4, Math.min(8, Math.round(trackHeight * 0.12)));
  const height = Math.max(34, trackHeight - (insetY * 2));
  const start = Math.min(...clips.map((clip) => Math.min(clip.start, clip.nextStart)));
  const end = Math.max(...clips.map((clip) => Math.max(clip.start, clip.nextStart) + clip.duration));

  return (
    <div
      data-testid={`timeline-ripple-trim-preview-${trackId}`}
      data-ripple-operation={preview.operation}
      data-ripple-edge={preview.edge}
      data-ripple-delta={preview.delta}
      data-ripple-affected-count={preview.affectedCount}
      data-ripple-start={start}
      data-ripple-end={Number(end.toFixed(3))}
      className="pointer-events-none absolute z-[24]"
      style={{
        top: insetY,
        height,
        left: start * pixelsPerSecond,
        width: Math.max(2, (end - start) * pixelsPerSecond),
      }}
    >
      <span className="absolute inset-0 rounded-md border border-dashed border-accent-800/70 bg-accent-700/5" />
      <span className="absolute left-1 top-1 z-10 rounded bg-accent-800 px-1.5 py-0.5 text-micro font-semibold uppercase text-paper shadow">
        Ripple {preview.affectedCount}
      </span>
      {clips.map((clip) => (
        <span
          key={clip.id}
          data-testid={`timeline-ripple-trim-preview-clip-${clip.id}`}
          data-ripple-clip-id={clip.id}
          data-ripple-start={clip.start}
          data-ripple-next-start={clip.nextStart}
          data-ripple-duration={clip.duration}
          data-ripple-delta={Number((clip.nextStart - clip.start).toFixed(3))}
          className="absolute bottom-1 top-1 rounded border border-accent-800/80 bg-accent-700/20 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.45)]"
          style={{
            left: (clip.nextStart - start) * pixelsPerSecond,
            width: Math.max(20, clip.duration * pixelsPerSecond),
          }}
          title={clip.label}
        />
      ))}
    </div>
  );
}

function TimelineTrackDropPreview({
  preview,
  pixelsPerSecond,
  trackHeight,
  validLabel,
  invalidLabel,
  validTone,
}: {
  preview: TimelineClipDropPreview | TimelineAssetDropPreview;
  pixelsPerSecond: number;
  trackHeight: number;
  validLabel: string;
  invalidLabel: string;
  validTone: 'clip' | 'asset';
}) {
  const insetY = Math.max(4, Math.min(8, Math.round(trackHeight * 0.12)));
  const height = Math.max(34, trackHeight - (insetY * 2));
  const previewWidth = Math.max(preview.duration * pixelsPerSecond, 58);
  const stateLabel = preview.valid ? validLabel : `${invalidLabel}: choose another track or time`;
  const impact = resolveTimelineDropPreviewImpact(preview, validTone);
  const impactGhost = resolveTimelineDropImpactGhost(preview, impact);
  const validClassName = validTone === 'asset'
    ? 'border-info-700 bg-info-500/20 text-info-900 ring-2 ring-info-700/40'
    : 'border-accent-700 bg-accent-600/20 text-accent-900 ring-2 ring-accent-700/40';

  return (
    <>
      {impactGhost ? (
        <div
          data-testid={`timeline-drop-preview-impact-${validTone}-${preview.trackId}`}
          data-impact-reason={impactGhost.reason}
          data-impact-start={impactGhost.start}
          data-impact-end={Number((impactGhost.start + impactGhost.duration).toFixed(3))}
          className={`pointer-events-none absolute z-20 overflow-hidden rounded-md border border-dashed px-2 py-1 text-micro font-semibold uppercase shadow-inner ${impactGhost.className}`}
          style={{
            top: insetY + 4,
            height: Math.max(22, height - 8),
            left: impactGhost.start * pixelsPerSecond,
            width: Math.max(impactGhost.duration * pixelsPerSecond, 16),
          }}
        >
          <span className="block truncate">{impactGhost.label}</span>
        </div>
      ) : null}
      <div
        data-testid={`timeline-drop-preview-${validTone}-${preview.trackId}`}
        data-drop-valid={preview.valid ? 'true' : 'false'}
        data-drop-start={preview.start}
        data-drop-end={Number((preview.start + preview.duration).toFixed(3))}
        data-drop-duration={preview.duration}
        data-drop-label={preview.label}
        data-drop-state={preview.valid ? 'ready' : 'blocked'}
        data-drop-tone={validTone}
        data-drop-mode={'mode' in preview ? preview.mode : ''}
        data-drop-operation={impact.operation}
        data-drop-impact={impact.value}
        data-drop-collision={preview.collision === true || !preview.valid ? 'true' : 'false'}
        data-drop-snapped={preview.snapped === true ? 'true' : 'false'}
        data-drop-constrained={preview.constrained === true ? 'true' : 'false'}
        data-drop-ripple={preview.ripple === true ? 'true' : 'false'}
        data-drop-ghost={impactGhost ? 'true' : 'false'}
        data-drop-ghost-reason={impactGhost?.reason ?? 'none'}
        className={`pointer-events-none absolute z-30 overflow-hidden rounded-md border px-3 py-2 text-left text-xs font-semibold shadow-lg ${
          preview.valid ? validClassName : 'border-danger-700 bg-danger-500/20 text-danger-900 ring-2 ring-danger-700/50'
        }`}
        style={{
          top: insetY,
          height,
          left: preview.start * pixelsPerSecond,
          width: previewWidth,
        }}
      >
        <span
          data-testid={`timeline-drop-preview-start-${validTone}-${preview.trackId}`}
          className="absolute bottom-0 left-0 top-0 w-1 bg-white/80"
        />
        <span
          data-testid={`timeline-drop-preview-end-${validTone}-${preview.trackId}`}
          className="absolute bottom-0 right-0 top-0 w-1 bg-white/50"
        />
        {preview.snapped ? (
          <span
            data-testid={`timeline-drop-preview-snap-line-${validTone}-${preview.trackId}`}
            data-snap-time={preview.start}
            className="absolute bottom-0 left-0 top-0 z-10 w-1.5 bg-warn-800 shadow-[0_0_12px_rgba(251,191,36,0.95)]"
          />
        ) : null}
        {!preview.valid || preview.collision || preview.constrained ? (
          <span
            data-testid={`timeline-drop-preview-blocked-zone-${validTone}-${preview.trackId}`}
            data-blocked-reason={!preview.valid || preview.collision ? 'collision' : 'limit'}
            className="absolute inset-x-1 bottom-1 z-10 rounded border border-danger-800/80 bg-danger-500/25 px-1.5 py-0.5 text-micro font-semibold uppercase text-danger-900 shadow"
          >
            {!preview.valid || preview.collision ? 'Blocked overlap' : 'Limit'}
          </span>
        ) : null}
        <span className="flex min-w-0 items-center gap-1 pr-1">
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-micro uppercase ${impact.className}`}>
            {impact.label}
          </span>
          {preview.ripple ? (
            <span className="shrink-0 rounded bg-accent-700 px-1.5 py-0.5 text-micro uppercase text-paper">Ripple</span>
          ) : null}
          {preview.snapped ? (
            <span className="shrink-0 rounded bg-warn-700 px-1.5 py-0.5 text-micro uppercase text-paper">Snap</span>
          ) : null}
          <span className="min-w-0 truncate">{preview.label}</span>
        </span>
        <span className="mt-1 block text-meta font-normal opacity-80">
          {stateLabel}
        </span>
        <span className="absolute bottom-1 right-2 rounded on-dark bg-black/35 px-1.5 py-0.5 tabular-nums text-micro text-white/80">
          {formatRulerTime(preview.start)}-{formatRulerTime(preview.start + preview.duration)}
        </span>
      </div>
    </>
  );
}

function resolveTimelineDropPreviewImpact(
  preview: TimelineClipDropPreview | TimelineAssetDropPreview,
  validTone: 'clip' | 'asset',
): { value: string; label: string; operation: string; className: string } {
  if (!preview.valid || preview.collision) {
    return {
      value: 'collision',
      label: 'Collision',
      operation: preview.operation ?? validTone,
      className: 'bg-danger-700 text-paper',
    };
  }

  if (preview.constrained) {
    return {
      value: 'limit',
      label: 'Limit',
      operation: preview.operation ?? validTone,
      className: 'bg-danger-700 text-paper',
    };
  }

  if (preview.snapped) {
    return {
      value: 'snap',
      label: 'Snap',
      operation: preview.operation ?? validTone,
      className: 'bg-warn-700 text-paper',
    };
  }

  if ('mode' in preview) {
    return {
      value: preview.mode,
      label: preview.mode,
      operation: preview.operation ?? 'asset-drop',
      className: preview.mode === 'insert' ? 'bg-accent-700 text-paper' : 'bg-warn-700 text-paper',
    };
  }

  if (preview.isNewTrack) {
    return {
      value: 'new-track',
      label: 'New',
      operation: preview.operation ?? 'new-track',
      className: 'bg-info-700 text-paper',
    };
  }

  return {
    value: validTone,
    label: validTone === 'asset' ? 'Asset' : 'Move',
    operation: preview.operation ?? validTone,
    className: validTone === 'asset' ? 'bg-info-700 text-paper' : 'bg-accent-700 text-paper',
  };
}

function resolveTimelineDropImpactGhost(
  preview: TimelineClipDropPreview | TimelineAssetDropPreview,
  impact: { value: string },
): { reason: 'ripple' | 'collision' | 'limit' | 'snap'; label: string; start: number; duration: number; className: string } | null {
  if (preview.ripple) {
    return {
      reason: 'ripple',
      label: 'Ripple range',
      start: preview.start + preview.duration,
      duration: Math.max(0.5, Math.min(preview.duration, 3)),
      className: 'border-accent-700/70 bg-accent-700/10 text-accent-900',
    };
  }

  if (!preview.valid || preview.collision) {
    return {
      reason: 'collision',
      label: 'Collision range',
      start: preview.start,
      duration: Math.max(preview.duration, 0.5),
      className: 'border-danger-700/80 bg-danger-500/10 text-danger-900',
    };
  }

  if (preview.constrained || impact.value === 'limit') {
    return {
      reason: 'limit',
      label: 'Limit range',
      start: preview.start,
      duration: Math.max(preview.duration, 0.5),
      className: 'border-danger-700/80 bg-danger-500/10 text-danger-900',
    };
  }

  if (preview.snapped) {
    return {
      reason: 'snap',
      label: 'Snap point',
      start: preview.start,
      duration: 0.5,
      className: 'border-warn-700/80 bg-warn-700/10 text-warn-900',
    };
  }

  return null;
}

function TimelineEditGuideCallout({
  guide,
  fps,
}: {
  guide: TimelineEditGuide;
  fps: number;
}) {
  const metadata = formatTimelineEditGuideMetadata(guide);

  return (
    <span
      data-testid={`timeline-edit-guide-callout-${guide.trackId}`}
      data-guide-callout-operation={guide.operation ?? ''}
      data-guide-callout-delta={guide.delta ?? ''}
      data-guide-callout-duration={guide.duration ?? ''}
      data-guide-callout-group-count={guide.groupCount ?? ''}
      className={`absolute left-1 top-1 min-w-32 rounded px-1.5 py-1 text-micro font-semibold shadow ${timelineEditGuideLabelClassName(guide.tone)}`}
    >
      <span className="block uppercase tracking-wide">{guide.label}</span>
      <span className="block text-micro tabular-nums">{formatTimecode(guide.time, fps)}</span>
      {metadata ? (
        <span className="mt-0.5 block max-w-40 truncate text-micro font-medium normal-case tracking-normal opacity-85">
          {metadata}
        </span>
      ) : null}
    </span>
  );
}

function formatTimelineEditGuideMetadata(guide: TimelineEditGuide): string {
  const parts: string[] = [];

  if (guide.operation) {
    parts.push(guide.operation);
  }

  if (guide.delta !== undefined) {
    parts.push(formatSignedEditDelta(guide.delta));
  }

  if (guide.duration !== undefined) {
    parts.push(formatRulerTime(guide.duration));
  }

  if (guide.groupCount !== undefined && guide.groupCount > 1) {
    parts.push(`${guide.groupCount} clips`);
  }

  if (guide.ripple) {
    parts.push('ripple');
  }

  return parts.join(' / ');
}

function timelineEditGuideToneClassName(tone: TimelineEditGuide['tone']): string {
  switch (tone) {
    case 'snap':
      return 'bg-warn-700';
    case 'limit':
      return 'bg-danger-700';
    case 'drop':
      return 'bg-info-700';
    case 'move':
    default:
      return 'bg-info-700';
  }
}

function timelineEditGuideLabelClassName(tone: TimelineEditGuide['tone']): string {
  switch (tone) {
    case 'snap':
      return 'bg-warn-700 text-paper';
    case 'limit':
      return 'bg-danger-700 text-paper';
    case 'drop':
      return 'bg-info-700 text-paper';
    case 'move':
    default:
      return 'bg-info-700 text-paper';
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
