'use client';

import { useState } from 'react';
import type { Product, Variant } from '@bro-pics/shared';
import { PictureQualityGuide } from './PictureQualityGuide';
import { SizeChart } from './SizeChart';
import { ShippingReturnsAccordion } from './ShippingReturnsAccordion';

const TAB_LABELS = [
  'Description',
  'Highlights',
  'Size Chart',
  'How It Works',
  'Picture Quality Guide',
  'Care',
  'FAQ',
  'Shipping & Returns',
] as const;
type Tab = (typeof TAB_LABELS)[number];

export function ProductTabs({ product, variants = [] }: { product: Product; variants?: Variant[] }) {
  const [activeTab, setActiveTab] = useState<Tab>('Description');

  return (
    <div className="mt-12">
      <div className="rail flex overflow-x-auto gap-2 border-b border-line mb-4 pb-1 sm:flex-wrap">
        {TAB_LABELS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 text-sm whitespace-nowrap shrink-0 ${
              activeTab === tab ? 'border-b-2 border-accent text-ink font-medium' : 'text-ink/60'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Description' && (
        <div dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} />
      )}

      {activeTab === 'Highlights' && (
        <ul className="list-disc list-inside text-sm space-y-1">
          {product.highlights.map((h) => <li key={h}>{h}</li>)}
        </ul>
      )}

      {activeTab === 'How It Works' && (
        <ol className="list-decimal list-inside text-sm space-y-1">
          {product.howItWorks.map((step) => <li key={step}>{step}</li>)}
        </ol>
      )}

      {activeTab === 'Size Chart' && <SizeChart variants={variants} />}

      {activeTab === 'Picture Quality Guide' && <PictureQualityGuide />}

      {activeTab === 'Care' && <p className="text-sm">{product.careText}</p>}

      {activeTab === 'FAQ' && (
        <div className="space-y-4">
          {product.faq.map((entry) => (
            <div key={entry.question}>
              <p className="font-medium text-sm">{entry.question}</p>
              <p className="text-sm text-ink/70">{entry.answer}</p>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'Shipping & Returns' && (
        <ShippingReturnsAccordion dispatchDaysMin={product.dispatchDaysMin} dispatchDaysMax={product.dispatchDaysMax} />
      )}
    </div>
  );
}
