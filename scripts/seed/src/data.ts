import type { Category, Product, Variant, Review, HomepageSection, ProductMedia, FrameTemplate } from '@bro-pics/shared';

export const seedCategories: Category[] = [
  {
    id: 'cat_frames',
    name: 'Frames & Wall Décor',
    slug: 'frames-wall-decor',
    parentId: null,
    image: '/placeholders/categories/frames.svg',
    sortOrder: 1,
    isActive: true,
    seo: { title: 'Frames & Wall Décor | BroPics', description: 'Personalized photo frames for every wall.' },
  },
  {
    id: 'cat_canvas',
    name: 'Canvas Prints',
    slug: 'canvas-prints',
    parentId: null,
    image: '/placeholders/categories/canvas.svg',
    sortOrder: 2,
    isActive: true,
    seo: { title: 'Canvas Prints | BroPics', description: 'Gallery-wrapped canvas prints of your favourite photo.' },
  },
  {
    id: 'cat_collage',
    name: 'Collage & Combo Sets',
    slug: 'collage-combo-sets',
    parentId: null,
    image: '/placeholders/categories/collage.svg',
    sortOrder: 3,
    isActive: true,
    seo: { title: 'Collage & Combo Sets | BroPics', description: 'Multi-photo collage sets for a whole story.' },
  },
  {
    id: 'cat_gifts',
    name: 'Personalized Gifts',
    slug: 'personalized-gifts',
    parentId: null,
    image: '/placeholders/categories/gifts.svg',
    sortOrder: 4,
    isActive: true,
    seo: { title: 'Personalized Gifts | BroPics', description: 'Photo mugs, desk frames, and everyday keepsakes.' },
  },
];

interface SeedProductInput {
  id: string;
  title: string;
  categoryId: string;
  shortDesc: string;
  descriptionHtml: string;
  highlights: string[];
  howItWorks: string[];
  careText: string;
  badges: string[];
  photoSlots: number;
  occasionTags: string[];
  variants: Array<{
    idSuffix: string;
    sku: string;
    sizeLabel: string;
    widthIn: number;
    heightIn: number;
    frameColour: string;
    material: string;
    price: number;
    compareAtPrice?: number;
    stockStatus: 'in_stock' | 'out_of_stock' | 'backorder';
  }>;
  reviews: Array<{ rating: number; title: string; body: string; isVerified: boolean }>;
  faq: Array<{ question: string; answer: string }>;
}

