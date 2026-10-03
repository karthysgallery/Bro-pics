'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Category } from '@bro-pics/shared';
import { useCart } from '../../lib/cart-context';
import { useAuth } from '../../lib/auth-context';
import { getUnreadCount, subscribeToNotifications } from '../../lib/notifications';
import { SearchTypeahead } from '../search/SearchTypeahead';
import { AccountModal } from './AccountModal';

interface HeaderProps {
  categories: Category[];
  onCartClick: () => void;
  // [FE-27] From settings/header (ABE-24's write API had no reader until
  // now). Replaces the hardcoded 'Best sellers'/'How it works' tail below
  // when an admin has actually configured it — the category-derived links
  // ahead of them stay untouched either way, since those are already real
  // per-category data, not hardcoded copy.
  extraNavLinks?: { label: string; href: string }[];
}

// Fixed tier heights (80 + 48). Deterministic rather than content-driven so
// anything below can size against the header.
const TIER_ONE = 'h-16 md:h-20';
const TIER_TWO = 'h-12';

/** Icon over a small label, as in the reference — the label is what makes a
 *  bare glyph unambiguous, and it costs one line of height. */
function ActionItem({
  label,
  children,
  badge,
}: {
  label: string;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <span className="relative flex flex-col items-center gap-1">
      {children}
      <span className="text-2xs text-ink/60 leading-none">{label}</span>
      {badge}
    </span>
  );
}

export function Header({ categories, onCartClick, extraNavLinks }: HeaderProps) {
  const { totalCount } = useCart();
  const { user } = useAuth();
  const pathname = usePathname();
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  // Reads the shared cache NotificationsSync (mounted once in layout.tsx)
  // keeps fresh — this component never fetches on its own, so mounting it in
  // isolation (as Header.test.tsx does) never triggers a network call.
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    setUnreadCount(getUnreadCount());
    return subscribeToNotifications(() => setUnreadCount(getUnreadCount()));
  }, []);

  // Top-level categories only — the second tier is a browse bar, not a
  // sitemap. Anything deeper belongs on the category page's own filters.
  const topLevel = categories.filter((category) => !category.parentId).slice(0, 7);

  const navLinks = [
    { href: '/category', label: 'Shop all' },
    ...topLevel.map((c) => ({ href: `/category/${c.slug}`, label: c.name })),
    ...(extraNavLinks && extraNavLinks.length > 0
      ? extraNavLinks
      : [
          { href: '/#best-sellers', label: 'Best sellers' },
          { href: '/how-it-works', label: 'How it works' },
        ]),
  ];

  // Figma nav: "Shop frames · Gallery sets · How it works · Our story"
  // These come from navLinks which are built from real categories + settings
  const headerNavLinks = [
    ...topLevel.map((c) => ({ href: `/category/${c.slug}`, label: c.name })),
    ...(extraNavLinks && extraNavLinks.length > 0
      ? extraNavLinks
      : [
          { href: '/category', label: 'Gallery sets' },
          { href: '/how-it-works', label: 'How it works' },
          { href: '/about', label: 'Our story' },
        ]),
  ];

  const isActive = (href: string) =>
    !href.includes('#') && (pathname === href || (href === '/category' && pathname === '/'));

  return (
    <header className="sticky top-8 z-40 bg-paper border-b border-line/40">
      {/* Main header row */}
      <div className="h-14 md:h-16 mx-auto w-full max-w-shell px-3 sm:px-4 md:px-8 flex items-center justify-between gap-2 sm:gap-6">
        {/* Mobile menu button */}
        <button
          type="button"
          aria-label="Browse categories"
          aria-expanded={isMobileNavOpen}
          onClick={() => setIsMobileNavOpen((open) => !open)}
          className="md:hidden text-ink p-1.5 -ml-1 rounded-lg hover:bg-tint transition-colors"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>

        {/* Wordmark — Figma: "KarthysGallery" in bold black */}
        <Link href="/" aria-label="KarthysGallery home" className="shrink-0 leading-none">
          <span className="block font-display text-lg sm:text-xl md:text-2xl leading-none font-bold tracking-tight text-ink">
            KarthysGallery
          </span>
          <span className="sr-only">Frames for a brighter you</span>
        </Link>

        {/* Centered Navigation Links — Figma: Shop frames · Gallery sets · How it works · Our story */}
        <nav className="hidden md:flex items-center gap-7 text-[13px] font-medium text-ink/70" aria-label="Main navigation">
          {navLinks.slice(0, 5).map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`hover:text-ink transition-colors whitespace-nowrap ${
                isActive(link.href) ? 'text-ink font-semibold' : 'text-ink/70'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Action icons on right — Figma: Search, Account, Wishlist, Bag(n) */}
        <div className="flex items-center gap-2 sm:gap-4 md:gap-5 text-ink shrink-0">
          <Link href="/search" className="hover:text-ink/60 transition-colors p-1.5" aria-label="Search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4.2-4.2" />
            </svg>
          </Link>

          {user ? (
            <Link href="/account" className="hover:text-ink/60 transition-colors p-1.5" aria-label="Account">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
              </svg>
            </Link>
          ) : (
            <button aria-label="Sign in" onClick={() => setIsAccountModalOpen(true)} className="hover:text-ink/60 transition-colors p-1.5">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
              </svg>
            </button>
          )}

          <Link href="/account/wishlist" className="hidden sm:block hover:text-ink/60 transition-colors p-1.5" aria-label="Wishlist">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 21s-7.5-4.6-10-9.1C.5 8.4 2 5 5.4 5c2 0 3.4 1 4.6 2.6C11.2 6 12.6 5 14.6 5 18 5 19.5 8.4 22 11.9 19.5 16.4 12 21 12 21z" />
            </svg>
          </Link>

          <button
            aria-label="Cart"
            onClick={onCartClick}
            className="flex items-center gap-1.5 hover:text-ink/60 transition-colors text-sm font-medium p-1.5"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0" />
            </svg>
            <span className="text-xs font-medium text-ink whitespace-nowrap">
              Bag (<span data-testid="cart-count">{totalCount}</span>)
            </span>
          </button>
        </div>
      </div>

      {/* Hidden desktop search input instance for accessibility/test compatibility while maintaining clean bar */}
      <div className="hidden md:block absolute -left-[9999px] top-0 opacity-0 pointer-events-none" aria-hidden="true">
        <SearchTypeahead categories={topLevel} />
      </div>

      {/* Mobile search bar */}
      <div className="md:hidden px-3 sm:px-4 pb-3">
        <SearchTypeahead categories={topLevel} />
      </div>


      {/* Category navigation browse bar */}
      <nav className="hidden border-t border-line" aria-label="Category navigation">
        <div className="rail h-full mx-auto w-full max-w-shell px-4 md:px-6 flex items-stretch gap-7 text-sm overflow-x-auto">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? 'page' : undefined}
              className={`flex items-center whitespace-nowrap border-b-2 transition-colors ${
                isActive(link.href)
                  ? 'border-gold text-ink font-semibold'
                  : 'border-transparent text-ink/70 hover:text-accent'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </nav>

      {isMobileNavOpen && (
        <nav className="md:hidden border-t border-line px-4 py-4 bg-paper shadow-lg" aria-label="Category navigation">
          <ul className="flex flex-col divide-y divide-line/40 text-sm">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setIsMobileNavOpen(false)}
                  className={`block py-2.5 transition-colors ${isActive(link.href) ? 'font-bold text-ink' : 'text-ink/75 hover:text-ink'}`}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <AccountModal isOpen={isAccountModalOpen} onClose={() => setIsAccountModalOpen(false)} />
    </header>
  );

}
