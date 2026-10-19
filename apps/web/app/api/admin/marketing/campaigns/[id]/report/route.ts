import { NextResponse } from 'next/server';
import type { Campaign } from '@bro-pics/shared';
import { csvSafe, maskPhone } from '@bro-pics/shared';
import { billingDb, guard } from '../../../../../../../lib/billing/server';
import { writeAuditLog } from '../../../../../../../lib/audit-log';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET — what happened to a campaign: counts per status and the reasons recipients were left out. `?format=csv` downloads a
 * minimal report (hidden number, status, error text), which needs whatsapp:export. No names, emails or message text.
 * "Submitted" means WhatsApp accepted the request; delivered and read come only from WhatsApp's own status events.
 */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const url = new URL(request.url);
  const csv = url.searchParams.get('format') === 'csv';
  const g = await guard(request, csv ? 'whatsapp:export' : 'marketing:whatsapp');
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const db = billingDb();
  const ref = db.collection('whatsappCampaigns').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  const campaign = snap.data() as Campaign;
  const recipients = await ref.collection('recipients').limit(5000).get();
  const byStatus: Record<string, number> = {};
  for (const d of recipients.docs) byStatus[d.get('status') as string] = (byStatus[d.get('status') as string] ?? 0) + 1;
  if (!csv) {
    return NextResponse.json({ campaign: { id, name: campaign.name, status: campaign.status, template: campaign.template, audience: campaign.audience, counts: campaign.counts, sentAt: campaign.sentAt }, recipientsByStatus: byStatus, note: 'sent = accepted by WhatsApp; delivered and read are reported by WhatsApp separately and may never arrive for some messages.' }, { status: 200 });
  }
  const lines = ['recipient,status,detail'];
  for (const d of recipients.docs) lines.push([maskPhone(String(d.get('phone') ?? '+0000')), d.get('status'), csvSafe(String(d.get('error') ?? ''))].join(','));
  await writeAuditLog(db, { actorUid: g.uid, action: 'marketing.campaign_report_exported', resource: 'campaign', resourceId: id, details: { rows: recipients.size } }).catch(() => undefined);
  return new NextResponse(lines.join('\r\n') + '\r\n', { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="campaign-${id}-report.csv"`, 'Cache-Control': 'no-store' } });
}