const productInputs: SeedProductInput[] = [
  {
    id: 'prod_classic_wooden_frame',
    title: 'Classic Wooden Photo Frame',
    categoryId: 'cat_frames',
    shortDesc: 'A timeless wooden frame for your favourite memory',
    descriptionHtml:
      '<p>Solid wood frame with a smooth matt finish, ready to hang or stand on a shelf. Built to last and finished by hand.</p>',
    highlights: ['Solid wood construction', 'Ready to hang or stand', 'Smooth matt finish'],
    howItWorks: ['Upload your photo', 'Adjust and preview inside the frame', 'We print and ship'],
    careText: 'Wipe with a dry, soft cloth. Avoid direct sunlight for long-term colour retention.',
    badges: ['best-seller'],
    photoSlots: 1,
    occasionTags: ['birthday', 'anniversary', 'housewarming'],
    variants: [
      { idSuffix: '8x12_black', sku: 'CWF-8X12-BLK', sizeLabel: '8x12 in', widthIn: 8, heightIn: 12, frameColour: 'Black', material: 'Wood', price: 79900, compareAtPrice: 99900, stockStatus: 'in_stock' },
      { idSuffix: '8x12_white', sku: 'CWF-8X12-WHT', sizeLabel: '8x12 in', widthIn: 8, heightIn: 12, frameColour: 'White', material: 'Wood', price: 79900, compareAtPrice: 99900, stockStatus: 'in_stock' },
      { idSuffix: '12x18_black', sku: 'CWF-12X18-BLK', sizeLabel: '12x18 in', widthIn: 12, heightIn: 18, frameColour: 'Black', material: 'Wood', price: 129900, stockStatus: 'in_stock' },
    ],
    reviews: [
      { rating: 5, title: 'Beautiful finish', body: 'The wood grain looks premium and the print came out sharp.', isVerified: true },
      { rating: 4, title: 'Good but slow shipping', body: 'Frame quality is great, took a bit longer than expected to arrive.', isVerified: true },
    ],
    faq: [
      { question: 'What photo formats can I upload?', answer: 'JPG and PNG are both supported.' },
      { question: 'Can I change my photo after ordering?', answer: 'Once production has started we can no longer swap the photo — please double-check your preview before confirming.' },
    ],
  },
  {
    id: 'prod_modern_acrylic_frame',
    title: 'Modern Acrylic Photo Frame',
    categoryId: 'cat_frames',
    shortDesc: 'A sleek acrylic frame with a glossy, modern finish',
    descriptionHtml: '<p>High-clarity acrylic with a floating-photo look, perfect for a contemporary desk or wall display.</p>',
    highlights: ['Crystal-clear acrylic', 'Floating photo effect', 'Scratch-resistant coating'],
    howItWorks: ['Upload your photo', 'Adjust and preview inside the frame', 'We print and ship'],
    careText: 'Clean with a microfibre cloth. Avoid abrasive cleaners.',
    badges: ['new'],
    photoSlots: 1,
    occasionTags: ['birthday', 'corporate-gifting'],
    variants: [
      { idSuffix: '10x10_clear', sku: 'MAF-10X10-CLR', sizeLabel: '10x10 in', widthIn: 10, heightIn: 10, frameColour: 'Clear', material: 'Acrylic', price: 109900, stockStatus: 'in_stock' },
      { idSuffix: '12x12_clear', sku: 'MAF-12X12-CLR', sizeLabel: '12x12 in', widthIn: 12, heightIn: 12, frameColour: 'Clear', material: 'Acrylic', price: 139900, stockStatus: 'in_stock' },
    ],
    reviews: [{ rating: 5, title: 'Looks premium', body: 'The floating effect makes the photo really stand out.', isVerified: true }],
    faq: [
      { question: 'Does the acrylic really give a floating-photo look?', answer: 'Yes — the photo is printed beneath a layer of clear acrylic so it appears to float, with no visible border.' },
      { question: 'Will the acrylic scratch easily?', answer: 'The surface has a scratch-resistant coating, but we still recommend cleaning it only with a soft microfibre cloth.' },
    ],
  },
  {
    id: 'prod_vintage_collage_frame',
    title: 'Vintage Multi-Photo Collage Frame',
    categoryId: 'cat_collage',
    shortDesc: 'A weathered-finish frame holding six of your favourite photos',
    descriptionHtml: '<p>A single frame with six openings, finished in a warm vintage tone, ideal for a family memory wall.</p>',
    highlights: ['Holds 6 photos', 'Warm vintage finish', 'Single-piece hanging frame'],
    howItWorks: ['Upload 6 photos', 'Arrange each into its slot', 'We print and ship'],
    careText: 'Dust gently with a soft brush.',
    badges: ['best-seller'],
    photoSlots: 6,
    occasionTags: ['housewarming', 'anniversary'],
    variants: [
      { idSuffix: 'standard_brown', sku: 'VCF-STD-BRN', sizeLabel: '24x18 in (6 openings)', widthIn: 24, heightIn: 18, frameColour: 'Vintage Brown', material: 'Wood', price: 249900, compareAtPrice: 299900, stockStatus: 'in_stock' },
    ],
    reviews: [
      { rating: 5, title: 'Perfect for our hallway', body: 'Six photos fit beautifully, the vintage tone matches our decor.', isVerified: true },
      { rating: 5, title: 'Great gift', body: 'Gave this to my parents for their anniversary, they loved it.', isVerified: false },
    ],
    faq: [
      { question: 'Can I mix portrait and landscape photos in the six openings?', answer: 'Yes, each of the six openings can hold its own photo in any orientation — the layout preview will show you how it fits.' },
      { question: 'Is the frame a single piece or six separate frames?', answer: 'It ships as one single-piece hanging frame with six openings, so there is only one item to hang on your wall.' },
    ],
  },
  {
    id: 'prod_couples_eye_frame',
    title: "Couple's Eye Frame",
    categoryId: 'cat_frames',
    shortDesc: 'Two eyes, one frame — a symbol of togetherness',
    descriptionHtml: '<p>A close-up portrait style frame designed to showcase a shared, meaningful detail from a couple\'s photo.</p>',
    highlights: ['Romantic keepsake design', 'Premium matt print', 'Compact size for a nightstand or shelf'],
    howItWorks: ['Upload your photo', 'Adjust and preview inside the frame', 'We print and ship'],
    careText: 'Wipe with a dry, soft cloth.',
    badges: ['trending'],
    photoSlots: 1,
    occasionTags: ['anniversary', 'valentines'],
    variants: [
      { idSuffix: '6x8_black', sku: 'CEF-6X8-BLK', sizeLabel: '6x8 in', widthIn: 6, heightIn: 8, frameColour: 'Black', material: 'Wood', price: 59900, stockStatus: 'in_stock' },
    ],
    reviews: [{ rating: 4, title: 'Sweet design', body: 'A really thoughtful gift idea, print quality is solid.', isVerified: true }],
    faq: [
      { question: 'What part of the photo should I use for the eye close-up?', answer: 'Upload your original couple photo and use the in-page editor to zoom into the eyes — we recommend a clear, well-lit shot for the best crop.' },
      { question: 'Is this frame a good size for a nightstand?', answer: 'Yes, at 6x8 in it is designed to fit comfortably on a nightstand or small shelf.' },
    ],
  },
  {
    id: 'prod_photo_canvas_print',
    title: 'Gallery Wrap Canvas Print',
    categoryId: 'cat_canvas',
    shortDesc: 'A frameless, gallery-wrapped canvas ready to hang',
    descriptionHtml: '<p>Your photo printed on artist-grade canvas, stretched over a solid wooden frame, ready to hang straight out of the box.</p>',
    highlights: ['Frameless gallery-wrap style', 'Fade-resistant pigment ink', 'Ready to hang'],
    howItWorks: ['Upload your photo', 'Adjust and preview on the canvas', 'We print and ship'],
    careText: 'Dust gently, avoid moisture.',
    badges: [],
    photoSlots: 1,
    occasionTags: ['housewarming', 'corporate-gifting'],
    variants: [
      { idSuffix: '16x24_natural', sku: 'GWC-16X24-NAT', sizeLabel: '16x24 in', widthIn: 16, heightIn: 24, frameColour: 'Natural Wood Edge', material: 'Canvas', price: 189900, stockStatus: 'in_stock' },
      { idSuffix: '20x30_natural', sku: 'GWC-20X30-NAT', sizeLabel: '20x30 in', widthIn: 20, heightIn: 30, frameColour: 'Natural Wood Edge', material: 'Canvas', price: 259900, stockStatus: 'in_stock' },
    ],
    reviews: [{ rating: 5, title: 'Stunning colours', body: 'Print quality on the canvas is excellent, very vivid.', isVerified: true }],
    faq: [
      { question: 'Does the canvas need a separate frame?', answer: 'No — it is a frameless, gallery-wrapped canvas stretched over a solid wooden frame, so it arrives ready to hang.' },
      { question: 'Will the colours fade over time?', answer: 'We print with fade-resistant pigment ink, which holds its colour well under normal indoor lighting.' },
    ],
  },
  {
    id: 'prod_desk_photo_frame',
    title: 'Mini Desk Photo Frame',
    categoryId: 'cat_gifts',
    shortDesc: 'A compact frame perfect for a work desk or bedside table',
    descriptionHtml: '<p>A small, sturdy frame that fits neatly on any desk without taking up much space.</p>',
    highlights: ['Compact desk-friendly size', 'Sturdy stand-up base', 'Available in two finishes'],
    howItWorks: ['Upload your photo', 'Adjust and preview inside the frame', 'We print and ship'],
    careText: 'Wipe with a dry cloth.',
    badges: ['budget-pick'],
    photoSlots: 1,
    occasionTags: ['birthday', 'corporate-gifting'],
    variants: [
      { idSuffix: '4x6_black', sku: 'MDF-4X6-BLK', sizeLabel: '4x6 in', widthIn: 4, heightIn: 6, frameColour: 'Black', material: 'Wood', price: 34900, stockStatus: 'in_stock' },
      { idSuffix: '4x6_white', sku: 'MDF-4X6-WHT', sizeLabel: '4x6 in', widthIn: 4, heightIn: 6, frameColour: 'White', material: 'Wood', price: 34900, stockStatus: 'out_of_stock' },
    ],
    reviews: [{ rating: 4, title: 'Great value', body: 'Small but well made for the price.', isVerified: true }],
    faq: [
      { question: 'Will this frame fit on a standard office desk?', answer: 'Yes, its compact 4x6 in size and sturdy stand-up base are designed to fit neatly on a desk or bedside table.' },
    ],
  },
  {
    id: 'prod_photo_collage_set',
    title: 'Three-Piece Photo Collage Set',
    categoryId: 'cat_collage',
    shortDesc: 'Three matching frames that tell one story together',
    descriptionHtml: '<p>A set of three frames in matching finish, arranged side by side to display a sequence of memories.</p>',
    highlights: ['Set of 3 matching frames', 'Ideal for a staircase or hallway wall', 'Consistent finish across all three'],
    howItWorks: ['Upload 3 photos', 'Adjust and preview each frame', 'We print and ship'],
    careText: 'Wipe with a dry, soft cloth.',
    badges: ['best-seller'],
    photoSlots: 3,
    occasionTags: ['housewarming', 'wedding'],
    variants: [
      { idSuffix: 'set_black', sku: 'PCS-SET-BLK', sizeLabel: '3 x 8x10 in', widthIn: 8, heightIn: 10, frameColour: 'Black', material: 'Wood', price: 189900, compareAtPrice: 229900, stockStatus: 'in_stock' },
    ],
    reviews: [{ rating: 5, title: 'Looks amazing together', body: 'The set on our staircase wall gets so many compliments.', isVerified: true }],
    faq: [
      { question: 'Can I use three different photos across the set?', answer: 'Yes, you can upload a separate photo for each of the three frames to tell one story across the set.' },
      { question: 'Do all three frames need to hang together?', answer: 'They look best arranged side by side in a matching finish, but each frame can also be hung or placed on its own.' },
    ],
  },
  {
    id: 'prod_personalized_photo_mug',
    title: 'Personalized Photo Mug',
    categoryId: 'cat_gifts',
    shortDesc: 'A ceramic mug printed with your favourite photo',
    descriptionHtml: '<p>Start every morning with a favourite memory — a food-grade ceramic mug printed with your chosen photo.</p>',
    highlights: ['Food-grade ceramic', 'Dishwasher-safe print (hand wash recommended)', 'Great for everyday gifting'],
    howItWorks: ['Upload your photo', 'Adjust and preview on the mug', 'We print and ship'],
    careText: 'Hand wash recommended to preserve print quality.',
    badges: [],
    photoSlots: 1,
    occasionTags: ['birthday', 'corporate-gifting'],
    variants: [
      { idSuffix: 'standard_white', sku: 'PPM-STD-WHT', sizeLabel: 'Standard 325ml', widthIn: 3.5, heightIn: 4, frameColour: 'White', material: 'Ceramic', price: 39900, stockStatus: 'in_stock' },
    ],
    reviews: [{ rating: 4, title: 'Nice everyday gift', body: 'Print held up well after a few washes.', isVerified: true }],
    faq: [
      { question: 'Is the mug dishwasher-safe?', answer: 'The print is dishwasher-safe, though we recommend hand washing to preserve print quality over the long run.' },
      { question: 'Is the mug food-grade and safe for hot drinks?', answer: 'Yes, it is made from food-grade ceramic and is safe for everyday hot or cold drinks.' },
    ],
  },
];

