import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';

let mockPath = '/';
let mockSearch = '';
vi.mock('next/navigation', () => ({ usePathname: () => mockPath, useSearchParams: () => new URLSearchParams(mockSearch) }));

import { LoaderPanel, NAV_DELAY_MS, NavigationLoader, SPLASH_MIN_MS, SplashScreen, isInternalNavigation } from './Preloader';

beforeEach(() => {
  vi.useFakeTimers();
  window.sessionStorage.clear();
  mockPath = '/';
  mockSearch = '';
});
afterEach(() => vi.useRealTimers());

describe('SplashScreen', () => {
  it('plays once on the first visit of a session, then leaves', () => {
    render(<SplashScreen />);
    expect(screen.getByTestId('splash-screen').getAttribute('data-state')).toBe('showing');
    act(() => { vi.advanceTimersByTime(SPLASH_MIN_MS + 10); });
    expect(screen.getByTestId('splash-screen').getAttribute('data-state')).toBe('leaving');
    act(() => { vi.advanceTimersByTime(600); });
    expect(screen.queryByTestId('splash-screen')).toBeNull();
    expect(window.sessionStorage.getItem('karthys_splash_seen')).toBe('1');
  });

  it('does not play again in the same session', () => {
    window.sessionStorage.setItem('karthys_splash_seen', '1');
    render(<SplashScreen />);
    expect(screen.queryByTestId('splash-screen')).toBeNull();
  });

  it('never shows in the admin area', () => {
    mockPath = '/admin/orders';
    render(<SplashScreen />);
    expect(screen.queryByTestId('splash-screen')).toBeNull();
  });
});

describe('isInternalNavigation', () => {
  const link = (href: string, attrs: Record<string, string> = {}) => {
    const a = document.createElement('a');
    a.setAttribute('href', href);
    for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
    document.body.appendChild(a);
    return a;
  };
  const click = (target: Element, init: MouseEventInit = {}) => new MouseEvent('click', { bubbles: true, button: 0, ...init }) && Object.defineProperty(new MouseEvent('click', { bubbles: true, button: 0, ...init }), 'target', { value: target });
  const here = 'https://shop.test/product/a';

  it('is true for an ordinary link to another page of the shop', () => {
    expect(isInternalNavigation(click(link('/category/frames')) as MouseEvent, here)).toBe(true);
    expect(isInternalNavigation(click(link('/product/a?variantId=v2')) as MouseEvent, here)).toBe(true);
  });

  it('is false for the same page, anchors, other sites, new tabs, downloads, modifier clicks, admin and api', () => {
    expect(isInternalNavigation(click(link('/product/a')) as MouseEvent, here)).toBe(false);
    expect(isInternalNavigation(click(link('#reviews')) as MouseEvent, here)).toBe(false);
    expect(isInternalNavigation(click(link('https://elsewhere.test/x')) as MouseEvent, here)).toBe(false);
    expect(isInternalNavigation(click(link('/about', { target: '_blank' })) as MouseEvent, here)).toBe(false);
    expect(isInternalNavigation(click(link('/f.pdf', { download: '' })) as MouseEvent, here)).toBe(false);
    expect(isInternalNavigation(click(link('/about'), { ctrlKey: true }) as MouseEvent, here)).toBe(false);
    expect(isInternalNavigation(click(link('/admin/orders')) as MouseEvent, here)).toBe(false);
    expect(isInternalNavigation(click(link('/api/media/x')) as MouseEvent, here)).toBe(false);
  });
});

describe('NavigationLoader', () => {
  it('stays out of the way for fast page changes and appears only when one takes longer than a moment', () => {
    const { rerender } = render(<NavigationLoader />);
    const a = document.createElement('a');
    a.setAttribute('href', '/category/frames');
    document.body.appendChild(a);

    act(() => { a.click(); });
    act(() => { vi.advanceTimersByTime(NAV_DELAY_MS - 50); });
    expect(screen.queryByTestId('nav-loader')).toBeNull();

    // The page arrives before the delay is over: nothing was ever shown.
    mockPath = '/category/frames';
    rerender(<NavigationLoader />);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByTestId('nav-loader')).toBeNull();

    // A slow one shows the loader, and the arrival clears it.
    const b = document.createElement('a');
    b.setAttribute('href', '/combos');
    document.body.appendChild(b);
    act(() => { b.click(); });
    act(() => { vi.advanceTimersByTime(NAV_DELAY_MS + 10); });
    expect(screen.getByTestId('nav-loader')).toBeTruthy();
    mockPath = '/combos';
    rerender(<NavigationLoader />);
    expect(screen.queryByTestId('nav-loader')).toBeNull();
  });
});

describe('LoaderPanel', () => {
  it('is an announced status with the animated mark', () => {
    render(<LoaderPanel label="Loading orders" />);
    expect(screen.getByRole('status', { name: 'Loading orders' })).toBeTruthy();
  });
});
