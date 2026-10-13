'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdminApi } from './template-builder/use-admin-api';
import { useToast } from '../ui/Toast';
import { addThisDevice, passkeyErrorMessage, passkeySupport } from '../../lib/passkeys-client';

interface Device {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Never');

/** Admin → My sign-in & security: the fingerprint / Face ID devices of the signed-in person, to add or remove. */
export function AdminSecurity() {
  const api = useAdminApi();
  const { showToast } = useToast();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [support, setSupport] = useState<{ any: boolean; builtIn: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      setDevices((await api<{ passkeys: Device[] }>('/api/admin/mfa/passkeys')).passkeys);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The devices could not be loaded.');
    }
  }, [api]);

  useEffect(() => {
    void load();
    void passkeySupport().then(setSupport);
  }, [load]);

  const call = useCallback(<T,>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }), [api]);

  const add = async () => {
    setBusy(true);
    try {
      await addThisDevice(call);
      showToast('This device can now sign you in with fingerprint or Face ID', 'success');
      await load();
    } catch (e) {
      showToast(passkeyErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (d: Device) => {
    if (!window.confirm(`Remove “${d.name}”? It will no longer sign you in. You can add it again later.`)) return;
    try {
      await api(`/api/admin/mfa/passkeys/${encodeURIComponent(d.id)}`, { method: 'DELETE' });
      showToast('Device removed', 'success');
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'The device could not be removed.', 'error');
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">My sign-in &amp; security</h1>
        <p className="mt-1 text-xs text-ink/60">Sign in to the admin with this device&rsquo;s fingerprint or Face ID instead of typing the authenticator code every time.</p>
      </div>

      <section className="rounded-2xl border border-line bg-paper p-5">
        <h2 className="font-display text-lg font-bold text-ink">Fingerprint / Face ID devices</h2>
        <p className="mt-1 text-xs text-ink/60">
          Your fingerprint or face stays on the device. The authenticator app and your recovery codes keep working as a backup, so a lost phone never locks you out.
        </p>

        {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-alert">{error}</p>}
        {devices === null && !error && <div className="mt-4 h-16 animate-pulse rounded-xl bg-tint" />}
        {devices && devices.length === 0 && <p className="mt-4 rounded-xl bg-field px-4 py-3 text-sm text-ink/70">No device added yet.</p>}
        {devices && devices.length > 0 && (
          <ul className="mt-4 divide-y divide-line rounded-xl border border-line" aria-label="Devices">
            {devices.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{d.name}</p>
                  <p className="text-2xs text-ink/55">
                    Added {when(d.createdAt)} · Last used {when(d.lastUsedAt)}
                    {d.backedUp ? ' · Synced across your devices' : ''}
                  </p>
                </div>
                <button type="button" onClick={() => void remove(d)} className="h-8 rounded-lg px-3 text-xs font-semibold text-alert hover:bg-red-50">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4">
          {support && !support.any ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">This browser cannot use fingerprint or Face ID. Open the admin in a recent Chrome, Safari or Edge on a device with a fingerprint reader, Face ID or screen lock.</p>
          ) : (
            <button type="button" disabled={busy || !support} onClick={() => void add()} className="h-10 rounded-xl bg-ink px-5 text-sm font-semibold text-paper disabled:opacity-50">
              {busy ? 'Waiting for your device…' : 'Add this device'}
            </button>
          )}
          {support?.any && !support.builtIn && <p className="mt-2 text-2xs text-ink/50">This device has no fingerprint or face reader set up, so the browser may ask for your phone or a security key instead.</p>}
        </div>
      </section>
    </div>
  );
}
