'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { Category } from '@bro-pics/shared';
import { Header } from './Header';
import { Footer } from './Footer';
import { CartDrawer } from './CartDrawer';
import { WhatsAppButton } from './WhatsAppButton';
import { AnnouncementBar } from './AnnouncementBar';
import { ConsentBanner } from './ConsentBanner';
import { freeShippingPromise, useShippingSettings } from '../../lib/use-shipping-settings';
import type { ThemeDecor } from '@bro-pics/shared';
import { FestiveBand } from '../theme/FestiveBand';
import { FestiveEffect } from '../theme/FestiveEffect';

interface LayoutChromeProps {
  categories: Category[];
  announcementBar?: { text: string; link?: string } | null;
  headerSettings?: { navLinks: { label: string; href: string }[]; showCategories?: boolean; logoMediaId?: string | null } | null;
  footerSettings?: {
    columns: { title: string; links: { label: string; href: string }[] }[];
    socialLinks: { platform: string; url: string }[];
    tagline?: string;
  } | null;
  storeSettings?: { name: string; supportPhone: string } | null;
  /** Decorations of the theme the shop is showing (festivals); none for the Everyday theme. */
  themeDecor?: ThemeDecor | null;
  children: ReactNode;
}

export function LayoutChrome({
  categories,
  announcementBar = null,
  headerSettings = null,
  footerSettings = null,
  storeSettings = null,
  themeDecor = null,
  children,
}: LayoutChromeProps) {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const pathname = usePathname();
  const shippingSettings = useShippingSettings();
  // Fallback announcement only states things that are always true: the shipping
  // promise comes from the real shipping settings, and no coupon code is
  // advertised unless an admin writes one into the announcement setting.
  const defaultAnnouncement = ['Made for your memories', freeShippingPromise(shippingSettings)].filter(Boolean).join(' • ');

  useEffect(() => {
    const handleOpen = () => setIsCartOpen(true);
    window.addEventListener('karthys:open-cart', handleOpen);
    return () => window.removeEventListener('karthys:open-cart', handleOpen);
  }, []);

  // Admin routes and dedicated full-screen auth routes skip storefront chrome entirely
  const isAuthRoute = pathname === '/signin' || pathname === '/signup' || pathname === '/forgot-password';
  if (pathname?.startsWith('/admin') || isAuthRoute) {
    return <>{children}</>;
  }

  return (
    <>
      <div className="sticky top-0 z-40 w-full shadow-xs">
        <AnnouncementBar
          text={themeDecor?.bannerText || announcementBar?.text || defaultAnnouncement}
          link={themeDecor?.bannerText ? themeDecor.bannerLink : announcementBar?.link}
        />
        <Header
          categories={categories}
          onCartClick={() => setIsCartOpen(true)}
          extraNavLinks={headerSettings?.navLinks}
          showCategories={headerSettings?.showCategories ?? true}
          logoSrc={headerSettings?.logoMediaId ? `/api/media/${encodeURIComponent(headerSettings.logoMediaId)}/image?w=480` : null}
          storeName={storeSettings?.name}
        />
      </div>
      {themeDecor && <FestiveBand motif={themeDecor.motif} />}
      {themeDecor && <FestiveEffect effect={themeDecor.effect} />}
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

