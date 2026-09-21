import type { Metadata } from 'next';
import Link from 'next/link';
import { PageIntro } from '../../../components/content/PageIntro';

export const metadata: Metadata = {
  title: 'Terms & conditions — BroPics',
  description: 'The terms you agree to when you order a personalized frame from BroPics.',
};

export default function TermsPage() {
  return (
    <>
      <PageIntro
        title="Terms & conditions"
        standfirst="The agreement between you and BroPics when you place an order."
      />

      <h2>1. Who we are</h2>
      <p>
        BroPics sells made-to-order personalized photo frames in India. Using this site or placing
        an order means you accept these terms.
      </p>

      <h2>2. Your account</h2>
      <p>
        Accounts are created and secured with your phone number and a one-time code. Keep access to
        that number secure — anyone who can receive your codes can see your orders and addresses.
      </p>

      <h2>3. Your photos and text</h2>
      <p>
        You keep ownership of everything you upload. By uploading, you grant us permission to
        store, process and print that content for the sole purpose of producing your order.
      </p>
      <p>
        You confirm that you have the right to print what you upload, and that it does not infringe
        anyone else&rsquo;s copyright or privacy. We may decline to print content that is unlawful,
        hateful, sexually explicit, or that appears to infringe someone else&rsquo;s rights, and
        will refund an order we decline in full.
      </p>

      <h2>4. Prices and payment</h2>
      <p>
        Prices are in Indian rupees and include applicable taxes unless stated otherwise. Payment
        is taken at checkout through our payment provider; we never see or store your card details.
        If a price is listed in error we will contact you before producing the order, and you may
        cancel for a full refund.
      </p>

      <h2>5. Production and delivery</h2>
      <p>
        Dispatch and delivery estimates are estimates, not guarantees. The{' '}
        <Link href="/shipping-policy">shipping policy</Link> sets out what happens when a parcel is
        delayed or lost.
      </p>

      <h2>6. Cancellations, returns and refunds</h2>
      <p>
        Because items are made to order, cancellation is only possible before production starts and
        change-of-mind returns are not accepted. Faults are always put right. The full terms are in
        the <Link href="/return-refund-policy">return &amp; refund policy</Link>.
      </p>

      <h2>7. Colour and finish</h2>
      <p>
        Screens differ. Printed colours can vary slightly from what you see on your display, and
        wood grain varies naturally between frames. Neither counts as a defect.
      </p>

      <h2>8. Our liability</h2>
      <p>
        Where an order is faulty, our liability is limited to remaking it or refunding what you
        paid. Nothing in these terms limits liability that cannot lawfully be limited.
      </p>

      <h2>9. Changes</h2>
      <p>
        We may update these terms. The version in force is the one published here when you place
        your order.
      </p>

      <h2>10. Governing law</h2>
      <p>These terms are governed by the laws of India.</p>

      <p>
        Questions about any of this? <Link href="/contact">Contact us</Link>.
      </p>
    </>
  );
}
