'use client';

import { TrustReels, type TrustReel } from './TrustReels';

// Sample clip already in /public (a placeholder product demo), never real customer content. Shown only
// in development, and only while the videos collection has no homepage clips.
const SAMPLE: TrustReel[] = [
  { id: 'p1', kind: 'making', caption: '', src: '/placeholders/videos/product-demo.mp4', poster: '/banners/artisan-framing-craft.jpg', productSlug: null },
  { id: 'p2', kind: 'unboxing', caption: '', src: '/placeholders/videos/product-demo.mp4', poster: '/banners/fireside.png', productSlug: null },
  { id: 'p3', kind: 'feedback', caption: '', src: '/placeholders/videos/product-demo.mp4', poster: '/banners/reading-corner.png', productSlug: null },
  { id: 'p4', kind: 'making', caption: '', src: '/placeholders/videos/product-demo.mp4', poster: '/banners/gallery-wall.png', productSlug: null },
  { id: 'p5', kind: 'unboxing', caption: '', src: '/placeholders/videos/product-demo.mp4', poster: '/banners/fireside.png', productSlug: null },
];

export function TrustReelsPreview() {
  return <TrustReels reels={SAMPLE} preview />;
}
