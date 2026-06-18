export interface TimelineContextMenuProps {
  x: number;
  y: number;
  selectionCount: number;
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
  selectionCount,
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
  return (
    <div
      className="fixed z-50 w-52 rounded-md border border-zinc-700 bg-zinc-950 p-1 text-sm text-zinc-200 shadow-2xl"
      style={{ left: x, top: y }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="border-b border-zinc-800 px-3 py-2 text-xs text-zinc-500">
        {selectionCount} selected
      </div>
      <ContextMenuButton label="Copy" onClick={onCopy} />
      <ContextMenuButton label="Copy attributes" onClick={onCopyAttributes} />
      <ContextMenuButton label="Cut" onClick={onCut} />
      <ContextMenuButton label="Paste at playhead" onClick={onPaste} />
      <ContextMenuButton label="Paste attributes" onClick={onPasteAttributes} />
      <ContextMenuButton label="Paste at In point" onClick={onPasteAtIn} />
      <ContextMenuButton label="Append to track" onClick={onAppend} />
      <ContextMenuButton label="Duplicate" onClick={onDuplicate} />
      <ContextMenuButton label="Group clips" onClick={onGroup} />
      <ContextMenuButton label="Ungroup clips" onClick={onUngroup} />
      <ContextMenuButton label="Select clip at playhead" onClick={onSelectAtPlayhead} />
      <ContextMenuButton label="Move selection to playhead" onClick={onMoveSelectionToPlayhead} />
      <ContextMenuButton label="Insert gap at playhead" onClick={onInsertGap} />
      <ContextMenuButton label="Select clips left" onClick={onSelectLeft} />
      <ContextMenuButton label="Select clips right" onClick={onSelectRight} />
      <ContextMenuButton label="Previous edit point" onClick={onPreviousEdit} />
      <ContextMenuButton label="Next edit point" onClick={onNextEdit} />
      <div className="my-1 border-t border-zinc-800" />
      <ContextMenuButton label="Split at playhead" onClick={onSplit} />
      <ContextMenuButton label="Split all at playhead" onClick={onSplitAll} />
      <ContextMenuButton label="Trim head to playhead" onClick={onTrimIn} />
      <ContextMenuButton label="Trim tail to playhead" onClick={onTrimOut} />
      <ContextMenuButton label="Delete left side" onClick={onDeleteLeft} />
      <ContextMenuButton label="Delete right side" onClick={onDeleteRight} />
      <div className="my-1 border-t border-zinc-800" />
      <ContextMenuButton label="Add marker" onClick={onMarker} />
      <ContextMenuButton label="Split active caption" onClick={onSplitCaption} />
      <ContextMenuButton label="Merge selected captions" onClick={onMergeCaptions} />
      <ContextMenuButton label="Go to In point" onClick={onGoToIn} />
      <ContextMenuButton label="Go to Out point" onClick={onGoToOut} />
      <ContextMenuButton label="Clear In/Out" onClick={onClearMarks} />
      <ContextMenuButton label="Mark selection" onClick={onMarkSelection} />
      <ContextMenuButton label="Select marked range" onClick={onSelectMarkedRange} />
      <ContextMenuButton label="Copy marked range" onClick={onCopyMarkedRange} />
      <ContextMenuButton label="Cut marked range" danger onClick={onCutMarkedRange} />
      <ContextMenuButton label="Lift marked range" danger onClick={onLift} />
      <ContextMenuButton label="Extract marked range" danger onClick={onExtract} />
      <ContextMenuButton label="Close gap at playhead" onClick={onCloseGap} />
      <div className="my-1 border-t border-zinc-800" />
      <ContextMenuButton label="Toggle clip mute" onClick={onMute} />
      <ContextMenuButton label="Toggle clip lock" onClick={onLock} />
      <ContextMenuButton label="Detach audio" disabled={!canDetachAudio} onClick={onDetachAudio} />
      <ContextMenuButton label="Relink audio" disabled={!canRelinkAudio} onClick={onRelinkAudio} />
      <ContextMenuButton label="Unlink V/A" disabled={!canUnlinkAudio} onClick={onUnlinkAudio} />
      <ContextMenuButton label="Link selected V/A" disabled={!canLinkAudio} onClick={onLinkAudio} />
      <div className="my-1 border-t border-zinc-800" />
      <ContextMenuButton label="Delete" danger onClick={onDelete} />
      <ContextMenuButton label="Ripple delete" danger onClick={onRippleDelete} />
      <div className="my-1 border-t border-zinc-800" />
      <ContextMenuButton label="Crossfade" onClick={onCrossfade} />
      <ContextMenuButton label="Wipe" onClick={onWipe} />
    </div>
  );
}

function ContextMenuButton({
  label,
  danger,
  disabled,
  onClick,
}: {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`block w-full rounded px-3 py-2 text-left hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 ${danger ? 'text-rose-200' : 'text-zinc-200'}`}
    >
      {label}
    </button>
  );
}
