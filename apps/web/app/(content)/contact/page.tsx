import type { Metadata } from 'next';
import Link from 'next/link';
import { PageIntro } from '../../../components/content/PageIntro';
import { SUPPORT_EMAIL } from '../../../lib/support-contact';
import { getPageBySlug } from '../../../lib/firestore-content';
import { contentPageMetadata } from '../../../lib/content-page-metadata';

const FALLBACK_METADATA: Metadata = {
  title: 'Contact — BroPics',
  description: 'Reach BroPics about an order, a photo, or a question before you buy.',
};

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '910000000000';

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPageBySlug('contact').catch(() => null);
  return contentPageMetadata(page, FALLBACK_METADATA);
}

export default async function ContactPage() {
  const page = await getPageBySlug('contact').catch(() => null);

  return (
    <div className="mx-auto w-full max-w-shell px-4 md:px-6 py-6 md:py-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-xs text-ink/50 mb-4">
        <Link href="/" className="hover:text-ink">Home</Link>
        {' / '}
        <span className="text-ink font-medium">Contact</span>
      </nav>

      <div className="mb-10">
        <h1 className="font-display text-3xl md:text-5xl font-bold text-ink mb-3 leading-tight">
          {page?.title ?? "We're here to help."}
        </h1>
        <p className="text-sm md:text-base text-ink/70">
          Fastest on WhatsApp. Have your order number ready if you have one.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 max-w-4xl my-10">
        {/* WhatsApp Card */}
        <div className="rounded-3xl bg-paper border border-line p-8 shadow-sm flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4 text-2xl font-bold">
              💬
            </div>
            <h2 className="font-display text-xl font-bold text-ink mb-2">WhatsApp</h2>
            <p className="text-xs text-ink/70 leading-relaxed mb-6">
              Best for order updates, photo checks, and anything easier to show than to describe. Replies usually within a few hours during working hours.
            </p>
          </div>
          <a
            href={`https://wa.me/${WHATSAPP_NUMBER}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-gold hover:bg-gold-deep text-ink text-xs font-semibold transition-colors shadow-sm w-fit"
          >
            Message on WhatsApp →
          </a>
        </div>

        {/* Email Card */}
        <div className="rounded-3xl bg-paper border border-line p-8 shadow-sm flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mb-4 text-2xl font-bold">
              ✉️
            </div>
            <h2 className="font-display text-xl font-bold text-ink mb-2">Email</h2>
            <p className="text-xs text-ink/70 leading-relaxed mb-6">
              Best for anything that needs a paper trail: refunds, invoices, bulk orders, and corporate gifting.
            </p>
          </div>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-flex items-center justify-center px-6 py-3 rounded-full border border-line bg-paper hover:bg-tint text-ink text-xs font-semibold transition-colors w-fit"
          >
            {SUPPORT_EMAIL}
          </a>
        </div>
      </div>

      {/* Info strip */}
      <div className="max-w-4xl p-6 rounded-3xl bg-field border border-line my-10 grid sm:grid-cols-2 gap-6 text-xs text-ink/80">
        <div>
          <h3 className="font-bold text-ink mb-1">Working hours</h3>
          <p className="text-ink/60">Monday to Saturday, 10am to 7pm IST. Messages sent outside those hours are answered the next working day.</p>
        </div>
        <div>
          <h3 className="font-bold text-ink mb-1">Quick self-service</h3>
          <p className="text-ink/60">
            Check your <Link href="/orders" className="text-accent underline">order status</Link> or visit our <Link href="/faq" className="text-accent underline">FAQ</Link> for instant answers on sizing and shipping.
          </p>
        </div>
      </div>
    </div>
  );
}
