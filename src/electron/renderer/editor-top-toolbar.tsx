import { Children, type ChangeEvent, type ReactNode, type RefObject } from 'react';
import Link from 'next/link';
import { SUPPORTED_MEDIA_AND_CAPTION_FILE_ACCEPT, SUPPORTED_MEDIA_FILE_ACCEPT } from '../../lib/editor/media-file-support';
import { ToggleButton, ToolButton } from './editor-form-controls';
import { useMenuLanguage } from './use-menu-language';

export type EditorPasteMode = 'insert' | 'overwrite';

const editorToolbarText = {
  en: {
    nav: { editor: 'Editor', generate: 'Generate', library: 'Library', settings: 'Settings' },
    groups: {
      history: 'History',
      ingest: 'Ingest',
      edit: 'Edit',
      source: 'Source',
      marks: 'Marks',
      timeline: 'Timeline',
      output: 'Output',
      state: 'State',
      ai: 'AI',
    },
    commands: {
      undo: 'Undo',
      redo: 'Redo',
      import: 'Import',
      commands: 'Commands',
      cut: 'Cut',
      delete: 'Delete',
      cutAll: 'Cut All',
      trimIn: 'Trim In',
      trimOut: 'Trim Out',
      previousEdit: 'Prev Edit',
      nextEdit: 'Next Edit',
      rippleDelete: 'Ripple Del',
      group: 'Group',
      ungroup: 'Ungroup',
      copy: 'Copy',
      duplicate: 'Duplicate',
      copyAttributes: 'Copy Attr',
      paste: 'Paste',
      pasteAttributes: 'Paste Attr',
      pasteIn: 'Paste In',
      append: 'Append',
      matchSource: 'Match Src',
      replaceSource: 'Replace Src',
      selectHere: 'Select Here',
      moveHere: 'Move Here',
      pack: 'Pack',
      selectLeft: 'Select Left',
      selectRight: 'Select Right',
      in: 'In',
      out: 'Out',
      goIn: 'Go In',
      goOut: 'Go Out',
      markSelection: 'Mark Sel',
      clearInOut: 'Clear I/O',
      selectRange: 'Select Range',
      copyRange: 'Copy Range',
      cutRange: 'Cut Range',
      lift: 'Lift',
      extract: 'Extract',
      closeGap: 'Close Gap',
      closeAllGaps: 'Close All Gaps',
      insertGap: 'Insert Gap',
      ripple: 'Ripple',
      snap: 'Snap',
      loop: 'Loop',
      export: 'Export',
      render: 'Render',
      rendering: 'Rendering',
      renderBlocked: 'Render blocked',
      comfyBatch: 'Comfy Batch',
      queueing: 'Queueing',
      sttCaptions: 'STT Captions',
      listening: 'Listening',
    },
    pasteMode: {
      title: 'Paste mode',
      insert: 'Insert mode',
      overwrite: 'Overwrite mode',
    },
    state: {
      selected: 'selected',
      clips: 'clips',
      attrs: 'attrs',
      noAttrs: 'no attrs',
    },
  },
  ko: {
    nav: { editor: '편집', generate: '생성', library: '라이브러리', settings: '설정' },
    groups: {
      history: '기록',
      ingest: '가져오기',
      edit: '편집',
      source: '소스',
      marks: '마크',
      timeline: '타임라인',
      output: '출력',
      state: '상태',
      ai: 'AI',
    },
    commands: {
      undo: '실행 취소',
      redo: '다시 실행',
      import: '가져오기',
      commands: '명령',
      cut: '자르기',
      delete: '삭제',
      cutAll: '전체 자르기',
      trimIn: '앞 트림',
      trimOut: '뒤 트림',
      previousEdit: '이전 컷',
      nextEdit: '다음 컷',
      rippleDelete: '리플 삭제',
      group: '그룹',
      ungroup: '그룹 해제',
      copy: '복사',
      duplicate: '복제',
      copyAttributes: '속성 복사',
      paste: '붙여넣기',
      pasteAttributes: '속성 붙여넣기',
      pasteIn: '인 지점 붙여넣기',
      append: '끝에 추가',
      matchSource: '소스 매칭',
      replaceSource: '소스로 교체',
      selectHere: '현재 위치 선택',
      moveHere: '현재 위치로 이동',
      pack: '간격 정리',
      selectLeft: '왼쪽 선택',
      selectRight: '오른쪽 선택',
      in: '인',
      out: '아웃',
      goIn: '인으로 이동',
      goOut: '아웃으로 이동',
      markSelection: '선택 마크',
      clearInOut: '인/아웃 해제',
      selectRange: '범위 선택',
      copyRange: '범위 복사',
      cutRange: '범위 자르기',
      lift: '리프트',
      extract: '추출',
      closeGap: '간격 닫기',
      closeAllGaps: '모든 간격 닫기',
      insertGap: '간격 삽입',
      ripple: '리플',
      snap: '스냅',
      loop: '반복',
      export: '내보내기',
      render: '렌더',
      rendering: '렌더링 중',
      renderBlocked: '렌더 차단',
      comfyBatch: 'Comfy 배치',
      queueing: '대기열 추가 중',
      sttCaptions: 'STT 자막',
      listening: '실행 중',
    },
    pasteMode: {
      title: '붙여넣기 모드',
      insert: '삽입 모드',
      overwrite: '덮어쓰기 모드',
    },
    state: {
      selected: '선택',
      clips: '클립',
      attrs: '속성',
      noAttrs: '속성 없음',
    },
  },
} as const;

