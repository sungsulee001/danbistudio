import {
  listEditorCommands,
  type EditorCommandGroup,
  type EditorCommandId,
  type EditorCommandPayload,
} from '../../lib/editor/command-registry';

type FrameDeltaCommandId = Extract<
  EditorCommandId,
  'playback.nudgePlayhead' | 'source.nudgePlayhead' | 'edit.moveSelection' | 'trim.slideSelection'
>;

type CommandPalettePayloadFor<CommandId extends EditorCommandId> =
  EditorCommandPayload<CommandId> extends undefined
    ? never
    : Partial<EditorCommandPayload<CommandId>> & (CommandId extends FrameDeltaCommandId
      ? { deltaFrames?: number }
      : unknown);

export type CommandPaletteItemPayload = {
  [CommandId in EditorCommandId]: CommandPalettePayloadFor<CommandId>
}[EditorCommandId];

export interface CommandPaletteItem {
  key: string;
  id: EditorCommandId;
  label: string;
  group: EditorCommandGroup;
  keys: string;
  description?: string;
  payload?: CommandPaletteItemPayload;
  searchText: string;
}

type CommandPaletteVariant = {
  [CommandId in EditorCommandId]: CommandPalettePayloadFor<CommandId> extends never
    ? never
    : {
      commandId: CommandId;
      keySuffix: string;
      label: string;
      keys: string;
      payload: CommandPalettePayloadFor<CommandId>;
      description?: string;
      aliases?: readonly string[];
    }
}[EditorCommandId];

