import type { Product, Variant } from '@bro-pics/shared';

export const seedProducts: Product[] = [
  {
    id: 'prod_classic_wooden_frame',
    title: 'Classic Wooden Photo Frame',
    slug: 'classic-wooden-photo-frame',
    categoryId: 'cat_frames',
    shortDesc: 'A timeless wooden frame for your favourite memory',
    descriptionHtml: '<p>Placeholder description — replace with client copy.</p>',
    highlights: ['Solid wood construction', 'Ready to hang or stand'],
    howItWorks: ['Upload your photo', 'Adjust and preview', 'We print and ship'],
    careText: 'Wipe with a dry, soft cloth.',
    basePrice: 79900,
    isActive: true,
    isFeatured: true,
    badges: ['best-seller'],
    dispatchDaysMin: 3,
    dispatchDaysMax: 5,
    photoSlots: 1,
    allowsTextPersonalization: false,
    seo: {
      title: 'Classic Wooden Photo Frame | BroPics',
      description: 'Personalize a classic wooden photo frame with your own photo.',
    },
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  },
];

export const seedVariants: Variant[] = [
  {
    id: 'var_classic_8x12_black',
    productId: 'prod_classic_wooden_frame',
    sku: 'CWF-8X12-BLK',
    sizeLabel: '8x12 in',
    widthIn: 8,
    heightIn: 12,
    frameColour: 'Black',
    material: 'Wood',
    price: 79900,
    stockStatus: 'in_stock',
    printWidthPx: 2400,
    printHeightPx: 3600,
    minUploadPx: 2400,
    aspectRatio: 8 / 12,
    isActive: true,
  },
];
