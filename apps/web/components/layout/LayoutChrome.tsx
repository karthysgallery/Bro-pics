'use client';

import { useState, type ReactNode } from 'react';
import type { Category } from '@bro-pics/shared';
import { Header } from './Header';
import { Footer } from './Footer';
import { CartDrawer } from './CartDrawer';
import { WhatsAppButton } from './WhatsAppButton';
import { AnnouncementBar } from './AnnouncementBar';

interface LayoutChromeProps {
  categories: Category[];
  announcementBar?: { text: string; link?: string } | null;
  children: ReactNode;
}

export function LayoutChrome({ categories, announcementBar = null, children }: LayoutChromeProps) {
  const [isCartOpen, setIsCartOpen] = useState(false);

  return (
    <>
      {announcementBar && (
        <AnnouncementBar text={announcementBar.text} link={announcementBar.link} />
      )}
      <Header categories={categories} onCartClick={() => setIsCartOpen(true)} />
      <main>{children}</main>
      <Footer />
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
      <WhatsAppButton
        phoneNumber={process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '910000000000'}
        message="Hi, I have a question about a BroPics order."
      />
    </>
  );
}
