import { EDITOR_COMMANDS, type EditorCommandGroup, type EditorCommandId } from './command-registry';

export interface EditorKeyboardShortcut {
  id: EditorCommandId;
  keys: string;
  label: string;
  group: EditorCommandGroup;
}

export const EDITOR_KEYBOARD_SHORTCUTS: EditorKeyboardShortcut[] = EDITOR_COMMANDS.map((command) => ({
  id: command.id,
  keys: command.keys,
  label: command.label,
  group: command.group,
}));

export function findEditorShortcut(keys: string): EditorKeyboardShortcut | undefined {
  return EDITOR_KEYBOARD_SHORTCUTS.find((shortcut) => shortcut.keys === keys);
}

export function findEditorShortcutByCommandId(commandId: EditorCommandId): EditorKeyboardShortcut | undefined {
  return EDITOR_KEYBOARD_SHORTCUTS.find((shortcut) => shortcut.id === commandId);
}
