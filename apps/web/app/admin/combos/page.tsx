'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { comboSavings, expandComboFrames, type Combo } from '@bro-pics/shared';
import { formatPaise } from '../../../lib/format-price';
import { StatusChip } from '../../../components/admin/StatusChip';
import { useAdminApi } from '../../../components/admin/template-builder/use-admin-api';
import { useToast } from '../../../components/ui/Toast';

export default function AdminCombosPage() {
  const api = useAdminApi();
  const { showToast } = useToast();
  const [combos, setCombos] = useState<Combo[] | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ combos: Combo[] }>('/api/admin/combos');
      setCombos(data.combos);
    } catch (error) {
      setCombos([]);
      showToast(error instanceof Error ? error.message : 'Could not load combos', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-ink">Combo offers</h1>
          <p className="text-xs text-ink/60">Sell several frames as one product at one price. Customers personalize each frame separately.</p>
        </div>
        <Link href="/admin/combos/new" className="px-4 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-semibold transition-colors shadow-xs">
          + New combo
        </Link>
      </div>

      <div className="rounded-2xl border border-line bg-paper shadow-xs overflow-hidden">
        {combos === null ? (
          <div className="p-8 space-y-3 animate-pulse">
            <div className="h-12 bg-field rounded-xl" />
            <div className="h-12 bg-field rounded-xl" />
          </div>
        ) : combos.length === 0 ? (
          <div className="p-12 text-center text-xs text-ink/55 space-y-3">
            <p>No combos yet.</p>
            <Link href="/admin/combos/new" className="inline-block px-3.5 py-1.5 rounded-xl bg-gold text-ink text-xs font-semibold">Create your first combo</Link>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {combos.map((combo) => {
              const savings = comboSavings(combo);
              return (
                <li key={combo.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-field/30 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-ink truncate">{combo.name}</span>
                      <StatusChip status={combo.status} />
                    </div>
                    <p className="mt-0.5 text-2xs text-ink/55 font-mono">
                      /combo/{combo.slug} · {expandComboFrames(combo).length} frames · {formatPaise(combo.price)}
                      {savings.percent > 0 && ` (${savings.percent}% off ${formatPaise(combo.mrp)})`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {combo.status === 'published' && (
                      <a href={`/combo/${combo.slug}`} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg border border-line text-2xs font-semibold text-ink hover:bg-field">
                        View
                      </a>
                    )}
                    <Link href={`/admin/combos/${combo.id}`} className="px-3 py-1.5 rounded-lg bg-gold/10 hover:bg-gold/20 text-gold-deep text-2xs font-bold transition-colors">
                      Edit
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
