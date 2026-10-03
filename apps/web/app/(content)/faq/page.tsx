import type { Metadata } from 'next';
import Link from 'next/link';
import { PageIntro } from '../../../components/content/PageIntro';
import { getActiveFaqs } from '../../../lib/firestore-content';

export const metadata: Metadata = {
  title: 'FAQ — BroPics',
  description: 'Answers about photos, sizing, delivery, personalization and refunds.',
};

const FAQS: { section: string; items: { q: string; a: React.ReactNode }[] }[] = [
  {
    section: 'Photos',
    items: [
      {
        q: 'What kind of photo should I upload?',
        a: (
          <>
            The original file, as large as you have it, up to 25&nbsp;MB. We check it against your
            print size on upload. The{' '}
            <Link href="/picture-quality-guide">picture quality guide</Link> covers what to do if
            the reading comes back low.
          </>
        ),
      },
      {
        q: 'Can I send the photo by WhatsApp instead?',
        a: (
          <>
            You can, but WhatsApp compresses images heavily. Upload the original in the editor
            where you can, and use <Link href="/contact">WhatsApp</Link> only if the upload fails.
          </>
        ),
      },
      {
        q: 'What happens to my photo after the order?',
        a: (
          <>
            It is used to produce your order and nothing else. See the{' '}
            <Link href="/privacy">privacy policy</Link> for how long files are kept.
          </>
        ),
      },
    ],
  },
  {
    section: 'Ordering and sizing',
    items: [
      {
        q: 'Which size should I pick?',
        a: 'Measure the wall space first, then match the orientation to your photo — a portrait photo in a landscape frame has to lose most of its edges. Each product page lists exact outer dimensions.',
      },
      {
        q: 'Can I put text on any frame?',
        a: 'Only on frames designed for it. If a frame supports names, dates or clipart, those controls appear in the editor when you open it.',
      },
      {
        q: 'Can I order the same frame with different photos?',
        a: 'Yes. Personalize and add one to the cart, then start again from the product page for the next photo. Each ends up as its own line in the cart.',
      },
    ],
  },
  {
    section: 'Delivery',
    items: [
      {
        q: 'How long will it take?',
        a: (
          <>
            Dispatch time is on the product page, and delivery adds a few days on top depending on
            your pincode. The <Link href="/shipping-policy">shipping policy</Link> has the details.
          </>
        ),
      },
      {
        q: 'Where is my order?',
        a: (
          <>
            Tracking appears on <Link href="/orders">your orders page</Link> as soon as the
            parcel leaves us.
          </>
        ),
      },
    ],
  },
  {
    section: 'Returns',
    items: [
      {
        q: 'Can I return a personalized frame?',
        a: (
          <>
            Not on change of mind — it cannot be resold. Damaged, misprinted or wrong items are
            replaced or refunded; see the{' '}
            <Link href="/return-refund-policy">return &amp; refund policy</Link>.
          </>
        ),
      },
      {
        q: 'It arrived damaged. What now?',
        a: (
          <>
            Photograph the parcel and the frame and{' '}
            <Link href="/contact">message us</Link> within 48 hours of delivery. We arrange a
            replacement.
          </>
        ),
      },
    ],
  },
];

// [FE-28] Groups the flat, sortOrder-sorted list into sections in
// first-seen order — whichever section its lowest-sortOrder item belongs
// to comes first, same effect as the hardcoded FAQS array's own grouping.
function groupBySection(faqs: { section: string; question: string; answerHtml: string }[]) {
  const bySection = new Map<string, { section: string; question: string; answerHtml: string }[]>();
  for (const faq of faqs) {
    const group = bySection.get(faq.section);
    if (group) group.push(faq);
    else bySection.set(faq.section, [faq]);
  }
  return [...bySection.entries()].map(([section, items]) => ({ section, items }));
}

export default async function FaqPage() {
  const faqs = await getActiveFaqs().catch(() => []);
  const cmsGroups = groupBySection(faqs);

  return (
    <div className="mx-auto w-full max-w-shell px-4 md:px-6 py-6 md:py-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-xs text-ink/50 mb-4">
        <Link href="/" className="hover:text-ink">Home</Link>
        {' / '}
        <span className="text-ink font-medium">FAQ</span>
      </nav>

      <div className="mb-10">
        <h1 className="font-display text-3xl md:text-5xl font-bold text-ink mb-3 leading-tight">
          Frequently asked questions
        </h1>
        <p className="text-sm md:text-base text-ink/70">
          Everything you need to know about our frames, print quality, sizing, delivery and returns.
        </p>
      </div>

      <div className="max-w-3xl space-y-12 my-10">
        {cmsGroups.length > 0
          ? cmsGroups.map((group) => (
              <section key={group.section} className="rounded-3xl bg-paper border border-line p-6 md:p-8 shadow-sm">
                <h2 className="font-display text-xl font-bold text-ink mb-4 pb-3 border-b border-line">{group.section}</h2>
                <div className="divide-y divide-line text-sm">
                  {group.items.map((item) => (
                    <details key={item.question} className="group py-4 cursor-pointer">
                      <summary className="flex items-center justify-between font-semibold text-ink list-none">
                        <span>{item.question}</span>
                        <span className="transition group-open:rotate-45 text-lg font-light text-ink/70">+</span>
                      </summary>
                      <div className="pt-3 text-xs text-ink/70 leading-relaxed" dangerouslySetInnerHTML={{ __html: item.answerHtml }} />
                    </details>
                  ))}
                </div>
              </section>
            ))
          : FAQS.map((group) => (
              <section key={group.section} className="rounded-3xl bg-paper border border-line p-6 md:p-8 shadow-sm">
                <h2 className="font-display text-xl font-bold text-ink mb-4 pb-3 border-b border-line">{group.section}</h2>
                <div className="divide-y divide-line text-sm">
                  {group.items.map((item) => (
                    <details key={item.q} className="group py-4 cursor-pointer">
                      <summary className="flex items-center justify-between font-semibold text-ink list-none">
                        <span>{item.q}</span>
                        <span className="transition group-open:rotate-45 text-lg font-light text-ink/70">+</span>
                      </summary>
                      <div className="pt-3 text-xs text-ink/70 leading-relaxed">
                        {item.a}
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            ))}
      </div>

      {/* Support card */}
      <div className="max-w-3xl p-8 rounded-3xl bg-field border border-line my-12 text-center md:text-left flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <h2 className="font-display text-xl font-bold text-ink mb-1">Still have questions?</h2>
          <p className="text-xs text-ink/70">
            Message us on WhatsApp with your photo or order number and a real person will help.
          </p>
        </div>
        <Link
          href="/contact"
          className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-gold hover:bg-gold-deep text-ink text-xs font-semibold transition-colors shadow-sm whitespace-nowrap"
        >
          Contact support →
        </Link>
      </div>
    </div>
  );
}
