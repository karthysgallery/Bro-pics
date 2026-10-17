'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../../lib/auth-context';
import type { ReadinessItem } from '../../../lib/launch-readiness';

/** What the business, shipping, returns and policy-page settings still lack. Read-only; counts and labels only. */
export function ReadinessPanel() {
  const { user } = useAuth();
  const [items, setItems] = useState<ReadinessItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloads, setReloads] = useState(0);

  // Settings are saved elsewhere on the page; re-check once a save has gone through so the list never shows stale gaps.
  useEffect(() => {
    const onSaved = () => setReloads((n) => n + 1);
    window.addEventListener('karthys:settings-saved', onSaved);
    return () => window.removeEventListener('karthys:settings-saved', onSaved);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/readiness', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) setItems(data.items);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, reloads]);

  if (failed || !items) return null;
  const open = items.filter((i) => i.status === 'todo');
  return (
    <details className="rounded-2xl border border-line bg-paper shadow-xs p-4 text-xs" open={open.length > 0}>
      <summary className="cursor-pointer font-bold text-ink">
        {open.length === 0 ? 'Business and policy settings are complete' : `${open.length} area${open.length === 1 ? '' : 's'} still need your attention before the shop is fully set up`}
      </summary>
      <ul className="mt-3 space-y-3">
        {items.map((i) => (
          <li key={i.id}>
            <p className="font-semibold text-ink">
              {i.status === 'ok' ? 'Done: ' : 'To do: '}
              {i.label}
            </p>
            {i.details.length > 0 && (
              <ul className="list-disc pl-5 text-ink/70 space-y-0.5">
                {i.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
