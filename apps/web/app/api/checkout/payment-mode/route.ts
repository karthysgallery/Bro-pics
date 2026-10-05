import { NextResponse } from 'next/server';
import { getPaymentProvider } from '../../../../lib/payments/provider-factory';

// Lets the checkout page describe the payment step honestly (test mode vs
// real gateway) before an order exists. Reveals only the provider name,
// never keys. Not cached — it must reflect the live server config.
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ provider: getPaymentProvider().name });
  } catch {
    return NextResponse.json({ provider: null }, { status: 503 });
  }
}
