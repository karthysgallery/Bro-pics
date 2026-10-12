import type { FrameModel, ProductType } from '@bro-pics/shared';

/**
 * Fingerprint of everything the automatic shop photos are drawn from. A product whose saved key differs from
 * the current one has stale photos and they are remade on the next save. One function for the editor and the
 * bulk page, so a product made in bulk is not "stale" the moment it is opened in the editor.
 */
export function photoKeyOf(input: {
  productType: ProductType | null;
  title: string;
  /** The artwork's media id (ready-made), or the collage/sample source. */
  pictureSource: string | null;
  models: FrameModel[];
  /** Sizes in the order the photos draw them. */
  sizes: Array<{ widthIn: number; heightIn: number }>;
  /** The glitter extra in paise, or 0 when the product does not offer glitter. */
  glitterExtra: number;
}): string {
  return JSON.stringify({
    t: input.productType,
    n: input.title,
    p: input.pictureSource,
    f: input.models.map((m) => [m.id, m.name, m.material, m.colour, m.colourHex, m.mouldingWidthIn, m.image?.url ?? '', m.image?.borderPx ?? 0]),
    s: input.sizes.map((z) => `${z.widthIn}x${z.heightIn}`),
    // Switching glitter on or off (or changing its price, which the 6th photo shows) remakes the photos.
    g: input.glitterExtra,
  });
}
