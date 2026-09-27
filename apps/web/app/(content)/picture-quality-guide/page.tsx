import type { Metadata } from 'next';
import Link from 'next/link';
import { PageIntro } from '../../../components/content/PageIntro';
import { PictureQualityGuide } from '../../../components/product/PictureQualityGuide';
import { getPageBySlug } from '../../../lib/firestore-content';
import { contentPageMetadata } from '../../../lib/content-page-metadata';

const FALLBACK_METADATA: Metadata = {
  title: 'Picture quality guide — BroPics',
  description: 'What makes a photo print sharply, what the quality reading in the editor means, and how to fix a low reading.',
};

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPageBySlug('picture-quality-guide').catch(() => null);
  return contentPageMetadata(page, FALLBACK_METADATA);
}

export default async function PictureQualityGuidePage() {
  // [FE-28] Unlike the other 6 fully-CMS-able pages, `<PictureQualityGuide
  // />` always renders regardless of CMS content — it's a shared React
  // component (also used on the product page's own tab, deliberately
  // "stated once" so the two can never drift), not markup a CMS bodyHtml
  // field could ever represent. A CMS `picture-quality-guide` doc
  // replaces the surrounding prose only.
  const page = await getPageBySlug('picture-quality-guide').catch(() => null);
  if (page) {
    return (
      <>
        <PageIntro title={page.title} />
        <PictureQualityGuide />
        <div dangerouslySetInnerHTML={{ __html: page.bodyHtml }} />
      </>
    );
  }

  return (
    <>
      <PageIntro
        title="Picture quality guide"
        standfirst="Why the same photo can look perfect at 8×12 and soft at 16×24."
      />

      {/* The same copy the product page shows in its own tab — stated once,
          in one component, so the two can never drift apart. */}
      <PictureQualityGuide />

      <h2>What the reading in the editor means</h2>
      <p>
        When you upload, we work out the effective DPI: how many of your photo&rsquo;s pixels land
        in each printed inch at the size you picked. Zooming in uses fewer pixels over the same
        area, so the reading changes as you position the photo.
      </p>
      <ul>
        <li><strong>Good quality print</strong> — 300&nbsp;DPI or better. Print it.</li>
        <li><strong>Lower quality print</strong> — usable, but softer up close. Fine for larger frames seen from across a room.</li>
        <li><strong>Too low resolution</strong> — visibly blurry or blocky. We ask you to confirm before letting this through.</li>
      </ul>

      <h2>How to improve a low reading</h2>
      <ul>
        <li>Send the original file, not a copy from WhatsApp or Instagram — both re-compress heavily.</li>
        <li>Zoom out, or pick a smaller print size. Both put more pixels in each printed inch.</li>
        <li>Use the original photo rather than a screenshot of it.</li>
        <li>Avoid photos already enlarged or upscaled by another app; the extra pixels carry no extra detail.</li>
      </ul>

      <h2>Things resolution cannot fix</h2>
      <p>
        Motion blur, camera shake and heavy noise from a dark room stay exactly as visible in print
        as they are on screen — often more so, because a print does not glow. If a photo looks soft
        at full size on your phone, it will look soft on your wall.
      </p>

      <p>
        Not sure about a particular photo? <Link href="/contact">Send it to us</Link> before you
        order and we will tell you honestly how large it will hold up.
      </p>
    </>
  );
}
