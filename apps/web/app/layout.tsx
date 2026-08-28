import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'BroPics — Personalized Photo Frames',
  description: 'Custom photo frames, personalized and delivered.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
