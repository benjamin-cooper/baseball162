import type { Metadata, Viewport } from 'next';
import { Bebas_Neue, Figtree, Space_Mono } from 'next/font/google';
import './globals.css';

// Stadium-signage display face — used for the wordmark, headlines, and the
// scoreboard-style win/loss readout. Doing the heavy typographic lifting that
// makes this feel like a ballpark broadcast graphic rather than a generic app.
const display = Bebas_Neue({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
  display: 'swap',
});

// Body face — warmer and more characterful than the default system sans.
const body = Figtree({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

// Tabular mono — for stat lines and the slot-machine readout, so digits line
// up like an actual scoreboard / box score rather than proportional type.
const mono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-mono-stat',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Baseball 162-0',
  description: 'Draft all-time MLB players and see if your team can go 162-0.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
