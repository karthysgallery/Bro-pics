import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '../../../lib/rate-limit';
import { deliveryEstimateForPincode } from '@bro-pics/shared';

// [BE-21] Pure computation, no Firestore lookup — see
// packages/shared/src/shipping/pincode-zones.ts for the zone data and its
// "coarse approximation pending real courier-zone data" caveat.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'read');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const pincode = request.nextUrl.searchParams.get('pincode') ?? '';
  const estimate = deliveryEstimateForPincode(pincode);
  if (!estimate) {
    return NextResponse.json({ serviceable: false, error: 'Invalid pincode' }, { status: 400 });
  }

  // Every valid Indian pincode is serviceable (see shipping-policy's "we
  // deliver across India") — the estimate is the only thing that varies
  // by zone, never whether the order can be placed at all.
  return NextResponse.json({ serviceable: true, ...estimate }, { status: 200 });
}