function toPrintPixels(widthIn: number, heightIn: number): { printWidthPx: number; printHeightPx: number } {
  return { printWidthPx: Math.round(widthIn * 300), printHeightPx: Math.round(heightIn * 300) };
}

export const seedProducts: Product[] = productInputs.map((input) => {
  // All seed variants have isActive: true, so every variant participates in
  // the facet/price fields below, matching calculateDenormalizedFields in
  // functions/src/products/denormalize.ts (which filters by isActive, not
  // stockStatus). stockStatus only affects the `inStock` boolean.
  const allPrices = input.variants.map((v) => v.price);
  const inStock = input.variants.some((v) => v.stockStatus === 'in_stock');
  const ratings = input.reviews.map((r) => r.rating);
  const ratingAverage = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

  return {
    id: input.id,
    title: input.title,
    slug: input.id.replace('prod_', '').replace(/_/g, '-'),
    categoryId: input.categoryId,
    shortDesc: input.shortDesc,
    descriptionHtml: input.descriptionHtml,
    highlights: input.highlights,
    howItWorks: input.howItWorks,
    careText: input.careText,
    basePrice: Math.min(...allPrices),
    isActive: true,
    isFeatured: input.badges.includes('best-seller'),
    badges: input.badges,
    dispatchDaysMin: 3,
    dispatchDaysMax: 5,
    photoSlots: input.photoSlots,
    allowsTextPersonalization: false,
    seo: { title: `${input.title} | BroPics`, description: input.shortDesc },
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    availableSizes: [...new Set(input.variants.map((v) => v.sizeLabel))],
    availableColours: [...new Set(input.variants.map((v) => v.frameColour))],
    availableMaterials: [...new Set(input.variants.map((v) => v.material))],
    minPrice: Math.min(...allPrices),
    maxPrice: Math.max(...allPrices),
    occasionTags: input.occasionTags,
    inStock,
    ratingAverage: Math.round(ratingAverage * 10) / 10,
    ratingCount: ratings.length,
    titleLower: input.title.toLowerCase(),
    searchTokens: [
      ...new Set(
        `${input.title} ${input.shortDesc}`
          .toLowerCase()
          .split(/\s+/)
          .filter((token) => token.length > 2)
      ),
    ],
    faq: input.faq,
    primaryImageUrl: `/placeholders/products/${input.id.replace('prod_', '').replace(/_/g, '-')}-1.svg`,
    hoverImageUrl: `/placeholders/products/${input.id.replace('prod_', '').replace(/_/g, '-')}-2.svg`,
  };
});

