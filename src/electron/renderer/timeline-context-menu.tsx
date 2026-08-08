import type { ReactNode } from 'react';

export interface TimelineContextMenuProps {
  x: number;
  y: number;
  anchorClipId?: string;
  anchorClipName?: string;
  selectionCount: number;
  selectedCaptionCount: number;
  clipboardClipCount: number;
  hasAttributeClipboard: boolean;
  hasInMark: boolean;
  hasOutMark: boolean;
  hasMarkedRange: boolean;
  canSplitAtPlayhead: boolean;
  onCopy: () => void;
  onCopyAttributes: () => void;
  onCut: () => void;
  onPaste: () => void;
  onPasteAttributes: () => void;
  onPasteAtIn: () => void;
  onAppend: () => void;
  onSelectAtPlayhead: () => void;
  onMoveSelectionToPlayhead: () => void;
  onInsertGap: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onSelectLeft: () => void;
  onSelectRight: () => void;
  onPreviousEdit: () => void;
  onNextEdit: () => void;
  onSplit: () => void;
  onSplitAll: () => void;
  onTrimIn: () => void;
  onTrimOut: () => void;
  onDeleteLeft: () => void;
  onDeleteRight: () => void;
  onDuplicate: () => void;
  onLift: () => void;
  onExtract: () => void;
  onGoToIn: () => void;
  onGoToOut: () => void;
  onClearMarks: () => void;
  onMarkSelection: () => void;
  onSelectMarkedRange: () => void;
  onCopyMarkedRange: () => void;
  onCutMarkedRange: () => void;
  onCloseGap: () => void;
  onMarker: () => void;
  onSplitCaption: () => void;
  onMergeCaptions: () => void;
  onMute: () => void;
  onLock: () => void;
  canDetachAudio: boolean;
  canRelinkAudio: boolean;
  canUnlinkAudio: boolean;
  canLinkAudio: boolean;
  onDetachAudio: () => void;
  onRelinkAudio: () => void;
  onUnlinkAudio: () => void;
  onLinkAudio: () => void;
  onDelete: () => void;
  onRippleDelete: () => void;
  onCrossfade: () => void;
  onWipe: () => void;
}

