import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { expandComboFrames } from '@bro-pics/shared';
import { getPublishedComboBySlug } from '../../../../../../lib/firestore-combos';
import { getComboFrameData } from '../../../../../../lib/firestore-combo-detail';
import { ComboFrameEditor } from '../../../../../../components/combo/ComboFrameEditor';

export const revalidate = 60;

interface FramePageProps {
  params: Promise<{ slug: string; key: string }>;
}

export async function generateMetadata({ params }: FramePageProps): Promise<Metadata> {
  const { slug, key } = await params;
  const combo = await getPublishedComboBySlug(slug);
  const frame = combo ? expandComboFrames(combo).find((f) => f.key === key) : undefined;
  // A step inside a purchase flow, not something to index.
  return { title: combo && frame ? `${frame.label} · ${combo.name} | KarthysGallery` : 'Combo | KarthysGallery', robots: { index: false, follow: true } };
}

export default async function ComboFramePage({ params }: FramePageProps) {
  const { slug, key } = await params;
  const combo = await getPublishedComboBySlug(slug);
  if (!combo) notFound();
  const frame = expandComboFrames(combo).find((f) => f.key === key);
  if (!frame) notFound();
  const data = await getComboFrameData(combo, frame.itemId);
  if (!data) notFound();

  return (
    <div className="mx-auto w-full max-w-shell px-4 md:px-6 py-6">
      <ComboFrameEditor
        combo={combo}
        frameKey={frame.key}
        frameLabel={frame.label}
        product={data.product}
        variants={data.variants}
        media={data.media}
        templatesByVariant={data.templatesByVariant}
        personalizationTemplatesByVariant={data.personalizationTemplatesByVariant}
      />
    </div>
  );
}
