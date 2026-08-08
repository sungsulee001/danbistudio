'use client';

import { useCallback, useEffect, useState } from 'react';

export type DanbiTheme = 'dark' | 'light';

const STORAGE_KEY = 'danbi-studio-theme';
const DEFAULT_THEME: DanbiTheme = 'dark';

/**
 * Applied before paint so the first frame is already in the stored theme.
 * Dark is the default, so the script only ever has to add the light flag —
 * `data-theme` is absent for dark, which is what globals.css assumes.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)});if(t==='light'){document.documentElement.dataset.theme='light'}}catch(e){}})()`;

/**
 * localStorage is the source of truth, not the DOM attribute: hydration
 * reconciles <html>'s attributes and drops the one the bootstrap script added,
 * so reading the attribute back would report dark for a light user.
 */
export function readStoredTheme(): DanbiTheme {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(theme: DanbiTheme): void {
  if (typeof document === 'undefined') return;
  if (theme === 'light') {
    document.documentElement.dataset.theme = 'light';
  } else {
    delete document.documentElement.dataset.theme;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode or a locked-down profile — the theme still applies for this session.
  }
}

/**
 * The two grounds Broadsheet ships. The monitors and the mode rail stay dark in
 * both (see `.on-dark` in globals.css) so picture brightness stays judgeable.
 */
export function useDanbiTheme(): { theme: DanbiTheme; toggleTheme: () => void } {
  // Starts at the default and syncs on mount: the bootstrap script has already
  // set the attribute, but the server render cannot know what it chose.
  const [theme, setTheme] = useState<DanbiTheme>(DEFAULT_THEME);

  useEffect(() => {
    // Re-assert after hydration: the bootstrap script painted the right ground
    // before first paint, but React's reconciliation of <html> strips the
    // attribute again, so put it back.
    const stored = readStoredTheme();
    applyTheme(stored);
    setTheme(stored);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next: DanbiTheme = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
