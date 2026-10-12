'use client';

import { createEmptyState, setSlotPhoto, type PersonalizationTemplate } from '@bro-pics/shared';
import { renderToDataUrl, requiredImageSources, fontKeyOf } from '../../customizer/render-template';
import { templateAssetSrc } from '../../customizer/asset-src';
import { resolveFontFamilyForCanvas } from '../../../lib/text-personalization-options';
import { loadImage } from './product-photos';

/**
 * A collage design with the sample photo in every photo space and its default
 * names/dates — the picture the automatic shop photos are made from. Uses the
 * shop's own template renderer, so it looks like the customer's preview.
 */
export async function renderCollagePicture(template: PersonalizationTemplate, sampleUrls: string | string[], maxSide = 1600): Promise<string> {
  const urls = (Array.isArray(sampleUrls) ? sampleUrls : [sampleUrls]).filter(Boolean);
  if (urls.length === 0) throw new Error('Add a sample photo first.');
  // One photo per space, in order; when there are fewer photos than spaces they repeat.
  const loaded = await Promise.all(urls.map(async (url) => ({ url, img: await loadImage(url) })));
  let state = createEmptyState(template.id, template.version);
  template.photoSlots.forEach((slot, i) => {
    const pick = loaded[i % loaded.length]!;
    state = setSlotPhoto(state, slot.id, { assetId: `sample-${i}`, url: pick.url, width: pick.img.naturalWidth, height: pick.img.naturalHeight });
  });
  const photoSrc = (_slotId: string, photo: { url?: string }) => photo.url ?? urls[0]!;
  const { srcs } = requiredImageSources({ template, state, assetSrc: (ref) => templateAssetSrc(ref), photoSrc, includeUnprinted: false });
  const images = new Map<string, HTMLImageElement>();
  await Promise.all(srcs.map(async (src) => images.set(src, await loadImage(src))));
  const fontKeys = [...new Set(template.textSlots.map((t) => fontKeyOf(undefined, t.defaultFontFamily)))];
  await Promise.all(fontKeys.map((k) => document.fonts.load(`32px ${resolveFontFamilyForCanvas(k)}`).catch(() => [])));
  const out = renderToDataUrl(
    { template, state, getImage: (src) => images.get(src), assetSrc: (ref) => templateAssetSrc(ref), photoSrc, fontFamily: resolveFontFamilyForCanvas, includeUnprinted: false },
    maxSide
  );
  if (!out) throw new Error('The collage design could not be drawn. Check that its pictures are still in the media library.');
  return out;
}

/** The design to picture: the newest published version, or the newest draft while it is being made. */
export function latestDesign(versions: PersonalizationTemplate[]): PersonalizationTemplate | null {
  const published = versions.filter((v) => v.status === 'published').sort((a, b) => b.version - a.version)[0];
  return published ?? [...versions].sort((a, b) => b.version - a.version)[0] ?? null;
}
