import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Campaign } from '@bro-pics/shared';
import { billingDb, guard } from '../../../../../../lib/billing/server';
import { writeAuditLog } from '../../../../../../lib/audit-log';
import { CampaignInputSchema } from '../../../../../../lib/billing/campaign-input';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const PatchSchema = z.union([
  z.object({ action: z.literal('update'), campaign: CampaignInputSchema }).strict(),
  z.object({ action: z.literal('schedule'), scheduledAt: z.string().datetime() }).strict(),
  z.object({ action: z.literal('cancel') }).strict(),
]);

/** GET — one campaign with its recipients. */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const g = await guard(request, 'marketing:whatsapp');
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const ref = billingDb().collection('whatsappCampaigns').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  const recipients = await ref.collection('recipients').limit(500).get();
  return NextResponse.json({ campaign: snap.data() as Campaign, recipients: recipients.docs.map((d) => d.data()) }, { status: 200 });
}

/** PATCH — edit a draft, schedule it, or cancel (before or during sending). */
export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const g = await guard(request, 'marketing:whatsapp');
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const db = billingDb();
  const ref = db.collection('whatsappCampaigns').doc(id);
  const campaign = (await ref.get()).data() as Campaign | undefined;
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  const at = new Date().toISOString();
  const body = parsed.data;
  if (body.action === 'update') {
    if (campaign.status !== 'draft') return NextResponse.json({ error: 'Only a draft can be edited' }, { status: 409 });
    await ref.update({ ...body.campaign, scheduledAt: null, updatedAt: at });
  } else if (body.action === 'schedule') {
    if (!['draft', 'scheduled'].includes(campaign.status)) return NextResponse.json({ error: 'This campaign has already started' }, { status: 409 });
    if (body.scheduledAt < at) return NextResponse.json({ error: 'Choose a time in the future' }, { status: 400 });
    await ref.update({ status: 'scheduled', scheduledAt: body.scheduledAt, updatedAt: at });
  } else {
    if (!['draft', 'scheduled', 'sending'].includes(campaign.status)) return NextResponse.json({ error: 'This campaign has finished' }, { status: 409 });
    await ref.update({ status: 'cancelled', updatedAt: at });
  }
  await writeAuditLog(db, { actorUid: g.uid, action: `marketing.campaign_${body.action}`, resource: 'campaign', resourceId: id, details: body }).catch(() => undefined);
  return NextResponse.json({ campaign: (await ref.get()).data() as Campaign }, { status: 200 });
}
