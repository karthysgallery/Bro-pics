'use client';

import { INDIAN_STATES_AND_UTS, GST_REGISTRATION, type GstRegistration } from '@bro-pics/shared';
import { FormField } from '../AdminForm';

/** What the business-profile form edits (all text; empty = "not entered", never a made-up value). */
export interface BusinessFormState {
  name: string;
  supportPhone: string;
  processingDays: number;
  description: string;
  legalName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  country: string;
  supportEmail: string;
  supportWhatsapp: string;
  ownerName: string;
  grievanceName: string;
  grievanceDesignation: string;
  grievanceEmail: string;
  grievancePhone: string;
  gstRegistration: GstRegistration;
  invoiceNote: string;
  /** Older free-text address kept so nothing is lost until the structured address is entered. */
  address: string;
}

export const EMPTY_BUSINESS_FORM: BusinessFormState = {
  name: 'KarthysGallery',
  supportPhone: '',
  processingDays: 3,
  description: '',
  legalName: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  district: '',
  state: '',
  pincode: '',
  country: '',
  supportEmail: '',
  supportWhatsapp: '',
  ownerName: '',
  grievanceName: '',
  grievanceDesignation: '',
  grievanceEmail: '',
  grievancePhone: '',
  gstRegistration: 'unconfirmed',
  invoiceNote: '',
  address: '',
};

const GST_LABEL: Record<GstRegistration, string> = {
  unconfirmed: 'Not confirmed yet (check with your tax professional)',
  not_registered: 'Not GST-registered',
  registered: 'GST-registered (turn on GST in the GST & Invoicing tab)',
};

const input = 'w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none';

interface Props {
  value: BusinessFormState;
  onChange: (patch: Partial<BusinessFormState>) => void;
}

function Text({ label, hint, field, value, onChange, type = 'text', required, mono }: { label: string; hint?: string; field: keyof BusinessFormState; value: BusinessFormState; onChange: Props['onChange']; type?: string; required?: boolean; mono?: boolean }) {
  return (
    <FormField label={label} hint={hint} required={required}>
      <input type={type} value={String(value[field] ?? '')} onChange={(e) => onChange({ [field]: e.target.value } as Partial<BusinessFormState>)} className={`${input} ${mono ? 'font-mono' : ''}`} required={required} />
    </FormField>
  );
}

export function BusinessProfileForm({ value, onChange }: Props) {
  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl border border-line bg-paper shadow-xs space-y-5">
        <h2 className="text-sm font-bold text-ink uppercase tracking-wider border-b border-line pb-2">Business information</h2>
        <p className="text-2xs text-ink/60">Everything here may be shown to customers (pages, invoices, messages) and is readable by anyone who visits the shop. Leave a field empty until you have the confirmed details; nothing is filled in for you.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Text label="Store / brand name" field="name" value={value} onChange={onChange} required />
          <Text label="Legal business name" hint="As on your registration. Printed as the seller on invoices." field="legalName" value={value} onChange={onChange} />
          <FormField label="Standard processing time (days)" hint="Business days to make an order before dispatch." required>
            <input type="number" min={0} max={60} value={value.processingDays} onChange={(e) => onChange({ processingDays: Number(e.target.value) })} className={input} required />
          </FormField>
          <Text label="Owner / contact person" field="ownerName" value={value} onChange={onChange} />
        </div>
        <FormField label="Store description" hint="Shown on brand summaries.">
          <textarea rows={2} value={value.description} onChange={(e) => onChange({ description: e.target.value })} className={input} />
        </FormField>
      </div>

      <div className="p-6 rounded-2xl border border-line bg-paper shadow-xs space-y-5">
        <h2 className="text-sm font-bold text-ink uppercase tracking-wider border-b border-line pb-2">Business address</h2>
        {value.address && !value.addressLine1 && (
          <p className="rounded-xl bg-tint/60 p-3 text-2xs text-ink/70">Older saved address: <strong>{value.address}</strong>. Fill in the fields below to replace it.</p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Text label="Address line 1" hint="Door number, street" field="addressLine1" value={value} onChange={onChange} />
          <Text label="Address line 2" hint="Area, landmark (optional)" field="addressLine2" value={value} onChange={onChange} />
          <Text label="City / town" field="city" value={value} onChange={onChange} />
          <Text label="District" field="district" value={value} onChange={onChange} />
          <FormField label="State / union territory">
            <select value={value.state} onChange={(e) => onChange({ state: e.target.value })} className={input}>
              <option value="">Not entered</option>
              {INDIAN_STATES_AND_UTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </FormField>
          <Text label="PIN code" hint="6 digits" field="pincode" value={value} onChange={onChange} mono />
          <Text label="Country" field="country" value={value} onChange={onChange} />
        </div>
      </div>

      <div className="p-6 rounded-2xl border border-line bg-paper shadow-xs space-y-5">
        <h2 className="text-sm font-bold text-ink uppercase tracking-wider border-b border-line pb-2">Customer support</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Text label="Support email" hint="Shown on the Contact page and in policies." field="supportEmail" value={value} onChange={onChange} type="email" />
          <Text label="Support WhatsApp number" hint="With country code, e.g. +91… Used by the chat button and Contact page." field="supportWhatsapp" value={value} onChange={onChange} mono />
          <Text label="Support phone (calls)" field="supportPhone" value={value} onChange={onChange} mono />
        </div>
      </div>

      <div className="p-6 rounded-2xl border border-line bg-paper shadow-xs space-y-5">
        <h2 className="text-sm font-bold text-ink uppercase tracking-wider border-b border-line pb-2">Grievance contact</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Text label="Name" field="grievanceName" value={value} onChange={onChange} />
          <Text label="Designation" hint="Enter only what is confirmed." field="grievanceDesignation" value={value} onChange={onChange} />
          <Text label="Email" field="grievanceEmail" value={value} onChange={onChange} type="email" />
          <Text label="Phone" field="grievancePhone" value={value} onChange={onChange} mono />
        </div>
      </div>

      <div className="p-6 rounded-2xl border border-line bg-paper shadow-xs space-y-5">
        <h2 className="text-sm font-bold text-ink uppercase tracking-wider border-b border-line pb-2">Tax status on invoices</h2>
        <FormField label="GST registration" hint="This only records what you tell us; it does not decide any tax. Confirm the right treatment with your tax professional.">
          <select value={value.gstRegistration} onChange={(e) => onChange({ gstRegistration: e.target.value as GstRegistration })} className={input}>
            {GST_REGISTRATION.map((g) => (
              <option key={g} value={g}>
                {GST_LABEL[g]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Invoice note" hint="Optional wording printed on invoices (for example the tax status line your accountant approves).">
          <textarea rows={2} value={value.invoiceNote} onChange={(e) => onChange({ invoiceNote: e.target.value })} className={input} />
        </FormField>
      </div>
    </div>
  );
}
