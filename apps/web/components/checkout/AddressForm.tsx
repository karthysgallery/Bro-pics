'use client';

import { useContext, useState } from 'react';
import { getFirestore, doc, collection, setDoc } from 'firebase/firestore';
import { AddressSchema, type Address, type AddressType } from '@bro-pics/shared';
import { getFirebaseApp } from '../../lib/firebase-client';
import { INDIAN_STATES_AND_UTS } from '../../lib/indian-states';
import { AuthContext } from '../../lib/auth-context';

interface AddressFormProps {
  userId: string;
  onSaved: (address: Address) => void;
  onCancel?: () => void;
  existingAddress?: Address;
  // [FE-35] Set by the caller when this form is creating the user's very
  // first address — that address should become the default immediately,
  // rather than requiring a separate "Set as default" click on the only
  // address that exists. Ignored when editing an existing address (its
  // own isDefault, below, is preserved as-is).
  isFirstAddress?: boolean;
}

const TYPE_OPTIONS: Array<{ value: AddressType; label: string }> = [
  { value: 'home', label: 'Home' },
  { value: 'work', label: 'Work' },
  { value: 'other', label: 'Other' },
];

type FieldName = 'recipientName' | 'line1' | 'city' | 'state' | 'pincode' | 'phone';

// Indian mobile numbers: 10 digits starting 6-9, optionally written with +91 / 91 / 0.
// Stored normalised as +91XXXXXXXXXX so every address looks the same to couriers.
function normalizeMobile(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, '');
  const match = /^(?:\+?91|0)?([6-9]\d{9})$/.exec(digits);
  return match ? `+91${match[1]}` : null;
}

const inputClass = (invalid: boolean) =>
  `rounded-md border px-3 py-2 text-base sm:text-sm text-ink ${invalid ? 'border-alert' : 'border-line'}`;

