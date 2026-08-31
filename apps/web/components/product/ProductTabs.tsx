'use client';

import { useState } from 'react';
import type { Product } from '@bro-pics/shared';
import { PictureQualityGuide } from './PictureQualityGuide';

const TAB_LABELS = ['Description', 'Highlights', 'How It Works', 'Picture Quality Guide', 'Care', 'FAQ'] as const;
type Tab = (typeof TAB_LABELS)[number];

export function ProductTabs({ product }: { product: Product }) {
  const [activeTab, setActiveTab] = useState<Tab>('Description');

  return (
    <div className="mt-12">
      <div className="flex flex-wrap gap-2 border-b border-charcoal/10 mb-4">
        {TAB_LABELS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 text-sm ${
              activeTab === tab ? 'border-b-2 border-terracotta text-charcoal font-medium' : 'text-charcoal/60'
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

      {activeTab === 'Picture Quality Guide' && <PictureQualityGuide />}

      {activeTab === 'Care' && <p className="text-sm">{product.careText}</p>}

      {activeTab === 'FAQ' && (
        <div className="space-y-4">
          {product.faq.map((entry) => (
            <div key={entry.question}>
              <p className="font-medium text-sm">{entry.question}</p>
              <p className="text-sm text-charcoal/70">{entry.answer}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
