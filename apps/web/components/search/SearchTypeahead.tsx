'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { Category } from '@bro-pics/shared';
import { formatPaise } from '../../lib/format-price';

interface Suggestion {
  id: string;
  title: string;
  slug: string;
  image?: string;
  pricePaise?: number;
  rating?: number;
  isBestSeller?: boolean;
}

interface CategorySuggestion {
  id: string;
  name: string;
  slug: string;
  image?: string;
}

interface SearchTypeaheadProps {
  /** Populates the scope selector. Omitted on pages that search everything. */
  categories?: Category[];
  placeholder?: string;
}

const RECENT_SEARCHES_KEY = 'bropics_recent_searches';
const DEBOUNCE_MS = 150;

export const DEFAULT_POPULAR_SEARCHES = [
  'Personalized Photo Frames',
  'Wedding Photo Frames',
  'Birthday Photo Collage',
  'Couple Photo Frames',
  'Family Photo Frames',
  'Collage Photo Frames',
];

export const BEST_SELLING_FRAMES: Suggestion[] = [
  {
    id: 'bs-1',
    title: 'Classic Wooden Photo Frame',
    slug: 'classic-wooden-frame',
    image: '/placeholders/products/classic-wooden-frame-1.jpg',
    pricePaise: 49900,
    rating: 4.9,
    isBestSeller: true,
  },
  {
    id: 'bs-2',
    title: 'Couple’s Memory Collage Frame',
    slug: 'couples-eye-frame',
    image: '/placeholders/products/couples-eye-frame-1.jpg',
    pricePaise: 39900,
    rating: 4.8,
    isBestSeller: true,
  },
  {
    id: 'bs-3',
    title: 'Vintage Wall Collage Set',
    slug: 'vintage-collage-frame',
    image: '/placeholders/products/vintage-collage-frame-1.jpg',
    pricePaise: 69900,
    rating: 4.9,
    isBestSeller: true,
  },
  {
    id: 'bs-4',
    title: 'Modern Acrylic Float Frame',
    slug: 'modern-acrylic-frame',
    image: '/placeholders/products/modern-acrylic-frame-1.jpg',
    pricePaise: 59900,
    rating: 4.7,
    isBestSeller: true,
  },
  {
    id: 'bs-5',
    title: 'Minimalist Desk Photo Frame',
    slug: 'desk-photo-frame',
    image: '/placeholders/products/desk-photo-frame-1.jpg',
    pricePaise: 29900,
    rating: 4.8,
    isBestSeller: true,
  },
];

function getRecentSearches(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  const existing = getRecentSearches().filter((q) => q !== query);
  const next = [query, ...existing].slice(0, 5);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
}