export const seedVariants: Variant[] = productInputs.flatMap((input) =>
  input.variants.map((v) => ({
    id: `var_${input.id.replace('prod_', '')}_${v.idSuffix}`,
    productId: input.id,
    sku: v.sku,
    sizeLabel: v.sizeLabel,
    widthIn: v.widthIn,
    heightIn: v.heightIn,
    frameColour: v.frameColour,
    material: v.material,
    price: v.price,
    compareAtPrice: v.compareAtPrice,
    stockStatus: v.stockStatus,
    ...toPrintPixels(v.widthIn, v.heightIn),
    minUploadPx: toPrintPixels(v.widthIn, v.heightIn).printWidthPx,
    aspectRatio: v.widthIn / v.heightIn,
    isActive: true,
  }))
);

export const seedReviews: Review[] = productInputs.flatMap((input, productIndex) =>
  input.reviews.map((r, reviewIndex) => ({
    id: `rev_${input.id}_${reviewIndex}`,
    productId: input.id,
    userId: `user_seed_${productIndex}_${reviewIndex}`,
    orderId: r.isVerified ? `order_seed_${productIndex}_${reviewIndex}` : undefined,
    rating: r.rating,
    title: r.title,
    body: r.body,
    media: [],
    isVerified: r.isVerified,
    status: 'approved' as const,
    createdAt: new Date(2026, 1, 1 + productIndex * 7 + reviewIndex),
  }))
);

