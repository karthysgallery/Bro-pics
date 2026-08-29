import type { Category, Product, Variant, Review, HomepageSection } from '@bro-pics/shared';

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
  },
];

function toPrintPixels(widthIn: number, heightIn: number): { printWidthPx: number; printHeightPx: number } {
  return { printWidthPx: Math.round(widthIn * 300), printHeightPx: Math.round(heightIn * 300) };
}

export const seedProducts: Product[] = productInputs.map((input) => {
  const activeVariants = input.variants.filter((v) => v.stockStatus !== 'out_of_stock');
  const allPrices = input.variants.map((v) => v.price);
  const activePrices = activeVariants.length > 0 ? activeVariants.map((v) => v.price) : allPrices;
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
    availableSizes: [...new Set(activeVariants.map((v) => v.sizeLabel))],
    availableColours: [...new Set(activeVariants.map((v) => v.frameColour))],
    availableMaterials: [...new Set(activeVariants.map((v) => v.material))],
    minPrice: Math.min(...activePrices),
    maxPrice: Math.max(...activePrices),
    occasionTags: input.occasionTags,
    inStock: activeVariants.length > 0,
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
  };
});

export const seedVariants: Variant[] = productInputs.flatMap((input) =>
  input.variants.map((v) => ({
    id: `var_${v.idSuffix}`,
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
  }))
);

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
