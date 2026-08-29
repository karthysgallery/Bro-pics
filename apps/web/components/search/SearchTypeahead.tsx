'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Suggestion {
  id: string;
  title: string;
  slug: string;
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

export function SearchTypeahead() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length === 0) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const response = await fetch(`/api/search-suggestions?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.products ?? []);
      }
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length === 0) return;
    saveRecentSearch(query.trim());
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      <input
        type="search"
        placeholder="Search products..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() =>
          setTimeout(() => {
            setIsFocused(false);
            setSuggestions([]);
          }, 150)
        }
        className="w-full rounded-full border border-charcoal/20 px-4 py-2 text-sm"
      />
      {(isFocused || suggestions.length > 0) && (
        <div className="absolute top-full left-0 right-0 bg-surface rounded-lg shadow-lg mt-1 p-3 z-50">
          {isFocused && query.trim().length === 0 && recentSearches.length > 0 && (
            <div>
              <p className="text-xs text-charcoal/50 mb-1">Recent searches</p>
              {recentSearches.map((recent) => (
                <button
                  key={recent}
                  type="button"
                  onClick={() => setQuery(recent)}
                  className="block text-sm py-1 text-left w-full"
                >
                  {recent}
                </button>
              ))}
            </div>
          )}
          {suggestions.map((suggestion) => (
            <Link
              key={suggestion.id}
              href={`/product/${suggestion.slug}`}
              className="block text-sm py-1 hover:text-terracotta"
            >
              {suggestion.title}
            </Link>
          ))}
        </div>
      )}
    </form>
  );
}