export const seedProductMedia: ProductMedia[] = [
  ...productInputs.flatMap((input) => {
    const slug = input.id.replace('prod_', '').replace(/_/g, '-');
    return [
      {
        id: `media_${input.id}_1`,
        productId: input.id,
        variantId: null,
        type: 'image' as const,
        url: `/placeholders/products/${slug}-1.svg`,
        alt: `${input.title}, primary view`,
        sortOrder: 0,
      },
      {
        id: `media_${input.id}_2`,
        productId: input.id,
        variantId: null,
        type: 'image' as const,
        url: `/placeholders/products/${slug}-2.svg`,
        alt: `${input.title}, alternate view`,
        sortOrder: 1,
      },
    ];
  }),
  // Variant-specific media for a subset of prod_classic_wooden_frame's
  // variants — exercises the gallery fallback rule (§2.3 of the PDP
  // design spec): the black variant has its own photo, the white variant
  // does not and must fall back to the variant-agnostic media above.
  {
    id: 'media_prod_classic_wooden_frame_black_variant',
    productId: 'prod_classic_wooden_frame',
    variantId: 'var_classic_wooden_frame_8x12_black',
    type: 'image',
    url: '/placeholders/products/classic-wooden-frame-1.svg',
    alt: 'Classic Wooden Photo Frame in black, 8x12 in',
    sortOrder: 0,
  },
  // Product video — exercises the video rail (Task 7).
  {
    id: 'media_prod_classic_wooden_frame_video',
    productId: 'prod_classic_wooden_frame',
    variantId: null,
    type: 'video',
    url: '/placeholders/videos/product-demo.mp4',
    alt: 'Classic Wooden Photo Frame, in motion',
    sortOrder: 2,
  },
];

