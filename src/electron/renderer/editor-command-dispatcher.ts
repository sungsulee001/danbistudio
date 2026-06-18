import type { EditorCommandId } from '../../lib/editor/command-registry';
import type { CommandPaletteItemPayload } from './command-palette-helpers';
import type { ShuttleDirection } from './playback-workflow-helpers';

type EditorEditMode = 'insert' | 'overwrite';
type TimelineMarkEdge = 'in' | 'out';
type TimelineDirection = 'left' | 'right';
type AdjacentDirection = 'previous' | 'next';
type SourceBoundary = 'start' | 'end';
type SourceEditMode = 'insert' | 'overwrite';
type TimelineFitMode = 'timeline' | 'selection';
type TimelineTransitionType = 'crossfade' | 'dip' | 'push' | 'wipe' | 'ai-morph';
type CommandAction = () => void;
type AsyncCommandAction = () => void | Promise<void>;
type PaletteCommandPayload = CommandPaletteItemPayload;

export interface EditorPaletteCommandState {
  editMode: EditorEditMode;
  playhead: number;
  projectDuration: number;
  projectFps: number;
  rippleMode: boolean;
  activePreviewCacheAssetIds: string[];
}

export interface EditorPaletteCommandActions {
  resetCommandPalette: CommandAction;
  saveProject: AsyncCommandAction;
  openCommandPalette: CommandAction;
  toggleActiveMonitorPlayback: CommandAction;
  shuttlePlayback: (direction: ShuttleDirection) => void;
  toggleLoopPlayback: CommandAction;
  setTimelinePlayhead: (time: number) => void;
  nudgePlayhead: (deltaSeconds: number) => void;
  nudgeProgramLayer: (deltaX: number, deltaY: number) => void;
  jumpAdjacentEdit: (direction: AdjacentDirection, allTracks?: boolean) => void;
  split: CommandAction;
  undo: CommandAction;
  redo: CommandAction;
  selectAllClips: CommandAction;
  duplicateSelection: CommandAction;
  groupSelection: CommandAction;
  ungroupSelection: CommandAction;
  selectClipAtPlayhead: (allTracks?: boolean) => void;
  selectMarkedRange: (allTracks?: boolean) => void;
  selectClipsRelativeToPlayhead: (direction: TimelineDirection, allTracks?: boolean) => void;
  copySelected: CommandAction;
  cutSelected: CommandAction;
  pasteClipboard: CommandAction;
  copyClipAttributes: CommandAction;
  pasteClipAttributes: CommandAction;
  pasteClipboardAtIn: CommandAction;
  appendClipboard: CommandAction;
  arrangeSelectedClips: (gapSeconds?: number) => void;
  copyMarkedRange: (allTracks?: boolean) => void;
  cutMarkedRange: (allTracks?: boolean, ripple?: boolean) => void;
  deleteMarkedRange: (ripple: boolean) => void;
  escape: CommandAction;
  deleteSelected: (ripple?: boolean) => void;
  deleteSide: (side: 'left' | 'right') => void;
  trimToPlayhead: (edge: 'start' | 'end') => void;
  setStatus: (status: string) => void;
  moveSelected: (deltaSeconds: number) => void;
  slideSelected: (deltaSeconds: number) => void;
  applyTransition: (type: TimelineTransitionType) => void;
  moveSelectionToPlayhead: CommandAction;
  setMark: (type: TimelineMarkEdge) => void;
  goToMark: (type: TimelineMarkEdge) => void;
  markSelectedClips: CommandAction;
  clearMarks: CommandAction;
  addMarkerAtPlayhead: CommandAction;
  jumpAdjacentMarker: (direction: AdjacentDirection) => void;
  splitActiveCaption: CommandAction;
  mergeSelectedCaptions: CommandAction;
  nudgeSourcePlayhead: (deltaSeconds: number) => void;
  toggleSourceLoopPlayback: CommandAction;
  goToSourceBoundary: (edge: SourceBoundary) => void;
  setSourceMark: (type: TimelineMarkEdge) => void;
  goToSourceMark: (type: TimelineMarkEdge) => void;
  clearSourceMarks: CommandAction;
  matchFrameToSource: CommandAction;
  replaceSelectedFromSource: CommandAction;
  threePointAssetEdit: (mode: SourceEditMode) => void;
  editModeChange: (mode: EditorEditMode) => void;
  insertGapAtPlayhead: CommandAction;
  closeGapAtPlayhead: CommandAction;
  closeAllGapsOnTrack: CommandAction;
  toggleSnapRipple: CommandAction;
  fitTimelineZoom: (mode?: TimelineFitMode) => void;
  relinkMissingMedia: AsyncCommandAction;
  rebuildSelectedMediaCache: AsyncCommandAction;
  rebuildPreviewMediaCache: (assetIds: string[]) => void | Promise<void>;
  buildExport: AsyncCommandAction;
  queueRender: AsyncCommandAction;
}

