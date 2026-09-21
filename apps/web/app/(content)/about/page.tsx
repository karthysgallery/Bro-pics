import type { Metadata } from 'next';
import Link from 'next/link';
import { PageIntro } from '../../../components/content/PageIntro';

export const metadata: Metadata = {
  title: 'About us — BroPics',
  description: 'Who we are, how BroPics frames are made, and what we promise about the print on your wall.',
};

export default function AboutPage() {
  return (
    <>
      <PageIntro
        title="About BroPics"
        standfirst="We print the photos people actually care about, and frame them properly."
      />

      <p>
        BroPics started with a simple frustration: the best photos on anyone&rsquo;s phone never
        make it off the phone. Printing one should not mean guessing at sizes, mailing files
        around, or hoping the crop lands somewhere sensible.
      </p>
      <p>
        So the whole shop is built around seeing the thing before you buy it. You upload a photo,
        position it inside the actual frame on screen, add a name or a date if you want one, and
        what you see is what we print.
      </p>

      <h2>How a frame gets made</h2>
      <p>
        Every order is printed to size on archival paper, mounted, and assembled by hand. Nothing
        is warehoused pre-made — your frame does not exist until you order it, which is why we
        quote dispatch in days rather than hours.
      </p>
      <p>
        Before anything ships, the print is checked against the preview you approved. If the photo
        will not hold up at the size you picked, we tell you at upload time rather than after the
        parcel arrives.
      </p>

      <h2>What we promise</h2>
      <ul>
        <li>The print matches the preview, or we remake it.</li>
        <li>Your photos are used to make your order and nothing else.</li>
        <li>A real person answers on WhatsApp during working hours.</li>
      </ul>

      <h2>Talk to us</h2>
      <p>
        Questions about an order, a size, or whether a photo will print well are all welcome —
        the <Link href="/contact">contact page</Link> has every way to reach us. If you are still
        deciding, <Link href="/how-it-works">how it works</Link> walks through the whole process.
      </p>
    </>
  );
}
