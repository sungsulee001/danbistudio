// Adapted from OpenCut Classic actions definitions/registry/types.
// Source: https://github.com/opencut-app/opencut-classic
// Commit: cf5e79e919144200294fb9fed22a222592a0aeea
// License: MIT. See third_party/NOTICE.md and docs/THIRD_PARTY_SOURCE_REGISTER_KR.md.

export type EditorCommandGroup = 'playback' | 'edit' | 'trim' | 'timeline' | 'source' | 'media' | 'export' | 'project' | 'view';

export type EditorCommandTrigger = 'keyboard' | 'mouse' | 'automation' | 'extension';

export interface EditorCommandDefinition {
  id: string;
  label: string;
  group: EditorCommandGroup;
  keys: string;
  defaultShortcuts: readonly string[];
  description?: string;
}

export const EDITOR_COMMANDS = [
  { id: 'project.save', label: 'Save project', group: 'project', keys: 'Ctrl+S', defaultShortcuts: ['ctrl+s'] },
  { id: 'view.commandPalette', label: 'Open command palette', group: 'view', keys: 'Ctrl+K', defaultShortcuts: ['ctrl+k'] },
  { id: 'playback.toggle', label: 'Play/Pause', group: 'playback', keys: 'Space', defaultShortcuts: ['space'] },
  { id: 'playback.shuttle', label: 'Shuttle active monitor', group: 'playback', keys: 'J / K / L', defaultShortcuts: ['j', 'k', 'l'] },
  { id: 'playback.loopMarkedRange', label: 'Loop marked range', group: 'playback', keys: 'Shift+L', defaultShortcuts: ['shift+l'] },
  { id: 'playback.timelineBoundary', label: 'Timeline start/end', group: 'playback', keys: 'Home / End', defaultShortcuts: ['home', 'end'] },
  { id: 'playback.nudgePlayhead', label: 'Move playhead', group: 'playback', keys: 'Arrow', defaultShortcuts: ['arrowleft', 'arrowright', 'shift+arrowleft', 'shift+arrowright'] },
  { id: 'program.nudgeLayer', label: 'Nudge selected Program layer', group: 'edit', keys: 'Arrow / Shift+Arrow in Program', defaultShortcuts: ['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'shift+arrowleft', 'shift+arrowright', 'shift+arrowup', 'shift+arrowdown'] },
  { id: 'playback.jumpAdjacentEdit', label: 'Previous/next edit point', group: 'playback', keys: 'Up / Down', defaultShortcuts: ['arrowup', 'arrowdown'] },
  { id: 'playback.jumpAdjacentEditAllTracks', label: 'Previous/next edit point on all tracks', group: 'playback', keys: 'Alt+Up / Alt+Down', defaultShortcuts: ['alt+arrowup', 'alt+arrowdown'] },
  { id: 'edit.split', label: 'Cut', group: 'edit', keys: 'B / S', defaultShortcuts: ['b', 's'] },
  { id: 'history.undo', label: 'Undo', group: 'edit', keys: 'Ctrl+Z', defaultShortcuts: ['ctrl+z'] },
  { id: 'history.redo', label: 'Redo', group: 'edit', keys: 'Ctrl+Y / Shift+Ctrl+Z', defaultShortcuts: ['ctrl+y', 'ctrl+shift+z'] },
  { id: 'selection.selectAll', label: 'Select all editable clips', group: 'edit', keys: 'Ctrl+A', defaultShortcuts: ['ctrl+a'] },
  { id: 'edit.duplicateSelection', label: 'Duplicate selected clips', group: 'edit', keys: 'Ctrl+D', defaultShortcuts: ['ctrl+d'] },
  { id: 'edit.groupSelection', label: 'Group clips', group: 'edit', keys: 'Ctrl+G', defaultShortcuts: ['ctrl+g'] },
  { id: 'edit.ungroupSelection', label: 'Ungroup clips', group: 'edit', keys: 'Ctrl+Shift+G', defaultShortcuts: ['ctrl+shift+g'] },
  { id: 'selection.selectAtPlayhead', label: 'Select clip at playhead / all tracks', group: 'edit', keys: 'D / Alt+D', defaultShortcuts: ['d', 'alt+d'] },
  { id: 'selection.selectMarkedRange', label: 'Select clips in marked range / all tracks', group: 'edit', keys: 'Shift+D / Shift+Alt+D', defaultShortcuts: ['shift+d', 'shift+alt+d'] },
  { id: 'selection.selectRelative', label: 'Select clips right/left', group: 'edit', keys: 'A / Shift+A', defaultShortcuts: ['a', 'shift+a'] },
  { id: 'selection.selectRelativeAllTracks', label: 'Select clips right/left on all tracks', group: 'edit', keys: 'Alt+A / Shift+Alt+A', defaultShortcuts: ['alt+a', 'shift+alt+a'] },
  { id: 'clipboard.copyCutPaste', label: 'Copy selected clips', group: 'edit', keys: 'Ctrl+C', defaultShortcuts: ['ctrl+c'] },
  { id: 'clipboard.cutSelection', label: 'Cut selected clips', group: 'edit', keys: 'Ctrl+X', defaultShortcuts: ['ctrl+x'] },
  { id: 'clipboard.pasteSelection', label: 'Paste at playhead', group: 'edit', keys: 'Ctrl+V', defaultShortcuts: ['ctrl+v'] },
  { id: 'clipboard.attributes', label: 'Copy clip attributes', group: 'edit', keys: 'Ctrl+Shift+C', defaultShortcuts: ['ctrl+shift+c'] },
  { id: 'clipboard.pasteAttributes', label: 'Paste clip attributes', group: 'edit', keys: 'Ctrl+Shift+V', defaultShortcuts: ['ctrl+shift+v'] },
  { id: 'clipboard.pasteAtIn', label: 'Paste at In point', group: 'edit', keys: 'Shift+V', defaultShortcuts: ['shift+v'] },
  { id: 'clipboard.appendSelection', label: 'Append clipboard to track end', group: 'edit', keys: 'Palette', defaultShortcuts: [] },
  { id: 'edit.packSelection', label: 'Pack/apply selected clip gap', group: 'edit', keys: 'Alt+P / Shift+Alt+P', defaultShortcuts: ['alt+p', 'shift+alt+p'] },
  { id: 'timeline.copyMarkedRange', label: 'Copy marked range / all tracks', group: 'edit', keys: 'Alt+C / Shift+Alt+C', defaultShortcuts: ['alt+c', 'shift+alt+c'] },
  { id: 'timeline.cutMarkedRange', label: 'Cut marked range / all tracks', group: 'edit', keys: 'Alt+X / Shift+Alt+X', defaultShortcuts: ['alt+x', 'shift+alt+x'] },
  { id: 'timeline.liftMarkedRange', label: 'Lift marked range', group: 'edit', keys: ';', defaultShortcuts: [';'], description: 'Delete the marked In/Out range and leave a gap' },
  { id: 'timeline.extractMarkedRange', label: 'Extract marked range', group: 'edit', keys: "'", defaultShortcuts: ["'"], description: 'Ripple delete the marked In/Out range' },
  { id: 'edit.escape', label: 'Clear selection/stop', group: 'edit', keys: 'Esc', defaultShortcuts: ['escape'] },
  { id: 'edit.deleteSelection', label: 'Delete', group: 'edit', keys: 'Del', defaultShortcuts: ['delete', 'backspace'] },
  { id: 'edit.rippleDeleteSelection', label: 'Ripple delete', group: 'edit', keys: 'Shift+Del', defaultShortcuts: ['shift+delete', 'shift+backspace'] },
  { id: 'edit.deleteLeftOfPlayhead', label: 'Delete left side to playhead', group: 'trim', keys: 'Palette', defaultShortcuts: [] },
  { id: 'edit.deleteRightOfPlayhead', label: 'Delete right side to playhead', group: 'trim', keys: 'Palette', defaultShortcuts: [] },
  { id: 'trim.toPlayhead', label: 'Trim head/tail', group: 'trim', keys: 'Q / W', defaultShortcuts: ['q', 'w'] },
  { id: 'trim.rollDrag', label: 'Roll trim', group: 'trim', keys: 'Alt+Drag clip edge', defaultShortcuts: [] },
  { id: 'trim.slipDrag', label: 'Slip edit', group: 'trim', keys: 'Alt+Drag clip', defaultShortcuts: [] },
  { id: 'trim.slideDrag', label: 'Slide edit', group: 'trim', keys: 'Shift+Alt+Drag clip', defaultShortcuts: [] },
  { id: 'trim.transitionDurationDrag', label: 'Adjust transition duration', group: 'trim', keys: 'Drag transition badge', defaultShortcuts: [] },
  { id: 'transition.applyCrossfade', label: 'Apply crossfade transition', group: 'edit', keys: 'Palette', defaultShortcuts: [] },
  { id: 'transition.applyDip', label: 'Apply dip transition', group: 'edit', keys: 'Palette', defaultShortcuts: [] },
  { id: 'transition.applyPush', label: 'Apply push transition', group: 'edit', keys: 'Palette', defaultShortcuts: [] },
  { id: 'transition.applyWipe', label: 'Apply wipe transition', group: 'edit', keys: 'Palette', defaultShortcuts: [] },
  { id: 'transition.applyAiMorph', label: 'Apply AI Morph transition', group: 'edit', keys: 'Palette', defaultShortcuts: [] },
  { id: 'keyframe.dragDot', label: 'Move timeline keyframe', group: 'edit', keys: 'Drag keyframe dot', defaultShortcuts: [] },
  { id: 'edit.moveSelection', label: 'Move clip', group: 'trim', keys: 'Alt+Arrow', defaultShortcuts: ['alt+arrowleft', 'alt+arrowright'] },
  { id: 'trim.slideSelection', label: 'Slide edit', group: 'trim', keys: 'Shift+Alt+Arrow', defaultShortcuts: ['shift+alt+arrowleft', 'shift+alt+arrowright'] },
  { id: 'trim.moveSelectionToPlayhead', label: 'Move selection to playhead', group: 'trim', keys: 'Shift+Alt+M', defaultShortcuts: ['shift+alt+m'] },
  { id: 'timeline.setMark', label: 'Mark In/Out', group: 'timeline', keys: 'I / O', defaultShortcuts: ['i', 'o'] },
  { id: 'timeline.goToMark', label: 'Go to In/Out', group: 'timeline', keys: 'Shift+I / Shift+O', defaultShortcuts: ['shift+i', 'shift+o'] },
  { id: 'timeline.markSelection', label: 'Mark selected clips', group: 'timeline', keys: 'X', defaultShortcuts: ['x'] },
  { id: 'timeline.clearMarks', label: 'Clear In/Out', group: 'timeline', keys: 'Shift+X', defaultShortcuts: ['shift+x'] },
  { id: 'timeline.addMarker', label: 'Add marker', group: 'timeline', keys: 'M', defaultShortcuts: ['m'] },
  { id: 'timeline.jumpAdjacentMarker', label: 'Previous/next marker', group: 'timeline', keys: '[ / ]', defaultShortcuts: ['[', ']'] },
  { id: 'timeline.dragMarker', label: 'Move timeline marker', group: 'timeline', keys: 'Drag marker', defaultShortcuts: [] },
  { id: 'caption.splitActive', label: 'Split active caption', group: 'timeline', keys: 'Shift+C', defaultShortcuts: ['shift+c'] },
  { id: 'caption.mergeSelected', label: 'Merge selected captions', group: 'timeline', keys: 'Shift+M', defaultShortcuts: ['shift+m'] },
  { id: 'source.goToStart', label: 'Go to source start', group: 'source', keys: 'Home when Source active', defaultShortcuts: [], description: 'Move the Source Monitor playhead to the beginning of the source asset' },
  { id: 'source.goToEnd', label: 'Go to source end', group: 'source', keys: 'End when Source active', defaultShortcuts: [], description: 'Move the Source Monitor playhead to the end of the source asset' },
  { id: 'source.nudgePlayhead', label: 'Move Source playhead', group: 'source', keys: 'Arrow when Source active', defaultShortcuts: [], description: 'Move the active Source Monitor playhead by one frame or one second with Shift' },
  { id: 'source.loopRange', label: 'Loop source range', group: 'source', keys: 'Shift+L when Source active', defaultShortcuts: [], description: 'Loop the active Source Monitor In/Out range' },
  { id: 'source.setIn', label: 'Set source In point', group: 'source', keys: 'I when Source active', defaultShortcuts: [], description: 'Set Source Monitor In point at the current source playhead' },
  { id: 'source.setOut', label: 'Set source Out point', group: 'source', keys: 'O when Source active', defaultShortcuts: [], description: 'Set Source Monitor Out point at the current source playhead' },
  { id: 'source.goToIn', label: 'Go to source In point', group: 'source', keys: 'Shift+I when Source active', defaultShortcuts: [], description: 'Move the Source Monitor playhead to the source In point' },
  { id: 'source.goToOut', label: 'Go to source Out point', group: 'source', keys: 'Shift+O when Source active', defaultShortcuts: [], description: 'Move the Source Monitor playhead to the source Out point' },
  { id: 'source.clearMarks', label: 'Clear source In/Out', group: 'source', keys: 'Shift+X when Source active', defaultShortcuts: [], description: 'Reset the active source range to the full media duration' },
  { id: 'source.matchFrame', label: 'Match frame to Source Monitor', group: 'source', keys: 'Palette', defaultShortcuts: [], description: 'Load the selected timeline clip source at the current Program Monitor frame' },
  { id: 'source.replaceSelected', label: 'Replace selected clip from Source Monitor', group: 'source', keys: 'Palette', defaultShortcuts: [], description: 'Replace the selected timeline clip with the active source range while preserving the timeline slot' },
  { id: 'timeline.threePointInsert', label: '3-point insert edit', group: 'timeline', keys: ',', defaultShortcuts: [','], description: '3P insert from Source Monitor to timeline In or playhead' },
  { id: 'timeline.threePointOverwrite', label: '3-point overwrite edit', group: 'timeline', keys: '.', defaultShortcuts: ['.'], description: '3P overwrite from Source Monitor to timeline In or playhead' },
  { id: 'timeline.toggleEditMode', label: 'Toggle insert/overwrite edit mode', group: 'timeline', keys: 'E', defaultShortcuts: ['e'], description: 'Toggle asset drop and clipboard paste mode between insert and overwrite' },
  { id: 'timeline.setInsertMode', label: 'Set insert edit mode', group: 'timeline', keys: 'Palette', defaultShortcuts: [], description: 'Use insert mode for asset drops and clipboard paste edits' },
  { id: 'timeline.setOverwriteMode', label: 'Set overwrite edit mode', group: 'timeline', keys: 'Palette', defaultShortcuts: [], description: 'Use overwrite mode for asset drops and clipboard paste edits' },
  { id: 'timeline.insertGap', label: 'Insert timeline gap', group: 'timeline', keys: 'Shift+G', defaultShortcuts: ['shift+g'] },
  { id: 'timeline.closeGap', label: 'Close gap at playhead', group: 'timeline', keys: 'Alt+G', defaultShortcuts: ['alt+g'] },
  { id: 'timeline.closeAllGaps', label: 'Close all gaps on selected track', group: 'timeline', keys: 'Shift+Alt+G', defaultShortcuts: ['shift+alt+g'] },
  { id: 'timeline.toggleSnapRipple', label: 'Snap/Ripple', group: 'timeline', keys: 'N / R', defaultShortcuts: ['n', 'r'] },
  { id: 'timeline.fitZoom', label: 'Fit timeline/selection zoom', group: 'timeline', keys: 'F / Shift+F', defaultShortcuts: ['f', 'shift+f'] },
  { id: 'media.relinkMissing', label: 'Relink missing media', group: 'media', keys: 'Palette', defaultShortcuts: [], description: 'Select replacement files for offline, volatile, or missing media assets' },
  { id: 'media.cacheSelectedClip', label: 'Cache selected clip media', group: 'media', keys: 'Palette', defaultShortcuts: [], description: 'Queue thumbnail, proxy, and waveform cache work for the selected clip asset' },
  { id: 'media.cacheActivePreview', label: 'Cache active preview media', group: 'media', keys: 'Palette', defaultShortcuts: [], description: 'Queue cache work for active Program Monitor video sources without proxies' },
  { id: 'export.buildPlan', label: 'Build export plan', group: 'export', keys: 'Ctrl+E', defaultShortcuts: ['ctrl+e'] },
  { id: 'export.queueRender', label: 'Queue render', group: 'export', keys: 'Ctrl+Enter', defaultShortcuts: ['ctrl+enter'] },
] as const satisfies readonly EditorCommandDefinition[];

export type EditorCommandId = typeof EDITOR_COMMANDS[number]['id'];

export interface EditorCommandPayloadMap {
  'playback.shuttle': { direction: 'reverse' | 'stop' | 'forward' };
  'playback.nudgePlayhead': { deltaSeconds: number };
  'playback.jumpAdjacentEdit': { direction: 'previous' | 'next'; includeAllTracks: boolean };
  'playback.jumpAdjacentEditAllTracks': { direction: 'previous' | 'next'; includeAllTracks: true };
  'program.nudgeLayer': { deltaX: number; deltaY: number };
  'edit.moveSelection': { deltaSeconds: number };
  'trim.slideSelection': { deltaSeconds: number };
  'trim.toPlayhead': { edge: 'start' | 'end' };
  'selection.selectAtPlayhead': { includeAllTracks: boolean };
  'selection.selectMarkedRange': { includeAllTracks: boolean };
  'selection.selectRelative': { direction: 'left' | 'right'; includeAllTracks: boolean };
  'selection.selectRelativeAllTracks': { direction: 'left' | 'right'; includeAllTracks: true };
  'timeline.copyMarkedRange': { includeAllTracks: boolean };
  'timeline.cutMarkedRange': { includeAllTracks: boolean; ripple: boolean };
  'timeline.setMark': { edge: 'in' | 'out' };
  'timeline.goToMark': { edge: 'in' | 'out' };
  'timeline.jumpAdjacentMarker': { direction: 'previous' | 'next' };
  'timeline.fitZoom': { mode: 'timeline' | 'selection' };
  'source.nudgePlayhead': { deltaSeconds: number };
}

type PayloadCommandId = keyof EditorCommandPayloadMap & EditorCommandId;

export type EditorCommandPayload<CommandId extends EditorCommandId> =
  CommandId extends PayloadCommandId ? EditorCommandPayloadMap[CommandId] : undefined;

export type EditorCommandHandler<CommandId extends EditorCommandId> = (
  payload: EditorCommandPayload<CommandId>,
  trigger?: EditorCommandTrigger,
) => void;

export interface EditorCommandRegistry {
  bind<CommandId extends EditorCommandId>(
    commandId: CommandId,
    handler: EditorCommandHandler<CommandId>,
  ): () => void;
  unbind<CommandId extends EditorCommandId>(
    commandId: CommandId,
    handler: EditorCommandHandler<CommandId>,
  ): void;
  invoke<CommandId extends EditorCommandId>(
    commandId: CommandId,
    payload?: EditorCommandPayload<CommandId>,
    trigger?: EditorCommandTrigger,
  ): number;
  count(commandId: EditorCommandId): number;
}

const COMMAND_DEFINITIONS_BY_ID = new Map<EditorCommandId, typeof EDITOR_COMMANDS[number]>(
  EDITOR_COMMANDS.map((command) => [command.id, command]),
);

export function listEditorCommands(): typeof EDITOR_COMMANDS {
  return EDITOR_COMMANDS;
}

export function getEditorCommandDefinition(commandId: EditorCommandId): typeof EDITOR_COMMANDS[number] {
  const command = COMMAND_DEFINITIONS_BY_ID.get(commandId);
  if (!command) {
    throw new Error(`Unknown editor command: ${commandId}`);
  }

  return command;
}

/**
 * How a command is invoked, phrased for a tooltip: `"Slip edit — Alt+Drag clip"`.
 *
 * The gestures were implemented but never surfaced, so the editor grew a
 * parallel grid of 40 frame-nudge buttons to reach the same operations. The
 * registry already records the real trigger for every command, so hints are
 * read from here rather than retyped into each control — a binding cannot drift
 * from its tooltip if there is only one copy of it.
 */
export function describeEditorCommandGesture(commandId: EditorCommandId): string {
  // `keys` is required on every definition, so there is no unlabelled case.
  const command = getEditorCommandDefinition(commandId);
  return `${command.label} — ${command.keys}`;
}

/** The same, joined for controls that carry several gestures at once. */
export function describeEditorCommandGestures(commandIds: readonly EditorCommandId[]): string {
  return commandIds.map(describeEditorCommandGesture).join('\n');
}

export function normalizeEditorShortcut(shortcut: string): string {
  return shortcut
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/cmd\+/g, 'meta+');
}

export function getEditorDefaultShortcutMap(): Map<string, EditorCommandId[]> {
  const shortcuts = new Map<string, EditorCommandId[]>();

  for (const command of EDITOR_COMMANDS) {
    for (const shortcut of command.defaultShortcuts) {
      const normalizedShortcut = normalizeEditorShortcut(shortcut);
      const commands = shortcuts.get(normalizedShortcut) ?? [];
      shortcuts.set(normalizedShortcut, [...commands, command.id]);
    }
  }

  return shortcuts;
}

export function findEditorCommandsByShortcut(shortcut: string): EditorCommandId[] {
  return getEditorDefaultShortcutMap().get(normalizeEditorShortcut(shortcut)) ?? [];
}

export interface EditorCommandSurfaceShortcutRequirement {
  shortcut: string;
  commandId: EditorCommandId;
}

export interface EditorCommandSurfaceRequirement {
  id: string;
  label: string;
  commandIds: readonly EditorCommandId[];
  shortcutRequirements?: readonly EditorCommandSurfaceShortcutRequirement[];
}

export interface EditorCommandSurfaceAuditIssue {
  type: 'missing-command' | 'missing-shortcut';
  requirementId: string;
  requirementLabel: string;
  commandId: EditorCommandId;
  shortcut?: string;
  message: string;
}

export interface EditorCommandSurfaceAuditReport {
  status: 'passed' | 'failed';
  commandCount: number;
  requirementCount: number;
  requiredCommandCount: number;
  coveredCommandCount: number;
  shortcutRequirementCount: number;
  coveredShortcutRequirementCount: number;
  missingCommandIds: EditorCommandId[];
  issues: EditorCommandSurfaceAuditIssue[];
}

export const EDITOR_COMMAND_SURFACE_REQUIREMENTS: readonly EditorCommandSurfaceRequirement[] = [
  {
    id: 'project-and-view',
    label: 'Project save and command discovery',
    commandIds: ['project.save', 'view.commandPalette'],
    shortcutRequirements: [
      { shortcut: 'ctrl+s', commandId: 'project.save' },
      { shortcut: 'ctrl+k', commandId: 'view.commandPalette' },
    ],
  },
  {
    id: 'playback-monitoring',
    label: 'Program and Source monitor playback',
    commandIds: [
      'playback.toggle',
      'playback.shuttle',
      'playback.loopMarkedRange',
      'playback.timelineBoundary',
      'playback.nudgePlayhead',
      'playback.jumpAdjacentEdit',
      'playback.jumpAdjacentEditAllTracks',
      'program.nudgeLayer',
    ],
    shortcutRequirements: [
      { shortcut: 'space', commandId: 'playback.toggle' },
      { shortcut: 'shift+l', commandId: 'playback.loopMarkedRange' },
      { shortcut: 'home', commandId: 'playback.timelineBoundary' },
      { shortcut: 'end', commandId: 'playback.timelineBoundary' },
      { shortcut: 'arrowup', commandId: 'playback.jumpAdjacentEdit' },
      { shortcut: 'alt+arrowup', commandId: 'playback.jumpAdjacentEditAllTracks' },
    ],
  },
  {
    id: 'core-clip-editing',
    label: 'Core clip editing and selection',
    commandIds: [
      'edit.split',
      'history.undo',
      'history.redo',
      'selection.selectAll',
      'edit.duplicateSelection',
      'edit.groupSelection',
      'edit.ungroupSelection',
      'selection.selectAtPlayhead',
      'selection.selectMarkedRange',
      'selection.selectRelative',
      'selection.selectRelativeAllTracks',
      'edit.escape',
      'edit.deleteSelection',
      'edit.rippleDeleteSelection',
    ],
    shortcutRequirements: [
      { shortcut: 'b', commandId: 'edit.split' },
      { shortcut: 'ctrl+z', commandId: 'history.undo' },
      { shortcut: 'ctrl+y', commandId: 'history.redo' },
      { shortcut: 'ctrl+shift+z', commandId: 'history.redo' },
      { shortcut: 'ctrl+a', commandId: 'selection.selectAll' },
      { shortcut: 'ctrl+d', commandId: 'edit.duplicateSelection' },
      { shortcut: 'ctrl+g', commandId: 'edit.groupSelection' },
      { shortcut: 'ctrl+shift+g', commandId: 'edit.ungroupSelection' },
      { shortcut: 'delete', commandId: 'edit.deleteSelection' },
      { shortcut: 'shift+delete', commandId: 'edit.rippleDeleteSelection' },
    ],
  },
  {
    id: 'clipboard-editing',
    label: 'Clipboard, attributes, and append editing',
    commandIds: [
      'clipboard.copyCutPaste',
      'clipboard.cutSelection',
      'clipboard.pasteSelection',
      'clipboard.attributes',
      'clipboard.pasteAttributes',
      'clipboard.pasteAtIn',
      'clipboard.appendSelection',
      'edit.packSelection',
    ],
    shortcutRequirements: [
      { shortcut: 'ctrl+c', commandId: 'clipboard.copyCutPaste' },
      { shortcut: 'ctrl+x', commandId: 'clipboard.cutSelection' },
      { shortcut: 'ctrl+v', commandId: 'clipboard.pasteSelection' },
      { shortcut: 'ctrl+shift+c', commandId: 'clipboard.attributes' },
      { shortcut: 'ctrl+shift+v', commandId: 'clipboard.pasteAttributes' },
      { shortcut: 'shift+v', commandId: 'clipboard.pasteAtIn' },
      { shortcut: 'alt+p', commandId: 'edit.packSelection' },
      { shortcut: 'shift+alt+p', commandId: 'edit.packSelection' },
    ],
  },
  {
    id: 'range-and-gap-editing',
    label: 'Marked range, timeline gap, and ripple editing',
    commandIds: [
      'timeline.copyMarkedRange',
      'timeline.cutMarkedRange',
      'timeline.liftMarkedRange',
      'timeline.extractMarkedRange',
      'timeline.insertGap',
      'timeline.closeGap',
      'timeline.closeAllGaps',
    ],
    shortcutRequirements: [
      { shortcut: 'alt+c', commandId: 'timeline.copyMarkedRange' },
      { shortcut: 'alt+x', commandId: 'timeline.cutMarkedRange' },
      { shortcut: ';', commandId: 'timeline.liftMarkedRange' },
      { shortcut: "'", commandId: 'timeline.extractMarkedRange' },
      { shortcut: 'shift+g', commandId: 'timeline.insertGap' },
      { shortcut: 'alt+g', commandId: 'timeline.closeGap' },
      { shortcut: 'shift+alt+g', commandId: 'timeline.closeAllGaps' },
    ],
  },
  {
    id: 'precision-trim-editing',
    label: 'Precision trim, slip, slide, roll, and delete-side editing',
    commandIds: [
      'trim.toPlayhead',
      'trim.rollDrag',
      'trim.slipDrag',
      'trim.slideDrag',
      'trim.transitionDurationDrag',
      'edit.deleteLeftOfPlayhead',
      'edit.deleteRightOfPlayhead',
      'edit.moveSelection',
      'trim.slideSelection',
      'trim.moveSelectionToPlayhead',
    ],
    shortcutRequirements: [
      { shortcut: 'q', commandId: 'trim.toPlayhead' },
      { shortcut: 'w', commandId: 'trim.toPlayhead' },
      { shortcut: 'alt+arrowleft', commandId: 'edit.moveSelection' },
      { shortcut: 'shift+alt+arrowleft', commandId: 'trim.slideSelection' },
      { shortcut: 'shift+alt+m', commandId: 'trim.moveSelectionToPlayhead' },
    ],
  },
  {
    id: 'transition-editing',
    label: 'Timeline transition application',
    commandIds: [
      'transition.applyCrossfade',
      'transition.applyDip',
      'transition.applyPush',
      'transition.applyWipe',
      'transition.applyAiMorph',
    ],
  },
  {
    id: 'timeline-annotation-and-navigation',
    label: 'Timeline marks, markers, zoom, and edit mode',
    commandIds: [
      'timeline.setMark',
      'timeline.goToMark',
      'timeline.markSelection',
      'timeline.clearMarks',
      'timeline.addMarker',
      'timeline.jumpAdjacentMarker',
      'timeline.dragMarker',
      'caption.splitActive',
      'caption.mergeSelected',
      'timeline.toggleSnapRipple',
      'timeline.fitZoom',
    ],
    shortcutRequirements: [
      { shortcut: 'i', commandId: 'timeline.setMark' },
      { shortcut: 'o', commandId: 'timeline.setMark' },
      { shortcut: 'x', commandId: 'timeline.markSelection' },
      { shortcut: 'shift+x', commandId: 'timeline.clearMarks' },
      { shortcut: 'm', commandId: 'timeline.addMarker' },
      { shortcut: '[', commandId: 'timeline.jumpAdjacentMarker' },
      { shortcut: ']', commandId: 'timeline.jumpAdjacentMarker' },
      { shortcut: 'n', commandId: 'timeline.toggleSnapRipple' },
      { shortcut: 'f', commandId: 'timeline.fitZoom' },
      { shortcut: 'shift+f', commandId: 'timeline.fitZoom' },
    ],
  },
  {
    id: 'source-and-three-point-editing',
    label: 'Source Monitor and 3-point editing',
    commandIds: [
      'source.goToStart',
      'source.goToEnd',
      'source.nudgePlayhead',
      'source.loopRange',
      'source.setIn',
      'source.setOut',
      'source.goToIn',
      'source.goToOut',
      'source.clearMarks',
      'source.matchFrame',
      'source.replaceSelected',
      'timeline.threePointInsert',
      'timeline.threePointOverwrite',
      'timeline.toggleEditMode',
      'timeline.setInsertMode',
      'timeline.setOverwriteMode',
    ],
    shortcutRequirements: [
      { shortcut: ',', commandId: 'timeline.threePointInsert' },
      { shortcut: '.', commandId: 'timeline.threePointOverwrite' },
      { shortcut: 'e', commandId: 'timeline.toggleEditMode' },
    ],
  },
  {
    id: 'media-cache-and-export',
    label: 'Media cache and export',
    commandIds: [
      'media.relinkMissing',
      'media.cacheSelectedClip',
      'media.cacheActivePreview',
      'export.buildPlan',
      'export.queueRender',
    ],
    shortcutRequirements: [
      { shortcut: 'ctrl+e', commandId: 'export.buildPlan' },
      { shortcut: 'ctrl+enter', commandId: 'export.queueRender' },
    ],
  },
];

export function auditEditorCommandSurface(): EditorCommandSurfaceAuditReport {
  const commandIds = new Set<EditorCommandId>(EDITOR_COMMANDS.map((command) => command.id));
  const defaultShortcuts = getEditorDefaultShortcutMap();
  const requiredCommandIds = new Set<EditorCommandId>();
  const coveredCommandIds = new Set<EditorCommandId>();
  let shortcutRequirementCount = 0;
  let coveredShortcutRequirementCount = 0;
  const issues: EditorCommandSurfaceAuditIssue[] = [];

  for (const requirement of EDITOR_COMMAND_SURFACE_REQUIREMENTS) {
    for (const commandId of requirement.commandIds) {
      requiredCommandIds.add(commandId);
      if (commandIds.has(commandId)) {
        coveredCommandIds.add(commandId);
        continue;
      }

      issues.push({
        type: 'missing-command',
        requirementId: requirement.id,
        requirementLabel: requirement.label,
        commandId,
        message: `${requirement.label} is missing editor command ${commandId}.`,
      });
    }

    for (const shortcutRequirement of requirement.shortcutRequirements ?? []) {
      shortcutRequirementCount += 1;
      const normalizedShortcut = normalizeEditorShortcut(shortcutRequirement.shortcut);
      if (defaultShortcuts.get(normalizedShortcut)?.includes(shortcutRequirement.commandId)) {
        coveredShortcutRequirementCount += 1;
        continue;
      }

      issues.push({
        type: 'missing-shortcut',
        requirementId: requirement.id,
        requirementLabel: requirement.label,
        commandId: shortcutRequirement.commandId,
        shortcut: normalizedShortcut,
        message: `${requirement.label} expects shortcut ${normalizedShortcut} for ${shortcutRequirement.commandId}.`,
      });
    }
  }

  return {
    status: issues.length === 0 ? 'passed' : 'failed',
    commandCount: EDITOR_COMMANDS.length,
    requirementCount: EDITOR_COMMAND_SURFACE_REQUIREMENTS.length,
    requiredCommandCount: requiredCommandIds.size,
    coveredCommandCount: coveredCommandIds.size,
    shortcutRequirementCount,
    coveredShortcutRequirementCount,
    missingCommandIds: Array.from(requiredCommandIds).filter((commandId) => !commandIds.has(commandId)),
    issues,
  };
}

export function createEditorCommandRegistry(): EditorCommandRegistry {
  const handlers = new Map<EditorCommandId, Set<EditorCommandHandler<EditorCommandId>>>();

  return {
    bind(commandId, handler) {
      const commandHandlers = handlers.get(commandId) ?? new Set<EditorCommandHandler<EditorCommandId>>();
      commandHandlers.add(handler as EditorCommandHandler<EditorCommandId>);
      handlers.set(commandId, commandHandlers);

      return () => {
        this.unbind(commandId, handler);
      };
    },
    unbind(commandId, handler) {
      const commandHandlers = handlers.get(commandId);
      if (!commandHandlers) {
        return;
      }

      commandHandlers.delete(handler as EditorCommandHandler<EditorCommandId>);
      if (commandHandlers.size === 0) {
        handlers.delete(commandId);
      }
    },
    invoke(commandId, payload, trigger) {
      const commandHandlers = handlers.get(commandId);
      if (!commandHandlers) {
        return 0;
      }

      for (const handler of commandHandlers) {
        handler(payload as never, trigger);
      }

      return commandHandlers.size;
    },
    count(commandId) {
      return handlers.get(commandId)?.size ?? 0;
    },
  };
}
