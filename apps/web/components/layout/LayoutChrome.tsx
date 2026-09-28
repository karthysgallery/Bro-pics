'use client';

import { useState, type ReactNode } from 'react';
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

  return (
    <>
      {announcementBar && (
        <AnnouncementBar text={announcementBar.text} link={announcementBar.link} />
      )}
      <Header categories={categories} onCartClick={() => setIsCartOpen(true)} extraNavLinks={headerSettings?.navLinks} />
      <main>{children}</main>
      <Footer settings={footerSettings} supportPhone={storeSettings?.supportPhone} />
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
      <WhatsAppButton
        phoneNumber={process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '910000000000'}
        message="Hi, I have a question about a BroPics order."
      />
      <ConsentBanner />
    </>
  );
}
