import type { Metadata } from 'next';
import { getPageBySlug } from '../../lib/firestore-content';
import { getBusinessDetails } from '../../lib/firestore-settings';
import { contentPageMetadata } from '../../lib/content-page-metadata';
import { whatsappDigits } from '@bro-pics/shared';
import { PageIntro } from './PageIntro';

/**
 * A legal or policy page. It shows the text an administrator APPROVED (with the shop's real details filled in);
 * until that exists it shows a short, honest holding notice with the contact details the owner has saved. It never
 * falls back to built-in wording, so no unverified claim, deadline or promise can appear by default.
 */
export async function legalPageMetadata(slug: string, fallback: Metadata): Promise<Metadata> {
  const page = await getPageBySlug(slug).catch(() => null);
  if (!page) return { ...fallback, robots: { index: false, follow: true } };
  return contentPageMetadata(page, fallback, `/${slug}`);
}

/** Same reading column as the other content pages (FAQ, How it works). */
const SHELL = 'mx-auto w-full max-w-3xl px-4 md:px-6 py-6 md:py-10';

export async function LegalPageView({ slug, title }: { slug: string; title: string }) {
  const page = await getPageBySlug(slug).catch(() => null);
  if (page) {
    return (
      <div className={SHELL}>
        <PageIntro title={page.title} />
        <div dangerouslySetInnerHTML={{ __html: page.bodyHtml }} />
      </div>
    );
  }
  const details = await getBusinessDetails().catch(() => null);
  const wa = whatsappDigits(details?.supportWhatsapp);
  return (
    <div className={SHELL}>
      <PageIntro title={title} />
      <p data-testid="policy-pending">This page is being finalised and will be published here soon.</p>
      {(wa || details?.supportEmail) && (
        <>
          <p>In the meantime, you can reach us:</p>
          <ul>
            {wa && (
              <li>
                WhatsApp: <a href={`https://wa.me/${wa}`}>{details?.supportWhatsapp}</a>
              </li>
            )}
            {details?.supportEmail && (
              <li>
                Email: <a href={`mailto:${details.supportEmail}`}>{details.supportEmail}</a>
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
