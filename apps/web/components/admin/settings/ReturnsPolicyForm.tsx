'use client';

import { FormField } from '../AdminForm';

export interface ReturnsFormState {
  claimWindowDays: string;
  claimWindowApproved: boolean;
  readyMadeChangeOfMindDays: string;
  readyMadeChangeOfMindApproved: boolean;
  unboxingVideoRecommended: boolean;
  claimInstructions: string;
  replacementPreferred: boolean;
}

export const DEFAULT_RETURNS_FORM: ReturnsFormState = {
  claimWindowDays: '',
  claimWindowApproved: false,
  readyMadeChangeOfMindDays: '',
  readyMadeChangeOfMindApproved: false,
  unboxingVideoRecommended: true,
  claimInstructions: '',
  replacementPreferred: true,
};

const input = 'w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none';

interface Props {
  value: ReturnsFormState;
  onChange: (next: ReturnsFormState) => void;
}

export function ReturnsPolicyForm({ value, onChange }: Props) {
  const set = (patch: Partial<ReturnsFormState>) => onChange({ ...value, ...patch });
  return (
    <div className="p-6 rounded-2xl border border-line bg-paper shadow-xs space-y-6">
      <h2 className="text-sm font-bold text-ink uppercase tracking-wider border-b border-line pb-2">Returns, replacements and claims</h2>
      <p className="text-xs text-ink/70">
        <strong>Personalized products</strong> (made from a customer&apos;s photo or text) are not taken back for a change of mind. A damaged, defective, wrong or mis-printed item is always reviewed. A value only counts once you tick <em>Approved</em>; until then it is not shown to customers and not enforced.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <FormField label="Days to report a problem after delivery" hint="Damage, defect, wrong item or printing issue. Empty = no deadline is applied.">
            <input inputMode="numeric" value={value.claimWindowDays} onChange={(e) => set({ claimWindowDays: e.target.value })} className={input} placeholder="not decided" />
          </FormField>
          <label className="flex items-center gap-2 text-xs text-ink">
            <input type="checkbox" checked={value.claimWindowApproved} onChange={(e) => set({ claimWindowApproved: e.target.checked })} />
            Approved by the owner
          </label>
        </div>
        <div className="space-y-2">
          <FormField label="Change-of-mind return period for ready-made products (days)" hint="Only for fixed designs (actor, devotional…). Empty or 0 = not offered.">
            <input inputMode="numeric" value={value.readyMadeChangeOfMindDays} onChange={(e) => set({ readyMadeChangeOfMindDays: e.target.value })} className={input} placeholder="not decided" />
          </FormField>
          <label className="flex items-center gap-2 text-xs text-ink">
            <input type="checkbox" checked={value.readyMadeChangeOfMindApproved} onChange={(e) => set({ readyMadeChangeOfMindApproved: e.target.checked })} />
            Approved by the owner
          </label>
        </div>
      </div>

      <FormField label="How customers should raise a claim" hint="Plain text shown on the returns policy and the order page. Do not promise timelines you have not confirmed.">
        <textarea rows={4} value={value.claimInstructions} onChange={(e) => set({ claimInstructions: e.target.value })} className={input} />
      </FormField>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs text-ink">
          <input type="checkbox" checked={value.unboxingVideoRecommended} onChange={(e) => set({ unboxingVideoRecommended: e.target.checked })} />
          Ask customers to record a continuous unboxing video (recommended, not a condition; a claim without one is still reviewed)
        </label>
        <label className="flex items-center gap-2 text-xs text-ink">
          <input type="checkbox" checked={value.replacementPreferred} onChange={(e) => set({ replacementPreferred: e.target.checked })} />
          Offer a replacement first when the fault is ours (refunds follow the law and how the order was paid)
        </label>
      </div>
    </div>
  );
}