export function AddressForm({ userId, onSaved, onCancel, existingAddress, isFirstAddress = false }: AddressFormProps) {
  // Defaults to the account's own name; changed when the order is a gift.
  const accountName = useContext(AuthContext)?.user?.displayName ?? '';
  const [recipientName, setRecipientName] = useState(existingAddress?.recipientName ?? (existingAddress ? '' : accountName));
  const [line1, setLine1] = useState(existingAddress?.line1 ?? '');
  const [line2, setLine2] = useState(existingAddress?.line2 ?? '');
  const [city, setCity] = useState(existingAddress?.city ?? '');
  const [state, setState] = useState(existingAddress?.state ?? '');
  const [pincode, setPincode] = useState(existingAddress?.pincode ?? '');
  const [phone, setPhone] = useState(existingAddress?.phone ?? '');
  const [label, setLabel] = useState(existingAddress?.label ?? '');
  const [type, setType] = useState<AddressType | ''>(existingAddress?.type ?? '');
  const [country, setCountry] = useState(existingAddress?.country ?? 'India');
  const [deliveryInstructions, setDeliveryInstructions] = useState(existingAddress?.deliveryInstructions ?? '');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // An address saved before the state list existed may hold a value that isn't in
  // it ("TN", "tamil nadu") — keep it selectable rather than silently blanking it.
  const stateOptions: string[] = [...INDIAN_STATES_AND_UTS];
  if (state && !stateOptions.includes(state)) stateOptions.unshift(state);

  const handleSave = async () => {
    if (saving) return;
    setError(null);

    const errors: Partial<Record<FieldName, string>> = {};
    if (recipientName.trim().length < 2) errors.recipientName = 'Enter the name of the person receiving the parcel.';
    if (!line1.trim()) errors.line1 = 'Enter your house/flat number and street.';
    if (!city.trim()) errors.city = 'Enter your city or town.';
    if (!state.trim()) errors.state = 'Choose your state.';
    if (!/^\d{6}$/.test(pincode.trim())) errors.pincode = 'Enter a valid 6-digit pincode.';
    const normalizedPhone = normalizeMobile(phone);
    if (!normalizedPhone) errors.phone = 'Enter a valid 10-digit mobile number.';

    const addressId =
      existingAddress?.id ??
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `addr_${Date.now()}_${Math.random().toString(36).slice(2)}`);

    const candidate = {
      id: addressId,
      recipientName: recipientName.trim() || null,
      label: label.trim() || null,
      line1: line1.trim(),
      line2: line2.trim() || null,
      city: city.trim(),
      state: state.trim(),
      pincode: pincode.trim(),
      phone: normalizedPhone ?? phone.trim(),
      isDefault: existingAddress?.isDefault ?? isFirstAddress,
      type: type || null,
      country: country.trim() || null,
      deliveryInstructions: deliveryInstructions.trim() || null,
    };

    // The shared schema is the final word (it also rejects pincodes the
    // delivery check can't serve, e.g. 9xxxxx army-postal codes).
    const parsed = AddressSchema.safeParse(candidate);
    if (!parsed.success && !errors.pincode && parsed.error.issues.some((issue) => issue.path[0] === 'pincode')) {
      errors.pincode = 'Enter a valid 6-digit pincode.';
    }
    if (Object.keys(errors).length > 0 || !parsed.success) {
      setFieldErrors(errors);
      if (Object.keys(errors).length === 0) setError('Please check the address and try again.');
      return;
    }
    setFieldErrors({});

    setSaving(true);
    try {
      const db = getFirestore(getFirebaseApp());
      await setDoc(doc(db, 'users', userId, 'addresses', addressId), parsed.data);
      onSaved(parsed.data);
    } catch {
      setError("We couldn't save this address. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const errorProps = (field: FieldName) => ({
    'aria-invalid': fieldErrors[field] ? true : undefined,
    'aria-describedby': fieldErrors[field] ? `address-${field}-error` : undefined,
  });
  const fieldError = (field: FieldName) =>
    fieldErrors[field] ? (
      <p id={`address-${field}-error`} role="alert" className="text-xs text-alert -mt-2">
        {fieldErrors[field]}
      </p>
    ) : null;

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="address-recipientName" className="text-sm font-medium text-ink">Full name</label>
      <input
        id="address-recipientName"
        value={recipientName}
        onChange={(e) => setRecipientName(e.target.value)}
        autoComplete="name"
        maxLength={80}
        className={inputClass(Boolean(fieldErrors.recipientName))}
        {...errorProps('recipientName')}
      />
      <p className="text-xs text-ink/60 -mt-2">Who will receive the parcel. Sending a gift? Use their name.</p>
      {fieldError('recipientName')}

      <span className="text-sm font-medium text-ink">Address type (optional)</span>
      <div className="flex gap-2" role="group" aria-label="Address type">
        {TYPE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={type === option.value}
            onClick={() => setType(type === option.value ? '' : option.value)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              type === option.value ? 'border-accent bg-accent/10 text-accent' : 'border-line text-ink'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <label htmlFor="address-label" className="text-sm font-medium text-ink">Label (optional)</label>
      <input id="address-label" value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass(false)} />

      <label htmlFor="address-line1" className="text-sm font-medium text-ink">Address line 1</label>
      <input
        id="address-line1"
        value={line1}
        onChange={(e) => setLine1(e.target.value)}
        autoComplete="address-line1"
        className={inputClass(Boolean(fieldErrors.line1))}
        {...errorProps('line1')}
      />
      {fieldError('line1')}

      <label htmlFor="address-line2" className="text-sm font-medium text-ink">Address line 2 (optional)</label>
      <input id="address-line2" value={line2} onChange={(e) => setLine2(e.target.value)} autoComplete="address-line2" className={inputClass(false)} />

      <label htmlFor="address-city" className="text-sm font-medium text-ink">City</label>
      <input
        id="address-city"
        value={city}
        onChange={(e) => setCity(e.target.value)}
        autoComplete="address-level2"
        className={inputClass(Boolean(fieldErrors.city))}
        {...errorProps('city')}
      />
      {fieldError('city')}

      <label htmlFor="address-state" className="text-sm font-medium text-ink">State</label>
      <select
        id="address-state"
        value={state}
        onChange={(e) => setState(e.target.value)}
        autoComplete="address-level1"
        className={`${inputClass(Boolean(fieldErrors.state))} bg-paper`}
        {...errorProps('state')}
      >
        <option value="">Select your state</option>
        {stateOptions.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      {fieldError('state')}

      <label htmlFor="address-country" className="text-sm font-medium text-ink">Country</label>
      <input id="address-country" value={country} onChange={(e) => setCountry(e.target.value)} autoComplete="country-name" className={inputClass(false)} />

      <label htmlFor="address-pincode" className="text-sm font-medium text-ink">Pincode</label>
      <input
        id="address-pincode"
        value={pincode}
        onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="postal-code"
        maxLength={6}
        className={inputClass(Boolean(fieldErrors.pincode))}
        {...errorProps('pincode')}
      />
      {fieldError('pincode')}

      <label htmlFor="address-phone" className="text-sm font-medium text-ink">Phone</label>
      <input
        id="address-phone"
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        inputMode="tel"
        autoComplete="tel"
        className={inputClass(Boolean(fieldErrors.phone))}
        {...errorProps('phone')}
      />
      {fieldError('phone')}

      <label htmlFor="address-delivery-instructions" className="text-sm font-medium text-ink">Delivery instructions (optional)</label>
      <textarea
        id="address-delivery-instructions"
        value={deliveryInstructions}
        onChange={(e) => setDeliveryInstructions(e.target.value)}
        rows={2}
        placeholder="E.g. leave with the doorman, gate code, landmark…"
        className={inputClass(false)}
      />

      {error && (
        <p role="alert" className="text-sm text-alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-full bg-gold text-ink px-5 py-2.5 text-sm font-semibold hover:bg-gold-deep transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save address'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-md border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
