import { NextResponse } from 'next/server';
import { CampaignSchema, type Campaign } from '@bro-pics/shared';
import { CampaignInputSchema } from '../../../../../lib/billing/campaign-input';
import { billingDb, guard } from '../../../../../lib/billing/server';
import { writeAuditLog } from '../../../../../lib/audit-log';


/** GET — campaigns, newest first. POST — create a draft. Marketing permission only. */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, 'marketing:whatsapp');
  if (!g.ok) return g.response;
  const snap = await billingDb().collection('whatsappCampaigns').orderBy('createdAt', 'desc').limit(100).get();
  return NextResponse.json({ campaigns: snap.docs.map((d) => d.data() as Campaign) }, { status: 200 });
}

export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, 'marketing:whatsapp');
  if (!g.ok) return g.response;
  const parsed = CampaignInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: `${parsed.error.issues[0]?.path.join('.')}: ${parsed.error.issues[0]?.message}` }, { status: 400 });
  const db = billingDb();
  const ref = db.collection('whatsappCampaigns').doc();
  const at = new Date().toISOString();
  const campaign: Campaign = {
    id: ref.id,
    ...parsed.data,
    scheduledAt: null,
    status: 'draft',
    counts: { targeted: 0, sent: 0, delivered: 0, read: 0, failed: 0, optedOut: 0 },
    createdBy: g.uid,
    createdAt: at,
    updatedAt: at,
    sentAt: null,
  };
  await ref.set(CampaignSchema.parse(campaign));
  await writeAuditLog(db, { actorUid: g.uid, action: 'marketing.campaign_created', resource: 'campaign', resourceId: ref.id, details: { name: campaign.name, template: campaign.template, audience: campaign.audience } }).catch(() => undefined);
  return NextResponse.json({ campaign }, { status: 201 });
}
