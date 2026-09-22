import type { Metadata } from 'next';
import Link from 'next/link';
import { PageIntro } from '../../../components/content/PageIntro';

export const metadata: Metadata = {
  title: 'Contact — BroPics',
  description: 'Reach BroPics about an order, a photo, or a question before you buy.',
};

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '910000000000';

export default function ContactPage() {
  return (
    <>
      <PageIntro
        title="Contact us"
        standfirst="Fastest on WhatsApp. Have your order number ready if you have one."
      />

      <h2>WhatsApp</h2>
      <p>
        <a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener noreferrer">
          Message us on WhatsApp
        </a>{' '}
        — best for order updates, photo checks, and anything easier to show than to describe.
        Replies during working hours, usually within a few hours.
      </p>

      <h2>Email</h2>
      <p>
        <a href="mailto:support@bropics.in">support@bropics.in</a> — best for anything that needs
        a paper trail: refunds, invoices, bulk and corporate orders.
      </p>

      <h2>Before you write in</h2>
      <p>Two things answer most messages faster than we can:</p>
      <ul>
        <li>
          Order status and tracking are on <Link href="/orders">your orders page</Link>.
        </li>
        <li>
          Sizing, delivery times and refunds are covered in the{' '}
          <Link href="/faq">FAQ</Link>.
        </li>
      </ul>

      <h2>Working hours</h2>
      <p>Monday to Saturday, 10am to 7pm IST. Messages sent outside those hours are answered the next working day.</p>
    </>
  );
}
