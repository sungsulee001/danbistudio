type MaybePromise = void | Promise<void>;

export interface EditorKeyboardDispatcherContext {
  fps: number;
  duration: number;
  rippleMode: boolean;
  editMode: 'insert' | 'overwrite';
  activeMonitor: 'source' | 'program';
  selectedCanUseProgramMonitorMotion: boolean;
  selectedCaptionCount: number;
  selectedClipCount: number;
  onOpenCommandPalette: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSaveProject: () => MaybePromise;
  onSelectAllClips: () => void;
  onDuplicateSelectedClips: () => void;
  onGroupSelectedClips: () => void;
  onUngroupSelectedClips: () => void;
  onCloseGapAtPlayhead: () => void;
  onCloseAllGapsOnTrack: () => void;
  onArrangeSelectedClips: (gap?: number) => void;
  onInsertGapAtPlayhead: () => void;
  onSelectClipsRelativeToPlayhead: (direction: 'left' | 'right', includeAllTracks: boolean) => void;
  onSelectMarkedRange: (includeAllTracks: boolean) => void;
  onSelectClipAtPlayhead: (includeAllTracks: boolean) => void;
  onCopyClipAttributes: () => void;
  onCopySelected: () => void;
  onCutSelected: () => void;
  onPasteClipAttributes: () => void;
  onPasteClipboard: () => void;
  onPasteClipboardAtIn: () => void;
  onBuildExport: () => MaybePromise;
  onQueueRenderProject: () => MaybePromise;
  onEscape: () => void;
  onToggleProgramPlayback: () => void;
  onToggleSourcePlayback: () => void;
  onShuttlePlayback: (direction: 'reverse' | 'stop' | 'forward') => void;
  onToggleLoopPlayback: () => void;
  onSplit: () => void;
  onTrimToPlayhead: (edge: 'start' | 'end') => void;
  onCopyMarkedRange: (includeAllTracks: boolean) => void;
  onSplitActiveCaption: () => void;
  onDeleteSelectedCaptions: () => void;
  onDeleteSelected: (ripple: boolean) => void;
  onSetTimelinePlayhead: (time: number) => void;
  onGoToSourceBoundary: (edge: 'start' | 'end') => void;
  onProgramMotionNudge: (deltaX: number, deltaY: number) => void;
  onSlideSelected: (deltaSeconds: number) => void;
  onMoveSelected: (deltaSeconds: number) => void;
  onNudgePlayhead: (deltaSeconds: number) => void;
  onNudgeSourcePlayhead: (deltaSeconds: number) => void;
  onJumpAdjacentEdit: (direction: 'previous' | 'next', includeAllTracks: boolean) => void;
  onToggleRippleMode: () => void;
  onToggleSnapEnabled: () => void;
  onFitTimelineZoom: (mode: 'timeline' | 'selection') => void;
  onJumpAdjacentMarker: (direction: 'previous' | 'next') => void;
  onMoveSelectionToPlayhead: () => void;
  onMergeSelectedCaptions: () => void;
  onAddMarkerAtPlayhead: () => void;
  onThreePointAssetEdit: (mode: 'insert' | 'overwrite') => void;
  onSetEditMode: (mode: 'insert' | 'overwrite') => void;
  onGoToMark: (edge: 'in' | 'out') => void;
  onSetMark: (edge: 'in' | 'out') => void;
  onGoToSourceMark: (edge: 'in' | 'out') => void;
  onSetSourceMark: (edge: 'in' | 'out') => void;
  onClearSourceMarks: () => void;
  onCutMarkedRange: (includeAllTracks: boolean, ripple: boolean) => void;
  onDeleteMarkedRange: (ripple: boolean) => void;
  onClearMarks: () => void;
  onMarkSelectedClips: () => void;
}

