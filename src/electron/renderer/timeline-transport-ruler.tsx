import { useMemo, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject, type WheelEvent } from 'react';
import { formatRulerTime, formatTimecode } from './editor-time-helpers';
import type { TimelineMarker } from '../../lib/editor/types';
import { TIMELINE_TRACK_HEADER_WIDTH } from './timeline-layout-constants';
import { useMenuLanguage } from './use-menu-language';

const timelineText = {
  en: {
    undo: 'Undo',
    redo: 'Redo',
    split: 'Split',
    splitAtPlayhead: 'Split at playhead',
    qTrim: 'Q Trim',
    qTrimTitle: 'Ripple trim head to playhead (Q)',
    wTrim: 'W Trim',
    wTrimTitle: 'Ripple trim tail to playhead (W)',
    delete: 'Del',
    deleteTitle: 'Delete timeline target',
    rippleDelete: 'Ripple Del',
    rippleDeleteTitle: 'Ripple delete timeline target',
    select: 'Select',
    selectRight: 'Select clips right',
    selectLeft: 'Select clips left',
    previousEdit: 'Previous edit point',
    nextEdit: 'Next edit point',
    edit: 'Edit',
    splitAll: 'Split all at playhead',
    trimHead: 'Ripple trim head',
    trimTail: 'Ripple trim tail',
    duplicate: 'Duplicate',
    groupClips: 'Group clips',
    ungroupClips: 'Ungroup clips',
    marks: 'Marks',
    setInPoint: 'Set In point',
    setOutPoint: 'Set Out point',
    markSelectedClips: 'Mark selected clips',
    selectMarkedRange: 'Select marked range',
    addMarker: 'Add marker',
    clearInOut: 'Clear In/Out',
    more: 'More',
    commandPalette: 'Command palette',
    titleText: 'Title text',
    newTitleText: 'New title text',
    addTitle: 'Add title',
    addAdjustment: 'Add adjustment',
    addVideoTrack: 'Add video track',
    addAudioTrack: 'Add audio track',
    captions: 'Captions',
    saveProject: 'Save project',
    loadProject: 'Load project',
    ripple: 'Ripple',
    snap: 'Snap',
    loop: 'Loop',
    editMode: 'Timeline edit mode',
    insert: 'Insert',
    overwrite: 'Overwrite',
    reverseShuttle: 'Reverse shuttle (J)',
    stopShuttle: 'Stop shuttle (K)',
    forwardShuttle: 'Forward shuttle (L)',
    play: 'Play',
    pause: 'Pause',
    timelinePlayhead: 'Timeline playhead',
    clear: 'Clear',
    zoom: 'Zoom',
    timelineZoom: 'Timeline zoom',
    thumbs: 'Thumbs',
    wave: 'Wave',
    height: 'Height',
    timelineTrackHeight: 'Timeline track height',
    fit: 'Fit',
    fitTitle: 'Fit the whole timeline in view',
    fitSelection: 'Fit Sel',
    fitSelectionTitle: 'Fit the selection in view',
    gap: 'Gap',
    gapSeconds: 'Gap seconds',
    insertGap: 'Insert Gap',
    aiFill: 'AI Fill',
    timelineRulerScrubber: 'Timeline ruler scrubber',
    inMarker: 'In',
    outMarker: 'Out',
  },
  ko: {
    undo: '실행 취소',
    redo: '다시 실행',
    split: '자르기',
    splitAtPlayhead: '재생헤드에서 자르기',
    qTrim: 'Q 앞 트림',
    qTrimTitle: '재생헤드까지 앞부분 리플 트림 (Q)',
    wTrim: 'W 뒤 트림',
    wTrimTitle: '재생헤드까지 뒤부분 리플 트림 (W)',
    delete: '삭제',
    deleteTitle: '타임라인 대상 삭제',
    rippleDelete: '리플 삭제',
    rippleDeleteTitle: '타임라인 대상 리플 삭제',
    select: '선택',
    selectRight: '오른쪽 클립 선택',
    selectLeft: '왼쪽 클립 선택',
    previousEdit: '이전 컷 지점',
    nextEdit: '다음 컷 지점',
    edit: '편집',
    splitAll: '모든 트랙 재생헤드 자르기',
    trimHead: '앞부분 리플 트림',
    trimTail: '뒤부분 리플 트림',
    duplicate: '복제',
    groupClips: '클립 그룹',
    ungroupClips: '그룹 해제',
    marks: '마크',
    setInPoint: '인 지점 설정',
    setOutPoint: '아웃 지점 설정',
    markSelectedClips: '선택 클립 마크',
    selectMarkedRange: '마크 범위 선택',
    addMarker: '마커 추가',
    clearInOut: '인/아웃 해제',
    more: '더보기',
    commandPalette: '명령 팔레트',
    titleText: '타이틀 텍스트',
    newTitleText: '새 타이틀 텍스트',
    addTitle: '타이틀 추가',
    addAdjustment: '조정 레이어 추가',
    addVideoTrack: '비디오 트랙 추가',
    addAudioTrack: '오디오 트랙 추가',
    captions: '자막',
    saveProject: '프로젝트 저장',
    loadProject: '프로젝트 불러오기',
    ripple: '리플',
    snap: '스냅',
    loop: '반복',
    editMode: '타임라인 편집 모드',
    insert: '삽입',
    overwrite: '덮어쓰기',
    reverseShuttle: '역방향 셔틀 (J)',
    stopShuttle: '정지 셔틀 (K)',
    forwardShuttle: '정방향 셔틀 (L)',
    play: '재생',
    pause: '일시정지',
    timelinePlayhead: '타임라인 재생헤드',
    clear: '해제',
    zoom: '확대',
    timelineZoom: '타임라인 확대',
    thumbs: '썸네일',
    wave: '파형',
    height: '높이',
    timelineTrackHeight: '타임라인 트랙 높이',
    fit: '전체 맞춤',
    fitTitle: '타임라인 전체를 화면에 맞춤',
    fitSelection: '선택 맞춤',
    fitSelectionTitle: '선택 범위를 화면에 맞춤',
    gap: '간격',
    gapSeconds: '간격 초',
    insertGap: '간격 삽입',
    aiFill: 'AI 채우기',
    timelineRulerScrubber: '타임라인 룰러 스크러버',
    inMarker: '인',
    outMarker: '아웃',
  },
} as const;

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
  rippleMode,
  snapEnabled,
  editMode,
  showWaveforms,
  showThumbnails,
  trackHeight,
  gapInsertDuration,
  visualGapCount,
  markers,
  markerTimePreview,
  canUndo,
  canRedo,
  canSplitAtPlayhead,
  canTrimAtPlayhead,
  canDeleteTimelineTarget,
  selectedClipCount,
  children,
  onUndo,
  onRedo,
  onOpenCommandPalette,
  onSplit,
  onSplitAll,
  onTrimIn,
  onTrimOut,
  onDeleteSelection,
  onRippleDeleteSelection,
  onDuplicateSelection,
  onGroupSelection,
  onUngroupSelection,
  onPreviousEdit,
  onNextEdit,
  onRippleModeChange,
  onSnapEnabledChange,
  onToggleLoopPlayback,
  onEditModeChange,
  onTitleTextChange,
  onAddTitle,
  onAddAdjustmentLayer,
  onAddVideoTrack,
  onAddAudioTrack,
  onGenerateCaptions,
  onSaveProject,
  onLoadProject,
  onTogglePlayback,
  onShuttlePlayback,
  onNudgePlayhead,
  onPlayheadChange,
  onSelectLeft,
  onSelectRight,
  onSetInMark,
  onSetOutMark,
  onMarkSelection,
  onSelectMarkedRange,
  onAddMarkerAtPlayhead,
  onClearMarks,
  onPixelsPerSecondChange,
  onShowWaveformsChange,
  onShowThumbnailsChange,
  onTrackHeightChange,
  onFitTimelineZoom,
  onGapInsertDurationChange,
  onInsertGap,
  onFillAiBrollGaps,
  onRulerPointerDown,
  onMarkerPointerDown,
  onWheelZoom,
  onViewportChange,
  stickyControls = true,
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
  rippleMode: boolean;
  snapEnabled: boolean;
  editMode: 'insert' | 'overwrite';
  showWaveforms: boolean;
  showThumbnails: boolean;
  trackHeight: number;
  gapInsertDuration: number;
  visualGapCount: number;
  markers: TimelineMarker[];
  markerTimePreview: { id: string; time: number } | null;
  canUndo: boolean;
  canRedo: boolean;
  canSplitAtPlayhead: boolean;
  canTrimAtPlayhead: boolean;
  canDeleteTimelineTarget: boolean;
  selectedClipCount: number;
  children: ReactNode;
  onUndo: () => void;
  onRedo: () => void;
  onOpenCommandPalette: () => void;
  onSplit: () => void;
  onSplitAll: () => void;
  onTrimIn: () => void;
  onTrimOut: () => void;
  onDeleteSelection: () => void;
  onRippleDeleteSelection: () => void;
  onDuplicateSelection: () => void;
  onGroupSelection: () => void;
  onUngroupSelection: () => void;
  onPreviousEdit: () => void;
  onNextEdit: () => void;
  onRippleModeChange: () => void;
  onSnapEnabledChange: () => void;
  onToggleLoopPlayback: () => void;
  onEditModeChange: (mode: 'insert' | 'overwrite') => void;
  onTitleTextChange: (value: string) => void;
  onAddTitle: () => void;
  onAddAdjustmentLayer: () => void;
  onAddVideoTrack: () => void;
  onAddAudioTrack: () => void;
  onGenerateCaptions: () => void;
  onSaveProject: () => void | Promise<void>;
  onLoadProject: () => void | Promise<void>;
  onTogglePlayback: () => void;
  onShuttlePlayback: (direction: 'reverse' | 'stop' | 'forward') => void;
  onNudgePlayhead: (deltaSeconds: number) => void;
  onPlayheadChange: (time: number) => void;
  onSelectLeft: () => void;
  onSelectRight: () => void;
  onSetInMark: () => void;
  onSetOutMark: () => void;
  onMarkSelection: () => void;
  onSelectMarkedRange: () => void;
  onAddMarkerAtPlayhead: () => void;
  onClearMarks: () => void;
  onPixelsPerSecondChange: (pixelsPerSecond: number) => void;
  onShowWaveformsChange: (show: boolean) => void;
  onShowThumbnailsChange: (show: boolean) => void;
  onTrackHeightChange: (height: number) => void;
  onFitTimelineZoom: (mode: 'timeline' | 'selection') => void;
  onGapInsertDurationChange: (duration: number) => void;
  onInsertGap: () => void;
  onFillAiBrollGaps: () => void;
  onRulerPointerDown: (event: MouseEvent<HTMLDivElement>) => void;
  onMarkerPointerDown: (event: ReactPointerEvent<HTMLSpanElement>, marker: TimelineMarker) => void;
  onWheelZoom: (event: WheelEvent<HTMLDivElement>) => void;
  onViewportChange?: (viewport: { scrollLeft: number; viewportWidth: number }) => void;
  stickyControls?: boolean;
}) {
  const rulerTicks = useMemo(() => buildRulerTicks(duration, pixelsPerSecond), [duration, pixelsPerSecond]);
  const timelineContentWidth = TIMELINE_TRACK_HEADER_WIDTH + timelineWidth;
  const hasSelection = selectedClipCount > 0;
  const hasInMark = markIn !== null;
  const hasOutMark = markOut !== null;
  const hasMarkedRange = markedRange !== null;
  const language = useMenuLanguage();
  const text = timelineText[language];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        data-testid="timeline-sticky-controls"
        data-sticky={stickyControls ? 'true' : 'false'}
        className={`${stickyControls ? 'sticky top-0 z-50' : 'relative'} bg-paper pb-2`}
      >
      <div
        data-testid="timeline-local-toolbar"
        className="mb-1 flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-ds-200 pb-1.5"
      >
        <div className="flex min-w-0 items-center gap-1">
          <TimelineToolbarButton testId="timeline-toolbar-undo" label={text.undo} onClick={onUndo} disabled={!canUndo}>{text.undo}</TimelineToolbarButton>
          <TimelineToolbarButton testId="timeline-toolbar-redo" label={text.redo} onClick={onRedo} disabled={!canRedo}>{text.redo}</TimelineToolbarButton>
          <TimelineToolbarDivider />
          <TimelineToolbarButton testId="timeline-toolbar-cut" label={text.splitAtPlayhead} onClick={onSplit} disabled={!canSplitAtPlayhead}>{text.split}</TimelineToolbarButton>
          <TimelineToolbarButton testId="timeline-toolbar-trim-in" label={text.qTrimTitle} onClick={onTrimIn} disabled={!canTrimAtPlayhead}>{text.qTrim}</TimelineToolbarButton>
          <TimelineToolbarButton testId="timeline-toolbar-trim-out" label={text.wTrimTitle} onClick={onTrimOut} disabled={!canTrimAtPlayhead}>{text.wTrim}</TimelineToolbarButton>
          <TimelineToolbarButton testId="timeline-toolbar-delete" label={text.deleteTitle} onClick={onDeleteSelection} disabled={!canDeleteTimelineTarget}>{text.delete}</TimelineToolbarButton>
          <TimelineToolbarButton testId="timeline-toolbar-ripple-delete" label={text.rippleDeleteTitle} onClick={onRippleDeleteSelection} disabled={!canDeleteTimelineTarget}>{text.rippleDelete}</TimelineToolbarButton>
          <TimelineMenu label={text.select}>
            <TimelineMenuButton onClick={onSelectRight}>{text.selectRight}</TimelineMenuButton>
            <TimelineMenuButton onClick={onSelectLeft}>{text.selectLeft}</TimelineMenuButton>
            <TimelineMenuButton onClick={onPreviousEdit}>{text.previousEdit}</TimelineMenuButton>
            <TimelineMenuButton onClick={onNextEdit}>{text.nextEdit}</TimelineMenuButton>
          </TimelineMenu>
          {/* The Edit menu holds what the button row does NOT. Split, Trim
              head/tail and Ripple delete each sat in both places, so the same
              command appeared twice within one toolbar — they stay on the row,
              which is the faster target, and are gone from here. */}
          <TimelineMenu label={text.edit}>
            <TimelineMenuButton onClick={onSplitAll}>{text.splitAll}</TimelineMenuButton>
            <TimelineMenuButton disabled={!hasSelection} onClick={onDuplicateSelection}>{text.duplicate}</TimelineMenuButton>
            <TimelineMenuButton disabled={selectedClipCount < 2} onClick={onGroupSelection}>{text.groupClips}</TimelineMenuButton>
            <TimelineMenuButton disabled={!hasSelection} onClick={onUngroupSelection}>{text.ungroupClips}</TimelineMenuButton>
          </TimelineMenu>
          <TimelineMenu label={text.marks}>
            <TimelineMenuButton onClick={onSetInMark}>{text.setInPoint}</TimelineMenuButton>
            <TimelineMenuButton onClick={onSetOutMark}>{text.setOutPoint}</TimelineMenuButton>
            <TimelineMenuButton disabled={!hasSelection} onClick={onMarkSelection}>{text.markSelectedClips}</TimelineMenuButton>
            <TimelineMenuButton disabled={!hasMarkedRange} onClick={onSelectMarkedRange}>{text.selectMarkedRange}</TimelineMenuButton>
            <TimelineMenuButton onClick={onAddMarkerAtPlayhead}>{text.addMarker}</TimelineMenuButton>
            <TimelineMenuButton disabled={!hasInMark && !hasOutMark} onClick={onClearMarks}>{text.clearInOut}</TimelineMenuButton>
          </TimelineMenu>
          <TimelineMenu label={text.more}>
            <TimelineMenuButton onClick={onOpenCommandPalette}>{text.commandPalette}</TimelineMenuButton>
            <label className="block px-2 pt-1 text-meta uppercase tracking-wide text-ds-600">
              {text.titleText}
              <input
                value={titleText}
                onChange={(event) => onTitleTextChange(event.target.value)}
                className="mt-1 w-full rounded border border-ds-200 bg-paper px-2 py-1.5 text-xs text-ds-800 outline-none focus:border-accent-500"
                aria-label={text.newTitleText}
              />
            </label>
            <TimelineMenuButton onClick={onAddTitle}>{text.addTitle}</TimelineMenuButton>
            <TimelineMenuButton tone="violet" onClick={onAddAdjustmentLayer}>{text.addAdjustment}</TimelineMenuButton>
            <TimelineMenuButton onClick={onAddVideoTrack}>{text.addVideoTrack}</TimelineMenuButton>
            <TimelineMenuButton onClick={onAddAudioTrack}>{text.addAudioTrack}</TimelineMenuButton>
            <TimelineMenuButton onClick={onGenerateCaptions}>{text.captions}</TimelineMenuButton>
            <TimelineMenuButton onClick={() => void onSaveProject()}>{text.saveProject}</TimelineMenuButton>
            <TimelineMenuButton onClick={() => void onLoadProject()}>{text.loadProject}</TimelineMenuButton>
          </TimelineMenu>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span
            data-testid="timeline-playhead-readout"
            data-playhead-value={Number(playhead.toFixed(3))}
            // The transport figure is the largest type in the chrome — the
            // prototype sets it at 17px in the serif, not in a mono face.
            className="font-heading text-tc tabular-nums text-ink"
          >
            {formatTimecode(playhead, fps)}
          </span>
          <span
            data-testid="timeline-duration-readout"
            className="text-xs tabular-nums text-ds-700"
          >
            / {formatTimecode(duration, fps)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <TimelineToggleButton
            testId="timeline-ripple-toggle"
            label={text.ripple}
            active={rippleMode}
            onClick={onRippleModeChange}
          />
          <TimelineToggleButton
            testId="timeline-snap-toggle"
            label={text.snap}
            active={snapEnabled}
            onClick={onSnapEnabledChange}
          />
          <TimelineToggleButton
            testId="timeline-loop-toggle"
            label={text.loop}
            active={loopPlaybackEnabled}
            onClick={onToggleLoopPlayback}
          />
          <select
            aria-label={text.editMode}
            data-testid="timeline-edit-mode-select"
            value={editMode}
            onChange={(event) => onEditModeChange(event.currentTarget.value as 'insert' | 'overwrite')}
            className="h-8 rounded border border-ds-200 bg-paper px-2 text-meta text-ds-800 outline-none hover:border-accent-500"
          >
            <option value="insert">{text.insert}</option>
            <option value="overwrite">{text.overwrite}</option>
          </select>
        </div>
      </div>
      <div className="mb-2 grid grid-cols-1 items-center gap-2 border-b border-surface pb-2 ed:grid-cols-[auto_minmax(220px,1fr)_auto]">
        <div className="flex min-w-0 items-center gap-2">
          <button className="rounded border border-ds-200 bg-paper px-2 py-1 text-meta text-ds-700 hover:border-accent-500" title={text.reverseShuttle} onClick={() => onShuttlePlayback('reverse')}>J</button>
          <button className="rounded border border-ds-200 bg-paper px-2 py-1 text-meta text-ds-700 hover:border-accent-500" title={text.stopShuttle} onClick={() => onShuttlePlayback('stop')}>K</button>
          <button className="rounded border border-ds-200 bg-paper px-2 py-1 text-meta text-ds-700 hover:border-accent-500" title={text.forwardShuttle} onClick={() => onShuttlePlayback('forward')}>L</button>
          <button
            className="rounded-full border border-ds-300 bg-surface px-3 py-1 text-xs font-semibold text-ink hover:border-accent-500"
            onClick={onTogglePlayback}
          >
            {playbackRate === 0 ? text.play : `${text.pause} ${formatPlaybackRate(playbackRate)}`}
          </button>
          <button className="rounded border border-ds-200 bg-paper px-2 py-1 text-meta text-ds-700 hover:border-accent-500" onClick={() => onNudgePlayhead(-1 / fps)}>-1f</button>
          <button className="rounded border border-ds-200 bg-paper px-2 py-1 text-meta text-ds-700 hover:border-accent-500" onClick={() => onNudgePlayhead(1 / fps)}>+1f</button>
          <span className="w-24 text-right text-xs tabular-nums text-info-700">{formatTimecode(playhead, fps)}</span>
        </div>
        <input
          type="range"
          aria-label={text.timelinePlayhead}
          data-testid="timeline-playhead-slider"
          data-playhead-value={Number(playhead.toFixed(3))}
          min={0}
          max={duration}
          step={0.1}
          value={Math.min(playhead, duration)}
          onChange={(event) => onPlayheadChange(Number(event.target.value))}
          className="min-w-0 flex-1"
        />
        <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 ed:justify-end">
          <div className="flex items-center gap-2 rounded border border-ds-200 bg-paper px-2 py-1 text-meta text-ds-700">
            <span className="tabular-nums">I {markIn === null ? '--:--' : formatTimecode(markIn, fps)}</span>
            <span className="tabular-nums">O {markOut === null ? '--:--' : formatTimecode(markOut, fps)}</span>
            {loopPlaybackEnabled && markedRange ? (
              <span className="text-accent-700">{text.loop} {formatTimecode(markedRange.end - markedRange.start, fps)}</span>
            ) : null}
            <button type="button" className="text-ds-600 hover:text-ds-800" onClick={onClearMarks}>{text.clear}</button>
          </div>
          <label className="flex items-center gap-2 text-xs text-ds-700">
            {text.zoom}
            <input
              type="range"
              aria-label={text.timelineZoom}
              data-testid="timeline-zoom-slider"
              data-pixels-per-second={pixelsPerSecond}
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
            data-testid="timeline-toggle-thumbnails"
            aria-pressed={showThumbnails}
            className={`rounded border px-2 py-1 text-xs ${
              showThumbnails
                ? 'border-info-500/50 bg-info-500/10 text-info-900'
                : 'border-ds-200 bg-paper text-ds-700 hover:border-ds-400'
            }`}
            onClick={() => onShowThumbnailsChange(!showThumbnails)}
          >
            {text.thumbs}
          </button>
          <button
            type="button"
            data-testid="timeline-toggle-waveforms"
            aria-pressed={showWaveforms}
            className={`rounded border px-2 py-1 text-xs ${
              showWaveforms
                ? 'border-accent-500/50 bg-accent-500/10 text-accent-900'
                : 'border-ds-200 bg-paper text-ds-700 hover:border-ds-400'
            }`}
            onClick={() => onShowWaveformsChange(!showWaveforms)}
          >
            {text.wave}
          </button>
          <label className="flex items-center gap-2 text-xs text-ds-700">
            {text.height}
            <input
              type="range"
              aria-label={text.timelineTrackHeight}
              data-testid="timeline-track-height-slider"
              min={56}
              max={128}
              step={8}
              value={trackHeight}
              onChange={(event) => onTrackHeightChange(Number(event.target.value))}
              className="w-24"
            />
          </label>
          <button
            type="button"
            title={text.fitTitle}
            className="rounded border border-ds-200 bg-paper px-2 py-1 text-xs text-ds-800 hover:border-accent-500"
            onClick={() => onFitTimelineZoom('timeline')}
          >
            {text.fit}
          </button>
          <button
            type="button"
            title={text.fitSelectionTitle}
            className="rounded border border-ds-200 bg-paper px-2 py-1 text-xs text-ds-800 hover:border-accent-500"
            onClick={() => onFitTimelineZoom('selection')}
          >
            {text.fitSelection}
          </button>
          <TimelineMenu label={text.gap}>
            <label className="block text-meta uppercase tracking-wide text-ds-600">
              {text.gapSeconds}
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
                className="mt-1 w-full rounded border border-ds-200 bg-paper px-2 py-1.5 text-xs text-ink outline-none focus:border-accent-500"
              />
            </label>
            <TimelineMenuButton onClick={onInsertGap}>{text.insertGap}</TimelineMenuButton>
            <TimelineMenuButton tone="violet" disabled={visualGapCount === 0} onClick={onFillAiBrollGaps}>{text.aiFill} {visualGapCount}</TimelineMenuButton>
          </TimelineMenu>
        </div>
      </div>
      </div>
      <div
        ref={scrollRef}
        data-testid="timeline-scroll-container"
        // Marks the box a drag callout must stay inside. The callout finds it
        // with closest(), so the viewport does not have to be threaded down
        // through every track and lane.
        data-timeline-scroll-viewport="true"
        data-pixels-per-second={pixelsPerSecond}
        data-playhead-value={Number(playhead.toFixed(3))}
        className="min-h-0 flex-1 overflow-auto rounded-md border border-ds-200 bg-paper"
        onWheel={onWheelZoom}
        onScroll={(event) => onViewportChange?.({
          scrollLeft: event.currentTarget.scrollLeft,
          viewportWidth: event.currentTarget.clientWidth,
        })}
      >
        <div
          data-testid="timeline-ruler-row"
          data-track-header-width={TIMELINE_TRACK_HEADER_WIDTH}
          style={{
            width: timelineContentWidth,
            gridTemplateColumns: `${TIMELINE_TRACK_HEADER_WIDTH}px ${timelineWidth}px`,
          }}
          className="sticky top-0 z-40 grid border-b border-ds-200 bg-surface"
        >
          <div
            data-testid="timeline-ruler-track-gutter"
            className="sticky left-0 z-50 border-r border-ds-200 bg-paper/95"
            aria-hidden="true"
          />
          <div
            role="slider"
            tabIndex={0}
            aria-label={text.timelineRulerScrubber}
            data-testid="timeline-ruler-scrubber"
            data-playhead-value={Number(playhead.toFixed(3))}
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={Number(playhead.toFixed(3))}
            className="relative h-10 cursor-col-resize select-none py-2"
            onPointerDown={onRulerPointerDown}
          >
            {rulerTicks.map((tick) => (
              <span
                key={tick}
                className="pointer-events-none absolute top-2 text-meta text-ds-600"
                style={{ left: tick * pixelsPerSecond }}
              >
                {formatRulerTime(tick)}
              </span>
            ))}
            {markedRange ? (
              <span
                className="pointer-events-none absolute bottom-0 top-0 rounded-sm bg-info-600/15"
                style={{
                  left: markedRange.start * pixelsPerSecond,
                  width: Math.max(2, (markedRange.end - markedRange.start) * pixelsPerSecond),
                }}
              />
            ) : null}
            {markIn !== null ? (
              <span
                className="pointer-events-none absolute top-2 h-6 border-l border-info-700 pl-1 text-micro leading-6 text-info-800"
                style={{ left: markIn * pixelsPerSecond }}
              >
                {text.inMarker}
              </span>
            ) : null}
            {markOut !== null ? (
              <span
                className="pointer-events-none absolute top-2 h-6 border-l border-warn-700 pl-1 text-micro leading-6 text-warn-800"
                style={{ left: markOut * pixelsPerSecond }}
              >
                {text.outMarker}
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
                  className="absolute top-2 z-30 h-6 cursor-ew-resize border-l text-micro leading-6"
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
                  <span className="ml-1 rounded bg-surface/80 px-1">{marker.label}</span>
                </span>
              );
            })}
            <span
              data-testid="timeline-ruler-playhead"
              data-playhead-value={Number(playhead.toFixed(3))}
              className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-danger-600"
              style={{ left: playhead * pixelsPerSecond }}
            />
          </div>
        </div>
        <div
          data-testid="timeline-track-stack"
          data-track-header-width={TIMELINE_TRACK_HEADER_WIDTH}
          style={{ width: timelineContentWidth }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}