const COMMAND_PALETTE_VARIANTS = [
  {
    commandId: 'playback.shuttle',
    keySuffix: 'reverse',
    label: 'Shuttle reverse',
    keys: 'J',
    payload: { direction: 'reverse' },
    aliases: ['rewind jog backward'],
  },
  {
    commandId: 'playback.shuttle',
    keySuffix: 'stop',
    label: 'Stop shuttle playback',
    keys: 'K',
    payload: { direction: 'stop' },
    aliases: ['pause shuttle'],
  },
  {
    commandId: 'playback.shuttle',
    keySuffix: 'forward',
    label: 'Shuttle forward',
    keys: 'L',
    payload: { direction: 'forward' },
  },
  {
    commandId: 'playback.nudgePlayhead',
    keySuffix: 'previous-frame',
    label: 'Move timeline playhead previous frame',
    keys: 'Left',
    payload: { deltaFrames: -1 },
    aliases: ['timeline nudge left previous'],
  },
  {
    commandId: 'playback.nudgePlayhead',
    keySuffix: 'next-frame',
    label: 'Move timeline playhead next frame',
    keys: 'Right',
    payload: { deltaFrames: 1 },
    aliases: ['timeline nudge right next'],
  },
  {
    commandId: 'playback.nudgePlayhead',
    keySuffix: 'previous-second',
    label: 'Move timeline playhead previous second',
    keys: 'Shift+Left',
    payload: { deltaSeconds: -1 },
    aliases: ['timeline nudge left one second'],
  },
  {
    commandId: 'playback.nudgePlayhead',
    keySuffix: 'next-second',
    label: 'Move timeline playhead next second',
    keys: 'Shift+Right',
    payload: { deltaSeconds: 1 },
    aliases: ['timeline nudge right one second'],
  },
  {
    commandId: 'program.nudgeLayer',
    keySuffix: 'left',
    label: 'Nudge selected Program layer left',
    keys: 'Left in Program',
    payload: { deltaX: -1, deltaY: 0 },
  },
  {
    commandId: 'program.nudgeLayer',
    keySuffix: 'right',
    label: 'Nudge selected Program layer right',
    keys: 'Right in Program',
    payload: { deltaX: 1, deltaY: 0 },
  },
  {
    commandId: 'program.nudgeLayer',
    keySuffix: 'up',
    label: 'Nudge selected Program layer up',
    keys: 'Up in Program',
    payload: { deltaX: 0, deltaY: -1 },
  },
  {
    commandId: 'program.nudgeLayer',
    keySuffix: 'down',
    label: 'Nudge selected Program layer down',
    keys: 'Down in Program',
    payload: { deltaX: 0, deltaY: 1 },
  },
  {
    commandId: 'program.nudgeLayer',
    keySuffix: 'left-10',
    label: 'Nudge selected Program layer left 10 px',
    keys: 'Shift+Left in Program',
    payload: { deltaX: -10, deltaY: 0 },
  },
  {
    commandId: 'program.nudgeLayer',
    keySuffix: 'right-10',
    label: 'Nudge selected Program layer right 10 px',
    keys: 'Shift+Right in Program',
    payload: { deltaX: 10, deltaY: 0 },
  },
  {
    commandId: 'program.nudgeLayer',
    keySuffix: 'up-10',
    label: 'Nudge selected Program layer up 10 px',
    keys: 'Shift+Up in Program',
    payload: { deltaX: 0, deltaY: -10 },
  },
  {
    commandId: 'program.nudgeLayer',
    keySuffix: 'down-10',
    label: 'Nudge selected Program layer down 10 px',
    keys: 'Shift+Down in Program',
    payload: { deltaX: 0, deltaY: 10 },
  },
  {
    commandId: 'playback.jumpAdjacentEdit',
    keySuffix: 'previous',
    label: 'Jump to previous edit point',
    keys: 'Up',
    payload: { direction: 'previous', includeAllTracks: false },
  },
  {
    commandId: 'playback.jumpAdjacentEdit',
    keySuffix: 'next',
    label: 'Jump to next edit point',
    keys: 'Down',
    payload: { direction: 'next', includeAllTracks: false },
  },
  {
    commandId: 'playback.jumpAdjacentEditAllTracks',
    keySuffix: 'previous',
    label: 'Jump to previous edit point on all tracks',
    keys: 'Alt+Up',
    payload: { direction: 'previous', includeAllTracks: true },
  },
  {
    commandId: 'playback.jumpAdjacentEditAllTracks',
    keySuffix: 'next',
    label: 'Jump to next edit point on all tracks',
    keys: 'Alt+Down',
    payload: { direction: 'next', includeAllTracks: true },
  },
  {
    commandId: 'trim.toPlayhead',
    keySuffix: 'head',
    label: 'Trim head to playhead',
    keys: 'Q',
    payload: { edge: 'start' },
  },
  {
    commandId: 'trim.toPlayhead',
    keySuffix: 'tail',
    label: 'Trim tail to playhead',
    keys: 'W',
    payload: { edge: 'end' },
  },
  {
    commandId: 'selection.selectRelative',
    keySuffix: 'left',
    label: 'Select clips left of playhead',
    keys: 'Shift+A',
    payload: { direction: 'left', includeAllTracks: false },
  },
  {
    commandId: 'selection.selectRelative',
    keySuffix: 'right',
    label: 'Select clips right of playhead',
    keys: 'A',
    payload: { direction: 'right', includeAllTracks: false },
  },
  {
    commandId: 'selection.selectRelativeAllTracks',
    keySuffix: 'left',
    label: 'Select clips left of playhead on all tracks',
    keys: 'Shift+Alt+A',
    payload: { direction: 'left', includeAllTracks: true },
  },
  {
    commandId: 'selection.selectRelativeAllTracks',
    keySuffix: 'right',
    label: 'Select clips right of playhead on all tracks',
    keys: 'Alt+A',
    payload: { direction: 'right', includeAllTracks: true },
  },
  {
    commandId: 'selection.selectAtPlayhead',
    keySuffix: 'all-tracks',
    label: 'Select clip at playhead on all tracks',
    keys: 'Alt+D',
    payload: { includeAllTracks: true },
  },
  {
    commandId: 'selection.selectMarkedRange',
    keySuffix: 'all-tracks',
    label: 'Select clips in marked range on all tracks',
    keys: 'Shift+Alt+D',
    payload: { includeAllTracks: true },
  },
  {
    commandId: 'timeline.copyMarkedRange',
    keySuffix: 'all-tracks',
    label: 'Copy marked range on all tracks',
    keys: 'Shift+Alt+C',
    payload: { includeAllTracks: true },
  },
  {
    commandId: 'timeline.cutMarkedRange',
    keySuffix: 'all-tracks',
    label: 'Cut marked range on all tracks',
    keys: 'Shift+Alt+X',
    payload: { includeAllTracks: true },
  },
  {
    commandId: 'timeline.setMark',
    keySuffix: 'in',
    label: 'Set timeline In point',
    keys: 'I',
    payload: { edge: 'in' },
  },
  {
    commandId: 'timeline.setMark',
    keySuffix: 'out',
    label: 'Set timeline Out point',
    keys: 'O',
    payload: { edge: 'out' },
  },
  {
    commandId: 'timeline.goToMark',
    keySuffix: 'in',
    label: 'Go to timeline In point',
    keys: 'Shift+I',
    payload: { edge: 'in' },
  },
  {
    commandId: 'timeline.goToMark',
    keySuffix: 'out',
    label: 'Go to timeline Out point',
    keys: 'Shift+O',
    payload: { edge: 'out' },
  },
  {
    commandId: 'timeline.jumpAdjacentMarker',
    keySuffix: 'previous',
    label: 'Previous marker',
    keys: '[',
    payload: { direction: 'previous' },
  },
  {
    commandId: 'timeline.jumpAdjacentMarker',
    keySuffix: 'next',
    label: 'Next marker',
    keys: ']',
    payload: { direction: 'next' },
  },
  {
    commandId: 'edit.moveSelection',
    keySuffix: 'left-frame',
    label: 'Move selected clips left one frame',
    keys: 'Alt+Left',
    payload: { deltaFrames: -1 },
  },
  {
    commandId: 'edit.moveSelection',
    keySuffix: 'right-frame',
    label: 'Move selected clips right one frame',
    keys: 'Alt+Right',
    payload: { deltaFrames: 1 },
  },
  {
    commandId: 'trim.slideSelection',
    keySuffix: 'left-frame',
    label: 'Slide selected clips left one frame',
    keys: 'Shift+Alt+Left',
    payload: { deltaFrames: -1 },
  },
  {
    commandId: 'trim.slideSelection',
    keySuffix: 'right-frame',
    label: 'Slide selected clips right one frame',
    keys: 'Shift+Alt+Right',
    payload: { deltaFrames: 1 },
  },
  {
    commandId: 'timeline.fitZoom',
    keySuffix: 'selection',
    label: 'Fit timeline zoom to selection',
    keys: 'Shift+F',
    payload: { mode: 'selection' },
  },
  {
    commandId: 'source.nudgePlayhead',
    keySuffix: 'previous-frame',
    label: 'Move Source playhead previous frame',
    keys: 'Left when Source active',
    payload: { deltaFrames: -1 },
    aliases: ['source nudge left previous'],
  },
  {
    commandId: 'source.nudgePlayhead',
    keySuffix: 'next-frame',
    label: 'Move Source playhead next frame',
    keys: 'Right when Source active',
    payload: { deltaFrames: 1 },
    aliases: ['source nudge right next'],
  },
  {
    commandId: 'source.nudgePlayhead',
    keySuffix: 'previous-second',
    label: 'Move Source playhead previous second',
    keys: 'Shift+Left when Source active',
    payload: { deltaSeconds: -1 },
    aliases: ['source nudge left one second'],
  },
  {
    commandId: 'source.nudgePlayhead',
    keySuffix: 'next-second',
    label: 'Move Source playhead next second',
    keys: 'Shift+Right when Source active',
    payload: { deltaSeconds: 1 },
    aliases: ['source nudge right one second'],
  },
] as const satisfies readonly CommandPaletteVariant[];

