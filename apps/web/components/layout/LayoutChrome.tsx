'use client';

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { Category } from '@bro-pics/shared';
import { Header } from './Header';
import { Footer } from './Footer';
import { CartDrawer } from './CartDrawer';
import { WhatsAppButton } from './WhatsAppButton';
import { AnnouncementBar } from './AnnouncementBar';
import { ConsentBanner } from './ConsentBanner';

interface LayoutChromeProps {
  categories: Category[];
  announcementBar?: { text: string; link?: string } | null;
  headerSettings?: { navLinks: { label: string; href: string }[] } | null;
  footerSettings?: {
    columns: { title: string; links: { label: string; href: string }[] }[];
    socialLinks: { platform: string; url: string }[];
  } | null;
  storeSettings?: { name: string; supportPhone: string } | null;
  children: ReactNode;
}

export function LayoutChrome({
  categories,
  announcementBar = null,
  headerSettings = null,
  footerSettings = null,
  storeSettings = null,
  children,
}: LayoutChromeProps) {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const pathname = usePathname();

  // Admin routes use their own AdminShell layout — skip storefront chrome entirely.
  if (pathname?.startsWith('/admin')) {
    return <>{children}</>;
  }

  return (
    <>
      <AnnouncementBar
        text={
          announcementBar?.text ??
          'Made for your memories ✦ Free shipping on orders above ₹1,999 ✦ Use code FIRST15 for 15% OFF'
        }
        link={announcementBar?.link}
      />
      <Header categories={categories} onCartClick={() => setIsCartOpen(true)} extraNavLinks={headerSettings?.navLinks} />
      <main>{children}</main>
      <Footer settings={footerSettings} supportPhone={storeSettings?.supportPhone} />
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
      <WhatsAppButton
        phoneNumber={process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '910000000000'}
        message="Hi, I have a question about a KarthysGallery order."
      />
      <ConsentBanner />
    </>
  );
}