/**
 * Computes a FrameTemplate's printableRects (fractions of the mockup
 * image's own width/height, 0-1) for a given slot count and — for
 * single-slot products only — the variant's physical aspect ratio.
 *
 * This is the single source of truth for printable-rect geometry: both
 * `seedFrameTemplates` below (which feeds Firestore/the editor) and
 * `generate-mockups.ts` (which rasterizes the transparent "hole" in the
 * mockup PNG) call this exact function, so the mockup art and the rect
 * geometry the editor uses to place photos can never disagree.
 */
export function computePrintableRects(
  slotCount: number,
  variantAspectRatio: number
): FrameTemplate['printableRects'] {
  // Evenly-spaced grid layout for multi-slot products; a single centered
  // rect — sized to the variant's real physical aspect ratio — for
  // single-slot products. Simple, deterministic, and always produces
  // non-overlapping rects regardless of slotCount.
  if (slotCount === 1) {
    // Fit the largest rect matching the variant's own aspectRatio
    // (widthIn/heightIn) inside the same 0.8 x 0.8 margin area the
    // grid layout below uses, then centre it. Using the variant's
    // real aspect ratio (rather than a fixed square) keeps the
    // computed crop DPI accurate for single-opening products.
    const marginSize = 0.8;
    let width: number;
    let height: number;
    if (variantAspectRatio >= 1) {
      // Landscape or square: constrained by width.
      width = marginSize;
      height = marginSize / variantAspectRatio;
    } else {
      // Portrait: constrained by height.
      height = marginSize;
      width = marginSize * variantAspectRatio;
    }

    return [
      {
        slotIndex: 0,
        x: 0.1 + (marginSize - width) / 2,
        y: 0.1 + (marginSize - height) / 2,
        width,
        height,
      },
    ];
  }

  const columns = Math.ceil(Math.sqrt(slotCount));
  const rows = Math.ceil(slotCount / columns);
  const cellWidth = 0.8 / columns;
  const cellHeight = 0.8 / rows;

  return Array.from({ length: slotCount }, (_, slotIndex) => {
    const col = slotIndex % columns;
    const row = Math.floor(slotIndex / columns);
    return {
      slotIndex,
      x: 0.1 + col * cellWidth,
      y: 0.1 + row * cellHeight,
      width: cellWidth * 0.9,
      height: cellHeight * 0.9,
    };
  });
}

