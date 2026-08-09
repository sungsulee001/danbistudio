'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_THEME, THEME_COOKIE, type DanbiTheme } from './theme-shared';

export type { DanbiTheme } from './theme-shared';
export { DEFAULT_THEME, normalizeTheme, THEME_COOKIE } from './theme-shared';

const ThemeContext = createContext<{ theme: DanbiTheme; toggleTheme: () => void }>({
  theme: DEFAULT_THEME,
  toggleTheme: () => undefined,
});

/**
 * The theme is carried in a cookie so the SERVER can stamp `data-theme` on
 * <html> and hand the same value to the client.
 *
 * The previous approach — an inline bootstrap script reading localStorage —
 * needed the script to beat hydration, and cost two console errors for it: React
 * warns about a <script> rendered inside the tree, and any control whose label
 * depends on the theme rendered "Dark" on the server and "Light" on the client,
 * which is a hydration text mismatch. Reading a cookie removes both: there is no
 * script, and server and client start from the same value.
 *
 * A cookie rather than localStorage because only a cookie reaches the server on
 * the request that renders the page.
 */
export function DanbiThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: DanbiTheme;
  children: ReactNode;
}) {
  const [theme, setTheme] = useState<DanbiTheme>(initialTheme);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next: DanbiTheme = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Write the choice where both the document and the next request can see it. */
function applyTheme(theme: DanbiTheme): void {
  if (typeof document === 'undefined') return;

  if (theme === 'light') {
    document.documentElement.dataset.theme = 'light';
  } else {
    delete document.documentElement.dataset.theme;
  }

  // Root path and a long max-age so the preference survives navigation and
  // restarts; SameSite=Lax keeps it off cross-site requests.
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * The two grounds Broadsheet ships. The monitors and the mode rail stay dark in
 * both (see `.on-dark` in globals.css) so picture brightness stays judgeable.
 */
export function useDanbiTheme(): { theme: DanbiTheme; toggleTheme: () => void } {
  return useContext(ThemeContext);
}
