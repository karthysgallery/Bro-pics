'use client';

import { useState, type ReactNode } from 'react';
import type { Category } from '@bro-pics/shared';
import { Header } from './Header';
import { Footer } from './Footer';
import { CartDrawer } from './CartDrawer';
import { WhatsAppButton } from './WhatsAppButton';

interface LayoutChromeProps {
  categories: Category[];
  children: ReactNode;
}

export function LayoutChrome({ categories, children }: LayoutChromeProps) {
  const [isCartOpen, setIsCartOpen] = useState(false);

  return (
    <>
      <Header categories={categories} onCartClick={() => setIsCartOpen(true)} />
      <main>{children}</main>
      <Footer />
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
      <WhatsAppButton phoneNumber="910000000000" message="Hi, I have a question about a BroPics order." />
    </>
  );
}
