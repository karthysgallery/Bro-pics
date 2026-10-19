'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Campaign, CampaignAudience } from '@bro-pics/shared';
import { useAuth } from '../../../../lib/auth-context';
import { useAdminApi } from '../../../../components/admin/template-builder/use-admin-api';
import { Badge, Notice, PageHeader, button, card, dateTime, input, primaryButton, sectionTitle } from '../../../../components/admin/billing/ui';

type AudienceType = CampaignAudience['type'];
const AUDIENCES: Array<{ type: AudienceType; label: string }> = [
  { type: 'all_opted_in', label: 'Everyone who opted in' },
  { type: 'previous_customers', label: 'Previous customers' },
  { type: 'purchased_category', label: 'Bought from a category' },
  { type: 'purchased_within_days', label: 'Bought in the last 30 / 60 / 90 days' },
  { type: 'high_value', label: 'High-value customers' },
  { type: 'lapsed', label: "Haven't bought recently" },
  { type: 'origin', label: 'Offline / online customers' },
  { type: 'tag', label: 'Customers with a tag' },
];

const blank = { name: '', template: '', language: 'en', bodyParams: '{{name}}', previewText: '', audienceType: 'all_opted_in' as AudienceType, categoryId: '', days: 30, minSpent: 5000, lapsedDays: 90, origin: 'offline', tag: '' };

/**
 * Admin → Marketing → WhatsApp campaigns. Separate from invoices and OTP:
 * approved MARKETING templates only, sent only to customers with a recorded
 * opt-in (re-checked at the moment of sending); STOP replies opt out at once.
 */
