import type { Metadata } from 'next';
import Link from 'next/link';
import { PageIntro } from '../../../components/content/PageIntro';
import { getPageBySlug } from '../../../lib/firestore-content';
import { contentPageMetadata } from '../../../lib/content-page-metadata';

const FALLBACK_METADATA: Metadata = {
  title: 'Shipping policy — BroPics',
  description: 'Dispatch times, delivery estimates, charges and what happens if a parcel goes missing.',
};

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPageBySlug('shipping-policy').catch(() => null);
  return contentPageMetadata(page, FALLBACK_METADATA);
}

export default async function ShippingPolicyPage() {
  const page = await getPageBySlug('shipping-policy').catch(() => null);
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
        title="Shipping policy"
        standfirst="Where we deliver, how long it takes, and what happens when it does not."
      />

      <h2>Dispatch</h2>
      <p>
        Every frame is made to order, so dispatch takes time that an off-the-shelf product does
        not. The dispatch window is shown on each product page and counts working days from the
        moment the order is confirmed, not from delivery.
      </p>
      <p>
        Orders placed on Sundays and public holidays start counting from the next working day.
      </p>

      <h2>Delivery</h2>
      <p>
        We deliver across India through courier partners. Once dispatched, metro addresses
        typically receive in 2–4 working days and other pincodes in 4–7. Remote pincodes can take
        longer, and we will tell you if yours is one of them.
      </p>
      <p>
        Tracking is added to <Link href="/orders">your orders page</Link> when the parcel
        leaves us.
      </p>

      <h2>Charges</h2>
      <p>
        Shipping is calculated at checkout, before payment. Promotional free shipping, where it
        applies, is shown as a line on the order summary.
      </p>

      <h2>Addresses</h2>
      <p>
        We can only ship to the address confirmed at checkout. If you need to change it, message us
        before the order is dispatched — after that the courier controls the parcel, and a
        redirection is not guaranteed.
      </p>
      <p>
        Parcels returned to us because the address was wrong or nobody was available can be
        re-shipped, with the second shipping charge payable by you.
      </p>

      <h2>Delays and lost parcels</h2>
      <p>
        If tracking has not moved for five working days, or the courier marks a parcel delivered
        that you have not received, <Link href="/contact">contact us</Link>. We will raise it with
        the courier and, if the parcel cannot be traced, remake and re-ship your order at no cost.
      </p>

      <h2>International orders</h2>
      <p>
        We do not currently ship outside India. If you need a frame delivered abroad,{' '}
        <Link href="/contact">ask us</Link> — we handle those case by case.
      </p>
    </>
  );
}
