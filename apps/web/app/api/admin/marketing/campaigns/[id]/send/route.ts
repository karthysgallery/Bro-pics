import { NextResponse } from 'next/server';
import type { Campaign } from '@bro-pics/shared';
import { sendCampaignBatch, startCampaign } from '@bro-pics/shared/src/whatsapp/campaigns';
import { billingDb, guard, whatsappService } from '../../../../../../../lib/billing/server';
import { writeAuditLog } from '../../../../../../../lib/audit-log';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST — send now: freezes the opted-in audience and sends the first batch;
 * the scheduled sender (every 5 minutes) finishes larger campaigns.
 */
export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const g = await guard(request, 'marketing:whatsapp');
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const db = billingDb();
  const ref = db.collection('whatsappCampaigns').doc(id);
  const campaign = (await ref.get()).data() as Campaign | undefined;
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  if (!['draft', 'scheduled', 'sending'].includes(campaign.status)) return NextResponse.json({ error: 'This campaign has finished' }, { status: 409 });
  const targeted = campaign.status === 'sending' ? campaign.counts.targeted : await startCampaign(db, id);
  const batch = await sendCampaignBatch(db, whatsappService(), id, 200);
  await writeAuditLog(db, { actorUid: g.uid, action: 'marketing.campaign_sent', resource: 'campaign', resourceId: id, details: { name: campaign.name, targeted, ...batch } }).catch(() => undefined);
  return NextResponse.json({ campaign: (await ref.get()).data() as Campaign, batch }, { status: 200 });
}
