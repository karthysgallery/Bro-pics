'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Category } from '@bro-pics/shared';
import { useCart } from '../../lib/cart-context';
import { useAuth } from '../../lib/auth-context';
import { SearchTypeahead } from '../search/SearchTypeahead';
import { AccountModal } from './AccountModal';

interface HeaderProps {
  categories: Category[];
  onCartClick: () => void;
}

export function Header({ categories, onCartClick }: HeaderProps) {
  const { totalCount } = useCart();
  const { user } = useAuth();
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-cream border-b border-charcoal/10">
      <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-8">
        <Link href="/" className="font-display text-2xl text-charcoal">
          BroPics
        </Link>

        <nav className="hidden md:flex gap-6" aria-label="Category navigation">
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/category/${category.slug}`}
              className="text-charcoal hover:text-terracotta"
            >
              {category.name}
            </Link>
          ))}
        </nav>

        <div className="flex-1 max-w-md hidden sm:block">
          <SearchTypeahead />
        </div>

        <div className="flex items-center gap-4">
          <button aria-label="Wishlist" className="text-charcoal">
            ♡
          </button>
          {user ? (
            <Link href="/account" aria-label="Account" className="text-charcoal">
              ◐
            </Link>
          ) : (
            <button
              aria-label="Sign in"
              onClick={() => setIsAccountModalOpen(true)}
              className="text-charcoal"
            >
              ◐
            </button>
          )}
          <button aria-label="Cart" onClick={onCartClick} className="relative text-charcoal">
            🛒
            <span
              data-testid="cart-count"
              className="absolute -top-2 -right-2 bg-terracotta text-cream text-xs rounded-full w-5 h-5 flex items-center justify-center"
            >
              {totalCount}
            </span>
          </button>
        </div>
      </div>
      <AccountModal isOpen={isAccountModalOpen} onClose={() => setIsAccountModalOpen(false)} />
    </header>
  );
}
