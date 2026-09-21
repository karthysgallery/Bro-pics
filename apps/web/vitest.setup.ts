import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Node 22+ ships its own global `localStorage` (the `--experimental-webstorage`
// feature), on by default in the Node version this repo currently runs.
// Without a `--localstorage-file` path it installs as a broken stub — typeof
// 'object', but methods like .clear()/.getItem() are undefined — and because
// it's already present on globalThis before jsdom's environment setup runs,
// it silently wins over (shadows) jsdom's own working localStorage
// implementation. That's the actual cause of the "localStorage.clear is not
// a function" failures seen across several test files, not a jsdom bug.
// The property is configurable, so a plain in-memory polyfill here
// overrides it for every test file.
class MemoryStorage implements Storage {
  #store = new Map<string, string>();
  get length() {
    return this.#store.size;
  }
  clear(): void {
    this.#store.clear();
  }
  getItem(key: string): string | null {
    return this.#store.has(key) ? this.#store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.#store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.#store.delete(key);
  }
  key(index: number): string | null {
    return Array.from(this.#store.keys())[index] ?? null;
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  configurable: true,
  writable: true,
});

// jsdom doesn't implement window.matchMedia at all — any component reading
// a media query (e.g. VideoRail's `(prefers-reduced-motion: reduce)` check)
// throws "matchMedia is not a function" the moment it mounts in a test.
// `matches: false` is a reasonable default (motion allowed) since no test
// currently needs to simulate a specific query result; addEventListener/
// removeEventListener are real (backed by a Set) rather than no-ops, so a
// future test CAN dispatch a change event if it needs to.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    return {
      matches: false,
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) =>
        listeners.add(listener as (event: MediaQueryListEvent) => void),
      removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) =>
        listeners.delete(listener as (event: MediaQueryListEvent) => void),
      addListener: (listener: ((event: MediaQueryListEvent) => void) | null) => listener && listeners.add(listener),
      removeListener: (listener: ((event: MediaQueryListEvent) => void) | null) => listener && listeners.delete(listener),
      dispatchEvent: () => true,
    } as MediaQueryList;
  };
}

// jsdom's HTMLMediaElement.play()/pause() are stubs that don't return a
// Promise (unlike every real browser) — any component that calls
// `el.play().catch(...)` (e.g. VideoRail's autoplay-with-fallback) throws
// "Cannot read properties of undefined" the moment it mounts.
if (typeof window !== 'undefined' && window.HTMLMediaElement) {
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = () => {};
}

// jsdom has no layout engine, so it doesn't implement IntersectionObserver
// at all (not even as a stub) — any component that observes visibility
// (e.g. VideoRail's play-when-visible autoplay) throws
// "IntersectionObserver is not defined" the moment it mounts. A no-op
// observer (never fires a callback) is the standard minimal polyfill: jsdom
// has no real viewport, so "nothing is ever visible" is the honest answer,
// not a workaround that fakes visibility.
if (typeof window !== 'undefined' && !window.IntersectionObserver) {
  class NoopIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: ReadonlyArray<number> = [];
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  window.IntersectionObserver = NoopIntersectionObserver as unknown as typeof IntersectionObserver;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});
