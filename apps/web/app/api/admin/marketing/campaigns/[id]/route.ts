import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Campaign } from '@bro-pics/shared';
import { billingDb, guard } from '../../../../../../lib/billing/server';
import { writeAuditLog } from '../../../../../../lib/audit-log';
import { CampaignInputSchema } from '../../../../../../lib/billing/campaign-input';
import { cancelCampaignRecipients, requeueFailedRecipients } from '@bro-pics/shared/src/whatsapp/campaigns';
import { marketingTemplateProblem } from '@bro-pics/shared/src/whatsapp/template-registry';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const PatchSchema = z.union([
  z.object({ action: z.literal('update'), campaign: CampaignInputSchema }).strict(),
  z.object({ action: z.literal('schedule'), scheduledAt: z.string().datetime() }).strict(),
  z.object({ action: z.literal('cancel') }).strict(),
  z.object({ action: z.literal('pause') }).strict(),
  z.object({ action: z.literal('resume') }).strict(),
  z.object({ action: z.literal('retry_failed') }).strict(),
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

/** PATCH — edit a draft, schedule it (administrators), pause, resume (administrators), retry failed messages (administrators) or cancel. */
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
    // Scheduling is sending in the future: the same approvals apply.
    if (!g.can('whatsapp:campaign_send')) return NextResponse.json({ error: 'Only an administrator can schedule or send a campaign.' }, { status: 403 });
    const problem = await marketingTemplateProblem(db, campaign.template, campaign.language);
    if (problem) return NextResponse.json({ error: problem }, { status: 409 });
    await ref.update({ status: 'scheduled', scheduledAt: body.scheduledAt, updatedAt: at });
  } else if (body.action === 'pause') {
    if (!['sending', 'scheduled'].includes(campaign.status)) return NextResponse.json({ error: 'Only a campaign that is sending or scheduled can be paused' }, { status: 409 });
    await ref.update({ status: 'paused', updatedAt: at });
  } else if (body.action === 'resume') {
    if (campaign.status !== 'paused') return NextResponse.json({ error: 'This campaign is not paused' }, { status: 409 });
    if (!g.can('whatsapp:campaign_send')) return NextResponse.json({ error: 'Only an administrator can resume a campaign.' }, { status: 403 });
    const hasRecipients = campaign.counts.targeted > 0;
    await ref.update({ status: hasRecipients ? 'sending' : campaign.scheduledAt ? 'scheduled' : 'draft', updatedAt: at });
  } else if (body.action === 'retry_failed') {
    if (!g.can('whatsapp:campaign_send')) return NextResponse.json({ error: 'Only an administrator can retry failed messages.' }, { status: 403 });
    const n = await requeueFailedRecipients(db, id);
    await writeAuditLog(db, { actorUid: g.uid, action: 'marketing.campaign_retry_failed', resource: 'campaign', resourceId: id, details: { requeued: n } }).catch(() => undefined);
    return NextResponse.json({ requeued: n, campaign: (await ref.get()).data() as Campaign }, { status: 200 });
  } else {
    if (!['draft', 'scheduled', 'sending', 'paused'].includes(campaign.status)) return NextResponse.json({ error: 'This campaign has finished' }, { status: 409 });
    const cancelled = await cancelCampaignRecipients(db, id);
    await ref.update({ status: 'cancelled', updatedAt: at });
    await writeAuditLog(db, { actorUid: g.uid, action: 'marketing.campaign_cancel', resource: 'campaign', resourceId: id, details: { unsentCancelled: cancelled } }).catch(() => undefined);
    return NextResponse.json({ campaign: (await ref.get()).data() as Campaign }, { status: 200 });
  }
  await writeAuditLog(db, { actorUid: g.uid, action: `marketing.campaign_${body.action}`, resource: 'campaign', resourceId: id, details: body }).catch(() => undefined);
  return NextResponse.json({ campaign: (await ref.get()).data() as Campaign }, { status: 200 });
}