export default function WhatsAppCampaignsPage() {
  const api = useAdminApi();
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [form, setForm] = useState(blank);
  type Preview = { count: number; optedOut: number; exclusions?: { notOptedIn: number; optedOut: number; suppressed: number; outsideAudience: number }; estimate?: { totalInr: number; rateInr: number; rateCheckedOn: string | null } | null; sample: Array<{ name: string; phone: string }> };
  const [preview, setPreview] = useState<Preview | null>(null);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ campaigns: Campaign[] }>('/api/admin/marketing/campaigns').then((r) => setCampaigns(r.campaigns)).catch((e: Error) => setMsg({ ok: false, text: e.message }));
  }, [api]);
  useEffect(load, [load]);
  useEffect(() => {
    api<{ categories?: Array<{ id: string; name: string }> }>('/api/admin/categories').then((r) => setCategories(r.categories ?? [])).catch(() => setCategories([]));
  }, [api]);

  const audience = (): CampaignAudience => {
    switch (form.audienceType) {
      case 'purchased_category':
        return { type: 'purchased_category', categoryId: form.categoryId };
      case 'purchased_within_days':
        return { type: 'purchased_within_days', days: form.days as 30 | 60 | 90 };
      case 'high_value':
        return { type: 'high_value', minSpent: Math.round(form.minSpent * 100) };
      case 'lapsed':
        return { type: 'lapsed', days: form.lapsedDays };
      case 'origin':
        return { type: 'origin', origin: form.origin as 'offline' | 'online' | 'other' };
      case 'tag':
        return { type: 'tag', tag: form.tag.trim().toLowerCase() };
      default:
        return { type: form.audienceType } as CampaignAudience;
    }
  };

  useEffect(() => {
    if ((form.audienceType === 'purchased_category' && !form.categoryId) || (form.audienceType === 'tag' && !form.tag.trim())) return setPreview(null);
    const t = setTimeout(() => {
      api<Preview>('/api/admin/marketing/audience', { method: 'POST', body: JSON.stringify({ audience: audience() }) })
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, form.audienceType, form.categoryId, form.days, form.minSpent, form.lapsedDays, form.origin, form.tag]);

  const create = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api('/api/admin/marketing/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          template: form.template.trim(),
          language: form.language.trim(),
          bodyParams: form.bodyParams.split('|').map((p) => p.trim()).filter(Boolean),
          previewText: form.previewText,
          audience: audience(),
          scheduledAt: null,
        }),
      });
      setForm(blank);
      setMsg({ ok: true, text: 'Campaign saved as a draft. Send it now or schedule it below.' });
      load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not save.' });
    } finally {
      setBusy(false);
    }
  };

  const act = async (c: Campaign, action: 'send' | 'cancel' | 'schedule' | 'pause' | 'resume' | 'retry_failed') => {
    let scheduledAt: string | null = null;
    let confirmAudience: number | undefined;
    if (action === 'send') {
      // The audience is recounted on the server just now; the administrator confirms THAT number.
      const fresh = await api<Preview>('/api/admin/marketing/audience', { method: 'POST', body: JSON.stringify({ audience: c.audience }) }).catch(() => null);
      if (!fresh) return setMsg({ ok: false, text: 'Could not work out the audience. Try again.' });
      const ex = fresh.exclusions;
      const lines = [`Send “${c.name}” to ${fresh.count} customer(s) who agreed to marketing messages?`, ex ? `Left out: ${ex.notOptedIn} without permission, ${ex.optedOut} opted out, ${ex.suppressed} suppressed, ${ex.outsideAudience} outside this audience.` : '', fresh.estimate ? `Estimated cost about ₹${fresh.estimate.totalInr} at ₹${fresh.estimate.rateInr} per message (rate checked ${fresh.estimate.rateCheckedOn ?? 'on an unknown date'}; Meta’s bill is what counts).` : 'No cost estimate: enter the current rate under WhatsApp templates.', 'This cannot be undone once messages are sent.'].filter(Boolean);
      if (!window.confirm(lines.join('\n\n'))) return;
      confirmAudience = fresh.count;
    }
    if (action === 'cancel' && !window.confirm('Cancel this campaign? Messages not yet sent will not be sent.')) return;
    if (action === 'schedule') {
      const v = window.prompt('Send at (YYYY-MM-DD HH:MM, India time)');
      if (!v) return;
      const d = new Date(`${v.replace(' ', 'T')}:00+05:30`);
      if (Number.isNaN(d.getTime())) return setMsg({ ok: false, text: 'Use the format 2026-10-20 18:30' });
      scheduledAt = d.toISOString();
    }
    setBusy(true);
    try {
      if (action === 'send') await api(`/api/admin/marketing/campaigns/${c.id}/send`, { method: 'POST', body: JSON.stringify({ confirmAudience }) });
      else await api(`/api/admin/marketing/campaigns/${c.id}`, { method: 'PATCH', body: JSON.stringify(action === 'schedule' ? { action, scheduledAt } : { action }) });
      load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Failed.' });
    } finally {
      setBusy(false);
    }
  };

  const downloadReport = async (c: Campaign) => {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/admin/marketing/campaigns/${c.id}/report?format=csv`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return setMsg({ ok: false, text: 'You do not have permission to export reports.' });
    const url = URL.createObjectURL(new Blob([await res.text()], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign-${c.id}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const f = (k: keyof typeof blank, v: string | number) => setForm({ ...form, [k]: v });
  const valid = form.name.trim() && /^[a-z0-9_]{1,100}$/.test(form.template.trim()) && (form.audienceType !== 'purchased_category' || form.categoryId) && (form.audienceType !== 'tag' || form.tag.trim());
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6 md:p-8">
      <PageHeader title="WhatsApp campaigns">
        Offers and announcements to customers who agreed to receive them. Only templates approved as Marketing in WhatsApp Manager can be sent; every message offers the customer a way to stop.
      </PageHeader>
      {msg && <Notice tone={msg.ok ? 'success' : 'error'}>{msg.text}</Notice>}
      <section className={card} aria-labelledby="new-campaign">
        <h2 id="new-campaign" className={sectionTitle}>New campaign</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block space-y-1"><span className="text-2xs font-semibold text-ink/60">Name (for you)</span><input className={input} value={form.name} onChange={(e) => f('name', e.target.value)} placeholder="Diwali offer" /></label>
          <label className="block space-y-1"><span className="text-2xs font-semibold text-ink/60">Approved template name</span><input className={input} value={form.template} onChange={(e) => f('template', e.target.value)} placeholder="diwali_offer_2026" /></label>
          <label className="block space-y-1"><span className="text-2xs font-semibold text-ink/60">Template language</span><input className={input} value={form.language} onChange={(e) => f('language', e.target.value)} placeholder="en" /></label>
        </div>
        <label className="block space-y-1">
          <span className="text-2xs font-semibold text-ink/60">Template variables, in order, separated by | — {'{{name}}'} becomes the customer’s first name</span>
          <input className={input} value={form.bodyParams} onChange={(e) => f('bodyParams', e.target.value)} placeholder="{{name}} | 20% off | 31 Oct" />
        </label>
        <label className="block space-y-1">
          <span className="text-2xs font-semibold text-ink/60">Approved text (paste it from WhatsApp Manager, for the preview)</span>
          <textarea className={`${input} h-20 py-2`} value={form.previewText} onChange={(e) => f('previewText', e.target.value)} />
        </label>
        {form.previewText && (
          <div className="max-w-sm rounded-2xl rounded-tl-sm bg-[#dcf8c6] p-3 text-sm text-ink shadow-sm" aria-label="Message preview">
            {form.bodyParams.split('|').map((p) => p.trim()).reduce((text, p, i) => text.replaceAll(`{{${i + 1}}}`, p.replace('{{name}}', 'Asha')), form.previewText)}
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block space-y-1">
            <span className="text-2xs font-semibold text-ink/60">Audience</span>
            <select className={input} value={form.audienceType} onChange={(e) => f('audienceType', e.target.value)}>
              {AUDIENCES.map((a) => <option key={a.type} value={a.type}>{a.label}</option>)}
            </select>
          </label>
          {form.audienceType === 'purchased_category' && (
            <label className="block space-y-1"><span className="text-2xs font-semibold text-ink/60">Category</span>
              <select className={input} value={form.categoryId} onChange={(e) => f('categoryId', e.target.value)}>
                <option value="">Choose…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          {form.audienceType === 'purchased_within_days' && (
            <label className="block space-y-1"><span className="text-2xs font-semibold text-ink/60">Bought in the last</span>
              <select className={input} value={form.days} onChange={(e) => f('days', Number(e.target.value))}>{[30, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}</select>
            </label>
          )}
          {form.audienceType === 'high_value' && (
            <label className="block space-y-1"><span className="text-2xs font-semibold text-ink/60">Spent at least (₹)</span><input className={input} type="number" min={1} value={form.minSpent} onChange={(e) => f('minSpent', Number(e.target.value) || 1)} /></label>
          )}
          {form.audienceType === 'lapsed' && (
            <label className="block space-y-1"><span className="text-2xs font-semibold text-ink/60">No purchase for (days)</span><input className={input} type="number" min={1} value={form.lapsedDays} onChange={(e) => f('lapsedDays', Number(e.target.value) || 1)} /></label>
          )}
          {form.audienceType === 'origin' && (
            <label className="block space-y-1"><span className="text-2xs font-semibold text-ink/60">Customers who are</span>
              <select className={input} value={form.origin} onChange={(e) => f('origin', e.target.value)}><option value="offline">Offline</option><option value="online">Online</option><option value="other">Other</option></select>
            </label>
          )}
          {form.audienceType === 'tag' && (
            <label className="block space-y-1"><span className="text-2xs font-semibold text-ink/60">Tag</span><input className={input} value={form.tag} onChange={(e) => f('tag', e.target.value)} placeholder="diwali-2025" /></label>
          )}
          <div className="self-end text-xs text-ink/70" data-testid="audience-summary">
            {preview ? (
              <>
                Reaches <strong>{preview.count}</strong> customer{preview.count === 1 ? '' : 's'} with marketing permission.
                {preview.exclusions && <> Left out: {preview.exclusions.notOptedIn} without permission, {preview.exclusions.optedOut} opted out, {preview.exclusions.suppressed} suppressed.</>}
                {preview.estimate ? <> Estimate ≈ ₹{preview.estimate.totalInr} (rate ₹{preview.estimate.rateInr}, checked {preview.estimate.rateCheckedOn ?? '?'}).</> : <> No cost estimate (enter the current rate under WhatsApp templates).</>}
              </>
            ) : '—'}
          </div>
        </div>
        <button type="button" className={primaryButton} disabled={!valid || busy} onClick={() => void create()}>Save as draft</button>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-line bg-paper">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-field/60 text-left text-2xs uppercase tracking-wider text-ink/55">
              <th className="p-3">Campaign</th><th className="p-3">Status</th><th className="p-3 text-right">Targeted</th><th className="p-3 text-right">Sent</th><th className="p-3 text-right">Delivered</th><th className="p-3 text-right">Read</th><th className="p-3 text-right">Failed</th><th className="p-3 text-right">Opted out</th><th className="p-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {campaigns.map((c) => (
              <tr key={c.id}>
                <td className="p-3"><span className="font-semibold text-ink">{c.name}</span><span className="block text-2xs text-ink/55">{c.template} · {AUDIENCES.find((a) => a.type === c.audience.type)?.label} · {c.scheduledAt ? `scheduled ${dateTime(c.scheduledAt)}` : dateTime(c.createdAt)}</span></td>
                <td className="p-3"><Badge value={c.status} /></td>
                {(['targeted', 'sent', 'delivered', 'read', 'failed', 'optedOut'] as const).map((k) => <td key={k} className="p-3 text-right tabular-nums">{c.counts[k]}</td>)}
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-1.5">
                    {['draft', 'scheduled'].includes(c.status) && <button type="button" className={button} disabled={busy} onClick={() => void act(c, 'send')}>Send now</button>}
                    {c.status === 'draft' && <button type="button" className={button} disabled={busy} onClick={() => void act(c, 'schedule')}>Schedule</button>}
                    {['sending', 'scheduled'].includes(c.status) && <button type="button" className={button} disabled={busy} onClick={() => void act(c, 'pause')}>Pause</button>}
                    {c.status === 'paused' && <button type="button" className={button} disabled={busy} onClick={() => void act(c, 'resume')}>Resume</button>}
                    {['sending', 'sent', 'paused'].includes(c.status) && c.counts.failed > 0 && <button type="button" className={button} disabled={busy} onClick={() => void act(c, 'retry_failed')}>Retry failed</button>}
                    {['draft', 'scheduled', 'sending', 'paused'].includes(c.status) && <button type="button" className={button} disabled={busy} onClick={() => void act(c, 'cancel')}>Cancel</button>}
                    {c.counts.targeted > 0 && <button type="button" className={button} onClick={() => void downloadReport(c)}>Report</button>}
                  </div>
                </td>
              </tr>
            ))}
            {campaigns.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-xs text-ink/50">No campaigns yet.</td></tr>}
          </tbody>
        </table>
      </section>
      <p className="text-2xs text-ink/55">“Sent” means WhatsApp accepted the message. Delivered and read counts come only from WhatsApp’s delivery reports and stay at 0 until the webhook is connected. Nothing is estimated.</p>
    </div>
  );
}
