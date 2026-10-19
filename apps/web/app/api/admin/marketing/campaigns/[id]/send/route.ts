import { NextResponse } from 'next/server';
import type { Campaign } from '@bro-pics/shared';
import { selectAudience, sendCampaignBatch, startCampaign } from '@bro-pics/shared/src/whatsapp/campaigns';
import { marketingTemplateProblem } from '@bro-pics/shared/src/whatsapp/template-registry';
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
  // Sending reaches real customers: administrators only (the marketing role can prepare a campaign, not start it).
  const g = await guard(request, 'whatsapp:campaign_send');
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  // Nothing is frozen or queued while WhatsApp is switched off (WHATSAPP_MODE=disabled) or not connected.
  if (whatsappService().mode === 'disabled') {
    return NextResponse.json({ error: { code: 'whatsapp_disabled', message: 'WhatsApp sending is switched off on the server, so this campaign was not started.' } }, { status: 409 });
  }
  const db = billingDb();
  const ref = db.collection('whatsappCampaigns').doc(id);
  const campaign = (await ref.get()).data() as Campaign | undefined;
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  if (!['draft', 'scheduled', 'sending'].includes(campaign.status)) return NextResponse.json({ error: 'This campaign has finished' }, { status: 409 });
  if (campaign.status === 'paused') return NextResponse.json({ error: 'This campaign is paused. Resume it first.' }, { status: 409 });
  const problem = await marketingTemplateProblem(db, campaign.template, campaign.language);
  if (problem) return NextResponse.json({ error: { code: 'template_not_approved', message: problem } }, { status: 409 });
  // Final confirmation: the audience is recomputed here, and the administrator must have confirmed THIS number.
  if (campaign.status !== 'sending') {
    const body = (await request.json().catch(() => null)) as { confirmAudience?: unknown } | null;
    const { recipients } = await selectAudience(db, campaign.audience);
    if (typeof body?.confirmAudience !== 'number') return NextResponse.json({ error: { code: 'confirmation_required', message: 'Confirm the audience size shown before sending.' }, audience: recipients.length }, { status: 409 });
    if (body.confirmAudience !== recipients.length) return NextResponse.json({ error: { code: 'audience_changed', message: `The audience changed from ${body.confirmAudience} to ${recipients.length}. Review it and confirm again.` }, audience: recipients.length }, { status: 409 });
  }
  const targeted = campaign.status === 'sending' ? campaign.counts.targeted : await startCampaign(db, id);
  const batch = await sendCampaignBatch(db, whatsappService(), id, 200);
  await writeAuditLog(db, { actorUid: g.uid, action: 'marketing.campaign_sent', resource: 'campaign', resourceId: id, details: { name: campaign.name, targeted, ...batch } }).catch(() => undefined);
  return NextResponse.json({ campaign: (await ref.get()).data() as Campaign, batch }, { status: 200 });
}
