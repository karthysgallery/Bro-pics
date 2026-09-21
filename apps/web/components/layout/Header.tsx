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

export function Header({ categories, onCartClick }: HeaderProps) {
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
    { href: '/#best-sellers', label: 'Best sellers' },
    { href: '/how-it-works', label: 'How it works' },
  ];

  const isActive = (href: string) =>
    !href.includes('#') && (pathname === href || (href === '/category' && pathname === '/'));

  return (
    <header className="sticky top-0 z-40 bg-paper border-b border-line">
      <div className={`${TIER_ONE} mx-auto w-full max-w-shell px-4 md:px-6 flex items-center gap-3 md:gap-6`}>
        <button
          type="button"
          aria-label="Browse categories"
          aria-expanded={isMobileNavOpen}
          onClick={() => setIsMobileNavOpen((open) => !open)}
          className="md:hidden text-ink"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>

        {/* Explicit label: the wordmark is split into two spans so "Pics" can
            take the accent, and without this a screen reader announces the
            link as "Bro Pics Frames for a brighter you". */}
        <Link href="/" aria-label="BroPics home" className="shrink-0 leading-none">
          <span className="block font-display text-[28px] leading-none font-bold tracking-tight text-ink">
            Bro<span className="text-gold">Pics</span>
          </span>
          {/* The tagline is the only letterspaced caps on the site: it is a
              signature, not a label stuck above a heading. */}
          <span className="hidden sm:block mt-1.5 text-[9px] uppercase tracking-[0.28em] text-ink/45">
            Frames for a brighter you
          </span>
        </Link>

        <div className="hidden md:block flex-1 min-w-0">
          <SearchTypeahead categories={topLevel} />
        </div>

        <span className="flex-1 md:hidden" aria-hidden="true" />

        <div className="flex items-center gap-4 md:gap-6 text-ink shrink-0">
          <Link href="/account/wishlist" className="hidden sm:block hover:text-accent transition-colors" aria-label="Wishlist">
            <ActionItem label="Wishlist">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M12 21s-7.5-4.6-10-9.1C.5 8.4 2 5 5.4 5c2 0 3.4 1 4.6 2.6C11.2 6 12.6 5 14.6 5 18 5 19.5 8.4 22 11.9 19.5 16.4 12 21 12 21z" />
              </svg>
            </ActionItem>
          </Link>

          {user && (
            <Link href="/account/notifications" className="hidden sm:block hover:text-accent transition-colors" aria-label="Notifications">
              <ActionItem
                label="Alerts"
                badge={
                  unreadCount > 0 ? (
                    <span
                      data-testid="notifications-count"
                      className="absolute -top-2 right-0 bg-gold text-ink text-2xs font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center"
                    >
                      {unreadCount}
                    </span>
                  ) : undefined
                }
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="M6 8a6 6 0 1 1 12 0c0 4.2 1.2 6.2 1.9 7.1a.7.7 0 0 1-.6 1.1H4.7a.7.7 0 0 1-.6-1.1C4.8 14.2 6 12.2 6 8z" />
                  <path d="M10 20a2 2 0 0 0 4 0" />
                </svg>
              </ActionItem>
            </Link>
          )}

          {user ? (
            <Link href="/account" className="hover:text-accent transition-colors" aria-label="Account">
              <ActionItem label="Account">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
                </svg>
              </ActionItem>
            </Link>
          ) : (
            <button aria-label="Sign in" onClick={() => setIsAccountModalOpen(true)} className="hover:text-accent transition-colors">
              <ActionItem label="Sign in">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
                </svg>
              </ActionItem>
            </button>
          )}

          <button aria-label="Cart" onClick={onCartClick} className="hover:text-accent transition-colors">
            <ActionItem
              label="Cart"
              badge={
                <span
                  data-testid="cart-count"
                  className="absolute -top-2 right-0 bg-gold text-ink text-2xs font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center"
                >
                  {totalCount}
                </span>
              }
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <circle cx="9" cy="21" r="1.3" fill="currentColor" stroke="none" />
                <circle cx="18" cy="21" r="1.3" fill="currentColor" stroke="none" />
                <path d="M2 3h2l2.4 12.2a2 2 0 0 0 2 1.6h8.7a2 2 0 0 0 2-1.6L21 7H6" />
              </svg>
            </ActionItem>
          </button>
        </div>
      </div>

      <div className="md:hidden px-4 pb-3">
        <SearchTypeahead categories={topLevel} />
      </div>

      {/* Tier two: the browse bar. The current section is marked with a gold
          underline rather than a filled pill — quieter, and it keeps a gold
          fill meaning "this is a button you press". */}
      <nav className={`${TIER_TWO} hidden md:block border-t border-line`} aria-label="Category navigation">
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
        <nav className="md:hidden border-t border-line px-4 py-3" aria-label="Category navigation">
          <ul className="flex flex-col gap-2.5 text-sm">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setIsMobileNavOpen(false)}
                  className={isActive(link.href) ? 'font-semibold text-ink' : 'text-ink/70'}
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
