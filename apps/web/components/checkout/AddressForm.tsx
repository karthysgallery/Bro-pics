'use client';

import { useState } from 'react';
import { getFirestore, doc, collection, setDoc } from 'firebase/firestore';
import { AddressSchema, type Address, type AddressType } from '@bro-pics/shared';
import { getFirebaseApp } from '../../lib/firebase-client';

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

export function AddressForm({ userId, onSaved, onCancel, existingAddress, isFirstAddress = false }: AddressFormProps) {
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
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    const db = getFirestore(getFirebaseApp());
    collection(db, 'users', userId, 'addresses');
    const addressId =
      existingAddress?.id ??
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `addr_${Date.now()}_${Math.random().toString(36).slice(2)}`);

    const candidate = {
      id: addressId,
      label: label || null,
      line1,
      line2: line2 || null,
      city,
      state,
      pincode,
      phone,
      isDefault: existingAddress?.isDefault ?? isFirstAddress,
      type: type || null,
      country: country || null,
      deliveryInstructions: deliveryInstructions || null,
    };

    const parsed = AddressSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(
        parsed.error.issues.some((issue) => issue.path[0] === 'pincode')
          ? 'Enter a valid 6-digit pincode.'
          : 'Please fill in address line 1, city, state, pincode, and phone.'
      );
      return;
    }

    await setDoc(doc(db, 'users', userId, 'addresses', addressId), parsed.data);
    onSaved(parsed.data);
  };

  return (
    <div className="flex flex-col gap-3">
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
      <input id="address-label" value={label} onChange={(e) => setLabel(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm text-ink" />

      <label htmlFor="address-line1" className="text-sm font-medium text-ink">Address line 1</label>
      <input id="address-line1" value={line1} onChange={(e) => setLine1(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm text-ink" />

      <label htmlFor="address-line2" className="text-sm font-medium text-ink">Address line 2 (optional)</label>
      <input id="address-line2" value={line2} onChange={(e) => setLine2(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm text-ink" />

      <label htmlFor="address-city" className="text-sm font-medium text-ink">City</label>
      <input id="address-city" value={city} onChange={(e) => setCity(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm text-ink" />

      <label htmlFor="address-state" className="text-sm font-medium text-ink">State</label>
      <input id="address-state" value={state} onChange={(e) => setState(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm text-ink" />

      <label htmlFor="address-country" className="text-sm font-medium text-ink">Country</label>
      <input id="address-country" value={country} onChange={(e) => setCountry(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm text-ink" />

      <label htmlFor="address-pincode" className="text-sm font-medium text-ink">Pincode</label>
      <input id="address-pincode" value={pincode} onChange={(e) => setPincode(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm text-ink" />

      <label htmlFor="address-phone" className="text-sm font-medium text-ink">Phone</label>
      <input id="address-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm text-ink" />

      <label htmlFor="address-delivery-instructions" className="text-sm font-medium text-ink">Delivery instructions (optional)</label>
      <textarea
        id="address-delivery-instructions"
        value={deliveryInstructions}
        onChange={(e) => setDeliveryInstructions(e.target.value)}
        rows={2}
        placeholder="E.g. leave with the doorman, gate code, landmark…"
        className="rounded-md border border-line px-3 py-2 text-sm text-ink"
      />

      {error && <p className="text-sm text-alert">{error}</p>}

      <div className="flex flex-wrap items-center gap-2 mt-2">
        <button onClick={handleSave} className="rounded-full bg-gold text-ink px-5 py-2.5 text-sm font-semibold hover:bg-gold-deep transition-colors">
          Save address
        </button>
        {onCancel && (
          <button onClick={onCancel} className="rounded-md border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:border-accent hover:text-accent transition-colors">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
