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
  subtitle = 'Considered shapes, timeless finishes. Just add your favourite photo.',
  products,
  viewAllHref = '/category',
}: ProductGridProps) {
  const [activeTab, setActiveTab] = useState('best-sellers');

  if (products.length === 0) return null;

  return (
    <Section>
      <div className="flex flex-col gap-6 sm:gap-8">
        {/* Header row with eyebrow, title, and "Shop all frames" button */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#718096]">
              A FRAME FOR EVERY FEELING
            </p>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-[#0F172A]">
              {title}
            </h2>
            {subtitle && <p className="mt-1.5 text-sm text-[#4A5568]">{subtitle}</p>}
          </div>

          <Link
            href={viewAllHref}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#0F172A] hover:text-gold border border-black/15 rounded-full px-5 py-2 hover:border-black transition-all"
          >
            <span>Shop all frames</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>

        {/* Filter pill chips matching Image 2 */}
        <div className="flex items-center gap-3 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
          {CATEGORY_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap text-xs sm:text-sm font-medium px-5 py-2 rounded-full transition-all duration-200 ${
                  isActive
                    ? 'bg-[#0B1428] text-white shadow-xs'
                    : 'bg-[#E8EDF2] text-[#4A5568] hover:text-[#0B1428] hover:bg-[#DEE5EC]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* 4-Column Grid matching Image 2 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-7">
          {products.slice(0, 8).map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </Section>
  );
}

export default ProductGrid;
