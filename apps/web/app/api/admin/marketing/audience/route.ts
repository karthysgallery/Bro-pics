import { NextResponse } from 'next/server';
import { CampaignAudienceSchema } from '@bro-pics/shared';
import { selectAudience } from '@bro-pics/shared/src/whatsapp/campaigns';
import { billingDb, guard } from '../../../../../lib/billing/server';

/** POST { audience } — how many customers with marketing permission it reaches now, who is excluded and why, and a cost estimate when a rate has been entered. */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, 'marketing:whatsapp');
  if (!g.ok) return g.response;
  const parsed = CampaignAudienceSchema.safeParse((await request.json().catch(() => null))?.audience);
  if (!parsed.success) return NextResponse.json({ error: 'Choose an audience' }, { status: 400 });
  const db = billingDb();
  const { recipients, optedOut, exclusions } = await selectAudience(db, parsed.data);
  // An estimate only when the owner has entered a current rate; the code holds no price list.
  const pricing = (await db.collection('whatsappConfig').doc('pricing').get()).data() as { marketingPerMessageInr?: number; checkedOn?: string } | undefined;
  const estimate = pricing?.marketingPerMessageInr !== undefined ? { totalInr: Math.round(recipients.length * pricing.marketingPerMessageInr * 100) / 100, rateInr: pricing.marketingPerMessageInr, rateCheckedOn: pricing.checkedOn ?? null } : null;
  return NextResponse.json({ count: recipients.length, optedOut, exclusions, estimate, sample: recipients.slice(0, 8).map((c) => ({ id: c.id, name: c.name, phone: `${c.phone.slice(0, 5)}•••${c.phone.slice(-3)}` })) }, { status: 200 });
}
