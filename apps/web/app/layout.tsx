import type { ReactNode } from 'react';
import './globals.css';
import { CartProvider } from '../lib/cart-context';
import { LayoutChrome } from '../components/layout/LayoutChrome';
import { getActiveCategories } from '../lib/firestore-categories';

export const metadata = {
  title: 'BroPics — Personalized Photo Frames',
  description: 'Custom photo frames, personalized and delivered.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const categories = await getActiveCategories();

  return (
    <html lang="en">
      <body className="bg-cream text-charcoal font-sans">
        <CartProvider>
          <LayoutChrome categories={categories}>{children}</LayoutChrome>
        </CartProvider>
      </body>
    </html>
  );
}