export function dispatchEditorKeyboardShortcut(event: KeyboardEvent, context: EditorKeyboardDispatcherContext): boolean {
  if (isEditorTextInputTarget(event.target)) {
    return false;
  }

  const key = event.key.toLowerCase();
  const command = event.ctrlKey || event.metaKey;
  const frameStep = 1 / context.fps;

  if (command && key === 'z') {
    event.preventDefault();
    if (event.shiftKey) {
      context.onRedo();
    } else {
      context.onUndo();
    }
    return true;
  }

  if (command && key === 'y') {
    event.preventDefault();
    context.onRedo();
    return true;
  }

  if (command && key === 's') {
    event.preventDefault();
    void context.onSaveProject();
    return true;
  }

  if (command && key === 'k') {
    event.preventDefault();
    context.onOpenCommandPalette();
    return true;
  }

  if (command && key === 'a') {
    event.preventDefault();
    context.onSelectAllClips();
    return true;
  }

  if (command && key === 'd') {
    event.preventDefault();
    context.onDuplicateSelectedClips();
    return true;
  }

  if (command && key === 'g') {
    event.preventDefault();
    if (event.shiftKey) {
      context.onUngroupSelectedClips();
    } else {
      context.onGroupSelectedClips();
    }
    return true;
  }

  if (!command && event.altKey && key === 'g') {
    event.preventDefault();
    if (event.shiftKey) {
      context.onCloseAllGapsOnTrack();
    } else {
      context.onCloseGapAtPlayhead();
    }
    return true;
  }

  if (!command && event.altKey && key === 'p') {
    event.preventDefault();
    if (event.shiftKey) {
      context.onArrangeSelectedClips();
    } else {
      context.onArrangeSelectedClips(0);
    }
    return true;
  }

  if (!command && event.shiftKey && !event.altKey && key === 'g') {
    event.preventDefault();
    context.onInsertGapAtPlayhead();
    return true;
  }

  if (!command && key === 'a') {
    event.preventDefault();
    context.onSelectClipsRelativeToPlayhead(event.shiftKey ? 'left' : 'right', event.altKey);
    return true;
  }

  if (!command && key === 'd') {
    event.preventDefault();
    if (event.shiftKey) {
      context.onSelectMarkedRange(event.altKey);
    } else {
      context.onSelectClipAtPlayhead(event.altKey);
    }
    return true;
  }

  if (command && key === 'c') {
    event.preventDefault();
    if (event.shiftKey) {
      context.onCopyClipAttributes();
    } else {
      context.onCopySelected();
    }
    return true;
  }

  if (command && key === 'x') {
    event.preventDefault();
    context.onCutSelected();
    return true;
  }

  if (command && key === 'v') {
    event.preventDefault();
    if (event.shiftKey) {
      context.onPasteClipAttributes();
    } else {
      context.onPasteClipboard();
    }
    return true;
  }

  if (!command && event.shiftKey && key === 'v') {
    event.preventDefault();
    context.onPasteClipboardAtIn();
    return true;
  }

  if (command && key === 'e') {
    event.preventDefault();
    void context.onBuildExport();
    return true;
  }

  if (command && key === 'enter') {
    event.preventDefault();
    void context.onQueueRenderProject();
    return true;
  }

  if (!command && key === 'escape') {
    event.preventDefault();
    context.onEscape();
    return true;
  }

  if (!command && key === ' ') {
    event.preventDefault();
    if (context.activeMonitor === 'source') {
      context.onToggleSourcePlayback();
    } else {
      context.onToggleProgramPlayback();
    }
    return true;
  }

  if (!command && key === 'j') {
    event.preventDefault();
    context.onShuttlePlayback('reverse');
    return true;
  }

  if (!command && key === 'k') {
    event.preventDefault();
    context.onShuttlePlayback('stop');
    return true;
  }

  if (!command && event.shiftKey && key === 'l') {
    event.preventDefault();
    context.onToggleLoopPlayback();
    return true;
  }

  if (!command && !event.shiftKey && key === 'l') {
    event.preventDefault();
    context.onShuttlePlayback('forward');
    return true;
  }

  if (!command && (key === 'b' || key === 's')) {
    event.preventDefault();
    context.onSplit();
    return true;
  }

  if (!command && key === 'q') {
    event.preventDefault();
    context.onTrimToPlayhead('start');
    return true;
  }

  if (!command && key === 'w') {
    event.preventDefault();
    context.onTrimToPlayhead('end');
    return true;
  }

  if (!command && event.altKey && key === 'c') {
    event.preventDefault();
    context.onCopyMarkedRange(event.shiftKey);
    return true;
  }

  if (!command && !event.altKey && event.shiftKey && key === 'c') {
    event.preventDefault();
    context.onSplitActiveCaption();
    return true;
  }

  if (!command && (key === 'delete' || key === 'backspace')) {
    event.preventDefault();
    if (context.selectedCaptionCount > 0 && context.selectedClipCount === 0) {
      context.onDeleteSelectedCaptions();
      return true;
    }

    context.onDeleteSelected(event.shiftKey || context.rippleMode);
    return true;
  }

  if (!command && key === 'home') {
    event.preventDefault();
    if (context.activeMonitor === 'source') {
      context.onGoToSourceBoundary('start');
    } else {
      context.onSetTimelinePlayhead(0);
    }
    return true;
  }

  if (!command && key === 'end') {
    event.preventDefault();
    if (context.activeMonitor === 'source') {
      context.onGoToSourceBoundary('end');
    } else {
      context.onSetTimelinePlayhead(context.duration);
    }
    return true;
  }

  if (!command && !event.altKey && context.activeMonitor === 'program' && context.selectedCanUseProgramMonitorMotion && (
    key === 'arrowleft' || key === 'arrowright' || key === 'arrowup' || key === 'arrowdown'
  )) {
    event.preventDefault();
    const nudgeAmount = event.shiftKey ? 10 : 1;
    const deltaX = key === 'arrowleft' ? -nudgeAmount : key === 'arrowright' ? nudgeAmount : 0;
    const deltaY = key === 'arrowup' ? -nudgeAmount : key === 'arrowdown' ? nudgeAmount : 0;
    context.onProgramMotionNudge(deltaX, deltaY);
    return true;
  }

  if (!command && key === 'arrowleft') {
    event.preventDefault();
    if (event.altKey) {
      if (event.shiftKey) {
        context.onSlideSelected(-frameStep);
      } else {
        context.onMoveSelected(-frameStep);
      }
    } else {
      const deltaSeconds = event.shiftKey ? -1 : -frameStep;
      if (context.activeMonitor === 'source') {
        context.onNudgeSourcePlayhead(deltaSeconds);
      } else {
        context.onNudgePlayhead(deltaSeconds);
      }
    }
    return true;
  }

  if (!command && key === 'arrowright') {
    event.preventDefault();
    if (event.altKey) {
      if (event.shiftKey) {
        context.onSlideSelected(frameStep);
      } else {
        context.onMoveSelected(frameStep);
      }
    } else {
      const deltaSeconds = event.shiftKey ? 1 : frameStep;
      if (context.activeMonitor === 'source') {
        context.onNudgeSourcePlayhead(deltaSeconds);
      } else {
        context.onNudgePlayhead(deltaSeconds);
      }
    }
    return true;
  }

  if (!command && key === 'arrowup') {
    event.preventDefault();
    context.onJumpAdjacentEdit('previous', event.altKey);
    return true;
  }

  if (!command && key === 'arrowdown') {
    event.preventDefault();
    context.onJumpAdjacentEdit('next', event.altKey);
    return true;
  }

  if (!command && key === 'r') {
    event.preventDefault();
    context.onToggleRippleMode();
    return true;
  }

  if (!command && key === 'n') {
    event.preventDefault();
    context.onToggleSnapEnabled();
    return true;
  }

  if (!command && key === 'f') {
    event.preventDefault();
    context.onFitTimelineZoom(event.shiftKey ? 'selection' : 'timeline');
    return true;
  }

  if (!command && key === '[') {
    event.preventDefault();
    context.onJumpAdjacentMarker('previous');
    return true;
  }

  if (!command && key === ']') {
    event.preventDefault();
    context.onJumpAdjacentMarker('next');
    return true;
  }

  if (!command && event.shiftKey && event.altKey && key === 'm') {
    event.preventDefault();
    context.onMoveSelectionToPlayhead();
    return true;
  }

  if (!command && event.shiftKey && !event.altKey && key === 'm') {
    event.preventDefault();
    context.onMergeSelectedCaptions();
    return true;
  }

  if (!command && !event.shiftKey && key === 'm') {
    event.preventDefault();
    context.onAddMarkerAtPlayhead();
    return true;
  }

  if (!command && !event.altKey && key === ',') {
    event.preventDefault();
    context.onThreePointAssetEdit('insert');
    return true;
  }

  if (!command && !event.altKey && key === '.') {
    event.preventDefault();
    context.onThreePointAssetEdit('overwrite');
    return true;
  }

  if (!command && !event.altKey && !event.shiftKey && key === 'e') {
    event.preventDefault();
    context.onSetEditMode(context.editMode === 'overwrite' ? 'insert' : 'overwrite');
    return true;
  }

  if (!command && event.shiftKey && key === 'i') {
    event.preventDefault();
    if (context.activeMonitor === 'source') {
      context.onGoToSourceMark('in');
    } else {
      context.onGoToMark('in');
    }
    return true;
  }

  if (!command && event.shiftKey && key === 'o') {
    event.preventDefault();
    if (context.activeMonitor === 'source') {
      context.onGoToSourceMark('out');
    } else {
      context.onGoToMark('out');
    }
    return true;
  }

  if (!command && !event.shiftKey && key === 'i') {
    event.preventDefault();
    if (context.activeMonitor === 'source') {
      context.onSetSourceMark('in');
    } else {
      context.onSetMark('in');
    }
    return true;
  }

  if (!command && !event.shiftKey && key === 'o') {
    event.preventDefault();
    if (context.activeMonitor === 'source') {
      context.onSetSourceMark('out');
    } else {
      context.onSetMark('out');
    }
    return true;
  }

  if (!command && event.altKey && key === 'x') {
    event.preventDefault();
    context.onCutMarkedRange(event.shiftKey, context.rippleMode);
    return true;
  }

  if (!command && !event.altKey && !event.shiftKey && key === ';') {
    event.preventDefault();
    context.onDeleteMarkedRange(false);
    return true;
  }

  if (!command && !event.altKey && !event.shiftKey && key === "'") {
    event.preventDefault();
    context.onDeleteMarkedRange(true);
    return true;
  }

  if (!command && !event.altKey && event.shiftKey && key === 'x') {
    event.preventDefault();
    if (context.activeMonitor === 'source') {
      context.onClearSourceMarks();
    } else {
      context.onClearMarks();
    }
    return true;
  }

  if (!command && !event.altKey && !event.shiftKey && key === 'x') {
    event.preventDefault();
    context.onMarkSelectedClips();
    return true;
  }

  return false;
}

export function isEditorTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable;
}
