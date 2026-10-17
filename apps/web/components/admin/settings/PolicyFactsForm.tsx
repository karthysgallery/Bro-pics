'use client';

import { FormField } from '../AdminForm';

export interface PolicyFactsFormState {
  dispatchTime: string;
  deliveryEstimate: string;
  cancellationRule: string;
  refundTiming: string;
  photoRetention: string;
  responseTime: string;
  supportHours: string;
  jurisdiction: string;
}

export const EMPTY_POLICY_FACTS_FORM: PolicyFactsFormState = {
  dispatchTime: '',
  deliveryEstimate: '',
  cancellationRule: '',
  refundTiming: '',
  photoRetention: '',
  responseTime: '',
  supportHours: '',
  jurisdiction: '',
};

const input = 'w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none';

const FIELDS: Array<{ key: keyof PolicyFactsFormState; label: string; hint: string; placeholder: string }> = [
  { key: 'dispatchTime', label: 'Dispatch time', hint: 'How long you take to make and hand over an order to the courier.', placeholder: 'e.g. made and dispatched within … working days' },
  { key: 'deliveryEstimate', label: 'Delivery estimate', hint: 'What you tell customers about courier delivery time.', placeholder: 'e.g. … working days after dispatch' },
  { key: 'cancellationRule', label: 'Cancellation rule', hint: 'Until when an order can be cancelled (for example before printing starts).', placeholder: 'your rule, in a sentence' },
  { key: 'refundTiming', label: 'Refund timing', hint: 'How long an approved refund takes to reach the customer.', placeholder: 'e.g. within … working days to the original payment method' },
  { key: 'photoRetention', label: 'How long uploaded photos are kept', hint: 'Used on the privacy policy.', placeholder: 'e.g. … months after delivery' },
  { key: 'responseTime', label: 'Response time', hint: 'How soon you answer support messages and grievances.', placeholder: 'e.g. within … working hours' },
  { key: 'supportHours', label: 'Support hours', hint: 'Days and times you answer messages.', placeholder: 'e.g. Monday to Saturday, … to …' },
  { key: 'jurisdiction', label: 'Courts that apply', hint: 'Place whose courts handle disputes (confirm with your adviser).', placeholder: 'city / district' },
];

interface Props {
  value: PolicyFactsFormState;
  onChange: (next: PolicyFactsFormState) => void;
}

export function PolicyFactsForm({ value, onChange }: Props) {
  return (
    <div className="p-6 rounded-2xl border border-line bg-paper shadow-xs space-y-5">
      <h2 className="text-sm font-bold text-ink uppercase tracking-wider border-b border-line pb-2">Wording your policy pages quote</h2>
      <p className="text-xs text-ink/70">
        These sentences are put into the policy pages wherever they are needed. Only write what you have decided: a page that needs a value you have left empty cannot be approved or shown to customers.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FIELDS.map((f) => (
          <FormField key={f.key} label={f.label} hint={f.hint}>
            <input value={value[f.key]} onChange={(e) => onChange({ ...value, [f.key]: e.target.value })} className={input} placeholder={f.placeholder} />
          </FormField>
        ))}
      </div>
    </div>
  );
}
