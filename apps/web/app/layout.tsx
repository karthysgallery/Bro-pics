import type { ReactNode } from 'react';
import './globals.css';
import type { Category } from '@bro-pics/shared';
import { AuthProvider } from '../lib/auth-context';
import { CartProvider } from '../lib/cart-context';
import { ToastProvider } from '../components/ui/Toast';
import { WishlistSync } from '../components/account/WishlistSync';
import { NotificationsSync } from '../components/account/NotificationsSync';
import { LayoutChrome } from '../components/layout/LayoutChrome';
import { getActiveCategories } from '../lib/firestore-categories';
import { getAnnouncementBarSettings } from '../lib/firestore-settings';
import { Manrope, Outfit, Dancing_Script, Great_Vibes, Pacifico, Sacramento, Cormorant_Garamond, Cinzel, Caveat, Josefin_Sans } from 'next/font/google';

// One UI typeface for the whole interface. Manrope holds up at the 11–14px
// sizes a dense catalogue runs on, and its open, slightly geometric figures
// keep price-heavy rows legible. The previous Playfair/Inter pairing (serif
// display + sans body) belonged to the older boutique design.
const sansFont = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

// Headlines only. Outfit is wide and geometric — right for signage-sized
// type, wrong for a 13px product title, which is why the body stays Manrope.
const displayFont = Outfit({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

// Curated set for the personalization editor's text-field font picker
// (mix of script/serif/sans, mirroring the reference site's "Style 1..10"
// swatch grid) — each exposed as its own CSS variable so TextFieldEditor
// can map a font key straight to a `fontFamily` inline style without
// re-declaring @font-face rules of its own.
const dancingScript = Dancing_Script({ subsets: ['latin'], variable: '--font-dancing-script', display: 'swap' });
const greatVibes = Great_Vibes({ subsets: ['latin'], weight: '400', variable: '--font-great-vibes', display: 'swap' });
const pacifico = Pacifico({ subsets: ['latin'], weight: '400', variable: '--font-pacifico', display: 'swap' });
const sacramento = Sacramento({ subsets: ['latin'], weight: '400', variable: '--font-sacramento', display: 'swap' });
const cormorant = Cormorant_Garamond({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-cormorant', display: 'swap' });
const cinzel = Cinzel({ subsets: ['latin'], variable: '--font-cinzel', display: 'swap' });
const caveat = Caveat({ subsets: ['latin'], variable: '--font-caveat', display: 'swap' });
const josefinSans = Josefin_Sans({ subsets: ['latin'], variable: '--font-josefin', display: 'swap' });

const textFieldFontVariables = [
  dancingScript.variable,
  greatVibes.variable,
  pacifico.variable,
  sacramento.variable,
  cormorant.variable,
  cinzel.variable,
  caveat.variable,
  josefinSans.variable,
].join(' ');

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
    <html lang="en" className={`${sansFont.variable} ${displayFont.variable} ${textFieldFontVariables}`}>
      <body className="bg-field text-ink font-sans antialiased">
        <ToastProvider>
          <AuthProvider>
            <WishlistSync />
            <NotificationsSync />
            <CartProvider>
              <LayoutChrome categories={categories} announcementBar={announcementBar}>
                {children}
              </LayoutChrome>
            </CartProvider>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
