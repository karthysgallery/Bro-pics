import type { Metadata } from 'next';
import Link from 'next/link';
import { PageIntro } from '../../../components/content/PageIntro';

export const metadata: Metadata = {
  title: 'How it works — BroPics',
  description: 'From picking a frame to the parcel arriving: every step of a BroPics order.',
};

export default function HowItWorksPage() {
  return (
    <>
      <PageIntro
        title="How it works"
        standfirst="Four steps, and you see the result before you pay for it."
      />

      <h2>1. Pick a frame and a size</h2>
      <p>
        Choose the frame design first, then the size and orientation. Prices change with size, and
        the size you pick decides how sharp your photo needs to be — the{' '}
        <Link href="/picture-quality-guide">picture quality guide</Link> explains that in detail.
      </p>

      <h2>2. Upload your photo</h2>
      <p>
        Upload straight from your phone or computer, up to 25&nbsp;MB. As soon as the photo lands,
        we check its resolution against the print size and show you a quality reading. Green means
        it will print sharp; amber means it will print, but softer than it could; red means we do
        not recommend it at that size.
      </p>

      <h2>3. Position it, and add text if you want</h2>
      <p>
        Drag to move, pinch or use the slider to zoom, and rotate in quarter turns. Frames with
        more than one opening let you fill each slot separately. Where a frame supports it, you can
        add a name or a date, pick a typeface and a colour, and add a small piece of clipart.
      </p>
      <p>
        Whatever is on screen is the file we print. Nothing is re-cropped afterwards.
      </p>

      <h2>4. Order, and we make it</h2>
      <p>
        We print, mount and assemble by hand, then check the result against your preview before it
        is packed. Dispatch times are shown on each product page, and tracking appears on{' '}
        <Link href="/account/orders">your orders page</Link> once the parcel leaves us.
      </p>

      <h2>If something is not right</h2>
      <p>
        Personalized prints cannot be resold, so they are not returnable on change of mind — but a
        damaged, misprinted or wrong item is replaced or refunded. The{' '}
        <Link href="/return-refund-policy">return &amp; refund policy</Link> has the full terms.
      </p>
    </>
  );
}
