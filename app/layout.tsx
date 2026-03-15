import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: 'Requestr — Jellyfin Media Requests',
  description: 'Search for movies and TV series and request them to be added to Jellyfin.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // data-theme is set client-side by ThemeProvider on mount.
    // Default to dark to avoid flash on first render.
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
        <footer style={{
          textAlign: 'center',
          padding: '1rem',
          fontSize: '0.72rem',
          color: '#6e7681',
          userSelect: 'none',
        }}>
          build {process.env.NEXT_PUBLIC_BUILD_SHA} &middot; {process.env.NEXT_PUBLIC_BUILD_TIME?.slice(0, 10)}
        </footer>
      </body>
    </html>
  );
}
