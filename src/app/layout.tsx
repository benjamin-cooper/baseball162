import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Baseball 162-0',
  description: 'Draft all-time MLB players and see if your team can go 162-0.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