export function EditorTopToolbar({
  fileInputRef,
  lutFileInputRef,
  projectPackageFileInputRef,
  relinkFileInputRef,
  bulkRelinkFileInputRef,
  canUndo,
  canRedo,
  canPackSelection,
  canSplitAtPlayhead,
  canTrimSelectionToPlayhead,
  selectedClipCount,
  clipboardClipCount,
  hasAttributeClipboard,
  hasInMark,
  hasOutMark,
  hasMarkedRange,
  historyCount,
  futureCount,
  saveStateLabel,
  saveStateClassName,
  status,
  rippleMode,
  snapEnabled,
  loopPlaybackEnabled,
  editMode,
  isRendering,
  renderBlockedByPreflight,
  isQueueingComfyUI,
  isRunningStt,
  onImportFiles,
  onImportLutFile,
  onProjectPackageFileChange,
  onRelinkAssetFileChange,
  onBulkRelinkAssetFileChange,
  onUndo,
  onRedo,
  onImportMedia,
  onOpenCommandPalette,
  onSplit,
  onSplitAll,
  onTrimIn,
  onTrimOut,
  onPreviousEdit,
  onNextEdit,
  onDeleteSelection,
  onRippleDeleteSelection,
  onGroupSelection,
  onUngroupSelection,
  onCopySelection,
  onDuplicateSelection,
  onCopyAttributes,
  onPaste,
  onPasteAttributes,
  onPasteAtIn,
  onAppend,
  onMatchFrame,
  onReplaceSelectedFromSource,
  onSelectAtPlayhead,
  onMoveSelectionToPlayhead,
  onPackSelection,
  onInsertGap,
  onSelectLeft,
  onSelectRight,
  onSetInMark,
  onSetOutMark,
  onGoToInMark,
  onGoToOutMark,
  onMarkSelection,
  onClearMarks,
  onSelectMarkedRange,
  onCopyMarkedRange,
  onCutMarkedRange,
  onLiftMarkedRange,
  onExtractMarkedRange,
  onCloseGap,
  onCloseAllGaps,
  onRippleModeChange,
  onSnapEnabledChange,
  onToggleLoopPlayback,
  onEditModeChange,
  onBuildExport,
  onQueueRender,
  onQueueComfyUIBatch,
  onQueueSttCaptions,
}: {
  fileInputRef: RefObject<HTMLInputElement>;
  lutFileInputRef: RefObject<HTMLInputElement>;
  projectPackageFileInputRef: RefObject<HTMLInputElement>;
  relinkFileInputRef: RefObject<HTMLInputElement>;
  bulkRelinkFileInputRef: RefObject<HTMLInputElement>;
  canUndo: boolean;
  canRedo: boolean;
  canPackSelection: boolean;
  canSplitAtPlayhead: boolean;
  canTrimSelectionToPlayhead: boolean;
  selectedClipCount: number;
  clipboardClipCount: number;
  hasAttributeClipboard: boolean;
  hasInMark: boolean;
  hasOutMark: boolean;
  hasMarkedRange: boolean;
  historyCount: number;
  futureCount: number;
  saveStateLabel: string;
  saveStateClassName: string;
  status: string;
  rippleMode: boolean;
  snapEnabled: boolean;
  loopPlaybackEnabled: boolean;
  editMode: EditorPasteMode;
  isRendering: boolean;
  renderBlockedByPreflight: boolean;
  isQueueingComfyUI: boolean;
  isRunningStt: boolean;
  onImportFiles: (event: ChangeEvent<HTMLInputElement>) => void;
  onImportLutFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onProjectPackageFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRelinkAssetFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onBulkRelinkAssetFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onUndo: () => void;
  onRedo: () => void;
  onImportMedia: () => void;
  onOpenCommandPalette: () => void;
  onSplit: () => void;
  onSplitAll: () => void;
  onTrimIn: () => void;
  onTrimOut: () => void;
  onPreviousEdit: () => void;
  onNextEdit: () => void;
  onDeleteSelection: () => void;
  onRippleDeleteSelection: () => void;
  onGroupSelection: () => void;
  onUngroupSelection: () => void;
  onCopySelection: () => void;
  onDuplicateSelection: () => void;
  onCopyAttributes: () => void;
  onPaste: () => void;
  onPasteAttributes: () => void;
  onPasteAtIn: () => void;
  onAppend: () => void;
  onMatchFrame: () => void;
  onReplaceSelectedFromSource: () => void;
  onSelectAtPlayhead: () => void;
  onMoveSelectionToPlayhead: () => void;
  onPackSelection: () => void;
  onInsertGap: () => void;
  onSelectLeft: () => void;
  onSelectRight: () => void;
  onSetInMark: () => void;
  onSetOutMark: () => void;
  onGoToInMark: () => void;
  onGoToOutMark: () => void;
  onMarkSelection: () => void;
  onClearMarks: () => void;
  onSelectMarkedRange: () => void;
  onCopyMarkedRange: () => void;
  onCutMarkedRange: () => void;
  onLiftMarkedRange: () => void;
  onExtractMarkedRange: () => void;
  onCloseGap: () => void;
  onCloseAllGaps: () => void;
  onRippleModeChange: () => void;
  onSnapEnabledChange: () => void;
  onToggleLoopPlayback: () => void;
  onEditModeChange: (mode: EditorPasteMode) => void;
  onBuildExport: () => void;
  onQueueRender: () => void;
  onQueueComfyUIBatch: () => void;
  onQueueSttCaptions: () => void;
}) {
  const language = useMenuLanguage();
  const text = editorToolbarText[language];
  const commands = text.commands;
  const renderLabel = isRendering
    ? commands.rendering
    : renderBlockedByPreflight
      ? commands.renderBlocked
      : commands.render;

  return (
    <header className="relative z-50 grid min-h-[3.25rem] grid-cols-[auto_minmax(0,1fr)] items-center gap-2 border-b border-ds-200 bg-paper px-2 py-1.5">
      <div className="flex min-w-0 shrink-0 items-center gap-3">
        <Link href="/" className="shrink-0 text-sm font-semibold text-ink">
          Danbi Studio
        </Link>
        <nav className="hidden min-w-0 gap-1 overflow-x-auto text-sm text-ds-700 lg:flex">
          <Link className="shrink-0 rounded-md bg-ds-200 px-3 py-2 text-ink" href="/editor">{text.nav.editor}</Link>
          <Link className="shrink-0 rounded-md px-3 py-2 hover:bg-surface" href="/generate">{text.nav.generate}</Link>
          <Link className="shrink-0 rounded-md px-3 py-2 hover:bg-surface" href="/library">{text.nav.library}</Link>
          <Link className="shrink-0 rounded-md px-3 py-2 hover:bg-surface" href="/settings">{text.nav.settings}</Link>
        </nav>
      </div>

      <div
        data-testid="editor-toolbar-command-rail"
        data-selected-clip-count={selectedClipCount}
        data-clipboard-clip-count={clipboardClipCount}
        data-has-attribute-clipboard={hasAttributeClipboard ? 'true' : 'false'}
        data-has-marked-range={hasMarkedRange ? 'true' : 'false'}
        data-render-state={isRendering ? 'rendering' : renderBlockedByPreflight ? 'blocked' : 'ready'}
        className="flex min-w-0 items-center gap-1.5 overflow-x-auto whitespace-nowrap pb-1 pt-1"
      >
        <input
          ref={fileInputRef}
          data-testid="editor-media-file-input"
          type="file"
          multiple
          accept={SUPPORTED_MEDIA_AND_CAPTION_FILE_ACCEPT}
          className="hidden"
          onChange={onImportFiles}
        />
        <input
          ref={lutFileInputRef}
          type="file"
          accept=".cube,.3dl,.dat,.m3d,.csp"
          className="hidden"
          onChange={onImportLutFile}
        />
        <input
          ref={projectPackageFileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={onProjectPackageFileChange}
        />
        <input
          ref={relinkFileInputRef}
          type="file"
          accept={SUPPORTED_MEDIA_FILE_ACCEPT}
          className="hidden"
          onChange={onRelinkAssetFileChange}
        />
        <input
          ref={bulkRelinkFileInputRef}
          type="file"
          multiple
          accept={SUPPORTED_MEDIA_FILE_ACCEPT}
          className="hidden"
          onChange={onBulkRelinkAssetFileChange}
        />
        <ToolbarGroup label="History" displayLabel={text.groups.history} testId="editor-toolbar-group-history" className="hidden">
          <ToolButton compact testId="editor-toolbar-undo" label={commands.undo} onClick={onUndo} icon={<UndoIcon />} disabled={!canUndo} />
          <ToolButton compact testId="editor-toolbar-redo" label={commands.redo} onClick={onRedo} icon={<RedoIcon />} disabled={!canRedo} />
        </ToolbarGroup>
        <ToolbarGroup label="Ingest" displayLabel={text.groups.ingest} testId="editor-toolbar-group-ingest">
          <ToolButton testId="editor-toolbar-import" label={commands.import} onClick={onImportMedia} icon={<ImportIcon />} />
          <ToolButton compact testId="editor-toolbar-commands" label={commands.commands} onClick={onOpenCommandPalette} icon={<CommandIcon />} />
        </ToolbarGroup>
        <ToolbarGroup label="Edit" displayLabel={text.groups.edit} testId="editor-toolbar-group-edit" className="hidden">
          <ToolButton compact testId="editor-toolbar-cut" label={commands.cut} onClick={onSplit} icon={<SplitIcon />} disabled={!canSplitAtPlayhead} />
          <ToolButton compact testId="editor-toolbar-delete" label={commands.delete} onClick={onDeleteSelection} icon={<TrashIcon />} disabled={selectedClipCount === 0} />
          <ToolbarMenu label="Edit" displayLabel={text.groups.edit}>
            <ToolButton label={commands.cutAll} onClick={onSplitAll} icon={<SplitIcon />} />
            <ToolButton label={commands.trimIn} onClick={onTrimIn} icon={<LeftIcon />} disabled={!canTrimSelectionToPlayhead} />
            <ToolButton label={commands.trimOut} onClick={onTrimOut} icon={<RightIcon />} disabled={!canTrimSelectionToPlayhead} />
            <ToolButton label={commands.previousEdit} onClick={onPreviousEdit} icon={<LeftIcon />} />
            <ToolButton label={commands.nextEdit} onClick={onNextEdit} icon={<RightIcon />} />
            <ToolButton label={commands.rippleDelete} onClick={onRippleDeleteSelection} icon={<ExtractIcon />} disabled={selectedClipCount === 0} />
            <ToolButton label={commands.group} onClick={onGroupSelection} icon={<CopyIcon />} disabled={selectedClipCount < 2} />
            <ToolButton label={commands.ungroup} onClick={onUngroupSelection} icon={<CutIcon />} disabled={selectedClipCount === 0} />
            <ToolButton label={commands.copy} onClick={onCopySelection} icon={<CopyIcon />} disabled={selectedClipCount === 0} />
            <ToolButton label={commands.duplicate} onClick={onDuplicateSelection} icon={<CopyIcon />} disabled={selectedClipCount === 0} />
            <ToolButton label={commands.copyAttributes} onClick={onCopyAttributes} icon={<CopyIcon />} disabled={selectedClipCount === 0} />
            <ToolButton label={commands.paste} onClick={onPaste} icon={<PasteIcon />} disabled={clipboardClipCount === 0} />
            <ToolButton label={commands.pasteAttributes} onClick={onPasteAttributes} icon={<PasteIcon />} disabled={selectedClipCount === 0 || !hasAttributeClipboard} />
            <ToolButton label={commands.pasteIn} onClick={onPasteAtIn} icon={<PasteIcon />} disabled={clipboardClipCount === 0 || !hasInMark} />
            <ToolButton label={commands.append} onClick={onAppend} icon={<AppendIcon />} disabled={clipboardClipCount === 0} />
          </ToolbarMenu>
          <ToolbarMenu label="Source" displayLabel={text.groups.source}>
            <ToolButton label={commands.matchSource} onClick={onMatchFrame} icon={<MarkInIcon />} disabled={selectedClipCount === 0} />
            <ToolButton label={commands.replaceSource} onClick={onReplaceSelectedFromSource} icon={<ReplaceIcon />} disabled={selectedClipCount === 0} />
            <ToolButton label={commands.selectHere} onClick={onSelectAtPlayhead} icon={<MarkInIcon />} />
            <ToolButton label={commands.moveHere} onClick={onMoveSelectionToPlayhead} icon={<MarkOutIcon />} disabled={selectedClipCount === 0} />
            <ToolButton label={commands.pack} onClick={onPackSelection} icon={<CloseGapIcon />} disabled={!canPackSelection} />
            <ToolButton label={commands.selectLeft} onClick={onSelectLeft} icon={<LeftIcon />} />
            <ToolButton label={commands.selectRight} onClick={onSelectRight} icon={<RightIcon />} />
          </ToolbarMenu>
          <ToolbarMenu label="Marks" displayLabel={text.groups.marks}>
            <ToolButton label={commands.in} onClick={onSetInMark} icon={<MarkInIcon />} />
            <ToolButton label={commands.out} onClick={onSetOutMark} icon={<MarkOutIcon />} />
            <ToolButton label={commands.goIn} onClick={onGoToInMark} icon={<LeftIcon />} disabled={!hasInMark} />
            <ToolButton label={commands.goOut} onClick={onGoToOutMark} icon={<RightIcon />} disabled={!hasOutMark} />
            <ToolButton label={commands.markSelection} onClick={onMarkSelection} icon={<MarkOutIcon />} disabled={selectedClipCount === 0} />
            <ToolButton label={commands.clearInOut} onClick={onClearMarks} icon={<TrashIcon />} disabled={!hasInMark && !hasOutMark} />
            <ToolButton label={commands.selectRange} onClick={onSelectMarkedRange} icon={<MarkInIcon />} disabled={!hasMarkedRange} />
            <ToolButton label={commands.copyRange} onClick={onCopyMarkedRange} icon={<CopyIcon />} disabled={!hasMarkedRange} />
            <ToolButton label={commands.cutRange} onClick={onCutMarkedRange} icon={<CutIcon />} disabled={!hasMarkedRange} />
            <ToolButton label={commands.lift} onClick={onLiftMarkedRange} icon={<LiftIcon />} disabled={!hasMarkedRange} />
            <ToolButton label={commands.extract} onClick={onExtractMarkedRange} icon={<ExtractIcon />} disabled={!hasMarkedRange} />
            <ToolButton label={commands.closeGap} onClick={onCloseGap} icon={<CloseGapIcon />} />
            <ToolButton label={commands.closeAllGaps} onClick={onCloseAllGaps} icon={<CloseGapIcon />} />
          </ToolbarMenu>
        </ToolbarGroup>
        <ToolbarGroup label="Timeline" displayLabel={text.groups.timeline} testId="editor-toolbar-group-timeline" className="hidden">
          <ToolbarMenu label="Timeline" displayLabel={text.groups.timeline}>
            <ToolButton label={commands.insertGap} onClick={onInsertGap} icon={<AppendIcon />} />
            <ToggleButton testId="editor-toolbar-ripple-toggle" label={commands.ripple} active={rippleMode} onClick={onRippleModeChange} />
            <ToggleButton testId="editor-toolbar-snap-toggle" label={commands.snap} active={snapEnabled} onClick={onSnapEnabledChange} />
            <ToggleButton testId="editor-toolbar-loop-toggle" label={commands.loop} active={loopPlaybackEnabled} onClick={onToggleLoopPlayback} />
            <select
              value={editMode}
              onChange={(event) => onEditModeChange(event.target.value as EditorPasteMode)}
              className="min-h-10 w-full rounded-md border border-ds-300 bg-surface px-2 text-sm text-ink outline-none hover:border-accent-500"
              title={text.pasteMode.title}
            >
              <option value="insert">{text.pasteMode.insert}</option>
              <option value="overwrite">{text.pasteMode.overwrite}</option>
            </select>
          </ToolbarMenu>
        </ToolbarGroup>
        <ToolbarGroup label="Output" displayLabel={text.groups.output} testId="editor-toolbar-group-output">
          <ToolButton testId="editor-toolbar-export" label={commands.export} onClick={onBuildExport} icon={<ExportIcon />} />
          <ToolButton
            compact
            testId="editor-toolbar-render"
            label={renderLabel}
            onClick={onQueueRender}
            icon={<RenderIcon />}
            disabled={isRendering || renderBlockedByPreflight}
          />
          <ToolbarMenu label="AI" displayLabel={text.groups.ai}>
            <ToolButton label={isQueueingComfyUI ? commands.queueing : commands.comfyBatch} onClick={onQueueComfyUIBatch} icon={<BatchIcon />} />
            <ToolButton label={isRunningStt ? commands.listening : commands.sttCaptions} onClick={onQueueSttCaptions} icon={<CaptionAiIcon />} />
          </ToolbarMenu>
        </ToolbarGroup>
        <ToolbarGroup label="State" displayLabel={text.groups.state} testId="editor-toolbar-group-state">
          <span
            data-testid="editor-toolbar-selection-summary"
            className="max-w-48 shrink-0 truncate rounded-md border border-ds-200 bg-paper px-3 py-2 text-xs text-ds-700"
          >
            {selectedClipCount} {text.state.selected} / {clipboardClipCount} {text.state.clips} / {hasAttributeClipboard ? text.state.attrs : text.state.noAttrs}
          </span>
          <span
            data-testid="editor-toolbar-history-summary"
            className="hidden shrink-0 rounded-md border border-ds-200 bg-paper px-3 py-2 text-xs text-ds-700 ed:inline-flex"
          >
            H {historyCount} / R {futureCount}
          </span>
          <span className={`max-w-36 shrink-0 truncate rounded-md border px-3 py-2 text-xs ${saveStateClassName}`}>
            {saveStateLabel}
          </span>
          <span
            data-testid="editor-status"
            className="min-w-32 max-w-80 shrink-0 truncate rounded-md border border-ds-200 bg-paper px-3 py-2 text-xs text-accent-700"
            title={status}
          >
            {status}
          </span>
        </ToolbarGroup>
      </div>
    </header>
  );
}


function ToolbarGroup({
  label,
  displayLabel = label,
  testId,
  className = '',
  children,
}: {
  label: string;
  displayLabel?: string;
  testId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-testid={testId}
      data-toolbar-group-label={label}
      data-toolbar-command-count={Children.count(children)}
      aria-label={`${displayLabel} toolbar group`}
      className={`${className} shrink-0 items-center gap-1 rounded-md border border-ds-200 bg-surface/70 p-0.5 [&>button]:shrink-0 [&>details]:shrink-0 [&>select]:shrink-0 [&>span]:shrink-0 ${className.includes('hidden') ? '' : 'flex'}`}
    >
      <span className="sr-only">{displayLabel}</span>
      {children}
    </section>
  );
}

function ToolbarMenu({
  label,
  displayLabel = label,
  children,
}: {
  label: string;
  displayLabel?: string;
  children: ReactNode;
}) {
  const testId = `editor-toolbar-menu-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const commandCount = Children.count(children);

  return (
    <details data-testid={testId} data-menu-command-count={commandCount} className="relative shrink-0">
      <summary data-testid={`${testId}-summary`} className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border border-ds-300 bg-surface px-2 py-1.5 text-xs text-ink hover:border-accent-500 hover:bg-ds-200">
        {displayLabel}
        <span
          data-testid={`${testId}-count`}
          className="rounded bg-paper px-1.5 py-0.5 text-micro font-semibold text-ds-700"
        >
          {commandCount}
        </span>
      </summary>
      <div data-testid={`${testId}-content`} className="absolute left-0 top-11 z-50 grid w-56 gap-1 rounded-md border border-ds-300 bg-paper p-2 shadow-2xl [&>button]:w-full [&>button]:justify-start">
        {children}
      </div>
    </details>
  );
}

function LeftIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function RightIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 7H4v5" />
      <path d="M20 17a8 8 0 0 0-13.7-5.7L4 14" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 7h5v5" />
      <path d="M4 17a8 8 0 0 1 13.7-5.7L20 14" />
    </svg>
  );
}

function ImportIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v12" />
      <path d="M7 8l5-5 5 5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function CommandIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16" />
      <path d="M4 12h10" />
      <path d="M4 18h7" />
      <path d="M17 15l3 3-3 3" />
    </svg>
  );
}

function SplitIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h6" />
      <path d="M14 7h6" />
      <path d="M4 17h6" />
      <path d="M14 17h6" />
      <path d="M12 4v16" />
    </svg>
  );
}

function MarkInIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 4v16" />
      <path d="M10 8h8" />
      <path d="M10 16h8" />
    </svg>
  );
}

function MarkOutIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 4v16" />
      <path d="M6 8h8" />
      <path d="M6 16h8" />
    </svg>
  );
}

function LiftIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 7h14" />
      <path d="M8 17h8" />
      <path d="M12 7v8" />
      <path d="M9 12l3 3 3-3" />
    </svg>
  );
}

function ExtractIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h6" />
      <path d="M14 7h6" />
      <path d="M4 17h6" />
      <path d="M14 17h6" />
      <path d="M10 12h4" />
      <path d="M12 10v4" />
    </svg>
  );
}

function CloseGapIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h6" />
      <path d="M14 7h6" />
      <path d="M4 17h6" />
      <path d="M14 17h6" />
      <path d="M10 12h4" />
      <path d="M9 10l3 2-3 2" />
      <path d="M15 10l-3 2 3 2" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function RenderIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 5v14l11-7-11-7z" />
      <path d="M4 5v14" />
    </svg>
  );
}

function BatchIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 17h6" />
      <path d="M17 14v6" />
    </svg>
  );
}

function CaptionAiIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 5h16v10H8l-4 4V5z" />
      <path d="M8 9h5" />
      <path d="M8 12h8" />
      <path d="M17 7l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M6 6l1 15h10l1-15" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="8" y="8" width="11" height="11" rx="1" />
      <path d="M5 15H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

function CutIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="6" cy="7" r="3" />
      <circle cx="6" cy="17" r="3" />
      <path d="M8.5 8.5 20 20" />
      <path d="M8.5 15.5 20 4" />
    </svg>
  );
}

function PasteIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 4h8l1 3H7l1-3z" />
      <path d="M7 7h10v13H7z" />
      <path d="M9 11h6" />
      <path d="M9 15h4" />
    </svg>
  );
}

function ReplaceIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h11" />
      <path d="M12 4l3 3-3 3" />
      <path d="M20 17H9" />
      <path d="M12 14l-3 3 3 3" />
    </svg>
  );
}

function AppendIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h8" />
      <path d="M4 12h8" />
      <path d="M4 17h8" />
      <path d="M17 8v8" />
      <path d="M13 12h8" />
    </svg>
  );
}
