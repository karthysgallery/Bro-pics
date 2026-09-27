import type { Metadata } from 'next';
import Link from 'next/link';
import { PageIntro } from '../../../components/content/PageIntro';
import { getPageBySlug } from '../../../lib/firestore-content';
import { contentPageMetadata } from '../../../lib/content-page-metadata';

const FALLBACK_METADATA: Metadata = {
  title: 'Return & refund policy — BroPics',
  description: 'When a personalized frame can be returned, how replacements work, and how refunds are paid.',
};

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPageBySlug('return-refund-policy').catch(() => null);
  return contentPageMetadata(page, FALLBACK_METADATA);
}

export default async function ReturnRefundPolicyPage() {
  const page = await getPageBySlug('return-refund-policy').catch(() => null);
  if (page) {
    return (
      <>
        <PageIntro title={page.title} />
        <div dangerouslySetInnerHTML={{ __html: page.bodyHtml }} />
      </>
    );
  }

  return (
    <>
      <PageIntro
        title="Return & refund policy"
        standfirst="Made-to-order items are not returnable on change of mind. Our mistakes always are."
      />

      <h2>What cannot be returned</h2>
      <p>
        A personalized frame carries your photo and, often, your text. It cannot be resold to
        anyone else, so we cannot accept it back because you changed your mind about the design,
        the size or the photo. Please use the live preview before ordering — it exists for exactly
        this reason.
      </p>
      <p>
        A low picture-quality warning that you chose to proceed past is also not grounds for a
        refund. The <Link href="/picture-quality-guide">picture quality guide</Link> explains what
        those readings mean before you commit.
      </p>

      <h2>What we always put right</h2>
      <ul>
        <li>The frame arrived broken, cracked or scratched.</li>
        <li>The print does not match the preview you approved.</li>
        <li>The wrong size, frame or photo was sent.</li>
        <li>The print has a manufacturing defect — banding, streaks, a bad mount.</li>
      </ul>
      <p>
        In any of these cases we remake and re-ship the order at no cost, or refund it in full if
        you would rather not wait.
      </p>

      <h2>How to raise it</h2>
      <p>
        <Link href="/contact">Message us</Link> within 48 hours of delivery with your order number
        and photographs of the outer packaging and the frame. The packaging photo matters: it is
        what lets us claim against the courier for transit damage.
      </p>
      <p>
        We respond within two working days. You do not need to ship the item back unless we ask —
        in most cases the photographs are enough.
      </p>

      <h2>Refunds</h2>
      <p>
        Approved refunds go back to the original payment method within 5–7 working days of
        approval. Your bank may take a few days more to show it. Shipping charges are refunded when
        the fault was ours.
      </p>

      <h2>Cancellations</h2>
      <p>
        An order can be cancelled for a full refund until production starts — usually within a few
        hours of ordering. After printing begins the materials are already committed and the order
        can no longer be cancelled.
      </p>
    </>
  );
}
