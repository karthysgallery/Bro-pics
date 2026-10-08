'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { KarthysMark } from './KarthysMark';

const SEEN_KEY = 'karthys_splash_seen';
/** How long the first-visit splash stays (long enough to enjoy the animation, short enough never to feel slow). */
export const SPLASH_MIN_MS = 1700;
/** A page change shorter than this never shows a loader (fast navigations stay instant). */
export const NAV_DELAY_MS = 250;
/** If a page change somehow never reports back, stop showing the loader. */
export const NAV_GIVE_UP_MS = 15000;

const BOT = /bot|crawl|spider|lighthouse|pagespeed|headless/i;

function alreadySeen(): boolean {
  try {
    return window.sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * First-visit brand moment: the animated mark on the shop's own background, once per browser session, never in the admin
 * area and never for crawlers. It is part of the page's HTML (so it shows at once, before any script runs); a CSS failsafe
 * hides it after 3 seconds even if scripts never load, and people who ask for reduced motion see a still logo.
 */
export function SplashScreen() {
  const pathname = usePathname();
  const [state, setState] = useState<'showing' | 'leaving' | 'gone'>('showing');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const skip = pathname?.startsWith('/admin') || BOT.test(navigator.userAgent) || alreadySeen();
    if (skip) {
      setState('gone');
      return;
    }
    try {
      window.sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Private browsing: it simply plays again next time.
    }
    const leave = window.setTimeout(() => setState('leaving'), SPLASH_MIN_MS);
    const remove = window.setTimeout(() => setState('gone'), SPLASH_MIN_MS + 500);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(remove);
    };
  }, [pathname]);

  if (state === 'gone') return null;
  return (
    <div className="kl-splash" data-state={state} data-testid="splash-screen" role="status" aria-label="Loading KarthysGallery">
      <KarthysMark mode="intro" />
      <div className="kl-bar" aria-hidden="true"><i /></div>
    </div>
  );
}

/** A small centred loader for slow pages (route `loading.tsx` files, data waits). */
export function LoaderPanel({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-[55vh] w-full items-center justify-center py-16" role="status" aria-label={label} data-testid="loader-panel">
      <KarthysMark mode="loop" wordmark={false} />
    </div>
  );
}

/** True for a click on an ordinary in-site link that will start a page change. */
export function isInternalNavigation(event: MouseEvent, currentUrl: string): boolean {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const anchor = (event.target as Element | null)?.closest?.('a');
  if (!anchor) return false;
  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#') || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return false;
  let url: URL;
  try {
    url = new URL(href, currentUrl);
  } catch {
    return false;
  }
  const current = new URL(currentUrl);
  if (url.origin !== current.origin) return false;
  if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/api/')) return false;
  return url.pathname !== current.pathname || url.search !== current.search;
}

/**
 * Shows the loader while the next page is on its way: a slim progress bar at once, and the animated mark on a soft veil only if the
 * change takes longer than a quarter of a second. Clears itself when the new page arrives.
 */
export function NavigationLoader() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [pending, setPending] = useState(false);
  const timers = useRef<number[]>([]);

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  // The new page arrived.
  useEffect(() => {
    clear();
    setPending(false);
  }, [pathname, search]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!isInternalNavigation(event, window.location.href)) return;
      clear();
      timers.current.push(window.setTimeout(() => setPending(true), NAV_DELAY_MS));
      timers.current.push(window.setTimeout(() => setPending(false), NAV_GIVE_UP_MS));
    };
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      clear();
    };
  }, []);

  if (!pending) return null;
  return (
    <>
      <div className="kl-nav-bar" aria-hidden="true" />
      <div className="kl-nav" role="status" aria-label="Loading" data-testid="nav-loader">
        <KarthysMark mode="loop" wordmark={false} />
      </div>
    </>
  );
}
