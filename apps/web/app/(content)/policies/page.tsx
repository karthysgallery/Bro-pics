'use client';

import { useState } from 'react';
import Link from 'next/link';

type TabKey = 'shipping' | 'privacy' | 'terms' | 'personalisation';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'shipping', label: 'Shipping & returns' },
  { key: 'privacy', label: 'Privacy' },
  { key: 'terms', label: 'Terms' },
  { key: 'personalisation', label: 'Personalisation' },
];

export default function PoliciesPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('shipping');

  return (
    <main className="mx-auto w-full max-w-shell px-4 md:px-6 py-6 md:py-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-xs text-ink/50 mb-4">
        <Link href="/" className="hover:text-ink">Home</Link>
        {' / '}
        <span className="text-ink font-medium">Policies</span>
      </nav>

      <div className="mb-6">
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-ink mb-2">
          Clear policies. Considered care.
        </h1>
        <p className="text-xs text-ink/70">
          Shipping, returns, privacy and terms · Updated 01 October 2026
        </p>
      </div>

      {/* Tabs */}
      <div className="rail flex overflow-x-auto items-center gap-2 mb-8 pb-1 sm:flex-wrap" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors ${
              activeTab === tab.key
                ? 'bg-ink text-surface'
                : 'border border-line bg-surface text-ink hover:bg-tint/40'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 2-Column Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        {/* Left Column: Tab Sections */}
        <div className="lg:col-span-8 space-y-8 text-ink">
          {activeTab === 'shipping' && (
            <div className="space-y-8">
              <section>
                <h2 className="font-display text-lg font-bold text-ink mb-2">Shipping in India</h2>
                <p className="text-xs sm:text-sm text-ink/80 leading-relaxed">
                  We deliver across serviceable Indian PIN codes. Standard shipping is free on orders above ₹1,999; otherwise ₹99. Personalised frames usually dispatch 3–5 working days after photo approval. Your delivery estimate appears at checkout.
                </p>
              </section>

              <section>
                <h2 className="font-display text-lg font-bold text-ink mb-2">Damage & manufacturing defects</h2>
                <p className="text-xs sm:text-sm text-ink/80 leading-relaxed">
                  Report damage or a manufacturing defect within 7 days of delivery. Include your order number, clear photos of the frame and its original packaging. Once reviewed, we arrange a replacement or refund as appropriate.
                </p>
              </section>

              <section>
                <h2 className="font-display text-lg font-bold text-ink mb-2">Personalised orders</h2>
                <p className="text-xs sm:text-sm text-ink/80 leading-relaxed">
                  Every personalised frame is made with your photo and crop. Change-of-mind returns are not available. Contact us promptly to request a photo or address correction before production starts.
                </p>
              </section>

              <section>
                <h2 className="font-display text-lg font-bold text-ink mb-2">Refunds</h2>
                <p className="text-xs sm:text-sm text-ink/80 leading-relaxed">
                  Approved refunds return to the original payment method within 5–7 working days after processing. We&rsquo;ll email confirmation and the refund reference. Your bank may take additional time to reflect the credit.
                </p>
              </section>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="space-y-8">
              <section>
                <h2 className="font-display text-lg font-bold text-ink mb-2">Your data and privacy</h2>
                <p className="text-xs sm:text-sm text-ink/80 leading-relaxed">
                  We collect your name, shipping address, email and contact details strictly to process orders and provide delivery updates. We do not sell or rent your personal information to third parties.
                </p>
              </section>
              <section>
                <h2 className="font-display text-lg font-bold text-ink mb-2">Photo security</h2>
                <p className="text-xs sm:text-sm text-ink/80 leading-relaxed">
                  Your uploaded photographs are securely stored on encrypted servers with access restricted only to automated print rendering pipelines. Files are never shared or used for marketing without explicit written consent.
                </p>
              </section>
            </div>
          )}

          {activeTab === 'terms' && (
            <div className="space-y-8">
              <section>
                <h2 className="font-display text-lg font-bold text-ink mb-2">Terms of service</h2>
                <p className="text-xs sm:text-sm text-ink/80 leading-relaxed">
                  By accessing BroPics and placing an order, you agree to our terms of service. You certify that you own the rights or have appropriate permissions to print any images submitted for personalisation.
                </p>
              </section>
              <section>
                <h2 className="font-display text-lg font-bold text-ink mb-2">Pricing and taxes</h2>
                <p className="text-xs sm:text-sm text-ink/80 leading-relaxed">
                  All prices listed on our website are inclusive of 18% GST unless specified otherwise. We reserve the right to correct pricing errors before order confirmation.
                </p>
              </section>
            </div>
          )}

          {activeTab === 'personalisation' && (
            <div className="space-y-8">
              <section>
                <h2 className="font-display text-lg font-bold text-ink mb-2">Personalisation guidelines</h2>
                <p className="text-xs sm:text-sm text-ink/80 leading-relaxed">
                  We review uploaded photo resolution to ensure high-fidelity 300 DPI archival prints. Images below recommended thresholds will display a low-resolution alert in the personalization studio.
                </p>
              </section>
            </div>
          )}
        </div>

        {/* Right Column: Info Cards */}
        <div className="lg:col-span-4 space-y-6">
          <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
            <h3 className="font-display text-sm font-bold text-ink mb-2">Your photos stay yours</h3>
            <p className="text-xs text-ink/70 leading-relaxed">
              We process your photos only to preview, print and fulfil your order. We never use personal photos in marketing without consent.
            </p>
          </div>

          <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
            <h3 className="font-display text-sm font-bold text-ink mb-2">Questions?</h3>
            <p className="text-xs text-ink font-medium">
              <a href="mailto:hello@bropics.in" className="hover:underline">hello@bropics.in</a>
            </p>
            <p className="text-2xs text-ink/60 mt-2">
              BroPics India Private Limited · Bengaluru, Karnataka
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
