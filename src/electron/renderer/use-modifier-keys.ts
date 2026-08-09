import { useEffect, useState } from 'react';

export interface ModifierKeyState {
  alt: boolean;
  shift: boolean;
}

const IDLE: ModifierKeyState = { alt: false, shift: false };

/**
 * Whether Alt / Shift are held right now.
 *
 * The timeline's slip and slide edits are Alt and Shift+Alt drags, but nothing
 * on screen changed when you held the key, so there was no way to tell the mode
 * had been entered until after the drag committed. Components read this to
 * swap the cursor while the key is down.
 *
 * Reads state only — no preventDefault — so Alt keeps its normal meaning.
 */
export function useModifierKeys(): ModifierKeyState {
  const [modifiers, setModifiers] = useState<ModifierKeyState>(IDLE);

  useEffect(() => {
    const sync = (event: KeyboardEvent | MouseEvent) => {
      setModifiers((current) => (
        current.alt === event.altKey && current.shift === event.shiftKey
          ? current
          : { alt: event.altKey, shift: event.shiftKey }
      ));
    };
    // Alt-Tab and losing focus never deliver the keyup, which would otherwise
    // strand the cursor in slip mode until the next keypress.
    const clear = () => setModifiers((current) => (current === IDLE ? current : IDLE));

    window.addEventListener('keydown', sync);
    window.addEventListener('keyup', sync);
    window.addEventListener('mousemove', sync);
    window.addEventListener('blur', clear);

    return () => {
      window.removeEventListener('keydown', sync);
      window.removeEventListener('keyup', sync);
      window.removeEventListener('mousemove', sync);
      window.removeEventListener('blur', clear);
    };
  }, []);

  return modifiers;
}

export type TimelineClipCursorMode = 'move' | 'slip' | 'slide' | 'locked';

/** Which edit an Alt / Shift+Alt drag on a clip body would start. */
export function resolveTimelineClipCursorMode(
  modifiers: ModifierKeyState,
  locked: boolean,
): TimelineClipCursorMode {
  if (locked) return 'locked';
  if (!modifiers.alt) return 'move';
  return modifiers.shift ? 'slide' : 'slip';
}

/** The cursor for that mode, in the vocabulary the editor already uses. */
export function timelineClipCursorClassName(
  mode: TimelineClipCursorMode,
  dragging: boolean,
): string {
  switch (mode) {
    case 'locked':
      return 'cursor-not-allowed';
    case 'slip':
      return 'cursor-col-resize';
    case 'slide':
      return 'cursor-ew-resize';
    case 'move':
    default:
      return dragging ? 'cursor-grabbing' : 'cursor-grab';
  }
}