export function TimelineContextMenu({
  x,
  y,
  anchorClipId,
  anchorClipName,
  selectionCount,
  selectedCaptionCount,
  clipboardClipCount,
  hasAttributeClipboard,
  hasInMark,
  hasOutMark,
  hasMarkedRange,
  canSplitAtPlayhead,
  onCopy,
  onCopyAttributes,
  onCut,
  onPaste,
  onPasteAttributes,
  onPasteAtIn,
  onAppend,
  onSelectAtPlayhead,
  onMoveSelectionToPlayhead,
  onInsertGap,
  onGroup,
  onUngroup,
  onSelectLeft,
  onSelectRight,
  onPreviousEdit,
  onNextEdit,
  onSplit,
  onSplitAll,
  onTrimIn,
  onTrimOut,
  onDeleteLeft,
  onDeleteRight,
  onDuplicate,
  onLift,
  onExtract,
  onGoToIn,
  onGoToOut,
  onClearMarks,
  onMarkSelection,
  onSelectMarkedRange,
  onCopyMarkedRange,
  onCutMarkedRange,
  onCloseGap,
  onMarker,
  onSplitCaption,
  onMergeCaptions,
  onMute,
  onLock,
  canDetachAudio,
  canRelinkAudio,
  canUnlinkAudio,
  canLinkAudio,
  onDetachAudio,
  onRelinkAudio,
  onUnlinkAudio,
  onLinkAudio,
  onDelete,
  onRippleDelete,
  onCrossfade,
  onWipe,
}: TimelineContextMenuProps) {
  const hasSelection = selectionCount > 0;
  const hasClipboard = clipboardClipCount > 0;
  const hasAnyMark = hasInMark || hasOutMark;
  const canPasteAttributes = hasSelection && hasAttributeClipboard;
  const canPasteAtIn = hasClipboard && hasInMark;
  const canApplySelectionCommand = hasSelection;
  const selectionLabel = selectionCount === 1
    ? '1 clip selected'
    : `${selectionCount} clips selected`;
  const menuWidth = 288;
  const menuMaxHeight = 680;
  const viewportWidth = typeof window === 'undefined' ? x + menuWidth + 8 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? y + menuMaxHeight + 8 : window.innerHeight;
  const menuLeft = clampMenuCoordinate(x, 8, Math.max(8, viewportWidth - menuWidth - 8));
  const menuTop = clampMenuCoordinate(y, 8, Math.max(8, viewportHeight - Math.min(menuMaxHeight, viewportHeight * 0.74) - 8));
  const positionClamped = menuLeft !== x || menuTop !== y;

  return (
    <div
      role="menu"
      aria-label="Timeline context actions"
      data-testid="timeline-context-menu"
      data-anchor-clip-id={anchorClipId ?? ''}
      data-anchor-clip-name={anchorClipName ?? ''}
      data-selection-count={selectionCount}
      data-clipboard-count={clipboardClipCount}
      data-has-attribute-clipboard={hasAttributeClipboard ? 'true' : 'false'}
      data-has-in-mark={hasInMark ? 'true' : 'false'}
      data-has-out-mark={hasOutMark ? 'true' : 'false'}
      data-has-marked-range={hasMarkedRange ? 'true' : 'false'}
      data-menu-section-count="7"
      data-position-clamped={positionClamped ? 'true' : 'false'}
      className="fixed z-50 max-h-[min(74vh,680px)] w-72 overflow-y-auto rounded-md border border-ds-300 bg-paper p-1 text-sm text-ds-800 shadow-2xl"
      style={{ left: menuLeft, top: menuTop }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="border-b border-ds-200 px-3 py-2">
        <div className="truncate text-kicker font-heading font-semibold uppercase text-ds-700">
          {anchorClipName ? `Clip: ${anchorClipName}` : 'Timeline actions'}
        </div>
        <div className="mt-1 flex items-center justify-between gap-3 text-meta text-ds-600">
          <span data-testid="timeline-context-selection-summary">{selectionLabel}</span>
          <span>{clipboardClipCount} copied</span>
        </div>
      </div>
      <ContextMenuSection title="Edit" id="edit">
        <ContextMenuButton label="Cut" shortcut="Ctrl+X" disabled={!hasSelection} onClick={onCut} />
        <ContextMenuButton label="Copy" shortcut="Ctrl+C" disabled={!hasSelection} onClick={onCopy} />
        <ContextMenuButton label="Duplicate" shortcut="Ctrl+D" disabled={!hasSelection} onClick={onDuplicate} />
        <ContextMenuButton label="Paste at playhead" shortcut="Ctrl+V" disabled={!hasClipboard} onClick={onPaste} />
        <ContextMenuButton label="Append to track" disabled={!hasClipboard} onClick={onAppend} />
      </ContextMenuSection>
      <ContextMenuSection title="Clip selection" id="selection">
        <ContextMenuButton label="Copy attributes" disabled={!hasSelection} onClick={onCopyAttributes} />
        <ContextMenuButton label="Paste attributes" disabled={!canPasteAttributes} onClick={onPasteAttributes} />
        <ContextMenuButton label="Group clips" disabled={selectionCount < 2} onClick={onGroup} />
        <ContextMenuButton label="Ungroup clips" disabled={!hasSelection} onClick={onUngroup} />
        <ContextMenuButton label="Move selection to playhead" disabled={!hasSelection} onClick={onMoveSelectionToPlayhead} />
      </ContextMenuSection>
      <ContextMenuSection title="Playhead edit" id="playhead">
        <ContextMenuButton label="Split at playhead" shortcut="S" disabled={!canSplitAtPlayhead} onClick={onSplit} />
        <ContextMenuButton label="Split all at playhead" onClick={onSplitAll} />
        <ContextMenuButton label="Trim head to playhead" disabled={!hasSelection} onClick={onTrimIn} />
        <ContextMenuButton label="Trim tail to playhead" disabled={!hasSelection} onClick={onTrimOut} />
        <ContextMenuButton label="Delete left side" disabled={!hasSelection} onClick={onDeleteLeft} />
        <ContextMenuButton label="Delete right side" disabled={!hasSelection} onClick={onDeleteRight} />
      </ContextMenuSection>
      <ContextMenuSection title="Navigate" id="navigate">
        <ContextMenuButton label="Select clip at playhead" onClick={onSelectAtPlayhead} />
        <ContextMenuButton label="Select clips left" onClick={onSelectLeft} />
        <ContextMenuButton label="Select clips right" onClick={onSelectRight} />
        <ContextMenuButton label="Previous edit point" onClick={onPreviousEdit} />
        <ContextMenuButton label="Next edit point" onClick={onNextEdit} />
        <ContextMenuButton label="Insert gap at playhead" onClick={onInsertGap} />
        <ContextMenuButton label="Close gap at playhead" onClick={onCloseGap} />
      </ContextMenuSection>
      <ContextMenuSection title="Marks and captions" id="marks">
        <ContextMenuButton label="Add marker" onClick={onMarker} />
        <ContextMenuButton label="Split active caption" disabled={selectedCaptionCount === 0} onClick={onSplitCaption} />
        <ContextMenuButton label="Merge selected captions" disabled={selectedCaptionCount < 2} onClick={onMergeCaptions} />
        <ContextMenuButton label="Go to In point" disabled={!hasInMark} onClick={onGoToIn} />
        <ContextMenuButton label="Go to Out point" disabled={!hasOutMark} onClick={onGoToOut} />
        <ContextMenuButton label="Paste at In point" disabled={!canPasteAtIn} onClick={onPasteAtIn} />
        <ContextMenuButton label="Clear In/Out" disabled={!hasAnyMark} onClick={onClearMarks} />
        <ContextMenuButton label="Mark selection" disabled={!hasSelection} onClick={onMarkSelection} />
        <ContextMenuButton label="Select marked range" disabled={!hasMarkedRange} onClick={onSelectMarkedRange} />
        <ContextMenuButton label="Copy marked range" disabled={!hasMarkedRange} onClick={onCopyMarkedRange} />
        <ContextMenuButton label="Cut marked range" danger disabled={!hasMarkedRange} onClick={onCutMarkedRange} />
        <ContextMenuButton label="Lift marked range" danger disabled={!hasMarkedRange} onClick={onLift} />
        <ContextMenuButton label="Extract marked range" danger disabled={!hasMarkedRange} onClick={onExtract} />
      </ContextMenuSection>
      <ContextMenuSection title="Audio and link" id="audio">
        <ContextMenuButton label="Toggle clip mute" disabled={!canApplySelectionCommand} onClick={onMute} />
        <ContextMenuButton label="Toggle clip lock" disabled={!canApplySelectionCommand} onClick={onLock} />
        <ContextMenuButton label="Detach audio" disabled={!canDetachAudio} onClick={onDetachAudio} />
        <ContextMenuButton label="Relink audio" disabled={!canRelinkAudio} onClick={onRelinkAudio} />
        <ContextMenuButton label="Unlink V/A" disabled={!canUnlinkAudio} onClick={onUnlinkAudio} />
        <ContextMenuButton label="Link selected V/A" disabled={!canLinkAudio} onClick={onLinkAudio} />
      </ContextMenuSection>
      <ContextMenuSection title="Remove and transition" id="remove-transition">
        <ContextMenuButton label="Delete" shortcut="Del" danger disabled={!hasSelection} onClick={onDelete} />
        <ContextMenuButton label="Ripple delete" danger disabled={!hasSelection} onClick={onRippleDelete} />
        <ContextMenuButton label="Crossfade" disabled={!hasSelection} onClick={onCrossfade} />
        <ContextMenuButton label="Wipe" disabled={!hasSelection} onClick={onWipe} />
      </ContextMenuSection>
    </div>
  );
}

function ContextMenuSection({
  title,
  id,
  children,
}: {
  title: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <section data-testid={`timeline-context-section-${id}`} data-context-section={id} className="border-b border-ds-200 py-1 last:border-b-0">
      <div className="px-3 pb-1 pt-2 text-micro font-semibold uppercase tracking-wide text-ds-600">
        {title}
      </div>
      {children}
    </section>
  );
}

function ContextMenuButton({
  label,
  danger,
  disabled,
  shortcut,
  onClick,
}: {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  shortcut?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={`timeline-context-action-${toActionTestId(label)}`}
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 rounded px-3 py-1.5 text-left hover:bg-ds-200 disabled:cursor-not-allowed disabled:opacity-40 ${danger ? 'text-danger-800' : 'text-ds-800'}`}
    >
      <span className="truncate">{label}</span>
      {shortcut ? <span className="shrink-0 text-micro text-ds-600">{shortcut}</span> : null}
    </button>
  );
}

function toActionTestId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function clampMenuCoordinate(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
