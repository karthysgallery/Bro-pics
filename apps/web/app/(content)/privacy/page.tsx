import type { Metadata } from 'next';
import Link from 'next/link';
import { PageIntro } from '../../../components/content/PageIntro';
import { SUPPORT_EMAIL } from '../../../lib/support-contact';
import { getPageBySlug } from '../../../lib/firestore-content';
import { contentPageMetadata } from '../../../lib/content-page-metadata';

const FALLBACK_METADATA: Metadata = {
  title: 'Privacy policy — BroPics',
  description: 'What BroPics collects, why, how long it is kept, and how to have it deleted.',
};

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPageBySlug('privacy').catch(() => null);
  return contentPageMetadata(page, FALLBACK_METADATA);
}

export default async function PrivacyPage() {
  const page = await getPageBySlug('privacy').catch(() => null);
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
        title="Privacy policy"
        standfirst="What we hold, why we hold it, and how to get it deleted."
      />

      <h2>What we collect</h2>
      <ul>
        <li><strong>Your phone number</strong>, because it is how you sign in.</li>
        <li><strong>Delivery addresses</strong> you save, so you do not retype them.</li>
        <li><strong>Photos and text</strong> you upload, to produce your order.</li>
        <li><strong>Order history</strong>, so you and we can both see what was made and sent.</li>
        <li><strong>Basic usage data</strong> — pages viewed and products recently looked at — to keep the site working and useful.</li>
      </ul>
      <p>
        We do not collect your card details. Payments are handled by our payment provider, and card
        data never reaches our systems.
      </p>

      <h2>Why we hold it</h2>
      <p>
        To take and fulfil your order, to let you sign in and track it, to answer your messages, and
        to meet tax and accounting obligations. We do not sell your data, and we do not use your
        photos for marketing or examples without asking you first.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Uploaded photos are kept while your order is in production and for a short period
        afterwards, so we can remake a faulty print without asking you to upload again. Order
        records are kept as long as tax law requires. Everything else is kept until you ask us to
        delete it.
      </p>

      <h2>Who else sees it</h2>
      <p>
        Only the services needed to run the shop: our hosting and database provider, our payment
        provider, and the courier delivering your parcel — who receives your name, address and
        phone number, and nothing else.
      </p>

      <h2>Your choices</h2>
      <p>
        You can ask us for a copy of what we hold about you, ask us to correct it, or ask us to
        delete your account and its data. Write to{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and we will action it within 30
        days. Deleting your account does not remove order records we are legally required to keep.
      </p>

      <h2>Cookies and local storage</h2>
      <p>
        We store a small amount of data in your browser to keep your cart, wishlist and recently
        viewed products working between visits. Clearing your browser data clears them.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy go to{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>, or via the{' '}
        <Link href="/contact">contact page</Link>.
      </p>
    </>
  );
}
