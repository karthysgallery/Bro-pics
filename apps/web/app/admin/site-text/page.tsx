'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SITE_TEXT_FIELDS, type SiteTextKey } from '@bro-pics/shared';
import { useAdminApi } from '../../../components/admin/template-builder/use-admin-api';

type Values = Partial<Record<SiteTextKey, string>>;

const GROUPS = [...new Set(SITE_TEXT_FIELDS.map((f) => f.group))];

export default function SiteTextPage() {
  const api = useAdminApi();
  const [values, setValues] = useState<Values | null>(null);
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ value: Values | null }>('/api/admin/settings/siteText');
      const v = res.value ?? {};
      setValues(v);
      setSaved(JSON.stringify(v));
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'The text could not be loaded.' });
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => values !== null && JSON.stringify(values) !== saved, [values, saved]);

  if (!values) {
    return <div className="mx-auto max-w-3xl p-6 md:p-8">{message ? <p className="text-sm text-alert">{message.text}</p> : <div className="h-96 animate-pulse rounded-2xl bg-field" />}</div>;
  }

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      // Only what differs from the original wording is stored.
      const body = Object.fromEntries(
        SITE_TEXT_FIELDS.map((f) => [f.key, values[f.key]?.trim() ?? '']).filter(([key, v]) => v && v !== SITE_TEXT_FIELDS.find((f) => f.key === key)!.default)
      );
      await api('/api/admin/settings/siteText', { method: 'PUT', body: JSON.stringify(body) });
      setValues(body);
      setSaved(JSON.stringify(body));
      setMessage({ ok: true, text: 'Saved. The shop shows the new wording now.' });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'The text could not be saved.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 pb-28 md:p-8">
      <div className="space-y-1 border-b border-line pb-4">
        <h1 className="font-display text-xl font-bold text-ink md:text-2xl">Site text</h1>
        <p className="text-xs text-ink/60">Short pieces of wording used across the shop. Leave a box empty to keep the original wording shown in grey.</p>
      </div>
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`rounded-xl px-4 py-2.5 text-xs font-medium ${message.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-alert'}`}>
          {message.text}
        </p>
      )}
      {GROUPS.map((group) => (
        <section key={group} aria-labelledby={`g-${group}`} className="space-y-3 rounded-2xl border border-line bg-paper p-5">
          <h2 id={`g-${group}`} className="text-sm font-semibold text-ink">
            {group}
          </h2>
          {SITE_TEXT_FIELDS.filter((f) => f.group === group).map((f) => {
            const long = 'long' in f;
            const common = {
              id: `st-${f.key}`,
              value: values[f.key] ?? '',
              placeholder: f.default,
              maxLength: long ? 400 : 80,
              onChange: (e: { target: { value: string } }) => setValues({ ...values, [f.key]: e.target.value }),
              className: 'w-full rounded-lg border border-line bg-white px-2.5 py-2 text-sm text-ink outline-none placeholder:text-ink/35 focus:border-ink',
            };
            return (
              <label key={f.key} htmlFor={common.id} className="block space-y-1">
                <span className="text-2xs font-semibold uppercase tracking-wide text-ink/55">{f.label}</span>
                {long ? <textarea rows={3} {...common} /> : <input {...common} />}
              </label>
            );
          })}
        </section>
      ))}
      {(dirty || busy) && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 rounded-2xl border border-gold/20 bg-ink px-5 py-3 text-paper shadow-2xl">
          <span className="text-xs">Unsaved changes</span>
          <button type="button" onClick={() => void load()} disabled={busy} className="rounded-xl px-3 py-1.5 text-xs text-paper/70 hover:bg-paper/10 hover:text-paper">
            Discard
          </button>
          <button type="button" onClick={() => void save()} disabled={busy} className="rounded-xl bg-gold px-4 py-1.5 text-xs font-semibold text-ink hover:bg-gold-deep disabled:opacity-50">
            {busy ? 'Saving…' : 'Save & publish'}
          </button>
        </div>
      )}
    </div>
  );
}
