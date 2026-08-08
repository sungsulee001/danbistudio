import type { Metadata } from 'next';
import './globals.css';
import { THEME_BOOTSTRAP_SCRIPT } from './theme';

export const metadata: Metadata = {
  title: 'Danbi Studio',
  description: 'Local-first desktop video editor and orchestration platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // The theme script stamps `data-theme` on <html> before React hydrates, so
    // the served markup and the live document differ by that one attribute by
    // design — suppress the warning here rather than paint the wrong ground.
    //
    // A raw <script> rather than next/script: `beforeInteractive` does not run
    // an inline body early enough here, which left the stored theme unapplied
    // on load and flashed the dark ground at anyone on light.
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="min-h-screen custom-scrollbar antialiased">{children}</body>
    </html>
  );
}
