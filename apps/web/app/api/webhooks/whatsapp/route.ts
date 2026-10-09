import { NextResponse } from 'next/server';
import { validSignature } from '../../../../lib/billing/webhook-signature';
import { customerIdForPhone, newCustomer, normalizeIndianMobile } from '@bro-pics/shared';
import { billingDb, whatsappService } from '../../../../lib/billing/server';
import { logger } from '@bro-pics/shared';

/**
 * WhatsApp Cloud API webhook.
 *  GET  — Meta's subscription check (hub.verify_token must equal WHATSAPP_WEBHOOK_VERIFY_TOKEN).
 *  POST — message statuses (sent / delivered / read / failed) → the message
 *         log, the invoice and the campaign; and customer replies: "STOP" (or
 *         the marketing template's stop button) opts them out of marketing at
 *         once, "START" opts them back in. Every POST must carry Meta's
 *         X-Hub-Signature-256 made with WHATSAPP_APP_SECRET, or it is refused.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (expected && url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === expected) {
    return new NextResponse(url.searchParams.get('hub.challenge') ?? '', { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}


const STOP = /^(stop|unsubscribe|stop promotions|opt out|optout)$/i;
const START = /^(start|subscribe|opt in|optin)$/i;

interface WebhookBody {
  entry?: Array<{
    changes?: Array<{
      value?: {
        statuses?: Array<{ id: string; status: string; timestamp?: string; errors?: Array<{ title?: string; message?: string; code?: number }> }>;
        messages?: Array<{ from: string; type: string; text?: { body?: string }; button?: { text?: string; payload?: string }; interactive?: { button_reply?: { title?: string } } }>;
      };
    }>;
  }>;
}

export async function POST(request: Request): Promise<NextResponse> {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get('X-Hub-Signature-256'), process.env.WHATSAPP_APP_SECRET)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  let body: WebhookBody;
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const wa = whatsappService();
  const db = billingDb();
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const s of change.value?.statuses ?? []) {
        if (!['sent', 'delivered', 'read', 'failed'].includes(s.status)) continue;
        const at = s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : new Date().toISOString();
        const error = s.errors?.[0] ? `${s.errors[0].title ?? s.errors[0].message ?? 'Failed'}${s.errors[0].code ? ` (code ${s.errors[0].code})` : ''}` : null;
        await wa.recordStatus({ providerMessageId: s.id, status: s.status as 'sent' | 'delivered' | 'read' | 'failed', at, error });
      }
      for (const m of change.value?.messages ?? []) {
        const text = (m.text?.body ?? m.button?.text ?? m.button?.payload ?? m.interactive?.button_reply?.title ?? '').trim();
        const wantsOut = STOP.test(text);
        const wantsIn = START.test(text);
        if (!wantsOut && !wantsIn) continue;
        let phone: string;
        try {
          phone = normalizeIndianMobile(`+${m.from}`);
        } catch {
          continue;
        }
        const at = new Date().toISOString();
        const ref = db.collection('customers').doc(customerIdForPhone(phone));
        const marketing = { status: wantsOut ? ('opted_out' as const) : ('opted_in' as const), at, source: 'whatsapp_reply' };
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          if (snap.exists) tx.update(ref, { 'consent.marketing': marketing, updatedAt: at });
          else {
            const fresh = newCustomer({ phone, name: 'WhatsApp contact', source: 'admin' }, at);
            tx.set(ref, { ...fresh, consent: { ...fresh.consent, marketing } });
          }
        });
        logger.info('WhatsApp marketing consent changed by the customer', { customer: customerIdForPhone(phone), status: wantsOut ? 'opted_out' : 'opted_in' });
      }
    }
  }
  // Always 200 once verified, or Meta retries the same events.
  return NextResponse.json({ ok: true }, { status: 200 });
}