export const seedFrameTemplates: FrameTemplate[] = seedVariants
  .filter((v) => v.isActive)
  .map((variant) => {
    const product = seedProducts.find((p) => p.id === variant.productId)!;
    const slotCount = product.photoSlots;
    const printableRects = computePrintableRects(slotCount, variant.aspectRatio);

    return {
      id: `ft_${variant.id}`,
      variantId: variant.id,
      mockupUrl: `/placeholders/mockups/${product.slug}.png`,
      maskUrl: null,
      overlayUrl: null,
      printableRects,
      bleedMm: 2,
      matInset: 0,
    };
  });

export const seedHomepageSections: HomepageSection[] = [
  {
    id: 'sec_hero',
    type: 'hero_slider',
    title: 'Handcrafted With Love',
    subtitle: 'Personalized photo frames made from your favourite memories',
    image: '/placeholders/home/hero-1.svg',
    mobileImage: '/placeholders/home/hero-1-mobile.svg',
    link: '/category/frames-wall-decor',
    sortOrder: 1,
    startsAt: null,
    endsAt: null,
    isActive: true,
    config: {},
  },
  {
    id: 'sec_category_tiles',
    type: 'category_tiles',
    title: 'Shop by Category',
    subtitle: '',
    image: '',
    mobileImage: '',
    link: '',
    sortOrder: 2,
    startsAt: null,
    endsAt: null,
    isActive: true,
    config: {},
  },
  {
    id: 'sec_best_sellers',
    type: 'best_sellers',
    title: 'Best Sellers',
    subtitle: 'Loved by our customers',
    image: '',
    mobileImage: '',
    link: '/category/all',
    sortOrder: 3,
    startsAt: null,
    endsAt: null,
    isActive: true,
    config: {},
  },
  {
    id: 'sec_how_it_works',
    type: 'how_it_works',
    title: 'How It Works',
    subtitle: 'From your photo to your wall in four simple steps',
    image: '',
    mobileImage: '',
    link: '',
    sortOrder: 4,
    startsAt: null,
    endsAt: null,
    isActive: true,
    config: {},
  },
  {
    id: 'sec_featured_frames',
    type: 'featured_collection',
    title: 'Featured: Frames & Wall Décor',
    subtitle: '',
    image: '',
    mobileImage: '',
    link: '/category/frames-wall-decor',
    sortOrder: 5,
    startsAt: null,
    endsAt: null,
    isActive: true,
    config: { categoryId: 'cat_frames' },
  },
  {
    id: 'sec_products_in_motion',
    type: 'products_in_motion',
    title: 'Products in Motion',
    subtitle: '',
    image: '',
    mobileImage: '',
    link: '',
    sortOrder: 6,
    startsAt: null,
    endsAt: null,
    isActive: true,
    config: {},
  },
  {
    id: 'sec_reviews',
    type: 'reviews_testimonials',
    title: 'What Our Customers Say',
    subtitle: '',
    image: '',
    mobileImage: '',
    link: '',
    sortOrder: 7,
    startsAt: null,
    endsAt: null,
    isActive: true,
    config: {},
  },
  {
    id: 'sec_why_us',
    type: 'why_us',
    title: 'Why BroPics',
    subtitle: 'Quality you can trust',
    image: '/placeholders/home/why-us.svg',
    mobileImage: '/placeholders/home/why-us.svg',
    link: '',
    sortOrder: 8,
    startsAt: null,
    endsAt: null,
    isActive: true,
    config: {},
  },
  {
    id: 'sec_offer_strip',
    type: 'offer_strip',
    title: 'Use code NEW10 for 10% off your first order',
    subtitle: '',
    image: '',
    mobileImage: '',
    link: '',
    sortOrder: 9,
    startsAt: null,
    endsAt: null,
    isActive: true,
    config: {},
  },
  {
    id: 'sec_recently_viewed',
    type: 'recently_viewed',
    title: 'Recently Viewed',
    subtitle: '',
    image: '',
    mobileImage: '',
    link: '',
    sortOrder: 10,
    startsAt: null,
    endsAt: null,
    isActive: true,
    config: {},
  },
];
