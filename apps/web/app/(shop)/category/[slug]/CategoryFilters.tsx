'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useProductFilters } from '../../../../components/filters/use-product-filters';
import { FilterPanel } from '../../../../components/filters/FilterPanel';

interface CategoryFiltersProps {
  availableSizes: string[];
  availableColours: string[];
  initialSearch: string;
}

export function CategoryFilters({ availableSizes, availableColours, initialSearch }: CategoryFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = new URLSearchParams(initialSearch);
  const { filters, toggleSize, toggleColour, clearAll } = useProductFilters(params);

  const navigate = (next: URLSearchParams) => router.push(`${pathname}?${next.toString()}`);

  return (
    <FilterPanel
      availableSizes={availableSizes}
      availableColours={availableColours}
      selectedSizes={filters.sizes ?? []}
      selectedColours={filters.colours ?? []}
      onToggleSize={(size) => navigate(toggleSize(size))}
      onToggleColour={(colour) => navigate(toggleColour(colour))}
      onClearAll={() => navigate(clearAll())}
    />
  );
}
