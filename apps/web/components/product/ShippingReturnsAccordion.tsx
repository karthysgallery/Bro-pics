'use client';

import { useState } from 'react';
import Link from 'next/link';

interface ShippingReturnsAccordionProps {
  dispatchDaysMin: number;
  dispatchDaysMax: number;
}

interface AccordionSection {
  title: string;
  summary: React.ReactNode;
  href: string;
  linkLabel: string;
}

/**
 * [FE-32] A summary + deep link to the full policy, rather than inlining
 * the entire shipping/return-refund policy body on every product page —
 * the actual authoritative content stays the ONE `(content)/shipping-
 * policy` and `(content)/return-refund-policy` page each already reads
 * from the content CMS (FE-28); `Page` has no separate "excerpt" field to
 * source a short blurb from, and inventing one without a concrete admin
 * UI to fill it in would be guessing at a shape nothing has evidenced.
 * The dispatch estimate below IS real per-product data (`dispatchDaysMin/
 * Max`), not a hardcoded stand-in.
 */
export function ShippingReturnsAccordion({ dispatchDaysMin, dispatchDaysMax }: ShippingReturnsAccordionProps) {
  const sections: AccordionSection[] = [
    {
      title: 'Shipping',
      summary: (
        <>
          Made to order — this dispatches in {dispatchDaysMin}-{dispatchDaysMax} days, then a few
          more days in transit depending on your pincode.
        </>
      ),
      href: '/shipping-policy',
      linkLabel: 'Read the full shipping policy',
    },
    {
      title: 'Returns',
      summary: 'Personalized items aren’t returnable on change of mind. A damaged, misprinted or wrong item is always replaced or refunded.',
      href: '/return-refund-policy',
      linkLabel: 'Read the full return & refund policy',
    },
  ];
  const [openTitle, setOpenTitle] = useState<string | null>(sections[0].title);

  return (
    <div className="divide-y divide-line">
      {sections.map((section) => {
        const isOpen = openTitle === section.title;
        return (
          <div key={section.title}>
            <button
              type="button"
              onClick={() => setOpenTitle(isOpen ? null : section.title)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between py-3 text-left text-sm font-medium text-ink"
            >
              {section.title}
              <span aria-hidden="true">{isOpen ? '−' : '+'}</span>
            </button>
            {isOpen && (
              <div className="pb-3 text-sm text-ink/70">
                <p>{section.summary}</p>
                <Link href={section.href} className="mt-1 inline-block text-accent hover:text-accent-dark">
                  {section.linkLabel} <span aria-hidden="true">&rsaquo;</span>
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
