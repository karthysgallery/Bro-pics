'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { Category } from '@bro-pics/shared';

interface Suggestion {
  id: string;
  title: string;
  slug: string;
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
}

const RECENT_SEARCHES_KEY = 'bropics_recent_searches';
const DEBOUNCE_MS = 250;

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

export function SearchTypeahead({ categories = [] }: SearchTypeaheadProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [categorySuggestions, setCategorySuggestions] = useState<CategorySuggestion[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  // [FE-31] getPopularSearches/settings/search (BE-23) already had a
  // working read path via GET /api/search-suggestions?q= (empty) — this
  // component just never called it or rendered the result, so it sat
  // unused end to end.
  const [popularSearches, setPopularSearches] = useState<string[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecentSearches(getRecentSearches());
    // Fetched once on mount, not re-fetched per keystroke — popular
    // searches are curated (settings/search), not a live search result.
    fetch('/api/search-suggestions?q=')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setPopularSearches(data?.popularSearches ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length === 0) {
      setSuggestions([]);
      setCategorySuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const response = await fetch(`/api/search-suggestions?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.products ?? []);
        setCategorySuggestions(data.categories ?? []);
      }
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [suggestions, query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length === 0) return;
    saveRecentSearch(query.trim());
    // Picking a category scopes the search to that listing page, where the
    // filters live, instead of dropping the choice on the floor.
    if (scope) {
      router.push(`/category/${scope}?q=${encodeURIComponent(query.trim())}`);
      return;
    }
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  // Keyboard-navigable list is either the recent-searches list (query
  // empty, at least one exists), popular searches (query empty, no
  // recent searches yet), or the fetched product suggestions (query
  // non-empty) — never more than one at once, matching what's actually
  // rendered below. Category suggestions are shown alongside product
  // suggestions but deliberately excluded from arrow-key navigation —
  // they're plain links to a category page, not a "pick one" list the
  // other three groups are.
  const showRecent = isFocused && query.trim().length === 0 && recentSearches.length > 0;
  const showPopular = isFocused && query.trim().length === 0 && recentSearches.length === 0 && popularSearches.length > 0;
  const navigableCount = showRecent ? recentSearches.length : showPopular ? popularSearches.length : suggestions.length;
  const optionId = (index: number) =>
    `search-option-${showRecent ? 'recent' : showPopular ? 'popular' : 'suggestion'}-${index}`;

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
      if (showRecent) {
        setQuery(recentSearches[highlightedIndex]);
      } else if (showPopular) {
        setQuery(popularSearches[highlightedIndex]);
      } else {
        const suggestion = suggestions[highlightedIndex];
        setIsFocused(false);
        setSuggestions([]);
        router.push(`/product/${suggestion.slug}`);
      }
    } else if (e.key === 'Escape') {
      setIsFocused(false);
      setSuggestions([]);
      setHighlightedIndex(-1);
      inputRef.current?.blur();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div className="flex items-center gap-2 rounded-full bg-field border border-line pl-4 pr-1.5 py-2 focus-within:border-gold transition-colors">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="shrink-0 text-ink/45"
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
          placeholder="Search for frames, gifts and more..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onKeyDown={handleKeyDown}
          onBlur={() =>
            setTimeout(() => {
              setIsFocused(false);
              setSuggestions([]);
            }, 150)
          }
          className="flex-1 min-w-0 bg-transparent text-sm text-ink placeholder:text-ink/40 focus:outline-none"
        />

        {categories.length > 0 && (
          <>
            <span className="hidden md:block w-px h-5 bg-line" aria-hidden="true" />
            <select
              aria-label="Search within"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="hidden md:block bg-transparent text-sm text-ink/70 focus:outline-none cursor-pointer max-w-[9rem]"
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
          className="shrink-0 w-9 h-9 rounded-full bg-gold text-ink flex items-center justify-center hover:bg-gold-deep transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
        </button>
      </div>

      {(isFocused || suggestions.length > 0) && (
        <div
          id="search-listbox"
          role="listbox"
          className="absolute top-full left-0 right-0 bg-paper border border-line rounded-2xl mt-2 py-2 z-50 shadow-lg shadow-ink/5"
        >
          {showRecent && (
            <div className="pb-1">
              <p className="px-4 pb-1 text-2xs text-ink/50">Recent searches</p>
              {recentSearches.map((recent, index) => (
                <button
                  key={recent}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === highlightedIndex}
                  type="button"
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => setQuery(recent)}
                  className={`block w-full px-4 py-2 text-left text-sm text-ink/80 ${index === highlightedIndex ? 'bg-tint' : 'hover:bg-tint'}`}
                >
                  {recent}
                </button>
              ))}
            </div>
          )}
          {showPopular && (
            <div className="pb-1">
              <p className="px-4 pb-1 text-2xs text-ink/50">Popular searches</p>
              {popularSearches.map((popular, index) => (
                <button
                  key={popular}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === highlightedIndex}
                  type="button"
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => setQuery(popular)}
                  className={`block w-full px-4 py-2 text-left text-sm text-ink/80 ${index === highlightedIndex ? 'bg-tint' : 'hover:bg-tint'}`}
                >
                  {popular}
                </button>
              ))}
            </div>
          )}
          {categorySuggestions.length > 0 && (
            <div className="pb-1 border-b border-line">
              {categorySuggestions.map((category) => (
                <Link
                  key={category.id}
                  href={`/category/${category.slug}`}
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-ink hover:bg-tint"
                >
                  <span className="relative w-6 h-6 rounded-full overflow-hidden bg-tint shrink-0">
                    {category.image && (
                      <Image src={category.image} alt="" fill sizes="24px" className="object-cover" />
                    )}
                  </span>
                  <span>
                    {category.name} <span className="text-ink/45">— category</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
          {suggestions.map((suggestion, index) => (
            <Link
              key={suggestion.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === highlightedIndex}
              href={`/product/${suggestion.slug}`}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`block px-4 py-2 text-sm text-ink ${index === highlightedIndex ? 'bg-tint' : 'hover:bg-tint'}`}
            >
              {suggestion.title}
            </Link>
          ))}
        </div>
      )}
    </form>
  );
}
