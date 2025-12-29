import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DanbiStudio',
  description: 'Local GPU-based AI Model Platform',
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
