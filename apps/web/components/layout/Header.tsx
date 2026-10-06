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
  extraNavLinks?: { label: string; href: string }[];
  /** List each top-level category in the menu (admin setting, default on). */
  showCategories?: boolean;
  /** A logo image chosen in the admin; the text logo shows when there is none. */
  logoSrc?: string | null;
  storeName?: string;
}

export function Header({ categories, onCartClick, extraNavLinks, showCategories = true, logoSrc = null, storeName }: HeaderProps) {
  const { totalCount } = useCart();
  const { user } = useAuth();
  const pathname = usePathname();
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    setUnreadCount(getUnreadCount());
    return subscribeToNotifications(() => setUnreadCount(getUnreadCount()));
  }, []);

  // Close mobile nav on route change
  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [pathname]);

  const topLevel = categories.filter((c) => !c.parentId).slice(0, 7);

  const navLinks = [
    { href: '/category', label: 'Shop all' },
    ...(showCategories ? topLevel.map((c) => ({ href: `/category/${c.slug}`, label: c.name })) : []),
    ...(extraNavLinks && extraNavLinks.length > 0
      ? extraNavLinks
      : [
          { href: '/#best-sellers', label: 'Best sellers' },
          { href: '/how-it-works', label: 'How it works' },
        ]),
  ];

  const isActive = (href: string) =>
    !href.includes('#') && (pathname === href || (href === '/category' && pathname === '/'));

  return (
    <header className="relative w-full bg-paper/95 backdrop-blur-md border-b border-line/60">

      {/* ── Main header row ── */}
      <div className="h-14 sm:h-16 mx-auto w-full max-w-shell px-4 sm:px-6 md:px-8 flex items-center justify-between gap-3 md:gap-6">

        {/* Mobile hamburger menu */}
        <button
          type="button"
          aria-label={isMobileNavOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={isMobileNavOpen}
          aria-controls="mobile-nav"
          onClick={() => setIsMobileNavOpen((o) => !o)}
          className="md:hidden flex items-center justify-center w-10 h-10 -ml-2 text-ink rounded-lg hover:bg-tint active:bg-tint transition-colors"
        >
          {isMobileNavOpen ? (
            /* X icon */
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          ) : (
            /* Hamburger icon */
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          )}
        </button>

        {/* Wordmark & tagline */}
        <Link
          href="/"
          aria-label={`${storeName ?? 'KarthysGallery'} home`}
          className="shrink-0 flex flex-col justify-center leading-none mr-auto md:mr-0 group"
        >
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoSrc} alt={storeName ?? 'KarthysGallery'} className="h-9 w-auto max-w-[180px] object-contain sm:h-10" />
          ) : (
            <>
              <span className="font-display text-[1.2rem] sm:text-xl md:text-[1.35rem] font-bold tracking-snug text-ink leading-tight">
                Karthys<span className="text-gold group-hover:text-gold-deep transition-colors">Gallery</span>
              </span>
              <span className="text-[10px] text-ink/50 font-normal leading-none tracking-wide mt-0.5">
                frames for a brighter you
              </span>
            </>
          )}
        </Link>

        {/* Desktop in-header search bar (Amazon/Flipkart pattern) */}
        <div className="hidden md:flex flex-1 max-w-lg lg:max-w-xl mx-4">
          <SearchTypeahead categories={topLevel} />
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1 sm:gap-2 text-ink shrink-0">

          {/* Account */}
          {user ? (
            <Link
              href="/account"
              className="relative flex items-center justify-center w-10 h-10 rounded-lg text-ink/70 hover:text-ink hover:bg-tint transition-colors"
              aria-label="Account"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 w-2 h-2 bg-gold rounded-full ring-2 ring-paper" aria-label={`${unreadCount} unread notifications`} />
              )}
            </Link>
          ) : (
            <Link
              href="/signin"
              className="flex items-center justify-center w-10 h-10 rounded-lg text-ink/70 hover:text-ink hover:bg-tint transition-colors"
              aria-label="Sign in"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
              </svg>
            </Link>
          )}

          {/* Wishlist — outline heart SVG */}
          <Link
            href="/account/wishlist"
            className="hidden sm:flex items-center justify-center w-10 h-10 rounded-lg text-ink/70 hover:text-ink hover:bg-tint transition-colors"
            aria-label="Wishlist"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </Link>

          {/* Cart — bag SVG with counter */}
          <button
            type="button"
            aria-label={`Cart, ${totalCount} item${totalCount !== 1 ? 's' : ''}`}
            onClick={onCartClick}
            className="relative flex items-center justify-center w-10 h-10 rounded-lg text-ink/70 hover:text-ink hover:bg-tint transition-colors"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 01-8 0" />
            </svg>
            <span
              data-testid="cart-count"
              className={`absolute top-1.5 right-1.5 min-w-[17px] h-[17px] flex items-center justify-center bg-gold text-ink text-[10px] font-bold rounded-full px-1 leading-none shadow-sm ${
                totalCount === 0 ? 'bg-line/70 text-ink/70 font-medium' : ''
              }`}
            >
              {totalCount > 99 ? '99+' : totalCount}
            </span>
            <span className="sr-only" data-testid="cart-count-sr">{totalCount}</span>
          </button>
        </div>
      </div>

      {/* ── Mobile in-header search bar ── */}
      <div className="md:hidden px-3.5 sm:px-4 pb-2.5 pt-0.5">
        <SearchTypeahead categories={topLevel} />
      </div>

      {/* ── Tier two browse bar for desktop ── */}
      <nav className="hidden md:block border-t border-line/50 bg-paper/60" aria-label="Category navigation">
        <div className="mx-auto w-full max-w-shell px-4 sm:px-6 md:px-8 flex items-stretch gap-6 lg:gap-8 text-[13px] font-medium overflow-x-auto scrollbar-none">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? 'page' : undefined}
              className={`py-2.5 flex items-center whitespace-nowrap border-b-2 transition-colors ${
                isActive(link.href)
                  ? 'border-ink text-ink font-semibold'
                  : 'border-transparent text-ink/65 hover:text-ink'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* ── Mobile navigation drawer / panel ── */}
      {isMobileNavOpen && (
        <nav
          id="mobile-nav"
          className="md:hidden border-t border-line/60 bg-paper mobile-nav-enter shadow-lg"
          aria-label="Category navigation"
        >
          <ul className="px-4 py-2 flex flex-col divide-y divide-line/30">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setIsMobileNavOpen(false)}
                  className={`flex items-center justify-between py-3 text-[15px] transition-colors ${
                    isActive(link.href)
                      ? 'font-semibold text-ink'
                      : 'text-ink/70 hover:text-ink'
                  }`}
                >
                  <span>{link.label}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink/30" aria-hidden="true">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>

          {/* Mobile sign-in / account CTA at bottom of menu */}
          <div className="p-4 bg-tint/50 border-t border-line/40">
            {user ? (
              <Link
                href="/account"
                onClick={() => setIsMobileNavOpen(false)}
                className="block w-full text-center py-3 text-sm font-semibold bg-ink text-paper rounded-btn hover:bg-ink/90 active:scale-[0.99] transition-all"
              >
                My Profile & Orders
              </Link>
            ) : (
              <Link
                href="/signin"
                onClick={() => setIsMobileNavOpen(false)}
                className="block w-full text-center py-3 text-sm font-semibold bg-ink text-paper rounded-btn hover:bg-ink/90 active:scale-[0.99] transition-all"
              >
                Sign in to your account
              </Link>
            )}
          </div>
        </nav>
      )}

      <AccountModal isOpen={isAccountModalOpen} onClose={() => setIsAccountModalOpen(false)} />
    </header>
  );
}