function TimelineMenu({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <details className="relative shrink-0">
      <summary className="inline-flex min-h-8 cursor-pointer list-none items-center rounded border border-ds-200 bg-paper px-2.5 py-1 text-xs text-ds-800 hover:border-accent-500">
        {label}
      </summary>
      <div className="absolute right-0 top-9 z-50 grid w-56 gap-1 rounded-md border border-ds-300 bg-paper p-2 shadow-2xl">
        {children}
      </div>
    </details>
  );
}

function TimelineMenuButton({
  children,
  tone = 'default',
  disabled = false,
  onClick,
}: {
  children: ReactNode;
  tone?: 'default' | 'violet';
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`w-full rounded px-2 py-1.5 text-left text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
        tone === 'violet'
          ? 'border border-accent2-500/30 bg-accent2-500/10 text-accent2-900 hover:border-accent2-700'
          : 'text-ds-800 hover:bg-ds-200'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function TimelineToolbarButton({
  children,
  label,
  testId,
  disabled = false,
  onClick,
}: {
  children: ReactNode;
  label: string;
  testId?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      title={label}
      disabled={disabled}
      className="inline-flex min-h-8 min-w-8 items-center justify-center rounded border border-ds-200 bg-paper px-2 text-meta font-medium text-ds-700 hover:border-accent-500 hover:text-ink disabled:cursor-not-allowed disabled:text-ds-300"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function TimelineToolbarDivider() {
  return (
    <span className="mx-0.5 h-6 w-px shrink-0 bg-ds-200" aria-hidden="true" />
  );
}

function TimelineToggleButton({
  label,
  testId,
  active,
  onClick,
}: {
  label: string;
  testId: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      className={`inline-flex h-8 items-center justify-center rounded border px-2 text-meta font-medium ${
        active
          ? 'border-accent-500/70 bg-accent-500/10 text-accent-900'
          : 'border-ds-200 bg-paper text-ds-700 hover:border-ds-400 hover:text-ink'
      }`}
      onClick={onClick}
    >
      {label}
    </button>
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
