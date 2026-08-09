import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { DanbiThemeProvider } from './theme';
import { normalizeTheme, THEME_COOKIE } from './theme-shared';

export const metadata: Metadata = {
  title: 'Danbi Studio',
  description: 'Local-first desktop video editor and orchestration platform',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read the theme here rather than from an inline script after load: the
  // server can stamp the attribute itself, so the first frame is already right
  // and the client starts from the same value instead of correcting it.
  const theme = normalizeTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html lang="ko" data-theme={theme === 'light' ? 'light' : undefined}>
      <body className="min-h-screen custom-scrollbar antialiased">
        <DanbiThemeProvider initialTheme={theme}>{children}</DanbiThemeProvider>
      </body>
    </html>
  );
}
