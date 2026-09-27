import type { SearchFilters } from '@bro-pics/shared';

interface SortSelectProps {
  value: SearchFilters['sort'];
  onChange: (sort: SearchFilters['sort']) => void;
  className?: string;
}

// [FE-30] Matches the exact set buildProductQueryPlan's SORT_MAP already
// understands (packages/shared/src/search/build-query-plan.ts) — this is
// the read side, not a new sort mode.
const SORT_OPTIONS: { value: NonNullable<SearchFilters['sort']>; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'best_selling', label: 'Best selling' },
  { value: 'top_rated', label: 'Top rated' },
];

export function SortSelect({ value, onChange, className }: SortSelectProps) {
  return (
    <select
      aria-label="Sort by"
      value={value ?? 'relevance'}
      onChange={(e) => onChange(e.target.value as SearchFilters['sort'])}
      className={`rounded-md border border-line px-3 py-2 text-sm text-ink bg-paper ${className ?? ''}`}
    >
      {SORT_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
