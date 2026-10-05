'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Product } from '@bro-pics/shared';
import { ProductCard } from '../product/ProductCard';
import { Section } from '../ui/Section';

interface ProductGridProps {
  title?: string;
  subtitle?: string;
  products: Product[];
  viewAllHref?: string;
}

const CATEGORY_TABS = [
  { id: 'best-sellers', label: 'Bestsellers' },
  { id: 'single-frames', label: 'Single frames' },
  { id: 'collages', label: 'Collages' },
  { id: 'gallery-sets', label: 'Gallery sets' },
];

export function ProductGrid({
  title = "Meet your wall's next favourite.",
  subtitle,
  products,
  viewAllHref = '/category',
}: ProductGridProps) {
  const [activeTab, setActiveTab] = useState('best-sellers');

  if (products.length === 0) return null;

  return (
    <Section>
      <div className="flex flex-col gap-7 sm:gap-8">

        {/* Header row */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-eyebrow text-ink/40 mb-2">
              A frame for every feeling
            </p>
            <h2 className="font-display text-2xl sm:text-3xl lg:text-[2.25rem] font-bold text-ink tracking-tight leading-tight">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1.5 text-[14px] text-ink/55">{subtitle}</p>
            )}
          </div>

          <Link
            href={viewAllHref}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 text-[13px] font-medium text-ink/60 hover:text-ink border border-line rounded-btn px-4 py-2.5 hover:border-ink/30 transition-all duration-140"
          >
            Shop all frames
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>

        {/* Filter tab pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 -mx-4 px-4 sm:mx-0 sm:px-0 rail" role="tablist" aria-label="Product categories">
          {CATEGORY_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap text-[13px] font-medium px-4 py-2 rounded-btn transition-all duration-140 shrink-0 ${
                  isActive
                    ? 'bg-ink text-paper'
                    : 'bg-tint text-ink/55 hover:text-ink hover:bg-line'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Product grid — 2 cols mobile, 4 cols desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
          {products.slice(0, 8).map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </Section>
  );
}

export default ProductGrid;
