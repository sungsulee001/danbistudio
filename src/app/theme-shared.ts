/**
 * Theme values both sides need.
 *
 * Deliberately not a `'use client'` module: the root layout is a server
 * component and reads the cookie there, and a client-only module cannot be
 * called from the server. The provider and the hook live in `theme.tsx`.
 */

export type DanbiTheme = 'dark' | 'light';

export const THEME_COOKIE = 'danbi-studio-theme';
export const DEFAULT_THEME: DanbiTheme = 'dark';

/** Narrow an arbitrary cookie value to a theme. */
export function normalizeTheme(value: string | undefined): DanbiTheme {
  return value === 'light' ? 'light' : DEFAULT_THEME;
}
