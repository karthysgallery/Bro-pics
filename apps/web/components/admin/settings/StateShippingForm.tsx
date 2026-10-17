'use client';

import { INDIAN_STATES_AND_UTS } from '@bro-pics/shared';
import { FormField } from '../AdminForm';

/** Shipping form state. Money is rupees as text so a blank box means "not set" (never 0). */
export interface ShippingFormState {
  homeState: string;
  /** state name -> rupees as typed; missing/blank = not configured */
  stateCharges: Record<string, string>;
  otherStatesDefaultCharge: string;
  expressEnabled: boolean;
  expressCharge: string;
}

export const DEFAULT_SHIPPING_FORM: ShippingFormState = {
  homeState: 'Tamil Nadu',
  stateCharges: {},
  otherStatesDefaultCharge: '',
  expressEnabled: false,
  expressCharge: '',
};

const input = 'w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none';

const isRupees = (v: string): boolean => v.trim() !== '' && Number.isFinite(Number(v)) && Number(v) >= 0;

/** States with no charge, and no fallback to cover them. */
export function unconfiguredFormStates(f: ShippingFormState): string[] {
  if (isRupees(f.otherStatesDefaultCharge)) return [];
  return INDIAN_STATES_AND_UTS.filter((s) => s !== f.homeState && !isRupees(f.stateCharges[s] ?? ''));
}

interface Props {
  value: ShippingFormState;
  onChange: (next: ShippingFormState) => void;
}

export function StateShippingForm({ value, onChange }: Props) {
  const missing = unconfiguredFormStates(value);
  const setCharge = (state: string, rupees: string) => onChange({ ...value, stateCharges: { ...value.stateCharges, [state]: rupees } });
  const fillMissing = () => {
    const amount = window.prompt('Charge in ₹ to set for every state that has none yet (you can edit each one afterwards):');
    if (amount === null || !isRupees(amount)) return;
    const next = { ...value.stateCharges };
    for (const s of missing) next[s] = amount.trim();
    onChange({ ...value, stateCharges: next });
  };

  return (
    <div className="p-6 rounded-2xl border border-line bg-paper shadow-xs space-y-5">
      <h2 className="text-sm font-bold text-ink uppercase tracking-wider border-b border-line pb-2">Shipping charges by state</h2>
      <p className="text-xs text-ink/70">
        Shipping is <strong>free in {value.homeState}</strong>. For every other state or union territory, set the charge you want customers to pay. A state with no charge is <strong>never treated as free</strong>: customers there cannot check out until you set one (or a fallback charge below).
      </p>

      {missing.length > 0 && (
        <div role="alert" data-testid="unconfigured-states" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <strong>{missing.length} states have no shipping charge yet</strong>, so customers there cannot order. Set a charge for each, or fill them all at once.
          <button type="button" onClick={fillMissing} className="ml-2 underline font-semibold">
            Set one charge for all of them
          </button>
          <div className="mt-1 text-2xs text-amber-800/80">{missing.join(', ')}</div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
        {INDIAN_STATES_AND_UTS.map((state) => {
          const isHome = state === value.homeState;
          const raw = value.stateCharges[state] ?? '';
          const bad = raw.trim() !== '' && !isRupees(raw);
          return (
            <label key={state} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-ink">{state}</span>
              {isHome ? (
                <span className="w-32 rounded-xl bg-tint/70 px-3 py-2 text-center font-semibold text-accent">Free</span>
              ) : (
                <span className="flex w-32 items-center gap-1">
                  <span className="text-ink/50">₹</span>
                  <input
                    inputMode="decimal"
                    aria-label={`Shipping charge for ${state} in rupees`}
                    placeholder="not set"
                    value={raw}
                    onChange={(e) => setCharge(state, e.target.value)}
                    className={`${input} ${bad ? 'border-red-400' : ''}`}
                  />
                </span>
              )}
            </label>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-line pt-4">
        <FormField label="Fallback charge for states with no charge (₹)" hint="Optional. Leave empty to keep blocking checkout for states you have not priced.">
          <input inputMode="decimal" value={value.otherStatesDefaultCharge} onChange={(e) => onChange({ ...value, otherStatesDefaultCharge: e.target.value })} className={input} placeholder="none" />
        </FormField>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-ink">
            <input type="checkbox" checked={value.expressEnabled} onChange={(e) => onChange({ ...value, expressEnabled: e.target.checked })} />
            Offer express delivery (a flat extra charge)
          </label>
          {value.expressEnabled && (
            <FormField label="Express delivery charge (₹)">
              <input inputMode="decimal" value={value.expressCharge} onChange={(e) => onChange({ ...value, expressCharge: e.target.value })} className={input} />
            </FormField>
          )}
          <p className="text-2xs text-ink/55">Off by default. Free shipping in {value.homeState} applies to standard delivery.</p>
        </div>
      </div>
    </div>
  );
}
