import type { ReactNode } from 'react';
import './globals.css';
import type { Category } from '@bro-pics/shared';
import { AuthProvider } from '../lib/auth-context';
import { CartProvider } from '../lib/cart-context';
import { LayoutChrome } from '../components/layout/LayoutChrome';
import { getActiveCategories } from '../lib/firestore-categories';
import { getAnnouncementBarSettings } from '../lib/firestore-settings';
import { Playfair_Display, Inter } from 'next/font/google';

const displayFont = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const sansFont = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://bropics.example.com'),
  title: 'BroPics — Personalized Photo Frames',
  description: 'Custom photo frames, personalized and delivered.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  let categories: Category[] = [];
  try {
    categories = await getActiveCategories();
  } catch (error) {
    console.error('Failed to load categories for navigation:', error);
  }

  let announcementBar: { text: string; link?: string } | null = null;
  try {
    announcementBar = await getAnnouncementBarSettings();
  } catch (error) {
    console.error('Failed to load announcement bar settings:', error);
  }

  return (
    <html lang="en" className={`${displayFont.variable} ${sansFont.variable}`}>
      <body className="bg-cream text-charcoal font-sans">
        <AuthProvider>
          <CartProvider>
            <LayoutChrome categories={categories} announcementBar={announcementBar}>
              {children}
            </LayoutChrome>
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
