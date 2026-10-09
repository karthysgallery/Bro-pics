import { PersonalizationTemplateSchema, type PersonalizationTemplate } from '../personalization/template-schema';

/**
 * The designs the product editor makes by itself, so a shop owner never has
 * to open the template builder for the two simple kinds of frame:
 *
 *  - ready-made: the shop's own artwork (devotional, film stars…) printed as
 *    is — a template with no customer slots and one printed artwork layer;
 *  - single photo: one customer photo filling the whole print.
 *
 * Collages are still designed by hand in the template builder.
 *
 * One design per print SHAPE: 8x12 and 12x18 share a design (the print is
 * scaled to the frame's own resolution when it is made), 8x10 needs its own.
 */

export const PRODUCT_TYPES = ['ready_made', 'single_photo', 'collage'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export interface SizeInches {
  widthIn: number;
  heightIn: number;
}

/** Same shape when the long/short ratio is equal (to 1%); portrait and landscape are separate shapes. */
export function shapeKey(size: SizeInches): string {
  const ratio = size.widthIn / size.heightIn;
  return `${ratio >= 1 ? 'L' : 'P'}${(Math.max(ratio, 1 / ratio)).toFixed(2)}`;
}

const COMMON_SHAPES: Array<[number, string]> = [[1, '1:1'], [1.25, '4:5'], [4 / 3, '3:4'], [1.4, '5:7'], [1.5, '2:3'], [2, '1:2']];

/** A shape as people say it: "2:3 portrait", "4:5 landscape", "square". */
export function shapeLabel(size: SizeInches): string {
  const ratio = Math.max(size.widthIn, size.heightIn) / Math.min(size.widthIn, size.heightIn);
  if (Math.abs(ratio - 1) < 0.01) return 'square';
  const named = COMMON_SHAPES.find(([r]) => Math.abs(r - ratio) / r < 0.01)?.[1] ?? `1:${ratio.toFixed(2)}`;
  return `${size.widthIn > size.heightIn ? named.split(':').reverse().join(':') : named} ${size.widthIn > size.heightIn ? 'landscape' : 'portrait'}`;
}

/** Groups sizes by print shape; each group's design is drawn at its LARGEST size. */
export function groupSizesByShape<T extends SizeInches>(sizes: T[]): Array<{ key: string; largest: T; sizes: T[] }> {
  const groups = new Map<string, T[]>();
  for (const s of sizes) {
    const key = shapeKey(s);
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.entries()].map(([key, list]) => ({
    key,
    sizes: list,
    largest: list.reduce((a, b) => (b.widthIn * b.heightIn > a.widthIn * a.heightIn ? b : a)),
  }));
}

const DPI = 300;
const canvasFor = (size: SizeInches) => ({ width: Math.round(size.widthIn * DPI), height: Math.round(size.heightIn * DPI), dpi: DPI, safeInset: 0, bleedMm: 0 });

/** A template id that is stable for (product, shape), so re-saving a product updates the same design. */
export function designId(productId: string, size: SizeInches): string {
  return `${productId}-${shapeKey(size).toLowerCase().replace('.', '_')}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 100);
}

export function buildReadyMadeTemplate(input: {
  productId: string;
  name: string;
  size: SizeInches;
  /** The artwork, already cut to this shape (media library id + URL). */
  artwork: { assetId: string; url?: string };
  version?: number;
}): PersonalizationTemplate {
  return PersonalizationTemplateSchema.parse({
    id: designId(input.productId, input.size),
    version: input.version ?? 1,
    status: 'published',
    type: 'ready_made',
    name: input.name,
    canvas: canvasFor(input.size),
    photoSlots: [],
    textSlots: [],
    layers: [{ kind: 'fixed', id: 'artwork', role: 'background', asset: { assetId: input.artwork.assetId, ...(input.artwork.url && { url: input.artwork.url }) }, printed: true }],
    tags: ['ready-made'],
  });
}

export function buildSinglePhotoTemplate(input: { productId: string; name: string; size: SizeInches; version?: number }): PersonalizationTemplate {
  return PersonalizationTemplateSchema.parse({
    id: designId(input.productId, input.size),
    version: input.version ?? 1,
    status: 'published',
    type: 'single_photo',
    name: input.name,
    canvas: canvasFor(input.size),
    photoSlots: [{ id: 'photo_01', label: 'Your photo', required: true, x: 0, y: 0, width: 1, height: 1, shape: 'rect' }],
    textSlots: [],
    layers: [{ kind: 'photoSlot', slotId: 'photo_01' }],
    tags: ['single-photo'],
  });
}

/**
 * The centre crop of an image to a print shape, in the image's own pixels —
 * how one uploaded artwork serves every frame shape.
 */
export function centreCrop(image: { width: number; height: number }, size: SizeInches): { left: number; top: number; width: number; height: number } {
  const target = size.widthIn / size.heightIn;
  const actual = image.width / image.height;
  if (actual > target) {
    const width = Math.round(image.height * target);
    return { left: Math.floor((image.width - width) / 2), top: 0, width, height: image.height };
  }
  const height = Math.round(image.width / target);
  return { left: 0, top: Math.floor((image.height - height) / 2), width: image.width, height };
}

/**
 * Whether the artwork is sharp enough for a size: its (cropped) pixels per
 * inch. 300 is ideal; below 150 prints soft.
 */
export function artworkDpi(image: { width: number; height: number }, size: SizeInches): number {
  const crop = centreCrop(image, size);
  return Math.floor(Math.min(crop.width / size.widthIn, crop.height / size.heightIn));
}

/** How much of the artwork a size keeps after cropping to its shape (1 = all of it). */
export function artworkKept(image: { width: number; height: number }, size: SizeInches): number {
  const crop = centreCrop(image, size);
  return (crop.width * crop.height) / (image.width * image.height);
}
