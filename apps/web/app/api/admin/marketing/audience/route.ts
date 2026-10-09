import { NextResponse } from 'next/server';
import { CampaignAudienceSchema } from '@bro-pics/shared';
import { selectAudience } from '@bro-pics/shared/src/whatsapp/campaigns';
import { billingDb, guard } from '../../../../../lib/billing/server';

/** POST { audience } — how many opted-in customers it reaches now, and a few of them, before sending. */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, 'marketing:whatsapp');
  if (!g.ok) return g.response;
  const parsed = CampaignAudienceSchema.safeParse((await request.json().catch(() => null))?.audience);
  if (!parsed.success) return NextResponse.json({ error: 'Choose an audience' }, { status: 400 });
  const { recipients, optedOut } = await selectAudience(billingDb(), parsed.data);
  return NextResponse.json({ count: recipients.length, optedOut, sample: recipients.slice(0, 8).map((c) => ({ id: c.id, name: c.name, phone: `${c.phone.slice(0, 5)}•••${c.phone.slice(-3)}` })) }, { status: 200 });
}
