import type { Metadata } from 'next';
import Link from 'next/link';
import { PageIntro } from '../../../components/content/PageIntro';
import { getPageBySlug } from '../../../lib/firestore-content';
import { contentPageMetadata } from '../../../lib/content-page-metadata';

const FALLBACK_METADATA: Metadata = {
  title: 'How it works — BroPics',
  description: 'From picking a frame to the parcel arriving: every step of a BroPics order.',
};

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPageBySlug('how-it-works').catch(() => null);
  return contentPageMetadata(page, FALLBACK_METADATA);
}

export default async function HowItWorksPage() {
  const page = await getPageBySlug('how-it-works').catch(() => null);
  if (page) {
    return (
      <div className="mx-auto w-full max-w-shell px-4 md:px-6 py-6 md:py-8">
        <PageIntro title={page.title} />
        <div dangerouslySetInnerHTML={{ __html: page.bodyHtml }} />
      </div>
    );
  }

  const steps = [
    {
      number: 'STEP 01',
      title: 'Pick a frame',
      desc: 'Choose a size, finish and layout. Single photo, collage or gallery — there’s a place for every story.',
      imageUrl: 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=800&auto=format&fit=crop&q=80',
    },
    {
      number: 'STEP 02',
      title: 'Make it yours',
      desc: 'Upload your photo, adjust the crop and add a caption if you like. Our Studio shows exactly how it will look.',
      imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80',
    },
    {
      number: 'STEP 03',
      title: 'We do the craft',
      desc: 'We check the print quality, make your frame and deliver it safely. Just choose a spot on your wall.',
      imageUrl: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=800&auto=format&fit=crop&q=80',
    },
  ];

  const faqs = [
    {
      q: 'Can I use a photo from my phone?',
      a: 'Yes. Upload the original file, rather than a screenshot or compressed WhatsApp image. Our DPI check helps you choose the right size.',
    },
    {
      q: 'Will you check my photo before printing?',
      a: 'Yes. Every photo is reviewed for sharpness and color fidelity before it enters our print and mount workshop.',
    },
    {
      q: 'Can I send a frame as a gift?',
      a: 'Absolutely. We do not include invoices inside the box with prices, and every package arrives securely packed and gift-ready.',
    },
  ];

  return (
    <div className="mx-auto w-full max-w-shell px-4 md:px-6 py-6 md:py-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-xs text-ink/50 mb-4">
        <Link href="/" className="hover:text-ink">Home</Link>
        {' / '}
        <span className="text-ink font-medium">How it works</span>
      </nav>

      <div className="mb-10">
        <h1 className="font-display text-3xl md:text-5xl font-bold text-ink mb-3 leading-tight">
          From your phone to your wall.
        </h1>
        <p className="text-sm md:text-base text-ink/70">
          Three simple steps. One very personal frame.
        </p>
      </div>

      {/* 3 Step Cards */}
      <div className="grid md:grid-cols-3 gap-6 md:gap-8 my-12">
        {steps.map((step) => (
          <div key={step.number} className="flex flex-col">
            <div className="relative aspect-[4/3] rounded-3xl overflow-hidden bg-tint mb-5 shadow-sm border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={step.imageUrl} alt={step.title} className="w-full h-full object-cover" />
            </div>
            <span className="text-2xs font-bold tracking-wider text-ink/50 uppercase mb-1">{step.number}</span>
            <h2 className="font-display text-xl font-bold text-ink mb-2">{step.title}</h2>
            <p className="text-xs text-ink/70 leading-relaxed">{step.desc}</p>
          </div>
        ))}
      </div>

      {/* Split Callout & FAQ */}
      <div className="grid md:grid-cols-[1fr_1.2fr] gap-8 md:gap-12 items-start my-16 pt-8 border-t border-line">
        <div>
          <h2 className="font-display text-2xl md:text-3xl font-bold text-ink mb-3">
            Your favourite moment, made real.
          </h2>
          <p className="text-xs text-ink/70 leading-relaxed mb-6">
            Frames start at ₹999, including photo printing. Most orders dispatch in 3-5 working days.
          </p>
          <Link
            href="/category"
            className="inline-flex items-center justify-center px-8 py-3.5 rounded-full bg-gold hover:bg-gold-deep text-ink text-sm font-semibold transition-colors shadow-sm"
          >
            Start with a frame
          </Link>
        </div>

        {/* FAQs */}
        <div className="divide-y divide-line text-sm">
          {faqs.map((faq, idx) => (
            <details key={faq.q} className="group py-4 cursor-pointer" open={idx === 0}>
              <summary className="flex items-center justify-between font-semibold text-ink list-none">
                <span>{faq.q}</span>
                <span className="transition group-open:rotate-45 text-lg font-light text-ink/70">+</span>
              </summary>
              <div className="pt-3 text-xs text-ink/70 leading-relaxed">
                {faq.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
