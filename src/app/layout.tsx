import type { Metadata } from 'next';
import './globals.css';

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
    <html lang="ko">
      <body className="min-h-screen custom-scrollbar antialiased">{children}</body>
    </html>
  );
}