export interface CommandPaletteState {
  query: string;
  items: CommandPaletteItem[];
  activeIndex: number;
  activeItem?: CommandPaletteItem;
  resultCount: number;
  visibleCount: number;
  hiddenCount: number;
  hiddenLabel?: string;
}

export function buildCommandPaletteItems(): CommandPaletteItem[] {
  const baseItems = listEditorCommands().map((command) => {
    const description = (command as { description?: string }).description;

    return {
      key: command.id,
      id: command.id,
      label: command.label,
      group: command.group,
      keys: command.keys,
      description,
      searchText: normalizeSearchText([
        command.id,
        command.label,
        command.group,
        command.keys,
        description ?? '',
        ...command.defaultShortcuts,
      ].join(' ')),
    };
  });

  const commandsById = new Map(listEditorCommands().map((command) => [command.id, command]));
  const variantItems = COMMAND_PALETTE_VARIANTS.map((variant) => {
    const command = commandsById.get(variant.commandId);
    if (!command) {
      throw new Error(`Unknown command palette variant command: ${variant.commandId}`);
    }

    const description = variant.description ?? (command as { description?: string }).description;

    return {
      key: `${variant.commandId}:${variant.keySuffix}`,
      id: variant.commandId,
      label: variant.label,
      group: command.group,
      keys: variant.keys,
      description,
      payload: variant.payload,
      searchText: normalizeSearchText([
        variant.commandId,
        variant.label,
        command.group,
        variant.keys,
        description ?? '',
        ...command.defaultShortcuts,
        ...(variant.aliases ?? []),
      ].join(' ')),
    };
  });

  return [...baseItems, ...variantItems];
}

