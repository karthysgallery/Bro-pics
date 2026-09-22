import type { Metadata } from 'next';
import Link from 'next/link';
import { PageIntro } from '../../../components/content/PageIntro';

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

export default function FaqPage() {
  return (
    <>
      <PageIntro
        title="Frequently asked questions"
        standfirst="If your question is not here, message us — we answer on WhatsApp."
      />

      {FAQS.map((group) => (
        <section key={group.section}>
          <h2>{group.section}</h2>
          {group.items.map((item) => (
            <div key={item.q} className="mb-5">
              <h3>{item.q}</h3>
              <p>{item.a}</p>
            </div>
          ))}
        </section>
      ))}

      <h2>Still stuck?</h2>
      <p>
        <Link href="/contact">Contact us</Link> with your order number and we will pick it up from
        there.
      </p>
    </>
  );
}