export interface EditorPaletteCommandDispatchContext {
  state: EditorPaletteCommandState;
  actions: EditorPaletteCommandActions;
}

export function runEditorPaletteCommand(
  commandId: EditorCommandId,
  context: EditorPaletteCommandDispatchContext,
  payload?: PaletteCommandPayload,
): void {
  const { actions, state } = context;
  actions.resetCommandPalette();

  switch (commandId) {
    case 'project.save':
      void actions.saveProject();
      return;
    case 'view.commandPalette':
      actions.openCommandPalette();
      return;
    case 'playback.toggle':
      actions.toggleActiveMonitorPlayback();
      return;
    case 'playback.shuttle':
      actions.shuttlePlayback(readPayloadValue(payload, 'direction', 'forward') as ShuttleDirection);
      return;
    case 'playback.loopMarkedRange':
      actions.toggleLoopPlayback();
      return;
    case 'playback.timelineBoundary':
      actions.setTimelinePlayhead(state.playhead > 0 ? 0 : state.projectDuration);
      return;
    case 'playback.nudgePlayhead':
      actions.nudgePlayhead(readDeltaSeconds(payload, state.projectFps, 1 / state.projectFps));
      return;
    case 'program.nudgeLayer':
      actions.nudgeProgramLayer(
        readPayloadValue(payload, 'deltaX', 1),
        readPayloadValue(payload, 'deltaY', 0),
      );
      return;
    case 'playback.jumpAdjacentEdit':
      actions.jumpAdjacentEdit(
        readPayloadValue(payload, 'direction', 'next') as AdjacentDirection,
        readPayloadValue(payload, 'includeAllTracks', false),
      );
      return;
    case 'playback.jumpAdjacentEditAllTracks':
      actions.jumpAdjacentEdit(
        readPayloadValue(payload, 'direction', 'next') as AdjacentDirection,
        true,
      );
      return;
    case 'edit.split':
      actions.split();
      return;
    case 'history.undo':
      actions.undo();
      return;
    case 'history.redo':
      actions.redo();
      return;
    case 'selection.selectAll':
      actions.selectAllClips();
      return;
    case 'edit.duplicateSelection':
      actions.duplicateSelection();
      return;
    case 'edit.groupSelection':
      actions.groupSelection();
      return;
    case 'edit.ungroupSelection':
      actions.ungroupSelection();
      return;
    case 'selection.selectAtPlayhead':
      actions.selectClipAtPlayhead(readPayloadValue(payload, 'includeAllTracks', false));
      return;
    case 'selection.selectMarkedRange':
      actions.selectMarkedRange(readPayloadValue(payload, 'includeAllTracks', false));
      return;
    case 'selection.selectRelative':
      actions.selectClipsRelativeToPlayhead(
        readPayloadValue(payload, 'direction', 'right') as TimelineDirection,
        readPayloadValue(payload, 'includeAllTracks', false),
      );
      return;
    case 'selection.selectRelativeAllTracks':
      actions.selectClipsRelativeToPlayhead(
        readPayloadValue(payload, 'direction', 'right') as TimelineDirection,
        true,
      );
      return;
    case 'clipboard.copyCutPaste':
      actions.copySelected();
      return;
    case 'clipboard.cutSelection':
      actions.cutSelected();
      return;
    case 'clipboard.pasteSelection':
      actions.pasteClipboard();
      return;
    case 'clipboard.attributes':
      actions.copyClipAttributes();
      return;
    case 'clipboard.pasteAttributes':
      actions.pasteClipAttributes();
      return;
    case 'clipboard.pasteAtIn':
      actions.pasteClipboardAtIn();
      return;
    case 'clipboard.appendSelection':
      actions.appendClipboard();
      return;
    case 'edit.packSelection':
      actions.arrangeSelectedClips(0);
      return;
    case 'timeline.copyMarkedRange':
      actions.copyMarkedRange(readPayloadValue(payload, 'includeAllTracks', false));
      return;
    case 'timeline.cutMarkedRange':
      actions.cutMarkedRange(
        readPayloadValue(payload, 'includeAllTracks', false),
        readPayloadValue(payload, 'ripple', state.rippleMode),
      );
      return;
    case 'timeline.liftMarkedRange':
      actions.deleteMarkedRange(false);
      return;
    case 'timeline.extractMarkedRange':
      actions.deleteMarkedRange(true);
      return;
    case 'edit.escape':
      actions.escape();
      return;
    case 'edit.deleteSelection':
      actions.deleteSelected(false);
      return;
    case 'edit.rippleDeleteSelection':
      actions.deleteSelected(true);
      return;
    case 'edit.deleteLeftOfPlayhead':
      actions.deleteSide('left');
      return;
    case 'edit.deleteRightOfPlayhead':
      actions.deleteSide('right');
      return;
    case 'trim.toPlayhead':
      actions.trimToPlayhead(readPayloadValue(payload, 'edge', 'start') as SourceBoundary);
      return;
    case 'trim.rollDrag':
      actions.setStatus('Roll trim: Alt+drag a clip edge');
      return;
    case 'trim.slipDrag':
      actions.setStatus('Slip edit: Alt+drag a clip body');
      return;
    case 'trim.slideDrag':
      actions.setStatus('Slide edit: Shift+Alt+drag a clip body');
      return;
    case 'trim.transitionDurationDrag':
      actions.setStatus('Transition duration: drag a transition badge on the timeline');
      return;
    case 'transition.applyCrossfade':
      actions.applyTransition('crossfade');
      return;
    case 'transition.applyDip':
      actions.applyTransition('dip');
      return;
    case 'transition.applyPush':
      actions.applyTransition('push');
      return;
    case 'transition.applyWipe':
      actions.applyTransition('wipe');
      return;
    case 'transition.applyAiMorph':
      actions.applyTransition('ai-morph');
      return;
    case 'keyframe.dragDot':
      actions.setStatus('Keyframe move: drag a keyframe dot on the timeline clip');
      return;
    case 'edit.moveSelection':
      actions.moveSelected(readDeltaSeconds(payload, state.projectFps, 1 / state.projectFps));
      return;
    case 'trim.slideSelection':
      actions.slideSelected(readDeltaSeconds(payload, state.projectFps, 1 / state.projectFps));
      return;
    case 'trim.moveSelectionToPlayhead':
      actions.moveSelectionToPlayhead();
      return;
    case 'timeline.setMark':
      actions.setMark(readPayloadValue(payload, 'edge', 'in') as TimelineMarkEdge);
      return;
    case 'timeline.goToMark':
      actions.goToMark(readPayloadValue(payload, 'edge', 'in') as TimelineMarkEdge);
      return;
    case 'timeline.markSelection':
      actions.markSelectedClips();
      return;
    case 'timeline.clearMarks':
      actions.clearMarks();
      return;
    case 'timeline.addMarker':
      actions.addMarkerAtPlayhead();
      return;
    case 'timeline.jumpAdjacentMarker':
      actions.jumpAdjacentMarker(readPayloadValue(payload, 'direction', 'next') as AdjacentDirection);
      return;
    case 'timeline.dragMarker':
      actions.setStatus('Marker move: drag a marker on the ruler');
      return;
    case 'caption.splitActive':
      actions.splitActiveCaption();
      return;
    case 'caption.mergeSelected':
      actions.mergeSelectedCaptions();
      return;
    case 'source.nudgePlayhead':
      actions.nudgeSourcePlayhead(readDeltaSeconds(payload, state.projectFps, 1 / state.projectFps));
      return;
    case 'source.loopRange':
      actions.toggleSourceLoopPlayback();
      return;
    case 'source.goToStart':
      actions.goToSourceBoundary('start');
      return;
    case 'source.goToEnd':
      actions.goToSourceBoundary('end');
      return;
    case 'source.setIn':
      actions.setSourceMark('in');
      return;
    case 'source.setOut':
      actions.setSourceMark('out');
      return;
    case 'source.goToIn':
      actions.goToSourceMark('in');
      return;
    case 'source.goToOut':
      actions.goToSourceMark('out');
      return;
    case 'source.clearMarks':
      actions.clearSourceMarks();
      return;
    case 'source.matchFrame':
      actions.matchFrameToSource();
      return;
    case 'source.replaceSelected':
      actions.replaceSelectedFromSource();
      return;
    case 'timeline.threePointInsert':
      actions.threePointAssetEdit('insert');
      return;
    case 'timeline.threePointOverwrite':
      actions.threePointAssetEdit('overwrite');
      return;
    case 'timeline.toggleEditMode':
      actions.editModeChange(state.editMode === 'overwrite' ? 'insert' : 'overwrite');
      return;
    case 'timeline.setInsertMode':
      actions.editModeChange('insert');
      return;
    case 'timeline.setOverwriteMode':
      actions.editModeChange('overwrite');
      return;
    case 'timeline.insertGap':
      actions.insertGapAtPlayhead();
      return;
    case 'timeline.closeGap':
      actions.closeGapAtPlayhead();
      return;
    case 'timeline.closeAllGaps':
      actions.closeAllGapsOnTrack();
      return;
    case 'timeline.toggleSnapRipple':
      actions.toggleSnapRipple();
      return;
    case 'timeline.fitZoom':
      actions.fitTimelineZoom(readPayloadValue(payload, 'mode', 'timeline') as TimelineFitMode);
      return;
    case 'media.relinkMissing':
      void actions.relinkMissingMedia();
      return;
    case 'media.cacheSelectedClip':
      void actions.rebuildSelectedMediaCache();
      return;
    case 'media.cacheActivePreview':
      void actions.rebuildPreviewMediaCache(state.activePreviewCacheAssetIds);
      return;
    case 'export.buildPlan':
      void actions.buildExport();
      return;
    case 'export.queueRender':
      void actions.queueRender();
      return;
    default: {
      const exhaustive: never = commandId;
      actions.setStatus(`Unhandled command: ${exhaustive}`);
    }
  }
}

function readPayloadValue<T>(payload: PaletteCommandPayload | undefined, key: string, fallback: T): T {
  if (!payload || typeof payload !== 'object' || !(key in payload)) {
    return fallback;
  }

  return (payload as Record<string, T>)[key] ?? fallback;
}

function readDeltaSeconds(
  payload: PaletteCommandPayload | undefined,
  fps: number,
  fallback: number,
): number {
  const frameDelta = readPayloadValue<number | null>(payload, 'deltaFrames', null);
  if (typeof frameDelta === 'number' && Number.isFinite(frameDelta) && fps > 0) {
    return frameDelta / fps;
  }

  return readPayloadValue(payload, 'deltaSeconds', fallback);
}