export function resolveCommandPaletteState({
  query,
  activeIndex,
  limit = 18,
  items = buildCommandPaletteItems(),
}: {
  query: string;
  activeIndex: number;
  limit?: number;
  items?: CommandPaletteItem[];
}): CommandPaletteState {
  const normalizedQuery = query.trim();
  const filteredItems = filterCommandPaletteItems(items, normalizedQuery);
  const safeLimit = normalizeCommandPaletteLimit(limit);
  const visibleItems = filteredItems.slice(0, safeLimit);
  const hiddenCount = Math.max(0, filteredItems.length - visibleItems.length);
  const nextActiveIndex = normalizeCommandPaletteIndex(activeIndex, visibleItems.length);

  return {
    query: normalizedQuery,
    items: visibleItems,
    activeIndex: nextActiveIndex,
    activeItem: nextActiveIndex >= 0 ? visibleItems[nextActiveIndex] : undefined,
    resultCount: filteredItems.length,
    visibleCount: visibleItems.length,
    hiddenCount,
    ...(hiddenCount > 0 ? { hiddenLabel: `${hiddenCount} more ${hiddenCount === 1 ? 'command' : 'commands'}` } : {}),
  };
}

export function filterCommandPaletteItems(items: CommandPaletteItem[], query: string): CommandPaletteItem[] {
  const tokens = normalizeSearchText(query).split(' ').filter(Boolean);
  if (tokens.length === 0) {
    return [...items].sort(compareCommandPaletteItems);
  }

  return items
    .map((item) => ({
      item,
      score: scoreCommandPaletteItem(item, tokens),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || compareCommandPaletteItems(a.item, b.item))
    .map((entry) => entry.item);
}

export function resolveCommandPaletteNavigation({
  currentIndex,
  itemCount,
  direction,
}: {
  currentIndex: number;
  itemCount: number;
  direction: 'previous' | 'next' | 'first' | 'last';
}): number {
  if (itemCount <= 0) {
    return -1;
  }

  if (direction === 'first') {
    return 0;
  }

  if (direction === 'last') {
    return itemCount - 1;
  }

  const baseIndex = normalizeCommandPaletteIndex(currentIndex, itemCount);
  const delta = direction === 'next' ? 1 : -1;
  return (baseIndex + delta + itemCount) % itemCount;
}

function scoreCommandPaletteItem(item: CommandPaletteItem, tokens: string[]): number {
  let score = 0;

  for (const token of tokens) {
    if (item.searchText.includes(token)) {
      score += 10;
    } else {
      return 0;
    }

    if (normalizeSearchText(item.label).startsWith(token)) {
      score += 8;
    }

    if (normalizeSearchText(item.id).includes(token)) {
      score += 4;
    }

    if (normalizeSearchText(item.keys).includes(token)) {
      score += 3;
    }
  }

  if (item.payload) {
    score += 2;
  }

  return score;
}

function compareCommandPaletteItems(a: CommandPaletteItem, b: CommandPaletteItem): number {
  const groupCompare = a.group.localeCompare(b.group);
  return groupCompare || a.label.localeCompare(b.label);
}

function normalizeCommandPaletteIndex(index: number, itemCount: number): number {
  if (itemCount <= 0) {
    return -1;
  }

  if (!Number.isFinite(index)) {
    return 0;
  }

  return Math.min(itemCount - 1, Math.max(0, Math.trunc(index)));
}

function normalizeCommandPaletteLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return 0;
  }

  return Math.max(0, Math.trunc(limit));
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, ' ')
    .trim();
}
