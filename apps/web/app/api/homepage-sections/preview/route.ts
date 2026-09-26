import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { checkRateLimit } from '../../../../lib/rate-limit';
import type { HomepageSection } from '@bro-pics/shared';

/**
 * [ABE-17] Public, unauthenticated — the whole point of a preview token is
 * letting someone without a staff account view a draft/inactive/scheduled
 * section. Looks the section up by `previewToken` via a plain equality
 * query (no composite index needed), bypassing the `isActive`/
 * `startsAt`/`endsAt` filtering `getActiveHomepageSections()` applies on
 * the live homepage. An unknown or missing token gets a generic 404 —
 * never reveals whether a token merely doesn't match vs. never existed.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'read');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const token = request.nextUrl.searchParams.get('token') ?? '';
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const db = getFirestore(getAdminApp());
  const snap = await db.collection('homepageSections').where('previewToken', '==', token).limit(1).get();
  if (snap.empty) {
    return NextResponse.json({ error: 'Unknown or expired preview token' }, { status: 404 });
  }

  const section = snap.docs[0].data() as HomepageSection;
  return NextResponse.json({ section });
}