export function SearchTypeahead({
  categories = [],
  placeholder = 'Search for frames, gifts and more...',
}: SearchTypeaheadProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [categorySuggestions, setCategorySuggestions] = useState<CategorySuggestion[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [popularSearches, setPopularSearches] = useState<string[]>(DEFAULT_POPULAR_SEARCHES);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /** Closes the dropdown (and, on phones, the keyboard). The typed text stays. */
  const closeDropdown = useCallback(() => {
    setIsFocused(false);
    setHighlightedIndex(-1);
    inputRef.current?.blur();
  }, []);

  // One dropdown for every screen size: it closes when the shopper taps or
  // tabs anywhere outside the search, and whenever the page changes (a
  // product or result was opened), so it never stays over the next page.
  useEffect(() => {
    if (!isFocused) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) closeDropdown();
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsFocused(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [isFocused, closeDropdown]);

  useEffect(() => {
    setIsFocused(false);
    setHighlightedIndex(-1);
    // Keep the words on the results page; anywhere else start with an empty box.
    if (!pathname?.startsWith('/search')) setQuery('');
  }, [pathname]);

  useEffect(() => {
    setRecentSearches(getRecentSearches());
    fetch('/api/search-suggestions?q=')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.popularSearches && data.popularSearches.length > 0) {
          setPopularSearches(data.popularSearches);
        }
      })
      .catch(() => {});
  }, []);

  // Sync recent searches on focus
  const refreshRecentSearches = () => {
    setRecentSearches(getRecentSearches());
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortControllerRef.current) abortControllerRef.current.abort();

    if (query.trim().length === 0) {
      setSuggestions([]);
      setCategorySuggestions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch(`/api/search-suggestions?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (response.ok) {
          const data = await response.json();
          setSuggestions(data.products ?? []);
          setCategorySuggestions(data.categories ?? []);
        }
      } catch (err: unknown) {
        if ((err as Error)?.name !== 'AbortError') {
          // ignore network hiccups
        }
      } finally {
        setIsLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [query]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [suggestions, query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length === 0) return;
    saveRecentSearch(query.trim());
    closeDropdown();
    if (scope) {
      router.push(`/category/${scope}?q=${encodeURIComponent(query.trim())}`);
      return;
    }
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  const handleSelectQuery = (term: string) => {
    saveRecentSearch(term);
    setQuery(term);
    closeDropdown();
    router.push(`/search?q=${encodeURIComponent(term)}`);
  };

  const removeSingleRecent = (termToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = recentSearches.filter((t) => t !== termToRemove);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    setRecentSearches(updated);
  };

  const clearAllRecent = (e: React.MouseEvent) => {
    e.stopPropagation();
    localStorage.removeItem(RECENT_SEARCHES_KEY);
    setRecentSearches([]);
  };

  // Keyboard navigation calculation
  const showRecent = isFocused && query.trim().length === 0 && recentSearches.length > 0;
  const showPopular = isFocused && query.trim().length === 0 && popularSearches.length > 0;
  const isTyping = query.trim().length > 0;
  const noResults = isTyping && !isLoading && suggestions.length === 0 && categorySuggestions.length === 0;

  const navigableCount = isTyping ? suggestions.length : showRecent ? recentSearches.length : showPopular ? popularSearches.length : 0;
  const optionId = (index: number) =>
    `search-option-${isTyping ? 'suggestion' : showRecent ? 'recent' : 'popular'}-${index}`;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      if (navigableCount === 0) return;
      e.preventDefault();
      setHighlightedIndex((i) => (i + 1) % navigableCount);
    } else if (e.key === 'ArrowUp') {
      if (navigableCount === 0) return;
      e.preventDefault();
      setHighlightedIndex((i) => (i - 1 + navigableCount) % navigableCount);
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault();
      if (isTyping) {
        const suggestion = suggestions[highlightedIndex];
        closeDropdown();
        router.push(`/product/${suggestion.slug}`);
      } else if (showRecent) {
        handleSelectQuery(recentSearches[highlightedIndex]);
      } else if (showPopular) {
        handleSelectQuery(popularSearches[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      closeDropdown();
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* ── IN-HEADER SEARCH BAR (all screen sizes) ── */}
      <form onSubmit={handleSubmit} className="relative w-full">
        <div
          className={`flex items-center gap-2 rounded-full border transition-all duration-200 pl-3.5 pr-1.5 py-1.5 ${
            isFocused
              ? 'bg-paper border-ink/80 shadow-md ring-2 ring-ink/10'
              : 'bg-field border-line/80 hover:border-line focus-within:border-ink/60 focus-within:bg-paper'
          }`}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-ink/40 ml-0.5"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>

          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-expanded={isFocused || suggestions.length > 0}
            aria-controls="search-listbox"
            aria-activedescendant={highlightedIndex >= 0 ? optionId(highlightedIndex) : undefined}
            aria-label="Search products"
            placeholder={placeholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsFocused(true);
            }}
            onFocus={() => {
              refreshRecentSearches();
              setIsFocused(true);
            }}
            onClick={() => setIsFocused(true)}
            onKeyDown={handleKeyDown}
            className="flex-1 min-w-0 bg-transparent text-base md:text-[13.5px] text-ink placeholder:text-ink/50 focus:outline-none py-1 h-9 md:h-auto appearance-none [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
          />

          {isLoading && (
            <span className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0 mr-1" />
          )}

          {query.length > 0 && !isLoading && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSuggestions([]);
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="text-ink/40 hover:text-ink p-1 rounded-full hover:bg-tint transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}

          {categories.length > 0 && (
            <>
              <span className="hidden lg:block w-px h-4 bg-line/80 mx-1" aria-hidden="true" />
              <select
                aria-label="Search within"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="hidden lg:block bg-transparent text-[12.5px] text-ink/70 font-medium focus:outline-none cursor-pointer max-w-[8.5rem] truncate pr-1"
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </select>
            </>
          )}

          <button
            type="submit"
            aria-label="Search"
            className="shrink-0 w-8 h-8 rounded-full bg-gold hover:bg-gold-deep text-ink flex items-center justify-center transition-colors shadow-xs active:scale-95"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </button>
        </div>
      </form>

      {/* ── SEARCH DROPDOWN (same on phone and desktop) ── */}
      {isFocused && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 bg-field border border-line rounded-2xl mt-2 py-3 z-50 shadow-2xl shadow-ink/15 overflow-hidden max-h-[70vh] md:max-h-[85vh] overflow-y-auto overscroll-contain"
        >
          {/* 1. WHILE TYPING: Live Results (Categories, Suggestions, Products) */}
          {isTyping && (
            <div className="space-y-3">
              {/* Category Suggestions */}
              {categorySuggestions.length > 0 && (
                <div className="px-3.5 pb-2 border-b border-line/50">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/40 mb-1">
                    Categories
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {categorySuggestions.map((category) => (
                      <Link
                        key={category.id}
                        href={`/category/${category.slug}`}
                        onClick={closeDropdown}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-paper border border-line/70 hover:border-ink/50 text-xs font-medium text-ink transition-colors"
                      >
                        <span className="relative w-5 h-5 rounded-md overflow-hidden bg-tint border border-line/40 shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={category.image || '/placeholders/products/classic-wooden-frame-1.jpg'}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </span>
                        <span>{category.name}</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink/40">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Product Results */}
              {suggestions.length > 0 && (
                <div className="px-3.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/40">
                      Products
                    </p>
                    <span className="text-[11px] text-ink/50">
                      {suggestions.length} matching frame{suggestions.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div id="search-listbox" role="listbox" className="space-y-1">
                    {suggestions.map((suggestion, index) => (
                      <Link
                        key={suggestion.id}
                        id={optionId(index)}
                        role="option"
                        aria-label={suggestion.title}
                        aria-selected={index === highlightedIndex}
                        href={`/product/${suggestion.slug}`}
                        onClick={() => {
                          saveRecentSearch(suggestion.title);
                          closeDropdown();
                        }}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all ${
                          index === highlightedIndex ? 'bg-tint ring-1 ring-line' : 'hover:bg-tint/70 bg-paper border border-line/40'
                        }`}
                      >
                        <span className="relative w-10 h-10 rounded-lg bg-tint border border-line/40 shrink-0 overflow-hidden flex items-center justify-center">
                          {suggestion.image ? (
                            <Image src={suggestion.image} alt="" fill sizes="40px" className="object-cover" />
                          ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ink/35">
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <polyline points="21 15 16 10 5 21" />
                            </svg>
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-ink text-xs sm:text-sm truncate">
                            {suggestion.title}
                          </p>
                          <p className="text-2xs text-ink/50">Click to view personalized options</p>
                        </div>
                        {suggestion.pricePaise != null && suggestion.pricePaise > 0 && (
                          <span className="text-xs font-bold text-ink shrink-0 ml-2">
                            {formatPaise(suggestion.pricePaise)}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* View all results link */}
              <div className="pt-2 px-3.5 border-t border-line/60">
                <Link
                  href={`/search?q=${encodeURIComponent(query.trim())}`}
                  onClick={() => {
                    saveRecentSearch(query.trim());
                    closeDropdown();
                  }}
                  className="flex items-center justify-between text-xs font-semibold text-ink hover:text-accent transition-colors py-1.5 px-2 rounded-lg bg-paper border border-line/70"
                >
                  <span>View all results for &ldquo;{query.trim()}&rdquo;</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </Link>
              </div>

              {/* No Results Fallback */}
              {noResults && (
                <div className="px-4 py-6 text-center">
                  <div className="w-10 h-10 rounded-full bg-tint text-ink/40 flex items-center justify-center mx-auto mb-2.5">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <circle cx="11" cy="11" r="7" />
                      <path d="M20 20l-3.5-3.5" />
                      <line x1="8" y1="11" x2="14" y2="11" />
                    </svg>
                  </div>
                  <p className="font-display text-base font-bold text-ink">No frames found</p>
                  <p className="text-xs text-ink/60 mt-1 max-w-xs mx-auto">
                    Try searching for another style, occasion or product.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 2. EMPTY INPUT: NEW USER & RETURNING USER FLOW */}
          {!isTyping && (
            <div className="space-y-4">
              
              {/* SECTION A: Recent Searches (Returning User Only) */}
              {showRecent && (
                <div className="px-3.5">
                  <div className="flex items-center justify-between pb-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50">
                      Recent searches
                    </p>
                    <button
                      type="button"
                      onClick={clearAllRecent}
                      className="text-[11px] text-ink/50 hover:text-ink font-medium underline transition-colors"
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="space-y-1">
                    {recentSearches.map((term) => (
                      <div
                        key={term}
                        onClick={() => handleSelectQuery(term)}
                        className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-paper hover:bg-tint border border-line/40 text-xs text-ink/80 hover:text-ink cursor-pointer transition-colors group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink/40 shrink-0">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                          <span className="truncate font-medium">{term}</span>
                        </div>
                        <button
                          type="button"
                          aria-label={`Remove search ${term}`}
                          onClick={(e) => removeSingleRecent(term, e)}
                          className="text-ink/30 hover:text-ink p-1 rounded-md transition-colors"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SECTION B: Popular Searches (Both New and Returning Users) */}
              <div className="px-3.5 pt-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50 mb-2">
                  Top searches
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {popularSearches.map((popular) => (
                    <button
                      key={popular}
                      type="button"
                      onClick={() => handleSelectQuery(popular)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-paper hover:bg-tint border border-line/70 hover:border-ink/40 text-xs font-medium text-ink transition-colors shadow-2xs"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gold shrink-0">
                        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                        <polyline points="17 6 23 6 23 12" />
                      </svg>
                      <span>{popular}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* SECTION C: Best Selling Frames (Horizontally Scrollable Carousel) */}
              <div className="pt-2 px-3.5 border-t border-line/60">
                <div className="flex items-center justify-between mb-2.5">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50">
                      Best Selling Frames
                    </p>
                    <p className="text-2xs text-ink/60">Handpicked customer favorites</p>
                  </div>
                  <span className="text-2xs text-ink/40 font-mono">Scroll &rarr;</span>
                </div>

                {/* Horizontal Product Carousel */}
                <div className="flex gap-2.5 overflow-x-auto pb-2 pt-0.5 scrollbar-none snap-x">
                  {BEST_SELLING_FRAMES.map((item) => (
                    <Link
                      key={item.id}
                      href={`/product/${item.slug}`}
                      onClick={() => {
                        saveRecentSearch(item.title);
                        closeDropdown();
                      }}
                      className="group shrink-0 w-[145px] sm:w-[155px] snap-start bg-paper rounded-xl border border-line/70 p-2 hover:border-ink/50 hover:shadow-xs transition-all flex flex-col justify-between"
                    >
                      <div>
                        {/* Thumbnail */}
                        <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-tint mb-2">
                          <Image
                            src={item.image ?? '/placeholders/products/classic-wooden-frame-1.jpg'}
                            alt={item.title}
                            fill
                            sizes="160px"
                            className="object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                          {item.isBestSeller && (
                            <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-ink text-paper text-[9px] font-bold tracking-wide uppercase">
                              Best Seller
                            </span>
                          )}
                        </div>

                        {/* Title */}
                        <p className="text-xs font-semibold text-ink line-clamp-2 leading-tight group-hover:text-accent transition-colors">
                          {item.title}
                        </p>
                      </div>

                      {/* Price & Rating */}
                      <div className="mt-2 pt-1 border-t border-line/40 flex items-center justify-between text-2xs">
                        <span className="font-bold text-ink">
                          {formatPaise(item.pricePaise ?? 4999)}
                        </span>
                        {item.rating && (
                          <span className="flex items-center gap-0.5 font-semibold text-ink/75">
                            <span className="text-gold text-[10px]">★</span>
                            {item.rating}
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>
      )}

    </div>
  );
}
