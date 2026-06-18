import type { ChangeEvent, RefObject } from 'react';
import Link from 'next/link';
import { SUPPORTED_MEDIA_AND_CAPTION_FILE_ACCEPT, SUPPORTED_MEDIA_FILE_ACCEPT } from '../../lib/editor/media-file-support';
import { ToggleButton, ToolButton } from './editor-form-controls';

export type EditorPasteMode = 'insert' | 'overwrite';

export function EditorTopToolbar({
  fileInputRef,
  lutFileInputRef,
  projectPackageFileInputRef,
  relinkFileInputRef,
  bulkRelinkFileInputRef,
  canUndo,
  canRedo,
  canPackSelection,
  selectedClipCount,
  clipboardClipCount,
  hasAttributeClipboard,
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
  selectedClipCount: number;
  clipboardClipCount: number;
  hasAttributeClipboard: boolean;
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
  return (
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-3">
      <div className="flex items-center gap-4">
        <Link href="/" className="text-sm font-semibold text-zinc-100">
          Danbi Studio
        </Link>
        <nav className="flex flex-wrap gap-1 text-sm text-zinc-300">
          <Link className="rounded-md bg-zinc-800 px-3 py-2 text-white" href="/editor">Editor</Link>
          <Link className="rounded-md px-3 py-2 hover:bg-zinc-900" href="/generate">Generate</Link>
          <Link className="rounded-md px-3 py-2 hover:bg-zinc-900" href="/library">Library</Link>
          <Link className="rounded-md px-3 py-2 hover:bg-zinc-900" href="/settings">Settings</Link>
        </nav>
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
        <ToolButton label="Undo" onClick={onUndo} icon={<UndoIcon />} disabled={!canUndo} />
        <ToolButton label="Redo" onClick={onRedo} icon={<RedoIcon />} disabled={!canRedo} />
        <ToolButton label="Import" onClick={onImportMedia} icon={<ImportIcon />} />
        <ToolButton label="Commands" onClick={onOpenCommandPalette} icon={<CommandIcon />} />
        <ToolButton label="Cut" onClick={onSplit} icon={<SplitIcon />} />
        <ToolButton label="Cut All" onClick={onSplitAll} icon={<SplitIcon />} />
        <ToolButton label="Trim In" onClick={onTrimIn} icon={<LeftIcon />} />
        <ToolButton label="Trim Out" onClick={onTrimOut} icon={<RightIcon />} />
        <ToolButton label="Prev Edit" onClick={onPreviousEdit} icon={<LeftIcon />} />
        <ToolButton label="Next Edit" onClick={onNextEdit} icon={<RightIcon />} />
        <ToolButton label="Delete" onClick={onDeleteSelection} icon={<TrashIcon />} />
        <ToolButton label="Ripple Del" onClick={onRippleDeleteSelection} icon={<ExtractIcon />} />
        <ToolButton label="Group" onClick={onGroupSelection} icon={<CopyIcon />} />
        <ToolButton label="Ungroup" onClick={onUngroupSelection} icon={<CutIcon />} />
        <ToolButton label="Copy" onClick={onCopySelection} icon={<CopyIcon />} />
        <ToolButton label="Duplicate" onClick={onDuplicateSelection} icon={<CopyIcon />} />
        <ToolButton label="Copy Attr" onClick={onCopyAttributes} icon={<CopyIcon />} />
        <ToolButton label="Paste" onClick={onPaste} icon={<PasteIcon />} />
        <ToolButton label="Paste Attr" onClick={onPasteAttributes} icon={<PasteIcon />} />
        <ToolButton label="Paste In" onClick={onPasteAtIn} icon={<PasteIcon />} />
        <ToolButton label="Append" onClick={onAppend} icon={<AppendIcon />} />
        <ToolButton label="Match Src" onClick={onMatchFrame} icon={<MarkInIcon />} disabled={selectedClipCount === 0} />
        <ToolButton label="Replace Src" onClick={onReplaceSelectedFromSource} icon={<ReplaceIcon />} disabled={selectedClipCount === 0} />
        <ToolButton label="Select Here" onClick={onSelectAtPlayhead} icon={<MarkInIcon />} />
        <ToolButton label="Move Here" onClick={onMoveSelectionToPlayhead} icon={<MarkOutIcon />} />
        <ToolButton label="Pack" onClick={onPackSelection} icon={<CloseGapIcon />} disabled={!canPackSelection} />
        <ToolButton label="Insert Gap" onClick={onInsertGap} icon={<AppendIcon />} />
        <ToolButton label="Select Left" onClick={onSelectLeft} icon={<LeftIcon />} />
        <ToolButton label="Select Right" onClick={onSelectRight} icon={<RightIcon />} />
        <ToolButton label="In" onClick={onSetInMark} icon={<MarkInIcon />} />
        <ToolButton label="Out" onClick={onSetOutMark} icon={<MarkOutIcon />} />
        <ToolButton label="Go In" onClick={onGoToInMark} icon={<LeftIcon />} />
        <ToolButton label="Go Out" onClick={onGoToOutMark} icon={<RightIcon />} />
        <ToolButton label="Mark Sel" onClick={onMarkSelection} icon={<MarkOutIcon />} />
        <ToolButton label="Clear I/O" onClick={onClearMarks} icon={<TrashIcon />} />
        <ToolButton label="Select Range" onClick={onSelectMarkedRange} icon={<MarkInIcon />} />
        <ToolButton label="Copy Range" onClick={onCopyMarkedRange} icon={<CopyIcon />} />
        <ToolButton label="Cut Range" onClick={onCutMarkedRange} icon={<CutIcon />} />
        <ToolButton label="Lift" onClick={onLiftMarkedRange} icon={<LiftIcon />} />
        <ToolButton label="Extract" onClick={onExtractMarkedRange} icon={<ExtractIcon />} />
        <ToolButton label="Close Gap" onClick={onCloseGap} icon={<CloseGapIcon />} />
        <ToolButton label="Close All Gaps" onClick={onCloseAllGaps} icon={<CloseGapIcon />} />
        <ToggleButton label="Ripple" active={rippleMode} onClick={onRippleModeChange} />
        <ToggleButton label="Snap" active={snapEnabled} onClick={onSnapEnabledChange} />
        <ToggleButton label="Loop" active={loopPlaybackEnabled} onClick={onToggleLoopPlayback} />
        <select
          value={editMode}
          onChange={(event) => onEditModeChange(event.target.value as EditorPasteMode)}
          className="min-h-10 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100 outline-none hover:border-emerald-500"
          title="Paste mode"
        >
          <option value="insert">Insert</option>
          <option value="overwrite">Overwrite</option>
        </select>
        <ToolButton label="Export" onClick={onBuildExport} icon={<ExportIcon />} />
        <ToolButton
          label={isRendering ? 'Rendering' : renderBlockedByPreflight ? 'Render blocked' : 'Render'}
          onClick={onQueueRender}
          icon={<RenderIcon />}
          disabled={isRendering || renderBlockedByPreflight}
        />
        <ToolButton label={isQueueingComfyUI ? 'Queueing' : 'Comfy Batch'} onClick={onQueueComfyUIBatch} icon={<BatchIcon />} />
        <ToolButton label={isRunningStt ? 'Listening' : 'STT Captions'} onClick={onQueueSttCaptions} icon={<CaptionAiIcon />} />
        <span className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-400">
          {selectedClipCount} selected / {clipboardClipCount} clips / {hasAttributeClipboard ? 'attrs' : 'no attrs'}
        </span>
        <span className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-400">
          H {historyCount} / R {futureCount}
        </span>
        <span className={`rounded-md border px-3 py-2 text-xs ${saveStateClassName}`}>
          {saveStateLabel}
        </span>
        <span className="min-w-32 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-emerald-300">
          {status}
        </span>
      </div>
    </header>
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
