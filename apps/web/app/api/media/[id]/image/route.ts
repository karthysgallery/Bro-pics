import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { parseRequestedWidth, readStorageImage } from '../../../../../lib/image-proxy';
import type { MediaAsset } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Template artwork (frames, backgrounds, masks) for the personalization canvas,
 * served from this origin. Only active, PUBLIC media can be read here — the same
 * files are already world-readable under Storage's public/ prefix, so this adds
 * no new exposure; it just makes them canvas-safe.
 */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'image');
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests, please try again shortly' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } });
  }
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return NextResponse.json({ error: 'Invalid media id' }, { status: 400 });

  const snap = await getFirestore(getAdminApp()).collection('media').doc(id).get();
  const media = snap.exists ? (snap.data() as MediaAsset) : null;
  if (!media || media.type !== 'image' || media.isActive === false || !media.path.startsWith('public/')) {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }

  const width = parseRequestedWidth(new URL(request.url).searchParams.get('w'), 1600);
  try {
    const image = await readStorageImage(media.path, width);
    return new NextResponse(new Uint8Array(image.body), {
      status: 200,
      headers: { 'Content-Type': image.contentType, // A media id always shows the same picture (a new upload gets a new id): browsers and CDNs may keep it.
        'Cache-Control': 'public, max-age=31536000, immutable' },
    });
  } catch {
    return NextResponse.json({ error: 'Image could not be read' }, { status: 404 });
  }
}
