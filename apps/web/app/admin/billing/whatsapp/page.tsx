'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { BillingSettings } from '@bro-pics/shared';
import { useAdminApi } from '../../../../components/admin/template-builder/use-admin-api';
import { Badge, Notice, PageHeader, card, primaryButton, sectionTitle } from '../../../../components/admin/billing/ui';

/** Admin → Billing → WhatsApp invoice settings: the on/off switch and what WhatsApp needs to be ready. */
export default function WhatsAppInvoiceSettingsPage() {
  const api = useAdminApi();
  const [s, setS] = useState<BillingSettings | null>(null);
  const [mode, setMode] = useState<string>('');
  const [canEdit, setCanEdit] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    api<{ settings: BillingSettings; whatsappMode: string; canEdit: boolean }>('/api/admin/billing/settings')
      .then((r) => {
        setS(r.settings);
        setMode(r.whatsappMode);
        setCanEdit(r.canEdit);
      })
      .catch((e: Error) => setMsg({ ok: false, text: e.message }));
  }, [api]);
  const toggle = async () => {
    if (!s) return;
    const next = { ...s, whatsappInvoices: !s.whatsappInvoices };
    try {
      await api('/api/admin/billing/settings', { method: 'PUT', body: JSON.stringify(next) });
      setS(next);
      setMsg({ ok: true, text: next.whatsappInvoices ? 'Invoices will be sent on WhatsApp.' : 'WhatsApp invoices are off. Staff can still print or download them.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not save.' });
    }
  };
  const modeText: Record<string, string> = {
    cloud: 'Connected to the WhatsApp Business Cloud API.',
    mock: 'Test mode: messages are written to the message log but not sent to phones.',
    disabled: 'Not connected: the server has no WhatsApp credentials, so every send is logged as failed.',
  };
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6 md:p-8">
      <PageHeader title="WhatsApp invoice settings">Invoices go to the customer’s WhatsApp as a PDF, using an approved transactional template. Customers who opt out are never messaged.</PageHeader>
      {msg && <Notice tone={msg.ok ? 'success' : 'error'}>{msg.text}</Notice>}
      <section className={card}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className={sectionTitle}>Send invoices on WhatsApp</h2>
            <p className="text-xs text-ink/60">Online orders: automatically when payment is confirmed. In store: when staff tick “Send the invoice on WhatsApp”.</p>
          </div>
          {s && (
            <button type="button" className={primaryButton} disabled={!canEdit} onClick={() => void toggle()} aria-pressed={s.whatsappInvoices}>
              {s.whatsappInvoices ? 'On — turn off' : 'Off — turn on'}
            </button>
          )}
        </div>
      </section>
      <section className={card}>
        <h2 className={sectionTitle}>Connection <Badge value={mode === 'cloud' ? 'sent' : mode === 'mock' ? 'pending' : 'failed'} label={mode || '…'} /></h2>
        <p className="text-sm text-ink">{modeText[mode] ?? ''}</p>
        <ul className="list-disc space-y-1 pl-5 text-xs text-ink/70">
          <li>Server settings (never in the browser): <code>WHATSAPP_ACCESS_TOKEN</code>, <code>WHATSAPP_PHONE_NUMBER_ID</code>, <code>WHATSAPP_APP_SECRET</code>, <code>WHATSAPP_WEBHOOK_VERIFY_TOKEN</code>.</li>
          <li>Approved template <code>karthys_invoice</code> (Utility, English): document header, body “Hi {'{{1}}'}, thank you for your purchase from Karthys Gallery. Invoice: {'{{2}}'} Order: {'{{3}}'} Amount: ₹{'{{4}}'} Your invoice is attached.”</li>
          <li>Webhook URL in Meta: <code>https://karthysgallery.in/api/webhooks/whatsapp</code> (fields: messages) — for delivered/read ticks and STOP replies.</li>
        </ul>
        <p className="text-xs text-ink/60">
          Every message and its status is in <Link className="underline" href="/admin/whatsapp/messages">WhatsApp → Message logs</Link>.
        </p>
      </section>
    </div>
  );
}
